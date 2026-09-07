# EDT — Estructura de Desglose del Trabajo: Libro "APIs GIS con Rust"

> Basado en [`ruta-aprendizaje-rust-gis-apis.md`](./ruta-aprendizaje-rust-gis-apis.md). Cada Módulo de esta EDT corresponde 1:1 a una Fase de la ruta de aprendizaje; cada Capítulo corresponde a una subsección de esa fase. La numeración de EDT es independiente del orden de escritura (ver [Secuenciación](#secuenciación-y-dependencias) al final).

## Cómo leer esta EDT

Cada nodo tiene: **Entregable** (el artefacto de escritura concreto), **Contenido fuente** (de qué sección de la ruta consolidada se deriva), **Criterio de aceptación** (cuándo el nodo se considera terminado) y, donde aplica, **Densidad de ejercicios**.

Regla estructural fija para todo el libro: **1.0 – 2.0** es front-matter/fundamentos, **3.0 – 6.0** son los módulos intermedios (alta densidad de ejercicios obligatoria), **7.0** es el módulo final de capstones (obligatorio referenciar módulos previos explícitamente, prohibido introducir teoría nueva).

## Post-publicación: Fases 8–13 (mejora continua)

El libro se publicó al cierre de la Fase 7 de `CLAUDE.md` con la estructura que describe esta EDT. Cinco fases posteriores, pedidas explícitamente por el usuario ya con el libro en producción, expandieron contenido dentro de la estructura existente. Esta EDT se actualizó para reflejarlas; el detalle completo de cada una (razonamiento, decisiones, verificación) vive en `BACKLOG.md` y en los planes de fase correspondientes:

- **Fase 8 — Auditoría de calidad editorial** (`docs/plan-fase8-auditoria.md`): cerró siete vacíos conceptuales detectados por una auditoría externa (el reporte original ya se procesó y se descartó) — antimeridiano y polos (3.2), *property-based testing* con `proptest` (3.3), *winding order*/regla de la mano derecha (3.4), mapeo de errores de dominio a HTTP vía RFC 7807 y streaming asíncrono PostGIS→HTTP (6.1), CORS y límite de payload (6.2) — más la reescritura de los 8 `00-indice.md` de Parte con un formato editorial nuevo (objetivos de aprendizaje, contexto arquitectónico, diagrama ASCII, prerrequisitos).
- **Fase 9 — Historias de usuario y casos de uso** (`docs/plan-fase9-proyectos-capitulo.md`): añadió el formato ágil de requisitos (explicado en el Capítulo 1.3) a los cinco proyectos guiados de cierre (2.5, 3.5, 4.7, 5.7, 6.6 — numerado 2.4 al momento de esta fase, antes de la renumeración de la Fase 12) — cada checkpoint quedó anclado a una historia de usuario y, cuando aportaba claridad, un caso de uso, con referencias cortas desde los capítulos técnicos de origen — y, en un addendum posterior, a los tres capstones (7.1–7.3).
- **Fase 10 — TDD en los proyectos guiados** (`docs/plan-fase10-tdd.md`): añadió el primer de TDD (Capítulo 1.3, rojo-verde-refactor) y tests automatizados verificados donde faltaban en los checkpoints de 2.5, 3.5, 4.7 y 5.7 (numerado 2.4 al momento de esta fase), sin reordenar ni reescribir el código de implementación ya publicado.
- **Fase 11 — Segunda auditoría de calidad editorial** (`docs/plan-fase11-auditoria2.md`): cerró seis vacíos de una segunda auditoría externa (reporte ya procesado y descartado tras ejecutarse) — el contrato de Tokio IO-bound vs. CPU-bound con demostración medida de *thread starvation* (5.1, con nota de continuidad en 4.7), migraciones formales con `sqlx-cli` y rechazo de geometrías inválidas con `ST_IsValid` (4.5), agotamiento del *pool* de conexiones con `acquire_timeout` (6.5), autenticación con API keys (6.2), y mención de `utoipa` como alternativa a OpenAPI escrito a mano (6.4, sin ejercicio nuevo).
- **Fase 12 — Capítulo de sintaxis básica de Rust** (`docs/plan-fase12-sintaxis-basica.md`): el usuario notó que el libro promete "cero experiencia previa en Rust" (Capítulo 1.1) pero el Módulo 1 nunca enseñaba la sintaxis básica del lenguaje antes de usarla — causa raíz rastreada hasta la ruta fuente, que asumía "The Rust Book" como recurso base externo nunca comunicado al lector. Nuevo Capítulo 2.1 "Sintaxis básica de Rust" (variables/mutabilidad, tipos primitivos, funciones, control de flujo, `struct`, `enum`+`match` básico, comentarios/`println!`), corriendo el resto del Módulo 1 de 2.1–2.4 a 2.2–2.5. Ningún otro módulo (3.0–7.0) cambió de numeración. **Superada por la Fase 13**, que dividió este mismo Capítulo 2.1 en dos.
- **Fase 13 — División del Capítulo 2.1 y cierre de vacíos de sintaxis** (`docs/plan-fase13-sintaxis-basica-ii.md`): una segunda revisión del Capítulo 2.1 de la Fase 12 encontró cuatro términos usados antes de definirse en los capítulos siguientes (tuplas, slices `&[T]`, dereferencia `*`, atributos/`#[derive(Debug)]`) y ninguna sección en todo el libro sobre cómo leer un mensaje de error del compilador, pese a mencionarlo varias veces. **Segunda fase post-publicación que renumera capítulos, y de nuevo solo dentro del Módulo 1:** el Capítulo 2.1 se dividió en **2.1 "Sintaxis básica de Rust I"** (variables, tipos, funciones, control de flujo, más una sección nueva de lectura de errores del compilador) y **2.2 "Sintaxis básica de Rust II"** (`struct`, tuplas, slices, `enum`/`match`, dereferencia, atributos/`Debug`), corriendo el resto del módulo de 2.2–2.5 a 2.3–2.6. Ningún otro módulo (3.0–7.0) cambió de numeración.

Las Fases 8–11 no introdujeron capítulos nuevos ni renumeraron nada; las Fases 12 y 13 sí renumeran, pero ambas únicamente dentro del Módulo 1 (2.0). Ninguna contradijo el principio de "cero teoría nueva" del Módulo 7.0. Las secciones de abajo ya incorporan todos estos cambios.

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
- **Entregable:** nota editorial — formato de bloques de código, formato de ejercicios (enunciado / pistas colapsables / solución en repositorio anexo), convención de versionado de crates citados. Ampliada en la Fase 9 con una sección de historias de usuario y casos de uso (formato ágil de requisitos usado desde el Módulo 1 en los proyectos guiados), y en la Fase 10 con una sección de TDD (ciclo rojo-verde-refactor, aplicado a los checkpoints de esos mismos proyectos).

---

## 2.0 Módulo 1 — Fundamentos de Rust para Datos Espaciales
*(corresponde a Fase 0 de la ruta)*

### 2.1 Capítulo: Sintaxis básica de Rust I — variables, tipos y control de flujo
- **Entregable:** capítulo de referencia rápida, sin contenido GIS todavía.
- **Contenido fuente:** ninguno directo en la ruta original (que asumía The Rust Book como recurso base externo, ver nota de la Fase 12 más abajo) — cierra el vacío entre la promesa de "cero experiencia previa" del Capítulo 1.1 y el vocabulario que 2.3 en adelante da por asumido. Incluye, desde la Fase 13, una sección sobre cómo leer un mensaje de error del compilador (anatomía de `error[E0384]`, ubicación, `help:`), ausente hasta entonces en todo el libro.
- **Densidad de ejercicios:** 2 ejercicios cortos (validar un rango con `if`/`else`; sumar los elementos de una lista con un bucle).

### 2.2 Capítulo: Sintaxis básica de Rust II — agrupar y representar datos
- **Entregable:** capítulo de referencia rápida, sin contenido GIS todavía. Añadido en la Fase 13 al dividir el Capítulo 2.1 original de la Fase 12.
- **Contenido fuente:** ninguno directo en la ruta original (mismo origen que 2.1). Cierra cuatro vacíos detectados en una revisión posterior a la Fase 12: tuplas, slices `&[T]` vs. `Vec<T>`, dereferencia `*`, y atributos/`#[derive(Debug)]` — los cuatro se usaban en 2.3 y 2.4 sin haberse definido nunca.
- **Densidad de ejercicios:** 4 ejercicios cortos (un `struct` con un método, un `enum` con `match` exhaustivo, formatear coordenadas de una lista de tuplas, depurar con `#[derive(Debug)]`).

### 2.3 Capítulo: Ownership, borrowing y por qué importan en GIS
- **Entregable:** capítulo teórico-práctico corto.
- **Contenido fuente:** Fase 0, fila "Ownership/Borrowing".
- **Densidad de ejercicios:** 3 ejercicios cortos (pasar geometrías por referencia sin copiar, identificar por qué un `fn` no compila, corregir lifetime).

### 2.4 Capítulo: `Result`, `Option` y manejo de errores sin pánico
- **Entregable:** capítulo con proyecto guiado.
- **Densidad de ejercicios:** 4 ejercicios (propagar error con `?`, modelar un error de dominio con enum, convertir un `panic!` en `Result`, tests que verifican el camino de error).

### 2.5 Capítulo: Traits, genéricos e iteradores
- **Densidad de ejercicios:** 4 ejercicios, culminando en el ejercicio integrador del módulo.

### 2.6 Proyecto guiado de cierre de módulo — GeoAPI v0.1
- **Entregable:** walkthrough completo del CLI que parsea CSV de coordenadas (ruta, Fase 0), construido paso a paso con checkpoints de compilación. Cada checkpoint lleva una historia de usuario (Fase 9) y, desde la Fase 10, un test automatizado verificado (Checkpoints 1 y 3; el Checkpoint 2 ya lo tenía; el Checkpoint 4 es ensamblaje de CLI, sin test propio).
- **Criterio de aceptación:** el binario resultante coincide con el artefacto de referencia del repositorio anexo del libro.

**Total ejercicios Módulo 1: 17** — módulo no intermedio, no aplica la densidad alta de 3.0–6.0 (en la Fase 13, 2.1 pasó de 4 a 2 ejercicios y el nuevo 2.2 sumó 4, un neto de +2 sobre los 15 de la Fase 12).

---

## 3.0 Módulo 2 — Primitivas Geoespaciales Puras (`geo`/`geo-types`)
*(corresponde a Fase 1 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 3.1 Capítulo: Modelo OGC Simple Features en Rust
- **Contenido fuente:** Fase 1.1.
- **Densidad de ejercicios:** 5 ejercicios (instanciar cada primitiva, construir un `MultiPolygon` desde cero, detectar un anillo no cerrado, convertir entre `Point`/`Coord`, escribir un test de igualdad geométrica).

### 3.2 Capítulo: CRS geográficos vs. proyectados (sin reproyección todavía)
- **Densidad de ejercicios:** 4 ejercicios (identificar el CRS correcto para un caso de uso, detectar un bbox con ejes invertidos, justificar por qué EPSG:3857 distorsiona área, intersección de bboxes que cruzan el antimeridiano — añadido en la Fase 8, con la subsección de antimeridiano y polos que lo motiva).

### 3.3 Capítulo: `geo` — algoritmos core (área, distancia, simplificación)
- **Densidad de ejercicios:** 7 ejercicios (área geodésica vs. euclidiana, Haversine vs. Vincenty, Douglas-Peucker con distintas tolerancias, Visvalingam-Whyatt, benchmark comparativo, caso límite con geometría vacía, propiedad propia con `proptest` — añadido en la Fase 8, con la subsección de *property-based testing* que lo motiva).

### 3.4 Capítulo: Serialización — GeoJSON, WKT/WKB
- **Densidad de ejercicios:** 5 ejercicios (round-trip GeoJSON, round-trip WKT, manejo de un GeoJSON malformado con `Result`, interoperar con `serde`, normalizar GeoJSON con *winding order* incorrecto — añadido en la Fase 8, con la subsección de la regla de la mano derecha que lo motiva).

### 3.5 Proyecto guiado de cierre de módulo — GeoAPI v0.2 (`geoapi-core`)
- **Entregable:** construcción completa del crate de dominio. Cada checkpoint lleva una historia de usuario (Fase 9; Checkpoint 2 además con caso de uso) y, desde la Fase 10, un test automatizado verificado (Checkpoints 3 y 4; el Checkpoint 2 ya lo tenía; el Checkpoint 1, un `enum` sin comportamiento, documentado explícitamente sin test propio).
- **Ejercicio integrador (obligatorio, evaluado):** el lector extiende `geoapi-core` con una función no cubierta en el capítulo (ej. bounding box de una colección) sin guía paso a paso — primer ejercicio "abierto" del libro.
- **Criterio de aceptación:** `cargo test` pasa sobre el crate de dominio completo.

**Total ejercicios Módulo 2: 21 + 1 integrador abierto** (18 + 3 añadidos en la Fase 8).

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
- **Densidad de ejercicios:** 7 ejercicios (migración formal con `sqlx-cli`, insert vía SQLx con `geozero`, query espacial `ST_DWithin`, mismo flujo con Diesel, índice GiST y medición de mejora, patrón repository, rechazar geometrías inválidas con `ST_IsValid` — el primero reformulado y el último añadido en la Fase 11, con las subsecciones de migraciones formalizadas y geometrías inválidas que los motivan).

### 4.6 Capítulo: I/O adicional — `gdal`, `ndarray`, `shapefile`, `las`
- **Densidad de ejercicios:** 4 ejercicios (leer un DEM y calcular pendiente con `ndarray`, importar un Shapefile legado, leer una nube LAS mínima, comparar memoria AoS vs. SoA).

### 4.7 Proyecto guiado de cierre de módulo — GeoAPI v0.3
- **Entregable:** servidor REST con estado (`POST /features`, `GET /features/near`, `GET /features/reproject`) — ruta Fase 2.6. Cada checkpoint lleva una historia de usuario (Fase 9; Checkpoint 1 además con caso de uso), y desde la Fase 10 un test de integración real combinado (`#[tokio::test]` contra un servidor levantado de verdad, con PostGIS real) que cubre los tres checkpoints juntos.
- **Ejercicio integrador (abierto):** el lector añade un endpoint no especificado en el capítulo (`GET /features/within-polygon`) combinando DE-9IM + PostGIS — con historia de usuario de un sistema de alerta de inundación (Fase 9). Desde la Fase 9, incluye además una extensión narrativa opcional para 4.6 (I/O adicional), el único capítulo del módulo sin checkpoint propio en este proyecto.
- **Criterio de aceptación:** benchmark de <10ms en consulta KNN sobre 100k features, verificado con un script incluido.

**Total ejercicios Módulo 3: 26 + 1 integrador abierto** (sin cambios de conteo en la Fase 8; +1 en la Fase 11 (4.5); enriquecido narrativamente en las Fases 9–10).

---

## 5.0 Módulo 4 — Concurrencia, Cloud-Native y FFI Seguro
*(corresponde a Fase 3 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 5.1 Capítulo: Paralelismo de datos con Rayon
- **Densidad de ejercicios:** 5 ejercicios (convertir un `.iter()` a `.par_iter()` y medir speedup, identificar un caso donde paralelizar *no* ayuda, reproyección batch paralela, detectar un patrón irregular que requiere `Mutex`, reproducir el bloqueo del runtime de Tokio y confirmar la corrección con `spawn_blocking` — añadido en la Fase 11, con la subsección del contrato IO-bound vs. CPU-bound que lo motiva).

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
- **Entregable:** extensión de streaming cloud-native (ruta Fase 3.5). Cada una de las tres secciones (PMTiles, FlatGeobuf, Rayon) lleva una historia de usuario (Fase 9), y desde la Fase 10 un test de integración real combinado (`#[tokio::test]` contra un servidor levantado de verdad, con archivos PMTiles/FlatGeobuf de prueba servidos localmente) que cubre las tres juntas.
- **Ejercicio integrador (abierto):** añadir soporte de un cuarto formato cloud-native no cubierto explícitamente en el capítulo, reutilizando el patrón de streaming ya construido — con historias de usuario para las dos opciones ya sugeridas, COG y COPC (Fase 9). Desde la Fase 9, incluye además una extensión narrativa opcional para 5.6 (FFI seguro), el único capítulo del módulo sin checkpoint propio en este proyecto.
- **Criterio de aceptación:** la API sirve un archivo remoto de prueba (>1GB) transfiriendo solo el subconjunto relevante, verificado inspeccionando los bytes de red.

**Total ejercicios Módulo 4: 23 + 1 integrador abierto** (sin cambios de conteo en la Fase 8; +1 en la Fase 11 (5.1); enriquecido narrativamente en las Fases 9–10).

---

## 6.0 Módulo 5 — Arquitectura de APIs GIS de Producción
*(corresponde a Fase 4 de la ruta — MÓDULO INTERMEDIO: alta densidad de ejercicios)*

### 6.1 Capítulo: Axum vs. Actix-web — decisión arquitectónica
- **Densidad de ejercicios:** 5 ejercicios (migrar un endpoint entre ambos frameworks, benchmark propio, justificar por escrito la elección para un caso dado, mapeo de errores con `IntoResponse`/RFC 7807, medir tu propio caso de streaming vs. naive — los dos últimos añadidos en la Fase 8, con las subsecciones de mapeo de errores y streaming DB→HTTP que los motivan).

### 6.2 Capítulo: Middleware con Tower — caché, rate-limiting, timeouts
- **Densidad de ejercicios:** 7 ejercicios (cachear respuestas de teselas con `moka`, rate-limit por IP, timeout configurable, tracing de latencia por endpoint, reproducir la trampa de `allow_origin` y confirmar la corrección, límite de payload por tipo de endpoint, autenticación con API keys por ruta — los dos de en medio añadidos en la Fase 8 (CORS y límite de payload), el último añadido en la Fase 11, con la subsección de autenticación con API keys que lo motiva).

### 6.3 Capítulo: Contratos MVT y el patrón Martin
- **Contenido fuente:** Fase 4.2.
- **Densidad de ejercicios:** 4 ejercicios (servir una tesela MVT propia, exponer TileJSON, comparar contra el comportamiento documentado de Martin, servir desde PMTiles sin base de datos).

### 6.4 Capítulo: OGC API Features / WFS / WMS — interoperabilidad
- **Densidad de ejercicios:** 3 ejercicios (implementar un endpoint mínimo compatible con OGC API Features, validar contra un cliente QGIS, documentar el contrato con OpenAPI — sin cambio de conteo en la Fase 11, que añadió solo una mención prosística de `utoipa` como alternativa, sin ejercicio propio).

### 6.5 Capítulo: Observabilidad, resiliencia y despliegue
- **Densidad de ejercicios:** 5 ejercicios (instrumentar con `tracing`, definir un healthcheck, contenerizar el servicio, compilar `geoapi-core` a WASM y ejecutarlo en un contexto de navegador simulado, agotamiento del *pool* de conexiones — el último añadido en la Fase 11, con la subsección homónima que lo motiva).

### 6.6 Proyecto guiado de cierre de módulo — GeoAPI v1.0
- **Entregable:** consolidación en plataforma de producción (ruta Fase 4.4). El marco general del capítulo y cada fila de la tabla de inventario llevan una historia de usuario (Fase 9); ya tenía tests de integración reales antes de la Fase 10, que le añadió solo una nota de continuidad TDD (sin tests nuevos, dado que el capítulo ya los tenía).
- **Ejercicio integrador (abierto):** desplegar el stack completo con CI que corre tests de integración contra una instancia PostGIS efímera.
- **Criterio de aceptación:** pipeline de CI en verde, documentado con logs de ejecución de referencia.

**Total ejercicios Módulo 5: 24 + 1 integrador abierto** (18 + 4 añadidos en la Fase 8 + 2 añadidos en la Fase 11: 6.2 y 6.5).

---

## 7.0 Módulo Final — Proyectos Integrales (Capstones)

> **Regla estricta de este módulo:** cero teoría nueva. Cada capstone es una especificación de proyecto que el lector construye de forma autónoma, con una tabla de trazabilidad obligatoria que referencia explícitamente qué capítulo de qué módulo previo cubre cada pieza técnica requerida. Ningún capstone puede exigir un concepto no enseñado en 2.0–6.0.

### 7.1 Capstone A — Servidor de teselas vectoriales cloud-native completo
- **Alcance:** API que sirve MVT desde PMTiles + fallback a PostGIS para datos editables, con caché y observabilidad. Historia de usuario y caso de uso (Fase 9, addendum): un portal de mapas municipal y la cadena de *fallback* PMTiles→caché→PostGIS. Nota TDD (Fase 10): la suite de aceptación de este capstone ES TDD en su forma más literal — los tests existen antes que el servidor del lector.
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
- **Alcance:** endpoint de agregación espacial (ej. estadística zonal) sobre un dataset GeoParquet en almacenamiento de objetos, con paralelismo Rayon y respuesta streaming. Historia de usuario y caso de uso (Fase 9, addendum): una agencia de planeación regional y la consulta de estadística zonal en streaming. Nota TDD (Fase 10): sin suite de tests fija por diseño, pero el test de consistencia secuencial-vs-paralelo del criterio de aceptación debe escribirse antes de medir tiempos.
- **Tabla de trazabilidad:**

| Requisito del capstone | Módulo/Capítulo que lo cubre |
|---|---|
| Álgebra de mapas / operaciones zonales | 4.6 |
| Predicate pushdown sobre GeoParquet | 5.4 |
| Paralelismo con Rayon | 5.1 |
| Contrato de API y manejo de errores | 2.4, 6.1 |
| Observabilidad de una operación de larga duración | 6.5 |

- **Criterio de aceptación:** benchmark de tiempo de respuesta documentado por el lector, comparando ejecución secuencial vs. paralela sobre el mismo dataset.

### 7.3 Capstone C — Plataforma LiDAR con streaming COPC
- **Alcance:** API que expone niveles de detalle (LOD) de una nube de puntos COPC remota, con reproyección on-the-fly y wrapper FFI seguro para un cálculo geométrico no cubierto en `geo` (ej. validación con GEOS). Historia de usuario y caso de uso (Fase 9, addendum): una empresa de inspección de líneas eléctricas con drones y la validación de un área de interés antes de consultar la nube por nivel de detalle. Nota TDD (Fase 10): sin tests forzados por diseño (el criterio es la tabla de trazabilidad), pero `razon_invalidez` es candidata natural a escribirse test-primero.
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

**Densidad total de ejercicios en módulos intermedios (3.0–6.0): 94 ejercicios guiados + 4 ejercicios integradores abiertos** (83 + 7 añadidos en la Fase 8: +3 en 3.0, +4 en 6.0; + 4 añadidos en la Fase 11: +1 en 4.0, +1 en 5.0, +2 en 6.0), antes de llegar a los tres capstones no guiados del Módulo 7.0.

## Resumen de entregables por módulo

| EDT | Módulo | Corresponde a | Ejercicios guiados | Ejercicio integrador |
|---|---|---|---|---|
| 1.0 | Front matter | — | — | — |
| 2.0 | Fundamentos de Rust | Fase 0 | 17 | 1 (proyecto guiado, no abierto) |
| 3.0 | Primitivas geoespaciales | Fase 1 | 21 | 1 abierto |
| 4.0 | Índices y persistencia | Fase 2 | 25 | 1 abierto |
| 5.0 | Cloud-native y FFI | Fase 3 | 22 | 1 abierto |
| 6.0 | Arquitectura de producción | Fase 4 | 22 | 1 abierto |
| 7.0 | Capstones | Fases 0–4 (integración) | 0 (proyectos completos) | 3 capstones |
