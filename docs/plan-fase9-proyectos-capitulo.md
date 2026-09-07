# Plan de ejecución — Fase 9: Historias de usuario, casos de uso y proyectos de capítulo

Este documento convierte el pedido del usuario ("más proyectos, con historias de usuario y casos de uso") en un plan ejecutable, con el mismo régimen de aprobación por hito que las Fases 0–8.

**Estado: revisado tras feedback del usuario sobre la arquitectura — pendiente de aprobación final de esta versión.**

## 0. Cómo cambió este plan (léelo antes que el resto)

La primera versión de este plan proponía una sección nueva y autocontenida ("Proyecto del capítulo") al final de cada uno de los 24 capítulos técnicos. El usuario corrigió esto: **las historias de usuario y casos de uso pertenecen a la página del proyecto**, no dispersas en cada capítulo técnico. Y cada módulo **ya tiene un solo proyecto** — el proyecto guiado de cierre (`GeoAPI v0.1` en 2.4, `v0.2` en 3.5, `v0.3` en 4.7, `v0.4` en 5.7, `v1.0` en 6.6).

La arquitectura corregida, confirmada con el usuario:

- **No se crean proyectos nuevos.** Se **enriquecen** los cinco proyectos guiados que ya existen.
- Cada **checkpoint** del proyecto guiado (ya existente, con su código ya escrito y verificado) recibe una **historia de usuario** (y, cuando aporta claridad, un **caso de uso** breve) que explica qué stakeholder de GeoAPI necesita justo lo que ese checkpoint construye. No se reescribe el código ni los resultados verificados de cada checkpoint — se le antepone el marco narrativo que le faltaba.
- Cada capítulo técnico individual (2.1, 2.2, 3.1, etc.) recibe **una referencia corta, de una o dos líneas**, apuntando al checkpoint específico del proyecto de su módulo que usa esa técnica — no una historia completa duplicada ahí.

Leí los cinco proyectos guiados completos para mapear sus checkpoints reales contra los capítulos técnicos de cada módulo (no asumí que la correspondencia sería 1:1 — y en dos casos, no lo es, ver sección 3).

## 1. Plantilla exacta para un checkpoint enriquecido

```markdown
## Checkpoint N — <título ya existente, sin cambios>

**Historia de usuario:** Como <rol>, quiero <capacidad>, para <beneficio>.

**Caso de uso — <nombre>:** *(solo cuando aporta claridad)*
- **Actor(es):** ...
- **Precondición:** ...
- **Flujo principal:** 1. ... 2. ...
- **Resultado esperado:** ...

<contenido técnico del checkpoint, exactamente como ya existe hoy — sin reescribir>
```

Y en el capítulo técnico de origen, una nota corta (no una sección nueva):

```markdown
> Esta técnica es la que usa el Checkpoint N del proyecto GeoAPI vX
> (Capítulo Y.Z) — ver la historia de usuario ahí.
```

## 2. Primer conceptual (sin cambios respecto a la versión anterior)

Sigue siendo una subsección nueva en el Capítulo 1.3 ("Convenciones del libro"), junto a "Formato de los ejercicios", explicando qué es una historia de usuario, qué es un caso de uso, y por qué el libro los usa a partir de aquí. **Confirmado con el usuario**, sin cambios sobre esto.

## 3. Mapeo completo: proyecto → checkpoint → capítulo(s) de origen

### 2.4 — GeoAPI v0.1 (Módulo 1: 2.1–2.3)

| Checkpoint de 2.4 | Capítulo(s) de origen | Escenario propuesto |
|---|---|---|
| Checkpoint 1 — Parsear y validar una fila | 2.1 (ownership/borrowing) | Integrador de sensores GPS: parsear una lectura sin clonar innecesariamente |
| Checkpoint 2 — Procesar el CSV completo sin detenerse | 2.2 (Result/Option) | Flota de drones agrícolas: el sistema no debe caerse por una lectura corrupta entre miles válidas |
| Checkpoint 3 — Longitud total con iteradores | 2.3 (traits/genéricos/iteradores) | (calculando la ruta recorrida — historia ligera, ver nota abajo) |
| Checkpoint 4 — `main()` real | — | Sin historia nueva (es ensamblaje/E-S, no una técnica de 2.1–2.3) |

Sin capítulos huérfanos en este módulo.

### 3.5 — GeoAPI v0.2 (Módulo 2: 3.1–3.4)

| Checkpoint de 3.5 | Capítulo(s) de origen | Escenario propuesto |
|---|---|---|
| Checkpoint 1 — El error de dominio | 3.4 (serialización) | Municipio migrando de un sistema legado: el parser nunca debe entrar en pánico con un GeoJSON ajeno |
| Checkpoint 2 — Deserializar `FeatureCollection` | 3.1 (Simple Features) + 3.4 (serialización) | Catastro municipal recibiendo parcelas por `POST /features` |
| Checkpoint 3 — Funciones puras del dominio | 3.3 (algoritmos core) + 3.2 (CRS, por la nota "asume WGS84") | Agencia de reforma agraria: área real de una finca, no en grados |
| Checkpoint 4 — Serializar de vuelta | 3.4 (serialización) | (cierre del ciclo GeoJSON — historia ligera, comparte la de Checkpoint 1) |

Sin capítulos huérfanos (3.2 se ata a la nota explícita sobre WGS84 del Checkpoint 3, que ya existe en el texto actual).

### 4.7 — GeoAPI v0.3 (Módulo 3: 4.1–4.6)

| Checkpoint de 4.7 | Capítulo(s) de origen | Escenario propuesto |
|---|---|---|
| Checkpoint 1 — `POST /features` | 4.3 (índices) + 4.5 (PostGIS) | Empresa de servicios públicos: registrar un activo urbano (poste, hidrante) |
| Checkpoint 2 — `GET /features/near` | 4.3 (índices) + 4.2 (predicados robustos, por el patrón "pre-filtro + verificación exacta") | Despacho de ambulancias: la unidad disponible más cercana |
| Checkpoint 3 — `GET /features/reproject` | 4.4 (reproyección) | Proyecto de infraestructura vial integrando datasets en distinto CRS |
| Ejercicio integrador — `within-polygon` | 4.1 (DE-9IM/Relate) | Sistema de alerta de inundación: ¿qué parcelas están contenidas en la zona de riesgo? |

**Capítulo huérfano: 4.6 (I/O adicional — gdal/ndarray/shapefile/las).** Ningún checkpoint de 4.7 lo ejercita (el proyecto nunca lee un ráster ni un Shapefile). Propuesta: añadir su historia de usuario (ruta de fibra óptica sobre un DEM) como una **extensión sugerida adicional** dentro del propio "Ejercicio integrador (abierto)" de 4.7, junto a la de `within-polygon` — sin escribir código nuevo verificado, solo la propuesta narrativa y el criterio de éxito, igual que ya hace ese ejercicio con sus otras preguntas abiertas.

### 5.7 — GeoAPI v0.4 (Módulo 4: 5.1–5.6)

| Checkpoint de 5.7 | Capítulo(s) de origen | Escenario propuesto |
|---|---|---|
| `GET /tiles/{z}/{x}/{y}` (PMTiles) | 5.4 (PMTiles/GeoParquet) | Portal de datos abiertos: atlas de teselas sin servidor activo |
| `GET /features/stream?bbox=` (FlatGeobuf) | 5.2 (FlatGeobuf) | Portal de datos abiertos: límites administrativos nacionales sin descarga completa |
| `POST /features/reproject/batch` (Rayon) | 5.1 (Rayon) | Censo nacional: reproyectar millones de puntos en un tiempo razonable |
| Ejercicio integrador — 4º endpoint (COG / GeoParquet / COPC, a elección) | 5.3 (COG) y 5.5 (COPC) | Agencia ambiental (COG, DEM por ventana) o inspección de infraestructura (COPC, LiDAR por nivel de detalle) — el lector elige uno de los dos como parte del ejercicio ya existente |

**Capítulo huérfano: 5.6 (FFI seguro — GEOS).** Igual que 4.6, ningún checkpoint de 5.7 lo usa. Propuesta: mencionarlo como una extensión adicional opcional del mismo "Ejercicio integrador" (validar la geometría de un lote con el wrapper seguro de GEOS antes de aceptar el `batch` de reproyección) — organismo catastral que exige geometrías válidas antes de aceptar un envío.

### 6.6 — GeoAPI v1.0 (Módulo 5: 6.1–6.5)

| Sección de 6.6 | Capítulo(s) de origen | Escenario propuesto |
|---|---|---|
| Marco general del capítulo (nuevo párrafo motivador, no un checkpoint) | 6.1 (Axum vs. Actix + RFC 7807/streaming) | GeoAPI se abre como API pública para desarrolladores externos — el motivo de por qué v1.0 necesita un contrato definitivo |
| Fila "Caché, rate-limit, timeout, tracing" (tabla de inventario) | 6.2 (middleware) | Proteger una API GIS gratuita/freemium de abuso |
| Fila "Teselas MVT + PMTiles" | 6.3 (MVT/Martin) | Dashboard de tránsito urbano en tiempo real para una alcaldía |
| Fila "OGC API Features" | 6.4 (OGC API Features) | Organismo gubernamental exige interoperabilidad estándar (QGIS) |
| Fila "Healthcheck + logs JSON" + sección de CI | 6.5 (observabilidad) | Empresa de logística exige un SLA de disponibilidad antes de integrar GeoAPI |

Sin capítulos huérfanos en este módulo.

**Total de capítulos huérfanos en todo el libro: 2 (4.6 y 5.6)**, ambos resueltos como extensión narrativa del ejercicio integrador ya existente de su módulo, sin código nuevo que verificar.

## 4. Hitos propuestos

Cada hito enriquece **un** proyecto guiado de cierre (más las referencias cortas en sus capítulos de origen), cierra con `mdbook build`/`mdbook test` limpios, actualiza `BACKLOG.md`, commit, push, resumen, y pausa para aprobación del siguiente hito.

- **Hito 9.0** — Primer conceptual en el Capítulo 1.3.
- **Hito 9.1** — Enriquecer 2.4 (checkpoints 1–3) + referencias cortas en 2.1, 2.2, 2.3.
- **Hito 9.2** — Enriquecer 3.5 (checkpoints 1–3) + referencias cortas en 3.1, 3.2, 3.3, 3.4.
- **Hito 9.3** — Enriquecer 4.7 (checkpoints 1–3 + ejercicio integrador, incluyendo la extensión de 4.6) + referencias cortas en 4.1–4.6.
- **Hito 9.4** — Enriquecer 5.7 (los tres endpoints + ejercicio integrador, incluyendo la extensión de 5.6) + referencias cortas en 5.1–5.6.
- **Hito 9.5** — Enriquecer 6.6 (marco general + 4 filas de la tabla de inventario) + referencias cortas en 6.1–6.5.
- **Hito 9.6** — Cierre: revisión de consistencia, build/test final, tabla de fases.

## 5. Qué NO cambia (reforzado tras la corrección de arquitectura)

- **Ningún código ni resultado verificado de los cinco proyectos guiados se reescribe.** Las historias de usuario y casos de uso son marco narrativo *añadido* alrededor de checkpoints que ya existen, ya compilan, y ya están verificados — no se toca una sola línea de código Rust ya publicada.
- No se crean secciones nuevas en los 24 capítulos técnicos individuales — solo una referencia corta (1-2 líneas) por capítulo.
- No se crea ningún apéndice de soluciones nuevo.
- No se renumera nada ni se toca `SUMMARY.md`.
- Los dos capítulos huérfanos (4.6, 5.6) no fuerzan un checkpoint nuevo — se resuelven como extensión narrativa de un ejercicio integrador ya existente, sin código nuevo que verificar.
