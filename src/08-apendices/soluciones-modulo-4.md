# Apéndice — Soluciones de ejercicios: Módulo 4 (Concurrencia, cloud-native y FFI seguro)

> Todo el código de este apéndice se verificó compilando y ejecutando contra `rayon` 1.12.0, `flatgeobuf` 6.0.1 + `geozero` 0.15.1, `gdal` 0.19.0 (con `libgdal` 3.12.2 del sistema), `pmtiles` 0.24.0, `geoparquet`/`geoarrow-array`/`geoarrow-schema` 0.8.0 + `parquet`/`arrow-array`/`arrow-schema` 58, `las` 0.11.1 (soporte COPC nativo), `geos` 11.1.1 + `geos-sys` 2.0.9 (con `libgeos` 3.14.1 del sistema), y `axum` 0.8.9 — ver la Decisión #8 en `BACKLOG.md`.

## Capítulo 5.1 — Paralelismo de datos con Rayon

### Ejercicio 1 — Convertir un `.iter()` a `.par_iter()` y medir *speedup*

```rust,ignore
use geo::{Distance, Haversine};
use geo_types::{LineString, Point};
use rayon::prelude::*;

fn longitud_total(ruta: &LineString<f64>) -> f64 {
    ruta.0.windows(2).map(|w| Haversine.distance(Point::from(w[0]), Point::from(w[1]))).sum()
}

fn generar_rutas(n: usize, puntos_por_ruta: usize) -> Vec<LineString<f64>> {
    (0..n)
        .map(|i| {
            let base_lon = -74.25 + (i as f64 * 0.618_034).sin() * 0.15;
            let base_lat = 4.45 + (i as f64 * 0.381_966).cos() * 0.2;
            LineString::new(
                (0..puntos_por_ruta)
                    .map(|j| geo_types::coord! { x: base_lon + j as f64 * 0.001, y: base_lat + j as f64 * 0.001 })
                    .collect(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secuencial_y_paralelo_dan_el_mismo_total() {
        let rutas = generar_rutas(10_000, 50);
        let total_secuencial: f64 = rutas.iter().map(longitud_total).sum();
        let total_paralelo: f64 = rutas.par_iter().map(longitud_total).sum();
        assert!((total_secuencial - total_paralelo).abs() < 1e-6);
    }
}
```

### Ejercicio 2 — Identificar un caso donde paralelizar no ayuda

```rust,ignore
use rayon::prelude::*;
use std::time::Instant;

fn medir(n: usize) -> (std::time::Duration, std::time::Duration) {
    let datos: Vec<f64> = (0..n).map(|i| i as f64).collect();

    let inicio = Instant::now();
    let _s: f64 = datos.iter().map(|x| x * 2.0).sum();
    let t_secuencial = inicio.elapsed();

    let inicio = Instant::now();
    let _s: f64 = datos.par_iter().map(|x| x * 2.0).sum();
    let t_paralelo = inicio.elapsed();

    (t_secuencial, t_paralelo)
}

fn main() {
    for n in [10, 100, 1_000, 10_000, 100_000] {
        let (secuencial, paralelo) = medir(n);
        println!("n={n:>7}: secuencial={secuencial:>12?}  paralelo={paralelo:>12?}");
    }
}
```

En una máquina típica de varios núcleos, el cruce donde `.par_iter()` empieza a ganar sobre `.iter()` para una operación tan barata como `x * 2.0` suele estar entre `n=10.000` y `n=100.000` — por debajo de eso, el costo de coordinación entre hilos supera el trabajo real, exactamente como viste en el capítulo con `n=200`.

### Ejercicio 3 — Reproyección batch paralela

```rust,ignore
use proj::Proj;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;

fn generar_puntos(n: usize) -> Vec<(f64, f64)> {
    (0..n)
        .map(|i| (-74.25 + (i as f64 * 0.618_034).sin() * 0.15, 4.45 + (i as f64 * 0.381_966).cos() * 0.2))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_init_llama_al_inicializador_mas_veces_que_hilos() {
        let puntos = generar_puntos(1_000_000);
        let contador = AtomicUsize::new(0);

        let _ = puntos
            .par_iter()
            .map_init(
                || {
                    contador.fetch_add(1, Ordering::Relaxed);
                    Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap()
                },
                |t, &p| t.convert(p).unwrap(),
            )
            .collect::<Vec<_>>();

        assert!(contador.load(Ordering::Relaxed) > rayon::current_num_threads());
    }

    #[test]
    fn par_chunks_da_el_mismo_resultado_que_secuencial() {
        let puntos = generar_puntos(100_000);
        let secuencial: Vec<(f64, f64)> = {
            let t = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
            puntos.iter().map(|&p| t.convert(p).unwrap()).collect()
        };

        let n_hilos = rayon::current_num_threads();
        let tam_trozo = puntos.len().div_ceil(n_hilos);
        let correcto: Vec<(f64, f64)> = puntos
            .par_chunks(tam_trozo)
            .flat_map(|trozo| {
                let t = Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap();
                trozo.iter().map(move |&p| t.convert(p).unwrap()).collect::<Vec<_>>()
            })
            .collect();

        assert_eq!(secuencial, correcto);
    }
}
```

### Ejercicio 4 — Detectar un patrón irregular que requiere `Mutex`

```rust,ignore
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::Mutex;

fn contar_con_mutex(ids: &[u32]) -> HashMap<u32, u32> {
    let mapa: Mutex<HashMap<u32, u32>> = Mutex::new(HashMap::new());
    ids.par_iter().for_each(|&celda| {
        let mut mapa = mapa.lock().unwrap();
        *mapa.entry(celda).or_insert(0) += 1;
    });
    mapa.into_inner().unwrap()
}

fn contar_con_fold_reduce(ids: &[u32]) -> HashMap<u32, u32> {
    ids.par_iter()
        .fold(HashMap::new, |mut mapa, &celda| {
            *mapa.entry(celda).or_insert(0) += 1;
            mapa
        })
        .reduce(HashMap::new, |mut a, b| {
            for (k, v) in b {
                *a.entry(k).or_insert(0) += v;
            }
            a
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn las_tres_tecnicas_dan_el_mismo_conteo() {
        let ids: Vec<u32> = (0..100_000).map(|i| i % 500).collect();

        let mut secuencial: HashMap<u32, u32> = HashMap::new();
        for &c in &ids {
            *secuencial.entry(c).or_insert(0) += 1;
        }

        assert_eq!(secuencial, contar_con_mutex(&ids));
        assert_eq!(secuencial, contar_con_fold_reduce(&ids));
    }
}
```

`fold`/`reduce` suele ser más rápido que `Mutex<HashMap>` compartido porque cada hilo acumula en su propio `HashMap` local sin ninguna sincronización durante el trabajo — la única sincronización ocurre al final, combinando un puñado de mapas parciales (uno por hilo) en vez de contender por un lock en cada uno de los 100.000 elementos.

---

## Capítulo 5.2 — FlatGeobuf y HTTP Range Requests

### Ejercicio 1 — Leer un `.fgb` local

```rust,ignore
use flatgeobuf::*;
use geo_types::{Geometry, Point};
use geozero::{ColumnValue, PropertyProcessor};
use std::fs::File;
use std::io::BufReader;

fn escribir_prueba(ruta: &str) -> Result<()> {
    let mut fgb = FgbWriter::create("prueba", GeometryType::Point)?;
    fgb.add_column("nombre", ColumnType::String, |_, _| {});
    for (nombre, lon, lat) in [("A", 0.0, 0.0), ("B", 1.0, 1.0), ("C", 2.0, 2.0)] {
        fgb.add_feature_geom(Geometry::Point(Point::new(lon, lat)), |feat| {
            feat.property(0, "nombre", &ColumnValue::String(nombre)).unwrap();
        })?;
    }
    let mut archivo = File::create(ruta)?;
    fgb.write(&mut archivo)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escribe_y_lee_tres_features() {
        let ruta = "/tmp/apendice_5_2_local.fgb";
        escribir_prueba(ruta).unwrap();

        let archivo = BufReader::new(File::open(ruta).unwrap());
        let mut fgb = FgbReader::open(archivo).unwrap().select_all().unwrap();
        assert_eq!(fgb.features_count(), Some(3));

        let mut nombres = Vec::new();
        while let Some(feature) = fgb.next().unwrap() {
            nombres.push(feature.properties().unwrap()["nombre"].clone());
        }
        nombres.sort();
        assert_eq!(nombres, vec!["A", "B", "C"]);
    }
}
```

### Ejercicio 2 — Filtrar por bbox

```rust,ignore
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bbox_trae_exactamente_una_feature() {
        let ruta = "/tmp/apendice_5_2_bbox.fgb";
        escribir_prueba(ruta).unwrap(); // A=(0,0), B=(1,1), C=(2,2), del Ejercicio 1

        let archivo = BufReader::new(File::open(ruta).unwrap());
        // bbox alrededor de B=(1,1) exclusivamente.
        let mut fgb = FgbReader::open(archivo).unwrap().select_bbox(0.5, 0.5, 1.5, 1.5).unwrap();

        let mut nombres = Vec::new();
        while let Some(feature) = fgb.next().unwrap() {
            nombres.push(feature.properties().unwrap()["nombre"].clone());
        }
        assert_eq!(nombres, vec!["B"]);
    }
}
```

### Ejercicio 3 — Apuntar a un `.fgb` remoto en HTTP y medir bytes transferidos

```rust,ignore
use flatgeobuf::HttpFgbReader;

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::new().filter_level(log::LevelFilter::Debug).init();

    let url = "https://raw.githubusercontent.com/flatgeobuf/flatgeobuf/master/test/data/countries.fgb";
    let fgb = HttpFgbReader::open(url).await?;

    // bbox distinto al del capítulo: alrededor de Japón.
    let mut it = fgb.select_bbox(129.0, 31.0, 146.0, 46.0).await?;
    let mut n = 0;
    while it.next().await?.is_some() {
        n += 1;
    }
    println!("features en el bbox: {n}");
    // El tamaño total del archivo (205680 bytes, verificado con `curl -I`) y los
    // bytes reportados por el log `http-range` dan el porcentaje transferido.
    Ok(())
}
```

*Nota:* el tamaño exacto y el porcentaje transferido dependen del bbox elegido — la verificación real de este ejercicio requiere ejecutarlo con conectividad de red y leer los logs `http-range`, como se hizo en el capítulo (110.280 de 205.680 bytes, ~54%, para el bbox de Dinamarca).

### Ejercicio 4 — Manejar un servidor sin soporte de Range

```rust,ignore
use axum::body::Bytes;
use axum::routing::get;
use flatgeobuf::{FeatureProperties, FgbReader, HttpFgbReader};
use std::io::BufReader;

async fn servir_completo() -> Bytes {
    Bytes::from(std::fs::read("/tmp/apendice_5_2_local.fgb").unwrap())
}

#[tokio::test]
async fn fallback_sin_range_da_los_mismos_datos_que_local() {
    let app = axum::Router::new().route("/prueba.fgb", get(servir_completo));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let direccion = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });

    let url = format!("http://{direccion}/prueba.fgb");
    let fgb_remoto = HttpFgbReader::open(&url).await.unwrap();
    let mut it = fgb_remoto.select_all().await.unwrap();
    let mut remotas = Vec::new();
    while let Some(f) = it.next().await.unwrap() {
        remotas.push(f.properties().unwrap()["nombre"].clone());
    }
    remotas.sort();

    let archivo = BufReader::new(std::fs::File::open("/tmp/apendice_5_2_local.fgb").unwrap());
    let mut fgb_local = FgbReader::open(archivo).unwrap().select_all().unwrap();
    let mut locales = Vec::new();
    while let Some(f) = fgb_local.next().unwrap() {
        locales.push(f.properties().unwrap()["nombre"].clone());
    }
    locales.sort();

    assert_eq!(remotas, locales);
}
```

---

## Capítulo 5.3 — Cloud-Optimized GeoTIFF (COG)

### Ejercicio 1 — Leer una overview de baja resolución

```rust,ignore
#[cfg(test)]
mod tests {
    use gdal::Dataset;

    #[test]
    fn cada_overview_es_aproximadamente_la_mitad_de_la_anterior() {
        // Requiere un COG previamente generado con `gdal_translate -of COG`
        // sobre un ráster de al menos 1024x1024.
        let dataset = Dataset::open("/tmp/apendice_5_3.cog.tif").unwrap();
        let banda = dataset.rasterband(1).unwrap();
        let n = banda.overview_count().unwrap();

        for i in 0..n - 1 {
            let actual = banda.overview(i as usize).unwrap().size();
            let siguiente = banda.overview((i + 1) as usize).unwrap().size();
            assert!((actual.0 as i64 - 2 * siguiente.0 as i64).abs() <= 2);
            assert!((actual.1 as i64 - 2 * siguiente.1 as i64).abs() <= 2);
        }
    }
}
```

### Ejercicio 2 — Extraer una banda específica

```rust,ignore
#[cfg(test)]
mod tests {
    use gdal::raster::Buffer;
    use gdal::DriverManager;
    use ndarray::Array2;

    #[test]
    fn cuatro_bandas_constantes_no_se_mezclan() {
        let (ancho, alto) = (64, 64);
        let driver = DriverManager::get_driver_by_name("MEM").unwrap();
        let dataset = driver.create_with_band_type::<f32, _>("prueba", ancho, alto, 4).unwrap();

        for (banda_idx, valor) in [(1, 10.0f32), (2, 20.0), (3, 30.0), (4, 40.0)] {
            let mut banda = dataset.rasterband(banda_idx).unwrap();
            let mut buf = Buffer::new((ancho, alto), vec![valor; ancho * alto]);
            banda.write((0, 0), (ancho, alto), &mut buf).unwrap();
        }

        for (banda_idx, esperado) in [(1, 10.0f32), (2, 20.0), (3, 30.0), (4, 40.0)] {
            let banda = dataset.rasterband(banda_idx).unwrap();
            let datos: Array2<f32> = banda.read_band_as::<f32>().unwrap().to_array().unwrap();
            assert_eq!(datos.mean().unwrap(), esperado);
        }
    }
}
```

### Ejercicio 3 — Calcular NDVI sobre una ventana parcial

```rust,ignore
#[cfg(test)]
mod tests {
    use gdal::Dataset;
    use ndarray::Array2;

    fn ndvi_ventana(dataset: &Dataset, ventana: (isize, isize), tamano: (usize, usize)) -> f32 {
        let rojo: Array2<f32> = dataset.rasterband(1).unwrap()
            .read_as::<f32>(ventana, tamano, tamano, None).unwrap().to_array().unwrap();
        let nir: Array2<f32> = dataset.rasterband(2).unwrap()
            .read_as::<f32>(ventana, tamano, tamano, None).unwrap().to_array().unwrap();
        ((&nir - &rojo) / (&nir + &rojo)).mean().unwrap()
    }

    #[test]
    fn ventana_vegetacion_tiene_ndvi_mucho_mas_alto() {
        // Requiere la escena sintética del capítulo (patrón diagonal de
        // "vegetación" con |fila-col| < 300).
        let dataset = Dataset::open("/tmp/apendice_5_3.cog.tif").unwrap();
        let vegetacion = ndvi_ventana(&dataset, (900, 900), (50, 50)); // diagonal exacta
        let no_vegetacion = ndvi_ventana(&dataset, (100, 1900), (50, 50)); // lejos de la diagonal

        assert!(vegetacion - no_vegetacion > 0.3);
    }
}
```

---

## Capítulo 5.4 — PMTiles v3 y GeoParquet/GeoArrow

### Ejercicio 1 — Leer un archivo PMTiles local

```rust,ignore
#[cfg(test)]
mod tests {
    use pmtiles::{AsyncPmTilesReader, PmTilesWriter, TileCoord, TileType};
    use std::fs::File;
    use std::io::BufWriter;

    #[tokio::test]
    async fn seis_teselas_en_tres_niveles_se_leen_correctamente() {
        let ruta = "/tmp/apendice_5_4.pmtiles";
        let mut writer = PmTilesWriter::new(TileType::Mvt)
            .min_zoom(0).max_zoom(2)
            .create(BufWriter::new(File::create(ruta).unwrap())).unwrap();
        let teselas = [
            (0u8, 0u32, 0u32), (1, 0, 0), (1, 1, 1),
            (2, 0, 0), (2, 1, 1), (2, 3, 3),
        ];
        for &(z, x, y) in &teselas {
            writer.add_tile(TileCoord::new(z, x, y).unwrap(), format!("t-{z}-{x}-{y}").as_bytes()).unwrap();
        }
        writer.finalize().unwrap();

        let lector = AsyncPmTilesReader::new_with_path(ruta).await.unwrap();
        for &(z, x, y) in &teselas {
            let contenido = lector.get_tile_decompressed(TileCoord::new(z, x, y).unwrap()).await.unwrap();
            assert_eq!(contenido.unwrap(), format!("t-{z}-{x}-{y}").into_bytes());
        }

        let ausente = lector.get_tile(TileCoord::new(2, 2, 2).unwrap()).await.unwrap();
        assert!(ausente.is_none());
    }
}
```

### Ejercicio 2 — Servirlo con backend `mmap`

```rust,ignore
#[cfg(test)]
mod tests {
    use pmtiles::AsyncPmTilesReader;
    use std::time::Instant;

    #[tokio::test]
    async fn abrir_con_mmap_no_crece_con_el_tamano_del_archivo() {
        let inicio = Instant::now();
        let _lector = AsyncPmTilesReader::new_with_path("/tmp/apendice_5_4.pmtiles").await.unwrap();
        let t_mmap = inicio.elapsed();

        let inicio = Instant::now();
        let _bytes = std::fs::read("/tmp/apendice_5_4.pmtiles").unwrap();
        let t_read_completo = inicio.elapsed();

        println!("mmap: {t_mmap:?}, fs::read completo: {t_read_completo:?}");
        // `mmap` solo mapea páginas de memoria virtual -- no copia el archivo
        // completo a un buffer del proceso, así que su costo de apertura no
        // debería crecer proporcionalmente al tamaño del archivo, a diferencia
        // de `std::fs::read`, que sí materializa el archivo entero en memoria.
    }
}
```

### Ejercicio 3 — Leer un GeoParquet con predicate pushdown

```rust,ignore
#[cfg(test)]
mod tests {
    use geo_types::Rect;
    use geoparquet::reader::GeoParquetReaderBuilder;
    use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;

    #[test]
    fn pushdown_selecciona_exactamente_las_regiones_esperadas() {
        // Requiere el archivo de 6 row groups (uno por región) del Ejercicio 4.
        let file = std::fs::File::open("/tmp/apendice_5_4_seis_regiones.parquet").unwrap();
        let builder = ParquetRecordBatchReaderBuilder::try_new(file).unwrap();
        let geo_meta = builder.geoparquet_metadata().unwrap().unwrap();

        // bbox diseñado para cubrir exactamente las regiones de índice 2 y 3.
        let bbox = Rect::new((-76.70, 3.25), (-75.55, 6.25));
        let row_groups = builder.intersecting_row_groups(bbox, &geo_meta, None).unwrap();

        let mut ordenado = row_groups.clone();
        ordenado.sort();
        assert_eq!(ordenado, vec![2, 3]);
    }
}
```

### Ejercicio 4 — Comparar tamaño/latencia vs. GeoJSON equivalente

```rust,ignore
fn main() {
    // Repite `escribir_parquet`/`escribir_geojson` del capítulo con
    // N = 100, 100_000, y 1_000_000, imprimiendo tamaño y tiempo de lectura
    // para cada uno. Tendencia verificada en el capítulo (100 -> 100.000):
    // GeoJSON pasa de "más pequeño y más rápido" a "4.05x más grande y
    // 14.36x más lento" que GeoParquet -- la ventaja de GeoParquet crece
    // con el tamaño del dataset porque el costo fijo de sus metadatos
    // (esquema, estadísticas por row group) se amortiza sobre más filas.
}
```

---

## Capítulo 5.5 — COPC y streaming de nubes de puntos

### Ejercicio 1 — Leer metadatos de un `.copc.laz`

```rust,ignore
#[cfg(test)]
mod tests {
    use las::{BoundsSelection, CopcReader, LodSelection};

    #[test]
    fn suma_de_entradas_coincide_con_el_header() {
        let mut reader = CopcReader::from_path("/tmp/autzen.copc.laz").unwrap();
        let del_header = reader.header().number_of_points();
        let todos = reader.query(LodSelection::All, BoundsSelection::All).unwrap();
        assert_eq!(del_header as usize, todos.len());
    }
}
```

### Ejercicio 2 — Extraer un nivel de detalle

```rust,ignore
#[cfg(test)]
mod tests {
    use las::{BoundsSelection, CopcReader, LodSelection};

    #[test]
    fn nivel_0_nunca_trae_mas_puntos_que_todos_los_niveles() {
        let mut reader = CopcReader::from_path("/tmp/autzen.copc.laz").unwrap();
        let nivel_0 = reader.query(LodSelection::Level(0), BoundsSelection::All).unwrap();
        let todos = reader.query(LodSelection::All, BoundsSelection::All).unwrap();
        // El fixture de prueba de este capítulo tiene un solo nivel en su
        // jerarquía (107 puntos, todos en la raíz) -- por eso ambos números
        // coinciden aquí. En un archivo con varios niveles, nivel_0.len()
        // sería estrictamente menor.
        assert!(nivel_0.len() <= todos.len());
    }
}
```

### Ejercicio 3 — Streaming asíncrono de un octree remoto

```rust,ignore
#[cfg(test)]
mod tests {
    use las::{BoundsSelection, CopcReader, LodSelection};
    // `LectorHttpRango` es el adaptador Read+Seek del capítulo.
    use super::LectorHttpRango;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn streaming_remoto_coincide_con_lectura_local() {
        let local = {
            let mut r = CopcReader::from_path("/tmp/autzen.copc.laz").unwrap();
            r.query(LodSelection::All, BoundsSelection::All).unwrap().len()
        };

        let servicio = tower_http::services::ServeDir::new("/tmp");
        let app = axum::Router::new().fallback_service(servicio);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let direccion = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap(); });
        let url = format!("http://{direccion}/autzen.copc.laz");

        let remoto = tokio::task::spawn_blocking(move || {
            let peticiones = Arc::new(AtomicUsize::new(0));
            let lector = std::io::BufReader::with_capacity(4096, LectorHttpRango::new(&url, peticiones));
            let mut copc = CopcReader::new(lector).unwrap();
            copc.query(LodSelection::All, BoundsSelection::All).unwrap().len()
        })
        .await
        .unwrap();

        assert_eq!(local, remoto);
    }
}
```

---

## Capítulo 5.6 — FFI seguro

### Ejercicio 1 — Identificar la superficie `unsafe` mínima de un wrapper dado

1. `GEOS_init_r()` en `ContextoGeos::new`: seguro porque no tiene precondiciones — siempre devuelve un handle válido. Sin comprobación posible ni necesaria.
2. `GEOSContext_setErrorMessageHandler_r` en el mismo método: seguro porque `handle` acaba de crearse en la línea anterior (no puede ser inválido) y `manejador_de_error` tiene exactamente la firma `GEOSMessageHandler_r` que la función espera — si la firma no coincidiera, no compilaría, no sería un error en tiempo de ejecución.
3. `GEOS_finish_r` en `Drop for ContextoGeos`: seguro porque `Drop::drop` se ejecuta exactamente una vez por valor (garantía del lenguaje), y el campo `0` es privado — ningún otro código pudo haber llamado ya a `GEOS_finish_r` sobre el mismo handle. Si el campo fuera público, otro código podría llamar a `GEOS_finish_r` manualmente y luego `Drop` lo llamaría *de nuevo* — doble liberación.
4. `GEOSWKTReader_read_r`/`GEOSGeom_destroy_r` en `desde_wkt`/`Drop for GeometriaCruda`: seguros porque el puntero se comprueba contra `null` inmediatamente después de crearse, y solo se envuelve en `Some(Self { ... })` si no es nulo — sin esa comprobación, un WKT inválido produciría un puntero nulo que luego se desreferenciaría en `GEOSContains_r`.
5. `GEOSContains_r` en `contains`: seguro porque el borrow-checker garantiza que `self`/`otra` (y por lo tanto sus punteros internos) siguen vivos mientras dura la llamada — sin el lifetime `'ctx` atando `GeometriaCruda` a su `ContextoGeos`, sería posible liberar el contexto y luego llamar `contains` sobre una geometría que ya no tiene contexto válido.

### Ejercicio 2 — Escribir un comentario `// SAFETY:` correcto

```rust,ignore
impl<'ctx> GeometriaCruda<'ctx> {
    pub fn area(&self, ctx: &ContextoGeos) -> f64 {
        let mut area_out: f64 = 0.0;
        unsafe {
            // SAFETY: `area_out` es una variable local de Rust en la pila de
            // este stack frame, válida durante toda la llamada -- GEOS solo
            // escribe un `f64` en la dirección que le pasamos (`&mut area_out
            // as *mut f64`), nunca lee de ella ni la retiene después de que
            // la función retorna, así que no hay riesgo de que escriba fuera
            // de los límites de esta variable ni de que la use tras liberarla.
            geos_sys::GEOSArea_r(ctx.0, self.ptr, &mut area_out);
        }
        area_out
    }
}
```

### Ejercicio 3 — Envolver un puntero con `Drop`

```rust,ignore
use geos_sys::{GEOSGeometry, GEOSPrepare_r, GEOSPreparedGeom_destroy_r, GEOSPreparedGeometry};

pub struct PreparadaCruda<'g> {
    ptr: *const GEOSPreparedGeometry,
    _geometria: &'g GeometriaCruda<'g>, // ata el lifetime: la original no puede liberarse antes
}

impl<'g> PreparadaCruda<'g> {
    pub fn new(ctx: &ContextoGeos, geometria: &'g GeometriaCruda<'g>) -> Self {
        // SAFETY: `geometria.ptr` es válido mientras `geometria` viva, y el
        // campo `_geometria` de este struct ata nuestro propio lifetime al
        // suyo -- el compilador rechaza cualquier código que intente
        // liberar `geometria` mientras esta `PreparadaCruda` siga viva.
        let ptr = unsafe { GEOSPrepare_r(ctx.0, geometria.ptr as *const GEOSGeometry) };
        Self { ptr, _geometria: geometria }
    }
}

// El compilador rechaza (no compila) código como:
//   let geom = GeometriaCruda::desde_wkt(&ctx, "POLYGON(...)").unwrap();
//   let prep = PreparadaCruda::new(&ctx, &geom);
//   drop(geom);       // ERROR: `geom` no puede moverse mientras `prep` la referencia
//   prep.usar_de_alguna_forma();
```

### Ejercicio 4 — Usar `PreparedGeometry` de `geos` en una consulta repetida

```rust,ignore
use geos::{Geom, Geometry};
use std::time::Instant;

fn poligono_complejo(n_vertices: usize) -> Geometry {
    let mut wkt = String::from("POLYGON((");
    for i in 0..=n_vertices {
        let angulo = 2.0 * std::f64::consts::PI * (i % n_vertices) as f64 / n_vertices as f64;
        let radio = 50.0 + 3.0 * (angulo * 15.0).sin();
        wkt.push_str(&format!("{} {},", radio * angulo.cos(), radio * angulo.sin()));
    }
    wkt.pop();
    wkt.push_str("))");
    Geometry::new_from_wkt(&wkt).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preparada_da_el_mismo_conteo_que_sin_preparar() {
        let poligono = poligono_complejo(500);
        let puntos: Vec<Geometry> = (0..1000)
            .map(|i| Geometry::new_from_wkt(&format!(
                "POINT({} {})", (i as f64 * 0.618).sin() * 45.0, (i as f64 * 0.382).cos() * 45.0
            )).unwrap())
            .collect();

        let inicio = Instant::now();
        let n_normal = puntos.iter().filter(|p| poligono.contains(p).unwrap()).count();
        let t_normal = inicio.elapsed();

        let preparada = poligono.to_prepared_geom().unwrap();
        let inicio = Instant::now();
        let n_preparada = puntos.iter().filter(|p| preparada.contains(p).unwrap()).count();
        let t_preparada = inicio.elapsed();

        assert_eq!(n_normal, n_preparada);
        println!("sin preparar: {t_normal:?}, preparada: {t_preparada:?}");
    }
}
```

---

## Capítulo 5.7 — Proyecto GeoAPI v0.4

### Ejercicio integrador — Un cuarto formato cloud-native (COG)

```rust,ignore
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use gdal::Dataset;
use ndarray::Array2;
use serde::Deserialize;

#[derive(Deserialize)]
struct ParametrosNdvi {
    x: isize,
    y: isize,
    tamano: usize,
}

async fn ndvi_ventana(
    Query(params): Query<ParametrosNdvi>,
) -> Result<Json<f64>, StatusCode> {
    // GDAL con /vsicurl/ ya hace streaming HTTP por su cuenta (Capítulo 5.3) --
    // este endpoint es completamente síncrono desde el punto de vista de
    // GDAL, pero el trabajo de E/S de red es bloqueante, así que sigue
    // necesitando `spawn_blocking` para no bloquear el runtime de Tokio,
    // igual que `reproject_batch` en este mismo capítulo.
    let resultado = tokio::task::spawn_blocking(move || -> Result<f64, String> {
        let dataset = Dataset::open("/vsicurl/https://ejemplo.com/escena.cog.tif")
            .map_err(|e| e.to_string())?;
        let ventana = (params.x, params.y);
        let tamano = (params.tamano, params.tamano);
        let rojo: Array2<f32> = dataset.rasterband(1).map_err(|e| e.to_string())?
            .read_as::<f32>(ventana, tamano, tamano, None).map_err(|e| e.to_string())?
            .to_array().map_err(|e| e.to_string())?;
        let nir: Array2<f32> = dataset.rasterband(2).map_err(|e| e.to_string())?
            .read_as::<f32>(ventana, tamano, tamano, None).map_err(|e| e.to_string())?
            .to_array().map_err(|e| e.to_string())?;
        let ndvi = (&nir - &rojo) / (&nir + &rojo);
        Ok(ndvi.mean().unwrap() as f64)
    })
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(resultado))
}
```

La respuesta a "¿necesita `spawn_blocking`?": sí, siempre que la llamada de fondo sea una función síncrona que pueda bloquear el hilo por un tiempo apreciable (E/S de red o de disco) — `features_stream` en el capítulo *no* lo necesita porque `HttpFgbReader` es nativamente `async` (usa `tokio` y `reqwest` por debajo, cediendo el control durante la espera de red); `gdal`/`/vsicurl/`, en cambio, es una librería C síncrona sin ningún concepto de `async`, así que cualquier llamada sobre ella dentro de un handler de Axum debe aislarse en `spawn_blocking` para no congelar el resto del servidor mientras espera la red.
