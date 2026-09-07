# 7.2 Capstone B — API analítica sobre GeoParquet a escala

Este capstone cambia el criterio de aceptación respecto al anterior. En 7.1 el contrato era una suite de tests que tu servidor debía pasar. Aquí el contrato es distinto y más abierto: **un benchmark que tú mismo produces y documentas**, comparando ejecución secuencial contra paralela sobre el mismo dataset. No hay un número "correcto" que perseguir — hay una metodología de medición que debes aplicar con rigor, la misma que este libro ha exigido desde el Capítulo 3.3: nunca reportes un tiempo que no mediste de verdad.

## Especificación de alcance

Un endpoint de **estadística zonal**: dado un dataset GeoParquet a escala (piensa en cientos de miles o millones de features, el caso para el que GeoJSON deja de tener sentido, según viste en el Capítulo 5.4), y un conjunto de zonas, el endpoint calcula agregaciones (conteo, suma, promedio) de un atributo numérico para cada zona por separado.

Tres requisitos no negociables de la especificación:

1. **Predicate pushdown real** (Capítulo 5.4): cada zona debe aprovechar las columnas de *covering* bbox por row group para leer solo los row groups relevantes — nunca el archivo completo, sin importar cuántas zonas se consulten.
2. **Paralelismo con Rayon** (Capítulo 5.1): las zonas son unidades de trabajo independientes entre sí — el candidato natural para `par_iter`, con el mismo criterio de granularidad correcta que aprendiste con `par_chunks` (ni una tarea gigante ni miles de tareas microscópicas).
3. **Respuesta en streaming**: el endpoint no debe acumular todas las estadísticas en memoria y serializar un único JSON al final — debe emitir el resultado de cada zona (por ejemplo, como una línea NDJSON) tan pronto esa zona termine de procesarse, con la misma técnica de `Body::from_stream` que ya verificaste en el Capítulo 6.1 (ahí la usaste para filas de PostGIS; aquí la fuente es el resultado de cada zona en paralelo), sobre el servidor Axum que ya construiste, con el mismo patrón de estado compartido del Capítulo 6.2.

**Historia de usuario:** Como agencia de planeación regional, quiero conocer estadísticas agregadas (población, uso del suelo) por zona a partir de un catastro nacional completo, para decidir dónde invertir sin tener que descargar ni procesar el país entero cada vez que hago una pregunta.

**Caso de uso — Consulta de estadística zonal:**
- **Actor:** un analista de la agencia de planeación.
- **Precondición:** un dataset GeoParquet con millones de predios, particionado en row groups, y un conjunto de zonas de interés (por ejemplo, municipios) definido por el analista.
- **Flujo principal:** 1. El analista pide agregaciones para su conjunto de zonas. 2. GeoAPI usa *predicate pushdown* para leer solo los row groups relevantes a cada zona, nunca el archivo completo. 3. Procesa las zonas en paralelo con Rayon. 4. Devuelve el resultado de cada zona en streaming, tan pronto está listo, sin esperar a las demás.
- **Resultado esperado:** el analista recibe resultados incrementales, zona por zona, sin que el servidor haya tenido que cargar el catastro nacional completo en memoria para responder.

## Tabla de trazabilidad

| Requisito del capstone | Capítulo(s) que lo enseñó |
|---|---|
| Álgebra de mapas / operaciones zonales | 4.6 |
| Predicate pushdown sobre GeoParquet | 5.4 |
| Paralelismo con Rayon | 5.1 |
| Contrato de API y manejo de errores | 2.4, 6.1 |
| Observabilidad de una operación de larga duración | 6.5 |

## Un hallazgo real que vas a encontrar (y cómo lo confirmé)

Antes de darte el criterio de aceptación, una advertencia basada en algo que ocurrió al verificar este capítulo — no una hipótesis, un bug real reproducido.

La intuición razonable es: "si genero un dataset con una zona por row group, y consulto con el bbox exacto de esa zona, el pushdown me devuelve exactamente los datos de esa zona". Es falsa, y vale la pena que la falsees tú mismo antes de confiar en ella:

```rust,ignore
// Dataset de verificación: 20 zonas contiguas (sin huecos entre ellas),
// 50.000 puntos cada una, un row group por zona.
// bbox_zona(z) devuelve exactamente el rango de longitud [inicio, inicio+0.5]
// que ocupa esa zona -- ni un metro más.

let relevantes = builder.intersecting_row_groups(bbox_zona(10), &geo_meta, None).unwrap();
println!("zona 10: row groups seleccionados = {relevantes:?}");
```

```text
zona 10: row groups seleccionados = [10, 11]
```

El pushdown seleccionó **dos** row groups, no uno. La razón: la bbox de *covering* de un row group se calcula a partir del rango real de los datos que contiene, y dos zonas contiguas sin huecos comparten borde — el máximo de longitud de la zona 10 coincide (hasta el redondeo de punto flotante) con el mínimo de la zona 11. `intersecting_row_groups` trata dos rectángulos que se tocan en el borde como intersectantes, una decisión de diseño razonable para un índice de bboxes (más vale un falso positivo que perder datos reales), pero significa que **el pushdown por bbox filtra row groups candidatos, no filas exactas.**

La consecuencia si no lo compensas: contar 1.950.000 filas en un dataset de exactamente 1.000.000, y una suma zonal que incluye silenciosamente puntos de la zona vecina. Esto es **exactamente el mismo patrón de dos fases** que aprendiste en los Capítulos 4.2 y 4.3 — un índice (ahí, `rstar`; aquí, las bboxes de row group) te da candidatos baratos de descartar, y todavía necesitas un **filtro exacto** después para quedarte solo con lo que de verdad cumple el predicado. No asumas que "pushdown" significa "ya filtrado" — significa "candidatos más baratos de leer".

## Benchmark de referencia

Verifiqué la especificación completa con un dataset de 1.000.000 de features (20 zonas × 50.000 puntos, ~48 MiB en disco), aplicando el filtro exacto de la sección anterior antes de agregar, y paralelizando con `rayon::par_iter` sobre las 20 zonas (cada una abriendo su propio lector Parquet — el mismo principio de "un recurso costoso por unidad de trabajo, no compartido" del Capítulo 5.1):

```text
escribiendo 20 zonas x 50000 puntos = 1000000 features... listo (50618013 bytes)
hilos disponibles (rayon::current_num_threads): 12

secuencial: 109.678677ms  (conteo=1000000, suma=1316000000)
paralelo:   37.625804ms  (conteo=1000000, suma=1316000000)
speedup: 2.91x

consistencia verificada: secuencial y paralelo producen exactamente el mismo resultado.
zona 0: conteo=50000, suma=62475000, promedio=1249.50
zona 1: conteo=50000, suma=62825000, promedio=1256.50
zona 2: conteo=50000, suma=63175000, promedio=1263.50
```

Dos cosas que vale la pena notar sobre estos números, más allá del `2.91x`:

- **El speedup no escaló con los 12 hilos disponibles.** Con solo 20 unidades de trabajo (zonas) y 12 hilos, el paralelismo tiene poco margen: la tanda más lenta de zonas asignadas a un hilo domina el tiempo total. Con más zonas (o zonas subdivididas en bboxes más finas), el speedup se acercaría más al número de hilos — este es exactamente el tipo de relación entre granularidad de tarea y paralelismo real que ya viste con `map_init` vs. `par_chunks` en el Capítulo 5.1.
- **La verificación de consistencia (`conteo` y `suma` idénticos entre secuencial y paralelo) no es una formalidad** — es la forma de confirmar que paralelizar no introdujo una condición de carrera o un doble conteo. Tu propio benchmark debe incluir esta misma verificación, no solo los tiempos.

**Estos números son míos, de mi máquina y mi dataset — no los copies como si fueran el resultado esperado.** El criterio de aceptación de este capstone es que produzcas la misma clase de evidencia (secuencial vs. paralelo, con verificación de consistencia, sobre tu propio dataset) con tus propios números.

## Criterio de aceptación

Documentas, con salida real de tu propia ejecución (no una estimación de lo que "debería" pasar):

1. El tiempo de tu agregación zonal completa corriendo **secuencialmente** sobre tu dataset.
2. El mismo cálculo corriendo **en paralelo con Rayon** sobre el mismo dataset.
3. Una verificación explícita de que ambas versiones producen el mismo resultado (mismo conteo total, misma suma total) — el paralelismo que cambia el resultado es un paralelismo con un bug, no una optimización.
4. El número de hilos disponibles en tu máquina (`rayon::current_num_threads()`) y una nota sobre si el speedup obtenido tiene sentido dado ese número y el número de zonas/unidades de trabajo que paralelizaste.

**Sobre TDD (Capítulo 1.3) en este capstone:** no se te da una suite de tests fija como en el Capstone A — el criterio de aceptación aquí es un benchmark, no una afirmación binaria de "pasa o no pasa". Eso no significa que TDD no aplique: la aserción del punto 3 (secuencial y paralelo dan el mismo conteo y la misma suma) es exactamente el tipo de test que deberías escribir *antes* de medir tiempos — si el paralelismo cambia el resultado, ningún número de *benchmark* importa. Escribe ese test de consistencia primero, dejando que falle contra tu implementación incompleta, y solo después preocúpate por cuánto tarda.

## Qué construir tú mismo

- El dataset GeoParquet particionado por zona (Capítulo 5.4), con `set_generate_covering(true)` para habilitar el pushdown.
- La función de agregación por zona, aplicando el filtro exacto que la sección de arriba te advirtió que ibas a necesitar.
- La paralelización con Rayon sobre el conjunto de zonas (Capítulo 5.1).
- El endpoint Axum que expone esto, con respuesta en streaming NDJSON en vez de un `Vec` acumulado y serializado al final (Capítulos 6.1, 6.2) — y un manejo de error explícito para una zona pedida que no existe en el dataset (Capítulo 2.4).
- Un span de `tracing` (Capítulo 6.5) alrededor de la agregación completa, con el número de zonas procesadas como campo estructurado — para que un operador real pueda ver, en producción, cuánto tarda esta operación y sobre cuántos datos.

Si te atoras en un paso específico, la tabla de trazabilidad de arriba te dice en qué capítulo ya lo construiste.
