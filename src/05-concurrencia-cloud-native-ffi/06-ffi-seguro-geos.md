# 5.6 FFI seguro — el patrón `-sys` + wrapper, y `geos`

Ya usaste bindings FFI sin pensar mucho en ellos: `proj` (Capítulo 4.4) y `gdal` (Capítulo 4.7) son ambos *wrappers* seguros sobre librerías C (`libproj`, `libgdal`). Este capítulo abre esa caja: cómo se construye un *wrapper* seguro sobre una librería C desde cero, usando **GEOS** (la misma librería que usa PostGIS por debajo para sus operaciones `ST_*`) como caso de estudio, porque vas a construir uno tú mismo, no solo usar uno ya hecho.

## El patrón `-sys` + wrapper

El ecosistema Rust separa casi siempre una dependencia C en dos crates:

- **`foo-sys`**: bindings crudos generados con [`bindgen`](https://crates.io/crates/bindgen) a partir de los headers C — funciones `unsafe extern "C"`, punteros crudos, sin ninguna garantía de Rust encima. `geos-sys` es el ejemplo de este capítulo.
- **`foo`**: un *wrapper* seguro que encapsula todo el `unsafe` en un módulo pequeño, expone tipos idiomáticos de Rust (`Result`, `Option`, RAII), y es lo único que el resto de tu código debería importar. `geos` es ese wrapper para `geos-sys`.

La regla de oro: **el `unsafe` debe vivir en la superficie más pequeña posible**, nunca esparcido por toda tu aplicación. Vas a construir esa superficie mínima ahora mismo.

## Un wrapper mínimo, con un error real de por medio

GEOS expone dos familias de funciones C: una API "simple" (sin sufijo) que depende de un estado global de la librería, y una API **reentrante** (sufijo `_r`) que recibe explícitamente un *contexto* (`GEOSContextHandle_t`) en cada llamada — pensada para que varios hilos puedan usar GEOS sin pisarse. La documentación de GEOS recomienda la API reentrante para cualquier código nuevo, y aquí vas a ver **por qué de forma muy concreta**: la primera versión de este wrapper, escrita con la API simple, produjo esto al recibir un WKT inválido:

```text
fatal runtime error: Rust cannot catch foreign exceptions, aborting
```

**El proceso completo abortó.** No un panic recuperable, no un `Result::Err` — el runtime de Rust detectó una excepción de C++ propagándose a través de la frontera FFI (GEOS está escrito en C++, y una entrada inválida dispara una `ParseException` interna) y, al no poder "atraparla" de forma segura, terminó el proceso. Esto es exactamente el peligro que "encapsular el `unsafe` correctamente" existe para evitar — y la solución fue usar la API reentrante con un **manejador de errores registrado explícitamente**, que convierte esa excepción de C++ en un callback de Rust en vez de dejarla escapar:

```rust,ignore
use geos_sys::{
    GEOSContains_r, GEOSContextHandle_t, GEOSContext_setErrorMessageHandler_r,
    GEOSGeom_destroy_r, GEOSGeometry, GEOSWKTReader_create_r, GEOSWKTReader_destroy_r,
    GEOSWKTReader_read_r, GEOS_finish_r, GEOS_init_r,
};
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::atomic::{AtomicBool, Ordering};

static HUBO_ERROR: AtomicBool = AtomicBool::new(false);

unsafe extern "C" fn manejador_de_error(mensaje: *const c_char, _userdata: *mut c_void) {
    // SAFETY: GEOS garantiza que `mensaje` es un puntero válido a una
    // cadena C terminada en NUL mientras dura esta llamada -- es él quien
    // nos la entrega en este callback.
    let texto = unsafe { CStr::from_ptr(mensaje) }.to_string_lossy();
    eprintln!("[GEOS error]: {texto}");
    HUBO_ERROR.store(true, Ordering::SeqCst);
}

/// Envuelve el `GEOSContextHandle_t` -- el contexto reentrante que exige
/// la API `_r` de GEOS para no compartir estado global entre hilos.
pub struct ContextoGeos(GEOSContextHandle_t);

impl ContextoGeos {
    fn new() -> Self {
        // SAFETY: `GEOS_init_r` no tiene precondiciones -- siempre devuelve
        // un handle válido (o aborta internamente si la asignación falla,
        // según la documentación de GEOS).
        let handle = unsafe { GEOS_init_r() };
        unsafe {
            // SAFETY: `handle` es válido (recién creado arriba) y
            // `manejador_de_error` cumple la firma `GEOSMessageHandler_r`
            // exacta que esta función espera.
            GEOSContext_setErrorMessageHandler_r(handle, Some(manejador_de_error), std::ptr::null_mut());
        }
        Self(handle)
    }
}

impl Drop for ContextoGeos {
    fn drop(&mut self) {
        // SAFETY: `self.0` fue creado por `GEOS_init_r` en `new` y ningún
        // otro código tiene acceso a él (es privado a este struct) -- se
        // libera exactamente una vez, aquí.
        unsafe { GEOS_finish_r(self.0) };
    }
}
```

`ContextoGeos` ya te muestra el primer patrón central de este capítulo: **envolver un recurso en un `struct` cuyo único campo es el puntero/handle crudo, y liberar ese recurso en `Drop`**. Ningún código fuera de este `struct` puede tocar `GEOSContextHandle_t` directamente (el campo es privado), así que es imposible usarlo después de liberado o liberarlo dos veces — el borrow-checker de Rust hace ese trabajo por ti, una vez que el `unsafe` queda contenido aquí.

## Envolver la geometría con el mismo patrón

```rust,ignore
# use geos_sys::*;
# use std::ffi::CString;
# struct ContextoGeos(GEOSContextHandle_t);
/// Wrapper seguro sobre un `*mut GEOSGeometry` crudo, más el contexto
/// reentrante que su creación y liberación necesitan.
pub struct GeometriaCruda<'ctx> {
    ptr: *mut GEOSGeometry,
    ctx: &'ctx ContextoGeos,
}

impl<'ctx> GeometriaCruda<'ctx> {
    pub fn desde_wkt(ctx: &'ctx ContextoGeos, wkt: &str) -> Option<Self> {
        let c_wkt = CString::new(wkt).ok()?;
        unsafe {
            let lector = GEOSWKTReader_create_r(ctx.0);
            if lector.is_null() {
                return None;
            }
            let geom = GEOSWKTReader_read_r(ctx.0, lector, c_wkt.as_ptr());
            GEOSWKTReader_destroy_r(ctx.0, lector);

            if geom.is_null() {
                None // WKT inválido: el manejador de error ya reportó el motivo
            } else {
                Some(Self { ptr: geom, ctx })
            }
        }
    }

    pub fn contains(&self, otra: &GeometriaCruda) -> bool {
        // SAFETY: ambos punteros pertenecen al mismo contexto (`'ctx` los
        // ata al mismo `ContextoGeos`) y ninguno ha sido liberado todavía
        // -- el borrow-checker garantiza que `self`/`otra` siguen vivos.
        unsafe { GEOSContains_r(self.ctx.0, self.ptr, otra.ptr) == 1 }
    }
}

impl Drop for GeometriaCruda<'_> {
    fn drop(&mut self) {
        // SAFETY: `self.ptr` fue creado por GEOS en `desde_wkt` bajo este
        // mismo contexto, y este `Drop` es el único lugar del programa que
        // lo libera -- exactamente una vez.
        unsafe { GEOSGeom_destroy_r(self.ctx.0, self.ptr) };
    }
}
```

```rust,ignore
# fn main() {
let ctx = ContextoGeos::new();

let cuadrado = GeometriaCruda::desde_wkt(&ctx, "POLYGON((0 0, 4 0, 4 4, 0 4, 0 0))").unwrap();
let punto_dentro = GeometriaCruda::desde_wkt(&ctx, "POINT(2 2)").unwrap();
let punto_fuera = GeometriaCruda::desde_wkt(&ctx, "POINT(10 10)").unwrap();

println!("contains(dentro): {}", cuadrado.contains(&punto_dentro));
println!("contains(fuera):  {}", cuadrado.contains(&punto_fuera));

let invalido = GeometriaCruda::desde_wkt(&ctx, "ESTO NO ES WKT");
println!("WKT inválido da None: {}", invalido.is_none());
# }
```

```text
contains(dentro): true
contains(fuera):  false
[GEOS error]: ParseException: Unknown type: 'ESTO'
WKT inválido da None: true
```

Fíjate en las tres conversiones que hace este wrapper, cada una convirtiendo una convención C insegura en un tipo idiomático de Rust — exactamente lo que la sección anterior a este capítulo (Capítulo 4.4, sobre `proj`) te pidió notar desde el lado de usuario, y que ahora ves construido desde el lado de implementador:

1. **Puntero nulo → `Option`:** `GEOSWKTReader_read_r` devuelve un puntero nulo si el WKT es inválido; el wrapper lo convierte en `None` en vez de dejarte desreferenciar un nulo.
2. **Excepción C++ / estado de error → callback capturado:** el manejador de errores registrado convierte lo que de otra forma sería un abort del proceso en un mensaje que tu código Rust puede observar (aquí, solo lo imprime; en `geoapi-core` sería una variante de `ErrorDominio`, como en el Capítulo 3.5).
3. **Recurso C (memoria asignada por GEOS) → RAII:** ni el contexto ni ninguna geometría se liberan manualmente en ningún punto del código que los *usa* — `Drop` lo hace, siempre, exactamente una vez, incluso si el código de en medio tuviera un `return` temprano o un panic.

## `PreparedGeometry`: la razón de ser de "preparar" una geometría

El crate [`geos`](https://crates.io/crates/geos) (versión 11, con `libgeos` 3.14 en este capítulo) ya te da todo lo anterior construido y probado — no tienes que escribir tu propio wrapper para usarlo en GeoAPI, solo entenderlo. Su característica más relevante para una API que sirve consultas repetidas es `PreparedGeometry`: cuando vas a probar una misma geometría compleja (un polígono de miles de vértices, el límite de un departamento) contra *muchos* puntos o geometrías distintas, "preparar" esa geometría una sola vez construye una estructura interna (esencialmente un índice espacial, como los del Capítulo 4.3) que acelera cada consulta posterior.

```rust,ignore
use geos::{Geom, Geometry};
use std::time::Instant;

fn main() {
    let poligono = Geometry::new_from_wkt("POLYGON((...miles de vértices...))").unwrap();
    let puntos: Vec<Geometry> = /* 5000 puntos de consulta */
        # vec![];

    let inicio = Instant::now();
    let coincidencias_normal = puntos.iter().filter(|p| poligono.contains(p).unwrap()).count();
    println!("Geometry::contains (sin preparar): {:?}", inicio.elapsed());

    let preparada = poligono.to_prepared_geom().unwrap();
    let inicio = Instant::now();
    let coincidencias_preparada = puntos.iter().filter(|p| preparada.contains(p).unwrap()).count();
    println!("PreparedGeometry::contains:         {:?}", inicio.elapsed());

    assert_eq!(coincidencias_normal, coincidencias_preparada);
}
```

```text
Geometry::contains (sin preparar): 24.699017ms
PreparedGeometry::contains:         676.905µs
```

**~36.5x más rápido**, sobre un polígono de 2.000 vértices consultado contra 5.000 puntos distintos, con el mismo resultado exacto (`assert_eq!` lo confirma: preparar la geometría cambia la velocidad, nunca la respuesta). La regla práctica para GeoAPI: si un endpoint va a probar la misma geometría de referencia contra muchas geometrías de entrada en la misma petición (o si la geometría de referencia es estable entre peticiones, como un polígono de zonificación que rara vez cambia), prepararla una vez y reusar el resultado es una optimización con datos reales detrás, no una superstición de rendimiento.

## Ejercicios

**Ejercicio 1 — Identificar la superficie `unsafe` mínima de un wrapper dado.**
Sobre el wrapper `GeometriaCruda`/`ContextoGeos` de este capítulo, identifica exactamente cuáles de sus bloques `unsafe` serían un error de memoria real si se eliminara la comprobación que los acompaña (por ejemplo, el chequeo `if lector.is_null()`). Escribe, para cada uno de los 5 bloques `unsafe` del capítulo, una frase explicando qué invariante específico hace que ese bloque sea seguro *tal como está escrito*, y qué pasaría si esa comprobación se quitara.

*Criterio de éxito:* un documento (puede ser un comentario largo o una lista markdown) con 5 entradas, una por cada bloque `unsafe` del wrapper, cada una identificando el invariante concreto que lo hace seguro.

**Ejercicio 2 — Escribir un comentario `// SAFETY:` correcto.**
Añade un nuevo método `pub fn area(&self, ctx: &ContextoGeos) -> f64` a `GeometriaCruda` que llame a la función cruda `GEOSArea_r(ctx.0, self.ptr, &mut area_out)` (que escribe el resultado en un puntero de salida `*mut f64` que tú le pasas). Escribe el comentario `// SAFETY:` que justifique correctamente por qué esa llamada es segura tal como la escribiste.

*Criterio de éxito:* tu código compila, y tu comentario `// SAFETY:` explica específicamente por qué el puntero de salida que le pasas a `GEOSArea_r` es válido para que GEOS escriba en él (pista: piensa en de dónde viene la memoria a la que apunta y quién es dueño de ella).

**Ejercicio 3 — Envolver un puntero con `Drop`.**
Extiende el wrapper para soportar `GEOSPreparedGeometry` (la versión cruda de `PreparedGeometry` que ya usaste desde el crate `geos`), creado con `GEOSPrepare_r` y liberado con `GEOSPreparedGeom_destroy_r`. Tu tipo debe impedir, por construcción (usando lifetimes como en `GeometriaCruda<'ctx>`), que la geometría original se libere mientras la versión preparada todavía exista.

*Criterio de éxito:* un test que confirme que tu wrapper compila y funciona correctamente (una consulta `contains` a través de la versión preparada da el mismo resultado que a través de la geometría original), y una prueba conceptual (en un comentario, ya que el compilador debería rechazar el código real) de que intentar liberar la geometría original antes que su versión preparada no compila.

**Ejercicio 4 — Usar `PreparedGeometry` de `geos` en una consulta repetida.**
Repite el experimento de rendimiento del capítulo con tu propio polígono complejo (puedes usar el generador determinista de "borde rugoso" del capítulo, con un número de vértices distinto) y tu propio conjunto de puntos de consulta. Mide el *speedup* y confirma que se mantiene sustancial (aunque el número exacto vaya a variar).

*Criterio de éxito:* tu programa imprime ambos tiempos y el factor de mejora, con un `assert_eq!` confirmando que el conteo de coincidencias es idéntico entre la versión preparada y la no preparada — la preparación nunca debe cambiar qué puntos están dentro del polígono, solo cuánto tarda en confirmarlo.

> El proyecto GeoAPI v0.4 (Capítulo 5.7) no tiene un checkpoint guiado que use esta técnica — su ejercicio integrador la incluye como extensión opcional, con la historia de usuario de un organismo catastral que exige validación topológica.
