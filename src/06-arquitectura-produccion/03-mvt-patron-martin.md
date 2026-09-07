# 6.3 Contratos MVT y el patrón Martin

Hasta ahora GeoAPI ha devuelto GeoJSON. Para servir un mapa interactivo en el navegador —Mapbox GL JS, MapLibre GL JS, cualquier cliente de mapas vectoriales moderno— el formato de intercambio estándar no es GeoJSON, es **MVT** (*Mapbox Vector Tile*): un protobuf binario y compacto, organizado en teselas discretas, que el cliente decodifica y renderiza directamente en el GPU. Este capítulo te enseña a generar MVT real desde tus propias geometrías, siguiendo el mismo contrato que expone [Martin](https://github.com/maplibre/martin) — el servidor de teselas de referencia del ecosistema MapLibre, escrito también en Rust.

## De geometría a protobuf: `geozero` con el feature `with-mvt`

```toml
[dependencies]
geozero = { version = "0.15", features = ["with-mvt"] }
```

Una tesela MVT no es solo "la geometría codificada" — es la geometría **escalada al espacio de coordenadas de la tesela**: un cuadrado de `extent` unidades (4096 es el estándar de facto) que representa el área geográfica de esa tesela específica, en ese nivel de zoom específico. El trait `ToMvt` de `geozero` hace esa escala por ti, siempre que le des los límites de la tesela en el mismo sistema de coordenadas que tu geometría:

```rust,ignore
use geo_types::{Geometry, Point};
use geozero::mvt::{tile, Message, Tile};
use geozero::ToMvt;
use proj::Proj;

// Límites de la tesela z=5, x=9, y=15 en Web Mercator (EPSG:3857) --
// calculados con la fórmula estándar de teselas XYZ, cubren Bogotá a este zoom.
fn tile_bounds_3857(z: u8, x: u32, y: u32) -> (f64, f64, f64, f64) {
    let n = 2f64.powi(z as i32);
    let lon_izq = x as f64 / n * 360.0 - 180.0;
    let lon_der = (x as f64 + 1.0) / n * 360.0 - 180.0;
    let lat_arriba = (std::f64::consts::PI * (1.0 - 2.0 * y as f64 / n)).sinh().atan().to_degrees();
    let lat_abajo = (std::f64::consts::PI * (1.0 - 2.0 * (y as f64 + 1.0) / n)).sinh().atan().to_degrees();
    let merc_x = |lon: f64| lon * 20_037_508.34 / 180.0;
    let merc_y = |lat: f64| {
        let rad = lat.to_radians();
        (rad.tan() + 1.0 / rad.cos()).ln() * 20_037_508.34 / std::f64::consts::PI
    };
    (merc_x(lon_izq), merc_y(lat_abajo), merc_x(lon_der), merc_y(lat_arriba))
}

fn main() {
    let (left, bottom, right, top) = tile_bounds_3857(5, 9, 15);
    let extent = 4096u32;

    // La geometría debe estar en el MISMO CRS que los límites de la tesela --
    // `ToMvt` solo escala coordenadas, no reproyecta (el mismo principio que
    // ya viste con `MvtWriter` y con GDAL en capítulos anteriores).
    let transformador = Proj::new_known_crs("EPSG:4326", "EPSG:3857", None).unwrap();
    let bogota_merc = transformador.convert((-74.0721_f64, 4.7110_f64)).unwrap();
    let geom = Geometry::Point(Point::new(bogota_merc.0, bogota_merc.1));

    let feature = geom.to_mvt(extent, left, bottom, right, top).unwrap();
    let layer = tile::Layer {
        version: 2,
        name: "features".to_string(),
        features: vec![feature],
        keys: vec![],
        values: vec![],
        extent: Some(extent),
    };

    let tile = Tile { layers: vec![layer] };
    let bytes = tile.encode_to_vec();
    println!("tesela MVT: {} bytes", bytes.len());
}
```

```text
tesela MVT: 28 bytes
```

Decodificando la tesela de vuelta para confirmar la escala:

```text
geometría en espacio de tesela: {"type": "Point", "coordinates": [1703,2379]}
```

Bogotá cae en `(1703, 2379)` de `4096` — aproximadamente 41.6% del ancho y 58.1% del alto de la tesela, coherente con su posición real dentro del cuadrante geográfico que cubre esta tesela z=5. Si hubieras usado `MvtWriter::new_unscaled` (sin límites de tesela) en vez de `to_mvt` con bounds reales, habrías obtenido una geometría técnicamente válida como protobuf pero con coordenadas sin ningún significado geográfico — un error fácil de cometer y difícil de notar hasta que un cliente de mapas renderiza la tesela en el lugar equivocado.

## Sirviendo el contrato completo: tesela + TileJSON

Un servidor de teselas real no solo responde `GET /tiles/{z}/{x}/{y}` — también expone un endpoint de metadatos en formato [TileJSON](https://github.com/mapbox/tilejson-spec), que le dice al cliente qué rango de zoom soportas, dónde está el centro por defecto, y la plantilla de URL de las teselas. El crate [`tilejson`](https://crates.io/crates/tilejson) (versión 0.4) modela ese contrato exactamente:

```rust,ignore
use axum::{Json, Router};
use axum::routing::get;
use tilejson::{tilejson, TileJSON};

async fn tilejson_endpoint() -> Json<TileJSON> {
    let tj = tilejson! {
        tiles: vec!["http://localhost:3000/tiles/{z}/{x}/{y}".to_string()],
        minzoom: 0,
        maxzoom: 14,
        name: "features".to_string()
    };
    Json(tj)
}

// let app = Router::new()
//     .route("/tiles/{z}/{x}/{y}", get(tesela))
//     .route("/tiles.json", get(tilejson_endpoint));
```

```text
GET /tiles.json -> {"maxzoom":14,"minzoom":0,"name":"features","tilejson":"3.0.0","tiles":["http://localhost:3000/tiles/{z}/{x}/{y}"]}
```

Cualquier cliente MapLibre/Mapbox GL JS sabe interpretar esta respuesta sin configuración adicional — apuntas el mapa a `tiles.json` y el resto (qué URLs pedir, en qué rango de zoom) queda resuelto por el propio contrato, no por documentación externa que el cliente tenga que conocer de antemano.

## El patrón Martin

[Martin](https://github.com/maplibre/martin) es el servidor de teselas de referencia del ecosistema MapLibre — también escrito en Rust, también sobre un modelo de contratos MVT/TileJSON estándar. Documentalmente, su comportamiento se distingue en tres puntos que vale la pena replicar (o decidir explícitamente no replicar) en tu propia GeoAPI:

- **Descubrimiento automático**: Martin escanea el esquema de una base PostGIS y expone automáticamente una fuente de teselas por cada tabla o función con una columna de geometría, sin que tengas que declarar rutas manualmente. GeoAPI, hasta este capítulo, expone rutas declaradas explícitamente — una decisión de diseño distinta, no un descuido: el descubrimiento automático es cómodo para explorar un esquema existente, pero renuncia al control fino sobre qué se expone y cómo se valida cada parámetro de entrada.
- **TileJSON por fuente**: cada tabla/función descubierta obtiene su propio endpoint `tiles.json`, con los metadatos derivados del propio esquema de la base (nombre de columnas, tipo de geometría). El patrón que construiste arriba —un `tiles.json` por conjunto de datos— es el mismo principio.
- **Soporte de múltiples backends** (PostGIS, PMTiles, MBTiles) detrás del mismo contrato HTTP: el cliente que consume `/tiles.json` y `/tiles/{z}/{x}/{y}` nunca necesita saber si por debajo hay una base de datos o un archivo estático — exactamente la separación que viste en el Capítulo 5.7 al servir teselas PMTiles con la misma forma de API que un backend con PostGIS.

**Verifica siempre contra la documentación oficial vigente de Martin antes de asumir un detalle de comportamiento específico** (nombres exactos de parámetros de query, formato exacto de mensajes de error) — el proyecto evoluciona, y este libro describe el patrón arquitectónico general, no una versión congelada de su comportamiento exacto.

## Servir desde PMTiles sin base de datos

Uniendo este capítulo con el Capítulo 5.4: una vez que tienes bytes MVT válidos, guardarlos en un archivo PMTiles y servirlos desde ahí —sin ninguna base de datos activa, sin recomputar la tesela en cada petición— es el mismo patrón de "pre-renderizar una vez, servir estático para siempre" que usan Martin (con su modo `--pmtiles`) y cualquier CDN de teselas en producción:

```rust,ignore
use pmtiles::{AsyncPmTilesReader, PmTilesWriter, TileCoord, TileType};
use std::fs::File;
use std::io::BufWriter;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // `bytes_mvt` es el protobuf generado más arriba en este capítulo.
    let bytes_mvt: Vec<u8> = vec![]; // placeholder

    let mut writer = PmTilesWriter::new(TileType::Mvt)
        .min_zoom(5).max_zoom(5)
        .create(BufWriter::new(File::create("teselas.pmtiles")?))?;
    writer.add_tile(TileCoord::new(5, 9, 15)?, &bytes_mvt)?;
    writer.finalize()?;
    Ok(())
}
```

```text
MVT recuperada desde PMTiles: 28 bytes, idéntica: true
```

La tesela recuperada del archivo PMTiles es **byte a byte idéntica** a la que generaste en memoria — confirmando que el archivo no introduce ninguna transformación ni pérdida, solo almacenamiento y recuperación por coordenada.

## Ejercicios

**Ejercicio 1 — Servir una tesela MVT propia.**
Genera una tesela con al menos 3 geometrías de tipos distintos (un punto, una línea, un polígono), cada una con al menos una propiedad codificada (usa `TagsBuilder` o el patrón de `MvtWriter` con `GeoJsonString` del Capítulo, que sí codifica propiedades). Decodifica la tesela y confirma que las tres geometrías y sus propiedades sobreviven el *round-trip*.

*Criterio de éxito:* un test que confirme, con `assert_eq!`, que el número de features decodificadas es 3 y que al menos una propiedad de una de ellas coincide con el valor original.

**Ejercicio 2 — Exponer TileJSON.**
Construye un `TileJSON` que incluya `vector_layers` (usa `tilejson::VectorLayer::new`) describiendo al menos un campo de tu tesela del Ejercicio 1, y sirveló desde un endpoint Axum real.

*Criterio de éxito:* una petición HTTP real a tu endpoint `/tiles.json` que, deserializada de vuelta a `TileJSON`, tenga un `vector_layers` no vacío con el nombre de campo que declaraste.

**Ejercicio 3 — Comparar contra el comportamiento documentado de Martin.**
Lee la documentación oficial vigente de Martin (su README y su documentación de configuración) y escribe una comparación de al menos tres puntos concretos entre tu implementación de este capítulo y el comportamiento que Martin documenta — por ejemplo, cómo maneja cada uno los parámetros de *bbox* fuera de rango, o cómo estructuran ambos la respuesta cuando una tesela solicitada no tiene datos.

*Criterio de éxito:* un documento de al menos tres comparaciones, cada una citando la sección específica de la documentación de Martin que consultaste, y confirmando si tu implementación coincide o difiere deliberadamente en ese punto.

**Ejercicio 4 — Servir desde PMTiles sin base de datos.**
Genera al menos 4 teselas en 2 niveles de zoom distintos, guárdalas todas en un único archivo PMTiles, y sirve un endpoint Axum que las lea con el backend `mmap` (Capítulo 5.4) según la coordenada `{z}/{x}/{y}` de la petición — sin ninguna base de datos ni recomputación en cada request.

*Criterio de éxito:* cuatro peticiones HTTP reales a tu endpoint, una por cada tesela generada, confirmando que cada una devuelve el protobuf correcto para su coordenada (decodificado y comparado contra lo que generaste originalmente), y que una coordenada no generada devuelve `404`, no un error de servidor.

> Esta técnica es la que usa la fila "Teselas MVT + PMTiles" del proyecto GeoAPI v1.0 (Capítulo 6.6) — ver la historia de usuario ahí.
