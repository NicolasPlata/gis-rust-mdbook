# Plan de ejecución — Fase 8: Auditoría de calidad editorial (post-publicación)

Este documento procesa `docs/reporte-auditoria.md` (auditoría externa del libro ya publicado) y lo convierte en un plan de trabajo ejecutable, dividido en hitos con el mismo régimen de aprobación explícita que las Fases 0–7 definidas en `CLAUDE.md`.

**Estado: aprobado.** El usuario confirmó las tres decisiones abiertas de la sección 3 (ver "Decisiones confirmadas" abajo). Sus tareas ya están trasladadas a `BACKLOG.md` como Fase 8, y cada hito sigue el ciclo ya establecido: verificar en scratchpad → escribir → `mdbook build`/`mdbook test` → actualizar backlog → commit → push → resumen y pausa para aprobación del siguiente hito.

## 0. Decisiones confirmadas por el usuario

1. **Diagramas: ASCII**, no Mermaid. No se toca `deploy.yml` ni se añade el preprocesador `mdbook-mermaid`. El **Hito 8.0 queda omitido por completo**.
2. **Streaming DB→HTTP: Capítulo 6.1**, junto al servidor Axum real ya existente.
3. **Antimeridiano: explicar el problema + técnica manual verificada en scratchpad**, no solo la explicación conceptual.

## 1. Por qué esto es una fase nueva, no una corrección de las fases 0–7

Las Fases 0–7 de `CLAUDE.md` ya están cerradas y el libro está desplegado en producción. Este plan no reabre esas fases — es trabajo de mejora continua post-publicación, detectado por una auditoría externa, no un defecto de ejecución de las fases anteriores. Se registra como **Fase 8** en el backlog y, si se aprueba, se añadirá como fila nueva a la tabla de fases de `CLAUDE.md` para que quede trazada igual que las demás.

Regla que se mantiene sin cambios: **ninguna afirmación de código nuevo se escribe en el libro sin haberla verificado antes en un crate de scratch** (la misma disciplina de las Decisiones #1–#31 en `BACKLOG.md`).

## 2. Validación técnica preliminar de los hallazgos del reporte

Antes de planear nada, se verificó contra el contenido real del repositorio (no se asumió que el reporte tenía razón solo porque sonaba plausible) que cada vacío señalado es genuino:

| Hallazgo del reporte | Verificado contra | Resultado |
|---|---|---|
| Sin *property-based testing* | `grep` en 3.3 | Confirmado: no aparece `proptest` en ningún capítulo |
| Sin mapeo de errores a HTTP (RFC 7807) | `grep` en 6.1 | Confirmado: no aparece `IntoResponse` ni "7807" |
| Sin streaming DB→HTTP | `grep` en 6.1/6.2 | Confirmado: no aparece `.fetch()` como stream ni integración con el *body* de Axum |
| Sin mención del antimeridiano | `grep` en 3.2 | Confirmado: el capítulo cubre ejes invertidos (lat/lon swap) pero no el cruce de 180° |
| Sin *winding order* / regla de la mano derecha | `grep` en 3.4 | Confirmado: no aparece |
| Sin CORS en middleware | `grep` en 6.2 | Confirmado: no aparece `CorsLayer` |
| `00-indice.md` demasiado breves | Lectura directa de los 8 archivos | Confirmado: son listas de viñetas de 4-8 líneas, sin objetivos de aprendizaje ni diagrama |

Además, se confirmó viabilidad técnica de las recomendaciones antes de comprometerlas al plan:

- `geo` 0.33.1 (versión ya fijada en el libro) sí tiene un módulo `algorithm::orient` / `algorithm::winding_order` — la recomendación de *winding order* es implementable sin cambiar de versión de crate.
- `proptest`, `tower_http::cors::CorsLayer` y el patrón `sqlx::query().fetch()` + `axum::body::Body::from_stream` son técnicas estándar y verificables con la infraestructura que esta sesión ya tiene lista (PostGIS local, crates ya usados en capítulos anteriores).
- **El antimeridiano es la única recomendación sin una función "de una línea" en `geo`.** No existe un `geo::split_at_antimeridian()`. El capítulo tendría que enseñar el concepto y una técnica manual (o documentar honestamente la limitación), no prometer una API que no existe — exactamente el tipo de sobre-promesa que este libro ha evitado desde la Decisión #1.

## 3. Razonamiento detrás de las decisiones confirmadas (sección 0)

### 3.1 Diagramas: ¿Mermaid real o ASCII?

El reporte pide diagramas Mermaid en los `00-indice.md`. Mermaid **no viene incluido en mdBook** — requiere el preprocesador `mdbook-mermaid` (un binario adicional) más dos líneas de JS/CSS inyectadas. Esto tiene una consecuencia concreta: el workflow de despliegue (`.github/workflows/deploy.yml`) instala hoy únicamente el binario de `mdbook`; si se añade Mermaid, ese workflow necesita un paso nuevo para instalar `mdbook-mermaid` también, o el despliegue fallará la próxima vez que se dispare manualmente.

Dos caminos:
- **Opción A (Mermaid real):** diagramas renderizados de verdad, más ricos visualmente. Costo: nueva dependencia de build, un paso nuevo en `deploy.yml`, y una verificación adicional (probar que el despliegue manual sigue funcionando después del cambio).
- **Opción B (diagramas ASCII):** cero dependencias nuevas, cero riesgo de romper el pipeline de despliegue, consistente con el estilo "cero dependencias no verificadas" del libro. Costo: visualmente más simple.

**Recomendación:** Opción B para no tocar el pipeline de despliegue ya verificado y en producción, salvo que prefieras explícitamente pagar el costo de infraestructura de Mermaid.

### 3.2 Ubicación de "streaming DB→HTTP"

El reporte sugiere Capítulo 6.1 *o* 6.2. Recomendación: **6.1**, porque ese capítulo ya tiene el primer servidor Axum real con código verificado; 6.2 está dedicado a middleware (`tower`), un tema distinto. Si no objetas, el plan de abajo lo ubica en 6.1.

### 3.3 Alcance del antimeridiano

Dado que no hay una función lista en `geo`, ¿el capítulo 3.2 debe (a) solo explicar el problema y por qué las lógicas ingenuas fallan (sin código de solución), o (b) además mostrar una técnica manual de partición de geometrías en el antimeridiano, verificada en scratchpad? Recomendación: (b), porque es más útil para el lector y consistente con la densidad de ejercicios que exige la EDT — pero es más trabajo de verificación.

## 4. Hitos propuestos

Cada hito cierra con: verificación en scratchpad de todo código nuevo → `mdbook build` + `mdbook test` limpios → actualización de `BACKLOG.md` (checklist + entrada de Decisión numerada) → commit + push → resumen al usuario → **pausa a esperar aprobación explícita antes del siguiente hito**, igual que las Fases 0–7.

### Hito 8.0 — Infraestructura de diagramas — **omitido**

Decisión confirmada: diagramas ASCII, sin dependencias nuevas de build. No hay trabajo de infraestructura que hacer; se pasa directo al Hito 8.1.

### Hito 8.1 — Reescritura de los 8 `00-indice.md`

Aplicar sistemáticamente a cada uno (Partes I–VII + Apéndices) la plantilla nueva:
1. Objetivos de aprendizaje (3-4 viñetas concretas y verificables — qué va a poder *hacer* el lector, no qué va a "conocer").
2. Contexto arquitectónico: en qué estado queda GeoAPI al entrar al módulo y qué pieza se añade.
3. Diagrama ASCII (bloque de texto con `┌─┐`/`│`/`└─┘` o similar) mostrando la pieza arquitectónica que ese módulo añade a GeoAPI.
4. Prerrequisitos: qué conceptos de módulos anteriores son críticos para no perderse.

Sin tocar `SUMMARY.md` ni la numeración EDT — son los mismos 8 archivos ya enlazados desde el Hito de navegación anterior.

### Hito 8.2 — Vacíos conceptuales: Módulo 2 (Primitivas Geoespaciales Puras)

- **3.2 (CRS):** subsección sobre el antimeridiano y los polos — explica por qué las lógicas ingenuas de bbox/intersección fallan al cruzar 180°, y muestra una técnica manual de partición de geometrías en el antimeridiano, verificada en scratchpad antes de escribirse (sin prometer una función de `geo` que no existe).
- **3.3 (algoritmos core):** subsección + ejercicio guiado de *property-based testing* con `proptest` (ej. invariante "el área de un polígono simple nunca es negativa", generando geometrías válidas aleatorias).
- **3.4 (serialización):** ejercicio sobre *winding order* / regla de la mano derecha, usando `geo::algorithm::orient` sobre GeoJSON con anillos en sentido horario (legacy).
- Actualizar `08-apendices/soluciones-modulo-2.md` con las soluciones de referencia de los ejercicios nuevos (formato ya establecido: enunciado, criterio de éxito, solución).

### Hito 8.3 — Vacíos conceptuales: Módulo 5 (Arquitectura de Producción)

- **6.1 (Axum vs. Actix):**
  - Subsección de mapeo de errores de dominio a respuestas HTTP: un tipo de error de aplicación que implementa `IntoResponse`, devolviendo `application/problem+json` (RFC 7807) con el código de estado correcto según el tipo de error (`400`, `404`, `422`).
  - Subsección de streaming asíncrono PostGIS→HTTP: `sqlx::query().fetch()` como `Stream`, conectado directamente al *body* de la respuesta Axum (`Body::from_stream`) sin materializar todas las filas en un `Vec` — verificado contra PostGIS real, incluyendo una comparación de memoria/latencia frente a la versión ingenua que sí acumula todo en memoria (para que el lector *vea* el problema, no solo lea sobre él).
- **6.2 (Middleware con Tower):** subsección + ejercicio de `tower_http::cors::CorsLayer` con una configuración restrictiva real, más una nota sobre límite de tamaño de payload (`tower_http::limit::RequestBodyLimitLayer` o equivalente) para prevenir geometrías gigantes como vector de denegación de servicio.
- Actualizar `08-apendices/soluciones-modulo-5.md`.

### Hito 8.4 — Cierre de la Fase 8: consistencia, trazabilidad y despliegue

- Revisar que las expansiones no rompan referencias cruzadas existentes: los proyectos guiados de cierre (3.5, 6.6) y los tres capstones (7.1–7.3) citan capítulos específicos en sus tablas de trazabilidad — confirmar que ninguna cita quedó desactualizada y, si el mapeo de errores HTTP o el CORS ahora son prerrequisitos reales de un capstone, señalarlo explícitamente en su tabla.
- `mdbook build` + `mdbook test` limpios sobre el libro completo.
- Actualizar `BACKLOG.md`: checklist de la Fase 8 completo, tabla de fases actualizada, entradas de Decisión correspondientes.
- Commit + push.
- Resumen de cierre al usuario y — si en el futuro surge una Fase 9 — pausa a esperar aprobación, seguiendo la misma disciplina que las fases 0-7.

## 5. Lo que este plan explícitamente NO hace

- No renumera ningún capítulo ni introduce secciones EDT nuevas (ej. no habrá un "3.2a" o un "6.1.5") — todo el contenido nuevo se integra dentro de las subsecciones de los capítulos ya existentes, tal como pide el reporte en su sección 4.2.
- No toca el disparo manual del workflow de despliegue (`workflow_dispatch`) salvo, posiblemente, para añadir un paso de instalación si se aprueba Mermaid (sección 3.1) — nunca para cambiar cuándo se dispara.
- No reduce ni sustituye ejercicios existentes — solo añade.
- No introduce ningún crate que la nota de síntesis de `docs/ruta-aprendizaje-rust-gis-apis.md` ya descartó.
