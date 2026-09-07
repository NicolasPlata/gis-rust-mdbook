# 4.6 I/O adicional — `gdal`, `ndarray`, `shapefile`, `las`

GeoAPI, hasta ahora, solo entiende geometrías vectoriales en GeoJSON/WKT. El mundo real de los datos GIS es más amplio: rásters (imágenes satelitales, modelos de elevación), formatos vectoriales heredados que siguen circulando en organismos públicos, y nubes de puntos LiDAR. Este capítulo te da una probada de cada uno — no exhaustiva, pero suficiente para que sepas qué crate buscar cuando un cliente de tu API te mande uno de estos formatos.

## `gdal` + `ndarray`: la navaja suiza de rásters

[`gdal`](https://crates.io/crates/gdal) (versión 0.19 en este capítulo) es un *binding* FFI a la librería C **GDAL**, el estándar de facto para leer y escribir prácticamente cualquier formato ráster o vectorial que exista (GeoTIFF, NetCDF, Shapefile, y docenas más, cada uno vía un *driver*). Como con `proj` en el Capítulo 4.4, necesitas `libgdal` instalada en tu sistema (`libgdal-dev` en Ubuntu/Debian; verifica la versión con `gdalinfo --version`).

Para álgebra de mapas —operaciones que combinan celdas de un ráster con sus vecinas, como calcular pendiente a partir de un modelo de elevación digital (DEM)— quieres los valores del ráster en una estructura que sepa de índices multidimensionales: [`ndarray`](https://crates.io/crates/ndarray) (versión 0.17). El feature `array` de `gdal` (que activa su dependencia opcional del propio `ndarray`) te da la conversión directa:

```toml
[dependencies]
gdal = { version = "0.19", features = ["array"] }
ndarray = "0.17"
```

```rust,ignore
use gdal::raster::Buffer;
use gdal::DriverManager;
use ndarray::Array2;

// Calcula la pendiente en grados usando diferencias centrales sobre una
// ventana focal 3x3 — el mismo principio detrás de `gdaldem slope`, que
// harías bien en usar directamente en producción; aquí lo implementas a
// mano para entender qué calcula esa herramienta por debajo.
fn calcular_pendiente(dem: &Array2<f32>, tamano_celda: f32) -> Array2<f32> {
    let (filas, columnas) = dem.dim();
    let mut pendiente = Array2::<f32>::zeros((filas, columnas));
    for i in 1..filas - 1 {
        for j in 1..columnas - 1 {
            let dz_dx = (dem[[i, j + 1]] - dem[[i, j - 1]]) / (2.0 * tamano_celda);
            let dz_dy = (dem[[i + 1, j]] - dem[[i - 1, j]]) / (2.0 * tamano_celda);
            let radianes = (dz_dx * dz_dx + dz_dy * dz_dy).sqrt().atan();
            pendiente[[i, j]] = radianes.to_degrees();
        }
    }
    pendiente
}

fn main() -> gdal::errors::Result<()> {
    let (ancho, alto) = (5, 5);
    let tamano_celda = 30.0_f32; // metros por celda, como un DEM SRTM re-muestreado

    // DEM sintético: una rampa que sube 2m por celda en dirección X.
    let elevaciones: Vec<f32> = (0..alto)
        .flat_map(|_fila| (0..ancho).map(|col| col as f32 * 2.0))
        .collect();

    // El driver "MEM" mantiene el ráster solo en memoria — perfecto para
    // pruebas, sin tocar el disco.
    let driver = DriverManager::get_driver_by_name("MEM")?;
    let dataset = driver.create_with_band_type::<f32, _>("dem-en-memoria", ancho, alto, 1)?;
    let mut banda = dataset.rasterband(1)?;
    let mut buffer = Buffer::new((ancho, alto), elevaciones);
    banda.write((0, 0), (ancho, alto), &mut buffer)?;

    let leido: Array2<f32> = banda.read_band_as::<f32>()?.to_array()?;
    let pendiente = calcular_pendiente(&leido, tamano_celda);
    println!("{pendiente}");

    Ok(())
}
```

```text
[[0, 0, 0, 0, 0],
 [0, 3.814075, 3.814075, 3.814075, 0],
 [0, 3.814075, 3.814075, 3.814075, 0],
 [0, 3.814075, 3.814075, 3.814075, 0],
 [0, 0, 0, 0, 0]]
```

Las celdas del borde quedan en `0` porque una ventana focal 3×3 necesita un vecino a cada lado — un detalle de "caso límite" idéntico en espíritu a los que ya vienes manejando desde el Capítulo 3.3 (geometrías vacías) y el 4.1 (bordes de polígono). En producción, esas celdas de borde normalmente se rellenan replicando el valor más cercano o se excluyen del resultado — una decisión de diseño que documentas, no un accidente que ignoras.

## `shapefile`: compatibilidad con datos heredados

El *Shapefile* de Esri, a pesar de tener más de 30 años y limitaciones bien conocidas (nombres de campo truncados a 10 caracteres, sin soporte nativo para UTF-8 salvo extensiones), sigue circulando en catastros, organismos públicos y datasets históricos. [`shapefile`](https://crates.io/crates/shapefile) (versión 0.9, con el feature `geo-types` activado) lo lee y escribe en Rust puro, sin pasar por GDAL:

```rust,ignore
use shapefile::{dbase, Point, Polygon, PolygonRing, Writer};
use std::convert::TryInto;

fn main() -> Result<(), shapefile::Error> {
    // Simula un shapefile heredado: una zona de cobertura con un solo campo de texto.
    let anillo = PolygonRing::Outer(vec![
        Point::new(-74.10, 4.60),
        Point::new(-74.05, 4.60),
        Point::new(-74.05, 4.65),
        Point::new(-74.10, 4.65),
        Point::new(-74.10, 4.60),
    ]);
    let zona = Polygon::new(anillo);

    let table_builder =
        dbase::TableWriterBuilder::new().add_character_field("nombre".try_into().unwrap(), 50);
    let mut writer = Writer::from_path("zonas_cobertura.shp", table_builder)?;

    let mut registro = dbase::Record::default();
    registro.insert("nombre".to_string(), "Zona Norte".to_string().into());
    writer.write_shape_and_record(&zona, &registro)?;
    drop(writer); // cierra y finaliza los tres archivos (.shp, .shx, .dbf)

    // Ahora impórtalo, como harías con un shapefile que alguien más te entregó.
    let mut reader = shapefile::Reader::from_path("zonas_cobertura.shp")?;
    for resultado in reader.iter_shapes_and_records() {
        let (forma, registro) = resultado?;
        let geometria: geo_types::Geometry<f64> = forma
            .try_into()
            .expect("la forma del shapefile debe convertir a una geometría de geo-types");
        println!("registro: {registro:?}");
        println!("geometría (geo-types): {geometria:?}");
    }
    Ok(())
}
```

```text
registro: Record { map: {"nombre": Character(Some("Zona Norte"))} }
geometría (geo-types): MULTIPOLYGON(((-74.1 4.6,-74.1 4.65,-74.05 4.65,-74.05 4.6,-74.1 4.6)))
```

Dos cosas para notar: un `Polygon` de shapefile siempre convierte a un `geo_types::MultiPolygon` (nunca a un `Polygon` suelto), porque el formato Shapefile no distingue entre "un polígono" y "un multipolígono" a nivel de tipo — la distinción es solo cuántos anillos exteriores agrupa el registro. Y los atributos viven en un `dbase::Record` totalmente separado de la geometría — muy distinto al `Feature` de GeoJSON del Capítulo 3.4, donde geometría y propiedades viven en el mismo objeto JSON. Importar un shapefile a GeoAPI significa, en la práctica, volver a unir esas dos piezas tú mismo en tu propio tipo `Feature`.

## `las`: una primera lectura de nubes de puntos LiDAR

[`las`](https://crates.io/crates/las) (versión 0.11) lee y escribe el formato **LAS** (y su variante comprimida LAZ, con el feature correspondiente), el estándar de facto para nubes de puntos LiDAR — cada punto con coordenadas `x, y, z` más metadatos como intensidad de retorno o clasificación (suelo, vegetación, edificio...).

```rust,ignore
use las::{Point, Reader, Writer};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Escribe una nube mínima de 5 puntos.
    let mut writer = Writer::from_path("nube_prueba.las", Default::default())?;
    for i in 0..5 {
        let punto = Point {
            x: 100.0 + i as f64,
            y: 200.0 + i as f64,
            z: 10.0 + (i as f64) * 0.5,
            ..Default::default()
        };
        writer.write_point(punto)?;
    }
    writer.close()?;

    // Léela de vuelta.
    let mut reader = Reader::from_path("nube_prueba.las")?;
    println!("versión LAS: {}", reader.header().version());
    println!("número de puntos: {}", reader.header().number_of_points());

    let datos = reader.read_all()?;
    for resultado in datos.points() {
        let punto = resultado?;
        println!("punto: ({:.2}, {:.2}, {:.2})", punto.x, punto.y, punto.z);
    }
    Ok(())
}
```

```text
versión LAS: 1.2
número de puntos: 5
punto: (100.00, 200.00, 10.00)
punto: (101.00, 201.00, 10.50)
punto: (102.00, 202.00, 11.00)
punto: (103.00, 203.00, 11.50)
punto: (104.00, 204.00, 12.00)
```

## AoS vs. SoA: una decisión de memoria que `las` te deja elegir

Aquí llegamos a una decisión de diseño de bajo nivel con implicaciones reales de rendimiento, y que el propio crate `las` expone como una elección explícita. Hay dos formas de organizar en memoria una colección de registros con varios campos cada uno:

- **AoS (*Array of Structs*):** un `Vec<Point>`, donde cada `Point` completo (x, y, z, intensidad, clasificación, ...) queda contiguo en memoria. Natural de escribir, natural de leer un punto completo a la vez.
- **SoA (*Struct of Arrays*):** un array separado por campo — todas las `x` juntas, todas las `y` juntas, etc. Menos natural de escribir, pero mucho más eficiente en caché cuando solo te interesa *un* campo de *todos* los puntos (por ejemplo, calcular el rango de elevaciones de un millón de puntos — no necesitas tocar la intensidad o la clasificación de ninguno de ellos).

`las::reader::Reader::read_all()` te devuelve un `PointData`: un único bloque contiguo de bytes en el formato *on-disk* del LAS (esencialmente SoA-friendly, ya que cada campo puede leerse en una sola pasada sin reconstruir el resto), sobre el cual puedes elegir tu vista:

```rust,ignore
use las::Reader;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = Reader::from_path("nube_prueba.las")?;
    let datos = reader.read_all()?;

    // Vista AoS: reconstruye cada Point completo, uno a la vez.
    for punto in datos.points().take(3) {
        let punto = punto?;
        println!("AoS: ({:.2}, {:.2}, {:.2})", punto.x, punto.y, punto.z);
    }

    // Vista SoA: una sola pasada sobre la columna x, sin construir ni un solo Point.
    let min_x = datos.x().fold(f64::INFINITY, f64::min);
    let max_x = datos.x().fold(f64::NEG_INFINITY, f64::max);
    println!("SoA: min_x={min_x}, max_x={max_x}");

    Ok(())
}
```

```text
AoS: (100.00, 200.00, 10.00)
AoS: (101.00, 201.00, 10.50)
AoS: (102.00, 202.00, 11.00)
SoA: min_x=100, max_x=104
```

La regla práctica: si tu endpoint necesita devolver puntos completos al cliente (por ejemplo, `GET /nube/puntos` en formato GeoJSON), usa la vista AoS (`.points()`). Si tu endpoint calcula una estadística sobre un solo campo a través de millones de puntos (el rango de elevación de una nube completa, para un endpoint de metadatos), la vista columnar es estrictamente más rápida porque nunca paga el costo de reconstruir campos que no vas a usar — vas a medir esa diferencia tú mismo en el Ejercicio 4.

## Ejercicios

**Ejercicio 1 — Leer un DEM y calcular pendiente con `ndarray`.**
Extiende `calcular_pendiente` del capítulo para que además calcule la **aspecto** (la dirección de la pendiente máxima, en grados desde el norte, usando `atan2(dz_dy, -dz_dx)` convertido apropiadamente) para cada celda interior. Prueba con un DEM sintético de al menos 7x7 donde la elevación aumente en una dirección conocida de antemano (por ejemplo, diagonal), y confirma que el aspecto calculado coincide con esa dirección esperada.

*Criterio de éxito:* un test con un DEM de rampa en una dirección conocida donde `assert!` confirme que el aspecto calculado está dentro de un margen razonable (por ejemplo, ±1°) del valor esperado matemáticamente para esa rampa.

**Ejercicio 2 — Importar un Shapefile legado.**
Escribe un shapefile de prueba con al menos tres polígonos y dos campos de atributos (`nombre` y un campo numérico, por ejemplo `poblacion` con `add_numeric_field`), impórtalo, y convierte cada registro a tu propio `struct FeatureImportada { geometria: geo_types::MultiPolygon<f64>, nombre: String, poblacion: f64 }` uniendo la geometría convertida con los valores extraídos del `dbase::Record`.

*Criterio de éxito:* un test que confirma que las tres `FeatureImportada` resultantes tienen la geometría, nombre y población correctos, comparando contra los valores que tú mismo escribiste al crear el shapefile de prueba.

**Ejercicio 3 — Leer una nube LAS mínima.**
Escribe una nube de al menos 100 puntos distribuidos en una cuadrícula 10x10 (con `z` variando de forma determinista, por ejemplo `z = (x * 0.1).sin() * 5.0`), y calcula la elevación promedio y el rango (`max - min`) usando la vista AoS (`.points()`).

*Criterio de éxito:* un test con `assert!` que confirme que el rango calculado es mayor que cero y que la elevación promedio está dentro del rango `[min, max]` de las elevaciones que tú mismo generaste.

**Ejercicio 4 — Comparar memoria AoS vs. SoA.**
Sobre una nube de al menos 100.000 puntos (generada deterministamente, sin escribirla a disco si no quieres — puedes construir un `PointData` en memoria con `PointDataBuilder`, o simplemente escribirla a un archivo temporal y leerla de vuelta), mide con `std::time::Instant` cuánto tarda calcular el rango de la columna `x` usando la vista columnar (`.x().fold(...)`) contra reconstruir cada `Point` completo con `.points()` y extraer `.x` de cada uno manualmente.

*Criterio de éxito:* tu programa imprime ambos tiempos y confirma con un `assert_eq!` que ambos métodos llegan al mismo resultado de rango — la diferencia de tiempo (que puede ser pequeña en una nube de solo 100k puntos con pocos campos) es secundaria al hecho de que mediste en vez de asumir cuál es más rápido, la misma disciplina del Ejercicio 5 del Capítulo 4.3.

> El proyecto GeoAPI v0.3 (Capítulo 4.7) no tiene un checkpoint que use esta técnica — su ejercicio integrador incluye, como extensión opcional, una historia de usuario que sí la usa (un operador de telecomunicaciones rural planeando una ruta de fibra óptica sobre un DEM).
