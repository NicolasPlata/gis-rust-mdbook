# Plan — Fase 15: Cuarta auditoría técnica y editorial (Capítulos 2.1–2.2)

## Origen y verificación

El usuario proveyó `reporte-auditoria-capitulos-2-1-2-2.md` (raíz del repo), una cuarta auditoría externa enfocada exclusivamente en los Capítulos 2.1 y 2.2 (numeración vigente desde la Fase 13) y su `00-indice.md`. Antes de aceptar nada se verificó cada hallazgo contra el contenido real de `src/02-fundamentos-rust/01-sintaxis-basica-de-rust-i.md`, `02-sintaxis-basica-de-rust-ii.md`, `00-indice.md` y los capítulos posteriores que el reporte dice que se ven afectados (2.3, 2.4, 3.1), con `grep` dirigido en vez de confiar en las citas del reporte.

| # | Hallazgo del reporte | Veredicto | Evidencia |
|---|---|---|---|
| 2.1-1 | `println!` y comentarios (`//`) se usan desde el primer bloque de 2.1, pero se explican recién al final de 2.2 | **Confirmado** | 2.1 línea 14 usa `println!` y línea 16 un comentario `//`, sin ninguna explicación previa. La sección "Comentarios y `println!`" vive en 2.2, línea 199 — la última sección del capítulo *siguiente*. |
| 2.1-2 | *Shadowing* nunca se menciona | **Confirmado** | `grep -ri "shadow\|sombread"` sobre todo el Módulo 1 y 2: cero resultados. Matiz: el propio código del libro nunca *necesita* shadowing (en 2.4, `parsear_coord` usa nombres distintos `lat_str`/`lat`, no re-declara) — es un vacío de vocabulario, no un bloqueo de comprensión de código ya escrito. |
| 2.1-3 | `const` nunca se menciona | **Confirmado** | Cero apariciones de `const [A-Z_]+` en `src/02-fundamentos-rust/` ni `03-primitivas-geoespaciales/`. |
| 2.1-4 | No se enseña `String::from`/`.to_string()` antes de que un ejercicio lo exija | **Confirmado y más grave de lo que el reporte sugiere.** El Ejercicio 1 de 2.2 pide `struct Ciudad { nombre: String, ... }` e instanciarlo — imposible sin saber construir un `String` desde un literal. La solución en `soluciones-modulo-1.md:63` usa `.to_string()` **sin que el capítulo lo haya enseñado nunca**. Esto no es solo fricción cognitiva: es un ejercicio que, tal como está el libro hoy, no se puede resolver únicamente con lo enseñado hasta ese punto. |
| 2.1-5 | No se enseña a inicializar un `Vec` vacío y hacerlo crecer con `.push()` | **Confirmado** | `.push()` se usa sin explicación previa en `03-ownership-borrowing.md:132` (ejemplo ilustrativo) y en el proyecto de cierre `06-proyecto-geoapi-v0.1.md:172` (`resumen.validas.push(coord)`, código que el lector debe escribir él mismo). `Vec::new()` no aparece en ningún capítulo del Módulo 1 o 2; el proyecto de cierre lo evita con `#[derive(Default)]`, pero eso no enseña `Vec::new()` tampoco. |
| 2.2-1 | No se enseña el patrón constructor (`fn new(...) -> Self`) | **Confirmado, y el hallazgo más crítico de los nueve.** 2.2 solo muestra `&self` (lectura). El primer código real de `geo-types` en el Capítulo 3.1, línea 37, es `Point::new(-74.0721, 4.7110)` — el lector llega a la primera línea de código del Módulo 2 sin saber qué es una función asociada ni por qué `Point::new` no lleva `&self`. |
| 2.2-2 | No se enseña que un `enum` puede llevar datos por variante | **Confirmado, crítico.** 2.2 solo muestra el `enum FuenteDatos` estilo C (variantes sin datos). El Capítulo 2.4, líneas 51–54, introduce `enum ErrorCoord { LatitudFueraDeRango(f64), ... }` — una variante con payload — sin ninguna base previa. Peor aún: el propio texto de 2.4 (línea 36) apoya la explicación de `Option<T>`/`Result<T, E>` en que el lector ya entienda que un `enum` puede llevar un valor adentro (`Some(valor)`), algo que 2.2 nunca mostró. |
| 2.2-3 | No se enseña `&mut self` como receptor de método | **Confirmado, pero de impacto menor al que el reporte sugiere.** 2.3 (`ownership-borrowing.md:99`) sí enseña `&mut T` a fondo, con ejemplo GIS (`fn trasladar(puntos: &mut Vec<Coord>, ...)`) — el concepto de préstamo mutable no es nuevo cuando el lector llega a FFI/streaming en el Módulo 4, que es donde `&mut self` aparece por primera vez como receptor de método (`ffi-seguro-geos.md`, `copc-streaming-lidar.md`), y siempre dentro de un `impl Trait for T` donde la firma la impone el trait, no una decisión de diseño propia. Aun así, es una laguna real frente a la regla de "nunca asumas conocimiento no enseñado": el lector nunca ve la sintaxis de un método propio que mute `self`. |
| 2.2-4 | El operador de rango `..` no se formaliza al reutilizarse en slices | **Confirmado, menor.** 2.1 usa `0..3` en un `for` con una nota inline; 2.2 usa `&ruta[0..2]` sin conectar ambos usos explícitamente. |
| 00-indice | Objetivos de aprendizaje no reflejan constructor ni enums con datos | **Confirmado** — depende de que 2.2-1 y 2.2-2 se acepten primero. |

**Los nueve hallazgos son genuinos**, aunque dos (2.1-2 shadowing, 2.2-3 `&mut self`) tienen impacto menor al que el reporte les atribuye. Ninguno requiere verificación en un crate de scratch — son adiciones de sintaxis pura de `std`, ya cubiertas por `mdbook test` como los bloques ` ```rust ` existentes del Módulo 1.

## Severidad

- **Alto — bloqueante real:** 2.1-4 (`String::from`/`.to_string()`). Un ejercicio ya publicado no es resoluble con el contenido enseñado hasta ese punto.
- **Alto — vacío crítico de continuidad:** 2.2-1 (constructor `new`), 2.2-2 (enums con datos), 2.1-1 (`println!`/comentarios sin enseñar). Los tres violan directamente la regla no negociable de `CLAUDE.md` para conceptos que sostienen capítulos inmediatamente siguientes (3.1 y 2.4 respectivamente).
- **Medio:** 2.1-3 (`const`), 2.1-5 (`Vec::new`/`.push`), 2.2-3 (`&mut self`). Vocabulario legítimamente faltante, sin bloquear ningún ejercicio ya publicado.
- **Bajo, barato de cerrar:** 2.2-4 (formalizar `..`), la nota marginal de `derive(Debug)` → `Serialize`/`Clone` que el reporte sugiere en sus recomendaciones, y el ajuste de `00-indice.md`.

## Decisión: dónde vive cada cambio (sin renumerar nada, sin nuevos capítulos)

Los nueve hallazgos caben dentro de 2.1 y 2.2 tal como existen hoy. No hay que tocar `SUMMARY.md` ni ningún otro capítulo del libro más allá de `00-indice.md` del Módulo 1.

### Capítulo 2.1 — cinco adiciones, en este orden dentro del archivo

1. **Nueva sección "Comentarios y `println!`" al inicio**, justo después de la introducción del capítulo y antes de "Variables y mutabilidad" (donde ya se necesitan). Cubre `//`, `println!` con `{}` posicional y `{nombre}` interpolado — **sin** el especificador `{:?}`, que se queda donde está, en 2.2, atado a `derive(Debug)` (ver más abajo). Esto es una desviación deliberada de la recomendación literal del reporte ("mover íntegramente la sección"): moverla completa rompería la frase de 2.2 *"ahora que ya conoces `#[derive(Debug)]`, tienes un tercer formato disponible, `{:?}`"*, que depende de enseñar Debug primero. Separar "imprimir" (2.1, lo básico) de "imprimir para depurar un tipo propio" (2.2, atado a Debug) es más limpio que la reubicación literal y no dispersa la explicación de `{:?}` sin ancla.
2. **Sub-bloque de *shadowing*** dentro de "Variables y mutabilidad", con un ejemplo que **no** usa `.parse()`/`Result` (ese flujo es el tema completo del Capítulo 2.4 y aún no se enseñó `Result`): reutilizar el mismo nombre para cambiar de tipo con `as`, p. ej. convertir un ancho en píxeles (`i32`) a `f64` para un cálculo geométrico posterior. El ejemplo de "parsear un string a f64" que sugiere el reporte se deja fuera a propósito — introduciría `.unwrap()`/`Result` antes de tiempo.
3. **Nueva sección corta "Constantes: `const`"**, después de "Tipos primitivos" (necesita que el lector ya conozca `f64`/tipos explícitos). Ejemplo: `const RADIO_TIERRA_M: f64 = 6371000.0;`, contrastado brevemente con `let`: vive en tiempo de compilación, siempre necesita tipo explícito, convención `MAYUSCULAS_CON_GUION_BAJO`.
4. **Extensión del párrafo `&str`/`String`** (sección "Tipos primitivos"): agregar la nota práctica que propone el reporte case por caso — `String::from("Bogotá")` o `"Bogotá".to_string()` — **esto es el fix que desbloquea el Ejercicio 1 de 2.2**, tal como está publicado hoy.
5. **Sub-bloque de `Vec::new()` + `.push()`** dentro de "Bucles" (junto al `Vec<T>`/`vec![...]` ya explicado): construir una ruta vacía y agregarle coordenadas dentro de un `for`, ejemplo GIS (filtrar/acumular coordenadas válidas de una lista cruda).

Ejercicios de 2.1: se mantienen los 2 existentes sin cambios de enunciado. Ninguno de los cinco puntos de arriba requiere un ejercicio dedicado — son vocabulario que los ejercicios de 2.2 (ya publicados) y el proyecto 2.6 ejercitan indirectamente en cuanto estén disponibles.

### Capítulo 2.2 — cuatro cambios

1. **Sección "Comentarios y `println!`" actual (línea 199–222): se elimina el contenido básico** (movido a 2.1, ver arriba) **y se funde el cierre con la sección de `derive(Debug)`**: inmediatamente después de explicar `#[derive(Debug)]`, agregar una frase de transición ("ya sabes usar `println!` con `{}`/`{nombre}` desde el Capítulo 2.1 — `derive(Debug)` te da un tercer formato, `{:?}`") con el bloque de código que ya existe mostrando `{:?}`/`{bogota:?}`. No queda ninguna sección "Comentarios y `println!`" separada en 2.2.
2. **Expansión del bloque `impl`** (después del ejemplo `es_valida(&self)`): añadir (a) el patrón constructor `impl Coord { fn new(lat: f64, lon: f64) -> Self { Self { lat, lon } } }`, explicando `Self` como alias del tipo que se está implementando y la convención `new` (no reservada por el compilador, pero universal en el ecosistema — anclado explícitamente a que `geo_types::Point::new` en el Capítulo 3.1 sigue exactamente este patrón); y (b) un método con `&mut self` (p. ej. `fn aplicar_offset(&mut self, delta_lat: f64, delta_lon: f64)`), con la misma nota de "esto se explica a fondo en el Capítulo 2.3" que ya usa el `&self` existente — mismo estilo, no una excepción nueva.
3. **Extensión del `enum FuenteDatos`** (no un enum nuevo): dar payload a al menos una variante, p. ej. `Csv(String)` (ruta del archivo) manteniendo `GeoJson`/`Shapefile` simples o dándoles también un dato — y extender el `match` de `describir` para desestructurar el dato (`FuenteDatos::Csv(ruta) => ...`). Se prefiere extender el enum ya presentado en vez de introducir un `enum Geometria` nuevo (como sugiere el reporte): es el mismo concepto con una adición mínima, no duplica contenido, y no se adelanta al modelo OGC Simple Features que es, explícitamente, el contenido del Capítulo 3.1 — este capítulo (2.2) declara "seguimos sin tocar nada específico de GIS todavía". Justo después, reforzar la frase ya existente ("`Option<T>` y `Result<T, E>`... no son más que un `enum` con esta misma forma") agregando "— con datos, como el que acabas de ver arriba" para que el puente hacia 2.4 quede explícito.
4. **Nota de una frase** en la sección de slices formalizando que `..` (en `&ruta[0..2]`) es el mismo operador de rango que ya viste en `for i in 0..3` (2.1). Y en "Atributos y `#[derive(Debug)]`", una frase de cierre anticipando que el mismo mecanismo `derive` reaparece con `Serialize`/`Deserialize` (Capítulo 3.4) y `Clone`.

Ejercicios de 2.2: se mantienen los 4 existentes. Se propone un **quinto ejercicio nuevo** — "Constructor y enum con datos": definir `Coord::new` y una función que reciba un `FuenteDatos::Csv(ruta)` y devuelva la ruta como `&str` vía `match`. Esto cierra el círculo de refuerzo para los dos hallazgos de severidad alta de este capítulo, igual que el resto del libro exige criterio de éxito verificable + solución de referencia en el apéndice.

### `src/02-fundamentos-rust/00-indice.md`

Aplicar el ajuste que propone el reporte al primer bullet de "Objetivos de aprendizaje", una vez 2.2-1/2.2-2 estén escritos:

> "Leer y escribir Rust básico: variables, tipos primitivos, instanciación mediante **constructores**, funciones, control de flujo, `struct`, **`enum` (incluyendo variantes con datos)** y `match` — el vocabulario mínimo que el resto del libro da por asumido desde la primera línea de código."

### `docs/EDT-libro-rust-gis-apis.md`

- Nota de la Fase 15 en las entradas de 2.1 y 2.2 (mismo estilo que las notas de la Fase 13), documentando qué vacíos se cerraron.
- Si se aprueba el quinto ejercicio de 2.2: actualizar "Densidad de ejercicios" de 2.2 (4→5) y el total del Módulo 1 (17→18).

### `BACKLOG.md`

Nueva sección "Fase 15 — Cuarta auditoría técnica y editorial (Capítulos 2.1–2.2)" con checklist granular (una tarea por punto de arriba), siguiendo el mismo formato que las Fases 8–14.

## Fuera de alcance (a propósito)

- No se toca ningún capítulo más allá de 2.1, 2.2 y `00-indice.md` del Módulo 1 — el reporte no encontró nada en 2.3–2.6 que exija reescritura, solo continuidad hacia adelante que 2.1/2.2 ahora sí sostienen.
- No se renumera nada: los nueve hallazgos caben como secciones nuevas o extendidas dentro de los archivos existentes.
- El ejemplo de *shadowing* con `.parse()`/`Result` que sugiere el reporte se descarta a favor de uno con `as` — ver justificación en 2.1, punto 2.
- El `enum Geometria` nuevo que sugiere el reporte se descarta a favor de extender `FuenteDatos` — ver justificación en 2.2, punto 3.

## Verificación al cerrar la fase

- `mdbook build` y `mdbook test` limpios sobre el libro completo (todos los bloques nuevos son `std` puro — ningún crate externo, no aplica el flujo de verificación en crate de scratch de `CLAUDE.md`).
- Confirmar a mano que el Ejercicio 1 de 2.2 (`struct Ciudad`) es resoluble usando solo contenido de 2.1/2.2 hasta ese punto — el bug concreto que motivó el hallazgo 2.1-4.
- Eliminar `reporte-auditoria-capitulos-2-1-2-2.md` de la raíz una vez procesado (mismo tratamiento que los reportes de las Fases 8, 11 y 14).
- Actualizar la tabla de fases de `CLAUDE.md` (se hace al cerrar, no antes, siguiendo el patrón de las Fases 8–14).

## Preguntas para el usuario antes de implementar

1. ¿Apruebas las dos desviaciones respecto a la redacción literal del reporte (shadowing con `as` en vez de `.parse()`; extender `FuenteDatos` en vez de crear `enum Geometria`)?
2. ¿Apruebas agregar el quinto ejercicio a 2.2 (constructor + enum con datos), con el ajuste de conteo en la EDT que eso implica?

Si no hay objeciones, la fase se ejecuta punto por punto en el orden de este documento, con commit atómico por capítulo (2.1, luego 2.2, luego índice/EDT/backlog) y push inmediato tras cada commit, como ya está acordado para el resto del libro.
