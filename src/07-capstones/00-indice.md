# Parte VII — Módulo Final: Proyectos Integrales (Capstones)

Tres proyectos que no enseñan nada nuevo — demuestran que todo lo anterior encaja en un sistema real. Cada uno cambia el criterio de aceptación: una suite de tests, un benchmark, o una tabla de trazabilidad que tú mismo completas.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Ensamblar piezas de distintos módulos (dominio, persistencia, streaming, FFI, arquitectura de producción) en un sistema coherente, sin guía paso a paso.
- Verificar tu propio trabajo contra un criterio de aceptación externo — una suite de tests, un benchmark reproducible, o una tabla de trazabilidad honesta — en vez de "se ve bien".
- Reconocer, en retrospectiva, qué tan reutilizable resultó el crate de dominio (`geoapi-core`) que separaste del resto del sistema desde el Capítulo 3.5.

## Contexto: GeoAPI en este módulo

GeoAPI v1.0 (Módulo 5) fue la última versión de un solo proyecto continuo. Este módulo lo bifurca en tres sistemas independientes, cada uno con un contrato de aceptación distinto, todos hablando el mismo vocabulario de dominio:

```text
                    geoapi-core (Capítulo 3.5)
                    geometrías + algoritmos puros
                            │
        ┌───────────────────┼───────────────────┐
        v                    v                    v
  Capstone A            Capstone B            Capstone C
  teselas MVT          analítica            LiDAR COPC
  (7.1)                GeoParquet (7.2)     + FFI GEOS (7.3)
  test suite            benchmark            trazabilidad
```

## Prerrequisitos

Todo lo anterior. Este módulo no introduce teoría nueva — si un capstone te resulta genuinamente difícil, la tabla de trazabilidad de cada capítulo te dice exactamente a qué capítulo previo volver.

## Capítulos de este módulo

- **7.1** Capstone A — Servidor de teselas vectoriales cloud-native
- **7.2** Capstone B — API analítica sobre GeoParquet a escala
- **7.3** Capstone C — Plataforma LiDAR con streaming COPC
- **7.4** Cierre del libro — Retrospectiva de arquitectura
