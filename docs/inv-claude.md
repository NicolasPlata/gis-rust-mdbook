# Ruta de aprendizaje completa para convertirse en desarrollador GIS especializado en Rust

## TL;DR
- Rust es una opción sólida (no un "silver bullet") para ingeniería GIS de alto rendimiento: el colectivo **GeoRust** provee un ecosistema maduro (`geo` 0.33.1, `geo-types`, `rstar`, `geozero`, `proj`, `gdal`, `flatgeobuf`) que permite construir desde geometrías vectoriales y análisis topológico hasta servidores de teselas de producción como Martin (1.15.0).
- La ruta óptima progresa en tres fases: (1) fundamentos de Rust (ownership/borrowing, `Result`/`Option`, zero-cost abstractions, `#[repr(C)]`, `unsafe` contenido) + teoría GIS (CRS/datums, geometría vectorial OGC Simple Features, álgebra de mapas ráster, índices espaciales); (2) dominio del ecosistema de crates y formatos (vectorial, ráster, LiDAR LAS/LAZ, formatos cloud-native COG/PMTiles/FlatGeobuf/GeoParquet); (3) integración avanzada (PostGIS vía SQLx, FFI con GDAL/GEOS/PROJ, servicios web con Axum/Actix-web y paralelismo con Rayon).
- Recomendación clave: aprender primero los tipos puros de Rust (`geo`/`geo-types`, todo en Rust seguro) antes de los *bindings* FFI (`gdal`, `geos`, `proj`), porque estos últimos introducen dependencias de sistema C/C++ y `unsafe` que conviene entender solo tras dominar el modelo de propiedad.

## Key Findings

1. **El núcleo del ecosistema es GeoRust.** GeoRust es un colectivo que mantiene crates de computación geoespacial en Rust. El crate central `geo` (v0.33.1, publicado el 9 de julio de 2026) provee tipos primitivos (`Point`, `LineString`, `Polygon`) más un catálogo amplio de algoritmos: soporte DE-9IM completo, operaciones booleanas (unión, intersección, diferencia, xor, clip), *buffer*/offset, clustering DBSCAN y k-means, triangulación de Delaunay (constreñida y no constreñida), diagramas de Voronoi, cascos convexos y cóncavos, simplificación (Douglas-Peucker y Visvalingam-Whyatt), y distancias/longitudes en múltiples espacios métricos (Euclídeo, Haversine, Vincenty, geodésico de Karney). El crate `geo` v0.33.1 acumula 20.491.317 descargas históricas y alrededor de 1,8 millones mensuales; el crate de tipos base `geo-types` supera los 25 millones históricos.

2. **`geo-types` es la base de interoperabilidad.** Define los tipos comunes reexportados por todo el ecosistema; sus geometrías son genéricas sobre el tipo numérico (`f64` por defecto, pero admite `f32`, `i32`, etc.) y adhieren al estándar OpenGIS Simple Feature Access. Un `Point<f64>` ocupa exactamente 16 bytes (dos `f64`), lo que ilustra el control de *layout* que Rust ofrece.

3. **La reproyección se realiza vía PROJ.** El crate `proj` (georust/proj) provee *bindings* de alto nivel a libproj 9.6.x mediante `proj-sys`; distingue entre *projection* (geodésico↔proyectado) y *conversion* (entre sistemas proyectados), normaliza el orden de ejes a lon/lat, y se integra con `geo-types` mediante el trait `Transform`. Existen alternativas puras en Rust (`proj4rs`, `proj5`) pero son menos completas y no están *battle-tested*.

4. **`geozero` es la pieza de I/O zero-copy.** Define una API de lectura/escritura sin representación intermedia mediante el trait `GeomProcessor`, con soporte para GeoJSON, WKT/WKB, GDAL, GEOS, MVT, CSV, SVG, Shapefile, FlatGeobuf y GeoArrow, además de codificación/decodificación de geometrías PostGIS para SQLx, Diesel y rust-postgres, y de GeoPackage para SQLx.

5. **Los formatos cloud-native son el estado del arte.** FlatGeobuf (crate `flatgeobuf` v6.0.1) permite lectura con acceso aleatorio y filtrado espacial por *bounding box* directamente sobre HTTP (`HttpFgbReader`); Cloud-Optimized GeoTIFF (COG) es estándar OGC 1.0 desde julio de 2023; PMTiles (crate `pmtiles` v0.23.0, mantenido por Stadia Maps) implementa el spec v3 de Protomaps con backends async (mmap, HTTP, S3, object_store); y GeoParquet/GeoArrow (proyecto geoarrow-rs de Kyle Barron) habilitan análisis columnar de gran escala.

6. **Martin es el servidor de teselas de referencia en Rust.** Según su README oficial (github.com/maplibre/martin): *"Martin is a tile server... to generate vector tiles on the fly from large PostgreSQL databases, and serve tiles from PMTiles and MBTiles files. Martin optimizes for speed and heavy traffic, and is written in Rust."* Está en su versión v1.15.0, mantenido por MapLibre, y depende del crate `pmtiles`.

## Details

### 1. Fundamentos del lenguaje Rust críticos para procesamiento geoespacial

El procesamiento geoespacial es intensivo en memoria y cómputo (millones de vértices, teselas ráster de gigapíxeles, nubes de puntos LiDAR de miles de millones de puntos). Las garantías de Rust son directamente aplicables:

- **Ownership y borrowing.** El modelo de propiedad elimina copias defensivas y *garbage collection*: una `LineString` de millones de coordenadas puede pasarse por referencia (`&LineString`) a un algoritmo sin coste. El *borrow checker* impide *data races* en tiempo de compilación, lo que habilita el paralelismo "sin miedo" (*fearless concurrency*) esencial para procesar rásters y colecciones de features en paralelo.

- **Concurrencia segura con Rayon.** Rayon es la biblioteca de paralelismo de datos por excelencia: convertir `.iter()` en `.par_iter()` paraleliza un cómputo garantizando ausencia de *data races*. Emplea un planificador *work-stealing* heredado del proyecto Cilk del MIT. Para GIS es ideal en operaciones "vergonzosamente paralelas": aplicar una transformación a cada celda de un ráster, reproyectar millones de puntos, o ejecutar un *spatial join* sobre features independientes. La literatura académica matiza que el paralelismo es "fearless y zero-cost" para patrones *regulares* (p. ej. *prefix-sum*, escrituras locales sobre estructuras dimensionadas), mientras que el paralelismo *irregular* obliga a elegir entre `unsafe` o verificaciones dinámicas costosas.

- **Manejo de errores idiomático con `Result`/`Option`.** El I/O geoespacial es propenso a fallos (archivos corruptos, geometrías inválidas, CRS desconocidos). El patrón idiomático usa `Result<T, E>` con el operador `?` para propagación, y `Option<T>` para ausencia (p. ej. el centroide de una geometría vacía). Los crates FFI como `geos` devuelven `GResult` porque GEOS es estricto con la validez de la geometría de entrada y puede fallar (crash) con entradas inválidas, por lo que el *wrapper* valida y convierte a `Result`.

- **Zero-cost abstractions.** Los iteradores, traits genéricos y `par_iter_mut` de Rayon compilan a código tan eficiente como el escrito a mano; no hay penalización de runtime por la abstracción. En GIS esto permite escribir algoritmos genéricos sobre `CoordNum`/`CoordFloat` sin sacrificar rendimiento.

- **Layout de structs y rendimiento en memoria.** Rust ofrece control fino del *layout*: `#[repr(C)]` para compatibilidad FFI, y elección entre *Array-of-Structs* (AoS) y *Struct-of-Arrays* (SoA). El caso de las nubes de puntos es ilustrativo: según el tutorial de `pasture` (igd-geo.github.io), *"The least amount of memory that a point in a LAS file requires is 20 bytes, but the Point structure from the las crate always requires 136 bytes (64-bit, version 0.8.1)"* — es decir, el crate `las` usa un tipo `Point` interleaved de layout fijo de 136 bytes por punto, aunque el mínimo LAS es 20 bytes. El crate `pasture` en cambio soporta AoS y SoA nativamente (que llama *interleaved* y *columnar*) para máxima eficiencia de memoria en nubes muy grandes. GeoArrow explota el layout columnar de Apache Arrow para lograr acceso zero-copy.

- **Uso de `unsafe` cuando aplica.** `unsafe` es imprescindible en la frontera FFI (llamadas a GDAL/GEOS/PROJ) y en optimizaciones de bajo nivel (memory-mapping de FlatGeobuf, acceso a *raw pointers*). El patrón idiomático encapsula el `unsafe` en un módulo pequeño con comentarios `// SAFETY:` y expone una API 100% segura: envolver punteros crudos en tipos que poseen el recurso, implementar `Drop` para liberar recursos C automáticamente (RAII), convertir retornos nulos en `Option` y códigos de error C en `Result`. La convención del ecosistema separa el crate `foo-sys` (bindings crudos generados con bindgen) del crate `foo` (wrapper seguro).

### 2. Conceptos clave de GIS

- **Sistemas de referencia de coordenadas (CRS), datums y transformaciones.** Un CRS define cómo las coordenadas numéricas se relacionan con posiciones en la Tierra. Distinciones críticas: coordenadas *geográficas* (lon/lat en grados, p. ej. EPSG:4326/WGS84) vs. *proyectadas* (easting/northing en metros, p. ej. UTM). Un *datum* define el elipsoide y su anclaje. Las transformaciones entre datums (p. ej. `towgs84`) pueden requerir grids de corrección. En Rust, PROJ (vía crate `proj`) es la referencia; su documentación distingue *projection* (geodésico↔proyectado, incluida proyección inversa) de *conversion* (entre CRS proyectados). Cuidado con el orden de ejes: EPSG:4326 se define oficialmente como lat/lon, pero `new_known_crs` normaliza a lon/lat.

- **Geometrías vectoriales y topología.** El modelo OGC Simple Feature Access: `Coord` (par de coordenadas, no es geometría por sí), `Point`, `LineString`, `Polygon` (un anillo exterior + cero o más interiores), y sus variantes Multi. La *topología* se expresa mediante el modelo DE-9IM (Dimensionally Extended 9-Intersection Model), que `geo` soporta completamente vía el trait `Relate` para calcular relaciones como contención, intersección, toque y solapamiento.

- **Álgebra de mapas y operaciones ráster.** El *map algebra* es un lenguaje matemático para procesar datos ráster combinando rásters y escalares mediante operadores y funciones (locales, focales, zonales, globales). El raster de salida controla el procesamiento celda a celda. En Rust, `ndarray` es la estructura de datos base para rásters (arrays n-dimensionales con *slicing*, *broadcasting* y operaciones elemento a elemento), integrable con Rayon para paralelizar. GDAL (vía crate `gdal`) provee I/O y operaciones ráster/vectoriales completas.

- **Estructuras de datos e índices espaciales.** Los índices aceleran consultas espaciales (vecino más cercano, rango, intersección):
  - **R-tree / R\*-tree**: el crate `rstar` (georust) implementa un R*-tree n-dimensional con estrategia de inserción r*, optimizado para *nearest neighbor*; `geo` lo usa como índice espacial y provee implementaciones `RTreeObject` para geometrías complejas.
  - **KD-tree**: para puntos; `geo-index` (georust) provee R-tree y k-d tree empaquetados, inmutables y zero-copy. Según su propio README, *"construction is ~2x faster than rstar and search is ~33% faster"* (benchmark: construcción geo-index hilbert ≈80,9 ms vs. rstar bulk ≈159,3 ms; búsqueda flatbush ≈116 µs vs. rstar ≈153,6 µs).
  - **Quadtree / grid index**: útiles para datos uniformemente distribuidos y teselado.

### 3. Ecosistema de crates geoespaciales en Rust

| Crate | Propósito | Madurez | Casos de uso / Limitaciones |
|---|---|---|---|
| **`geo`** (0.33.1) | Geometrías planares + algoritmos (DE-9IM, booleanas, buffer, clustering, triangulación, Voronoi, hulls, simplificación, distancias) | Muy maduro (20.491.317 descargas históricas; ~1,8M/mes) | Núcleo de análisis vectorial. Booleanas apoyadas en `i_overlay`; triangulación en `spade`; geodésicas en `geographiclib-rs`. Planar por defecto. |
| **`geo-types`** (0.7.x) | Tipos primitivos genéricos reexportados por el ecosistema | Muy maduro (>25M descargas históricas) | Compatibilidad entre crates; úsalo directo si no necesitas algoritmos. |
| **`geos`** | Bindings a GEOS (C++) — geometrías preparadas, Voronoi, operaciones robustas | Maduro (FFI) | Alto rendimiento con `PreparedGeometry` para consultas repetidas. GEOS es estricto con validez y puede fallar con entrada inválida; requiere libgeos-dev. |
| **`gdal`** (0.19.x) | Bindings seguros a GDAL — I/O ráster y vectorial de decenas de formatos | Maduro (FFI) | El "navaja suiza" de I/O. Incluye bindings pre-generados para GDAL 3.8–3.13; requiere libgdal instalada. |
| **`proj`** (0.31.x) | Bindings a libproj 9.6.x — reproyección y conversión CRS | Maduro (FFI) | Reproyección precisa. Depende de libproj; puede compilar desde fuente con `bundled_proj`. |
| **`geozero`** (0.15.x) | I/O zero-copy multiformato vía `GeomProcessor` | Maduro | Puente universal (GeoJSON, WKB/WKT, MVT, GDAL, GEOS, PostGIS, GeoArrow). Shapefile: solo lectura; FlatGeobuf/GeoArrow vía crates externos. |
| **`geojson`** (0.24.x) | Lectura/escritura GeoJSON (RFC 7946) | Maduro | Interop web; integra con `serde`. |
| **`shapefile`** | Lectura/escritura de shapefiles ESRI | Maduro | El driver shp también está ahora incluido en `geozero`. |
| **`netcdf`** (0.12.x, georust) | Bindings medium-level a netCDF-c (lee/escribe HDF5) | Maduro | Datos científicos multidimensionales (clima, océano). Thread-safe vía mutex global (netcdf-c no es thread-safe); requiere libnetcdf. |
| **`rstar`** (0.12.x) | R*-tree n-dimensional | Maduro | Índice espacial dinámico; base de consultas en `geo`. |
| **`flatgeobuf`** (6.0.1) | Formato binario cloud-native basado en flatbuffers | Maduro | Lectura con acceso aleatorio y filtro bbox sobre HTTP; integra `geo_traits` y `geozero`. Proyecto propio (no georust). |
| **`gdal-sys`** | Bindings crudos (unsafe) a GDAL | Maduro | Solo si necesitas API C directa; normalmente usa `gdal`. |
| **`geoarrow`/`geoparquet`** | Memoria columnar Arrow + GeoParquet | En desarrollo activo (Kyle Barron) | Análisis de gran escala, WASM, streaming desde S3. API en evolución. |
| **`las`** (0.9.x) | Lectura/escritura LAS/LAZ nativa | Maduro | Sencillo para LiDAR; `Point` interleaved de 136 bytes prioriza conveniencia sobre rendimiento. |
| **`pasture`** | Procesamiento de nubes de puntos con AoS/SoA | En desarrollo | Para herramientas de alto rendimiento sobre nubes muy grandes; más complejo que `las`. |
| **`copc-rs`** | Cloud Optimized Point Cloud (COPC) | Emergente | Consultas espaciales/LOD sobre LAZ octree; usa `las` y `laz`. |
| **`pmtiles`** (0.23.0) | Archivos PMTiles v3 (lectura/escritura) | Maduro | Backends async (mmap, HTTP, S3, object_store); mantenido por Stadia Maps. |
| **`martin`** (1.15.0) | Servidor de teselas | Producción | PostGIS + PMTiles + MBTiles; mantenido por MapLibre. |
| **`ndarray`** | Arrays n-dimensionales | Muy maduro | Base para procesamiento ráster/map algebra; integra Rayon y BLAS. |

### 4. Manejo de formatos y fuentes de datos

- **Datos vectoriales.** GeoJSON (`geojson`), WKT/WKB (`wkt`, `geozero`), Shapefile (`shapefile`/`geozero`), y formatos cloud-native. `gdal` lee prácticamente cualquier formato OGR. Para producción a escala, FlatGeobuf y GeoParquet son preferibles a Shapefile por su eficiencia y streaming.

- **Datos ráster.** GDAL (`gdal`) es el camino general; para procesamiento numérico puro se combina con `ndarray`. GeoTIFF/COG: `gdal` es la vía robusta; existen esfuerzos puros en Rust (`geotiff`, `cloudtiff`, `cog3pio`, `async-tiff`) pero la decodificación no está tan optimizada para COG como GDAL. COG explota HTTP GET Range Requests para streaming parcial. netCDF/HDF5 (`netcdf`) para datos científicos/climáticos.

- **Nubes de puntos (LiDAR).** Formatos LAS (ASPRS) y su versión comprimida LAZ. Crates: `las` (con feature `laz` o `laz-parallel`), `pasture` (memoria flexible AoS/SoA e I/O vía `pasture-io`), y `copc-rs` para COPC (variante cloud-optimized de LAZ organizada como octree, análoga a COG respecto a GeoTIFF).

- **Formatos optimizados para la nube.** 
  - **COG** (Cloud-Optimized GeoTIFF): según NASA Earthdata, *"Cloud Optimized GeoTIFF (COG) is an official OGC Standard. The Open Geospatial Consortium (OGC) published version 1.0 in July 2023... backward-compatible with the OGC GeoTIFF Standard of September 2019"* (documento OGC 21-026). Genérico con `gdal_translate ... -co TILED=YES -co COPY_SRC_OVERVIEWS=YES`.
  - **FlatGeobuf** (`flatgeobuf`): vectorial, acceso aleatorio y filtro espacial sobre HTTP. La demo oficial (flatgeobuf.org, ejemplo leaflet/large.html) muestra un mapa de cada bloque censal de EE.UU.: *"The entire file is over 12GB, but FlatGeobuf fetches only the tiny subset of data that intersects with the bounding box"* — el dataset pesa casi 12 GB pero solo se descarga el subconjunto que interseca el *bounding box*.
  - **PMTiles** (`pmtiles`): archivo único de teselas para servir sin backend. El crate v0.23.0 (repo stadiamaps/pmtiles-rs) declara: *"This crate implements the PMTiles v3 spec, originally created by Brandon Liu for Protomaps"*, con backends async mmap (Tokio), http (Reqwest), s3 (Rust-S3) y object_store.
  - **GeoParquet/GeoArrow**: columnar, ideal para análisis analítico y consultas espaciales desde S3 sin servidor.

### 5. Integración e interoperabilidad

- **Bases de datos espaciales (PostgreSQL/PostGIS).** El patrón dominante usa **SQLx** (async) con `geozero` (feature `with-postgis-sqlx`), que provee codificación/decodificación WKB de geometrías PostGIS hacia `geo-types` mediante `wkb::Decode` y `wkb::Encode`. También soporta **Diesel** (`with-postgis-diesel`) y rust-postgres (`with-postgis-postgres`), y GeoPackage para SQLx. Se recomienda `ST_SetSRID` al insertar y usar índices GiST en PostGIS. SQLx ofrece verificación de queries en tiempo de compilación.

- **Pipelines FFI con C/C++.** GDAL, GEOS y PROJ son bibliotecas C/C++ maduras que Rust envuelve con la convención `-sys` (bindings crudos vía `bindgen`) + wrapper seguro. Buenas prácticas: minimizar la superficie `unsafe`, validar punteros nulos, implementar `Drop` (RAII) para liberar recursos C, mapear tipos con `std::os::raw`, documentar invariantes con `// SAFETY:`, y testear con Valgrind/AddressSanitizer/Miri. Cuidado con la seguridad de hilos: muchas bibliotecas C no son thread-safe (netcdf-c usa un mutex global en el wrapper Rust).

- **Servicios web/APIs espaciales.** Dos frameworks dominan en 2026:
  - **Axum** (0.8.x, equipo Tokio): se ha convertido en el default recomendado para proyectos nuevos por su integración con Tokio/Tower, extractors ergonómicos y manejo de errores idiomático con `?`/`Result`. Ha superado a Actix en adopción.
  - **Actix-web** (4.x): lidera en throughput bruto (10-15% más req/s bajo carga pesada) con modelo de actores; preferible para escenarios de throughput extremo (ad serving, analítica en tiempo real) o WebSocket intensivo.
  - **Tower** provee middleware componible (timeouts, rate-limiting, tracing) compartido por el ecosistema.
  - Aplicaciones típicas: servir teselas vectoriales MVT (patrón Martin), APIs REST/GraphQL geoespaciales, endpoints TileJSON, y servicios OGC (WFS/WMS/OGC API Features). Martin auto-descubre tablas y funciones PostGIS y expone endpoints TileJSON por fuente.

### 6. Ruta cronológica de estudio

**FASE 1 — Principiante (fundamentos, ~2-4 meses).**
- *Teoría Rust*: ownership, borrowing, lifetimes, `Result`/`Option`, traits, genéricos, iteradores. Recurso base: The Rust Book (gratuito).
- *Teoría GIS*: CRS/datums/proyecciones, modelo Simple Features (Point/LineString/Polygon), coordenadas geográficas vs. proyectadas, formatos GeoJSON/WKT.
- *Crates*: `geo-types`, `geo`, `geojson`, `wkt`, `serde`. Recurso: el libro "Geospatial Rust" (book.georust.org).
- *Proyectos*: (a) parsear un GeoJSON de ríos y calcular longitudes/centroides; (b) determinar qué segmentos de una polilínea intersecan un polígono usando `geo`; (c) reproyectar puntos entre EPSG:4326 y UTM con `proj`.

**FASE 2 — Intermedio (ecosistema y formatos, ~3-6 meses).**
- *Teoría*: topología DE-9IM, índices espaciales (R-tree, KD-tree, Quadtree), álgebra de mapas ráster, procesamiento de nubes de puntos.
- *Crates*: `rstar`/`geo-index` (índices), `gdal` (I/O ráster/vectorial), `ndarray` (ráster), `geozero` (I/O multiformato), `las`/`pasture` (LiDAR), `flatgeobuf`, `shapefile`, `netcdf`. Instalación de dependencias de sistema (libgdal, libgeos, libproj).
- *Proyectos*: (a) construir un índice R-tree sobre 1M de puntos y hacer consultas de vecino más cercano; (b) leer un COG con `gdal` y calcular NDVI con `ndarray`; (c) convertir Shapefile→FlatGeobuf y servir filtrado por bbox sobre HTTP; (d) leer una nube LAS/LAZ y clasificar puntos de suelo.

**FASE 3 — Avanzado (alto rendimiento e integración, ~4-8 meses).**
- *Teoría*: concurrencia y paralelismo de datos, patrones FFI seguros, arquitectura de servicios cloud-native, formatos cloud-optimized (COG/PMTiles/GeoParquet), operaciones geodésicas precisas (Karney).
- *Crates*: `rayon` (paralelismo), `geos` (geometrías preparadas), `sqlx`+`geozero` (PostGIS), `axum`/`actix-web`+`tower` (web), `pmtiles`/`martin` (teselas), `geoarrow`/`geoparquet` (columnar), `gdal-sys`/`bindgen` (FFI a medida).
- *Proyectos*: (a) pipeline paralelo con Rayon que reproyecta y agrega millones de features; (b) API REST espacial con Axum + SQLx sobre PostGIS con consultas `ST_DWithin`/`ST_Intersects` e índices GiST; (c) servidor de teselas MVT propio (o desplegar y extender Martin); (d) wrapper FFI seguro sobre una biblioteca C geoespacial no cubierta, con crate `-sys` + wrapper `Drop`/`Result`; (e) análisis de GeoParquet a escala desde S3 con geoarrow-rs.

## Recommendations

1. **Empieza por Rust seguro puro antes que FFI.** Domina `geo`/`geo-types` (100% Rust seguro) antes de tocar `gdal`/`geos`/`proj`. Esto te da el modelo mental de ownership sin la fricción de dependencias C. *Umbral para avanzar*: poder implementar un algoritmo genérico sobre `CoordFloat` y explicar por qué el borrow checker lo acepta.

2. **Instala el toolchain de sistema temprano en la Fase 2.** libgdal, libgeos-dev y libproj son prerequisitos de los crates FFI y su instalación es la primera barrera práctica. En CI usa las imágenes docker de georust o los bindings pre-generados de `gdal` (3.8–3.13) para evitar `bindgen`. *Umbral*: compilar un proyecto que enlace GDAL en Linux y Windows.

3. **Adopta Axum como default para servicios nuevos** salvo que midas una necesidad de throughput extremo; en ese caso evalúa Actix-web con benchmarks reales sobre tu carga. La diferencia de rendimiento (10-15%) rara vez importa a escala de startup/mediana empresa; la ergonomía y el ecosistema Tower sí.

4. **Prioriza formatos cloud-native (FlatGeobuf, COG, PMTiles, GeoParquet) sobre Shapefile** para nuevos proyectos: habilitan streaming HTTP, acceso parcial y arquitecturas sin servidor. *Umbral de decisión*: si tu dataset supera ~1 GB o necesitas servirlo por web, migra a cloud-native.

5. **Paraleliza con Rayon solo tras perfilar.** Empieza secuencial, identifica el cuello de botella, y aplica `par_iter` donde importe. El paralelismo regular (ráster celda a celda, reproyección de puntos) es "fearless"; el irregular (grafos, escrituras compartidas) puede requerir `unsafe` o `Mutex` con coste.

6. **Contribuye al ecosistema GeoRust.** Es relativamente pequeño y acogedor (Discord de GeoRust, "Awesome GeoRust"). Contribuir a `geo`, `gdal` o `geozero` acelera el aprendizaje avanzado y da visibilidad profesional.

## Caveats

- **Rust no es un "silver bullet" para GIS.** Como advierte un desarrollador con ~10 años de experiencia en Rust geoespacial (gadom.ski), el stack de Python (rasterio, xarray, geopandas) es muy fuerte y maduro; Rust brilla en rendimiento y sistemas, no necesariamente en velocidad de prototipado. Elige Rust cuando el rendimiento, la seguridad de memoria o la integración de sistemas lo justifiquen.
- **MSRV de `geo` inferido, no confirmado con precisión.** El crate usa la edición Rust 2024 (implica toolchain ≥1.85). Fuentes de crates.io citan MSRV v1.88.0 para versiones recientes de `geo`, lo que sugiere que la cifra concreta ha subido; conviene verificar el campo `rust-version` exacto en el Cargo.toml de georust/geo antes de fijar la toolchain de CI.
- **Crates emergentes con API inestable.** `geoarrow`/`geoparquet`, `cog3pio`, `pasture` y los readers COG puros en Rust están en desarrollo activo; espera cambios rompientes y menor cobertura que las alternativas basadas en GDAL. Para producción crítica, GDAL sigue siendo la opción robusta.
- **Bibliotecas C no thread-safe.** netcdf-c, y en menor medida GEOS con entradas inválidas, requieren cuidado; el wrapper `netcdf` serializa el acceso con un mutex global, lo que limita la concurrencia real.
- **Fragmentación de proyecciones puras.** `proj4rs` y `proj5` no reproyectan entre elipsoides distintos de forma completa y no están *battle-tested*; para precisión de producción usa el crate `proj` (FFI a libproj).
- Algunas cifras de adopción y benchmarks de frameworks web provienen de blogs técnicos (Medium, Markaicode, etc.) y no de fuentes primarias; trátalas como orientativas, no como mediciones canónicas.