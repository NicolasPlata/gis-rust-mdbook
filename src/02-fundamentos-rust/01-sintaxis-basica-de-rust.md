# 2.1 Sintaxis básica de Rust

Este capítulo existe por una razón concreta: el resto del libro va a usar, desde la primera línea de código del Capítulo 2.2, cosas como `struct`, `fn`, `let`, `for` y `match` sin volver a explicar qué son — las da por conocidas. Si nunca has escrito Rust, este es el capítulo que te pone al día con ese vocabulario mínimo. Si ya conoces otro lenguaje con sintaxis en forma de C (JavaScript, Java, Go, C++), vas a reconocer casi todo enseguida; lo que cambia es más sutil de lo que parece, así que igual vale la pena leerlo completo.

No hay nada específico de GIS todavía — eso empieza en el Capítulo 2.2 y no para hasta el final del libro. Aquí solo construimos el vocabulario para leer y escribir Rust.

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

Vas a ver esta distinción (`let` vs. `let mut`) constantemente a partir del Capítulo 2.2 — es la primera pieza del sistema que hace a Rust seguro en memoria sin recolector de basura.

## Tipos primitivos

Rust es de **tipado estático**: el tipo de cada valor se conoce en tiempo de compilación, casi siempre sin que tengas que escribirlo tú mismo (el compilador lo infiere). Los tipos que vas a ver constantemente en este libro:

- **Enteros:** `i32` (el entero con signo por defecto), `u32` (sin signo), `usize` (el tipo que usa Rust para tamaños e índices — el que devuelve `.len()` sobre una lista).
- **Punto flotante:** `f64` — el tipo que va a representar prácticamente toda coordenada geográfica en este libro. `f32` existe pero casi nunca lo vas a necesitar aquí.
- **Booleano:** `bool`, con los valores `true`/`false`.
- **Texto:** dos tipos distintos, y la diferencia importa. `&str` es una vista de solo lectura sobre texto que ya existe en algún lado (por ejemplo, un literal como `"Bogotá"`); `String` es texto que tú posees y puedes hacer crecer. Por ahora, basta con reconocer ambos cuando los veas — el porqué exacto de tener dos tipos de texto distintos es, de hecho, una consecuencia directa de *ownership*, el tema completo del Capítulo 2.2.

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

*(No te detengas todavía en el `'static` de `&'static str` — es una anotación de *lifetime*, el tema completo del Capítulo 2.2; por ahora basta con leerlo como "una cadena de texto".)*

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

`Vec<T>` es la lista de tamaño variable de Rust — la vas a usar para casi cualquier colección de coordenadas en este libro (`Vec<f64>`, y más adelante `Vec<Coord>`). `vec![...]` es una macro que construye un `Vec` con los valores que le des. Fíjate en el `&latitudes` del segundo `for`: itera *prestando* cada elemento en vez de consumir la lista — el porqué exacto de esa distinción es, otra vez, el tema del Capítulo 2.2.

## `struct`: agrupar datos relacionados

Un `struct` agrupa varios valores con nombre bajo un solo tipo — es la forma en que vas a modelar prácticamente todo dato de dominio en este libro, empezando por una coordenada:

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

fn main() {
    let bogota = Coord { lat: 4.7110, lon: -74.0721 };
    println!("lat={}, lon={}", bogota.lat, bogota.lon);
}
```

Puedes añadirle comportamiento a un `struct` con un bloque `impl` (de *implementation*), que define funciones asociadas a ese tipo — llamadas **métodos** cuando su primer parámetro es `self` (el propio valor):

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

impl Coord {
    // `&self` significa "este método solo necesita leer el valor, no
    // tomar posesión de él" — otra idea que el Capítulo 2.2 explica a fondo.
    fn es_valida(&self) -> bool {
        self.lat >= -90.0 && self.lat <= 90.0 && self.lon >= -180.0 && self.lon <= 180.0
    }
}

fn main() {
    let bogota = Coord { lat: 4.7110, lon: -74.0721 };
    println!("¿Bogotá es válida? {}", bogota.es_valida());

    let invalida = Coord { lat: 200.0, lon: 0.0 };
    println!("¿Es válida? {}", invalida.es_valida());
}
```

Vas a ver exactamente este patrón —un `struct Coord` con un método `es_valida`— reaparecer, ya con manejo de errores real, en el proyecto de cierre de este módulo.

## `enum` y `match`: representar "una de varias posibilidades"

Un `enum` (enumeración) declara un tipo que solo puede ser **una** de un conjunto fijo de variantes. A diferencia de un `struct` (que agrupa varios valores *a la vez*), un `enum` representa una elección entre alternativas:

```rust
enum FuenteDatos {
    Csv,
    GeoJson,
    Shapefile,
}

fn describir(fuente: &FuenteDatos) -> &'static str {
    match fuente {
        FuenteDatos::Csv => "archivo de texto separado por comas",
        FuenteDatos::GeoJson => "JSON con geometrías",
        FuenteDatos::Shapefile => "formato binario legado de Esri",
    }
}

fn main() {
    println!("{}", describir(&FuenteDatos::Csv));
    println!("{}", describir(&FuenteDatos::GeoJson));
}
```

`match` compara un valor contra cada variante posible, en orden, y ejecuta la primera rama que coincide — como un `switch` de otros lenguajes, pero con una diferencia importante: **el compilador exige que cubras todas las variantes posibles.** Si añadieras una cuarta variante a `FuenteDatos` y olvidaras añadir su rama en `describir`, el programa **no compilaría** — no hay forma de que un caso se te escape silenciosamente en tiempo de ejecución, como sí puede pasar con un `switch` sin `default` en otros lenguajes.

Esta combinación —`enum` más `match` exhaustivo— es, con diferencia, la herramienta que más vas a usar en el resto del libro. `Option<T>` y `Result<T, E>`, los dos tipos alrededor de los que gira todo el manejo de errores de Rust (Capítulo 2.3), no son más que `enum` con esta misma forma.

## Comentarios y `println!`

Un comentario de línea empieza con `//` y el compilador lo ignora por completo:

```rust
fn main() {
    // Esto es un comentario -- no afecta el programa en absoluto.
    let x = 5; // también puede ir al final de una línea
    println!("{x}");
}
```

`println!` (con el `!` — es una **macro**, no una función; por ahora basta con saber que se escribe igual pero el `!` es obligatorio) imprime texto a la terminal. Dentro de la cadena, `{}` se reemplaza por un valor, en el mismo orden en que los pases después de la coma; o, más cómodo, `{nombre_variable}` interpola directamente una variable con ese nombre — la forma que vas a ver más en este libro:

```rust
fn main() {
    let lat = 4.7110;
    let lon = -74.0721;

    println!("{} , {}", lat, lon);      // por posición
    println!("{lat} , {lon}");          // por nombre -- más legible, se usa más en este libro
    println!("{lat:.2} , {lon:.2}");    // con formato: 2 decimales
}
```

## Lo que sigue

Con este vocabulario ya puedes leer cualquier bloque de código de este libro sin tropezar con la sintaxis en sí. Lo que todavía falta —y es, de lejos, la parte más distintiva de Rust— es entender **qué reglas verifica el compilador sobre ese código antes de dejarlo correr**: quién es dueño de cada valor, cuándo se libera su memoria, y por qué eso le importa a un servidor que procesa geometrías de miles de vértices por segundo. Esa es la pregunta del próximo capítulo.

## Ejercicios

**Ejercicio 1 — Validar un rango con `if`/`else`.**
Escribe una función `fn clasificar_altitud(metros: f64) -> &'static str` que devuelva `"bajo"` si `metros < 500.0`, `"medio"` si está entre `500.0` y `2500.0` (ambos inclusive), y `"alto"` si `metros > 2500.0`. Pruébala con al menos tres valores distintos, uno por categoría, impresos con `println!`.

*Criterio de éxito:* `cargo run` imprime las tres clasificaciones correctas para tres valores de prueba que tú elijas (por ejemplo, `100.0`, `1500.0` y `3000.0`).

**Ejercicio 2 — Un `struct` con un método.**
Define `struct Ciudad { nombre: String, poblacion: u32 }` y un método `impl Ciudad { fn es_grande(&self) -> bool { ... } }` que devuelva `true` si `poblacion` supera 1.000.000. Crea al menos dos instancias (una grande, una pequeña) y confirma con `println!` el resultado de `es_grande()` en ambas.

*Criterio de éxito:* `cargo run` imprime `true` para la ciudad con población mayor a 1.000.000 y `false` para la otra.

**Ejercicio 3 — `enum` con `match` exhaustivo.**
Define un `enum TipoGeometria` con tres variantes: `Punto`, `Linea`, `Poligono`. Escribe una función `fn numero_minimo_de_puntos(t: &TipoGeometria) -> u32` que devuelva, vía `match`, el número mínimo de puntos que necesita cada tipo para ser válido (`1` para `Punto`, `2` para `Linea`, `4` para `Poligono` — un anillo cerrado con al menos 3 vértices distintos más el punto de cierre repetido, como vas a ver en el Capítulo 3.1). Prueba las tres variantes.

<details>
<summary>Pista</summary>

Si el compilador se queja de que tu `match` "no es exhaustivo" (*non-exhaustive*), significa que olvidaste una rama para alguna variante del `enum` — es exactamente la garantía de la que habla este capítulo, funcionando como se espera.

</details>

*Criterio de éxito:* `cargo run` imprime `1`, `2` y `4` para `Punto`, `Linea` y `Poligono` respectivamente, y el programa compila sin advertencias sobre el `match`.

**Ejercicio 4 — Formatear coordenadas.**
Dada una lista `let coordenadas = vec![(4.7110, -74.0721), (6.2518, -75.5636)];` (una lista de tuplas `(f64, f64)`), recórrela con un `for` y, para cada par `(lat, lon)`, imprime una línea con el formato `lat=4.71, lon=-74.07` (2 decimales, usando `{lat:.2}` como en el capítulo).

*Criterio de éxito:* `cargo run` imprime exactamente dos líneas, cada una con la latitud y longitud correspondientes redondeadas a 2 decimales.

> Vas a reconocer `struct Coord` y su método de validación —los del Ejercicio 2 y de la sección de `struct` de este capítulo— en el Checkpoint 1 del proyecto GeoAPI v0.1 (Capítulo 2.5), ya con manejo de errores real en vez de un simple `bool`.
