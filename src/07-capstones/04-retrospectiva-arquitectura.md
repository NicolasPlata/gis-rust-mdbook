# 7.4 Cierre del libro — Retrospectiva de arquitectura

El Capítulo 1.1 abrió este libro con una promesa: que no ibas a acumular una colección de fragmentos de código sueltos, sino a construir un solo hilo conductor — GeoAPI — donde cada pieza nueva se apoya en las anteriores. Los tres capstones que acabas de leer son la prueba final de esa promesa, y este capítulo cierra el hilo mostrando exactamente dónde.

## Los tres capstones, un solo vocabulario de dominio

Ninguno de los tres capstones se presentó como una extensión literal del workspace `geoapi` que empezaste en el Capítulo 1.2 — cada uno es, a propósito, un sistema independiente, para que la tabla de trazabilidad de cada uno pudiera señalar con precisión de qué capítulo viene cada pieza sin el ruido de un *codebase* compartido creciendo de fondo. Pero mira de cerca el tipo de dato con el que empieza cada uno:

| Capstone | Tipo de geometría que usa | Operación de dominio central |
|---|---|---|
| A — Teselas vectoriales | `geo_types::Geometry`/`Point` | Filtrado espacial (`ST_Intersects`) + codificación MVT |
| B — Analítica GeoParquet | `geo_types::Point` (vía `geoarrow`) | Agregación zonal (conteo, suma, promedio) |
| C — LiDAR COPC | Puntos LiDAR (`las`) + `geo_types` para el área de interés | Reproyección + validación geométrica |

Es el mismo `geo_types::Geometry<f64>` que envolviste en `geoapi-core` en el Capítulo 3.5 — las mismas geometrías, la misma disciplina de serialización GeoJSON, el mismo criterio de "nunca asumas que un predicado es exacto sin verificarlo" que aprendiste con DE-9IM (4.1) y los predicados robustos (4.2), y que volviste a encontrarte de frente en el Capítulo 7.2 cuando el *pushdown* de GeoParquet resultó no ser el filtro exacto que parecía. No es coincidencia: es que hay un solo vocabulario geoespacial en todo este libro, y los tres capstones lo hablan aunque no compartan un `Cargo.toml`.

**Si volvieras ahora sobre cualquiera de los tres capstones y reemplazaras su manejo manual de geometrías por una dependencia directa a `geoapi-core`**, el comportamiento no cambiaría en nada — solo eliminarías código duplicado. Esa es, exactamente, la razón de ser de un crate de dominio: que "el sistema nuevo que construyo esta semana" y "el sistema nuevo que construí hace tres capítulos" puedan compartir la misma noción de qué es un punto, un polígono, y una operación válida sobre ellos.

## Lo que se quedó deliberadamente fuera de `geoapi-core`

El Capstone C necesitó algo que ninguno de los otros dos necesitó: un *binding* FFI a GEOS para una validación geométrica que `geo`/`geo-types` no ofrece (Capítulo 5.6). Vale la pena notar dónde vive esa pieza y por qué: **no** en `geoapi-core`, sino en la capa de API del capstone que la necesita.

Esa separación no es casualidad — es la decisión que tomaste explícitamente en el Capítulo 3.5, y que el Capítulo 6.5 verificó de verdad: `geoapi-core` compila a WebAssembly (`wasm32-unknown-unknown`) sin cambiar una sola línea, produciendo un `.wasm` de 9.573 bytes que corre en Node/V8 con el resultado numérico exacto que esperabas. Eso solo es posible porque `geoapi-core` nunca adquirió una dependencia FFI — ni GEOS, ni GDAL, ni PROJ viven ahí. Si el Capstone C hubiera metido su wrapper de GEOS dentro de `geoapi-core` "porque ya estaba ahí", habría roto silenciosamente esa propiedad para los otros dos capstones y para cualquier cliente WebAssembly futuro que dependiera del mismo crate. Mantener una pieza FFI en la capa que realmente la necesita, y no en el dominio compartido, es la misma disciplina de separación de responsabilidades que ya viste con `geoapi-db` en el Capítulo 1.2: el dominio no sabe que PostGIS existe; tampoco tiene por qué saber que GEOS existe.

## El hilo cerrado

Empezaste este libro sin haber tocado Rust. Terminas con tres sistemas de producción — un servidor de teselas cloud-native, una API analítica que procesa un millón de features en paralelo, y una plataforma de streaming LiDAR con FFI seguro — que comparten, sin haberlo forzado, el mismo vocabulario de dominio que escribiste en el Capítulo 3.5 con apenas un puñado de funciones puras. Esa es la arquitectura que este libro quiso enseñarte desde la Introducción: no una lista de crates que existen, sino cómo decidir qué vive en el centro de un sistema (el dominio, sin dependencias externas) y qué vive en los bordes (persistencia, red, FFI) — y por qué esa frontera, bien trazada una sola vez en el Capítulo 3.5, sigue pagando dividendos tres módulos después, en sistemas que ni siquiera comparten un repositorio.
