# 6.4 OGC API Features / WFS / WMS — interoperabilidad

Todo lo que GeoAPI ha expuesto hasta ahora habla un contrato que tú mismo diseñaste. Para que un cliente GIS de propósito general —QGIS, ArcGIS, cualquier biblioteca que entienda estándares OGC— pueda añadir tu API como una fuente de datos sin que nadie escriba código de integración a medida, necesitas hablar un contrato que ese cliente ya entiende de antemano: **OGC API Features**, el sucesor moderno (JSON/REST) de WFS clásico (XML/SOAP-like). Este capítulo construye el subconjunto mínimo del estándar, y lo valida contra un cliente real — QGIS — no contra tu propia interpretación de la especificación.

## Los cinco endpoints que exige el núcleo del estándar

La conformidad *Core* de OGC API Features (`http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core`) exige, como mínimo:

```rust,ignore
use axum::{Router, routing::get};

let app = Router::new()
    .route("/", get(landing_page))           // enlaces a todo lo demás
    .route("/api", get(api_openapi))         // definición OpenAPI (rel="service-desc")
    .route("/conformance", get(conformance)) // qué clases de conformidad soporta esta API
    .route("/collections", get(collections)) // qué colecciones de features existen
    .route("/collections/{id}", get(collection_ciudades))
    .route("/collections/{id}/items", get(items))         // GeoJSON, con paginación
    .route("/collections/{id}/items/{fid}", get(item));   // un feature individual
```

La página de aterrizaje (`/`) es el punto de entrada: no es solo un saludo, es un documento de **hipermedia** — el cliente descubre el resto de la API navegando sus enlaces (`rel`), no leyendo documentación externa:

```rust,ignore
async fn landing_page(State(estado): State<EstadoApp>) -> Json<Value> {
    let base = &estado.base_url;
    Json(json!({
        "title": "GeoAPI - OGC API Features",
        "links": [
            { "href": format!("{base}/"), "rel": "self", "type": "application/json" },
            { "href": format!("{base}/conformance"), "rel": "conformance", "type": "application/json" },
            { "href": format!("{base}/collections"), "rel": "data", "type": "application/json" },
            { "href": format!("{base}/api"), "rel": "service-desc", "type": "application/vnd.oai.openapi+json;version=3.0" }
        ]
    }))
}
```

**El enlace `rel="service-desc"` no es opcional en la práctica**, aunque en una primera lectura de la especificación parezca un detalle secundario: lo verificarás a continuación, cuando un cliente real se niegue a considerar tu API completamente conforme sin él.

## La respuesta de `items`: GeoJSON con paginación real

```rust,ignore
#[derive(serde::Deserialize)]
struct ParametrosItems { limit: Option<usize> }

async fn items(
    State(estado): State<EstadoApp>,
    Query(params): Query<ParametrosItems>,
) -> Response {
    let todas = ciudades_features(); // Vec<Value>, GeoJSON Feature cada una
    let total = todas.len();
    let limite = params.limit.unwrap_or(10).min(total);
    let features: Vec<Value> = todas.into_iter().take(limite).collect();

    let body = json!({
        "type": "FeatureCollection",
        "features": features,
        "numberMatched": total,
        "numberReturned": features.len(),
        "links": [/* self, collection */]
    });
    ([(header::CONTENT_TYPE, "application/geo+json")], Json(body)).into_response()
}
```

`numberMatched` (cuántos features cumplen el filtro en total) y `numberReturned` (cuántos vienen en esta página específica) no son campos decorativos — son la forma en que un cliente sabe si necesita pedir más páginas. Ignorarlos, o ignorar el parámetro `limit` de la query, es exactamente el tipo de detalle que solo se descubre probando contra un cliente real — como vas a ver en la siguiente sección.

## Validación contra QGIS — y todo lo que salió mal en el camino

QGIS trae un proveedor de datos vectoriales dedicado para OGC API Features, `OAPIF`, distinto de su proveedor `WFS` clásico. La primera tentación, razonable pero equivocada, es usar el proveedor `WFS` con un parámetro `version='OGC_API_FEATURES'`:

```python
layer = QgsVectorLayer(
    "typename='ciudades' url='http://localhost:PUERTO' version='OGC_API_FEATURES'",
    "ciudades", "WFS",
)
```

```text
[WFS] GetCapabilities failed for url ...: error occurred while parsing element
layer.isValid(): False
```

**Esto falla siempre**, incluso contra una API perfectamente conforme al estándar — el proveedor `WFS` de QGIS, aun aceptando ese parámetro de versión, termina intentando interpretar la respuesta como XML de WFS clásico ("error occurred while parsing element" es un error de parseo XML, no de JSON). La corrección: usar el proveedor `OAPIF` directamente, sin pasar por `WFS` en absoluto.

```python
layer = QgsVectorLayer(
    "url='http://localhost:PUERTO' typename='ciudades'",
    "ciudades", "OAPIF",
)
```

Con el proveedor correcto, QGIS hizo una secuencia de peticiones reales reveladora —capturada instrumentando el servidor con un middleware de logging (Capítulo 6.2)—: `GET /` con `Accept: application/json`, `GET /api` pidiendo específicamente `application/vnd.oai.openapi+json`, `GET /collections/ciudades`, `GET /conformance`, y luego **tres peticiones a `/items` con `limit=10`, `limit=1`, y `limit=100` respectivamente**, más una petición `OPTIONS` a la misma ruta. Contra la primera versión de este servidor —que ignoraba `limit` y siempre devolvía las 3 features completas, y no manejaba `OPTIONS`— la capa seguía marcándose inválida, sin más explicación en el log que necesitara depuración adicional. Corrigiendo esos dos puntos (respetar `limit` de verdad, responder `204` a `OPTIONS` en vez de dejar que el enrutador devolviera un `405` por defecto):

```text
RESULTADO layer.isValid(): True
featureCount: 3
 -> ['Bogotá', 7981000] Point (-74.07210000000000605 4.7110000000000003)
 -> ['Medellín', 2591000] Point (-75.56359999999999388 6.25180000000000025)
 -> ['Cali', 2227000] Point (-76.52249999999999375 3.43719999999999981)
```

**Una capa válida en QGIS, con las tres features correctas y sus atributos intactos** — verificado con PyQGIS ejecutado en modo *headless* (`QT_QPA_PLATFORM=offscreen`), no una descripción de lo que "debería" pasar. La lección central de este capítulo: **ningún nivel de auto-revisión contra la especificación escrita reemplaza probar contra un cliente real.** Una API que responde exactamente lo que el texto del estándar exige puede seguir siendo rechazada por un cliente real que además espera comportamientos de interoperabilidad práctica (paginación honesta, `OPTIONS` no roto) que la letra de la especificación no siempre deja explícitos.

## Documentar el contrato con OpenAPI

```yaml
openapi: 3.0.3
info:
  title: GeoAPI - OGC API Features
  version: "1.0.0"
paths:
  /collections/{collectionId}/items:
    get:
      operationId: getFeatures
      parameters:
        - name: collectionId
          in: path
          required: true
          schema: { type: string }
        - name: limit
          in: query
          schema: { type: integer, minimum: 1, maximum: 1000, default: 10 }
      responses:
        "200":
          description: Colección de features en GeoJSON
          content:
            application/geo+json:
              schema: { type: object, required: [type, features] }
  # ... resto de rutas
```

Verificado con `openapi-spec-validator` (la herramienta de validación de referencia del ecosistema OpenAPI en Python, útil incluso si tu servidor está en Rust — el documento es solo YAML/JSON):

```text
openapi.yaml: OK
```

Un documento OpenAPI sintácticamente inválido —una comilla faltante, una indentación rota— es invisible hasta que algo intenta parsearlo: ni `cargo build` ni tus propios tests de Rust lo detectan, porque vive fuera de tu código fuente. Validarlo con una herramienta dedicada, como cualquier otro artefacto que no sea Rust pero que tu API sí publique (el mismo principio que ya aplicaste a los workflows de GitHub Actions), es la única forma de confiar en que el contrato que publicas es el contrato que un generador de clientes o un validador automático realmente podrá consumir.

## Ejercicios

**Ejercicio 1 — Implementar un endpoint mínimo compatible con OGC API Features.**
Extiende el servidor de este capítulo con una segunda colección (por ejemplo, "zonas_cobertura" con polígonos en vez de puntos), asegurándote de que `/collections` liste ambas y que cada una tenga su propio `/collections/{id}/items` funcional.

*Criterio de éxito:* peticiones HTTP reales a `/collections` confirmando dos entradas, y a `/collections/zonas_cobertura/items` confirmando que devuelve polígonos válidos en GeoJSON, no los puntos de la otra colección.

**Ejercicio 2 — Validar contra un cliente QGIS.**
Repite la validación de este capítulo con tu propia colección del Ejercicio 1, usando el proveedor `OAPIF` de QGIS (vía PyQGIS en modo *headless* si no tienes QGIS de escritorio disponible). Si tu primer intento falla, instrumenta tu servidor (como en este capítulo) para ver exactamente qué peticiones hizo QGIS antes de rendirse.

*Criterio de éxito:* un script PyQGIS que confirme `layer.isValid() == True` y `layer.featureCount()` igual al número real de features de tu colección, ejecutado y con su salida real capturada — no una afirmación sin evidencia de que "debería funcionar".

**Ejercicio 3 — Documentar el contrato con OpenAPI.**
Escribe el documento OpenAPI completo (los cinco endpoints del núcleo, más tu colección adicional del Ejercicio 1) y valídalo con una herramienta de esquema (`openapi-spec-validator`, o cualquier validador equivalente).

*Criterio de éxito:* el archivo YAML/JSON completo, con al menos los parámetros `limit` y `bbox` documentados en el endpoint de `items`, y la confirmación de la herramienta de validación de que el documento es sintácticamente válido.

> Esta técnica es la que usa la fila "OGC API Features" del proyecto GeoAPI v1.0 (Capítulo 6.6) — ver la historia de usuario ahí.
