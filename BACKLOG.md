# BACKLOG — Libro "APIs GIS con Rust"

> Memoria de trabajo entre sesiones. Antes de tocar cualquier archivo, lee este backlog completo y verifica su estado contra los archivos reales de `src/` — no asumas que refleja la realidad sin comprobarlo.

Última actualización: 2026-09-07 (Fase 5 cerrada, pendiente aprobación para Fase 6).

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
9. **Override explícito del usuario: adelantar el workflow de GitHub Pages (2026-09-03):** antes de aprobar el paso a Fase 3, el usuario pidió desplegar lo que hay hasta ahora en GitHub Actions, pero **solo con disparo manual** (`workflow_dispatch`), nunca automático en cada push. Esto adelanta de la Fase 7 los pasos "`git-repository-url` en `book.toml`" y "workflow de GitHub Pages" — el `git push` normal de cada commit ya estaba adelantado desde la Decisión #6. Se creó `.github/workflows/deploy.yml` con `on: workflow_dispatch` únicamente (sin `on: push`), que instala mdBook 0.5.4 (misma versión usada localmente), corre `mdbook build`, y despliega `book/` a GitHub Pages vía `actions/upload-pages-artifact` + `actions/deploy-pages`. **Pendiente por parte del usuario (no automatizable desde esta sesión, no hay `gh` CLI disponible):** activar "GitHub Pages" en Settings → Pages → Build and deployment → Source: "GitHub Actions" del repositorio, una sola vez, antes de que el workflow pueda desplegar con éxito. También se corrigió `git-repository-icon = "fa-github"` (el valor que sugiere la documentación de mdBook 0.5.4) por default (sin la clave) porque ese literal no es un ícono válido de Font Awesome en esta versión y rompía `mdbook build` — el ícono por defecto real (`fab-github`) sí funciona y ya se ve en el sitio generado.
10. **Hallazgo de verificación para 4.1/4.2 (2026-09-06):** al inspeccionar el código fuente de `geo` 0.33.1 (extraído del `.crate` cacheado localmente, no solo la documentación) se confirmó que `GeoNum for f64` fija `type Ker = RobustKernel` (`geo-0.33.1/src/lib.rs`), es decir, **`geo` ya usa el crate `robust` internamente para cualquier predicado de orientación sobre tipos `f64`** (`Relate`, `Contains`, `Intersects`, etc.), vía `robust::orient2d`. Esto se verificó de forma concreta: una fórmula de orientación escrita a mano con `f64` puro sobre un trío de vértices UTM casi colineales (`541954.23…, 4446963.10…` / `511991.33…, 4437588.90…` / `509475.34…, 4436801.75…`) da exactamente `0.0` (falso positivo de colinealidad), mientras que `geo::Line::contains` sobre el mismo trío da `false` (correcto) y `robust::orient2d` da `2.6077…e-8` (no cero). Este caso real (no inventado) se usa en ambos capítulos 4.1 y 4.2 como hilo conductor. Consecuencia para el libro: 4.1 no necesitó buscar un caso donde `Relate` se equivocara (no lo hace, por diseño) — en cambio contrasta `Relate` (protegido) contra una fórmula ingenua (no protegida), y 4.2 explica que esa protección solo aplica dentro de `geo`, no a predicados propios del lector.
11. **Base de datos real de verificación para 4.5/4.7 (2026-09-06):** el usuario creó, a petición de esta sesión, un rol `nicolas` (`SUPERUSER LOGIN`) y una base `geoapi_verificacion` en el cluster PostgreSQL 16 + PostGIS 3.4 ya instalado localmente en el sistema (ver también la Decisión #8, que ya usaba crates de verificación en el scratchpad — esta es la misma idea aplicada a una base de datos real en vez de solo un crate). Cadena de conexión usada: `postgresql:///geoapi_verificacion?host=/var/run/postgresql&user=nicolas` (autenticación *peer* sobre socket Unix, sin contraseña). Este rol/base es infraestructura local de esta máquina para verificar código antes de escribirlo en el libro — no se documenta como requisito del lector ni se commitea nada de esto al repositorio. Hallazgo adicional durante la configuración: `CREATE ROLE` y `CREATE DATABASE` no pueden combinarse en una sola invocación de `psql -c "...;...` porque `psql -c` con múltiples sentencias las envía como una única transacción implícita, y `CREATE DATABASE` no puede ejecutarse dentro de un bloque de transacción — si la segunda sentencia falla, la primera también se revierte. Se resolvió ejecutando cada sentencia en su propia invocación de `psql -c`.
12. **Hallazgo de verificación para 4.5 (2026-09-06):** `geozero` 0.15.1 con el feature `with-postgis-sqlx` depende de `sqlx` 0.8.x internamente; si el `Cargo.toml` del proyecto fija `sqlx = "0.9"` (la última versión en solitario al momento de escribir), Cargo resuelve **dos** copias de `sqlx-core`/`sqlx-postgres` en el árbol de dependencias (0.8.6 y 0.9.0), y los tipos `sqlx::Postgres` de una y otra no son intercambiables — el código no compila con errores de trait no satisfecho, sin que sea obvio por qué. Se fijó `sqlx = "0.8"` explícitamente para que coincida con lo que `geozero` realmente usa, verificado con `cargo tree`. Se documentó en el propio Capítulo 4.5 como lección general ("verifica el árbol real de dependencias antes de asumir que la versión más nueva de todo compila junta"). Además se confirmó que un índice `GIST(geom)` plano NO se usa para un filtro `ST_DWithin(geom::geography, ...)` — hace falta un índice sobre la expresión `GIST((geom::geography))`, o tipar la columna como `geography` directamente (como se hizo en la sección de Diesel) — verificado con `EXPLAIN` antes y después (plan pasa de `Seq Scan` a `Bitmap Index Scan`, ~8.5x más rápido sobre 100k features).
13. **Corrección post-publicación en 4.4 (2026-09-06):** al preparar el apéndice de soluciones se detectó, verificando en el crate de sesión, que el Ejercicio 3 original de 4.4 tenía una premisa falsa: asumía que `proj`/`libproj` rechaza con `Result::Err` una longitud fuera de `[-180, 180]`, igual que hace con la latitud fuera de `[-90, 90]`. Verificado en la práctica: `Proj::convert` con longitud `500.0`, `181.0`, o incluso `f64::NAN`/`f64::INFINITY` devuelve `Ok(...)` con un resultado numérico sin sentido (o `NaN`) en vez de `Err` — solo la latitud fuera de rango produce `Err`. Se corrigió el capítulo 4.4 (nueva sección "`proj` no valida todo lo que crees que valida", con el hallazgo verificado) y se reescribió el Ejercicio 3 para que la función `reproyectar_seguro` valide longitud/latitud/finitud *ella misma* antes de llamar a `proj`, en vez de asumir que el `Result::Err` de la dependencia cubre esos casos. Commit de la corrección incluido en el mismo trabajo del apéndice del Módulo 3.

14. **Hallazgo de verificación para 5.1 (2026-09-06):** se verificó, instrumentando con un contador atómico, que `rayon::iter::ParallelIterator::map_init` **no** llama a su closure de inicialización "una vez por hilo" como la intuición sugeriría, sino una vez por cada división interna de trabajo (*work-stealing split*) — medido: 1.451 invocaciones sobre 1.000.000 de elementos en una máquina de 12 hilos lógicos. Con un recurso costoso de inicializar (`proj::Proj::new_known_crs`, que consulta la base de datos de PROJ en disco), esto hizo que una reproyección "paralela" con `map_init` tardara 5.8s frente a 114ms de la versión secuencial (51x más lenta). La solución verificada es dividir manualmente el trabajo en `rayon::current_num_threads()` trozos con `par_chunks` y crear el recurso costoso una vez por trozo, lo que sí da la mejora esperada (50ms, ~2.3x más rápido que secuencial). Documentado en el Capítulo 5.1 como ejemplo central, no solo como nota al margen.

15. **Hallazgo de verificación para 5.2 (2026-09-06):** en `flatgeobuf` 6.0.1, declarar una columna implícitamente (llamando a `feat.property(0, "nombre", ...)` sin haber llamado antes a `FgbWriter::add_column`) no falla al escribir el archivo, pero la declaración no queda persistida en el encabezado (`header.columns()` queda vacío) — al leer de vuelta, `feature.properties()` falla con `GeozeroError::Geometry("geometry format")`, un mensaje que no menciona columnas ni propiedades y es difícil de diagnosticar. Se verificó también, contra el archivo público `countries.fgb` del propio repositorio de `flatgeobuf` (205.680 bytes) vía `HttpFgbReader`, que una consulta por bbox transfiere solo 110.280 bytes en 2 peticiones HTTP (~54% del archivo), y que contra un servidor que ignora `Range` y siempre devuelve 200 con el cuerpo completo, `http-range-client` cachea la respuesta completa tras la primera petición (verificado: 1 sola petición al servidor) en vez de fallar o re-descargar repetidamente.

16. **Hallazgo de verificación para 5.4 (2026-09-06):** `pmtiles` 0.24.0 activa por defecto (`default = ["__all_non_conflicting"]`) soporte completo de S3 asíncrono (`aws-sdk-s3`), lo que infla enormemente el árbol de dependencias y el tiempo/espacio de compilación si solo se necesita leer/escribir archivos locales — se resolvió con `default-features = false` más una lista explícita de features (`write`, `mmap-async-tokio`, `tilejson`). También se repitió el patrón de la Decisión #12: `geoparquet` 0.8.0 fija internamente `arrow-array`/`arrow-schema`/`parquet` en la serie `58`, no la `59` que `cargo add` instala por defecto — hubo que fijar las versiones explícitamente para evitar dos copias de `RecordBatch` en el árbol. Se verificó con datos reales que GeoParquet vs. GeoJSON no tiene un ganador universal: a 100 features GeoJSON es más pequeño y más rápido de leer (Parquet paga overhead fijo de metadatos); a 100.000 features GeoParquet es 4.05x más compacto y 14.36x más rápido — la elección depende de la escala, no es una preferencia categórica de formato "moderno vs. legado".

17. **Hallazgo de verificación para 5.5 (2026-09-06):** `las` 0.11.1 ya trae soporte COPC nativo (`las::copc`, `CopcReader`, `LodSelection`, `BoundsSelection`) sin dependencia adicional — se usó el fixture real `tests/data/autzen.copc.laz` que el propio crate incluye en su suite de tests (107 puntos, 1 entrada de jerarquía; demasiado pequeño para mostrar múltiples niveles de detalle reales, limitación documentada explícitamente en el capítulo). Se implementó y verificó un adaptador `Read + Seek` propio sobre HTTP Range para lectura remota (`CopcReader::new` acepta cualquier `Read + Seek`, sin requerir soporte HTTP nativo como sí tienen `flatgeobuf` o `/vsicurl/`): sin buffer, 99 peticiones HTTP para un archivo de 4.368 bytes (el decodificador LAZ hace muchas lecturas pequeñas); envuelto en `BufReader::with_capacity(4096, ...)`, baja a 3 peticiones — mismo principio de *prefetch* que ya usan flatgeobuf/vsicurl internamente, aquí verificado a mano.

18. **Hallazgo de verificación para 5.6 (2026-09-06):** un wrapper FFI mínimo escrito contra la API "simple" (no reentrante, sin sufijo `_r`) de `geos-sys` 2.0.9 sobre `libgeos` 3.14.1 **abortó el proceso completo** (`fatal runtime error: Rust cannot catch foreign exceptions, aborting`) al recibir un WKT inválido — una excepción C++ interna de GEOS escapó a través de la frontera FFI sin manejador registrado. Se corrigió usando la API reentrante (`_r`) con `GEOS_init_r` + `GEOSContext_setErrorMessageHandler_r`, que captura el mismo error como un callback de Rust (`ParseException: Unknown type: 'ESTO'`) en vez de abortar. Este hallazgo real (no hipotético) se documentó como el ejemplo central del Capítulo 5.6 sobre por qué la API reentrante es la recomendada para cualquier wrapper nuevo. También se verificó con datos reales que `geos::PreparedGeometry` da ~36.5x de mejora sobre `Geometry::contains` repetido (polígono de 2000 vértices, 5000 puntos de consulta), con resultados idénticos entre ambas rutas.

19. **Hallazgo de verificación para 5.7 (2026-09-06):** se generó un archivo `.fgb` sintético real de 1.170.666.992 bytes (1.17 GB, ~8.5M features) para verificar el umbral de aceptación de la EDT (servir un archivo remoto >1GB transfiriendo solo el subconjunto relevante) — una consulta por bbox (~8% del área total) transfirió 90.905.928 bytes (7.8%) en 85 peticiones HTTP, verificado con el mismo logging interno de `flatgeobuf` usado en el Capítulo 5.2. El archivo generado (>1GB) se escribió fuera del scratchpad de la sesión (que vive en un tmpfs de solo 12GB) para no arriesgar quedarse sin espacio, y se eliminó inmediatamente después de la verificación — no se commiteó nada de esto al repositorio. También se descubrió que `axum` límita el cuerpo de una petición a 2MB por defecto (`DefaultBodyLimit`), lo que rompía silenciosamente el endpoint de reproyección por lotes con 1M de puntos (varias decenas de MB en JSON) hasta subir el límite explícitamente con `.layer(DefaultBodyLimit::max(...))` — documentado en el capítulo como un hallazgo real, no hipotético.

20. **Hallazgo de verificación para 6.1 (2026-09-06):** se benchmarkeó el mismo endpoint trivial (`GET /distance`, un solo cálculo de `Haversine.distance`) implementado en Axum 0.8.9 y Actix-web 4.15.0, con `ab -n 20000 -c 100` (Apache Bench, ya presente en el sistema), corrido tres veces alternando ambos servidores. Resultado real: sin ganador consistente entre corridas (25.984 vs 25.397 req/s; 27.750 vs 29.569; 18.005 vs 15.603) — la variabilidad entre corridas del mismo framework superó la diferencia entre frameworks en cualquier corrida individual. Se usó este resultado real (no asumido) como argumento central del Capítulo 6.1 sobre por qué la elección de framework debe basarse en benchmarks propios sobre el endpoint representativo real, no en cifras genéricas de terceros.

21. **Hallazgo de verificación para 6.2 (2026-09-06):** al verificar los cuatro middleware del capítulo en un solo servidor de prueba, se detectó un error real en la metodología de prueba, no en el middleware: `tower_governor::GovernorLayer` aplicado al `Router` completo limita por IP para *todas* las rutas bajo su alcance, así que las peticiones hechas en secciones anteriores del mismo script de verificación (todas desde `127.0.0.1`) ya habían consumido cuota antes de llegar a la sección de rate-limiting, y la prueba de caché no comprobaba el código de estado de la respuesta — dando un "cache hit" medido que en realidad era un `429` silencioso. Se corrigió aplicando `GovernorLayer` solo a un `Router` anidado con la ruta que sí se quiere limitar, y añadiendo comprobación explícita de `status` en cada prueba. Se documentó en el Capítulo 6.2 como lección sobre alcance de middleware y disciplina de verificación, no se ocultó el error.

22. **Hallazgo de verificación para 6.3 (2026-09-06):** se verificó que `geozero::mvt::MvtWriter::new_unscaled` produce un protobuf MVT técnicamente válido pero con coordenadas sin significado geográfico si se le pasan geometrías en WGS84 sin escalar al espacio de la tesela — el método correcto para una tesela georreferenciada real es el trait `ToMvt::to_mvt(extent, left, bottom, right, top)`, con la geometría ya reproyectada al mismo CRS que los límites de la tesela (verificado con Bogotá reproyectada a Web Mercator, cayendo en (1703, 2379) de 4096 dentro de la tesela z=5,x=9,y=15, coherente con su posición geográfica real). Se verificó también que una tesela MVT generada en memoria y guardada en un archivo PMTiles se recupera byte-a-byte idéntica.

23. **Hallazgo de verificación para 6.4 (2026-09-06):** se validó un servidor OGC API Features mínimo contra QGIS 3.40 real (PyQGIS en modo headless, `QT_QPA_PLATFORM=offscreen`, ya instalado en el sistema). Hallazgo real: el proveedor `WFS` de QGIS con `version='OGC_API_FEATURES'` falla siempre contra una API perfectamente conforme al estándar (intenta parsear la respuesta JSON como XML de WFS clásico) — el proveedor correcto es `OAPIF`, usado directamente. Con el proveedor correcto, QGIS todavía marcaba la capa inválida hasta corregir dos detalles que la especificación no exige explícitamente pero que un cliente real sí verifica: respetar el parámetro `limit` de verdad (QGIS prueba con `limit=10,1,100` para detectar soporte de paginación) y responder `OPTIONS` sin un 405 por defecto. Verificado el resultado final con `layer.isValid()==True` y `featureCount()==3` con atributos y geometrías correctos. También se validó un documento OpenAPI 3.0 completo con `openapi-spec-validator` (instalado en un venv de sesión, no commiteado).

24. **Hallazgo de verificación para 6.5 (2026-09-06):** se verificó realmente (no solo se escribió) que `geoapi-core` compila a `wasm32-unknown-unknown` (target instalado con `rustup target add` en esta sesión) sin cambios de código, produciendo un `.wasm` de 9.573 bytes que, cargado y ejecutado con `WebAssembly.instantiate` en Node.js (motor V8, el mismo que Chrome), da el resultado **exactamente idéntico** (237921.12207458014 m) al cálculo nativo de Haversine Bogotá-Medellín ya usado en el Capítulo 3.3. Esto confirma en la práctica la decisión tomada en el Capítulo 3.5 de mantener `geoapi-core` libre de bindings C. **Limitación documentada:** el `Dockerfile` del Ejercicio 3/sección de contenedores se escribió y revisó línea por línea siguiendo el patrón estándar de dos etapas, pero no se verificó con un `docker build .` real en esta sesión — el usuario del entorno no pertenece al grupo `docker` y `sudo` requiere autenticación interactiva no disponible para esta sesión. Si se quiere verificación real en el futuro, requiere que el usuario ejecute `sudo usermod -aG docker $USER` (y reinicie sesión) una vez, análogo a la Decisión #11 sobre PostGIS.

25. **Hallazgo de verificación para 6.6 (2026-09-06):** los tests de integración del proyecto de cierre se verificaron ejecutándose de verdad (`cargo test`, 2 passed) contra la instancia PostGIS real ya configurada en esta sesión (Decisión #11) — no contra una simulación. El archivo `ci.yml` (workflow de GitHub Actions con un servicio `postgis/postgis:16-3.4` efímero) se escribió siguiendo el patrón estándar documentado de GitHub Actions y se validó su sintaxis YAML con `yaml.safe_load`, pero **no se ejecutó en un runner real de GitHub Actions** en esta sesión (fuera del alcance de lo que esta sesión puede disparar). Hallazgo real durante esa validación sintáctica: la clave `on:` sin comillas se interpreta como el booleano `True` por parsers YAML 1.1 genéricos (incluido `PyYAML.safe_load`) — GitHub Actions maneja este caso especial correctamente en su propio parser, pero cualquier herramienta propia que procese el YAML necesita saberlo. Documentado en el Capítulo 6.6 como ejemplo de "verificar en vez de asumir" aplicado a un artefacto que no es código Rust.

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
- [x] **3.4** Serialización — GeoJSON, WKT/WKB
  - [x] Ejercicio 1: round-trip GeoJSON
  - [x] Ejercicio 2: round-trip WKT
  - [x] Ejercicio 3: manejo de un GeoJSON malformado con `Result`
  - [x] Ejercicio 4: interoperar con `serde`
- [x] **3.5** Proyecto guiado de cierre — GeoAPI v0.2 (`geoapi-core`)
  - [x] Construcción completa del crate de dominio (deserializar Feature GeoJSON → `geo_types::Geometry`, funciones puras área/longitud/centroide/simplificación, serializar de vuelta)
  - [x] Ejercicio integrador abierto: extender `geoapi-core` con una función no cubierta (bounding box de una colección vía `BoundingRect`), sin guía paso a paso
  - [x] Verificado: `cargo test` pasa sobre el crate de dominio completo (verificado en crate de sesión, ver Decisión #8)
- [x] Apéndice — Soluciones de ejercicios Módulo 2 (`src/08-apendices/soluciones-modulo-2.md`)
- [x] `mdbook build` (y `mdbook test` sobre bloques ```rust``` verificables) limpio tras Fase 2
- [x] Commit(s) atómicos de Fase 2 + push tras cada uno
- [x] Resumen a usuario + espera de aprobación explícita para pasar a Fase 3

**Total ejercicios Módulo 2: 18 guiados + 1 integrador abierto.**

---

## Fase 3 — Índices, robustez y persistencia — primer servidor (EDT 4.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 2.*

### 4.0 Módulo 3 — Índices, Robustez y Persistencia (Primer Servidor) *(Fase 2 de la ruta — módulo intermedio)*

- [x] **4.1** DE-9IM y el trait `Relate`
  - [x] Ejercicio 1: matriz DE-9IM manual vs. `Relate`
  - [x] Ejercicio 2: implementar `intersects` con datos reales
  - [x] Ejercicio 3: implementar `contains`/`touches` con datos reales
  - [x] Ejercicio 4: caso de colinealidad casi-degenerada
- [x] **4.2** Predicados exactos con `robust`
  - [x] Ejercicio 1: reproducir un fallo de precisión con f64 puro
  - [x] Ejercicio 2: corregirlo con `robust`
- [x] **4.3** Índices espaciales — `rstar`, `geo-index`, `h3o`
  - [x] Ejercicio 1: construir un R*-tree con 100k puntos
  - [x] Ejercicio 2: consulta KNN
  - [x] Ejercicio 3: comparar latencia `rstar` vs. `geo-index` en el mismo dataset
  - [x] Ejercicio 4: indexar con H3 a dos resoluciones
  - [x] Ejercicio 5: invalidar/reconstruir el índice tras una edición
  - [x] Ejercicio 6: ejercicio de perfilado
- [x] **4.4** Reproyección con `proj`
  - [x] Ejercicio 1: WGS84 → UTM
  - [x] Ejercicio 2: ida y vuelta con pérdida de precisión medida
  - [x] Ejercicio 3: manejo de un punto fuera de dominio válido como `Result::Err`
- [x] **4.5** Persistencia con PostGIS — SQLx y Diesel
  - [x] Ejercicio 1: migración con `ST_SetSRID`
  - [x] Ejercicio 2: insert vía SQLx con `geozero`
  - [x] Ejercicio 3: query espacial `ST_DWithin`
  - [x] Ejercicio 4: mismo flujo con Diesel
  - [x] Ejercicio 5: índice GiST y medición de mejora
  - [x] Ejercicio 6: patrón repository
- [x] **4.6** I/O adicional — `gdal`, `ndarray`, `shapefile`, `las`
  - [x] Ejercicio 1: leer un DEM y calcular pendiente con `ndarray`
  - [x] Ejercicio 2: importar un Shapefile legado
  - [x] Ejercicio 3: leer una nube LAS mínima
  - [x] Ejercicio 4: comparar memoria AoS vs. SoA
- [x] **4.7** Proyecto guiado de cierre — GeoAPI v0.3 (servidor REST con estado)
  - [x] `POST /features` vía SQLx
  - [x] `GET /features/near?lat&lon&radius` con `rstar` en memoria + fallback `ST_DWithin`
  - [x] `GET /features/reproject?crs=` con `proj`
  - [x] Ejercicio integrador abierto: `GET /features/within-polygon` combinando DE-9IM + PostGIS
  - [x] Verificar benchmark <10ms en consulta KNN sobre 100k features (script incluido) — medido 1.21ms real, servidor axum real por HTTP
- [x] Apéndice — Soluciones de ejercicios Módulo 3, completo (`src/08-apendices/soluciones-modulo-3.md`): todos los capítulos 4.1-4.7
- [x] `mdbook build` limpio tras Fase 3
- [x] Commit(s) atómicos de Fase 3
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 4

**Total ejercicios Módulo 3: 25 guiados + 1 integrador abierto.**

---

## Fase 4 — Concurrencia, cloud-native y FFI seguro (EDT 5.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 3.*

### 5.0 Módulo 4 — Concurrencia, Cloud-Native y FFI Seguro *(Fase 3 de la ruta — módulo intermedio)*

- [x] **5.1** Paralelismo de datos con Rayon
  - [x] Ejercicio 1: convertir un `.iter()` a `.par_iter()` y medir speedup
  - [x] Ejercicio 2: identificar un caso donde paralelizar no ayuda
  - [x] Ejercicio 3: reproyección batch paralela
  - [x] Ejercicio 4: detectar un patrón irregular que requiere `Mutex`
- [x] **5.2** FlatGeobuf y HTTP Range Requests
  - [x] Ejercicio 1: leer un `.fgb` local
  - [x] Ejercicio 2: filtrar por bbox
  - [x] Ejercicio 3: apuntar a un `.fgb` remoto en HTTP y medir bytes transferidos
  - [x] Ejercicio 4: manejar un servidor sin soporte de Range
- [x] **5.3** Cloud-Optimized GeoTIFF (COG)
  - [x] Ejercicio 1: leer overview de baja resolución
  - [x] Ejercicio 2: extraer una banda específica
  - [x] Ejercicio 3: calcular NDVI sobre una ventana parcial
- [x] **5.4** PMTiles v3 y GeoParquet/GeoArrow
  - [x] Ejercicio 1: leer un archivo PMTiles local
  - [x] Ejercicio 2: servirlo con backend `mmap`
  - [x] Ejercicio 3: leer un GeoParquet con predicate pushdown
  - [x] Ejercicio 4: comparar tamaño/latencia vs. GeoJSON equivalente
- [x] **5.5** COPC y streaming de nubes de puntos
  - [x] Ejercicio 1: leer metadatos de un `.copc.laz`
  - [x] Ejercicio 2: extraer un nivel de detalle (LOD)
  - [x] Ejercicio 3: streaming asíncrono de un octree remoto
- [x] **5.6** FFI seguro — el patrón `-sys` + wrapper, y `geos`
  - [x] Ejercicio 1: identificar la superficie `unsafe` mínima de un wrapper dado
  - [x] Ejercicio 2: escribir un comentario `// SAFETY:` correcto
  - [x] Ejercicio 3: envolver un puntero con `Drop`
  - [x] Ejercicio 4: usar `PreparedGeometry` de `geos` en una consulta repetida
- [x] **5.7** Proyecto guiado de cierre — GeoAPI v0.4 (streaming cloud-native)
  - [x] Servir teselas MVT desde PMTiles en S3 sin backend de BD
  - [x] `GET /features/stream?bbox=` sobre FlatGeobuf remoto
  - [x] Paralelizar con `rayon` un endpoint batch de reproyección de hasta 1M de puntos
  - [x] Ejercicio integrador abierto: cuarto formato cloud-native no cubierto explícitamente, reutilizando el patrón de streaming
  - [x] Verificar que la API sirve un archivo remoto >1GB transfiriendo solo el subconjunto relevante (inspección de bytes de red) — verificado: archivo de 1.17GB, 7.8% transferido (90.9MB, 85 peticiones)
- [x] Apéndice — Soluciones de ejercicios Módulo 4 (`src/08-apendices/soluciones-modulo-4.md`)
- [x] `mdbook build` limpio tras Fase 4
- [x] Commit(s) atómicos de Fase 4
- [ ] Resumen a usuario + espera de aprobación explícita para pasar a Fase 5

**Total ejercicios Módulo 4: 22 guiados + 1 integrador abierto.**

---

## Fase 5 — Arquitectura de APIs GIS de producción (EDT 6.0)

*No iniciar sin aprobación explícita del usuario tras el cierre de la Fase 4.*

### 6.0 Módulo 5 — Arquitectura de APIs GIS de Producción *(Fase 4 de la ruta — módulo intermedio)*

- [x] **6.1** Axum vs. Actix-web — decisión arquitectónica
  - [x] Ejercicio 1: migrar un endpoint entre ambos frameworks
  - [x] Ejercicio 2: benchmark propio
  - [x] Ejercicio 3: justificar por escrito la elección para un caso dado
- [x] **6.2** Middleware con Tower — caché, rate-limiting, timeouts
  - [x] Ejercicio 1: cachear respuestas de teselas con `moka`
  - [x] Ejercicio 2: rate-limit por IP
  - [x] Ejercicio 3: timeout configurable
  - [x] Ejercicio 4: tracing de latencia por endpoint
- [x] **6.3** Contratos MVT y el patrón Martin
  - [x] Ejercicio 1: servir una tesela MVT propia
  - [x] Ejercicio 2: exponer TileJSON
  - [x] Ejercicio 3: comparar contra el comportamiento documentado de Martin
  - [x] Ejercicio 4: servir desde PMTiles sin base de datos
- [x] **6.4** OGC API Features / WFS / WMS — interoperabilidad
  - [x] Ejercicio 1: implementar un endpoint mínimo compatible con OGC API Features
  - [x] Ejercicio 2: validar contra un cliente QGIS
  - [x] Ejercicio 3: documentar el contrato con OpenAPI
- [x] **6.5** Observabilidad, resiliencia y despliegue
  - [x] Ejercicio 1: instrumentar con `tracing`
  - [x] Ejercicio 2: definir un healthcheck
  - [x] Ejercicio 3: contenerizar el servicio (Dockerfile escrito y revisado; `docker build` real no ejecutado en esta sesión, ver Decisión #24)
  - [x] Ejercicio 4: compilar `geoapi-core` a WASM y ejecutarlo en un contexto de navegador simulado
- [x] **6.6** Proyecto guiado de cierre — GeoAPI v1.0 (plataforma de producción)
  - [x] Consolidación: API REST + servidor de teselas + caché + observabilidad + CI con tests de integración contra PostGIS efímera
  - [x] Ejercicio integrador abierto: desplegar el stack completo con CI
  - [x] Verificar pipeline de CI en verde (documentado con logs de referencia) — tests de integracion verificados localmente contra PostGIS real (2 passed); YAML de CI escrito y validado sintacticamente, no ejecutado en un runner real de GitHub Actions (ver Decisión #25)
- [x] Apéndice — Soluciones de ejercicios Módulo 5 (`src/08-apendices/soluciones-modulo-5.md`)
- [x] `mdbook build` limpio tras Fase 5
- [x] Commit(s) atómicos de Fase 5
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
- [x] Añadir `git-repository-url` a `book.toml` apuntando al remoto (adelantado antes de Fase 3, ver Decisión #9)
- [x] Crear `.github/workflows/deploy.yml` — build con `mdbook build` y publicación de `book/` a GitHub Pages, con disparo **manual únicamente** (`workflow_dispatch`, sin `on: push`) por pedido explícito del usuario (Decisión #9)
- [ ] Pendiente del usuario: activar Settings → Pages → Source: "GitHub Actions" en el repositorio de GitHub (una sola vez, no automatizable desde esta sesión)
- [ ] Primera ejecución manual del workflow desde la pestaña Actions de GitHub, para confirmar que despliega correctamente
- [ ] Verificación final de build completo del libro (`mdbook build` + `mdbook test` sin errores) — ya en verde en cada commit desde Fase 0
- [ ] Verificar despliegue en GitHub Pages tras la primera ejecución manual (sitio accesible)

---

## Resumen de progreso por fase

| Fase | Alcance | Estado |
|---|---|---|
| 0 | Setup e infraestructura | Cerrada |
| 1 | Front matter + Fundamentos de Rust (EDT 1.0–2.0) | Cerrada |
| 2 | Primitivas geoespaciales puras (EDT 3.0) | Cerrada |
| 3 | Índices, robustez y persistencia (EDT 4.0) | Cerrada |
| 4 | Concurrencia, cloud-native y FFI seguro (EDT 5.0) | Cerrada |
| 5 | Arquitectura de producción (EDT 6.0) | Cerrada, pendiente aprobación para Fase 6 |
| 6 | Módulo final — capstones (EDT 7.0) | No iniciada |
| 7 | Despliegue | No iniciada |
