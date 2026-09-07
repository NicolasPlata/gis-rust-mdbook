# Plan de ejecución — Fase 10: TDD en los proyectos guiados

Pedido del usuario: enmarcar los proyectos (guiados y capstones) como desarrollados con TDD, y añadir los tests que falten en los guiados donde tenga sentido. Mismo régimen de aprobación por hito que las Fases 0–9.

**Estado: aprobado.** El usuario confirmó la decisión de la sección 1 (añadir tests sin reordenar el contenido ya publicado).

## 1. Decisión confirmada

**No se reordena ningún checkpoint ya publicado.** El código de implementación se queda donde está, verificado y sin tocar. Donde falte un test automatizado, se añade *junto* al código existente, con una nota que invita al lector a escribirlo antes de mirar la implementación — el espíritu de TDD (rojo antes que verde), sin reescribir contenido estable.

## 2. Auditoría de estado (ver tabla completa en el resumen presentado al usuario)

Vacíos reales encontrados por conteo de `#[test]`/`#[tokio::test]`:

- **2.4 (v0.1):** Checkpoint 2 ya tiene 2 tests. Checkpoints 1 y 3 no tienen ninguno.
- **3.5 (v0.2):** Checkpoint 2 ya tiene 3 tests. Checkpoints 1, 3 y 4 no tienen ninguno — pese a que "Verificación completa" promete `cargo test -p geoapi-core` en verde sobre *todo* el crate.
- **4.7 (v0.3):** cero tests — los tres checkpoints se verifican con una petición HTTP manual y su salida impresa.
- **5.7 (v0.4):** cero tests — mismo patrón que 4.7.
- **6.6 (v1.0):** ya tiene una sección dedicada de tests de integración (2 tests) — cubierto.
- **7.1 (Capstone A):** ya es 100% basado en tests (la suite de aceptación) — es TDD por diseño.
- **7.2 / 7.3 (Capstones B/C):** sin tests, por diseño explícito (su criterio de aceptación es un benchmark y una tabla de trazabilidad, respectivamente, decidido y aprobado en la Fase de capstones). No se les fuerza una suite de tests — solo una nota breve.

## 3. Qué se añade exactamente

- Un primer breve de TDD en el Capítulo 1.3 (qué es red-green-refactor, por qué este libro lo recomienda para los proyectos guiados) — mismo lugar que la sección de historias de usuario.
- Un test real y verificado por cada checkpoint que hoy no tiene uno, en 2.4, 3.5, 4.7 y 5.7 (9 tests nuevos en total: 2 en 2.4, 3 en 3.5, 3 en 4.7, 3 en 5.7 — ver detalle por hito).
- Una nota TDD (sin tests nuevos forzados) en 6.6, 7.1, 7.2 y 7.3.

## 4. Hitos

Cada hito verifica su código nuevo en scratchpad antes de escribirlo, cierra con `mdbook build`/`mdbook test` limpios, actualiza `BACKLOG.md`, commit, push, resumen, y pausa para aprobación del siguiente.

- **Hito 10.0** — Primer de TDD en el Capítulo 1.3.
- **Hito 10.1** — 2.4: test para Checkpoint 1 (parseo de una fila) y Checkpoint 3 (longitud total).
- **Hito 10.2** — 3.5: test para Checkpoint 1 (error de dominio — casos límite), Checkpoint 3 (funciones puras) y Checkpoint 4 (serializar de vuelta).
- **Hito 10.3** — 4.7: test de integración real (servidor levantado) para los 3 checkpoints (`POST /features`, `GET /features/near`, `GET /features/reproject`).
- **Hito 10.4** — 5.7: test de integración real para las 3 secciones (tiles PMTiles, features/stream FlatGeobuf, reproject/batch Rayon).
- **Hito 10.5** — Notas TDD (sin tests nuevos) en 6.6 y los tres capstones.
- **Hito 10.6** — Cierre: consistencia, build/test final, tabla de fases.

## 5. Qué NO cambia

- Ningún checkpoint se reordena ni se reescribe — el código ya verificado permanece intacto.
- 7.2 y 7.3 no reciben tests forzados — se respeta su criterio de aceptación ya aprobado.
- No se renumera nada ni se toca `SUMMARY.md`.
