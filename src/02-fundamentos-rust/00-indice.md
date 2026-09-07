# Parte II — Módulo 1: Fundamentos de Rust para Datos Espaciales

El vocabulario del lenguaje que vas a necesitar para todo lo que sigue: sintaxis básica desde cero, ownership y borrowing, `Result`/`Option` sin excepciones, traits y genéricos. Cierra con la primera versión de GeoAPI, un CLI sin geometrías todavía.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Leer y escribir Rust básico: variables, tipos primitivos, funciones, control de flujo, `struct`, `enum` y `match` — el vocabulario mínimo que el resto del libro da por asumido desde la primera línea de código.
- Explicar qué garantiza el *borrow checker* en tiempo de compilación y por qué eso importa específicamente al procesar datos geoespaciales no confiables (un Shapefile corrupto, un GeoJSON malformado).
- Manejar errores con `Result`/`Option` sin pánicos ni excepciones, propagando el error correcto en cada capa.
- Usar traits, genéricos e iteradores para escribir código que no sabe (ni necesita saber) el tipo concreto de geometría que está procesando.
- Ensamblar las cuatro piezas anteriores en un binario real: GeoAPI v0.1.

## Contexto: GeoAPI en este módulo

GeoAPI entra a este módulo sin existir y sale como un CLI mínimo — todavía sin geometrías, sin red, solo vocabulario del lenguaje aplicado a un problema real:

```text
CSV de coordenadas  --->  GeoAPI v0.1 (CLI)  --->  validación (Result<Coord, ErrorDominio>)
                          struct Coord { lat, lon }
```

## Prerrequisitos

Ninguno más allá de tener el *workspace* del Capítulo 1.2 ya funcionando. Este módulo asume cero experiencia previa en Rust — literalmente: el Capítulo 2.1 empieza por `let`.

## Capítulos de este módulo

- **2.1** Sintaxis básica de Rust I — variables, tipos y control de flujo
- **2.2** Sintaxis básica de Rust II — agrupar y representar datos
- **2.3** Ownership, borrowing y por qué importan en GIS
- **2.4** Result, Option y manejo de errores sin pánico
- **2.5** Traits, genéricos e iteradores
- **2.6** Proyecto guiado de cierre — GeoAPI v0.1
