# 4.5 Persistencia con PostGIS — SQLx y Diesel

Todo lo que ha hecho GeoAPI hasta ahora vive y muere con el proceso: cierras el programa, pierdes los datos. Un servicio real necesita persistencia, y para datos espaciales eso casi siempre significa **PostGIS** — la extensión de PostgreSQL que añade tipos de geometría, índices espaciales y cientos de funciones `ST_*` a un motor de base de datos relacional maduro. Este capítulo conecta GeoAPI a una base PostGIS real, con las dos formas más comunes de hacerlo desde Rust: **SQLx** (SQL crudo, async, verificado en tiempo de compilación) y **Diesel** (un DSL tipado sobre el modelo relacional).

## Verifica tus versiones antes de fijarlas

Antes de escribir una sola línea: `sqlx` (versión 0.8 en este capítulo) y `geozero` (0.15, que trae el *bridge* entre WKB/EWKB de PostGIS y `geo-types`) tienen que estar en la **misma versión mayor de `sqlx` internamente** para que sus tipos se reconozcan entre sí. Al momento de escribir esto, `geozero` con el feature `with-postgis-sqlx` depende de `sqlx` 0.8, mientras que la última versión publicada de `sqlx` en solitario ya es 0.9 — si dejas que `cargo add sqlx` te instale la más reciente sin fijar la versión, terminas con **dos copias de `sqlx-core` en el árbol de dependencias** (una que usa `geozero`, otra que usa tu código), y el compilador rechaza tus tipos por no ser "el mismo" `sqlx::Postgres` aunque el nombre sea idéntico. La lección, otra vez: verifica el árbol real de dependencias (`cargo tree`) antes de asumir que "la versión más nueva de todo" compila junta.

```toml
[dependencies]
sqlx = { version = "0.8", default-features = false, features = ["runtime-tokio", "postgres", "macros"] }
geozero = { version = "0.15", features = ["with-postgis-sqlx", "with-wkb"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
geo-types = "0.7"
```

## Migraciones formalizadas con `sqlx-cli`

Un servicio real necesita saber, en todo momento y en cada entorno (tu máquina, staging, producción), exactamente qué versión del esquema tiene la base de datos — y poder aplicar o revertir cambios de forma reproducible, sin depender de que alguien recuerde ejecutar el `CREATE TABLE` correcto a mano. Esa es la tarea de **`sqlx-cli`**, la herramienta de línea de comandos que acompaña a `sqlx` (misma versión 0.8 fijada arriba):

```bash
cargo install sqlx-cli --version "^0.8" --no-default-features --features rustls,postgres
```

Con `DATABASE_URL` definido (en el entorno, o en un archivo `.env` en la raíz del proyecto — `sqlx-cli` lo lee automáticamente), `sqlx migrate add` genera un par de archivos versionados por timestamp:

```bash
sqlx migrate add -r crear_features
```

```text
Creating migrations/20260907062434_crear_features.up.sql
Creating migrations/20260907062434_crear_features.down.sql
```

El flag `-r` (*reversible*) pide un par `.up.sql`/`.down.sql` en vez de un solo archivo — todo cambio de esquema debe poder deshacerse, no solo aplicarse. Rellenas cada archivo con SQL real:

```sql
-- migrations/20260907062434_crear_features.up.sql
CREATE TABLE features (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    geom GEOMETRY(Geometry, 4326) NOT NULL
);
```

```sql
-- migrations/20260907062434_crear_features.down.sql
DROP TABLE features;
```

Cada geometría almacenada en PostGIS necesita un **SRID** (el identificador numérico de su sistema de referencia, ver Capítulo 3.2) asociado — sin él, PostGIS no sabe si tus coordenadas son grados WGS84, metros UTM, o cualquier otra cosa, y muchas funciones espaciales simplemente se niegan a operar entre geometrías con SRID distinto. `GEOMETRY(Geometry, 4326)` acepta cualquier tipo de geometría (Point, Polygon, ...) con SRID 4326 (WGS84) — una restricción más laxa que `GEOMETRY(Point, 4326)`, que solo aceptaría puntos. GeoAPI, que recibe features de tipos variados desde `POST /features`, necesita la primera. `ST_SetSRID(geom, 4326)` es la función que *estampa* ese SRID sobre una geometría que todavía no lo tiene — vas a usarla en cada inserción, porque el WKB que produce `geozero` a partir de un `geo_types::Geometry` no trae SRID por defecto (`geo-types` no tiene ese concepto en absoluto, como viste en el Capítulo 3.2).

Con los archivos listos, `sqlx migrate run` aplica cada migración pendiente y registra cuáles ya corrieron en una tabla de control, `_sqlx_migrations`, que la propia herramienta crea y mantiene:

```bash
sqlx migrate run
```

```text
Applied 20260907062434/migrate crear features (11.75276ms)
```

`sqlx migrate info` muestra el estado — `installed` si ya se aplicó, `pending` si no:

```bash
sqlx migrate info
```

```text
20260907062434/installed crear features
```

Y `sqlx migrate revert` deshace la última migración aplicada, ejecutando su `.down.sql`:

```bash
sqlx migrate revert
```

```text
Applied 20260907062434/revert crear features (3.44676ms)
```

Esto reemplaza por completo la práctica de incrustar el DDL como texto suelto dentro del código de la aplicación (o de ejecutarlo una sola vez a mano vía `sqlx::query` y no volver a tocarlo): el directorio `migrations/` se convierte en la fuente única de verdad del historial de esquema, se versiona junto con el código que depende de él, y en un pipeline de despliegue real `sqlx migrate run` es un paso explícito que corre contra el `DATABASE_URL` del entorno de destino antes de arrancar la nueva versión del servicio.

## Insertar vía SQLx con `geozero`

`geozero` provee dos tipos *wrapper* que implementan `sqlx::Encode`/`sqlx::Decode` sobre cualquier tipo compatible: `wkb::Encode<T>` para escribir, `wkb::Decode<T>` para leer.

```rust,ignore
use geo_types::{Geometry, Point};
use geozero::wkb;
use sqlx::postgres::PgPoolOptions;
use sqlx::Row;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;

    let bogota = Geometry::Point(Point::new(-74.0721, 4.7110));

    let id: i32 = sqlx::query(
        "INSERT INTO features (nombre, geom) VALUES ($1, ST_SetSRID($2, 4326)) RETURNING id",
    )
    .bind("Bogotá")
    .bind(wkb::Encode(bogota))
    .fetch_one(&pool)
    .await?
    .get(0);

    println!("insertado con id={id}");
    Ok(())
}
```

```text
insertado con id=1
```

Nota que `wkb::Encode(bogota)` mueve la `Geometry<f64>` — el *wrapper* implementa la serialización a WKB por ti, sin que tengas que construir el binario a mano ni preocuparte por el orden de bytes. Esto reemplaza lo que en otros lenguajes suele requerir una librería aparte (GEOS, Shapely) solo para el paso de serialización.

## Consulta espacial con `ST_DWithin` — y la trampa `geometry` vs. `geography`

`ST_DWithin(a, b, distancia)` — "¿está `a` a menos de `distancia` de `b`?" — es la base de cualquier `GET /features/near?lat&lon&radius`. Pero hay un detalle que, si lo ignoras, produce resultados silenciosamente incorrectos:

```rust,ignore
use geo_types::Geometry;
use geozero::wkb;
use sqlx::Row;
# use sqlx::PgPool;
# async fn ejemplo(pool: &PgPool) -> Result<(), sqlx::Error> {
let filas = sqlx::query(
    "SELECT id, nombre, geom FROM features
     WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)",
)
.bind(-74.0721_f64)
.bind(4.7110_f64)
.bind(50_000.0_f64) // 50 km
.fetch_all(pool)
.await?;

for fila in &filas {
    let nombre: String = fila.get("nombre");
    let geom: wkb::Decode<Geometry<f64>> = fila.get("geom");
    println!("cercano: {nombre} -> {:?}", geom.geometry);
}
# Ok(())
# }
```

```text
cercano: Bogotá -> Some(POINT(-74.0721 4.711))
```

Fíjate en el `::geography` aplicado a **ambos** lados de `ST_DWithin`. Tu columna está declarada como `geometry`, y `ST_DWithin` sobre dos valores `geometry` mide distancia en las **unidades del SRID** — para EPSG:4326, eso son grados, no metros. Pasar `50_000.0` esperando "50 kilómetros" a una función que interpreta ese número como "50.000 grados" (más que la circunferencia completa del planeta) te devolvería *todas* las filas sin ningún error, ninguna advertencia — un bug silencioso que solo notarías al ver resultados sospechosamente completos. El *cast* a `::geography` le dice a PostGIS que calcule la distancia sobre un esferoide (igual que `GeodesicArea` en el Capítulo 3.3), en metros reales. **Esta es la razón exacta por la que este bug es tan común en código PostGIS de producción: compila, no lanza ningún error, y devuelve datos — simplemente los datos equivocados.**

## El mismo flujo con Diesel

[Diesel](https://crates.io/crates/diesel) (versión 2.3) es la alternativa ORM/DSL tipado: en vez de escribir SQL como texto, describes tu esquema con macros y Diesel genera consultas type-checked en tiempo de compilación. El crate [`postgis_diesel`](https://crates.io/crates/postgis_diesel) (versión 3.1) añade los tipos de geometría y las funciones `ST_*` como funciones SQL tipadas de Diesel.

```rust,ignore
use diesel::prelude::*;
use postgis_diesel::functions::st_d_within;
use postgis_diesel::types::Point;

table! {
    use postgis_diesel::sql_types::*;
    use diesel::sql_types::*;
    features_diesel (id) {
        id -> Int4,
        nombre -> Text,
        geom -> Geography, // no Geometry -- ver la nota de la sección anterior
    }
}

#[derive(Insertable)]
#[diesel(table_name = features_diesel)]
struct NuevaFeature {
    nombre: String,
    geom: Point,
}

#[derive(Queryable)]
struct Feature {
    id: i32,
    nombre: String,
    geom: Point,
}

fn main() {
    let mut conn = PgConnection::establish(&std::env::var("DATABASE_URL").unwrap()).unwrap();

    let nuevas = vec![
        NuevaFeature { nombre: "Bogotá".to_string(), geom: Point { x: -74.0721, y: 4.7110, srid: Some(4326) } },
        NuevaFeature { nombre: "Medellín".to_string(), geom: Point { x: -75.5636, y: 6.2518, srid: Some(4326) } },
    ];
    diesel::insert_into(features_diesel::table).values(&nuevas).execute(&mut conn).unwrap();

    let centro = Point { x: -74.0721, y: 4.7110, srid: Some(4326) };
    let cercanas: Vec<Feature> = features_diesel::table
        .filter(st_d_within(features_diesel::geom, centro, 50_000.0))
        .select((features_diesel::id, features_diesel::nombre, features_diesel::geom))
        .load(&mut conn)
        .unwrap();

    println!("total: {}", cercanas.len());
}
```

```text
total: 1
```

La misma trampa de `geometry` vs. `geography` reaparece aquí, resuelta de otra forma: en vez de un `::cast` explícito en cada consulta (que el DSL tipado de Diesel no te deja escribir tan fácilmente), la columna se declara directamente como `sql_types::Geography` en el `table!` y como `GEOGRAPHY(Point, 4326)` en el SQL de creación. `postgis_diesel::types::Point` funciona igual para ambos tipos SQL — la diferencia vive enteramente en la declaración de la columna, no en tu código Rust. Diesel es completamente síncrono (a diferencia de SQLx): `PgConnection::establish` bloquea el hilo, sin `tokio` de por medio — una decisión de diseño consciente de Diesel para mantener su API simple, que implica que en un servidor async (Capítulo 6.1) necesitarías un pool que gestione conexiones síncronas en un hilo aparte (`r2d2`, o el soporte async experimental de Diesel) si eliges esta ruta.

## Índice GiST y medición de mejora

Un `ST_DWithin` sin índice espacial recorre la tabla completa calculando distancia fila por fila — perfectamente correcto, inaceptablemente lento sobre cientos de miles de features. El índice estándar de PostGIS es **GiST** (*Generalized Search Tree*), la contraparte en la base de datos del R*-tree que ya conoces de `rstar` (Capítulo 4.3).

```rust,ignore
# use std::time::Instant;
# use sqlx::PgPool;
# async fn ejemplo(pool: &PgPool) -> Result<(), sqlx::Error> {
let consulta = "SELECT count(*) FROM features_bench
     WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(-74.0721, 4.7110), 4326)::geography, 5000)";

let inicio = Instant::now();
let (_n,): (i64,) = sqlx::query_as(consulta).fetch_one(pool).await?;
println!("sin índice: {:?}", inicio.elapsed());

// El índice se crea sobre la EXPRESIÓN `geom::geography`, no sobre `geom`
// directamente -- un GiST plano sobre `geom` (tipo geometry) no se usa
// para un filtro que compara contra `geom::geography`.
sqlx::query("CREATE INDEX features_bench_geog_gist ON features_bench USING GIST ((geom::geography))")
    .execute(pool)
    .await?;
sqlx::query("ANALYZE features_bench").execute(pool).await?;

let inicio = Instant::now();
let (_n,): (i64,) = sqlx::query_as(consulta).fetch_one(pool).await?;
println!("con índice GiST: {:?}", inicio.elapsed());
# Ok(())
# }
```

```text
sin índice: 156.690143ms
con índice GiST: 18.349961ms
```

Medido sobre 100.000 features distribuidas aleatoriamente en el área metropolitana de Bogotá: **~8.5x más rápido** con el índice. Pero el resultado más importante no es el número — es que **un `CREATE INDEX ... USING GIST (geom)` normal, sobre la columna sin el `::geography`, no se usa en absoluto** para esta consulta (confirmado con `EXPLAIN`: el plan sigue mostrando `Seq Scan` aunque el índice exista). PostgreSQL solo usa un índice cuando su definición coincide con la expresión exacta del filtro — si consultas sobre `geom::geography`, necesitas un índice sobre esa misma expresión (`GIST ((geom::geography))`), o cambiar el tipo de la columna a `geography` directamente, como hiciste en la sección de Diesel. Verificarlo con `EXPLAIN` antes de asumir que "ya tienes un índice, así que ya está optimizado" es la disciplina que separa un índice que ayuda de uno que solo ocupa espacio en disco.

## Rechazar geometrías inválidas antes de insertar

Que un `Polygon<f64>` se construya sin panics en `geo-types` no significa que sea una geometría **válida** en el sentido que le importa a PostGIS y a cualquier operación espacial seria. El caso clásico es el polígono "corbatín" (*bowtie*): un anillo cuyos lados se autointersecan, formando dos triángulos que solo comparten un punto. `geo-types` lo acepta sin quejarse — no valida topología, solo estructura una secuencia de coordenadas — pero operaciones como `ST_Area`, `ST_Union` o `ST_Intersection` sobre una geometría así producen resultados indefinidos o simplemente incorrectos.

PostGIS sí sabe distinguir esto: `ST_IsValid(geom)` devuelve `false` para una geometría topológicamente inválida, y `ST_IsValidReason(geom)` explica por qué, en texto:

```rust,ignore
use geo_types::Geometry;
use geozero::wkb;
use sqlx::Row;
# use sqlx::PgPool;

async fn es_valida(pool: &PgPool, geom: &Geometry<f64>) -> Result<(bool, Option<String>), sqlx::Error> {
    let fila = sqlx::query("SELECT ST_IsValid($1) AS valida, ST_IsValidReason($1) AS razon")
        .bind(wkb::Encode(geom.clone()))
        .fetch_one(pool)
        .await?;
    Ok((fila.get("valida"), fila.get("razon")))
}
```

```text
cuadrado simple -> valida=true, razon=Some("Valid Geometry")
bowtie -> valida=false, razon=Some("Self-intersection[1 1]")
```

`ST_IsValidReason` incluso te da las coordenadas exactas donde el anillo se cruza a sí mismo — `[1 1]`, el punto donde las dos diagonales del corbatín se tocan. Este es el detalle que separa una validación útil de una que solo dice "no": el mensaje que le vas a devolver al cliente de la API puede citar el punto conflictivo directamente.

La regla de oro es **validar antes de insertar, nunca después**: una vez que una geometría inválida está en la tabla, cualquier consulta que dependa de topología correcta (áreas, uniones, `ST_DWithin` en casos límite) queda contaminada silenciosamente. Extiende `FeatureRepositorio` (sección siguiente) con un método que valida y solo inserta si la geometría pasa:

```rust,ignore
# use geo_types::Geometry;
# use geozero::wkb;
# use sqlx::{PgPool, Row};
# pub struct FeatureRepositorio { pool: PgPool }
#[derive(Debug)]
pub enum ErrorRepositorio {
    GeometriaInvalida(String),
    Db(sqlx::Error),
}

impl FeatureRepositorio {
    pub async fn insertar_validado(&self, nombre: &str, geom: Geometry<f64>) -> Result<i32, ErrorRepositorio> {
        let fila = sqlx::query("SELECT ST_IsValid($1) AS valida, ST_IsValidReason($1) AS razon")
            .bind(wkb::Encode(geom.clone()))
            .fetch_one(&self.pool)
            .await
            .map_err(ErrorRepositorio::Db)?;

        let valida: bool = fila.get("valida");
        if !valida {
            let razon: Option<String> = fila.get("razon");
            return Err(ErrorRepositorio::GeometriaInvalida(razon.unwrap_or_default()));
        }

        self.insertar(nombre, geom).await.map_err(ErrorRepositorio::Db)
    }
#     pub async fn insertar(&self, _nombre: &str, _geom: Geometry<f64>) -> Result<i32, sqlx::Error> { unimplemented!() }
}
```

`ErrorRepositorio::GeometriaInvalida` es exactamente el tipo de error que el mapeo a RFC 7807 del Capítulo 6.1 espera: un handler HTTP que reciba este error lo traduce a `400 Bad Request` con el mensaje de `ST_IsValidReason` en el campo `detail` del *problem detail* — nunca a un `500`, porque el problema no es del servidor, es de los datos que mandó el cliente.

## El patrón *repository*: aislar `api` de `db`

GeoAPI va a tener, desde el Capítulo 4.7 en adelante, una capa HTTP (`geoapi-api`) y una capa de persistencia (`geoapi-db`). El patrón *repository* es la forma estándar de que la primera nunca tenga que saber qué motor de base de datos usa la segunda, ni escribir SQL directamente: expones un `struct` con métodos de dominio (`insertar`, `cerca_de`), y todo el SQL —incluida la trampa `geometry`/`geography` de arriba— queda encapsulado detrás de esa interfaz.

```rust,ignore
use geo_types::Geometry;
use geozero::wkb;
use sqlx::{PgPool, Row};

pub struct FeatureRepositorio {
    pool: PgPool,
}

pub struct FeatureFila {
    pub id: i32,
    pub nombre: String,
    pub geom: Geometry<f64>,
}

impl FeatureRepositorio {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn insertar(&self, nombre: &str, geom: Geometry<f64>) -> Result<i32, sqlx::Error> {
        let fila = sqlx::query(
            "INSERT INTO features (nombre, geom) VALUES ($1, ST_SetSRID($2, 4326)) RETURNING id",
        )
        .bind(nombre)
        .bind(wkb::Encode(geom))
        .fetch_one(&self.pool)
        .await?;
        Ok(fila.get(0))
    }

    pub async fn cerca_de(&self, lon: f64, lat: f64, radio_m: f64) -> Result<Vec<FeatureFila>, sqlx::Error> {
        let filas = sqlx::query(
            "SELECT id, nombre, geom FROM features
             WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)",
        )
        .bind(lon)
        .bind(lat)
        .bind(radio_m)
        .fetch_all(&self.pool)
        .await?;

        Ok(filas
            .into_iter()
            .map(|f| {
                let geom: wkb::Decode<Geometry<f64>> = f.get("geom");
                FeatureFila {
                    id: f.get("id"),
                    nombre: f.get("nombre"),
                    geom: geom.geometry.expect("geometría no nula"),
                }
            })
            .collect())
    }
}
```

Ningún handler HTTP futuro (Capítulo 4.7) va a construir SQL, decidir entre `geometry` y `geography`, o llamar a `geozero` directamente — todo eso vive una sola vez, aquí. Si mañana migras de SQLx a Diesel, o de PostGIS a otro motor, el cambio queda contenido dentro de `FeatureRepositorio`: la capa HTTP nunca se entera.

## Ejercicios

**Ejercicio 1 — Migración formal con `sqlx-cli`.**
Usa `sqlx migrate add -r crear_zonas_cobertura` para generar el par de migraciones de una tabla `zonas_cobertura` con una columna `geom GEOMETRY(Polygon, 4326)` (a diferencia del capítulo, restringida solo a polígonos) y un campo `activa BOOLEAN NOT NULL DEFAULT true`. Aplica la migración con `sqlx migrate run`, inserta al menos dos zonas usando `ST_SetSRID`, y confirma con una consulta `SELECT ST_SRID(geom) FROM zonas_cobertura` que el SRID quedó correctamente asignado a `4326` en ambas filas. Finalmente, confirma con `sqlx migrate revert` seguido de `sqlx migrate info` que la migración vuelve a quedar como `pending` y la tabla desaparece.

*Criterio de éxito:* después de `sqlx migrate run`, un test async (`#[tokio::test]`) que inserte las dos zonas y confirme, con `assert_eq!`, que `ST_SRID(geom)` devuelve `4326` para cada una. Por separado, ejecutar `sqlx migrate revert` y verificar a mano (con `sqlx migrate info` o una consulta a `information_schema.tables`) que la tabla ya no existe.

**Ejercicio 2 — Insert vía SQLx con `geozero`.**
Extiende el `insertar` del capítulo para que, además de un `Point`, acepte y almacene correctamente un `Polygon` y una `LineString` (los tres representables por el mismo `Geometry<f64>` y la misma columna `GEOMETRY(Geometry, 4326)`). Verifica leyendo cada fila de vuelta con `wkb::Decode` que el tipo concreto de geometría (`Geometry::Point`, `Geometry::Polygon`, `Geometry::LineString`) se preserva exactamente.

*Criterio de éxito:* un test que inserte los tres tipos de geometría y confirme, con `assert!(matches!(...))`, que cada uno vuelve del mismo tipo con el que se insertó.

**Ejercicio 3 — Query espacial `ST_DWithin`.**
Inserta al menos cinco features en posiciones conocidas alrededor de un punto central, a distancias que tú mismo calcules de antemano (por ejemplo, usando `Haversine` del Capítulo 3.3 para saber exactamente cuáles quedan dentro de un radio de 10km y cuáles no). Confirma con `cerca_de` que el conjunto de features devueltas coincide exactamente con tu cálculo previo.

*Criterio de éxito:* un test que compara el conjunto de IDs devuelto por la consulta espacial contra el conjunto que calculaste de antemano con Haversine — deben coincidir exactamente, ni de más ni de menos.

**Ejercicio 4 — Mismo flujo con Diesel.**
Repite el Ejercicio 3 completo (inserción de las mismas cinco features, misma consulta `st_d_within`) pero usando Diesel en vez de SQLx, sobre una tabla separada. Confirma que ambos caminos (SQLx y Diesel) devuelven el mismo conjunto de IDs para la misma consulta sobre los mismos datos.

*Criterio de éxito:* un test que ejecuta ambas rutas contra los mismos datos de prueba y confirma con `assert_eq!` (comparando conjuntos, no vectores, para no depender del orden) que los resultados coinciden.

**Ejercicio 5 — Índice GiST y medición de mejora.**
Repite el experimento del capítulo con tus propios parámetros: genera al menos 50.000 features aleatorias, mide `ST_DWithin` antes y después de crear el índice `GIST ((geom::geography))`, y adicionalmente confirma con una consulta `EXPLAIN` (parseando o simplemente imprimiendo el texto del plan) que el plan cambia de `Seq Scan` a algo que mencione `Index` o `Bitmap`.

*Criterio de éxito:* tu programa imprime ambos tiempos medidos y el texto de ambos planes (`EXPLAIN`), con una aserción que confirme que el plan "antes" contiene la palabra `Seq Scan` y que el plan "después" NO la contiene (o contiene `Index` en su lugar).

**Ejercicio 6 — Patrón repository.**
Extiende `FeatureRepositorio` con un método `pub async fn eliminar(&self, id: i32) -> Result<bool, sqlx::Error>` (devuelve `true` si eliminó una fila, `false` si el `id` no existía) y un método `pub async fn actualizar_geometria(&self, id: i32, nueva_geom: Geometry<f64>) -> Result<bool, sqlx::Error>`. Ninguno de los dos debe exponer SQL ni tipos de `sqlx`/`geozero` a quien llame el repositorio — solo tipos de `geoapi-core` (`Geometry<f64>`, tipos primitivos, `bool`).

*Criterio de éxito:* tres tests: eliminar un `id` existente devuelve `true` y una consulta posterior confirma que la fila ya no está; eliminar un `id` inexistente devuelve `false` sin error; actualizar la geometría de una fila existente y volver a leerla confirma que la nueva geometría reemplazó a la anterior.

**Ejercicio 7 — Rechazar geometrías inválidas.**
Extiende `FeatureRepositorio` con el método `insertar_validado` visto en la sección de geometrías inválidas. Construye al menos tres geometrías inválidas distintas a la del capítulo (por ejemplo, un `Polygon` cuyo anillo interior se sale del anillo exterior, o uno con menos de cuatro coordenadas en el anillo exterior) y confirma que cada una es rechazada con un mensaje de `ST_IsValidReason` descriptivo, sin llegar a insertarse en la tabla.

*Criterio de éxito:* un test que intenta insertar cada geometría inválida, confirma que `insertar_validado` devuelve `Err(ErrorRepositorio::GeometriaInvalida(_))`, y que un `SELECT count(*) FROM features` no aumenta tras cada intento fallido.

> Esta técnica es la que usa el Checkpoint 1 del proyecto GeoAPI v0.3 (Capítulo 4.7) — ver la historia de usuario y el caso de uso ahí.
