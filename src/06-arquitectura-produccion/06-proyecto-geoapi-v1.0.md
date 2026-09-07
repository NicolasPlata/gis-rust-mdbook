# 6.6 Proyecto guiado de cierre — GeoAPI v1.0 (plataforma de producción)

Este capítulo no introduce ninguna herramienta nueva — es la consolidación de todo lo que construiste en los cinco capítulos anteriores de este módulo, más todo lo que ya traías de los módulos 3 y 4, en una sola plataforma coherente. Si GeoAPI v0.3 (Capítulo 4.8) fue "un servidor con estado" y v0.4 (Capítulo 5.7) fue "streaming cloud-native", **v1.0 es la versión que un equipo de operaciones aceptaría desplegar**: con caché, límites de tasa, observabilidad real, un contrato de interoperabilidad estándar, y una tubería de integración continua que prueba contra una base de datos real en cada cambio.

**Historia de usuario:** Como equipo de producto de GeoAPI, quiero cerrar un contrato de framework y de manejo de errores definitivo (Capítulo 6.1) antes de abrir la API a desarrolladores externos, para que cualquier integrador sepa exactamente qué esperar de cada endpoint — incluidos sus errores — sin tener que leer el código fuente para adivinarlo.

## El inventario completo

| Pieza | De dónde viene | Qué aporta a v1.0 |
|---|---|---|
| Repositorio PostGIS (`FeatureRepositorio`) | Capítulo 4.6 | Persistencia real, con `ST_DWithin` sobre `geography` e índice GiST de expresión |
| Índice `rstar` en memoria + *fallback* | Capítulo 4.8 | `GET /features/near` rápido, sin depender de PostGIS en el camino caliente |
| Reproyección paralela con Rayon | Capítulos 4.4, 5.1, 5.7 | `POST /features/reproject/batch`, con el patrón `par_chunks` correcto |
| Teselas MVT + PMTiles | Capítulos 5.4, 6.3 | `GET /tiles/{z}/{x}/{y}` y `GET /tiles.json`, con o sin base de datos detrás |
| Caché, rate-limit, timeout, tracing | Capítulo 6.2 | Middleware de producción sobre *todos* los endpoints anteriores |
| OGC API Features | Capítulo 6.4 | Interoperabilidad real con QGIS y otros clientes GIS estándar, verificada |
| Healthcheck + logs JSON | Capítulo 6.5 | Señal real de salud para un orquestador; logs consumibles por un agregador |

Cada fila de esta tabla responde a un stakeholder concreto de GeoAPI, no solo a una casilla técnica:

- **Caché, rate-limit, timeout, tracing (Capítulo 6.2):** como operador de una API GIS gratuita, quiero protegerla de abuso con límites de tasa y caché, para mantenerla disponible para usuarios legítimos sin escalar infraestructura indefinidamente.
- **Teselas MVT + PMTiles (Capítulo 6.3):** como alcaldía, quiero un dashboard de tránsito urbano en tiempo real, para que los ciudadanos vean el estado de las vías sin que la página se recargue.
- **OGC API Features (Capítulo 6.4):** como organismo gubernamental, quiero que la API sea consumible desde QGIS y otros clientes GIS estándar, para no obligar a mi equipo a escribir un adaptador propio.
- **Healthcheck + logs JSON (Capítulo 6.5):** como empresa de logística, quiero un healthcheck confiable y logs estructurados antes de integrar GeoAPI en mi cadena de suministro, para cumplir el SLA de disponibilidad que ya le prometí a mis propios clientes.

Ninguna pieza de esta tabla es nueva — el Módulo 5 completo, y buena parte de los anteriores, existía exactamente para que esta tabla pudiera escribirse sin inventar nada al final.

## Tests de integración contra PostGIS real

**Al estilo TDD (Capítulo 1.3):** a diferencia de los proyectos de los módulos anteriores, GeoAPI v1.0 llega a este punto ya acostumbrada a tener sus tests antes que su CI — la sección de abajo es exactamente eso: el criterio de éxito, escrito y verificado en verde, antes de automatizarlo en una tubería. Si vienes siguiendo el libro en orden, esto ya no debería sentirse como un paso adicional, sino como la continuación natural de la disciplina que empezaste en el Módulo 1.

Antes de hablar de CI, los tests que la tubería va a correr tienen que existir y pasar localmente:

```rust,ignore
use sqlx::PgPool;

async fn conectar() -> PgPool {
    let url = std::env::var("DATABASE_URL").expect("DATABASE_URL debe estar definida");
    PgPool::connect(&url).await.expect("no se pudo conectar a PostGIS")
}

#[tokio::test]
async fn postgis_esta_disponible_y_responde() {
    let pool = conectar().await;
    let (version,): (String,) = sqlx::query_as("SELECT PostGIS_Version()")
        .fetch_one(&pool)
        .await
        .expect("PostGIS_Version() debe ejecutarse sin error");
    assert!(!version.is_empty());
}

#[tokio::test]
async fn insertar_y_consultar_una_feature_real() {
    let pool = conectar().await;
    sqlx::query("CREATE TABLE ci_features (id SERIAL PRIMARY KEY, geom GEOMETRY(Point, 4326) NOT NULL)")
        .execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO ci_features (geom) VALUES (ST_SetSRID(ST_MakePoint(-74.0721, 4.7110), 4326))")
        .execute(&pool).await.unwrap();
    let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM ci_features").fetch_one(&pool).await.unwrap();
    assert_eq!(n, 1);
}
```

```text
running 2 tests
..
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```

Verificado contra una instancia PostGIS real (no simulada, no mockeada) — la misma disciplina de "nunca mockees la base de datos" que este libro asumió desde el Capítulo 4.6.

## La tubería de CI: PostGIS efímera por ejecución

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgis:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_USER: geoapi
          POSTGRES_PASSWORD: geoapi
          POSTGRES_DB: geoapi_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://geoapi:geoapi@localhost:5432/geoapi_ci
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Ejecutar tests de integración contra PostGIS efímera
        run: cargo test --workspace
```

El bloque `services.postgis` es la pieza que hace esto una prueba de integración *real*, no una simulación: GitHub Actions arranca un contenedor Docker con la imagen oficial `postgis/postgis` **desde cero, en cada ejecución del workflow**, espera a que `pg_isready` confirme que está lista (`options.health-cmd`), y lo destruye al terminar. Cada ejecución de CI prueba contra una base de datos completamente nueva — nunca hereda estado de la ejecución anterior, eliminando una categoría entera de "funciona en mi máquina" causada por datos residuales de una prueba previa.

**Un detalle real que vale la pena señalar si alguna vez validas tu propio YAML de CI con una herramienta genérica:** la clave `on:` de este archivo, sin comillas, es interpretada por muchos parsers YAML estándar (incluyendo PyYAML con `yaml.safe_load`) como el booleano `True`, no como la cadena `"on"` — un artefacto heredado de YAML 1.1, donde `on`/`off`/`yes`/`no` son sinónimos de `true`/`false`. GitHub Actions internamente maneja esta ambigüedad de forma correcta (es un caso especial bien conocido de su propio parser), pero si alguna vez escribes una herramienta propia que procese archivos de workflow, o usas un linter YAML genérico para validarlos, no asumas que la clave que ves como `on` en el archivo va a llegarte como la cadena `"on"` — verifícalo, como cualquier otra suposición sobre una librería de terceros que este libro ha insistido en comprobar desde el Capítulo 3.1.

## El mismo contenedor, en tu máquina: `testcontainers-rs`

La tubería de CI de arriba resuelve la efimeridad de PostGIS *en GitHub Actions*. Pero localmente, cada test de este capítulo (y de los anteriores) sigue asumiendo que **tú** ya levantaste una instancia de PostGIS a mano y exportaste `DATABASE_URL` apuntando a ella — una fricción real cada vez que abres el proyecto en una máquina nueva, o simplemente quieres correr `cargo test` sin acordarte de si el contenedor de la vez anterior sigue vivo.

[`testcontainers`](https://crates.io/crates/testcontainers) (versión 0.28 en este capítulo) cierra esa brecha: deja que el propio test arranque su PostGIS efímera — la misma imagen `postgis/postgis:16-3.4` del YAML de CI — la use, y la destruya al terminar, sin salir nunca de Rust:

```rust,ignore
use sqlx::PgPool;
use testcontainers::core::{IntoContainerPort, WaitFor};
use testcontainers::runners::AsyncRunner;
use testcontainers::{ContainerAsync, GenericImage, ImageExt};

async fn levantar_postgis_efimera() -> (ContainerAsync<GenericImage>, PgPool) {
    let contenedor = GenericImage::new("postgis/postgis", "16-3.4")
        .with_wait_for(WaitFor::message_on_stderr(
            "database system is ready to accept connections",
        ))
        .with_env_var("POSTGRES_PASSWORD", "geoapi")
        .with_mapped_port(0, 5432.tcp())
        .start()
        .await
        .expect("no se pudo levantar el contenedor de PostGIS");

    let puerto = contenedor.get_host_port_ipv4(5432).await.unwrap();
    let url = format!("postgres://postgres:geoapi@127.0.0.1:{puerto}/postgres");

    let pool = PgPool::connect(&url)
        .await
        .expect("no se pudo conectar al PostGIS efímero");

    (contenedor, pool) // el contenedor debe seguir vivo mientras uses `pool`
}

#[tokio::test]
async fn postgis_efimera_local_responde() {
    let (_contenedor, pool) = levantar_postgis_efimera().await;

    let (version,): (String,) = sqlx::query_as("SELECT PostGIS_Version()")
        .fetch_one(&pool)
        .await
        .expect("PostGIS_Version() debe ejecutarse sin error");

    assert!(!version.is_empty());
} // `_contenedor` se destruye aquí, al salir de ámbito
```

Fíjate en la firma de retorno de `levantar_postgis_efimera`: devuelve el `ContainerAsync` *junto con* el `PgPool`, no solo el pool. Esto no es incidental — `testcontainers` destruye el contenedor cuando el valor `ContainerAsync` sale de ámbito (el mismo principio de *ownership* y limpieza automática del Capítulo 2.3, aplicado ahora a un recurso externo, no solo a memoria). Si devolvieras solo el `pool` y dejaras que `_contenedor` se destruyera al final de `levantar_postgis_efimera`, el contenedor se apagaría antes de que el test alcance a usar la conexión.

Esta técnica es **complementaria** a la tubería de CI de arriba, no un reemplazo: en CI, el contenedor `services.postgis` ya lo gestiona GitHub Actions antes de que tus tests corran, así que ahí `testcontainers` sería redundante. Donde sí paga dividendos es en tu ciclo local de "rojo-verde-refactor" (Capítulo 1.3): `cargo test` funciona igual en una máquina recién clonada que en la tuya, sin un paso manual de "primero levanta la base de datos".

## Ejercicio integrador (abierto)

El cierre del módulo, sin guía paso a paso — la forma en que este libro verifica que puedes ensamblar todas las piezas anteriores en un sistema real.

**Despliega el stack completo con una tubería de CI que corra en verde**, incluyendo:
- Los tests de integración contra PostGIS efímera de este capítulo.
- Al menos un test que ejercite el servidor Axum completo (levantándolo en el propio job de CI, como hiciste en los capítulos de proyecto anteriores) contra esa misma base de datos efímera.
- Un paso adicional de tu elección que aumente la confianza del pipeline: `cargo clippy` sin warnings, `cargo audit` sin vulnerabilidades conocidas, o un build de la imagen Docker del Capítulo 6.5 como parte del propio workflow.

Preguntas que vas a tener que resolver tú mismo:

- ¿Tu servidor Axum necesita esperar a que PostGIS esté completamente lista antes de arrancar, o maneja una conexión inicial fallida con reintentos? (Pista: revisa qué le pasaría a tu *healthcheck* del Capítulo 6.5 en los primeros segundos de un despliegue real.)
- Si tu pipeline incluye un build de imagen Docker, ¿en qué paso del workflow tiene más sentido —antes o después de los tests de integración— y por qué?
- ¿Qué información de las secciones anteriores del módulo (el patrón de logs JSON del Capítulo 6.5, por ejemplo) incluirías en la salida del propio pipeline de CI para que un fallo futuro sea más fácil de diagnosticar que un simple "test failed"?

*Criterio de éxito:* documentado con los logs de ejecución de referencia (reales, de tu propia ejecución local simulando el job, o de una ejecución real si tienes acceso a un runner de CI) mostrando el pipeline completo en verde — no una descripción de lo que "debería" pasar.
