# 5.3 Cloud-Optimized GeoTIFF (COG)

El Capítulo 4.6 te presentó `gdal` para leer un ráster completo en memoria. Pero una escena satelital real —una imagen Sentinel-2, un DEM continental— puede pesar gigabytes, y casi ningún cliente necesita la imagen completa: quiere una vista de baja resolución para un mapa alejado, o solo la banda infrarroja de una región pequeña. El formato **Cloud-Optimized GeoTIFF** (COG) resuelve esto reorganizando internamente un GeoTIFF normal para que sea eficiente de leer parcialmente por HTTP, con el mismo mecanismo de fondo que ya viste con FlatGeobuf en el Capítulo 5.2: peticiones de rango.

## Qué hace "optimizado para la nube" a un GeoTIFF

Un COG sigue siendo un archivo `.tif` válido, legible por cualquier herramienta GeoTIFF existente — la diferencia está en su organización interna:

- **Datos en mosaicos (*tiles*)**, no en franjas: cada banda se divide en bloques cuadrados (256×256 celdas en este capítulo) direccionables individualmente, en vez de filas completas.
- **Pirámide de resoluciones reducidas (*overviews*)** embebida en el mismo archivo: versiones de menor resolución de la imagen completa, para que un cliente que solo necesita una vista general no tenga que descargar ni decodificar los píxeles de máxima resolución.
- **Metadatos (encabezado IFD) al principio del archivo**, para que un cliente pueda leer "dónde está cada mosaico y cada nivel de resolución" con una sola petición pequeña, antes de decidir qué más pedir.

`gdal_translate -of COG` convierte cualquier ráster a este formato:

```sh
gdal_translate -of COG -co COMPRESS=DEFLATE -co BLOCKSIZE=256 escena_base.tif escena.cog.tif
```

```text
Band 1 Block=256x256 Type=Float32, ColorInterp=Gray
  Overviews: 1024x1024, 512x512, 256x256
Band 2 Block=256x256 Type=Float32, ColorInterp=Undefined
  Overviews: 1024x1024, 512x512, 256x256
```

Sobre una escena sintética de 2048×2048 con dos bandas (rojo e infrarrojo cercano, para el NDVI que calculas más abajo), GDAL construyó automáticamente tres niveles de reducción además de la resolución completa.

## Leer una *overview* de baja resolución

```rust,ignore
use gdal::Dataset;
use ndarray::Array2;

fn main() -> gdal::errors::Result<()> {
    let dataset = Dataset::open("escena.cog.tif")?;
    let banda_roja = dataset.rasterband(1)?;

    println!("tamaño completo: {:?}", banda_roja.size());
    println!("overviews disponibles: {}", banda_roja.overview_count()?);
    for i in 0..banda_roja.overview_count()? {
        let ov = banda_roja.overview(i as usize)?;
        println!("  overview {i}: {:?}", ov.size());
    }

    // La overview más reducida, sin tocar los datos de resolución completa.
    let mas_baja = banda_roja.overview((banda_roja.overview_count()? - 1) as usize)?;
    let datos: Array2<f32> = mas_baja.read_band_as::<f32>()?.to_array()?;
    println!("overview leída: {:?}", datos.dim());
    Ok(())
}
```

```text
tamaño completo: (2048, 2048)
overviews disponibles: 3
  overview 0: (1024, 1024)
  overview 1: (512, 512)
  overview 2: (256, 256)
overview leída: (256, 256)
```

`RasterBand::overview(indice)` te da acceso directo a un nivel de resolución reducida como si fuera una banda independiente — `gdal` no reconstruye esa reducción a partir de la imagen completa (eso sería un ráster normal, no uno "optimizado para la nube"), la lee directamente de los píxeles pre-calculados que `gdal_translate` ya generó y guardó en el archivo.

## Extraer una banda específica

```rust,ignore
# use gdal::Dataset;
use gdal::raster::GdalDataType;

# fn main() -> gdal::errors::Result<()> {
let dataset = Dataset::open("escena.cog.tif")?;
println!("bandas totales: {}", dataset.raster_count());

let nir = dataset.rasterband(2)?; // banda 2 = infrarrojo cercano
println!("banda NIR -- tipo: {:?}, tamaño: {:?}", nir.band_type(), nir.size());
assert_eq!(nir.band_type(), GdalDataType::Float32);
# Ok(())
# }
```

```text
bandas totales: 2
banda NIR -- tipo: Float32, tamaño: (2048, 2048)
```

Cada banda de un GeoTIFF multibanda es completamente independiente — `dataset.rasterband(n)` te da acceso a leer, procesar o servir una sola banda sin cargar las demás, algo esencial cuando una escena satelital real puede traer 10 o más bandas espectrales y tu endpoint solo necesita dos de ellas para calcular un índice.

## NDVI sobre una ventana parcial

El **NDVI** (*Normalized Difference Vegetation Index*, `(NIR - Rojo) / (NIR + Rojo)`) es el índice de vegetación más común en teledetección: la vegetación sana refleja mucho infrarrojo cercano y absorbe rojo, así que el NDVI se acerca a `1` sobre vegetación densa y a `0` o negativo sobre suelo desnudo, agua o superficie construida. Calcularlo sobre una **ventana parcial** —no la imagen completa— es exactamente el patrón de acceso que un endpoint `GET /raster/ndvi?bbox=` necesitaría:

```rust,ignore
# use gdal::Dataset;
use ndarray::Array2;

# fn main() -> gdal::errors::Result<()> {
let dataset = Dataset::open("escena.cog.tif")?;
let banda_roja = dataset.rasterband(1)?;
let banda_nir = dataset.rasterband(2)?;

// Ventana de 100x100 celdas a partir de (900, 900) -- una fracción pequeña
// de la imagen de 2048x2048, sin leer el resto.
let ventana = (900isize, 900isize);
let tamano = (100usize, 100usize);

let rojo: Array2<f32> = banda_roja.read_as::<f32>(ventana, tamano, tamano, None)?.to_array()?;
let nir: Array2<f32> = banda_nir.read_as::<f32>(ventana, tamano, tamano, None)?.to_array()?;

let ndvi = (&nir - &rojo) / (&nir + &rojo);
let promedio = ndvi.mean().unwrap();
println!("NDVI promedio en la ventana: {promedio:.4}");
# Ok(())
# }
```

```text
NDVI promedio en la ventana: 0.7930
```

Un NDVI promedio de `0.79` en esa ventana es consistente con vegetación densa (el rango típico de NDVI real va de `-1` a `1`, con vegetación sana usualmente entre `0.6` y `0.9`) — y, más importante para este capítulo, el cálculo completo (leer ambas bandas, dividir) tocó solo `100×100` celdas de las `2048×2048` disponibles: **el 99.76% de la escena nunca se leyó**, ni de memoria ni de disco.

## Lo mismo, contra un COG remoto — bytes reales transferidos

`gdal` accede a un archivo remoto por HTTP mediante el sistema de archivos virtual **`/vsicurl/`**, que traduce las lecturas parciales del driver GeoTIFF en peticiones `Range` reales — el mismo mecanismo conceptual que `HttpFgbReader` en el Capítulo 5.2, pero implementado dentro de GDAL en vez de en Rust puro. Sirviendo el mismo `escena.cog.tif` (13.061.591 bytes) desde un servidor HTTP local y activando el registro de depuración de GDAL (`CPL_DEBUG=ON`) para ver exactamente qué pide:

```rust,ignore
use gdal::Dataset;

fn main() -> gdal::errors::Result<()> {
    gdal::config::set_config_option("CPL_DEBUG", "ON")?;

    let dataset = Dataset::open("/vsicurl/http://localhost:8080/escena.cog.tif")?;
    let banda = dataset.rasterband(1)?;
    let n = banda.overview_count()?;
    let mas_baja = banda.overview((n - 1) as usize)?;
    let _datos = mas_baja.read_band_as::<f32>()?;
    Ok(())
}
```

```text
VSICURL: GetFileSize(http://localhost:8080/escena.cog.tif)=13061591  response_code=200
VSICURL: Downloading 0-16383 (http://localhost:8080/escena.cog.tif)...
VSICURL: Downloading 16384-163839 (http://localhost:8080/escena.cog.tif)...
```

Dos peticiones de rango, **163.840 bytes en total** — apenas **1.25%** de los 13 MB del archivo completo — para leer la *overview* de menor resolución de una imagen remota. Comparado con el ~54% que necesitaste en el Capítulo 5.2 para una consulta por bbox sobre FlatGeobuf, este porcentaje es aún más bajo porque el patrón de acceso es distinto: aquí no filtras por ubicación espacial, filtras por **nivel de resolución**, y las *overviews* de un COG están diseñadas para vivir compactas al principio del archivo — precisamente la ganancia que la organización interna de un COG promete y que aquí queda medida, no asumida.

## Ejercicios

**Ejercicio 1 — Leer una overview de baja resolución.**
Crea tu propio COG sintético (puedes usar el patrón de generación determinista del capítulo, con un tamaño de al menos 1024×1024 para que se generen *overviews* reales) y confirma cuántos niveles de reducción tiene. Lee la overview de resolución intermedia (ni la más alta ni la más baja) y confirma que sus dimensiones son exactamente la mitad de la overview del nivel inmediatamente más detallado.

*Criterio de éxito:* un test que confirme con `assert_eq!` que `overview(i).size()` es aproximadamente el doble de `overview(i+1).size()` en cada eje (con una tolerancia de redondeo de 1 celda, ya que las dimensiones impares no dividen exacto).

**Ejercicio 2 — Extraer una banda específica.**
Crea un COG con al menos 4 bandas (por ejemplo, simulando Azul/Verde/Rojo/NIR), donde cada banda tenga un valor constante distinto y conocido (por ejemplo, banda 1 = 10.0 en toda la imagen, banda 2 = 20.0, etc.). Extrae cada banda por separado y confirma que ninguna se mezcló con las demás.

*Criterio de éxito:* un test que lea cada una de las 4 bandas y confirme con `assert_eq!` que el valor promedio de cada una coincide exactamente con el valor constante que le asignaste.

**Ejercicio 3 — Calcular NDVI sobre una ventana parcial.**
Sobre tu propia escena sintética con un patrón de "vegetación" y "no vegetación" en zonas conocidas de antemano (como el capítulo), calcula el NDVI de dos ventanas parciales distintas: una que caiga completamente dentro de la zona de vegetación, y otra que caiga completamente fuera. Confirma que la primera da un NDVI notablemente más alto que la segunda.

*Criterio de éxito:* un test con `assert!` que confirme que el NDVI promedio de la ventana "vegetación" es mayor que el de la ventana "no vegetación" por un margen de al menos `0.3` (dado el patrón del capítulo, la diferencia real es mucho mayor, pero un margen conservador evita que el test sea frágil ante pequeños cambios de tus datos de prueba).
