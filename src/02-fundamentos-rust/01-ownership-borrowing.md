# 2.1 Ownership, borrowing y por qué importan en GIS

Imagina que tu servidor GeoAPI recibe una `LineString` que representa la ruta de un vehículo de reparto: puede traer decenas de miles de puntos de GPS. Un handler de tu API necesita calcular su longitud. Otro necesita simplificarla para dibujarla en un mapa. Un tercero necesita guardarla en PostGIS. Los tres necesitan *leer* esa misma geometría — y ninguno de los tres debería tener que hacer su propia copia completa de decenas de miles de coordenadas solo para mirarlas.

En un lenguaje con recolector de basura, esto no es un problema del que te tengas que preocupar mucho: pasas una referencia, el recolector se encarga de saber cuándo ya nadie la usa y libera la memoria. Rust no tiene recolector de basura, y sin embargo tampoco te obliga a copiar todo constantemente ni a liberar memoria a mano como en C. La solución es un sistema de reglas que el compilador verifica **antes de que tu programa corra**, llamado *ownership* (propiedad) y *borrowing* (préstamo). Es, con diferencia, el concepto más distintivo de Rust — y el que más fricción inicial produce. Vale la pena entenderlo bien desde ya, porque cada capítulo restante de este libro lo da por asumido.

## Cada valor tiene un único dueño

En Rust, todo valor tiene exactamente un dueño (*owner*) en cada momento. Cuando ese dueño sale de ámbito (*scope*), Rust libera la memoria automáticamente — sin recolector de basura, sin que tú llames a `free()`. Míralo con una geometría mínima:

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

fn main() {
    let bogota = Coord { lat: 4.7110, lon: -74.0721 };
    println!("Latitud: {}", bogota.lat);
} // aquí `bogota` sale de ámbito y Rust libera su memoria
```

Nada sorprendente todavía. La parte interesante empieza cuando intentas usar el mismo valor desde dos sitios.

## Mover un valor no es copiarlo

Con tipos como `String` o `Vec<T>` (una lista de tamaño variable, como la que usarías para los puntos de una `LineString`), asignar una variable a otra **mueve** la propiedad — no la copia:

```rust,ignore
struct Coord {
    lat: f64,
    lon: f64,
}

fn main() {
    let ruta: Vec<Coord> = vec![
        Coord { lat: 4.71, lon: -74.07 },
        Coord { lat: 4.65, lon: -74.10 },
    ];

    let otra_variable = ruta; // `ruta` se MUEVE a `otra_variable`

    println!("{}", ruta.len()); // ERROR: `ruta` ya no es válida aquí
}
```

Si compilas esto, el compilador rechaza el programa con un error del estilo `value borrowed here after move`. No es un capricho: como solo puede haber un dueño, en cuanto `otra_variable` toma posesión del `Vec`, `ruta` deja de ser una forma válida de acceder a esos datos. Esto elimina de raíz una categoría entera de bugs de C/C++ — el *use-after-free*, donde un puntero sigue apuntando a memoria que ya fue liberada por otro dueño. En Rust, ese error simplemente no compila.

Esto explica algo que vas a ver constantemente en crates geoespaciales como `geo`: funciones que devuelven un nuevo valor en vez de mutar el original casi siempre están **consumiendo** (tomando posesión de) su entrada, no tomándola prestada. Si una función recibe un `Polygon` por valor (`fn simplify(p: Polygon<f64>) -> Polygon<f64>`), después de llamarla ya no tienes el original — se movió adentro de la función.

## Pedir prestado en vez de mover: `&T`

Si mover la propiedad cada vez que quieres *leer* un valor sonara agotador para una API con miles de requests concurrentes, es porque lo sería. Por eso Rust te deja **pedir prestada** una referencia sin tomar posesión, con el operador `&`:

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

struct LineString {
    puntos: Vec<Coord>,
}

// `&LineString` es un préstamo: esta función LEE la ruta, no se queda con ella.
fn contar_puntos(ruta: &LineString) -> usize {
    ruta.puntos.len()
}

fn main() {
    let ruta = LineString {
        puntos: vec![
            Coord { lat: 4.71, lon: -74.07 },
            Coord { lat: 4.65, lon: -74.10 },
            Coord { lat: 4.60, lon: -74.15 },
        ],
    };

    let total = contar_puntos(&ruta); // prestamos `ruta`, no la movemos
    println!("La ruta tiene {} puntos", total);

    // `ruta` sigue siendo válida aquí, porque nunca se movió.
    println!("Sigue disponible: {} puntos", ruta.puntos.len());
}
```

Esto es exactamente lo que necesitas para el escenario del principio del capítulo: tres handlers distintos pueden recibir `&LineString` y leer la misma geometría, sin copiarla ni pelearse por quién es el dueño. Ese `&` no es una anotación cosmética — es la diferencia entre copiar decenas de miles de coordenadas en cada request, o no copiar ni un byte.

## La regla que hace esto seguro: préstamos exclusivos para mutar

Hasta acá, `&T` te deja leer. Si necesitas modificar el valor prestado —por ejemplo, una función que traslada todos los puntos de una ruta— pides un préstamo mutable con `&mut T`:

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

fn trasladar(puntos: &mut Vec<Coord>, delta_lat: f64, delta_lon: f64) {
    for p in puntos.iter_mut() {
        p.lat += delta_lat;
        p.lon += delta_lon;
    }
}

fn main() {
    let mut ruta = vec![
        Coord { lat: 4.71, lon: -74.07 },
        Coord { lat: 4.65, lon: -74.10 },
    ];

    trasladar(&mut ruta, 0.01, -0.01);

    println!("Nueva latitud del primer punto: {}", ruta[0].lat);
}
```

Aquí está la regla que hace que todo esto sea memory-safe sin recolector de basura, y que vale la pena memorizar porque es la fuente del 80% de los errores de compilación que vas a ver al empezar: **en cualquier momento dado, puedes tener o bien un préstamo mutable (`&mut T`), o bien cualquier cantidad de préstamos inmutables (`&T`) — nunca ambos a la vez.**

Piénsalo desde el problema que resuelve, no como una regla arbitraria: si un handler estuviera leyendo una `LineString` (`&LineString`) mientras otro la está mutando al mismo tiempo (`&mut LineString`), el lector podría ver una geometría a medio actualizar — la mitad de los puntos trasladados, la mitad no. En un lenguaje sin esta regla, ese es exactamente el tipo de *data race* que solo se manifiesta bajo carga, de forma intermitente, y que es carísimo de depurar en producción. Rust convierte ese bug potencial en un error de compilación, verificado antes de que el programa corra siquiera una vez.

```rust,ignore
struct Coord { lat: f64, lon: f64 }

fn main() {
    let mut ruta = vec![Coord { lat: 4.71, lon: -74.07 }];

    let lector = &ruta;           // préstamo inmutable
    let escritor = &mut ruta;     // ERROR: ya hay un préstamo inmutable activo

    println!("{}", lector.len());
    escritor.push(Coord { lat: 0.0, lon: 0.0 });
}
```

El compilador rechaza esto con `cannot borrow ruta as mutable because it is also borrowed as immutable`. No hay forma de "convencer" al compilador de que en este caso particular no pasaría nada malo — y esa rigidez, cuando la sientas por primera vez, es la fricción de la que hablamos en la introducción del libro. La ganancia a cambio es que un servidor GeoAPI escrito en Rust no puede, por construcción, sufrir ese tipo específico de corrupción de datos en memoria compartida.

## Lifetimes: cuánto dura un préstamo

Queda una pregunta: si una función devuelve una referencia, ¿cómo sabe el compilador que esa referencia sigue siendo válida cuando quien la recibe la usa? Esto se vuelve relevante, por ejemplo, en una función que encuentra el punto más al norte de una ruta y quiere devolver una referencia a él en vez de copiarlo:

```rust
struct Coord {
    lat: f64,
    lon: f64,
}

// El lifetime `'a` dice: "la referencia que devuelvo vive, como máximo,
// tanto como el préstamo `puntos` que recibí."
fn punto_mas_norte<'a>(puntos: &'a [Coord]) -> &'a Coord {
    let mut mas_norte = &puntos[0];
    for p in puntos.iter() {
        if p.lat > mas_norte.lat {
            mas_norte = p;
        }
    }
    mas_norte
}

fn main() {
    let ruta = vec![
        Coord { lat: 4.71, lon: -74.07 },
        Coord { lat: 6.25, lon: -75.56 }, // Medellín: más al norte
        Coord { lat: 3.45, lon: -76.53 },
    ];

    let extremo = punto_mas_norte(&ruta);
    println!("Punto más al norte: {}", extremo.lat);
}
```

La anotación `<'a>` no cambia en absoluto cuánto tiempo vive nada en tiempo de ejecución — no es un tipo de recolección de basura ni un contador de referencias. Es información que le das al compilador para que pueda verificar, en tiempo de compilación, una promesa: *"la referencia que te devuelvo no va a sobrevivir más que la referencia que me diste."* Con esa promesa, el compilador puede rechazar en la llamada cualquier uso de `extremo` después de que `ruta` deje de ser válida — antes de que tu programa corra ni una vez, y sin necesidad de un recolector de basura verificando nada en tiempo real.

En la mayoría de funciones que vas a escribir en este libro, el compilador infiere los lifetimes automáticamente y no necesitas escribir `'a` en absoluto — solo se vuelve explícito cuando una función tiene más de una referencia de entrada y el compilador no puede adivinar cuál de ellas determina la duración de la referencia de salida. Vas a volver a ver esto, con geometrías reales de `geo-types`, en el Capítulo 3.1.

## Ejercicios

**Ejercicio 1 — Pasar una geometría por referencia sin copiarla.**
Se te da la siguiente `struct` y una función que calcula el número de vértices de un polígono simplificado (representado aquí, sin usar todavía el crate `geo`, como un `Vec<Coord>` del anillo exterior):

```rust,ignore
struct Coord { lat: f64, lon: f64 }
struct PoligonoSimple { anillo: Vec<Coord> }

fn contar_vertices(p: PoligonoSimple) -> usize { // <- toma posesión, no debería
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

    let n1 = contar_vertices(poligono);
    let n2 = contar_vertices(poligono); // se necesita usar el polígono dos veces
    println!("{n1} {n2}");
}
```

Este código no compila. Corrige la firma de `contar_vertices` para que tome el polígono **por referencia**, y ajusta la llamada en `main` para que el programa compile y ambas líneas impriman `3`.

*Criterio de éxito:* el programa compila con `cargo build` y `cargo run` imprime `3 3`.

**Ejercicio 2 — Identificar por qué una función no compila.**
El siguiente fragmento intenta trasladar una ruta y luego imprimir cuántos puntos tenía originalmente:

```rust,ignore
struct Coord { lat: f64, lon: f64 }

fn trasladar(mut puntos: Vec<Coord>, delta: f64) -> Vec<Coord> {
    for p in puntos.iter_mut() {
        p.lat += delta;
    }
    puntos
}

fn main() {
    let ruta = vec![Coord { lat: 4.0, lon: -74.0 }];
    let original_len = ruta.len();
    let ruta_trasladada = trasladar(ruta, 0.5);
    println!("{} {}", original_len, ruta_trasladada.len());
}
```

Este ejemplo en particular sí compila. Tu tarea: explica por escrito (un comentario de una línea encima de cada variable involucrada basta) en qué punto exacto `ruta` deja de ser accesible, y por qué mover `original_len` a una variable *antes* de esa línea es lo que hace que el programa compile. Luego, escribe una segunda versión donde intercambies el orden de las dos líneas (`trasladar` antes que `ruta.len()`) y confirma que esa versión sí falla al compilar, copiando el mensaje de error exacto que da el compilador.

*Criterio de éxito:* tienes ambas versiones (la que compila y la que no) y puedes citar, en tus propias palabras, la línea del mensaje de error que menciona el `move`.

**Ejercicio 3 — Corregir un lifetime.**
La siguiente función pretende devolver una referencia al punto de una ruta más cercano a un punto de referencia dado, pero no compila:

```rust,ignore
struct Coord { lat: f64, lon: f64 }

fn mas_cercano(puntos: &[Coord], referencia: &Coord) -> &Coord {
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

fn distancia(a: &Coord, b: &Coord) -> f64 {
    ((a.lat - b.lat).powi(2) + (a.lon - b.lon).powi(2)).sqrt()
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

El error del compilador menciona que falta especificar de cuál de los dos parámetros de referencia depende el lifetime de retorno. Añade la anotación de lifetime necesaria en la firma de `mas_cercano` para que el programa compile, y asegúrate de que el valor devuelto esté ligado al lifetime de `puntos` (no al de `referencia` — piensa en por qué esa elección es la correcta dado lo que la función devuelve).

*Criterio de éxito:* el programa compila y `cargo run` imprime `4.71`.
