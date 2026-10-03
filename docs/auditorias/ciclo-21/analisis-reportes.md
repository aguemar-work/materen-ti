# Análisis de reportes — qué mide hoy el sistema y qué debería medir

**Fecha:** 2026-10-03. **Rama analizada:** `mejora/h1-estabilizar` (worktree `sistema-ti-mejora`), solo lectura. **Producción:** consultada únicamente con SELECT de catálogo y conteos agregados (sin filas con nombres, DNI ni contactos). **Encargo:** análisis previo al rediseño de reportes para que la implementación no tenga redundancias, información falsa ni información incompleta.

Convenciones: **[V]** = verificado leyendo el código/SQL citado o con la consulta indicada; **[I]** = inferido (razonable, sin prueba directa). Las rutas son relativas a la raíz del repo; `migrations/NNN` es el archivo de esa migración.

## 0. Estado real del backend (lo que condiciona todo)

| Hecho | Evidencia | Marca |
|---|---|---|
| `schema_migrations` registra hasta la **085**; sin embargo existen en producción objetos de 103, 106, 107, 108, 110, 112 (`config_parametros`, `v_kpi_kb`, `v_kpi_cambios`, `solicitudes`, `v_actas_pendientes`, `v_empleados_anonimizables`, `dashboard_resumen`). Hay drift de registro, no de esquema. | `select version from schema_migrations order by 1` (84 filas, última 085); `select relname from pg_class where relnamespace='public'::regnamespace and (relname like 'v\_%' or relname in (...))` | [V] |
| **`tickets.resuelto_at` NO existe en producción**: la 089 no está aplicada. Columnas reales: id, codigo, token, titulo, descripcion, origen, empleado_id, vinculado, contacto_ingresado, creado_por, categoria_id, subcategoria_id, equipo_id, cuenta_id, licencia_id, estado, prioridad, asignado_a, adjunto_url, adjunto_key, created_at, updated_at, nivel_atencion, tipo. **No hay `deleted_at`** en tickets. | `information_schema.columns where table_name='tickets'` | [V] |
| **No existen `estado_tiempo_ticket` ni `horario_laboral`** (105 de V2) ni ninguna lógica de horas laborables en el frontend. | consulta a `pg_proc`/`pg_class`; `grep -rniE "laborab|habil|horario" frontend/src` solo encuentra `servicios.horario` (texto libre) | [V] |
| Las RPC `reporte_tickets`, `reporte_tickets_resumen` y `reporte_satisfaccion_consolidado` existen con gate de módulo (086) y la primera conserva el bloque `backlog`. | `pg_proc.prosrc` contiene `tiene_permiso_modulo` y `backlog` | [V] |
| Volumen: 297 tickets desde 2026-07-14 (288 cerrados, 8 rechazados, 1 en progreso con 80 días, 0 abiertos, 0 en "resuelto"); ≈100–120 tickets/mes (sep: 122; oct al día 3: 10); 8 staff activos; 100 empleados (82 activos). | conteos agregados sobre `tickets`, `staff`, `empleados` | [V] |
| Eventos: `estado_cambiado` 901, `creado` 296, `reasignado` 294, `nivel_atencion_cambiado` 289, `encuesta_respondida` 255, `tipo_cambiado` 140, `prioridad_cambiada` 86, `correo_fallido` 9. No existe evento `asignado` ni de comentario. 10 reaperturas; 1 resolución sin `user_id`; 0 cerrados sin evento "resuelto"; 0 detalles no parseables. | `ticket_eventos` agrupado por `evento` y por `substring(detalle from 'a "(\w+)"\s*$')` | [V] |
| Satisfacción: 275 encuestas, 255 respondidas (93 %), todas con nivel, 81 con comentario; 13 tickets cerrados sin encuesta (10 sin `empleado_id`). | conteos sobre `ticket_satisfaccion`, `tickets` | [V] |
| Datos para dimensiones: subcategoría 273/297, nivel 289/297, tipo 292/297, `equipo_id` 0/297, `origen='interno'` 0; empleados con área 42/100 y con ubicación 36/100. Encuestas anónimas: 1 plantilla, 0 rondas. Problemas: 1; `problema_tickets` 0; `v_categorias_recurrentes` 5 filas. KB: 7 artículos, 0 usos. Cambios 0. Solicitudes 0. | conteos agregados | [V] |
| Tiempo de resolución histórico en horas corridas: promedio 36,4 h, **mediana 1,2 h**; 35 de 288 resoluciones y 32 creaciones cayeron en sábado o domingo (hora de Lima). | consulta con `percentile_cont` y `extract(dow ...)` | [V] |

## 1. Inventario de lo que hoy "reporta" el sistema

### 1.1 Modal "Reporte de tickets" (`ReporteTicketsModal.vue` + `api/domains/reportesTickets.js` + `reporte.js` PDF)

Quién lo ve: cualquier staff con módulo `tickets` (`TicketsView.vue:447`, ruta con `meta.modulo: 'tickets'`). Período: día / semana (lunes a domingo) / mes de calendario, en hora **del navegador** (`reportePeriodo.js:30-34,68-79`), convertido a UTC con `toISOString()` (`ReporteTicketsModal.vue:201`). Cálculo: **en el cliente**, con 4 consultas sin `.limit()` (`reportesTickets.js:64-83`) más lotes de 30 ids (`:34`). Todo [V].

| Métrica mostrada | Fórmula real | Fuente | Observación |
|---|---|---|---|
| Creados | `count(tickets.created_at ∈ [desde,hasta])` | `tickets` | incluye rechazados y sin vincular |
| Resueltos | tickets con ≥1 evento `estado_cambiado` cuyo destino es `"resuelto"` dentro del período; cuenta una vez por ticket (`:116-119,309-323`) | `ticket_eventos` | NO usa `estado` actual; un ticket resuelto en dos meses distintos cuenta en ambos |
| "de hoy / anteriores" | resueltos ∩ creados en el período vs resto (`:128-132`) | derivado | |
| Satisfacción (x/5) | `avg(nivel)` de encuestas con `created_at` de la **encuesta** en el período y `fecha_envio` no nulo (`:164-169`) | `ticket_satisfaccion` | sin muestra mínima; se muestra con 1 decimal aunque n=1 (`ReporteTicketsModal.vue:472`) |
| Tasa de respuesta (opcional, oculta por defecto) | respondidas / generadas del período (`:131-134`, `incluirTasaRespuesta=false` en `:139`) | idem | el comentario de `:136-138` dice que "sin correo la tasa no es comparable"; en producción es 93 % |
| Variación vs. período anterior | `obtenerResumenTickets` del período equivalente anterior, solo semanal/mensual y alcance "equipo" (`:198-204`) | mismo cálculo liviano (`reportesTickets.js:204-241`) | se calcula aunque el período actual esté "en curso" |
| Por categoría / prioridad / tipo | `contarPor(creados)` (`:181-183`) | `tickets` | |
| Por día (solo PDF) | agrupa `created_at` por fecha **local del navegador** (`:449-460`) | `tickets` | la RPC 053 agrupa en `America/Lima` |
| Tiempo medio / mediana de resolución | horas corridas `evento_resuelto.created_at − ticket.created_at`, descarta negativos (`:364-385`); formato `formatHoras` (`core/formatters.js:130-137`) | eventos + tickets | incluye fines de semana, noches y tiempo sin asignar |
| Tasa de reapertura | `eventos "reabierto" del período / resueltos del período` (`:192`) | eventos | numerador y denominador no son el mismo conjunto de tickets |
| Desempeño por técnico | atribuido a `user_id` del **último** evento "resuelto" (`:333-343`); tiempos por el mismo criterio | eventos | `asignado_a` actual se ignora acá, pero el alcance "Solo mi actividad" filtra por `asignado_a` actual (`:93-112`) |
| Arrastrados | resueltos no creados en el período, con `floor(días)` abiertos (`:348-359`) | derivado | |
| Por solicitante: Histórico / Creados / Resueltos / Rechazados / Encuestas | "Histórico" = **toda la tabla `tickets`** agrupada por nombre (`:82,415-422`); Resueltos = `estado` ACTUAL ∈ {resuelto, cerrado} de los creados en el período (`:436`) | `tickets` + encuestas por ticket | tercera definición de "resuelto" dentro del mismo informe |
| Comentarios | 20 más recientes del período, total aparte (`:28,197-198`) | `ticket_satisfaccion` | |
| Exportaciones | "CSV del periodo" (`listarTicketsDelPeriodo`, sin límite, `:245-269`), "CSV de la bandeja" (`listTicketsFiltrados`, sin límite, `api/domains/tickets.js:166-170`), PDF jsPDF (`reporte.js`) | | la cabecera CSV es única (`core/exportar-tickets.js:25-28`) |

### 1.2 RPC de la migración 053 (`reporte_tickets`, `reporte_tickets_resumen`) — **sin consumidor**

Replican 1.1 en SQL (`migrations/053:55-350`), con guard de módulo desde 086 (`migrations/086:186-196`). Diferencias respecto del cliente actual [V]: agrupan `porDia` en Lima (`053:172`); devuelven `backlog` por tramos (`053:194-225`) que el frontend retiró el 2026-08-16 (`docs/CHANGELOG.md` ≈ L2663-2673); `porSolicitante` incluye `sinResolver`; `porPrioridad` etiqueta `'Sin definir'` donde el cliente usa la clave `sin_definir`; no reciben `asignadoA`. Hallazgo abierto `REPORTE-TICKETS-RPC-MUERTOS` (`docs/HISTORIAL-AUDITORIAS.md` L679) y T-04 (L85). Solo las invoca un smoke test de autorización.

### 1.3 Satisfacción histórica (`ReporteSatisfaccionView.vue` + RPC `reporte_satisfaccion_consolidado` + `reporteSatisfaccion.js`)

Quién: módulo `tickets` (`router/routes/tickets.routes.js:19-22`). Período: **histórico completo, sin recorte** (`053:360-454`). Servidor: la RPC devuelve TODAS las respuestas como jsonb y los agregados por solicitante (por `empleado_id`) y por técnico (último resolutor de toda la historia). Cliente: KPIs generales recalculados sobre el arreglo (`ReporteSatisfaccionView.vue:78-85`), tasa de respuesta (`:177-180`), "Insatisfechas" = nivel ≤ 3 (`:53-55`, decisión 2026-08-19), desglose 1–5 por grupo (`:93-120`), umbral `MIN_MUESTRA_PROMEDIO = 3` solo para atenuar el promedio por grupo (`reportesTickets.js:328`; `:298,330`), nunca para el promedio general. PDF recortado a 40 / 60 filas con nota (`:125-126`). Todo [V].

### 1.4 Reporte de inventario de equipos (`modules/equipos/reporteEquipos.js`, botón en `EquiposView.vue:160`)

Foto actual de todo el parque (sin período), calculada en cliente sobre `listEquiposFiltrados({})`: total, asignados (= `asignado` + `en_ubicacion`, decisión 2026-08-22, `reporteEquipos.js:47-53,70`), disponibles, en reparación, de baja, perdidos, antigüedad promedio solo de los que tienen `fecha_compra` sin decir cuántos (`:40-45`), por tipo, **garantías a 90 días** (`DIAS_VENTANA_GARANTIA = 90`, `:19`) y últimos 20 movimientos. [V]

### 1.5 Inicio (`dashboard_resumen()`, migraciones 103 y 108; `modules/dashboard/**`)

Una RPC `SECURITY DEFINER` con gate por módulo y umbrales de `config_parametros` (13 claves en producción). Secciones [V]: `kpis` (`103:574-593`; hoy no se muestran: `DashboardView.vue` no los lee), `tickets.sin_asignar / sin_vincular / viejos` (creado antes de hoy − `dias_ticket_viejo`=3 días **corridos**, `103:624-629`), `mios`, `rotaciones_pendientes`, `cuentas_sin_password`, `equipos_sin_devolver` (fecha de baja **aproximada con `empleados.updated_at`**, `103:764-777`), `licencias_por_vencer` (incluye vencidas, 30 días), `garantias_por_vencer` (30 días), `altas_incompletas` (108: derivadas de solicitudes), `problemas.acciones_vencidas`, `problemas.recurrentes` (lee `v_categorias_recurrentes`), `encuestas_sin_responder`, `custodia_hoy`, `actas_pendientes`, `solicitudes_abiertas`. El cliente solo ordena y agrupa (`pendientesFeed.js`), con tiers de urgencia decididos en cliente (`:14-25`). Los métodos `getEstadisticas`, `listPendientes`, `pendientesTickets`, `misTickets` de `api/domains/dashboard.js` quedaron **muertos** (`dashboard.js:4-9`).

### 1.6 Vistas SQL `security_invoker` y sus consumidores

| Vista | Define | Consumidor en frontend | Marca |
|---|---|---|---|
| `v_licencias_cupo` (103:393-428) | usados/libres por licencia, réplica de `mapLicencia()` | **ninguno** (`grep -rn v_licencias_cupo frontend/src` → 0) | [V] |
| `v_categorias_recurrentes` (103:448-481) | categorías con ≥ n tickets (cualquier estado, incl. rechazados) en `dias` días (Lima) sin problema vinculado; n/dias de `config_parametros` | `dashboard_resumen` (103:897-904). El módulo Problemas sigue con **su propia copia en cliente** `listCategoriasRecurrentes({dias=30, minimo=3})` (`api/domains/problemas.js:247-272`) con literales | [V] |
| `v_kpi_kb` (106:576-590) | por artículo: `usos_90d`, `usos_total`, `ultimo_uso_at`, `util_si/no` | solo por artículo (`kb.js:202-215`, `KbArticuloVinculos.vue:37`); no hay agregado "% de resoluciones con artículo" | [V] |
| `v_kpi_cambios` (107:1261-1289) | últimos 90 días por tipo: total, ejecutados, implementados, revertidos, % | `CambiosView.vue:111-116,156` (`CambiosResumen`) | [V] |
| `v_cambios_aprobacion_vencida` (107:1238-1251) | emergencias sin aprobar con plazo vencido | idem | [V] |
| `v_actas_pendientes` (110:367-396) | entregas sin acta de entrega adjunta, > `dias_acta_sin_adjuntar` días corridos y desde `actas_pendientes_desde` | `dashboard_resumen` (103:857-868) | [V] |
| `v_empleados_anonimizables` (112:751-763) | inactivos con baja ≥ 5 años (solo JEFE) | **ninguno** en `frontend/src` | [V] |
| `v_empleado_ultima_revision_acceso` (102:1155-1165) | última revisión por empleado | `empleados.js:342` (ficha) | [V] |

### 1.7 Encuestas anónimas (`modules/encuestas/**`)

Rondas con `n_respuestas` contadas en cliente (`api/domains/encuestas.js:76-95`); resúmenes por pregunta y porcentajes sobre `respuestas.length` (`EncuestaDetalleView.vue:117-141`). No existe denominador de destinatarios: **no se puede calcular tasa de respuesta** y nada la muestra. 0 rondas en producción. Sistema distinto de `ticket_satisfaccion` (hallazgo A-07 abierto, `HISTORIAL-AUDITORIAS.md` L107). [V]

## 2. Redundancias: la misma métrica en más de un lugar

| Métrica | Lugar A | Lugar B | ¿Coinciden? |
|---|---|---|---|
| "Resueltos" | Modal KPI: eventos "resuelto" del período (`reportesTickets.js:116`) | Modal tabla por solicitante: `estado` actual ∈ {resuelto, cerrado} (`:436`) | **No**: un ticket creado en el período y resuelto en el siguiente cuenta en B y no en A; uno reabierto después no cuenta en B | 
| "Resueltos" | Modal (eventos) | RPC 053 `reporte_tickets` (eventos, mismo regex) | Sí en fórmula; la RPC agrega `backlog`/`sinResolver` y no filtra por técnico [V] |
| "Vigentes / abiertos" | `dashboard_resumen.kpis.tickets_abiertos` = `estado not in (resuelto, cerrado, rechazado)` (103:591-592) | `ESTADOS_VIGENTES` cliente (`dominio-tickets.js:104`) y `queryTickets` | Sí (documentado en anexo E §… como repetido ≥ 4 veces) [V] |
| Recurrencia de categorías | `v_categorias_recurrentes` (parámetros en BD, Lima) | `problemas.js:247-272` (literales 30/3, hora del navegador, `created_at >= fechaHaceDias`) | **Divergen** en zona horaria y en que un cambio de `umbral_recurrencia_tickets` solo afecta al Inicio, no a Problemas [V] |
| Satisfacción promedio | Modal: del período, sin muestra mínima | Vista Satisfacción: histórica, muestra mínima solo por grupo; RPC `reporte_satisfaccion_consolidado` | Fórmula igual (`avg(nivel)` con `fecha_envio`); **recortes y umbrales distintos** [V] |
| Tasa de respuesta | Modal (opcional), `reporte.js:101-103`, `ReporteSatisfaccionView.vue:177-180`, `reporteSatisfaccion.js:101-103`, RPC `reporte_tickets_resumen` | 5 copias de `round(resp/gen*100)` | Sí; 5 implementaciones [V] |
| Técnico de un ticket | Reportes: último resolutor por evento | Alcance "Solo mi actividad" y CSV: `asignado_a` actual (`reportesTickets.js:110`, `exportar-tickets.js:46`) | **No** cuando hubo reasignación (294 eventos `reasignado` en 297 tickets) [V] |
| Garantías por vencer | Inicio: `dias_por_vencer_garantia` = 30 (config) | PDF de equipos: 90 días fijos (`reporteEquipos.js:19`) | **No** [V] |
| Cupo de licencias | `v_licencias_cupo` | `mapLicencia()` en `api/domains/licencias.js` (103:68-71 lo documenta como réplica) | Igual hoy; dos fuentes [V] |
| Días transcurridos | Servidor en Lima (103, 110) | `tiempoLima.js` en Lima; `reportePeriodo.js`/`contarPorDia` en hora del navegador | Inicio coherente; **reportes no** [V] |
| KPIs del Inicio | `kpis` de la RPC | `getEstadisticas()` cliente (muerto) | Código duplicado sin uso [V] |

## 3. Información falsa o engañosa (hoy)

1. **"Resuelto dd/mm" en el listado de Tickets es `updated_at`, no la resolución.** Como la 089 no está aplicada, `api/domains/tickets.js:264-270` detecta el `42703` y `:373` rellena `resuelto_at` con `updated_at` para todo resuelto/cerrado. Cualquier edición posterior (reasignar, cambiar nivel, cerrar desde "resuelto", el `UPDATE` de la 112) mueve la fecha. [V]
2. **Tiempos en horas corridas presentados como "tiempo de resolución".** No hay horario laboral ni reloj (105 ausente). El promedio histórico (36,4 h) está 30 veces por encima de la mediana (1,2 h): un ticket olvidado un fin de semana pesa como 60 h. El modal pone el promedio primero y en la tabla por técnico (`reporte.js:156-157,178`). Además el tiempo corre desde `created_at`, antes de la asignación, y se atribuye al último resolutor. [V]
3. **"Resueltos" mezcla tres definiciones** (§2) y la de eventos permite contar el mismo ticket en dos períodos; un reporte mensual que sume "Resueltos" de los 12 meses dará más que los tickets resueltos del año. [V]
4. **Tasa de reapertura puede superar el 100 % y cuenta reaperturas de rechazados.** Numerador = eventos "reabierto" del período (incluye tickets resueltos en períodos anteriores y la transición `rechazado → reabierto`, permitida en `050:39`); denominador = resueltos del período. En diario, con 1 resuelto y 2 reaperturas se muestra 200 %. [V]
5. **Satisfacción con muestras mínimas.** El modal muestra "5,0/5" y un delta "+1,2 vs. anterior" sobre n=1 (`ReporteTicketsModal.vue:472-473`); `MIN_MUESTRA_PROMEDIO` solo atenúa el color por grupo en la vista histórica. A ≈100 tickets/mes y 8 técnicos, un reporte diario o por técnico rara vez supera 10 respuestas. [V]
6. **Tasa de respuesta con denominador sesgado y motivo desactualizado.** Solo generan encuesta los tickets que pasan a `cerrado` con `empleado_id` (`016:369-374`): 13 cerrados no la tienen, y un ticket en "resuelto" nunca cerrado tampoco. El modal la oculta por defecto porque "sin correo no es comparable" (`:136-139`); la tasa real es 93 %, así que la razón ya no describe la realidad. [V]
7. **Comparativa contra un período incompleto.** Se calcula y se imprime el delta aunque el período actual esté "en curso" (`:198-207`; el aviso de `reporte.js:118-125` va aparte) y aunque el anterior sea parcial (julio de 2026 empieza el 14). "Octubre: −112 creados vs. septiembre" al día 3 es verdadero y engañoso. [V]
8. **"Histórico" por solicitante agrupa por nombre completo** sobre toda la tabla (`reportesTickets.js:82,415-422`): homónimos se suman; los 11 sin vincular y los que no tienen `empleado_id` caen en "Sin vincular"; tras la 112 los anonimizados colapsarán en una sola fila. [V]/[I para anonimizados]
9. **Zona horaria.** El corte del período y "por día" dependen del navegador; la RPC usa Lima. Hoy no hay tickets creados entre las 19:00 y las 24:00 de Lima (0 cruzan el día UTC), por lo que no se manifiesta; con un staff fuera de Perú o un reloj mal puesto sí. [V]
10. **Sin cota de filas.** Las 4 consultas del modal (`:64-83`) y las dos exportaciones CSV (`:245-251`; `tickets.js:166-170`) no paginan ni limitan. El modal sí lee TODOS los tickets del período (no una página). La consulta `todosRes` lee toda la tabla y a ≈100 tickets/mes supera las 1000 filas hacia mediados de 2027; si el gateway aplica el tope de PostgREST por defecto, "Histórico" quedará silenciosamente truncado (T-04 abierto). [V en código; I el tope del gateway, no documentado en el repo]
11. **Rechazados y duplicados.** No existe el concepto "duplicado" en el esquema (grep en `migrations/` sin resultados). Los rechazados se excluyen de "Resueltos" (correcto) pero entran en Creados, en todas las distribuciones y en la recurrencia (`v_categorias_recurrentes`: "cualquier estado"), y la etiqueta de UI colapsa `cerrado` como "Resuelto" (`dominio-tickets.js:24`). [V]
12. **Inicio: "baja el dd/mm" en equipos sin devolver es `empleados.updated_at`** (103:764-777 lo declara aproximación). La 102 ya está en producción con `empleado_eventos`, así que hay una fuente correcta disponible y no se usa. [V]
13. **Días corridos en todos los umbrales del Inicio** (`dias_ticket_viejo`=3, actas=3): un ticket del viernes es "abierto hace tiempo" el martes. Decisión de producto, no error, pero conviene nombrarlo como "días corridos". [V]
14. **`v_kpi_cambios` devuelve tres filas con ceros** a quien no tiene el módulo o cuando no hay datos (107:1253-1256): "0 cambios" se lee como dato cuando puede ser "sin permiso". [V]
15. **Dos fuentes para recurrencia** (§2): el umbral editable por JEFE no gobierna la pantalla de Problemas. [V]

## 4. Información incompleta: lo que un jefe de TI esperaría y no está

| Métrica esperada | ¿Existe hoy? | Qué columna/tabla ya lo permite | Qué falta |
|---|---|---|---|
| Backlog por antigüedad (vigentes por tramo, el más viejo) | Solo en la RPC 053 muerta (`053:194-225`); retirado del cliente en ago-2026 | `tickets.created_at`, `estado` | nada: hoy 1 vigente de 80 días |
| Tiempo a primera respuesta | No | `ticket_comentarios(ticket_id, autor_id, interno=false, created_at)` (555 comentarios, 554 de staff, 258 tickets con respuesta); alternativa: primer `estado_cambiado` a `en_progreso` | definir qué cuenta como respuesta; horas laborables (105) |
| Tiempo hasta la asignación | No | primer `ticket_eventos.evento='reasignado'` por ticket (294 eventos; no hay evento `asignado`) [V]; verificar que `reasignado` se emita también en la primera asignación [I] | documentar el evento |
| FCR / resuelto sin reasignar ni reabrir | No | `reasignado` (contar > 1 por ticket), `reabierto`, resolutor | "cerrado por el usuario" exige doble cierre (V2 D2) |
| Cumplimiento del tiempo objetivo por prioridad | No | — | 105 (`tiempo_objetivo`, `vencido_al_resolver`) |
| Reaperturas por quién (usuario vs. jefe) y motivo | No | `ticket_eventos.user_id` null ≈ portal [I] | `rol_actor`/motivo (V2) |
| Por técnico (volumen, tiempos, CSAT) | Parcial (modal) | `user_id` del evento, `asignado_a`, `ticket_satisfaccion` | una sola regla de atribución (§5) |
| Por área/obra y por ubicación | No | `empleados.area_obra_id` (42/100), `ubicacion_id` (36/100) vía `tickets.empleado_id` (13 nulos) | completar datos maestros; decidir si el área se congela en el ticket |
| Por categoría/subcategoría, nivel N1–N3, tipo | Parcial (sin subcategoría ni nivel) | `subcategoria_id` 273/297, `nivel_atencion` 289/297, `tipo` 292/297 | nada |
| Por equipo afectado | No | `tickets.equipo_id` (0/297 cargado) | adopción del campo |
| Equipos sin devolver (con fecha real de baja) | Inicio, fecha aproximada | `asignaciones_equipo.fecha_fin is null` + `empleado_eventos` (102) | reemplazar `updated_at` |
| Rotaciones pendientes con antigüedad | Inicio sin fecha (`pendientesFeed.js:23-25`) | `cuentas.requiere_rotacion`, `last_password_change`, `accesos_log` | columna `requiere_rotacion_desde` o derivar del log |
| Solicitudes abiertas y tiempo de trámite | Inicio (abiertas); sin tiempos | `solicitudes.created_at`, `completada_at`, `solicitud_pasos` (108; 0 filas aún) | `v_kpi_solicitudes` |
| Cambios por tipo / emergencias / revertidos | Sí, 90 días fijos | `v_kpi_cambios` (0 cambios) | ventana por período |
| Uso de la KB (% de resoluciones con artículo) | Solo por artículo | `ticket_kb_usos` (0), `kb_feedback` | agregado por período |
| CSAT por técnico y período con n | Histórico sin período; período sin técnico | `ticket_satisfaccion` + resolutor | una vista con n junto a cada promedio |
| Encuestas anónimas: tasa de respuesta | Imposible | — | denominador de destinatarios (decisión) |
| Quién generó el reporte, con qué definiciones | No (PDF solo lleva fecha, `reporte.js:250`) | — | carátula y versión de definiciones |

## 5. Modelo objetivo propuesto (sin implementar)

**Principio:** una métrica = una definición escrita = una consulta en Postgres. Ningún promedio, tasa ni "resuelto" se calcula en el cliente; el cliente solo da formato (coherente con el plan, §8 "Medición" de `PLAN-DE-MEJORA.md` L592-611 y V2 F5).

### 5.1 Glosario (definiciones a fijar antes de escribir SQL)

| Término | Definición propuesta | Nota |
|---|---|---|
| Creado en el período | `created_at` del ticket dentro de [desde, hasta] en hora de Lima | el rango lo arma el servidor a partir de fechas `date`, no el navegador |
| Resuelto en el período | `resuelto_at` (089) dentro del período, **estado actual** ∈ {resuelto, cerrado}; un ticket cuenta en un solo período (el de su resolución vigente) | elimina la doble cuenta; requiere aplicar 089 con su backfill |
| Rechazado | `estado = 'rechazado'`; fuera de resueltos y de todo tiempo; se informa aparte | hoy ya es así en "Resueltos", no en distribuciones |
| Duplicado | no existe; hasta V2 se trata como rechazado con motivo | decisión |
| Reabierto | evento `reabierto` cuyo origen era `cerrado` (no `rechazado`), atribuido al período del evento; tasa = tickets reabiertos / tickets resueltos **del mismo conjunto** (resueltos del período que luego se reabrieron, con corte a N días) | decisión del corte N |
| Técnico de un ticket | quien lo marcó resuelto (evento); si se informa carga de trabajo, `asignado_a` al cierre del período, siempre rotulado | una sola palabra por columna: "Resolvió" / "Asignado" |
| Tiempo de resolución | `resuelto_at − created_at` en horas **corridas** hasta que exista 105; **mediana primero**, promedio después, siempre con n; "a tiempo" no se calcula hasta 105 | decisión |
| Primera respuesta | primer `ticket_comentarios` con `interno=false` de un staff | decisión |
| CSAT | `avg(nivel)` de encuestas respondidas cuyo ticket se resolvió en el período; se publica solo con n ≥ muestra mínima (parámetro `csat_muestra_minima` en `config_parametros`), si no "n insuficiente (k)" | decisión del mínimo (propuesta: 5) |
| Tasa de respuesta | respondidas / generadas, generadas = tickets cerrados con solicitante identificado; se informa también "cerrados sin encuesta" | |
| Backlog | vigentes al cierre del período (no "ahora") por tramos 0-3 / 4-7 / 8-30 / >30 días corridos | para un período pasado se reconstruye con eventos o se guarda una foto diaria (decisión) |
| Período comparable | solo períodos completos; el período en curso nunca lleva delta | |

### 5.2 Capa de datos (SQL)

1. **Aplicar la 089** (`resuelto_at` + backfill desde eventos) y registrar en `schema_migrations` lo ya aplicado (086–112) para cerrar el drift de registro.
2. **Vista base `v_ticket_hechos`** (`security_invoker`): una fila por ticket con `created_at`, `resuelto_at`, `estado`, `rechazado`, `tecnico_resolvio_id`, `asignado_a`, `primera_respuesta_at`, `n_reasignaciones`, `n_reaperturas`, `categoria/subcategoria/nivel/tipo/prioridad`, `empleado_id`, `area_obra_id`, `ubicacion_id` (del empleado hoy; decidir congelar), `encuesta_nivel`, `encuesta_respondida`. Es la única lectura de `ticket_eventos` con regex.
3. **Vistas agregadas** sobre ella: `v_kpi_volumen`, `v_kpi_tiempos`, `v_kpi_reaperturas`, `v_kpi_csat`, `v_backlog_tramos` (nombres del plan §8). Cada promedio viaja con `n`.
4. **RPC `reporte_tickets(p_desde date, p_hasta date, p_tecnico uuid default null)`** → jsonb, `SECURITY DEFINER`, guard `puede_actual('modulo:tickets')` con `42501`, que compone las vistas y agrega `generado_en`, `generado_por`, `definiciones_version`, `periodo_completo boolean`. Reemplaza (y se sobreescribe sobre) la 053; `reporte_tickets_resumen` desaparece (la comparativa es la misma RPC con el período anterior). `reporte_satisfaccion_consolidado` pasa a leer `v_kpi_csat`.
5. **Recurrencia y cupo:** Problemas consume `v_categorias_recurrentes`; Licencias consume `v_licencias_cupo` o la vista se elimina. `equipos_sin_devolver` usa `empleado_eventos`.
6. Umbral del PDF de equipos sale de `dias_por_vencer_garantia`.

### 5.3 Un solo módulo Reportes

- Ruta `/reportes` (permiso `modulo:tickets`; "por técnico" visible para todo staff: decisión). Selector de período servidor-side (día/semana/mes/rango), alcance equipo o técnico.
- **Hoja imprimible por período** con el patrón Expediente (regla 23 del plan, `styles/impresion.css`): carátula (período, alcance, generado por, fecha, versión de definiciones, "período en curso" como sello), secciones en tablas: 1 Volumen (creados, resueltos, rechazados, backlog al cierre), 2 Atención (primera respuesta, mediana y promedio con n, por prioridad), 3 Calidad (reaperturas, CSAT con n, comentarios bajos), 4 Por técnico (resolvió / asignado, n, mediana, CSAT), 5 Por categoría y por área, 6 Anexos (arrastrados, cerrados sin encuesta). Sin donas ni KPIs decorativos; pie con las definiciones del glosario en una línea cada una.
- "Imprimir / Guardar PDF" es la misma hoja (`window.print()`); jsPDF queda solo si el dueño exige descarga directa sin diálogo (hoy el motivo documentado en `reporte.js:1-7`).
- CSV: una sola exportación del mismo jsonb (filas de `v_ticket_hechos` del período, con DNI enmascarado según plan §3.10). "CSV de la bandeja" vuelve a la toolbar de Tickets.
- La vista Satisfacción se conserva como histórico pero lee `v_kpi_csat` y aplica la misma muestra mínima a todos sus promedios.

### 5.4 Qué se retira

`ReporteTicketsModal.vue`, `reporte.js`, `reportePeriodo.js` (la aritmética pasa al servidor), el cálculo de `api/domains/reportesTickets.js:61-241`, `getEstadisticas/listPendientes/pendientesTickets/misTickets` de `dashboard.js`, `listCategoriasRecurrentes` en cliente, el toggle "Incluir tasa de respuesta", la comparativa automática sobre períodos en curso, la columna "Histórico" y las 4 copias extra de la tasa de respuesta.

### 5.5 Decisiones que debe tomar el dueño

1. Muestra mínima de CSAT para publicar un promedio (propuesta 5) y si se guarda en `config_parametros`.
2. Si "resuelto" se define por `resuelto_at` (requiere aplicar 089) y si un ticket reabierto y vuelto a resolver cuenta en el período de la última resolución.
3. Tratamiento de rechazados (aparte, nunca en tiempos) y si existe "duplicado" antes de V2.
4. Horas corridas, rotuladas como tales, hasta la 105; o esperar la 105 para publicar tiempos.
5. Atribución por técnico: resolutor (propuesta) vs. asignado; si el reporte por técnico lo ve todo el staff o solo JEFE.
6. Corte para contar reaperturas (p. ej. 30 días tras la resolución).
7. Si el área/obra se congela en el ticket al crearlo (columna nueva) o se lee del empleado actual.
8. Backlog histórico: foto diaria (tabla) o reconstrucción por eventos.
9. Impresión nativa vs. jsPDF; y si se mantiene la descarga directa.
10. Si "Insatisfecho" sigue incluyendo el nivel 3.
11. Qué hacer con las vistas sin consumidor (`v_licencias_cupo`, `v_empleados_anonimizables`) y con la RPC 053.
12. Retención de los datos que alimentan tiempos (`ticket_eventos`, `ticket_comentarios`) frente a la 112.

## 6. Riesgos de la implementación y orden sugerido

**Riesgos**

- Drift: migraciones aplicadas sin registro (086–112 salvo 089) y una no aplicada (089) que el frontend ya espera con fallback engañoso (§3.1). Toda cifra nueva debe nacer después de alinear `schema_migrations` con la realidad.
- Comparabilidad: cambiar la definición de "resuelto" cambia los números de meses pasados; versionar las definiciones en el jsonb y en la carátula, y publicar una nota de corte.
- Muestras pequeñas: ≈100 tickets/mes, 8 técnicos; cualquier desglose por técnico y día es ruido. La muestra mínima y la mediana no son opcionales.
- Horas corridas: publicar tiempos sin la 105 es publicar algo que se va a corregir; mitigar con rótulo explícito y mediana.
- Tope de filas del gateway (no documentado): la nueva RPC lo elimina para el reporte; el CSV debe paginar en servidor o exportarse desde la RPC.
- Datos personales: el reporte lleva nombres de solicitantes; aplicar la regla de DNI enmascarado y revisar qué se imprime en "comentarios".
- Permisos: la RPC nueva mantiene el gate de módulo (invariante 5 de `AGENTS.md`); las vistas `security_invoker` dependen de la RLS de `tickets` (SELECT gateado por módulo).
- Tests: los 60+ tests de `reporte-*.test.js` prueban la agregación en cliente; se reemplazan por pruebas SQL en `tests/db` y un script de paridad (como `scripts/paridad-reporte-tickets.mjs` de la 053, hoy inexistente) comparando 3 períodos cerrados entre la RPC nueva y el modal actual antes de retirarlo.

**Orden sugerido**

| Paso | Qué | Depende de | Espera V2 |
|---|---|---|---|
| 1 | Glosario aprobado (§5.1) + decisiones §5.5 | dueño | no |
| 2 | Registrar 086–112 en `schema_migrations`; aplicar 089 en branch y luego producción; verificar `resuelto_at` con `select` | GOTCHAS-CLI | no |
| 3 | `v_ticket_hechos` + vistas `v_kpi_*` + RPC `reporte_tickets` nueva (pisa la 053) con pruebas SQL; script de paridad contra el modal | 2 | no |
| 4 | Módulo Reportes con hoja imprimible y CSV desde la RPC; Satisfacción sobre `v_kpi_csat`; Inicio: fecha de baja desde `empleado_eventos`; Problemas y PDF de equipos leen las vistas/parámetros | 3 | no |
| 5 | Retirar modal, cálculo en cliente, métodos muertos y copias de la tasa; actualizar `insforge-api-shape.test.js`, `CHANGELOG`, `PANORAMA` | 4 | no |
| 6 | Horas laborables, tiempo objetivo, "a tiempo", reaperturas por rol, duplicados, cierre por el usuario: nuevas columnas en `v_ticket_hechos` sin tocar el módulo | 105 / V2 F2 | sí |
| 7 | Reporte mensual programado (M-11 del plan) | 4 | no |

## 7. Resumen ejecutivo para el dueño

1. Hoy hay cuatro "reportes" que no comparten definiciones: el modal de Tickets (cálculo en el navegador), tres RPC en la base (dos de ellas nunca usadas), la vista de Satisfacción y el Inicio; la misma palabra "resuelto" significa tres cosas distintas dentro del propio modal.
2. El dato más visible y más falso: el listado muestra "Resuelto dd/mm" con la fecha de la última edición, porque la migración 089 (`resuelto_at`) no está aplicada en producción y el código la suple con `updated_at`.
3. Los tiempos de atención son horas corridas (sin horario laboral, la 105 no existe): el promedio histórico es 36 h y la mediana 1,2 h; el reporte pone el promedio primero.
4. La satisfacción se publica con decimales y variaciones sobre muestras de 1 o 2 respuestas; la tasa de reapertura puede pasar del 100 % y cuenta reaperturas de rechazados.
5. La comparación "vs. período anterior" se imprime aunque el mes actual lleve tres días o el anterior esté incompleto.
6. Nada limita filas: el modal lee toda la tabla de tickets para una columna ("Histórico") que además agrupa por nombre; truncará en silencio en 2027.
7. Varias cosas ya calculadas en la base no se usan (`reporte_tickets`, `v_licencias_cupo`, `v_empleados_anonimizables`) mientras el cliente mantiene copias con otros umbrales (recurrencia, garantías 90 vs. 30 días).
8. Faltan métricas básicas que los datos ya permiten: backlog al cierre, tiempo a primera respuesta (555 comentarios de staff), tickets sin reasignar, por subcategoría/nivel/área (área solo en 42 de 100 empleados).
9. Propuesta: un glosario aprobado, una vista base por ticket y una RPC por período en SQL, y un único módulo Reportes con hoja imprimible estilo Expediente; se retira el modal y todo cálculo en cliente.
10. Se puede empezar ya (pasos 1–5) con el esquema actual tras aplicar la 089; solo "horas laborables / a tiempo / reaperturas por rol" esperan a V2.
