# AGENTS.md

> Este proyecto sigue [`docs/MATEREN-CORE.md`](docs/MATEREN-CORE.md) para
> principios en [`docs/MATEREN-CORE.md`](docs/MATEREN-CORE.md); tokens de producto
> v0.3 en [`docs/MATEREN-DESIGN-SYSTEM.md`](docs/MATEREN-DESIGN-SYSTEM.md).
> Implementación: `frontend/src/styles/main.css` (`--mat-*`, estilo shadcn sin
> librería) y [`docs/GUIA-UX-UI.md`](docs/GUIA-UX-UI.md).

**Vigencia de este documento**: actualizado 2026-07-07, migración 019
(endurecimiento de seguridad tras auditoría estática —
`auditoria_seguridad_sistema-ti_2026-07-07.md`). Un `.md` sin esta línea no
debe asumirse al día (regla de
[Materen Core → Gobernanza](docs/MATEREN-CORE.md#gobernanza)).

**Excepciones de precedencia documental**
([Gobernanza](docs/MATEREN-CORE.md#gobernanza) — declaradas
explícitamente, no asumidas): ante un conflicto, la documentación de
intención (este archivo, `README.md`, `GUIA-UX-UI.md`) gana **excepto**:
1. **Valores literales de tokens de color/tipografía/radio/z-index** — gana
   `frontend/src/styles/main.css`, que es siempre más reciente que su
   propia descripción en la guía.
2. **Estructura de datos** (columnas, tablas, triggers) — gana el estado
   real de la base y el historial de `migrations/*.sql`, no la descripción
   de dominio en `README.md`.

Contexto para agentes de código. Lee también el `README.md` (dominio, flujos,
modelo de seguridad y estructura del repo).

## Qué es

Panel interno de TI (Vue 3 + InsForge/Postgres) para inventariar empleados y
controlar el ciclo de vida de sus credenciales: alta guiada, baja con resumen,
cuentas personales/reutilizables/compartidas, rotación de contraseñas,
auditoría de accesos y entregas por enlace de un solo uso. Incluye además una
mesa de ayuda interna (`/tickets`) que reemplaza el helpdesk externo: los
empleados nunca tienen acceso al sistema, solo páginas públicas con token.

## Reglas del proyecto

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
  reintroduce la escalada H-CRIT de la auditoría.
- **Historial**: `asignaciones_cuenta` es append-only en la práctica — las
  asignaciones se cierran (`fecha_fin`), no se borran.
- Al editar una cuenta, enviar `password_cambiada: true` solo si el usuario
  escribió una contraseña nueva; si no, el update no debe tocar `password`
  (preserva el flag `requiere_rotacion` y `last_password_change`).
- Formato de código: seguir el estilo existente (componentes `<script setup>`,
  stores Pinia por módulo, capa de datos en `api/insforge.js` con mappers).
- **UI/UX**: colores, tipografías y clases reutilizables en
  `docs/GUIA-UX-UI.md` y `frontend/src/styles/main.css` (tokens `--mat-*`,
  sin Tailwind ni librería de componentes).

## Flujo de trabajo backend

- **Migraciones**: archivos numerados `migrations/0XX_nombre.sql` (comentados,
  en español). Se aplican manualmente:
  `npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"`.
  NO se usa `db migrations up` (el historial remoto del CLI está vacío a
  propósito).
- **Windows + `db query`**: límite de línea de comandos ~8 KB y ejecución poco
  fiable de múltiples statements DML en una llamada. Para updates masivos:
  un solo `UPDATE ... FROM (VALUES ...)` por lote.
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
- **Gotcha de triggers `created_by`**: `set_created_by_only()` asume una
  columna `created_by`; en tablas con otro nombre de autor (ej.
  `ticket_comentarios.autor_id`) hay que crear una función dedicada
  (`set_autor_id_only()`) en vez de reusarla — si no, el insert falla con
  `record "new" has no field "created_by"`.
- **Gotcha del SDK** (v1.4.0): `functions.invoke()` deriva
  `https://<app>.functions.insforge.app`, que NO existe en este backend; en
  navegador el 404 sin CORS bloquea el fallback. Por eso `getClient()`
  (`api/insforge.js`) pasa `functionsUrl: baseUrl + '/functions'`. No quitarlo.

## Verificación

- Build: `cd frontend && npx vite build` (no hay tests automatizados aún).
- Probar la función sin sesión:
  `npx @insforge/cli functions invoke credenciales --data '{"action":"entregaAbrir","token":"x"}'`
  debe responder `{"ok":false,"code":"no_existe"}`.

<!-- INSFORGE:START -->
## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **sistema-ti** (API base `https://kjyj8t5t.us-east.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
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
