# 5.7 Proyecto guiado de cierre — GeoAPI v0.4 (streaming cloud-native)

Este capítulo cierra el Módulo 4 extendiendo el servidor del Capítulo 4.7 con los tres formatos cloud-native que acabas de aprender: teselas vectoriales servidas desde un único archivo PMTiles (5.4), features filtradas por bbox directamente sobre un FlatGeobuf remoto de más de un gigabyte (5.2), y un endpoint de reproyección por lotes paralelizado con Rayon (5.1). El hilo conductor de todo el capítulo: **ninguno de estos tres endpoints toca una base de datos.** GeoAPI v0.3 (Capítulo 4.7) dependía de PostGIS; GeoAPI v0.4 demuestra que un subconjunto real de una API GIS de producción puede servirse enteramente desde almacenamiento de objetos estático, más cómputo puro en el propio proceso.

## `GET /tiles/{z}/{x}/{y}` — teselas desde PMTiles sin backend

```rust,ignore
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use pmtiles::{AsyncPmTilesReader, HttpBackend, NoCache, TileCoord};
use std::sync::Arc;

#[derive(Clone)]
struct EstadoApp {
    pmtiles: Arc<AsyncPmTilesReader<HttpBackend, NoCache>>,
    fgb_url: String,
}

async fn tesela(
    State(estado): State<EstadoApp>,
    Path((z, x, y)): Path<(u8, u32, u32)>,
) -> Result<(HeaderMap, Vec<u8>), StatusCode> {
    let coord = TileCoord::new(z, x, y).map_err(|_| StatusCode::BAD_REQUEST)?;
    let datos = estado
        .pmtiles
        .get_tile_decompressed(coord)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    let mut headers = HeaderMap::new();
    headers.insert("content-type", "application/x-protobuf".parse().unwrap());
    Ok((headers, datos.to_vec()))
}
```

Nota el tipo de `EstadoApp::pmtiles`: `AsyncPmTilesReader<HttpBackend, NoCache>`, construido una sola vez al arrancar el servidor con `AsyncPmTilesReader::new_with_url(cliente, url)` apuntando al bucket (en este capítulo, un servidor HTTP que sirve archivos estáticos — el mismo rol que cumpliría S3 en producción). Cada petición a `/tiles/{z}/{x}/{y}` dispara, por debajo, exactamente una o dos peticiones `Range` contra ese archivo remoto — nunca una consulta SQL, nunca una base de datos.

```text
GET /tiles/1/1/1 -> "tesela-1-1-1"
```

## `GET /features/stream?bbox=` — sobre un FlatGeobuf remoto de más de 1GB

```rust,ignore
use axum::extract::{Query, State};
use axum::Json;
use flatgeobuf::{FeatureProperties, HttpFgbReader};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct ParametrosStream {
    bbox: String, // "minx,miny,maxx,maxy"
}

#[derive(Serialize)]
struct FeatureStreaming {
    nombre: String,
}

async fn features_stream(
    State(estado): State<EstadoApp>,
    Query(params): Query<ParametrosStream>,
) -> Result<Json<Vec<FeatureStreaming>>, StatusCode> {
    let partes: Vec<f64> = params.bbox.split(',').filter_map(|s| s.parse().ok()).collect();
    let [minx, miny, maxx, maxy] = partes[..] else {
        return Err(StatusCode::BAD_REQUEST);
    };

    let fgb = HttpFgbReader::open(&estado.fgb_url).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut it = fgb.select_bbox(minx, miny, maxx, maxy).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut resultado = Vec::new();
    while let Some(feature) = it.next().await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)? {
        let props = feature.properties().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        resultado.push(FeatureStreaming { nombre: props.get("nombre").cloned().unwrap_or_default() });
    }
    Ok(Json(resultado))
}
```

**Verificación del umbral de aceptación del proyecto:** la EDT exige que la API sirva un archivo remoto de más de 1GB transfiriendo solo el subconjunto relevante. Contra un `.fgb` real de **1.170.666.992 bytes** (1.17 GB, ~8.5 millones de features generadas deterministamente), una consulta con un bbox que cubre aproximadamente el 8% del área total del dataset transfirió:

```text
tamaño del archivo remoto: 1170666992 bytes (1.17 GB)
features en el bbox: 631174
[read_logger http-range] Total requests: 85 (90905928 bytes)
```

**90.9 MB transferidos — el 7.8% del archivo —** en 85 peticiones HTTP, para responder una consulta que trajo 631.174 de los 8.5 millones de features totales. La proporción de bytes transferidos (7.8%) coincide, dentro del margen esperado, con la proporción del área geográfica que cubría el bbox de consulta (~8%) — exactamente el comportamiento que un R-tree empaquetado (Capítulo 4.3) debería dar: el costo de la consulta escala con el tamaño del *resultado*, no con el tamaño del *archivo completo*. Un cliente que no usara este mecanismo tendría que descargar el gigabyte completo para responder la misma pregunta.

## `POST /features/reproject/batch` — paralelizado con Rayon hasta 1M de puntos

```rust,ignore
use axum::Json;
use proj::Proj;
use rayon::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
struct SolicitudReproyeccion {
    puntos: Vec<(f64, f64)>,
    crs_destino: String,
}

async fn reproject_batch(
    Json(body): Json<SolicitudReproyeccion>,
) -> Result<Json<Vec<(f64, f64)>>, StatusCode> {
    let n_hilos = rayon::current_num_threads();
    let tam_trozo = body.puntos.len().div_ceil(n_hilos).max(1);
    let crs = body.crs_destino.clone();

    // El mismo patrón "un Proj por trozo" verificado en el Capítulo 5.1 --
    // `Proj` no es `Sync`, y `map_init` no basta (llama a su inicializador
    // por cada división interna de trabajo, no una vez por hilo).
    let resultado = tokio::task::spawn_blocking(move || {
        body.puntos
            .par_chunks(tam_trozo)
            .flat_map(|trozo| {
                let t = Proj::new_known_crs("EPSG:4326", &crs, None).unwrap();
                trozo.iter().map(move |&p| t.convert(p).unwrap()).collect::<Vec<_>>()
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(resultado))
}
```

Nota `tokio::task::spawn_blocking`: la reproyección paralela con `rayon` es trabajo de CPU intensivo y **bloqueante** — ejecutarla directamente dentro de un handler `async` bloquearía el hilo del runtime de Tokio, impidiendo que atienda otras peticiones concurrentes mientras dura. `spawn_blocking` mueve ese trabajo a un *thread pool* separado, pensado exactamente para esto, y el handler `async` simplemente espera (`.await`) el resultado sin bloquear el runtime principal.

```text
POST /features/reproject/batch -> 1000000 puntos reproyectados en 490.333184ms
```

**Un gotcha real que vale la pena señalar:** al probar este endpoint con 1.000.000 de puntos por primera vez, la petición falló con un error de decodificación JSON vacío — ni un `400`, ni un mensaje claro. La causa: **axum limita el tamaño del cuerpo de una petición a 2MB por defecto** (`DefaultBodyLimit`), y 1 millón de coordenadas como JSON pesa varias decenas de MB, muy por encima de ese límite — la petición se rechazaba antes siquiera de llegar al handler. La solución es explícita, no automática:

```rust,ignore
let app = Router::new()
    // ... rutas ...
    .layer(axum::extract::DefaultBodyLimit::max(64 * 1024 * 1024)) // 64MB
    .with_state(estado);
```

Vas a ver este patrón —un límite por defecto sensato para el caso común, que hay que levantar explícitamente para el caso de "lote grande"— una y otra vez en frameworks web de producción (Capítulo 6.2 vuelve sobre middleware de este tipo con más profundidad). La lección aquí es concreta: **si tu API acepta lotes grandes, mide con un lote real del tamaño que anuncias soportar, no con uno de prueba pequeño** — el límite de payload no se manifiesta hasta que lo cruzas.

## Ejercicio integrador (abierto)

Como en cada proyecto de cierre de módulo, sin guía paso a paso.

**Añade un cuarto endpoint respaldado por un formato cloud-native no cableado todavía en este servidor** — Cloud-Optimized GeoTIFF (Capítulo 5.3), GeoParquet (Capítulo 5.4), o COPC (Capítulo 5.5), a tu elección. Reutiliza el mismo patrón de *streaming* que ya viste en este capítulo: el estado del servidor abre una conexión al archivo remoto (o lo mapea localmente), y el handler solo pide el subconjunto de datos que la petición del cliente necesita — nunca el archivo completo.

Preguntas que vas a tener que resolver tú mismo:

- Si eliges COG: ¿tu endpoint sirve una *overview* completa, o una ventana parcial como en el Capítulo 5.3? ¿Qué parámetro de query necesitarías para que el cliente pida una región específica?
- Si eliges GeoParquet: ¿cómo traduces un parámetro de bbox de la URL en un `Rect` que le pases a `intersecting_row_groups`?
- Si eliges COPC: ¿tu endpoint acepta un parámetro de nivel de detalle, o siempre sirve el mismo `LodSelection`?
- En cualquier caso: ¿tu endpoint necesita `spawn_blocking` (como `reproject_batch`) o puede quedarse completamente `async` (como `features_stream`)? ¿Qué determina la diferencia?

*Criterio de éxito:* un test de integración (levantando el servidor real, como en los capítulos de proyecto anteriores) que confirme que tu nuevo endpoint devuelve datos correctos para al menos dos peticiones con parámetros distintos, y una verificación explícita (con logging o instrumentación, como hiciste en este capítulo) de que la petición transfiere solo una fracción del archivo de origen, no el archivo completo.
