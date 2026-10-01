# Anexo B — Ramas, migraciones por rama y worktrees (Fase 0, Ciclo 21)

Fuente: comandos git de solo lectura desde el checkout principal (subagente, 2026-10-01) + verificaciones propias del auditor (hashes de functions, `schema_migrations`, catálogo de la base).

**Contexto [Verificado]:** `main` local (`ffe61b0`) está 1 commit detrás de `origin/main` (`8356747` = PR #31). Worktrees: principal → `rediseno/sistema-visual` (7e413c3); `../materen-ti-main` → `docs/tiene-permiso-modulo-cobertura`; `../sistema-ti-v2` → `v2/tickets-f1` (c3e0d60). Los tres con working tree limpio salvo 2 archivos sin trackear en el principal.

## 1. Ramas de trabajo
| Rama | Último commit | +ahead/−behind main | origin/ | Estado |
|---|---|---|---|---|
| `rediseno/sistema-visual` | 2026-09-25 | +76 / −4 | **no existe** | Rediseño V2 completo (293 archivos). Le faltan #27–#30 de main (088, comentarios de credenciales.ts, AGENTS/README) |
| `release/v2` | 2026-09-26 | +80 / −4 | no existe | = rediseno + docs V2 + tests de caracterización; sin código de producto propio |
| `v2/tickets-f0` | 2026-09-26 | +79 / −4 | no existe | mergeada en release/v2 (820b210). Borrable |
| `v2/tickets-f1` | 2026-09-26 | +88 / −4 | no existe | release/v2 + migraciones 090–095 + Checkpoint 1; **no mergeada** |
| `sync/edge-functions-a-main` | 2026-09-26 | +4 / −3 | sync | en main por PR #28; residuo: 18 líneas de comentario |
| `sync/migraciones-084-087-a-main` | 2026-09-26 | +1 / −4 | sync | en main por PR #27; residuo 0 |
| `fix/credenciales-ver-duplicado-p0-04` | 2026-09-26 | +2 / −2 | sync | en main por PR #29 (trae 088) |
| `docs/tiene-permiso-modulo-cobertura` | 2026-09-26 | +1 / 0 | sync | en origin/main (#31), no en main local; toca ci.yml + smoke test |
| `security/*` (7) | ago-2026 | — | sync | migraciones 079–083 y gate de fotos ya en main (#19–#25) |
| `feature/*` (2) | ago-2026 | — | sync | en main (#11, #12) |
| `fix/cuentas-revocar-personal-soft-delete`, `fix/tickets-token-entrega-dead-code` | ago-2026 | — | sync | contenido en main (077, #14) |
| `refactor/arquitectura-frontend` | 2026-07-09 | 0 / −102 | sync | única `--merged main` |
| 13 `docs/*` | — | — | sync | mergeadas por squash, solo documentación |
| `docs/flujo-empleados-correcciones` (local) | — | +35 vs su remoto | desviada | el puntero local apunta a la cadena del rediseño (ancestro de rediseno); no es una rama de docs |
| `rescate/*`, `chore/design-system-blue-docs`, `archive/*` | ago-2026 | — | sin remoto | rescates no integrados |

## 2. Migraciones por rama (`git ls-tree`)
| Nº | main / origin/main | rediseno | release/v2 | v2/tickets-f1 |
|---|---|---|---|---|
| 075 | `migrations/` | `rollback/` (idéntica) | rollback/ | rollback/ |
| 076–087 | ✔ | ✔ | ✔ | ✔ |
| 088 | ✔ (#29) | **—** | **—** | **—** |
| 089 `tickets_resuelto_at` | **—** | ✔ | ✔ | ✔ |
| 090–095 (+6 rollbacks) | — | — | — | ✔ |

Mismo número con contenido distinto: **ninguno** [Verificado].

## 3. Estado real de la base de producción (consulta en vivo 2026-10-01) [Verificado]
- `public.schema_migrations`: 84 filas, última registrada **085** (2026-09-05).
- **086 aplicada y no registrada**: `cerrar_ticket`, `dar_baja_empleado`, `reporte_*` tienen `tiene_permiso_modulo` en su cuerpo; `siguiente_codigo_ticket` sin EXECUTE a PUBLIC; CHECK `cuentas_password_formato_cifrado`, `licencias_clave_formato_cifrado`, `accesos_sensibles_password_formato_cifrado` presentes.
- **087 aplicada y no registrada**: policies de `areas_obras` usan `tiene_permiso_modulo('empleados')`.
- **088 aplicada y no registrada**: `tiene_permiso_credenciales_ver` no existe en `pg_proc`.
- **089 NO aplicada**: `tickets` no tiene columna `resuelto_at`.
- Branch InsForge `v2` (worktree sistema-ti-v2) es un proyecto distinto; 090–095 solo allí.

## 4. Edge functions: código desplegado vs ramas [Verificado]
Hash sha256 de `functions.definitions.code` en producción (2026-09-25) comparado con `git show <rama>:functions/<f>.ts`:
- `tickets`, `encuestas`, `equipos-fotos`: desplegado == main == rediseno == release/v2 (byte a byte, CRLF).
- `credenciales`: el desplegado coincide con **`stash@{0}`** (03b3785, "credenciales-ver-duplicado + P0-04", 2026-09-25), no con ningún commit. Diferencia contra `origin/main`: **1 línea de comentario** ("Ciclo 21" vs "Ciclo 14"). Lógica idéntica a main.
- `v2/tickets-f1` cambia `tickets.ts` (+28/−7): `rol_actor='usuario'`, `encuestaVigente()`, responder exige `estado='cerrado'`.
- `public.function_deploys`: última fila 2026-08-20; los redeploys del 2026-09-25 (confirmados por `system.audit_logs` UPDATE_FUNCTION ×32, último 2026-09-25T21:34) **no quedaron registrados**. Incluye una fila de `personal-registro`, function eliminada (DELETE_FUNCTION ×2, 2026-08-29).

## 5. Working tree del checkout principal
- `migrations/088_…sql` sin trackear: idéntico byte a byte a `main:migrations/088_…` [Verificado]. Bloquearía un `git merge main` en rediseno ("untracked working tree file would be overwritten").
- `docs/PLAN-V2-TICKETS.md` sin trackear: idéntico al commiteado en release/v2 y v2/tickets-f1 [Verificado].
- `rediseno/sistema-visual` conserva `frontend/tests/integration/permisos-credenciales-sincronizados.smoke.test.js` (llama por RPC a la función que 088 eliminó); main ya no lo tiene.
- `main` sigue enviando `functions/personal-registro.ts`, `frontend/src/modules/personal/` y las rutas `/personal-registro(s)` aunque la 084 (en main) borró sus tablas; el retiro del código vive solo en rediseno (3f6e3bf). Igual con el fix del HTTP 414 de Equipos (migración 085).

## 6. Worktree V2 (`v2/tickets-f1`) [Verificado en docs del worktree]
- Checkpoint 0 aprobado 2026-09-26 y mergeado en release/v2. A1–A7 y A9 confirmados; A8 (encuesta por cada cierre) con valor por defecto sin confirmar.
- Checkpoint 1 (F1 "Modelo de datos correcto") escrito y cerrado en v2/tickets-f1, **pendiente de aprobación**. 090–095 aplicadas solo en la branch InsForge `v2`. Decisiones nuevas abiertas: N1 (cambio de prioridad reinicia el reloj), N2 (reloj en horario laboral o corrido).
- 090 `prioridad_rango` generada; 091 eventos con `campo/valor_anterior/valor_nuevo/rol_actor` + backfill `legado`; 092 estado `en_espera_usuario`, `resuelto` separado de `cerrado`, `nota_resolucion`, `motivo_rechazo`, `ticket_duplicado_de`, `motivo_reapertura`, `cerrado_at`, `cerrado_por`; 093 `ticket_contexto_actor` (rol por `txid_current()`), RPC `resolver_ticket`, `rechazar_ticket`, `reabrir_ticket`, `pedir_informacion`, `reasignar_ticket(s)`, funciones de USUARIO `confirmar_cierre_usuario`, `rechazar_cierre_usuario`, `responder_usuario`, **DROP `cerrar_ticket`**; 094 `config_tiempo_atencion`, `ticket_pausas`, reloj; 095 `ticket_satisfaccion.cierre_numero/anulada_at`, una encuesta por cierre.
- Acoplamiento: frontend f1 y 092–095 se despliegan juntos (la app publicada llama a `cerrar_ticket`, que 093 elimina).
- `release/v2` vs `rediseno/sistema-visual`: 9 archivos, ninguno de código de producto; no diverge fuera de tickets.

## 7. Diagnóstico de ramas
| Rama | Qué tiene que main no | Riesgo si se despliega main tal cual | Recomendación |
|---|---|---|---|
| `rediseno/sistema-visual` | rediseño completo, retiro de Personal, 089, docs V2 | **Alto**: main sirve rutas y function contra tablas borradas en producción; frontend de main es del 26-08 mientras la base corre 088 | mergear main en rediseno (resolver AGENTS/README/credenciales.ts/PANORAMA), eliminar el smoke test huérfano, aplicar y registrar 089, registrar 086–088, publicar la rama |
| `release/v2`, `v2/tickets-f1` | plan V2 | no desplegable parcialmente | mantener; aprobar Checkpoint 1 → merge --no-ff |
| `v2/tickets-f0`, `sync/*`, `fix/*`, `security/*`, `feature/*`, `refactor/*`, 13 `docs/*` | nada funcional | — | borrar local + remoto |
| `docs/flujo-empleados-correcciones` (local) | puntero desviado | — | borrar puntero local |
| `rescate/*`, `chore/*`, `archive/*` | rescates no integrados | — | confirmar con el dueño y cerrar |
