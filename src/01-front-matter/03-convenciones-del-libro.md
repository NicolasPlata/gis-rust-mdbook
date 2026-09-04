# 1.3 Convenciones del libro

Antes de entrar en materia, tres convenciones cortas que vas a ver repetidas en cada capítulo.

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

## Versionado de los crates citados

Cada crate mencionado en este libro (`geo`, `sqlx`, `axum`, etc.) se cita con la versión mayor usada al momento de escribir el capítulo — por ejemplo, "`geo` 0.3x". El ecosistema de Rust en general, y el de GeoRust en particular, evoluciona rápido: es posible que para cuando leas esto exista una versión mayor más nueva con cambios de API. Antes de fijar una versión en el `Cargo.toml` de un proyecto real, verifica siempre la versión vigente en [crates.io](https://crates.io) — este libro te enseña los conceptos y los patrones de uso, que cambian mucho más despacio que los números de versión.
