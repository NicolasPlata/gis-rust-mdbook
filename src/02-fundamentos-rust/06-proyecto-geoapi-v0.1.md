# 2.6 Proyecto guiado de cierre — GeoAPI v0.1

Es hora de construir la primera versión real de GeoAPI. No va a abrir un socket de red todavía — eso llega en el Capítulo 4.8 — pero va a ser un programa completo, útil y correcto: un CLI que lee un CSV de coordenadas, valida cada fila, reporta los errores encontrados sin detenerse en el primero, y calcula la longitud total de la ruta que describen los puntos válidos.

Vas a construirlo dentro del crate `geoapi-api` que creaste en el Capítulo 1.2. Una aclaración importante antes de empezar: **la lógica de parseo y validación que escribas hoy va a vivir temporalmente en `geoapi-api`**. En el Capítulo 3.5 la vas a migrar a `geoapi-core`, cuando ese crate de dominio empiece a existir de verdad con tipos geométricos reales de `geo-types`. Por ahora, con los tres crates del workspace todavía vacíos salvo por sus stubs, no tiene sentido crear esa separación — la seguiremos construyendo aquí y la moveremos cuando haya algo real que separar.

## Diseño: separar la lógica de la E/S

Antes de tocar `std::fs` o `std::env::args`, vale la pena decidir la forma del programa. Vas a dividirlo en dos partes con responsabilidades claras:

1. **Funciones puras** que reciben un `&str` (el contenido ya leído del CSV) y devuelven datos estructurados — sin tocar el sistema de archivos ni la terminal. Esta es la parte que puedes testear exhaustivamente sin necesitar un archivo real en disco.
2. **`main()`**, que se encarga exclusivamente de leer argumentos de línea de comandos, leer el archivo, llamar a las funciones puras, e imprimir el resultado.

Esta separación no es un capricho estilístico. Es la misma razón por la que separaste `geoapi-core` de `geoapi-api` en el Capítulo 1.2, aplicada ahora dentro de un solo archivo: cuanto menos código dependa de E/S real, más fácil es de testear, y más reutilizable es en otros contextos (más adelante, la misma lógica de validación se va a llamar desde un handler HTTP en vez de desde un CLI).

## Checkpoint 1 — Parsear y validar una sola fila

**Historia de usuario:** Como integrador de sensores GPS de una red de monitoreo ambiental, quiero que cada lectura se valide sin clonar datos innecesariamente, para que el programa siga siendo eficiente incluso cuando el volumen de lecturas crece.

Ya escribiste una versión de esto en los Capítulos 2.4 y 2.5. Vamos a adaptarla para que cada fila de error identifique con precisión qué salió mal, incluyendo el caso de una fila con el número equivocado de columnas:

```rust,ignore
#[derive(Debug, PartialEq)]
struct Coord {
    lat: f64,
    lon: f64,
}

#[derive(Debug, PartialEq)]
enum ErrorFilaCsv {
    ColumnasIncompletas,
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

fn parsear_fila(fila: &str) -> Result<Coord, ErrorFilaCsv> {
    let columnas: Vec<&str> = fila.split(',').map(str::trim).collect();
    if columnas.len() != 2 {
        return Err(ErrorFilaCsv::ColumnasIncompletas);
    }

    let lat: f64 = columnas[0]
        .parse()
        .map_err(|_| ErrorFilaCsv::LatitudNoNumerica)?;
    let lon: f64 = columnas[1]
        .parse()
        .map_err(|_| ErrorFilaCsv::LongitudNoNumerica)?;

    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorFilaCsv::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorFilaCsv::LongitudFueraDeRango(lon));
    }

    Ok(Coord { lat, lon })
}
```

**Al estilo TDD (Capítulo 1.3):** antes de seguir, escribe (o al menos lee con calma) estos tests — son el criterio de éxito real de este checkpoint, no un adorno posterior:

```rust,ignore
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fila_valida_da_ok() {
        assert_eq!(parsear_fila("4.71, -74.07"), Ok(Coord { lat: 4.71, lon: -74.07 }));
    }

    #[test]
    fn columnas_incompletas() {
        assert_eq!(parsear_fila("4.71"), Err(ErrorFilaCsv::ColumnasIncompletas));
    }

    #[test]
    fn latitud_no_numerica() {
        assert_eq!(parsear_fila("no-es-numero, -74.07"), Err(ErrorFilaCsv::LatitudNoNumerica));
    }

    #[test]
    fn longitud_no_numerica() {
        assert_eq!(parsear_fila("4.71, no-es-numero"), Err(ErrorFilaCsv::LongitudNoNumerica));
    }

    #[test]
    fn latitud_fuera_de_rango() {
        assert_eq!(parsear_fila("200.0, -74.07"), Err(ErrorFilaCsv::LatitudFueraDeRango(200.0)));
    }

    #[test]
    fn longitud_fuera_de_rango() {
        assert_eq!(parsear_fila("4.71, 200.0"), Err(ErrorFilaCsv::LongitudFueraDeRango(200.0)));
    }
}
```

**Checkpoint de compilación:** pega el código de la función junto con este módulo de tests en `geoapi-api/src/main.rs` (reemplazando el `Hello, world!` que trae por defecto), añade un `fn main() {}` vacío debajo, y corre `cargo test -p geoapi-api`. Los seis tests deben pasar — verificado: los seis pasan tal como están escritos aquí, sin ajustes.

## Checkpoint 2 — Procesar el CSV completo, fila por fila

**Historia de usuario:** Como operador de una flota de drones agrícolas, quiero que el sistema reporte cada lectura corrupta sin detener el procesamiento del resto, para no perder un lote completo de datos válidos por un solo sensor defectuoso.

**Caso de uso — Procesamiento resiliente de un lote:**
- **Actor:** el proceso de ingesta de GeoAPI.
- **Precondición:** un archivo CSV con varias filas, un número desconocido de ellas inválido.
- **Flujo principal:** 1. Lee la línea de encabezado y la descarta. 2. Por cada línea siguiente, intenta parsearla. 3. Si es válida, la agrega a la lista de coordenadas válidas. 4. Si falla, registra el número de línea y el error, y continúa con la siguiente línea sin detenerse.
- **Resultado esperado:** un resumen con todas las coordenadas válidas y todos los errores encontrados — ninguno de los dos oculta al otro.

Un CSV real tiene un encabezado y puede tener líneas en blanco. Y, sobre todo: si una fila viene mal, **el programa no debe detenerse ahí** — debe reportar el error y seguir procesando el resto. Esa es una decisión de diseño deliberada: un CLI que aborta en la primera fila inválida es mucho menos útil que uno que te dice, al final, cuáles de las 10.000 filas de tu CSV tienen problemas.

```rust
#[derive(Debug, PartialEq)]
struct Coord {
    lat: f64,
    lon: f64,
}

#[derive(Debug, PartialEq)]
enum ErrorFilaCsv {
    ColumnasIncompletas,
    LatitudNoNumerica,
    LongitudNoNumerica,
    LatitudFueraDeRango(f64),
    LongitudFueraDeRango(f64),
}

fn parsear_fila(fila: &str) -> Result<Coord, ErrorFilaCsv> {
    let columnas: Vec<&str> = fila.split(',').map(str::trim).collect();
    if columnas.len() != 2 {
        return Err(ErrorFilaCsv::ColumnasIncompletas);
    }
    let lat: f64 = columnas[0]
        .parse()
        .map_err(|_| ErrorFilaCsv::LatitudNoNumerica)?;
    let lon: f64 = columnas[1]
        .parse()
        .map_err(|_| ErrorFilaCsv::LongitudNoNumerica)?;
    if !(-90.0..=90.0).contains(&lat) {
        return Err(ErrorFilaCsv::LatitudFueraDeRango(lat));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return Err(ErrorFilaCsv::LongitudFueraDeRango(lon));
    }
    Ok(Coord { lat, lon })
}

#[derive(Debug, Default)]
struct ResumenCsv {
    validas: Vec<Coord>,
    errores: Vec<(usize, ErrorFilaCsv)>, // (número de línea, error)
}

fn procesar_csv(contenido: &str) -> ResumenCsv {
    let mut resumen = ResumenCsv::default();

    for (indice, linea) in contenido.lines().enumerate() {
        let numero_linea = indice + 1;
        let linea = linea.trim();

        if linea.is_empty() {
            continue;
        }
        if numero_linea == 1 && linea.eq_ignore_ascii_case("lat,lon") {
            continue; // encabezado, no es una fila de datos
        }

        match parsear_fila(linea) {
            Ok(coord) => resumen.validas.push(coord),
            Err(error) => resumen.errores.push((numero_linea, error)),
        }
    }

    resumen
}

fn main() {
    let csv_de_prueba = "lat,lon\n4.71,-74.07\nno-es-un-numero,-75.0\n200.0,-74.0\n6.25,-75.56\n";
    let resumen = procesar_csv(csv_de_prueba);
    println!("Válidas: {}, con error: {}", resumen.validas.len(), resumen.errores.len());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn procesa_filas_validas_e_invalidas_sin_detenerse() {
        let csv = "lat,lon\n4.71,-74.07\nno-es-un-numero,-75.0\n200.0,-74.0\n6.25,-75.56\n";
        let resumen = procesar_csv(csv);

        assert_eq!(resumen.validas.len(), 2);
        assert_eq!(resumen.errores.len(), 2);
        assert_eq!(resumen.errores[0], (3, ErrorFilaCsv::LatitudNoNumerica));
        assert_eq!(resumen.errores[1], (4, ErrorFilaCsv::LatitudFueraDeRango(200.0)));
    }

    #[test]
    fn ignora_lineas_en_blanco() {
        let csv = "lat,lon\n4.71,-74.07\n\n6.25,-75.56\n";
        let resumen = procesar_csv(csv);
        assert_eq!(resumen.validas.len(), 2);
        assert_eq!(resumen.errores.len(), 0);
    }
}
```

**Checkpoint de compilación:** `cargo test -p geoapi-api` debe correr los dos tests y ambos deben pasar. Fíjate en el segundo test del error: la fila 4 (`200.0,-74.0`) queda registrada con el número de línea correcto *aunque* la fila 3 anterior también tuviera un error — el procesamiento nunca se detuvo.

## Checkpoint 3 — Calcular la longitud total de la ruta

**Historia de usuario:** Como analista de rutas de reparto, quiero conocer la longitud total de una ruta a partir de sus coordenadas válidas, para estimar tiempos de recorrido sin tener que sumar distancias a mano.

Reutiliza la técnica de iteradores del Capítulo 2.5 para sumar la distancia entre puntos consecutivos, mirando **solo** las coordenadas válidas:

```rust,ignore
impl Coord {
    fn distancia_a(&self, otro: &Self) -> f64 {
        let dlat = self.lat - otro.lat;
        let dlon = self.lon - otro.lon;
        (dlat * dlat + dlon * dlon).sqrt()
    }
}

fn longitud_total(puntos: &[Coord]) -> f64 {
    puntos.windows(2).map(|par| par[0].distancia_a(&par[1])).sum()
}
```

**Al estilo TDD:** el criterio de éxito antes que la implementación — incluyendo el caso límite que es fácil olvidar (una ruta con un solo punto, o ninguno, no tiene "distancia recorrida"):

```rust,ignore
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suma_las_distancias_entre_puntos_consecutivos() {
        let ruta = [
            Coord { lat: 0.0, lon: 0.0 },
            Coord { lat: 3.0, lon: 0.0 },
            Coord { lat: 3.0, lon: 4.0 },
        ];
        // 0,0 -> 3,0 mide 3; 3,0 -> 3,4 mide 4. Total: 7.
        assert_eq!(longitud_total(&ruta), 7.0);
    }

    #[test]
    fn una_ruta_de_un_solo_punto_mide_cero() {
        let ruta = [Coord { lat: 4.71, lon: -74.07 }];
        assert_eq!(longitud_total(&ruta), 0.0);
    }

    #[test]
    fn una_ruta_vacia_mide_cero() {
        let ruta: [Coord; 0] = [];
        assert_eq!(longitud_total(&ruta), 0.0);
    }
}
```

Verificado: los tres tests pasan — `.windows(2)` sobre un slice de 0 o 1 elementos simplemente no produce ningún par, así que `.sum()` sobre un iterador vacío da `0.0` sin que tengas que manejar ese caso límite explícitamente con un `if`.

## Checkpoint 4 — `main()` real: argumentos de línea de comandos y archivo

Con la lógica pura ya escrita y testeada, `main()` se reduce a leer un argumento, leer un archivo, y presentar el resultado:

```rust,ignore
use std::env;
use std::fs;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let Some(ruta_csv) = args.get(1) else {
        eprintln!("Uso: geoapi-api <archivo.csv>");
        return ExitCode::FAILURE;
    };

    let contenido = match fs::read_to_string(ruta_csv) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("No se pudo leer '{ruta_csv}': {e}");
            return ExitCode::FAILURE;
        }
    };

    let resumen = procesar_csv(&contenido);

    for (linea, error) in &resumen.errores {
        eprintln!("Línea {linea}: {error:?}");
    }

    println!(
        "Procesadas {} coordenadas válidas, {} con error.",
        resumen.validas.len(),
        resumen.errores.len()
    );

    if !resumen.validas.is_empty() {
        println!("Longitud total de la ruta: {:.4} (unidades de grado, no metros — eso llega en el Capítulo 3.3)", longitud_total(&resumen.validas));
    }

    if resumen.errores.is_empty() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
```

Nota el comentario sobre "unidades de grado, no metros": con lo que sabes hasta ahora, la distancia euclidiana entre dos pares lat/lon no es una distancia real sobre la superficie terrestre — es solo la distancia entre dos números en un plano. Convertir eso en metros reales usando la fórmula de Haversine es exactamente el contenido del Capítulo 3.3. Aquí lo dejamos así a propósito: no vamos a fingir precisión que el código de este capítulo todavía no tiene.

## Probarlo de punta a punta

Crea un archivo `rutas.csv` junto al `Cargo.toml` de `geoapi-api`:

```text
lat,lon
4.7110,-74.0721
6.2442,-75.5812
95.0,-74.0
3.4516,-76.5320
```

Y corre:

```sh
cargo run -p geoapi-api -- rutas.csv
```

Deberías ver un error reportado para la línea 4 (`95.0,-74.0`, latitud fuera de rango) en `stderr`, y en `stdout` un resumen con 3 coordenadas válidas y la longitud total de la ruta que forman.

**Criterio de aceptación del proyecto:** tu binario reporta correctamente filas válidas e inválidas sin detenerse en el primer error, y calcula la longitud total solo sobre las filas válidas. Si tu implementación difiere de la de este capítulo pero cumple ese comportamiento verificado por los tests del Checkpoint 2, tu GeoAPI v0.1 es correcto — no necesitas que el código sea idéntico línea por línea al del libro.
