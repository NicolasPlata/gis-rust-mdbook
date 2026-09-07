# 1.3 Convenciones del libro

Antes de entrar en materia, cinco convenciones cortas que vas a ver repetidas en cada capítulo.

## Bloques de código

Cada bloque de código lleva una etiqueta de lenguaje (` ```rust `, ` ```toml `, ` ```sh `, ` ```json `, ` ```http `) que activa resaltado de sintaxis. Los bloques ` ```rust ` que representan un programa completo y ejecutable están escritos para compilar tal cual — este libro verifica eso automáticamente con `mdbook test` como parte de su propio proceso de construcción, así que si un ejemplo no compila, es un error del libro, repórtalo. Cuando un bloque muestra solo un fragmento (por ejemplo, el cuerpo de una función dentro de un `impl` más grande, sin el resto del archivo alrededor), lo vas a ver marcado como ` ```rust,ignore ` — es intencional, no algo que debas intentar compilar de forma aislada.

Las salidas de terminal (lo que imprime `cargo run`, `cargo test`, o una petición HTTP) se muestran en bloques ` ```text ` justo debajo del comando que las produce.

## Formato de los ejercicios

Todo ejercicio, del primero al último del libro, sigue la misma estructura de tres partes:

1. **Enunciado.** Qué tienes que construir o corregir, en términos concretos de GeoAPI — nunca un ejercicio abstracto de "implementa una función que sume dos números".
2. **Criterio de éxito.** Qué comando debes poder correr, y qué debe pasar exactamente al correrlo — casi siempre `cargo test` sobre un test específico que el propio ejercicio te pide escribir, a veces la salida exacta esperada de `cargo run`. Un ejercicio sin criterio de éxito verificable no es un ejercicio, es una sugerencia; este libro no los usa.
3. **Pista** (opcional, colapsada). Cuando un ejercicio tiene un paso no obvio, hay una pista oculta detrás de un desplegable como este:

<details>
<summary>Pista</summary>

Así se ven las pistas en este libro — ábrelas solo si llevas más de diez minutos atascado. Si abres la pista antes de intentarlo, el ejercicio deja de enseñarte lo que está diseñado para enseñarte.

</details>

La **solución de referencia nunca aparece junto al enunciado.** Vive en el apéndice de soluciones de ese módulo, al final del libro. Esto es deliberado: la solución a la vista invita a leerla en vez de intentar el ejercicio, y ese atajo es exactamente lo que este libro está diseñado para que no tomes. Si te atoras, la secuencia recomendada es: relee el capítulo → abre la pista → intenta de nuevo → solo entonces ve al apéndice.

Los proyectos guiados de cierre de módulo (las versiones de GeoAPI v0.1 a v1.0) son la excepción: se construyen paso a paso, en el propio capítulo, con checkpoints de compilación explícitos. Cada uno termina, sin embargo, con un **ejercicio integrador abierto** que sí sigue el formato de tres partes de arriba, y que deliberadamente no trae guía paso a paso — es la forma en que el libro verifica que entendiste el módulo y no solo que copiaste el código.

## Historias de usuario y casos de uso

A partir del Módulo 1, cada proyecto guiado de cierre (las versiones de GeoAPI v0.1 a v1.0) presenta sus checkpoints acompañados de dos artefactos que vienen de la ingeniería ágil de requisitos, no de Rust ni de GIS — vale la pena que sepas leerlos antes de encontrarlos la primera vez.

Una **historia de usuario** es una frase con una estructura fija: **"Como `<rol>`, quiero `<capacidad>`, para `<beneficio>`."** Su función es recordarte que ninguna técnica de este libro existe en el vacío — alguien concreto (un operador de sensores, una oficina de catastro, una aerolínea de drones) la necesita para un fin concreto. Un ejemplo trivial: *"Como operador de una flota de drones agrícolas, quiero que el sistema no se caiga al recibir una lectura GPS corrupta, para no perder el resto del lote de datos válidos."* Fíjate en la forma: el rol no es "un usuario" genérico, la capacidad es concreta y verificable, y el beneficio explica el *por qué* — sin el beneficio, la historia es solo una lista de tareas disfrazada.

Un **caso de uso** va un nivel más abajo cuando el flujo de interacción tiene más de un paso relevante y la historia de usuario sola no basta para verlo con claridad. Sigue una estructura igual de fija:

- **Actor(es):** quién o qué interactúa con el sistema (una persona, otro servicio, un proceso automatizado).
- **Precondición:** qué debe ser cierto antes de que el caso de uso pueda ocurrir.
- **Flujo principal:** los pasos, en orden, que llevan del inicio al resultado.
- **Resultado esperado:** qué es verdad al terminar, si todo salió bien.

No todos los checkpoints llevan caso de uso — solo aparece cuando el flujo de varios pasos aporta algo que la historia de usuario, por sí sola, no deja ver (por ejemplo, cuándo un sistema debe consultar una fuente de respaldo si la primera falla). Cuando la historia de usuario ya es autoexplicativa, no vas a encontrar un caso de uso forzado debajo — este libro no rellena estructura por rellenarla, la misma filosofía que ya viste en el formato de los ejercicios.

**Por qué el libro usa esto:** es la misma razón por la que GeoAPI existe como un solo hilo conductor en vez de ejemplos sueltos (Capítulo 1.1) — que cada técnica se sienta motivada por una necesidad real, no por el capricho de mostrar una sintaxis. La historia de usuario y el caso de uso son, para los proyectos guiados, lo que el enunciado de un ejercicio es para un ejercicio normal: el contexto que responde "¿por qué me importa esto?" antes de que aparezca una sola línea de código.

## Desarrollo dirigido por pruebas (TDD)

Los proyectos guiados de cierre de módulo (GeoAPI v0.1 a v1.0) están construidos, a partir de este punto, con la disciplina de **TDD** (*Test-Driven Development*): antes de escribir la implementación de un checkpoint, se escribe un test que la ejercite — un test que, sin esa implementación, falla. El ciclo tiene un nombre clásico y tres pasos:

1. **Rojo.** Escribes un test para un comportamiento que todavía no existe. Corre, y falla — eso confirma que el test de verdad está probando algo, no pasando por accidente.
2. **Verde.** Escribes el código mínimo necesario para que ese test pase. No más de lo necesario — resistir la tentación de adelantar trabajo de un checkpoint futuro es parte de la disciplina.
3. **Refactor.** Con el test en verde como red de seguridad, mejoras el código (nombres, estructura, duplicación) sin cambiar su comportamiento — si algo se rompe, el test lo dice de inmediato.

**Por qué importa para un checkpoint de GeoAPI en concreto:** el "criterio de éxito" que ya conoces de cada ejercicio (Convención 2, arriba) es exactamente lo que un test de TDD formaliza — una afirmación verificable de qué significa "funciona". Escribir esa afirmación *antes* que el código te obliga a decidir el contrato (¿qué entra? ¿qué sale? ¿qué pasa si la entrada es inválida?) antes de que el código te distraiga con los detalles de cómo construirlo. Es la misma razón por la que este libro nunca te ha dejado con un ejercicio sin criterio de éxito verificable — TDD es esa misma disciplina, aplicada al orden en que escribes las cosas, no solo a que las verifiques al final.

Vas a ver, en los checkpoints de los proyectos guiados, un test marcado explícitamente como el punto de partida de un checkpoint — inténtalo en el orden real: lee el test, confirma que entiendes qué comportamiento describe, y solo entonces mira (o escribe tú mismo) la implementación que lo hace pasar. Los capstones del Módulo Final llevan esto a su extremo lógico: el Capstone A (Capítulo 7.1) te da la suite de aceptación completa **antes** de que exista tu servidor — tu trabajo, literalmente, es hacerla pasar. Los Capstones B y C usan un criterio de aceptación distinto (un benchmark, una tabla de trazabilidad) porque no toda pregunta de ingeniería se responde mejor con un test — pero la disciplina de definir el criterio de éxito antes de perseguirlo es la misma.

## Versionado de los crates citados

Cada crate mencionado en este libro (`geo`, `sqlx`, `axum`, etc.) se cita con la versión mayor usada al momento de escribir el capítulo — por ejemplo, "`geo` 0.3x". El ecosistema de Rust en general, y el de GeoRust en particular, evoluciona rápido: es posible que para cuando leas esto exista una versión mayor más nueva con cambios de API. Antes de fijar una versión en el `Cargo.toml` de un proyecto real, verifica siempre la versión vigente en [crates.io](https://crates.io) — este libro te enseña los conceptos y los patrones de uso, que cambian mucho más despacio que los números de versión.
