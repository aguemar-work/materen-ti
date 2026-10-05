# Anexo C — Índice de hallazgos de los Ciclos 1–20 (Fase 0, Ciclo 21)

Fuente: `docs/HISTORIAL-AUDITORIAS.md` (H = línea) y `docs/CHANGELOG.md` desde 2026-08-15 (CL = línea). Subagente, 2026-10-01. Sirve para NO repetir lo cerrado y para detectar regresiones.

## Avisos transversales
- El sistema visual auditado en los Ciclos 3, 4, 5, 14, 16, 17, 18, 19 y `design.pen` **fue retirado** (Carbon retirado 09-05; PrimeVue Unstyled + Tailwind desde 09-07; rediseño V2 09-22..09-25). Sus pendientes de CSS/diseño (UX6-02/04/09, ARQ-20, DR-05/06, DP-05, CC-07, A-03, DS-02, UX6-11) nunca se reconciliaron: tratarlos como "sin objeto / no reverificado".
- 4 de los 5 guardrails de diseño dejaron de correr en CI el 09-05; solo sigue `patrones-ui.mjs` (CL 606-607).
- La 088 cita en su cabecera un "Ciclo 21" y un hallazgo `CREDENCIALES-VER-DUPLICADO` que no existen en el historial; la invariante 4 de `AGENTS.md` (rama rediseno) sigue describiendo la función SQL como vigente.

## Hallazgos (resumen por ciclo; detalle completo en HISTORIAL-AUDITORIAS.md)
| ID | Ciclo | Título corto | Sev | Estado | Ref | H |
|---|---|---|---|---|---|---|
| H-CRIT | 1 | Auto-registro creaba staff activo | Crítica | Corregido | toml + 018 | 37 |
| H-01/H-12a | 1 | Reabrir solo JEFE evadible | Media | Corregido | 019 | 38 |
| H-02 | 1 | Rate-limit DNI evadible por XFF | Media | Mitigado | tickets.ts | 39 |
| H-03 | 1 | Adjuntos sin validación | Media | Corregido | tickets.ts | 40 |
| H-04 | 1 | Contraseña staff mín 6 | Media | Corregido | toml | 41 |
| H-05 | 1 | Revelado sin throttle | Alta | Corregido | 40/5 min | 42 |
| H-06 | 1 | UPDATE sin WITH CHECK | Baja/Media | Corregido parcial | 019, 061 | 43 |
| H-07 | 1 | Interpolación filtro PostgREST | Baja | Corregido | sanitizar.js | 44 |
| H-08 | 1 | DNI expone tokens de tickets | Baja/Media | **Aceptado** | — | 45 |
| H-09..H-12b | 1 | SDK latest, texto plano, .env.local, imports sin versión | Baja | Corregidos | — | 46-51 |
| T-01, S-01, S-02, A-01, D-01, Q-04, S-04, T-05, P-01, P-02, A-02, U-02, D-06, S-05/06, U-03/04, P-04, D-04/05, U-06, A-06, U-07 | 2 | (varios, ver H 67-109) | Alta/Media | Resueltos | — | 67-109 |
| Q-01 | 2 | Checks verdes sin verificar | Alta | Mitigado; `tests-db` ciego desde 08-21 | ci.yml | 70 |
| S-03/T-02 | 2 | Sin CHECK de prefijo cifrado | Alta | Cerrado por V2-12 (086) | — | 74 |
| T-04 | 2 | Reporte tickets sin cota de filas | Media | **Abierto parcial** | reportesTickets.js | 85 |
| U-05 | 2 | Cierre sin resumen → KB vacío | Media | **Abierto** | ticketDetalle.js | 87 |
| Q-02/Q-03 | 2 | Sin tests componentes/domains | Media | Parcial | tests/componentes | 91 |
| D-02/D-03 | 2 | Deploy sin control de versión | Media | Parcial (deploy-manual roto) | 069/070 | 93 |
| W-05 | 2 | Diagrama de arquitectura | Baja | **Abierto** | — | 94 |
| A-03 | 2 | main.css monolítico | Media | sin objeto | — | 97 |
| A-05/W-04/Q-05 | 2 | Sin ADR | Baja | Parcial | — | 101 |
| T-03 | 2 | Sin backup/RPO | Media | **Abierto** | — | 102 |
| Q-06 | 2 | encuestas.ts sin test | Media | Prob. cerrado (Ciclo 20) | — | 104 |
| W-06 | 2 | Sin changelog de producto | Baja | **Abierto** | — | 105 |
| A-07 | 2 | Dos sistemas de encuesta | Baja | **Abierto** (decisión) | — | 107 |
| DS-01..05 | 3 | Design system | — | Resueltos/sin objeto | — | 127-131 |
| UX4-01..54 | 4 | Superficie UI/UX | — | Resueltos | — | 270-339 |
| UX5-01..13 | 5 | Reconciliación DS | — | Resueltos | — | 356-368 |
| BA-01..04 | 6 | SD con EXECUTE PUBLIC, `_test_reporte_*`, 61 FK sin índice, dead tuples | Crít/Warn | Resueltos | 062 | 393-396 |
| BA-05 | 7 | 10 SD "dangerous" por GRANT a authenticated | Crítica×10 | **Aceptado** | — | 419 |
| BA-06 | 7 | 11 tablas RLS solo SELECT | Info | **Aceptado** | — | 420 |
| BA-07/08 | 7 | auth.uid() sin subquery; staff_nombres pública | — | Resueltos | 063 | 421-422 |
| V-01..07 | 8 | URL real en docs, despliegue no verificable, módulos solo UI, token entrega en claro, log sin ip/ua, fotos sin validación | — | Resueltos (V-02 parcial) | 064-068 | 446-452 |
| BA-09, C9-drift | 9 | tickets dead tuples; 064-070 nunca aplicadas | — | Resueltos | 071 | 464-509 |
| P0-01..03 | 10 | equipos-fotos sin desplegar; functions viejas; 068 solo 3 módulos | Alta | Resueltos | 072 | 541-543 |
| P0-04 | 10 | Smoke tests sin secrets | Alta | **Parcial** (secrets 08-24; cron pendiente; test de sincronía se salta) | ci.yml | 544 |
| P0-05, C11-doc | 11 | tiene_permiso_modulo sin REVOKE; cuenta CI | — | Resueltos | 073 | 597-606 |
| PERM-060-064 | 12 | 064 perdió valores del CHECK | Alta | Aplicada 074; **sin e2e** | 074 | 625 |
| H-CRIT-056-060 | 12 | handle_new_staff_user sin activo=false | Alta | Aplicada 076; **sin e2e** | 076 | 626 |
| EQ-FOTOS-01 | 13 | equipos-fotos sin gate de módulo | Alta | Resuelto | — | 663 |
| EQ-FOTOS-02 | 13 | MAX_FOTOS solo cliente | Baja | Mitigado; **CHECK en BD no hecho** | — | 664 |
| C13-e | 13 | CLI ignora INSFORGE_ACCESS_TOKEN en CI | Alta | **Abierto, "sin workaround"** | — | 671, 817-905 |
| ENTREGACREAR-TEST-BUG | 13 | test con cuentaIds [] | Baja | **Abierto** | — | 673 |
| CUENTA-PERSONAL-REVOCAR-01 | 13 | revocar no soft-borraba | Alta | Resuelto | 077 | 674 |
| TEST-DB-CRLF | 13 | test-db.mjs no CRLF-safe | Baja | **Abierto** | — | 675 |
| ACCESOS-SENSIBLES-UPDATE-DELETE-TEST | 13 | tests esperan error | Baja | **Abierto** | — | 678 |
| REPORTE-TICKETS-RPC-MUERTOS | 13 | RPC 053 nunca adoptados | Baja | **Abierto** | — | 679 |
| TICKET-EVENTOS-REASIGNADO-SIN-DETALLE | 13 | reasignado sin detalle | Baja | **Abierto** | — | 680 |
| EQUIPOS-TABLAS-SATELITE-SIN-GATE | 13 | 3 satélites | Media-Alta | Resuelto | 079 | 681 |
| EQUIPOS-BAJA-SIN-WHITELIST-DB | 13 | baja con portador | Media | Resuelto mínimo; 2 huecos | 080 | 682 |
| EMPLEADOS-SOFT-DELETE-MUERTO | 13 | softDeleteEmpleado sin caller | Baja | **Abierto** | — | 683 |
| EMPLEADOS-REINGRESO-DNI-SIN-MANEJO | 13 | DNI duplicado error crudo | Baja | Resuelto en código 09-24, fila no actualizada | — | 684 |
| EMPLEADOS-SIN-AUDITORIA | 13 | sin event log de empleados | Baja | **Abierto** | — | 686 |
| CUENTAS-TABLAS-SATELITE-SIN-GATE | 13 | plataformas/entregas | Media-Alta | Resuelto | 081 | 688 |
| CUENTAS-SIN-AUDITORIA-CRUD | 13 | CRUD de cuentas sin accesos_log | Baja | **Abierto** | — | 689 |
| ENTREGACREAR-RATELIMIT-BYPASS | 13 | enviar no cuenta | Baja | Resuelto (V2-01) | — | 690 |
| REVOCAR-CUENTA-LOGICA-DUPLICADA | 13 | 038 vs 077 | Baja | **Abierto** | — | 691 |
| ENTREGAS-JEFE-PUEDE-BORRAR | 13 | DELETE físico de entregas | Baja | **Abierto** | — | 692 |
| CREDENCIALES-REVELADO-DENEGADO-SIN-AUDITAR | 13 | 403 sin log | Baja | **Abierto** | — | 693 |
| TICKETS/PROBLEMAS-TABLAS-SATELITE | 13 | satélites | Media-Alta | Resueltos | 082/083 | 694-695 |
| C13-areas_obras | 13/20 | areas_obras sin gate | Media | Resuelto | 087 | 750 |
| C13-cat/ubic | 13 | categorias_ticket/ubicaciones en es_staff() | Media | **Pendiente decisión** | — | 752-761 |
| Pend-12 | — | redeploy manual equipos-fotos sin registrar | Doc | **Abierto** | — | 935 |
| Pend-13 | — | tickets `resuelto` invisibles en búsqueda pública | Baja | **Abierto** | — | 937 |
| Pend-34/35 | — | expect(error) genéricos; 3 tests PDF con guion largo | Baja | **Abierto/no reverificado** | — | 1024-1036 |
| Pend-36 | — | multi-empresa/multi-agencia | Roadmap | **Abierto** | — | 1040 |
| UX6-01..12 | 14 | UI/UX desde cero | — | Resueltos/sin objeto (V2) | — | 1079-1090 |
| C14-shared | 14 | components/shared sin verificar | — | **No reverificado** | — | 1057 |
| ARQ-01..08 | 15 | duplicaciones | Crít/Imp | Resueltos (05/08 parciales) | helpers | 1179-1186 |
| ARQ-09 | 15 | god-components | Importante | **Pendiente** | — | 1187 |
| ARQ-10 | 15 | shared importa staff | Importante | **Aceptado** | — | 1188 |
| ARQ-13 | 15 | useTicketDetalleLogica god-composable | Importante | **Pendiente (reducido)** | — | 1191 |
| ARQ-21/22 | 15 | carpetas Configuración; stores sin _peticionId | Opcional | **Pendiente** | — | 1199-1200 |
| DR-01..09, CC-01..10, FK-01..05, CB-01..10 | 16-19 | diseño/Carbon | — | Resueltos / sin objeto | — | 1240-1398 |
| CB-04 | 19 | revelado no se oculta solo | Alta (op.) | lógica rescatada en `useRevelado.js`; **no reverificado en V2** | — | 1383 |
| V2-01..15 | 20 | endurecimiento functions + 086 | — | Resueltos y desplegados 09-25 | 086 | 1533-1547 |
| V2-09 | 20 | realtime abierto a authenticated inactivo | Media | aplicada; comportamiento real **no confirmado** | 086 §2 | 1541 |
| V2-10 | 20 | siguiente_codigo_ticket PUBLIC | Baja | aplicada; verificación de creación de ticket no registrada | 086 §3 | 1542 |

## Pendientes abiertos al cierre del Ciclo 20
- **Alta**: bug de autenticación del CLI en CI (`tests-db`, `deploy-manual` fallan desde 08-21, ningún test SQL corre en CI; decisión "sin workaround", H 817-905); PERM-060-064 y H-CRIT-056-060 sin e2e autenticado (H 625-626); P0-04 (cron `secrets-smoke-pendientes`, test de sincronía saltado pese a cuentas desde 08-24, H 793-816); roadmap multi-empresa (H 1040).
- **Media**: T-04 sin `.limit()` y RPC 053 muertos; `categorias_ticket`/`ubicaciones`; huecos EQUIPOS-BAJA (H 959-969); EQ-FOTOS-02 CHECK; ARQ-09/13; W-05, W-06, A-07; U-05; V2-09/V2-10; tema oscuro retirado (CL 323-330); Licencias "Sin cupo" (CL 306-307).
- **Baja**: ENTREGACREAR-TEST-BUG, ACCESOS-SENSIBLES-UPDATE-DELETE-TEST, AUTH-TEST-004, TEST-DB-CRLF, TICKET-EVENTOS-REASIGNADO-SIN-DETALLE, EMPLEADOS-SOFT-DELETE-MUERTO, EMPLEADOS-SIN-AUDITORIA, CUENTAS-SIN-AUDITORIA-CRUD, REVOCAR-CUENTA-LOGICA-DUPLICADA, ENTREGAS-JEFE-PUEDE-BORRAR, CREDENCIALES-REVELADO-DENEGADO-SIN-AUDITAR, Pend-12, Pend-13, Pend-35, A-05, T-03, ARQ-21/22, UX6-02.

## Decisiones de producto registradas (no son defectos)
Sin registro público y staff nace inactivo (H 37, 626). H-08 DNI expone tokens (H 45). Sin correo desde 055 (H 68, 109); eventos `correo_fallido`/`encuesta_enviada` vestigiales (H 697-706). BA-05/BA-06 aceptados (H 419-420). SELECT de `empleados` sin gate (H 448, 687); `categorias_ticket`/`ubicaciones` en `es_staff()` hasta decidir (H 752-761). Bucket `equipos-fotos` público (H 452); no verificar `equipo_id` de la key (H 663). EQUIPOS-BAJA paridad con UI (H 682). "Sin workaround" al bug del CLI; deploy manual (H 878-884); `tests-db` no required (H 891-894). `deploy-manual` nunca automático, una migración por corrida (H 93). Sentry sin Replay/tracing (H 72). V2-08 `dar_baja_empleado` exige solo módulo `empleados` (H 1540). V2-12 `accesos_sensibles` sin soft-delete (H 1544). CB-04 copiar exige revelado con motivo (H 1383). ARQ-10, ARQ-05 (H 1188, 1183). Fichas a ancho completo; selector Tabla/Tarjetas retirado 09-25; tema oscuro retirado; "Todos" primero; Tickets Todos·Pendientes·Resueltos·Rechazados; filtros V2 con URL como verdad; pendientes del Dashboard no persistidos (CL 1348-1352); backlog por antigüedad retirado; fusión visual Resuelto/Cerrado; "Solo insatisfechos" = nivel ≤3; "Obra" sin dividir; Configuración no exclusiva de JEFE.

## Pendientes de despliegue / drift documentados
- 089 escrita, no aplicada (CL 60-63). 088 sin trackear, sin historial ni changelog.
- Rediseño V2 completo solo en `rediseno/sistema-visual`; sin constancia de merge a main ni deploy a Vercel.
- 086/087 aplicadas 09-24 (H 1494-1496); VALIDATE CONSTRAINT 09-25; 4 functions redesplegadas 09-25 (H 1508-1519).
- `tests-db` y `deploy-manual` no funcionan desde 08-21; `test-integration` corre con secrets desde 08-24.
- Pendiente 12: redeploy manual `equipos-fotos` 08-18 sin registrar.

## Ciclo 20 (2026-09-24/25) — resumen
Cubrió solo backend v2: las 4 functions y la 086. 15 hallazgos V2-01..V2-15 resueltos y desplegados. Dejó sin confirmar: rol real del cliente admin y policies realtime con `es_staff()` (H 1558-1564); creación de ticket tras 086 (H 1515-1516); seguimientos sugeridos (test anónimo de `siguiente_codigo_ticket`, extender `triggers.test.sql`); `typecheck:functions` no corrió localmente; `equipos-fotos` sin rate-limit; no tocó frontend V2 ni reconcilió filas de diseño sin objeto.
