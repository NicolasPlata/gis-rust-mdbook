# 6.2 Middleware con Tower — caché, rate-limiting, timeouts

Axum no implementa caché, límites de tasa ni timeouts por sí mismo — delega todo eso en [`tower`](https://crates.io/crates/tower), el ecosistema de middleware componible que comparte con cualquier otro framework construido sobre el mismo *trait* `Service` (Tonic para gRPC, Hyper directamente, y sí, también Actix-web puede consumir parte de este ecosistema). Este capítulo te da los cuatro middleware que un servidor de producción casi nunca puede evitar: caché de respuestas, límite de tasa, timeout, y trazas de latencia — todos verificados end-to-end contra un servidor real.

## Caché de teselas con `moka`

[`moka`](https://crates.io/crates/moka) (versión 0.12) es una caché en memoria concurrente y asíncrona — el análogo en Rust de Caffeine (Java) o Guava Cache. Para GeoAPI, cachear la respuesta de una tesela costosa de generar es la optimización de mayor impacto por líneas de código escritas:

```rust,ignore
use axum::extract::{Path, State};
use moka::future::Cache;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

#[derive(Clone)]
struct EstadoApp {
    cache: Cache<(u8, u32, u32), Vec<u8>>,
    veces_computada: Arc<AtomicUsize>,
}

async fn calcular_tesela_costosa(z: u8, x: u32, y: u32, contador: &AtomicUsize) -> Vec<u8> {
    contador.fetch_add(1, Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(50)).await; // simula trabajo costoso (MVT, Capítulo 6.3)
    format!("tesela-{z}-{x}-{y}").into_bytes()
}

async fn tesela(State(estado): State<EstadoApp>, Path((z, x, y)): Path<(u8, u32, u32)>) -> Vec<u8> {
    if let Some(datos) = estado.cache.get(&(z, x, y)).await {
        return datos;
    }
    let datos = calcular_tesela_costosa(z, x, y, &estado.veces_computada).await;
    estado.cache.insert((z, x, y), datos.clone()).await;
    datos
}
```

```text
cache miss: 53.068171ms (status=200 OK), cache hit: 875.448µs (status=200 OK)
veces computada: 1
```

**~60 veces más rápido** en la segunda petición a la misma tesela, y `veces_computada` confirma que la función costosa corrió una sola vez — la segunda petición nunca la tocó. `Cache::new(capacidad)` crea una caché con una política de reemplazo *LRU/LFU híbrida* por defecto (basada en el algoritmo TinyLFU): cuando se llena, descarta las entradas menos valiosas automáticamente, sin que tengas que implementar ninguna lógica de expiración tú mismo. Para GeoAPI, esto es exactamente lo que interceptaría peticiones GET repetidas de teselas idénticas frente a PostGIS, tal como anticipa la ruta de este libro.

## Timeout configurable

Un handler que tarda demasiado —una consulta espacial compleja, una reproyección de un lote enorme sin `spawn_blocking` correctamente aislado— no debería colgar la petición del cliente indefinidamente. `tower_http::timeout::TimeoutLayer` corta la petición después de un plazo fijo:

```rust,ignore
use axum::http::StatusCode;
use std::time::Duration;
use tower_http::timeout::TimeoutLayer;

async fn lento() -> &'static str {
    tokio::time::sleep(Duration::from_secs(3)).await;
    "esto no debería llegar a imprimirse en el cliente"
}

// .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_millis(500)))
```

```text
GET /lento -> status=408 Request Timeout en 501.899967ms
```

El handler `lento` de verdad tarda 3 segundos en completar — pero el cliente recibe una respuesta `408` en poco más de 500ms, el plazo configurado. `with_status_code` (la API vigente; `TimeoutLayer::new` sigue funcionando pero está marcada obsoleta) te deja elegir qué código HTTP corresponde a un timeout en tu API — `408 Request Timeout` es semánticamente más preciso que el `500 Internal Server Error` genérico que otras versiones de esta librería devolvían por defecto.

## Rate-limiting por IP

[`tower_governor`](https://crates.io/crates/tower_governor) implementa un *token bucket* (el mismo concepto detrás de casi cualquier limitador de tasa de producción): cada cliente (identificado por IP, por defecto) tiene una cuota de peticiones que se repone gradualmente.

```rust,ignore
use axum::Router;
use axum::routing::get;
use tower_governor::governor::GovernorConfigBuilder;
use tower_governor::GovernorLayer;

async fn saludo() -> &'static str { "ok" }

fn construir_ruta_limitada() -> Router {
    let governor_conf = GovernorConfigBuilder::default()
        .per_second(2)   // repone un elemento de cuota cada 2 segundos
        .burst_size(3)   // permite una ráfaga inicial de 3 peticiones
        .finish()
        .unwrap();

    Router::new()
        .route("/saludo", get(saludo))
        .layer(GovernorLayer::new(governor_conf))
}
```

```text
statuses de 6 peticiones seguidas a /saludo (burst_size=3): [200, 200, 200, 429, 429, 429]
```

Con `burst_size(3)`, las primeras tres peticiones consecutivas de la misma IP pasan (`200`); las siguientes tres, disparadas antes de que la cuota se reponga, reciben `429 Too Many Requests` — el código HTTP estándar para "estás pidiendo demasiado, más rápido de lo permitido".

**Una trampa real que casi arruina esta misma verificación:** `GovernorLayer` limita por IP **para todas las rutas donde se aplica**, no por ruta individual. La primera versión de este experimento aplicaba el limitador a `Router` completo (incluyendo `/tiles` y `/lento`), y las peticiones de las secciones anteriores de este mismo capítulo —hechas desde la misma IP de loopback, `127.0.0.1`— ya habían consumido parte de la cuota antes de llegar a la sección de rate-limiting, contaminando la medición: la "segunda petición de caché" del ejemplo anterior en realidad estaba recibiendo un `429` silencioso, no un verdadero *cache hit* (el código de prueba original no comprobaba el `status` de la respuesta, solo medía tiempo). La solución, además de siempre comprobar el `status` de cada respuesta en tus propias pruebas, fue aplicar `GovernorLayer` únicamente al `Router` anidado que contiene `/saludo`, dejando `/tiles` y `/lento` fuera de su alcance — exactamente como harías en un servidor real, donde no todas las rutas necesitan la misma política de límite de tasa.

## Tracing de latencia por endpoint

`tower_http::trace::TraceLayer`, combinado con [`tracing`](https://crates.io/crates/tracing) + [`tracing-subscriber`](https://crates.io/crates/tracing-subscriber), instrumenta cada petición con *spans* que registran cuánto tardó y con qué código de estado terminó — sin que tengas que añadir ni un `println!` a cada handler:

```rust,ignore
use tower::ServiceBuilder;
use tower_http::trace::TraceLayer;

// tracing_subscriber::fmt::init(); en main()
// .layer(ServiceBuilder::new().layer(TraceLayer::new_for_http()) /* .layer(TimeoutLayer::...) */)
```

```text
DEBUG request{method=GET uri=/tiles/1/1/1 version=HTTP/1.1}: tower_http::trace::on_response: finished processing request latency=50 ms status=200
DEBUG request{method=GET uri=/saludo version=HTTP/1.1}: tower_http::trace::on_response: finished processing request latency=0 ms status=200
DEBUG request{method=GET uri=/lento version=HTTP/1.1}: tower_http::trace::on_response: finished processing request latency=501 ms status=408
```

Cada línea de log queda etiquetada con el método, la URI, la latencia exacta, y el código de estado — información que, en un despliegue real, exportarías a un backend de observabilidad (Capítulo 6.5) en vez de a la consola. El orden en que apilas estos middleware con `ServiceBuilder` importa: `TraceLayer` debe envolver a `TimeoutLayer` (como en el ejemplo) para que la latencia registrada incluya el tiempo que el timeout tardó en dispararse, no solo el tiempo hasta que el middleware de timeout decidió cortar.

## Ejercicios

**Ejercicio 1 — Cachear respuestas de teselas con `moka`.**
Extiende la caché del capítulo para que expire automáticamente cada entrada después de un tiempo fijo (usa `CacheBuilder::new(capacidad).time_to_live(duracion).build()` en vez de `Cache::new`), y confirma que una tesela vuelve a computarse tras esa expiración.

*Criterio de éxito:* un test que confirme, con `assert_eq!` sobre un contador como `veces_computada`, que una tesela se computa una vez, se sirve desde caché varias veces (el contador no sube), y se recomputa exactamente una vez más después de esperar más que el `time_to_live` configurado.

**Ejercicio 2 — Rate-limit por IP.**
Reproduce el experimento de rate-limiting del capítulo con tus propios parámetros (`per_second`, `burst_size`), y confirma que **tras esperar el tiempo de reposición completo**, una petición que antes recibía `429` vuelve a recibir `200`.

*Criterio de éxito:* una secuencia de peticiones con aserciones de `status` en cada paso: ráfaga inicial exitosa hasta `burst_size`, la siguiente rechazada con `429`, una espera de `1/per_second` segundos, y una petición final exitosa de nuevo.

**Ejercicio 3 — Timeout configurable.**
Crea dos handlers, uno que tarda menos que el timeout configurado y otro que tarda más, y confirma que el primero completa normalmente mientras el segundo recibe el código de estado de timeout que configuraste.

*Criterio de éxito:* dos tests, uno confirmando `status == 200` para el handler rápido y otro confirmando el código de timeout elegido (por ejemplo `408`) para el handler lento, con el tiempo medido de la segunda petición cercano al timeout configurado, no al tiempo real que el handler lento tarda en completar internamente.

**Ejercicio 4 — Tracing de latencia por endpoint.**
Instrumenta un endpoint que internamente llama a dos operaciones con `tracing::instrument` en funciones separadas (por ejemplo, "consultar caché" y "calcular si no hay caché"), y confirma en los logs que puedes distinguir cuánto tiempo se fue en cada sub-operación, no solo el total de la petición.

*Criterio de éxito:* capturas de log (impresas o guardadas) mostrando al menos dos *spans* anidados con duraciones distintas dentro de una misma petición HTTP, con una breve explicación de qué sub-operación fue el cuello de botella en tu ejemplo.
