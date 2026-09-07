# 5.1 Paralelismo de datos con Rayon

Hasta ahora, cada operación de GeoAPI corre en un solo hilo. Para una API que procesa lotes de miles o millones de geometrías —reproyectar un `POST /features/batch`, calcular la longitud de cada ruta de una flota completa— eso deja sobre la mesa el resto de los núcleos de la máquina. [`rayon`](https://crates.io/crates/rayon) (versión 1.12 en este capítulo) es la forma idiomática de aprovecharlos en Rust: convierte un iterador secuencial en uno paralelo cambiando `.iter()` por `.par_iter()`, con *work-stealing* automático repartiendo el trabajo entre hilos.

## El cambio de una palabra

```rust,ignore
use geo::{Distance, Haversine};
use geo_types::{LineString, Point};
use rayon::prelude::*;
use std::time::Instant;

fn longitud_total(ruta: &LineString<f64>) -> f64 {
    ruta.0.windows(2).map(|w| Haversine.distance(Point::from(w[0]), Point::from(w[1]))).sum()
}

fn main() {
    let rutas: Vec<LineString<f64>> = /* 20 000 rutas de GPS, 50 puntos cada una */
        # vec![];

    let inicio = Instant::now();
    let total_secuencial: f64 = rutas.iter().map(longitud_total).sum();
    println!("secuencial (.iter()):   {:?}", inicio.elapsed());

    let inicio = Instant::now();
    let total_paralelo: f64 = rutas.par_iter().map(longitud_total).sum();
    println!("paralelo (.par_iter()): {:?}", inicio.elapsed());

    assert!((total_secuencial - total_paralelo).abs() < 1e-6);
}
```

```text
secuencial (.iter()):   24.418235ms
paralelo (.par_iter()): 5.249855ms
```

Sobre 20.000 rutas de 50 puntos cada una (1 millón de segmentos, cada uno con una llamada a `Haversine.distance`), pasar de `.iter()` a `.par_iter()` da **~4.6x** de mejora en una máquina de 12 hilos lógicos — sublineal (12 hilos no dan 12x) porque hay overhead de coordinación y las CPUs modernas comparten ancho de banda de memoria entre núcleos, pero una mejora real y sustancial por un cambio de una palabra. `rayon` usa *work-stealing*: divide el trabajo en tareas, y un hilo que termina su parte le "roba" trabajo pendiente a otro hilo ocupado, balanceando la carga automáticamente incluso cuando el trabajo no está distribuido uniformemente.

Esto funciona sin ningún `unsafe`, sin que tú manejes hilos, canales, ni sincronización manual — es lo que la ruta de aprendizaje de este libro llama paralelismo "*fearless*": aplicable cuando cada elemento se procesa de forma completamente independiente (un ráster celda por celda, una lista de geometrías sin estado compartido). La regla operativa, que vas a ver romperse dos veces en este mismo capítulo: **paraleliza solo después de perfilar, nunca por reflejo.**

## Cuándo `.par_iter()` no ayuda

Convertir todo a paralelo "porque sí" tiene un costo: repartir trabajo entre hilos y recolectar resultados no es gratis. Si el trabajo por elemento es trivial y la colección es pequeña, ese costo de coordinación supera cualquier beneficio.

```rust,ignore
use rayon::prelude::*;
use std::time::Instant;

fn main() {
    let pequeno: Vec<f64> = (0..200).map(|i| i as f64).collect();

    let inicio = Instant::now();
    let _s: f64 = pequeno.iter().map(|x| x * 2.0).sum();
    println!("secuencial: {:?}", inicio.elapsed());

    let inicio = Instant::now();
    let _s: f64 = pequeno.par_iter().map(|x| x * 2.0).sum();
    println!("paralelo:   {:?}", inicio.elapsed());
}
```

```text
secuencial: 83ns
paralelo:   477.638µs
```

**El paralelo es casi 6.000 veces más lento.** No es un error de medición: multiplicar 200 números por 2 toma nanosegundos; repartir esos 200 números entre varios hilos, coordinar el trabajo, y recolectar el resultado toma microsegundos — varios órdenes de magnitud más que el trabajo real. Esta es la razón concreta detrás de la regla "perfila antes de paralelizar" que ya viste en el Capítulo 3.3: sin medir, es fácil asumir que "paralelo siempre es más rápido" y terminar haciendo tu API más lenta, no más rápida, para cualquier lote pequeño (que en una API real —un usuario subiendo 15 features de una vez— es mucho más común que el lote de un millón).

## Reproyección batch paralela — y una trampa real con recursos costosos

Aquí es donde `rayon` se encuentra con `proj` (Capítulo 4.4), y aparece una trampa que no es obvia hasta que la mides. Primero, el motivo por el que **no puedes** simplemente compartir un único `Proj` entre hilos:

```rust,ignore
use proj::Proj;
use rayon::prelude::*;

fn main() {
    let transformador = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
    let puntos: Vec<(f64, f64)> = vec![(-74.07, 4.71)];

    let _resultados: Vec<(f64, f64)> = puntos
        .par_iter()
        .map(|&p| transformador.convert(p).unwrap()) // no compila
        .collect();
}
```

```text
error[E0277]: `*mut proj_sys::pj_ctx` cannot be shared between threads safely
```

`Proj` envuelve punteros crudos a un contexto de `libproj` (vas a ver el patrón completo detrás de este tipo de *wrapper* en el Capítulo 5.6) — el compilador rechaza compartir `&Proj` entre hilos porque **no es `Sync`**, y tiene toda la razón: la librería C por debajo no garantiza que sea seguro usar el mismo contexto desde varios hilos a la vez. Necesitas una instancia de `Proj` por hilo, no una compartida.

`rayon` ofrece `map_init`, diseñado exactamente para "recurso costoso de crear, no compartible entre hilos": la idea es que el closure de inicialización corra una vez por hilo, no una vez por elemento. La trampa: **"una vez por hilo" no es literalmente cierto.**

```rust,ignore
use proj::Proj;
use rayon::prelude::*;
use std::time::Instant;

fn main() {
    let puntos: Vec<(f64, f64)> = /* 1 millón de puntos */
        # vec![];

    let inicio = Instant::now();
    let _ingenuo: Vec<(f64, f64)> = puntos
        .par_iter()
        .map_init(
            || Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap(),
            |t, &p| t.convert(p).unwrap(),
        )
        .collect();
    println!("par_iter + map_init: {:?}", inicio.elapsed());
}
```

```text
par_iter + map_init: 5.799726916s
```

Comparado con la versión **secuencial** del mismo millón de puntos (`114.168529ms`, con un único `Proj` creado una sola vez), esta versión "paralela" es **~51 veces más lenta**. ¿Por qué? Instrumentando el closure de inicialización con un contador, se confirma que `map_init` lo invocó **1.451 veces** sobre 1 millón de elementos — no 12 (el número de hilos lógicos de la máquina). `rayon` divide el trabajo en muchas tareas pequeñas para el *work-stealing* (una decisión correcta para balancear carga), y `map_init` llama a tu inicializador una vez por cada división, no una vez por hilo físico. Si ese inicializador es barato (crear un `Vec` vacío, por ejemplo), no importa. Pero `Proj::new_known_crs` no es barato — internamente consulta la base de datos de definiciones de PROJ (`proj.db`, típicamente en disco) para construir el *pipeline* de transformación, y hacerlo 1.451 veces cuesta segundos.

La solución: controlar tú mismo la granularidad, dividiendo el trabajo en exactamente tantos trozos como hilos vas a usar, y creando un `Proj` por trozo:

```rust,ignore
use proj::Proj;
use rayon::prelude::*;
use std::time::Instant;

fn main() {
    let puntos: Vec<(f64, f64)> = /* el mismo millón de puntos */
        # vec![];

    let inicio = Instant::now();
    let n_hilos = rayon::current_num_threads();
    let tam_trozo = puntos.len().div_ceil(n_hilos);
    let _correcto: Vec<(f64, f64)> = puntos
        .par_chunks(tam_trozo)
        .flat_map(|trozo| {
            let t = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
            trozo.iter().map(move |&p| t.convert(p).unwrap()).collect::<Vec<_>>()
        })
        .collect();
    println!("par_chunks (un Proj por hilo, n={n_hilos}): {:?}", inicio.elapsed());
}
```

```text
par_chunks (un Proj por hilo, n=12): 50.237998ms
```

Ahora sí: **~2.3x más rápido que la versión secuencial**, con exactamente 12 instancias de `Proj` creadas (una por trozo, y con 12 hilos disponibles, `par_chunks` reparte los 12 trozos uno por hilo). La lección no es "`map_init` está roto" — es que **la documentación de una API paralela puede simplificar de más ("una vez por hilo") una garantía que en realidad es "una vez por división de tarea"**, y esa diferencia solo se descubre midiendo, nunca asumiendo. Verificar esto con un contador real, como se hizo arriba, es exactamente el hábito que este libro lleva insistiendo desde el Capítulo 3.3.

## El patrón irregular: escritura compartida y `Mutex`

No todo paralelismo es "vergonzosamente paralelo". Agregar resultados en una estructura compartida —por ejemplo, contar cuántas features caen en cada celda de un mapa de calor— es un patrón *irregular*: cada hilo necesita escribir en la misma estructura, no en una región propia.

```rust,ignore
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

fn main() {
    let ids_de_celda: Vec<u32> = /* 100 000 features, 500 celdas distintas */
        # vec![];
    let mapa: Mutex<HashMap<u32, u32>> = Mutex::new(HashMap::new());

    let inicio = Instant::now();
    ids_de_celda.par_iter().for_each(|&celda| {
        let mut mapa = mapa.lock().unwrap();
        *mapa.entry(celda).or_insert(0) += 1;
    });
    println!("paralelo con Mutex<HashMap>: {:?}", inicio.elapsed());

    let inicio = Instant::now();
    let mut mapa_secuencial: HashMap<u32, u32> = HashMap::new();
    for &celda in &ids_de_celda {
        *mapa_secuencial.entry(celda).or_insert(0) += 1;
    }
    println!("secuencial (sin Mutex):      {:?}", inicio.elapsed());
}
```

```text
paralelo con Mutex<HashMap>: 29.881833ms
secuencial (sin Mutex):      841.563µs
```

Otra vez, el paralelo pierde — **~35 veces más lento**. Cada hilo tiene que esperar su turno para tomar el `Mutex` antes de escribir, así que en la práctica el trabajo se vuelve *serializado* (uno a la vez) de todas formas, pero ahora con el costo adicional de adquirir y liberar el lock 100.000 veces, más la contención de varios hilos compitiendo por el mismo lock simultáneamente. Este es exactamente el patrón "irregular" que la ruta de aprendizaje de este libro distingue del paralelismo "*fearless*": cuando el trabajo comparte estado mutable, la sincronización (`Mutex`, o alternativas más finas como *sharding* del mapa en varios `Mutex` más pequeños, o agregación local por hilo seguida de un merge final) tiene un costo real que hay que medir, no asumir que "vale la pena" solo porque el trabajo se ejecuta en paralelo.

## Ejercicios

**Ejercicio 1 — Convertir un `.iter()` a `.par_iter()` y medir *speedup*.**
Genera al menos 10.000 geometrías (`Polygon` o `LineString`, con la técnica determinista que ya usas en el libro) y calcula un valor agregado costoso por elemento (por ejemplo, `geodesic_area_unsigned` del Capítulo 3.3, o una simplificación con `simplify_vw`). Mide el tiempo con `.iter()` y con `.par_iter()`, e imprime la proporción de mejora.

*Criterio de éxito:* tu programa imprime ambos tiempos y confirma con `assert!` que el resultado agregado (la suma total, por ejemplo) es idéntico en ambas versiones — la paralelización no debe cambiar el resultado, solo el tiempo.

**Ejercicio 2 — Identificar un caso donde paralelizar no ayuda.**
Repite el experimento de la sección "Cuándo `.par_iter()` no ayuda" con tu propio umbral: encuentra, por tanteo, aproximadamente a partir de qué tamaño de colección `.par_iter()` empieza a ganarle a `.iter()` para una operación tan barata como `x * 2.0`. Prueba con `N` en `10`, `100`, `1.000`, `10.000`, `100.000` y reporta en qué punto cruzan las curvas en tu máquina.

*Criterio de éxito:* una tabla impresa con los cinco tamaños y ambos tiempos, más una conclusión escrita de una frase identificando el rango aproximado de `N` donde paralelizar deja de ser contraproducente en tu máquina — el número exacto no importa (depende del hardware), sí que hayas medido en vez de asumido.

**Ejercicio 3 — Reproyección batch paralela.**
Reproduce el experimento completo de la sección de `proj` de este capítulo con tus propios datos (un millón de puntos generados deterministamente), incluyendo el contador de invocaciones de `map_init` para confirmar con tus propios ojos que no es "una vez por hilo". Luego implementa y mide la versión correcta con `par_chunks`.

*Criterio de éxito:* tu programa imprime los tres tiempos (secuencial, `map_init` ingenuo, `par_chunks` correcto) y el conteo real de invocaciones del inicializador en la versión ingenua, con un `assert!` confirmando que ese conteo es mayor que `rayon::current_num_threads()`.

**Ejercicio 4 — Detectar un patrón irregular que requiere `Mutex`.**
Reproduce el experimento de conteo por celda del capítulo con tus propios datos, y luego intenta una alternativa sin `Mutex`: usa `.par_iter().fold(...).reduce(...)` de `rayon` (agregación local por hilo en un `HashMap` propio, combinados al final) en vez de un `Mutex<HashMap>` compartido. Mide si esa alternativa es más rápida que la versión con `Mutex`.

*Criterio de éxito:* tu programa imprime los tiempos de las tres versiones (secuencial, `Mutex` compartido, `fold`/`reduce` local) y confirma con `assert_eq!` que las tres producen el mismo conteo final por celda — la técnica de sincronización no debe cambiar el resultado.

> Esta técnica es la que usa la sección `POST /features/reproject/batch` del proyecto GeoAPI v0.4 (Capítulo 5.7) — ver la historia de usuario ahí.
