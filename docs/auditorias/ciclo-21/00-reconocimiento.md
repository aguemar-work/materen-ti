# Ciclo 21 — Fase 0: Reconocimiento

**Fecha:** 2026-10-01. **Auditor:** equipo auditor senior (ITSM/ITIL 4, arquitectura, seguridad, negocio/UX) ejecutado con Claude Code. **Modo:** solo lectura (repo, worktrees, base de producción con `SELECT`/catálogo). **Rama del checkout principal:** `rediseno/sistema-visual` (7e413c3).

Anexos de esta fase (en `anexos/`): A edge functions · B ramas/migraciones/drift · C índice de hallazgos de los Ciclos 1–20 · D esquema reconstruido vs base real · E frontend.

## 0.1 Qué se leyó y qué se consultó
- Documentación: `README.md`, `AGENTS.md`, `frontend/AGENTS.md`, `docs/PANORAMA-SISTEMA.md`, `docs/HISTORIAL-AUDITORIAS.md` (20 ciclos, 1650 líneas), `docs/CHANGELOG.md` (desde 2026-08-15), `docs/SISTEMA-DISENO.md`, `docs/GOTCHAS-CLI.md`, `docs/PLAN-V2-TICKETS.md`, `insforge.toml`, `.github/workflows/ci.yml`; en el worktree V2: `docs/V2-ORGANIZACION.md`, `docs/PLAN-V2-TICKETS-CHECKPOINTS.md`, migraciones 090–095.
- Código: `migrations/001…089` + `rollback/075`, `functions/*.ts` (4), `frontend/src/**` (router, stores, api/domains, módulos, composables, core), `frontend/tests/**`, `tests/db/triggers.test.sql`, `scripts/*`.
- Git: ramas locales y remotas, worktrees, `git ls-tree`/`diff`/`cherry`/`merge-base`, stash list (sin cambiar de rama).
- Base de producción (proyecto que apunta `.insforge/project.json`, el mismo que `project.parent.json`; el worktree V2 apunta a un proyecto distinto, la branch `v2`): `pg_class`, `pg_policies`, `pg_trigger`, `pg_proc`, `pg_constraint`, `pg_indexes`, `information_schema.columns`, `pg_roles`, `role_table_grants`, `pg_extension`, `pg_publication_tables`, conteos agregados de tablas de negocio (sin filas individuales), `public.schema_migrations`, `public.function_deploys`, `public.transiciones_ticket_permitidas`, y en esquemas internos de la plataforma: `functions.definitions` (hash del código desplegado), `storage.buckets/objects` (agregado), `realtime.channels`, `auth.config`, `auth.users` (solo conteo), `system.database_backups`, `system.audit_logs` (agregado), `schedules.jobs`, `system.advisor_*`.
- No se reveló ningún secreto, token, contraseña ni dato personal. No se invocó `revelar`. No se ejecutó ningún INSERT/UPDATE/DELETE/DDL.

## 0.2 Inventario real (producción, 2026-10-01) [Verificado]
| Elemento | Cifra | Detalle |
|---|---|---|
| Tablas `public` | 44 | 42 con RLS; `schema_migrations` y `function_deploys` sin RLS y sin grants a `anon`/`authenticated`; 0 vistas |
| Policies RLS | 126 | todas PERMISSIVE, `roles={public}`; ninguna `USING (true)` |
| Triggers | 80 | todos habilitados |
| Funciones propias | 72 | todas las SECURITY DEFINER fijan `search_path`; 1 SD con EXECUTE a PUBLIC (`ticket_token_existe`) |
| FK | 86 | todas con índice; ~12 pares redundantes |
| Roles | `anon`, `authenticated`, `project_admin` (BYPASSRLS), `postgres` | `anon`/`authenticated` con DML sobre las 42 tablas con RLS |
| Extensiones | http, pg_cron, pgcrypto, vector | `cron` no legible desde el CLI |
| Edge functions | 4 activas | `credenciales`, `tickets`, `encuestas`, `equipos-fotos`; todas redesplegadas 2026-09-25 |
| Buckets | 2, **ambos públicos** | `equipos-fotos` (0 objetos), `tickets-adjuntos` (73 objetos, 4 MB) |
| Backups de plataforma | **0 filas** en `system.database_backups` | ver C21-OPS-004 |
| Realtime | 5 canales habilitados | `empleados:list`, `tickets:list`, `ticket:%`, `notificaciones:nuevas`, `notificaciones:usuario:%` |
| Auth | signup deshabilitado; verificación por código; contraseña 12 + 4 clases | coincide con `insforge.toml` |
| Usuarios | 11 en `auth.users` (9 verificados), 10 en `staff` | 1 usuario de auth sin fila `staff` |
| Staff | 3 JEFE activos, 5 ASISTENTE activos, 2 ASISTENTE inactivos | módulos: tickets 9, empleados/equipos/kb/problemas 8, correos/licencias 6, encuestas 5; `credenciales.ver` 6 |
| Migraciones registradas | 84 (última 085) | 086–088 aplicadas sin registro; 089 no aplicada |

**Adopción real (conteos):** empleados 82 activos / 18 inactivos; cuentas 104 personales, 57 compartidas, 16 reutilizables (6 con rotación pendiente); asignaciones de cuenta 142 activas / 49 cerradas; equipos 314 operativos, 21 de baja, 3 perdidos, 2 en reparación; asignaciones de equipo 228 activas / 39 cerradas; licencias 9; tickets 287 (278 cerrados, 8 rechazados, 1 en progreso; 285 de origen empleado; 11 sin vincular); satisfacción 246 respondidas / 19 pendientes (93 %); comentarios 346 internos / 181 visibles; KB 2 publicados / 5 borradores; problemas 1 abierto; encuestas 1 plantilla, 0 rondas, 0 respuestas; entregas 101; `accesos_log` 879 eventos (230 enviar, 181 ver, 163 entrega_abierta, 156 copiar, 62 creado, 53 eliminado, 21 entrega_fallida, 13 permisos); notificaciones 490; accesos sensibles 9.

## 0.3 Comparación `main` ↔ ramas ↔ producción [Verificado]
- `main` local está 1 commit detrás de `origin/main` (#31). `rediseno/sistema-visual` (+76/−4 vs main), `release/v2` y `v2/tickets-f1` **no existen en el remoto**.
- Migraciones: `main` tiene 088 y no 089; `rediseno`/`release/v2`/`v2/tickets-f1` tienen 089 y no 088. Ningún número con contenido distinto entre ramas. 090–095 solo en `v2/tickets-f1` y en la branch InsForge `v2`.
- Producción: 086, 087 y 088 **aplicadas** (verificado por objetos: guards de módulo en RPC, policies de `areas_obras`, ausencia de `tiene_permiso_credenciales_ver`, CHECK de formato cifrado) pero **no registradas** en `schema_migrations`; 089 **no aplicada** (`tickets.resuelto_at` no existe).
- Edge functions desplegadas: `tickets`, `encuestas`, `equipos-fotos` idénticas byte a byte a `main` y a `rediseno`. `credenciales` desplegada coincide con **`stash@{0}`** (2026-09-25, "credenciales-ver-duplicado + P0-04"), no con ningún commit; difiere de `origin/main` en 1 línea de comentario; lógica igual a main.
- `function_deploys` no registra nada desde 2026-08-20, aunque `system.audit_logs` registra 32 `UPDATE_FUNCTION` (último 2026-09-25 21:34).
- `main` conserva `functions/personal-registro.ts`, `frontend/src/modules/personal/` y rutas `/personal-registro(s)` pese a que la 084 (en main y en producción) borró sus tablas; el retiro vive solo en `rediseno`. El frontend de `main` es del 26-08 y el rediseño V2 completo solo existe en local.
- Working tree principal: `migrations/088_…sql` (idéntico a main) y `docs/PLAN-V2-TICKETS.md` (idéntico a release/v2) sin trackear. 2 stashes.
- Plan V2: Checkpoint 0 aprobado y mergeado en `release/v2`; Checkpoint 1 (migraciones 090–095, RPC transaccionales, estado `en_espera_usuario`, doble cierre, reloj, encuesta por cierre) escrito y **pendiente de aprobación**.

## 0.4 Discrepancias documentación vs realidad
| # | Afirmación de la documentación | Realidad verificada | Evidencia | Tipo |
|---|---|---|---|---|
| D-01 | AGENTS.md (rediseno) invariante 4: `credenciales.ver` vive en `tiene_permiso_credenciales_ver()` (SQL) y en `credenciales.ts`; PANORAMA L149/L251 "sin consumidor hoy" | La función SQL **no existe** en producción (088 aplicada); `origin/main` (#29/#30) ya lo corrigió, la rama rediseno no | `pg_proc` en vivo; `git diff origin/main rediseno -- AGENTS.md` | desactualizado en la rama de trabajo |
| D-02 | AGENTS.md helper 3: `TicketComentarios.vue`, `TicketHistorial.vue`; "Modal con 26 consumidores" | no existen (reemplazados por `TicketTimelineUnificado.vue`); Modal tiene 25 | `frontend/src/modules/tickets/`, grep | desactualizado |
| D-03 | AGENTS.md "schema_migrations/function_deploys: qué está aplicado y desplegado" | `schema_migrations` termina en 085 con 086–088 aplicadas; `function_deploys` termina el 2026-08-20 con 32 deploys posteriores | tablas en vivo + `system.audit_logs` | contradicción |
| D-04 | README L171/510, PANORAMA L131/134/286/329: notificaciones con "4 eventos concretos" | CHECK `notificaciones.tipo` con 8 valores; triggers 049 (`ticket_asignado`, `ticket_estado_cambiado`, `ticket_comentario_nuevo`) | `pg_constraint`, migración 048/049 | desactualizado |
| D-05 | PANORAMA L23: RPC expuestos al cliente = 2 | 12 funciones con EXECUTE a `authenticated`; 6 invocadas desde el frontend | `pg_proc.proacl`; anexo E §4 | desactualizado |
| D-06 | PANORAMA L37: 39 tablas, RLS en todas | 44 tablas; 2 sin RLS | `pg_class` | desactualizado |
| D-07 | PANORAMA L26: "ninguna tabla tiene hard delete desde el cliente" | DELETE de staff con módulo en `equipo_accesorios`, `equipos_importacion`, `problema_tickets`; jefe-con-permiso en `accesos_sensibles` (el propio doc lo admite en otras líneas) | `pg_policies` | contradicción interna |
| D-08 | PANORAMA L27: `created_by` siempre por trigger | `encuestas`, `encuesta_rondas` sin trigger de autor | `pg_trigger` | contradicción |
| D-09 | PANORAMA L46/101/115-117: `areas_obras`, `kb_articulos`, `encuestas*` con RLS `es_staff()` | gate de módulo (072/087); UPDATE de kb sin `es_staff()` | `pg_policies` | desactualizado |
| D-10 | PANORAMA L155: "todos los triggers corren SECURITY DEFINER salvo donde se indica" | `set_updated_at`, `siguiente_codigo_ticket`, `revocar_cuenta_personal` no son SD y no se indica | `pg_proc.prosecdef` | contradicción |
| D-11 | PANORAMA L157-158/L233: catálogos y `encuestas` con `set_created_updated_by()` | solo `set_updated_at`; esas tablas no tienen columnas de autor | `pg_trigger`, `information_schema.columns` | contradicción |
| D-12 | PANORAMA L255: `dar_baja_empleado` exige `es_staff()` | exige gate `empleados` (086); ídem `cerrar_ticket`/`reporte_*` | cuerpo en `pg_proc` | desactualizado |
| D-13 | PANORAMA §2/§3 omite `ticket_creacion_intentos`, `transiciones_ticket_permitidas`, `schema_migrations`, `function_deploys`, `check_baja_equipo_con_portador`, `notify_ticket_comentario_personal`, `ticket_token_existe`, CHECK de formato cifrado | existen | catálogo en vivo | incompleto |
| D-14 | HISTORIAL Ciclo 20 "no quedan pendientes abiertos"; CHANGELOG 09-25 "089 aplicada en el próximo deploy" | 089 sin aplicar; 086–088 sin registrar; functions redesplegadas desde un stash | `schema_migrations`, `functions.definitions` | desactualizado |
| D-15 | HISTORIAL H 664/930 (EQ-FOTOS-02 "requiere deploy") y H 684 (DNI duplicado "abierto") | deploy hecho 09-25; DNI duplicado resuelto en `EmpleadoForm.vue:170` (CL 09-24) | anexo C | filas no reconciliadas |
| D-16 | HISTORIAL Ciclos 3–5, 14, 16–19: pendientes de CSS/diseño (UX6-02/04/09, ARQ-20, DR-05/06, DP-05, CC-07, A-03, DS-02) | el sistema visual que auditaban fue retirado (09-05/09-07); nunca se marcaron "sin objeto" | anexo C | desactualizado |
| D-17 | `constants/modulos.js:2-3`: "la consume `AppNav.vue`" | `AppNav` lee `navegacion.js`, que repite los 8 ids a mano | código | desactualizado |
| D-18 | PANORAMA L21 y README: claves `CRED_KEY_V2`/`LEGACY`; comentario de 024 "enc2:" para sensibles | formato real `sens1:` con `CRED_KEY_SENSIBLE` (corregido en 086 pero no en PANORAMA §2) | `credenciales.ts`, CHECK en vivo | desactualizado |
| D-19 | 088 cabecera: "Ciclo 21, hallazgo CREDENCIALES-VER-DUPLICADO" | ese ciclo y ese ID no existen en HISTORIAL (este documento es el Ciclo 21) | `migrations/088`, anexo C | referencia huérfana |
| D-20 | `frontend/tests/integration/permisos-credenciales-sincronizados.smoke.test.js` (rediseno) y AGENTS.md invariante 4: el test compara SQL ↔ TS | la RPC que llama no existe; `main` ya eliminó el archivo | anexo B §5 | obsoleto en la rama |
| D-21 | `docs/PANORAMA-SISTEMA.md` §5 "números en vivo 2026-07-29" (63 tickets, 1 KB, 0 problemas) | hoy 287 tickets, 2 KB publicados + 5 borradores, 1 problema, 0 rondas de encuesta | conteos en vivo | desactualizado (no es error, falta refresco) |

## 0.5 Lo que no se pudo revisar en esta fase
- **CI real y branch protection**: `gh` no está instalado y no hay acceso a GitHub Actions desde esta sesión; solo se leyó `ci.yml`. Los nombres de secrets configurados, el estado de `required checks` y la última corrida no se verificaron.
- **Despliegue de Vercel**: no se puede saber qué commit sirve el frontend publicado (no hay CLI ni acceso). Se infiere de git que es `main` (26-08) o anterior.
- **`cron.job`**: `permission denied for schema cron` desde el CLI; `schedules.jobs` está vacío.
- **Advisor de InsForge**: `system.advisor_scans/findings` vacíos (los ciclos 6–9 lo corrieron por otra vía).
- **Acción `version` de las functions**: exige sesión de staff; se verificó el código desplegado por hash en `functions.definitions`.
- **Secrets**: solo se comprobó su existencia por nombre en el código (`CRED_KEY_V2`, `CRED_KEY_LEGACY`, `CRED_KEY_SENSIBLE`, `API_KEY`, `INSFORGE_BASE_URL`); `system.secrets` no se consultó.
- **Comportamiento real de RLS con sesiones de rol**: el CLI corre como `project_admin` (BYPASSRLS); las pruebas negativas existen solo como smoke tests que dependen de secrets de CI.

## 0.6 Candidatos detectados en el reconocimiento para fases posteriores
(No son hallazgos todavía; se verifican en su fase.)
- Seguridad (F3): `ticket_token_existe` ejecutable por `anon`; `kb_registrar_feedback` sin gate de módulo; `empresas` sin gate; UPDATE de `kb_articulos` sin `es_staff()`; `anon`/`authenticated` con DML en todas las tablas; bucket `tickets-adjuntos` público con el token del ticket en la key; `crear` público acepta `equipoId/cuentaId/licenciaId` arbitrarios y `vinculado` como oráculo de DNI; `entregaAbrir`/`seguimiento`/`encuestaEstado`/`subirFoto` sin rate-limit; `decryptAny` devuelve texto sin prefijo tal cual; descifrado fallido responde `ok:true`; `eliminarFoto` borra cualquier `equipos/*`; sin EXIF-strip en servidor; 1 usuario de auth sin `staff`; acceso sensible huérfano si el único JEFE con permiso se desactiva; sin MFA/lockout configurados.
- Arquitectura/datos (F4): topes por `count(*)` sin bloqueo (carreras); `check_tope_licencia_cuenta` con `limit 1` sin orden; `realtime.publish()` dentro de la transacción; sync de disponibilidad pisa `updated_by`; rate-limit sin purga; índices redundantes; `motivo_cierre` sin CHECK; `encuestas.created_by` sin trigger; RPC `reporte_tickets*` sin consumidor y reporte agregado en cliente; multi-escritura sin transacción (equipos, traspaso de cuenta, importación); errores `42501`/`P0001` crudos; dashboard con ≈25 requests y listados completos en memoria; dos listas de módulos; `ActividadView` limitada a 200 filas.
- Operación (F6): sin backups de plataforma; registro de migraciones/deploys desactualizado; deploy desde stash; `tests-db` y `deploy-manual` dependen del bug del CLI; rama de producción solo local; 2 stashes y ramas obsoletas.
- Negocio/ITIL (F1/F2): KB y Problemas con adopción mínima pese a 287 tickets; 0 rondas de encuesta; 6 cuentas con rotación pendiente; 11 tickets sin vincular; 346 comentarios internos vs 181 visibles; alta en 4 módulos.
