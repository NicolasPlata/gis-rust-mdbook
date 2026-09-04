# 1.1 Introducción y mapa de la ruta

Imagina que trabajas en un equipo que tiene que responder preguntas como estas, en producción, con miles de peticiones por segundo:

- "¿Qué parcelas catastrales intersectan con esta zona de inundación?"
- "Dame las teselas vectoriales del centro de Bogotá al nivel de zoom 14."
- "¿Cuál es la pendiente promedio de este terreno, calculada a partir de un modelo digital de elevación de 40 GB alojado en la nube?"

Cada una de esas preguntas es, en el fondo, un endpoint HTTP. Y cada endpoint tiene que ser correcto (no puede devolver una intersección mal calculada), rápido (nadie espera 10 segundos por una tesela) y seguro en memoria (no puede tumbarse porque alguien mandó una geometría malformada). Ese es el problema que resuelve este libro: **cómo construir APIs geoespaciales de producción usando Rust.**

## Por qué Rust para GIS

El software GIS clásico —GDAL, GEOS, PostGIS— está escrito mayoritariamente en C y C++. Es rápido, pero es fácil escribir un `use-after-free` o un desbordamiento de búfer al procesar un archivo Shapefile corrupto que alguien subió por accidente. Los lenguajes con recolector de basura (Python, Java, Go) evitan ese problema, pero pagan un costo de rendimiento y de previsibilidad que se nota cuando procesas millones de vértices por segundo.

Rust ocupa un punto intermedio poco común: **da el control de memoria de C sin sus categorías de error más peligrosas**, gracias a un sistema de tipos que el compilador verifica antes de que el programa corra. Vas a sentir la fricción de ese sistema —se llama *borrow checker* y le vamos a dedicar un capítulo entero— pero esa fricción es el precio de eliminar en tiempo de compilación errores que en C solo aparecen cuando el servidor ya está en producción y algo se cae a las 3 a.m.

Este libro no te enseña Rust "en general" ni GIS "de escritorio" (no vamos a tocar QGIS ni ArcGIS como herramientas de usuario). Te enseña exactamente lo que necesitas para que un servidor HTTP escrito en Rust reciba, procese y devuelva datos geoespaciales de forma correcta, rápida y a prueba de fallos.

## El hilo conductor: GeoAPI

En vez de ejemplos aislados y desconectados, este libro construye **un solo proyecto que crece capítulo a capítulo**: **GeoAPI**. Empieza como un binario de línea de comandos que ni siquiera abre un socket de red, y termina como una plataforma de teselas y features geoespaciales, con persistencia en PostGIS, streaming de datasets de varios gigabytes, caché, observabilidad y un pipeline de despliegue continuo.

La razón de este enfoque es simple: en un libro de ejemplos sueltos, cada fragmento de código se olvida en cuanto pasas la página. En GeoAPI, cada capítulo se apoya literalmente en el código del capítulo anterior. Cuando en el Módulo 3 conectes tu índice espacial a PostGIS, vas a estar extendiendo el mismo crate de dominio que construiste en el Módulo 2, no reescribiéndolo desde cero. Esa continuidad es la que te va a dejar, al final del libro, con la intuición real de cómo encajan las piezas en un sistema vivo —no solo con una colección de snippets que compilan de forma aislada.

GeoAPI pasa por cinco versiones a lo largo del libro:

| Versión | Qué es | En qué capítulo aparece |
|---|---|---|
| **v0.1** | Un binario CLI que lee un CSV de coordenadas y valida que estén en rango — sin geometrías todavía, solo `struct Coord`. | Capítulo 2.4 |
| **v0.2** | El crate de dominio `geoapi-core`: geometrías reales (`Point`, `LineString`, `Polygon`), algoritmos puros (área, distancia, simplificación) y serialización GeoJSON/WKT. Sigue sin tocar la red. | Capítulo 3.5 |
| **v0.3** | El primer servidor HTTP con estado: inserta features en PostGIS, las indexa en memoria con un R\*-tree, y reproyecta bajo demanda. | Capítulo 4.7 |
| **v0.4** | Streaming cloud-native: sirve teselas vectoriales desde un archivo PMTiles en S3 y un subconjunto de un FlatGeobuf remoto de varios gigabytes, sin descargarlo completo. | Capítulo 5.7 |
| **v1.0** | La plataforma de producción: framework web definitivo (Axum), middleware de caché y rate-limiting, contrato MVT/OGC API Features, observabilidad y CI. | Capítulo 6.6 |

## Mapa del libro: módulo por módulo

Este libro está organizado en siete módulos. Cada uno corresponde, de forma exacta, a una fase de la ruta de aprendizaje que le dio origen. Si en algún punto quieres entender *por qué* el libro enseña algo en ese orden y no en otro, la respuesta siempre está en esa fase.

| Módulo del libro | Título | Fase de la ruta | Qué gana GeoAPI |
|---|---|---|---|
| 1.0 | Front Matter | — | El esqueleto del workspace y las convenciones de lectura |
| 2.0 | Fundamentos de Rust para Datos Espaciales | Fase 0 | Vocabulario del lenguaje: ownership, `Result`, traits, iteradores |
| 3.0 | Primitivas Geoespaciales Puras | Fase 1 | Geometrías reales, algoritmos core, serialización — nace `geoapi-core` |
| 4.0 | Índices, Robustez y Persistencia | Fase 2 | Topología robusta, índices espaciales, PostGIS — nace el primer servidor |
| 5.0 | Concurrencia, Cloud-Native y FFI Seguro | Fase 3 | Paralelismo con Rayon, formatos que streamean desde la nube, bindings seguros a GEOS |
| 6.0 | Arquitectura de APIs GIS de Producción | Fase 4 | Framework web definitivo, contratos estándar (MVT, OGC API Features), observabilidad |
| 7.0 | Proyectos Integrales (Capstones) | Integración | Tres proyectos finales que no enseñan nada nuevo — demuestran que todo lo anterior encaja |

Antes de empezar cada módulo intermedio (3.0 a 6.0) vas a resolver una **alta densidad de ejercicios**: entre 18 y 25 por módulo, más un ejercicio integrador que —a diferencia de los anteriores— no viene con una guía paso a paso. Esa es una decisión deliberada. Leer sobre un `trait` no es lo mismo que haber sentido al compilador rechazar tu código tres veces antes de entender por qué. Los ejercicios son la parte del libro donde ese aprendizaje realmente ocurre; no los saltes.

## Qué necesitas antes de empezar

Nada de experiencia previa en Rust. Sí ayuda (aunque no es obligatorio) haber usado antes algún SIG de escritorio como QGIS, o haber trabajado con GeoJSON en cualquier lenguaje — si nunca has visto un `Polygon` representado como una lista de coordenadas, el Capítulo 3.1 te lo explica desde cero, pero avanzarás más rápido si el concepto ya te resulta remotamente familiar.

Lo que sí necesitas es el entorno de trabajo listo. Eso es exactamente lo que construimos en el siguiente capítulo.
