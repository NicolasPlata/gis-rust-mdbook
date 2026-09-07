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

Este desajuste entre la convención verbal ("lat, lon") y la convención del formato de intercambio ("lon, lat") es, en la experiencia colectiva de la comunidad GIS, una de las fuentes de bugs más comunes. Una forma de detectarlo en código es validar el rango de cada valor: la latitud está matemáticamente acotada a `[-90, 90]`; la longitud, a `[-180, 180]`. Si un valor que debería ser una longitud aparece fuera de `[-180, 180]` pero sí es válido como latitud (o viceversa), es una señal clara de ejes invertidos — eso es justo lo que vas a implementar en el Ejercicio 2.

**Pero ojo con los límites de este heurístico:** solo funciona cuando el valor de longitud tiene una magnitud mayor a 90°. Para una ciudad como Tokio (longitud ≈ 139.69°), invertir los ejes es fácil de detectar, porque `139.69` no es una latitud válida. Para Bogotá (longitud ≈ -74.07°), el heurístico **no sirve**: `-74.07` es simultáneamente una longitud válida y una latitud válida, así que un bbox con los ejes invertidos alrededor de Bogotá pasa la validación de rangos sin que nada la distinga del bbox correcto. Esto no es un defecto de tu implementación — es una limitación real de cualquier validación que dependa solo de rangos numéricos. Detectarlo con certeza en esos casos requiere información adicional que el rango por sí solo no tiene, como una región geográfica esperada para tu dataset (si tu API solo sirve datos de Colombia, puedes validar contra el bbox aproximado del país, no contra `[-90,90]`/`[-180,180]` genéricos).

## El antimeridiano y los polos: cuando "menor que" deja de servir

Hay dos regiones del planeta donde la aritmética ingenua sobre longitud/latitud se rompe de formas que no tienen nada que ver con los ejes invertidos de la sección anterior — y que un endpoint de producción tarde o temprano va a recibir como entrada real, no como caso de examen.

**El antimeridiano** es la línea de longitud ±180°, el lado opuesto del planeta respecto al meridiano de Greenwich — pasa, casi exactamente, por el estrecho de Bering, entre Rusia y Alaska. El problema: toda la aritmética de *bounding box* que has visto hasta ahora asume que `min_x <= max_x`. Un bbox real que cubra el estrecho de Bering, sin embargo, tiene que expresarse como `min_x = 170` (cerca de Chukotka, Rusia) y `max_x = -169` (cerca de Alaska) — porque el camino más corto entre esas dos longitudes *cruza* ±180°, no pasa por el meridiano de Greenwich. Con ese bbox, `min_x <= max_x` es **falso** (`170 <= -169` es falso), así que cualquier prueba de intersección que asuma esa desigualdad falla exactamente donde más importa: en la propia región que el bbox describe.

Esto no es una posibilidad remota — es una función real de dos bboxes:

```rust,ignore
struct Bbox { min_x: f64, min_y: f64, max_x: f64, max_y: f64 }

// Intersección "ingenua": correcta para el 99% de los bboxes del planeta,
// y silenciosamente incorrecta para el 1% que cruza el antimeridiano.
fn intersectan_simple(a: &Bbox, b: &Bbox) -> bool {
    a.min_x <= b.max_x && a.max_x >= b.min_x && a.min_y <= b.max_y && a.max_y >= b.min_y
}
```

Verificado con un bbox real del estrecho de Bering (`min_x: 170.0, max_x: -169.0`) contra un punto genuinamente dentro de él, en Alaska (`-170.5, 65.0`):

```text
punto en Alaska (-170.5,65.0): intersección ingenua = false, intersección correcta = true
punto en Chukotka (178,65.0): intersección ingenua = false, intersección correcta = true
```

`intersectan_simple` reporta **falso negativo** para un punto que está, sin ambigüedad, dentro del bbox — el tipo de bug que no se manifiesta en una prueba con datos de Bogotá o de cualquier ciudad que no cruce ±180°, y que por eso sobrevive sin detectarse hasta que un dataset real (una ruta marítima, una zona económica exclusiva, un límite administrativo de Rusia o de las islas Aleutianas) lo expone en producción.

**La técnica manual de solución — no hay una función de una línea en `geo` para esto:** detectar el cruce (`min_x > max_x`) y **dividir el bbox en dos bboxes normales**, uno pegado a `+180` y otro pegado a `-180`, antes de aplicar cualquier prueba de intersección estándar sobre cada combinación de partes:

```rust,ignore
fn cruza_antimeridiano(b: &Bbox) -> bool {
    b.min_x > b.max_x
}

fn dividir_en_antimeridiano(b: &Bbox) -> Vec<Bbox> {
    if !cruza_antimeridiano(b) {
        return vec![*b];
    }
    vec![
        Bbox { min_x: b.min_x, min_y: b.min_y, max_x: 180.0, max_y: b.max_y },
        Bbox { min_x: -180.0, min_y: b.min_y, max_x: b.max_x, max_y: b.max_y },
    ]
}

fn intersectan(a: &Bbox, b: &Bbox) -> bool {
    let partes_a = dividir_en_antimeridiano(a);
    let partes_b = dividir_en_antimeridiano(b);
    partes_a.iter().any(|pa| partes_b.iter().any(|pb| intersectan_simple(pa, pb)))
}
```

Esta misma idea —dividir en el antimeridiano antes de operar— es la que usan por debajo herramientas maduras como GDAL cuando reproyectas con la opción `wrapdateline` (Capítulo 4.6): para un **polígono** completo (no solo un bbox) la división es geométricamente más compleja, porque hay que insertar vértices nuevos exactamente donde cada arista cruza ±180°, no solo comparar cuatro números. Este libro no implementa esa versión completa — reconocer el problema y saber que la solución existe (y dónde buscarla) es, a este nivel, más valioso que reimplementar el algoritmo de GDAL desde cero.

**Los polos** son un problema relacionado pero distinto: en el Polo Norte o el Polo Sur, *todas* las longitudes convergen en un único punto. Un bbox "alrededor" del Polo Norte no tiene un `min_x`/`max_x` que tengan sentido — cualquier longitud, de `-180` a `180`, describe una línea que pasa exactamente por ese punto. Si tu API necesita representar una región que incluye un polo, la salida práctica es dejar de pensar en longitud/latitud para ese caso: usa una proyección polar específica (una proyección azimutal, por ejemplo) donde el polo es un punto normal del plano, no una singularidad de las coordenadas geográficas.

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

*Criterio de éxito:* `validar_bbox_geografico(139.0, 35.0, 140.0, 36.0)` (bbox alrededor de Tokio, orden correcto) devuelve `Ok(())`; `validar_bbox_geografico(35.0, 139.0, 36.0, 140.0)` (mismos valores con los ejes invertidos) devuelve `Err(ProblemaBbox::EjesProbablementeInvertidos)`. Además, prueba tu función con un bbox alrededor de Bogotá (`-75.56, 4.71, -74.07, 6.25`) **y** su versión con ejes invertidos (`4.71, -75.56, 6.25, -74.07`) — confirma que tu heurístico devuelve `Ok(())` para *ambas* llamadas, y explica en un comentario por qué eso es exactamente el comportamiento esperado (no un bug tuyo) dado lo que acabas de leer sobre los límites del heurístico.

**Ejercicio 3 — Justificar por qué EPSG:3857 distorsiona área.**
Sin escribir código: investiga (o deriva, si ya conoces algo de trigonometría) la fórmula del factor de escala de la proyección de Mercator en función de la latitud, y escribe una explicación de un párrafo sobre por qué ese factor implica que un mismo número de píxeles cuadrados en un mapa de Web Mercator representa áreas reales muy distintas cerca del ecuador que cerca de los polos. Menciona explícitamente qué le pasa al factor de escala cuando la latitud se acerca a 90°.

*Criterio de éxito:* tu explicación identifica correctamente que el factor de escala es proporcional a `1/cos(latitud)`, y que por eso tiende a infinito cuando la latitud se acerca a los polos — que es la razón matemática exacta por la que Mercator no puede representarlos.

**Ejercicio 4 — Intersección de bboxes que cruzan el antimeridiano.**
Implementa `cruza_antimeridiano`, `dividir_en_antimeridiano` e `intersectan` tal como se describen arriba, y pruébalas contra un bbox real: el estrecho de Bering, `Bbox { min_x: 170.0, min_y: 60.0, max_x: -169.0, max_y: 70.0 }`.

*Criterio de éxito:* tu función `intersectan` devuelve `true` para un punto en Alaska (`-170.5, 65.0`) **y** para un punto en Chukotka, Rusia (`178.0, 65.0`), mientras que una función `intersectan_simple` sin la división en el antimeridiano devuelve `false` (falso negativo) para ambos — confirma explícitamente esta diferencia con un `assert_ne!` entre los dos resultados para al menos uno de los dos puntos. Además, confirma que un bbox alrededor de Bogotá (que no cruza el antimeridiano) da el mismo resultado con `intersectan` y con `intersectan_simple` — la división no debe cambiar el comportamiento para el caso común.

> Esta técnica es la que usa el Checkpoint 3 del proyecto GeoAPI v0.2 (Capítulo 3.5), en la decisión de asumir WGS84 de entrada — ver la historia de usuario ahí.
