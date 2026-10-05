# Anexo D — Esquema `public` reconstruido desde `migrations/001…089` y contrastado con la base real (Fase 0, Ciclo 21)

Fuente: lectura de las 88 migraciones + `rollback/075` (subagente, 2026-10-01) y consulta en vivo de `pg_class`, `pg_policies`, `pg_trigger`, `pg_proc`, `information_schema`, `pg_indexes`, `pg_constraint` (auditor, 2026-10-01). Donde la base real difiere de la reconstrucción se indica. [Verificado] = leído en SQL o en el catálogo; [Inferido] = deducción.

## 0. Cifras en vivo (producción, 2026-10-01) [Verificado]
- 44 tablas en `public`, 0 vistas, RLS habilitada en 42 (sin RLS: `schema_migrations`, `function_deploys`, ambas sin grants a `anon`/`authenticated`). Ninguna con FORCE RLS.
- 126 policies, todas PERMISSIVE y con `roles={public}` (sin cláusula `TO`). Ninguna `USING (true)`.
- 80 triggers (todos habilitados), 72 funciones propias (plpgsql/sql), 86 FK (todas cubiertas por índice), 2 enums nativos (`estado_empleado`, `staff_rol`).
- Extensiones: http 1.7, pg_cron 1.6, pgcrypto 1.3, vector 0.7.4. Roles: `anon`, `authenticated` (sin login), `project_admin` (BYPASSRLS, sin login), `postgres`.
- `anon` y `authenticated` tienen GRANT de SELECT/INSERT/UPDATE/DELETE sobre las 42 tablas con RLS: la única barrera para ellos es RLS.
- `auth.users`: 11 usuarios (9 verificados); `staff`: 10 filas (3 JEFE activos, 5 ASISTENTE activos, 2 ASISTENTE inactivos) → 1 usuario de auth sin fila en `staff`.

## 1. Tablas — estado final
| Tabla | Creación | deleted_at | Autor | Notas |
|---|---|---|---|---|
| empresas | 001 | sí | created_by/updated_by | RLS `es_staff()` sin gate de módulo |
| plataformas | 001 | sí | sí | gate `correos` (081) |
| empleados | 002 | sí | sí | +area_obra_id (020), +ubicacion_id (059); SELECT abierto a staff (excepción deliberada) |
| cuentas | 002 | sí | sí | +tipo_cuenta (006), +last_password_change (008), +requiere_rotacion (009); CHECK formato cifrado (086) |
| staff | 003 | **no** | — | enum `staff_rol` |
| asignaciones_cuenta | 004 | no | created_by | |
| accesos_log | 010 | no | user_id | +ip/user_agent (064); solo SELECT jefe |
| entregas | 010 | no | created_by | `token` eliminada (067), `token_hash` UNIQUE |
| licencias | 011 | sí | sí | +renovacion_meses (012), +tiene_clave generada (040); CHECK (086) |
| asignaciones_licencia | 011 | no | created_by | |
| tipos_equipo | 013 | sí | **ninguna** | |
| equipos | 013 | sí | sí | +fotos (015), +codigo_almacen (023), +tiene_asignacion_activa (085) |
| asignaciones_equipo | 013 | no | created_by | +ubicacion_id + CHECK destino único (014); `motivo_cierre` texto libre |
| eventos_equipo | 013 | no | user_id/email | |
| ubicaciones | 014 | sí | **ninguna** | +tipo (059); RLS `es_staff()` |
| categorias_ticket | 016 | sí | **ninguna** | RLS `es_staff()` |
| subcategorias_ticket | 016 | sí | **ninguna** | +tipo_sugerido (035); gate `tickets` (082) |
| tickets | 016 | **no** | creado_por | +nivel_atencion (017), +tipo (035); `resuelto_at` (089) **NO existe en producción** |
| ticket_comentarios | 016 | no | autor_id | default `interno=true` |
| ticket_eventos | 016 | no | user_id/email | |
| ticket_satisfaccion | 016 | no | — | UNIQUE(ticket_id) |
| ticket_busqueda_intentos | 017 | no | — | rate-limit |
| areas_obras | 020 | sí | sí | gate `empleados` (087) |
| catalogo_almacen | 022 | sí | **ninguna** | |
| equipo_accesorios | 022 | **no** | — | DELETE para staff con módulo |
| accesos_sensibles | 024 | **no (deliberado)** | sí | CHECK `sens1:` (086) |
| accesos_sensibles_permisos | 024 | no | — | |
| kb_articulos | 031 | sí | sí | |
| problemas | 033 | sí | sí | |
| problema_tickets | 033 | no | created_by | DELETE para staff con módulo |
| acciones_correctivas | 033 | sí | sí | |
| ticket_creacion_intentos | 037 | no | — | rate-limit |
| encuestas | 043 | sí | created_by **sin trigger** | |
| encuesta_rondas | 043 | no | created_by **sin trigger** | |
| encuesta_respuestas | 043 | no | — | |
| encuesta_respuesta_intentos | 043 | no | — | rate-limit |
| notificaciones | 045 | no | — | +destinatario_id (048); CHECK `tipo` con 8 valores |
| notificaciones_lecturas | 045 | no | usuario_id | |
| transiciones_ticket_permitidas | 050 | no | — | 7 filas en producción |
| staff_modulos_permisos | 056 | no | — | |
| equipos_importacion | 057 | **no** | sí | DELETE para staff con módulo |
| staff_permisos | 060 | no | — | CHECK `permiso='credenciales.ver'` |
| schema_migrations | 069 | no | — | sin RLS; 84 filas, última 085 |
| function_deploys | 070 | no | — | sin RLS; 6 filas, última 2026-08-20 |
| personal_registros / personal_registro_intentos | 042 | — | — | **eliminadas en 084** |

## 2. Políticas RLS finales (coinciden con `pg_policies` en producción) [Verificado]
Abreviaturas: `S`=es_staff(), `J`=es_jefe(), `M(x)` = `J or (S and tiene_permiso_modulo(x))`, `uid` = `(select auth.uid())`. Operaciones ausentes en **negrita**.

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| empresas | S | S | S | J |
| plataformas | M(correos) | M(correos) | M(correos) | J |
| empleados | S | M(empleados) | M(empleados) | J |
| cuentas | M(correos) | M(correos) | M(correos) | J |
| staff | `user_id=uid or J` | J | `user_id=uid or J` (trigger congela rol/activo) | J |
| asignaciones_cuenta | M(correos) | M(correos) | M(correos) | J |
| accesos_log | J | **—** | **—** | **—** |
| entregas | M(correos) | **—** | **—** | J |
| licencias / asignaciones_licencia | M(licencias) | M(licencias) | M(licencias) | J |
| tipos_equipo / equipos / asignaciones_equipo | M(equipos) | M(equipos) | M(equipos) | J |
| eventos_equipo | M(equipos) | **—** | **—** | **—** |
| ubicaciones | S | S | S | J |
| categorias_ticket | S | S | S | J |
| subcategorias_ticket | M(tickets) | M(tickets) | M(tickets) | J |
| tickets | M(tickets) | **—** (edge fn) | M(tickets) | **—** |
| ticket_comentarios | M(tickets) | M(tickets) | **—** | **—** |
| ticket_eventos / ticket_satisfaccion / transiciones_ticket_permitidas | M(tickets) | **—** | **—** | **—** |
| ticket_busqueda_intentos / ticket_creacion_intentos / encuesta_respuesta_intentos | J | **—** | **—** | **—** |
| areas_obras | M(empleados) | M(empleados) | M(empleados) | J |
| catalogo_almacen | M(equipos) | M(equipos) | M(equipos) | J |
| equipo_accesorios / equipos_importacion | M(equipos) | M(equipos) | M(equipos) | **M(equipos)** (hard delete de staff) |
| accesos_sensibles | J | J | `J and tiene_permiso_acceso_sensible(id)` | ídem (hard delete) |
| accesos_sensibles_permisos | `J and permiso(acceso_id)` | ídem | **—** | ídem |
| kb_articulos | `J or (S and M(base_conocimiento) and (estado in (publicado,obsoleto) or created_by=uid))` | M(base_conocimiento) | `J or (tiene_permiso_modulo(base_conocimiento) and created_by=uid and estado in (borrador,en_revision))` — **sin es_staff()** | J |
| problemas / acciones_correctivas | M(problemas) | M(problemas) | M(problemas) | J |
| problema_tickets | M(problemas) | M(problemas) | **—** | **M(problemas)** |
| encuestas / encuesta_rondas | M(encuestas) | J | J | J |
| encuesta_respuestas | M(encuestas) | **—** | **—** | **—** |
| notificaciones | `S and (destinatario_id is null or = uid)` | **—** | **—** | **—** |
| notificaciones_lecturas | `usuario_id=uid` | `usuario_id=uid and S` | **—** | **—** |
| staff_modulos_permisos / staff_permisos | `staff_user_id=uid or J` | J | **—** | J |

Fuera de `public`: `realtime.channels` con policies TO authenticated (`es_staff()` + patrones de lista y canal personal, 086) y una TO anon,authenticated (`ticket:%` con `ticket_token_existe()`, 028). Canales habilitados en producción: `empleados:list`, `notificaciones:nuevas`, `notificaciones:usuario:%`, `ticket:%`, `tickets:list`; deshabilitados: `cuentas:list`, `equipos:list`, `licencias:list`, `tickets:nuevos`.

## 3. Funciones (72 en producción; coinciden con la reconstrucción) [Verificado]
- **Todas las SECURITY DEFINER fijan `search_path`** (`public`, o `pg_catalog, public, pg_temp` en las de 085). No SD: `set_updated_at`, `siguiente_codigo_ticket`, `revocar_cuenta_personal`, `tickets_resuelto_at` (esta última no existe en producción).
- RPC con EXECUTE a `authenticated`: `cerrar_ticket`, `dar_baja_empleado`, `es_jefe`, `es_staff`, `kb_registrar_feedback`, `reporte_satisfaccion_consolidado`, `reporte_tickets`, `reporte_tickets_resumen`, `revocar_cuenta_personal`, `staff_nombres`, `tiene_permiso_acceso_sensible`, `tiene_permiso_modulo`.
- Solo `project_admin`: `crear_notificacion`, `log_evento_equipo`, `log_evento_ticket`, `siguiente_codigo_ticket`.
- **EXECUTE a PUBLIC (anon incluido)**: `ticket_token_existe(text)` (SD, STABLE; necesaria para la policy anon de realtime; nunca listada en 062/063/073) → oráculo booleano de existencia de token sin sesión ni rate-limit [Verificado acl; impacto Inferido].
- Guards dentro de RPC (cuerpo en producción): `cerrar_ticket`, `dar_baja_empleado`, `reporte_*` usan `es_jefe()`/`tiene_permiso_modulo` (086 aplicada). `kb_registrar_feedback` solo `es_staff()` (sin gate de módulo). `staff_nombres` solo `es_staff()`. `tiene_permiso_modulo()` no mira `staff.activo` (lo aporta cada policy con `es_staff()`).
- `tiene_permiso_credenciales_ver` **no existe** en producción (088 aplicada).
- `handle_new_staff_user` reescrita 5 veces (003/018/056/060/076); versión vigente 076 (activo=false + 8 módulos + credenciales.ver).

## 4. Triggers (80 en producción, coinciden) [Verificado]
Reglas de negocio por tabla: ver tabla completa en `docs/PANORAMA-SISTEMA.md` §3 con las correcciones del §8 de este anexo. Puntos relevantes:
- `tickets` BEFORE UPDATE: `trg_check_asignado_staff`, `trg_check_iniciar_completo` (exige nivel+asignado+tipo), `trg_check_transicion_ticket_permitida` (whitelist 050), `trg_ticket_identidad_inmutable` (token/codigo/origen/creado_por), `trg_tickets_updated_at`. AFTER: `evento_ticket_cambios`, `crear_encuesta_al_cerrar`, `notify_ticket_estado`, `notify_ticket_personal`, `notify_list_changed`.
- Topes: `check_tope_licencia`, `check_tope_licencia_cuenta`, `check_reutilizable_exclusividad` (personal+reutilizable), `check_asignacion_equipo` — todos `count(*)` + `raise` en BEFORE INSERT, sin `FOR UPDATE` ni índice único parcial.
- `marcar_rotacion_pendiente` (AFTER UPDATE de `asignaciones_cuenta`): marca `requiere_rotacion` en reutilizable/compartida.
- `check_baja_equipo_con_portador` (080): bloquea operativo→de_baja/perdido con portador persona.
- `set_equipo_tiene_asignacion_activa` + `sync_…` (085): columna derivada; el sync hace UPDATE a `equipos` y dispara `updated_by/updated_at/notify`.
- `encuestas`: solo `updated_at` + inmutabilidad de preguntas; **sin trigger de `created_by`**.
- Whitelist `transiciones_ticket_permitidas` en producción: abierto→en_progreso, abierto→rechazado, en_progreso→resuelto, reabierto→resuelto, resuelto→cerrado, cerrado→reabierto (jefe), rechazado→reabierto (jefe).

## 5. Índices, rate-limit, enums
- FK: 86, todas con índice. ~12 pares de índices redundantes (parcial + completo sobre la misma columna, p.ej. `idx_tickets_asignado`/`idx_tickets_asignado_a`, `idx_empleados_empresa`/`idx_empleados_empresa_id`, `idx_asig_equipo_empleado`/`idx_asignaciones_equipo_empleado_id`, `idx_entregas_token_hash`/`entregas_token_hash_unique`) [Verificado en `pg_indexes`].
- Tablas de rate-limit sin purga ni retención definida [Verificado ausencia en migraciones].
- `text + CHECK` en todo salvo `empleados.estado` y `staff.rol` (enums nativos). Sin CHECK pese a dominio cerrado: `asignaciones_equipo.motivo_cierre`, `moneda`.
- CHECK `accesos_log.accion` con 12 valores; `notificaciones.tipo` con 8 (`ticket_creado`, `cuenta_creada`, `empleado_alta`, `empleado_baja`, `ticket_asignado`, `ticket_estado_cambiado`, `ticket_comentario_nuevo`, …).

## 6. Migraciones
- Rollback explícito: solo 075 (para 074). Irreversibles por pérdida de datos: 004, 006, 031, 033, 034, 059, 067, 084. Todas comentadas en español. Sin banner de cabecera/pie: 079–083, 087, 089.
- Regresiones históricas por "CREATE OR REPLACE desde copia vieja": 056→076 (activo=false), 064→074 (valores del CHECK).
- `schema_migrations` backfill 001–068 con checksum placeholder (069): no es evidencia de aplicación real antes de 071.

## 7. Discrepancias `docs/PANORAMA-SISTEMA.md` §1–§3 vs migraciones/base
| Afirmación del doc (línea) | Realidad | Tipo |
|---|---|---|
| L23: RPC expuestos = `kb_registrar_feedback` y `dar_baja_empleado` | también `cerrar_ticket`, `reporte_tickets`, `reporte_tickets_resumen`, `reporte_satisfaccion_consolidado`, `staff_nombres`, `revocar_cuenta_personal` | desactualizado |
| L26: lista de tablas sin `deleted_at` | faltan `accesos_sensibles(_permisos)`, `equipo_accesorios`, `problema_tickets`, `equipos_importacion`, `transiciones_ticket_permitidas`, `staff_*_permisos`, `*_intentos`, `schema_migrations`, `function_deploys` | incompleto |
| L26: "ninguna tabla tiene hard delete desde el cliente" | DELETE de staff con módulo en `equipo_accesorios`, `equipos_importacion`, `problema_tickets`; jefe-con-permiso en `accesos_sensibles` | contradicción |
| L27: `created_by` siempre por trigger | `encuestas`, `encuesta_rondas` sin trigger | contradicción |
| L37: 39 tablas; RLS en todas | 44 tablas; 2 sin RLS | desactualizado |
| L46: `areas_obras` staff/staff/staff/jefe | gate `empleados` desde 087 | desactualizado |
| L101, L115-117: kb/encuestas "ver: staff" | gate de módulo (072); UPDATE de kb sin `es_staff()` | desactualizado |
| L131, L134, README L171/510: notificaciones con 4 eventos | CHECK con 8 tipos; triggers 049 (asignado, estado, comentario) | desactualizado |
| L149, L251: `tiene_permiso_credenciales_ver` existe sin consumidor | eliminada (088, aplicada en producción) | desactualizado |
| §2 sin filas para `ticket_creacion_intentos`, `transiciones_ticket_permitidas`, `schema_migrations`, `function_deploys` | existen | incompleto |
| L155: todo SD salvo donde se indica | `set_updated_at`, `siguiente_codigo_ticket`, `revocar_cuenta_personal` no son SD y no se indica | contradicción |
| L157-158: catálogos con `set_created_updated_by()` | solo `set_updated_at`; no tienen columnas de autor | contradicción |
| L165/175/237: sin mención del CHECK de formato cifrado | 086 | desactualizado |
| L182-185 equipos; L196-204 tickets; L209-211 comentarios | faltan `check_baja_equipo_con_portador` (080), `notify_ticket_comentario_personal` (049); inmutables también `origen`/`creado_por` | incompleto |
| L233: encuestas con `set_created_updated_by()` | solo `updated_at`; no tiene `updated_by` | contradicción |
| L255: `dar_baja_empleado` exige `es_staff()` | exige gate `empleados` (086); ídem `cerrar_ticket`/`reporte_*` | desactualizado |
| L249-256: funciones de apoyo | no menciona `ticket_token_existe`, ni la revocación de `siguiente_codigo_ticket` | incompleto |
| AGENTS.md invariante 4 (rama rediseno): la regla vive en SQL y TS | la función SQL ya no existe; `origin/main` (#29/#30) sí lo actualizó | desactualizado en rediseno |

## 8. Hallazgos al pasar (candidatos para Fases 3 y 4)
| Evidencia | Descripción | Por qué importa |
|---|---|---|
| 011:131-148, 011:178-195, 041:25-37, 013:253-259 | Topes como `count(*)`+`raise` sin `FOR UPDATE` ni índice único parcial `(…) where fecha_fin is null` | Dos inserts concurrentes superan el tope / dos titulares activos [Inferido] |
| 011:178-181 | `check_tope_licencia_cuenta` con `limit 1` sin `order by` | tope arbitrario si una cuenta es login de 2+ licencias |
| 028:23-38 + acl en vivo | `ticket_token_existe` ejecutable por anon | oráculo de token sin rate-limit (mitigado por 144 bits) |
| 032:18-43 vs 086 | `kb_registrar_feedback` sin gate de módulo | ASISTENTE sin `base_conocimiento` vota por RPC |
| 072:88-105 | UPDATE de `kb_articulos` sin `es_staff()` | staff desactivado edita sus borradores |
| 043 | `encuestas.created_by` sin trigger | trazabilidad no garantizada |
| 003:182 | `empresas` sin gate de módulo y no eximida en AGENTS | hueco del patrón 079–087 |
| 024:86-92, 024:183-192 | si el único JEFE con permiso sobre un acceso sensible se desactiva, la fila queda huérfana | solo recuperable con cliente admin [Inferido] |
| 078:65-68, 049:31-33, 049:98 | `new.asignado_a <> auth.uid()` con `auth.uid()` NULL → no notifica | cambios sin sesión omiten avisos personales |
| 026:9-19, 045, 048 | `realtime.publish()` dentro de la transacción de negocio | si realtime falla, falla la escritura |
| 085:74-108 | sync de disponibilidad pisa `updated_by/updated_at` de `equipos` | ruido de trazabilidad |
| 089:62-83 | backfill con `trg_tickets_updated_at` activo | bumpea `updated_at` (no aplicada aún) |
| 086:675-738 | CHECK NOT VALID; VALIDATE corrido 09-25 según historial, sin registro en migraciones | filas en texto plano históricas ineditables |
| 017, 037, 043 | rate-limit sin purga | crecimiento ilimitado |
| 062:121-181 | ~12 índices redundantes | escritura más cara |
| 010/064/074 | `accesos_log.accion` admite `entrega_creada` que el código no emite | valor muerto |
| 013:129-130 | `motivo_cierre` sin CHECK | datos libres |
| 016:29 + 086:623 | `siguiente_codigo_ticket` solo project_admin; GRANT sobre la secuencia implícito | 086 pidió probar creación en branch, sin constancia |
