# 2.2 Sintaxis básica de Rust II — agrupar y representar datos

El capítulo anterior te dio vocabulario para escribir lógica: valores, funciones, condicionales, bucles. Ese vocabulario alcanza para programas de una sola pieza de dato a la vez. En cuanto una geometría deja de ser un único número y pasa a ser "una latitud y una longitud juntas", o "una de tres formas posibles de fuente de datos", necesitas una forma de agrupar y representar esa estructura — y de eso trata este capítulo.

Seguimos sin tocar nada específico de GIS todavía; eso empieza en el Capítulo 2.3. Lo que sí vas a ver aquí es `struct Coord { lat, lon }`, la forma exacta en la que este libro va a representar una coordenada de principio a fin.

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
    // tomar posesión de él" — otra idea que el Capítulo 2.3 explica a fondo.
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

## Tuplas: agrupar sin nombrar campos

Un `struct` le pone nombre a cada campo (`lat`, `lon`). A veces eso es más ceremonia de la que necesitas para un par de valores de uso puntual — para eso existe la **tupla**: varios valores agrupados por posición, sin declarar ningún tipo nuevo:

```rust
fn main() {
    let bogota: (f64, f64) = (4.7110, -74.0721);

    // Acceso por posición, con `.0` y `.1`:
    println!("lat={}, lon={}", bogota.0, bogota.1);

    // O "desestructurando" la tupla en variables con nombre de una vez:
    let (lat, lon) = bogota;
    println!("lat={lat}, lon={lon}");
}
```

Esa misma desestructuración funciona directamente en un patrón de `for`, algo que vas a usar constantemente cuando trabajes con listas de pares de coordenadas:

```rust
fn main() {
    let coordenadas = vec![(4.7110, -74.0721), (6.2518, -75.5636)];

    for (lat, lon) in &coordenadas {
        println!("lat={lat:.2}, lon={lon:.2}");
    }
}
```

¿Cuándo tupla y cuándo `struct`? La regla práctica que vas a ver aplicada en este libro: una tupla sirve para un agrupamiento *ad hoc*, de vida corta, donde el orden ya es obvio por contexto (un par `(lat, lon)` que solo vive dentro de una función). En cuanto ese par empieza a viajar por el programa —como parámetro de varias funciones, como campo de otro tipo, como algo que quieres validar— pasa a merecer un `struct` con nombres explícitos, como `Coord`. `geo-types`, el crate que vas a usar desde el Capítulo 3.1 en adelante, sigue exactamente este criterio: sus tipos geométricos son `struct`s, no tuplas.

## Slices: una vista sobre una colección, sin poseerla

Ya conoces `Vec<T>`, la lista de tamaño variable que posee sus elementos y puede crecer o encogerse. Un **slice**, escrito `&[T]`, es distinto: es una *vista* de solo lectura sobre una secuencia de valores `T` contigua en memoria — puede ser un `Vec` completo, una parte de un `Vec`, o un array de tamaño fijo. Un slice nunca posee esos valores, solo los presta (por eso siempre aparece detrás de un `&`, tal como viste con las referencias en el capítulo anterior).

```rust
fn promedio_latitud(coords: &[(f64, f64)]) -> f64 {
    let suma: f64 = coords.iter().map(|(lat, _)| lat).sum();
    suma / coords.len() as f64
}

fn main() {
    let ruta: Vec<(f64, f64)> = vec![(4.71, -74.07), (6.25, -75.56), (3.45, -76.53)];

    // Pasando el `Vec` completo: Rust lo convierte a `&[(f64, f64)]` automáticamente.
    println!("{:.2}", promedio_latitud(&ruta));

    // Pasando solo una porción — esto es un slice de verdad, no todo el `Vec`.
    println!("{:.2}", promedio_latitud(&ruta[0..2]));
}
```

*(No te detengas en `.iter().map(...).sum()` — es la forma idiomática de recorrer una colección con iteradores, el tema completo del Capítulo 2.5. Aquí solo importa que `promedio_latitud` recibe un slice.)*

La razón práctica para preferir `&[T]` sobre `&Vec<T>` como parámetro de función —algo que vas a ver constantemente en `geo` y en el resto del ecosistema GeoRust— es la flexibilidad del ejemplo de arriba: una función que pide `&[T]` acepta tanto un `Vec` completo como una porción parcial de él, sin que el llamador tenga que copiar nada. Una función que pidiera `&Vec<T>` a secas solo aceptaría lo primero.

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

Esta combinación —`enum` más `match` exhaustivo— es, con diferencia, la herramienta que más vas a usar en el resto del libro. `Option<T>` y `Result<T, E>`, los dos tipos alrededor de los que gira todo el manejo de errores de Rust (Capítulo 2.4), no son más que `enum` con esta misma forma.

## Dereferencia: `*` para "el valor al que apunta esta referencia"

En el capítulo anterior viste que `&valor` crea una referencia — un préstamo que apunta a un valor sin poseerlo. La operación inversa es la **dereferencia**, con `*`: dado `referencia: &T`, `*referencia` es el `T` al que apunta.

```rust
fn main() {
    let valor = 42;
    let referencia: &i32 = &valor;

    println!("La referencia es: {referencia}"); // `println!` desreferencia por ti, como comodidad
    println!("El valor real es: {}", *referencia); // dereferencia explícita

    assert_eq!(*referencia, 42);
}
```

Si `println!` y la mayoría de operadores desreferencian solos por comodidad, ¿cuándo necesitas escribir `*` a mano? El caso más común en este libro aparece al iterar sobre un slice de referencias, donde cada elemento que te entrega el `for` ya viene con una capa extra de `&`:

```rust
fn contiene(valores: &[&str], objetivo: &str) -> bool {
    for v in valores {
        // Aquí `v` tiene tipo `&&str`: una referencia (la que da el `for` al
        // recorrer el slice) sobre un `&str` (el que ya vivía dentro del slice).
        // Para comparar con `objetivo`, que es un `&str` simple, hace falta
        // quitar esa capa extra con `*`.
        if *v == objetivo {
            return true;
        }
    }
    false
}

fn main() {
    let formatos = ["csv", "geojson", "shapefile"];
    println!("{}", contiene(&formatos, "geojson"));
    println!("{}", contiene(&formatos, "kml"));
}
```

Vas a encontrarte con este mismo patrón —una comparación que no compila hasta que añades un `*`— más de una vez en capítulos siguientes. Cuando lo veas, la pregunta que te va a resolver el problema es siempre la misma: *"¿cuántas capas de `&` tiene el tipo de este valor, y necesito quitar alguna para comparar o usar lo de adentro?"*

## Atributos y `#[derive(Debug)]`

Un **atributo** es una anotación que le das al compilador sobre un fragmento de código, escrita entre `#[` y `]`, siempre justo antes de aquello a lo que aplica. `derive` es uno de los atributos que más vas a usar: le pide al compilador que **genere automáticamente** una implementación estándar de algo, en vez de que la escribas tú a mano.

El caso más frecuente en este libro es `#[derive(Debug)]` sobre un `struct` o un `enum`, que genera una forma de imprimir el valor completo pensada para depuración, activando el especificador de formato `{:?}` (contra el `{}` que ya conoces, pensado para salida "bonita" orientada al usuario final — y que, de hecho, no funciona sobre tus propios tipos a menos que tú mismo implementes esa lógica, algo fuera del alcance de este capítulo):

```rust
#[derive(Debug)]
struct Coord {
    lat: f64,
    lon: f64,
}

fn main() {
    let bogota = Coord { lat: 4.7110, lon: -74.0721 };

    println!("{:?}", bogota);  // Coord { lat: 4.711, lon: -74.0721 }
    println!("{bogota:?}");    // misma idea, interpolando el nombre de la variable
}
```

Sin el `#[derive(Debug)]`, ese `println!` ni siquiera compila — el compilador te lo dice explícitamente con un mensaje del estilo `Coord doesn't implement Debug`. Vas a poner este atributo casi por reflejo sobre cada `struct`/`enum` nuevo que definas de aquí en adelante, sobre todo en tests y mensajes de error, donde poder imprimir un valor completo de un vistazo ahorra muchísimo tiempo de depuración.

## Comentarios y `println!`

Un comentario de línea empieza con `//` y el compilador lo ignora por completo:

```rust
fn main() {
    // Esto es un comentario -- no afecta el programa en absoluto.
    let x = 5; // también puede ir al final de una línea
    println!("{x}");
}
```

`println!` (con el `!` — es una **macro**, no una función; por ahora basta con saber que se escribe igual pero el `!` es obligatorio) imprime texto a la terminal. Dentro de la cadena, `{}` se reemplaza por un valor, en el mismo orden en que los pases después de la coma; o, más cómodo, `{nombre_variable}` interpola directamente una variable con ese nombre — la forma que vas a ver más en este libro. Ahora que ya conoces `#[derive(Debug)]`, tienes un tercer formato disponible, `{:?}`, para imprimir un valor completo con fines de depuración:

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

**Ejercicio 1 — Un `struct` con un método.**
Define `struct Ciudad { nombre: String, poblacion: u32 }` y un método `impl Ciudad { fn es_grande(&self) -> bool { ... } }` que devuelva `true` si `poblacion` supera 1.000.000. Crea al menos dos instancias (una grande, una pequeña) y confirma con `println!` el resultado de `es_grande()` en ambas.

*Criterio de éxito:* `cargo run` imprime `true` para la ciudad con población mayor a 1.000.000 y `false` para la otra.

**Ejercicio 2 — `enum` con `match` exhaustivo.**
Define un `enum TipoGeometria` con tres variantes: `Punto`, `Linea`, `Poligono`. Escribe una función `fn numero_minimo_de_puntos(t: &TipoGeometria) -> u32` que devuelva, vía `match`, el número mínimo de puntos que necesita cada tipo para ser válido (`1` para `Punto`, `2` para `Linea`, `4` para `Poligono` — un anillo cerrado con al menos 3 vértices distintos más el punto de cierre repetido, como vas a ver en el Capítulo 3.1). Prueba las tres variantes.

<details>
<summary>Pista</summary>

Si el compilador se queja de que tu `match` "no es exhaustivo" (*non-exhaustive*), significa que olvidaste una rama para alguna variante del `enum` — es exactamente la garantía de la que habla este capítulo, funcionando como se espera.

</details>

*Criterio de éxito:* `cargo run` imprime `1`, `2` y `4` para `Punto`, `Linea` y `Poligono` respectivamente, y el programa compila sin advertencias sobre el `match`.

**Ejercicio 3 — Formatear coordenadas con tuplas.**
Dada una lista `let coordenadas = vec![(4.7110, -74.0721), (6.2518, -75.5636)];` (una lista de tuplas `(f64, f64)`), recórrela con un `for` desestructurando cada tupla y, para cada par `(lat, lon)`, imprime una línea con el formato `lat=4.71, lon=-74.07` (2 decimales, usando `{lat:.2}` como en el capítulo).

*Criterio de éxito:* `cargo run` imprime exactamente dos líneas, cada una con la latitud y longitud correspondientes redondeadas a 2 decimales.

**Ejercicio 4 — Depurar con `#[derive(Debug)]`.**
Añade `#[derive(Debug)]` al `struct Ciudad` del Ejercicio 1 e imprime una instancia completa con `{:?}` en una sola línea, sin escribir tú mismo el formato de cada campo por separado.

*Criterio de éxito:* `cargo run` imprime una línea con la forma `Ciudad { nombre: "...", poblacion: ... }` (el orden y formato exactos los decide el compilador; no necesitas que coincida carácter por carácter con este ejemplo).

> Vas a reconocer `struct Coord` y su método de validación —del Ejercicio 1 y de la sección de `struct` de este capítulo— en el Checkpoint 1 del proyecto GeoAPI v0.1 (Capítulo 2.6), ya con manejo de errores real en vez de un simple `bool`.
