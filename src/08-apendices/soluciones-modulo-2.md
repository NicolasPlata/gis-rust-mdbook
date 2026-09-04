# Apéndice — Soluciones de ejercicios: Módulo 2 (Primitivas geoespaciales)

> Todo el código de este apéndice se verificó compilando y ejecutando contra `geo` 0.33.1, `geo-types` 0.7.20, `geojson` 1.0.0 y `wkt` 0.14.0 — ver la Decisión #8 en `BACKLOG.md` sobre cómo se verifica el código de este módulo, ya que `mdbook test` no soporta dependencias externas.

## Capítulo 3.1 — Modelo OGC Simple Features en Rust

### Ejercicio 1 — Instanciar cada primitiva

```rust,ignore
use geo_types::{Coord, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon};

fn main() {
    let punto = Point::new(-74.07, 4.71);

    let linea = LineString::new(vec![
        Coord { x: -74.07, y: 4.71 },
        Coord { x: -75.56, y: 6.25 },
    ]);

    let poligono = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 4.0, y: 0.0 },
            Coord { x: 4.0, y: 4.0 }, Coord { x: 0.0, y: 4.0 }, Coord { x: 0.0, y: 0.0 },
        ]),
        vec![LineString::new(vec![
            Coord { x: 1.0, y: 1.0 }, Coord { x: 2.0, y: 1.0 },
            Coord { x: 2.0, y: 2.0 }, Coord { x: 1.0, y: 2.0 }, Coord { x: 1.0, y: 1.0 },
        ])],
    );

    let multipunto = MultiPoint::new(vec![Point::new(0.0, 0.0), Point::new(1.0, 1.0)]);
    let multilinea = MultiLineString::new(vec![linea.clone(), linea.clone()]);
    let multipoligono = MultiPolygon::new(vec![poligono.clone(), poligono.clone()]);

    println!("Point: ({}, {})", punto.x(), punto.y());
    println!("LineString: {} puntos", linea.0.len());
    println!("Polygon: 1 exterior + {} interiores", poligono.interiors().len());
    println!("MultiPoint: {} puntos", multipunto.0.len());
    println!("MultiLineString: {} líneas", multilinea.0.len());
    println!("MultiPolygon: {} polígonos", multipoligono.0.len());
}
```

### Ejercicio 2 — Construir un `MultiPolygon` desde cero

```rust,ignore
use geo_types::{Coord, LineString, MultiPolygon, Polygon};

fn generar_cuadricula(filas: usize, columnas: usize, lado: f64) -> MultiPolygon<f64> {
    let mut polys = Vec::with_capacity(filas * columnas);
    for f in 0..filas {
        for c in 0..columnas {
            let x0 = c as f64 * lado;
            let y0 = f as f64 * lado;
            polys.push(Polygon::new(
                LineString::new(vec![
                    Coord { x: x0, y: y0 },
                    Coord { x: x0 + lado, y: y0 },
                    Coord { x: x0 + lado, y: y0 + lado },
                    Coord { x: x0, y: y0 + lado },
                    Coord { x: x0, y: y0 },
                ]),
                vec![],
            ));
        }
    }
    MultiPolygon::new(polys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuadricula_3x3_tiene_9_poligonos() {
        assert_eq!(generar_cuadricula(3, 3, 1.0).0.len(), 9);
    }
}
```

### Ejercicio 3 — Detectar un anillo no cerrado

```rust,ignore
use geo_types::{Coord, LineString};

fn validar_anillo_crudo(coords: &[(f64, f64)]) -> Result<LineString<f64>, String> {
    match (coords.first(), coords.last()) {
        (Some(primero), Some(ultimo)) if primero == ultimo => Ok(LineString::new(
            coords.iter().map(|&(x, y)| Coord { x, y }).collect(),
        )),
        _ => Err("el anillo no está cerrado: el primer y último punto difieren".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detecta_anillo_abierto() {
        let abierto = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0)];
        assert!(validar_anillo_crudo(&abierto).is_err());
    }

    #[test]
    fn acepta_anillo_cerrado() {
        let cerrado = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0)];
        assert!(validar_anillo_crudo(&cerrado).is_ok());
    }
}
```

### Ejercicio 4 — Convertir entre `Point` y `Coord`

```rust,ignore
use geo_types::{Coord, Point};

fn envolver(c: Coord<f64>) -> Point<f64> {
    c.into()
}

fn desenvolver(p: Point<f64>) -> Coord<f64> {
    p.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_coord_point() {
        let c1 = Coord { x: 3.0, y: 4.0 };
        let c2 = Coord { x: -74.07, y: 4.71 };
        assert_eq!(desenvolver(envolver(c1)), c1);
        assert_eq!(desenvolver(envolver(c2)), c2);
    }
}
```

### Ejercicio 5 — Escribir un test de igualdad geométrica

```rust,ignore
use geo_types::{Coord, LineString, Polygon};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auto_cierre_produce_poligonos_iguales() {
        let ext_manual_cerrado = LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
            Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
        ]);
        let ext_sin_cerrar = LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 }, Coord { x: 1.0, y: 1.0 },
        ]);

        let p1 = Polygon::new(ext_manual_cerrado, vec![]);
        let p2 = Polygon::new(ext_sin_cerrar, vec![]); // Polygon::new lo cierra por ti

        assert_eq!(p1, p2);
    }

    #[test]
    fn rotacion_de_vertices_no_es_igual() {
        let p1 = Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
                Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        );
        // Mismo polígono, pero el anillo empieza en un vértice distinto.
        let p3 = Polygon::new(
            LineString::new(vec![
                Coord { x: 1.0, y: 0.0 }, Coord { x: 1.0, y: 1.0 },
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
            ]),
            vec![],
        );

        // `PartialEq` compara la secuencia EXACTA de coordenadas del anillo,
        // no la forma geométrica abstracta. Dos anillos que describen el
        // mismo triángulo pero empiezan a recorrerlo desde un vértice
        // distinto no son `==`, aunque geométricamente sean idénticos.
        // Para comparar formas de verdad hace falta el trait `Relate`
        // (Capítulo 4.1), no `==`.
        assert_ne!(p1, p3);
    }
}
```

---

## Capítulo 3.2 — CRS geográficos vs. proyectados

### Ejercicio 1 — Identificar el CRS correcto para un caso de uso

1. **Almacenar un `Feature` de `POST /features`:** CRS geográfico, EPSG:4326. Es el estándar de GeoJSON (RFC 7946) y el formato de intercambio con el que casi cualquier cliente va a enviarte datos — reproyectar antes de almacenar añadiría trabajo y pérdida de información sin necesidad.
2. **Área de una parcela en Bogotá:** CRS proyectado, pero **no** Web Mercator — una zona UTM apropiada para Colombia (EPSG:32618, UTM zona 18N) o el cálculo geodésico directo sobre WGS84 (Capítulo 3.3, `GeodesicArea`). Web Mercator distorsiona área de forma dependiente de la latitud; aunque Bogotá está relativamente cerca del ecuador (la distorsión ahí es menor que cerca de los polos), sigue introduciendo un error innecesario cuando existen alternativas exactas.
3. **Teselas vectoriales para un visor en el navegador:** Web Mercator, EPSG:3857 — es lo que casi cualquier librería de mapas del lado del cliente (Leaflet, Mapbox GL) espera por defecto, y aquí la distorsión de área es aceptable porque el objetivo es visualización, no medición.
4. **Distancia real entre dos ciudades:** no hace falta reproyectar — usa una fórmula geodésica (Haversine o Vincenty, Capítulo 3.3) directamente sobre las coordenadas WGS84. Reproyectar a un CRS en metros y luego calcular distancia euclidiana solo tendría sentido si la distancia fuera corta y ya tuvieras un CRS proyectado apropiado para esa región a mano.

### Ejercicio 2 — Detectar un bbox con ejes invertidos

```rust,ignore
#[derive(Debug, PartialEq)]
enum ProblemaBbox {
    EjesProbablementeInvertidos,
    ValoresFueraDeRango,
}

fn es_longitud_valida(v: f64) -> bool {
    (-180.0..=180.0).contains(&v)
}
fn es_latitud_valida(v: f64) -> bool {
    (-90.0..=90.0).contains(&v)
}

fn validar_bbox_geografico(min_x: f64, min_y: f64, max_x: f64, max_y: f64) -> Result<(), ProblemaBbox> {
    let xs_como_lon = es_longitud_valida(min_x) && es_longitud_valida(max_x);
    let ys_como_lat = es_latitud_valida(min_y) && es_latitud_valida(max_y);
    if xs_como_lon && ys_como_lat {
        return Ok(());
    }

    let xs_como_lat = es_latitud_valida(min_x) && es_latitud_valida(max_x);
    let ys_como_lon = es_longitud_valida(min_y) && es_longitud_valida(max_y);
    if xs_como_lat && ys_como_lon {
        return Err(ProblemaBbox::EjesProbablementeInvertidos);
    }

    Err(ProblemaBbox::ValoresFueraDeRango)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokio_orden_correcto() {
        assert_eq!(validar_bbox_geografico(139.0, 35.0, 140.0, 36.0), Ok(()));
    }

    #[test]
    fn tokio_ejes_invertidos_se_detecta() {
        assert_eq!(
            validar_bbox_geografico(35.0, 139.0, 36.0, 140.0),
            Err(ProblemaBbox::EjesProbablementeInvertidos)
        );
    }

    #[test]
    fn valores_totalmente_fuera_de_rango() {
        assert_eq!(
            validar_bbox_geografico(200.0, 500.0, 210.0, 510.0),
            Err(ProblemaBbox::ValoresFueraDeRango)
        );
    }

    #[test]
    fn bogota_es_un_caso_ambiguo_para_este_heuristico() {
        // -74.07 es simultáneamente una longitud Y una latitud válidas.
        // El heurístico basado solo en rangos NO puede distinguir el
        // orden correcto del invertido en este caso: ambas llamadas
        // devuelven Ok(()), y eso es exactamente lo esperado dada la
        // limitación explicada en el capítulo — no un bug de esta
        // implementación.
        assert_eq!(validar_bbox_geografico(-75.56, 4.71, -74.07, 6.25), Ok(()));
        assert_eq!(validar_bbox_geografico(4.71, -75.56, 6.25, -74.07), Ok(()));
    }
}
```

### Ejercicio 3 — Justificar por qué EPSG:3857 distorsiona área

El factor de escala puntual de la proyección de Mercator en una latitud `φ` es `k = 1 / cos(φ)`. Como la proyección es conforme (preserva ángulos localmente pero no áreas), el área aparente en el mapa se distorsiona con el **cuadrado** de ese factor de escala lineal: `k² = 1 / cos²(φ)`. En el ecuador (`φ = 0°`), `cos(0°) = 1`, así que no hay distorsión. A medida que `φ` se acerca a 90° (los polos), `cos(φ)` se acerca a `0`, y por lo tanto `k²` tiende a infinito — el área aparente en el mapa crece sin límite en relación con el área real, y la propia proyección deja de estar definida exactamente en los polos. Esta es la razón matemática precisa detrás del efecto visual de Groenlandia pareciendo casi tan grande como África en cualquier mapa mundial de Mercator: Groenlandia está mucho más cerca de los polos, así que su `k²` es mucho mayor que el de África, que está mayormente cerca del ecuador.

---

## Capítulo 3.3 — `geo`, algoritmos core

### Ejercicio 1 — Área geodésica vs. euclidiana

```rust,ignore
use geo::{Area, GeodesicArea};
use geo_types::{Coord, LineString, Polygon};

fn cuadrado(x0: f64, y0: f64, lado: f64) -> Polygon<f64> {
    Polygon::new(
        LineString::new(vec![
            Coord { x: x0, y: y0 }, Coord { x: x0 + lado, y: y0 },
            Coord { x: x0 + lado, y: y0 + lado }, Coord { x: x0, y: y0 + lado }, Coord { x: x0, y: y0 },
        ]),
        vec![],
    )
}

fn main() {
    let ecuador = cuadrado(0.0, 0.0, 1.0);
    let polo = cuadrado(0.0, 80.0, 1.0);

    println!("ecuador: euclid={} geod={:.2} km²", ecuador.unsigned_area(), ecuador.geodesic_area_unsigned() / 1e6);
    println!("polo:    euclid={} geod={:.2} km²", polo.unsigned_area(), polo.geodesic_area_unsigned() / 1e6);
    // ecuador: euclid=1 geod=12308.78 km²
    // polo:    euclid=1 geod=2058.17 km²
}
```

El área euclidiana es idéntica (`1.0` en ambos casos) porque, en un plano cartesiano ingenuo, un cuadrado de 1°x1° siempre "mide" lo mismo sin importar dónde esté. La geodésica, en cambio, refleja la realidad física: cerca del polo (latitud 80°-81°), los meridianos convergen mucho más que en el ecuador, así que ese mismo grado de longitud cubre una distancia real mucho menor — el área geodésica del cuadrado cerca del polo es casi 6 veces menor que la del cuadrado en el ecuador, exactamente la asimetría que se explicó en el Capítulo 3.2.

### Ejercicio 2 — Haversine vs. Vincenty

```rust,ignore
use geo::{Distance, Haversine, VincentyDistance};
use geo_types::Point;

fn main() {
    let bogota = Point::new(-74.0721, 4.7110);
    let tokio = Point::new(139.6917, 35.6895);

    let d_hav: f64 = Haversine.distance(bogota, tokio);
    let d_vin: f64 = bogota.vincenty_distance(&tokio).unwrap();
    let pct = 100.0 * (d_hav - d_vin).abs() / d_vin;

    println!("Haversine: {d_hav:.2} m, Vincenty: {d_vin:.2} m, diferencia: {pct:.4}%");
    // Haversine: 14308891.23 m, Vincenty: 14321701.31 m, diferencia: 0.0894%
}
```

Sobre esta distancia mucho más larga (~14.300 km, casi medio mundo), la diferencia relativa (0.089%) resultó *menor* que la del par corto Bogotá-Medellín (0.229% en el capítulo) — no mayor. Esto ilustra que el error de Haversine no crece de forma monótona con la distancia: depende de la orientación relativa de la ruta respecto al achatamiento de la Tierra en los polos, no solo de cuántos kilómetros separan los dos puntos. La lección práctica es la misma de cualquier optimización: no asumas el comportamiento, mídelo para tu caso concreto.

### Ejercicio 3 — Douglas-Peucker con distintas tolerancias

```rust,ignore
use geo::Simplify;
use geo_types::{Coord, LineString};

fn main() {
    let ruta = LineString::new(vec![
        Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.05 }, Coord { x: 2.0, y: -0.02 },
        Coord { x: 3.0, y: 0.03 }, Coord { x: 4.0, y: 0.0 }, Coord { x: 5.0, y: 5.0 },
    ]);

    for eps in [0.01, 0.1, 0.5, 1.0] {
        println!("eps={eps} -> {} puntos", ruta.simplify(eps).0.len());
    }
    // eps=0.01 -> 6 puntos
    // eps=0.1  -> 3 puntos
    // eps=0.5  -> 3 puntos
    // eps=1    -> 3 puntos
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mas_tolerancia_nunca_da_mas_puntos() {
        let ruta = LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.05 }, Coord { x: 2.0, y: -0.02 },
            Coord { x: 3.0, y: 0.03 }, Coord { x: 4.0, y: 0.0 }, Coord { x: 5.0, y: 5.0 },
        ]);
        assert!(ruta.simplify(1.0).0.len() <= ruta.simplify(0.01).0.len());
    }
}
```

Tiene sentido que el conteo nunca aumente con la tolerancia: una tolerancia mayor le dice al algoritmo "acepto más desviación de la línea recta", así que cualquier punto que sobrevivía con una tolerancia baja sigue teniendo motivo de sobra para sobrevivir con una tolerancia más alta — nunca al revés.

### Ejercicio 4 — Visvalingam-Whyatt

```rust,ignore
use geo::{Simplify, SimplifyVw};
use geo_types::{Coord, LineString};

fn main() {
    let puntos: Vec<Coord<f64>> = (0..=20)
        .map(|i| {
            let t = i as f64 / 20.0 * std::f64::consts::FRAC_PI_2;
            Coord { x: t.cos(), y: t.sin() }
        })
        .collect();
    let curva = LineString::new(puntos);

    let dp = curva.simplify(0.05);
    let vw = curva.simplify_vw(0.05);

    println!("original: {} puntos", curva.0.len()); // 21
    println!("DP: {} puntos", dp.0.len());            // 5
    println!("VW: {} puntos", vw.0.len());            // 3
}
```

Sobre este cuarto de círculo, Visvalingam-Whyatt terminó con menos puntos (3) que Douglas-Peucker (5) para la misma tolerancia — es decir, en este caso concreto VW fue más agresivo. Esto no contradice lo dicho en el capítulo sobre que VW "tiende a preservar mejor la forma percibida" — esa es una tendencia general sobre la *calidad visual por punto conservado*, no una garantía de que VW siempre retenga más puntos. Vale la pena inspeccionar las coordenadas resultantes de ambos (no solo el conteo) para juzgar cuál se ve más parecido al cuarto de círculo original en tu propio caso.

### Ejercicio 5 — Benchmark comparativo

```rust,ignore
use geo::{Simplify, SimplifyVw};
use geo_types::{Coord, LineString};
use std::time::Instant;

fn main() {
    let puntos: Vec<Coord<f64>> = (0..100_000)
        .map(|i| Coord { x: i as f64 * 0.001, y: (i as f64 * 0.01).sin() * 0.001 })
        .collect();
    let ruta = LineString::new(puntos);

    let t0 = Instant::now();
    let dp = ruta.simplify(0.001);
    let t_dp = t0.elapsed();

    let t0 = Instant::now();
    let vw = ruta.simplify_vw(0.001);
    let t_vw = t0.elapsed();

    println!("DP: {} puntos en {:?}", dp.0.len(), t_dp);
    println!("VW: {} puntos en {:?}", vw.0.len(), t_vw);
    // (en la máquina de referencia, en modo --release)
    // DP: 320 puntos en ~110ms
    // VW: 118 puntos en ~47ms
}
```

En esta ejecución de referencia, Visvalingam-Whyatt no solo retuvo menos puntos, sino que además fue más del doble de rápido que Douglas-Peucker — un resultado que depende fuertemente de la forma de los datos de entrada y no debe generalizarse sin volver a medir en tu propio caso.

### Ejercicio 6 — Caso límite con geometría vacía

```rust,ignore
use geo::{Area, GeodesicArea, Simplify};
use geo_types::{LineString, Polygon};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linestring_vacia_simplificada_sigue_vacia() {
        let vacia: LineString<f64> = LineString::new(vec![]);
        assert_eq!(vacia.simplify(0.1).0.len(), 0);
    }

    #[test]
    fn poligono_vacio_tiene_area_cero() {
        let vacio: Polygon<f64> = Polygon::new(LineString::new(vec![]), vec![]);
        assert_eq!(vacio.unsigned_area(), 0.0);
    }

    #[test]
    fn area_geodesica_de_poligono_vacio_no_es_nan() {
        let vacio: Polygon<f64> = Polygon::new(LineString::new(vec![]), vec![]);
        let area = vacio.geodesic_area_unsigned();
        assert!(!area.is_nan());
    }
}
```

---

## Capítulo 3.4 — Serialización GeoJSON, WKT/WKB

### Ejercicio 1 — Round-trip GeoJSON

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Point, Polygon};
use geojson::GeoJson;

fn roundtrip_geojson(geom: &Geometry<f64>) -> Geometry<f64> {
    let gj: geojson::Geometry = geom.try_into().unwrap();
    let texto = gj.to_string();
    let parsed: GeoJson = texto.parse().unwrap();
    let gj2 = geojson::Geometry::try_from(parsed).unwrap();
    gj2.try_into().unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn poligono_ejemplo() -> Polygon<f64> {
        Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
                Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        )
    }

    #[test]
    fn roundtrip_point() {
        let g = Geometry::Point(Point::new(-74.07, 4.71));
        assert_eq!(g, roundtrip_geojson(&g));
    }

    #[test]
    fn roundtrip_linestring() {
        let g = Geometry::LineString(LineString::new(vec![
            Coord { x: -74.07, y: 4.71 }, Coord { x: -75.56, y: 6.25 },
        ]));
        assert_eq!(g, roundtrip_geojson(&g));
    }

    #[test]
    fn roundtrip_polygon() {
        let g = Geometry::Polygon(poligono_ejemplo());
        assert_eq!(g, roundtrip_geojson(&g));
    }
}
```

### Ejercicio 2 — Round-trip WKT

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Point, Polygon};
use wkt::{ToWkt, TryFromWkt};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_point() {
        let p = Point::new(-74.07, 4.71);
        let wkt = p.wkt_string();
        println!("{wkt}"); // POINT(-74.07 4.71)
        assert_eq!(p, Point::try_from_wkt_str(&wkt).unwrap());
    }

    #[test]
    fn roundtrip_linestring() {
        let l = LineString::new(vec![Coord { x: -74.07, y: 4.71 }, Coord { x: -75.56, y: 6.25 }]);
        let wkt = l.wkt_string();
        println!("{wkt}"); // LINESTRING(-74.07 4.71,-75.56 6.25)
        assert_eq!(l, LineString::try_from_wkt_str(&wkt).unwrap());
    }

    #[test]
    fn roundtrip_polygon() {
        let p = Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
                Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        );
        let wkt = p.wkt_string();
        println!("{wkt}"); // POLYGON((0 0,1 0,1 1,0 0))
        assert_eq!(p, Polygon::try_from_wkt_str(&wkt).unwrap());
    }
}
```

### Ejercicio 3 — Manejo de un GeoJSON malformado con `Result`

```rust,ignore
use geojson::GeoJson;

fn parsear_feature_seguro(texto: &str) -> Result<geojson::Feature, String> {
    let valor: GeoJson = texto.parse().map_err(|e: geojson::Error| e.to_string())?;
    match valor {
        GeoJson::Feature(f) => Ok(f),
        _ => Err("el GeoJson no es un Feature".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feature_valido() {
        let json = r#"{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[1,2]}}"#;
        assert!(parsear_feature_seguro(json).is_ok());
    }

    #[test]
    fn tipo_de_geometria_desconocido() {
        let json = r#"{"type":"Feature","geometry":{"type":"Rare","coordinates":[1,2]}}"#;
        assert!(parsear_feature_seguro(json).is_err());
    }

    #[test]
    fn no_es_json_en_absoluto() {
        assert!(parsear_feature_seguro("no es json {{{").is_err());
    }
}
```

### Ejercicio 4 — Interoperar con `serde`

```rust,ignore
use geo_types::{Coord, Geometry, LineString, Point, Polygon};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct FeatureApi {
    id: String,
    geometria: geojson::Geometry,
}

#[derive(Debug, Serialize, Deserialize)]
struct RespuestaFeatures {
    total: usize,
    features: Vec<FeatureApi>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_completo() {
        let punto = Geometry::Point(Point::new(-74.07, 4.71));
        let poligono = Geometry::Polygon(Polygon::new(
            LineString::new(vec![
                Coord { x: 0.0, y: 0.0 }, Coord { x: 1.0, y: 0.0 },
                Coord { x: 1.0, y: 1.0 }, Coord { x: 0.0, y: 0.0 },
            ]),
            vec![],
        ));

        let f1 = FeatureApi { id: "a".into(), geometria: (&punto).try_into().unwrap() };
        let f2 = FeatureApi { id: "b".into(), geometria: (&poligono).try_into().unwrap() };
        let respuesta = RespuestaFeatures { total: 2, features: vec![f1, f2] };

        let json = serde_json::to_string_pretty(&respuesta).unwrap();
        let de_vuelta: RespuestaFeatures = serde_json::from_str(&json).unwrap();

        assert_eq!(respuesta.features.len(), de_vuelta.features.len());

        for f in &de_vuelta.features {
            let _g: Geometry<f64> = f.geometria.clone().try_into().unwrap();
        }
    }
}
```

---

## Capítulo 3.5 — Proyecto guiado GeoAPI v0.2 (`geoapi-core`)

### Ejercicio integrador — `bbox_de_coleccion`

```rust,ignore
use geo::BoundingRect;
use geo_types::{Coord, Geometry, Rect};

pub fn bbox_de_coleccion(geoms: &[Geometry<f64>]) -> Option<Rect<f64>> {
    geoms
        .iter()
        .filter_map(|g| g.bounding_rect()) // ignora geometrías sin bbox definido (ej. vacías)
        .fold(None, |acumulado, r| match acumulado {
            None => Some(r),
            Some(actual) => {
                let min = Coord {
                    x: actual.min().x.min(r.min().x),
                    y: actual.min().y.min(r.min().y),
                };
                let max = Coord {
                    x: actual.max().x.max(r.max().x),
                    y: actual.max().y.max(r.max().y),
                };
                Some(Rect::new(min, max))
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use geo_types::{LineString, Point};

    #[test]
    fn bbox_cubre_todas_las_geometrias() {
        let geoms = vec![
            Geometry::Point(Point::new(0.0, 0.0)),
            Geometry::LineString(LineString::new(vec![
                Coord { x: 5.0, y: 5.0 },
                Coord { x: -3.0, y: 2.0 },
            ])),
        ];

        let bbox = bbox_de_coleccion(&geoms).unwrap();
        assert_eq!(bbox.min(), Coord { x: -3.0, y: 0.0 });
        assert_eq!(bbox.max(), Coord { x: 5.0, y: 5.0 });
    }

    #[test]
    fn coleccion_vacia_devuelve_none() {
        let vacia: Vec<Geometry<f64>> = vec![];
        assert!(bbox_de_coleccion(&vacia).is_none());
    }
}
```

Las tres decisiones de diseño que este ejercicio te pedía tomar por tu cuenta: `BoundingRect` es el trait de `geo` que expone `.bounding_rect()` (devuelve `Option<Rect<T>>` porque una geometría vacía no tiene *bounding box*); una colección vacía devuelve `None` en vez de, por ejemplo, un `Rect` en el origen (que sería un valor inventado y engañoso); y las geometrías individuales sin *bounding box* definido simplemente se ignoran con `.filter_map()` en vez de abortar todo el cálculo — un compromiso razonable, aunque documentarlo explícitamente (como se hizo aquí en el comentario) es importante para que un futuro lector de la API sepa que una geometría "rara" en la colección no hace fallar la respuesta completa.
