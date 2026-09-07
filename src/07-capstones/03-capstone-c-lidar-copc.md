# 7.3 Capstone C — Plataforma LiDAR con streaming COPC

El criterio de aceptación de este tercer capstone es distinto otra vez, y es el más exigente de los tres precisamente por ser el más simple de enunciar: **documentas, capítulo por capítulo, dónde aprendiste cada pieza que usaste para construirlo.** No hay tests que correr ni un benchmark que medir — hay una tabla que solo puedes llenar honestamente si de verdad entendiste de dónde viene cada decisión, no si la copiaste sin saber por qué funciona.

## Especificación de alcance

Una API que expone una nube de puntos LiDAR remota en formato COPC (Capítulo 5.5) por niveles de detalle, con dos capacidades que ningún estándar existente resuelve por ti — tienes que decidir tú el contrato:

1. **Selección de nivel de detalle y región.** El cliente pide una resolución aproximada (metros de espaciado entre puntos) y, opcionalmente, un área de interés — el servidor traduce eso a `LodSelection`/`BoundsSelection` (Capítulo 5.5) sobre el archivo remoto, sin descargarlo completo.
2. **Reproyección *on-the-fly*.** La nube LiDAR casi nunca está en el CRS que tu cliente quiere (WGS84 para verla en un visor web, por ejemplo) — cada punto que sale del servidor se reproyecta con `proj` (Capítulo 4.4) antes de responder, nunca se le pide al cliente que lo haga.

Además, un segundo endpoint que valida el área de interés que el cliente envía **antes** de usarla como filtro espacial: si el polígono que el cliente mandó es geométricamente inválido (autointersectante, con un anillo mal cerrado), el servidor debe rechazarlo con una razón legible — no un `500` genérico, ni un filtro silenciosamente incorrecto. Para eso necesitas una validación OGC completa que `geo`/`geo-types` no expone — el wrapper FFI seguro de GEOS del Capítulo 5.6, extendido con una operación nueva.

**Historia de usuario:** Como empresa de inspección de líneas eléctricas con drones, quiero consultar una nube de puntos LiDAR remota al nivel de detalle que necesito, ya reproyectada a mi CRS de trabajo, para inspeccionar una torre específica sin descargar el vuelo completo ni preocuparme por el sistema de coordenadas del sensor.

**Caso de uso — Consulta de un área de interés:**
- **Actor:** el sistema de inspección de la empresa, operado por un técnico.
- **Precondición:** una nube de puntos COPC almacenada remotamente, y un polígono de área de interés que el técnico acaba de dibujar sobre un mapa.
- **Flujo principal:** 1. El técnico envía el polígono al endpoint de validación. 2. Si el polígono es geométricamente inválido, el servidor lo rechaza con la razón exacta (por ejemplo, "autointersección en el punto X"). 3. Si es válido, el técnico pide los puntos de esa zona con la resolución que necesita. 4. El servidor traduce la petición a `LodSelection`/`BoundsSelection` sobre el archivo remoto y reproyecta cada punto antes de responder.
- **Resultado esperado:** el técnico recibe solo los puntos relevantes, en el CRS que su software de inspección espera, sin haber descargado el vuelo completo ni haber tenido que corregir a mano un polígono mal formado.

### El wrapper de GEOS, extendido

El Capítulo 5.6 te dejó `ContextoGeos` y `GeometriaCruda` con un único método, `contains`. La validación que este capstone necesita es un método más sobre el mismo wrapper — **ninguna pieza nueva del patrón**, solo una función cruda distinta detrás del mismo `struct`:

```rust,ignore
use geos_sys::{GEOSFree_r, GEOSisValidReason_r};

impl<'ctx> GeometriaCruda<'ctx> {
    /// Validación OGC completa -- `geo`/`geo-types` no la expone: detecta
    /// anillos autointersectantes, anillos interiores fuera del exterior,
    /// polígonos con menos de 4 puntos, etc., con una razón legible.
    pub fn razon_invalidez(&self) -> Option<String> {
        unsafe {
            // SAFETY: `self.ptr` es válido bajo `self.ctx` (mismo invariante
            // que en `contains`). GEOS documenta que el resultado, si no es
            // nulo, es una cadena C que el llamador debe liberar con
            // `GEOSFree_r` -- se hace abajo, exactamente una vez.
            let razon_c = GEOSisValidReason_r(self.ctx.0, self.ptr);
            if razon_c.is_null() {
                return None; // la propia llamada falló, no "es válida"
            }
            let texto = std::ffi::CStr::from_ptr(razon_c).to_string_lossy().into_owned();
            GEOSFree_r(self.ctx.0, razon_c as *mut std::ffi::c_void);
            if texto == "Valid Geometry" { None } else { Some(texto) }
        }
    }
}
```

Verificado contra dos casos reales: un cuadrado válido y un polígono *bowtie* (un cuadrilátero cuyos lados se cruzan a sí mismos, el ejemplo clásico de geometría inválida):

```text
razón_invalidez(cuadrado): None
razón_invalidez(bowtie): Some("Self-intersection[2 2]")
```

GEOS no solo detecta el problema — te dice el punto exacto (`[2 2]`) donde ocurre la autointersección. Eso es lo que compra un *binding* FFI a una librería C con veinte años de desarrollo detrás: una calidad de diagnóstico que reimplementar el algoritmo de validación en Rust puro, desde cero, no te daría gratis.

## Tabla de trazabilidad

| Requisito del capstone | Capítulo(s) que lo enseñó |
|---|---|
| Lectura de nubes de puntos (`las`) | 4.6 |
| Streaming COPC por nivel de detalle | 5.5 |
| Reproyección con `proj` | 4.4 |
| Wrapper FFI seguro (`geos`) | 5.6 |
| Exposición vía Axum con contrato de API propio | 6.1, 6.4 |

## Criterio de aceptación: tu propia tabla de trazabilidad

No se te pide un test ni un benchmark — se te pide que, sobre tu propia implementación, completes una tabla como esta con **tus** decisiones concretas, no una copia de la tabla de arriba:

| Pieza de tu implementación | Capítulo donde la aprendiste | Qué tuviste que decidir tú (no estaba en el capítulo) |
|---|---|---|
| *(ej. tu adaptador `Read + Seek` sobre HTTP para `CopcReader`)* | *(ej. 5.5)* | *(ej. tamaño del `BufReader`, timeout de la petición Range)* |
| ... | ... | ... |

La tercera columna es la que de verdad importa. Cualquiera puede copiar un `CopcReader::from_path` de un capítulo anterior — la pregunta que separa "leí el capítulo" de "entendí el capítulo" es qué tuviste que decidir tú mismo que el libro no te dio explícitamente: ¿qué resolución por defecto usa tu API cuando el cliente no pide ninguna? ¿Qué CRS de salida asumes si el cliente tampoco lo especifica? ¿Qué código HTTP devuelves cuando `razon_invalidez` no es `None`?

Si en algún renglón de tu tabla no puedes nombrar un capítulo concreto para la segunda columna, esa pieza probablemente no viene de este libro — verifica de dónde la sacaste antes de darla por buena. Y si la tercera columna queda vacía en todos los renglones, es la señal contraria: que copiaste código sin haber tenido que decidir nada, exactamente lo que este libro ha insistido en evitar desde el Capítulo 3.1 — entender por qué una pieza funciona, no solo que funciona.

**Sobre TDD (Capítulo 1.3) en este capstone:** el criterio de aceptación es una tabla de trazabilidad, no un test — pero eso no te exime de escribir tests mientras construyes. `razon_invalidez` (el método nuevo del wrapper de GEOS) es exactamente el tipo de función donde vale la pena escribir primero un test con un polígono *bowtie* conocido, verlo fallar contra un wrapper que todavía no tiene ese método, y solo entonces implementarlo — la misma disciplina rojo-verde-refactor, aplicada porque tiene sentido para esa pieza, no porque el capítulo te lo exija como criterio de aceptación.

## Qué construir tú mismo

- El adaptador `Read + Seek` sobre HTTP para `CopcReader` (Capítulo 5.5), con el `BufReader` que ya viste que reduce las peticiones de red en un factor de 33x.
- La traducción de la petición del cliente (resolución en metros, bbox opcional) a `LodSelection`/`BoundsSelection` (Capítulo 5.5).
- La reproyección de cada punto devuelto, con `proj` (Capítulo 4.4) — decide tú qué CRS de salida asumes por defecto.
- El método `razon_invalidez` sobre `GeometriaCruda` (arriba), y el endpoint que lo usa para validar el área de interés antes de aceptarla como filtro.
- El servidor Axum que expone ambos endpoints (Capítulo 6.1), con el contrato de error que decidas para una geometría inválida — el Capítulo 6.1 te da la herramienta (`IntoResponse` sobre un error de dominio, con el formato RFC 7807), pero qué código HTTP exacto le corresponde a "el área de interés no es válida" (¿`400`? ¿`422`?) sigue siendo una decisión tuya, no la del Capítulo 6.4 sobre OGC API Features (ese es un estándar; este contrato es tuyo).
- Tu propia tabla de trazabilidad, completa y honesta, como criterio de aceptación de este capstone.
