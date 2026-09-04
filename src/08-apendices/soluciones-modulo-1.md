# Apéndice — Soluciones de ejercicios: Módulo 1 (Fundamentos de Rust)

> Si llegaste aquí sin haber intentado el ejercicio primero, vuelve atrás — la sección [1.3 Convenciones del libro](../01-front-matter/03-convenciones-del-libro.md) explica por qué. Estas soluciones son una entre varias formas válidas de resolver cada ejercicio; lo que importa es que la tuya cumpla el criterio de éxito indicado en el capítulo.

## Capítulo 2.1 — Ownership, borrowing y por qué importan en GIS

### Ejercicio 1 — Pasar una geometría por referencia sin copiarla

```rust
struct Coord { lat: f64, lon: f64 }
struct PoligonoSimple { anillo: Vec<Coord> }

fn contar_vertices(p: &PoligonoSimple) -> usize { // toma prestado, no consume
    p.anillo.len()
}

fn main() {
    let poligono = PoligonoSimple {
        anillo: vec![
            Coord { lat: 4.0, lon: -74.0 },
            Coord { lat: 4.1, lon: -74.0 },
            Coord { lat: 4.1, lon: -74.1 },
        ],
    };

    let n1 = contar_vertices(&poligono);
    let n2 = contar_vertices(&poligono); // sigue disponible: nunca se movió
    println!("{n1} {n2}");
}
```

El único cambio necesario es la firma: `p: PoligonoSimple` (por valor) pasa a `p: &PoligonoSimple` (por referencia), y ambas llamadas en `main` pasan `&poligono` en vez de `poligono`. Como `contar_vertices` nunca toma posesión, `poligono` sigue siendo válido para la segunda llamada.

### Ejercicio 2 — Identificar por qué una función no compila

```rust
struct Coord { lat: f64, lon: f64 }

fn trasladar(mut puntos: Vec<Coord>, delta: f64) -> Vec<Coord> {
    for p in puntos.iter_mut() {
        p.lat += delta;
    }
    puntos
}

fn main() {
    let ruta = vec![Coord { lat: 4.0, lon: -74.0 }];
    let original_len = ruta.len(); // (A) `ruta` todavía es válida aquí
    let ruta_trasladada = trasladar(ruta, 0.5); // (B) `ruta` se MUEVE aquí, hacia adentro de `trasladar`
    println!("{} {}", original_len, ruta_trasladada.len());
    // A partir de (B), la variable `ruta` ya no es accesible.
    // `original_len` compila porque es un `usize` (un número), que ya se
    // había calculado y copiado ANTES del move — no depende de que `ruta`
    // siga viva después.
}
```

La versión que falla, con el orden intercambiado:

```rust,ignore
fn main() {
    let ruta = vec![Coord { lat: 4.0, lon: -74.0 }];
    let ruta_trasladada = trasladar(ruta, 0.5); // `ruta` se mueve aquí
    let original_len = ruta.len(); // ERROR: `ruta` ya no es válida
    println!("{} {}", original_len, ruta_trasladada.len());
}
```

El mensaje de error del compilador es, en esencia: `error[E0382]: borrow of moved value: 'ruta'` seguido de una nota que señala la línea del `move` (`value moved here`) y la línea del uso inválido (`value borrowed here after move`). El punto exacto donde `ruta` deja de ser accesible es la llamada `trasladar(ruta, 0.5)`: como `trasladar` recibe `puntos: Vec<Coord>` por valor (no por referencia), la propiedad del `Vec` pasa de `ruta` al parámetro `puntos` en ese instante.

### Ejercicio 3 — Corregir un lifetime

```rust
struct Coord { lat: f64, lon: f64 }

fn distancia(a: &Coord, b: &Coord) -> f64 {
    ((a.lat - b.lat).powi(2) + (a.lon - b.lon).powi(2)).sqrt()
}

// El valor devuelto siempre proviene de `puntos` (nunca de `referencia`),
// así que el lifetime de retorno se ata explícitamente a `puntos`.
fn mas_cercano<'a>(puntos: &'a [Coord], referencia: &Coord) -> &'a Coord {
    let mut mejor = &puntos[0];
    let mut mejor_dist = distancia(mejor, referencia);
    for p in puntos.iter() {
        let d = distancia(p, referencia);
        if d < mejor_dist {
            mejor = p;
            mejor_dist = d;
        }
    }
    mejor
}

fn main() {
    let ruta = vec![
        Coord { lat: 4.71, lon: -74.07 },
        Coord { lat: 6.25, lon: -75.56 },
    ];
    let mi_ubicacion = Coord { lat: 6.20, lon: -75.50 };

    let cercano = mas_cercano(&ruta, &mi_ubicacion);
    println!("{}", cercano.lat);
}
```

Fíjate que `referencia: &Coord` no necesita su propio lifetime explícito: como el valor de retorno nunca depende de `referencia` (solo se usa para comparar, no se devuelve), el compilador no necesita relacionarlos. Solo `puntos` y el tipo de retorno comparten el lifetime `'a`.

---

## Capítulo 2.2 — `Result`, `Option` y manejo de errores sin pánico

### Ejercicio 1 — Propagar error con `?`

```rust
#[derive(Debug)]
struct Coord { lat: f64, lon: f64 }

#[derive(Debug)]
enum ErrorParseoCoord {
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

fn parsear_coord(lat_str: &str, lon_str: &str) -> Result<Coord, ErrorParseoCoord> {
    let lat: f64 = lat_str.trim().parse().map_err(|_| ErrorParseoCoord::LatitudNoNumerica)?;
    let lon: f64 = lon_str.trim().parse().map_err(|_| ErrorParseoCoord::LongitudNoNumerica)?;
    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorParseoCoord::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorParseoCoord::LongitudFueraDeRango(lon));
    }
    Ok(Coord { lat, lon })
}

fn parsear_ruta(filas: &[(&str, &str)]) -> Result<Vec<Coord>, ErrorParseoCoord> {
    let mut ruta = Vec::with_capacity(filas.len());
    for (lat_str, lon_str) in filas {
        let coord = parsear_coord(lat_str, lon_str)?; // primer error corta y se propaga
        ruta.push(coord);
    }
    Ok(ruta)
}

fn main() {
    let filas = [("4.71", "-74.07"), ("6.25", "-75.56")];
    let ruta = parsear_ruta(&filas).unwrap();
    assert_eq!(ruta.len(), 2);
    println!("ok");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsea_ruta_valida() {
        let filas = [("4.71", "-74.07"), ("6.25", "-75.56")];
        let ruta = parsear_ruta(&filas).unwrap();
        assert_eq!(ruta.len(), 2);
    }
}
```

### Ejercicio 2 — Modelar un error de dominio con `enum`

```rust
struct FeatureSimple {
    id: Option<String>,
    coords: Vec<(f64, f64)>,
}

#[derive(Debug, PartialEq)]
enum ErrorFeature {
    SinId,
    SinCoordenadas,
    CoordenadaInvalida { indice: usize, lat: f64, lon: f64 },
}

fn validar_feature(f: &FeatureSimple) -> Result<(), ErrorFeature> {
    if f.id.is_none() {
        return Err(ErrorFeature::SinId);
    }
    if f.coords.is_empty() {
        return Err(ErrorFeature::SinCoordenadas);
    }
    for (indice, (lat, lon)) in f.coords.iter().enumerate() {
        if !(-90.0..=90.0).contains(lat) || !(-180.0..=180.0).contains(lon) {
            return Err(ErrorFeature::CoordenadaInvalida { indice, lat: *lat, lon: *lon });
        }
    }
    Ok(())
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detecta_sin_id() {
        let f = FeatureSimple { id: None, coords: vec![(4.0, -74.0)] };
        assert!(matches!(validar_feature(&f), Err(ErrorFeature::SinId)));
    }

    #[test]
    fn detecta_sin_coordenadas() {
        let f = FeatureSimple { id: Some("f1".into()), coords: vec![] };
        assert!(matches!(validar_feature(&f), Err(ErrorFeature::SinCoordenadas)));
    }

    #[test]
    fn detecta_coordenada_invalida() {
        let f = FeatureSimple { id: Some("f1".into()), coords: vec![(200.0, -74.0)] };
        assert!(matches!(
            validar_feature(&f),
            Err(ErrorFeature::CoordenadaInvalida { indice: 0, .. })
        ));
    }
}
```

### Ejercicio 3 — Convertir un `panic!` en `Result`

```rust
struct Coord { lat: f64, lon: f64 }

fn obtener_punto(ruta: &[Coord], indice: usize) -> Option<&Coord> {
    ruta.get(indice)
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indice_fuera_de_rango_devuelve_none() {
        let ruta = vec![
            Coord { lat: 4.0, lon: -74.0 },
            Coord { lat: 5.0, lon: -75.0 },
        ];
        assert!(obtener_punto(&ruta, 999).is_none());
    }

    #[test]
    fn indice_valido_devuelve_some() {
        let ruta = vec![Coord { lat: 4.0, lon: -74.0 }];
        assert!(obtener_punto(&ruta, 0).is_some());
    }
}
```

### Ejercicio 4 — Tests que verifican el camino de error

```rust
#[derive(Debug, PartialEq)]
enum ErrorParseoCoord {
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

#[derive(Debug)]
struct Coord { lat: f64, lon: f64 }

fn parsear_coord(lat_str: &str, lon_str: &str) -> Result<Coord, ErrorParseoCoord> {
    let lat: f64 = lat_str.trim().parse().map_err(|_| ErrorParseoCoord::LatitudNoNumerica)?;
    let lon: f64 = lon_str.trim().parse().map_err(|_| ErrorParseoCoord::LongitudNoNumerica)?;
    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorParseoCoord::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorParseoCoord::LongitudFueraDeRango(lon));
    }
    Ok(Coord { lat, lon })
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latitud_fuera_de_rango() {
        assert_eq!(
            parsear_coord("200.0", "-74.07").unwrap_err(),
            ErrorParseoCoord::LatitudFueraDeRango(200.0)
        );
    }

    #[test]
    fn longitud_fuera_de_rango() {
        assert_eq!(
            parsear_coord("4.71", "-200.0").unwrap_err(),
            ErrorParseoCoord::LongitudFueraDeRango(-200.0)
        );
    }

    #[test]
    fn latitud_no_numerica() {
        assert_eq!(
            parsear_coord("no-es-un-numero", "-74.07").unwrap_err(),
            ErrorParseoCoord::LatitudNoNumerica
        );
    }
}
```

Usar `assert_eq!` contra la variante completa (incluyendo el valor numérico dentro de `LatitudFueraDeRango`) es lo que hace que, si intercambiaras por error las ramas de latitud y longitud dentro de `parsear_coord`, el primer test fallara con un mensaje claro (`left: LatitudFueraDeRango(200.0), right: LongitudFueraDeRango(200.0)` o similar) en vez de pasar silenciosamente.

---

## Capítulo 2.3 — Traits, genéricos e iteradores

### Ejercicio 1 — Implementar un trait para dos tipos distintos

```rust
struct Coord { lat: f64, lon: f64 }
struct Ciudad { nombre: String, coord: Coord }

trait Etiquetable {
    fn etiqueta(&self) -> String;
}

impl Etiquetable for Coord {
    fn etiqueta(&self) -> String {
        format!("({:.2}, {:.2})", self.lat, self.lon)
    }
}

impl Etiquetable for Ciudad {
    fn etiqueta(&self) -> String {
        self.nombre.clone()
    }
}

fn imprimir_etiqueta(item: &impl Etiquetable) {
    println!("{}", item.etiqueta());
}

fn main() {
    let punto = Coord { lat: 4.71, lon: -74.07 };
    let bogota = Ciudad { nombre: "Bogotá".to_string(), coord: Coord { lat: 4.71, lon: -74.07 } };

    imprimir_etiqueta(&punto);   // (4.71, -74.07)
    imprimir_etiqueta(&bogota);  // Bogotá
    let _ = bogota.coord.lat;
}
```

### Ejercicio 2 — Función genérica con cota de trait

```rust
fn punto_medio<T: Into<f64> + Copy>(a: T, b: T) -> f64 {
    (a.into() + b.into()) / 2.0
}

fn main() {
    let medio_f64 = punto_medio(4.71_f64, 6.25_f64);
    let medio_f32 = punto_medio(4.71_f32, 6.25_f32);
    println!("{medio_f64:.4} {medio_f32:.4}");
}
```

### Ejercicio 3 — Reemplazar un bucle manual por una cadena de iteradores

```rust
struct Coord { lat: f64, lon: f64 }

fn contar_norte_manual(puntos: &[Coord]) -> usize {
    let mut contador = 0;
    for i in 0..puntos.len() {
        if puntos[i].lat > 0.0 {
            contador += 1;
        }
    }
    contador
}

fn contar_norte(puntos: &[Coord]) -> usize {
    puntos.iter().filter(|p| p.lat > 0.0).count()
}

fn main() {
    let ruta = vec![
        Coord { lat: 4.71, lon: -74.07 },   // norte
        Coord { lat: -12.05, lon: -77.03 }, // sur
        Coord { lat: 6.25, lon: -75.56 },   // norte
    ];
    assert_eq!(contar_norte_manual(&ruta), contar_norte(&ruta));
    println!("{}", contar_norte(&ruta));
}
```

### Ejercicio 4 — Integrador: de strings crudos a longitud total, con manejo de errores

```rust
#[derive(Debug, PartialEq)]
enum ErrorParseoCoord {
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

#[derive(Debug)]
struct Coord { lat: f64, lon: f64 }

impl Coord {
    fn distancia_a(&self, otro: &Self) -> f64 {
        let dlat = self.lat - otro.lat;
        let dlon = self.lon - otro.lon;
        (dlat * dlat + dlon * dlon).sqrt()
    }
}

fn parsear_coord(lat_str: &str, lon_str: &str) -> Result<Coord, ErrorParseoCoord> {
    let lat: f64 = lat_str.trim().parse().map_err(|_| ErrorParseoCoord::LatitudNoNumerica)?;
    let lon: f64 = lon_str.trim().parse().map_err(|_| ErrorParseoCoord::LongitudNoNumerica)?;
    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorParseoCoord::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorParseoCoord::LongitudFueraDeRango(lon));
    }
    Ok(Coord { lat, lon })
}

fn procesar_ruta(filas: &[(&str, &str)]) -> Result<f64, ErrorParseoCoord> {
    let mut puntos = Vec::with_capacity(filas.len());
    for (lat_str, lon_str) in filas {
        puntos.push(parsear_coord(lat_str, lon_str)?);
    }

    let longitud = puntos.windows(2).map(|par| par[0].distancia_a(&par[1])).sum();
    Ok(longitud)
}

fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ruta_valida_calcula_longitud() {
        let filas = [("0.0", "0.0"), ("0.0", "1.0"), ("0.0", "2.0")];
        let longitud = procesar_ruta(&filas).unwrap();
        assert!((longitud - 2.0).abs() < 1e-9);
    }

    #[test]
    fn fila_invalida_propaga_error() {
        let filas = [("0.0", "0.0"), ("200.0", "1.0")];
        assert_eq!(
            procesar_ruta(&filas).unwrap_err(),
            ErrorParseoCoord::LatitudFueraDeRango(200.0)
        );
    }
}
```

No hay `unwrap()` dentro de `procesar_ruta` — el único `.unwrap()`/`.unwrap_err()` del ejemplo vive en los tests, que es exactamente donde el capítulo 2.2 dijo que es aceptable usarlo.
