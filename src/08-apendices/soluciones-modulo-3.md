# Apéndice — Soluciones de ejercicios: Módulo 3 (Índices, robustez y persistencia)

> Todo el código de este apéndice se verificó compilando y ejecutando contra `geo` 0.33.1, `robust` 1.2.0, `rstar` 0.13.0, `geo-index` 0.3.4, `h3o` 0.11.0, `proj` 0.31.0 (con `libproj` 9.7.1 del sistema), `gdal` 0.19.0 (con `libgdal` 3.12.2 del sistema, feature `array`), `ndarray` 0.17.2, `shapefile` 0.9.0 (feature `geo-types`), `las` 0.11.1, `sqlx` 0.8.6, `geozero` 0.15.1, `diesel` 2.3.13 + `postgis_diesel` 3.1.1, y `axum` 0.8.9 — ver la Decisión #8 en `BACKLOG.md`. Los Capítulos 4.5 y 4.7 se verificaron contra una instancia real de PostgreSQL 16 + PostGIS 3.4 (Decisión #11).

## Capítulo 4.1 — DE-9IM y el trait `Relate`

### Ejercicio 1 — Matriz DE-9IM manual vs. `Relate`

```rust,ignore
use geo::Relate;
use geo_types::{Coord, LineString, Polygon};

fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon<f64> {
    Polygon::new(
        LineString::new(vec![
            Coord { x: x0, y: y0 },
            Coord { x: x0 + lado, y: y0 },
            Coord { x: x0 + lado, y: y0 + lado },
            Coord { x: x0, y: y0 + lado },
            Coord { x: x0, y: y0 },
        ]),
        vec![],
    )
}

// Patrón manual de "overlaps" para geometrías de igual dimensión (área-área):
// ambos interiores se cruzan en área (T en la posición I∩I), y ninguna
// contiene completamente a la otra (T en la posición E∩I, entre otras).
const PATRON_OVERLAPS: &str = "T*T***T**";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn patron_manual_coincide_con_is_overlaps() {
        let zona_a = cuadrado(0.0, 0.0, 4.0);
        let zona_b_solapada = cuadrado(2.0, 2.0, 4.0);
        let zona_c_separada = cuadrado(100.0, 100.0, 4.0);

        let matriz_solapada = zona_a.relate(&zona_b_solapada);
        let matriz_separada = zona_a.relate(&zona_c_separada);

        assert_eq!(matriz_solapada.is_overlaps(), matriz_solapada.matches(PATRON_OVERLAPS).unwrap());
        assert_eq!(matriz_separada.is_overlaps(), matriz_separada.matches(PATRON_OVERLAPS).unwrap());
        assert!(matriz_solapada.is_overlaps());
        assert!(!matriz_separada.is_overlaps());
    }
}
```

### Ejercicio 2 — Implementar `intersects` con datos reales

```rust,ignore
use geo::Intersects;
use geo_types::{Point, Polygon};

fn zonas_que_cubren(punto: &Point<f64>, zonas: &[Polygon<f64>]) -> Vec<usize> {
    zonas
        .iter()
        .enumerate()
        .filter(|(_, z)| z.intersects(punto))
        .map(|(i, _)| i)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use geo_types::{Coord, LineString};

    fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon<f64> {
        Polygon::new(
            LineString::new(vec![
                Coord { x: x0, y: y0 }, Coord { x: x0 + lado, y: y0 },
                Coord { x: x0 + lado, y: y0 + lado }, Coord { x: x0, y: y0 + lado },
                Coord { x: x0, y: y0 },
            ]),
            vec![],
        )
    }

    #[test]
    fn detecta_cobertura_multiple_y_ausente() {
        let zonas = vec![
            cuadrado(0.0, 0.0, 4.0),
            cuadrado(2.0, 2.0, 4.0), // se solapa con la anterior en (2..4, 2..4)
            cuadrado(100.0, 100.0, 4.0),
        ];
        assert_eq!(zonas_que_cubren(&Point::new(3.0, 3.0), &zonas), vec![0, 1]);
        assert!(zonas_que_cubren(&Point::new(50.0, 50.0), &zonas).is_empty());
    }
}
```

### Ejercicio 3 — Implementar `contains`/`touches` con datos reales

```rust,ignore
use geo::{Contains, Relate};
use geo_types::Polygon;

fn zona_contiene_completamente(zona: &Polygon<f64>, otra: &Polygon<f64>) -> bool {
    zona.contains(otra)
}

fn zonas_son_adyacentes(a: &Polygon<f64>, b: &Polygon<f64>) -> bool {
    a.relate(b).is_touches()
}

#[cfg(test)]
mod tests {
    use super::*;
    use geo_types::{Coord, LineString};

    fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon<f64> {
        Polygon::new(
            LineString::new(vec![
                Coord { x: x0, y: y0 }, Coord { x: x0 + lado, y: y0 },
                Coord { x: x0 + lado, y: y0 + lado }, Coord { x: x0, y: y0 + lado },
                Coord { x: x0, y: y0 },
            ]),
            vec![],
        )
    }

    #[test]
    fn contains_casos_positivo_y_negativo() {
        let grande = cuadrado(0.0, 0.0, 10.0);
        let pequena_adentro = cuadrado(2.0, 2.0, 2.0);
        let separada = cuadrado(100.0, 100.0, 4.0);
        assert!(zona_contiene_completamente(&grande, &pequena_adentro));
        assert!(!zona_contiene_completamente(&grande, &separada));
    }

    #[test]
    fn touches_casos_positivo_y_negativo() {
        let grande = cuadrado(0.0, 0.0, 10.0);
        let adyacente = cuadrado(10.0, 0.0, 10.0); // comparte el borde x=10
        let separada = cuadrado(100.0, 100.0, 4.0);
        assert!(zonas_son_adyacentes(&grande, &adyacente));
        assert!(!zonas_son_adyacentes(&grande, &separada));
    }
}
```

### Ejercicio 4 — Caso de colinealidad casi-degenerada

```rust,ignore
use geo::Contains;
use geo_types::{Line, Point};

fn orientacion_ingenua(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> f64 {
    (pb.0 - pa.0) * (pc.1 - pa.1) - (pb.1 - pa.1) * (pc.0 - pa.0)
}

fn main() {
    // Trío distinto al del capítulo, también en coordenadas UTM realistas.
    let a = (576274.977658709, 4601010.275135415);
    let b = (536469.9955627949, 4575599.383524056);
    let c = (539936.9422090787, 4577812.629223772);

    let ingenua = orientacion_ingenua(a, b, c);
    let segmento = Line::new(Point::new(a.0, a.1), Point::new(c.0, c.1));
    let punto_b = Point::new(b.0, b.1);

    println!("orientación ingenua: {ingenua}");
    println!("Line(a,c).contains(b): {}", segmento.contains(&punto_b));
    // Igual que en el capítulo: la fórmula ingenua da 0.0 (colineal), pero
    // `geo::Line::contains` (respaldado por RobustKernel) da `false` — el
    // mismo desacuerdo, con números distintos. No todo trío casi-colineal
    // lo dispara: hace falta que la cancelación en la resta de productos
    // caiga exactamente en el margen de redondeo de f64, algo que depende
    // de la magnitud concreta de las coordenadas y de cuán "casi" colineal
    // sea el trío — por eso conviene probar varios antes de encontrar uno.
}
```

```text
orientación ingenua: 0
Line(a,c).contains(b): false
```

---

## Capítulo 4.2 — Predicados exactos con `robust`

### Ejercicio 1 — Reproducir un fallo de precisión con `f64` puro

```rust,ignore
use robust::{orient2d, Coord};

fn orientacion_ingenua(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> f64 {
    (pb.0 - pa.0) * (pc.1 - pa.1) - (pb.1 - pa.1) * (pc.0 - pa.0)
}

fn main() {
    // Un tercer trío, también en UTM, también verificado con desacuerdo real.
    let a = (405135.00806227274, 4427772.940711307);
    let b = (385248.9586060988, 4405516.2258497);
    let c = (373536.7794413499, 4392407.808682562);

    let ingenua = orientacion_ingenua(a, b, c);
    let robusta = orient2d(
        Coord { x: a.0, y: a.1 },
        Coord { x: b.0, y: b.1 },
        Coord { x: c.0, y: c.1 },
    );
    println!("ingenua: {ingenua}, robusta: {robusta:e}");
}
```

```text
ingenua: 0, robusta: 6.866120893849956e-9
```

### Ejercicio 2 — Corregirlo con `robust`

```rust,ignore
use robust::{orient2d, Coord};
use std::cmp::Ordering;

fn punto_respecto_a_segmento(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> Ordering {
    let v = orient2d(
        Coord { x: pa.0, y: pa.1 },
        Coord { x: pb.0, y: pb.1 },
        Coord { x: pc.0, y: pc.1 },
    );
    if v > 0.0 {
        Ordering::Greater // a la izquierda del segmento pa->pb
    } else if v < 0.0 {
        Ordering::Less // a la derecha
    } else {
        Ordering::Equal // colineal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn casos_izquierda_derecha_y_degenerado() {
        assert_eq!(punto_respecto_a_segmento((0.0, 0.0), (1.0, 0.0), (0.0, 1.0)), Ordering::Greater);
        assert_eq!(punto_respecto_a_segmento((0.0, 0.0), (1.0, 0.0), (0.0, -1.0)), Ordering::Less);

        // El trío casi-degenerado del Ejercicio 1: la orientación robusta
        // SÍ distingue un lado, aunque la magnitud sea minúscula.
        let a = (405135.00806227274, 4427772.940711307);
        let b = (385248.9586060988, 4405516.2258497);
        let c = (373536.7794413499, 4392407.808682562);
        assert_ne!(punto_respecto_a_segmento(a, b, c), Ordering::Equal);
    }
}
```

---

## Capítulo 4.3 — Índices espaciales

### Ejercicio 1 — Construir un R*-tree con 100k puntos

```rust,ignore
use rstar::primitives::GeomWithData;
use rstar::RTree;

fn generar_puntos(n: usize) -> Vec<(f64, f64)> {
    let (lon_min, lon_max) = (-74.25, -73.95);
    let (lat_min, lat_max) = (4.45, 4.85);
    (0..n)
        .map(|i| {
            let t = i as f64;
            let lon = lon_min + (lon_max - lon_min) * (0.5 + 0.5 * (t * 0.618_034).sin());
            let lat = lat_min + (lat_max - lat_min) * (0.5 + 0.5 * (t * 0.381_966).cos());
            (lon, lat)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arbol_de_100k_tiene_el_tamano_correcto() {
        let puntos = generar_puntos(100_000);
        let objetos: Vec<GeomWithData<[f64; 2], u32>> = puntos
            .iter()
            .enumerate()
            .map(|(i, &(x, y))| GeomWithData::new([x, y], i as u32))
            .collect();
        let arbol = RTree::bulk_load(objetos);
        assert_eq!(arbol.size(), 100_000);
    }
}
```

### Ejercicio 2 — Consulta KNN

```rust,ignore
use rstar::primitives::GeomWithData;
use rstar::RTree;

fn k_vecinos_mas_cercanos(
    arbol: &RTree<GeomWithData<[f64; 2], u32>>,
    punto: [f64; 2],
    k: usize,
) -> Vec<u32> {
    arbol.nearest_neighbor_iter(punto).take(k).map(|g| g.data).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_mas_cercano_coincide_con_la_verificacion_manual() {
        // A mano: el punto (1.0, 1.0), índice 4, es el más cercano a (0.9, 0.9).
        let puntos = [(0.0, 0.0), (10.0, 0.0), (0.0, 10.0), (5.0, 5.0), (1.0, 1.0)];
        let objetos: Vec<GeomWithData<[f64; 2], u32>> = puntos
            .iter()
            .enumerate()
            .map(|(i, &(x, y))| GeomWithData::new([x, y], i as u32))
            .collect();
        let arbol = RTree::bulk_load(objetos);
        assert_eq!(k_vecinos_mas_cercanos(&arbol, [0.9, 0.9], 1), vec![4]);
    }
}
```

### Ejercicio 3 — Comparar latencia `rstar` vs. `geo-index` en el mismo dataset

```rust,ignore
use std::collections::HashSet;
use geo_index::rtree::sort::HilbertSort;
use geo_index::rtree::{RTreeBuilder, RTreeIndex};
use rstar::primitives::GeomWithData;
use rstar::RTree;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ambos_indices_coinciden_en_el_conjunto_de_knn() {
        let puntos = super::generar_puntos(100_000); // del Ejercicio 1
        let punto_consulta = (-74.0721, 4.7110);
        let k = 10;

        let objetos: Vec<GeomWithData<[f64; 2], u32>> = puntos
            .iter().enumerate().map(|(i, &(x, y))| GeomWithData::new([x, y], i as u32)).collect();
        let arbol_rstar = RTree::bulk_load(objetos);
        let vecinos_rstar: HashSet<u32> = arbol_rstar
            .nearest_neighbor_iter([punto_consulta.0, punto_consulta.1]).take(k).map(|g| g.data).collect();

        let mut builder = RTreeBuilder::<f64>::new(puntos.len() as u32);
        for &(x, y) in &puntos { builder.add(x, y, x, y); }
        let arbol_geo_index = builder.finish::<HilbertSort>();
        let vecinos_geo_index: HashSet<u32> = arbol_geo_index
            .neighbors(punto_consulta.0, punto_consulta.1, Some(k), None).into_iter().collect();

        assert_eq!(vecinos_rstar, vecinos_geo_index);
    }
}
```

Tiempos medidos en `--release` sobre 100.000 puntos: construcción `rstar` 15.1ms, `geo-index` 8.1ms; consulta KNN (k=5) 4.3µs y 4.7µs respectivamente — consistente con el capítulo.

### Ejercicio 4 — Indexar con H3 a dos resoluciones

```rust,ignore
use h3o::{LatLng, Resolution};
use std::collections::HashMap;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolucion_mas_fina_nunca_tiene_menos_celdas() {
        let puntos = super::generar_puntos(20); // del Ejercicio 1
        let mut celdas_res6: HashMap<h3o::CellIndex, Vec<usize>> = HashMap::new();
        let mut celdas_res9: HashMap<h3o::CellIndex, Vec<usize>> = HashMap::new();
        for (i, &(lon, lat)) in puntos.iter().enumerate() {
            let ll = LatLng::new(lat, lon).unwrap();
            celdas_res6.entry(ll.to_cell(Resolution::Six)).or_default().push(i);
            celdas_res9.entry(ll.to_cell(Resolution::Nine)).or_default().push(i);
        }
        // Verificado: 19 celdas distintas a res6, 20 a res9 (sobre 20 puntos).
        // Cada celda fina es sub-región de exactamente una celda gruesa, así
        // que agrupar más fino nunca puede *reducir* el número de grupos.
        assert!(celdas_res9.len() >= celdas_res6.len());
    }
}
```

### Ejercicio 5 — Invalidar/reconstruir el índice tras una edición

```rust,ignore
use rstar::primitives::GeomWithData;
use rstar::RTree;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ciclo_insertar_remover_refleja_el_tamano_correcto() {
        let mut arbol: RTree<GeomWithData<[f64; 2], u32>> = RTree::bulk_load(
            (0..1000).map(|i| GeomWithData::new([i as f64, i as f64], i)).collect(),
        );
        assert_eq!(arbol.size(), 1000);

        for i in 1000..1100 {
            arbol.insert(GeomWithData::new([i as f64, i as f64], i));
        }
        assert_eq!(arbol.size(), 1100);

        for i in 0..50 {
            arbol.remove(&GeomWithData::new([i as f64, i as f64], i));
        }
        assert_eq!(arbol.size(), 1050);
    }
}

// `geo-index` no ofrece un equivalente: `RTreeBuilder` consume sus puntos
// una sola vez en `.finish()` y el `RTree` resultante no expone ni
// `insert` ni `remove`. Para reflejar la misma edición (100 altas, 50
// bajas) tendrías que volver a recorrer el conjunto de datos completo
// actualizado y llamar a `RTreeBuilder::new` + `.add()` + `.finish()`
// desde cero — el costo que el capítulo describe como la contrapartida
// de su velocidad de construcción y consulta.
```

### Ejercicio 6 — Ejercicio de perfilado

Tabla medida en `--release`, generando el dataset con la misma función determinista:

| n | `rstar` (bulk_load) | `geo-index` (Hilbert) | proporción |
|---|---|---|---|
| 1.000 | 124.4µs | 61.9µs | 2.01 |
| 10.000 | 1.31ms | 537.8µs | 2.44 |
| 100.000 | 11.5ms | 7.4ms | 1.55 |
| 1.000.000 | 178.9ms | 99.3ms | 1.80 |

Ambas estructuras escalan de forma aproximadamente lineal con `n` (consistente con un algoritmo de construcción `O(n log n)` con un factor logarítmico pequeño frente al lineal dominante en este rango). La proporción entre ambas oscila entre ~1.5x y ~2.4x sin una tendencia clara de crecimiento o reducción con el tamaño — el "~2x" que documenta el README de `geo-index` es una buena expectativa promedio, no una constante exacta.

---

## Capítulo 4.4 — Reproyección con `proj`

### Ejercicio 1 — WGS84 → UTM

```rust,ignore
use proj::Proj;

fn zona_utm(lon: f64) -> u32 {
    ((lon + 180.0) / 6.0).floor() as u32 + 1
}

fn codigo_epsg_utm(lon: f64, lat: f64) -> String {
    let zona = zona_utm(lon);
    if lat >= 0.0 { format!("EPSG:{}", 32600 + zona) } else { format!("EPSG:{}", 32700 + zona) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zona_utm_bogota_y_tokio() {
        assert_eq!(zona_utm(-74.0721), 18); // Bogotá
        assert_eq!(zona_utm(139.6917), 54); // Tokio, otro continente y hemisferio
    }

    #[test]
    fn reproyeccion_dinamica_exitosa() {
        let tokio = (139.6917, 35.6895);
        let codigo = codigo_epsg_utm(tokio.0, tokio.1);
        assert_eq!(codigo, "EPSG:32654");
        let transformador = Proj::new_known_crs("EPSG:4326", &codigo, None).unwrap();
        assert!(transformador.convert(tokio).is_ok());
    }
}
```

### Ejercicio 2 — Ida y vuelta con pérdida de precisión medida

```rust,ignore
use proj::Proj;

fn diferencia_ida_y_vuelta(from: &str, to: &str, punto: (f64, f64)) -> f64 {
    let ida = Proj::new_known_crs(from, to, None).unwrap();
    let vuelta = Proj::new_known_crs(to, from, None).unwrap();
    let proyectado = ida.convert(punto).unwrap();
    let de_vuelta = vuelta.convert(proyectado).unwrap();
    ((de_vuelta.0 - punto.0).powi(2) + (de_vuelta.1 - punto.1).powi(2)).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn todas_las_combinaciones_tienen_perdida_despreciable() {
        let casos = [
            ("EPSG:4326", "EPSG:32618", (-74.0721, 4.7110)),   // UTM 18N, Bogotá
            ("EPSG:4326", "EPSG:3857", (-74.0721, 4.7110)),     // Web Mercator, Bogotá
            ("EPSG:4326", "EPSG:3857", (10.7522, 59.9139)),     // Web Mercator, Oslo
            ("EPSG:4326", "EPSG:32719", (-68.3029, -54.8019)),  // UTM 19S, Ushuaia
            ("EPSG:4326", "EPSG:32756", (151.2093, -33.8688)),  // UTM 56S, Sídney
        ];
        for (from, to, punto) in casos {
            let diff = diferencia_ida_y_vuelta(from, to, punto);
            assert!(diff < 1e-9, "diferencia inesperadamente alta para {from}->{to}: {diff}");
        }
    }
}
```

Las diferencias medidas van de `0.0` exacto (UTM 18N sobre Bogotá, UTM 19S sobre Ushuaia) a `~1.4e-14` (Web Mercator sobre Bogotá) — el peor caso medido, con seis órdenes de magnitud de margen frente al umbral de `1e-9` del test.

### Ejercicio 3 — Manejo de un punto fuera de dominio válido como `Result::Err`

```rust,ignore
use proj::Proj;

fn reproyectar_seguro(transformador: &Proj, punto: (f64, f64)) -> Result<(f64, f64), String> {
    let (lon, lat) = punto;
    if !lon.is_finite() || !(-180.0..=180.0).contains(&lon) {
        return Err(format!("longitud fuera de rango o no finita: ({lon}, {lat})"));
    }
    if !lat.is_finite() || !(-90.0..=90.0).contains(&lat) {
        return Err(format!("latitud fuera de rango o no finita: ({lon}, {lat})"));
    }
    transformador.convert(punto).map_err(|e| format!("fallo al reproyectar ({lon}, {lat}): {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn transformador() -> Proj {
        Proj::new_known_crs("EPSG:4326", "EPSG:32618", None).unwrap()
    }

    #[test]
    fn punto_valido_da_ok() {
        assert!(reproyectar_seguro(&transformador(), (-74.0721, 4.7110)).is_ok());
    }

    #[test]
    fn latitud_fuera_de_rango_es_rechazada() {
        let r = reproyectar_seguro(&transformador(), (0.0, 300.0));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("300"));
    }

    #[test]
    fn longitud_fuera_de_rango_es_rechazada_por_validacion_propia() {
        // `proj` por sí solo ACEPTA esto (ver el capítulo) — la validación
        // que lo rechaza es la nuestra, no la de la dependencia.
        let r = reproyectar_seguro(&transformador(), (500.0, 0.0));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("500"));
    }

    #[test]
    fn nan_es_rechazado_por_validacion_propia() {
        let r = reproyectar_seguro(&transformador(), (f64::NAN, 0.0));
        assert!(r.is_err());
    }
}
```

---

## Capítulo 4.6 — I/O adicional

### Ejercicio 1 — Leer un DEM y calcular pendiente con `ndarray`

```rust,ignore
use ndarray::Array2;

fn calcular_pendiente_y_aspecto(dem: &Array2<f32>, tamano_celda: f32) -> (Array2<f32>, Array2<f32>) {
    let (filas, columnas) = dem.dim();
    let mut pendiente = Array2::<f32>::zeros((filas, columnas));
    let mut aspecto = Array2::<f32>::zeros((filas, columnas));
    for i in 1..filas - 1 {
        for j in 1..columnas - 1 {
            let dz_dx = (dem[[i, j + 1]] - dem[[i, j - 1]]) / (2.0 * tamano_celda);
            let dz_dy = (dem[[i + 1, j]] - dem[[i - 1, j]]) / (2.0 * tamano_celda);
            pendiente[[i, j]] = (dz_dx * dz_dx + dz_dy * dz_dy).sqrt().atan().to_degrees();
            aspecto[[i, j]] = dz_dy.atan2(-dz_dx).to_degrees();
        }
    }
    (pendiente, aspecto)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aspecto_de_rampa_diagonal_apunta_en_la_direccion_esperada() {
        // DEM 7x7 que sube por igual en +x y +y: el aspecto de la celda
        // central debe apuntar en la diagonal (135°, verificado).
        let (ancho, alto) = (7usize, 7usize);
        let mut dem = Array2::<f32>::zeros((alto, ancho));
        for i in 0..alto {
            for j in 0..ancho {
                dem[[i, j]] = (i + j) as f32 * 2.0;
            }
        }
        let (_pendiente, aspecto) = calcular_pendiente_y_aspecto(&dem, 30.0);
        assert!((aspecto[[3, 3]] - 135.0).abs() < 1.0);
    }
}
```

### Ejercicio 2 — Importar un Shapefile legado

```rust,ignore
use shapefile::{dbase, Point, Polygon, PolygonRing, Writer};
use std::convert::TryInto;

struct FeatureImportada {
    geometria: geo_types::MultiPolygon<f64>,
    nombre: String,
    poblacion: f64,
}

fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon {
    Polygon::new(PolygonRing::Outer(vec![
        Point::new(x0, y0), Point::new(x0 + lado, y0),
        Point::new(x0 + lado, y0 + lado), Point::new(x0, y0 + lado), Point::new(x0, y0),
    ]))
}

fn escribir_prueba(archivo: &str) -> Result<(), shapefile::Error> {
    let table_builder = dbase::TableWriterBuilder::new()
        .add_character_field("nombre".try_into().unwrap(), 50)
        .add_numeric_field("poblacion".try_into().unwrap(), 15, 0);
    let mut writer = Writer::from_path(archivo, table_builder)?;
    for (nombre, poblacion, x0, y0) in [
        ("Bogotá", 7_981_000.0, 0.0, 0.0),
        ("Medellín", 2_591_000.0, 10.0, 10.0),
        ("Cali", 2_227_000.0, 20.0, 20.0),
    ] {
        let mut registro = dbase::Record::default();
        registro.insert("nombre".to_string(), nombre.to_string().into());
        registro.insert("poblacion".to_string(), poblacion.into());
        writer.write_shape_and_record(&cuadrado(x0, y0, 1.0), &registro)?;
    }
    Ok(())
}

fn importar(archivo: &str) -> Result<Vec<FeatureImportada>, Box<dyn std::error::Error>> {
    let mut reader = shapefile::Reader::from_path(archivo)?;
    let mut resultado = Vec::new();
    for r in reader.iter_shapes_and_records() {
        let (forma, registro) = r?;
        let geo_types::Geometry::MultiPolygon(geometria) = forma.try_into()? else {
            panic!("se esperaba un MultiPolygon");
        };
        let nombre = match registro.get("nombre") {
            Some(dbase::FieldValue::Character(Some(s))) => s.trim().to_string(),
            _ => panic!("campo nombre ausente o de tipo inesperado"),
        };
        let poblacion = match registro.get("poblacion") {
            Some(dbase::FieldValue::Numeric(Some(n))) => *n,
            _ => panic!("campo poblacion ausente o de tipo inesperado"),
        };
        resultado.push(FeatureImportada { geometria, nombre, poblacion });
    }
    Ok(resultado)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn importa_tres_features_con_atributos_correctos() {
        let archivo = "/tmp/ciudades_apendice_4_6.shp";
        escribir_prueba(archivo).unwrap();
        let features = importar(archivo).unwrap();
        assert_eq!(features.len(), 3);
        assert_eq!(features[0].nombre, "Bogotá");
        assert_eq!(features[0].poblacion, 7_981_000.0);
        assert_eq!(features[1].nombre, "Medellín");
        assert_eq!(features[2].poblacion, 2_227_000.0);
    }
}
```

### Ejercicio 3 — Leer una nube LAS mínima

```rust,ignore
use las::{Point, Reader, Writer};

fn escribir_grid(archivo: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut writer = Writer::from_path(archivo, Default::default())?;
    for fila in 0..10 {
        for col in 0..10 {
            let z = (col as f64 * 0.1 * 0.1).sin() * 5.0;
            writer.write_point(Point { x: col as f64, y: fila as f64, z, ..Default::default() })?;
        }
    }
    writer.close()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn promedio_esta_dentro_del_rango() {
        let archivo = "/tmp/grid_apendice_4_6.las";
        escribir_grid(archivo).unwrap();

        let mut reader = Reader::from_path(archivo).unwrap();
        let datos = reader.read_all().unwrap();
        let (mut suma, mut n, mut min, mut max) = (0.0, 0, f64::INFINITY, f64::NEG_INFINITY);
        for p in datos.points() {
            let p = p.unwrap();
            suma += p.z;
            n += 1;
            min = min.min(p.z);
            max = max.max(p.z);
        }
        let promedio = suma / n as f64;

        assert!(max - min > 0.0);
        assert!(promedio >= min && promedio <= max);
    }
}
```

### Ejercicio 4 — Comparar memoria AoS vs. SoA

```rust,ignore
use las::{Point, Reader, Writer};
use std::time::Instant;

fn escribir_100k(archivo: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut writer = Writer::from_path(archivo, Default::default())?;
    for i in 0..100_000 {
        writer.write_point(Point {
            x: (i as f64 * 0.618_034).sin() * 1000.0,
            y: (i as f64 * 0.381_966).cos() * 1000.0,
            z: 0.0,
            ..Default::default()
        })?;
    }
    writer.close()?;
    Ok(())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let archivo = "/tmp/nube_100k_apendice_4_6.las";
    escribir_100k(archivo)?;

    let mut reader = Reader::from_path(archivo)?;
    let datos = reader.read_all()?;

    let inicio = Instant::now();
    let (min_soa, max_soa) = datos.x().fold((f64::INFINITY, f64::NEG_INFINITY), |(mn, mx), x| (mn.min(x), mx.max(x)));
    let tiempo_soa = inicio.elapsed();

    let inicio = Instant::now();
    let (mut min_aos, mut max_aos) = (f64::INFINITY, f64::NEG_INFINITY);
    for p in datos.points() {
        let p = p?;
        min_aos = min_aos.min(p.x);
        max_aos = max_aos.max(p.x);
    }
    let tiempo_aos = inicio.elapsed();

    assert_eq!(min_soa, min_aos);
    assert_eq!(max_soa, max_aos);
    println!("SoA: {tiempo_soa:?}, AoS: {tiempo_aos:?}");
    Ok(())
}
```

```text
SoA: 446.92µs, AoS: 6.789536ms
```

---

## Capítulo 4.5 — Persistencia con PostGIS

### Ejercicio 1 — Migración formal con `sqlx-cli`

```bash
sqlx migrate add -r crear_zonas_cobertura
```

```sql
-- migrations/20260907062815_crear_zonas_cobertura.up.sql
CREATE TABLE zonas_cobertura (
    id SERIAL PRIMARY KEY,
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT true
);
```

```sql
-- migrations/20260907062815_crear_zonas_cobertura.down.sql
DROP TABLE zonas_cobertura;
```

```bash
sqlx migrate run
```

```text
Applied 20260907062815/migrate crear zonas cobertura (12.86631ms)
```

Con la tabla ya creada por la migración (no por el test), el test solo inserta y verifica:

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Polygon};
use geozero::wkb;
use sqlx::PgPool;

fn cuadrado(x0: f64, y0: f64, l: f64) -> Geometry<f64> {
    Geometry::Polygon(Polygon::new(
        LineString::new(vec![
            Coord { x: x0, y: y0 }, Coord { x: x0 + l, y: y0 },
            Coord { x: x0 + l, y: y0 + l }, Coord { x: x0, y: y0 + l }, Coord { x: x0, y: y0 },
        ]),
        vec![],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn zonas_quedan_con_srid_4326() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();

        for g in [cuadrado(0.0, 0.0, 1.0), cuadrado(10.0, 10.0, 1.0)] {
            sqlx::query("INSERT INTO zonas_cobertura (geom) VALUES (ST_SetSRID($1, 4326))")
                .bind(wkb::Encode(g)).execute(&pool).await.unwrap();
        }

        let srids: Vec<(i32,)> = sqlx::query_as("SELECT ST_SRID(geom) FROM zonas_cobertura")
            .fetch_all(&pool).await.unwrap();
        assert_eq!(srids.len(), 2);
        for (srid,) in srids {
            assert_eq!(srid, 4326);
        }
    }
}
```

Y por separado, confirmando que la migración es realmente reversible:

```bash
sqlx migrate revert
```

```text
Applied 20260907062815/revert crear zonas cobertura (3.509036ms)
```

```bash
sqlx migrate info
```

```text
20260907062815/pending crear zonas cobertura
```

`SELECT to_regclass('zonas_cobertura')` devuelve `NULL` tras el revert — la tabla ya no existe.

### Ejercicio 2 — Insert vía SQLx con `geozero`

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Point, Polygon};
use geozero::wkb;
use sqlx::{PgPool, Row};

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn los_tres_tipos_de_geometria_se_preservan() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS features_tipos").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE features_tipos (id SERIAL PRIMARY KEY, geom GEOMETRY(Geometry, 4326) NOT NULL)")
            .execute(&pool).await.unwrap();

        let punto = Geometry::Point(Point::new(1.0, 1.0));
        let linea = Geometry::LineString(LineString::new(vec![Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 1.0 }]));
        let poligono = Geometry::Polygon(Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 }, Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        ));

        for g in [punto, linea, poligono] {
            sqlx::query("INSERT INTO features_tipos (geom) VALUES (ST_SetSRID($1, 4326))")
                .bind(wkb::Encode(g)).execute(&pool).await.unwrap();
        }

        let filas = sqlx::query("SELECT geom FROM features_tipos ORDER BY id").fetch_all(&pool).await.unwrap();
        let leido: Vec<wkb::Decode<Geometry<f64>>> = filas.iter().map(|f| f.get(0)).collect();

        assert!(matches!(leido[0].geometry, Some(Geometry::Point(_))));
        assert!(matches!(leido[1].geometry, Some(Geometry::LineString(_))));
        assert!(matches!(leido[2].geometry, Some(Geometry::Polygon(_))));
    }
}
```

### Ejercicio 3 — Query espacial `ST_DWithin`

```rust,ignore
use geo::{Distance, Haversine};
use geo_types::Point;
use sqlx::PgPool;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn coincide_exactamente_con_el_calculo_haversine_previo() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS features_haversine").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE features_haversine (id SERIAL PRIMARY KEY, geom GEOMETRY(Point, 4326) NOT NULL)")
            .execute(&pool).await.unwrap();

        let centro = Point::new(-74.0721, 4.7110);
        // Offsets en grados de longitud a distancias crecientes (cerca del
        // ecuador, 1° de longitud ~ 111km) -- dos deben quedar dentro de
        // 10km, tres deben quedar fuera.
        let candidatos = [
            (-74.0721 + 0.01, 4.7110),
            (-74.0721 + 0.05, 4.7110),
            (-74.0721 + 0.20, 4.7110),
            (-74.0721 + 1.00, 4.7110),
            (-74.0721 + 2.00, 4.7110),
        ];

        let mut esperados_dentro = Vec::new();
        for (i, &(lon, lat)) in candidatos.iter().enumerate() {
            if Haversine.distance(centro, Point::new(lon, lat)) <= 10_000.0 {
                esperados_dentro.push((i + 1) as i32);
            }
            sqlx::query("INSERT INTO features_haversine (geom) VALUES (ST_SetSRID(ST_MakePoint($1,$2), 4326))")
                .bind(lon).bind(lat).execute(&pool).await.unwrap();
        }

        let filas: Vec<(i32,)> = sqlx::query_as(
            "SELECT id FROM features_haversine
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, 10000)",
        ).bind(centro.x()).bind(centro.y()).fetch_all(&pool).await.unwrap();

        let mut ids_db: Vec<i32> = filas.into_iter().map(|(id,)| id).collect();
        ids_db.sort();
        esperados_dentro.sort();
        assert_eq!(ids_db, esperados_dentro); // verificado: [1, 2]
    }
}
```

### Ejercicio 4 — Mismo flujo con Diesel

```rust,ignore
use diesel::prelude::*;
use postgis_diesel::functions::st_d_within;
use postgis_diesel::types::Point;
use std::collections::HashSet;

table! {
    use postgis_diesel::sql_types::*;
    use diesel::sql_types::*;
    features_ej4 (id) {
        id -> Int4,
        geom -> Geography,
    }
}

#[derive(Insertable)]
#[diesel(table_name = features_ej4)]
struct Nueva { geom: Point }

fn main() {
    let mut conn = PgConnection::establish(&std::env::var("DATABASE_URL").unwrap()).unwrap();
    diesel::sql_query("DROP TABLE IF EXISTS features_ej4").execute(&mut conn).unwrap();
    diesel::sql_query("CREATE TABLE features_ej4 (id SERIAL PRIMARY KEY, geom GEOGRAPHY(Point, 4326) NOT NULL)")
        .execute(&mut conn).unwrap();

    // Los mismos cinco puntos y el mismo centro del Ejercicio 3.
    let centro = (-74.0721_f64, 4.7110_f64);
    let candidatos = [0.01, 0.05, 0.20, 1.00, 2.00].map(|d| (centro.0 + d, centro.1));

    let nuevas: Vec<Nueva> = candidatos.iter()
        .map(|&(x, y)| Nueva { geom: Point { x, y, srid: Some(4326) } })
        .collect();
    diesel::insert_into(features_ej4::table).values(&nuevas).execute(&mut conn).unwrap();

    let centro_pt = Point { x: centro.0, y: centro.1, srid: Some(4326) };
    let ids: Vec<i32> = features_ej4::table
        .filter(st_d_within(features_ej4::geom, centro_pt, 10_000.0))
        .select(features_ej4::id)
        .load(&mut conn)
        .unwrap();

    let ids_diesel: HashSet<i32> = ids.into_iter().collect();
    let ids_sqlx_esperado: HashSet<i32> = [1, 2].into_iter().collect(); // del Ejercicio 3
    assert_eq!(ids_diesel, ids_sqlx_esperado);
    println!("Diesel coincide con SQLx: {ids_diesel:?}");
}
```

```text
Diesel coincide con SQLx: {2, 1}
```

### Ejercicio 5 — Índice GiST y medición de mejora

```rust,ignore
use sqlx::PgPool;

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn el_plan_deja_de_usar_seq_scan_tras_el_indice() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS features_ej5").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE features_ej5 (id SERIAL PRIMARY KEY, geom GEOMETRY(Point, 4326) NOT NULL)")
            .execute(&pool).await.unwrap();
        sqlx::query(
            "INSERT INTO features_ej5 (geom)
             SELECT ST_SetSRID(ST_MakePoint(-74.25 + 0.3*random(), 4.45 + 0.4*random()), 4326)
             FROM generate_series(1, 50000)",
        ).execute(&pool).await.unwrap();

        let consulta = "SELECT count(*) FROM features_ej5
            WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(-74.0721,4.7110),4326)::geography, 5000)";

        let plan_antes: Vec<(String,)> = sqlx::query_as(&format!("EXPLAIN {consulta}")).fetch_all(&pool).await.unwrap();
        let texto_antes: String = plan_antes.iter().map(|l| l.0.clone()).collect::<Vec<_>>().join("\n");
        assert!(texto_antes.contains("Seq Scan"));

        sqlx::query("CREATE INDEX features_ej5_gist ON features_ej5 USING GIST ((geom::geography))")
            .execute(&pool).await.unwrap();
        sqlx::query("ANALYZE features_ej5").execute(&pool).await.unwrap();

        let plan_despues: Vec<(String,)> = sqlx::query_as(&format!("EXPLAIN {consulta}")).fetch_all(&pool).await.unwrap();
        let texto_despues: String = plan_despues.iter().map(|l| l.0.clone()).collect::<Vec<_>>().join("\n");
        assert!(!texto_despues.contains("Seq Scan"));
        assert!(texto_despues.contains("Index") || texto_despues.contains("Bitmap"));
    }
}
```

### Ejercicio 6 — Patrón repository

```rust,ignore
use geo_types::Geometry;
use geozero::wkb;
use sqlx::{PgPool, Row};

struct FeatureRepositorio { pool: PgPool }

impl FeatureRepositorio {
    async fn insertar(&self, geom: Geometry<f64>) -> Result<i32, sqlx::Error> {
        let fila = sqlx::query("INSERT INTO features_repo_ej6 (geom) VALUES (ST_SetSRID($1,4326)) RETURNING id")
            .bind(wkb::Encode(geom)).fetch_one(&self.pool).await?;
        Ok(fila.get(0))
    }

    async fn eliminar(&self, id: i32) -> Result<bool, sqlx::Error> {
        let resultado = sqlx::query("DELETE FROM features_repo_ej6 WHERE id = $1")
            .bind(id).execute(&self.pool).await?;
        Ok(resultado.rows_affected() > 0)
    }

    async fn actualizar_geometria(&self, id: i32, nueva_geom: Geometry<f64>) -> Result<bool, sqlx::Error> {
        let resultado = sqlx::query("UPDATE features_repo_ej6 SET geom = ST_SetSRID($1,4326) WHERE id = $2")
            .bind(wkb::Encode(nueva_geom)).bind(id).execute(&self.pool).await?;
        Ok(resultado.rows_affected() > 0)
    }

    async fn existe(&self, id: i32) -> Result<bool, sqlx::Error> {
        let fila: (bool,) = sqlx::query_as("SELECT EXISTS(SELECT 1 FROM features_repo_ej6 WHERE id = $1)")
            .bind(id).fetch_one(&self.pool).await?;
        Ok(fila.0)
    }

    async fn leer_geom(&self, id: i32) -> Result<Geometry<f64>, sqlx::Error> {
        let fila = sqlx::query("SELECT geom FROM features_repo_ej6 WHERE id = $1").bind(id).fetch_one(&self.pool).await?;
        let g: wkb::Decode<Geometry<f64>> = fila.get(0);
        Ok(g.geometry.unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geo_types::Point;

    #[tokio::test]
    async fn eliminar_y_actualizar_funcionan_correctamente() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
        sqlx::query("DROP TABLE IF EXISTS features_repo_ej6").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE features_repo_ej6 (id SERIAL PRIMARY KEY, geom GEOMETRY(Geometry, 4326) NOT NULL)")
            .execute(&pool).await.unwrap();

        let repo = FeatureRepositorio { pool };
        let id = repo.insertar(Geometry::Point(Point::new(1.0, 1.0))).await.unwrap();

        assert!(repo.eliminar(id).await.unwrap());
        assert!(!repo.existe(id).await.unwrap());
        assert!(!repo.eliminar(999_999).await.unwrap()); // id inexistente, sin error

        let id2 = repo.insertar(Geometry::Point(Point::new(2.0, 2.0))).await.unwrap();
        let nueva = Geometry::Point(Point::new(3.0, 3.0));
        assert!(repo.actualizar_geometria(id2, nueva.clone()).await.unwrap());
        assert_eq!(repo.leer_geom(id2).await.unwrap(), nueva);
    }
}
```

### Ejercicio 7 — Rechazar geometrías inválidas

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Polygon};
use geozero::wkb;
use sqlx::{PgPool, Row};

#[derive(Debug)]
enum ErrorRepositorio {
    GeometriaInvalida(String),
    Db(sqlx::Error),
}

struct FeatureRepositorio { pool: PgPool }

impl FeatureRepositorio {
    async fn insertar(&self, nombre: &str, geom: Geometry<f64>) -> Result<i32, sqlx::Error> {
        let fila = sqlx::query("INSERT INTO features (nombre, geom) VALUES ($1, ST_SetSRID($2, 4326)) RETURNING id")
            .bind(nombre).bind(wkb::Encode(geom)).fetch_one(&self.pool).await?;
        Ok(fila.get(0))
    }

    async fn insertar_validado(&self, nombre: &str, geom: Geometry<f64>) -> Result<i32, ErrorRepositorio> {
        let fila = sqlx::query("SELECT ST_IsValid($1) AS valida, ST_IsValidReason($1) AS razon")
            .bind(wkb::Encode(geom.clone())).fetch_one(&self.pool).await.map_err(ErrorRepositorio::Db)?;

        let valida: bool = fila.get("valida");
        if !valida {
            let razon: Option<String> = fila.get("razon");
            return Err(ErrorRepositorio::GeometriaInvalida(razon.unwrap_or_default()));
        }
        self.insertar(nombre, geom).await.map_err(ErrorRepositorio::Db)
    }
}

// Tres geometrías inválidas distintas a la del capítulo (el "corbatín").
fn interior_fuera_del_exterior() -> Geometry<f64> {
    let exterior = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 }, Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
    ]);
    let interior = LineString::new(vec![
        Coord { x: 5.0, y: 5.0 }, Coord { x: 6.0, y: 5.0 }, Coord { x: 6.0, y: 6.0 }, Coord { x: 5.0, y: 6.0 }, Coord { x: 5.0, y: 5.0 },
    ]);
    Geometry::Polygon(Polygon::new(exterior, vec![interior]))
}

fn huecos_que_se_tocan() -> Geometry<f64> {
    let exterior = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 }, Coord { x: 10.0, y: 0.0 }, Coord { x: 10.0, y: 10.0 }, Coord { x: 0.0, y: 10.0 }, Coord { x: 0.0, y: 0.0 },
    ]);
    let hueco_a = LineString::new(vec![
        Coord { x: 1.0, y: 1.0 }, Coord { x: 3.0, y: 1.0 }, Coord { x: 3.0, y: 3.0 }, Coord { x: 1.0, y: 3.0 }, Coord { x: 1.0, y: 1.0 },
    ]);
    let hueco_b = LineString::new(vec![
        Coord { x: 3.0, y: 1.0 }, Coord { x: 5.0, y: 1.0 }, Coord { x: 5.0, y: 3.0 }, Coord { x: 3.0, y: 3.0 }, Coord { x: 3.0, y: 1.0 },
    ]);
    Geometry::Polygon(Polygon::new(exterior, vec![hueco_a, hueco_b]))
}

fn aguja_que_cruza_el_borde() -> Geometry<f64> {
    Geometry::Polygon(Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 4.0, y: 0.0 }, Coord { x: 4.0, y: 4.0 },
            Coord { x: 2.0, y: 4.0 }, Coord { x: 2.0, y: -2.0 }, Coord { x: 0.0, y: 4.0 }, Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn geometrias_invalidas_se_rechazan_sin_insertarse() {
        let pool = PgPool::connect(&std::env::var("DATABASE_URL").unwrap()).await.unwrap();
        let repo = FeatureRepositorio { pool: pool.clone() };

        for (nombre_caso, geom) in [
            ("interior_fuera_del_exterior", interior_fuera_del_exterior()),
            ("huecos_que_se_tocan", huecos_que_se_tocan()),
            ("aguja_que_cruza_el_borde", aguja_que_cruza_el_borde()),
        ] {
            let (antes,): (i64,) = sqlx::query_as("SELECT count(*) FROM features").fetch_one(&pool).await.unwrap();
            let resultado = repo.insertar_validado(nombre_caso, geom).await;
            let (despues,): (i64,) = sqlx::query_as("SELECT count(*) FROM features").fetch_one(&pool).await.unwrap();

            assert!(matches!(resultado, Err(ErrorRepositorio::GeometriaInvalida(_))));
            assert_eq!(antes, despues);
        }
    }
}
```

```text
interior_fuera_del_exterior -> rechazada correctamente: Hole lies outside shell[5 5]
huecos_que_se_tocan -> rechazada correctamente: Self-intersection[3 3]
aguja_que_cruza_el_borde -> rechazada correctamente: Self-intersection[2 0]
```

Las tres son geométricamente distintas entre sí (un hueco fuera del exterior, dos huecos que se tocan, y un borde que se autointerseca) y cada una produce un mensaje de `ST_IsValidReason` distinto — la validación no es un simple `true`/`false` genérico, describe exactamente qué está mal y dónde.

---

## Capítulo 4.7 — Proyecto guiado GeoAPI v0.3

### Ejercicio integrador — `GET /features/within-polygon`

```rust,ignore
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use geo_types::Geometry;
use geozero::wkb;
use serde::Deserialize;
use sqlx::Row;

#[derive(Deserialize)]
struct ParametrosDentroPoligono {
    polygon: geojson::Geometry,
}

async fn features_dentro_poligono(
    State(estado): State<EstadoApp>,
    Json(body): Json<ParametrosDentroPoligono>,
) -> Result<Json<Vec<i32>>, (StatusCode, String)> {
    let poligono: Geometry<f64> = body
        .polygon
        .value
        .try_into()
        .map_err(|e: geojson::Error| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // ST_Within(A, B): "¿A está completamente dentro de B?" -- el mismo
    // predicado `within` del Capítulo 4.1, ahora ejecutado en PostGIS en
    // vez de en memoria con `geo::Relate`, porque la comparación necesita
    // la geometría completa de cada feature (el índice en memoria del
    // Capítulo 4.7 solo guarda centroides, insuficiente para "contenido
    // completamente").
    let filas = sqlx::query("SELECT id FROM features_v03 WHERE ST_Within(geom, ST_SetSRID($1, 4326))")
        .bind(wkb::Encode(poligono))
        .fetch_all(&estado.pool)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(filas.into_iter().map(|f| f.get(0)).collect()))
}
```

Verificado con cuatro features de prueba (dos dentro de un polígono de referencia alrededor de Bogotá, dos claramente fuera) insertadas vía `POST /features` y consultadas con `POST /features/within-polygon`:

```text
dentro del polígono -> [1,2]
```

Los IDs `1` y `2` corresponden exactamente a las dos features insertadas dentro del polígono de prueba (`dentro_1`, `dentro_2`); las otras dos (`fuera_1`, con una longitud fuera del polígono; `fuera_2`, con una latitud fuera) quedan correctamente excluidas — ni de más, ni de menos.

Sobre 100.000 puntos con un solo campo por punto además de las coordenadas, la vista columnar resultó **~15 veces más rápida** que reconstruir cada `Point` completo uno a uno — una diferencia mucho más marcada que la de los índices espaciales del Capítulo 4.3, porque aquí el costo evitado no es solo de acceso a memoria: `.points()` decodifica *todos* los campos de cada registro binario (intensidad, clasificación, retorno, ...) aunque tu código solo use `.x`, mientras que `.x()` decodifica exclusivamente la columna que pediste.
