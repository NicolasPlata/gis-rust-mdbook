# 7.1 Capstone A — Servidor de teselas vectoriales cloud-native completo

Este capítulo, y los dos que le siguen, no enseñan nada nuevo. Son la prueba de que todo lo enseñado hasta aquí encaja en un sistema real — y la forma en que el libro lo comprueba no es pidiéndote que leas una implementación de referencia, sino dándote una **especificación** y una **suite de aceptación**: código que ejercita tu propia implementación por HTTP y falla si no cumple el contrato. Constrúyela tú mismo, con las piezas que ya tienes.

## Especificación de alcance

Un servidor de teselas vectoriales con tres niveles de resolución de datos, en este orden de prioridad:

1. **PMTiles pre-renderizado** (Capítulo 5.4): si la tesela solicitada ya existe en un archivo `.pmtiles` servido con backend `mmap`, se devuelve directamente — sin tocar la base de datos.
2. **Caché en memoria** (Capítulo 6.2): si la tesela no está en PMTiles pero ya se generó en una petición anterior, se sirve desde una caché `moka`.
3. **Generación bajo demanda desde PostGIS** (Capítulo 4.6): si ninguna de las dos anteriores tiene la tesela, se consulta PostGIS por las features que intersectan el *bounding box* de esa tesela, se codifica el resultado como MVT (Capítulo 6.3), se guarda en la caché para la próxima vez, y se devuelve.

Además: un endpoint `/healthz` (Capítulo 6.5) que confirma conectividad real con PostGIS, y observabilidad vía `tracing` (Capítulos 6.2, 6.5) en cada capa de la cadena de *fallback* — de forma que un log real te diga, para cada tesela servida, de cuál de las tres fuentes vino.

**Historia de usuario:** Como equipo de un portal de mapas municipal, quiero servir teselas vectoriales de las zonas más consultadas desde un archivo pre-generado y calcular bajo demanda solo las menos comunes, para mantener tiempos de respuesta bajos sin pagar por un servidor que regenere todo desde cero en cada petición.

**Caso de uso — Petición de una tesela:**
- **Actor:** un cliente de mapas (navegador o app móvil) pidiendo una tesela `{z}/{x}/{y}`.
- **Precondición:** el servidor arrancó con un archivo PMTiles que ya trae pre-renderizadas las zonas de mayor tráfico, PostGIS con los datos completos, y una caché en memoria vacía.
- **Flujo principal:** 1. El cliente pide una tesela. 2. El servidor revisa si está en el archivo PMTiles. 3. Si no está, revisa la caché en memoria. 4. Si tampoco está ahí, consulta PostGIS, codifica el resultado como MVT, lo guarda en caché para la próxima vez, y lo devuelve.
- **Resultado esperado:** el cliente recibe la tesela correcta sin importar cuál de las tres fuentes la sirvió — y el header `X-Tile-Source` le confirma a quien depura cuál fue.

## Tabla de trazabilidad

| Pieza técnica | Capítulo(s) que la enseñó |
|---|---|
| Modelo de dominio y serialización GeoJSON | 3.1, 3.3, 3.4 |
| Índice espacial en memoria para features editables | 4.3 |
| Persistencia y consulta espacial en PostGIS vía SQLx | 4.5 |
| Formato PMTiles y backend `mmap` | 5.4 |
| Framework HTTP (Axum) y middleware (`tower`, caché `moka`) | 6.1, 6.2 |
| Codificación MVT y contrato TileJSON | 6.3 |
| Healthcheck y logs estructurados | 6.5 |

Ninguna fila de esta tabla debería sorprenderte — si alguna pieza te resulta completamente nueva, es la señal de que vale la pena volver al capítulo correspondiente antes de seguir.

## Suite de aceptación

Este es el criterio de aceptación real del capstone: un archivo de tests de integración que tu propia implementación debe pasar, corriendo contra tu servidor levantado de verdad (no contra mocks). La suite asume que tu servidor expone `GET /tiles/{z}/{x}/{y}` (devolviendo el header `X-Tile-Source` con el valor `pmtiles`, `cache`, o `generated` según de dónde vino la tesela) y `GET /healthz`.

**Este capstone es TDD (Capítulo 1.3) llevado a su forma más literal:** los tests existen **antes** que tu servidor. No los escribes tú para confirmar que tu código funciona — ya están escritos, y tu trabajo es hacerlos pasar. Rojo (los cinco tests fallan porque tu servidor ni siquiera existe) → verde (implementas hasta que los cinco pasan) → refactor (una vez en verde, mejora tu implementación con la suite completa como red de seguridad). No hay un paso intermedio de "primero escribo el test" porque, en este capstone, ese paso ya lo dio el libro por ti.

```rust,ignore
// tests/aceptacion.rs -- ejecútalo contra tu propio servidor ya levantado,
// pasando su dirección real por la variable de entorno GEOAPI_URL.
use geozero::mvt::{Message, Tile};

fn base_url() -> String {
    std::env::var("GEOAPI_URL").expect("define GEOAPI_URL apuntando a tu servidor")
}

#[tokio::test]
async fn healthz_confirma_conectividad_real_con_postgis() {
    let cliente = reqwest::Client::new();
    let resp = cliente.get(format!("{}/healthz", base_url())).send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let cuerpo: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(cuerpo["status"], "ok");
}

#[tokio::test]
async fn tesela_preprocesada_se_sirve_desde_pmtiles() {
    // Requiere que tu implementación tenga la tesela 0/0/0 pre-renderizada
    // en el archivo .pmtiles que carga al arrancar.
    let cliente = reqwest::Client::new();
    let resp = cliente.get(format!("{}/tiles/0/0/0", base_url())).send().await.unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.headers().get("x-tile-source").unwrap(), "pmtiles");
}

#[tokio::test]
async fn tesela_sin_preprocesar_se_genera_desde_postgis_y_contiene_datos_reales() {
    let cliente = reqwest::Client::new();
    // z=5,x=9,y=15 cubre Bogotá -- asegúrate de tener al menos una
    // feature real ahí en tu base de datos de prueba antes de correr esto.
    let resp = cliente.get(format!("{}/tiles/5/9/15", base_url())).send().await.unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.headers().get("x-tile-source").unwrap(), "generated");

    let bytes = resp.bytes().await.unwrap();
    let tile = Tile::decode(bytes.as_ref()).unwrap();
    assert!(!tile.layers[0].features.is_empty(), "la tesela generada debe contener al menos una feature real");
}

#[tokio::test]
async fn segunda_peticion_a_la_misma_tesela_generada_viene_de_cache() {
    let cliente = reqwest::Client::new();
    let url = format!("{}/tiles/5/9/15", base_url());
    let _ = cliente.get(&url).send().await.unwrap(); // fuerza la generación si aún no ocurrió
    let resp = cliente.get(&url).send().await.unwrap();
    assert_eq!(resp.headers().get("x-tile-source").unwrap(), "cache");
}

#[tokio::test]
async fn tesela_sin_datos_devuelve_protobuf_valido_y_vacio_no_un_error() {
    let cliente = reqwest::Client::new();
    // Zoom alto, sobre el océano -- ninguna feature real debería estar ahí.
    let resp = cliente.get(format!("{}/tiles/10/0/0", base_url())).send().await.unwrap();
    assert_eq!(resp.status(), 200);
    let bytes = resp.bytes().await.unwrap();
    let tile = Tile::decode(bytes.as_ref()).unwrap(); // debe ser un protobuf MVT válido
    assert!(tile.layers[0].features.is_empty());
}
```

**Verificado contra una implementación de referencia real** (PostgreSQL + PostGIS reales, un archivo `.pmtiles` genuino con una sola tesela pre-renderizada, y las demás piezas exactamente como las describe la tabla de trazabilidad): los cinco tests de esta suite pasan, con las tres fuentes de datos (`pmtiles`, `cache`, `generated`) confirmadas por su propio header en cada caso, y el contenido de la tesela generada decodificado y confirmado con una feature real (no solo "no dio error") — el mismo criterio de aceptación que exige la EDT de este libro: una suite de tests, no una descripción de lo que "debería" pasar.

```text
healthz: 200 OK {"status":"ok"}
tile 0/0/0 (pmtiles): status=200 OK source=Some("pmtiles")
tile 5/9/15 (generada 1ra vez): status=200 OK source=Some("generated") bytes=28
tile 5/9/15 (2da vez, debe ser cache): status=200 OK source=Some("cache")
tile vacía 10/0/0: source=Some("generated") layers=1 features=0
tile 5/9/15 contiene 1 feature(s) real(es) (esperado: 1, Bogotá)
```

## Qué construir tú mismo

El libro no te da el código del servidor — te da el contrato de arriba. Vas a necesitar, ensamblando piezas que ya construiste en capítulos anteriores:

- Un `EstadoApp` compartido con un `PgPool` (Capítulo 4.6), un lector PMTiles (Capítulo 5.4), y una `Cache` de `moka` (Capítulo 6.2).
- Un handler `GET /tiles/{z}/{x}/{y}` que intente las tres fuentes en orden, exactamente como describe la especificación de alcance.
- Una función que traduzca `(z, x, y)` a un *bounding box* en Web Mercator (ya la escribiste en el Capítulo 6.3).
- Una consulta PostGIS que filtre por ese bbox (el mismo patrón `ST_Intersects`/`ST_DWithin` del Capítulo 4.6).
- La codificación MVT de las features resultantes, reproyectadas al mismo CRS que el bbox de la tesela (Capítulo 6.3, con `proj` del Capítulo 4.4 para la reproyección).

Si te atoras en un paso específico, el capítulo que lo enseñó está en la tabla de trazabilidad de arriba — vuelve ahí, no busques una solución nueva.
