# 3.5 Proyecto guiado de cierre — GeoAPI v0.2 (`geoapi-core`)

Este capítulo tiene una diferencia importante con el proyecto de cierre del Módulo 1: aquí no vas a escribir código temporal que luego migras. `geoapi-core`, tal como lo construyes en este capítulo, es **el crate de dominio definitivo** — la capa de API HTTP que construyes a partir del Capítulo 4.7 va a envolverlo, no reescribirlo. Vale la pena tomarse este capítulo con calma.

## Añadir las dependencias

En `geoapi-core/Cargo.toml`:

```toml
[dependencies]
geo = "0.33"
geo-types = "0.7"
geojson = "1.0"
wkt = "0.14"
serde = { version = "1.0", features = ["derive"] }
```

> Como siempre, verifica en [crates.io](https://crates.io) las versiones vigentes al momento en que leas esto — ver [1.3](../01-front-matter/03-convenciones-del-libro.md).

## Checkpoint 1 — El error de dominio

Todo lo que puede fallar en `geoapi-core` — GeoJSON malformado, una geometría que no se puede convertir — se reporta con un único tipo de error, siguiendo el mismo principio del Capítulo 2.2: nunca panic sobre datos externos, siempre `Result` con una variante específica.

```rust,ignore
// geoapi-core/src/lib.rs
use geo_types::Geometry;

#[derive(Debug, PartialEq)]
pub enum ErrorDominio {
    JsonInvalido(String),
    ConversionFallida(String),
    NoEsFeatureCollection,
}
```

**Checkpoint de compilación:** `cargo check -p geoapi-core` debe pasar con solo esto en el archivo (más las importaciones que uses).

## Checkpoint 2 — Deserializar un `FeatureCollection` a geometrías

La primera responsabilidad de `geoapi-core`: recibir un `&str` de GeoJSON (tal como llegaría en el cuerpo de un `POST /features`) y convertirlo en una lista de `Geometry<f64>` de `geo-types`, con manejo explícito de cada cosa que puede salir mal.

```rust,ignore
use geojson::GeoJson;

pub fn parsear_feature_collection(json: &str) -> Result<Vec<Geometry<f64>>, ErrorDominio> {
    let valor: GeoJson = json
        .parse()
        .map_err(|e: geojson::Error| ErrorDominio::JsonInvalido(e.to_string()))?;

    let coleccion = match valor {
        GeoJson::FeatureCollection(fc) => fc,
        _ => return Err(ErrorDominio::NoEsFeatureCollection),
    };

    let mut geometrias = Vec::with_capacity(coleccion.features.len());
    for feature in coleccion.features {
        let geom_json = feature
            .geometry
            .ok_or_else(|| ErrorDominio::ConversionFallida("feature sin geometría".to_string()))?;

        let geom: Geometry<f64> = geom_json
            .try_into()
            .map_err(|e: geojson::Error| ErrorDominio::ConversionFallida(e.to_string()))?;

        geometrias.push(geom);
    }

    Ok(geometrias)
}
```

Fíjate en las tres formas distintas en que esta función puede fallar, y cómo cada una tiene su propia variante de `ErrorDominio`: el texto no es JSON válido en absoluto (`JsonInvalido`), el JSON es válido pero no es un `FeatureCollection` (`NoEsFeatureCollection` — quizás el cliente mandó un `Feature` suelto), o un `Feature` específico dentro de la colección no trae geometría o trae una que `geo-types` no puede representar (`ConversionFallida`). Esta granularidad es la que le va a permitir a tu futuro handler de Axum (Capítulo 4.7) decidir con precisión qué mensaje de error devolver al cliente.

**Checkpoint de compilación:** `cargo test -p geoapi-core` con este test debe pasar:

```rust,ignore
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsea_feature_collection_valida() {
        let fc = r#"{
            "type": "FeatureCollection",
            "features": [
                { "type": "Feature", "properties": {}, "geometry": { "type": "Point", "coordinates": [-74.07, 4.71] } }
            ]
        }"#;

        let geometrias = parsear_feature_collection(fc).unwrap();
        assert_eq!(geometrias.len(), 1);
    }

    #[test]
    fn rechaza_json_invalido() {
        let resultado = parsear_feature_collection("esto no es json");
        assert!(matches!(resultado, Err(ErrorDominio::JsonInvalido(_))));
    }

    #[test]
    fn rechaza_geometria_suelta() {
        let resultado = parsear_feature_collection(r#"{"type":"Point","coordinates":[1,2]}"#);
        assert_eq!(resultado, Err(ErrorDominio::NoEsFeatureCollection));
    }
}
```

## Checkpoint 3 — Funciones puras del dominio

Con las geometrías ya en memoria como `Geometry<f64>`, `geoapi-core` expone las operaciones que un endpoint va a necesitar: centroide, área, longitud, simplificación. Cada una tiene que decidir qué hacer con tipos de geometría a los que el cálculo no aplica (el área de un `Point` no tiene sentido) — la respuesta, otra vez, es `Option`, no un panic ni un valor inventado como `0.0`.

```rust,ignore
use geo::{Centroid, Geodesic, GeodesicArea, Length, Simplify};
use geo_types::Point;

pub fn centroide(geom: &Geometry<f64>) -> Option<Point<f64>> {
    match geom {
        Geometry::Point(p) => Some(*p), // el centroide de un punto es el punto mismo
        Geometry::LineString(l) => l.centroid(),
        Geometry::Polygon(p) => p.centroid(),
        Geometry::MultiPoint(mp) => mp.centroid(),
        Geometry::MultiLineString(mls) => mls.centroid(),
        Geometry::MultiPolygon(mp) => mp.centroid(),
        _ => None,
    }
}

pub fn area_geodesica_m2(geom: &Geometry<f64>) -> Option<f64> {
    match geom {
        Geometry::Polygon(p) => Some(p.geodesic_area_unsigned()),
        Geometry::MultiPolygon(mp) => Some(mp.geodesic_area_unsigned()),
        _ => None, // un Point o una LineString no tienen área
    }
}

pub fn longitud_geodesica_m(geom: &Geometry<f64>) -> Option<f64> {
    match geom {
        Geometry::LineString(l) => Some(Geodesic.length(l)),
        Geometry::MultiLineString(mls) => Some(Geodesic.length(mls)),
        _ => None, // un Point o un Polygon no tienen "longitud" en este sentido
    }
}

pub fn simplificar(geom: &Geometry<f64>, tolerancia: f64) -> Geometry<f64> {
    match geom {
        Geometry::LineString(l) => Geometry::LineString(l.simplify(tolerancia)),
        Geometry::Polygon(p) => Geometry::Polygon(p.simplify(tolerancia)),
        Geometry::MultiLineString(mls) => Geometry::MultiLineString(mls.simplify(tolerancia)),
        Geometry::MultiPolygon(mp) => Geometry::MultiPolygon(mp.simplify(tolerancia)),
        otro => otro.clone(), // un Point no se simplifica; se devuelve tal cual
    }
}
```

Nota que usamos `GeodesicArea` y el `Length` trait con el espacio métrico `Geodesic` (el mismo que viste en el Capítulo 3.3) en vez de sus equivalentes euclidianos — porque las geometrías que entran a `geoapi-core` están, salvo que documentes lo contrario, en WGS84 (grados). Esta es una decisión de diseño explícita del crate, no un detalle accidental: **`geoapi-core` asume WGS84 de entrada salvo que se le pida reproyectar** (algo que solo vas a poder hacer a partir del Capítulo 4.4, cuando integres `proj`). Vale la pena dejar esa suposición documentada en un comentario del propio `lib.rs` — un lector de tu código seis meses después no debería tener que adivinarlo.

## Checkpoint 4 — Serializar de vuelta

Cierra el ciclo: de `Geometry<f64>` otra vez a texto, para la respuesta HTTP.

```rust,ignore
pub fn a_geojson(geom: &Geometry<f64>) -> Result<String, ErrorDominio> {
    let gj: geojson::Geometry = geom
        .try_into()
        .map_err(|_| ErrorDominio::ConversionFallida("geometría no representable en GeoJSON".to_string()))?;
    Ok(gj.to_string())
}
```

Para WKT, usa directamente `ToWkt` del Capítulo 3.4 sobre cada tipo concreto (`LineString`, `Polygon`, etc.) cuando lo necesites — no hace falta una función *wrapper* en `geoapi-core` para esto, ya que `wkt::ToWkt` funciona sobre cualquier tipo de `geo-types` sin necesidad de pasar por el `enum Geometry`.

## Verificación completa

Con los cuatro checkpoints en su lugar, corre:

```sh
cargo test -p geoapi-core
```

Todos los tests deben pasar. Este es el **criterio de aceptación** de este proyecto: no una salida específica en pantalla, sino una suite de tests verde sobre el crate de dominio completo.

## Ejercicio integrador (abierto)

A diferencia de los ejercicios anteriores, este no trae guía paso a paso — es la forma en que el libro verifica que entendiste el módulo lo suficiente como para extenderlo por tu cuenta.

**Extiende `geoapi-core` con una función `fn bbox_de_coleccion(geoms: &[Geometry<f64>]) -> Option<geo_types::Rect<f64>>`** que calcule el *bounding box* (rectángulo envolvente mínimo) de una colección completa de geometrías — útil, por ejemplo, para que un futuro endpoint `GET /features` pueda reportar en qué región del mapa están todas las features devueltas, sin que el cliente tenga que calcularlo él mismo.

Algunas preguntas que vas a tener que responder tú mismo, sin que el capítulo te las resuelva:

- ¿Qué trait de `geo` calcula el *bounding box* de una sola geometría? (Pista: revisa la documentación de `geo` en [docs.rs](https://docs.rs/geo) buscando algo relacionado con "bounding rect".)
- ¿Qué debería devolver tu función si la colección está vacía?
- ¿Qué debería pasar si alguna geometría individual no tiene un *bounding box* bien definido (por ejemplo, una geometría vacía)? ¿Deberías propagar un error, ignorarla, o hay una tercera opción más razonable?

*Criterio de éxito:* un test con una colección de al menos tres geometrías de tipos distintos confirma que el `Rect` devuelto efectivamente contiene a todas ellas (puedes verificar esto comparando las coordenadas mínimas y máximas del `Rect` contra las coordenadas mínimas y máximas conocidas de tus geometrías de prueba); un segundo test confirma el comportamiento que decidiste para una colección vacía.
