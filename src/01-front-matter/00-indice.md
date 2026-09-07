# Parte I — Front Matter y Configuración del Proyecto-Libro

El esqueleto del workspace y las convenciones de lectura del libro: qué vas a construir, por qué está organizado así, y cómo dejar tu entorno listo antes del primer capítulo con código real.

## Objetivos de aprendizaje

Al terminar esta parte vas a poder:

- Explicar por qué este libro enseña con un solo proyecto progresivo (GeoAPI) en vez de ejemplos sueltos, y qué versión de GeoAPI te espera en cada módulo.
- Dejar un *workspace* de Cargo multi-crate funcionando localmente, listo para el Capítulo 2.1.
- Reconocer las convenciones del libro (bloques ` ```rust,ignore ` para código con dependencias externas, ejercicios con solución colapsada, el hilo GeoAPI) antes de que aparezcan por primera vez en contexto.

## Contexto: GeoAPI en esta parte

GeoAPI todavía no existe como código — esta parte es exclusivamente la preparación del terreno. Al cerrarla, vas a tener el esqueleto vacío del *workspace* que vas a llenar en el resto del libro:

```text
geoapi/                    (workspace de Cargo)
├── geoapi-core/            <- vacío hasta el Capítulo 3.5 (Módulo 2)
├── geoapi-api/              <- "Hello, world!" hasta el Capítulo 2.6 (Módulo 1)
└── geoapi-db/               <- vacío hasta el Capítulo 4.5 (Módulo 3)
```

## Prerrequisitos

Ninguno. Esta es la puerta de entrada del libro — no necesitas haber tocado Rust nunca.

## Capítulos de esta parte

- **1.1** Introducción y mapa de la ruta
- **1.2** Entorno de trabajo del libro
- **1.3** Convenciones del libro
