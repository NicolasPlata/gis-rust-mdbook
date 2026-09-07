# Parte VI — Módulo 5: Arquitectura de APIs GIS de Producción

El framework web definitivo (Axum), middleware de producción (caché, rate-limiting, CORS, timeouts), contratos estándar de interoperabilidad (MVT, OGC API Features) y observabilidad real. Cierra con GeoAPI v1.0, la plataforma completa.

## Objetivos de aprendizaje

Al terminar este módulo vas a poder:

- Justificar la elección entre Axum y Actix-web con criterios técnicos concretos, no por popularidad.
- Mapear errores de dominio a respuestas HTTP correctas (`IntoResponse`, RFC 7807) en vez de exponer un `500` genérico o un *stack trace*.
- Transmitir resultados de una consulta PostGIS directamente al *body* de una respuesta HTTP, sin acumular todas las filas en memoria primero.
- Configurar middleware de producción con Tower: caché, límites de tasa, CORS y timeouts, entendiendo qué protege cada uno.
- Servir teselas vectoriales (MVT) y features (OGC API Features) con contratos estándar que un cliente GIS real (QGIS, un navegador) puede consumir sin adaptadores custom.
- Instrumentar un servicio con observabilidad real (logs estructurados, healthchecks) y dejarlo listo para desplegarse.

## Contexto: GeoAPI en este módulo

GeoAPI entra a este módulo como una plataforma de streaming cloud-native (v0.4) y sale como la versión que un equipo de operaciones aceptaría desplegar (v1.0):

```text
cliente
   │
   v
[ CORS | rate-limit | caché | timeout ]     <- middleware Tower, 6.2
   │
   v
Axum Router                                  <- 6.1
   │
   ├──> IntoResponse (errores -> HTTP)       <- 6.1
   ├──> stream PostGIS -> body HTTP          <- 6.1
   ├──> MVT / TileJSON                        <- 6.3
   └──> OGC API Features                      <- 6.4
   │
   v
tracing + healthz                            <- 6.5
```

## Prerrequisitos

El servidor cloud-native v0.4 completo (Módulo 4) y, en particular, el `Result`/manejo de errores del Módulo 1 (2.4) — este módulo lo lleva a su conclusión lógica: qué le devuelves exactamente a un cliente HTTP cuando algo falla.

## Capítulos de este módulo

- **6.1** Axum vs. Actix-web — decisión arquitectónica
- **6.2** Middleware con Tower — caché, rate-limiting, timeouts
- **6.3** Contratos MVT y el patrón Martin
- **6.4** OGC API Features / WFS / WMS — interoperabilidad
- **6.5** Observabilidad, resiliencia y despliegue
- **6.6** Proyecto guiado de cierre — GeoAPI v1.0
