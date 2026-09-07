# Plan — Fase 12: Capítulo de sintaxis básica de Rust

## El hallazgo

El libro promete explícitamente, en el Capítulo 1.1 ("Qué necesitas antes de empezar"): *"Nada de experiencia previa en Rust"*. Sin embargo, el Módulo 1 (Fundamentos de Rust) arranca directo en el Capítulo 2.1 con ownership/borrowing/lifetimes, y para explicarlo ya usa sin haberlos presentado nunca: `struct`, `fn`, `let`/`let mut`, tipos primitivos (`f64`, `usize`, `bool`), `Vec<T>`/`vec![]`, `for ... in`, `println!` y su interpolación `{}`. El Capítulo 2.2 suma `match`, `enum` (vía `Option`/`Result`), `#[derive(Debug)]`, tuplas y desreferencia `*`. El Capítulo 2.3 va a sumar más (`impl`, closures, `impl Trait`).

Rastreado hasta la causa raíz: el documento fuente `docs/ruta-aprendizaje-rust-gis-apis.md`, en su "Fase 0", dice literalmente **"Recurso base: The Rust Book (gratuito, oficial)"** — la ruta original asumía que el lector trae o lee en paralelo la sintaxis básica de un recurso externo, y que este libro solo añade la capa "por qué esto importa en GIS" encima. Esa suposición nunca se comunicó al lector: el Capítulo 1.1 promete cero experiencia sin mencionar en ningún punto que hace falta ese acompañamiento externo.

Esto contradice directamente la regla no negociable de `CLAUDE.md`: *"Nunca asumas conocimiento no enseñado todavía... nunca dejes al lector con un término sin definir."*

## Decisión aprobada

Añadir un **nuevo Capítulo 2.1 — Sintaxis básica de Rust**, antes del actual 2.1 (Ownership), haciendo el libro genuinamente autocontenido — sin depender de que el lector traiga The Rust Book. Esto implica **renumerar** los cuatro capítulos existentes del Módulo 1 (EDT 2.0), sin tocar la numeración de ningún otro módulo (3.0–7.0 no cambian).

Esta es una desviación registrada respecto al documento fuente (que asumía un recurso externo) — consistente con la regla de `CLAUDE.md` de registrar en el backlog cualquier decisión no prevista por la ruta/EDT originales.

## Contenido del nuevo Capítulo 2.1

Todo con ejemplos ya anclados en el hilo GeoAPI (la misma `struct Coord { lat, lon }` que va a reaparecer en 2.2), y todo en bloques ` ```rust ` reales (no `,ignore`) — es std puro, así que `mdbook test` los verifica directamente como doctests, sin necesidad de un crate de scratch:

1. **Variables y mutabilidad** — `let`, `let mut`, por qué la inmutabilidad es la opción por defecto (anticipa por qué esto importa para ownership en 2.2).
2. **Tipos primitivos** — enteros, `f64` (el tipo que va a dominar todo el libro para coordenadas), `bool`, `char`, y la distinción `&str` vs `String` (breve — lo suficiente para no tropezar, sin adelantar todavía las sutilezas de ownership de `String` que 2.2 cubre a fondo).
3. **Funciones** — `fn`, parámetros, tipo de retorno, expresión final sin `;` como valor de retorno.
4. **Control de flujo** — `if`/`else` como expresión (no sentencia — una sorpresa real para quien viene de otros lenguajes), `loop`, `while`, `for ... in` sobre rangos y sobre `Vec`.
5. **Structs** — definición, instanciación con sintaxis de campos, acceso con `.`, un `impl` mínimo con un método (`fn` con `&self`).
6. **Enums y `match` básico** — un enum propio simple (no `Option`/`Result` todavía, esos se explican a fondo en 2.3) para que el lector ya conozca la forma de `match` antes de que 2.3 le enseñe por qué `Option`/`Result` son enums tan importantes.
7. **Comentarios y `println!`** — sintaxis de comentarios, macro `println!`, interpolación `{}`/`{variable}`.

Cierra con una sección corta "Lo que sigue" que conecta explícitamente con 2.2: *"con este vocabulario ya puedes leer cualquier bloque de código de este libro — lo que falta es entender qué reglas verifica el compilador sobre ese código, y esa es la pregunta del próximo capítulo."*

**Ejercicios:** 3–4 ejercicios cortos, en la línea de densidad de los capítulos restantes del Módulo 1 (no es módulo intermedio, no aplica la densidad alta de 3.0–6.0) — por ejemplo: escribir una función que valide un rango de latitud con `if`/`else`, un `struct Coord` con un método `impl`, un `enum` de 2-3 variantes con `match` exhaustivo.

## Renumeración exacta

| Actual | Nuevo | Archivo actual | Archivo nuevo |
|---|---|---|---|
| — | **2.1** (nuevo) | — | `src/02-fundamentos-rust/01-sintaxis-basica-de-rust.md` |
| 2.1 | 2.2 | `01-ownership-borrowing.md` | `02-ownership-borrowing.md` |
| 2.2 | 2.3 | `02-result-option-manejo-errores.md` | `03-result-option-manejo-errores.md` |
| 2.3 | 2.4 | `03-traits-genericos-iteradores.md` | `04-traits-genericos-iteradores.md` |
| 2.4 | 2.5 | `04-proyecto-geoapi-v0.1.md` | `05-proyecto-geoapi-v0.1.md` |

Ningún otro módulo cambia de numeración. `git mv` para preservar historial en los cuatro renombrados.

## Archivos con referencias cruzadas a corregir (ya localizados con `grep`)

Cada referencia a "Capítulo 2.1/2.2/2.3/2.4" (o su forma parentética `(2.1)` etc.) fuera del propio Módulo 1 necesita revisión **una por una** (no *sed* ciego — el significado de cada referencia decide si sube en +1 o si, por coincidencia, ya apuntaba al capítulo correcto):

- `src/03-primitivas-geoespaciales/00-indice.md` — "(2.1)", "(2.2)", "(2.3)"
- `src/03-primitivas-geoespaciales/03-algoritmos-core-geo.md` — dos referencias a "Capítulo 2.3", una a "Capítulo 2.2"
- `src/03-primitivas-geoespaciales/04-serializacion-geojson-wkt.md` — tres referencias a "Capítulo 2.2"
- `src/03-primitivas-geoespaciales/05-proyecto-geoapi-v0.2.md` — una referencia a "Capítulo 2.2"
- `src/04-indices-robustez-persistencia/00-indice.md` — una referencia a "(2.2)"
- `src/04-indices-robustez-persistencia/04-reproyeccion-proj.md` — dos referencias a "Capítulo 2.2"
- `src/06-arquitectura-produccion/00-indice.md` — una referencia a "(2.2)"
- `src/07-capstones/02-capstone-b-analitica-geoparquet.md` — una referencia a "Capítulo 2.2"
- `src/01-front-matter/00-indice.md` — "Capítulo 2.1" (workspace listo para — coincide, sigue siendo el próximo capítulo tras el setup, **no cambia**) y "Capítulo 2.4" (Hello World hasta — pasa a 2.5)
- `src/01-front-matter/01-introduccion-y-mapa-de-la-ruta.md` — tabla de versiones GeoAPI, "Capítulo 2.4" → 2.5
- `src/01-front-matter/02-entorno-de-trabajo-del-libro.md` — dos referencias a "Capítulo 2.4" → 2.5
- `src/08-apendices/soluciones-modulo-1.md` — headers `## Capítulo 2.1/2.2/2.3` → `2.2/2.3/2.4`, más un nuevo `## Capítulo 2.1` con las soluciones del capítulo nuevo
- `src/02-fundamentos-rust/00-indice.md` — lista de capítulos del propio módulo

## Hitos

- **Hito 12.1** — Escribir el nuevo Capítulo 2.1 completo (contenido + ejercicios), verificar cada bloque con `mdbook test` (std puro, sin scratch crate necesario), añadir sus soluciones en `soluciones-modulo-1.md`.
- **Hito 12.2** — `git mv` de los cuatro archivos existentes, actualizar `src/SUMMARY.md` y `src/02-fundamentos-rust/00-indice.md` con el nuevo orden completo.
- **Hito 12.3** — Pasada uno-por-uno sobre la lista de referencias cruzadas de arriba (títulos internos de cada archivo afectado, más `soluciones-modulo-1.md`).
- **Hito 12.4** — Cierre: actualizar `docs/EDT-libro-rust-gis-apis.md` (nuevo nodo 2.1, renumeración 2.2–2.5, nota de la desviación respecto a la ruta fuente), registrar la decisión en `BACKLOG.md` (nueva Fase 12 con su propio checklist), `mdbook build` + `mdbook test` limpios sobre el libro completo, commit + push.

## Qué NO cambia

- Ningún otro módulo (3.0–7.0) cambia de numeración.
- El contenido de los capítulos 2.2–2.5 (antes 2.1–2.4) no se reescribe — solo cambian su número de capítulo y las referencias externas que apuntan a ellos.
- `docs/ruta-aprendizaje-rust-gis-apis.md` no se edita — es un documento fuente histórico; la desviación queda registrada en `BACKLOG.md`, no reescrita ahí.
