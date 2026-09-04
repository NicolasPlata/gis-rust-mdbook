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
| 7 | Despliegue: configuración del remoto, workflow de GitHub Pages, `git push` | Cierre |

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

## Configuración del repositorio remoto

El usuario proporcionará el link del repositorio de GitHub donde se publicará el libro. Si no lo has recibido todavía y necesitas inicializar el repo, **pregunta por el link antes de configurar el remoto o el workflow de despliegue** — no lo inventes ni asumas un nombre de organización/usuario.

Una vez recibido el link:

1. `git init` (si el repo local aún no existe) y `git remote add origin <link>`.
2. Configura `book.toml` con `git-repository-url` apuntando a ese link, para que el mdBook muestre el ícono de "ver en GitHub" y los enlaces de edición funcionen.
3. Crea el workflow de GitHub Actions (`.github/workflows/deploy.yml`) que construya el mdBook con `mdbook build` y publique `book/` a GitHub Pages en cada push a la rama principal.
4. Confirma con el usuario antes de hacer el primer `git push` — es una acción visible y hasta ese punto el trabajo es solo local.

## Estructura técnica del mdBook

- Raíz del repo = raíz del proyecto mdBook: `book.toml`, `src/`, este `CLAUDE.md`, `docs/` (material fuente de investigación, no se publica como parte del libro — exclúyelo del build si mdBook lo intenta incluir por estar en la raíz), `BACKLOG.md`.
- `src/SUMMARY.md` refleja la jerarquía de la EDT: cada Módulo de la EDT (1.0–7.0) es una Parte del `SUMMARY.md`; cada Capítulo (ej. 3.1, 3.2...) es un capítulo de mdBook con su propio archivo `.md` en `src/`.
- Usa la numeración de la EDT como prefijo de nombre de archivo (ej. `src/03-primitivas-geoespaciales/01-modelo-simple-features.md`) para que la estructura de carpetas sea auto-explicativa y coincida 1:1 con el backlog.
- Verifica con `mdbook build` (y revisa la salida en `book/`) después de cada capítulo nuevo — un capítulo no está terminado si el build falla o genera warnings de enlaces rotos.
- Usa bloques de código Rust reales y, cuando sea razonable, verificables (`mdbook test` ejecuta doctests en bloques ` ```rust `). Prioriza que el código compile sobre que sea breve.

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
3. Después de cada capítulo: `mdbook build`, revisar salida, marcar la tarea en `BACKLOG.md`, hacer commit atómico (un commit por capítulo o por unidad de trabajo coherente, nunca un commit gigante de "todo el libro").
4. Al terminar cada fase, aplicar el checkpoint de la sección ["Ejecución por fases con aprobación obligatoria"](#ejecución-por-fases-con-aprobación-obligatoria): resumir, dejar el backlog al día y **detenerse a esperar aprobación** antes de tocar la fase siguiente.
5. Confirmar con el usuario antes de cualquier `git push` a un remoto configurado (la Fase 7 completa, de hecho, no arranca sin aprobación previa por la regla de fases).
