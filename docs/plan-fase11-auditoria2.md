# Plan de ejecución — Fase 11: Segunda auditoría de calidad editorial

Este documento procesa `docs/reporte-auditoria.md` (segunda auditoría externa, recibida con el libro ya en producción y con las Fases 8–10 ya cerradas) y lo convierte en un plan ejecutable, con el mismo régimen de aprobación por hito que las Fases 0–10.

**Estado: propuesta, pendiente de aprobación.** Nada de este plan se ejecuta hasta que se apruebe explícitamente.

## 1. Validación técnica de los seis hallazgos — ninguno se asumió cierto

Antes de planear nada, se verificó cada hallazgo contra el contenido real del libro (`grep` dirigido a los capítulos citados, no una lectura superficial del reporte). **Los seis hallazgos son reales y están citados con precisión** — incluyendo detalles textuales exactos, como el `max_connections(5)` del Capítulo 4.5, que coincide carácter por carácter con el código ya publicado.

| # | Hallazgo del reporte | Verificado contra | Resultado |
|---|---|---|---|
| 2.1 | Sin contrato conceptual de async (IO-bound vs. CPU-bound) antes de usar Tokio/Axum | `grep` de `spawn_blocking`/`async fn` en Módulos 1, 3 y 4 | Confirmado: `spawn_blocking` solo aparece como detalle de implementación incidental en 5.5 (ejercicio), 5.7 y una mención de pasada en 6.2. Ningún capítulo de fundamentos (2.x) introduce `async`/`.await` como concepto. El primer uso real de `async fn main()` es 4.7, sin explicación previa — viola directamente el principio del propio `CLAUDE.md` de "nunca asumas conocimiento no enseñado todavía" |
| 2.2 | Sin AuthN/AuthZ en el módulo de producción | `grep` de API key/autenticación en 6.2 y el resto del libro | Confirmado: la única mención es una frase de 4.7 ("sin autenticación... que llegan más adelante") que nunca se cumple, y una línea de 6.2 que dice "necesitas autenticación real" sin enseñar cómo |
| 3.1 | Sin manejo de geometrías inválidas (bowties) en la persistencia (4.5) | `grep` de `ST_IsValid`/geometría inválida en todo `src/` | Confirmado: no aparece en 4.5 ni en el proyecto v0.3 (4.7). Sí existe una validación de geometría con GEOS, pero en un contexto distinto (Capstone C, 7.3, para un polígono de área de interés LiDAR) — nunca aplicada al camino de inserción en PostGIS |
| 3.2 | Sin cobertura de agotamiento del *pool* de conexiones (*pool exhaustion*) | `grep` de `acquire_timeout`/`PoolTimedOut` en todo `src/` | Confirmado: no aparece en ningún capítulo. Verificado además que `sqlx` 0.8 (ya fijado en el libro) sí expone `PoolOptions::acquire_timeout()` — la recomendación es implementable sin cambiar de versión |
| 4.1 | Sin `sqlx-cli`/migraciones formales (4.5 usa DDL embebido) | `grep` de `sqlx-cli`/`sqlx migrate` en 4.5 | Confirmado: el Ejercicio 1 de 4.5 pide explícitamente "la migración SQL... como texto, o ejecutada vía `sqlx::query`" — cita textual exacta del reporte |
| 4.2 | Sin mención de `utoipa` como alternativa a mantener OpenAPI a mano (6.4) | `grep` de `utoipa` en 6.4 | Confirmado: no aparece |

**Conclusión: se aprueban los seis hallazgos tal como los presenta el reporte.** A diferencia de la primera auditoría, ninguno requirió descartar o acotar una recomendación por falta de soporte en el ecosistema — los seis son implementables con los crates y versiones que el libro ya fijó.

## 2. Qué se añade, y dónde — con las decisiones editoriales ya tomadas

| Hallazgo | Ubicación | Qué se añade |
|---|---|---|
| 2.1 (contrato async) | **5.1**, como subsección nueva al inicio ("El contrato de Tokio: IO-bound vs. CPU-bound"), con una referencia corta hacia adelante desde **4.7** (donde `async fn main()` aparece por primera vez, sin explicación) | Explicación conceptual + demostración medida de *thread starvation* real (un handler que bloquea el runtime sin `spawn_blocking`, con peticiones concurrentes que se degradan, verificado con números reales) + un ejercicio nuevo |
| 3.1 (geometrías inválidas) | **4.5**, nueva subsección | `ST_IsValid` antes de insertar, rechazo con `400 Bad Request` en vez de dejar que una operación posterior falle de forma críptica — verificado insertando un polígono *bowtie* real contra PostGIS + un ejercicio nuevo |
| 4.1 (`sqlx-cli`) | **4.5**, actualización de la sección de migraciones existente | Reemplaza/complementa el DDL embebido con el flujo `sqlx migrate add`/`sqlx migrate run` sobre un directorio `migrations/` — verificado instalando `sqlx-cli` y corriéndolo contra PostGIS real |
| 3.2 (agotamiento del *pool*) | **6.5**, nueva subsección (coherente con el tema de resiliencia del capítulo) | Configurar un pool deliberadamente pequeño, saturarlo con peticiones concurrentes, observar el error de `acquire_timeout` real, y mostrar la configuración correcta — con números medidos, no una descripción + un ejercicio nuevo |
| 2.2 (AuthN) | **6.2**, nueva subsección | Middleware de Tower que valida una API key en un header, `401` si falta o es incorrecta, aplicado solo a las rutas de modificación (`POST`) — verificado con peticiones HTTP reales + un ejercicio nuevo |
| 4.2 (`utoipa`) | **6.4**, mención breve ("camino de expansión") | Una nota corta, sin ejercicio ni implementación completa — exactamente el alcance que el propio reporte pide ("mencionar brevemente") |

Los cuatro hallazgos con ejercicio nuevo (2.1, 2.2, 3.1, 3.2) añaden su solución al apéndice correspondiente: 5.1 → `soluciones-modulo-4.md`; 4.5 (×2, geometrías inválidas y migraciones) y 6.2, 6.5 → `soluciones-modulo-3.md`/`soluciones-modulo-5.md` según el módulo de cada capítulo.

## 3. Hitos propuestos

Cada hito verifica su código nuevo en scratchpad (contra PostGIS real donde aplica) antes de escribirlo, cierra con `mdbook build`/`mdbook test` limpios, actualiza `BACKLOG.md` (checklist + Decisión numerada), commit, push, resumen, y pausa para aprobación del siguiente hito.

- **Hito 11.1** — 5.1 + 4.7: el contrato de Tokio (IO-bound vs. CPU-bound), con demostración medida de *thread starvation* y un ejercicio nuevo.
- **Hito 11.2** — 4.5: geometrías inválidas (`ST_IsValid`, rechazo 400) y migraciones formales con `sqlx-cli`, cada una con su ejercicio (la de migraciones puede reformular el Ejercicio 1 ya existente en vez de añadir uno nuevo, a decidir al escribirla).
- **Hito 11.3** — 6.5: agotamiento del *pool* de conexiones, con demostración medida y un ejercicio nuevo.
- **Hito 11.4** — 6.2: autenticación con API keys, con un ejercicio nuevo.
- **Hito 11.5** — 6.4: mención breve de `utoipa` (sin ejercicio).
- **Hito 11.6** — Cierre: revisión de consistencia contra el resto del libro (incluyendo las Fases 8–10), build/test final, actualizar la EDT (`docs/EDT-libro-rust-gis-apis.md`) y la tabla de fases de `BACKLOG.md`/`CLAUDE.md`.

## 4. Qué NO cambia

- No se renumera ningún capítulo ni se toca `SUMMARY.md`.
- No se reduce la densidad de ejercicios existente — solo se añade (salvo la posible reformulación puntual del Ejercicio 1 de 4.5, que sigue siendo un ejercicio, solo actualizado a la práctica correcta).
- `utoipa` (4.2) se queda deliberadamente como mención, no como implementación completa — así lo pide el propio reporte, y evita inflar el Capítulo 6.4 con una segunda forma de documentar OpenAPI compitiendo con la que ya se enseñó.
- No se introduce ningún crate fuera de los que el libro ya fijó, salvo `sqlx-cli` (una herramienta de desarrollo, no una dependencia del `Cargo.toml` de GeoAPI) y, si hace falta un ejemplo mínimo para la mención de 4.2, `utoipa` citado únicamente como referencia externa, sin fijarlo como dependencia del proyecto.
