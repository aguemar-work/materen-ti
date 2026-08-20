# AGENTS.md

> **Materen — Sistema TI**: panel interno de inventario de empleados, accesos,
> tickets, correos, licencias y equipos. UI en
> `frontend/src/styles/main.css` (`--mat-*`) y [`docs/GUIA-UX-UI.md`](docs/GUIA-UX-UI.md).

**Vigencia**: actualizado 2026-08-17 (migración 068 RLS real por módulo;
069/070 tracking de migraciones/deploys; 066/067 hash del token de entrega;
064/065 accesos_log ip/user_agent + límite por DNI en personal-registro;
nueva edge function `equipos-fotos`; verificación de auditoría externa).

**Precedencia documental**: ante conflicto, `README.md` y `GUIA-UX-UI.md` describen
intención; **ganan** los valores literales en `main.css` y el esquema real en
`migrations/*.sql`.

Contexto para agentes de código. Lee también el `README.md` (dominio, flujos,
modelo de seguridad y estructura del repo), `docs/PANORAMA_SISTEMA.md`
(esquema real y decisiones verificadas) y `docs/HISTORIAL-AUDITORIAS.md`
(hallazgos de seguridad/calidad con su estado).

## Documentación sensible — no pegar en herramientas externas sin revisar

`README.md`, este archivo, `docs/HISTORIAL-AUDITORIAS.md` y `docs/CHANGELOG.md`
ya usan `<INSFORGE_PROJECT_URL>`/`<PROJECT_NAME>` como placeholder donde antes
había la URL real de producción y el nombre del proyecto backend (corregido
2026-08-17, verificación de auditoría externa). Antes de pegar cualquiera de
estos archivos en un chat de IA externo, un ticket público o compartirlos con
un tercero, confirmar que sigue así — no reintroducir el valor real a mano.

Archivos que SÍ tienen datos reales de infraestructura y no se redactan
(el valor es funcional, no narrativo) — no compartirlos con terceros/IA,
tampoco "limpiarlos":
- `frontend/vercel.json` / `frontend/public/vercel.json` — CSP con la URL
  real de InsForge y el DSN de Sentry; un placeholder rompería el despliegue.
- `.insforge/project.json`, `frontend/dist/**` — gitignorados, no trackeados,
  pero pueden tener la URL real en disco; no pegarlos manualmente igual.
- `frontend/.env` (nunca `.env.example`, que ya usa un valor de ejemplo).

Nombres de tabla/columna/función SQL no son secretos — se dejan tal cual en
toda la documentación, son necesarios para que siga siendo útil.

## Qué es

Panel interno de TI para registrar empleados, administrar sus credenciales de
acceso a plataformas (Gmail, Bitrix24, VPN, ERP, etc.) y entregarlas de forma
segura. No es solo un almacén de contraseñas: el corazón del sistema es el
**historial de asignaciones** — quién tuvo qué acceso, desde cuándo, hasta
cuándo y si la contraseña se rotó después.

## Reglas del proyecto

- **Documentación por cambio (obligatorio)**: toda modificación que cambie
  dominio, seguridad, esquema o UI debe actualizar la documentación
  correspondiente **en el mismo cambio**, no después: `README.md` (dominio,
  flujos, historial de migraciones), este archivo (reglas/gotchas),
  `docs/PANORAMA_SISTEMA.md` (esquema/decisiones) y/o `docs/GUIA-UX-UI.md`
  (design system), según lo que se tocó. Dejar además una línea en
  `docs/CHANGELOG.md`. Un hallazgo de auditoría cerrado o abierto se
  actualiza en `docs/HISTORIAL-AUDITORIAS.md`, no en un informe nuevo suelto.
  No es opcional ni una tarea aparte: un PR que cambia comportamiento y no
  toca documentación queda incompleto, igual que uno sin tests.
- **Diagnóstico/pruebas contra producción**: para reproducir un bug o
 verificar un fix, preferir un branch de InsForge (`npx @insforge/cli
 branch create`) en vez de escribir sobre datos reales (ver
 `docs/PANORAMA_SISTEMA.md` §7 — hasta ahora esa regla solo cubría tablas
 de prueba nuevas; se extiende a cualquier INSERT/UPDATE/DELETE de
 diagnóstico). Si no es viable (ej. confirmar que un fix ya corre en el
 backend real), es obligatorio: (1) limpiar los datos de prueba en la
 misma sesión, y (2) dejar registro explícito de qué se tocó y que se
 limpió en `docs/HISTORIAL-AUDITORIAS.md` o `docs/CHANGELOG.md` — no basta
 con haberlo borrado. Nota aparte: los códigos que vienen de una
 `sequence` (`siguiente_codigo_ticket()`, etc.) **nunca se revierten**
 aunque el INSERT falle o se borre el registro — un hueco en `TCK-00XX` no
 es en sí mismo evidencia de nada, pero conviene poder explicarlo.
- **Idioma**: UI, comentarios, nombres de funciones/variables de dominio y
 mensajes en **español** (código base en Perú: DNI, RUC, WhatsApp).
- **Contraseñas**: NUNCA en listados ni precargadas en formularios. Todo lo
 que toque contraseñas pasa por `frontend/src/api/passwords.js` → edge
 function `credenciales` (cifra con claves de servidor y audita en
 `accesos_log`). No reintroducir cifrado en el cliente.
- **Softdelete** en todo (`deleted_at`); DELETE físico solo JEFE (RLS).
- **No reabrir el registro público**: `disable_signup` debe seguir en `true` y
 el trigger `handle_new_staff_user` debe crear el `staff` **inactivo**
 (`activo=false`). Solo el JEFE aprovisiona/activa staff. Revertir esto
 reintroduce la escalada H-CRIT de la auditoría. Ese mismo trigger (migración
 056, extendido en la 060) también siembra las 8 filas de
 `staff_modulos_permisos` **y** la fila de `staff_permisos`
 (`credenciales.ver`) del staff nuevo — si se reescribe la función, no perder
 ninguno de los tres `insert` (staff, módulos, permisos).
- **Permisos de módulo** (`staff_modulos_permisos`, migración 056): siguen
 controlando sidebar/router en el frontend, pero desde la migración 068
 `licencias`/`asignaciones_licencia`, `equipos`/`tipos_equipo`/
 `asignaciones_equipo`/`eventos_equipo` y `cuentas`/`asignaciones_cuenta`
 **también** lo exigen en RLS vía `tiene_permiso_modulo(text)` (mismo patrón
 que `tiene_permiso_acceso_sensible` de la 024): un ASISTENTE sin el módulo
 ya no puede leer/escribir esas tablas por otra vía (RPC, SDK directo desde
 la consola). JEFE exento siempre (`es_jefe() or ...` en cada policy).
 **Caso especial `empleados`, decisión explícita**: el SELECT sigue en
 `es_staff()` sin gate de módulo — Equipos/Licencias/Correos embeben
 `empleados(nombres, apellidos)` para mostrar a quién está asignado, y
 gatear también la lectura dejaría esos nombres en blanco para cualquier
 ASISTENTE sin el módulo "Empleados". Solo INSERT/UPDATE de `empleados`
 quedan gateados por el módulo.
 ⚠️ Igual que `credenciales.ver` más abajo: `functions/credenciales.ts`
 (`revelar`, `revelarClaveLicencia`, `entregaCrear`) lee `cuentas`/`licencias`
 con el cliente admin — bypasea esta RLS. Por eso tiene su propio chequeo
 `tienePermisoModulo()` (consulta directa a `staff_modulos_permisos`, mismo
 motivo que abajo: `auth.uid()` sería `NULL` en ese contexto). La regla vive
 dos veces (RLS + edge function) a propósito, nada las sincroniza sola.
- ⚠️ **Permiso `credenciales.ver` (`staff_permisos`, migración 060) — la regla
 vive en DOS lugares, a propósito, y hay que mantenerlos sincronizados a
 mano**:
   1. `tiene_permiso_credenciales_ver(uuid)` — función SQL (`SECURITY
      DEFINER`), pensada para RLS futuro. Hoy ninguna policy la consume.
   2. `functions/credenciales.ts` (`tienePermisoCredenciales()`) — consulta
      **directa** a `staff_permisos`, NO por RPC a la función de arriba. No
      puede ir por RPC: este handler corre con `createAdminClient` (sin
      sesión de usuario), así que `auth.uid()` sería `NULL` dentro de la
      función SQL. Mismo motivo y mismo patrón que `revelarAccesoSensible`
      (migración 024) con `accesos_sensibles_permisos`.
 
   **Hoy las dos coinciden. Nada las mantiene sincronizadas automáticamente**
   — si cambias quién puede ver contraseñas, cambia las dos, no una. Un
   permiso que bloquea en una y no en la otra es exactamente el tipo de bug
   que este aviso existe para evitar. Se evaluó unificarlas (RPC vía el
   `userClient` de sesión que ya existe en `credenciales.ts`, en vez de
   `admin`) pero se descartó: sería el primer uso de `userClient.database`
   para una query de negocio en todo el repo (hoy `userClient` solo resuelve
   identidad, en las 4 edge functions por igual) — no se introdujo sin
   probarlo aparte. La barrera real (gate del servidor) es la de
   `credenciales.ts`; el toggle del frontend (`StaffView.vue`) y
   `auth.puedeVerCredenciales` son **cosméticos** — si algo falla, que falle
   bloqueando el servidor, nunca el cliente.
- **Historial**: `asignaciones_cuenta` es append-only en la práctica — las
 asignaciones se cierran (`fecha_fin`), no se borran.
- Al editar una cuenta, enviar `password_cambiada: true` solo si el usuario
 escribió una contraseña nueva; si no, el update no debe tocar `password`
 (preserva el flag `requiere_rotacion` y `last_password_change`).
- Formato de código: seguir el estilo existente (componentes `<script setup>`,
 stores Pinia por módulo, capa de datos en `api/` por dominio con barrel
 `insforge.js`, mappers en `api/domains/*`).
- **UI/UX**: colores, tipografías y clases reutilizables en
 `docs/GUIA-UX-UI.md` y `frontend/src/styles/main.css` (tokens `--mat-*`,
 sin Tailwind ni librería de componentes). Nombre del producto en UI:
 **Materen — Sistema TI**.

## Flujo de trabajo backend

- **Migraciones**: archivos numerados `migrations/0XX_nombre.sql` (comentados,
 en español). Se aplican manualmente:
 `npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"`.
 NO se usa `db migrations up` (los nombres `0XX_snake_case.sql` son
 incompatibles con el formato timestamp que exige ese subsistema, y su
 historial remoto está vacío a propósito por no haberse usado nunca). Desde
 la migración 069, `scripts/apply-migration.mjs` registra en
 `public.schema_migrations` qué versión quedó aplicada (verifica antes de
 reaplicar por error, salvo `--force`) — no reemplaza el CLI nativo, es
 tracking propio.
- **Windows + `db query`**: límite de línea de comandos ~8 KB y ejecución poco
 fiable de múltiples statements DML en una llamada. Para updates masivos:
 un solo `UPDATE ... FROM (VALUES ...)` por lote.
- **Gotcha distinto en `scripts/apply-migration.mjs` con archivos grandes
 (verificado 2026-08-17, migración 062)**: el script evita el límite de
 `cmd.exe` de arriba con un here-string de PowerShell (`-EncodedCommand`),
 pero ese mismo mecanismo falla con `ENAMETOOLONG` en archivos de varios KB
 (con comentarios) — el `-EncodedCommand` va en base64/UTF-16LE, que infla
 el tamaño ~2.7× y termina superando el límite de línea de comandos de
 `CreateProcess` en Windows (~32767 caracteres), distinto del límite de
 `cmd.exe`. Mitigación: aplicar con `npx @insforge/cli db query "<sql>"`
 directo (sin el script, sin PowerShell de por medio) en varios lotes por
 concepto, cada SQL en **una sola línea** (los saltos de línea reales como
 argumento fallan con `Query is required`). El archivo único en
 `migrations/` se conserva igual como fuente de verdad — mismo criterio que
 el gotcha de la migración 031 de arriba.
- **Gotcha del CLI en Windows (jul 2026, migración 031)**: `db query` (incluso
 vía `scripts/apply-migration.mjs`, que ya evita el límite de línea de
 comandos con un here-string de PowerShell) puede rechazar DDL con
 `Query could not be parsed and was rejected for security reasons` sin
 razón aparente — pasó incluso con un `CREATE TABLE` mínimo. `db import
 <archivo.sql>` (sin `--truncate`) es más confiable para DDL, pero puede
 crashear (`Assertion failed ... src\win\async.c`) con archivos grandes que
 mezclan CREATE TABLE + RLS + DML en un solo archivo. Mitigación que
 funcionó: partir la migración en archivos temporales por concepto (tabla+
 triggers, políticas RLS, backfill de datos, ALTER final) y aplicar cada uno
 por separado con `db import`. El archivo único en `migrations/` se
 conserva igual como fuente de verdad — el fraccionamiento es solo para la
 ejecución, no cambia la convención de un archivo por migración.
 **Verificar siempre después de aplicar** (`db query "select ..."` sobre la
 tabla/columna afectada): un `db import` que reporta error igual puede haber
 ejecutado parte de los statements antes de crashear.
- **Gotcha del CLI (verificado 2026-08-05, migración 038)**: `db query` (con o
 sin `scripts/apply-migration.mjs`, en bash o en PowerShell — no es un
 problema de shell) **no soporta cuerpos de función/bloque con dollar-quoting
 (`$$ ... $$`)**: falla con `{"error":"no language specified"}` incluso en un
 `CREATE FUNCTION` de una sola línea sin ningún `;` interno. Cualquier
 migración con `create function`/`do $$ ... end $$` (la mayoría desde la 008)
 debe aplicarse con `db import <archivo.sql>`, nunca con `db query` ni con
 `apply-migration.mjs` (usa `db query` por dentro). `db import` puede seguir
 reportando el crash de cliente (`Assertion failed ... src\win\async.c`) de
 arriba aun cuando el statement se ejecutó bien en el servidor — la
 verificación posterior sigue siendo obligatoria en ambos casos.
- **Edge function**: `functions/credenciales.ts` → desplegar con
 `npx @insforge/cli functions deploy credenciales --file functions/credenciales.ts`.
 Secrets que usa: `CRED_KEY_V2`, `CRED_KEY_LEGACY`, `API_KEY`,
 `INSFORGE_BASE_URL` (los dos últimos son reservados de la plataforma).
- **Edge function `tickets`**: `functions/tickets.ts` → desplegar con
 `npx @insforge/cli functions deploy tickets --file functions/tickets.ts`.
 Mismo patrón CORS/admin-client que `credenciales.ts` (helpers duplicados a
 propósito, no se comparte código entre funciones). `tickets`/
 `ticket_satisfaccion` no tienen INSERT de cliente: solo esta función
 escribe. El **token de entrega** (`entregas`) y el **token de ticket**
 (`tickets`) son conceptos distintos — no reusar uno para el otro.
- **Edge functions `encuestas` y `personal-registro`**: mismo patrón CORS/
 admin-client y mismo comando de deploy (`npx @insforge/cli functions
 deploy <nombre> --file functions/<nombre>.ts`). `encuestas.ts` expone
 `abrir`/`responder` sobre `encuesta_rondas`/`encuesta_respuestas` (sin
 INSERT de cliente en `encuesta_respuestas`); `personal-registro.ts` expone
 `buscarDni`/`crear` sobre `personal_registros` (sin INSERT de cliente ahí
 tampoco). No confundir la encuesta de este módulo con
 `ticket_satisfaccion` — son tablas y flujos distintos, ver README.
- **Edge function `equipos-fotos`** (2026-08-17, endurecida 2026-08-20):
 `functions/equipos-fotos.ts` → desplegar con `npx @insforge/cli functions
 deploy equipos-fotos --file functions/equipos-fotos.ts`. Requiere sesión
 de staff activo **con el módulo "equipos" otorgado** (no tiene ninguna
 acción pública, a diferencia de las demás) — antes el navegador subía
 directo a `storage.from('equipos-fotos').uploadAuto()` con la sesión de
 staff, sin ninguna validación server-side; ahora valida magic bytes +
 tamaño acá, mismo patrón que los adjuntos de `tickets.ts`. El bucket sigue
 público (miniaturas sin firmar en los listados), y la validación de
 contenido es el control real, no ocultar la URL. Hasta 2026-08-20 solo
 exigía `staff.activo`, sin mirar el módulo — cualquier ASISTENTE activo,
 con o sin "equipos", podía subir o borrar cualquier foto del bucket
 completo aunque la RLS de `equipos` (migración 068) ya se lo negara para
 el CRUD normal de la tabla (hallazgo de auditoría externa). `subirFoto`/
 `eliminarFoto` ahora exigen `tienePermisoModulo('equipos')`, mismo patrón
 y mismo motivo que `tienePermisoModulo()` en `credenciales.ts` (cliente
 admin bypasea la RLS, hay que repetir el chequeo a mano). **Pendiente
 aparte, no cerrado por este cambio**: `MAX_FOTOS=4` (tope de fotos por
 equipo) solo existe en `EquipoForm.vue`, del lado del cliente — la edge
 function no lo aplica.
- **`schema_migrations`/`function_deploys`** (migraciones 069/070): tracking
 real de qué migración y qué versión de cada edge function están aplicadas.
 `scripts/apply-migration.mjs` lo llena solo (verifica antes de aplicar,
 registra después); el job `deploy-manual` de CI hace lo mismo para `db
 import` y `functions deploy`. Ninguna tiene RLS — solo el cliente admin
 (CLI/CI) o una edge function con `createAdminClient()` las tocan (ver
 acción `version`, presente en las 5 edge functions).
- **`functions/tsconfig.json`** (migración de tooling, no de dominio) solo es
 para `deno check`/el editor — `functions deploy` sigue tomando un único
 archivo `.ts` con `--file`, no lee ni empaqueta el tsconfig. Tocar ese
 archivo nunca requiere redesplegar nada.
- **Gotcha de triggers `created_by`**: `set_created_by_only()` asume una
 columna `created_by`; en tablas con otro nombre de autor (ej.
 `ticket_comentarios.autor_id`) hay que crear una función dedicada
 (`set_autor_id_only()`) en vez de reusarla — si no, el insert falla con
 `record "new" has no field "created_by"`.
- **Gotcha del SDK** (detectado en v1.4.0, sigue vigente en `1.5.2` — H-12):
 sin `functionsUrl` explícito, `functions.invoke()` deriva un host propio
 (`https://<app>.functions.insforge.app` en 1.4.0; `function2.insforge.app`
 en 1.5.2 — el propio SDK cambió el host derivado entre versiones), que NO
 existe en este backend; en navegador el 404 sin CORS bloquea el fallback.
 Por eso `getClient()` (`api/client.js`) pasa `functionsUrl: baseUrl +
 '/functions'`. No quitarlo — con cada versión nueva del SDK el host que
 "adivina" puede volver a cambiar, y este override lo hace irrelevante.

## Verificación

- **Lint** (`frontend/src` + `functions/`): `npm run lint` (raíz del repo, no
 `frontend/` — `eslint.config.js` cubre ambos árboles). Corre en CI en cada
 push, job `lint-y-typecheck` (Q-04, cierra el hallazgo). Reglas calibradas
 contra el estilo real: lo que hoy son 0 violaciones queda en `error`; los 8
 hallazgos de estilo Vue preexistentes (orden de atributos, un par de
 componentes de una sola palabra) quedan en `warn` — no bloquean el push.
- **Type-check de las edge functions** (runtime real: Deno Subhosting, no
 Node — verificado por los imports `npm:@insforge/sdk` y `Deno.env`):
 `npm run typecheck:functions` (raíz), que corre
 `deno check --config functions/tsconfig.json`. Requiere el CLI de Deno
 (`denoland/setup-deno` en CI; local, instalar con `scoop install deno` en
 Windows o el instalador oficial). No usar `tsc` para esto: no resuelve
 `npm:` ni conoce el global `Deno`, daría falsos positivos o falsos negativos.
- **Formato** (`npm run format` / `format:check`, raíz): Prettier configurado
 (`.prettierrc.json`, infiere el estilo real: comillas simples, punto y
 coma, `printWidth` 120) pero **no corre en CI** — `prettier --check` marca
 130 archivos existentes (espaciado/orden, no bugs); forzarlo ahora sería
 reformatear el repo entero de golpe. Uso manual, no gate.
- Build: `cd frontend && npx vite build`.
- Tests unitarios: `cd frontend && npm test` (Vitest). **No fijar esta cifra
 de memoria — corre la suite y lee su propio resumen final; ya pasó una vez
 que este número quedó obsoleto en este mismo párrafo (2026-08-17 → 100+12,
 desactualizado dos ciclos después) y no vale la pena repetirlo.** Snapshot
 verificado corriendo la suite el 2026-08-18 (Ciclo 11, tras endurecer los
 helpers de autorización): **148 pasan + 1 falla + 25 se saltan (174 en
 total)**.
   - **La 1 que falla es esperada, no es una regresión, y no se corrige
     acá a propósito**: `tests/integration/autorizacion-anonima.smoke.test.js`
     → `"tiene_permiso_modulo — debería rechazar ejecución anónima"` —
     hallazgo P0-05 (`tiene_permiso_modulo(text)` es la única función
     `SECURITY DEFINER` del sistema sin `revoke ... from public`), ver
     `docs/HISTORIAL-AUDITORIAS.md` Ciclo 11. Sigue en rojo hasta que se
     aplique esa migración.
   - Las 25 que se saltan son los smoke de integración condicionados a
     secrets/cuentas que no existen hoy: `tickets-api.smoke.test.js` (1),
     `embeds.smoke.test.js` (11) y `autorizacion-roles.smoke.test.js`
     completo (13) — los tres `describe.skipIf(!listo)`, ninguno es un
     test roto. `autorizacion-anonima.smoke.test.js` no está en esta
     lista: corre completo (no se salta) porque solo necesita
     `VITE_INSFORGE_URL`/`ANON_KEY`, que sí existen en este entorno.
 Cubre: cifrado, validaciones de la edge function de
 tickets, dominio de tickets, formatters, periodos y PDF del reporte, forma
 de `insforgeApi`, paginación, y (desde 2026-08-18) los propios discriminantes
 de autorización del arnés de pruebas (`autorizacion-helpers.test.js`, sin
 red — verifica que exigen un rechazo específico y que sus mensajes de
 fallo nunca imprimen un payload). Corren en CI en cada push
 (`.github/workflows/ci.yml`, job `build-y-tests`), junto con
 `node scripts/contraste.mjs` (contraste WCAG de los tokens) y
 `npm audit --omit=dev --audit-level=high` (vulnerabilidades de dependencias).
 **CI estuvo en rojo sin que nadie lo notara** desde el commit `030cc89`
 (2026-08-15, "Pruebas" — 30+ archivos sin relación bajo un solo mensaje) hasta
 que se cerró esto: ese commit cambió la forma de `porTecnico`, retiró
 `backlog`/`sinResolver` del reporte de tickets y redefinió `porSolicitante.total`
 a histórico, todo sin documentar. Ver `docs/HISTORIAL-AUDITORIAS.md` (Q-01) y
 `CONTRIBUTING.md` (por qué un commit = un cambio coherente).
- Smoke de integración contra el backend real: `npm run test:integration`
 (corre los 4 archivos de `tests/integration/`: tickets y, desde el
 incidente de producción del 2026-08-17 — ver `docs/HISTORIAL-AUDITORIAS.md`
 Q-01 —, `embeds.smoke.test.js`, una consulta por cada `select()` con embed
 del resto de dominios; más las dos pruebas negativas de autorización del
 Ciclo 11, ver el bullet de más abajo). Atrapa desincronización esquema↔frontend. Corre en
 CI como job aparte (`test-integration`) — **requiere 4 secrets del repo**:
 `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`, `INSFORGE_TEST_STAFF_EMAIL`,
 `INSFORGE_TEST_STAFF_PASSWORD` (la cuenta de staff debe ser **dedicada a
 CI**, nunca la de una persona real, creada por el dashboard de InsForge —
 nunca por registro público, ver README). **Desde 2026-08-18 (Ciclo 10,
 P0-04) son obligatorios: si falta cualquiera, el job FALLA** (`::error::` +
 `exit 1`), ya no se omite en verde con un `::warning::` — ver README "CI:
 secrets del smoke de integración" para crearlos.
- Invariantes de triggers de BD: `node scripts/test-db.mjs` (SQL con rollback).
 Job `tests-db` en CI; mismo patrón de `::warning::` si falta
 `INSFORGE_ACCESS_TOKEN`. Desde 2026-08-18 (Ciclo 11) incluye un 4º bloque:
 `cerrar_ticket`/`staff_nombres`/`reporte_tickets*` rechazan ejecución sin
 sesión de staff.
- Pruebas negativas de autorización (`tests/integration/autorizacion-*.smoke.test.js`,
 Ciclo 11, endurecidas después de la autoauditoría del mismo ciclo):
 `autorizacion-anonima` corre siempre (solo necesita
 `VITE_INSFORGE_URL`/`ANON_KEY`) y demuestra que un anónimo no lee tablas
 internas ni ejecuta RPC `SECURITY DEFINER`. **Tiene un test que falla a
 propósito** (`tiene_permiso_modulo`, hallazgo P0-05 — ver el párrafo de
 "Tests unitarios" más arriba) — no es ruido, es el hallazgo real quedando
 visible. `autorizacion-roles` cubre ASISTENTE sin módulo/sin
 `credenciales.ver`, staff inactivo y `accesos_sensibles` fila por fila,
 pero necesita hasta 4 cuentas de staff dedicadas que hoy no existen (ver
 README "Cuentas adicionales..." — cada bloque se omite por separado si
 falta la suya, no bloquea CI). Los discriminantes de autorización de
 ambos archivos (`_autorizacion-helpers.js`, compartido) exigen un
 rechazo específico — SQLSTATE `42501`, `P0001` con el mensaje del guard,
 o el status HTTP real de la edge function — nunca "hubo algún error" a
 secas; sus mensajes de fallo nunca imprimen el payload devuelto. Cubierto
 por `frontend/tests/autorizacion-helpers.test.js` (unitario, sin red).
- Contraste WCAG de los tokens: `node scripts/contraste.mjs`.
- Probar la función sin sesión:
 `npx @insforge/cli functions invoke credenciales --data '{"action":"entregaAbrir","token":"x"}'`
 debe responder `{"ok":false,"code":"no_existe"}`.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, and payments through one platform.

- **Project:** **`<PROJECT_NAME>`** (API base `<INSFORGE_PROJECT_URL>`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
 - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, email, and Stripe payments).
 - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
 - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
 - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
 - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.
<!-- INSFORGE:END -->
