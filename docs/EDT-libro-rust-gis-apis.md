# EDT — Estructura de Desglose del Trabajo: Libro "APIs GIS con Rust"

> Basado en [`ruta-aprendizaje-rust-gis-apis.md`](./ruta-aprendizaje-rust-gis-apis.md). Cada Módulo de esta EDT corresponde 1:1 a una Fase de la ruta de aprendizaje; cada Capítulo corresponde a una subsección de esa fase. La numeración de EDT es independiente del orden de escritura (ver [Secuenciación](#secuenciación-y-dependencias) al final).

## Cómo leer esta EDT

Cada nodo tiene: **Entregable** (el artefacto de escritura concreto), **Contenido fuente** (de qué sección de la ruta consolidada se deriva), **Criterio de aceptación** (cuándo el nodo se considera terminado) y, donde aplica, **Densidad de ejercicios**.

Regla estructural fija para todo el libro: **1.0 – 2.0** es front-matter/fundamentos, **3.0 – 6.0** son los módulos intermedios (alta densidad de ejercicios obligatoria), **7.0** es el módulo final de capstones (obligatorio referenciar módulos previos explícitamente, prohibido introducir teoría nueva).

---

## 1.0 Front Matter y Configuración del Proyecto-Libro

### 1.1 Introducción y mapa de la ruta
- **Entregable:** capítulo introductorio que presenta el hilo conductor "GeoAPI" y una tabla de correspondencia Módulo del libro ↔ Fase de la ruta.
- **Contenido fuente:** sección "Principio rector" de la ruta.
- **Criterio de aceptación:** el lector puede identificar, antes de empezar, en qué capítulo se añade cada capacidad al proyecto GeoAPI.

### 1.2 Entorno de trabajo del libro
- **Entregable:** capítulo de setup — toolchain Rust, `cargo`, estructura de workspace multi-crate (`geoapi-core`, `geoapi-api`, `geoapi-db`) que se usará en todos los módulos siguientes.
- **Criterio de aceptación:** un lector nuevo compila el esqueleto del workspace sin errores siguiendo solo el capítulo.

### 1.3 Convenciones del libro
- **Entregable:** nota editorial corta — formato de bloques de código, formato de ejercicios (enunciado / pistas colapsables / solución en repositorio anexo), convención de versionado de crates citados.

---

## 2.0 Módulo 1 — Fundamentos de Rust para Datos Espaciales
*(corresponde a Fase 0 de la ruta)*

### 2.1 Capítulo: Ownership, borrowing y por qué importan en GIS
- **Entregable:** capítulo teórico-práctico corto.
- **Contenido fuente:** Fase 0, fila "Ownership/Borrowing".
- **Densidad de ejercicios:** 3 ejercicios cortos (pasar geometrías por referencia sin copiar, identificar por qué un `fn` no compila, corregir lifetime).

### 2.2 Capítulo: `Result`, `Option` y manejo de errores sin pánico
- **Entregable:** capítulo con proyecto guiado.
- **Densidad de ejercicios:** 4 ejercicios (propagar error con `?`, modelar un error de dominio con enum, convertir un `panic!` en `Result`, tests que verifican el camino de error).

### 2.3 Capítulo: Traits, genéricos e iteradores
- **Densidad de ejercicios:** 4 ejercicios, culminando en el ejercicio integrador del módulo.

### 2.4 Proyecto guiado de cierre de módulo — GeoAPI v0.1
- **Entregable:** walkthrough completo del CLI que parsea CSV de coordenadas (ruta, Fase 0), construido paso a paso con checkpoints de compilación.
- **Criterio de aceptación:** el binario resultante coincide con el artefacto de referencia del repositorio anexo del libro.

---

## 3.0 Módulo 2 — Primitivas Geoespaciales Puras (`geo`/`geo-types`)
*(corresponde a Fase 1 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 3.1 Capítulo: Modelo OGC Simple Features en Rust
- **Contenido fuente:** Fase 1.1.
- **Densidad de ejercicios:** 5 ejercicios (instanciar cada primitiva, construir un `MultiPolygon` desde cero, detectar un anillo no cerrado, convertir entre `Point`/`Coord`, escribir un test de igualdad geométrica).

### 3.2 Capítulo: CRS geográficos vs. proyectados (sin reproyección todavía)
- **Densidad de ejercicios:** 3 ejercicios conceptuales (identificar el CRS correcto para un caso de uso, detectar un bbox con ejes invertidos, justificar por qué EPSG:3857 distorsiona área).

### 3.3 Capítulo: `geo` — algoritmos core (área, distancia, simplificación)
- **Densidad de ejercicios:** 6 ejercicios (área geodésica vs. euclidiana, Haversine vs. Vincenty, Douglas-Peucker con distintas tolerancias, Visvalingam-Whyatt, benchmark comparativo, caso límite con geometría vacía).

### 3.4 Capítulo: Serialización — GeoJSON, WKT/WKB
- **Densidad de ejercicios:** 4 ejercicios (round-trip GeoJSON, round-trip WKT, manejo de un GeoJSON malformado con `Result`, interoperar con `serde`).

### 3.5 Proyecto guiado de cierre de módulo — GeoAPI v0.2 (`geoapi-core`)
- **Entregable:** construcción completa del crate de dominio.
- **Ejercicio integrador (obligatorio, evaluado):** el lector extiende `geoapi-core` con una función no cubierta en el capítulo (ej. bounding box de una colección) sin guía paso a paso — primer ejercicio "abierto" del libro.
- **Criterio de aceptación:** `cargo test` pasa sobre el crate de dominio completo.

**Total ejercicios Módulo 2: 18 + 1 integrador abierto.**

---

## 4.0 Módulo 3 — Índices, Robustez y Persistencia (Primer Servidor)
*(corresponde a Fase 2 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 4.1 Capítulo: DE-9IM y el trait `Relate`
- **Densidad de ejercicios:** 4 ejercicios (matriz DE-9IM manual vs. `Relate`, implementar `intersects`/`contains`/`touches` con datos reales, caso de colinealidad casi-degenerada).

### 4.2 Capítulo: Predicados exactos con `robust`
- **Densidad de ejercicios:** 2 ejercicios (reproducir un fallo de precisión con f64 puro, corregirlo con `robust`).

### 4.3 Capítulo: Índices espaciales — `rstar`, `geo-index`, `h3o`
- **Contenido fuente:** Fase 2.2.
- **Densidad de ejercicios:** 6 ejercicios (construir un R\*-tree con 100k puntos, consulta KNN, comparar latencia `rstar` vs. `geo-index` en el mismo dataset, indexar con H3 a dos resoluciones, invalidar/reconstruir el índice tras una edición, ejercicio de perfilado).

### 4.4 Capítulo: Reproyección con `proj`
- **Densidad de ejercicios:** 3 ejercicios (WGS84→UTM, ida y vuelta con pérdida de precisión medida, manejo de un punto fuera de dominio válido como `Result::Err`).

### 4.5 Capítulo: Persistencia con PostGIS — SQLx y Diesel
- **Contenido fuente:** Fase 2.4.
- **Densidad de ejercicios:** 6 ejercicios (migración con `ST_SetSRID`, insert vía SQLx con `geozero`, query espacial `ST_DWithin`, mismo flujo con Diesel, índice GiST y medición de mejora, patrón repository).

### 4.6 Capítulo: I/O adicional — `gdal`, `ndarray`, `shapefile`, `las`
- **Densidad de ejercicios:** 4 ejercicios (leer un DEM y calcular pendiente con `ndarray`, importar un Shapefile legado, leer una nube LAS mínima, comparar memoria AoS vs. SoA).

### 4.7 Proyecto guiado de cierre de módulo — GeoAPI v0.3
- **Entregable:** servidor REST con estado (`POST /features`, `GET /features/near`, `GET /features/reproject`) — ruta Fase 2.6.
- **Ejercicio integrador (abierto):** el lector añade un endpoint no especificado en el capítulo (`GET /features/within-polygon`) combinando DE-9IM + PostGIS.
- **Criterio de aceptación:** benchmark de <10ms en consulta KNN sobre 100k features, verificado con un script incluido.

**Total ejercicios Módulo 3: 25 + 1 integrador abierto.**

---

## 5.0 Módulo 4 — Concurrencia, Cloud-Native y FFI Seguro
*(corresponde a Fase 3 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 5.1 Capítulo: Paralelismo de datos con Rayon
- **Densidad de ejercicios:** 4 ejercicios (convertir un `.iter()` a `.par_iter()` y medir speedup, identificar un caso donde paralelizar *no* ayuda, reproyección batch paralela, detectar un patrón irregular que requiere `Mutex`).

### 5.2 Capítulo: FlatGeobuf y HTTP Range Requests
- **Contenido fuente:** Fase 3.2.
- **Densidad de ejercicios:** 4 ejercicios (leer un `.fgb` local, filtrar por bbox, apuntar a un `.fgb` remoto en HTTP y medir bytes transferidos, manejar un servidor sin soporte de Range).

### 5.3 Capítulo: Cloud-Optimized GeoTIFF (COG)
- **Densidad de ejercicios:** 3 ejercicios (leer overview de baja resolución, extraer una banda específica, calcular NDVI sobre una ventana parcial).

### 5.4 Capítulo: PMTiles v3 y GeoParquet/GeoArrow
- **Densidad de ejercicios:** 4 ejercicios (leer un archivo PMTiles local, servirlo con backend `mmap`, leer un GeoParquet con predicate pushdown, comparar tamaño/latencia vs. GeoJSON equivalente).

### 5.5 Capítulo: COPC y streaming de nubes de puntos
- **Densidad de ejercicios:** 3 ejercicios (leer metadatos de un `.copc.laz`, extraer un nivel de detalle, streaming asíncrono de un octree remoto).

### 5.6 Capítulo: FFI seguro — el patrón `-sys` + wrapper, y `geos`
- **Densidad de ejercicios:** 4 ejercicios (identificar la superficie `unsafe` mínima de un wrapper dado, escribir un comentario `// SAFETY:` correcto, envolver un puntero con `Drop`, usar `PreparedGeometry` de `geos` en una consulta repetida).

### 5.7 Proyecto guiado de cierre de módulo — GeoAPI v0.4
- **Entregable:** extensión de streaming cloud-native (ruta Fase 3.5).
- **Ejercicio integrador (abierto):** añadir soporte de un cuarto formato cloud-native no cubierto explícitamente en el capítulo, reutilizando el patrón de streaming ya construido.
- **Criterio de aceptación:** la API sirve un archivo remoto de prueba (>1GB) transfiriendo solo el subconjunto relevante, verificado inspeccionando los bytes de red.

**Total ejercicios Módulo 4: 22 + 1 integrador abierto.**

---

## 6.0 Módulo 5 — Arquitectura de APIs GIS de Producción
*(corresponde a Fase 4 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 6.1 Capítulo: Axum vs. Actix-web — decisión arquitectónica
- **Densidad de ejercicios:** 3 ejercicios (migrar un endpoint entre ambos frameworks, benchmark propio, justificar por escrito la elección para un caso dado).

### 6.2 Capítulo: Middleware con Tower — caché, rate-limiting, timeouts
- **Densidad de ejercicios:** 4 ejercicios (cachear respuestas de teselas con `moka`, rate-limit por IP, timeout configurable, tracing de latencia por endpoint).

### 6.3 Capítulo: Contratos MVT y el patrón Martin
- **Contenido fuente:** Fase 4.2.
- **Densidad de ejercicios:** 4 ejercicios (servir una tesela MVT propia, exponer TileJSON, comparar contra el comportamiento documentado de Martin, servir desde PMTiles sin base de datos).

### 6.4 Capítulo: OGC API Features / WFS / WMS — interoperabilidad
- **Densidad de ejercicios:** 3 ejercicios (implementar un endpoint mínimo compatible con OGC API Features, validar contra un cliente QGIS, documentar el contrato con OpenAPI).

### 6.5 Capítulo: Observabilidad, resiliencia y despliegue
- **Densidad de ejercicios:** 4 ejercicios (instrumentar con `tracing`, definir un healthcheck, contenerizar el servicio, compilar `geoapi-core` a WASM y ejecutarlo en un contexto de navegador simulado).

### 6.6 Proyecto guiado de cierre de módulo — GeoAPI v1.0
- **Entregable:** consolidación en plataforma de producción (ruta Fase 4.4).
- **Ejercicio integrador (abierto):** desplegar el stack completo con CI que corre tests de integración contra una instancia PostGIS efímera.
- **Criterio de aceptación:** pipeline de CI en verde, documentado con logs de ejecución de referencia.

**Total ejercicios Módulo 5: 18 + 1 integrador abierto.**

---

## 7.0 Módulo Final — Proyectos Integrales (Capstones)

> **Regla estricta de este módulo:** cero teoría nueva. Cada capstone es una especificación de proyecto que el lector construye de forma autónoma, con una tabla de trazabilidad obligatoria que referencia explícitamente qué capítulo de qué módulo previo cubre cada pieza técnica requerida. Ningún capstone puede exigir un concepto no enseñado en 2.0–6.0.

### 7.1 Capstone A — Servidor de teselas vectoriales cloud-native completo
- **Alcance:** API que sirve MVT desde PMTiles + fallback a PostGIS para datos editables, con caché y observabilidad.
- **Tabla de trazabilidad (obligatoria en el capítulo):**

| Requisito del capstone | Módulo/Capítulo que lo cubre |
|---|---|
| Modelo de dominio y serialización GeoJSON/WKT | 3.1, 3.3, 3.4 |
| Índice espacial en memoria para features editables | 4.3 |
| Persistencia PostGIS vía SQLx | 4.5 |
| Streaming PMTiles | 5.4 |
| Servidor Axum + middleware de caché | 6.1, 6.2 |
| Contrato MVT/TileJSON | 6.3 |
| Observabilidad y despliegue | 6.5 |

- **Criterio de aceptación:** el lector entrega un repositorio que pasa una suite de tests de aceptación provista por el libro, sin necesidad de código o explicación adicional del autor.

### 7.2 Capstone B — API analítica sobre GeoParquet a escala
- **Alcance:** endpoint de agregación espacial (ej. estadística zonal) sobre un dataset GeoParquet en almacenamiento de objetos, con paralelismo Rayon y respuesta streaming.
- **Tabla de trazabilidad:**

| Requisito del capstone | Módulo/Capítulo que lo cubre |
|---|---|
| Álgebra de mapas / operaciones zonales | 4.6 |
| Predicate pushdown sobre GeoParquet | 5.4 |
| Paralelismo con Rayon | 5.1 |
| Contrato de API y manejo de errores | 2.2, 6.1 |
| Observabilidad de una operación de larga duración | 6.5 |

- **Criterio de aceptación:** benchmark de tiempo de respuesta documentado por el lector, comparando ejecución secuencial vs. paralela sobre el mismo dataset.

### 7.3 Capstone C — Plataforma LiDAR con streaming COPC
- **Alcance:** API que expone niveles de detalle (LOD) de una nube de puntos COPC remota, con reproyección on-the-fly y wrapper FFI seguro para un cálculo geométrico no cubierto en `geo` (ej. validación con GEOS).
- **Tabla de trazabilidad:**

| Requisito del capstone | Módulo/Capítulo que lo cubre |
|---|---|
| Lectura de nubes de puntos (`las`/`pasture`) | 4.6 |
| Streaming COPC por LOD | 5.5 |
| Reproyección con `proj` | 4.4 |
| Wrapper FFI seguro (`geos`) | 5.6 |
| Exposición vía Axum con contrato de API propio | 6.1, 6.4 |

- **Criterio de aceptación:** el lector documenta explícitamente en qué capítulo aprendió cada pieza usada, como ejercicio de auto-verificación de trazabilidad.

### 7.4 Cierre del libro — Retrospectiva de arquitectura
- **Entregable:** capítulo breve de cierre que recorre los tres capstones y muestra cómo comparten el mismo crate `geoapi-core` construido en el Módulo 2, cerrando explícitamente el hilo conductor abierto en 1.1.

---

## Secuenciación y dependencias

```
1.0 → 2.0 → 3.0 → 4.0 → 5.0 → 6.0 → 7.0
```

Secuencial y estrictamente lineal: cada módulo intermedio (3.0–6.0) depende del crate de dominio y del servidor construidos en el módulo anterior — no son intercambiables ni paralelizables en la escritura sin romper la trazabilidad que exige el Módulo 7.0.

**Densidad total de ejercicios en módulos intermedios (3.0–6.0): 83 ejercicios guiados + 4 ejercicios integradores abiertos**, antes de llegar a los tres capstones no guiados del Módulo 7.0.

## Resumen de entregables por módulo

| EDT | Módulo | Corresponde a | Ejercicios guiados | Ejercicio integrador |
|---|---|---|---|---|
| 1.0 | Front matter | — | — | — |
| 2.0 | Fundamentos de Rust | Fase 0 | 11 | 1 (proyecto guiado, no abierto) |
| 3.0 | Primitivas geoespaciales | Fase 1 | 18 | 1 abierto |
| 4.0 | Índices y persistencia | Fase 2 | 25 | 1 abierto |
| 5.0 | Cloud-native y FFI | Fase 3 | 22 | 1 abierto |
| 6.0 | Arquitectura de producción | Fase 4 | 18 | 1 abierto |
| 7.0 | Capstones | Fases 0–4 (integración) | 0 (proyectos completos) | 3 capstones |
