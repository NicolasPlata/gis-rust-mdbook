# Parte III — Módulo 2: Primitivas Geoespaciales Puras (geo / geo-types)

Geometrías reales, algoritmos core (área, distancia, simplificación) y serialización GeoJSON/WKT — sin tocar la red todavía. Aquí nace `geoapi-core`, el crate de dominio que el resto del libro va a extender, nunca reescribir.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Modelar geometrías reales (`Point`, `LineString`, `Polygon`) siguiendo el estándar OGC Simple Features, en vez de estructuras de datos improvisadas.
- Distinguir cuándo un CRS geográfico y uno proyectado dan resultados distintos para la misma operación (área, distancia) — y reconocer casos de borde reales como el cruce del antimeridiano.
- Usar los algoritmos core de `geo` (área, distancia, simplificación) con la confianza de haberlos verificado tú mismo con *property-based testing*, no solo con un par de casos de ejemplo.
- Serializar y deserializar GeoJSON/WKT de forma robusta, incluyendo geometrías "legacy" con el *winding order* invertido.
- Empaquetar todo lo anterior en `geoapi-core`, un crate de dominio sin `async`, sin red y sin SQL.

## Contexto: GeoAPI en este módulo

GeoAPI entra a este módulo como un CLI sin geometrías (v0.1) y sale con un crate de dominio real, completamente aislado de la red:

```text
geoapi-core/
├── Geometry (Point, LineString, Polygon...)   <- 3.1
├── CRS geográfico vs. proyectado               <- 3.2
├── algoritmos puros (área, distancia...)       <- 3.3
└── serialización (GeoJSON, WKT/WKB)            <- 3.4

                    (sin async, sin red, sin SQL)
```

## Prerrequisitos

Ownership/borrowing (2.3), `Result`/`Option` (2.4) y traits/genéricos (2.5) — este módulo los usa constantemente, ya sin volver a explicarlos.

## Capítulos de este módulo

- **3.1** Modelo OGC Simple Features en Rust
- **3.2** CRS geográficos vs. proyectados
- **3.3** geo — algoritmos core (área, distancia, simplificación)
- **3.4** Serialización — GeoJSON, WKT/WKB
- **3.5** Proyecto guiado de cierre — GeoAPI v0.2
