# 3.4 Serialización — GeoJSON, WKT/WKB

`geo-types` te da el modelo en memoria. Pero una API tiene que recibir y enviar geometrías por la red, como texto o bytes — necesitas serializarlas y deserializarlas. Este capítulo cubre los dos formatos que cualquier API GIS moderna debe poder hablar: **GeoJSON**, el formato de intercambio universal en la web, y **WKT/WKB**, el formato que habla directamente con PostGIS y con casi cualquier motor GIS de escritorio.

> Versiones de este capítulo: `geojson` 1.0.0, `wkt` 0.14.0, `serde`/`serde_json` 1.x.

## GeoJSON: el formato de intercambio de la web

GeoJSON (formalizado en el [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946)) es JSON con una estructura específica para geometrías. Tres tipos de objeto lo componen:

- **`Geometry`** — una de las formas que ya conoces (`Point`, `LineString`, `Polygon`, etc.), representada como `{"type": "Point", "coordinates": [lon, lat]}`.
- **`Feature`** — una `Geometry` más un objeto `properties` con atributos arbitrarios (`{"nombre": "Bogotá", "poblacion": 7743955}`).
- **`FeatureCollection`** — una lista de `Feature`.

El crate `geojson` modela estos tres tipos, y sabe convertir entre ellos y los tipos de `geo-types` mediante `TryFrom`/`TryInto` — la misma familia de traits de conversión que usaste en el Ejercicio 4 del Capítulo 3.1, ahora aplicada a serialización en vez de solo a `Point`/`Coord`.

### De `geo-types` a GeoJSON, y de vuelta

```rust,ignore
use geo_types::{Geometry, Point};
use geojson::GeoJson;

fn main() {
    let punto: Geometry<f64> = Geometry::Point(Point::new(-74.0721, 4.7110));

    // geo_types::Geometry -> geojson::Geometry -> String
    let geojson_geom: geojson::Geometry = (&punto).try_into().unwrap();
    let texto = geojson_geom.to_string();
    println!("{texto}");
    // {"type":"Point","coordinates":[-74.0721,4.711]}

    // String -> geojson::GeoJson -> geo_types::Geometry
    let parseado: GeoJson = texto.parse().unwrap();
    let geojson_geom_2 = geojson::Geometry::try_from(parseado).unwrap();
    let geometria_de_vuelta: Geometry<f64> = geojson_geom_2.try_into().unwrap();

    assert_eq!(punto, geometria_de_vuelta);
    println!("Roundtrip OK");
}
```

`.try_into()` en ambas direcciones devuelve un `Result`, no un valor directo — la conversión puede fallar (por ejemplo, si el GeoJSON describe un tipo de geometría que `geo-types` no soporta, como una `GeometryCollection` mal formada). Este es el mismo principio del Capítulo 2.2 aplicado a una librería externa: nunca asumas que una conversión de datos externos siempre tiene éxito.

### `Feature`: geometría más propiedades

```rust,ignore
use geo_types::Geometry;
use geojson::GeoJson;

fn main() {
    let feature_json = r#"{
        "type": "Feature",
        "properties": { "nombre": "Bogotá" },
        "geometry": { "type": "Point", "coordinates": [-74.0721, 4.7110] }
    }"#;

    let valor: GeoJson = feature_json.parse().unwrap();

    if let GeoJson::Feature(f) = valor {
        let nombre = f.properties.as_ref().unwrap().get("nombre").unwrap();
        println!("Feature: {nombre}");

        let geom: Geometry<f64> = f.geometry.unwrap().try_into().unwrap();
        println!("Geometría: {geom:?}");
    }
}
```

`GeoJson` es un `enum` con tres variantes (`Geometry`, `Feature`, `FeatureCollection`) — exactamente el mismo patrón de "no sé cuál de varias formas tengo hasta que hago `match`" que viste con `geo_types::Geometry` en el Capítulo 3.1. `f.properties` es un `Option<serde_json::Map<...>>` (puede no haber propiedades en absoluto), y `f.geometry` es un `Option<geojson::Geometry>` (un `Feature` técnicamente puede no traer geometría). Ambos `Option` te obligan, otra vez, a decidir explícitamente qué hacer si faltan — no hay un valor `null` implícito que se cuele sin que lo notes.

### Manejar GeoJSON malformado sin pánico

Un endpoint `POST /features` de GeoAPI va a recibir, tarde o temprano, JSON que no es GeoJSON válido — o que ni siquiera es JSON válido. `.parse::<GeoJson>()` devuelve `Result`, así que esto ya es manejable con lo que sabes desde el Capítulo 2.2:

```rust,ignore
use geojson::GeoJson;

fn main() {
    let tipo_desconocido = r#"{ "type": "Feature", "geometry": { "type": "Rare", "coordinates": [1,2] } }"#;
    let resultado: Result<GeoJson, _> = tipo_desconocido.parse();

    match resultado {
        Ok(_) => println!("inesperado"),
        Err(e) => println!("Error: {e}"),
    }
    // Error: Error while deserializing GeoJSON: unknown variant `Rare`, expected one of
    // `Point`, `LineString`, `Polygon`, `MultiPoint`, `MultiLineString`, `MultiPolygon`,
    // `GeometryCollection` at line 1 column 49

    let no_es_json = "esto no es json en absoluto {{{";
    let resultado2: Result<GeoJson, _> = no_es_json.parse();
    assert!(resultado2.is_err());
}
```

El error que devuelve `geojson` ya trae información específica y accionable (qué tipo esperaba, en qué posición del texto falló) — exactamente el tipo de mensaje que querrías reenviar en el cuerpo de una respuesta `400 Bad Request` cuando conectes esto a Axum en el Capítulo 4.7.

### El *winding order*: la regla de la mano derecha que GeoJSON exige y casi nadie valida

El [RFC 7946](https://datatracker.ietf.org/doc/html/rfc7946#section-3.1.6) no solo define la estructura de un GeoJSON — también exige una convención sobre el **orden en que se listan los vértices** de un polígono: el anillo exterior debe recorrerse en sentido **antihorario** (counter-clockwise, CCW), y cualquier anillo interior (un agujero) en sentido **horario** (clockwise, CW). Es la misma "regla de la mano derecha" que usan los gráficos 3D para definir de qué lado de una superficie está el "afuera": si tus dedos siguen el orden de los vértices, el pulgar apunta hacia el exterior del polígono.

El problema real, no hipotético: **muchísimo GeoJSON en producción no cumple esto.** Exports de Shapefile antiguos, algunas herramientas de escritorio, y APIs de terceros escritas antes de que RFC 7946 se formalizara (2016) producen anillos exteriores en sentido horario con total normalidad — y la mayoría de parsers JSON, incluido `geojson`, **lo aceptan sin quejarse**, porque la estructura sigue siendo JSON válido. El *winding order* incorrecto no rompe el parseo; rompe silenciosamente a los consumidores que sí asumen la convención — algunos motores de renderizado dibujan el polígono "invertido" (el interior se trata como exterior), y ciertos algoritmos topológicos dan resultados incorrectos sobre geometrías con el orden equivocado.

`geo` te da las dos piezas que necesitas: el trait `Winding` para **detectar** el sentido actual, y el trait `Orient` para **corregirlo**:

```rust,ignore
use geo::orient::{Direction, Orient};
use geo::winding_order::Winding;
use geo_types::Geometry;
use geojson::GeoJson;

fn main() {
    // GeoJSON "legacy" real: anillo exterior en sentido horario --
    // viola RFC 7946, pero es JSON perfectamente válido.
    let geojson_horario = r#"{
        "type": "Polygon",
        "coordinates": [[
            [-74.1, 4.6], [-74.1, 4.8], [-73.9, 4.8], [-73.9, 4.6], [-74.1, 4.6]
        ]]
    }"#;

    let parsed: GeoJson = geojson_horario.parse().unwrap();
    let geojson_geom = geojson::Geometry::try_from(parsed).unwrap();
    let geometria: Geometry<f64> = geojson_geom.try_into().unwrap();

    let poligono = match &geometria {
        Geometry::Polygon(p) => p.clone(),
        _ => unreachable!(),
    };

    println!("¿exterior en sentido horario? {}", poligono.exterior().is_cw());

    let corregido = poligono.orient(Direction::Default);
    println!("después de .orient(): ¿antihorario? {}", corregido.exterior().is_ccw());
}
```

```text
¿exterior en sentido horario? true
después de .orient(): ¿antihorario? true
```

Verificado además que `.orient(Direction::Default)` **no cambia el área** del polígono, solo el orden en que se listan sus vértices — reordenar no es lo mismo que deformar. `Direction::Default` es, específicamente, la convención de RFC 7946 (exterior CCW, interiores CW); si alguna vez trabajas con un formato que exige la convención opuesta, `Direction::Reversed` te da exactamente eso.

**La recomendación práctica para un endpoint `POST /features` de GeoAPI:** normaliza el *winding order* de toda geometría que entra por la API (con `.orient(Direction::Default)`) antes de persistirla, en vez de asumir que el cliente que la mandó siguió la convención correctamente. Es la misma disciplina de "no confíes en los datos externos, valídalos o normalízalos" que ya aplicaste con el manejo de GeoJSON malformado.

## WKT y WKB: el formato que habla PostGIS

**WKT** (*Well-Known Text*) y **WKB** (*Well-Known Binary*) son, junto con GeoJSON, los otros dos formatos de intercambio omnipresentes en GIS — y son los que vas a usar para hablar con PostGIS a partir del Capítulo 4.5. WKT es la representación textual (`POINT(-74.07 4.71)`, `LINESTRING(-74.07 4.71, -75.56 6.25)`); WKB es la misma información codificada en binario, más compacta y más rápida de parsear, y es la que PostGIS transmite por defecto sobre el protocolo de conexión.

El crate `wkt` provee `ToWkt` (para serializar) y `TryFromWkt` (para deserializar):

```rust,ignore
use geo_types::{Coord, LineString};
use wkt::{ToWkt, TryFromWkt};

fn main() {
    let linea = LineString::new(vec![
        Coord { x: -74.07, y: 4.71 },
        Coord { x: -75.56, y: 6.25 },
    ]);

    let texto_wkt = linea.wkt_string();
    println!("{texto_wkt}");
    // LINESTRING(-74.07 4.71,-75.56 6.25)

    let linea_de_vuelta: LineString<f64> = LineString::try_from_wkt_str(&texto_wkt).unwrap();
    assert_eq!(linea, linea_de_vuelta);
    println!("Roundtrip WKT OK");
}
```

No vamos a cubrir WKB directamente en este capítulo: en la práctica, casi nunca vas a construir o parsear WKB a mano — el crate `geozero`, que conoces en el Capítulo 4.5, decodifica WKB directamente desde el *wire protocol* de PostgreSQL hacia `geo_types`, sin que tengas que tocar bytes crudos en ningún momento. Lo importante de este capítulo es que entiendas *qué es* WKB y por qué existe (una representación binaria compacta del mismo modelo que WKT describe en texto) — la mecánica de usarlo llega cuando tenga un propósito concreto.

## Interoperar con `serde`: geometrías dentro de tus propios tipos de API

Cuando en el Capítulo 4.7 construyas el cuerpo JSON de un request o response de GeoAPI, vas a necesitar structs propias (como `struct NuevaFeature { id: String, geometria: ??? }`) que se serialicen con `serde`. La buena noticia: `geojson::Geometry` **ya implementa `Serialize` y `Deserialize`** de fábrica, así que puedes incrustarlo directamente en cualquier struct tuya sin escribir ningún código de (de)serialización manual:

```rust,ignore
use geo_types::{Geometry, Point};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct FeatureApi {
    id: String,
    geometria: geojson::Geometry,
}

fn main() {
    let punto: Geometry<f64> = Geometry::Point(Point::new(-74.0721, 4.7110));
    let geojson_geom: geojson::Geometry = (&punto).try_into().unwrap();

    let feature = FeatureApi {
        id: "sensor-1".to_string(),
        geometria: geojson_geom,
    };

    let json = serde_json::to_string_pretty(&feature).unwrap();
    println!("{json}");

    let de_vuelta: FeatureApi = serde_json::from_str(&json).unwrap();
    println!("{de_vuelta:?}");
}
```

```text
{
  "id": "sensor-1",
  "geometria": {
    "type": "Point",
    "coordinates": [
      -74.0721,
      4.711
    ]
  }
}
```

`#[derive(Serialize, Deserialize)]` sobre `FeatureApi` genera automáticamente el código de (de)serialización para toda la struct, incluyendo el campo `geometria` — porque `geojson::Geometry` ya sabe serializarse a sí mismo. Este es el patrón que vas a repetir para cada tipo de request/response de GeoAPI: defines la forma en Rust con structs normales, derivas `Serialize`/`Deserialize`, y Axum (Capítulo 4.7 en adelante) hace el resto automáticamente al conectar esos tipos a un handler HTTP.

## Ejercicios

**Ejercicio 1 — Round-trip GeoJSON.**
Escribe una función genérica `fn roundtrip_geojson(geom: &Geometry<f64>) -> Geometry<f64>` que convierta una geometría a texto GeoJSON y de vuelta, y un test que la ejecute sobre al menos tres geometrías distintas (`Point`, `LineString`, `Polygon`), verificando con `assert_eq!` que el resultado es idéntico al original en cada caso.

*Criterio de éxito:* los tres tests pasan con `cargo test`.

**Ejercicio 2 — Round-trip WKT.**
Igual que el ejercicio anterior, pero con `ToWkt`/`TryFromWkt` en vez de GeoJSON. Además, imprime la representación WKT de cada geometría y confirma a ojo que el formato coincide con lo que esperarías ver en una consulta SQL a PostGIS (`SELECT ST_AsText(geom) FROM ...`).

*Criterio de éxito:* los tests de *roundtrip* pasan para las mismas tres geometrías del Ejercicio 1.

**Ejercicio 3 — Manejo de un GeoJSON malformado con `Result`.**
Escribe `fn parsear_feature_seguro(texto: &str) -> Result<geojson::Feature, String>` que intente parsear un `Feature` desde un `&str`, devolviendo un mensaje de error legible (usando `.to_string()` sobre el error de `geojson`) en vez de dejar que el `unwrap()` entre en pánico. Prueba la función con: un JSON válido, un JSON con un tipo de geometría inexistente, y un string que no es JSON en absoluto — los tres casos deben manejarse sin panic.

*Criterio de éxito:* tres tests, uno por caso, verifican `Ok`/`Err` según corresponda, y ninguno usa `.unwrap()` sobre el resultado de `parsear_feature_seguro` directamente (usa `match` o los métodos de `Result` que ya conoces del Capítulo 2.2).

**Ejercicio 4 — Interoperar con `serde`.**
Diseña una struct `struct RespuestaFeatures { total: usize, features: Vec<FeatureApi> }` (reutilizando el `FeatureApi` del capítulo) que derive `Serialize`/`Deserialize`, sérializa una instancia con dos o tres features de ejemplo a JSON con `serde_json::to_string_pretty`, y deserialízala de vuelta. Verifica que `respuesta.features.len()` coincide antes y después del *roundtrip*, y que puedes acceder a la geometría de cada feature convirtiéndola de vuelta a `geo_types::Geometry` con `.try_into()`.

*Criterio de éxito:* un test de *roundtrip* completo (serializar → deserializar → convertir cada geometría a `geo_types`) pasa sin ningún `unwrap()` que pueda entrar en pánico con datos que tú mismo controlas en el test (siguen siendo válidos usar `.unwrap()` sobre datos que construyes tú mismo en el test, como aclaramos en el Capítulo 2.2 — la regla es sobre datos externos, no sobre fixtures de test).

**Ejercicio 5 — Normalizar GeoJSON con winding order incorrecto.**
Escribe `fn normalizar_winding(geojson_str: &str) -> Result<Polygon<f64>, String>` que reciba un `Polygon` en texto GeoJSON, lo parsee, y devuelva la versión con `.orient(Direction::Default)` aplicado — sin importar si la entrada ya venía en el sentido correcto o no. Prueba tu función con dos fixtures: el polígono horario del capítulo, y su versión con el mismo anillo exterior pero en sentido antihorario (los mismos puntos, en orden inverso).

*Criterio de éxito:* para *ambos* fixtures, tu función devuelve un polígono cuyo `.exterior().is_ccw()` es `true` — confirmando que `orient()` es *idempotente* (aplicarlo sobre algo que ya está bien orientado no lo rompe) — y que el área (`unsigned_area()`) es idéntica entre la entrada y la salida en los dos casos, verificado con `assert_eq!`.

> Esta técnica es la que usan los Checkpoints 1, 2 y 4 del proyecto GeoAPI v0.2 (Capítulo 3.5) — ver las historias de usuario ahí.
