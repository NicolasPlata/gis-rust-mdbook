# Plan — Fase 13: División del Capítulo 2.1 y cierre de vacíos de sintaxis

## El hallazgo

El usuario cuestionó si el Capítulo 2.1 ("Sintaxis básica de Rust", añadido en la Fase 12) alcanza para sostener la promesa de "cero experiencia previa en Rust". Auditoría contra los capítulos 2.2 (ownership) y 2.3 (`Result`/`Option`) encontró **cuatro vacíos reales** — términos usados antes de definirse, la misma clase de problema que motivó la Fase 12:

1. **Tuplas** — el propio Ejercicio 4 de 2.1 usa `Vec<(f64, f64)>` y desestructuración `(lat, lon)` sin enseñar la sintaxis de tuplas. 2.3 las reutiliza (`&[(&str, f64)]`, `for (k, v) in propiedades`, `FeatureSimple { coords: Vec<(f64, f64)> }`).
2. **`#[derive(Debug)]` y `{:?}`** — aparecen por primera vez en 2.3 (`#[derive(Debug)] struct Coord`, `println!("{c:?}")`) sin que 2.1 explique qué es un atributo `#[derive(...)]` ni el formato de depuración.
3. **Dereferencia `*`** — 2.3 usa `if *k == clave` y `Some(*v)` sin que se haya explicado nunca el operador.
4. **Slices `&[T]`** — usados en 2.2 (`&[Coord]`) y 2.3 (`&[(&str, f64)]`, `.get()`) pero 2.1 solo enseña `Vec<T>`.

Adicionalmente, el libro menciona varias veces la fricción del *borrow checker* sin que ningún capítulo enseñe a **leer un mensaje de error del compilador** (anatomía de `error[EXXXX]`, `-->`, el fragmento señalado, `help:`).

## Decisión aprobada (confirmada por el usuario 2026-09-07)

- Dividir el Capítulo 2.1 en **dos capítulos**, ambos dentro del Módulo 1, cerrando los cuatro vacíos en el segundo:
  - **2.1 — Sintaxis básica de Rust I** (variables/tipos/funciones/control de flujo) — contenido ya existente del 2.1 actual, sin reescritura de fondo, más una sección nueva sobre cómo leer un error del compilador.
  - **2.2 — Sintaxis básica de Rust II** (composición de datos: `struct`, `enum`/`match`, tuplas, slices, `#[derive(Debug)]`) — contenido ya existente del 2.1 actual que trata `struct`/`enum`/`match`, más las cuatro secciones nuevas.
- La sección "cómo leer un error del compilador" va **dentro de 2.1**, anclada al error real más simple que el libro ya insinúa (asignar dos veces a una variable inmutable, la línea comentada `// latitud = 4.60;` del ejemplo de apertura) — no un capítulo aparte.
- Esto implica **renumerar** los capítulos 2.2–2.5 actuales a 2.3–2.6. Ningún otro módulo (3.0–7.0) cambia.

Segunda desviación registrada respecto a la ruta/EDT originales, en la misma línea que la Fase 12.

## Contenido exacto

### 2.1 — Sintaxis básica de Rust I

Contenido ya escrito, sin reescritura de fondo (solo ajustar el párrafo de apertura y "Lo que sigue", que hoy anuncian `struct`/`enum`/`match` como parte del mismo capítulo):

1. Variables y mutabilidad (`let`, `let mut`).
2. Tipos primitivos (enteros, `f64`, `bool`, `&str` vs `String`).
3. Funciones (`fn`, expresión de retorno sin `;`).
4. Control de flujo (`if`/`else` como expresión, `loop`/`while`/`for`).
5. **Nueva — Cómo leer un error del compilador.** Se retoma el ejemplo de apertura (`let latitud = 4.7110;` seguido de una reasignación), se descomenta en un bloque `rust,ignore`, y se muestra el mensaje real de `rustc` (verificado en un crate de scratch antes de publicarse, igual que cualquier snippet de este libro) anotado línea por línea: código de error (`E0384`), la línea `-->` que apunta al archivo:línea, el fragmento de código con el `^^^` señalando el token exacto, y la sugerencia `help:`. Cierra con la idea de que el compilador de Rust está diseñado para ser leído, no temido — vas a volver a apoyarte en esta lectura en el Capítulo 2.3 (ownership).
6. Cierra "Lo que sigue" apuntando al 2.2 (no al 2.3): "ya sabes declarar valores y controlar el flujo — lo que falta es agrupar varios valores relacionados bajo un solo tipo, la pregunta del próximo capítulo."

Ejercicios: los 2 que corresponden a este recorte (el de `clasificar_altitud` con `if`/`else`; posiblemente uno nuevo y corto sobre bucles si el capítulo queda liviano en ejercicios — se decide al escribir, sin bajar de 2).

### 2.2 — Sintaxis básica de Rust II

Contenido ya escrito (structs, enum/match) más las cuatro secciones que cierran los vacíos:

1. `struct`: definición, instanciación, acceso con `.`, `impl` con un método `&self` (ya escrito).
2. **Nueva — Tuplas.** `(f64, f64)` como par de valores sin nombrar campos, desestructuración en `let (lat, lon) = ...` y en patrones de `for`, cuándo preferir una tupla sobre un `struct` (ad-hoc, dos-tres valores, sin necesidad de nombres) — ancla en el propio ejemplo de coordenadas del libro.
3. **Nueva — Slices `&[T]` vs `Vec<T>`.** `Vec<T>` posee y puede crecer; `&[T]` es una vista de solo lectura sobre cualquier secuencia contigua (un `Vec` completo, o parte de uno). Por qué una función que solo necesita leer una colección de coordenadas debería preferir `&[Coord]` sobre `&Vec<Coord>` como parámetro (más flexible: acepta también un slice parcial, un array, etc.) — anticipa el uso real en 2.3/2.4.
4. `enum` y `match` básico, con un enum propio simple (ya escrito).
5. **Nueva — Dereferencia `*`.** Qué hace `*` sobre una referencia (accede al valor al que apunta), por qué `if *k == clave` es necesario cuando `k: &&str` o similar, contraste breve con la desreferencia automática de `.` en llamadas a método (para que el lector no se pregunte por qué nunca necesitó `*` antes de esto).
6. **Nueva — Atributos y `#[derive(Debug)]`.** Qué es un atributo (metadato para el compilador), qué hace `derive` (genera código automáticamente), por qué `Debug` en particular (permite `{:?}` en `println!`) — distinción breve con el `Display`/`{}` que ya conoce del capítulo anterior, sin profundizar en implementarlo a mano (fuera de alcance de este capítulo).
7. Comentarios y `println!`, ahora incluyendo `{:?}` en la tabla de formatos (ya escrito + ajuste).
8. Cierra "Lo que sigue" — el mismo texto ya escrito, apuntando ahora al Capítulo 2.3 (ownership).

Ejercicios: los que ya existen (struct/`Ciudad`, enum/`TipoGeometria`, tuplas/formateo de coordenadas) más, si hace falta, uno corto de `#[derive(Debug)]`/`{:?}` — total esperado 4-5.

## Renumeración exacta

| Actual | Nuevo | Archivo actual | Archivo nuevo |
|---|---|---|---|
| 2.1 (parte I) | **2.1** | `01-sintaxis-basica-de-rust.md` | `01-sintaxis-basica-de-rust-i.md` |
| 2.1 (parte II, nuevo contenido) | **2.2** | — | `02-sintaxis-basica-de-rust-ii.md` |
| 2.2 | 2.3 | `02-ownership-borrowing.md` | `03-ownership-borrowing.md` |
| 2.3 | 2.4 | `03-result-option-manejo-errores.md` | `04-result-option-manejo-errores.md` |
| 2.4 | 2.5 | `04-traits-genericos-iteradores.md` | `05-traits-genericos-iteradores.md` |
| 2.5 | 2.6 | `05-proyecto-geoapi-v0.1.md` | `06-proyecto-geoapi-v0.1.md` |

`git mv` para los cuatro archivos existentes que solo cambian de número (2.2→2.3, 2.3→2.4, 2.4→2.5, 2.5→2.6). El archivo `01-sintaxis-basica-de-rust.md` actual se divide a mano en dos archivos nuevos (no es un simple `git mv`).

## Archivos con referencias cruzadas a corregir

Localizadas con `grep`, revisión una por una (no *sed* ciego, igual que en la Fase 12):

- `src/02-fundamentos-rust/01-sintaxis-basica-de-rust.md` (el propio capítulo, al dividirse): todas sus referencias internas a "Capítulo 2.2" apuntan hoy a ownership — pasan a "Capítulo 2.3", excepto las que en realidad describen contenido que se muda al nuevo 2.2 (`struct`/`impl`/`enum`/`match`), que deben re-redactarse, no solo renumerarse.
- `src/03-primitivas-geoespaciales/00-indice.md` — "(2.2)" ownership → (2.3), "(2.3)" Result → (2.4), "(2.4)" traits → (2.5).
- `src/03-primitivas-geoespaciales/03-algoritmos-core-geo.md` — dos referencias a "Capítulo 2.4" (traits) → 2.5.
- `src/03-primitivas-geoespaciales/04-serializacion-geojson-wkt.md` — tres referencias a "Capítulo 2.3" (Result) → 2.4.
- `src/03-primitivas-geoespaciales/05-proyecto-geoapi-v0.2.md` — una referencia a "Capítulo 2.3" → 2.4.
- `src/04-indices-robustez-persistencia/00-indice.md` — una referencia "(2.3)" → (2.4).
- `src/04-indices-robustez-persistencia/04-reproyeccion-proj.md` — dos referencias a "Capítulo 2.3" → 2.4.
- `src/06-arquitectura-produccion/00-indice.md` — una referencia "(2.3)" → (2.4).
- `src/07-capstones/02-capstone-b-analitica-geoparquet.md` — una referencia a "Capítulo 2.3" → 2.4.
- `src/01-front-matter/00-indice.md` — "Capítulo 2.1" (workspace listo para — sigue siendo correcto, no cambia) y "Capítulo 2.5" (Hello World hasta) → 2.6.
- `src/01-front-matter/01-introduccion-y-mapa-de-la-ruta.md` — tabla de versiones GeoAPI, "Capítulo 2.5" → 2.6.
- `src/01-front-matter/02-entorno-de-trabajo-del-libro.md` — dos referencias a "Capítulo 2.5" → 2.6.
- `src/08-apendices/soluciones-modulo-1.md` — headers `## Capítulo 2.2/2.3/2.4` → `2.3/2.4/2.5`; el header existente `## Capítulo 2.1` se divide en `## Capítulo 2.1` (soluciones de la parte I) y un nuevo `## Capítulo 2.2` (soluciones de la parte II, con las de tuplas/enum/struct que ya existían más la nueva de `#[derive(Debug)]` si se añade ejercicio).
- `src/02-fundamentos-rust/00-indice.md` — lista de capítulos del propio módulo.
- `src/SUMMARY.md` — entradas 2.1–2.5 → 2.1–2.6.
- `docs/EDT-libro-rust-gis-apis.md` — nodo 2.1 se divide en 2.1/2.2, renumeración 2.3–2.6, nota de la Fase 13, actualizar total de ejercicios del Módulo 1, y la referencia de trazabilidad "2.3, 6.1" (tabla de capstones, hoy apunta a Result) → "2.4, 6.1".

## Verificación de código

Los bloques nuevos (tuplas, slices, `*`, `#[derive(Debug)]`, el error de compilador transcrito) son todos `std` puro — se verifican como doctests reales con `mdbook test`, igual que el resto del Módulo 1. El transcript del error de compilador no es un doctest (es un bloque `rust,ignore` con el error como comentario/texto), pero el código que lo dispara debe compilarse aparte en un crate de scratch para confirmar que el mensaje mostrado es el real de la versión de `rustc` usada — mismo principio que cualquier otro snippet verificado en este libro.

## Hitos

- **Hito 13.1** — Dividir el contenido actual del Capítulo 2.1 en los dos archivos nuevos, reescribiendo solo los párrafos de transición/apertura/cierre que hoy asumen que todo vive en un único capítulo.
- **Hito 13.2** — Escribir las cinco secciones nuevas (error del compilador, tuplas, slices, dereferencia, atributos/Debug) con sus ejemplos ya anclados en GeoAPI, verificados con `mdbook test` (y el transcript del error verificado en un crate de scratch).
- **Hito 13.3** — Ejercicios: confirmar reparto 2.1/2.2, añadir el ejercicio de `#[derive(Debug)]`/`{:?}` si aplica, actualizar `soluciones-modulo-1.md` (headers renumerados + nueva sección 2.2).
- **Hito 13.4** — `git mv` de los cuatro archivos 2.2→2.6, actualizar `src/SUMMARY.md` y `src/02-fundamentos-rust/00-indice.md`.
- **Hito 13.5** — Pasada uno por uno sobre la lista de referencias cruzadas de arriba.
- **Hito 13.6** — Cierre: actualizar `docs/EDT-libro-rust-gis-apis.md` (split de nodo, renumeración, nota de fase, trazabilidad), registrar la Fase 13 en `BACKLOG.md`, `mdbook build` + `mdbook test` limpios sobre el libro completo, commit + push.

## Qué NO cambia

- Ningún otro módulo (3.0–7.0) cambia de numeración.
- El contenido técnico ya existente de `struct`/`enum`/`match`/variables/tipos/funciones/control de flujo no se reescribe de fondo — solo se reparte entre los dos archivos y se ajustan las transiciones.
- `docs/ruta-aprendizaje-rust-gis-apis.md` no se edita — la desviación queda registrada en `BACKLOG.md` y en la EDT, no reescrita en la ruta fuente.
