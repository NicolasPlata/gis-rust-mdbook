# 4.4 Reproyección con `proj`

Desde el Capítulo 3.2 sabes que WGS84 (grados) y un CRS proyectado (metros, como UTM) sirven propósitos distintos, y que mezclarlos sin cuidado produce resultados sin sentido físico. Lo que te faltaba era la herramienta para *convertir* de uno a otro de forma correcta — no una fórmula aproximada escrita a mano, sino el motor de reproyección que usa toda la industria GIS por debajo (QGIS, PostGIS, GDAL): la librería C **PROJ**. Este capítulo te da su binding de Rust, el crate [`proj`](https://crates.io/crates/proj) (versión 0.31 en este capítulo), para que cualquier endpoint de GeoAPI que reciba un parámetro `crs=` pase por aquí.

## Un binding FFI, no una reimplementación

A diferencia de `geo` o `robust`, que son Rust puro, `proj` es un *wrapper* seguro sobre bindings crudos (`proj-sys`) a la librería C `libproj`. Esto es una idea que vas a ver formalizada como patrón general en el Capítulo 5.6 (FFI seguro) — por ahora, lo único que necesitas saber es que **tu sistema necesita `libproj` instalada** para compilar este capítulo (en Ubuntu/Debian, `libproj-dev`; el crate también ofrece un feature `bundled_proj` que compila su propia copia de PROJ si prefieres no depender del sistema). Verifica la versión con `pkg-config --modversion proj`.

## `convert`: transformar entre dos CRS conocidos

La forma más común de usar `proj` en GeoAPI es construir un objeto `Proj` a partir de dos códigos EPSG con `Proj::new_known_crs`, y luego llamar a `.convert(punto)`:

```rust,ignore
use proj::Proj;

fn main() {
    // Bogotá cae en la zona UTM 18N (EPSG:32618) — la zona correcta depende
    // de la longitud del punto, algo que vas a resolver en el Ejercicio 1.
    let wgs84_a_utm18n = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None)
        .expect("la transformación EPSG:4326 -> EPSG:32618 existe en PROJ");

    let bogota_wgs84 = (-74.0721_f64, 4.7110_f64); // (lon, lat)
    let bogota_utm = wgs84_a_utm18n
        .convert(bogota_wgs84)
        .expect("Bogotá está dentro del área de uso de UTM 18N");

    println!("WGS84 (lon, lat): {bogota_wgs84:?}");
    println!("UTM 18N (E, N):   ({:.2}, {:.2})", bogota_utm.0, bogota_utm.1);
}
```

```text
WGS84 (lon, lat): (-74.0721, 4.711)
UTM 18N (E, N):   (602910.01, 520787.26)
```

Una nota importante sobre el orden de coordenadas, porque es una fuente clásica de bugs silenciosos: cuando construyes el `Proj` con `new_known_crs` (a partir de códigos EPSG), `proj` **normaliza** el orden de entrada y salida a longitud/latitud o este/norte — el orden "GIS tradicional" que ya vienes usando en todo el libro (`Point::new(lon, lat)`). Esto es una decisión deliberada del crate: la norma EPSG técnicamente define el eje de EPSG:4326 como latitud-primero, y si alguna vez usas la librería C directamente o construyes un `Proj` a partir de un *pipeline* de texto en vez de códigos EPSG (con `Proj::new`), esa normalización no aplica y el orden depende de la definición exacta que uses. Verifica siempre con un caso de prueba conocido antes de confiar en el orden — exactamente lo que acabas de hacer arriba comparando contra el resultado de la herramienta de línea de comandos `cs2cs` del propio PROJ.

## `project`: *projection* vs. *conversion*

`proj` distingue dos operaciones que el estándar OGC/EPSG trata como conceptualmente distintas, aunque en la práctica ambas transforman coordenadas:

- **Conversion** (`convert`, usado arriba): una transformación exacta y reversible entre dos CRS, sin parámetros empíricos — cambiar de WGS84 a UTM es una operación puramente matemática.
- **Projection** (`project`): aplica una única definición de proyección (una cadena `+proj=...`) directamente sobre coordenadas geodésicas (en radianes), sin pasar por dos CRS con nombre. Es la operación de más bajo nivel, útil cuando defines tu propia proyección con parámetros específicos en vez de usar un CRS con código EPSG estándar.

Para el 95% de los casos de una API GIS —el cliente te manda un `crs=EPSG:3857` y tú necesitas reproyectar hacia o desde ahí— `convert` con `new_known_crs` es lo que vas a usar. `project` existe para el caso menos común de trabajar con una definición de proyección cruda.

## Integración directa con `geo-types`: el trait `Transform`

Reproyectar tupla por tupla funciona, pero GeoAPI ya tiene sus geometrías como `geo_types::Point`, `Polygon`, etc. El propio crate `proj` expone el trait `Transform`, implementado directamente sobre los tipos de `geo-types` (vía su feature `geo-types`, activado por defecto), con un atajo que ni siquiera requiere construir el `Proj` a mano:

```rust,ignore
use geo_types::Point;
use proj::Transform;

fn main() {
    let mut bogota: Point<f64> = Point::new(-74.0721, 4.7110);
    bogota.transform_crs_to_crs("EPSG:4326", "EPSG:32618").unwrap();
    println!("Bogotá en UTM 18N: {bogota:?}");
}
```

```text
Bogotá en UTM 18N: POINT(602910.0065240419 520787.2587685931)
```

`transform_crs_to_crs` muta la geometría en el lugar (existe también `transformed_crs_to_crs`, que devuelve una copia nueva sin tocar la original — el mismo patrón `transform`/`transformed` que ya reconoces de `simplify`/`simplify_vw` en el Capítulo 3.3). Esto es exactamente lo que un endpoint `GET /features/reproject?crs=EPSG:3857` de tu servidor (Capítulo 4.7) va a hacer con cada `Geometry<f64>` que devuelva.

## Ida y vuelta: ¿cuánta precisión se pierde?

Una pregunta razonable: si reproyectas de WGS84 a UTM y de vuelta a WGS84, ¿recuperas exactamente el punto original? La respuesta, verificada, es "depende del par de CRS, y casi siempre la pérdida es demasiado pequeña para importar en la práctica — pero no siempre es cero":

```rust,ignore
use proj::Proj;

fn probar(nombre: &str, from: &str, to: &str, punto: (f64, f64)) {
    let ida = Proj::new_known_crs(from, to, None).unwrap();
    let vuelta = Proj::new_known_crs(to, from, None).unwrap();
    let proyectado = ida.convert(punto).unwrap();
    let de_vuelta = vuelta.convert(proyectado).unwrap();
    println!(
        "{nombre}: diff lon={:e} diff lat={:e}",
        (de_vuelta.0 - punto.0).abs(),
        (de_vuelta.1 - punto.1).abs()
    );
}

fn main() {
    let bogota = (-74.0721_f64, 4.7110_f64);
    let oslo = (10.7522_f64, 59.9139_f64);

    probar("UTM 18N, Bogotá", "EPSG:4326", "EPSG:32618", bogota);
    probar("Web Mercator, Bogotá", "EPSG:4326", "EPSG:3857", bogota);
    probar("Web Mercator, Oslo (latitud alta)", "EPSG:4326", "EPSG:3857", oslo);
}
```

```text
UTM 18N, Bogotá: diff lon=0e0 diff lat=0e0
Web Mercator, Bogotá: diff lon=1.4210854715202004e-14 diff lat=0e0
Web Mercator, Oslo (latitud alta): diff lon=1.7763568394002505e-15 diff lat=7.105427357601002e-15
```

El resultado tiene dos partes interesantes. Primero, ida y vuelta por UTM 18N sobre Bogotá da una diferencia **exactamente cero** — PROJ usa fórmulas modernas de proyección transversa de Mercator (basadas en el trabajo de Karney, el mismo autor detrás de `GeodesicArea` que viste en el Capítulo 3.3) que son suficientemente exactas como para ser bit-a-bit reversibles en este caso. Segundo, con Web Mercator la diferencia ya no es cero — es del orden de `10⁻¹⁴` grados, es decir, un residuo de redondeo de punto flotante acumulado entre las funciones trigonométricas de la proyección de ida y las de la inversa. Para ponerlo en perspectiva: `10⁻¹⁴` grados de latitud equivalen a una fracción de nanómetro sobre la superficie terrestre — completamente irrelevante para cualquier uso real, pero una demostración concreta de que **"ida y vuelta" no es una garantía matemática universal en punto flotante**, solo una propiedad que algunas transformaciones específicas cumplen mejor que otras.

## El caso `Result::Err`: coordenadas fuera de dominio válido

`convert` devuelve `Result<C, ProjError>`, no un valor inventado, cuando el punto de entrada no tiene sentido geodésico — por ejemplo, una latitud fuera del rango `[-90, 90]`:

```rust,ignore
use proj::Proj;

fn main() {
    let transformador = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();

    let punto_invalido = (0.0_f64, 300.0_f64); // latitud 300° no existe
    match transformador.convert(punto_invalido) {
        Ok(resultado) => println!("inesperado: {resultado:?}"),
        Err(e) => println!("error esperado: {e}"),
    }
}
```

```text
error esperado: The conversion failed with the following error: Invalid coordinate
```

Esto es el mismo principio del Capítulo 2.4 aplicado a un binding FFI: `libproj` internamente señala el error con un código de retorno C (`errno`), y el wrapper seguro de `proj` lo convierte en un `Result::Err` idiomático de Rust — nunca tienes que revisar un código numérico crudo tú mismo. Cualquier endpoint que acepte coordenadas de un cliente HTTP debe propagar este error como un `400 Bad Request`, nunca dejar que un `.unwrap()` tumbe el servidor por un dato malformado.

## `proj` no valida todo lo que crees que valida

Antes de confiar ciegamente en ese `Result::Err`, vale la pena verificar exactamente qué rechaza y qué no — y aquí hay una sorpresa real, no hipotética:

```rust,ignore
use proj::Proj;

fn main() {
    let t = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
    println!("longitud 500°:  {:?}", t.convert((500.0, 0.0)));
    println!("longitud NaN:   {:?}", t.convert((f64::NAN, 0.0)));
    println!("latitud 91°:    {:?}", t.convert((0.0, 91.0)));
}
```

```text
longitud 500°:  Ok((-3664389.626846212, 19995929.886041995))
longitud NaN:   Ok((NaN, NaN))
latitud 91°:    Err(Conversion("Invalid coordinate"))
```

`proj` valida estrictamente la **latitud** (el rango `[-90, 90]` tiene un límite físico real: los polos), pero **no valida la longitud** — un valor como `500°` o incluso `f64::NAN` se acepta sin error y produce una salida numérica sin sentido (o directamente `NaN`) en vez de un `Result::Err`. Esto no es un bug del crate: la longitud es conceptualmente circular (`361°` es lo mismo que `1°`), así que muchas implementaciones, incluida la de `libproj`, simplemente no la rechazan — asumen que quien llama ya normalizó el valor antes de pedir la conversión.

La lección para GeoAPI es directa y es la misma del Capítulo 2.4: **`Result::Err` de una dependencia externa cubre solo lo que esa dependencia decidió validar, nunca asumas que cubre todo lo que a ti te interesa.** Un endpoint que reciba `lon`/`lat` de un cliente HTTP necesita su propia validación de dominio (`-180.0..=180.0` para longitud, `-90.0..=90.0` para latitud, y `is_finite()` para descartar `NaN`/`Infinity`) *antes* de llamar a `.convert()` — exactamente el mismo patrón de `ErrorDominio` que construiste en `geoapi-core` en el Capítulo 3.5, ahora con una razón concreta y verificada para aplicarlo también aquí.

## Ejercicios

**Ejercicio 1 — WGS84 → UTM.**
Escribe una función `fn zona_utm(lon: f64) -> u32` que calcule el número de zona UTM correcto a partir de la longitud (la fórmula es `((lon + 180.0) / 6.0).floor() as u32 + 1`), y úsala para construir dinámicamente el código EPSG correcto (`32600 + zona` para el hemisferio norte, `32700 + zona` para el sur) en vez de asumir "18N" a mano como hizo el capítulo. Prueba tu función con al menos tres ciudades en zonas distintas (por ejemplo, Bogotá, Medellín, y una ciudad de otro continente) y confirma que el código EPSG resultante da una reproyección exitosa.

*Criterio de éxito:* un test que confirme `zona_utm(-74.0721) == 18` (Bogotá) y al menos otro caso con una zona distinta, más una llamada exitosa a `Proj::new_known_crs` usando el código EPSG calculado dinámicamente.

**Ejercicio 2 — Ida y vuelta con pérdida de precisión medida.**
Repite el experimento de ida y vuelta del capítulo con al menos cuatro pares de CRS distintos a tu elección (puedes incluir los del capítulo y agregar los tuyos — por ejemplo, un punto muy al sur como Ushuaia, o EPSG:3116 si quieres un CRS colombiano específico) y sobre al menos dos puntos por par. Documenta en un comentario cuál combinación tuvo la mayor diferencia medida y cuál tuvo cero.

*Criterio de éxito:* tu programa imprime una tabla con par de CRS, punto, y diferencia medida (en notación científica) para cada combinación, y un `assert!` que confirme que **todas** las diferencias medidas son menores a `1e-9` grados (es decir, que incluso el peor caso sigue siendo despreciable para cualquier uso GIS real).

**Ejercicio 3 — Manejo de un punto fuera de dominio válido como `Result::Err`.**
Como acabas de comprobar, `proj` solo rechaza una latitud fuera de `[-90, 90]` — una longitud fuera de `[-180, 180]` o un `NaN` se cuelan sin error. Escribe una función `fn reproyectar_seguro(transformador: &Proj, punto: (f64, f64)) -> Result<(f64, f64), String>` que primero valide tú mismo el punto de entrada (longitud en `[-180, 180]`, latitud en `[-90, 90]`, ambos `is_finite()`) devolviendo un `Err` descriptivo si falla esa validación propia, y solo entonces llame a `.convert()`, propagando también como `Err` legible cualquier fallo que `proj` reporte por su cuenta.

*Criterio de éxito:* cinco tests con `assert!(matches!(...))` o equivalente: un punto válido que da `Ok`, una latitud fuera de rango (rechazada por tu validación *o* por `proj`, cualquiera de las dos), una longitud fuera de rango (`500.0`) que tu validación debe rechazar aunque `proj` la aceptaría, un `NaN` que tu validación debe rechazar aunque `proj` lo aceptaría, y una confirmación de que el mensaje de error en los casos inválidos incluye las coordenadas originales.

> Esta técnica es la que usa el Checkpoint 3 del proyecto GeoAPI v0.3 (Capítulo 4.7) — ver la historia de usuario ahí.
