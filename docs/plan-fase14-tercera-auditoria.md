# Plan — Fase 14: Tercera auditoría técnica y editorial

## Origen y verificación

El usuario proveyó `auditoria-tecnica-libro-rust-gis.md` (raíz del repo), una tercera auditoría externa con cinco hallazgos. Antes de aceptar nada se verificó cada uno contra el contenido real del libro (no contra lo que el reporte *dice* que el libro dice) y, donde el hallazgo proponía un crate o patrón concreto, se compiló en un crate de scratch para confirmar viabilidad técnica real, siguiendo el mismo estándar de verificación que el resto del libro.

| # | Hallazgo del reporte | Veredicto | Evidencia |
|---|---|---|---|
| 1 | "Salto asíncrono": `async`/`.await`/Tokio se usan desde 4.5/4.7 sin explicar `Future`, el modelo de *polling*, ni por qué hace falta un runtime | **Confirmado** | 4.7 (futura 4.8) dice literalmente: *"vas a escribir tu primer `async fn main()` de este libro sin que todavía se haya explicado qué reglas rigen el mundo async de Rust"* — el libro admite el hueco y promete cerrarlo en 5.1. Pero 5.1 (Fase 11) solo explica el contrato IO-bound/CPU-bound y `spawn_blocking`; **nunca** explica qué es un `Future`, el modelo de *polling*, ni por qué `.await` necesita un runtime. La promesa de 4.7 queda sin cumplir en ningún capítulo. |
| 2 | Sin patrón de configuración tipada (12-factor); solo `std::env::var()` suelto | **Confirmado** | `std::env::var("DATABASE_URL")` aparece sin validar ni tipar en 4.5, 4.7, 6.5 y el proyecto v1.0 (6.6, línea 38: `.expect("DATABASE_URL debe estar definida")`). Cero menciones de `dotenvy`, `config`, `figment`, o un `struct Config` en todo `src/`. |
| 3 | TDD local depende de una PostGIS levantada a mano; solo CI la efimeriza | **Confirmado** | Los tests `#[tokio::test]` de 4.7, 5.7, etc. leen `DATABASE_URL` de un Postgres que el lector debe levantar él mismo; el patrón `services.postgis` efímero (6.6) solo existe en el YAML de GitHub Actions. Cero menciones de `testcontainers` en todo el libro. |
| 4 | Sin streaming de *entrada* (uploads grandes); solo límite de tamaño de payload | **Confirmado** | 6.2 solo tiene `RequestBodyLimitLayer` (rechaza, no soluciona el caso legítimo de subir un Shapefile/GeoTIFF grande). Cero menciones de `Multipart` en todo el libro — pese a que 6.1 ya enseña el *streaming de salida* simétrico ("Streaming asíncrono: de PostGIS al *body* de la respuesta, sin pasar por un `Vec`"). |
| 5 | Sin alerta sobre pérdida de Z/M al persistir geometrías 3D (LiDAR) en PostGIS 2D | **Confirmado** | 4.6/5.5 trabajan con `x, y, z` de LiDAR reales (`las`); 4.5 declara `GEOMETRY(Geometry, 4326)` (2D) sin ninguna nota sobre `geo-types` (2D-only en la versión 0.7.x que usa el libro) ni sobre `GEOMETRYZ` de PostGIS. |

**Los cinco hallazgos son genuinos.** Verificación de viabilidad de las soluciones propuestas, en un crate de scratch (rustc 1.97.1):

- `axum = "0.8"` con `features = ["multipart"]` compila y `Multipart::next_field()` + `campo.chunk()` permite escribir a disco por bloques sin acumular el archivo en memoria — **verificado, compila**.
- `testcontainers = "0.28"` con `GenericImage::new("postgis/postgis", "16-3.4")` (la misma imagen que ya usa el YAML de CI del Capítulo 6.6) + `AsyncRunner` + `sqlx = "0.8"` (la versión ya fijada en el libro) compilan juntos sin conflicto de versiones — **verificado, compila**. (No se pudo ejecutar contra un daemon Docker real desde este entorno de sesión — sin permisos sobre el socket de Docker — así que la ejecución real contra un contenedor se verificará en el momento de escribir el capítulo, como exige `CLAUDE.md`.)
- `dotenvy = "0.15"` — crate real, trivial, sin riesgo de compatibilidad con nada ya fijado en el libro.
- `geo-types` 0.7.x confirmado 2D-only (sin tipo `Coord3D`/`PointZ`) — consistente con lo que el propio Capítulo 3.2 ya dice sobre `geo-types` y SRID.

## Severidad y alcance

No los cinco hallazgos pesan igual:

- **Hallazgo 1 (async)** — **alto**. Viola directamente la regla no negociable de `CLAUDE.md` ("nunca asumas conocimiento no enseñado") para un concepto que sostiene la mitad restante del libro (Módulos 3–7). Es la misma clase de vacío que motivó las Fases 12–13, aplicada ahora a async en vez de a sintaxis básica.
- **Hallazgo 4 (uploads)** — **medio-alto**. Es un vacío funcional real para un libro sobre *APIs GIS*: subir un Shapefile o un GeoTIFF de varios GB es un caso de uso de producción tan legítimo como servir teselas, y la única respuesta actual del libro (rechazar con un límite de tamaño) no resuelve el problema real, solo lo esconde.
- **Hallazgo 2 (config)** — **medio**. No rompe la comprensión (`env::var` funciona), pero sí la promesa de "arquitecturas de producción" del Módulo 6, y crea una inconsistencia visible si no se corrige: el Capítulo 6.6 (el servidor "de producción" final) seguiría usando el patrón menos robusto del libro.
- **Hallazgo 3 (testcontainers)** — **medio-bajo**. Mejora de flujo de trabajo, no un vacío de comprensión — el lector puede seguir el libro igual levantando Postgres a mano.
- **Hallazgo 5 (Z/M)** — **bajo, pero barato de cerrar**. Una nota editorial de una sección, no un capítulo.

## Decisión propuesta: dónde vive cada uno (sin tocar el orden general del libro salvo donde es indispensable)

### Hallazgo 1 — nuevo Capítulo 4.5 "Fundamentos de Async Rust y Tokio"

Esta es la única decisión de las cinco que **requiere renumerar capítulos**, y por eso es la que someto a tu aprobación explícita antes de tocar nada (ver pregunta al final).

**Por qué aquí y no en otro lado:** los Capítulos 4.1–4.4 (DE-9IM, predicados robustos, índices espaciales, reproyección) son 100% síncronos — ningún concepto ahí necesita async. El primer uso real de `async`/`.await` es el propio 4.5 (Persistencia con PostGIS, por `sqlx`). Insertar el nuevo capítulo **justo ahí** — como el nuevo 4.5, empujando el resto del módulo un lugar — es el único punto del libro donde async se necesita por primera vez y donde el lector todavía no lo ha visto. Alternativas descartadas:

- *Al final del Módulo 2 (después de 3.5):* rompería el patrón "el último capítulo de cada módulo es su proyecto de cierre" (algo real en los cinco módulos con proyecto), y el proyecto de 3.5 es explícitamente síncrono ("sigue sin tocar la red") — enseñar async justo antes de un capítulo que no lo usa es un salto pedagógico al revés.
- *Al principio del Módulo 3 (nuevo 4.1, corriendo 4.1–4.7 a 4.2–4.8):* pedagógicamente también funcionaría, pero el costo de renumeración es mucho mayor — barrí referencias cruzadas a "Capítulo 4.X" en todo el libro: **4.1–4.7 combinados aparecen citados en más de 30 archivos**, contra **~22+10+29 líneas para el subconjunto 4.5–4.7 solamente** que sí cambiaría con la opción que recomiendo. Insertar justo antes de 4.5 acota el barrido de referencias cruzadas a los tres capítulos que en efecto se mueven (4.5→4.6, 4.6→4.7, 4.7→4.8), en vez de los siete completos.

**Contenido del nuevo 4.5:**
1. El problema que resuelve async: miles de conexiones concurrentes esperando I/O (una consulta a PostGIS, una petición a otro servicio) sin gastar un hilo de sistema operativo por cada una.
2. Qué es un `Future`: un valor que representa "un cómputo que todavía no terminó", con un método `poll()` que el runtime llama repetidamente — sin implementar un executor a mano (fuera de alcance), pero sí mostrando la forma mínima de un `Future` manual para que el modelo deje de sentirse mágico.
3. Qué hace `.await` exactamente: cede el control al runtime en ese punto en vez de bloquear el hilo, y la ejecución continúa cuando el `Future` interno esté listo. Contraste explícito con una llamada bloqueante síncrona.
4. Por qué hace falta un runtime (Tokio): un `Future` no hace nada por sí solo hasta que algo lo *ejecuta* (`poll`) repetidamente — `#[tokio::main]`/`#[tokio::test]` son azúcar sintáctica que arrancan exactamente ese runtime antes de tu `main`/test.
5. `tokio::spawn`: lanzar una tarea concurrente sin bloquear la actual — anclado en un ejemplo GeoAPI (dos peticiones simuladas en paralelo).
6. Advertencia mínima y explícita de que el contrato completo IO-bound/CPU-bound (por qué un cálculo de `geo` nunca debe vivir directo dentro de un `async fn`) se explica a fondo, con medición real, en el Capítulo 5.1 — sin duplicar esa sección, solo sentar la base que 5.1 hoy da por sabida.
7. Ejercicios (2–3): escribir y ejecutar un `#[tokio::test]` con dos `.await` secuenciales vs. `tokio::join!` en paralelo, midiendo la diferencia; identificar en un fragmento dado dónde un `.await` cede el control y dónde no.

**Ajustes de continuidad necesarios (no reescritura, solo conexión):**
- El actual 4.7 (futuro 4.8) pierde su disculpa *"sin que todavía se haya explicado qué reglas rigen el mundo async"* — se reemplaza por una referencia hacia atrás al nuevo 4.5.
- La sección "El contrato de Tokio" de 5.1 hoy dice *"una regla más fundamental que este libro ha estado aplicando desde el Capítulo 4.7 sin explicarla todavía"* — deja de ser cierto; se reescribe como continuación explícita del nuevo 4.5, no como confesión de un vacío.
- Renumerar 4.5→4.6 (Persistencia PostGIS), 4.6→4.7 (I/O adicional), 4.7→4.8 (Proyecto v0.3) — `git mv` + barrido de referencias cruzadas, mismo método que las Fases 12/13.
- `docs/EDT-libro-rust-gis-apis.md`: nuevo nodo 4.5, renumeración 4.6–4.8, nota de fase, densidad de ejercicios del Módulo 3 actualizada.

### Hallazgo 2 — Configuración tipada (sin renumerar nada)

Nueva sección en el **Capítulo 6.5** (Observabilidad, resiliencia y despliegue), al principio, antes de "Logs estructurados": **"Configuración tipada y validada al arranque (el patrón 12-factor)"**. Un `struct Config` con `#[derive(Debug)]`, poblado con `dotenvy::dotenv()` + `std::env::var()` parseado y validado una sola vez al arranque, devuelto como `Result<Config, ErrorConfig>` — nunca un `std::env::var(...).unwrap()` disperso por el código. Se explica el porqué: fallar rápido y en un solo lugar si falta una variable, en vez de descubrirlo a mitad de una petición.

**Ajuste de continuidad:** el Capítulo 6.6 (proyecto GeoAPI v1.0) hoy arranca con `std::env::var("DATABASE_URL").expect(...)` crudo — inconsistente si 6.5 (justo antes) enseña el patrón robusto. Se actualiza esa única línea de arranque de 6.6 para usar el `Config` de 6.5, sin tocar el resto del capítulo. Nota breve de continuidad (no reescritura) en 4.6 (futuro, hoy 4.5) reconociendo que `env::var` crudo es aceptable ahí por ser un prototipo, con forward-reference a 6.5.

### Hallazgo 3 — PostGIS efímero local con `testcontainers-rs` (sin renumerar nada)

Nueva sección en el **Capítulo 6.6**, junto a "La tubería de CI: PostGIS efímera por ejecución": **"El mismo contenedor, en tu máquina"**, mostrando cómo un `#[tokio::test]` local puede levantar su propio `postgis/postgis:16-3.4` con `testcontainers` en vez de depender de una instancia ya corriendo — complementaria a la CI existente, no un reemplazo (el YAML de CI ya verificado no se toca). Un ejercicio: adaptar el patrón a un test nuevo (no reescribir los checkpoints ya publicados de capítulos anteriores).

### Hallazgo 4 — Streaming de entrada con `Multipart` (sin renumerar nada)

Nueva sección en el **Capítulo 6.1**, inmediatamente después de "Streaming asíncrono: de PostGIS al *body* de la respuesta, sin pasar por un `Vec`" (el streaming de salida ya enseñado ahí): **"Streaming de entrada: subir archivos grandes sin cargarlos en memoria"**, con `axum::extract::Multipart` y `campo.chunk()` escribiendo a disco por bloques — el contraste explícito con `RequestBodyLimitLayer` (6.2): el límite protege contra abuso, el streaming resuelve el caso legítimo de un archivo grande real. Un ejercicio: simular la subida de un Shapefile de varios MB (generado en el propio test) y confirmar, con un contador de picos de memoria o un tamaño de buffer fijo, que nunca se materializa completo en RAM.

### Hallazgo 5 — Alerta de dimensionalidad Z/M (sin renumerar nada)

Nota editorial (*callout*) en el futuro Capítulo 4.6 (hoy 4.5, Persistencia con PostGIS), junto a la definición de `GEOMETRY(Geometry, 4326)`: `geo-types` 0.7.x (la versión que fija este libro) no representa Z/M — solo X/Y — así que persistir un punto LiDAR de 4.7/5.5 (post-renumeración) sin una columna `GEOMETRYZ` explícita trunca la elevación en silencio. Referencias cortas hacia esta nota desde 4.7 (I/O adicional, `las`) y 5.5 (COPC), sin reescribir esos capítulos.

## Hitos

- **Hito 14.1** — Escribir el nuevo Capítulo 4.5 "Fundamentos de Async Rust y Tokio" (contenido + ejercicios, verificados con `mdbook test`/scratch según corresponda), ajustar la continuidad con el actual 4.7 y con la sección "El contrato de Tokio" de 5.1.
- **Hito 14.2** — `git mv` 4.5→4.6, 4.6→4.7, 4.7→4.8; actualizar `src/SUMMARY.md`, `src/04-indices-robustez-persistencia/00-indice.md` (incluye el diagrama ASCII que cita "4.3"/"4.5"), y barrido uno-por-uno de referencias cruzadas a "Capítulo 4.X" en el resto del libro.
- **Hito 14.3** — Configuración tipada: nueva sección en 6.5 + ajuste de la línea de arranque de 6.6 + nota de continuidad en el futuro 4.6.
- **Hito 14.4** — `testcontainers-rs`: nueva sección + ejercicio en 6.6.
- **Hito 14.5** — `Multipart`: nueva sección + ejercicio en 6.1.
- **Hito 14.6** — Alerta Z/M: nota editorial en el futuro 4.6 + referencias cortas desde 4.7 y 5.5.
- **Hito 14.7** — Cierre: actualizar `docs/EDT-libro-rust-gis-apis.md` (nuevo nodo 4.5, renumeración, densidad de ejercicios de Módulos 3 y 5 actualizada), registrar la Fase 14 en `BACKLOG.md`, mover `auditoria-tecnica-libro-rust-gis.md` a `docs/` y luego eliminarlo al cerrar (mismo tratamiento que los reportes de las Fases 8 y 11), `mdbook build` + `mdbook test` limpios, commit(s) + push.

## Qué NO cambia

- Ningún capítulo antes de 4.5 (post-renumeración) ni ningún módulo fuera del 3.0 cambia de numeración.
- El código ya publicado y verificado de los checkpoints existentes (4.7/4.8, 5.7, 6.6) no se reescribe — solo se le añaden secciones nuevas y, en el único caso señalado (arranque de 6.6), se ajusta una línea para no contradecir lo recién enseñado en 6.5.
- El YAML de CI ya verificado del Capítulo 6.6 no se toca — `testcontainers` se presenta como técnica complementaria para el ciclo local, no como reemplazo.
