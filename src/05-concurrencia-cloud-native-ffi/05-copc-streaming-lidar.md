# 5.5 COPC y streaming de nubes de puntos

Cierra el trío de formatos cloud-native (FlatGeobuf en 5.2, COG en 5.3, PMTiles/GeoParquet en 5.4) el formato equivalente para nubes de puntos LiDAR: **COPC** (*Cloud Optimized Point Cloud*). Un archivo `.copc.laz` es, por fuera, un LAZ (LAS comprimido) perfectamente válido — la diferencia está, otra vez, en la organización interna: los puntos se agrupan en un **octree** (la versión 3D de la cuadrícula jerárquica que ya conoces de H3 en el Capítulo 4.3) codificado en los VLR del archivo, de forma que un cliente puede pedir "solo los puntos de este nivel de detalle" o "solo los puntos dentro de esta región" sin descomprimir la nube completa.

Ya conoces el crate para esto: [`las`](https://crates.io/crates/las) (versión 0.11, el mismo del Capítulo 4.7) incluye soporte COPC nativo bajo `las::copc` y `las::CopcReader`, sin necesidad de una dependencia adicional.

```toml
[dependencies]
las = { version = "0.11", features = ["laz"] }
```

## Leer los metadatos de un `.copc.laz`

```rust,ignore
use las::CopcReader;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = CopcReader::from_path("autzen.copc.laz")?;

    println!("puntos totales (header): {}", reader.header().number_of_points());
    println!("bounds: {:?}", reader.header().bounds());

    let entradas: Vec<_> = reader.hierarchy_entries().collect();
    println!("entradas en la jerarquía COPC: {}", entradas.len());
    for e in &entradas {
        println!("  clave: {:?}, puntos: {}", e.key, e.point_count);
    }
    Ok(())
}
```

```text
puntos totales (header): 107
bounds: Bounds { min: Vector { x: 635729.26, y: 848971.33, z: 408.14 }, max: Vector { x: 638864.3, y: 853480.01, z: 505.74 } }
entradas en la jerarquía COPC: 1
  clave: VoxelKey { l: 0, x: 0, y: 0, z: 0 }, puntos: 107
```

**Nota sobre el archivo de prueba de este capítulo:** es un fixture minúsculo (107 puntos, una sola entrada en la jerarquía) — de los que el propio crate `las` incluye en su suite de tests, suficiente para verificar que el mecanismo de lectura funciona de verdad, pero demasiado pequeño para mostrar más de un nivel de detalle real. En una nube LiDAR de producción (millones de puntos), verías docenas o cientos de entradas en la jerarquía, cada una identificada por una `VoxelKey { l, x, y, z }` — el nivel del octree (`l`) y su posición dentro de ese nivel (`x, y, z`), exactamente el mismo esquema de direccionamiento jerárquico que las celdas de H3.

## Extraer un nivel de detalle

`CopcReader::query` filtra por nivel de detalle y por región, sin necesidad de leer ni descomprimir los puntos que no pediste:

```rust,ignore
# use las::{BoundsSelection, CopcReader, LodSelection};
# fn main() -> Result<(), Box<dyn std::error::Error>> {
# let mut reader = CopcReader::from_path("autzen.copc.laz")?;
// Solo el nivel más grueso del octree (la raíz) -- para una vista general
// rápida, como el equivalente en nubes de puntos de una overview de COG.
let nivel_0 = reader.query(LodSelection::Level(0), BoundsSelection::All)?;
println!("puntos en nivel de detalle 0: {}", nivel_0.len());

// Todos los niveles -- la nube completa.
let todos = reader.query(LodSelection::All, BoundsSelection::All)?;
println!("puntos en todos los niveles: {}", todos.len());
# Ok(())
# }
```

```text
puntos en nivel de detalle 0: 107
puntos en todos los niveles: 107
```

Sobre el fixture de prueba ambos números coinciden porque todo el archivo vive en un único nivel — pero la operación es idéntica a la que harías sobre una nube real de millones de puntos: `LodSelection::Level(0)` te trae solo la raíz del octree (una fracción mínima), `LodSelection::LevelMinMax(0, 3)` te traería los primeros cuatro niveles, y `LodSelection::Resolution(espaciado_en_metros)` te deja pedir "deme la densidad de puntos necesaria para un espaciado de al menos X metros" sin tener que razonar tú mismo sobre niveles del octree. `BoundsSelection::Within(bounds)` combina esto con un filtro espacial, exactamente como `select_bbox` en FlatGeobuf (Capítulo 5.2).

## Streaming remoto: un lector `Read + Seek` sobre HTTP

`CopcReader::new` acepta cualquier `R: Read + Seek` — no exige un archivo local. Para leerlo desde un servidor HTTP remoto necesitas un adaptador que traduzca esas dos operaciones a peticiones `Range`. A diferencia de FlatGeobuf (Capítulo 5.2) o COG (Capítulo 5.3), donde el soporte HTTP viene incluido en la librería, aquí lo construyes tú mismo — una oportunidad perfecta para ver exactamente qué hace ese mecanismo por debajo, en lugar de solo confiar en que "funciona":

```rust,ignore
use reqwest::blocking::Client;
use std::io::{Read, Seek, SeekFrom};

struct LectorHttpRango {
    cliente: Client,
    url: String,
    posicion: u64,
    longitud_total: u64,
}

impl LectorHttpRango {
    fn new(url: &str) -> Self {
        let cliente = Client::new();
        let longitud_total = cliente.head(url).send().unwrap()
            .headers().get("content-length").unwrap()
            .to_str().unwrap().parse().unwrap();
        Self { cliente, url: url.to_string(), posicion: 0, longitud_total }
    }
}

impl Read for LectorHttpRango {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        if self.posicion >= self.longitud_total {
            return Ok(0);
        }
        let fin = (self.posicion + buf.len() as u64 - 1).min(self.longitud_total - 1);
        let resp = self.cliente.get(&self.url)
            .header("Range", format!("bytes={}-{}", self.posicion, fin))
            .send()
            .map_err(std::io::Error::other)?;
        let datos = resp.bytes().map_err(std::io::Error::other)?;
        buf[..datos.len()].copy_from_slice(&datos);
        self.posicion += datos.len() as u64;
        Ok(datos.len())
    }
}

impl Seek for LectorHttpRango {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        self.posicion = match pos {
            SeekFrom::Start(p) => p,
            SeekFrom::End(p) => (self.longitud_total as i64 + p) as u64,
            SeekFrom::Current(p) => (self.posicion as i64 + p) as u64,
        };
        Ok(self.posicion)
    }
}
```

Con este adaptador, `CopcReader::new(LectorHttpRango::new(url))` funciona exactamente igual que con un archivo local — y, verificado contra un servidor HTTP real sirviendo el mismo `autzen.copc.laz`, produce el mismo resultado (107 puntos, 1 entrada de jerarquía). Pero hay un problema de rendimiento real y medible:

```text
peticiones HTTP realizadas: 99
```

**99 peticiones HTTP para un archivo de 4.368 bytes.** El decodificador LAZ interno de `las` no pide los datos en un único bloque grande — hace muchas lecturas pequeñas (unos pocos bytes cada vez, para ir descomponiendo la cabecera y los VLR campo por campo), y cada llamada a `read()` en el adaptador de arriba dispara una petición HTTP nueva. Ninguna de esas 99 peticiones es incorrecta, pero el costo de round-trip de red (típicamente varios milisegundos cada una, incluso en redes rápidas) domina por completo sobre el tamaño real de los datos transferidos. La solución es la misma que ya usarías para cualquier `Read` lento: envolverlo en un `BufReader`.

```rust,ignore
# use las::CopcReader;
# fn main() -> Result<(), Box<dyn std::error::Error>> {
# struct LectorHttpRango;
# let lector = LectorHttpRango;
let lector_con_buffer = std::io::BufReader::with_capacity(4096, lector);
let copc = CopcReader::new(lector_con_buffer)?;
# Ok(())
# }
```

```text
peticiones HTTP realizadas: 3
```

**De 99 a 3 peticiones** — un factor de 33x — envolviendo el mismo lector remoto en un `BufReader` de 4KB, sin cambiar ni una línea de la lógica de `LectorHttpRango`. `BufReader` agrupa esas llamadas pequeñas y frecuentes en bloques de lectura más grandes, exactamente el mismo principio detrás de por qué `flatgeobuf` (Capítulo 5.2) y `/vsicurl/` (Capítulo 5.3) usan estrategias de *prefetch* internas: minimizar el número de viajes de red, no solo el número de bytes transferidos. La lección para cualquier lector remoto que construyas desde cero: **verifica cuántas peticiones reales genera, no asumas que "es streaming" significa automáticamente "es eficiente".**

## Ejercicios

**Ejercicio 1 — Leer metadatos de un `.copc.laz`.**
Consigue o genera un archivo `.copc.laz` de prueba (puedes usar el fixture del propio crate `las`, en su repositorio de tests, o cualquier archivo COPC público de muestra) e imprime su rango de coordenadas, número total de puntos, y el conteo de entradas en la jerarquía. Confirma que la suma de `point_count` de todas las entradas del nivel más fino coincide con el número de puntos del header.

*Criterio de éxito:* un test que confirme con `assert_eq!` que `header().number_of_points()` coincide con la suma de puntos de `query(LodSelection::All, BoundsSelection::All)`.

**Ejercicio 2 — Extraer un nivel de detalle.**
Sobre el mismo archivo, compara `LodSelection::Level(0)` contra `LodSelection::All`. Si tu archivo de prueba tiene más de un nivel en su jerarquía, confirma que el nivel 0 trae estrictamente menos puntos que el total; si solo tiene un nivel (como el fixture del capítulo), documenta explícitamente esa limitación en un comentario, sin fingir un resultado que tus datos de prueba no pueden mostrar.

*Criterio de éxito:* un `assert!` que confirme que `nivel_0.len() <= todos.len()` — la relación que debe cumplirse siempre, tenga tu archivo de prueba uno o varios niveles reales.

**Ejercicio 3 — Streaming asíncrono de un octree remoto.**
Implementa tu propio contador de peticiones HTTP (como en el capítulo) y confirma con tus propios números que envolver `LectorHttpRango` en un `BufReader` reduce el conteo de peticiones. Luego, adapta el lector para que funcione dentro de una tarea `tokio::task::spawn_blocking` (necesario porque `reqwest::blocking` no puede ejecutarse en el mismo hilo que ya corre un runtime async) y confirma que el resultado sigue siendo idéntico al de una lectura local del mismo archivo.

*Criterio de éxito:* un test que confirme, con `assert_eq!`, que el número de puntos leídos por streaming remoto coincide exactamente con el número de puntos leídos localmente con `CopcReader::from_path` sobre el mismo archivo, y que el conteo de peticiones HTTP con `BufReader` es menor que sin él.

> El proyecto GeoAPI v0.4 (Capítulo 5.7) no tiene un checkpoint guiado que use esta técnica — su ejercicio integrador la ofrece como una de las opciones para el cuarto endpoint, con la historia de usuario de una empresa de inspección de infraestructura.
