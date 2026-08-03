# Panorama del sistema — Materen · Sistema TI

**Revisión:** 2026-07-29. Todo lo descrito acá fue verificado en vivo contra la base de datos real (`information_schema`, `pg_policies`, `pg_trigger`, `pg_proc`) y contra el código actual del repo — no se documentó de memoria. Donde el código/comentarios dicen algo distinto de lo que la base contiene, se marca explícitamente con **⚠ Discrepancia**.

---

## 1. Arquitectura general

**Backend:** InsForge (BaaS sobre Postgres). Sin ORM: el frontend habla con la base vía **PostgREST** (`getClient().database.from(...)`), autorizado por **Row Level Security** en cada tabla. El cliente CLI (`project_admin`) usado para migraciones y para `scripts/test-db.mjs` **bypasea RLS** (ver §6) — solo el navegador con un JWT de usuario real ejercita las políticas.

**Qué pasa por RLS directo vs. por edge function:**
- La inmensa mayoría de CRUD (empleados, cuentas, equipos, licencias, tickets ya creados, KB, problemas, catálogos) es `select/insert/update` directo desde el frontend, gateado por policies que llaman a `es_jefe()`/`es_staff()`.
- Dos **edge functions** (`functions/tickets.ts`, `functions/credenciales.ts`) concentran todo lo que no puede resolverse con RLS porque exige un cliente admin o lógica que no es "¿este rol puede tocar esta fila?":
  - **`tickets`**: única vía para *crear* un ticket (tabla `tickets` no tiene policy de INSERT para el cliente), seguimiento público por token, encuesta de satisfacción, búsqueda pública por DNI (con rate-limit), envío de la encuesta. Corre con `createAdminClient`, nunca con la sesión del usuario público.
  - **`credenciales`**: único punto donde se cifra/descifra una contraseña (AES-256-GCM, claves en secrets del servidor — `CRED_KEY_V2`, `CRED_KEY_LEGACY`, `CRED_KEY_SENSIBLE` — nunca llegan al navegador), donde se genera y abre una "entrega" de un solo uso, y donde vive el módulo de accesos sensibles (control más estricto que RLS: rol JEFE **y** fila en `accesos_sensibles_permisos`).
- Un solo RPC de negocio expuesto al cliente: `kb_registrar_feedback` (función `SECURITY DEFINER` angosta que solo toca `util_si`/`util_no` de un artículo — ver migración 032, §6).

**Convenciones que rigen todo el proyecto** (verificadas en el esquema real, no solo en comentarios):
- **Softdelete** con `deleted_at timestamptz` en casi toda tabla catálogo/transaccional (`empleados`, `cuentas`, `equipos`, `licencias`, `kb_articulos`, `problemas`, `acciones_correctivas`, catálogos, etc.). DELETE físico reservado a `es_jefe()` vía RLS. Excepciones reales sin `deleted_at`: `tickets`, `ticket_*`, `asignaciones_*`, `eventos_equipo`, `accesos_log`, `entregas`, `staff` — todas son historial/auditoría o llevan su propio cierre por fecha (`fecha_fin`), no por borrado.
- **Trazabilidad por trigger**: `created_by`/`updated_by` (o `created_by` solo, o `autor_id` en `ticket_comentarios`) los pone siempre un trigger `BEFORE INSERT/UPDATE` (`set_created_updated_by()`, `set_created_by_only()`, `set_autor_id_only()`), nunca el cliente. `updated_at` vía `set_updated_at()` en toda tabla con esa columna.
- **`text` + `CHECK` en vez de enum nativo**: confirmado como el patrón dominante (`tickets.estado/prioridad/origen/nivel_atencion`, `equipos.estado`, `cuentas.tipo_cuenta`, `kb_articulos.estado`, `problemas.estado/severidad`, `acciones_correctivas.estado`, `accesos_sensibles.categoria`, `accesos_log.accion`, `eventos_equipo.evento`, `ticket_eventos.evento`, `licencias.tipo`).
  - **⚠ Discrepancia con la convención**: `staff.rol` (`staff_rol`: `JEFE`, `ASISTENTE`) y `empleados.estado` (`estado_empleado`: `Activo`, `Inactivo`, `Suspendido`) son **enums nativos de Postgres**, no `text + check`. Son las dos tablas más antiguas del esquema (migraciones 001/002), de antes de que la convención quedara establecida; el resto de +25 tablas posteriores sí la sigue. No es un bug, pero si se documenta la convención como universal hay que anotar esta excepción histórica.
- **Roles**: `JEFE` y `ASISTENTE` (valores reales de `staff.rol`). Dos funciones `SECURITY DEFINER STABLE` centralizan el chequeo: `es_jefe()` (`rol = 'JEFE' and activo`) y `es_staff()` (cualquier fila de `staff` con `activo = true`, sin importar el rol). Casi toda policy usa una de las dos. (El getter `esStaff` del store Pinia de auth solo verifica "hay sesión", no es el mismo concepto que el rol `ASISTENTE` — no confundir.)

---

## 2. Modelo de datos completo

31 tablas en `public`, todas reales. (Hasta 2026-07-31 hubo 3 tablas huérfanas de prueba — `test_probe`, `test_probe2`, `test_probe3`, sin ninguna referencia en el código — eliminadas por migración 034 tras confirmar que estaban vacías; ver §7.) RLS está **activado (`ON`)** en las 31 tablas; ninguna usa `FORCE ROW LEVEL SECURITY` (irrelevante en la práctica porque la única conexión con privilegio elevado, `project_admin`, bypasea RLS igual — ver §6).

Leyenda de la columna RLS: `staff` = `es_staff()`, `jefe` = `es_jefe()`. Cuando una operación no aparece, no hay policy para ella y solo puede hacerse con el cliente admin (edge function) o vía trigger `SECURITY DEFINER`.

### Núcleo: empleados y organización

| Tabla | Columnas clave | FKs | RLS (ver/crear/editar/eliminar) |
|---|---|---|---|
| `empresas` | nombre, ruc | — | staff / staff / staff / jefe |
| `areas_obras` | nombre, descripcion | — | staff / staff / staff / jefe |
| `ubicaciones` | nombre, descripcion | — | staff / staff / staff / jefe |
| `empleados` | nombres, apellidos, dni, telefono, whatsapp, correo_personal, cargo, `estado` (enum), fecha_alta | `empresa_id→empresas`, `area_obra_id→areas_obras` | staff / staff / staff / jefe |

### Credenciales (cuentas y plataformas)

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `plataformas` | nombre, icono | — | staff / staff / staff / jefe |
| `cuentas` | usuario, `password` (cifrado, nunca en claro), url, `tipo_cuenta` (personal/reutilizable/compartida), `requiere_rotacion`, `last_password_change` | `plataforma_id→plataformas` | staff / staff / staff / jefe |
| `asignaciones_cuenta` | fecha_inicio, fecha_fin, notas | `cuenta_id→cuentas`, `empleado_id→empleados` | staff (ver/crear/cerrar) / jefe elimina |
| `accesos_log` | user_id, user_email, cuenta_usuario, plataforma, `accion` (ver/copiar/enviar/entrega_creada/entrega_abierta/creado/editado/eliminado), detalle | `cuenta_id→cuentas` | **solo jefe ve**; insert únicamente vía edge function admin (sin policy INSERT) |
| `entregas` | token, empleado_nombre, `payload` (cifrado), expires_at, viewed_at | `empleado_id→empleados` | staff ve, jefe elimina; insert/update (marcar `viewed_at`) solo por edge function admin |

### Licencias

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `licencias` | software, `tipo` (suscripcion/perpetua), cantidad (asientos), proveedor, fecha_vencimiento, costo, `clave` (cifrada), renovacion_meses | `empresa_id→empresas`, `cuenta_id→cuentas` (cuenta-login de la licencia) | staff / staff / staff / jefe |
| `asignaciones_licencia` | fecha_inicio, fecha_fin, notas | `licencia_id→licencias`, `empleado_id→empleados` | staff (ver/crear/cerrar) / jefe elimina |

### Equipos

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `tipos_equipo` | nombre, campos_spec (jsonb), accesorios_sugeridos (jsonb) | — | staff / staff / staff / jefe |
| `catalogo_almacen` | codigo, descripcion | — | staff / staff / staff / jefe |
| `equipos` | codigo, marca, modelo, serie, `estado` (operativo/en_reparacion/de_baja/perdido), specs (jsonb), accesorios (jsonb), fotos (jsonb), codigo_almacen | `tipo_id→tipos_equipo`, `empresa_id→empresas` | staff / staff / staff / jefe |
| `equipo_accesorios` | codigo, descripcion, cantidad (1–999), orden | `equipo_id→equipos`, `catalogo_id→catalogo_almacen` | staff (ver/crear/editar/**borrar** — nota: acá el borrado físico es de staff, no solo jefe, único caso así en todo el esquema) |
| `asignaciones_equipo` | fecha_inicio, fecha_fin, condicion_entrega/devolucion, motivo_cierre; CHECK: exactamente uno de `empleado_id`/`ubicacion_id` | `equipo_id→equipos`, `empleado_id→empleados`, `ubicacion_id→ubicaciones` | staff (ver/crear/cerrar) / jefe elimina |
| `eventos_equipo` | evento (registrado/asignado/devuelto/estado_cambiado), detalle, user_email | `equipo_id→equipos` | **solo staff ve**; insert exclusivamente por triggers vía `log_evento_equipo()` `SECURITY DEFINER` |

### Tickets (mesa de ayuda)

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `categorias_ticket` | id (text, "tipo de solicitud" nivel 1), nombre | — | staff / staff / staff / jefe |
| `subcategorias_ticket` | nombre | `categoria_id→categorias_ticket` | staff / staff / staff / jefe |
| `tickets` | codigo, token, titulo, descripcion, `origen` (empleado/staff_interno), `estado` (abierto/en_progreso/resuelto/cerrado/reabierto/rechazado), `prioridad` (baja/media/alta/urgente), `nivel_atencion` (N1/N2/N3), vinculado, contacto_ingresado, adjunto_url/key | `empleado_id`, `categoria_id`, `subcategoria_id`, `equipo_id`, `cuenta_id`, `licencia_id` | **staff ve/edita; sin policy de INSERT ni DELETE** — crear es exclusivo de la edge function `tickets`, y no hay borrado (ni físico ni soft: no tiene `deleted_at`, el historial es permanente) |
| `ticket_comentarios` | mensaje, `interno` (bool) | `ticket_id→tickets` | staff ve/crea; **sin policy de UPDATE/DELETE** — un comentario es inmutable una vez creado, ni el jefe lo edita o borra por RLS |
| `ticket_eventos` | evento (creado/reasignado/estado_cambiado/prioridad_cambiada/nivel_atencion_cambiado/correo_fallido/encuesta_enviada/encuesta_respondida), detalle | `ticket_id→tickets` | **solo staff ve**; insert solo vía `log_evento_ticket()` `SECURITY DEFINER` o la edge function admin |
| `ticket_satisfaccion` | nivel (1–5), comentario, fecha_envio | `ticket_id→tickets` | **solo staff ve**; insert/update solo por trigger (`crear_encuesta_al_cerrar`) o edge function admin (nunca RLS de cliente) |
| `ticket_busqueda_intentos` | ip, dni | — | **solo jefe ve** (tabla de rate-limit interna); insert solo por edge function admin |

### Base de Conocimiento

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `kb_articulos` | titulo, sintoma, solucion, `estado` (borrador/en_revision/publicado/obsoleto), util_si, util_no | `categoria_id→categorias_ticket`, `ticket_origen_id→tickets` | crear: staff. **Ver**: `es_staff() AND (estado IN ('publicado','obsoleto') OR created_by = auth.uid() OR es_jefe())` — visibilidad de dos niveles. **Editar**: `es_jefe() OR (created_by = auth.uid() AND estado IN ('borrador','en_revision'))` — el autor pierde el permiso de editar en cuanto el artículo pasa a publicado/obsoleto. Eliminar: solo jefe. El voto "¿te sirvió?" NO pasa por UPDATE directo — pasa por el RPC `kb_registrar_feedback` (ver migración 032, §6). |

### Gestión de Problemas (Fase 2, migración 033)

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `problemas` | titulo, descripcion, `severidad` (baja/media/alta/critica), `estado` (abierto/diagnostico/acciones/cerrado), causa_raiz, responsable_id | `ticket_disparador_id→tickets`, `responsable_id→auth.users` | staff / staff / staff / jefe |
| `problema_tickets` | (tabla puente) | `problema_id→problemas`, `ticket_id→tickets` | staff ve/vincula/desvincula (sin UPDATE — es solo un join) |
| `acciones_correctivas` | descripcion, responsable_id, fecha_limite, `estado` (pendiente/en_progreso/completada), fecha_completada | `problema_id→problemas` | staff / staff / staff / jefe |

### Accesos sensibles (más estricto que todo lo anterior)

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `accesos_sensibles` | nombre, `categoria` (equipos/correos/otro), usuario, `password` (cifrado con clave aislada `CRED_KEY_SENSIBLE`), notas | — | **jefe** ve/crea; jefe **con permiso explícito** (fila en `accesos_sensibles_permisos`) edita/elimina |
| `accesos_sensibles_permisos` | (tabla de permisos por fila) | `acceso_id→accesos_sensibles`, `staff_user_id→staff` | jefe con permiso ve/otorga/revoca; el creador de un acceso recibe permiso automático (trigger, ver §3) |

### Staff (autenticación/roles)

| Tabla | Columnas clave | FKs | RLS |
|---|---|---|---|
| `staff` | nombre, `rol` (enum: JEFE/ASISTENTE), `activo` | `user_id→auth.users` | ver: propio registro o jefe. Insert/update/delete: **solo jefe**. Un `staff` nace `activo=false` por trigger (ver §3/§6). |

---

## 3. Reglas de negocio activas (triggers y funciones)

Agrupado por tabla. Todos corren `SECURITY DEFINER` salvo donde se indica.

**`empresas` / `areas_obras` / `ubicaciones` / `plataformas` / `tipos_equipo` / `catalogo_almacen` / `categorias_ticket` / `subcategorias_ticket`**
- `set_created_updated_by()` / `set_updated_at()` — trazabilidad genérica (BEFORE INSERT/UPDATE), nada de negocio específico.

**`empleados`**
- `set_created_updated_by()`, `set_updated_at()`, `notify_list_changed('empleados:list')` (AFTER INSERT/UPDATE/DELETE) — realtime: notifica al canal `empleados:list` para que la bandeja se refresque sola.

**`cuentas`**
- `set_created_updated_by()`, `set_updated_at()`, `notify_list_changed('cuentas:list')`.

**`asignaciones_cuenta`**
- `set_created_by_only()` — trazabilidad (sin `updated_by`, la tabla es de solo cierre por fecha).
- `check_reutilizable_exclusividad()` — si la cuenta es `tipo_cuenta='reutilizable'`, rechaza una nueva asignación si ya hay una activa (`fecha_fin is null`): "Cierra la asignación actual antes de crear una nueva."
- `check_tope_licencia_cuenta()` — si esa cuenta es el login de una licencia con asientos limitados, rechaza la asignación si ya se usaron todos los asientos.
- `marcar_rotacion_pendiente()` (AFTER UPDATE) — al cerrar una asignación (`fecha_fin` se llena), marca `cuentas.requiere_rotacion = true` si la cuenta es reutilizable/compartida (la contraseña debe cambiarse antes de reasignar).

**`licencias`**
- `set_created_updated_by()`, `set_updated_at()`, `notify_list_changed('licencias:list')`.

**`asignaciones_licencia`**
- `set_created_by_only()`.
- `check_tope_licencia()` — rechaza la asignación si ya no quedan asientos libres (`cantidad` vs. asignaciones activas).

**`equipos`**
- `set_created_updated_by()`, `set_updated_at()`, `notify_list_changed('equipos:list')`.
- `evento_equipo_registrado()` (AFTER INSERT) — loguea `registrado` en `eventos_equipo`.
- `evento_equipo_estado()` (AFTER UPDATE) — loguea `estado_cambiado` cuando cambia `estado`.

**`equipo_accesorios`**
- Sin trigger de negocio propio más allá del `CHECK (cantidad between 1 and 999)`.

**`asignaciones_equipo`**
- `set_created_by_only()`.
- `check_asignacion_equipo()` — rechaza si el equipo no existe/está eliminado, si no está `operativo`, o si ya tiene un portador activo (una sola asignación abierta por equipo a la vez).
- `evento_asignacion_equipo()` (AFTER INSERT/UPDATE) — loguea `asignado` (a empleado o a ubicación) y `devuelto` (con motivo de cierre) en `eventos_equipo`.

**`tickets`**
- `set_updated_at()`, `notify_list_changed('tickets:list')`.
- `check_asignado_staff_activo()` — el `asignado_a` debe ser un staff activo.
- `check_iniciar_completo()` — para pasar a `en_progreso` exige que ya tenga `nivel_atencion` y `asignado_a` asignados.
- `check_reabrir_solo_jefe()` — solo `es_jefe()` puede llevar un ticket a `estado='reabierto'`.
- `check_transicion_ticket()` — un ticket `cerrado`/`rechazado` solo puede salir de ese estado hacia `reabierto` (nunca directo a otro estado).
- `crear_encuesta_al_cerrar()` (AFTER UPDATE) — al cerrar un ticket **con `empleado_id`**, crea la fila en `ticket_satisfaccion` (por eso no todo ticket cerrado tiene encuesta — los internos sin empleado vinculado no la generan, ver §5).
- `evento_ticket_cambios()` (AFTER UPDATE) — loguea en `ticket_eventos` cada cambio de estado/prioridad/nivel de atención/reasignación.
- `notify_ticket_estado()` (AFTER UPDATE) — `realtime.publish('ticket:'||token, ...)`, para que la vista pública de seguimiento se actualice sola.
- `check_ticket_identidad_inmutable()` — `token` y `codigo` no pueden modificarse una vez creados.

**`ticket_comentarios`**
- `set_autor_id_only()` (variante de `set_created_by_only()` para la columna `autor_id`).
- `check_ticket_no_cerrado()` — rechaza comentar un ticket `cerrado`/`rechazado`.
- `notify_ticket_comentario_publico()` (AFTER INSERT) — si el comentario es público (`interno=false`), publica por realtime en el canal del token para la vista pública.

**`kb_articulos`**
- `set_created_updated_by()`, `set_updated_at()`.
- (El gate de "solo JEFE publica/marca obsoleto" no es un trigger: lo resuelve la propia cláusula `WITH CHECK` de la policy de UPDATE — ver §2.)

**`problemas`**
- `set_created_updated_by()`, `set_updated_at()`.
- `check_responsable_problema_activo()` — el `responsable_id` debe ser staff activo.
- `check_problema_cierre()` — rechaza cerrar el problema si tiene acciones correctivas en `pendiente`/`en_progreso`.
- `vincular_ticket_disparador()` (AFTER INSERT) — si el problema se crea con `ticket_disparador_id`, inserta automáticamente el vínculo en `problema_tickets` (con `ON CONFLICT DO NOTHING`).

**`acciones_correctivas`**
- `set_created_updated_by()`, `set_updated_at()`.
- `check_responsable_accion_activo()` — el responsable debe ser staff activo.
- `check_problema_no_cerrado()` — rechaza crear o reactivar una acción si el problema padre está `cerrado`.
- `set_fecha_completada()` — llena `fecha_completada = now()` al pasar a `completada`; la limpia si sale de ese estado.

**`problema_tickets`**
- `set_created_by_only()` — trazabilidad únicamente.

**`accesos_sensibles`**
- `set_created_updated_by()`, `set_updated_at()`.
- `acceso_sensible_permiso_creador()` (AFTER INSERT) — el creador recibe automáticamente su fila en `accesos_sensibles_permisos`.
- `accesos_sensibles_log_evento()` (AFTER INSERT/UPDATE/DELETE) — audita creado/editado/eliminado en `accesos_log` (con nombre y categoría, sin exponer password).

**`staff`**
- `set_updated_at()`.
- `handle_new_staff_user()` (trigger `on_auth_user_created_staff` sobre `auth.users`, no sobre `staff`) — auto-crea la fila `staff` como `ASISTENTE` **inactivo** (`activo=false`) al registrarse un usuario nuevo. Endurecido en migración 018 tras el hallazgo H-CRIT de la auditoría de seguridad (ver §6).

**Funciones de apoyo usadas por varios triggers** (no disparan solas):
- `es_jefe()` / `es_staff()` — chequeo de rol, `STABLE SECURITY DEFINER`.
- `tiene_permiso_acceso_sensible(acceso_id)` — chequeo de permiso por fila.
- `log_evento_ticket(ticket_id, evento, detalle)` / `log_evento_equipo(equipo_id, evento, detalle)` — inserts de auditoría con el email resuelto desde `auth.users`.
- `siguiente_codigo_ticket()` — `TCK-0001`, `TCK-0002`... vía secuencia (`ticket_codigo_seq`), usada solo por la edge function `tickets` al crear.
- `kb_registrar_feedback(articulo_id, util)` — único RPC llamado directo desde el frontend; exige `es_staff()` y solo toca `util_si`/`util_no`.

---

## 4. Estructura del frontend

**Módulos (`frontend/src/modules/`)**: auth, dashboard, empleados, cuentas, correos, licencias, equipos, tickets, kb (Base de Conocimiento), problemas (Gestión de Problemas), accesosSensibles, staff, empresas, plataformas, configuracion (panel de pestañas con catálogos), actividad (auditoría), entregas, soporte (portal público), errores.

**Stores Pinia (`frontend/src/stores/`)**: uno por dominio — `auth`, `empleados`, `cuentas`, `correos`, `licencias`, `equipos`, `tickets` + `ticketDetalle` (separado, para no recargar toda la bandeja al abrir un detalle), `kb`, `problemas` + `problemaDetalle` (mismo patrón que tickets), `accesosSensibles`, `staff`, `empresas`, `plataformas`, `catalogos` (agrupa los catálogos chicos: tipos de equipo, ubicaciones, áreas/obras).

**Rutas** (`frontend/src/router/`, separadas por dominio en `routes/*.routes.js`):
- Públicas (`meta.public`, sin sesión): `/soporte`, `/soporte/nuevo`, `/soporte/buscar`, `/soporte/:token`, `/soporte/:token/satisfaccion`, `/entrega/:token`. Compat legacy `/ticket/*` → redirect a `/soporte/*`.
- Staff (requieren sesión, guard global en `router/guards.js`): `/dashboard`, `/tickets`, `/tickets/:id`, `/empleados`, `/empleados/:id`, `/correos`, `/licencias`, `/equipos`, `/base-conocimiento`, `/base-conocimiento/:id`, `/problemas`, `/problemas/:id`, `/configuracion` (+ hijas: empresas/áreas-obras/plataformas/tipos-equipo/ubicaciones/categorias-ticket/staff).
- Restringidas a JEFE (bloqueadas en `guards.js`, auditadas en `accesos_log` vía `registrarAccesoDenegado`): `/actividad`, `/accesos-sensibles`, `/configuracion` → pestaña `staff`.

**Sidebar** (`components/shared/AppLayout.vue`): agrupado en "(sin título)" (Dashboard, Tickets), "Gestión" (Empleados, Correos, Licencias, Equipos, Base de Conocimiento, Problemas — visibles para todo staff) y "Administración" (Actividad y Accesos sensibles, condicionados a `auth.esJefe`; Configuración, visible a todos aunque su pestaña Staff interna se filtra por rol).

**Capa de datos (`api/`)**: barrel `insforge.js` agrega 13 módulos de dominio (`api/domains/*.js`), todos RLS+PostgREST directo salvo: `ticketsPublicos.js` y `passwords.js`, que invocan las edge functions `tickets`/`credenciales` (`getClient().functions.invoke(...)`), y `kb.js`, cuyo voto pasa por el RPC `kb_registrar_feedback`.

---

## 5. Estado real de cada práctica de servicio (números en vivo, 2026-07-29)

| Práctica | Implementado | Adopción real |
|---|---|---|
| **Incidentes (tickets)** | Completo: ciclo de vida con máquina de estados en triggers, niveles de atención N1/N2/N3, encuesta de satisfacción, portal público, realtime. | 63 tickets creados (2026-07-31; eran 58 el 2026-07-29), 55 llegaron a `resuelto` alguna vez. **Tasa de reapertura: 4/55 = ~7.3%** — ver nota de fórmula abajo. |
| **Problemas** | Recién implementado (migración 033, commit `f1b830a`, mismo día de esta revisión). Unifica lo que iba a ser "Lecciones Aprendidas". | **0 problemas creados todavía** — módulo sin uso real aún, es esperable dado que se acaba de lanzar. |
| **Conocimiento (KB)** | Completo: ciclo borrador→en_revision→publicado→obsoleto, visibilidad por autoría/estado, voto "¿te sirvió?". | **1 artículo activo, publicado, categoría "Accesos y Cuentas"** (`deleted_at IS NULL`). Hay un segundo artículo ("ejemplo red") con `estado='publicado'` pero `deleted_at` no nulo desde 2026-07-29T22:44 — soft-delete hecho por un JEFE durante pruebas manuales del módulo, no un bug ni una eliminación física; cualquier conteo de "publicados" debe filtrar `deleted_at IS NULL` o va a duplicar este caso. Adopción mínima — recordar que el backfill de la migración 031 se perdió (ver §6), así que este conteo no refleja historial previo, solo lo creado desde que el módulo existe. |
| **Satisfacción** | Encuesta automática al cerrar un ticket con empleado vinculado; enlace por correo. | 48 encuestas generadas (de 49 tickets cerrados — 1 cerrado sin `empleado_id`, la encuesta no se genera para tickets sin empleado vinculado). **8 respondidas (~16.7% de tasa de respuesta)**. |

Contexto adicional: 83 empleados activos+inactivos con `deleted_at is null`, 162 cuentas, 34 equipos, 9 licencias, 4 usuarios de staff (3 activos).

**Fórmula estándar de tasa de reapertura (fijada 2026-07-31)**: numerador = tickets con al menos un evento `estado_cambiado` cuyo `detalle` sea `De "cerrado" a "reabierto"`; denominador = tickets que llegaron a `resuelto` alguna vez (no el total de tickets creados). Reabrir solo tiene sentido sobre algo que ya se dio por resuelto, así que un ticket que nunca se resolvió no puede "inflar" la tasa como si fuera un caso sin reapertura. Una auditoría previa había calculado 8.0% (4/50 resueltos) y una revisión de este mismo documento había calculado 6.9% (4/58 creados) — mismo numerador, denominador distinto; la diferencia entre ambas cifras y la de arriba (7.3%) es solo crecimiento de datos entre fechas de medición, no un desacuerdo de fórmula. **Usar siempre resueltos como denominador en auditorías futuras.**

---

## 6. Decisiones y deuda técnica documentadas

- **Pérdida de datos del backfill de KB (migración 031, 2026-07-29)**: el CLI de InsForge crasheó aplicando la migración; el estado final mostró `kb_articulos` en 0 filas con la columna vieja `tickets.es_base_conocimiento` ya eliminada, sin certeza de si el backfill llegó a correr o si un `DROP TABLE` manual posterior (pensado como limpieza de una tabla de prueba) se llevó los datos por delante. No hay auditoría de ese flag ni forma de recuperarlo; restaurar un backup completo del proyecto no era viable sin sobrescribir todo lo demás. **Decisión cerrada**: no restaurar — el flag no tenía ningún consumidor antes de este módulo, impacto real nulo. KB arranca vacía a propósito.
- **Corrección del hueco de RLS en el voto de KB (migración 032)**: la policy original de "votar" un artículo era un UPDATE amplio (solo filtraba por estado, no por columna), así que cualquier staff podía reescribir `titulo`/`solucion` de un artículo publicado con una llamada directa a la API, no solo el voto. Se reemplazó por `kb_registrar_feedback()`, una función `SECURITY DEFINER` angosta que solo toca `util_si`/`util_no`, y se eliminó la policy amplia.
- **Sin SLA formal (decisión, no pendiente técnico)**: no existe ninguna columna de tiempo de respuesta/vencimiento ni lógica de SLA en tickets ni en problemas. No es un olvido: no hay un caso concreto todavía que lo justifique. Si aparece la necesidad, es una decisión de negocio a tomar entonces (qué se mide, con qué escalamiento), no algo a "completar".
- **`project_admin` (rol de conexión del CLI) bypasea RLS**: documentado explícitamente en `tests/db/triggers.test.sql` — la conexión que usan las migraciones y `scripts/test-db.mjs` tiene `BYPASSRLS`, y el CLI además bloquea `SET ROLE`/`SET LOCAL`, así que **no hay forma de simular una sesión de staff/jefe real desde ese canal**. Los tests de `triggers.test.sql` verifican invariantes de triggers/constraints (corren igual sin importar el rol), pero **ninguna prueba automatizada ejercita las políticas RLS reales** (visibilidad de KB por autoría/estado, gates por rol de `problemas`, etc.) — esa cobertura hoy es 100% manual, con dos cuentas reales en el navegador.
- **Endurecimiento del alta de staff (migración 018, hallazgo H-CRIT de la auditoría de seguridad del 2026-07-07)**: el trigger original creaba `staff` **activo** por defecto; combinado con signup abierto, cualquiera que se registrara quedaba como ASISTENTE activo con acceso a revelar contraseñas. Cierre principal: `disable_signup=true` en `insforge.toml`. Defensa en profundidad agregada en esta migración: el trigger ahora crea el staff **inactivo** (`activo=false`) sin importar qué — un JEFE debe activarlo a mano desde el panel.
- **Gotchas operativos de plataforma** documentados en `AGENTS.md` (no repetidos acá en detalle, pero relevantes para quien opere el sistema): límite de ~8 KB de línea de comandos en Windows para `db query`, `db import` más confiable que `db query` para DDL grande pero con su propio riesgo de crash a medio aplicar (verificar siempre después), y una gotcha de `functions.invoke()` del SDK que obliga a fijar `functionsUrl` manualmente en `api/client.js`.
- **`db migrations up` no es usable hoy para `--all`/`--to` (evaluado en migración 035, 2026-07-31)**: los 34 archivos de `migrations/` usan el formato `0XX_nombre_snake_case.sql`, que no cumple el formato que exige el subsistema `db migrations` de la CLI (`<timestamp de 14 dígitos>_<nombre-en-guiones>.sql`). `db migrations up --all` y `up --to` validan estrictamente cada nombre de archivo local antes de aplicar y fallarían de entrada con los 34 existentes. `db migrations up <archivo>` (target explícito) sí tolera archivos ajenos inválidos en el directorio, pero el archivo objetivo en sí necesitaría ese mismo formato timestamp — rompiendo la convención `0XX_nombre.sql` para ese archivo puntual y desalineándolo de la tabla "Historial de migraciones" de `README.md`. Se investigó además por qué el historial remoto se dejó vacío a propósito (línea de `AGENTS.md` sobre esto, presente desde el primer commit del repo): **no hay ninguna razón documentada en ningún lado** (ni en commits, ni en este documento, ni en la auditoría de seguridad) — es una decisión sin justificación registrada, no una restricción vigente. Con eso claro, para la migración 035 se decidió mantener `db query`/`scripts/apply-migration.mjs` con guardas idempotentes en los UPDATE puntuales, en vez de adoptar `db migrations up` solo para ese archivo. **Renombrar retroactivamente los 34 archivos a formato timestamp para habilitar `db migrations up --all` de forma completa es un proyecto aparte** (reescribe el historial de `README.md` y hay que verificar que no dispare una reaplicación accidental de 001-034 al usar `--all` después, dado que el historial remoto seguiría vacío) — no se hizo como parte de esta migración. Dejar esto anotado para no redescubrirlo en la próxima migración que necesite atomicidad por archivo.

---

## 7. Pendientes abiertos

- **Verificación manual sin correr**: las policies RLS de `kb_articulos` (visibilidad por estado/autoría) y de `problemas`/`acciones_correctivas` (gates por rol) nunca se probaron con una sesión de staff/jefe real — ver §6. Queda como verificación manual en navegador con dos cuentas, no automatizable con la conexión actual del CLI.
- **Tablas huérfanas de prueba en `public` — resuelto (2026-07-31)**: `test_probe`, `test_probe2`, `test_probe3` no tenían ninguna referencia en el código del repo (ni en migraciones versionadas, ni en frontend, ni en `functions/`). Se confirmó que las tres estaban vacías (0 filas) y se eliminaron vía migración `034_drop_tablas_prueba_huerfanas.sql`. Práctica adoptada hacia adelante: cualquier tabla de prueba exploratoria debe crearse en un branch/sandbox de InsForge (`npx @insforge/cli branch create`), nunca directo en el esquema de producción — es lo que hubiera evitado que aparecieran acá desde el principio.
- **Sin tests automatizados de build/CI** más allá de `scripts/test-db.mjs` (invariantes de triggers) y los `.test.js` de Vitest en `frontend/tests/` (credenciales, validaciones de ticket, badges, `entregarQuery`, `usePaginacion`, forma de la API de InsForge). `AGENTS.md` es explícito: "no hay tests automatizados aún" a nivel de build completo.
- **Distinción incidente/solicitud**: no existe como campo — `categorias_ticket` funciona como "tipo de solicitud" de nivel 1 sin diferenciar formalmente si un ticket es un incidente (algo roto) o una solicitud (algo pedido). Queda como decisión futura si el volumen o el reporting lo justifican.
- **Horario laboral / SLA**: sin ninguna implementación (ni columna, ni cálculo, ni configuración) — ver §6, es una decisión pendiente de negocio, no un TODO de código.
- **Sin tabla de notificaciones**: tanto el dashboard de pendientes de tickets como el de problemas (categorías recurrentes, acciones vencidas) se calculan **en vivo** en cada carga (`dashboardApi.pendientesTickets()`, `problemasApi.pendientesProblemas()`), sin persistir ni marcar como "vistas". Es una decisión de diseño explícita del módulo de Problemas (migración 033), no una limitación descubierta después.

---

## Resumen de verificación (para quien lea este documento)

Todo el contenido de arquitectura, modelo de datos, RLS y triggers de este documento salió de consultar la base real (`information_schema`, `pg_policies`, `pg_trigger`, `pg_get_functiondef`) el 2026-07-29, no de los comentarios de las migraciones ni de memoria de sesiones previas — los comentarios se usaron solo para contexto de *por qué*, no como fuente de *qué existe hoy*. Dos discrepancias reales entre lo documentado/asumido y lo que la base contiene:

1. **`staff.rol` y `empleados.estado` son enums nativos de Postgres**, no `text + CHECK` como dice la convención general del proyecto — excepción histórica de las dos tablas más antiguas (migraciones 001/002), el resto de +25 tablas sí sigue la convención.
2. **Existían 3 tablas de prueba huérfanas** (`test_probe`, `test_probe2`, `test_probe3`) en el esquema de producción sin ninguna referencia en el código versionado — no estaban documentadas en ningún lado y no aparecían en ninguna migración del repo. Eliminadas el 2026-07-31 (migración 034) tras confirmar que estaban vacías — ver §7.

Fuera de eso, el código y la base coinciden con lo esperado: los números de adopción de Problemas (0) y KB (1 artículo) reflejan que ambos módulos son muy recientes, no un error de conteo; y la tasa de respuesta de encuestas (16.7%) y de reapertura (~6.9%) son cifras reales de esta consulta, no estimaciones.
