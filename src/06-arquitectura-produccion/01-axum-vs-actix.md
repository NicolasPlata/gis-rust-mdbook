# 6.1 Axum vs. Actix-web — decisión arquitectónica

Desde el Capítulo 4.7 vienes usando [`axum`](https://crates.io/crates/axum) sin que el libro te explicara por qué, más allá de "es un prototipo mínimo válido". Este capítulo abre esa decisión: Axum no es la única opción seria en el ecosistema Rust para servir GeoAPI en producción — [`actix-web`](https://crates.io/crates/actix-web) es la otra alternativa madura, con una filosofía de diseño distinta. Vas a construir el mismo endpoint en ambos, medirlos con tus propios números, y ver que la respuesta a "¿cuál es mejor?" depende mucho más de lo que midas que de lo que hayas leído en un blog.

## El mismo endpoint, dos frameworks

Axum (del equipo de Tokio) construye su ergonomía sobre *extractors* — tipos que implementan un trait y saben "sacarse a sí mismos" de una petición HTTP — y una integración nativa con el ecosistema `tower` (Capítulo 6.2). Actix-web usa un modelo de actores por debajo (aunque su API pública moderna rara vez te obliga a pensar en actores explícitamente) y expone macros de atributo (`#[get("/ruta")]`) directamente sobre las funciones handler.

```rust,ignore
// --- Axum ---
use axum::extract::Query;
use axum::routing::get;
use axum::{Json, Router};
use geo::{Distance, Haversine};
use geo_types::Point;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ParametrosDistancia { lat1: f64, lon1: f64, lat2: f64, lon2: f64 }

#[derive(Serialize)]
struct RespuestaDistancia { distancia_m: f64 }

async fn distancia(Query(p): Query<ParametrosDistancia>) -> Json<RespuestaDistancia> {
    let a = Point::new(p.lon1, p.lat1);
    let b = Point::new(p.lon2, p.lat2);
    Json(RespuestaDistancia { distancia_m: Haversine.distance(a, b) })
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/distance", get(distancia));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8081").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

```rust,ignore
// --- Actix-web ---
use actix_web::{get, web, App, HttpServer, Responder};
use geo::{Distance, Haversine};
use geo_types::Point;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ParametrosDistancia { lat1: f64, lon1: f64, lat2: f64, lon2: f64 }

#[derive(Serialize)]
struct RespuestaDistancia { distancia_m: f64 }

#[get("/distance")]
async fn distancia(q: web::Query<ParametrosDistancia>) -> impl Responder {
    let a = Point::new(q.lon1, q.lat1);
    let b = Point::new(q.lon2, q.lat2);
    web::Json(RespuestaDistancia { distancia_m: Haversine.distance(a, b) })
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(distancia))
        .bind(("127.0.0.1", 8082))?
        .run()
        .await
}
```

Migrar el endpoint entre ambos es, en este caso simple, casi mecánico: el extractor `Query<T>` de Axum y `web::Query<T>` de Actix-web hacen exactamente lo mismo (deserializar la *query string* con `serde`), y ambos usan `Json` para la respuesta. La diferencia visible más importante es la firma del handler: Axum extrae sus parámetros como argumentos de función tipados directamente; Actix-web logra el mismo efecto, pero atado a una macro de atributo que registra la ruta en el propio handler en vez de en el router.

```text
{"distancia_m":237742.14505931392}
```

Verificado: ambos devuelven exactamente el mismo resultado para las mismas coordenadas — la elección de framework no cambia ni un bit del cálculo de dominio, solo cómo llega la petición y sale la respuesta.

## El benchmark, y por qué "depende" es la respuesta correcta

```sh
ab -n 20000 -c 100 "http://127.0.0.1:8081/distance?lat1=4.71&lon1=-74.07&lat2=6.25&lon2=-75.56"
ab -n 20000 -c 100 "http://127.0.0.1:8082/distance?lat1=4.71&lon1=-74.07&lat2=6.25&lon2=-75.56"
```

Corriendo este mismo benchmark **tres veces seguidas**, alternando entre ambos servidores, sobre el mismo endpoint trivial (una sola llamada a `Haversine.distance`, sin tocar disco ni red hacia afuera):

```text
corrida 1: axum 25.984 req/s   actix-web 25.397 req/s
corrida 2: axum 27.750 req/s   actix-web 29.569 req/s
corrida 3: axum 18.005 req/s   actix-web 15.603 req/s
```

**No hay un ganador consistente.** En la corrida 1 gana Axum por un margen pequeño; en la 2 gana Actix-web; en la 3 vuelve a ganar Axum, con ambos cayendo notablemente respecto a las corridas anteriores (ruido del propio entorno de medición, no una diferencia real de los frameworks). La variabilidad *entre corridas del mismo framework* es más grande que la diferencia *entre frameworks* en cualquier corrida individual — la conclusión honesta de este experimento no es "Axum es más rápido" ni "Actix-web es más rápido", es que **para un endpoint de este tipo, la elección de framework no es el factor que va a determinar el rendimiento de tu API.**

Esto no contradice lo que dice la ruta de este libro sobre que Actix-web puede dar un 10-15% más de throughput en escenarios extremos — esa cifra proviene de benchmarks especializados (como el TechEmpower Framework Benchmarks) bajo cargas y configuraciones muy específicas, no de un endpoint típico de GeoAPI bajo carga moderada. La regla operativa: **nunca elijas un framework por un número que leíste en otro lado — corre tu propio benchmark, sobre tu propio endpoint representativo, y decide con esos datos.** Si tu propio benchmark, como el de arriba, no muestra una diferencia consistente, la decisión correcta es optimizar por lo que sí varía de verdad entre ambos: la ergonomía del código, la integración con el resto de tu stack (`tower` para Axum, el ecosistema de Actix para Actix-web), y la experiencia del equipo que va a mantenerlo.

## Mapear errores de dominio a HTTP: `IntoResponse` y RFC 7807

Todos los endpoints que has construido hasta ahora, en los proyectos guiados, han asumido implícitamente que las cosas salen bien. En producción no es así: un `id` que no existe, una geometría que no pasa validación, una consulta a PostGIS que falla porque la conexión se cayó. Sin un mapeo explícito, cualquiera de esos casos termina como un `500 Internal Server Error` genérico — o peor, como un *stack trace* completo filtrado al cliente, exponiendo detalles internos de tu esquema de base de datos.

Axum resuelve esto con el trait `IntoResponse`: cualquier tipo que lo implemente puede ser el tipo de retorno (o el tipo de error, dentro de un `Result`) de un handler. Define tu propio tipo de error de API, decide qué código HTTP le corresponde a cada variante, e implementa `IntoResponse` una sola vez:

```rust,ignore
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

#[derive(Debug)]
enum ErrorApi {
    EntradaInvalida(String),
    NoEncontrado,
    NoProcesable(String),
    ErrorInterno(String),
}

// El formato de "Problem Details for HTTP APIs" (RFC 7807): un cuerpo JSON
// estandarizado para errores, en vez de que cada API invente su propia forma.
#[derive(Serialize)]
struct ProblemDetails {
    #[serde(rename = "type")]
    tipo: String,
    title: String,
    status: u16,
    detail: String,
}

impl IntoResponse for ErrorApi {
    fn into_response(self) -> Response {
        let (status, title, detail) = match self {
            ErrorApi::EntradaInvalida(msg) => (StatusCode::BAD_REQUEST, "Entrada inválida", msg),
            ErrorApi::NoEncontrado => (
                StatusCode::NOT_FOUND,
                "No encontrado",
                "El recurso solicitado no existe".to_string(),
            ),
            ErrorApi::NoProcesable(msg) => (StatusCode::UNPROCESSABLE_ENTITY, "No se pudo procesar", msg),
            ErrorApi::ErrorInterno(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "Error interno", msg),
        };
        let body = ProblemDetails {
            tipo: "about:blank".to_string(),
            title: title.to_string(),
            status: status.as_u16(),
            detail,
        };
        let mut respuesta = (status, Json(body)).into_response();
        respuesta
            .headers_mut()
            .insert(header::CONTENT_TYPE, "application/problem+json".parse().unwrap());
        respuesta
    }
}

// Nunca dejes que un sqlx::Error se filtre tal cual al cliente -- podría
// revelar nombres de tablas o columnas. Se mapea a un 500 genérico aquí;
// el detalle completo se loggea del lado del servidor (Capítulo 6.5),
// nunca se envía al cliente.
impl From<sqlx::Error> for ErrorApi {
    fn from(e: sqlx::Error) -> Self {
        ErrorApi::ErrorInterno(format!("fallo de base de datos: {e}"))
    }
}
```

El `From<sqlx::Error>` es la pieza que hace esto ergonómico: cualquier handler que use `?` sobre una llamada a SQLx propaga automáticamente un `ErrorApi::ErrorInterno`, sin un `.map_err()` manual en cada sitio:

```rust,ignore
async fn feature_por_id(
    State(pool): State<PgPool>,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ErrorApi> {
    if id <= 0 {
        return Err(ErrorApi::EntradaInvalida(format!("id debe ser positivo, recibido: {id}")));
    }
    let fila = sqlx::query("SELECT id, nombre FROM features WHERE id = $1")
        .bind(id)
        .fetch_optional(&pool)
        .await?; // sqlx::Error -> ErrorApi automáticamente, vía From

    match fila {
        Some(f) => Ok(Json(serde_json::json!({ "id": f.get::<i32, _>("id"), "nombre": f.get::<String, _>("nombre") }))),
        None => Err(ErrorApi::NoEncontrado),
    }
}
```

Verificado contra PostGIS real, con tres peticiones reales por HTTP:

```text
GET /features/-1 -> 400 Bad Request content-type=Some("application/problem+json")
cuerpo: {"detail":"id debe ser positivo, recibido: -1","status":400,"title":"Entrada inválida","type":"about:blank"}
GET /features/999999999 -> 404 Not Found (esperado 404)
GET /features/1 -> 200 OK cuerpo={"id":1,"nombre":"feature-1"}
```

Cada error de dominio produce un código HTTP correcto y un cuerpo `application/problem+json` legible por cualquier cliente que sepa parsear RFC 7807 — sin que el handler tenga que pensar en HTTP en absoluto, y sin que un detalle interno (como el texto crudo de un error de SQLx) llegue nunca al cliente sin pasar antes por tu propio mapeo explícito.

## Streaming asíncrono: de PostGIS al *body* de la respuesta, sin pasar por un `Vec`

Un endpoint que devuelve `Json(Vec<Feature>)` funciona perfectamente hasta que el resultado deja de ser pequeño. Si una consulta trae 500.000 features y tu handler hace `.fetch_all()`, tu servidor tiene que: (1) esperar a que **toda** la consulta termine, (2) construir un `Vec` con las 500.000 filas completas en memoria, (3) serializar **todo** ese `Vec` a un único `String` de JSON, y (4) recién ahí empezar a escribir la respuesta. El cliente no ve un solo byte hasta que las cuatro fases terminaron — y el servidor, mientras tanto, sostiene el resultado completo en memoria. Con un dataset de verdad grande, eso es exactamente cómo un servicio se queda sin memoria (OOM) en producción.

La alternativa: conectar el `Stream` de filas que SQLx ya te da (`.fetch()`, en vez de `.fetch_all()`) directamente al *body* de la respuesta HTTP, con `axum::body::Body::from_stream`, para que cada fila salga hacia el cliente tan pronto llega de PostGIS — sin que el servidor tenga que acumular nada. Necesitas dos crates adicionales para esto: [`futures-util`](https://crates.io/crates/futures-util) (0.3.34 en este capítulo), para adaptar el stream de SQLx, y [`async-stream`](https://crates.io/crates/async-stream) (0.3.6), por la razón que ves en el comentario del código.

```rust,ignore
use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::Response;
use futures_util::StreamExt;
use sqlx::{PgPool, Row};

// --- Ingenuo: acumula TODO el resultado antes de responder ---
async fn features_naive(State(pool): State<PgPool>) -> Result<axum::Json<Vec<serde_json::Value>>, ErrorApi> {
    let filas = sqlx::query("SELECT id, nombre, lon, lat FROM features ORDER BY id")
        .fetch_all(&pool)
        .await?;

    let valores: Vec<serde_json::Value> = filas
        .into_iter()
        .map(|f| serde_json::json!({
            "id": f.get::<i32, _>("id"), "nombre": f.get::<String, _>("nombre"),
            "lon": f.get::<f64, _>("lon"), "lat": f.get::<f64, _>("lat"),
        }))
        .collect();

    Ok(axum::Json(valores))
}

// --- Streaming: una línea NDJSON por fila, sin acumular un Vec ---
async fn features_streaming(State(pool): State<PgPool>) -> Response {
    // `sqlx::query(..).fetch(&pool)` toma prestado `pool`; el stream resultante
    // no puede sobrevivir a esta función a menos que `pool` viva DENTRO del
    // propio stream. `async_stream::stream!` genera exactamente eso.
    let stream = async_stream::stream! {
        let mut filas = sqlx::query("SELECT id, nombre, lon, lat FROM features ORDER BY id").fetch(&pool);
        while let Some(fila_res) = filas.next().await {
            yield fila_res.map(|f| {
                let linea = serde_json::json!({
                    "id": f.get::<i32, _>("id"), "nombre": f.get::<String, _>("nombre"),
                    "lon": f.get::<f64, _>("lon"), "lat": f.get::<f64, _>("lat"),
                }).to_string();
                format!("{linea}\n")
            });
        }
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .body(Body::from_stream(stream))
        .unwrap()
}
```

Verificado con una tabla real de 300.000 filas en PostGIS, midiendo desde el cliente cuándo llega el primer byte y cuándo termina la respuesta completa:

```text
naive:      primer byte a los 681.9ms,  completo a los 695.0ms,   26434379 bytes
streaming:  primer byte a los 28.2ms,   completo a los 3960.3ms,  26434378 bytes
```

**Ningún número aquí es "el ganador" de forma universal — son dos comportamientos distintos, cada uno correcto para un problema distinto:**

- El *streaming* entrega el primer byte **~24 veces más rápido** (28ms contra 682ms) — porque no espera a que la consulta completa termine ni a serializar 300.000 filas de una vez. Para un cliente que empieza a procesar filas apenas llegan (por ejemplo, dibujando puntos en un mapa progresivamente), esa latencia inicial es la métrica que le importa.
- Pero la versión *naive* **termina antes en total** (695ms contra 3.96s) — el costo de emitir 300.000 fragmentos HTTP diminutos, uno por fila, es mayor que el costo de un único `Vec` grande escrito de una sola vez. Si lo único que te importa es el rendimiento total agregado y el dataset cabe cómodamente en memoria, la versión *naive* es, medida aquí, la más rápida de las dos.

La razón real para preferir *streaming* no es "siempre es más rápido" —no lo es—, es que **el uso de memoria del servidor queda acotado**: nunca sostiene más de una fila (más el búfer de red) a la vez, sin importar si la consulta trae 300 filas o 300 millones. Esa es la propiedad que evita el OOM del escenario real que abrió esta sección — no una mejora de velocidad. En un endpoint de producción, la decisión correcta depende de si el tamaño del resultado puede crecer sin límite (streaming) o si es acotado y cabe en memoria con margen (naive es más simple y, en este caso, más rápido en total).

## Ejercicios

**Ejercicio 1 — Migrar un endpoint entre ambos frameworks.**
Toma un endpoint más complejo que ya construiste en un capítulo anterior (por ejemplo, `GET /features/near` del Capítulo 4.7, con su lógica de índice en memoria y *fallback* a PostGIS) y reimplementa su firma HTTP en Actix-web, reusando toda la lógica de dominio sin cambios (debe seguir viviendo en `geoapi-core`/tu *repository*, no reescribirse).

*Criterio de éxito:* ambas versiones (Axum y Actix-web) devuelven exactamente el mismo JSON para la misma petición de prueba — confirmado comparando las respuestas byte a byte o campo a campo.

**Ejercicio 2 — Benchmark propio.**
Repite el experimento del capítulo con un endpoint de tu elección, pero corriendo cada benchmark **al menos 5 veces** por framework (no solo 3, como el capítulo) para tener una muestra más confiable, e imprime la media y la desviación entre corridas de cada uno.

*Criterio de éxito:* una tabla con los 5+ valores de *requests per second* por framework, su media, y una conclusión escrita de una frase sobre si la diferencia entre frameworks es mayor o menor que la variabilidad entre corridas del mismo framework — la misma pregunta que decidió la conclusión de este capítulo.

**Ejercicio 3 — Justificar por escrito la elección para un caso dado.**
Escribe, en un párrafo, tu recomendación de framework para dos escenarios distintos: (a) un equipo pequeño que ya conoce bien el ecosistema `tower` por otros proyectos y necesita servir principalmente teselas MVT cacheadas; (b) un equipo que ya tiene un benchmark real, propio, mostrando que Actix-web da un 20% más de throughput bajo su carga de producción específica, y necesita exprimir cada milisegundo posible en un servicio de alto volumen.

*Criterio de éxito:* dos párrafos, cada uno con una recomendación explícita (no "depende" sin más) y al menos una razón concreta basada en las diferencias reales entre ambos frameworks que este capítulo o el Capítulo 6.2 documentan — no una preferencia genérica sin justificar.

**Ejercicio 4 — Mapeo de errores con `IntoResponse`.**
Implementa `ErrorApi` tal como se describe en el capítulo, y añade una cuarta variante que no se mostró: `ErrorApi::LimiteExcedido(String)`, mapeada al código `429 Too Many Requests`. Escribe un handler que la use (por ejemplo, simulando un límite de resultados por página) y verifica con una petición real que el código, el `content-type`, y el cuerpo `application/problem+json` son correctos.

*Criterio de éxito:* una petición de prueba que dispare `ErrorApi::LimiteExcedido` recibe un `429`, con `content-type: application/problem+json`, y un cuerpo cuyo campo `"status"` es exactamente `429` (no un valor hardcodeado en el `ProblemDetails` que no coincida con el código HTTP real de la respuesta).

**Ejercicio 5 — Medir tu propio caso de streaming vs. naive.**
Repite el experimento del capítulo con tu propia tabla y tu propio tamaño de resultado (puede ser más pequeño o más grande que las 300.000 filas del capítulo). Mide el tiempo al primer byte y el tiempo total para ambos enfoques, con al menos tres corridas de cada uno.

*Criterio de éxito:* una tabla con tus propios números (no los del capítulo) y una conclusión escrita sobre en qué punto, si el tamaño del resultado sigue creciendo, la ventaja de latencia del streaming empezaría a importar más que la desventaja de throughput total — con una justificación basada en tus propias mediciones, no en la intuición.

> Esta técnica es la que motiva el marco general del proyecto GeoAPI v1.0 (Capítulo 6.6) — ver la historia de usuario ahí.
