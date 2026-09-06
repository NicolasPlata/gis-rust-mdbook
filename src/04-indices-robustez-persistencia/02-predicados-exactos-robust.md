# 4.2 Predicados exactos con `robust`

En el capítulo anterior viste que `geo::Line::contains` daba la respuesta correcta sobre un trío de puntos casi colineales, mientras que una fórmula de orientación escrita a mano con `f64` puro se equivocaba. La razón: `geo` protege automáticamente cualquier tipo `f64` con un **kernel robusto** respaldado por el crate [`robust`](https://crates.io/crates/robust) (versión 1.2 en este capítulo). Esa protección es automática *dentro* de `geo` — pero el día que necesites escribir tu propio predicado geométrico sin pasar por `Relate`, `Contains` o `Intersects`, la responsabilidad de evitar este error vuelve a ser tuya. Este capítulo te enseña a usar `robust` directamente para ese caso.

## Por qué la aritmética de punto flotante ingenua falla aquí

El problema no es que `f64` sea "impreciso" en general — es que ciertas operaciones, cuando restas dos números de magnitud similar, sufren **cancelación catastrófica**: los bits significativos se cancelan entre sí y lo que queda es, en gran parte, ruido de redondeo acumulado en pasos anteriores. El test de orientación clásico (¿el punto `c` está a la izquierda, a la derecha, o exactamente sobre la línea `a→b`?) se calcula con un producto cruzado:

```text
orientación(a, b, c) = (b.x - a.x)(c.y - a.y) - (b.y - a.y)(c.x - a.x)
```

Cuando `a`, `b` y `c` están casi alineados y sus coordenadas tienen varios dígitos significativos (como coordenadas UTM en metros: `541954.234...`), el resultado matemáticamente correcto es un número muy pequeño — la fórmula está restando dos productos casi idénticos. En `f64`, esa resta casi siempre pierde precisión, y en el peor caso (como viste en el capítulo anterior) da **exactamente `0`** cuando el valor real no lo es. Para un test de orientación, eso no es un error de redondeo inofensivo: es la diferencia entre "el punto está sobre la línea" y "el punto está a la izquierda", una respuesta cualitativamente distinta.

## `robust`: aritmética adaptativa de precisión exacta

`robust` es una traducción directa a Rust del trabajo de Jonathan Shewchuk (*Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates*, 1997): un conjunto de algoritmos que calculan estos predicados con la precisión exacta que hace falta, ni más ni menos. La idea clave es **adaptativa**: primero intenta con aritmética rápida de punto flotante normal, y solo si detecta que el resultado podría estar contaminado por error de redondeo (comparando contra una cota de error conocida de antemano), recalcula usando aritmética de mayor precisión. Esto es lo que le permite ser casi tan rápido como la fórmula ingenua en el caso común, y exacto en el caso raro que realmente importa.

El crate expone dos predicados principales:

- **`orient2d(pa, pb, pc)`**: devuelve un `f64` cuyo signo (no su magnitud exacta) es la respuesta confiable — positivo si `pc` está a la izquierda del rayo `pa→pb` (orientación antihoraria), negativo si está a la derecha, y `0.0` si y *solo si* están genuinamente colineales.
- **`incircle(pa, pb, pc, pd)`**: dado un triángulo `pa, pb, pc` en orden antihorario, dice si `pd` cae dentro de su circunferencia circunscrita. Es la base de la **triangulación de Delaunay**, un tema que no cubre este libro en detalle pero que sustenta muchos algoritmos de índices espaciales e interpolación — vale la pena saber que existe y que tiene el mismo problema de precisión que `orient2d`.

```rust,ignore
use robust::{orient2d, Coord};

fn orientacion_ingenua(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> f64 {
    (pb.0 - pa.0) * (pc.1 - pa.1) - (pb.1 - pa.1) * (pc.0 - pa.0)
}

fn lado(v: f64) -> &'static str {
    if v > 0.0 {
        "izquierda (CCW)"
    } else if v < 0.0 {
        "derecha (CW)"
    } else {
        "exactamente sobre la línea"
    }
}

fn main() {
    // Los mismos tres vértices casi colineales del Capítulo 4.1.
    let a = (541954.2342008898, 4446963.1029158225);
    let b = (511991.33731518185, 4437588.90842336);
    let c = (509475.34975933394, 4436801.7563406);

    let ingenua = orientacion_ingenua(a, b, c);
    let robusta = orient2d(
        Coord { x: a.0, y: a.1 },
        Coord { x: b.0, y: b.1 },
        Coord { x: c.0, y: c.1 },
    );

    println!("orientación ingenua: {ingenua} -> {}", lado(ingenua));
    println!("orientación robusta: {robusta:e} -> {}", lado(robusta));
}
```

```text
orientación ingenua: 0 -> exactamente sobre la línea
orientación robusta: 2.60770320892334e-8 -> izquierda (CCW)
```

El valor exacto de `2.6e-8` no es el dato importante aquí — lo que importa es que **no es cero**, y que su signo te dice de qué lado está el punto realmente. La fórmula ingenua no solo se equivoca en la magnitud: se equivoca en la pregunta más básica de todas ("¿está sobre la línea o no?"), y esa clase de error se propaga: si estuvieras construyendo tu propio índice espacial basado en triangulación (algo que herramientas como `rstar`, que ves en el Capítulo 4.3, resuelven por ti) y usaras la fórmula ingenua, podrías terminar con triángulos mal formados o vecinos incorrectos, todo porque un `if resultado == 0.0` tomó la rama equivocada en un caso límite.

## Cuándo necesitas `robust` tú mismo

La regla práctica: **si estás llamando a un método de `geo` sobre un tipo `f64`, ya estás protegido** — no necesitas `robust` de forma explícita. Lo necesitas cuando escribes un algoritmo geométrico propio que no pasa por `geo`: un test de orientación para un formato de datos que `geo` no cubre, una optimización de bajo nivel donde no quieres pagar el costo de construir un `Polygon` completo solo para preguntar de qué lado está un punto, o (el caso más común en la práctica) cuando implementas un algoritmo de geometría computacional desde cero como ejercicio de aprendizaje — exactamente lo que acabas de hacer arriba.

## Ejercicios

**Ejercicio 1 — Reproducir un fallo de precisión con `f64` puro.**
Sin mirar los números del capítulo, busca tú mismo un trío de puntos casi colineales que dispare un desacuerdo entre `orientacion_ingenua` y `orient2d`. Sugerencia de estrategia: parte de un punto `a`, elige una dirección `(dx, dy)`, y genera `b` y `c` como `a + dx·t₁, a + dy·t₁` y `a + dx·t₂, a + dy·t₂` para dos distancias `t₁, t₂` grandes (miles a decenas de miles de metros) — cuanto más grande la distancia y más "recta" la dirección, más margen tiene el redondeo para acumularse.

*Criterio de éxito:* tu programa imprime un trío de puntos donde `orientacion_ingenua(a, b, c) == 0.0` pero `orient2d(...)` da un valor distinto de cero. Si después de varios intentos no encuentras un desacuerdo, documenta en un comentario al menos dos tríos que probaste y por qué crees que no dispararon el error — eso también es una respuesta válida, siempre que muestre que entendiste qué condiciones lo favorecen.

**Ejercicio 2 — Corregirlo con `robust`.**
Escribe una función `fn punto_respecto_a_segmento(pa: (f64, f64), pb: (f64, f64), pc: (f64, f64)) -> std::cmp::Ordering` que use `orient2d` internamente y devuelva `Ordering::Less` si `pc` está a la derecha del segmento `pa→pb`, `Ordering::Greater` si está a la izquierda, y `Ordering::Equal` solo si `orient2d` devuelve exactamente `0.0`. Pruébala tanto con un trío obviamente no colineal como con el trío casi-degenerado del Ejercicio 1 (o el del capítulo), y confirma con un test que el resultado en el caso casi-degenerado **no** es `Ordering::Equal`.

*Criterio de éxito:* `cargo test` pasa con al menos tres casos: un trío claramente a la izquierda, uno claramente a la derecha, y el trío casi-degenerado — los tres verificados con `assert_eq!` contra el `Ordering` esperado, no solo impresos por pantalla.
