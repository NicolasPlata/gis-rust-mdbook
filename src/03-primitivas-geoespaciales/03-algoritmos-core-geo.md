# 3.3 `geo` — algoritmos core (área, distancia, simplificación)

`geo-types` te da las formas. El crate [`geo`](https://crates.io/crates/geo) (versión 0.33.1 en este capítulo) te da los algoritmos que operan sobre ellas: área, distancia, simplificación, y muchos más que vas a ir conociendo a lo largo del libro (`Relate` para topología en el Capítulo 4.1, `Transform` para reproyección en el 4.4). Cada algoritmo llega como un **trait** que `geo` implementa para los tipos de `geo-types` — el mismo patrón de "trait como contrato de comportamiento" que viste en el Capítulo 2.3, aplicado ahora a geometría real.

## Área: euclidiana vs. geodésica

Ya viste en el Capítulo 3.2 por qué calcular área directamente sobre coordenadas geográficas con una fórmula plana no tiene sentido físico. `geo` te da ambas opciones, y las nombra de forma que la diferencia sea explícita en el propio código — nunca vas a llamar sin querer a la fórmula equivocada:

```rust,ignore
use geo::{Area, GeodesicArea};
use geo_types::{Coord, LineString, Polygon};

fn main() {
    // Un "cuadrado" de 1° x 1°, con una esquina en el ecuador.
    let cuadrado = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 },
            Coord { x: 1.0, y: 0.0 },
            Coord { x: 1.0, y: 1.0 },
            Coord { x: 0.0, y: 1.0 },
            Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    );

    let area_euclidiana = cuadrado.unsigned_area(); // trait Area: grados², sin sentido físico
    let area_geodesica = cuadrado.geodesic_area_unsigned(); // trait GeodesicArea: metros² reales

    println!("Área euclidiana: {area_euclidiana} (unidad: grados², no física)");
    println!("Área geodésica:  {:.2} km²", area_geodesica / 1_000_000.0);
}
```

```text
Área euclidiana: 1 (unidad: grados², no física)
Área geodésica:  12308.78 km²
```

El trait `Area` (`unsigned_area()`, y `signed_area()` si te importa la orientación del anillo) trata las coordenadas como si vivieran en un plano cartesiano normal — útil cuando ya trabajas en un CRS proyectado (Capítulo 4.4), inútil si tus coordenadas todavía están en grados. El trait `GeodesicArea` usa el algoritmo de Karney sobre un elipsoide (el mismo modelo matemático que usa GPS) para dar un resultado en metros cuadrados que sí corresponde al área real sobre la superficie terrestre — al costo de ser más lento de calcular. La regla: si tus coordenadas son WGS84 (grados), usa `GeodesicArea`; si ya reproyectaste a un CRS en metros, `Area` es correcto y más rápido.

## Distancia: Haversine vs. Vincenty

Para distancias entre dos puntos sobre una superficie curva existen varias fórmulas, con distinto balance entre precisión y costo computacional. Las dos que vas a usar más:

- **Haversine** asume que la Tierra es una esfera perfecta. Es rápida y suficientemente precisa para la mayoría de casos de una API (error típico menor al 0.5%).
- **Vincenty** modela la Tierra como un elipsoide (achatado en los polos, como es en realidad), y por lo tanto es más precisa — a costa de un cálculo iterativo más lento, y que en casos raros (puntos casi antípodas) puede no converger.

```rust,ignore
use geo::{Distance, Haversine, VincentyDistance};
use geo_types::Point;

fn main() {
    let bogota = Point::new(-74.0721, 4.7110);
    let medellin = Point::new(-75.5636, 6.2518);

    let d_haversine: f64 = Haversine.distance(bogota, medellin);
    let d_vincenty: f64 = bogota.vincenty_distance(&medellin).unwrap();

    println!("Haversine: {d_haversine:.2} m");
    println!("Vincenty:  {d_vincenty:.2} m");
    println!(
        "diferencia: {:.2} m ({:.4}%)",
        (d_haversine - d_vincenty).abs(),
        100.0 * (d_haversine - d_vincenty).abs() / d_vincenty
    );
}
```

```text
Haversine: 237921.12 m
Vincenty:  237376.62 m
diferencia: 544.50 m (0.2294%)
```

Sobre la distancia Bogotá-Medellín (unos 237 km), la diferencia entre ambos métodos es de apenas 545 metros — un 0.23%. Para la mayoría de endpoints de una API (mostrar "a cuántos km está el restaurante más cercano") esa diferencia es irrelevante, y Haversine, al ser más simple, es la elección por defecto razonable. Solo vale la pena pagar el costo de Vincenty (o su alternativa moderna y más robusta, `Geodesic`, basada en el mismo método de Karney que usamos para área) cuando la precisión de metros importa de verdad — navegación, agrimensura, o distancias muy largas donde el error relativo de Haversine crece.

**Nota sobre la API de `geo` 0.33:** fíjate en el patrón `Haversine.distance(a, b)` en vez de `a.haversine_distance(&b)`. Versiones anteriores de `geo` exponían cada fórmula como un método directo sobre el tipo (`haversine_distance`), pero esa API quedó deprecada en favor de un diseño más uniforme: un **espacio métrico** (`Haversine`, `Euclidean`, `Geodesic`, `Rhumb`) que implementa un trait `Distance` común. Esto te deja cambiar de fórmula de distancia modificando una sola palabra (`Haversine` → `Geodesic`) sin tocar el resto de tu código — el mismo principio de "una interfaz, múltiples implementaciones intercambiables" que motivó los traits en el Capítulo 2.3. `VincentyDistance` todavía no ha migrado a este nuevo diseño en la versión que usa este libro, así que convive con la sintaxis antigua — verifica en la documentación de la versión que uses cuál API es la vigente para cada algoritmo.

## Simplificación: Douglas-Peucker vs. Visvalingam-Whyatt

Una `LineString` de GPS real trae ruido: miles de puntos casi colineales que no aportan forma, solo peso. Simplificar una geometría —reducir el número de vértices preservando su forma general dentro de una tolerancia— importa mucho para una API: menos puntos significan payloads HTTP más pequeños y renderizado de mapas más rápido en el cliente.

`geo` incluye dos algoritmos clásicos de simplificación:

```rust,ignore
use geo::{Simplify, SimplifyVw};
use geo_types::{Coord, LineString};

fn main() {
    let ruta_ruidosa = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 },
        Coord { x: 1.0, y: 0.05 },
        Coord { x: 2.0, y: -0.02 },
        Coord { x: 3.0, y: 0.03 },
        Coord { x: 4.0, y: 0.0 },
        Coord { x: 5.0, y: 5.0 },
    ]);

    let douglas_peucker = ruta_ruidosa.simplify(0.1);
    let visvalingam_whyatt = ruta_ruidosa.simplify_vw(0.1);

    println!("original: {} puntos", ruta_ruidosa.0.len());
    println!("Douglas-Peucker (tol 0.1): {} puntos", douglas_peucker.0.len());
    println!("Visvalingam-Whyatt (tol 0.1): {} puntos", visvalingam_whyatt.0.len());
}
```

```text
original: 6 puntos
Douglas-Peucker (tol 0.1): 3 puntos
Visvalingam-Whyatt (tol 0.1): 3 puntos
```

Ambos algoritmos reducen la ruta de 6 a 3 puntos con la misma tolerancia en este ejemplo, pero llegan ahí de formas distintas:

- **Douglas-Peucker** (`.simplify(epsilon)`) trabaja recursivamente: traza una línea recta entre el primer y último punto, encuentra el punto intermedio más alejado de esa línea, y si esa distancia supera `epsilon`, conserva ese punto y repite el proceso a ambos lados. Es rápido e intuitivo, pero puede producir resultados visualmente "angulosos" en curvas suaves.
- **Visvalingam-Whyatt** (`.simplify_vw(epsilon)`) elimina, en cada paso, el punto que forma el triángulo de menor área con sus dos vecinos inmediatos — la idea es que un punto que casi no cambia la silueta general (triángulo pequeño) es el candidato más seguro para eliminar. En la práctica tiende a preservar mejor la forma percibida de curvas suaves que Douglas-Peucker con una tolerancia comparable.

No hay un ganador universal — la elección depende de si te importa más la fidelidad visual de curvas suaves (Visvalingam-Whyatt) o la velocidad y simplicidad conceptual (Douglas-Peucker). Vas a comparar ambos empíricamente en el Ejercicio 4.

## El caso límite que no debe romper tu API: geometrías vacías

Un `Feature` puede llegar con una geometría vacía —una `LineString` sin puntos, un `Polygon` sin anillo exterior— ya sea por un bug del cliente o por datos legítimamente incompletos. Un endpoint de GeoAPI no puede darse el lujo de entrar en pánico ante eso:

```rust,ignore
use geo::{Area, Simplify};
use geo_types::{LineString, Polygon};

fn main() {
    let vacia: LineString<f64> = LineString::new(vec![]);
    let vacia_simplificada = vacia.simplify(0.1);
    println!("LineString vacía simplificada: {} puntos (sin pánico)", vacia_simplificada.0.len());

    let poligono_vacio: Polygon<f64> = Polygon::new(LineString::new(vec![]), vec![]);
    println!("Área de polígono vacío: {}", poligono_vacio.unsigned_area());
}
```

```text
LineString vacía simplificada: 0 puntos (sin pánico)
Área de polígono vacío: 0
```

`geo` maneja estos casos de forma segura por diseño: una geometría vacía simplificada sigue vacía, y su área es `0`, sin ningún `panic!` de por medio. Esto no es un accidente — es el mismo compromiso con el manejo explícito de casos límite que tú mismo aplicaste con `Result` en el Capítulo 2.2, ahora garantizado por una librería externa. Aun así, **nunca asumas que una dependencia externa maneja todos los casos límite que te importan** — siempre vale la pena escribir un test explícito (como vas a hacer en el Ejercicio 6) que confirme el comportamiento, en vez de simplemente confiar en que "probablemente funciona".

## Ejercicios

**Ejercicio 1 — Área geodésica vs. euclidiana.**
Construye dos polígonos "cuadrados" de 1°x1° de lado: uno con una esquina en el ecuador (`(0,0)` a `(1,1)`), otro cerca del polo (`(0,80)` a `(1,81)`). Calcula el área geodésica (`GeodesicArea`) de ambos y compara. ¿El área euclidiana (`Area::unsigned_area`) distingue entre los dos? ¿La geodésica sí? Explica el resultado en una frase, conectándolo con lo que aprendiste en el Capítulo 3.2 sobre cómo un grado de longitud mide distinto según la latitud.

*Criterio de éxito:* imprimes las cuatro áreas (euclidiana y geodésica, para ambos cuadrados) y tu explicación identifica correctamente que el área euclidiana es idéntica para ambos (`1.0` en los dos casos) mientras que la geodésica difiere notablemente.

**Ejercicio 2 — Haversine vs. Vincenty.**
Calcula la distancia entre Bogotá (`-74.0721, 4.7110`) y una ciudad muy lejana de otro continente (por ejemplo, Tokio: `139.6917, 35.6895`) con ambos métodos, y compara el porcentaje de diferencia contra el que obtuviste en el capítulo para la distancia corta Bogotá-Medellín. ¿La diferencia relativa crece, decrece, o se mantiene aproximadamente igual con la distancia?

*Criterio de éxito:* imprimes ambas distancias y el porcentaje de diferencia para el par de ciudades lejanas, y tu respuesta compara ese porcentaje contra el 0.23% del ejemplo del capítulo.

**Ejercicio 3 — Douglas-Peucker con distintas tolerancias.**
Usando la misma `ruta_ruidosa` del capítulo, simplifica con `epsilon` en `0.01`, `0.1`, `0.5`, y `1.0`, e imprime el número de puntos resultante en cada caso. Confirma que el número de puntos nunca *aumenta* al aumentar la tolerancia (¿tiene sentido que fuera al revés?).

*Criterio de éxito:* un test que verifique, con `assert!`, que el conteo de puntos con `epsilon = 1.0` es menor o igual al conteo con `epsilon = 0.01` sobre la misma geometría de entrada.

**Ejercicio 4 — Visvalingam-Whyatt.**
Sobre una `LineString` que aproxime una curva suave (por ejemplo, generada calculando puntos de un cuarto de círculo con `f64::sin`/`f64::cos` en un bucle), compara visualmente (imprimiendo las coordenadas resultantes) el resultado de `.simplify(epsilon)` contra `.simplify_vw(epsilon)` con la misma tolerancia. ¿Cuál de los dos preserva una forma más parecida a la curva original con menos puntos?

*Criterio de éxito:* imprimes ambos conjuntos de puntos resultantes y das una conclusión razonada sobre cuál preserva mejor la curva en tu caso de prueba específico.

**Ejercicio 5 — Benchmark comparativo.**
Genera una `LineString` con 100.000 puntos siguiendo una trayectoria ruidosa (por ejemplo, una línea recta con una pequeña perturbación aleatoria en cada punto — puedes usar una fórmula determinista como `(i as f64 * 0.01).sin() * 0.001` en vez de un generador de números aleatorios real, para que el resultado sea reproducible). Mide, con `std::time::Instant`, cuánto tarda `.simplify(0.001)` comparado con `.simplify_vw(0.001)` sobre esa misma geometría.

*Criterio de éxito:* tu programa imprime ambos tiempos de ejecución (en milisegundos) y el número de puntos resultante de cada algoritmo. No hace falta que uno sea "mejor" que el otro de forma universal — el objetivo es que practiques medir antes de asumir cuál es más rápido, la misma disciplina de "perfilar antes de optimizar" que vas a aplicar de forma mucho más sistemática en el Capítulo 5.1.

**Ejercicio 6 — Caso límite con geometría vacía.**
Escribe tests explícitos (no solo un `println!` como en el capítulo) que verifiquen: una `LineString` vacía simplificada con `.simplify(0.1)` sigue teniendo `0` puntos; un `Polygon` con anillo exterior vacío tiene área `0.0`; y una llamada a `GeodesicArea::geodesic_area_unsigned` sobre ese mismo polígono vacío tampoco entra en pánico (puedes no conocer de antemano qué valor exacto devuelve — el criterio de éxito es que el test compile y corra sin panic, verificado con `assert!` sobre algo que sí puedas predecir, como que el valor no sea `NaN`, usando `f64::is_nan`).

*Criterio de éxito:* los tres tests pasan con `cargo test`, y ninguno depende de que tú hayas verificado el comportamiento "a ojo" — cada uno tiene una aserción explícita.
