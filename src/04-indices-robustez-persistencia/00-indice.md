# Parte IV — Módulo 3: Índices, Robustez y Persistencia (Primer Servidor)

Topología robusta (DE-9IM, predicados exactos), índices espaciales en memoria, reproyección, y persistencia real en PostGIS. Aquí nace el primer servidor con estado de GeoAPI.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Razonar sobre relaciones topológicas (¿se tocan? ¿se solapan? ¿una contiene a la otra?) con el modelo DE-9IM, en vez de heurísticas ad-hoc.
- Elegir el predicado exacto correcto cuando la aritmética de punto flotante ingenua da resultados incorrectos en casos casi-degenerados.
- Elegir el índice espacial correcto (`rstar`, `geo-index`, `h3o`) según si tus datos cambian en caliente o no.
- Reproyectar coordenadas entre sistemas de referencia con `proj`, sabiendo qué precisión estás ganando o perdiendo.
- Persistir y consultar geometrías en PostGIS desde Rust, vía SQLx, con una consulta espacial real (no un `SELECT *` seguido de filtrado en memoria).
- Levantar el primer servidor HTTP con estado de GeoAPI (v0.3), combinando todo lo anterior.

## Contexto: GeoAPI en este módulo

GeoAPI entra a este módulo como una biblioteca pura (`geoapi-core`, v0.2) y sale siendo, por primera vez, **un servicio que escucha peticiones**:

```text
petición HTTP
      │
      v
GeoAPI v0.3 (axum mínimo)
      │
      ├──> índice rstar en memoria   (features editables, 4.3)
      └──> PostGIS vía SQLx          (persistencia real, 4.5)
                │
                v
          geoapi-core (geometrías, 3.x)
```

## Prerrequisitos

`geoapi-core` completo (Módulo 2) — este módulo lo extiende directamente, nunca lo reescribe. También ayuda haber interiorizado por qué `Result` importa (2.4): las consultas a PostGIS y las reproyecciones fallan de formas muy concretas que vas a tener que propagar bien.

## Capítulos de este módulo

- **4.1** DE-9IM y el trait Relate
- **4.2** Predicados exactos con robust
- **4.3** Índices espaciales — rstar, geo-index, h3o
- **4.4** Reproyección con proj
- **4.5** Persistencia con PostGIS — SQLx y Diesel
- **4.6** I/O adicional — gdal, ndarray, shapefile, las
- **4.7** Proyecto guiado de cierre — GeoAPI v0.3
