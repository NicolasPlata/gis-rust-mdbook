# Ruta de Aprendizaje Definitiva: Desarrollo de APIs GIS con Rust (Nivel 0 → Experto)

> Síntesis consolidada a partir de dos investigaciones independientes (`inv-gemini.md`, `inv-claude.md`). Ver [Nota de síntesis](#nota-de-síntesis-y-discrepancias-resueltas) al final para el criterio de contraste usado.

## Principio rector

Esta ruta **no enseña Rust de propósito general** ni GIS de escritorio: cada fase existe para acumular una capacidad concreta hacia un único objetivo — **diseñar, construir y operar APIs geoespaciales en producción**. El hilo conductor es un proyecto único que crece de fase en fase: **GeoAPI**, un servicio HTTP que evoluciona desde un binario CLI que parsea GeoJSON hasta una plataforma de teselas/features cloud-native con persistencia PostGIS, caché, streaming asíncrono y despliegue en producción.

Todo concepto teórico (topología, CRS, índices, formatos) se introduce únicamente en función de si un endpoint de una API GIS lo necesita para responder correctamente, rápido y de forma segura en memoria.

---

## Fase 0 — Fundamentos de Rust aplicados a datos espaciales (2–4 semanas)

Objetivo: tener el vocabulario del lenguaje necesario para no naufragar contra el *borrow checker* en cuanto aparezcan geometrías con millones de vértices.

| Foco | Conceptos | Por qué importa para una API GIS |
|---|---|---|
| Ownership/Borrowing | `&T`, `&mut T`, lifetimes básicos | Pasar una `LineString` de millones de coordenadas por referencia a un handler sin copiarla en cada request |
| Tipos algebraicos | `Result<T,E>`, `Option<T>`, `?` | Un endpoint nunca debe entrar en pánico por una geometría inválida o un CRS desconocido; debe devolver un error HTTP tipado |
| Traits y genéricos | `trait`, `impl Trait`, genéricos sobre `CoordFloat` | Entender por qué `geo` es genérico sobre `f32`/`f64` antes de tocarlo |
| Iteradores | `.iter()`, `.map()`, `.collect()`, zero-cost abstractions | Preparación directa para `rayon::par_iter()` en Fase 3 |
| Cargo y testing | workspaces, `cargo test`, `cargo bench` | Un proyecto API real es un workspace multi-crate (`api`, `core`, `db`) |

**Proyecto GeoAPI v0.1 (CLI, no servidor todavía):** binario que lee un CSV de coordenadas WGS84 y las deserializa a un `struct Coord { lat: f64, lon: f64 }`, validando con `Result` que estén en rango.

Recurso base: *The Rust Book* (gratuito, oficial).

---

## Fase 1 — Principiante: primitivas geoespaciales puras en Rust (4–8 semanas)

Objetivo: dominar el modelo de datos geométrico **100% Rust seguro** (`geo`/`geo-types`) antes de tocar cualquier binding FFI. Este orden es deliberado: el modelo de ownership se aprende mejor sin la fricción adicional de punteros C.

### 1.1 Teoría GIS mínima indispensable

- Modelo OGC **Simple Feature Access**: `Point`, `LineString`, `Polygon` (anillo exterior + interiores), variantes `Multi*`.
- CRS geográficos (lat/lon, EPSG:4326) vs. proyectados (metros, UTM/Web Mercator EPSG:3857) — la distinción que un endpoint de API debe resolver antes de aceptar cualquier `bbox` en la query string.
- Serialización: GeoJSON (RFC 7946) y WKT/WKB como los dos formatos de intercambio que cualquier API GIS debe poder emitir.

### 1.2 Crates

`geo-types` (tipos base, un `Point<f64>` ocupa 16 bytes — control de layout explícito), `geo` (algoritmos: áreas, distancias Haversine/Vincenty, simplificación Douglas-Peucker/Visvalingam-Whyatt), `geojson`, `wkt`, `serde`.

### 1.3 Proyecto GeoAPI v0.2 (todavía sin red)

Módulo de dominio (`crate geoapi-core`) que:
1. Deserializa una colección de `Feature` GeoJSON a `geo_types::Geometry`.
2. Expone funciones puras: área, longitud, centroide, simplificación con tolerancia parametrizable.
3. Serializa de vuelta a GeoJSON/WKT.

Este crate de dominio es el que la API HTTP de fases posteriores va a envolver — nunca se reescribe, solo se expone.

**Umbral para avanzar:** poder explicar, para un `Polygon`, por qué una función que solo lee la geometría se declara `fn area(p: &Polygon<f64>) -> f64` y no consume el valor.

---

## Fase 2 — Intermedio: índices, persistencia y el primer servidor real (8–14 semanas)

Objetivo: convertir el crate de dominio en un servicio HTTP con estado — índice espacial en memoria y persistencia en PostGIS — capaz de responder consultas espaciales reales bajo carga moderada.

### 2.1 Topología y robustez numérica

- DE-9IM completo vía el trait `Relate` de `geo` (contención, intersección, toque, solapamiento) — la base de cualquier endpoint tipo `GET /features?intersects=<geom>`.
- Predicados exactos de punto flotante: el crate `robust` (algoritmos de Shewchuk) evita que casi-colinealidades produzcan resultados topológicos inconsistentes en producción.

### 2.2 Índices espaciales

| Índice | Crate | Uso típico en una API |
|---|---|---|
| R\*-tree dinámico | `rstar` | Índice en memoria que se actualiza con inserciones/borrados en caliente (features editables) |
| R-tree/KD-tree empaquetado, zero-copy | `geo-index` | Dataset estático de solo lectura servido desde un único `Vec` contiguo, sin *cache misses* |
| Rejilla hexagonal jerárquica | `h3o` | Agregaciones espaciales a resolución uniforme (analítica, mapas de calor) |

### 2.3 Reproyección

`proj` (bindings a libproj 9.x vía `proj-sys`, distingue *projection* de *conversion*, normaliza a lon/lat) integrado con `geo-types` mediante el trait `Transform`. Cualquier endpoint que acepte un parámetro `crs=` en la query pasa por aquí.

### 2.4 Persistencia: PostGIS

- **SQLx** (async, verificación de queries en tiempo de compilación) + `geozero` con el feature `with-postgis-sqlx`: decodifica WKB/EWKB directo desde el *wire protocol* de Postgres a `geo_types::Polygon` sin representación intermedia.
- Alternativa ORM: **Diesel** con su módulo PostGIS, para equipos que prefieren DSL tipado sobre SQL crudo.
- Prácticas: `ST_SetSRID` al insertar, índices GiST, y el patrón *repository* para aislar el crate `api` del crate `db`.

### 2.5 I/O de formatos adicionales

`gdal` (FFI, "navaja suiza" de drivers ráster/vectoriales) + `ndarray` para álgebra de mapas (operaciones locales, focales, zonales, globales sobre un DEM); `shapefile` para compatibilidad con datos legados; `las`/`pasture` para una primera lectura de nubes de puntos LiDAR.

### 2.6 Proyecto GeoAPI v0.3 — Servidor REST con estado

Servicio HTTP (framework introducido formalmente en Fase 3, pero un prototipo mínimo con `axum` es válido aquí) que expone:
- `POST /features` — inserta una `Feature` en PostGIS vía SQLx.
- `GET /features/near?lat&lon&radius` — usa `rstar` en memoria como caché de índice, con *fallback* a `ST_DWithin` en PostGIS.
- `GET /features/reproject?crs=EPSG:3857` — reproyección on-the-fly con `proj`.

**Umbral para avanzar:** el servicio soporta 100k features indexadas y responde consultas de vecino más cercano en <10ms sin tocar disco en cada request.

---

## Fase 3 — Avanzado: concurrencia, formatos cloud-native y FFI seguro (10–16 semanas)

Objetivo: escalar GeoAPI de "responde rápido con datos en memoria/Postgres" a "sirve datasets de gigabytes/terabytes vía streaming HTTP sin cargarlos completos".

### 3.1 Paralelismo de datos

`rayon`: convertir `.iter()` en `.par_iter()` con *work-stealing*. Ideal para operaciones "vergonzosamente paralelas" — reproyectar un lote de features, recalcular NDVI celda a celda. Regla operativa: **paralelizar solo después de perfilar**; el paralelismo regular (ráster, listas independientes) es "fearless", el irregular (grafos, escritura compartida) exige `unsafe` o sincronización con costo.

### 3.2 Formatos cloud-native (la razón de ser de una API GIS moderna)

| Formato | Crate | Qué habilita en la API |
|---|---|---|
| **FlatGeobuf** | `flatgeobuf` | `HttpFgbReader`: la API reenvía HTTP Range Requests y filtra por bbox sin descargar el archivo completo (ej. servir un subconjunto de un archivo de 12GB en S3 leyendo solo cientos de KB) |
| **Cloud-Optimized GeoTIFF (COG)** | `gdal` (vía GDAL) | Extracción de bandas/resoluciones parciales de un ráster remoto vía HTTP GET Range |
| **PMTiles v3** | `pmtiles` | Backend de teselas vectoriales servido desde un único archivo en S3/objeto, sin base de datos activa |
| **GeoParquet / GeoArrow** | ecosistema `geoarrow-rs` | *Predicate pushdown* espacial: filtrar antes de materializar columnas en memoria, para analítica a gran escala |
| **COPC** (nubes de puntos) | `copc-rs` | Streaming de niveles de detalle (LOD) sobre un octree remoto vía HTTP |

### 3.3 I/O asíncrono

`tokio` como runtime, `reqwest` para requests salientes (incluyendo Range Requests), patrones de *streaming* de respuesta para no bufferizar payloads grandes en memoria del servidor.

### 3.4 FFI seguro (cuando el binding puro-Rust no basta)

Patrón `foo-sys` (bindings crudos vía `bindgen`) + `foo` (wrapper seguro): encapsular `unsafe` en un módulo pequeño con comentarios `// SAFETY:`, envolver punteros en tipos con `Drop` (RAII) para liberar recursos C, convertir nulos en `Option` y códigos de error en `Result`. Aplica directamente a `geos` (bindings a GEOS, geometrías preparadas para consultas repetidas, `PreparedGeometry`) cuando se necesita paridad algorítmica exacta con PostGIS/QGIS.

### 3.5 Proyecto GeoAPI v0.4 — Streaming cloud-native

Extiende el servidor para:
- Servir teselas vectoriales MVT desde un archivo PMTiles alojado en S3, sin backend de base de datos para esa ruta.
- Exponer `GET /features/stream?bbox=` sobre un FlatGeobuf remoto, devolviendo solo los bytes que intersectan el bbox.
- Paralelizar con `rayon` un endpoint batch de reproyección de hasta 1M de puntos.

**Umbral para avanzar:** la API sirve un dataset de >5GB alojado en almacenamiento de objetos con un costo de transferencia real de kilobytes por consulta típica.

---

## Fase 4 — Experto: arquitectura de APIs GIS de producción (8–12 semanas, continuo)

Objetivo: llevar GeoAPI de "funciona" a "opera con SLA, se escala horizontalmente y es mantenible por un equipo".

### 4.1 Framework web y arquitectura de servicio

- **Axum** (equipo Tokio, integración nativa con Tower) como default recomendado para proyectos nuevos por ergonomía de *extractors* y manejo de errores con `?`.
- **Actix-web** como alternativa cuando un *benchmark real* sobre la carga propia muestra que el throughput adicional (~10–15% en escenarios extremos) justifica el modelo de actores.
- **Tower**: middleware componible — timeouts, rate-limiting, tracing — compartido entre ambos frameworks.
- Caché de respuestas (ej. `moka` en memoria, o Redis para caché distribuida) para interceptar peticiones GET repetidas de teselas idénticas y proteger PostGIS de regeneración innecesaria.

### 4.2 Contratos de API GIS estándar

- MVT (Mapbox Vector Tiles) como formato de respuesta para teselas — estudiar el patrón de referencia del servidor **Martin** (descubrimiento automático de tablas/funciones PostGIS, paso directo desde PMTiles, exposición de TileJSON).
- Endpoints tipo OGC API Features / WFS / WMS cuando la interoperabilidad con clientes GIS estándar (QGIS, ArcGIS) es un requisito.
- Diseño de paginación, *bounding box* como parámetro de primera clase, y content negotiation (GeoJSON vs. MVT vs. GeoParquet) según el cliente.

### 4.3 Observabilidad, resiliencia y despliegue

- `tracing` + exportación a un backend de observabilidad; métricas de latencia por endpoint espacial (las consultas con `ST_Intersects` sobre geometrías grandes son las que más varían).
- Contenerización y despliegue; consideración de límites de memoria dado que un R-tree en memoria o un caché de teselas crece con el dataset.
- Compilación a **WebAssembly** de la lógica de dominio pura (`geoapi-core`, sin FFI) para delegar reproyecciones o validaciones topológicas al cliente (navegador) y reducir *round-trips* — aplicable cuando el crate de dominio se mantuvo libre de bindings C desde la Fase 1.

### 4.4 Proyecto GeoAPI v1.0 — Plataforma de producción

Consolidación de todo lo anterior en un despliegue real: API REST + servidor de teselas + capa de caché + observabilidad + CI con tests de integración contra una instancia PostGIS efímera.

---

## Mapa de crates por fase (referencia rápida)

| Fase | Crates núcleo |
|---|---|
| 0 | `std`, `cargo`, sin dependencias GIS |
| 1 | `geo-types`, `geo`, `geojson`, `wkt`, `serde` |
| 2 | `rstar`, `geo-index`, `h3o`, `robust`, `proj`, `sqlx`, `diesel`, `geozero`, `gdal`, `ndarray`, `shapefile`, `las`, `pasture` |
| 3 | `rayon`, `flatgeobuf`, `pmtiles`, `copc-rs`, `geoarrow`/`geoparquet`, `tokio`, `reqwest`, `geos`, `gdal-sys`/`bindgen` |
| 4 | `axum`, `actix-web`, `tower`, `moka`, `tracing`, patrones Martin (OGC API Features/WFS/WMS/MVT) |

## Recursos base

- *The Rust Book* (fundamentos del lenguaje, gratuito).
- *Geospatial Rust* (book.georust.org) — referencia específica del ecosistema GeoRust.
- Repositorio y documentación de **Martin** (github.com/maplibre/martin) como *blueprint* arquitectónico de referencia para el Módulo 4.
- Discord/comunidad de GeoRust para contribuir una vez alcanzada la Fase 3 — acelera el dominio avanzado y es la vía natural de validación entre pares.

---

## Nota de síntesis y discrepancias resueltas

Al contrastar ambas investigaciones se optó por lo siguiente:

1. **Crates no verificables se excluyeron.** `inv-gemini.md` menciona varios paquetes (`oxigdal`, `oxigdal-algorithms`, `oxigdal-flatgeobuf`, `oxigdal-pmtiles`, `packed_spatial_index_geo`, `axum-response-cache`, `copc_streaming`, `copc_converter`, `laz-parallel`/`copc-parallel` como *feature flags*) que no pude confirmar como crates reales publicados. Se sustituyeron por alternativas verificables de `inv-claude.md` (`gdal`, `flatgeobuf`, `pmtiles`, `copc-rs`, `moka`/Tower para caché) o se omitieron.
2. **Orden pedagógico:** se adoptó explícitamente la recomendación de `inv-claude.md` de dominar primero el Rust 100% seguro (`geo`/`geo-types`) antes de los *bindings* FFI (`gdal`, `geos`, `proj`) — criterio ausente como recomendación explícita en `inv-gemini.md`, aunque ambos documentos coinciden en la progresión general de fases.
3. **Enfoque de API:** ninguno de los dos documentos originales está estructurado explícitamente alrededor de "construir una API"; esta ruta consolidada reencuadra ambos temarios alrededor de un proyecto único progresivo (GeoAPI) para cumplir el requisito de foco ineludible en desarrollo de APIs GIS.
4. **Framework web:** se adoptó la comparación Axum/Actix-web de `inv-claude.md` (más específica, con cifras de throughput y recomendación condicionada) sobre la mención más genérica de Axum en `inv-gemini.md`.
5. **Cifras de versión/adopción** (ej. `geo` 0.33.1, Martin 1.15.0) provienen de `inv-claude.md`; se citan como referencia de estado del ecosistema al momento de la investigación, no como garantía de vigencia — deben verificarse contra crates.io antes de fijarlas en un `Cargo.toml` de producción.
