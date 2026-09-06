# 5.2 FlatGeobuf y HTTP Range Requests

Todo lo que GeoAPI ha leído hasta ahora vive en PostGIS o se carga completo en memoria. Pero un dataset de referencia —límites administrativos de un país entero, la red vial completa de una región— a veces no necesita una base de datos: puede vivir como un único archivo estático en un bucket de almacenamiento de objetos (S3, o simplemente un servidor HTTP), y servirse **sin backend activo**, con el cliente descargando solo el fragmento que le interesa. [`flatgeobuf`](https://crates.io/crates/flatgeobuf) (versión 6.0 en este capítulo) es el formato diseñado exactamente para eso: un archivo binario con un índice espacial embebido (un R-tree empaquetado, el mismo diseño que ya conoces de `geo-index` en el Capítulo 4.3) que permite a un cliente HTTP leer solo las porciones relevantes usando **peticiones de rango** (`Range: bytes=...`), sin descargar el archivo completo ni necesitar un servidor con lógica espacial.

## Escribir y leer un `.fgb` local

Antes de hablar de HTTP, FlatGeobuf es simplemente un formato de archivo. Escribirlo requiere declarar el esquema de columnas **antes** de escribir la primera feature — a diferencia de GeoJSON, donde cada `Feature` lleva sus propiedades sueltas, un `.fgb` tiene una tabla de columnas fija en el encabezado, más cercana en espíritu a un Shapefile (Capítulo 4.6) que a GeoJSON:

```rust,ignore
use flatgeobuf::*;
use geo_types::{Geometry, Point};
use geozero::{ColumnValue, PropertyProcessor};
use std::fs::File;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut fgb = FgbWriter::create("ciudades", GeometryType::Point)?;
    fgb.add_column("nombre", ColumnType::String, |_, _| {}); // declarar ANTES de escribir features

    let ciudades = [
        ("Bogotá", -74.0721, 4.7110),
        ("Medellín", -75.5636, 6.2518),
        ("Cali", -76.5225, 3.4372),
        ("Barranquilla", -74.7813, 10.9639),
        ("Cartagena", -75.5144, 10.3910),
    ];
    for (nombre, lon, lat) in ciudades {
        fgb.add_feature_geom(Geometry::Point(Point::new(lon, lat)), |feat| {
            feat.property(0, "nombre", &ColumnValue::String(nombre)).unwrap();
        })?;
    }

    let mut archivo = File::create("ciudades.fgb")?;
    fgb.write(&mut archivo)?;
    Ok(())
}
```

**Una trampa real, verificada, que vale la pena señalar explícitamente:** `feat.property(0, "nombre", ...)` sin haber llamado antes a `fgb.add_column(...)` *no falla al escribir* — el escritor registra silenciosamente la columna "sobre la marcha" para esa llamada, pero esa declaración implícita **no queda persistida en el encabezado del archivo**. El archivo se escribe sin ningún error, pero al leerlo de vuelta, `feature.properties()` falla con un `GeozeroError::Geometry("geometry format")` — un mensaje de error que, por cierto, no menciona nada sobre propiedades ni columnas, lo que lo hace especialmente difícil de diagnosticar la primera vez que lo ves. La lección: **declara siempre tus columnas con `add_column` antes de escribir la primera feature**, nunca dependas de la inferencia implícita.

```rust,ignore
use flatgeobuf::*;
use std::fs::File;
use std::io::BufReader;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let archivo = BufReader::new(File::open("ciudades.fgb")?);
    let mut fgb = FgbReader::open(archivo)?.select_all()?;

    println!("features en el archivo: {:?}", fgb.features_count());
    while let Some(feature) = fgb.next()? {
        println!("  {:?}", feature.properties()?);
    }
    Ok(())
}
```

```text
features en el archivo: Some(5)
  {"nombre": "Bogotá"}
  {"nombre": "Barranquilla"}
  {"nombre": "Cartagena"}
  {"nombre": "Medellín"}
  {"nombre": "Cali"}
```

Fíjate que el orden de lectura **no** es el orden de escritura — `FgbWriter` reordena las features espacialmente (usando una curva de Hilbert, el mismo criterio de ordenamiento que viste con `geo-index` en el Capítulo 4.3) antes de construir el índice, precisamente para que el R-tree empaquetado sea eficiente de consultar.

## Filtrar por bbox — local, y luego remoto

```rust,ignore
# use flatgeobuf::*;
# use std::fs::File;
# use std::io::BufReader;
# fn main() -> Result<(), Box<dyn std::error::Error>> {
let archivo = BufReader::new(File::open("ciudades.fgb")?);
let mut fgb = FgbReader::open(archivo)?.select_bbox(-77.0, 3.0, -76.0, 4.0)?;

let mut nombres = Vec::new();
while let Some(feature) = fgb.next()? {
    nombres.push(feature.properties()?["nombre"].clone());
}
println!("ciudades en el bbox: {nombres:?}");
# Ok(())
# }
```

```text
ciudades en el bbox: ["Cali"]
```

`select_bbox` recorre el R-tree embebido y solo materializa las features cuyo *bounding box* se solapa con la consulta — exactamente igual que el `.search(...)` de `geo-index` (Capítulo 4.3), pero el índice vive dentro del propio archivo en vez de construirse en memoria en cada arranque.

Ahora el mismo patrón, contra un archivo remoto real por HTTP, usando `HttpFgbReader` en vez de `FgbReader`:

```rust,ignore
use flatgeobuf::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = "https://raw.githubusercontent.com/flatgeobuf/flatgeobuf/master/test/data/countries.fgb";
    let fgb = HttpFgbReader::open(url).await?;
    println!("tipo de geometría: {:?}", fgb.header().geometry_type());
    println!("features en el archivo: {}", fgb.header().features_count());

    let mut iter = fgb.select_bbox(8.8, 47.2, 9.5, 55.3).await?; // bbox alrededor de Dinamarca
    let mut nombres = Vec::new();
    while let Some(feature) = iter.next().await? {
        nombres.push(feature.properties()?["name"].clone());
    }
    println!("países en el bbox: {nombres:?}");
    Ok(())
}
```

```text
tipo de geometría: MultiPolygon
features en el archivo: 179
países en el bbox: ["Denmark", "Austria", "Switzerland", "Germany", "France", "Russia"]
```

El resultado trae más de un país porque `select_bbox` filtra por **intersección de *bounding box***, no por geometría exacta — los bounding box de Austria, Suiza, Alemania, Francia y Rusia también se solapan con ese rectángulo de consulta, aunque sus formas reales no lo hagan. Es el mismo compromiso "prefiltro barato, aproximado" que ya viste con el R*-tree del Capítulo 4.3: rápido, pero solo una primera aproximación — si necesitas el predicado exacto, lo combinas con `Relate`/`Contains` del Capítulo 4.1 sobre los candidatos que trae el índice.

## Medir cuántos bytes viajan realmente

Este es el punto central del capítulo. El archivo `countries.fgb` completo pesa **205.680 bytes** (verificado con `curl`). Activando el log interno de `flatgeobuf` (con `RUST_LOG=debug`, que expone las estadísticas de lectura HTTP que la librería registra internamente), la consulta anterior por bbox reporta:

```text
Read 0-12943 (12944 bytes). Total requests: 1 (12944 bytes)
Read 68680-166015 (97336 bytes). Total requests: 2 (110280 bytes)
```

**Dos peticiones HTTP, 110.280 bytes en total** — poco más de la mitad del archivo (~54%), para responder una consulta espacial que solo necesitaba 6 de las 179 features. La primera petición trae el encabezado más una porción generosa del índice espacial (`min_req_size`, para evitar una tercera vuelta de red si el índice es pequeño); la segunda trae el rango de bytes donde el R-tree ya le dijo al lector que están las features relevantes. Un cliente que no usara este formato tendría que descargar los 205.680 bytes completos —o, peor, si el dataset fuera de gigabytes en vez de 200KB, sería completamente inviable traerlo entero solo para filtrar seis registros.

## Cuando el servidor no soporta *Range Requests*

`HttpFgbReader` depende de que el servidor remoto entienda el encabezado `Range` y responda `206 Partial Content` — pero no todos los servidores lo hacen (un servidor de archivos estáticos mal configurado, o un proxy que no lo propaga). Vale la pena verificar qué pasa en ese caso, en vez de asumirlo:

```rust,ignore
use axum::body::Bytes;
use axum::routing::get;
use axum::Router;
use flatgeobuf::*;

async fn servir_archivo_completo() -> Bytes {
    Bytes::from(std::fs::read("countries.fgb").unwrap()) // ignora cualquier `Range` del cliente
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new().route("/countries.fgb", get(servir_archivo_completo));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let direccion = listener.local_addr()?;
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let url = format!("http://{direccion}/countries.fgb");
    let fgb = HttpFgbReader::open(&url).await?; // el servidor de arriba NUNCA responde 206
    let mut it = fgb.select_bbox(8.8, 47.2, 9.5, 55.3).await?;
    let mut n = 0;
    while it.next().await?.is_some() { n += 1; }
    println!("features en el bbox: {n}");
    Ok(())
}
```

```text
features en el bbox: 6
```

Verificado con un contador en el servidor de prueba: **el archivo completo se sirvió una sola vez**, no una vez por cada rango que `flatgeobuf` hubiera pedido internamente. `http-range-client` (la librería que usa `flatgeobuf` por debajo) detecta que la respuesta no es `206` sino `200` con el cuerpo completo, y en ese caso lo cachea entero en memoria y resuelve el resto de las lecturas contra esa copia local — un *fallback* seguro y correcto, aunque pierda por completo la ventaja de transferencia parcial que viste en la sección anterior. Para un archivo de 200KB esto es irrelevante; para uno de varios gigabytes, sería exactamente el escenario que este formato existe para evitar, y por eso confirmar que tu servidor de producción realmente soporta `Range` (revisando el encabezado `Accept-Ranges: bytes` en la respuesta) es una verificación operativa real, no un detalle menor.

## Ejercicios

**Ejercicio 1 — Leer un `.fgb` local.**
Escribe tu propio archivo `.fgb` con al menos 10 features de un tipo geométrico a tu elección (no tiene que ser `Point`), asegurándote de declarar las columnas con `add_column` antes de escribir. Léelo de vuelta y confirma que el número de features y sus propiedades coinciden exactamente con lo que escribiste.

*Criterio de éxito:* un test que escriba y lea de vuelta en un archivo temporal, confirmando con `assert_eq!` el conteo de features y al menos una propiedad de una de ellas.

**Ejercicio 2 — Filtrar por bbox.**
Sobre el archivo del Ejercicio 1, diseña un bbox de consulta que sepas de antemano cuáles features debe traer y cuáles no (elige coordenadas separadas claramente). Confirma con `select_bbox` que el resultado coincide exactamente con tu predicción.

*Criterio de éxito:* un test con al menos tres features donde una consulta de bbox específica debe traer exactamente una de ellas (ni las otras dos, ni ninguna) — verificado comparando el conjunto de nombres/IDs devueltos.

**Ejercicio 3 — Apuntar a un `.fgb` remoto en HTTP y medir bytes transferidos.**
Repite el experimento de medición de bytes del capítulo, pero con tu propio bbox de consulta sobre el mismo archivo `countries.fgb` (o cualquier otro archivo `.fgb` público que encuentres). Activa el log de `flatgeobuf` y calcula qué porcentaje del archivo completo se transfirió.

*Criterio de éxito:* tu programa imprime el tamaño total del archivo (puedes obtenerlo con una petición `HEAD` por separado, o de la documentación del dataset), los bytes efectivamente transferidos según el log, y el porcentaje resultante — con un comentario explicando si ese porcentaje te pareció sorprendentemente alto o bajo para tu consulta específica.

**Ejercicio 4 — Manejar un servidor sin soporte de Range.**
Reproduce el experimento del "servidor sin soporte de Range" del capítulo, pero además compara explícitamente el número de features y sus propiedades obtenidas contra las que obtendrías leyendo el mismo archivo con `FgbReader` local — deben ser idénticas, confirmando que el *fallback* no pierde ni corrompe datos, solo pierde eficiencia de transferencia.

*Criterio de éxito:* un test que confirme, con `assert_eq!`, que el conjunto de propiedades leído vía `HttpFgbReader` contra tu servidor sin soporte de `Range` es idéntico al leído vía `FgbReader` directamente sobre el archivo local.
