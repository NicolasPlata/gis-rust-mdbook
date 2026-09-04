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
