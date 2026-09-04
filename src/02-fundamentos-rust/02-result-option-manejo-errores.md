# 2.2 `Result`, `Option` y manejo de errores sin pánico

Un endpoint de GeoAPI va a recibir, tarde o temprano, datos rotos: un CSV con una columna de latitud vacía, una coordenada de `95°` (fuera del rango válido de `-90` a `90`), un parámetro `crs=` que no existe. La pregunta que este capítulo responde es: **¿qué hace tu programa cuando eso pasa?**

En muchos lenguajes, la respuesta es "lanzar una excepción" y confiar en que alguien, en algún punto de la pila de llamadas, la atrape. Rust toma una postura distinta y mucho más explícita: **una función que puede fallar lo declara en su tipo de retorno**, y el compilador te obliga a lidiar con esa posibilidad antes de dejarte compilar el programa. No hay excepciones que se te puedan escapar sin que te enteres — solo valores que representan "esto puede haber salido mal", y que tienes que abrir para usar lo que hay adentro.

## `Option<T>`: representar la ausencia de un valor

Antes de hablar de errores, hablemos de algo más simple: la ausencia de un valor. Si buscas un campo `"elevacion"` en un GeoJSON y no todos los features lo traen, no tienes un error — simplemente no hay dato. Para eso existe `Option<T>`:

```rust
fn buscar_elevacion(propiedades: &[(&str, f64)], clave: &str) -> Option<f64> {
    for (k, v) in propiedades {
        if *k == clave {
            return Some(*v);
        }
    }
    None
}

fn main() {
    let props = [("nombre_valor", 10.0), ("elevacion", 2640.0)];

    match buscar_elevacion(&props, "elevacion") {
        Some(e) => println!("Elevación: {e} m"),
        None => println!("Sin dato de elevación"),
    }

    match buscar_elevacion(&props, "poblacion") {
        Some(p) => println!("Población: {p}"),
        None => println!("Sin dato de población"),
    }
}
```

`Option<T>` tiene exactamente dos variantes: `Some(valor)` o `None`. No existe un tercer estado oculto como `null` que se te cuele donde no lo esperabas — si una función devuelve `Option<f64>`, el compilador te obliga a manejar ambos casos antes de poder usar el `f64` de adentro. Esto elimina, en tiempo de compilación, la categoría de bug más común en casi cualquier otro lenguaje: el `NullPointerException` (o su equivalente).

## `Result<T, E>`: representar éxito o fallo, con motivo

`Option` te dice *si* hay un valor. `Result<T, E>` te dice si una operación tuvo éxito (`Ok(T)`) o falló (`Err(E)`) — y, a diferencia de `Option`, el caso de fallo lleva información sobre *qué* salió mal.

Vamos a modelar la validación de una coordenada, el mismo problema que vas a resolver de verdad en el proyecto de cierre de este módulo:

```rust
#[derive(Debug)]
struct Coord {
    lat: f64,
    lon: f64,
}

#[derive(Debug)]
enum ErrorCoord {
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

fn validar_coord(lat: f64, lon: f64) -> Result<Coord, ErrorCoord> {
    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorCoord::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorCoord::LongitudFueraDeRango(lon));
    }
    Ok(Coord { lat, lon })
}

fn main() {
    match validar_coord(4.71, -74.07) {
        Ok(c) => println!("Coordenada válida: {c:?}"),
        Err(e) => println!("Coordenada inválida: {e:?}"),
    }

    match validar_coord(95.0, -74.07) {
        Ok(c) => println!("Coordenada válida: {c:?}"),
        Err(e) => println!("Coordenada inválida: {e:?}"),
    }
}
```

Fíjate en `enum ErrorCoord`: no es un `String` genérico con un mensaje ("latitud inválida"), es un tipo con variantes específicas, cada una con el dato que causó el problema. Esto importa mucho para una API: cuando en el Capítulo 6.1 conectes esto a Axum, vas a poder hacer un `match` sobre `ErrorCoord` y decidir, por variante, qué código HTTP devolver — un `400 Bad Request` con un mensaje específico, no un `500 Internal Server Error` genérico que no le dice nada útil a quien hizo la petición. Modelar el error como un tipo, no como texto libre, es lo que hace posible esa traducción.

## El operador `?`: propagar errores sin anidar `match`

Validar una sola coordenada está bien con un `match`. Pero un `Feature` GeoJSON real puede necesitar encadenar varias operaciones que pueden fallar: parsear el string de latitud a `f64`, parsear el de longitud, y luego validar el rango de ambas. Anidar un `match` dentro de otro se vuelve ilegible rápido. El operador `?` resuelve esto:

```rust
#[derive(Debug)]
struct Coord {
    lat: f64,
    lon: f64,
}

#[derive(Debug)]
enum ErrorParseoCoord {
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

fn parsear_coord(lat_str: &str, lon_str: &str) -> Result<Coord, ErrorParseoCoord> {
    let lat: f64 = lat_str
        .trim()
        .parse()
        .map_err(|_| ErrorParseoCoord::LatitudNoNumerica)?;

    let lon: f64 = lon_str
        .trim()
        .parse()
        .map_err(|_| ErrorParseoCoord::LongitudNoNumerica)?;

    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorParseoCoord::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorParseoCoord::LongitudFueraDeRango(lon));
    }

    Ok(Coord { lat, lon })
}

fn main() {
    match parsear_coord("4.71", "-74.07") {
        Ok(c) => println!("OK: {c:?}"),
        Err(e) => println!("Error: {e:?}"),
    }

    match parsear_coord("no-es-un-numero", "-74.07") {
        Ok(c) => println!("OK: {c:?}"),
        Err(e) => println!("Error: {e:?}"),
    }
}
```

`.parse()` sobre un `&str` devuelve, en sí mismo, un `Result<f64, ParseFloatError>`. La línea `.map_err(|_| ErrorParseoCoord::LatitudNoNumerica)?` hace dos cosas en un solo paso: convierte ese error específico de parseo a nuestro propio tipo de error de dominio (`map_err`), y luego, si es un `Err`, **retorna inmediatamente** desde `parsear_coord` con ese error (`?`). Si en cambio es un `Ok`, `?` desenvuelve el valor y la ejecución sigue a la siguiente línea con `lat` ya siendo un `f64` normal, no un `Result<f64, _>`.

Esa es la clave de `?`: te deja escribir el camino feliz (parsear latitud, parsear longitud, validar, construir) como una secuencia lineal de pasos, mientras el manejo de cada posible fallo ocurre "por debajo", de forma explícita en el tipo de retorno pero sin ensuciar visualmente la lógica principal.

## `panic!`: cuándo es aceptable, y por qué casi nunca en un handler

Rust también tiene `panic!`, que detiene el programa inmediatamente (o el hilo, en un servidor concurrente). `.unwrap()` y `.expect("mensaje")` son formas comunes de invocarlo: extraen el valor de un `Option` o `Result`, y si resulta que era `None` o `Err`, entran en pánico.

```rust,ignore
let lat: f64 = "no-es-un-numero".parse().unwrap(); // pánico en tiempo de ejecución
```

Para un binario de un solo uso o un script personal, un `unwrap()` está bien: si algo sale mal, quieres enterarte inmediatamente y de la forma más ruidosa posible. Para un **handler de una API que atiende a otros usuarios**, es casi siempre la decisión equivocada: un `panic!` no controlado en un hilo de Axum puede tumbar esa petición (en el mejor caso) o, dependiendo de cómo esté configurado el runtime, afectar a otras peticiones que compartían ese *worker*. Un usuario que manda un CSV con una coordenada malformada no debería poder tumbar tu servidor — debería recibir un `400 Bad Request` con un mensaje claro.

La regla práctica que vas a aplicar durante todo este libro: **`unwrap()`/`expect()` son aceptables en tests y en código de arranque que falla rápido si la configuración está mal (por ejemplo, si la variable de entorno de la base de datos no está seteada al iniciar el servidor). En cualquier función que procese datos que vienen de fuera de tu programa — una petición HTTP, un archivo, una fila de base de datos — usa `Result` y propaga con `?`.**

## Ejercicios

**Ejercicio 1 — Propagar error con `?`.**
Extiende `parsear_coord` (la del ejemplo de arriba) escribiendo una función `parsear_ruta` que reciba un `&[(&str, &str)]` (una lista de pares lat/lon como strings, simulando filas de un CSV) y devuelva `Result<Vec<Coord>, ErrorParseoCoord>`. Debe usar `?` para propagar el primer error que encuentre, sin escribir un `match` explícito dentro del cuerpo de la función.

*Criterio de éxito:* un test como el siguiente pasa con `cargo test`:

```rust,ignore
#[test]
fn parsea_ruta_valida() {
    let filas = [("4.71", "-74.07"), ("6.25", "-75.56")];
    let ruta = parsear_ruta(&filas).unwrap();
    assert_eq!(ruta.len(), 2);
}
```

**Ejercicio 2 — Modelar un error de dominio con `enum`.**
Diseña un `enum ErrorFeature` para representar los posibles fallos al validar un `Feature` GeoJSON simplificado (`struct FeatureSimple { id: Option<String>, coords: Vec<(f64, f64)> }`) con al menos tres variantes: `SinId`, `SinCoordenadas`, y `CoordenadaInvalida { indice: usize, lat: f64, lon: f64 }`. Escribe la función `fn validar_feature(f: &FeatureSimple) -> Result<(), ErrorFeature>` que detecte los tres casos.

*Criterio de éxito:* tres tests, uno por variante, cada uno construyendo un `FeatureSimple` que dispare esa variante específica y verificando con `assert!(matches!(...))` que el `Err` devuelto es el esperado.

**Ejercicio 3 — Convertir un `panic!` en `Result`.**
Se te da esta función, que entra en pánico si el índice no existe:

```rust,ignore
fn obtener_punto(ruta: &[Coord], indice: usize) -> &Coord {
    &ruta[indice] // pánico si `indice` está fuera de rango
}
```

Reescríbela como `fn obtener_punto(ruta: &[Coord], indice: usize) -> Option<&Coord>` usando el método `.get()` de los slices (que ya devuelve `Option<&T>` en vez de entrar en pánico), y actualiza cualquier código que la llame para manejar el `None`.

*Criterio de éxito:* `obtener_punto(&ruta, 999)` sobre una ruta de 2 puntos devuelve `None` en vez de hacer panic — verificado con un test que llama la función con un índice fuera de rango y hace `assert!(resultado.is_none())`.

**Ejercicio 4 — Tests que verifican el camino de error.**
Para la función `parsear_coord` del capítulo, escribe tres tests: uno que confirme que `parsear_coord("200.0", "-74.07")` devuelve específicamente `Err(ErrorParseoCoord::LatitudFueraDeRango(200.0))` (no solo "algún error"), otro equivalente para longitud fuera de rango, y un tercero para el caso de un string no numérico. Usa `assert_eq!` comparando el `Err` completo, no `assert!(resultado.is_err())` — la diferencia importa: el segundo test pasaría igual aunque devolvieras la variante de error equivocada.

*Criterio de éxito:* los tres tests pasan, y si deliberadamente intercambias las variantes `LatitudFueraDeRango`/`LongitudFueraDeRango` dentro de `parsear_coord`, al menos uno de los tres falla (confirmando que sí estás verificando la variante específica y no solo la presencia de un error).
