# 4.5 Fundamentos de Async Rust y Tokio

Hasta ahora, todo el código de GeoAPI ha sido síncrono: cada función corre de principio a fin, ocupando su hilo hasta que termina. Eso funciona perfectamente para calcular un área o simplificar una geometría — trabajo de CPU puro, sin nada que esperar. Pero el próximo capítulo va a hacer algo distinto: pedirle una fila a PostGIS por la red. Y ahí un programa síncrono tiene un problema real de escala.

## El problema que resuelve async

Imagina GeoAPI atendiendo mil peticiones simultáneas, cada una esperando una respuesta de PostGIS que tarda 20 milisegundos en llegar. Si cada petición ocupa un hilo del sistema operativo mientras espera, necesitas mil hilos — cada uno con su propia pila de memoria (típicamente varios megabytes) y con un costo real de cambio de contexto para el sistema operativo. La mayoría de ese tiempo, esos mil hilos no están haciendo nada: están *esperando* una respuesta de red, no calculando nada.

**Async** resuelve esto con un cambio de modelo: en vez de un hilo por petición, un número pequeño de hilos (normalmente uno por núcleo de CPU) se reparte todas las peticiones concurrentes, cediendo el turno cada vez que una tarea se queda esperando algo (una respuesta de red, un archivo, un timer) en vez de bloquear ese hilo hasta que la espera termine. Esto es exactamente lo que vas a necesitar para que GeoAPI escale a miles de conexiones concurrentes sin miles de hilos del sistema operativo.

## `Future`: un cómputo que todavía no terminó

La pieza central de todo el sistema async de Rust es el trait `Future`. Su forma, simplificada, es esta:

```rust,ignore
trait Future {
    type Output;
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}

enum Poll<T> {
    Ready(T),
    Pending,
}
```

Un `Future` es un valor que representa "un cómputo que puede no haber terminado todavía". Su único método, `poll`, se llama repetidamente (por el *runtime*, nunca por ti a mano) y devuelve una de dos cosas: `Poll::Ready(valor)` si el cómputo ya terminó, o `Poll::Pending` si todavía no — en cuyo caso el `Future` es responsable de avisar, más adelante, cuándo vale la pena volver a intentarlo (con el `Waker` que trae el `Context`, que vas a ver en acción en un momento).

Esto no es teoría abstracta que nunca vas a tocar directamente — vale la pena ver un `Future` escrito a mano, aunque nunca vuelvas a escribir uno así en el resto del libro, precisamente para que la palabra deje de sentirse mágica:

```rust,ignore
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

struct Inmediato(i32);

impl Future for Inmediato {
    type Output = i32;

    fn poll(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<i32> {
        Poll::Ready(self.0) // este Future nunca está "a medias": siempre está listo
    }
}

#[tokio::main]
async fn main() {
    let resultado = Inmediato(7).await;
    println!("{resultado}"); // 7
}
```

*(Ignora `#[tokio::main]` por una sección más — llegamos a qué hace en un momento.)*

`Inmediato` es el `Future` más simple posible: siempre está listo de inmediato, así que `poll` nunca devuelve `Pending`. Un `Future` real — como el que te va a devolver `sqlx::query(...).fetch_one(pool)` en el próximo capítulo — casi siempre va a devolver `Pending` la primera vez (mientras la consulta viaja por la red) antes de eventualmente devolver `Ready` con la fila.

## Qué hace `.await` exactamente

Cuando escribes `algo.await` dentro de una función `async`, no estás llamando una función normal — estás pidiéndole al runtime: *"corre el `poll()` de este `Future`; si devuelve `Pending`, pausa esta función exactamente aquí (sin bloquear el hilo) y devuélveme el control cuando el `Future` avise que ya puede progresar; si devuelve `Ready`, dame el valor y sigue"*.

Esto tiene una consecuencia que sorprende la primera vez que la ves: **llamar una función `async fn` no ejecuta su cuerpo.** Devuelve un `Future` inerte, que no hace nada hasta que alguien lo `.await`ea (o lo pasa a algo que sí lo haga, como `tokio::spawn`):

```rust,ignore
async fn calcular_algo() -> i32 {
    println!("  (calculando...)");
    42
}

#[tokio::main]
async fn main() {
    println!("Antes de llamar calcular_algo()");
    let futuro = calcular_algo(); // todavía no imprime nada
    println!("Después de llamar, antes de .await");
    let valor = futuro.await; // aquí sí corre el cuerpo
    println!("Valor: {valor}");
}
```

```text
Antes de llamar calcular_algo()
Después de llamar, antes de .await
  (calculando...)
Valor: 42
```

Fíjate en el orden: `"(calculando...)"` aparece *después* de `"Después de llamar, antes de .await"`, no antes. Esa es la prueba de que `calcular_algo()` por sí sola no ejecutó nada — solo construyó el `Future`. El cuerpo corre recién cuando `.await` empieza a hacerle `poll`.

## Por qué hace falta un runtime

Un `Future` no se mueve solo. Algo tiene que llamar a `poll()` la primera vez, y volver a llamarlo cada vez que el `Waker` avise que hay progreso posible. Ese "algo" es el **runtime** — en este libro, [Tokio](https://crates.io/crates/tokio) (versión 1 en todos los capítulos siguientes). `#[tokio::main]` es una macro que, antes de ejecutar tu `async fn main()`, arranca ese runtime y le entrega tu función como el primer `Future` a ejecutar; `#[tokio::test]`, que ya usaste en proyectos anteriores sin esta explicación, hace exactamente lo mismo para un test individual.

Sin un runtime corriendo, un `Future` es solo una estructura de datos inerte — puedes construirlo, pero nada lo va a mover hacia `Ready` jamás. Esta es la razón por la que **cada** función `async fn main()` de este libro empieza con `#[tokio::main]`: sin esa línea, el programa compilaría pero no haría nada.

Para ver el mecanismo `Pending`/`Waker` completo (no solo el caso trivial de `Inmediato`, que siempre está listo), este `Future` cede el control tres veces antes de terminar, pidiendo explícitamente que se le vuelva a hacer `poll`:

```rust,ignore
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

struct Contador {
    restantes: u32,
}

impl Future for Contador {
    type Output = &'static str;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<&'static str> {
        if self.restantes == 0 {
            Poll::Ready("listo")
        } else {
            self.restantes -= 1;
            cx.waker().wake_by_ref(); // "vuelve a intentar pronto"
            Poll::Pending
        }
    }
}

#[tokio::main]
async fn main() {
    let resultado = Contador { restantes: 3 }.await;
    println!("{resultado}"); // listo, después de 3 llamadas a poll() que devolvieron Pending
}
```

`cx.waker().wake_by_ref()` es la pieza que evita que el runtime tenga que adivinar cuándo volver a intentar: el propio `Future` (o, en un caso real como una conexión de red, el sistema operativo avisando "ya llegaron datos") le dice al runtime "hazme `poll` otra vez". Un `Future` real que espera una respuesta de PostGIS guarda ese `Waker` y lo llama cuando el paquete de red efectivamente llega — sin que el runtime tenga que preguntar "¿ya, ya, ya?" en un bucle que gastaría CPU sin necesidad.

## Concurrencia real: `tokio::join!`

Todo lo anterior explica el mecanismo, pero no todavía el beneficio práctico. Este ejemplo simula dos consultas a servicios distintos (con `tokio::time::sleep`, que es un `Future` real que sí devuelve `Pending` mientras espera) y las corre concurrentemente con `tokio::join!`:

```rust,ignore
use std::time::{Duration, Instant};

async fn consultar_servicio(nombre: &str, ms: u64) -> String {
    tokio::time::sleep(Duration::from_millis(ms)).await;
    format!("{nombre} lista")
}

#[tokio::main]
async fn main() {
    let inicio = Instant::now();

    let (zonas, features) = tokio::join!(
        consultar_servicio("zonas", 50),
        consultar_servicio("features", 50),
    );

    println!("{zonas}, {features} -- en {:?}", inicio.elapsed());
}
```

```text
zonas lista, features lista -- en 51.430088ms
```

Dos esperas de 50ms cada una terminan en ~51ms, no ~100ms — porque mientras la primera espera (`Pending`, sin ocupar el hilo), el runtime avanza la segunda. Si hubieras escrito `consultar_servicio("zonas", 50).await` seguido de `consultar_servicio("features", 50).await` como dos líneas separadas, sí habrías pagado los ~100ms completos: cada `.await` espera a que el anterior termine antes de empezar. Esta es exactamente la ganancia que vas a explotar cuando GeoAPI necesite consultar PostGIS y, en paralelo, hacer alguna otra operación de red.

## `tokio::spawn`: una tarea que corre por su cuenta

`tokio::join!` espera a que *ambos* `Future` terminen antes de continuar. A veces quieres lanzar una tarea y seguir sin esperarla de inmediato — para eso está `tokio::spawn`, que entrega un `Future` al runtime para que lo ejecute de forma independiente:

```rust,ignore
#[tokio::main]
async fn main() {
    let tarea = tokio::spawn(async {
        println!("  (tarea en segundo plano)");
        42
    });

    println!("main sigue corriendo mientras la tarea se ejecuta");

    let resultado = tarea.await.unwrap(); // esperar el resultado, cuando sí lo necesites
    println!("resultado: {resultado}");
}
```

Vas a ver `tokio::spawn` reaparecer más adelante para tareas que genuinamente no dependen del flujo principal de una petición — por ejemplo, un log asíncrono que no debería retrasar la respuesta al cliente.

## Lo que este capítulo NO cubre (todavía)

Ya sabes qué es un `Future`, qué hace `.await`, por qué hace falta un runtime, y cómo correr trabajo concurrente con `tokio::join!`/`tokio::spawn`. Falta una pieza — y es importante, porque es la fuente de un bug muy real en servidores async: **no todo el trabajo dentro de un `async fn` es igual de "amigable" con este modelo.** Un cálculo de `geo` (reproyectar, simplificar) no tiene ningún `.await` — ocupa el hilo de principio a fin sin cederlo nunca, y eso tiene una consecuencia concreta para un servidor con muchas peticiones concurrentes. Esa es exactamente la pregunta que responde, con una medición real, la sección "El contrato de Tokio: IO-bound vs. CPU-bound" del Capítulo 5.1 — no la repetimos aquí porque necesita el servidor Axum del Capítulo 4.8 para medirse con datos reales, pero ya tienes todo el vocabulario para entenderla en cuanto llegues.

## Ejercicios

**Ejercicio 1 — Medir la diferencia entre secuencial y concurrente.**
Escribe un `#[tokio::test]` con dos llamadas a una función `async fn esperar_y_devolver(ms: u64, valor: &str) -> String` (usa `tokio::time::sleep`) de 100ms cada una. Mide el tiempo total de ejecutarlas: (a) una tras otra con dos `.await` separados, y (b) juntas con `tokio::join!`. Imprime ambos tiempos.

*Criterio de éxito:* la versión (a) toma un tiempo cercano a 200ms; la versión (b) toma un tiempo cercano a 100ms — confirmado con un `assert!` que compare ambos tiempos (por ejemplo, `assert!(tiempo_concurrente < tiempo_secuencial / 2)`).

**Ejercicio 2 — Un `Future` que cede el control dos veces.**
Escribe tu propio `struct EsperaManual` implementando `Future<Output = String>`, similar a `Contador` del capítulo, que devuelva `Poll::Pending` exactamente dos veces (llamando `cx.waker().wake_by_ref()` cada vez) antes de devolver `Poll::Ready("completado".to_string())` en la tercera llamada a `poll`.

*Criterio de éxito:* `EsperaManual::nuevo().await` dentro de un `#[tokio::main]` (o `#[tokio::test]`) imprime `"completado"`, y un contador interno (puedes exponerlo con un campo público o un `println!` dentro de `poll`) confirma que `poll` se llamó exactamente tres veces.

**Ejercicio 3 — Identificar dónde se cede el control.**
Dado este fragmento:

```rust,ignore
async fn procesar(id: i32) -> i32 {
    let doble = id * 2;                          // (A)
    let fila = consultar_base_de_datos(id).await; // (B)
    let resultado = doble + fila;                 // (C)
    tokio::time::sleep(Duration::from_millis(10)).await; // (D)
    resultado                                     // (E)
}
```

Identifica, para cada punto marcado (A)–(E), si ahí el hilo que ejecuta `procesar` puede quedar libre para atender otra tarea, o si necesariamente sigue ocupado con esta función hasta el siguiente punto marcado. Justifica cada respuesta en una línea.

<details>
<summary>Pista</summary>

Solo los puntos con `.await` son candidatos a ceder el control — y solo si el `Future` que se está esperando de verdad devuelve `Pending` en ese momento (no todos lo hacen siempre, como viste con `Inmediato`).

</details>

*Criterio de éxito:* identificas correctamente que (B) y (D) son los únicos puntos de cesión potencial, y explicas que (A), (C) y (E) son código síncrono normal que corre sin ceder nada, sin importar cuánto tarden — algo que se vuelve importante en el Capítulo 5.1.

> Vas a usar `#[tokio::main]`/`#[tokio::test]` en cada capítulo restante del libro sin que se vuelva a explicar — este es el capítulo al que volver si alguna vez la palabra "async" deja de sentirse obvia.
