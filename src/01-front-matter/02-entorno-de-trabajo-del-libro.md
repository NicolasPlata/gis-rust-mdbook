# 1.2 Entorno de trabajo del libro

Antes de escribir una sola línea de geometría, necesitas dos cosas: el compilador de Rust instalado, y el esqueleto de proyecto que vas a ir llenando durante el resto del libro. Este capítulo construye ambas.

## Instalar Rust

Rust se instala con `rustup`, un instalador de toolchains que además gestiona actualizaciones y versiones múltiples. En Linux y macOS:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

En Windows, descarga y ejecuta `rustup-init.exe` desde [rustup.rs](https://rustup.rs). Sea cual sea tu sistema operativo, al terminar la instalación abre una terminal nueva y verifica:

```sh
rustc --version
cargo --version
```

Deberías ver algo como `rustc 1.8x.0` y `cargo 1.8x.0`. Si los números de versión difieren de los que veas en pantallazos de este libro, no te preocupes — el lenguaje mantiene compatibilidad hacia atrás de forma muy estricta. Todo el código de este libro funciona en cualquier versión reciente del canal *stable*.

`cargo` es la herramienta que vas a usar constantemente. No es solo un compilador — es gestor de dependencias, ejecutor de tests, y generador de documentación, todo en una sola CLI. Los comandos que más vas a repetir en este libro:

| Comando | Qué hace |
|---|---|
| `cargo new nombre` | Crea un proyecto nuevo (binario, por defecto) |
| `cargo new --lib nombre` | Crea un proyecto nuevo de tipo librería |
| `cargo build` | Compila el proyecto |
| `cargo run` | Compila y ejecuta el binario |
| `cargo test` | Corre los tests del proyecto |
| `cargo check` | Verifica que el código compile, sin generar el binario final (mucho más rápido que `build` mientras iteras) |

## Por qué un workspace multi-crate

Podríamos empezar con un único `cargo new geoapi` y meter ahí toda la lógica del libro. No lo vamos a hacer, y la razón importa: **una API GIS real casi nunca vive en un solo crate.**

Piensa en las tres responsabilidades que GeoAPI va a tener que cumplir a lo largo del libro:

1. **Lógica de dominio pura** — qué es un `Polygon`, cómo se calcula su área, cómo se simplifica. Esta lógica no sabe nada de HTTP ni de bases de datos. Es la misma si la llamas desde un servidor web, desde un test, o (en el Capítulo 6.5) desde WebAssembly en un navegador.
2. **Transporte HTTP** — recibir un request, parsear query params, devolver un `200` con un cuerpo JSON o un `400` si la geometría venía inválida.
3. **Persistencia** — hablar con PostGIS: insertar features, correr consultas espaciales, manejar el *pool* de conexiones.

Si mezclas las tres en un solo crate, terminas con un problema muy concreto: para testear que el cálculo de área de un `Polygon` es correcto, tu test tiene que compilar (aunque sea sin ejecutar) todo el código de Axum y de SQLx. Cada iteración de "cambio una línea, corro los tests" se vuelve más lenta según crece el proyecto. Peor aún: nada te impide, por accidente, llamar a una función de base de datos directamente desde el módulo de geometría — y ese acoplamiento se vuelve muy caro de deshacer seis meses después.

Un **Cargo workspace** resuelve esto sin renunciar a nada: varios crates comparten un mismo `Cargo.lock` (así todos usan exactamente las mismas versiones de cada dependencia) y se compilan de forma incremental, pero cada uno declara sus propias dependencias y puede compilarse — y testearse — por separado. El crate de dominio no depende de Axum ni de SQLx; son ellos los que dependen de él.

Este es el mismo patrón que vas a ver en el mundo real bajo el nombre de **arquitectura hexagonal** o **patrón repository**: el dominio en el centro, sin dependencias externas; los adaptadores (HTTP, base de datos) alrededor, dependiendo del dominio y no al revés. Lo vamos a nombrar explícitamente otra vez cuando lleguemos a PostGIS en el Capítulo 4.5 — ahí es donde este diseño paga dividendos de verdad.

## Construir el workspace

Crea una carpeta para el proyecto y, dentro, un `Cargo.toml` de workspace — este archivo no compila nada por sí mismo, solo declara qué crates conviven en el proyecto:

```sh
mkdir geoapi && cd geoapi
```

```toml
# Cargo.toml (raíz del workspace)
[workspace]
resolver = "2"
members = [
    "geoapi-core",
    "geoapi-api",
    "geoapi-db",
]
```

`resolver = "2"` activa el resolutor de dependencias moderno de Cargo — evita que features de una dependencia se filtren entre crates del workspace que no las pidieron. En cualquier workspace nuevo, actívalo siempre.

Ahora crea los tres miembros:

```sh
cargo new --lib geoapi-core
cargo new --bin geoapi-api
cargo new --lib geoapi-db
```

- **`geoapi-core`** — librería. Aquí vive todo lo que construyes en el Módulo 2 (Capítulos 3.1–3.5): tipos geométricos, algoritmos, serialización. Sin `async`, sin red, sin SQL. Este es el crate que en el Capítulo 6.5 vas a poder compilar a WebAssembly casi sin cambios, precisamente *porque* nunca dependió de nada específico de un servidor.
- **`geoapi-api`** — binario. Es el punto de entrada del programa. En el Capítulo 2.4 va a ser un CLI de unas 40 líneas que lee un CSV. En el Capítulo 4.7 el mismo crate va a convertirse en un servidor HTTP. El nombre no cambia porque su rol tampoco cambia: es la capa que expone GeoAPI al mundo exterior, sea por terminal o por HTTP.
- **`geoapi-db`** — librería. Se queda vacía hasta el Capítulo 4.5. Cuando la necesites, va a contener exclusivamente el código que sabe hablar con PostGIS — consultas SQL, mapeo de filas a tipos de `geoapi-core`, el *pool* de conexiones. Ni `geoapi-core` ni la lógica de negocio del CLI/servidor van a saber que PostGIS existe.

Tu árbol de archivos debería verse así:

```text
geoapi/
├── Cargo.toml          <- Cargo.toml de workspace (lo escribiste a mano)
├── geoapi-core/
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
├── geoapi-api/
│   ├── Cargo.toml
│   └── src/
│       └── main.rs
└── geoapi-db/
    ├── Cargo.toml
    └── src/
        └── lib.rs
```

## Verificar que todo compila

Desde la raíz del workspace (donde está el `Cargo.toml` que escribiste a mano):

```sh
cargo build
```

Cargo va a compilar los tres crates en una sola pasada y crear un único `target/` compartido en la raíz — otra ventaja del workspace: no hay tres carpetas `target/` duplicando artefactos de compilación. Deberías ver algo como:

```text
   Compiling geoapi-core v0.1.0 (/ruta/a/geoapi/geoapi-core)
   Compiling geoapi-db v0.1.0 (/ruta/a/geoapi/geoapi-db)
   Compiling geoapi-api v0.1.0 (/ruta/a/geoapi/geoapi-api)
    Finished dev [unoptimized + debuginfo] target(s) in 0.9s
```

Si ves ese `Finished` sin errores, tu entorno de trabajo está listo. `geoapi-api/src/main.rs` todavía trae el `"Hello, world!"` que genera `cargo new` por defecto — lo vamos a reemplazar en el Capítulo 2.4, cuando tengamos el vocabulario de Rust (`Result`, structs, parseo) para escribir el CLI real de GeoAPI v0.1.

**Criterio de avance:** puedes borrar la carpeta `geoapi/` y reconstruirla desde cero, solo con los comandos de este capítulo, sin consultar nada más.
