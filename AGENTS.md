# AGENTS.md

> **Materen — Sistema TI**: panel interno de TI (empleados, accesos y
> contraseñas, tickets/ITSM, correos compartidos, licencias, equipos).
> Vue 3 + Pinia + PrimeVue v4 Unstyled + Tailwind v4 sobre InsForge
> (Postgres + RLS + edge functions Deno). Reglas de UI: `frontend/AGENTS.md`.
> Historia completa de las reglas (el porqué de cada una, fechado):
> `docs/archivo/AGENTS-hasta-v1.md`.

**El estado del repo no se anota a mano acá** (se pudre). Fuente de verdad:

| Qué | Dónde |
| --- | --- |
| Migraciones aplicadas | `public.schema_migrations` + último número en `migrations/` |
| Qué cambió y cuándo | `docs/CHANGELOG.md` |
| Hallazgos abiertos/cerrados y pendientes de despliegue | `docs/HISTORIAL-AUDITORIAS.md` |
| Esquema real y decisiones | `docs/PANORAMA-SISTEMA.md` + `migrations/*.sql` |
| Sistema de diseño | `docs/SISTEMA-DISENO.md` |
| Conteo de tests | correr `cd frontend && npm test` |

⚠️ Una rama puede no tener las últimas migraciones de `main`: numerar una
nueva comparando contra `origin/main`, no contra el working tree.

**Precedencia**: `README.md` describe intención; ganan el esquema real
(`migrations/*.sql`) y, en UI, `styles/main.css` (`@theme`) y los presets
`components/ui/pt/*`.

Leer antes de tocar: `README.md` (dominio y flujos), `docs/PANORAMA-SISTEMA.md`
y — **obligatorio antes de aplicar una migración** — `docs/GOTCHAS-CLI.md`.

## Invariantes — no romper

1. **`disable_signup` = `true`, siempre.** El trigger `handle_new_staff_user`
   crea el staff **inactivo** y siembra sus **tres** `insert` (staff + 8 filas
   de `staff_modulos_permisos` + la fila de `staff_permisos`). Reescribirlo sin
   uno de los tres, o reabrir el registro, reintroduce la escalada **H-CRIT**.
2. **Contraseñas nunca en listados ni precargadas en formularios.** Todo pasa
   por `api/passwords.js` → edge function `credenciales` (cifra con claves de
   servidor, audita en `accesos_log`). Nunca cifrado en el cliente.
3. **Softdelete (`deleted_at`) en todo.** DELETE físico solo JEFE, vía RLS.
4. **`credenciales.ver` vive en dos lugares (tres con el atajo de JEFE) y nada
   los sincroniza en runtime:** `tiene_permiso_credenciales_ver()` (SQL) y
   `tienePermisoCredenciales()` (`functions/credenciales.ts`, consulta directa
   porque corre con cliente admin y `auth.uid()` sería NULL). `credenciales.ts`
   corta por `rol === 'JEFE'` antes; la función SQL no. Si cambia quién ve
   contraseñas, se cambian las dos. El test que las compara
   (`tests/integration/permisos-credenciales-sincronizados.smoke.test.js`) hoy
   **se salta** (faltan cuentas de prueba, P0-04). El toggle del frontend es
   cosmético: la barrera es el servidor.
5. **`tienePermisoModulo()` idem:** la regla vive en RLS **y** repetida a mano
   en `credenciales.ts` y `equipos-fotos.ts` (el cliente admin bypasea RLS), y
   desde la migración 086 también en las RPC `SECURITY DEFINER`.
6. **No usar `db migrations up`.** Leer `docs/GOTCHAS-CLI.md` y verificar con un
   `select` después de aplicar — siempre.
7. **No quitar `functionsUrl` de `getClient()`** (`api/client.js`): sin él, el
   SDK adivina un host que no existe (y lo cambió entre versiones menores).
8. **No fijar de memoria el conteo de tests.** La suite debe cerrar en 0 fallas.
9. **Documentación en el mismo cambio** (y una línea en `docs/CHANGELOG.md`).
   Un PR que cambia comportamiento sin tocar documentación queda incompleto.
10. **Ante conflicto entre documentación y código, gana el código.**
11. **Español en todo** y nunca tutear en la UI: impersonal en títulos,
    imperativo de usted en formularios, errores y mensajes al empleado.

## Documentación sensible

`README.md`, este archivo, `docs/HISTORIAL-AUDITORIAS.md` y `docs/CHANGELOG.md`
usan `<INSFORGE_PROJECT_URL>`/`<PROJECT_NAME>` en lugar de valores reales: no
reintroducirlos. Con datos reales, funcionales, que no se comparten ni se
"limpian": `frontend/vercel.json`, `frontend/public/vercel.json` (CSP con la
URL real y el DSN de Sentry), `.insforge/project.json`, `frontend/dist/**`,
`frontend/.env`. Datos de la empresa (p.ej. el Excel de activos) nunca al repo:
`*.xlsx` está en `.gitignore`. Nombres de tablas/funciones SQL no son secretos.

## Reglas de dominio

- **Diagnóstico contra producción**: preferir un branch de InsForge
  (`npx @insforge/cli branch create`). Si no es viable, limpiar los datos de
  prueba en la misma sesión y dejarlo registrado en `HISTORIAL-AUDITORIAS.md`
  o `CHANGELOG.md`. Los códigos de `sequence` (`TCK-00XX`) nunca se revierten.
- **Permisos de módulo** (`staff_modulos_permisos`, 056): controlan sidebar y
  router, y desde 068/072/079/081-083 también RLS vía `tiene_permiso_modulo()`
  (JEFE exento). **Excepción deliberada**: el SELECT de `empleados` no lleva
  gate (Equipos/Licencias/Correos embeben su nombre); solo INSERT/UPDATE.
  `categorias_ticket` y `ubicaciones` quedan en `es_staff()` a propósito
  (satélites de dos módulos, decisión pendiente).
- **Historial**: `asignaciones_cuenta` es append-only en la práctica — se
  cierran (`fecha_fin`), no se borran.
- Al editar una cuenta, `password_cambiada: true` solo si se escribió una
  contraseña nueva (si no, el update no toca `password`: preserva
  `requiere_rotacion` y `last_password_change`).
- El **token de entrega** (`entregas`) y el **token de ticket** son conceptos
  distintos. `tickets`/`ticket_satisfaccion`/`encuesta_respuestas` no tienen
  INSERT de cliente: solo escriben sus edge functions.

## Código

- Estilo: `<script setup>`, un store Pinia por módulo, capa de datos en
  `api/domains/*` con barrel `api/insforge.js` (su forma la fija
  `tests/insforge-api-shape.test.js`: un método nuevo se agrega ahí).
- **Helpers compartidos que no se vuelven a duplicar** (nacieron de copias que
  ya habían divergido, ARQ-01..08):
  1. `api/invocarFuncion.js` — `crearInvocador()`, única mecánica para llamar
     a una edge function; cada dominio aporta solo su mapa código → mensaje.
  2. `modules/equipos/acta-base.js` — estilos, escapado y armado de actas; y
     `reservarVentanaActa()`: la ventana se abre en el clic, antes de
     cualquier `await` (si no, el navegador la bloquea).
  3. `modules/tickets/TicketCamposGestion|TicketComentarios|TicketComposer|
     TicketHistorial.vue` — contenido compartido entre `TicketDetalleView` y
     `TicketDetallePanel`; las diferencias van como prop, nunca en uno solo.
  4. `stores/crearStorePaginado.js` — todo listado con paginación server-side
     (hoy: tickets, empleados, correos, equipos, licencias, kb, problemas);
     los catálogos simples salen de `crearCatalogoStore()`. Leer su regla de
     coherencia post-mutación antes de agregar un `crear`/`softDelete`.
  5. `composables/useFormularioModal.js` — todo formulario en modal (hoy 10).
  6. `composables/usePopoverFlotante.js` — popovers teletransportados
     (`NotificacionesCampana`, `AppFiltros`).
  7. `composables/useFiltrosUrl.js` — filtros V2 (vistas + chips) con la URL
     como fuente de verdad; hoy Empleados y Equipos (piloto 2026-09-25).
     Componentes: `AppVistas` + `AppFiltros` (`docs/SISTEMA-DISENO.md` §3.2.1).
- **Gotcha de `resetearFiltros()`**: Empleados/Correos/Equipos/KB/Licencias/
  Problemas lo llaman en su `onMounted` a propósito (sus filtros son refs
  locales; sin el reset, el store queda con un filtro viejo invisible — bug de
  jul 2026). En Empleados y Equipos el reset sigue, pero justo después se
  aplican los filtros leídos de la URL (`useFiltrosUrl`): la URL manda.
  Tickets es la única excepción (`resetearBusqueda()`, filtros atados al
  store). No copiar la excepción sin migrar también los filtros.

## Backend

- **Migraciones**: `migrations/0XX_nombre.sql`, comentadas en español, una por
  archivo como fuente de verdad. Los rollbacks van en `migrations/rollback/`
  (fuera de la secuencia lineal). Aplicar con `scripts/apply-migration.mjs`
  (archivo temporal + `db import`; registra en `schema_migrations`) o
  `db import`; nunca `db query` con cuerpos `$$`. Verificar siempre después.
- **Updates masivos en Windows**: un solo `UPDATE ... FROM (VALUES ...)` por lote.
- **Edge functions** (4; un archivo cada una, sin imports entre ellas — por eso
  los helpers se repiten a propósito). Deploy:
  `npx @insforge/cli functions deploy <nombre> --file functions/<nombre>.ts`.

  | Function | Qué hace | Notas |
  | --- | --- | --- |
  | `credenciales` | cifrar/revelar/entregas/auditoría | secrets `CRED_KEY_V2`, `CRED_KEY_LEGACY`, `API_KEY`, `INSFORGE_BASE_URL`; auditoría fail-closed |
  | `tickets` | crear/buscar/seguir tickets públicos, adjuntos | rate-limit por IP/DNI |
  | `encuestas` | `abrir`/`responder` rondas anónimas | distinta de `ticket_satisfaccion` |
  | `equipos-fotos` | subir/borrar fotos (magic bytes + tamaño) | exige staff activo **con** módulo `equipos` |

- ⚠️ **Tope de fotos**: el `4` vive en dos lugares que se mueven juntos,
  `MAX_FOTOS` (`EquipoForm.vue`) y `MAX_FOTOS_POR_EQUIPO` (`equipos-fotos.ts`).
  No es frontera dura (alta sin fila, `equipoId` omitido); esa sería un CHECK.
- `schema_migrations`/`function_deploys` (069/070): qué está aplicado y
  desplegado; sin RLS, solo cliente admin. Acción `version` en las 4 functions.
- `functions/tsconfig.json` es solo para `deno check`; tocarlo no requiere deploy.
- **Trigger `created_by`**: `set_created_by_only()` asume esa columna; con otro
  nombre de autor (`ticket_comentarios.autor_id`) crear una función propia.

## Verificación

- `npm run lint` (raíz; cubre `frontend/src` y `functions/`).
- `npm run typecheck:functions` (raíz; requiere Deno — no usar `tsc`).
- `cd frontend && npm test` — 0 fallas. Los smoke de integración que se saltan
  lo hacen por secrets/cuentas que no existen (P0-04), no por estar rotos.
- `cd frontend && npx vite build`.
- `node scripts/patrones-ui.mjs` (raíz): modal a mano, `<img>` sin `alt`,
  botón solo-ícono sin nombre accesible.
- `npm run test:integration` (frontend) contra el backend real: requiere los
  secrets `VITE_INSFORGE_URL`, `VITE_INSFORGE_ANON_KEY`,
  `INSFORGE_TEST_STAFF_EMAIL/PASSWORD` (cuenta dedicada a CI). En CI, el job
  `test-integration` falla a propósito mientras falten (P0-04).
- `node scripts/test-db.mjs`: invariantes de triggers (SQL con rollback).
- Los discriminantes de autorización exigen un rechazo específico (SQLSTATE
  `42501`, `P0001` con el mensaje del guard, o el status HTTP real), nunca
  "hubo algún error"; sus mensajes nunca imprimen el payload.
- Prettier (`npm run format`) es de uso manual, no gate.
- Probar la function sin sesión:
  `npx @insforge/cli functions invoke credenciales --data '{"action":"entregaAbrir","token":"x"}'`
  → `{"ok":false,"code":"no_existe"}`.

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
