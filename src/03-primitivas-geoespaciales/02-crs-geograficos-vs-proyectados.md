# 3.2 CRS geográficos vs. proyectados

Antes de seguir construyendo `geoapi-core`, hay una pregunta que todo endpoint de una API GIS tiene que responder tarde o temprano, y que si se responde mal produce bugs silenciosos y muy difíciles de detectar: **¿en qué sistema de referencia de coordenadas están estos números?**

Este capítulo es deliberadamente corto en código — la reproyección real (convertir de un sistema a otro con el crate `proj`) llega en el Capítulo 4.4. Aquí el objetivo es más importante que escribir código: que aprendas a **reconocer** el problema antes de que te sorprenda en producción.

## Qué es un CRS

Un **Sistema de Referencia de Coordenadas** (*Coordinate Reference System*, CRS) es el acuerdo que le da significado a un par de números como `(-74.07, 4.71)`. Sin ese acuerdo, esos dos números no son una ubicación en ningún lugar — son solo dos `f64` sueltos. `geo-types`, y esto es importante, **no almacena esa información**: un `Point<f64>` no sabe ni le importa en qué CRS están sus coordenadas. Esa responsabilidad es completamente tuya, como diseñador de la API. Vas a ver, a lo largo del libro, que llevar esa responsabilidad con disciplina (documentar qué CRS espera cada endpoint, validar que lo que llega tenga sentido en ese CRS) es tan importante como cualquier algoritmo geométrico.

Cada CRS se identifica casi siempre con un código **EPSG** — un catálogo mantenido por la industria petrolera europea que terminó convirtiéndose en el estándar de facto para todo el mundo GIS. Vas a usar dos constantemente en este libro:

- **EPSG:4326** — WGS84, el CRS geográfico usado por GPS, GeoJSON, y la inmensa mayoría de APIs públicas.
- **EPSG:3857** — Web Mercator, el CRS proyectado que usan Google Maps, OpenStreetMap y casi todo visor de mapas web para dibujar teselas.

## CRS geográficos: coordenadas angulares sobre una esfera (o elipsoide)

Un CRS **geográfico** como WGS84 (EPSG:4326) describe una posición como dos ángulos: **latitud** (cuántos grados al norte o sur del ecuador) y **longitud** (cuántos grados al este u oeste del meridiano de Greenwich). No son coordenadas cartesianas sobre un plano — son coordenadas angulares sobre una figura que aproxima la forma de la Tierra (un elipsoide, para ser precisos: la Tierra está ligeramente achatada en los polos).

Esto tiene una consecuencia práctica inmediata: **un grado de longitud no mide lo mismo en metros en el ecuador que cerca de un polo.** En el ecuador, un grado de longitud son aproximadamente 111 km. Cerca de los polos, los meridianos convergen y ese mismo grado de longitud mide casi 0 km. Un grado de latitud, en cambio, mide aproximadamente 111 km en cualquier parte del planeta — porque los paralelos de latitud están, a diferencia de los meridianos, espaciados de forma casi uniforme.

Esta asimetría es la razón concreta por la que **calcular un área o una distancia directamente sobre coordenadas geográficas, con la fórmula euclidiana simple que usamos como ejemplo mecánico en el Capítulo 3.1, da resultados incorrectos** — y el error crece cuanto más te alejas del ecuador o cuanto más grande es la geometría. Vas a resolver esto con fórmulas específicas para superficies esféricas (Haversine, Vincenty) en el Capítulo 3.3.

## CRS proyectados: coordenadas cartesianas, en metros

Un CRS **proyectado** aplica una transformación matemática (una *proyección cartográfica*) para "aplanar" la superficie curva de la Tierra sobre un plano, produciendo coordenadas cartesianas normales en metros (o pies, según el CRS). Esto es exactamente lo que necesitas para operaciones que asumen geometría euclidiana plana — como el cálculo de área o distancia con las fórmulas simples que ya conoces.

El más omnipresente en aplicaciones web es **Web Mercator (EPSG:3857)**. Casi todo mapa que ves en un navegador —Google Maps, Mapbox, Leaflet, OpenStreetMap— dibuja sus teselas en este CRS. Pero Web Mercator tiene una propiedad que hay que conocer para no pisar el error más famoso de la cartografía web:

**La proyección de Mercator preserva ángulos (es *conforme*), pero distorsiona brutalmente el área a medida que te alejas del ecuador.** Es la razón por la que en un mapa de Mercator, Groenlandia se ve casi tan grande como África, cuando en realidad África tiene un área aproximadamente 14 veces mayor. El factor de escala de Mercator crece con la latitud (matemáticamente, es proporcional a `1/cos(latitud)`), así que cerca de los polos las áreas aparecen exageradas de forma extrema — y de hecho, Mercator ni siquiera puede representar los polos, donde ese factor tiende a infinito.

**La regla práctica que vas a aplicar en GeoAPI: usa Web Mercator (u otro CRS proyectado apropiado para tu región, como una zona UTM) para dibujar teselas o hacer cálculos de distancia/área locales — nunca para reportar un área o distancia como resultado final de un cálculo si te importa que sea correcto.** Para eso, o usas fórmulas geodésicas sobre el CRS geográfico (Capítulo 3.3), o reproyectas a un CRS proyectado *apropiado para la región específica* que estés midiendo (Capítulo 4.4) — no a Web Mercator global, que está optimizado para verse bien en un mapa, no para medir con precisión.

## El error de los ejes invertidos

Hay una trampa adicional, puramente de convención, que produce bugs de forma constante en proyectos reales: **el orden de los ejes.**

En español (y en la mayoría de idiomas) decimos "latitud, longitud" — así memorizamos coordenadas de memoria ("Bogotá está en 4.71, -74.07"). Pero el estándar GeoJSON (RFC 7946), y por lo tanto `geo-types` cuando lo usas junto con `geojson` (Capítulo 3.4), exige el orden contrario: **longitud primero, latitud después** — es decir, `[x, y]`, donde `x` es longitud y `y` es latitud. Ya lo viste en el Capítulo 3.1 cuando construimos `Point::new(-74.0721, 4.7110)`: el primer argumento es la longitud.

Este desajuste entre la convención verbal ("lat, lon") y la convención del formato de intercambio ("lon, lat") es, en la experiencia colectiva de la comunidad GIS, una de las fuentes de bugs más comunes y a la vez más fáciles de prevenir: basta con validar el rango de cada valor. La latitud está matemáticamente acotada a `[-90, 90]`; la longitud, a `[-180, 180]`. Si ves un valor de `74.07` donde esperabas una latitud, algo está invertido — porque `74.07` sí es una latitud válida en teoría, pero para las coordenadas de Bogotá, ese número es la longitud (con el signo cambiado por el hemisferio occidental). El caso más fácil de detectar en código es cuando el valor está claramente fuera de rango para el eje que se supone que es: eso es justo lo que vas a implementar en el Ejercicio 2.

## Ejercicios

**Ejercicio 1 — Identificar el CRS correcto para un caso de uso.**
Para cada uno de los siguientes escenarios de GeoAPI, decide si deberías trabajar en un CRS geográfico (EPSG:4326) o en uno proyectado (y si es proyectado, si Web Mercator es aceptable o si hace falta uno específico de la región), y escribe una justificación de dos o tres líneas para cada uno:

1. Recibir y almacenar la ubicación de un `Feature` que llega por `POST /features` en formato GeoJSON.
2. Calcular el área en metros cuadrados de un polígono que representa una parcela catastral en Bogotá.
3. Dibujar teselas vectoriales para un visor de mapas en el navegador (Capítulo 6.3).
4. Calcular la distancia real en kilómetros entre dos ciudades para mostrarla en la respuesta de un endpoint.

*Criterio de éxito:* tienes una respuesta justificada para cada escenario; para el escenario 2, tu justificación debe explicar por qué Web Mercator sería una mala elección incluso siendo un CRS proyectado (pista: la distorsión de Mercator no es uniforme — depende de la latitud del lugar).

**Ejercicio 2 — Detectar un bbox con ejes invertidos.**
Escribe una función que reciba un *bounding box* como cuatro `f64` (`min_x, min_y, max_x, max_y`, en la convención GeoJSON) y devuelva un `Result` indicando si los valores son geográficamente plausibles, o si parecen tener los ejes de latitud/longitud invertidos.

```rust,ignore
#[derive(Debug, PartialEq)]
enum ProblemaBbox {
    EjesProbablementeInvertidos,
    ValoresFueraDeRango,
}

fn validar_bbox_geografico(min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Result<(), ProblemaBbox> {
    // Tu implementación: usa los rangos válidos de longitud ([-180, 180])
    // y latitud ([-90, 90]) para decidir. Pista: si algún valor de "x"
    // (que debería ser longitud) está fuera de [-180, 180] pero SÍ es un
    // valor plausible de latitud (dentro de [-90, 90]), y lo mismo al
    // revés para "y", es una fuerte señal de ejes invertidos.
    todo!()
}
```

*Criterio de éxito:* `validar_bbox_geografico(-75.56, 4.71, -74.07, 6.25)` (orden correcto, `x` = longitud) devuelve `Ok(())`; `validar_bbox_geografico(4.71, -75.56, 6.25, -74.07)` (ejes invertidos: el primer valor es una latitud puesta donde va la longitud) devuelve `Err(ProblemaBbox::EjesProbablementeInvertidos)`.

**Ejercicio 3 — Justificar por qué EPSG:3857 distorsiona área.**
Sin escribir código: investiga (o deriva, si ya conoces algo de trigonometría) la fórmula del factor de escala de la proyección de Mercator en función de la latitud, y escribe una explicación de un párrafo sobre por qué ese factor implica que un mismo número de píxeles cuadrados en un mapa de Web Mercator representa áreas reales muy distintas cerca del ecuador que cerca de los polos. Menciona explícitamente qué le pasa al factor de escala cuando la latitud se acerca a 90°.

*Criterio de éxito:* tu explicación identifica correctamente que el factor de escala es proporcional a `1/cos(latitud)`, y que por eso tiende a infinito cuando la latitud se acerca a los polos — que es la razón matemática exacta por la que Mercator no puede representarlos.
