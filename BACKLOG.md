# BACKLOG — Libro "APIs GIS con Rust"

> Memoria de trabajo entre sesiones. Antes de tocar cualquier archivo, lee este backlog completo y verifica su estado contra los archivos reales de `src/` — no asumas que refleja la realidad sin comprobarlo.

Última actualización: 2026-09-03 (cierre de Fase 1).

Repositorio remoto: `git@github.com:NicolasPlata/gis-rust-mdbook.git` — configurado como `origin` desde el cierre de Fase 0 (ver Decisión #6). Desde ahora, cada commit se sigue de un `git push` inmediato.

---

## Decisiones registradas (desviaciones o interpretaciones no explícitas en la EDT)

1. **Split de "Configuración del repositorio remoto":** el `CLAUDE.md` describe el flujo remoto (git init → remote add → `git-repository-url` en `book.toml` → workflow de despliegue → push) como un bloque único a ejecutar "una vez recibido el link". Pero la tabla de fases asigna explícitamente "configuración del remoto, workflow de GitHub Pages, git push" a la **Fase 7**. Se resuelve el conflicto así: `git init` (repo local, sin remoto) se hace en **Fase 0** porque hace falta para los commits atómicos de cada capítulo desde la Fase 1 en adelante; `git remote add`, `git-repository-url` en `book.toml`, el workflow `.github/workflows/deploy.yml` y el `git push` quedan diferidos a la **Fase 7**, tal como indica la tabla de fases.
2. **Estructura de apéndices de soluciones:** la EDT exige que la solución de cada ejercicio esté "colapsada o en un apéndice/repositorio anexo, nunca a la vista inmediata del enunciado", pero no especifica la organización exacta. Se decide un apéndice por módulo (`src/08-apendices/soluciones-modulo-N.md`) en vez de un archivo por ejercicio, para no fragmentar en exceso el `SUMMARY.md`.
3. **Numeración de archivos:** se usa el número de la EDT como prefijo de carpeta/archivo (ej. `03-primitivas-geoespaciales/01-modelo-simple-features.md` para EDT 3.1), tal como pide el `CLAUDE.md`.
4. **Desglose exacto de ejercicios en 2.3 y 4.1:** la EDT da la cantidad total pero no siempre enumera un ítem por ejercicio (2.3 dice "4 ejercicios, culminando en el ejercicio integrador del módulo" sin listar los 4; 4.1 lista 3 grupos temáticos pero cuenta "4 ejercicios", probablemente porque "intersects/contains/touches" se desdobla en más de un ejercicio). Se deja marcado explícitamente en cada caso; el desglose final se resuelve al redactar el capítulo correspondiente, respetando el conteo total exigido.
5. **`CLAUDE.md` no existía como archivo en el repo** (llegó como contexto de sistema de la sesión). Se escribió su contenido en la raíz del repositorio en la Fase 0 para que cualquier sesión futura lo cargue automáticamente al abrir este directorio, tal como el propio documento exige ("léelo completo antes de tocar cualquier archivo").
6. **Override explícito del usuario sobre cadencia de push (2026-09-03):** al aprobar el paso a Fase 1, el usuario pidió "haz push en cada commit" a partir de ahora. Esto adelanta de la Fase 7 solo dos pasos — `git remote add origin` y el primer `git push` — que ya se ejecutaron. El resto del alcance de Fase 7 (`git-repository-url` en `book.toml`, workflow `.github/workflows/deploy.yml` de GitHub Pages) sigue diferido hasta esa fase. De aquí en adelante, cada commit atómico de capítulo/unidad de trabajo se sigue con un `git push` inmediato a `origin main`, sin pedir confirmación adicional por push individual (la confirmación general ya la dio el usuario en este mensaje).
7. **"Repositorio de referencia/anexo" para proyectos guiados y soluciones:** la EDT (ej. criterio de aceptación de 2.4) menciona un "artefacto de referencia del repositorio anexo del libro" y "repositorio anexo" como lugar para soluciones. Este repositorio de trabajo es únicamente el mdBook (según `CLAUDE.md`, "Estructura técnica del mdBook") — no se crea un repositorio de código separado. Se interpreta el criterio de aceptación de cada proyecto guiado y cada ejercicio como cumplido cuando: (a) el código embebido en el capítulo/apéndice compila y sus tests pasan, verificado con `mdbook test` como parte del proceso normal de cada commit, y (b) el comportamiento descrito (ej. "reporta errores sin detenerse") queda demostrado por esos mismos tests. Si el usuario más adelante quiere un repositorio de código anexo real y ejecutable además del libro, es una ampliación de alcance a decidir explícitamente, no algo que se ejecuta "de memoria".
8. **Verificación de código que usa crates externos (desde Módulo 2 en adelante):** `mdbook test` solo compila bloques ```rust``` como doctests sin acceso a dependencias externas — sirve para el Módulo 1 (std puro) pero no para capítulos que usan `geo`, `geo-types`, `geojson`, `wkt`, etc. A partir del Capítulo 3.1, esos bloques se marcan ```rust,ignore``` (mdbook los omite, no los falla) y se verifican aparte: se escribió y corrió un crate de verificación real en el scratchpad de la sesión (con las dependencias exactas citadas en cada capítulo) para confirmar que cada snippet compila y produce la salida mostrada, antes de transcribirlo al libro. Ese crate de verificación no se commitea a este repositorio — es una herramienta de la sesión, no parte del entregable. Esto ya permitió detectar y corregir una afirmación incorrecta sobre `Polygon::new` en 3.1 (sí auto-cierra el anillo exterior, no lo deja abierto).

---

## Fase 0 — Setup e infraestructura

- [x] Leer documentos fuente: `docs/ruta-aprendizaje-rust-gis-apis.md`, `docs/EDT-libro-rust-gis-apis.md`
- [x] Recibir del usuario el link del repositorio remoto de GitHub
- [x] Crear `BACKLOG.md`
- [x] Escribir `CLAUDE.md` en la raíz del repo (no existía como archivo — ver Decisiones #5)
- [x] `git init` (repo local, sin remoto todavía — remoto diferido a Fase 7)
- [x] Crear `book.toml` (sin `git-repository-url` todavía — se añade en Fase 7)
- [x] Crear `src/SUMMARY.md` con la estructura completa derivada de la EDT (1.0–7.0 + apéndices), capítulos vacíos
- [x] Crear archivos placeholder de todos los capítulos (1.1 a 7.4) y de los apéndices de soluciones (uno por módulo intermedio)
- [x] Crear `.gitignore` (excluir `book/` generado por mdBook)
- [x] Verificar `mdbook build` sin errores ni warnings de enlaces rotos
- [x] Commit inicial de la Fase 0
- [x] Resumen a usuario + espera de aprobación explícita para pasar a Fase 1

---

## Fase 1 — Front matter + Fundamentos de Rust (EDT 1.0–2.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 0.*

### 1.0 Front Matter y Configuración del Proyecto-Libro

- [x] **1.1** Introducción y mapa de la ruta — presenta el hilo conductor GeoAPI + tabla Módulo del libro ↔ Fase de la ruta
- [x] **1.2** Entorno de trabajo del libro — toolchain Rust, `cargo`, workspace multi-crate (`geoapi-core`, `geoapi-api`, `geoapi-db`); un lector nuevo debe poder compilar el esqueleto solo con este capítulo
- [x] **1.3** Convenciones del libro — formato de bloques de código, formato de ejercicios (enunciado/pistas colapsables/solución en apéndice), convención de versionado de crates citados

### 2.0 Módulo 1 — Fundamentos de Rust para Datos Espaciales *(Fase 0 de la ruta)*

- [x] **2.1** Ownership, borrowing y por qué importan en GIS
  - [x] Ejercicio 1: pasar una geometría por referencia sin copiarla
  - [x] Ejercicio 2: identificar por qué una `fn` dada no compila
  - [x] Ejercicio 3: corregir un lifetime
- [x] **2.2** `Result`, `Option` y manejo de errores sin pánico
  - [x] Ejercicio 1: propagar error con `?`
  - [x] Ejercicio 2: modelar un error de dominio con `enum`
  - [x] Ejercicio 3: convertir un `panic!` en `Result`
  - [x] Ejercicio 4: tests que verifican el camino de error
- [x] **2.3** Traits, genéricos e iteradores
  - [x] Ejercicio 1: implementar un trait (`Etiquetable`) para dos tipos distintos
  - [x] Ejercicio 2: función genérica con cota de trait (`punto_medio<T: Into<f64> + Copy>`)
  - [x] Ejercicio 3: reemplazar un bucle manual por una cadena de iteradores
  - [x] Ejercicio 4 — integrador: parseo con `?` + iteradores para longitud total de ruta (prepara directamente el proyecto 2.4)
- [x] **2.4** Proyecto guiado de cierre — GeoAPI v0.1: CLI que parsea CSV de coordenadas WGS84 a `struct Coord { lat: f64, lon: f64 }` con validación `Result`
  - [x] Walkthrough completo con checkpoints de compilación (4 checkpoints: parseo de fila, procesar CSV completo con reporte de errores sin detenerse, longitud total, main real con argv/fs)
  - [x] Criterio de aceptación cumplido vía tests embebidos en el capítulo y verificados con `mdbook test` (ver Decisión #7 sobre "repositorio anexo")
- [x] Apéndice — Soluciones de ejercicios Módulo 1 (`src/08-apendices/soluciones-modulo-1.md`)
- [x] `mdbook build` limpio tras Fase 1 (sin warnings de enlaces rotos)
- [x] `mdbook test` limpio (todos los bloques `rust` de Fase 1 compilan y sus tests pasan)
- [x] Commit(s) atómicos de Fase 1 (uno por capítulo/unidad coherente) + push tras cada uno
- [x] Resumen a usuario + espera de aprobación explícita para pasar a Fase 2

**Total ejercicios Módulo 1: 11 guiados + 1 integrador (proyecto guiado, no abierto).**

---

## Fase 2 — Primitivas geoespaciales puras (EDT 3.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 1.*

### 3.0 Módulo 2 — Primitivas Geoespaciales Puras (`geo`/`geo-types`) *(Fase 1 de la ruta — módulo intermedio, alta densidad de ejercicios)*

- [x] **3.1** Modelo OGC Simple Features en Rust
  - [x] Ejercicio 1: instanciar cada primitiva (`Point`, `LineString`, `Polygon`, `Multi*`)
  - [x] Ejercicio 2: construir un `MultiPolygon` desde cero
  - [x] Ejercicio 3: detectar un anillo no cerrado
  - [x] Ejercicio 4: convertir entre `Point`/`Coord`
  - [x] Ejercicio 5: escribir un test de igualdad geométrica
- [x] **3.2** CRS geográficos vs. proyectados (sin reproyección todavía)
  - [x] Ejercicio 1: identificar el CRS correcto para un caso de uso
  - [x] Ejercicio 2: detectar un bbox con ejes invertidos
  - [x] Ejercicio 3: justificar por qué EPSG:3857 distorsiona área
- [x] **3.3** `geo` — algoritmos core (área, distancia, simplificación)
  - [x] Ejercicio 1: área geodésica vs. euclidiana
  - [x] Ejercicio 2: Haversine vs. Vincenty
  - [x] Ejercicio 3: Douglas-Peucker con distintas tolerancias
  - [x] Ejercicio 4: Visvalingam-Whyatt
  - [x] Ejercicio 5: benchmark comparativo
  - [x] Ejercicio 6: caso límite con geometría vacía
- [ ] **3.4** Serialización — GeoJSON, WKT/WKB
  - [ ] Ejercicio 1: round-trip GeoJSON
  - [ ] Ejercicio 2: round-trip WKT
  - [ ] Ejercicio 3: manejo de un GeoJSON malformado con `Result`
  - [ ] Ejercicio 4: interoperar con `serde`
- [ ] **3.5** Proyecto guiado de cierre — GeoAPI v0.2 (`geoapi-core`)
  - [ ] Construcción completa del crate de dominio (deserializar Feature GeoJSON → `geo_types::Geometry`, funciones puras área/longitud/centroide/simplificación, serializar de vuelta)
  - [ ] Ejercicio integrador abierto: extender `geoapi-core` con una función no cubierta (ej. bounding box de una colección), sin guía paso a paso
  - [ ] Verificar `cargo test` pasa sobre el crate de dominio completo
- [ ] Apéndice — Soluciones de ejercicios Módulo 2 (`src/08-apendices/soluciones-modulo-2.md`)
- [ ] `mdbook build` (y `mdbook test` sobre bloques ```rust``` verificables) limpio tras Fase 2
- [ ] Commit(s) atómicos de Fase 2
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 3

**Total ejercicios Módulo 2: 18 guiados + 1 integrador abierto.**

---

## Fase 3 — Índices, robustez y persistencia — primer servidor (EDT 4.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 2.*

### 4.0 Módulo 3 — Índices, Robustez y Persistencia (Primer Servidor) *(Fase 2 de la ruta — módulo intermedio)*

- [ ] **4.1** DE-9IM y el trait `Relate`
  - [ ] Ejercicio 1: matriz DE-9IM manual vs. `Relate`
  - [ ] Ejercicio 2: implementar `intersects` con datos reales
  - [ ] Ejercicio 3: implementar `contains`/`touches` con datos reales
  - [ ] Ejercicio 4: caso de colinealidad casi-degenerada
- [ ] **4.2** Predicados exactos con `robust`
  - [ ] Ejercicio 1: reproducir un fallo de precisión con f64 puro
  - [ ] Ejercicio 2: corregirlo con `robust`
- [ ] **4.3** Índices espaciales — `rstar`, `geo-index`, `h3o`
  - [ ] Ejercicio 1: construir un R*-tree con 100k puntos
  - [ ] Ejercicio 2: consulta KNN
  - [ ] Ejercicio 3: comparar latencia `rstar` vs. `geo-index` en el mismo dataset
  - [ ] Ejercicio 4: indexar con H3 a dos resoluciones
  - [ ] Ejercicio 5: invalidar/reconstruir el índice tras una edición
  - [ ] Ejercicio 6: ejercicio de perfilado
- [ ] **4.4** Reproyección con `proj`
  - [ ] Ejercicio 1: WGS84 → UTM
  - [ ] Ejercicio 2: ida y vuelta con pérdida de precisión medida
  - [ ] Ejercicio 3: manejo de un punto fuera de dominio válido como `Result::Err`
- [ ] **4.5** Persistencia con PostGIS — SQLx y Diesel
  - [ ] Ejercicio 1: migración con `ST_SetSRID`
  - [ ] Ejercicio 2: insert vía SQLx con `geozero`
  - [ ] Ejercicio 3: query espacial `ST_DWithin`
  - [ ] Ejercicio 4: mismo flujo con Diesel
  - [ ] Ejercicio 5: índice GiST y medición de mejora
  - [ ] Ejercicio 6: patrón repository
- [ ] **4.6** I/O adicional — `gdal`, `ndarray`, `shapefile`, `las`
  - [ ] Ejercicio 1: leer un DEM y calcular pendiente con `ndarray`
  - [ ] Ejercicio 2: importar un Shapefile legado
  - [ ] Ejercicio 3: leer una nube LAS mínima
  - [ ] Ejercicio 4: comparar memoria AoS vs. SoA
- [ ] **4.7** Proyecto guiado de cierre — GeoAPI v0.3 (servidor REST con estado)
  - [ ] `POST /features` vía SQLx
  - [ ] `GET /features/near?lat&lon&radius` con `rstar` en memoria + fallback `ST_DWithin`
  - [ ] `GET /features/reproject?crs=` con `proj`
  - [ ] Ejercicio integrador abierto: `GET /features/within-polygon` combinando DE-9IM + PostGIS
  - [ ] Verificar benchmark <10ms en consulta KNN sobre 100k features (script incluido)
- [ ] Apéndice — Soluciones de ejercicios Módulo 3 (`src/08-apendices/soluciones-modulo-3.md`)
- [ ] `mdbook build` limpio tras Fase 3
- [ ] Commit(s) atómicos de Fase 3
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 4

**Total ejercicios Módulo 3: 25 guiados + 1 integrador abierto.**

---

## Fase 4 — Concurrencia, cloud-native y FFI seguro (EDT 5.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 3.*

### 5.0 Módulo 4 — Concurrencia, Cloud-Native y FFI Seguro *(Fase 3 de la ruta — módulo intermedio)*

- [ ] **5.1** Paralelismo de datos con Rayon
  - [ ] Ejercicio 1: convertir un `.iter()` a `.par_iter()` y medir speedup
  - [ ] Ejercicio 2: identificar un caso donde paralelizar no ayuda
  - [ ] Ejercicio 3: reproyección batch paralela
  - [ ] Ejercicio 4: detectar un patrón irregular que requiere `Mutex`
- [ ] **5.2** FlatGeobuf y HTTP Range Requests
  - [ ] Ejercicio 1: leer un `.fgb` local
  - [ ] Ejercicio 2: filtrar por bbox
  - [ ] Ejercicio 3: apuntar a un `.fgb` remoto en HTTP y medir bytes transferidos
  - [ ] Ejercicio 4: manejar un servidor sin soporte de Range
- [ ] **5.3** Cloud-Optimized GeoTIFF (COG)
  - [ ] Ejercicio 1: leer overview de baja resolución
  - [ ] Ejercicio 2: extraer una banda específica
  - [ ] Ejercicio 3: calcular NDVI sobre una ventana parcial
- [ ] **5.4** PMTiles v3 y GeoParquet/GeoArrow
  - [ ] Ejercicio 1: leer un archivo PMTiles local
  - [ ] Ejercicio 2: servirlo con backend `mmap`
  - [ ] Ejercicio 3: leer un GeoParquet con predicate pushdown
  - [ ] Ejercicio 4: comparar tamaño/latencia vs. GeoJSON equivalente
- [ ] **5.5** COPC y streaming de nubes de puntos
  - [ ] Ejercicio 1: leer metadatos de un `.copc.laz`
  - [ ] Ejercicio 2: extraer un nivel de detalle (LOD)
  - [ ] Ejercicio 3: streaming asíncrono de un octree remoto
- [ ] **5.6** FFI seguro — el patrón `-sys` + wrapper, y `geos`
  - [ ] Ejercicio 1: identificar la superficie `unsafe` mínima de un wrapper dado
  - [ ] Ejercicio 2: escribir un comentario `// SAFETY:` correcto
  - [ ] Ejercicio 3: envolver un puntero con `Drop`
  - [ ] Ejercicio 4: usar `PreparedGeometry` de `geos` en una consulta repetida
- [ ] **5.7** Proyecto guiado de cierre — GeoAPI v0.4 (streaming cloud-native)
  - [ ] Servir teselas MVT desde PMTiles en S3 sin backend de BD
  - [ ] `GET /features/stream?bbox=` sobre FlatGeobuf remoto
  - [ ] Paralelizar con `rayon` un endpoint batch de reproyección de hasta 1M de puntos
  - [ ] Ejercicio integrador abierto: cuarto formato cloud-native no cubierto explícitamente, reutilizando el patrón de streaming
  - [ ] Verificar que la API sirve un archivo remoto >1GB transfiriendo solo el subconjunto relevante (inspección de bytes de red)
- [ ] Apéndice — Soluciones de ejercicios Módulo 4 (`src/08-apendices/soluciones-modulo-4.md`)
- [ ] `mdbook build` limpio tras Fase 4
- [ ] Commit(s) atómicos de Fase 4
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 5

**Total ejercicios Módulo 4: 22 guiados + 1 integrador abierto.**

---

## Fase 5 — Arquitectura de APIs GIS de producción (EDT 6.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 4.*

### 6.0 Módulo 5 — Arquitectura de APIs GIS de Producción *(Fase 4 de la ruta — módulo intermedio)*

- [ ] **6.1** Axum vs. Actix-web — decisión arquitectónica
  - [ ] Ejercicio 1: migrar un endpoint entre ambos frameworks
  - [ ] Ejercicio 2: benchmark propio
  - [ ] Ejercicio 3: justificar por escrito la elección para un caso dado
- [ ] **6.2** Middleware con Tower — caché, rate-limiting, timeouts
  - [ ] Ejercicio 1: cachear respuestas de teselas con `moka`
  - [ ] Ejercicio 2: rate-limit por IP
  - [ ] Ejercicio 3: timeout configurable
  - [ ] Ejercicio 4: tracing de latencia por endpoint
- [ ] **6.3** Contratos MVT y el patrón Martin
  - [ ] Ejercicio 1: servir una tesela MVT propia
  - [ ] Ejercicio 2: exponer TileJSON
  - [ ] Ejercicio 3: comparar contra el comportamiento documentado de Martin
  - [ ] Ejercicio 4: servir desde PMTiles sin base de datos
- [ ] **6.4** OGC API Features / WFS / WMS — interoperabilidad
  - [ ] Ejercicio 1: implementar un endpoint mínimo compatible con OGC API Features
  - [ ] Ejercicio 2: validar contra un cliente QGIS
  - [ ] Ejercicio 3: documentar el contrato con OpenAPI
- [ ] **6.5** Observabilidad, resiliencia y despliegue
  - [ ] Ejercicio 1: instrumentar con `tracing`
  - [ ] Ejercicio 2: definir un healthcheck
  - [ ] Ejercicio 3: contenerizar el servicio
  - [ ] Ejercicio 4: compilar `geoapi-core` a WASM y ejecutarlo en un contexto de navegador simulado
- [ ] **6.6** Proyecto guiado de cierre — GeoAPI v1.0 (plataforma de producción)
  - [ ] Consolidación: API REST + servidor de teselas + caché + observabilidad + CI con tests de integración contra PostGIS efímera
  - [ ] Ejercicio integrador abierto: desplegar el stack completo con CI
  - [ ] Verificar pipeline de CI en verde (documentado con logs de referencia)
- [ ] Apéndice — Soluciones de ejercicios Módulo 5 (`src/08-apendices/soluciones-modulo-5.md`)
- [ ] `mdbook build` limpio tras Fase 5
- [ ] Commit(s) atómicos de Fase 5
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 6

**Total ejercicios Módulo 5: 18 guiados + 1 integrador abierto.**

---

## Fase 6 — Módulo final: capstones (EDT 7.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 5. Regla estricta: cero teoría nueva en esta fase.*

### 7.0 Módulo Final — Proyectos Integrales (Capstones)

- [ ] **7.1** Capstone A — Servidor de teselas vectoriales cloud-native completo
  - [ ] Especificación de alcance (MVT desde PMTiles + fallback PostGIS + caché + observabilidad)
  - [ ] Tabla de trazabilidad obligatoria (dominio/GeoJSON→3.1,3.3,3.4; índice en memoria→4.3; PostGIS/SQLx→4.5; PMTiles→5.4; Axum+middleware→6.1,6.2; MVT/TileJSON→6.3; observabilidad→6.5)
  - [ ] Criterio de aceptación: suite de tests de aceptación provista por el libro
- [ ] **7.2** Capstone B — API analítica sobre GeoParquet a escala
  - [ ] Especificación de alcance (agregación espacial/estadística zonal, paralelismo Rayon, respuesta streaming)
  - [ ] Tabla de trazabilidad (álgebra de mapas→4.6; predicate pushdown GeoParquet→5.4; Rayon→5.1; contrato de API/errores→2.2,6.1; observabilidad→6.5)
  - [ ] Criterio de aceptación: benchmark secuencial vs. paralelo documentado por el lector
- [ ] **7.3** Capstone C — Plataforma LiDAR con streaming COPC
  - [ ] Especificación de alcance (LOD de nube COPC remota, reproyección on-the-fly, wrapper FFI seguro con GEOS)
  - [ ] Tabla de trazabilidad (lectura LiDAR→4.6; streaming COPC→5.5; reproyección→4.4; FFI seguro→5.6; Axum/contrato→6.1,6.4)
  - [ ] Criterio de aceptación: documentación explícita de trazabilidad por el lector
- [ ] **7.4** Cierre del libro — Retrospectiva de arquitectura
  - [ ] Capítulo breve que recorre los tres capstones y muestra el crate `geoapi-core` compartido, cerrando el hilo abierto en 1.1
- [ ] `mdbook build` limpio tras Fase 6
- [ ] Commit(s) atómicos de Fase 6
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 7

---

## Fase 7 — Despliegue (cierre)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 6.*

- [x] `git remote add origin git@github.com:NicolasPlata/gis-rust-mdbook.git` (adelantado al cierre de Fase 0 por pedido explícito del usuario, ver Decisión #6)
- [x] Primer `git push -u origin main` (idem, ya autorizado por el usuario)
- [ ] Añadir `git-repository-url` (y `edit-url-template` si aplica) a `book.toml` apuntando al remoto
- [ ] Crear `.github/workflows/deploy.yml` — build con `mdbook build` y publicación de `book/` a GitHub Pages en cada push a la rama principal
- [ ] Verificación final de build completo del libro (`mdbook build` + `mdbook test` sin errores)
- [ ] Verificar despliegue en GitHub Pages (Actions en verde, sitio accesible)

---

## Resumen de progreso por fase

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Setup e infraestructura | Cerrada |
| 1 | Front matter + Fundamentos de Rust (EDT 1.0–2.0) | Cerrada, pendiente aprobación para Fase 2 |
| 2 | Primitivas geoespaciales puras (EDT 3.0) | No iniciada |
| 3 | Índices, robustez y persistencia (EDT 4.0) | No iniciada |
| 4 | Concurrencia, cloud-native y FFI seguro (EDT 5.0) | No iniciada |
| 5 | Arquitectura de producción (EDT 6.0) | No iniciada |
| 6 | Módulo final — capstones (EDT 7.0) | No iniciada |
| 7 | Despliegue | No iniciada |
