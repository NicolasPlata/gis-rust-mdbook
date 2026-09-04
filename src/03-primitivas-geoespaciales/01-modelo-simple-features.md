# 3.1 Modelo OGC Simple Features en Rust

Hasta ahora, GeoAPI ha trabajado con una `struct Coord` que tú mismo definiste. Es hora de reemplazarla por el modelo de datos geométrico estándar de la industria: **OGC Simple Feature Access**, y por la implementación de ese modelo en la que se apoya prácticamente todo el ecosistema GeoRust: el crate [`geo-types`](https://crates.io/crates/geo-types).

> **Convención de versiones de este capítulo:** los ejemplos usan `geo-types` 0.7.20, `geo` 0.33.1, `geojson` 1.0.0 y `wkt` 0.14.0. Verifica las versiones vigentes en [crates.io](https://crates.io) antes de fijarlas en un proyecto real — ver [1.3](../01-front-matter/03-convenciones-del-libro.md).

## El modelo Simple Feature Access

La OGC (*Open Geospatial Consortium*) define un pequeño vocabulario de formas geométricas que casi cualquier sistema GIS del planeta entiende — es el mismo modelo detrás de PostGIS, GeoJSON, Shapefile y WKT. Son cinco formas base, más sus variantes "multi":

| Tipo | Qué representa | Ejemplo en GeoAPI |
|---|---|---|
| `Point` | Un único par de coordenadas | La ubicación de un sensor |
| `LineString` | Una secuencia ordenada de puntos conectados por segmentos rectos | La ruta de un vehículo de reparto |
| `Polygon` | Un área cerrada: un anillo exterior, más cero o más anillos interiores (huecos) | El límite de una parcela catastral |
| `MultiPoint` | Una colección de puntos | Todos los sensores de una red |
| `MultiLineString` | Una colección de líneas | Todas las calles de un barrio |
| `MultiPolygon` | Una colección de polígonos | Un país con islas — cada isla es un `Polygon` separado dentro del mismo `MultiPolygon` |

Un detalle que se presta a confusión la primera vez: un `Polygon` con un hueco (piensa en una plaza con una fuente redonda en el centro que no es parte de la plaza) no es un tipo especial — es un `Polygon` cuyo anillo exterior describe el borde de la plaza, y que trae un anillo interior adicional describiendo el borde de la fuente. Cualquier punto dentro del anillo exterior pero *dentro también* de algún anillo interior se considera fuera del polígono.

## `geo-types`: el modelo de datos, sin algoritmos

`geo-types` deliberadamente solo define los tipos — no incluye funciones de área, distancia, ni intersección (esas viven en el crate `geo`, que vemos en el Capítulo 3.3). Esta separación importa: si tu API solo necesita deserializar y volver a serializar geometrías sin nunca calcular nada sobre ellas, puedes depender únicamente de `geo-types` y evitar compilar toda la superficie algorítmica de `geo`.

### `Coord<T>` y `Point<T>`

El tipo más básico es `Coord<T>`, un par `x`/`y` genérico sobre el tipo numérico (casi siempre `f64`, a veces `f32`):

```rust,ignore
use geo_types::{Coord, Point};

fn main() {
    // Nota el orden: x primero (longitud), y segundo (latitud) — al revés
    // de como solemos decir "latitud, longitud" en español. Esto es una
    // fuente de bugs tan común que le dedicamos el Capítulo 3.2 completo.
    let bogota: Point<f64> = Point::new(-74.0721, 4.7110);

    println!("{:?}", bogota);
    println!("tamaño de Point<f64>: {} bytes", std::mem::size_of::<Point<f64>>());
}
```

```text
Point(Coord { x: -74.0721, y: 4.711 })
tamaño de Point<f64>: 16 bytes
```

Esos 16 bytes (dos `f64` de 8 bytes cada uno, sin ningún byte de metadata adicional) no son un detalle de trivia — son la razón por la que `geo-types` puede procesar datasets de millones de puntos sin desperdiciar memoria. `Point<T>` es, literalmente, `struct Point<T>(Coord<T>)`, y `Coord<T>` es `struct Coord<T> { x: T, y: T }`. No hay ninguna capa de indirección ni *heap allocation* escondida — controlar ese layout de memoria de forma explícita es exactamente el tipo de control que mencionamos en la introducción del libro como una de las razones para elegir Rust.

### `LineString<T>`

Una secuencia de coordenadas:

```rust,ignore
use geo_types::{Coord, LineString};

fn main() {
    let ruta = LineString::new(vec![
        Coord { x: -74.07, y: 4.71 }, // Bogotá
        Coord { x: -75.56, y: 6.25 }, // Medellín
        Coord { x: -76.53, y: 3.45 }, // Cali
    ]);

    println!("La ruta tiene {} puntos", ruta.0.len());
}
```

`LineString<T>` envuelve un `Vec<Coord<T>>` — accesible como `.0` porque es una *tuple struct* de un solo campo. Vas a ver este patrón (envolver una colección en una struct con un solo campo, en vez de usar el `Vec` "pelado") en varios tipos de `geo-types`: le da al tipo una identidad propia (un `LineString` no se puede pasar por accidente donde se espera un `Vec<Coord>` cualquiera) sin ningún costo en tiempo de ejecución.

### `Polygon<T>`: anillo exterior más huecos

```rust,ignore
use geo_types::{Coord, LineString, Polygon};

fn main() {
    let exterior = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 },
        Coord { x: 4.0, y: 0.0 },
        Coord { x: 4.0, y: 4.0 },
        Coord { x: 0.0, y: 4.0 },
        Coord { x: 0.0, y: 0.0 }, // cerrado: el primer punto se repite al final
    ]);

    let hueco = LineString::new(vec![
        Coord { x: 1.0, y: 1.0 },
        Coord { x: 2.0, y: 1.0 },
        Coord { x: 2.0, y: 2.0 },
        Coord { x: 1.0, y: 2.0 },
        Coord { x: 1.0, y: 1.0 },
    ]);

    let plaza_con_fuente = Polygon::new(exterior, vec![hueco]);

    println!("Anillos interiores: {}", plaza_con_fuente.interiors().len());
}
```

**Un detalle importante que vale la pena internalizar ahora, antes de que te sorprenda en producción:** `Polygon::new` **cierra automáticamente el anillo exterior (y cada interior) por ti**, añadiendo una copia del primer punto al final si no la pusiste. No es una validación que rechace tu entrada — es una corrección silenciosa:

```rust,ignore
use geo_types::{Coord, LineString, Polygon};

fn main() {
    let abierto = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 },
        Coord { x: 1.0, y: 0.0 },
        Coord { x: 1.0, y: 1.0 },
    ]);
    println!("abierto.is_closed(): {}", abierto.is_closed()); // false
    println!("puntos antes de construir el Polygon: {}", abierto.0.len()); // 3

    let poligono = Polygon::new(abierto, vec![]);
    println!("puntos del exterior tras Polygon::new: {}", poligono.exterior().0.len()); // 4
    println!("¿el exterior quedó cerrado?: {}", poligono.exterior().is_closed()); // true
}
```

Por qué importa: si en algún punto comparas dos polígonos construidos de formas distintas (uno con el anillo ya cerrado a mano, otro sin cerrar) esperando que sean "el mismo polígono", ambos terminan con el mismo número de puntos después de pasar por `Polygon::new` — el auto-cierre elimina esa fuente de inconsistencia por ti. Pero si alguna vez trabajas directamente con un `LineString` suelto (antes de envolverlo en un `Polygon`, por ejemplo al validar datos que vienen de un archivo externo), **`LineString` no se cierra solo** — ahí es donde `.is_closed()` se vuelve una verificación que tienes que hacer tú explícitamente. Vas a practicar exactamente esta distinción en el Ejercicio 3.

### Las variantes `Multi*`

`MultiPoint`, `MultiLineString` y `MultiPolygon` son, cada una, un envoltorio alrededor de un `Vec` de su tipo singular:

```rust,ignore
use geo_types::{Coord, LineString, MultiPolygon, Polygon};

fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon<f64> {
    Polygon::new(
        LineString::new(vec![
            Coord { x: x0, y: y0 },
            Coord { x: x0 + lado, y: y0 },
            Coord { x: x0 + lado, y: y0 + lado },
            Coord { x: x0, y: y0 + lado },
            Coord { x: x0, y: y0 },
        ]),
        vec![],
    )
}

fn main() {
    // Un archipiélago: dos islas, cada una un Polygon independiente,
    // agrupadas en un único MultiPolygon.
    let isla_norte = cuadrado(0.0, 10.0, 2.0);
    let isla_sur = cuadrado(0.0, 0.0, 2.0);

    let archipielago = MultiPolygon::new(vec![isla_norte, isla_sur]);

    println!("El archipiélago tiene {} islas", archipielago.0.len());
}
```

### El enum `Geometry`: cuando el tipo no se conoce hasta tiempo de ejecución

A veces no sabes de antemano qué tipo de geometría vas a recibir — un endpoint genérico `POST /features` de GeoAPI debería aceptar un `Point`, un `Polygon`, o cualquier otro tipo, según lo que traiga el GeoJSON del request. Para eso existe `Geometry<T>`, un `enum` que puede ser cualquiera de las variantes anteriores:

```rust,ignore
use geo_types::{Coord, Geometry, Point, Polygon, LineString};

fn describir(geom: &Geometry<f64>) -> &'static str {
    match geom {
        Geometry::Point(_) => "un punto",
        Geometry::LineString(_) => "una línea",
        Geometry::Polygon(_) => "un polígono",
        Geometry::MultiPoint(_) => "varios puntos",
        Geometry::MultiLineString(_) => "varias líneas",
        Geometry::MultiPolygon(_) => "varios polígonos",
        _ => "otra geometría (GeometryCollection, etc.)",
    }
}

fn main() {
    let geometrias: Vec<Geometry<f64>> = vec![
        Geometry::Point(Point::new(-74.07, 4.71)),
        Geometry::Polygon(Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 },
                Coord { x: 1.0, y: 0.0 },
                Coord { x: 1.0, y: 1.0 },
                Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        )),
    ];

    for g in &geometrias {
        println!("{}", describir(g));
    }
}
```

Este `match` exhaustivo (el compilador te obliga a cubrir todas las variantes, o a usar `_` explícitamente como aquí) es el mismo patrón de "manejar todos los casos posibles" que ya conoces de `Result` y `Option` — aplicado ahora a "qué tipo de geometría tengo en la mano". Vas a usar `Geometry<f64>` como el tipo central de `geoapi-core` a partir del proyecto de cierre de este módulo.

## Ejercicios

**Ejercicio 1 — Instanciar cada primitiva.**
Escribe un programa que cree, con datos inventados pero geográficamente razonables (usa coordenadas de ciudades colombianas reales si quieres seguir el hilo del libro), una instancia de cada uno de: `Point`, `LineString`, `Polygon` (con al menos un anillo interior), `MultiPoint`, `MultiLineString`, `MultiPolygon`. Imprime, para cada una, cuántos puntos/anillos/geometrías contiene.

*Criterio de éxito:* el programa compila contra `geo-types` y `cargo run` imprime seis líneas, una por tipo, con un conteo coherente con los datos que inventaste.

**Ejercicio 2 — Construir un `MultiPolygon` desde cero.**
Escribe una función `fn generar_cuadricula(filas: usize, columnas: usize, lado: f64) -> MultiPolygon<f64>` que genere una cuadrícula de polígonos cuadrados de `lado` unidades, sin huecos entre ellos, usando dos bucles anidados (o, si ya te sientes cómodo, una combinación de iteradores). Verifica que `generar_cuadricula(3, 3, 1.0)` produce un `MultiPolygon` con exactamente 9 polígonos.

*Criterio de éxito:* un test con `assert_eq!(generar_cuadricula(3, 3, 1.0).0.len(), 9)` pasa.

**Ejercicio 3 — Detectar un anillo no cerrado.**
Escribe `fn validar_anillo_crudo(coords: &[(f64, f64)]) -> Result<LineString<f64>, String>` que reciba una lista cruda de tuplas `(x, y)` —simulando datos que acaban de llegar de un archivo externo, **antes** de construir ningún `Polygon`— y devuelva `Err` con un mensaje descriptivo si el primer y último punto no coinciden exactamente, sin intentar corregirlo automáticamente (a diferencia de lo que hace `Polygon::new` con el `Polygon` ya construido).

*Criterio de éxito:* un test con una lista de coordenadas donde el primer y último punto difieren produce `Err`; un test con una lista ya cerrada produce `Ok`.

**Ejercicio 4 — Convertir entre `Point` y `Coord`.**
Escribe dos funciones, `fn envolver(c: Coord<f64>) -> Point<f64>` y `fn desenvolver(p: Point<f64>) -> Coord<f64>`, usando las conversiones `From`/`Into` que `geo-types` ya provee (no reconstruyas los campos a mano con `Point::new(c.x, c.y)` — usa `.into()` o `Point::from(c)`). Verifica con un test que aplicar ambas funciones en secuencia sobre un `Coord` arbitrario devuelve un valor igual al original.

*Criterio de éxito:* el test de *roundtrip* (`desenvolver(envolver(c)) == c`) pasa para al menos dos coordenadas distintas.

**Ejercicio 5 — Escribir un test de igualdad geométrica.**
`Point`, `LineString` y `Polygon` implementan `PartialEq`, así que `==` funciona directamente entre dos instancias. Escribe un test que confirme que dos `Polygon` construidos por separado, con el mismo anillo exterior pero uno de ellos sin cerrar explícitamente (dejando que `Polygon::new` lo cierre automáticamente), terminan siendo `==` entre sí. Luego, escribe un segundo test que confirme que dos polígonos con vértices en un orden distinto (mismo polígono "visualmente", pero la lista de coordenadas empieza en un punto diferente del anillo) **no** son iguales según `==`. Este segundo resultado no es un bug: `PartialEq` sobre estos tipos compara la secuencia exacta de coordenadas, no la forma geométrica abstracta — para comparar formas de verdad (ignorando el punto de partida del anillo, o incluso permitiendo una tolerancia numérica) se necesita el trait `Relate` que ves en el Capítulo 4.1.

*Criterio de éxito:* ambos tests pasan, y tu segundo test incluye un comentario explicando, en tus propias palabras, por qué `==` no es la herramienta correcta para "¿estas dos geometrías tienen la misma forma?".
