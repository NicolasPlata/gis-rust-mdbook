# 2.1 Sintaxis básica de Rust I — variables, tipos y control de flujo

Este capítulo, junto con el siguiente, existe por una razón concreta: el resto del libro va a usar, desde la primera línea de código del Capítulo 2.3, cosas como `let`, `fn`, `if`, `for` y tipos como `f64` sin volver a explicarlas — las da por conocidas. Si nunca has escrito Rust, estos dos capítulos te ponen al día con ese vocabulario mínimo. Si ya conoces otro lenguaje con sintaxis en forma de C (JavaScript, Java, Go, C++), vas a reconocer casi todo enseguida; lo que cambia es más sutil de lo que parece, así que igual vale la pena leerlo completo.

No hay nada específico de GIS todavía — eso empieza en el Capítulo 2.3 y no para hasta el final del libro. Aquí solo construimos el vocabulario para leer y escribir Rust: en este capítulo, valores y control de flujo; en el siguiente, cómo agrupar datos con `struct`, `enum` y tuplas.

## Variables y mutabilidad

Una variable se declara con `let`. A diferencia de casi cualquier otro lenguaje que hayas usado, **una variable de Rust es inmutable por defecto**:

```rust
fn main() {
    let latitud = 4.7110;
    println!("Latitud: {latitud}");

    // latitud = 4.60; // ERROR: no se puede asignar dos veces a una variable inmutable
}
```

Esto no es una limitación, es una decisión deliberada: en un programa grande, saber que un valor *no puede cambiar* después de declararse es información valiosa — elimina de un vistazo una categoría entera de bugs donde un valor cambia "por sorpresa" en algún punto lejano del código. Cuando de verdad necesitas que una variable cambie de valor, lo pides explícitamente con `mut`:

```rust
fn main() {
    let mut altura_actual = 0.0;
    println!("Altura inicial: {altura_actual}");

    altura_actual = 2640.0;
    println!("Altura actualizada: {altura_actual}");
}
```

Vas a ver esta distinción (`let` vs. `let mut`) constantemente a partir del Capítulo 2.3 — es la primera pieza del sistema que hace a Rust seguro en memoria sin recolector de basura.

## Tipos primitivos

Rust es de **tipado estático**: el tipo de cada valor se conoce en tiempo de compilación, casi siempre sin que tengas que escribirlo tú mismo (el compilador lo infiere). Los tipos que vas a ver constantemente en este libro:

- **Enteros:** `i32` (el entero con signo por defecto), `u32` (sin signo), `usize` (el tipo que usa Rust para tamaños e índices — el que devuelve `.len()` sobre una lista).
- **Punto flotante:** `f64` — el tipo que va a representar prácticamente toda coordenada geográfica en este libro. `f32` existe pero casi nunca lo vas a necesitar aquí.
- **Booleano:** `bool`, con los valores `true`/`false`.
- **Texto:** dos tipos distintos, y la diferencia importa. `&str` es una vista de solo lectura sobre texto que ya existe en algún lado (por ejemplo, un literal como `"Bogotá"`); `String` es texto que tú posees y puedes hacer crecer. Por ahora, basta con reconocer ambos cuando los veas — el porqué exacto de tener dos tipos de texto distintos es, de hecho, una consecuencia directa de *ownership*, el tema completo del Capítulo 2.3.

```rust
fn main() {
    let zoom: u32 = 14;
    let latitud: f64 = 4.7110;
    let es_valida: bool = latitud >= -90.0 && latitud <= 90.0;
    let nombre: &str = "Bogotá";

    println!("{nombre} está en zoom {zoom}, latitud válida: {es_valida}");
}
```

## Funciones

Una función se declara con `fn`, con sus parámetros y tipos explícitos, y un tipo de retorno tras `->`:

```rust
fn en_rango_latitud(lat: f64) -> bool {
    lat >= -90.0 && lat <= 90.0
}

fn main() {
    println!("{}", en_rango_latitud(4.7110));  // true
    println!("{}", en_rango_latitud(120.0));   // false
}
```

Fíjate en que `en_rango_latitud` no tiene ningún `return`. En Rust, **la última expresión de una función es su valor de retorno**, siempre que no termine en `;`. Un `;` convierte una expresión en una sentencia que no devuelve nada — esta distinción entre expresión y sentencia es una de las cosas más particulares de la sintaxis de Rust, y se te va a aparecer también en el `if`/`else` de la siguiente sección. `return` sigue existiendo y es útil para salir antes de que termine la función, pero para el caso normal de "esto es lo que esta función calcula", la convención en Rust es omitirlo.

## Control de flujo

### `if`/`else` como expresión

Un `if`/`else` en Rust no es solo una bifurcación — es una **expresión que produce un valor**, igual que la última línea de una función:

```rust
fn clasificar_zoom(z: u32) -> &'static str {
    if z < 5 {
        "vista continental"
    } else if z < 12 {
        "vista regional"
    } else {
        "vista de calle"
    }
}

fn main() {
    println!("{}", clasificar_zoom(2));
    println!("{}", clasificar_zoom(8));
    println!("{}", clasificar_zoom(16));
}
```

*(No te detengas todavía en el `'static` de `&'static str` — es una anotación de *lifetime*, el tema completo del Capítulo 2.3; por ahora basta con leerlo como "una cadena de texto".)*

Esto significa que puedes asignar el resultado de un `if`/`else` directamente a una variable, sin declararla como `mut` ni asignarla dos veces:

```rust
fn main() {
    let zoom = 8;
    let etiqueta = if zoom < 5 { "lejos" } else { "cerca" };
    println!("{etiqueta}");
}
```

### Bucles: `loop`, `while`, `for`

`loop` repite indefinidamente hasta un `break` explícito; `while` repite mientras una condición sea verdadera; `for ... in` itera sobre una secuencia (un rango, o los elementos de una lista):

```rust
fn main() {
    // `for` sobre un rango: `0..3` genera 0, 1, 2 (el límite superior no se incluye).
    for i in 0..3 {
        println!("iteración {i}");
    }

    // `for` sobre los elementos de una lista (`Vec<T>`, ver más abajo).
    let latitudes = vec![4.71, 6.25, 3.45];
    for lat in &latitudes {
        println!("latitud: {lat}");
    }

    // `while`: repite mientras la condición sea verdadera.
    let mut contador = 0;
    while contador < 3 {
        println!("contador: {contador}");
        contador += 1;
    }
}
```

`Vec<T>` es la lista de tamaño variable de Rust — la vas a usar para casi cualquier colección de coordenadas en este libro (`Vec<f64>`, y más adelante `Vec<Coord>`). `vec![...]` es una macro que construye un `Vec` con los valores que le des. Fíjate en el `&latitudes` del segundo `for`: itera *prestando* cada elemento en vez de consumir la lista — el porqué exacto de esa distinción es el tema del Capítulo 2.3.

## Cómo leer un error del compilador

Vas a ver muchos errores de compilación en este libro — sobre todo a partir del Capítulo 2.3, cuando entre en juego el *borrow checker*. Antes de llegar ahí, vale la pena aprender a leerlos, porque un mensaje de `rustc` no es un muro: es, con diferencia, el compilador más explicativo que vas a usar en cualquier lenguaje mainstream, y está diseñado para decirte exactamente qué está mal y, casi siempre, cómo arreglarlo.

Retomemos el primer ejemplo del capítulo, pero esta vez sin el comentario que evitaba el error:

```rust,ignore
fn main() {
    let latitud = 4.7110;
    println!("Latitud: {latitud}");

    latitud = 4.60; // sin `mut` — esto no compila
    println!("Latitud: {latitud}");
}
```

Compilar esto con `rustc` (o `cargo build`) produce este mensaje, palabra por palabra:

```text
error[E0384]: cannot assign twice to immutable variable `latitud`
 --> src/main.rs:5:5
  |
2 |     let latitud = 4.7110;
  |         ------- first assignment to `latitud`
...
5 |     latitud = 4.60;
  |     ^^^^^^^^^^^^^^ cannot assign twice to immutable variable
  |
help: consider making this binding mutable
  |
2 |     let mut latitud = 4.7110;
  |         +++
```

Cada parte tiene un propósito y vale la pena aprender a ubicarla de un vistazo:

- **`error[E0384]`** — el tipo de error, con un código estable. Puedes pedirle al propio compilador una explicación más larga con `rustc --explain E0384` — funciona para cualquier código `E####` que veas en este libro o en tu propio código.
- **`--> src/main.rs:5:5`** — la ubicación exacta: archivo, línea 5, columna 5. Casi siempre lo primero que quieres mirar.
- **El fragmento de código citado, con `^^^^^`** — `rustc` no solo te dice la línea, te muestra el código real y señala con `^` el tramo exacto que causó el problema. La línea `2 | let latitud = 4.7110;` aparece también, marcada con `-------`, porque el error necesita que veas *dónde* se originó la restricción (la primera asignación) para entender por qué la segunda falla.
- **`help: ...`** — cuando el compilador puede inferir una corrección razonable, te la propone explícitamente, a veces con un diff literal (el `+++` bajo `mut` indica exactamente qué texto insertar y dónde).

La costumbre que vale la pena construir desde ya: cuando algo no compile, **lee el mensaje completo antes de tocar el código** — la tentación de cambiar algo al azar y volver a compilar es fuerte, pero casi siempre el propio error ya te dice la solución, como en este caso (`consider making this binding mutable`). Vas a apoyarte en esta misma lectura, con errores bastante más interesantes, en el Capítulo 2.3.

## Lo que sigue

Con esto ya sabes declarar valores, darles tipo, escribir funciones y controlar el flujo de un programa. Lo que todavía falta es agrupar varios valores relacionados bajo un solo tipo propio —la forma en que vas a modelar cada dato de dominio de GeoAPI, empezando por una coordenada— y esa es la pregunta del próximo capítulo.

## Ejercicios

**Ejercicio 1 — Validar un rango con `if`/`else`.**
Escribe una función `fn clasificar_altitud(metros: f64) -> &'static str` que devuelva `"bajo"` si `metros < 500.0`, `"medio"` si está entre `500.0` y `2500.0` (ambos inclusive), y `"alto"` si `metros > 2500.0`. Pruébala con al menos tres valores distintos, uno por categoría, impresos con `println!`.

*Criterio de éxito:* `cargo run` imprime las tres clasificaciones correctas para tres valores de prueba que tú elijas (por ejemplo, `100.0`, `1500.0` y `3000.0`).

**Ejercicio 2 — Sumar con un bucle.**
Escribe una función `fn suma_manual(valores: &Vec<f64>) -> f64` que sume todos los elementos de la lista usando un `for` y una variable acumuladora `mut` (todavía no uses `.sum()` ni ningún otro método de iterador — esos son el tema del Capítulo 2.5). Pruébala con `let alturas = vec![2640.0, 1495.0, 3800.0];` y confirma el resultado con `println!`.

*Criterio de éxito:* `cargo run` imprime `7935` (o `7935.0`, según cómo formatees el resultado) para la lista de ejemplo.
