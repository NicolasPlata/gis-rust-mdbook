# 4.3 Índices espaciales — `rstar`, `geo-index`, `h3o`

Con miles o cientos de miles de features en memoria, un endpoint como `GET /features/near?lat&lon&radius` no puede darse el lujo de recorrer una lista completa comparando distancias una por una — eso es O(n) por consulta, y con n=100.000 y muchas consultas por segundo, tu API se arrodilla. Un **índice espacial** resuelve esto organizando las geometrías de antemano para que preguntas como "¿qué hay cerca de este punto?" o "¿qué hay dentro de este bbox?" se respondan examinando solo una fracción pequeña de los datos. Este capítulo te da tres, cada uno con un compromiso distinto entre flexibilidad y velocidad — la elección correcta depende de si tus datos cambian en caliente o no.

## `rstar`: el R*-tree dinámico

[`rstar`](https://crates.io/crates/rstar) (versión 0.13 en este capítulo) implementa un R*-tree — una estructura que agrupa geometrías cercanas en una jerarquía de rectángulos envolventes anidados, de forma que una consulta puede descartar ramas enteras del árbol sin visitar cada elemento. Es la elección natural cuando tus features son **editables**: soporta `insert` y `remove` sobre un árbol ya construido, a costa de ser algo más lento de construir y consultar que una alternativa inmutable.

`rstar` no sabe nada de `geo-types` directamente — trabaja con cualquier tipo que implemente su trait `RTreeObject`, y ya provee un tipo auxiliar, `GeomWithData<Geometria, T>`, para asociar un dato propio (típicamente el índice o ID de tu feature real) a cada geometría indexada sin tener que implementar el trait tú mismo:

```rust,ignore
use std::time::Instant;

use rstar::primitives::GeomWithData;
use rstar::RTree;

// Genera N puntos deterministas (sin `rand`, para que el resultado sea
// reproducible) dentro de un bbox que aproxima el área metropolitana de Bogotá.
fn generar_puntos(n: usize) -> Vec<(f64, f64)> {
    let (lon_min, lon_max) = (-74.25, -73.95);
    let (lat_min, lat_max) = (4.45, 4.85);
    (0..n)
        .map(|i| {
            let t = i as f64;
            let lon = lon_min + (lon_max - lon_min) * (0.5 + 0.5 * (t * 0.618_034).sin());
            let lat = lat_min + (lat_max - lat_min) * (0.5 + 0.5 * (t * 0.381_966).cos());
            (lon, lat)
        })
        .collect()
}

fn main() {
    let puntos = generar_puntos(100_000);
    let punto_consulta = (-74.0721, 4.7110); // Bogotá, Plaza de Bolívar (aprox.)

    let inicio = Instant::now();
    let objetos: Vec<GeomWithData<[f64; 2], u32>> = puntos
        .iter()
        .enumerate()
        .map(|(i, &(x, y))| GeomWithData::new([x, y], i as u32))
        .collect();
    let arbol = RTree::bulk_load(objetos);
    println!("construcción (100k puntos): {:?}", inicio.elapsed());

    let inicio = Instant::now();
    let cinco_mas_cercanos: Vec<u32> = arbol
        .nearest_neighbor_iter([punto_consulta.0, punto_consulta.1])
        .take(5)
        .map(|g| g.data)
        .collect();
    println!("consulta KNN (k=5): {:?} -> {:?}", inicio.elapsed(), cinco_mas_cercanos);
}
```

```text
construcción (100k puntos): 15.091396ms
consulta KNN (k=5): 4.301µs -> [24908, 51178, 77448, 12505, 89851]
```

Fíjate en dos decisiones de diseño: `RTree::bulk_load` (en vez de insertar uno por uno con `insert`) construye el árbol completo de una vez, mucho más rápido cuando ya tienes todos los datos por adelantado — que es exactamente tu caso al arrancar GeoAPI con un dataset existente. Y la consulta KNN usa `.nearest_neighbor_iter(punto)`, que devuelve un iterador ordenado por distancia creciente — pides tantos vecinos como necesites con `.take(k)` sin calcular de más.

## `geo-index`: empaquetado, de solo lectura, más rápido todavía

[`geo-index`](https://crates.io/crates/geo-index) (versión 0.3 en este capítulo) resuelve el mismo problema con una filosofía distinta: en vez de un árbol con punteros y nodos dispersos en memoria, empaqueta **todo el índice en un único buffer contiguo** (`Vec<u8>`), ordenado con una curva de Hilbert o el algoritmo *sort-tile-recursive*. El resultado es mejor localidad de caché — y, en consecuencia, construcción y consultas más rápidas — al costo de que **el índice es inmutable**: no hay `insert` ni `remove`, solo `RTreeBuilder` (una vez) seguido de consultas.

```rust,ignore
use std::time::Instant;

use geo_index::rtree::sort::HilbertSort;
use geo_index::rtree::{RTreeBuilder, RTreeIndex};

fn main() {
    let puntos = generar_puntos(100_000); // la misma función del ejemplo anterior
    let punto_consulta = (-74.0721, 4.7110);

    let inicio = Instant::now();
    let mut builder = RTreeBuilder::<f64>::new(puntos.len() as u32);
    for &(x, y) in &puntos {
        builder.add(x, y, x, y); // un punto es un rectángulo degenerado (min == max)
    }
    let arbol = builder.finish::<HilbertSort>();
    println!("construcción (100k puntos): {:?}", inicio.elapsed());

    let inicio = Instant::now();
    let cinco_mas_cercanos = arbol.neighbors(punto_consulta.0, punto_consulta.1, Some(5), None);
    println!("consulta KNN (k=5): {:?} -> {:?}", inicio.elapsed(), cinco_mas_cercanos);
}
```

```text
construcción (100k puntos): 8.129951ms
consulta KNN (k=5): 4.745µs -> [24908, 51178, 77448, 12505, 89851]
```

Dos cosas para notar: primero, **ambos índices coinciden exactamente** en los 5 vecinos más cercanos (`[24908, 51178, 77448, 12505, 89851]`) — es la misma pregunta matemática respondida por dos estructuras distintas, así que el resultado no puede cambiar, solo la velocidad. Segundo, la construcción de `geo-index` toma aproximadamente la mitad del tiempo que `rstar` sobre el mismo dataset — consistente con lo que documenta el propio README del crate ("construction is ~2x faster than `rstar` and search is ~33% faster"). Vas a medir tú mismo si esa proporción se mantiene en el Ejercicio 3.

**La pregunta que decide entre los dos no es "cuál es más rápido"** — es "¿tus features cambian después de construir el índice?". Si GeoAPI recibe un `POST /features` que agrega una geometría nueva, `rstar` la puede insertar en el árbol existente; `geo-index` te obligaría a reconstruir el índice completo desde cero. Para un dataset de solo lectura servido desde un archivo estático (algo que vas a ver con más detalle en el Capítulo 5.4 con PMTiles), `geo-index` es la elección correcta. Para el índice en memoria de features editables de tu servidor REST (Capítulo 4.7), es `rstar`.

```rust,ignore
use rstar::primitives::GeomWithData;
use rstar::RTree;

fn main() {
    let mut arbol: RTree<GeomWithData<[f64; 2], u32>> = RTree::bulk_load(vec![
        GeomWithData::new([-74.0721, 4.7110], 1), // Bogotá
        GeomWithData::new([-75.5636, 6.2518], 2), // Medellín
    ]);

    println!("tamaño antes de insertar: {}", arbol.size());
    arbol.insert(GeomWithData::new([-76.5225, 3.4372], 3)); // Cali
    println!("tamaño tras insertar Cali: {}", arbol.size());

    let removido = arbol.remove(&GeomWithData::new([-75.5636, 6.2518], 2));
    println!("removido: {:?}, tamaño tras remove: {}", removido.map(|g| g.data), arbol.size());
}
```

```text
tamaño antes de insertar: 2
tamaño tras insertar Cali: 3
removido: Some(2), tamaño tras remove: 2
```

## `h3o`: rejilla hexagonal jerárquica

Los dos índices anteriores responden "¿qué está cerca de este punto exacto?". [`h3o`](https://crates.io/crates/h3o) (versión 0.11, una reimplementación en Rust puro del sistema H3 de Uber) responde una pregunta distinta: "¿en qué celda de una rejilla global cae este punto, a una resolución dada?" — útil para agregaciones espaciales (mapas de calor, "cuántos eventos hubo en esta zona") donde quieres agrupar puntos en celdas de tamaño uniforme en vez de calcular distancias par a par.

H3 cubre el planeta con hexágonos (más algunos pentágonos inevitables por la geometría de una esfera) organizados en 16 resoluciones, cada una ~7 veces más fina que la anterior. Cada celda tiene un identificador único y estable:

```rust,ignore
use h3o::{LatLng, Resolution};

fn main() {
    let bogota = LatLng::new(4.7110, -74.0721).expect("coordenadas válidas");

    let celda_res7 = bogota.to_cell(Resolution::Seven);
    let celda_res9 = bogota.to_cell(Resolution::Nine);

    println!("resolución 7: {celda_res7} (área ~{:.3} km²)", celda_res7.area_km2());
    println!("resolución 9: {celda_res9} (área ~{:.3} km²)", celda_res9.area_km2());

    // La jerarquía es real: el padre de la celda fina es la celda gruesa.
    let padre = celda_res9.parent(Resolution::Seven).unwrap();
    println!("¿padre de res9 == celda res7 directa?: {}", padre == celda_res7);
}
```

```text
resolución 7: 8766e4288ffffff (área ~5.397 km²)
resolución 9: 8966e42888fffff (área ~0.110 km²)
¿padre de res9 == celda res7 directa?: true
```

La resolución 7 (~5.4 km² por celda) es razonable para agregaciones a nivel de ciudad; la resolución 9 (~0.11 km², manzanas urbanas) para algo mucho más fino. La relación padre-hijo es exacta y determinista: subir de resolución 9 a 7 con `.parent()` te da *siempre* la misma celda que resolver el punto original directamente a resolución 7 — eso es lo que hace a H3 útil para agregar datos a distintas escalas sin recalcular desde las coordenadas crudas cada vez, algo que vas a explotar si tu API alguna vez expone un endpoint de tipo "mapa de calor" con nivel de zoom variable.

## Ejercicios

**Ejercicio 1 — Construir un R*-tree con 100k puntos.**
Genera 100.000 puntos deterministas (puedes reutilizar `generar_puntos` del capítulo, o tu propia variante) y constrúyelos en un `RTree` de `rstar` con `bulk_load`. Mide el tiempo de construcción con `std::time::Instant` y confirma que el árbol reporta el tamaño correcto con `.size()`.

*Criterio de éxito:* tu programa imprime el tiempo de construcción y un `assert_eq!(arbol.size(), 100_000)` pasa.

**Ejercicio 2 — Consulta KNN.**
Sobre el árbol del Ejercicio 1, implementa una función `fn k_vecinos_mas_cercanos(arbol: &RTree<GeomWithData<[f64;2], u32>>, punto: [f64;2], k: usize) -> Vec<u32>` que devuelva los IDs de los `k` puntos más cercanos, en orden de distancia creciente. Verifica que el primer elemento devuelto es siempre el más cercano real, comparando contra una búsqueda lineal de fuerza bruta sobre un subconjunto pequeño de prueba (no sobre los 100k — sería redundante con lo que ya estás indexando).

*Criterio de éxito:* un test con un conjunto pequeño de puntos conocidos (5-10) donde puedas calcular a mano cuál es el más cercano a un punto de consulta dado, y `assert_eq!` confirme que `k_vecinos_mas_cercanos` con `k=1` devuelve ese mismo punto.

**Ejercicio 3 — Comparar latencia `rstar` vs. `geo-index` en el mismo dataset.**
Construye ambos índices (`rstar` y `geo-index`) sobre los mismos 100.000 puntos del Ejercicio 1, mide construcción y consulta KNN (`k=10`) de cada uno, e imprime una tabla comparativa. Confirma que ambos devuelven el mismo conjunto de IDs para la misma consulta (el orden interno del `Vec` puede variar si hay empates de distancia exactos, pero el conjunto de IDs debe coincidir).

*Criterio de éxito:* tu programa imprime los cuatro tiempos (construcción y consulta de cada índice) y un `assert_eq!` sobre los conjuntos de IDs (usa `HashSet` para comparar sin depender del orden) confirma que coinciden.

**Ejercicio 4 — Indexar con H3 a dos resoluciones.**
Toma una lista de al menos 20 puntos (puedes generarlos con la misma técnica determinista del capítulo) y agrúpalos por celda H3 a resolución 6 y por separado a resolución 9, usando un `HashMap<h3o::CellIndex, Vec<usize>>` (el valor es la lista de índices de los puntos que caen en cada celda). Imprime cuántas celdas distintas se usaron a cada resolución.

*Criterio de éxito:* tu programa confirma con un `assert!` que el número de celdas distintas a resolución 9 es mayor o igual al número de celdas distintas a resolución 6 sobre el mismo conjunto de puntos (¿por qué nunca podría ser al revés?).

**Ejercicio 5 — Invalidar/reconstruir el índice tras una edición.**
Simula el ciclo de vida de un índice en un servidor: construye un `RTree` de `rstar` con 1.000 puntos, inserta 100 puntos nuevos con `.insert()`, remueve 50 de los originales con `.remove()`, y confirma que `.size()` refleja el conteo correcto en cada paso (1000 → 1100 → 1050). Luego repite el mismo escenario intentando usarlo con `geo-index` y documenta en un comentario por qué no es posible sin reconstruir el índice completo desde cero.

*Criterio de éxito:* una secuencia de `assert_eq!` sobre `.size()` en cada paso para `rstar`, más un comentario explícito en el código confirmando la limitación de `geo-index` (no hace falta que compiles un intento fallido — basta con que expliques correctamente, en tus propias palabras, qué tendrías que hacer en su lugar: volver a llamar a `RTreeBuilder` con el conjunto de datos actualizado completo).

**Ejercicio 6 — Ejercicio de perfilado.**
Repite la comparación del Ejercicio 3 pero variando el tamaño del dataset: 1.000, 10.000, 100.000 y 1.000.000 de puntos. Grafica (puede ser una tabla de texto, no hace falta una librería de gráficos) cómo escala el tiempo de construcción de cada índice con el tamaño de los datos. ¿Crece linealmente? ¿Más rápido? ¿La proporción de ~2x entre `geo-index` y `rstar` que viste en el capítulo se mantiene, crece, o se reduce a medida que el dataset crece?

*Criterio de éxito:* tu programa imprime una tabla con 4 filas (una por tamaño) y al menos 4 columnas (tamaño, tiempo `rstar`, tiempo `geo-index`, proporción), y una conclusión escrita de 2-3 frases sobre el patrón de escalamiento que observaste. Recuerda compilar en modo `--release` para que las mediciones sean representativas — el modo debug de Rust puede ser un orden de magnitud más lento y falsear tu conclusión.

> Esta técnica es la que usan los Checkpoints 1 y 2 del proyecto GeoAPI v0.3 (Capítulo 4.7) — ver las historias de usuario ahí.
