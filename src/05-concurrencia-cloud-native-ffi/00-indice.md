# Parte V — Módulo 4: Concurrencia, Cloud-Native y FFI Seguro

Paralelismo de datos con Rayon, los formatos que streamean directamente desde almacenamiento de objetos (FlatGeobuf, COG, PMTiles, GeoParquet, COPC), y cómo envolver una librería C como GEOS sin comprometer la seguridad de memoria de Rust.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Paralelizar una operación geoespacial con Rayon eligiendo la granularidad de tarea correcta, en vez de asumir lo que dice la documentación de una API paralela sin medirlo.
- Servir un subconjunto de un archivo FlatGeobuf remoto de varios gigabytes vía HTTP Range Requests, sin descargarlo completo.
- Explicar qué hace "cloud-optimizado" a un GeoTIFF (COG), y leer solo la ventana de píxeles que necesitas.
- Elegir entre PMTiles y GeoParquet según la escala real de tus datos, no según cuál "suena" más moderno.
- Leer una nube de puntos LiDAR en formato COPC por niveles de detalle, sin cargarla completa en memoria.
- Envolver una librería C (GEOS) en un wrapper seguro, entendiendo exactamente qué invariante de memoria estás garantizando tú y cuál garantiza el compilador.

## Contexto: GeoAPI en este módulo

GeoAPI entra a este módulo como un servidor con estado (v0.3, PostGIS + índice en memoria) y sale como una plataforma que streamea directamente desde almacenamiento de objetos, sin necesitar descargar datasets completos:

```text
cliente
   │
   v
GeoAPI v0.4
   │
   ├──> PMTiles en S3              (teselas pre-renderizadas, 5.4)
   ├──> FlatGeobuf remoto (Range)  (subconjunto bajo demanda, 5.2)
   └──> Rayon                      (paralelismo en memoria, 5.1)
```

## Prerrequisitos

El servidor v0.3 completo (Módulo 3) — este módulo le añade capacidades cloud-native, no lo reemplaza. También asume que ya sabes por qué `Result` y el ownership importan (Módulo 1): el código FFI de este módulo es exactamente donde esas garantías se ponen a prueba.

## Capítulos de este módulo

- **5.1** Paralelismo de datos con Rayon
- **5.2** FlatGeobuf y HTTP Range Requests
- **5.3** Cloud-Optimized GeoTIFF (COG)
- **5.4** PMTiles v3 y GeoParquet/GeoArrow
- **5.5** COPC y streaming de nubes de puntos
- **5.6** FFI seguro — el patrón `-sys` + wrapper, y `geos`
- **5.7** Proyecto guiado de cierre — GeoAPI v0.4
