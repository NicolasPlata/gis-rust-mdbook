# 2.3 Traits, genéricos e iteradores

Cierra este capítulo un tríptico de herramientas que vas a usar constantemente en cuanto empieces a usar `geo` en el Capítulo 3.1: **traits** (contratos de comportamiento), **genéricos** (código que funciona para más de un tipo), e **iteradores** (procesar secuencias sin bucles manuales propensos a errores de índice). Los tres están profundamente conectados: vas a ver por qué antes de terminar el capítulo.

## Traits: comportamiento compartido entre tipos distintos

Un `trait` declara un conjunto de métodos que un tipo promete implementar. Es el mecanismo de Rust más parecido a una interfaz en otros lenguajes, aunque —como vas a ver en el Capítulo 3.1 con el trait `Relate` de `geo`— puede llevar mucha más lógica geométrica de la que una interfaz típica cargaría.

Definamos uno mínimo: la capacidad de calcular la distancia entre dos puntos.

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

trait Distancia {
    fn distancia_a(&self, otro: &Self) -> f64;
}

impl Distancia for Coord {
    fn distancia_a(&self, otro: &Self) -> f64 {
        // Distancia euclidiana simple. No es la forma correcta de medir
        // distancias reales sobre la superficie terrestre — eso requiere
        // Haversine o Vincenty, que vas a ver en el Capítulo 3.3. Aquí
        // solo nos interesa el mecanismo del trait, no la precisión geodésica.
        let dlat = self.lat - otro.lat;
        let dlon = self.lon - otro.lon;
        (dlat * dlat + dlon * dlon).sqrt()
    }
}

fn main() {
    let bogota = Coord { lat: 4.71, lon: -74.07 };
    let medellin = Coord { lat: 6.25, lon: -75.56 };

    println!("Distancia (aprox., en grados): {:.2}", bogota.distancia_a(&medellin));
}
```

Lo importante no es el cálculo en sí — es que ahora `distancia_a` es un contrato: cualquier tipo que implemente `Distancia` puede usarse en cualquier función que solo necesite esa capacidad, sin que esa función tenga que saber si está trabajando con un `Coord`, un `PuntoUtm`, o cualquier otro tipo que definas más adelante. Esa es la idea que vas a explotar con genéricos.

## Genéricos: una función, varios tipos concretos

Fíjate en algo que dijimos en la introducción de este módulo: `geo-types` es genérico sobre el tipo numérico de sus coordenadas (`f32` o `f64`) — un `Point<f64>` no es el mismo tipo que un `Point<f32>`, pero ambos se comportan igual porque comparten el mismo código genérico. Vamos a entender por qué eso es valioso, en vez de solo repetirlo.

Imagina que escribes una función de distancia que solo acepta `f64`:

```rust,ignore
fn distancia_f64(x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt()
}
```

Si más adelante necesitas la misma lógica para coordenadas en `f32` (por ejemplo, para ahorrar memoria en un dataset de millones de puntos donde la precisión extra de `f64` no aporta nada), tendrías que copiar la función entera cambiando el tipo. Esa duplicación es exactamente lo que los genéricos evitan:

```rust
fn distancia_generica<T: Into<f64> + Copy>(x1: T, y1: T, x2: T, y2: T) -> f64 {
    let (x1, y1, x2, y2) = (x1.into(), y1.into(), x2.into(), y2.into());
    ((x2 - x1).powi(2) + (y2 - y1).powi(2)).sqrt()
}

fn main() {
    let d_f64 = distancia_generica(4.71_f64, -74.07_f64, 6.25_f64, -75.56_f64);
    let d_f32 = distancia_generica(4.71_f32, -74.07_f32, 6.25_f32, -75.56_f32);

    println!("f64: {d_f64:.4}, f32: {d_f32:.4}");
}
```

`<T: Into<f64> + Copy>` es una **cota de trait** (*trait bound*): dice "`T` puede ser cualquier tipo, siempre y cuando sepa convertirse a `f64` (`Into<f64>`) y pueda copiarse en vez de moverse (`Copy`)". `f32` y `f64` cumplen ambas condiciones, así que la misma función sirve para los dos, sin que exista una sola línea de código duplicada — y sin ningún costo en tiempo de ejecución: el compilador genera, por detrás, una versión especializada de la función para cada tipo concreto que realmente uses (esto se llama *monomorfización*). No hay despacho dinámico ni indirección de por medio: el código generado para `distancia_generica::<f64>` es tan directo como si lo hubieras escrito a mano.

Esto es exactamente la razón por la que `geo` define sus algoritmos como genéricos sobre un trait llamado `CoordFloat` (que agrupa `f32` y `f64`) en vez de escribir cada algoritmo dos veces. Cuando lo uses en el Capítulo 3.3, esta es la mecánica que hay detrás.

## Iteradores: procesar secuencias sin bucles manuales

Ya usaste `.iter()` en el capítulo anterior. Vamos a ver por qué los iteradores son la forma idiomática de procesar geometrías en Rust, en vez de bucles `for` con índices manuales.

Supón que quieres calcular la longitud total de una ruta, sumando la distancia entre cada par de puntos consecutivos. Con índices manuales:

```rust,ignore
fn longitud_con_indices(puntos: &[Coord]) -> f64 {
    let mut total = 0.0;
    for i in 0..puntos.len() - 1 { // ¡pánico si puntos.len() == 0!
        total += puntos[i].distancia_a(&puntos[i + 1]);
    }
    total
}
```

Este código tiene un bug esperando a pasar: si `puntos` está vacío, `puntos.len() - 1` desborda (`0 - 1` no existe en un entero sin signo) y el programa entra en pánico. Con iteradores, el mismo cálculo se ve así:

```rust
struct Coord { lat: f64, lon: f64 }

impl Coord {
    fn distancia_a(&self, otro: &Self) -> f64 {
        let dlat = self.lat - otro.lat;
        let dlon = self.lon - otro.lon;
        (dlat * dlat + dlon * dlon).sqrt()
    }
}

fn longitud_total(puntos: &[Coord]) -> f64 {
    puntos
        .windows(2) // produce parejas consecutivas: [p0,p1], [p1,p2], ...
        .map(|par| par[0].distancia_a(&par[1]))
        .sum()
}

fn main() {
    let ruta = vec![
        Coord { lat: 4.71, lon: -74.07 },
        Coord { lat: 5.0, lon: -74.5 },
        Coord { lat: 6.25, lon: -75.56 },
    ];

    println!("Longitud total: {:.4}", longitud_total(&ruta));

    let vacia: Vec<Coord> = vec![];
    println!("Ruta vacía: {:.4}", longitud_total(&vacia)); // no hay pánico: da 0.0
}
```

`.windows(2)` genera automáticamente cada pareja consecutiva sin que tengas que calcular índices a mano — y sobre una lista vacía o de un solo punto, simplemente no genera ninguna pareja, así que `.sum()` devuelve `0.0` sin que nada explote. `.map()` transforma cada pareja en una distancia, y `.sum()` las acumula. No hay un índice fuera de rango posible porque nunca escribiste un índice.

Esta cadena de `.windows().map().sum()` no es solo más segura que el bucle manual — también es lo que se llama una **abstracción de costo cero**: el compilador la reduce, en código máquina, a esencialmente el mismo bucle optimizado que escribirías a mano. No estás pagando rendimiento por la claridad. Esa combinación —expresividad al nivel de un lenguaje de alto nivel, rendimiento al nivel de C— es la que vas a explotar de forma mucho más agresiva en el Capítulo 5.1, cuando conviertas estas mismas cadenas de iteradores en paralelas con `rayon` cambiando `.iter()` por `.par_iter()` casi sin tocar el resto del código.

## Ejercicios

**Ejercicio 1 — Implementar un trait para dos tipos distintos.**
Define un trait `Etiquetable` con un método `fn etiqueta(&self) -> String`. Impleméntalo para `Coord` (que devuelva algo como `"(4.71, -74.07)"`) y para una nueva `struct Ciudad { nombre: String, coord: Coord }` (que devuelva el nombre de la ciudad). Escribe una función `fn imprimir_etiqueta(item: &impl Etiquetable)` que reciba cualquier tipo que implemente el trait y la use con ambos tipos.

*Criterio de éxito:* `cargo run` imprime la etiqueta correcta para una instancia de `Coord` y para una de `Ciudad`, usando la misma función `imprimir_etiqueta`.

**Ejercicio 2 — Escribir una función genérica con una cota de trait.**
Escribe `fn punto_medio<T: Into<f64> + Copy>(a: T, b: T) -> f64` que devuelva el promedio de dos valores, y verifica que compila y funciona tanto con argumentos `f32` como `f64` en el mismo `main`.

*Criterio de éxito:* `cargo run` imprime el punto medio correcto para una llamada con `f32` y otra con `f64`, sin que existan dos versiones distintas de la función en tu código.

**Ejercicio 3 — Reemplazar un bucle manual por una cadena de iteradores.**
Se te da esta función que cuenta cuántos puntos de una ruta están al norte del ecuador, con un bucle manual:

```rust,ignore
fn contar_norte(puntos: &[Coord]) -> usize {
    let mut contador = 0;
    for i in 0..puntos.len() {
        if puntos[i].lat > 0.0 {
            contador += 1;
        }
    }
    contador
}
```

Reescríbela usando `.iter().filter(...).count()`, sin ningún índice manual ni variable mutable.

*Criterio de éxito:* ambas versiones (la original y la tuya) dan el mismo resultado sobre una ruta de prueba con puntos en ambos hemisferios, verificado con un `assert_eq!` en un test.

**Ejercicio 4 — Integrador: de strings crudos a longitud total, con manejo de errores.**
Combina lo aprendido en este capítulo y en el 2.2: escribe una función

```rust,ignore
fn procesar_ruta(filas: &[(&str, &str)]) -> Result<f64, ErrorParseoCoord>
```

que reciba pares de strings lat/lon (como filas de un CSV), los convierta a `Coord` reutilizando el `parsear_coord` del Capítulo 2.2 (usando `?` para propagar el primer error de parseo que aparezca), y luego calcule la longitud total de la ruta resultante usando la técnica de iteradores de este capítulo (`.windows(2).map(...).sum()`). No debe haber ningún `unwrap()` ni bucle con índices manuales en tu solución.

*Criterio de éxito:* sobre una lista de filas válidas, `procesar_ruta` devuelve `Ok` con la longitud correcta (verificable con un test que compare contra un valor calculado a mano); sobre una lista donde una fila tiene una coordenada fuera de rango, devuelve `Err` con la variante correcta de `ErrorParseoCoord`, sin que el programa entre en pánico. Este ejercicio es, en esencia, el corazón del proyecto GeoAPI v0.1 que construyes en el siguiente capítulo — resolverlo aquí te va a dejar ese capítulo mucho más claro.
