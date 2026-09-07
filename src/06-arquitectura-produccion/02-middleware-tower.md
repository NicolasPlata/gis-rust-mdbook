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

## CORS: quién puede llamar tu API desde un navegador

Ningún visor de mapas en el navegador —el cliente más común de una API GIS— va a poder llamar a tu API si vive en un dominio distinto, a menos que tu servidor lo permita explícitamente. Esto no es un límite de tu código: es una protección que **el navegador** aplica por defecto a cualquier petición cross-origin hecha desde JavaScript, sin importar qué tan bien escrito esté tu servidor. `tower_http::cors::CorsLayer` es la pieza que le dice al navegador "sí, este origen específico puede leer mi respuesta".

La forma obvia de configurar un único origen permitido —pasar el valor directamente— **no hace lo que parece que hace**:

```rust,ignore
use axum::http::HeaderValue;
use tower_http::cors::CorsLayer;

// Version ingenua: parece decir "solo permite este origen".
let cors = CorsLayer::new()
    .allow_origin("https://geoapi-cliente.example".parse::<HeaderValue>().unwrap());
```

Verificado con dos peticiones reales, una con el origen configurado y otra con un origen completamente distinto:

```text
origen permitido -> status=200 OK access-control-allow-origin=Some("https://geoapi-cliente.example")
origen NO permitido -> status=200 OK access-control-allow-origin=Some("https://geoapi-cliente.example")
```

**El servidor devuelve el mismo `Access-Control-Allow-Origin` sin importar de dónde vino la petición.** `.allow_origin(HeaderValue)` (un único valor, no una lista) construye una configuración **constante**: ese encabezado se emite igual en cada respuesta, nunca se compara contra el `Origin` real de la petición entrante. La API parece decir "permite solo este origen", pero en realidad dice "siempre anuncia este origen, sin verificar nada".

**Por qué esto no es, técnicamente, un agujero de seguridad —pero sí es una trampa conceptual real:** la aplicación real de CORS ocurre en el navegador de quien *llama* tu API, no en tu servidor. Un navegador en `https://otro-sitio.evil` compara el `Access-Control-Allow-Origin` que recibió (`https://geoapi-cliente.example`, el valor constante) contra su **propio** origen (`https://otro-sitio.evil`) — como no coinciden, el navegador bloquea la respuesta igual, sin importar que el servidor haya "mentido" en el header. El problema real es otro: **cualquier cliente que no sea un navegador —`curl`, `reqwest`, otro servidor— nunca aplica esta verificación en absoluto.** CORS nunca fue control de acceso; es una política que el navegador hace cumplir del lado del cliente. Si necesitas de verdad restringir quién puede llamar tu API, necesitas autenticación real (una API key, un token) — no confundas nunca "configuré CORS" con "protegí mi API".

La forma correcta de expresar "solo este origen, verificado contra cada petición" es envolver el mismo valor en un arreglo — `AllowOrigin::list` en vez de `AllowOrigin::exact`, aunque la lista tenga un solo elemento:

```rust,ignore
let cors = CorsLayer::new()
    .allow_origin(["https://geoapi-cliente.example".parse::<HeaderValue>().unwrap()])
    .allow_methods([Method::GET, Method::POST]);
```

```text
origen permitido -> status=200 OK access-control-allow-origin=Some("https://geoapi-cliente.example")
origen NO permitido -> status=200 OK access-control-allow-origin=None (esperado: None)
preflight OPTIONS -> status=200 OK access-control-allow-methods=Some("GET,POST")
```

Con la lista, el origen no permitido ahora recibe una respuesta **sin** el encabezado `Access-Control-Allow-Origin` — el navegador de ese origen sí bloquea la lectura de la respuesta, que es el comportamiento que la versión ingenua parecía prometer sin cumplir. La lección, otra vez: **una API que "se ve" correcta en su firma (`.allow_origin` acepta tanto un valor como una lista) puede tener semánticas completamente distintas según la forma exacta en que la llames** — verificar con una petición real desde un origen que *debería* fallar es la única forma de confirmarlo, no leer la firma del método y asumir.

## Límite de tamaño del payload

Un endpoint `POST /features` que acepta geometrías arbitrarias tiene una superficie de ataque obvia: nada te impide, sin un límite explícito, recibir una única petición con un polígono de millones de vértices, agotando memoria o CPU antes de que tu handler llegue siquiera a validar la geometría. `tower_http::limit::RequestBodyLimitLayer` corta esto en la capa de middleware, antes de que el *body* completo llegue a tu código:

```rust,ignore
use tower_http::limit::RequestBodyLimitLayer;

let ruta_limitada = Router::new()
    .route("/features", post(recibir_geometria))
    .layer(RequestBodyLimitLayer::new(1024)); // 1 KiB máximo, solo para este ejemplo
```

```text
payload de 100 bytes (límite 1024) -> status=200 OK
payload de 10.000 bytes (límite 1024) -> status=413 Payload Too Large
```

El código `413 Payload Too Large` llega automáticamente — tu handler `recibir_geometria` nunca se ejecuta para la petición que excede el límite, así que ni siquiera gasta el tiempo de deserializar un `body` que ya sabes que vas a rechazar. En producción, el límite real depende de tu caso de uso (un `Feature` individual razonable puede pesar unos pocos KB; un `FeatureCollection` de un lote de importación puede necesitar varios MB) — la regla no es "usa 1 KiB", es **nunca dejes el límite sin configurar**, porque el valor por defecto de Axum ya es generoso (2 MB) pero sigue siendo un número que un atacante puede alcanzar con facilidad si tu caso de uso legítimo nunca necesita más de unos pocos KB por petición.

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

**Ejercicio 5 — Reproducir la trampa de `allow_origin` y confirmar la corrección.**
Reproduce exactamente el experimento del capítulo: configura `CorsLayer` con `.allow_origin(un_solo_valor)` (sin arreglo) y confirma con una petición real, usando un origen *distinto* al configurado, que el servidor de todas formas devuelve `Access-Control-Allow-Origin` con el valor configurado. Luego corrige con `.allow_origin([un_solo_valor])` y confirma que ahora el origen no permitido recibe una respuesta sin ese encabezado.

*Criterio de éxito:* dos aserciones explícitas — una confirmando el comportamiento incorrecto de la versión sin arreglo (el header aparece de todas formas) y otra confirmando que la versión con arreglo lo omite para el origen no permitido. No te quedes solo con la versión corregida: reproducir el bug primero es lo que confirma que de verdad entendiste la diferencia.

**Ejercicio 6 — Límite de payload por tipo de endpoint.**
Diseña dos rutas con límites de tamaño distintos: `/features` (un límite pequeño, pensado para un solo `Feature`, por ejemplo 10 KiB) y `/features/batch` (un límite mayor, pensado para un `FeatureCollection` completo, por ejemplo 5 MiB). Verifica con cuatro peticiones que cada ruta respeta su propio límite de forma independiente — que subir el límite de una no afecta a la otra.

*Criterio de éxito:* cuatro aserciones de `status`: un payload pequeño aceptado en ambas rutas, un payload que excede el límite de `/features` pero no el de `/features/batch` rechazado en la primera y aceptado en la segunda.
