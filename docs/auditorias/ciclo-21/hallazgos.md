# Ciclo 21 — Hallazgos acumulados

Formato: ver encargo del ciclo. Se agregan por fase. IDs `C21-<ÁREA>-NNN`. Áreas: NEG (Negocio) · ITIL · SEC (Seguridad) · ARQ (Arquitectura) · DAT (Datos) · UX · OPS (Operación) · CUM (Cumplimiento) · DOC (Documentación, subárea de Operación).

## Fase 0 — Reconocimiento (2026-10-01)

### C21-OPS-001 — `main` desacoplado de producción; la rama que casa con la base real existe solo en local
| Campo | Contenido |
|---|---|
| Área | Operación |
| Severidad | **Alta** |
| Estado de evidencia | [Verificado] |
| Evidencia | `git branch -a` (sin `origin/rediseno/*`, `origin/release/v2`, `origin/v2/*`); `git ls-tree main migrations/` (088 sí, 089 no) vs `rediseno` (089 sí, 088 no); `git grep personal main -- frontend/src/router` (rutas `/personal-registro(s)` vivas en main); `main:functions/personal-registro.ts` existe; producción: `tiene_permiso_credenciales_ver` ausente (088 aplicada), `tickets.resuelto_at` ausente (089 no aplicada), tablas `personal_registros*` ausentes (084). Anexo B §2–§5 |
| Descripción | La base de producción corre el esquema de 088; el frontend y la function `personal-registro` que `main` aún contiene referencian tablas borradas en 084; el rediseño V2 (76 commits, 293 archivos) y la 089 solo existen en el disco de una máquina. `main` y `rediseno` divergen en migraciones (088 ↔ 089) sin que ninguna rama tenga las dos |
| Impacto en el negocio | Un deploy de `main` tal cual publica rutas rotas y una function contra tablas inexistentes; una falla de disco pierde el rediseño completo; el próximo merge puede saltarse o duplicar una migración |
| Recomendación | Publicar `rediseno/sistema-visual` al remoto hoy; mergear `main` en rediseno (resolver AGENTS/README/credenciales.ts, borrar el smoke test huérfano y los 2 untracked); dejar una sola secuencia 088→089; aplicar y registrar 089; abrir PR a main. Definir en `docs/V2-ORGANIZACION.md` que la rama de integración siempre existe en el remoto |
| Esfuerzo | M |
| Práctica ITIL | Habilitación de cambios / Gestión de despliegues |
| Relación con plan V2 | **Parcial**: V2-ORGANIZACION fija ramas pero no exige remoto ni resuelve main |
| Regresión de | Invariante "commit antes que producción" (docs/invariante-commit-antes-que-produccion, Ciclo 13) |

### C21-OPS-002 — Los registros de migraciones y deploys no reflejan producción
| Campo | Contenido |
|---|---|
| Área | Operación |
| Severidad | Media |
| Estado de evidencia | [Verificado] |
| Evidencia | `public.schema_migrations`: última `085` (2026-09-05); objetos de 086/087/088 presentes en `pg_proc`/`pg_policies`/`pg_constraint`. `public.function_deploys`: última fila 2026-08-20 y una fila de `personal-registro` (function eliminada); `system.audit_logs`: 32 `UPDATE_FUNCTION`, último 2026-09-25 21:34. `ci.yml:273-313`: el registro solo lo hace `deploy-manual`, que no funciona (C13-e). `AGENTS.md` describe ambas tablas como fuente de verdad de "qué está aplicado y desplegado" |
| Descripción | La única evidencia estructurada de qué corre en producción está tres migraciones y seis semanas de deploys atrás. La acción `version` de las functions lee esas tablas y por tanto también miente |
| Impacto | Imposible auditar o reconstruir el estado de producción sin consultar catálogos; el riesgo de reaplicar o saltarse una migración recae en la memoria de una persona |
| Recomendación | Registrar ahora 086/087/088 con `aplicada_por='reconciliacion-ciclo-21'`; hacer que `scripts/apply-migration.mjs` y un script `functions-deploy.mjs` registren siempre (también desde el CLI local), y que `version` compare el hash en `functions.definitions` con el registrado |
| Esfuerzo | S |
| Práctica ITIL | Gestión de la configuración / Habilitación de cambios |
| Relación con plan V2 | No lo toca |
| Regresión de | V-02 (Ciclo 8), MIGR-072-TRACKING (Ciclo 13), Pend-12 |

### C21-OPS-003 — La function `credenciales` en producción se desplegó desde un stash sin commit
| Campo | Contenido |
|---|---|
| Área | Operación |
| Severidad | Media (riesgo de proceso; la lógica desplegada es igual a `main`) |
| Estado de evidencia | [Verificado] |
| Evidencia | sha256 de `functions.definitions.code` (`467eb4a1…`, 2026-09-25 21:34) == `git show stash@{0}:functions/credenciales.ts` con CRLF; ≠ todo commit de todas las ramas. `git diff origin/main 03b3785 -- functions/credenciales.ts` = 1 línea de comentario |
| Descripción | El código que descifra contraseñas en producción no corresponde a ningún commit. Hoy la diferencia es cosmética; el mecanismo que lo permitió (deploy desde working tree) es el mismo que en el futuro desplegaría una lógica no revisada |
| Impacto | Trazabilidad rota de la pieza más sensible del sistema; `function_deploys` tampoco lo registró |
| Recomendación | Redesplegar `credenciales` desde el commit de `main` tras el merge de C21-OPS-001 y registrarlo; adoptar la regla "deploy solo desde un commit en el remoto" en AGENTS.md y hacerla cumplir en el script de deploy (rechazar working tree sucio) |
| Esfuerzo | S |
| Práctica ITIL | Habilitación de cambios |
| Relación con plan V2 | No lo toca |
| Regresión de | docs/invariante-commit-antes-que-produccion (Ciclo 13) |

### C21-OPS-004 — Sin ningún backup registrado en la plataforma
| Campo | Contenido |
|---|---|
| Área | Operación |
| Severidad | **Alta** |
| Estado de evidencia | [Verificado] que `system.database_backups` está vacío; [Inferido] que no exista un respaldo externo |
| Evidencia | `select … from system.database_backups` → 0 filas (2026-10-01); HISTORIAL T-03 abierto desde 2026-08-05 |
| Descripción | La base contiene el historial de asignaciones (propósito central del sistema), 879 eventos de auditoría, 287 tickets y las credenciales cifradas de 177 cuentas. No hay evidencia de respaldo ni de restauración probada |
| Impacto | Una pérdida o corrupción (incluida una migración mal aplicada, ya ocurrió en 031) es irrecuperable |
| Recomendación | Activar backups de plataforma con retención ≥30 días y programar un `pg_dump` externo cifrado; documentar RPO/RTO y hacer una restauración de prueba en la branch `v2`. Se desarrolla en Fase 6 |
| Esfuerzo | S (activar) / M (probar restauración) |
| Práctica ITIL | Continuidad del servicio |
| Relación con plan V2 | No lo toca |
| Regresión de | — (T-03 nunca cerrado) |

### C21-DOC-001 — `PANORAMA-SISTEMA.md` §1–§3 tiene al menos 20 afirmaciones que el esquema real contradice
| Campo | Contenido |
|---|---|
| Área | Operación (documentación) |
| Severidad | Media |
| Estado de evidencia | [Verificado] |
| Evidencia | Tabla 0.4 de `00-reconocimiento.md` (D-04…D-13, D-18, D-21) y anexo D §7 |
| Descripción | El documento que el contrato del proyecto declara "verificado contra la base real" no se reverificó desde 2026-07-29; cambios de 048/049, 072, 079–088 no están reflejados; contradicciones internas sobre hard delete, SECURITY DEFINER y triggers de autor |
| Impacto | Quien diseñe sobre el panorama (incluido el plan V2, regla 11) parte de permisos y triggers que no son los reales |
| Recomendación | Reverificación completa en vivo con el procedimiento de este anexo D (consultas listadas) y fecha nueva; agregar al CI un check que compare `pg_policies`/`pg_trigger` contra una lista versionada |
| Esfuerzo | M |
| Práctica ITIL | Gestión del conocimiento / Gestión de la configuración |
| Relación con plan V2 | **Parcial**: regla 11 del plan actualiza PANORAMA por fase, pero solo para tickets |
| Regresión de | W-01/W-02 (Ciclo 2) |

### C21-DOC-002 — `AGENTS.md` y el test de sincronía de la rama de trabajo describen una función SQL que ya no existe
| Campo | Contenido |
|---|---|
| Área | Operación (documentación) |
| Severidad | Media |
| Estado de evidencia | [Verificado] |
| Evidencia | `AGENTS.md` invariante 4 (rediseno); `frontend/tests/integration/permisos-credenciales-sincronizados.smoke.test.js:152,218,239` (rediseno); `pg_proc` sin `tiene_permiso_credenciales_ver`; `origin/main` #29/#30 ya corregido; `migrations/088` cabecera cita "Ciclo 21 / CREDENCIALES-VER-DUPLICADO" inexistentes. También: helper 3 nombra `TicketComentarios.vue`/`TicketHistorial.vue` inexistentes; "26 consumidores" de Modal (son 25) |
| Descripción | La rama donde se construye la V2 instruye a cualquier agente a mantener sincronizadas dos implementaciones de las que una fue eliminada, y conserva un test que, si P0-04 se destraba, fallará por RPC inexistente |
| Impacto | Trabajo futuro guiado por una invariante falsa; riesgo de "recrear" la función SQL por obediencia a AGENTS |
| Recomendación | Al mergear main (C21-OPS-001) tomar la versión de main de AGENTS/README y borrar el test; corregir helper 3 y el conteo; renombrar la referencia de la 088 al ciclo real (Ciclo 14 / PR #29) |
| Esfuerzo | S |
| Práctica ITIL | Gestión del conocimiento |
| Relación con plan V2 | No lo toca (el plan prohíbe tocar la 088 y `credenciales.ts`) |
| Regresión de | — |

### C21-DOC-003 — El modelo de notificaciones documentado (4 eventos) es la mitad del real (8)
| Campo | Contenido |
|---|---|
| Área | Operación (documentación) |
| Severidad | Baja |
| Estado de evidencia | [Verificado] |
| Evidencia | README L171/L510; PANORAMA L131/134/286/329; `pg_constraint notificaciones_tipo_check` (8 valores); migraciones 048/049 |
| Descripción | README y PANORAMA repiten en 5 lugares "4 eventos concretos"; desde 049 existen avisos personales por asignación, cambio de estado y comentario |
| Impacto | La Fase 4 (dos mecanismos de avisos) debe partir del modelo real; la documentación induce a crear un tercer mecanismo |
| Recomendación | Corregir las 5 menciones y documentar la regla de `destinatario_id` |
| Esfuerzo | S |
| Relación con plan V2 | **Parcial**: F2 del plan agrega reavisos sobre `notificaciones` |

### C21-DOC-004 — Filas del historial de auditorías sin reconciliar tras el rediseño
| Campo | Contenido |
|---|---|
| Área | Operación (documentación) |
| Severidad | Baja |
| Estado de evidencia | [Verificado] |
| Evidencia | Anexo C "Avisos transversales" y D-15/D-16 |
| Descripción | ≥10 pendientes de diseño de los Ciclos 3–19 quedaron sin objeto al retirar Carbon/`main.css`; EQ-FOTOS-02 y EMPLEADOS-REINGRESO-DNI figuran abiertos aunque se resolvieron; Ciclo 20 declara "sin pendientes" con 089 sin aplicar |
| Impacto | El registro de mejora continua pierde valor como fuente de verdad (ver Fase 2, práctica de mejora continua) |
| Recomendación | Pasada de reconciliación con estado "sin objeto (rediseño V2)" y fecha; regla: cada retiro de sistema visual cierra sus filas |
| Esfuerzo | S |
| Relación con plan V2 | No lo toca |

### C21-DAT-001 — Un usuario de `auth.users` sin fila en `staff`
| Campo | Contenido |
|---|---|
| Área | Datos / Seguridad |
| Severidad | Baja (a confirmar en Fase 3) |
| Estado de evidencia | [Verificado] el conteo; [Inferido] el origen |
| Evidencia | `auth.users` 11 vs `staff` 10; `select count(*) from auth.users u where not exists (select 1 from staff s where s.user_id=u.id)` = 1; `system.audit_logs` DELETE_USERS ×2 el 2026-09-29 |
| Descripción | Existe una identidad que puede autenticarse (si está verificada) pero no es staff; el frontend la expulsa (`auth.js:161`) y RLS le niega todo, pero figura en el padrón de autenticación |
| Impacto | Cuenta huérfana sin dueño conocido; posible resto de pruebas |
| Recomendación | Identificar desde el dashboard de InsForge y eliminar o documentar (p. ej. cuenta de CI anterior) |
| Esfuerzo | S |
| Relación con plan V2 | No lo toca |

## Plan de mejora (2026-10-01)

Con el reconocimiento cerrado, el dueño pidió un plan de mejora con libertad para una nueva versión del sistema. Está en [`PLAN-DE-MEJORA.md`](PLAN-DE-MEJORA.md): tesis "Expediente", reglas de diseño 14–25, modelo de dominio en migraciones 099–110, seguridad, operación, medición, hoja de ruta en tres horizontes y cuestionamiento de decisiones. Los hallazgos de esta tabla que el plan cubre se marcan con su ítem (H1-x, H2-x, H3-x) al avanzar las fases siguientes.
