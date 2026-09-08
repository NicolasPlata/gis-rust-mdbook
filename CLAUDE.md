# CLAUDE.md — Guía del proyecto: libro "APIs GIS con Rust"

Este archivo son las instrucciones de proyecto para cualquier sesión de Claude Code que trabaje en este repositorio. Léelo completo antes de tocar cualquier archivo.

## Misión

Construir, en este repositorio, un **mdBook profesional, exhaustivo y didáctico** que enseñe a desarrollar **APIs GIS con Rust**, desde nivel 0 (sin experiencia en Rust) hasta nivel experto (arquitecturas de producción). El libro se despliega públicamente en **GitHub Pages**.

No es un proyecto de código de aplicación — es un producto editorial técnico. El entregable final es el sitio del mdBook, listo para publicarse, con calidad de libro de editorial (O'Reilly, No Starch Press) tanto en contenido como en tono.

## Documentos fuente — léelos antes de escribir una sola línea

Todo el contenido del libro debe derivarse de estos documentos, ya investigados y consolidados. No re-investigues desde cero ni te desvíes de lo que ya está decidido en ellos:

- **`docs/ruta-aprendizaje-rust-gis-apis.md`** — la ruta de aprendizaje definitiva (Fases 0–4). Es el temario técnico: qué se enseña, en qué orden, con qué crates, y por qué. Cada capítulo del libro debe trazarse a una sección de este documento.
- **`docs/EDT-libro-rust-gis-apis.md`** — la Estructura de Desglose del Trabajo del libro. Define la estructura exacta de módulos y capítulos (numeración 1.0–7.0), la densidad de ejercicios obligatoria por capítulo, y las tablas de trazabilidad de los capstones finales. **Esta es tu hoja de ruta de escritura, no una sugerencia.**
- **`docs/inv-gemini.md`** y **`docs/inv-claude.md`** — las dos investigaciones originales de las que se derivó todo lo anterior. Consúltalas solo si necesitas más contexto o detalle técnico sobre algo que la ruta consolidada menciona de forma resumida. La ruta consolidada ya resolvió las discrepancias entre ambas (ver su sección final "Nota de síntesis y discrepancias resueltas") — no reintroduzcas los crates que esa nota descartó por no ser verificables (`oxigdal*`, `axum-response-cache`, `packed_spatial_index_geo`, `copc_streaming`/`copc_converter`, etc.).

## Ejecución por fases con aprobación obligatoria

El libro **no se construye de un tirón**. El trabajo se divide en las siguientes fases, en este orden estricto:

| Fase | Alcance | Corresponde a |
|---|---|---|
| 0 | Setup: backlog, esqueleto completo del mdBook (`book.toml`, `src/SUMMARY.md` con la estructura final, aunque los capítulos estén vacíos) | Infraestructura |
| 1 | Front matter + Fundamentos de Rust | EDT 1.0–2.0 |
| 2 | Primitivas geoespaciales puras | EDT 3.0 |
| 3 | Índices, robustez y persistencia (primer servidor) | EDT 4.0 |
| 4 | Concurrencia, cloud-native y FFI seguro | EDT 5.0 |
| 5 | Arquitectura de APIs GIS de producción | EDT 6.0 |
| 6 | Módulo final — capstones | EDT 7.0 |
| 7 | Despliegue: verificación final de build + primera ejecución manual del workflow ya existente (remoto, `git-repository-url` y workflow se adelantaron antes de la Fase 3, ver "Configuración del repositorio remoto") | Cierre |
| 8 | Auditoría de calidad editorial (post-publicación): cierre de vacíos conceptuales detectados por una auditoría externa (reporte ya procesado y descartado tras ejecutarse) y reescritura de los `00-indice.md` de módulo. No reabre las Fases 0–7 ni cambia numeración EDT — expande subsecciones/ejercicios de capítulos ya existentes. Ver `docs/plan-fase8-auditoria.md` | Mejora continua |
| 9 | Historias de usuario y casos de uso (post-publicación): enriquece los checkpoints ya existentes de los cinco proyectos guiados de cierre (2.5, 3.5, 4.7, 5.7, 6.6 — numerado 2.4 al momento de esta fase, antes de la renumeración de la Fase 12) con historia de usuario/caso de uso por checkpoint, ancladas a un stakeholder realista de GeoAPI — sin reescribir código ya verificado. Cada capítulo técnico de origen recibe una referencia corta al checkpoint correspondiente. No reabre las Fases 0–8 ni cambia numeración EDT. Ver `docs/plan-fase9-proyectos-capitulo.md` | Mejora continua |
| 10 | TDD en los proyectos guiados (post-publicación): añade un test automatizado verificado a cada checkpoint de 2.5/3.5/4.7/5.7 (numerado 2.4 al momento de esta fase) que hoy no tiene uno, más un primer de TDD en 1.3 y notas TDD en 6.6 y los capstones — sin reordenar ni reescribir código ya publicado. No fuerza tests en 7.2/7.3, cuyo criterio de aceptación ya aprobado es un benchmark/tabla de trazabilidad. Ver `docs/plan-fase10-tdd.md` | Mejora continua |
| 11 | Segunda auditoría de calidad editorial (post-publicación): cierra seis vacíos de una segunda auditoría externa — contrato de Tokio IO-bound vs. CPU-bound (5.1/4.7), AuthN con API keys (6.2), geometrías inválidas en la persistencia y `sqlx-cli`/migraciones formales (4.5), agotamiento del *pool* de conexiones (6.5), mención de `utoipa` (6.4). No reabre las Fases 0–10 ni cambia numeración EDT. Ver `docs/plan-fase11-auditoria2.md` | Mejora continua |
| 12 | Capítulo de sintaxis básica de Rust (post-publicación): el libro prometía "cero experiencia previa en Rust" (Capítulo 1.1) pero el Módulo 1 arrancaba directo en ownership/borrowing sin enseñar antes `struct`, `fn`, `let`, tipos primitivos, `Vec`, `for`, `println!`, `match`/`enum` — causa raíz en la ruta fuente, que asumía "The Rust Book" como recurso externo nunca comunicado al lector. Añade el Capítulo 2.1 "Sintaxis básica de Rust", renumerando 2.1–2.4 → 2.2–2.5 (solo dentro del Módulo 1; ningún otro módulo cambia). Superada por la Fase 13, que dividió este mismo capítulo en dos. Ver `docs/plan-fase12-sintaxis-basica.md` | Mejora continua |
| 13 | División del Capítulo 2.1 y cierre de vacíos de sintaxis (post-publicación): una segunda revisión encontró cuatro términos usados antes de definirse en los capítulos siguientes del Módulo 1 (tuplas, slices `&[T]`, dereferencia `*`, atributos/`#[derive(Debug)]`) y ninguna sección en todo el libro sobre cómo leer un error del compilador. El Capítulo 2.1 se divide en **2.1 "Sintaxis básica de Rust I"** y **2.2 "Sintaxis básica de Rust II"**, corriendo el resto del Módulo 1 de 2.2–2.5 a 2.3–2.6 (ningún otro módulo cambia). Ver `docs/plan-fase13-sintaxis-basica-ii.md` | Mejora continua |
| 14 | Tercera auditoría técnica y editorial (post-publicación): cierra cinco vacíos de una tercera auditoría externa, los cinco verificados como genuinos — `async`/`.await`/Tokio usados desde Persistencia con PostGIS sin explicar nunca `Future`, el modelo de *polling*, ni por qué hace falta un runtime; sin patrón de configuración tipada (12-factor); TDD local dependiente de una PostGIS levantada a mano, sin `testcontainers-rs`; sin streaming de entrada para uploads grandes (`Multipart`); sin alerta sobre pérdida de Z/M al persistir LiDAR en PostGIS 2D. Añade el Capítulo 4.5 "Fundamentos de Async Rust y Tokio", renumerando el resto del Módulo 3 de 4.5–4.7 a 4.6–4.8 (ningún otro módulo cambia); los otros cuatro hallazgos se resolvieron como secciones nuevas en capítulos ya existentes (6.1, 6.5, 6.6) sin renumerar nada. Ver `docs/plan-fase14-tercera-auditoria.md` | Mejora continua |
| 15 | Cuarta auditoría técnica y editorial, Capítulos 2.1–2.2 (post-publicación): cierra nueve vacíos de una cuarta auditoría externa enfocada solo en el Módulo 1, los nueve verificados como genuinos — `println!`/comentarios usados antes de enseñarse, *shadowing*, `const` y `String::from`/`.to_string()` ausentes en 2.1 (este último bloqueaba de hecho un ejercicio ya publicado de 2.2); patrón constructor (`fn new() -> Self`), enums con datos por variante, `&mut self` como receptor de método y formalización del operador de rango ausentes en 2.2. No reabre las Fases 0–14 ni renumera nada — todo cabe como secciones nuevas o extendidas dentro de 2.1/2.2 y un ajuste de `00-indice.md`. Ver `docs/plan-fase15-cuarta-auditoria-cap-2.md` | Mejora continua |

**Regla no negociable: al terminar cada fase, detente y pide aprobación explícita del usuario antes de empezar la siguiente.** No asumas luz verde por defecto ni encadenes fases automáticamente aunque el resultado de la fase anterior te parezca obviamente correcto.

Al cerrar una fase:

1. Deja `BACKLOG.md` actualizado reflejando exactamente lo completado.
2. Resume para el usuario, de forma breve, qué se construyó en esa fase (capítulos/archivos nuevos, decisiones tomadas, cualquier desviación registrada en el backlog).
3. Señala explícitamente qué fase sigue y qué implica, y **espera la aprobación del usuario antes de tocar un solo archivo de la fase siguiente.**
4. Si el usuario pide cambios sobre la fase recién cerrada, resuélvelos y vuelve a pedir aprobación antes de avanzar — no continúes con la fase siguiente "en paralelo" a los ajustes pendientes.

Esto aplica incluso dentro de una misma sesión larga: terminar la Fase 2 no es licencia para arrancar la Fase 3 sin que el usuario lo confirme explícitamente.

## Primera tarea obligatoria: crear el backlog

Antes de escribir ningún capítulo, crea `BACKLOG.md` en la raíz del repositorio. Este archivo es tu memoria de trabajo entre sesiones — sin él, el progreso se pierde si la sesión se corta o cambia de agente.

Requisitos del backlog:

- Una lista de tareas en formato checklist (`- [ ]` / `- [x]`) derivada **directamente** de la numeración de la EDT (1.0 → 7.0, con cada capítulo y subsección como ítem propio, incluyendo cada ejercicio guiado y cada proyecto de cierre de módulo).
- Incluye también las tareas de infraestructura no cubiertas por la EDT: inicialización del repo git, configuración de `book.toml`, `src/SUMMARY.md`, workflow de despliegue a GitHub Pages, y verificación final de build.
- Marca `[x]` **inmediatamente** después de completar cada tarea, no al final de la sesión — así una sesión interrumpida deja el estado real reflejado.
- Si descubres una tarea no prevista en la EDT (ej. un capítulo necesita una sub-sección adicional), añádela al backlog en el momento en que la identifiques, no la ejecutes "de memoria" sin registrarla.
- Al empezar cualquier sesión nueva en este repo, lo primero que debes hacer es leer `BACKLOG.md` para saber exactamente dónde se quedó el trabajo — no asumas el estado, verifícalo contra los archivos reales del libro.

## Configuración del repositorio remoto — ya hecha

El repositorio remoto es `git@github.com:NicolasPlata/gis-rust-mdbook.git`. Esto ya está resuelto, no hay que volver a preguntar por el link ni reconfigurar nada de lo siguiente:

- `git remote add origin` ya está hecho; la rama principal es `main`.
- `book.toml` ya tiene `git-repository-url` apuntando a ese repo.
- `.github/workflows/deploy.yml` ya existe: construye el mdBook con `mdbook build` y publica `book/` a GitHub Pages — **pero con disparo exclusivamente manual** (`on: workflow_dispatch`), nunca automático en cada push. Esto fue un pedido explícito del usuario (no asumas que quiere lo contrario sin que te lo diga) — no le agregues `on: push` a ese workflow salvo que el usuario lo pida de forma explícita.
- **Pendiente, y no automatizable desde una sesión de Claude Code sin `gh` CLI autenticado con permisos de administración del repo:** el usuario debe activar Settings → Pages → Build and deployment → Source: "GitHub Actions" en GitHub, una sola vez, antes de que el workflow pueda desplegar con éxito. Si en una sesión futura el despliegue falla y nunca se confirmó ese paso, es el primer sospechoso.

Si en algún momento el usuario pide cambiar de repositorio remoto (un link distinto), trata eso como una decisión nueva: confirma el cambio explícitamente antes de tocar `git remote`, `book.toml` o el workflow.

## Estructura técnica del mdBook

- Raíz del repo = raíz del proyecto mdBook: `book.toml`, `src/`, este `CLAUDE.md`, `docs/` (material fuente de investigación, no se publica como parte del libro — exclúyelo del build si mdBook lo intenta incluir por estar en la raíz), `BACKLOG.md`.
- `src/SUMMARY.md` refleja la jerarquía de la EDT: cada Módulo de la EDT (1.0–7.0) es una Parte del `SUMMARY.md`; cada Capítulo (ej. 3.1, 3.2...) es un capítulo de mdBook con su propio archivo `.md` en `src/`.
- Usa la numeración de la EDT como prefijo de nombre de archivo (ej. `src/03-primitivas-geoespaciales/01-modelo-simple-features.md`) para que la estructura de carpetas sea auto-explicativa y coincida 1:1 con el backlog.
- Verifica con `mdbook build` (y revisa la salida en `book/`) después de cada capítulo nuevo — un capítulo no está terminado si el build falla o genera warnings de enlaces rotos.
- Usa bloques de código Rust reales y, cuando sea razonable, verificables (`mdbook test` ejecuta doctests en bloques ` ```rust `). Prioriza que el código compile sobre que sea breve.

### Verificar código que usa crates externos (`geo`, `geojson`, `wkt`, `sqlx`, `axum`, etc.)

`mdbook test` solo compila bloques ` ```rust ` como doctests **sin acceso a dependencias externas** — sirve tal cual para el Módulo 1 (std puro), pero no para nada que use `geo-types` en adelante. Para esos capítulos:

1. Marca el bloque como ` ```rust,ignore ` (mdbook lo omite del build de tests, no lo falla).
2. **Antes de escribir el bloque en el libro**, créalo y córrelo en un crate real de verificación fuera de este repositorio (usa el directorio de scratchpad de la sesión, con las dependencias exactas que vas a citar en el capítulo) para confirmar que compila y que la salida que vas a mostrar en el libro es la real, no una que "deberías" obtener.
3. Ese crate de verificación **no se commitea a este repositorio** — es una herramienta de la sesión, no parte del entregable.

Esto no es opcional ni un nice-to-have: ya salvó al libro de al menos dos afirmaciones incorrectas que habrían quedado publicadas sin este paso (`Polygon::new` sí auto-cierra el anillo exterior en `geo-types` 0.7.20, contra lo que se asumió inicialmente; y un ejemplo de detección de ejes lat/lon invertidos que era ambiguo para coordenadas de Colombia y necesitó un caso de prueba distinto). Nunca asumas que un snippet "seguramente compila" porque se ve razonable — verifícalo.

## Estilo de escritura — no negociable

El público objetivo es alguien que puede llegar **sin haber tocado Rust nunca**. El tono debe ser:

- **Profesional pero cercano.** Nada de jerga sin explicar, nada de "obviamente" o "trivialmente". Si un concepto es genuinamente difícil (el borrow checker, DE-9IM, FFI seguro), dilo explícitamente y dedica el espacio necesario a que se entienda, con analogías cuando ayuden.
- **Nunca asumas conocimiento no enseñado todavía.** Si un capítulo usa un concepto de un capítulo posterior, o lo introduces brevemente ahí mismo con un enlace hacia adelante, o reordenas — nunca dejes al lector con un término sin definir.
- **Explica el "por qué", no solo el "cómo".** Cada decisión de diseño (por qué `Result` en vez de excepciones, por qué zero-copy importa en GIS, por qué Axum sobre Actix-web en un caso dado) debe justificarse en términos del problema real que resuelve en una API GIS — no como dogma.
- **Ejemplos siempre en contexto de GIS/API**, nunca genéricos ("foo/bar"). Todo ejemplo debe sentirse parte del hilo conductor único del libro: el proyecto progresivo **GeoAPI** que define la ruta de aprendizaje.
- Frases cortas y párrafos cortos. Este es un manual técnico para aprender haciendo, no un ensayo académico — evita la prosa grandilocuente que tienden a producir los borradores de investigación (`docs/inv-gemini.md` es un ejemplo de tono a **evitar**: es correcto pero denso y poco amigable para un principiante).

## Densidad de ejercicios y capstones

- Los Módulos 3.0–6.0 (intermedios) llevan **alta densidad de ejercicios** por capítulo, exactamente en las cantidades especificadas en la EDT (`docs/EDT-libro-rust-gis-apis.md`, tabla resumen final). No reduzcas la cantidad de ejercicios para "avanzar más rápido" — es un requisito explícito del usuario, no un detalle estético.
- Cada ejercicio necesita: enunciado claro, criterio de éxito verificable (qué debe pasar `cargo test` o qué debe imprimir el programa), y una solución de referencia — colapsada o en un apéndice/repositorio anexo, nunca a la vista inmediata del enunciado.
- El **Módulo 7.0 (capstones)** es el cierre del libro: prohibido introducir teoría nueva ahí. Cada capstone debe llevar su tabla de trazabilidad explícita (qué capítulo previo enseñó cada pieza técnica requerida), tal como está especificado en la EDT. Estos proyectos deben leerse como la demostración de que todo lo enseñado antes encaja en un sistema real, no como contenido nuevo disfrazado de "proyecto final".

## Reglas de alcance — no te desvíes

- El foco técnico es **desarrollo de APIs GIS con Rust**. No introduzcas contenido de GIS de escritorio, aplicaciones CLI de propósito general ajenas al hilo GeoAPI, ni frameworks/lenguajes fuera de Rust salvo como comparación breve y justificada (ej. mencionar Python/GDAL como contraste, no como alternativa a desarrollar).
- No omitas ninguna fase de la ruta (0 a experto) ni ningún módulo de la EDT. Completitud máxima es un requisito explícito.
- Si en algún punto tienes que elegir entre "avanzar más rápido" y "seguir la EDT y la ruta al pie de la letra", sigue los documentos fuente y regístralo en el backlog si implica una decisión no prevista.

## Flujo de trabajo recomendado

1. Verificar/crear `BACKLOG.md` (primera tarea, ver arriba) — esto es la Fase 0.
2. Dentro de cada fase, escribir en orden estrictamente secuencial (así lo exige la EDT: cada módulo depende del anterior y el Módulo 7.0 depende de trazabilidad completa hacia todos los previos).
3. Después de cada capítulo: `mdbook build`, revisar salida, marcar la tarea en `BACKLOG.md`, hacer commit atómico (un commit por capítulo o por unidad de trabajo coherente, nunca un commit gigante de "todo el libro"), y **hacer `git push origin main` inmediatamente después de cada commit** — el usuario pidió explícitamente esta cadencia (push tras cada commit, sin pedir confirmación individual por push) al aprobar el paso a la Fase 1. No vuelvas a preguntar por esto en sesiones futuras salvo que el usuario cambie la instrucción.
4. Al terminar cada fase, aplicar el checkpoint de la sección ["Ejecución por fases con aprobación obligatoria"](#ejecución-por-fases-con-aprobación-obligatoria): resumir, dejar el backlog al día y **detenerse a esperar aprobación** antes de tocar la fase siguiente.
5. El despliegue a GitHub Pages (workflow manual, ver "Configuración del repositorio remoto") ya está disponible desde antes de la Fase 7 por pedido del usuario — dispararlo (desde la pestaña Actions de GitHub) es una acción del usuario, no algo que esta sesión ejecute por su cuenta.
