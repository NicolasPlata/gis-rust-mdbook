# 4.1 DE-9IM y el trait `Relate`

Hasta ahora GeoAPI sabe representar geometrías (Módulo 2), calcular su área o su longitud, y serializarlas. Pero un endpoint realista como `GET /features?intersects=<geom>` — "dame todas las features que tocan esta zona" — necesita algo que todavía no tienes: una forma precisa y estandarizada de preguntar **cómo se relacionan dos geometrías entre sí topológicamente**. ¿Una está completamente dentro de la otra? ¿Solo se tocan en el borde? ¿Se solapan parcialmente? Este capítulo te da esa herramienta: el **DE-9IM** (*Dimensionally Extended 9-Intersection Model*), el modelo que usa el estándar OGC Simple Features para responder exactamente esa pregunta, y el trait [`Relate`](https://docs.rs/geo/latest/geo/algorithm/relate/trait.Relate.html) de `geo` que lo implementa.

## El modelo: nueve intersecciones, una matriz

Toda geometría del modelo OGC (Punto, `LineString`, `Polygon`, y sus variantes `Multi*`) se descompone en tres partes:

- **Interior (I):** los puntos "estrictamente dentro" de la geometría. Para un `Polygon`, el área encerrada sin el borde. Para una `LineString`, la línea sin sus dos extremos. Para un `Point`, el punto mismo.
- **Boundary (B):** el borde. Para un `Polygon`, el anillo que lo delimita. Para una `LineString` (no cerrada), sus dos puntos extremos. Para un `Point`, el conjunto vacío — un punto no tiene borde.
- **Exterior (E):** todo lo demás del plano.

El DE-9IM compara dos geometrías `A` y `B` cruzando estas tres partes de cada una: `I(A)∩I(B)`, `I(A)∩B(B)`, `I(A)∩E(B)`, `B(A)∩I(B)`, ... nueve intersecciones en total, organizadas en una matriz 3×3. Cada celda no guarda si la intersección existe, sino su **dimensión**: `2` si es un área, `1` si es una línea, `0` si es un punto, y `F` (*false*) si la intersección es vacía. Nueve celdas, cada una con uno de cinco valores posibles — esa matriz identifica sin ambigüedad *cómo* se relacionan dos geometrías, mucho más allá de un simple `true`/`false` de "se tocan o no".

`geo` calcula esta matriz por ti con el trait `Relate`:

```rust,ignore
use geo::{Contains, Relate};
use geo_types::{Coord, LineString, Point, Polygon};

fn main() {
    let zona_cobertura = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 },
            Coord { x: 4.0, y: 0.0 },
            Coord { x: 4.0, y: 4.0 },
            Coord { x: 0.0, y: 4.0 },
            Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    );

    let sensor = Point::new(2.0, 2.0);

    let matriz = zona_cobertura.relate(&sensor);
    println!("matriz: {matriz:?}");
    println!("is_intersects: {}", matriz.is_intersects());
    println!("is_contains: {}", matriz.is_contains());
}
```

```text
matriz: IntersectionMatrix(0F2FF1FF2)
is_intersects: true
is_contains: true
```

La matriz se imprime como una cadena de 9 caracteres, en el orden `I(A)I(B) I(A)B(B) I(A)E(B) B(A)I(B) B(A)B(B) B(A)E(B) E(A)I(B) E(A)B(B) E(A)E(B)` — leyendo `0F2FF1FF2`: el interior del polígono intersecta al punto en dimensión `0` (el punto mismo, ya que un `Point` no tiene borde ni interior propio distinguible), y el resto describe que el punto no toca el borde del polígono y que fuera del polígono todavía queda "exterior" en ambas direcciones. No necesitas memorizar el significado de cada posición para usar `Relate` — para eso existen los métodos de conveniencia como `is_intersects()` o `is_contains()` — pero sí vale la pena entender que **todos esos métodos son, por debajo, una comparación contra un patrón fijo de esta misma matriz.**

## De la matriz al patrón: `.matches()`

`IntersectionMatrix` expone también `.get(CoordPos, CoordPos)` para leer una celda individual, y `.matches(spec)` para comparar la matriz completa contra un patrón de 9 caracteres donde además de los valores exactos (`0`, `1`, `2`, `F`) puedes usar `T` ("cualquier cosa no vacía") y `*` ("no me importa"). Esto es literalmente cómo el propio estándar OGC define cada predicado con nombre:

```rust,ignore
use geo::Relate;
use geo_types::{Coord, LineString, Polygon};

fn main() {
    let cuadrado_a = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 4.0, y: 0.0 },
            Coord { x: 4.0, y: 4.0 }, Coord { x: 0.0, y: 4.0 }, Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    );
    // Comparte el borde derecho (x=4) con cuadrado_a — no se solapan, solo se tocan.
    let cuadrado_b = Polygon::new(
        LineString::new(vec![
            Coord { x: 4.0, y: 0.0 }, Coord { x: 8.0, y: 0.0 },
            Coord { x: 8.0, y: 4.0 }, Coord { x: 4.0, y: 4.0 }, Coord { x: 4.0, y: 0.0 },
        ]),
        vec![],
    );

    let matriz = cuadrado_a.relate(&cuadrado_b);
    println!("matriz: {matriz:?}");
    println!("is_touches(): {}", matriz.is_touches());

    // El mismo resultado, expresado como patrón manual: los interiores no se
    // intersectan (F) y los bordes comparten una línea (dimensión 1).
    println!("matches(\"F***1****\"): {:?}", matriz.matches("F***1****"));
}
```

```text
matriz: IntersectionMatrix(FF2F11212)
is_touches(): true
matches("F***1****"): Ok(true)
```

Esta equivalencia es exactamente el contenido del Ejercicio 1: vas a construir tu propio patrón manual para un caso distinto y confirmar que coincide con lo que `.is_*()` ya calcula.

## Los predicados con nombre que vas a usar en cada endpoint

En la práctica no vas a construir patrones DE-9IM a mano para cada consulta — vas a usar los predicados con nombre, que son exactamente los que el estándar **OGC Simple Feature Access** define y los que un cliente GIS (QGIS, un cliente OGC API Features) espera encontrar en cualquier API espacial seria:

| Predicado | Trait / método | Significado |
|---|---|---|
| `intersects` | `Intersects::intersects` | Cualquier intersección no vacía (el más permisivo — "estas dos geometrías comparten al menos un punto") |
| `contains` | `Contains::contains` | `A` contiene completamente a `B` (el interior de `B` está dentro del interior de `A`) |
| `within` | `Relate::relate(..).is_within()` | El inverso de `contains`: `A` está completamente dentro de `B` |
| `touches` | `Relate::relate(..).is_touches()` | Se tocan solo en el borde, sin que los interiores se crucen |
| `crosses` | `Relate::relate(..).is_crosses()` | Se cruzan parcialmente (una `LineString` que atraviesa un `Polygon` de lado a lado es el caso típico) |
| `overlaps` | `Relate::relate(..).is_overlaps()` | Se solapan parcialmente, sin que una contenga completamente a la otra |

Nota que `Intersects` y `Contains` están disponibles como traits directos (`geometria.intersects(&otra)`), porque son tan comunes que `geo` les da un atajo — pero `touches`, `crosses` y `overlaps` solo llegan a través de `.relate(..).is_*()`. Esto no es una inconsistencia de diseño: son, literal e internamente, la misma matriz calculada una sola vez y consultada de formas distintas.

```rust,ignore
use geo::Relate;
use geo_types::{Coord, LineString, Polygon};

fn main() {
    let zona_a = Polygon::new(
        LineString::new(vec![
            Coord { x: 0.0, y: 0.0 }, Coord { x: 4.0, y: 0.0 },
            Coord { x: 4.0, y: 4.0 }, Coord { x: 0.0, y: 4.0 }, Coord { x: 0.0, y: 0.0 },
        ]),
        vec![],
    );
    let zona_b_solapada = Polygon::new(
        LineString::new(vec![
            Coord { x: 2.0, y: 2.0 }, Coord { x: 6.0, y: 2.0 },
            Coord { x: 6.0, y: 6.0 }, Coord { x: 2.0, y: 6.0 }, Coord { x: 2.0, y: 2.0 },
        ]),
        vec![],
    );
    let via_c_cruza = LineString::new(vec![Coord { x: -1.0, y: 2.0 }, Coord { x: 5.0, y: 2.0 }]);

    println!("zona_a solapa zona_b: {}", zona_a.relate(&zona_b_solapada).is_overlaps());
    println!("zona_a cruza via_c:   {}", zona_a.relate(&via_c_cruza).is_crosses());
}
```

```text
zona_a solapa zona_b: true
zona_a cruza via_c:   true
```

## El caso que rompe la intuición: casi-colinealidad

Todo lo anterior asume que puedes calcular "¿está este punto exactamente sobre esta línea?" de forma confiable. En aritmética real eso es trivial; en `f64`, no siempre. Considera tres vértices consecutivos de una vía larga, en coordenadas UTM (metros) — el tipo de dato que llegaría de un archivo GPS con miles de puntos:

```rust,ignore
use geo::Contains;
use geo_types::{Line, Point};

fn orientacion_ingenua(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> f64 {
    (pb.0 - pa.0) * (pc.1 - pa.1) - (pb.1 - pa.1) * (pc.0 - pa.0)
}

fn main() {
    let a = (541954.2342008898, 4446963.1029158225);
    let b = (511991.33731518185, 4437588.90842336); // vértice intermedio real de la vía
    let c = (509475.34975933394, 4436801.7563406);

    let ingenua = orientacion_ingenua(a, b, c);
    println!("orientación con f64 puro (a, b, c): {ingenua}");
    println!("¿ingenua dice que están perfectamente alineados?: {}", ingenua == 0.0);

    let segmento_a_c = Line::new(Point::new(a.0, a.1), Point::new(c.0, c.1));
    let punto_b = Point::new(b.0, b.1);
    println!("Line(a,c).contains(b) [vía geo::Relate]: {}", segmento_a_c.contains(&punto_b));
}
```

```text
orientación con f64 puro (a, b, c): 0
¿ingenua dice que están perfectamente alineados?: true
Line(a,c).contains(b) [vía geo::Relate]: false
```

Una fórmula de orientación escrita a mano con `f64` puro (el producto cruzado clásico `(b-a) × (c-a)`) da **exactamente `0`** para este trío de puntos — es decir, afirma con total confianza que están perfectamente alineados. Pero `geo::Line::contains`, usando el mismo `f64`, dice que el punto `b` **no** está sobre el segmento `a-c`. ¿Cuál tiene razón?

La respuesta está en el Capítulo 4.2: `geo` no calcula orientación con aritmética `f64` ingenua para los tipos que usa tu API (`Point<f64>`, `Polygon<f64>`, etc.) — internamente usa un **kernel robusto** (`RobustKernel`) respaldado por el crate `robust`, que evita exactamente este tipo de error de cancelación catastrófica. El resultado correcto es que el punto está a una distancia minúscula pero real de la línea (del orden de 10⁻⁸, como vas a confirmar en el próximo capítulo) — no exactamente sobre ella. Para cualquier predicado que pase por `Relate`, `Contains`, `Intersects` o los demás traits de este capítulo, esa protección ya viene incluida. La necesitas *a ti mismo* únicamente el día que escribas un predicado geométrico desde cero sin pasar por `geo` — que es exactamente lo que vas a hacer en el Capítulo 4.2.

## Ejercicios

**Ejercicio 1 — Matriz DE-9IM manual vs. `Relate`.**
Construye dos `Polygon` que se solapen parcialmente (como `zona_a`/`zona_b_solapada` del capítulo). Calcula la matriz con `.relate()`, imprímela, y luego escribe **a mano** (leyendo la documentación del patrón OGC para "overlaps": `A` y `B` tienen la misma dimensión, ninguna contiene completamente a la otra, y ambos interiores se intersectan) un patrón de 9 caracteres que uses con `.matches()` para confirmar el mismo resultado que `.is_overlaps()`.

*Criterio de éxito:* un test con `assert_eq!` que confirme que `matriz.is_overlaps()` y `matriz.matches(tu_patron).unwrap()` dan el mismo booleano para al menos dos pares de polígonos distintos (uno que se solapa, uno que no).

**Ejercicio 2 — Implementar `intersects` con datos reales.**
Modela al menos cuatro "zonas de cobertura" de un servicio (por ejemplo, radios de cobertura de antenas, representados como `Polygon` aproximados por un cuadrado o hexágono alrededor de un centro) y una lista de `Point` que representan solicitudes de clientes. Escribe una función `fn zonas_que_cubren(punto: &Point<f64>, zonas: &[Polygon<f64>]) -> Vec<usize>` que devuelva los índices de todas las zonas cuyo `.intersects(punto)` sea verdadero — la base de lo que un endpoint `GET /cobertura?lat&lon` tendría que hacer.

*Criterio de éxito:* un test con al menos un punto cubierto por dos zonas solapadas a la vez (`zonas_que_cubren` debe devolver ambos índices) y un punto que no está cubierto por ninguna (debe devolver un `Vec` vacío).

**Ejercicio 3 — Implementar `contains`/`touches` con datos reales.**
Usando las mismas zonas de cobertura del Ejercicio 2, escribe dos funciones: `fn zona_contiene_completamente(zona: &Polygon<f64>, otra: &Polygon<f64>) -> bool` (usa `contains`) y `fn zonas_son_adyacentes(a: &Polygon<f64>, b: &Polygon<f64>) -> bool` (usa `.relate(..).is_touches()`). Construye un caso donde una zona pequeña esté completamente dentro de una zona grande, y otro donde dos zonas compartan exactamente un borde sin solaparse.

*Criterio de éxito:* cuatro tests — dos que confirman los casos positivos de cada función, dos que confirman que devuelven `false` en un par de zonas sin relación (por ejemplo, completamente separadas).

**Ejercicio 4 — Caso de colinealidad casi-degenerada.**
Repite el experimento del capítulo (`orientacion_ingenua` vs. `Line::contains`) con un trío de puntos que tú mismo construyas: elige un punto de partida en coordenadas UTM realistas (5 o 6 dígitos antes del punto decimal), una dirección, y dos distancias a lo largo de esa dirección de al menos varios kilómetros — como si fueran tres vértices de una carretera larga y casi recta. Confirma si tu trío también dispara el desacuerdo entre ambos métodos (no todos los tríos lo hacen — depende de la cancelación exacta que ocurra en la aritmética de punto flotante).

*Criterio de éxito:* tu programa imprime el resultado de `orientacion_ingenua` y de `Line::contains` para tu propio trío de puntos, junto con una conclusión escrita de una frase sobre si encontraste el mismo desacuerdo que el capítulo y por qué (si no lo encontraste, explica qué tendría que cambiar en tus números para que aparezca — pista: la magnitud de las coordenadas y qué tan "casi" colineal es el trío importan más que el azar).

> Esta técnica es la que usa el Ejercicio integrador del proyecto GeoAPI v0.3 (Capítulo 4.7, `within-polygon`) — ver la historia de usuario ahí.
