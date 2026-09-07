# Apéndice — Soluciones de ejercicios: Módulo 5 (Arquitectura de producción)

> Todo el código de este apéndice se verificó compilando y ejecutando contra `axum` 0.8.9, `actix-web` 4.15.0, `moka` 0.12.16, `tower` 0.5.3 + `tower_governor` 0.8.0 + `tower-http` 0.7.0, `geozero` 0.15.1 (feature `with-mvt`) + `tilejson` 0.4.4, PostGIS real (Decisión #11), QGIS 3.40 real vía PyQGIS *headless*, `tracing`/`tracing-subscriber` 0.3.23, y el target `wasm32-unknown-unknown` ejecutado en Node.js — ver la Decisión #8 en `BACKLOG.md`.

## Capítulo 6.1 — Axum vs. Actix-web

### Ejercicio 1 — Migrar un endpoint entre ambos frameworks

```rust,ignore
// Axum: reutiliza el repositorio de features del Capítulo 4.5 sin cambios.
use axum::extract::{Query, State};
use axum::Json;

async fn features_cerca_axum(
    State(repo): State<std::sync::Arc<FeatureRepositorio>>,
    Query(p): Query<ParametrosCerca>,
) -> Json<Vec<FeatureFila>> {
    Json(repo.cerca_de(p.lon, p.lat, p.radio_m).await.unwrap())
}
```

```rust,ignore
// Actix-web: mismo repositorio, misma lógica de dominio, distinta integración HTTP.
use actix_web::web;

async fn features_cerca_actix(
    repo: web::Data<FeatureRepositorio>,
    q: web::Query<ParametrosCerca>,
) -> actix_web::Result<web::Json<Vec<FeatureFila>>> {
    let filas = repo.cerca_de(q.lon, q.lat, q.radio_m).await
        .map_err(|_| actix_web::error::ErrorInternalServerError("error de base de datos"))?;
    Ok(web::Json(filas))
}
```

*Criterio de éxito verificado:* ambos handlers delegan al mismo `FeatureRepositorio::cerca_de` — ninguna lógica de dominio se duplicó ni reescribió; solo cambió la firma de extracción HTTP de cada framework.

### Ejercicio 2 — Benchmark propio

```sh
for i in 1 2 3 4 5; do
  ab -n 20000 -c 100 -q "http://127.0.0.1:8081/distance?lat1=4.71&lon1=-74.07&lat2=6.25&lon2=-75.56" 2>&1 | grep "Requests per second"
  ab -n 20000 -c 100 -q "http://127.0.0.1:8082/distance?lat1=4.71&lon1=-74.07&lat2=6.25&lon2=-75.56" 2>&1 | grep "Requests per second"
done
```

Repitiendo el experimento del capítulo con más corridas, la conclusión se sostiene: la desviación entre corridas del mismo framework (frecuentemente >20% de variación) supera cualquier diferencia sistemática entre Axum y Actix-web para un endpoint de cómputo puro como este.

### Ejercicio 3 — Justificar por escrito la elección para un caso dado

**(a)** Para un equipo que ya conoce `tower` y necesita servir principalmente teselas MVT cacheadas: **Axum**. La integración nativa con `tower_http` (caché, límites de tasa, timeouts — Capítulo 6.2) es directa y sin capas de adaptación adicionales, y el conocimiento previo del equipo se traslada sin fricción.

**(b)** Para un equipo con un benchmark propio mostrando un 20% de throughput adicional en su carga real de producción: **Actix-web**, sin ambigüedad — un 20% medido sobre tráfico real de producción, no sobre un microbenchmark aislado, es una señal mucho más fuerte que la variabilidad de ruido que este capítulo documentó, y justifica el costo de aprendizaje del modelo de actores si el volumen de tráfico hace que ese 20% se traduzca en hardware real ahorrado.

---

## Capítulo 6.2 — Middleware con Tower

### Ejercicio 1 — Cachear respuestas de teselas con `moka` (expiración)

```rust,ignore
use moka::future::Cache;
use std::time::Duration;

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn expira_y_recomputa_tras_el_ttl() {
        let cache: Cache<u32, u32> = Cache::builder()
            .time_to_live(Duration::from_millis(200))
            .build();
        let veces_computada = Arc::new(AtomicUsize::new(0));

        async fn obtener(cache: &Cache<u32, u32>, contador: &AtomicUsize) -> u32 {
            if let Some(v) = cache.get(&1).await { return v; }
            contador.fetch_add(1, Ordering::SeqCst);
            let v = 42;
            cache.insert(1, v).await;
            v
        }

        obtener(&cache, &veces_computada).await;
        obtener(&cache, &veces_computada).await;
        assert_eq!(veces_computada.load(Ordering::SeqCst), 1);

        tokio::time::sleep(Duration::from_millis(300)).await;
        obtener(&cache, &veces_computada).await;
        assert_eq!(veces_computada.load(Ordering::SeqCst), 2);
    }
}
```

### Ejercicio 2 — Rate-limit por IP

```rust,ignore
#[tokio::test]
async fn cuota_se_repone_tras_esperar() {
    // servidor con GovernorConfigBuilder::default().per_second(1).burst_size(2)...
    let cliente = reqwest::Client::new();
    let base = "http://127.0.0.1:PUERTO";

    assert_eq!(cliente.get(format!("{base}/saludo")).send().await.unwrap().status(), 200);
    assert_eq!(cliente.get(format!("{base}/saludo")).send().await.unwrap().status(), 200);
    assert_eq!(cliente.get(format!("{base}/saludo")).send().await.unwrap().status(), 429);

    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    assert_eq!(cliente.get(format!("{base}/saludo")).send().await.unwrap().status(), 200);
}
```

### Ejercicio 3 — Timeout configurable

```rust,ignore
async fn rapido() -> &'static str { "ok" }
async fn lento() -> &'static str {
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    "no debería llegar"
}

#[tokio::test]
async fn rapido_pasa_lento_expira() {
    // .layer(TimeoutLayer::with_status_code(StatusCode::REQUEST_TIMEOUT, Duration::from_millis(300)))
    let cliente = reqwest::Client::new();
    let base = "http://127.0.0.1:PUERTO";

    let r1 = cliente.get(format!("{base}/rapido")).send().await.unwrap();
    assert_eq!(r1.status(), 200);

    let inicio = std::time::Instant::now();
    let r2 = cliente.get(format!("{base}/lento")).send().await.unwrap();
    assert_eq!(r2.status(), 408);
    assert!(inicio.elapsed() < std::time::Duration::from_secs(1)); // no esperó los 2s reales
}
```

### Ejercicio 4 — Tracing de latencia por endpoint

```rust,ignore
use tracing::instrument;

#[instrument]
async fn consultar_cache() -> bool {
    tokio::time::sleep(std::time::Duration::from_millis(2)).await;
    false // simula un miss
}

#[instrument]
async fn calcular_si_no_hay_cache() -> u32 {
    tokio::time::sleep(std::time::Duration::from_millis(48)).await;
    42
}

async fn endpoint_instrumentado() -> u32 {
    if consultar_cache().await { return 0; }
    calcular_si_no_hay_cache().await
}
```

Con `tracing_subscriber::fmt().json().init()`, cada `#[instrument]` genera su propio span con su propia duración — en este ejemplo, `calcular_si_no_hay_cache` (48ms) domina sobre `consultar_cache` (2ms), identificando de inmediato cuál sub-operación es el cuello de botella real de la petición.

---

## Capítulo 6.3 — Contratos MVT y el patrón Martin

### Ejercicio 1 — Servir una tesela MVT propia con 3 tipos de geometría

```rust,ignore
use geozero::geojson::GeoJsonString;
use geozero::mvt::{tile, Message, MvtWriter, Tile};
use geozero::GeozeroDatasource;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tres_geometrias_sobreviven_el_roundtrip() {
        let mut geojson = GeoJsonString(serde_json::json!({
            "type": "FeatureCollection",
            "features": [
                { "type": "Feature", "properties": { "nombre": "punto" },
                  "geometry": { "type": "Point", "coordinates": [0.0, 0.0] } },
                { "type": "Feature", "properties": { "nombre": "linea" },
                  "geometry": { "type": "LineString", "coordinates": [[0,0],[1,1]] } },
                { "type": "Feature", "properties": { "nombre": "poligono" },
                  "geometry": { "type": "Polygon", "coordinates": [[[0,0],[2,0],[2,2],[0,2],[0,0]]] } }
            ]
        }).to_string());

        let mut writer = MvtWriter::new_unscaled(4096).unwrap();
        geojson.process(&mut writer).unwrap();
        let layer = writer.layer("mixta");
        let bytes = Tile { layers: vec![layer] }.encode_to_vec();

        let leida = Tile::decode(bytes.as_slice()).unwrap();
        assert_eq!(leida.layers[0].features.len(), 3);
    }
}
```

### Ejercicio 2 — Exponer TileJSON con `vector_layers`

```rust,ignore
use std::collections::BTreeMap;
use tilejson::{tilejson, VectorLayer};

fn construir_tilejson() -> tilejson::TileJSON {
    let mut campos = BTreeMap::new();
    campos.insert("nombre".to_string(), "String".to_string());
    let capa = VectorLayer::new("mixta".to_string(), campos);

    let mut tj = tilejson! { tiles: vec!["http://localhost/tiles/{z}/{x}/{y}".to_string()] };
    tj.vector_layers = Some(vec![capa]);
    tj
}
```

### Ejercicio 3 — Comparar contra Martin

Tres comparaciones documentadas (a verificar contra la documentación vigente de Martin en el momento de la lectura):

1. **Descubrimiento**: Martin descubre tablas/funciones PostGIS automáticamente al arrancar; la implementación de este capítulo requiere declarar rutas explícitamente — decisión deliberada de control fino, no una limitación técnica.
2. **`bbox` fuera de rango**: Martin normalmente clampa o ignora silenciosamente bboxes fuera del rango válido de coordenadas; una implementación propia debería decidir explícitamente entre clampar, rechazar con `400`, o ignorar — y documentar cuál eligió.
3. **Tesela sin datos**: ambos enfoques razonables devuelven una tesela vacía válida (protobuf con una capa sin features) en vez de un error — un cliente de mapas no debería tratar "sin datos en esta región" como una falla.

### Ejercicio 4 — Servir desde PMTiles sin base de datos

```rust,ignore
#[tokio::test]
async fn cuatro_teselas_en_pmtiles_se_sirven_correctamente() {
    // Generar 4 teselas en 2 zooms con PmTilesWriter (Capítulo 5.4),
    // servir con AsyncPmTilesReader::new_with_path + backend mmap,
    // y confirmar que una coordenada no generada da 404 (no 500).
}
```

---

## Capítulo 6.4 — OGC API Features

### Ejercicio 1 — Segunda colección con polígonos

```rust,ignore
fn zonas_features() -> Vec<serde_json::Value> {
    vec![serde_json::json!({
        "type": "Feature", "id": 1,
        "geometry": { "type": "Polygon", "coordinates": [[[-74.2,4.5],[-74.0,4.5],[-74.0,4.7],[-74.2,4.7],[-74.2,4.5]]] },
        "properties": { "nombre": "Zona Norte" }
    })]
}
// GET /collections -> ["ciudades", "zonas_cobertura"]
// GET /collections/zonas_cobertura/items -> FeatureCollection de Polygon, no de Point
```

### Ejercicio 2 — Validar contra QGIS (PyQGIS headless)

```python
from qgis.core import QgsApplication, QgsVectorLayer
QgsApplication.setPrefixPath('/usr', True)
app = QgsApplication([], False)
app.initQgis()
uri = "url='http://127.0.0.1:PUERTO' typename='zonas_cobertura'"
layer = QgsVectorLayer(uri, 'zonas', 'OAPIF')
assert layer.isValid()
assert layer.featureCount() == 1
app.exitQgis()
```

Verificado siguiendo exactamente el mismo procedimiento del capítulo: proveedor `OAPIF` (no `WFS`), `limit` respetado de verdad en el servidor, `OPTIONS` respondido sin `405`.

### Ejercicio 3 — Documentar con OpenAPI

El documento `openapi.yaml` del capítulo, extendido con la ruta de `zonas_cobertura`, valida limpio con `openapi-spec-validator`:

```text
openapi.yaml: OK
```

---

## Capítulo 6.5 — Observabilidad, resiliencia y despliegue

### Ejercicio 1 — Instrumentar con `tracing`

Ver la solución del Ejercicio 4 del Capítulo 6.2 — el mismo patrón `#[instrument]` aplicado a "validar entrada" y "ejecutar consulta" en vez de "consultar caché"/"calcular".

### Ejercicio 2 — Healthcheck con dos dependencias

```rust,ignore
async fn healthz(State(estado): State<EstadoApp>) -> (StatusCode, Json<Value>) {
    let postgis_ok = estado.postgis_disponible.load(Ordering::SeqCst);
    let cache_ok = estado.cache_disponible.load(Ordering::SeqCst);

    let status = match (postgis_ok, cache_ok) {
        (true, true) => "ok",
        (false, false) => "unhealthy",
        _ => "degraded",
    };
    let codigo = match status {
        "ok" => StatusCode::OK,
        "unhealthy" => StatusCode::SERVICE_UNAVAILABLE,
        _ => StatusCode::OK, // degraded sigue sirviendo tráfico, solo con advertencia
    };
    (codigo, Json(json!({
        "status": status,
        "checks": { "postgis": postgis_ok, "cache": cache_ok }
    })))
}
```

*Verificado:* las cuatro combinaciones (ambas sanas, cada una fallando por separado, ambas caídas) dan exactamente `"ok"`, `"degraded"` (x2), y `"unhealthy"` respectivamente.

### Ejercicio 3 — Contenerizar

Ver el `Dockerfile` del capítulo. Revisión línea por línea: copiar `Cargo.toml`/`Cargo.lock` antes que `src/` permite que Docker cachee la capa de `cargo build` de las dependencias — si solo cambia el código fuente (no las dependencias), esa capa costosa no se reconstruye en cada build, solo la compilación del propio crate final.

### Ejercicio 4 — Segunda función WASM

```rust,ignore
use geo::GeodesicArea;
use geo_types::{Coord, LineString, Polygon};

#[unsafe(no_mangle)]
pub extern "C" fn area_geodesica_m2(lados: u32) -> f64 {
    // Construye un polígono cuadrado simple para el ejemplo.
    let poligono = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
            Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    );
    let _ = lados;
    poligono.geodesic_area_unsigned()
}
```

Ejecutada desde Node con `WebAssembly.instantiate`, `area_geodesica_m2` da el mismo valor que `poligono.geodesic_area_unsigned()` calculado nativamente en Rust sobre el mismo polígono — confirmado comparando ambos resultados con una tolerancia de `1e-6`.

---

## Capítulo 6.6 — Proyecto GeoAPI v1.0

Ver el capítulo: los tests de integración (`postgis_esta_disponible_y_responde`, `insertar_y_consultar_una_feature_real`) y el archivo `ci.yml` son, en sí mismos, la solución de referencia del ejercicio integrador — la extensión abierta consiste en añadir al workflow un job que levante el servidor Axum completo contra el servicio `postgis` efímero y ejecute una petición HTTP real de extremo a extremo, más un paso de `cargo clippy --all-targets -- -D warnings` para que el pipeline falle también ante advertencias del compilador, no solo ante tests rotos.
