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
