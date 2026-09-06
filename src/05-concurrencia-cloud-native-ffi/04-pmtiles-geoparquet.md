# 5.4 PMTiles v3 y GeoParquet/GeoArrow

Este capítulo cierra el trío de formatos "cloud-native" del módulo con dos piezas que resuelven problemas distintos: **PMTiles** empaqueta un servidor de teselas vectoriales completo en un único archivo estático (sin base de datos, sin servidor de teselas activo); **GeoParquet** —construido sobre el ecosistema columnar Arrow— resuelve la analítica a gran escala sobre millones de features, algo para lo que ni PostGIS ni GeoJSON son la herramienta correcta.

## PMTiles: un servidor de teselas en un solo archivo

[`pmtiles`](https://crates.io/crates/pmtiles) (versión 0.24 en este capítulo) implementa el formato PMTiles v3: todas las teselas de un mapa vectorial completo —de zoom 0 a zoom 14, por ejemplo— empaquetadas en un único archivo binario con un índice interno, listo para servirse desde un bucket de almacenamiento de objetos sin ningún backend con lógica de teselas (ni Martin, ni tu propio servidor Axum del Capítulo 4.7 — solo un archivo estático detrás de un `GET` con soporte de rangos, el mismo mecanismo HTTP que ya conoces de FlatGeobuf).

```toml
[dependencies]
pmtiles = { version = "0.24", default-features = false, features = ["write", "mmap-async-tokio", "tilejson"] }
```

**Cuidado con los features por defecto:** `pmtiles` activa, por defecto, soporte para S3 asíncrono (`aws-sdk-s3` completo) además de todo lo demás — una dependencia pesada que no necesitas si solo vas a leer archivos locales o servirlos tú mismo por HTTP. `default-features = false` más una lista explícita de los features que realmente usas evita compilar (y descargar) el SDK de AWS completo para un ejercicio de este capítulo.

```rust,ignore
use pmtiles::{PmTilesWriter, TileCoord, TileType};
use std::fs::File;
use std::io::BufWriter;

fn main() -> std::io::Result<()> {
    let mut writer = PmTilesWriter::new(TileType::Mvt)
        .min_zoom(0)
        .max_zoom(2)
        .bounds(-76.0, 3.0, -74.0, 7.0)
        .metadata(r#"{"nombre": "cobertura-colombia-demo"}"#)
        .create(BufWriter::new(File::create("cobertura.pmtiles")?))
        .unwrap();

    let teselas = [
        (0u8, 0u32, 0u32, b"tesela-z0-0-0".to_vec()),
        (1, 0, 0, b"tesela-z1-0-0".to_vec()),
        (1, 1, 1, b"tesela-z1-1-1".to_vec()),
        (2, 2, 3, b"tesela-z2-2-3".to_vec()),
    ];
    for (z, x, y, datos) in &teselas {
        writer.add_tile(TileCoord::new(*z, *x, *y).unwrap(), datos).unwrap();
    }
    writer.finalize().unwrap();
    Ok(())
}
```

## Servir desde el backend `mmap`

Leer un archivo PMTiles local no necesita cargarlo completo a memoria: el backend `mmap` mapea el archivo en el espacio de direcciones virtuales del proceso, y el sistema operativo trae a memoria física solo las páginas que realmente se tocan al pedir una tesela — el mismo principio detrás de por qué `geo-index` (Capítulo 4.3) es eficiente con datasets grandes, aplicado ahora a un archivo en disco en vez de a un `Vec` en RAM.

```rust,ignore
use pmtiles::{AsyncPmTilesReader, TileCoord};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let lector = AsyncPmTilesReader::new_with_path("cobertura.pmtiles").await?;
    println!("zoom: {}-{}", lector.get_header().min_zoom, lector.get_header().max_zoom);

    for (z, x, y) in [(0u8, 0u32, 0u32), (1, 1, 1), (2, 2, 3)] {
        let coord = TileCoord::new(z, x, y)?;
        let contenido = lector.get_tile_decompressed(coord).await?;
        println!("tesela z={z} x={x} y={y}: {:?}", contenido.map(|b| String::from_utf8_lossy(&b).to_string()));
    }

    // Una coordenada que nunca se escribió -- Option, no un error ni un pánico.
    let ausente = lector.get_tile(TileCoord::new(2, 0, 0)?).await?;
    println!("tesela inexistente: {ausente:?}");
    Ok(())
}
```

```text
zoom: 0-2
tesela z=0 x=0 y=0: Some("tesela-z0-0-0")
tesela z=1 x=1 y=1: Some("tesela-z1-1-1")
tesela z=2 x=2 y=3: Some("tesela-z2-2-3")
tesela inexistente: None
```

Nota `get_tile_decompressed` frente a `get_tile`: `PmTilesWriter` comprime cada tesela por defecto (gzip para MVT), así que `get_tile` a secas te devuelve los bytes comprimidos tal cual están en el archivo — útil si tu servidor solo va a reenviarlos a un navegador (que descomprime él mismo vía `Content-Encoding: gzip`), pero no si necesitas el contenido real en tu propio código Rust, como aquí.

## GeoParquet: analítica columnar a escala

`geo-types`/`geo` están optimizados para *una* geometría a la vez. Cuando necesitas agregar, filtrar o transformar **millones** de features —el trabajo de una API analítica, no de un servidor de features individuales— quieres un formato **columnar**: todos los valores de un mismo campo contiguos en memoria, para que un cálculo sobre una sola columna (el promedio de una elevación, el conteo de features por categoría) no tenga que tocar las demás. [Apache Arrow](https://arrow.apache.org/) es el estándar columnar del ecosistema moderno de datos; [GeoParquet](https://geoparquet.org/) es su extensión geoespacial persistida en disco como Parquet, y el ecosistema `geoarrow-rs` (`geoarrow-array`, `geoarrow-schema`, versión 0.8 en este capítulo, junto con `geoparquet` 0.8 y `parquet` 58) es su implementación en Rust.

**Verifica las versiones exactas antes de fijarlas:** igual que viste con `sqlx`/`geozero` en el Capítulo 4.5, `geoparquet` 0.8 depende de una versión específica de `arrow-array`/`arrow-schema`/`parquet` (la serie `58`, no la `59` que `cargo add parquet` instala por defecto al momento de escribir este capítulo) — si las fijas de forma independiente sin comprobar con `cargo tree`, terminas con dos copias incompatibles de `RecordBatch` en el árbol de dependencias y errores de tipo que no mencionan versión en ningún lado.

### Escribir con *row groups* espaciales

Un archivo Parquet se organiza en **row groups** — bloques independientes de filas, cada uno con sus propias estadísticas (mínimo, máximo por columna). GeoParquet puede generar, además, una columna de **bbox por row group** (`set_generate_covering(true)`) — la pieza que hace posible el *predicate pushdown* espacial:

```rust,ignore
use std::sync::Arc;
use arrow_array::{ArrayRef, Int32Array, RecordBatch};
use arrow_schema::{DataType, Field, SchemaBuilder};
use geo_types::{Geometry, Point};
use geoarrow_array::GeoArrowArray;
use geoarrow_array::builder::GeometryBuilder;
use geoarrow_schema::{GeoArrowType, GeometryType};
use geoparquet::writer::{GeoParquetRecordBatchEncoder, GeoParquetWriterOptionsBuilder};
use parquet::arrow::ArrowWriter;

// Cuatro regiones colombianas, cada una escrita como su propio row group.
const REGIONES: [(&str, f64, f64); 4] = [
    ("Bogotá", -74.15, 4.55), ("Medellín", -75.65, 6.15),
    ("Cali", -76.60, 3.35), ("Costa Caribe", -75.60, 10.30),
];

fn main() {
    let options = GeoParquetWriterOptionsBuilder::default()
        .set_primary_column("geometry".to_string())
        .set_generate_covering(true) // columnas de bbox por row group
        .build();

    let mut schema_builder = SchemaBuilder::new();
    schema_builder.push(GeoArrowType::Geometry(GeometryType::default()).to_field("geometry", false));
    schema_builder.push(Field::new("region_id", DataType::Int32, false));
    let schema = Arc::new(schema_builder.finish());

    let mut encoder = GeoParquetRecordBatchEncoder::try_new(&schema, &options).unwrap();
    let output = std::fs::File::create("regiones.parquet").unwrap();
    let mut writer = ArrowWriter::try_new(output, encoder.target_schema(), None).unwrap();

    for (id, (_nombre, base_lon, base_lat)) in REGIONES.iter().enumerate() {
        let mut builder = GeometryBuilder::new(GeometryType::new(Default::default()));
        let mut ids = Vec::new();
        for i in 0..25 {
            let p = Point::new(base_lon + i as f64 * 0.01, base_lat + i as f64 * 0.01);
            builder.push_geometry(Some(&Geometry::Point(p))).unwrap();
            ids.push(id as i32);
        }
        let geometry_column = builder.finish().to_array_ref();
        let id_column = Arc::new(Int32Array::from_iter_values(ids)) as ArrayRef;
        let batch = RecordBatch::try_new(schema.clone(), vec![geometry_column, id_column]).unwrap();

        let encoded = encoder.encode_record_batch(&batch).unwrap();
        writer.write(&encoded).unwrap();
        writer.flush().unwrap(); // cierra el row group actual: una región = un row group
    }

    let kv_metadata = encoder.into_keyvalue().unwrap();
    writer.append_key_value_metadata(kv_metadata);
    writer.finish().unwrap();
}
```

### Leer con *predicate pushdown* espacial

```rust,ignore
# use geo_types::Rect;
# use geoparquet::reader::GeoParquetReaderBuilder;
# use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
# fn main() {
let file = std::fs::File::open("regiones.parquet").unwrap();
let builder = ParquetRecordBatchReaderBuilder::try_new(file).unwrap();
println!("row groups totales: {}", builder.metadata().num_row_groups());

let geo_meta = builder.geoparquet_metadata().unwrap().unwrap();

// bbox que cubre solo la región de Bogotá.
let bbox = Rect::new((-74.20, 4.50), (-73.90, 4.80));
let row_groups = builder.intersecting_row_groups(bbox, &geo_meta, None).unwrap();
println!("row groups que intersectan el bbox: {row_groups:?}");
# }
```

```text
row groups totales: 4
row groups que intersectan el bbox: [0]
```

**Esto es *predicate pushdown* real, no un filtro posterior**: `intersecting_row_groups` consulta únicamente las estadísticas de bbox ya guardadas en los metadatos del archivo — sin leer ni un byte de los datos de las otras tres regiones. Encadenando `with_intersecting_row_groups(bbox, ...)` sobre el `builder` antes de construir el lector, el archivo completo (100 filas en 4 row groups) devuelve exactamente **25 filas** — solo las de Bogotá — sin que las 75 filas restantes se materialicen jamás en memoria.

## GeoParquet vs. GeoJSON: la respuesta depende de la escala

Aquí hay una tentación fácil: asumir que un formato binario columnar siempre gana. Medido en este capítulo, sobre el mismo dataset a dos tamaños distintos:

```text
--- 100 puntos ---
tamaño GeoParquet: 12316 bytes
tamaño GeoJSON:    11319 bytes (GeoJSON es más pequeño)
leer+parsear GeoParquet: 280.475µs
leer+parsear GeoJSON:    79.638µs (GeoJSON es más rápido)

--- 100.000 puntos ---
tamaño GeoParquet: 3.585.893 bytes
tamaño GeoJSON:    14.535.033 bytes (4.05x más grande que GeoParquet)
leer+parsear GeoParquet: 5.16ms
leer+parsear GeoJSON:    74.10ms (14.36x más lento)
```

Con solo 100 features, **GeoJSON gana en tamaño y en velocidad** — Parquet paga un costo fijo de metadatos (esquema, estadísticas por row group, diccionarios de compresión) que domina cuando el archivo es pequeño. Con 100.000 features, la relación se invierte por completo: GeoParquet es 4 veces más compacto y 14 veces más rápido de leer. La lección, verificada con números reales y no asumida: **el formato correcto depende de la escala de tus datos**, no de cuál "suena" más moderno. GeoJSON sigue siendo la elección correcta para la respuesta de un endpoint HTTP típico (decenas o cientos de features); GeoParquet es la elección correcta para análisis por lotes sobre datasets que no caben cómodamente en la respuesta de una sola petición.

## Ejercicios

**Ejercicio 1 — Leer un archivo PMTiles local.**
Crea tu propio archivo `.pmtiles` con al menos 6 teselas en 3 niveles de zoom distintos, y confirma que puedes leer cada una por su coordenada `(z, x, y)` exacta, recuperando el contenido original.

*Criterio de éxito:* un test que escriba y lea de vuelta, confirmando con `assert_eq!` que el contenido de cada tesela recuperada coincide exactamente con lo escrito, y que una coordenada no escrita devuelve `None`.

**Ejercicio 2 — Servirlo con backend `mmap`.**
Sobre el mismo archivo, mide con `std::time::Instant` cuánto tarda `AsyncPmTilesReader::new_with_path` en abrir el archivo (debería ser prácticamente instantáneo, sin importar el tamaño del archivo, porque `mmap` no lee el contenido por adelantado) comparado con leer el archivo completo a un `Vec<u8>` con `std::fs::read`. Repite con un archivo con muchas más teselas para que la diferencia sea medible.

*Criterio de éxito:* tu programa imprime ambos tiempos, con un comentario explicando por qué la apertura vía `mmap` no debería crecer proporcionalmente al tamaño del archivo, mientras que `std::fs::read` sí.

**Ejercicio 3 — Leer un GeoParquet con predicate pushdown.**
Repite el experimento de *pushdown* del capítulo con tus propios datos: al menos 6 regiones distintas (6 row groups), y un bbox de consulta que debas diseñar para que intersecte exactamente 2 de las 6 regiones (ni una, ni todas). Confirma con `intersecting_row_groups` que el resultado es exactamente esos 2 índices.

*Criterio de éxito:* un test con `assert_eq!` que confirme que el conjunto de row groups devuelto por `intersecting_row_groups` coincide exactamente con los índices de las regiones que diseñaste para intersectar.

**Ejercicio 4 — Comparar tamaño/latencia vs. GeoJSON equivalente.**
Repite la comparación del capítulo con un tercer punto de datos: 1.000.000 de features (en vez de 100 y 100.000). Confirma si la tendencia observada (GeoParquet cada vez más ventajoso a mayor escala) se mantiene, y en qué punto exacto (aproximado) la ventaja de tamaño de GeoParquet supera 2x, si es que no lo hace ya a partir de 100.000.

*Criterio de éxito:* tu programa imprime tamaño y tiempo de lectura para los tres tamaños de dataset (100, 100.000, 1.000.000), con una conclusión escrita de 2-3 frases sobre la tendencia observada.
