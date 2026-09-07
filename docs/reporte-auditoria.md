# Reporte de Auditoría: APIs GIS con Rust

**Objetivo:** Evaluar la estructura y el contenido actual del proyecto mdBook "APIs GIS con Rust" frente a la Estructura de Desglose del Trabajo (EDT) y el objetivo general de llevar al lector desde un nivel 0 (sin experiencia en Rust) hasta el despliegue de arquitecturas de producción, identificando vacíos, casos de borde y oportunidades de mejora.

## 1. Alineación General con la EDT

**Hallazgo:** La estructura de directorios, archivos en `src/` y el archivo `SUMMARY.md` se alinean al **100%** con los requerimientos mecánicos de la EDT. El mapeo de capítulos y los ejercicios descritos se adhieren fielmente a la especificación, lo cual es un excelente punto de partida.

Sin embargo, desde el punto de vista conceptual y pedagógico, existen vacíos que impiden lograr cabalmente el nivel de "producción experta" descrito en los lineamientos originales.

---

## 2. Vacíos Conceptuales Críticos

### 2.1. El Contrato del Executor Asíncrono (Async/Await y `spawn_blocking`)
El libro introduce frameworks asíncronos (`tokio`, `axum`, `sqlx`) a partir del Módulo 3 y de forma agresiva en el Módulo 5. Sin embargo, no hay una sección que enseñe conceptualmente las reglas del juego asíncrono en Rust.
En el dominio GIS, la mayoría de los algoritmos (reproyección, intersección, simplificación de geometrías) son intensivos en CPU (*CPU-bound*). Si un desarrollador nivel 0 utiliza estas funciones directamente dentro de un handler de `axum`, provocará *thread starvation*, bloqueando el *runtime* y derribando la concurrencia del servidor. Aunque los capítulos 5.7 y 6.2 mencionan `tokio::task::spawn_blocking`, lo hacen tardíamente y como un detalle de implementación, no como un principio fundacional.
* **Mejora accionable:** Añadir una subsección explícita en `05-concurrencia-cloud-native-ffi/00-indice.md` o al inicio de `5.1 Paralelismo de datos con Rayon` que se titule "El contrato de Tokio: IO-bound vs CPU-bound". Explicar por qué las operaciones de la crate `geo` deben ser encapsuladas en `spawn_blocking` dentro de un servidor HTTP para evitar el bloqueo del executor.

### 2.2. Seguridad: Autenticación y Autorización
Para que una API se considere de "producción" (Módulo 5), debe estar protegida. El capítulo `6.2 Middleware con Tower` aborda CORS, rate-limiting y timeouts, pero omite por completo la seguridad de acceso (AuthN/AuthZ).
* **Mejora accionable:** Expandir el alcance de `06-arquitectura-produccion/02-middleware-tower.md` para incluir un ejercicio de validación de identidad. Se sugiere implementar la extracción y validación de **API Keys** a través de cabeceras HTTP mediante un middleware de Tower simple, garantizando que los endpoints de modificación (ej. `POST /features`) estén securizados. 

---

## 3. Casos de Borde Técnicos y Pedagógicos

### 3.1. Topología Inválida (Invalid Geometries)
El modelo *Simple Features* (Capítulo 3.1) y la persistencia (Capítulo 4.5) asumen geometrías válidas. No se aborda el caso de borde clásico en GIS: polígonos auto-intersectantes (ej. *bowties*). PostGIS rechazará operaciones (como `ST_Area`) sobre estas geometrías, y una API robusta debe saber interceptar esto antes de intentar persistirlas o devolver un error 500 inmanejable.
* **Mejora accionable:** Incorporar en `04-indices-robustez-persistencia/05-persistencia-postgis.md` el uso de `ST_IsValid` o un filtro a nivel de aplicación para rechazar (devolviendo `400 Bad Request`) o reparar geometrías inválidas en la inserción. 

### 3.2. Límites de Pooling de Conexiones
El uso de `sqlx::postgres::PgPoolOptions::new().max_connections(5)` se introduce en `4.5`, pero no se explora qué ocurre cuando la concurrencia de peticiones excede este límite (el caso de borde del *pool exhaustion*). En producción, entender los timeouts de adquisición de conexión es vital.
* **Mejora accionable:** En el capítulo `6.5 Observabilidad, resiliencia y despliegue`, añadir un breve ejercicio de pruebas de carga o una nota de advertencia sobre cómo dimensionar `max_connections` y configurar timeouts de adquisición adecuados en el pool de `sqlx`.

---

## 4. Oportunidades de Mejora de Calidad de Vida (DevOps/Producción)

### 4.1. Gestión DDL y Migraciones Formales (`sqlx-cli`)
El Capítulo 4.5 pide en sus ejercicios escribir migraciones SQL "como texto, o ejecutada vía `sqlx::query`". Las arquitecturas en producción estándar del ecosistema Rust usan herramientas como `sqlx-cli` (`sqlx migrate run`) para versionar archivos `.sql` explícitos.
* **Mejora accionable:** Actualizar `04-indices-robustez-persistencia/05-persistencia-postgis.md` para incluir un breve instructivo sobre `sqlx-cli` y cómo organizar las migraciones en un directorio `migrations/`, reemplazando la ejecución manual de comandos DDL embebidos.

### 4.2. Documentación API nativa de Rust (`utoipa`)
En el Capítulo 6.4, la documentación de OpenAPI se escribe estáticamente a mano en YAML. Si bien es válido y promueve un diseño *API-First*, mantener sincronizado YAML y el código de Rust es propenso a errores. 
* **Mejora accionable:** Mencionar brevemente (como una nota editorial o "camino de expansión") la crate `utoipa` como estándar del ecosistema para derivar el documento OpenAPI directamente de la declaración de *handlers* y *structs* de Axum.

---

## Conclusión Estratégica
El proyecto posee una integridad estructural sobresaliente y un nivel técnico alto. Las recomendaciones aquí detalladas se enfocan exclusivamente en cerrar la brecha hacia las realidades ásperas del entorno de producción (hilos bloqueados por algoritmos espaciales, geometrías defectuosas en el input del usuario, migraciones de base de datos formales y seguridad básica) manteniendo el rigor técnico del material original.
