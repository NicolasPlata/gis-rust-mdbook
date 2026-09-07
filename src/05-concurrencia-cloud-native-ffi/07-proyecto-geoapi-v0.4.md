# 5.7 Proyecto guiado de cierre — GeoAPI v0.4 (streaming cloud-native)

Este capítulo cierra el Módulo 4 extendiendo el servidor del Capítulo 4.8 con los tres formatos cloud-native que acabas de aprender: teselas vectoriales servidas desde un único archivo PMTiles (5.4), features filtradas por bbox directamente sobre un FlatGeobuf remoto de más de un gigabyte (5.2), y un endpoint de reproyección por lotes paralelizado con Rayon (5.1). El hilo conductor de todo el capítulo: **ninguno de estos tres endpoints toca una base de datos.** GeoAPI v0.3 (Capítulo 4.8) dependía de PostGIS; GeoAPI v0.4 demuestra que un subconjunto real de una API GIS de producción puede servirse enteramente desde almacenamiento de objetos estático, más cómputo puro en el propio proceso.

## `GET /tiles/{z}/{x}/{y}` — teselas desde PMTiles sin backend

**Historia de usuario:** Como portal de datos abiertos de un gobierno, quiero publicar un atlas de teselas vectoriales sin mantener un servidor de teselas activo, para reducir costos de infraestructura sin sacrificar disponibilidad.

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

**Historia de usuario:** Como portal de datos abiertos, quiero servir los límites administrativos nacionales completos sin que el cliente descargue el archivo entero, para que una consulta de un solo municipio no cueste transferir el país completo.

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

**Historia de usuario:** Como oficina de censo nacional, quiero reproyectar millones de puntos de coordenadas en un tiempo razonable, para publicar los resultados del censo sin que el procesamiento geoespacial se convierta en el cuello de botella del proyecto.

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

**Al estilo TDD:** las tres secciones de este capítulo se verificaron arriba con salida impresa — suficiente para *ver* que funciona, pero no para confirmarlo automáticamente después de un cambio. Con el router completo ya armado, un test de integración real que ejercite las tres a la vez, contra archivos de prueba pequeños servidos localmente (nunca contra el archivo de 1.17GB del capítulo — un test no necesita el dataset completo, solo necesita ejercitar el mismo camino de código):

```rust,ignore
#[cfg(test)]
mod tests {
    use super::*;
    use flatgeobuf::{ColumnType, FgbWriter, GeometryType as FgbGeometryType};
    use geozero::{ColumnValue, PropertyProcessor};

    fn escribir_fgb_de_prueba(ruta: &str) {
        let mut fgb = FgbWriter::create("ciudades", FgbGeometryType::Point).unwrap();
        fgb.add_column("nombre", ColumnType::String, |_, _| {});
        let ciudades = [
            ("Bogotá", -74.0721, 4.7110),
            ("Medellín", -75.5636, 6.2518),
            ("Cali", -76.5225, 3.4372),
        ];
        for (nombre, lon, lat) in ciudades {
            fgb.add_feature_geom(geo_types::Geometry::Point(geo_types::Point::new(lon, lat)), |feat| {
                feat.property(0, "nombre", &ColumnValue::String(nombre)).unwrap();
            }).unwrap();
        }
        let mut archivo = std::io::BufWriter::new(std::fs::File::create(ruta).unwrap());
        fgb.write(&mut archivo).unwrap();
    }

    #[tokio::test]
    async fn flujo_completo_de_las_tres_secciones() {
        let dir_tmp = std::env::temp_dir().join(format!("geoapi_v04_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir_tmp).unwrap();
        escribir_pmtiles(dir_tmp.join("prueba.pmtiles").to_str().unwrap());
        escribir_fgb_de_prueba(dir_tmp.join("ciudades.fgb").to_str().unwrap());

        let app_estatico = Router::new().fallback_service(ServeDir::new(&dir_tmp));
        let listener_estatico = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let direccion_estatica = listener_estatico.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener_estatico, app_estatico).await.unwrap() });

        let cliente_setup = reqwest::Client::new();
        let pmtiles_reader = AsyncPmTilesReader::new_with_url(
            cliente_setup, format!("http://{direccion_estatica}/prueba.pmtiles"),
        ).await.unwrap();

        let estado = EstadoApp {
            pmtiles: Arc::new(pmtiles_reader),
            fgb_url: format!("http://{direccion_estatica}/ciudades.fgb"),
        };
        let app = Router::new()
            .route("/tiles/{z}/{x}/{y}", get(tesela))
            .route("/features/stream", get(features_stream))
            .route("/features/reproject/batch", post(reproject_batch))
            .layer(axum::extract::DefaultBodyLimit::max(64 * 1024 * 1024))
            .with_state(estado);

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let direccion = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let cliente = reqwest::Client::new();
        let base = format!("http://{direccion}");

        // --- PMTiles: tesela existente vs. inexistente ---
        let resp = cliente.get(format!("{base}/tiles/0/0/0")).send().await.unwrap();
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.bytes().await.unwrap().as_ref(), b"tesela-0-0-0");

        let resp = cliente.get(format!("{base}/tiles/5/5/5")).send().await.unwrap();
        assert_eq!(resp.status(), 404, "una tesela no escrita debe dar 404, no un error de servidor");

        // --- FlatGeobuf: bbox que cubre solo Bogotá ---
        let resp = cliente
            .get(format!("{base}/features/stream?bbox=-74.20,4.50,-74.00,4.90"))
            .send().await.unwrap();
        let features: Vec<serde_json::Value> = resp.json().await.unwrap();
        assert_eq!(features.len(), 1, "el bbox de prueba solo debe cubrir Bogotá");
        assert_eq!(features[0]["nombre"], "Bogotá");

        // --- Rayon: reproyección por lotes, correctitud (no solo velocidad) ---
        let puntos = vec![(-74.0721, 4.7110), (-75.5636, 6.2518), (-76.5225, 3.4372)];
        let reproyectados: Vec<(f64, f64)> = cliente
            .post(format!("{base}/features/reproject/batch"))
            .json(&serde_json::json!({ "puntos": puntos, "crs_destino": "EPSG:32618" }))
            .send().await.unwrap().json().await.unwrap();

        let transformador = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
        for (original, calculado) in puntos.iter().zip(reproyectados.iter()) {
            let esperado = transformador.convert(*original).unwrap();
            assert!((calculado.0 - esperado.0).abs() < 1e-6);
            assert!((calculado.1 - esperado.1).abs() < 1e-6);
        }

        std::fs::remove_dir_all(&dir_tmp).ok();
    }
}
```

Verificado: el test pasa. La reproyección paralela se confirma comparando cada punto de salida contra una transformación hecha por fuera, punto por punto, con `proj` directamente — así el test no solo confirma "no dio error", confirma que el resultado paralelo es *idéntico* al secuencial, la misma disciplina que ya viste al comparar `map_init` contra `par_chunks` en el Capítulo 5.1.

## Ejercicio integrador (abierto)

Como en cada proyecto de cierre de módulo, sin guía paso a paso.

**Historias de usuario — elige la que corresponda al formato que elijas:**
- *COG:* Como agencia ambiental, quiero consultar solo la ventana de un modelo de elevación global que me interesa, para no descargar gigabytes de un DEM mundial cuando solo necesito una región específica.
- *COPC:* Como empresa de inspección de infraestructura, quiero consultar una nube de puntos LiDAR de un dron por nivel de detalle, para inspeccionar una torre eléctrica sin cargar la nube completa de un vuelo de horas.

**Añade un cuarto endpoint respaldado por un formato cloud-native no cableado todavía en este servidor** — Cloud-Optimized GeoTIFF (Capítulo 5.3), GeoParquet (Capítulo 5.4), o COPC (Capítulo 5.5), a tu elección. Reutiliza el mismo patrón de *streaming* que ya viste en este capítulo: el estado del servidor abre una conexión al archivo remoto (o lo mapea localmente), y el handler solo pide el subconjunto de datos que la petición del cliente necesita — nunca el archivo completo.

Preguntas que vas a tener que resolver tú mismo:

- Si eliges COG: ¿tu endpoint sirve una *overview* completa, o una ventana parcial como en el Capítulo 5.3? ¿Qué parámetro de query necesitarías para que el cliente pida una región específica?
- Si eliges GeoParquet: ¿cómo traduces un parámetro de bbox de la URL en un `Rect` que le pases a `intersecting_row_groups`?
- Si eliges COPC: ¿tu endpoint acepta un parámetro de nivel de detalle, o siempre sirve el mismo `LodSelection`?
- En cualquier caso: ¿tu endpoint necesita `spawn_blocking` (como `reproject_batch`) o puede quedarse completamente `async` (como `features_stream`)? ¿Qué determina la diferencia?

*Criterio de éxito:* un test de integración (levantando el servidor real, como en los capítulos de proyecto anteriores) que confirme que tu nuevo endpoint devuelve datos correctos para al menos dos peticiones con parámetros distintos, y una verificación explícita (con logging o instrumentación, como hiciste en este capítulo) de que la petición transfiere solo una fracción del archivo de origen, no el archivo completo.

**Extensión opcional — FFI seguro (Capítulo 5.6).** Ningún endpoint de este capítulo usa el wrapper de GEOS, así que si quieres practicar 5.6 antes de seguir adelante, aquí tienes una tercera historia de usuario, independiente de las anteriores:

**Historia de usuario:** Como organismo catastral, quiero validar que cada geometría de un lote recibido sea topológicamente válida antes de aceptar el envío, para rechazar datos corruptos antes de que contaminen la base de datos oficial.

Añade una validación a `POST /features/reproject/batch` (o a un endpoint nuevo, a tu elección) que use el wrapper seguro de GEOS del Capítulo 5.6 para rechazar, con un mensaje específico, cualquier geometría de entrada que no sea topológicamente válida — sin escribir el algoritmo de validación tú mismo, reutilizando lo que ya construiste (o el ejercicio de `área()` que resolviste ahí). Mismo criterio de aceptación: un test de integración real, con al menos una geometría válida aceptada y una inválida rechazada con el motivo correcto.
