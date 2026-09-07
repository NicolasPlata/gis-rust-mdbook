# 6.5 Observabilidad, resiliencia y despliegue

Un servidor que funciona en tu máquina no es lo mismo que un servicio que opera en producción. Este capítulo cierra la brecha entre ambos con piezas que casi nunca aparecen en un tutorial pero que cualquier equipo de operaciones exige antes de aceptar un despliegue: configuración tipada y validada al arranque, logs estructurados que un sistema (no solo un humano) pueda consumir, un *healthcheck* que refleje el estado real de las dependencias, y un contenedor reproducible. Cierra con la pieza más inesperada de todo el libro: compilar `geoapi-core` — el crate de dominio puro que construiste en el Capítulo 3.5 y no has tocado desde entonces — directamente a WebAssembly, y ejecutarlo en un motor de JavaScript real.

## Configuración tipada y validada al arranque (el patrón 12-factor)

Desde el Capítulo 4.6 este libro ha estado leyendo `DATABASE_URL` con `std::env::var("DATABASE_URL")` suelto, cada vez que hace falta. Eso está bien para un prototipo, pero tiene dos problemas reales en un servicio que un equipo de operaciones va a desplegar: primero, si la variable falta o está mal escrita, no te enteras hasta que el código que la usa se ejecuta — que puede ser mucho después de que el proceso arrancó, en medio de la primera petición real. Segundo, la configuración termina dispersa: cada módulo que necesita una variable de entorno la lee por su cuenta, sin que exista un solo lugar donde ver de qué depende el servicio para funcionar.

La alternativa — el patrón conocido como [**12-factor**](https://12factor.net/es/config) para configuración — es leer *todas* las variables de entorno una sola vez, al arranque, en un `struct` tipado y validado, y pasar ese struct al resto del programa como estado compartido. Si algo falta, el programa falla inmediatamente con un mensaje claro, antes de aceptar ninguna petición — nunca a mitad de una:

```rust,ignore
use std::env;

#[derive(Debug)]
struct Config {
    database_url: String,
    puerto: u16,
}

#[derive(Debug)]
enum ErrorConfig {
    FaltaVariable(&'static str),
    PuertoInvalido(String),
}

impl Config {
    fn desde_entorno() -> Result<Self, ErrorConfig> {
        // Carga un archivo `.env` si existe (útil en desarrollo local);
        // en producción las variables ya están seteadas por el entorno
        // de despliegue, así que un `.env` ausente no es un error.
        dotenvy::dotenv().ok();

        let database_url = env::var("DATABASE_URL")
            .map_err(|_| ErrorConfig::FaltaVariable("DATABASE_URL"))?;

        let puerto_str = env::var("PUERTO").unwrap_or_else(|_| "3000".to_string());
        let puerto = puerto_str
            .parse::<u16>()
            .map_err(|_| ErrorConfig::PuertoInvalido(puerto_str.clone()))?;

        Ok(Config { database_url, puerto })
    }
}

#[tokio::main]
async fn main() {
    let config = Config::desde_entorno().unwrap_or_else(|e| {
        eprintln!("Error de configuración: {e:?}");
        std::process::exit(1);
    });

    println!("Escuchando en el puerto {}", config.puerto);
    // A partir de aquí, `config` se envuelve en un `Arc` y se comparte
    // como `State<Arc<Config>>` — el mismo patrón de estado compartido
    // que ya conoces de `EstadoApp` desde el Capítulo 4.8.
}
```

`dotenvy` (el sucesor mantenido activamente de `dotenv`) es el crate estándar de facto para cargar un archivo `.env` en desarrollo — nunca lo uses para *escribir* secretos en producción, solo para no tener que exportar variables a mano en tu terminal mientras desarrollas. `.unwrap_or_else` con `std::process::exit(1)` es la única excepción real a la regla del Capítulo 2.4 de "nunca `unwrap()` sobre datos externos": esto corre exactamente una vez, al arranque, antes de que el servidor acepte ninguna petición — es precisamente el caso de "código de arranque que falla rápido si la configuración está mal" que esa regla ya reservaba como aceptable.

Fíjate en `ErrorConfig::PuertoInvalido`: en vez de un `String` genérico como mensaje, cada variante lleva el dato concreto que causó el problema — el mismo principio de "modelar el error como tipo, no como texto libre" del Capítulo 2.4, aplicado ahora a errores de arranque en vez de errores de request.

## Logs estructurados: de texto legible a JSON máquina-consumible

El `tracing` que usaste en el Capítulo 6.2 imprimía texto legible para un humano leyendo la consola. Un backend de observabilidad real (Loki, CloudWatch, cualquier agregador de logs) necesita JSON estructurado, con cada campo direccionable por separado:

```rust,ignore
use tracing::info;

fn main() {
    tracing_subscriber::fmt().json().init();
    // ...
    info!(evento = "calculo_distancia", "calculando distancia Haversine");
}
```

```text
{"timestamp":"2026-09-07T00:45:14.182419Z","level":"INFO","fields":{"message":"calculando distancia Haversine","evento":"calculo_distancia"},"target":"obs_demo"}
```

El cambio de `.fmt()` a `.fmt().json()` es literalmente la única diferencia de código — `tracing-subscriber` reformatea automáticamente cada evento (con sus campos con nombre, como `evento` arriba) como una línea JSON independiente, lista para que un colector de logs la parsee sin heurísticas de texto libre.

## *Healthcheck*: reflejar el estado real, no solo "el proceso sigue vivo"

Un healthcheck que solo confirma "el servidor responde" es casi inútil — un balanceador de carga necesita saber si el servicio puede *realmente* atender tráfico, lo que incluye sus dependencias críticas:

```rust,ignore
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

async fn healthz(State(estado): State<EstadoApp>) -> (StatusCode, Json<Value>) {
    let postgis_ok = verificar_conexion_postgis(&estado).await; // un SELECT 1 real, en producción

    let cuerpo = json!({
        "status": if postgis_ok { "ok" } else { "degraded" },
        "checks": { "postgis": if postgis_ok { "ok" } else { "fail" } }
    });
    let codigo = if postgis_ok { StatusCode::OK } else { StatusCode::SERVICE_UNAVAILABLE };
    (codigo, Json(cuerpo))
}
```

```text
GET /healthz (postgis ok)     -> 200 OK {"checks":{"postgis":"ok"},"status":"ok"}
GET /healthz (postgis caído)  -> 503 Service Unavailable {"checks":{"postgis":"fail"},"status":"degraded"}
```

Verificado simulando la caída de PostGIS con una bandera (`AtomicBool`) que la prueba cambia a mitad de ejecución: el mismo endpoint, sin reiniciar el servidor, pasa de `200` a `503` en el momento exacto en que la dependencia deja de estar disponible. Un orquestador (Kubernetes, un balanceador de carga) usa exactamente esta señal para decidir si debe dejar de enviarte tráfico — nunca vas a ver ese comportamiento si tu `/healthz` solo hace `"status": "ok"` sin comprobar nada.

## Agotamiento del *pool* de conexiones

El `/healthz` de la sección anterior detecta que PostGIS está *caído*. Pero hay un fallo distinto, mucho más común en producción, que un `SELECT 1` de healthcheck no detecta: PostGIS está perfectamente sano, pero tu propio `PgPool` (Capítulo 4.6) ya tiene sus `max_connections` conexiones ocupadas atendiendo consultas lentas, y una petición nueva simplemente **no tiene de dónde sacar una conexión**. Sin límite, esa petición esperaría para siempre; `sqlx` resuelve esto con `acquire_timeout`:

```rust,ignore
use sqlx::postgres::PgPoolOptions;
use std::time::Duration;

let pool = PgPoolOptions::new()
    .max_connections(2)
    .acquire_timeout(Duration::from_millis(500))
    .connect(&std::env::var("DATABASE_URL")?)
    .await?;
```

Verificado con un pool de exactamente 2 conexiones: dos tareas ocupan ambas con `SELECT pg_sleep(2)` (una consulta real y deliberadamente lenta), y una tercera consulta, que no tiene conexión libre disponible, espera hasta `acquire_timeout` y luego falla — nunca se queda colgada indefinidamente:

```text
agotado tras 502.125007ms: pool timed out while waiting for an open connection
```

El tiempo medido, ~502ms, coincide con el `acquire_timeout` configurado (500ms) — no con el `pg_sleep(2)` de las consultas que ocupan el pool. Esto importa: sin `acquire_timeout`, la tercera petición habría esperado los 2 segundos completos (o más, si llegaran más peticiones detrás de ella), y ese retraso se propagaría directamente al cliente HTTP sin que tu código tuviera forma de reaccionar antes.

El error que devuelve `acquire_timeout` (`sqlx::Error::PoolTimedOut`) es exactamente el tipo de fallo que un handler debe mapear a `503 Service Unavailable`, no a `500 Internal Server Error`, en el esquema RFC 7807 del Capítulo 6.1 — el servidor no está roto, está temporalmente saturado, y un `503` (a diferencia de un `500`) le dice al cliente que puede reintentar. Es la misma distinción de fondo que ya viste en `/healthz`: "degradado" no es lo mismo que "caído", y el código de estado HTTP debe reflejar cuál de los dos es.

`max_connections` no es un número que se sube "por si acaso": cada conexión abierta consume memoria en el lado de PostgreSQL, y un pool sobredimensionado en varias instancias de tu API puede agotar las conexiones disponibles del propio servidor de base de datos antes de que tu aplicación lo note. Dimensionarlo bien requiere conocer cuántas instancias de tu servicio corren en paralelo y cuántas conexiones acepta la base — un cálculo de capacidad, no una constante arbitraria.

## Contenedor: la forma reproducible de desplegar

Un `Dockerfile` de dos etapas —una para compilar, otra mínima para ejecutar— evita que la imagen final cargue con el toolchain completo de Rust:

```dockerfile
# Etapa 1: compilación
FROM rust:1.90-slim AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY geoapi-core ./geoapi-core
COPY geoapi-api ./geoapi-api
COPY geoapi-db ./geoapi-db
RUN cargo build --release --bin geoapi-api

# Etapa 2: runtime mínimo
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/geoapi-api /usr/local/bin/geoapi-api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:3000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/geoapi-api"]
```

La etapa `builder` usa la imagen oficial de Rust (pesada, con el compilador completo); la etapa final parte de `debian-slim` y copia **únicamente el binario ya compilado** — el resultado es una imagen final de decenas de MB, no de gigabytes, y sin superficie de ataque adicional (sin compilador, sin `cargo`, sin código fuente) en el contenedor que realmente corre en producción. `HEALTHCHECK` en el propio Dockerfile conecta directamente con el endpoint `/healthz` de la sección anterior — Docker (o Kubernetes leyendo la misma señal a través de una *liveness probe* equivalente) reinicia el contenedor automáticamente si deja de responder `200`.

## `geoapi-core` en WebAssembly: el cierre del hilo abierto en el Capítulo 3.5

Desde que construiste `geoapi-core` en el Capítulo 3.5, el libro insistió en una regla que en su momento pudo parecer arbitraria: **mantenerlo libre de bindings C** (nunca `gdal`, nunca `geos`, nunca `proj` directamente dentro de ese crate — esas dependencias viven en capas separadas). Esta es la razón: un crate 100% Rust seguro, sin FFI, compila a WebAssembly sin ningún cambio, y corre en cualquier motor que entienda el estándar WASM — incluido el navegador del cliente.

```rust,ignore
use geo::{Distance, Haversine};
use geo_types::Point;

#[unsafe(no_mangle)]
pub extern "C" fn haversine_metros(lon1: f64, lat1: f64, lon2: f64, lat2: f64) -> f64 {
    let a = Point::new(lon1, lat1);
    let b = Point::new(lon2, lat2);
    Haversine.distance(a, b)
}
```

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
```

El resultado es un archivo `.wasm` de **9.573 bytes** — sin ningún *shim* de JavaScript, sin `wasm-bindgen`, porque la función expuesta usa solo tipos primitivos de C (`f64`) que WebAssembly entiende de forma nativa. Cargarlo y ejecutarlo desde un motor de JavaScript real (Node, que usa el mismo motor V8 que Chrome — un "contexto de navegador simulado" genuino, no una aproximación) confirma que funciona exactamente igual que su versión nativa:

```js
import { readFile } from "node:fs/promises";

const bytes = await readFile("./wasm_demo.wasm");
const { instance } = await WebAssembly.instantiate(bytes, {});

const distancia = instance.exports.haversine_metros(-74.0721, 4.7110, -75.5636, 6.2518);
console.log("distancia (WASM, ejecutado en Node/V8):", distancia, "metros");
```

```text
distancia (WASM, ejecutado en Node/V8): 237921.12207458014 metros
```

**237921.12 metros** — el mismo valor, hasta el último decimal, que calculaste de forma nativa con el mismo par de ciudades en el Capítulo 3.3. La lógica de dominio no cambió ni un bit al cruzar de código nativo x86 a bytecode WebAssembly ejecutado dentro de un motor JavaScript — la garantía exacta que "mantener el dominio libre de FFI" te compró, pagada tres módulos después de que la decisión se tomara. En una GeoAPI real, esto habilita validaciones topológicas o cálculos geométricos en el navegador del cliente, sin round-trip al servidor, para la lógica que vive en `geoapi-core` — nunca para lo que depende de `gdal`, `geos` o `proj`, que sí necesitan una librería C que un navegador no tiene.

## Ejercicios

**Ejercicio 1 — Instrumentar con `tracing`.**
Instrumenta al menos dos funciones internas de un endpoint (por ejemplo, "validar entrada" y "ejecutar consulta") con `#[tracing::instrument]`, y activa el formato JSON. Confirma que los logs resultantes distinguen claramente cada sub-operación con su propio *span*.

*Criterio de éxito:* al menos dos líneas de log JSON capturadas, cada una identificable por el nombre de la función instrumentada, con una breve nota sobre cuál sub-operación fue más lenta en tu prueba.

**Ejercicio 2 — Definir un healthcheck.**
Extiende el `/healthz` del capítulo para verificar **dos** dependencias simuladas (por ejemplo, PostGIS y una caché `moka` del Capítulo 6.2), y confirma que el estado agregado es `"degraded"` si cualquiera de las dos falla, pero solo `"unhealthy"` (con un código `503` distinto, si lo diseñas así) si *ambas* fallan a la vez.

*Criterio de éxito:* cuatro peticiones de prueba (ambas dependencias sanas, cada una fallando por separado, y ambas fallando a la vez) con sus cuatro respuestas JSON y códigos de estado correspondientes verificados con `assert_eq!`.

**Ejercicio 3 — Contenerizar el servicio.**
Escribe tu propio `Dockerfile` de dos etapas para un binario Rust simple (puede ser cualquiera de los servidores de ejemplo de este libro), y documenta en un comentario cada línea que no sea obvia (por ejemplo, por qué copiar `Cargo.toml`/`Cargo.lock` antes que el código fuente completo mejora el cacheo de capas de Docker).

*Criterio de éxito:* un `Dockerfile` que, si tienes Docker disponible, construye sin error con `docker build .`; si no lo tienes disponible en tu entorno, una revisión línea por línea explicando qué hace cada instrucción y por qué está en ese orden.

**Ejercicio 4 — Compilar `geoapi-core` a WASM y ejecutarlo en un contexto de navegador simulado.**
Extiende la función WASM del capítulo con una segunda operación de `geoapi-core` (por ejemplo, `geodesic_area_unsigned` sobre un polígono simple, o `simplify` con una tolerancia fija) y ejecútala desde el mismo script de Node del capítulo.

*Criterio de éxito:* la salida de tu nueva función WASM comparada, con una tolerancia de punto flotante razonable, contra el resultado que la misma operación da ejecutada nativamente en Rust (no en WASM) sobre los mismos datos de entrada — confirmando que ambas rutas de ejecución concuerdan.

**Ejercicio 5 — Agotamiento del *pool* de conexiones.**
Repite el experimento del capítulo con tus propios parámetros: crea un pool con `max_connections(1)` y un `acquire_timeout` de tu elección, ocupa la única conexión con un `pg_sleep` más largo que ese timeout, y mide cuánto tarda una segunda consulta en fallar. Repite con un `acquire_timeout` distinto (por ejemplo, el doble) y confirma que el tiempo medido escala con el valor configurado, no con la duración del `pg_sleep`.

*Criterio de éxito:* dos mediciones (una por cada `acquire_timeout` probado) donde el tiempo transcurrido hasta el error esté dentro de un margen razonable (por ejemplo, ±100ms) del `acquire_timeout` configurado, con una aserción `assert!` para cada una.

**Ejercicio 6 — Configuración tipada con una variable adicional.**
Extiende el `struct Config` del capítulo con un tercer campo `max_conexiones_pool: u32`, leído de una variable de entorno `MAX_CONEXIONES_POOL` con un valor por defecto de `5` si no está seteada (igual que hiciste con `puerto`). Escribe dos tests: uno que confirme que `Config::desde_entorno()` falla con `ErrorConfig::FaltaVariable("DATABASE_URL")` cuando esa variable no está seteada, y otro que confirme que carga correctamente los tres campos cuando todas las variables están presentes (usa `std::env::set_var` dentro del test para controlar el entorno — nota que, desde la edición 2024 de Rust, `set_var`/`remove_var` son funciones `unsafe fn` (modificar variables de entorno no es seguro frente a otros hilos leyéndolas al mismo tiempo), así que necesitas envolver la llamada en un bloque `unsafe { ... }`; ten cuidado además de no dejar el test con efectos secundarios sobre otros tests que corran en paralelo).

*Criterio de éxito:* ambos tests pasan con `cargo test`, y el segundo confirma con `assert_eq!` los tres valores exactos (`database_url`, `puerto`, `max_conexiones_pool`) que `Config` cargó.

> Esta técnica es la que usa la fila "Healthcheck + logs JSON" del proyecto GeoAPI v1.0 (Capítulo 6.6) — ver la historia de usuario ahí.
