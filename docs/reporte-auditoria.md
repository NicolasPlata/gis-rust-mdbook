# Reporte de Auditoría: APIs GIS con Rust

## 1. Análisis de Alineación Estructural (EDT vs Estado Actual)

Tras revisar la Estructura de Desglose del Trabajo (`docs/EDT-libro-rust-gis-apis.md`), el manifiesto del proyecto (`CLAUDE.md`) y el contenido actual del repositorio (específicamente `src/SUMMARY.md` y los archivos existentes), se confirma que la arquitectura del libro mantiene una alineación sólida con la visión del proyecto. La progresión desde los fundamentos (Fase 0) hasta la arquitectura de producción (Fase 4) y los *capstones* finales está bien estructurada, respetando la alta densidad de ejercicios exigida.

Sin embargo, para garantizar la transición desde un nivel 0 hasta un nivel de **experto en producción**, se han identificado oportunidades de mejora, vacíos conceptuales y casos de borde que deben integrarse sin alterar la ruta base.

## 2. Vacíos Conceptuales y Desalineaciones

Para alcanzar el estándar de calidad de una editorial técnica (ej. O'Reilly) y asegurar que el lector esté preparado para los retos reales de producción, faltan ciertos conceptos clave en la ruta actual:

1. **Testing Basado en Propiedades (Property-Based Testing):**
   * **Vacío:** El libro asume pruebas unitarias tradicionales (`cargo test`), pero los algoritmos GIS (áreas, distancias, intersecciones) sufren constantemente por casos de borde imprevistos (colinealidad, precisión de flotantes).
   * **Impacto:** Sin testing robusto, el lector no sabrá cómo garantizar que su lógica espacial no fallará en producción con datos ruidosos.
   * **Recomendación:** Introducir el crate `proptest` en el **Capítulo 3.3** (`geo` — algoritmos core) para enseñar cómo generar geometrías aleatorias válidas y verificar invariantes (ej. "el área de un polígono nunca es negativa").

2. **Mapeo de Errores de Dominio a Respuestas HTTP (RFC 7807):**
   * **Vacío:** El Capítulo 2.2 enseña `Result` y manejo de errores puros. El Módulo 5 (Capítulo 6.1) introduce Axum. Falta el "puente": cómo convertir de forma idiomática un `geo::Error` o un error de BD en un código de estado HTTP adecuado (ej. 400 Bad Request, 422 Unprocessable Entity, 404 Not Found) usando `IntoResponse`.
   * **Impacto:** Sin esto, las APIs del lector pueden exponer *stack traces* o mensajes internos, fallando en el diseño de un contrato de API profesional.
   * **Recomendación:** Agregar una subsección específica en el **Capítulo 6.1** sobre el mapeo estructurado de errores y el uso de *Problem Details for HTTP APIs* (RFC 7807).

3. **Streaming Directo desde PostGIS a HTTP:**
   * **Vacío:** En el Capítulo 4.5 se enseña PostGIS con SQLx. En el Módulo 4 se aborda el streaming cloud-native (FlatGeobuf). Sin embargo, falta enseñar cómo hacer streaming asíncrono desde la base de datos hacia la respuesta HTTP.
   * **Impacto:** Un desarrollador junior podría intentar cargar 500,000 WKB features en un `Vec` en memoria antes de serializarlas a GeoJSON en Axum, provocando un OOM (Out Of Memory) inmediato en el servidor.
   * **Recomendación:** Introducir `sqlx::query().fetch()` como *Stream* en el **Capítulo 6.1 o 6.2**, integrándolo con el *body* de la respuesta en Axum.

## 3. Casos de Borde Técnicos y Pedagógicos

Durante el desarrollo de APIs GIS, los casos de borde no son la excepción, son la norma. La estructura actual debe visibilizar explícitamente los siguientes:

1. **Cruce del Antimeridiano (180th Meridian) y los Polos:**
   * **Caso de Borde:** Calcular el *bounding box* o la intersección de un polígono que cruza de Rusia a Alaska rompe la mayoría de las lógicas ingenuas.
   * **Ubicación Sugerida:** Abordar explícitamente en el **Capítulo 3.2** (CRS geográficos) o **3.3** (algoritmos core), demostrando cómo limpiar o dividir estas geometrías.

2. **La Regla de la Mano Derecha (Right-Hand Rule) en GeoJSON:**
   * **Caso de Borde:** El estándar RFC 7946 exige que los anillos exteriores se definan en sentido antihorario. Recibir GeoJSON legacy (horario) y guardarlo ciegamente causa fallos sutiles en predicados topológicos o motores de renderizado.
   * **Ubicación Sugerida:** **Capítulo 3.4** (Serialización). Enseñar cómo `geo` puede corregir el *winding order* (ej. `enforce_winding_order`).

3. **CORS y Seguridad Básica en Middleware:**
   * **Caso de Borde:** Ninguna API moderna en el navegador funciona sin CORS. Es un dolor de cabeza recurrente para los novatos.
   * **Ubicación Sugerida:** Incluir el middleware de CORS y consideraciones de seguridad (ej. límite estricto de tamaño del *payload* para evitar ataques de negación de servicio por geometrías gigantes) en el **Capítulo 6.2**.

## 4. Oportunidades de Mejora Específicas

### 4.1. Archivos `00-indice.md` (Introducciones de Módulo)

Actualmente, los archivos `00-indice.md` de cada módulo son extremadamente breves, funcionando solo como un índice de viñetas. En un libro de calidad editorial, el primer archivo de un módulo debe "vender" el capítulo, contextualizar al lector y prepararlo mentalmente.

**Propuesta accionable para todos los `00-indice.md`:**
Deben reestructurarse para incluir sistemáticamente:
1. **Objetivos de Aprendizaje:** 3-4 viñetas concretas sobre las capacidades que adquirirá el lector.
2. **Contexto Arquitectónico (Evolución de GeoAPI):** ¿En qué estado dejamos el proyecto y qué pieza se agrega ahora?
3. **Diagrama Visual:** Uso de bloques `mermaid` para graficar la arquitectura del módulo (ej. mostrando cómo encaja la caché, PostGIS o el cliente HTTP).
4. **Requisitos Previos:** Un breve recordatorio de qué conceptos de módulos anteriores son críticos para no perderse.

### 4.2. Ajustes Estructurales Sugeridos (Trazabilidad EDT)

No se sugiere añadir nuevos capítulos completos que desfasen la numeración, sino expandir el alcance de capítulos existentes (registrando las expansiones en el `BACKLOG.md`):

*   **En 3.2 (CRS):** Añadir subsección sobre el Antimeridiano.
*   **En 3.3 (Algoritmos):** Añadir subsección / ejercicio sobre Property-Based Testing (`proptest`).
*   **En 3.4 (Serialización):** Añadir ejercicio específico sobre *Winding Order* y GeoJSON malformado.
*   **En 6.1 (Axum/Actix):** Añadir subsección de mapeo de errores de dominio (HTTP Status Codes y `IntoResponse`) y streaming de DB a HTTP.
*   **En 6.2 (Middleware):** Añadir ejercicio sobre implementación de capa CORS segura.

## 5. Plan de Acción Recomendado

1. **Refactorización Editorial Inmediata:** Intervenir los archivos `src/*/00-indice.md` aplicando el nuevo estándar visual y pedagógico (objetivos, contexto, diagrama mermaid).
2. **Actualización de Backlog:** Añadir los casos de borde (Antimeridiano, Right-Hand Rule) como requisitos explícitos en los ejercicios correspondientes dentro de `BACKLOG.md`.
3. **Validación de Código:** Para el Módulo 6, asegurar que el código de verificación (scratchpad) contemple explícitamente el uso de `IntoResponse` y streams de base de datos antes de redactar los capítulos, para garantizar su viabilidad pedagógica sin desviar al lector hacia conceptos excesivamente complejos.
