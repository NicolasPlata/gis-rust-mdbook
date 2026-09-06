# 4.7 Proyecto guiado de cierre — GeoAPI v0.3 (servidor REST con estado)

Este capítulo cierra el Módulo 3 uniendo todo lo que construiste: DE-9IM (4.1), predicados robustos (4.2), índices espaciales (4.3), reproyección (4.4), y persistencia PostGIS (4.5) en un solo servidor HTTP real. Este es el primer capítulo del libro donde GeoAPI deja de ser una biblioteca que tú invocas desde `main()` y pasa a ser un **servicio que escucha peticiones** — un prototipo mínimo con [`axum`](https://crates.io/crates/axum) (versión 0.8), el framework web que el libro trata formalmente recién en el Capítulo 6.1. Aquí lo usas con el mínimo indispensable: un `Router`, extractores de query/JSON, y estado compartido — sin middleware, sin autenticación, sin las decisiones de arquitectura de producción que llegan más adelante.

## Dependencias

```toml
[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net"] }
sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "postgres", "macros"] }
geozero = { version = "0.15", features = ["with-postgis-sqlx", "with-wkb"] }
geo = "0.33"
geo-types = "0.7"
geojson = "1.0"
proj = "0.31"
rstar = "0.13"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

Recuerda la lección del Capítulo 4.5: `sqlx` queda fijado en `0.8` porque `geozero` con `with-postgis-sqlx` depende de esa versión internamente.

## El estado compartido: PostGIS + un índice en memoria

GeoAPI v0.3 mantiene **dos** copias de tus features simultáneamente, cada una optimizada para algo distinto: PostGIS es la fuente de verdad persistente; un `rstar::RTree` en memoria (Capítulo 4.3) es una **caché de índice** para responder consultas de vecino más cercano sin tocar disco en cada request.

```rust,ignore
// src/main.rs
use std::sync::Arc;
use rstar::RTree;
use rstar::primitives::GeomWithData;
use sqlx::PgPool;
use tokio::sync::RwLock;

#[derive(Clone)]
struct EstadoApp {
    pool: PgPool,
    indice: Arc<RwLock<RTree<GeomWithData<[f64; 2], i32>>>>,
}
```

El índice guarda solo `[f64; 2]` (el centroide de cada feature) más su `id` de PostGIS — nunca la geometría completa. Esto es una decisión de diseño explícita: `rstar` te da velocidad de vecino-más-cercano; PostGIS te da la geometría real, las funciones `ST_*`, y la persistencia. Cada uno hace lo que hace mejor, y ninguno duplica el trabajo del otro.

```rust,ignore
async fn construir_estado(pool: PgPool) -> EstadoApp {
    sqlx::query("DROP TABLE IF EXISTS features_v03").execute(&pool).await.unwrap();
    sqlx::query(
        "CREATE TABLE features_v03 (
            id SERIAL PRIMARY KEY,
            nombre TEXT NOT NULL,
            geom GEOMETRY(Geometry, 4326) NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .unwrap();
    // El mismo índice de expresión del Capítulo 4.5 -- sobre geography, no geometry.
    sqlx::query("CREATE INDEX features_v03_geog_gist ON features_v03 USING GIST ((geom::geography))")
        .execute(&pool)
        .await
        .unwrap();

    EstadoApp { pool, indice: Arc::new(RwLock::new(RTree::new())) }
}
```

## Checkpoint 1 — `POST /features`

El primer endpoint recibe una `Feature` de GeoJSON (el mismo formato que `geoapi-core` ya sabe parsear desde el Capítulo 3.5), la inserta en PostGIS vía el patrón *repository* del Capítulo 4.5, y actualiza el índice en memoria con su centroide.

```rust,ignore
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use geo::Centroid;
use geo_types::Geometry;
use geozero::wkb;
use serde::{Deserialize, Serialize};
use sqlx::Row;

#[derive(Deserialize)]
struct NuevaFeature {
    nombre: String,
    geometry: geojson::Geometry,
}

#[derive(Serialize)]
struct FeatureCreada {
    id: i32,
}

async fn insertar_feature(
    State(estado): State<EstadoApp>,
    Json(body): Json<NuevaFeature>,
) -> Result<Json<FeatureCreada>, (StatusCode, String)> {
    let geom: Geometry<f64> = body
        .geometry
        .value
        .try_into()
        .map_err(|e: geojson::Error| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let fila = sqlx::query(
        "INSERT INTO features_v03 (nombre, geom) VALUES ($1, ST_SetSRID($2, 4326)) RETURNING id",
    )
    .bind(&body.nombre)
    .bind(wkb::Encode(geom.clone()))
    .fetch_one(&estado.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let id: i32 = fila.get(0);

    // El índice en memoria solo indexa el centroide -- una geometría con
    // área o longitud se busca por su centro, no por su forma completa.
    // Es una limitación documentada, no un descuido: si tu API necesita
    // "¿qué polígonos *contienen* este punto?" en vez de "¿qué features
    // están *cerca* de este punto?", el índice en memoria no basta -- esa
    // consulta va directo a PostGIS con Relate/Contains (ver el ejercicio
    // integrador al final del capítulo).
    if let Some(centroide) = geom.centroid() {
        let mut indice = estado.indice.write().await;
        indice.insert(GeomWithData::new([centroide.x(), centroide.y()], id));
    }

    Ok(Json(FeatureCreada { id }))
}
```

**Checkpoint de verificación:** una petición real por HTTP contra el servidor arrancado:

```text
POST /features -> {"id":1}
```

## Checkpoint 2 — `GET /features/near?lat&lon&radius`

Aquí es donde el índice en memoria gana su lugar — y donde aparece otra variante de la trampa `geometry`/`geography` que ya viste en el Capítulo 4.5. `rstar` no sabe nada de proyecciones ni de esferas: guarda `[f64; 2]` y mide distancia euclidiana plana en las mismas unidades con las que insertaste (grados, en este caso). Un radio en **metros** no se puede pasar directo a `rstar`.

```rust,ignore
use axum::extract::Query;
use geo::{Distance, Haversine};
use geo_types::Point;

#[derive(Deserialize)]
struct ParametrosCerca {
    lat: f64,
    lon: f64,
    radius: f64, // metros
}

#[derive(Serialize)]
struct FeatureCercana {
    id: i32,
    distancia_m: f64,
}

async fn features_cerca(
    State(estado): State<EstadoApp>,
    Query(params): Query<ParametrosCerca>,
) -> Result<Json<Vec<FeatureCercana>>, (StatusCode, String)> {
    let indice = estado.indice.read().await;

    if indice.size() == 0 {
        // Fallback: el índice en memoria está vacío (ej. justo tras un
        // reinicio, antes de recargarlo desde PostGIS) -- consulta
        // PostGIS directamente en vez de devolver una lista vacía falsa.
        let filas = sqlx::query(
            "SELECT id, ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS dist
             FROM features_v03
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)",
        )
        .bind(params.lon)
        .bind(params.lat)
        .bind(params.radius)
        .fetch_all(&estado.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        return Ok(Json(
            filas.into_iter()
                .map(|f| FeatureCercana { id: f.get("id"), distancia_m: f.get("dist") })
                .collect(),
        ));
    }

    let centro = Point::new(params.lon, params.lat);
    // Pre-filtro rápido en grados (generoso, para no descartar nada de
    // más), y luego se mide la distancia real con Haversine (Capítulo
    // 3.3) para filtrar con precisión y devolver metros de verdad.
    let radio_grados_generoso = (params.radius / 111_000.0) * 1.5;
    let candidatos = indice.locate_within_distance(
        [centro.x(), centro.y()],
        radio_grados_generoso * radio_grados_generoso, // distancia al cuadrado
    );

    let mut resultado: Vec<FeatureCercana> = candidatos
        .filter_map(|c| {
            let punto_candidato = Point::new(c.geom()[0], c.geom()[1]);
            let distancia_m = Haversine.distance(centro, punto_candidato);
            (distancia_m <= params.radius).then_some(FeatureCercana { id: c.data, distancia_m })
        })
        .collect();
    resultado.sort_by(|a, b| a.distancia_m.total_cmp(&b.distancia_m));

    Ok(Json(resultado))
}
```

El factor `111_000.0` es la aproximación clásica "un grado de latitud son ~111km" (Capítulo 3.2) — deliberadamente generosa (`* 1.5`) porque un grado de *longitud* mide menos que uno de latitud a cualquier latitud distinta del ecuador, y preferimos traer candidatos de más y descartarlos con Haversine, que descartar de más y perder resultados válidos. Este es exactamente el patrón "pre-filtro barato + verificación exacta" que vas a reconocer en casi cualquier motor espacial de producción, incluido PostGIS mismo (el índice GiST filtra por *bounding box* antes de que `ST_DWithin` calcule la distancia exacta).

**Checkpoint de verificación**, con dos features insertadas (Bogotá y Medellín) y un radio de 50km desde Bogotá:

```text
GET /features/near (50km de Bogotá) -> [{"distancia_m":0.0,"id":1}]
```

Medellín (a ~240km) queda correctamente excluida. Y el camino de *fallback* (índice vacío, consulta directa a PostGIS) también se verificó por separado, con el mismo resultado:

```text
fallback (índice vacío) -> [{"id":1,"distancia_m":0.0}]
```

## Checkpoint 3 — `GET /features/reproject?lon&lat&crs=`

El tercer endpoint reutiliza directamente el `proj` del Capítulo 4.4 — incluida la lección de ese capítulo sobre validar tú mismo el dominio de entrada, porque `proj` no lo hace por ti:

```rust,ignore
#[derive(Deserialize)]
struct ParametrosReproject {
    lon: f64,
    lat: f64,
    crs: String,
}

#[derive(Serialize)]
struct PuntoReproyectado {
    x: f64,
    y: f64,
}

async fn features_reproject(
    Query(params): Query<ParametrosReproject>,
) -> Result<Json<PuntoReproyectado>, (StatusCode, String)> {
    if !params.lon.is_finite() || !(-180.0..=180.0).contains(&params.lon) {
        return Err((StatusCode::BAD_REQUEST, format!("longitud inválida: {}", params.lon)));
    }
    if !params.lat.is_finite() || !(-90.0..=90.0).contains(&params.lat) {
        return Err((StatusCode::BAD_REQUEST, format!("latitud inválida: {}", params.lat)));
    }

    let transformador = proj::Proj::new_known_crs("EPSG:4326", &params.crs, None)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("CRS destino inválido ({}): {e}", params.crs)))?;

    let (x, y) = transformador
        .convert((params.lon, params.lat))
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(PuntoReproyectado { x, y }))
}
```

```text
GET /features/reproject -> {"x":602910.0065240419,"y":520787.2587685931}
```

Un valor idéntico, hasta el último decimal, al que calculaste directamente con `proj` en el Capítulo 4.4 — la API no introduce ninguna pérdida de precisión propia, solo expone la misma operación por HTTP.

## Ensamblando el router

```rust,ignore
use axum::routing::{get, post};
use axum::Router;

fn construir_router(estado: EstadoApp) -> Router {
    Router::new()
        .route("/features", post(insertar_feature))
        .route("/features/near", get(features_cerca))
        .route("/features/reproject", get(features_reproject))
        .with_state(estado)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    let estado = construir_estado(pool).await;
    let app = construir_router(estado);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

## Verificación del umbral de aceptación: KNN en <10ms sobre 100k features

El criterio de aceptación de este proyecto, tal como lo fija la EDT, no es "el servidor responde" — es un número concreto: **consultas de vecino más cercano en menos de 10ms sobre 100.000 features indexadas, sin tocar disco en cada request.** Poblar el índice en memoria con 100.000 puntos sintéticos (la misma función determinista del Capítulo 4.3) y medir una petición HTTP real de principio a fin —incluyendo la vuelta completa por la red local, no solo la función interna— da:

```text
índice en memoria poblado con 100.000 features sintéticas
GET /features/near sobre 100k features: 1.212644ms (respuesta: 107856 bytes)
```

**1.2 milisegundos**, casi un orden de magnitud por debajo del umbral, incluyendo la serialización JSON de miles de resultados (el radio de prueba de 5km sobre un dataset denso trae varios miles de coincidencias) y el viaje de ida y vuelta por loopback TCP. El cuello de botella de una API real casi nunca es el índice espacial en memoria —eso ya lo verificaste en el Capítulo 4.3— sino la red, la serialización, o la base de datos cuando el camino de *fallback* entra en juego.

## Ejercicio integrador (abierto)

Como en cada proyecto de cierre de módulo, este ejercicio no trae guía paso a paso.

**Añade `GET /features/within-polygon`**, un endpoint que reciba un polígono como parámetro (por ejemplo, como GeoJSON en el cuerpo de una petición `POST`, ya que un `Polygon` completo no cabe cómodamente en query params de una URL) y devuelva todas las features cuya geometría esté completamente contenida dentro de ese polígono.

Preguntas que vas a tener que resolver tú mismo:

- ¿Esta consulta debería ir contra el índice en memoria, contra PostGIS, o una combinación de ambos? (Pista: el índice en memoria solo guarda centroides — ¿alcanza eso para responder "¿está *completamente* contenida?", o hace falta la geometría real?)
- Si la respuesta involucra PostGIS: ¿qué función `ST_*` corresponde al predicado `Contains` del Capítulo 4.1? ¿Cómo construyes el polígono de consulta en SQL a partir del GeoJSON recibido?
- Si prefieres resolverlo en Rust puro después de traer candidatos de PostGIS: ¿qué trait del Capítulo 4.1 usarías para la verificación final, y sobre qué tipo de `geo_types`?

*Criterio de éxito:* un test de integración (levantando el servidor real, como hiciste en los checkpoints de este capítulo) que inserte al menos cuatro features —dos completamente dentro de un polígono de prueba, dos fuera o solo parcialmente solapadas— y confirme que `GET /features/within-polygon` devuelve exactamente las dos que corresponden, ni más ni menos.
