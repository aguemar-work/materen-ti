# AGENTS.md

Contexto para agentes de código. Lee también el `README.md` (dominio, flujos,
modelo de seguridad y estructura del repo).

## Qué es

Panel interno de TI (Vue 3 + InsForge/Postgres) para inventariar empleados y
controlar el ciclo de vida de sus credenciales: alta guiada, baja con resumen,
cuentas personales/reutilizables/compartidas, rotación de contraseñas,
auditoría de accesos y entregas por enlace de un solo uso.

## Reglas del proyecto

- **Idioma**: UI, comentarios, nombres de funciones/variables de dominio y
  mensajes en **español** (código base en Perú: DNI, RUC, WhatsApp).
- **Contraseñas**: NUNCA en listados ni precargadas en formularios. Todo lo
  que toque contraseñas pasa por `frontend/src/api/passwords.js` → edge
  function `credenciales` (cifra con claves de servidor y audita en
  `accesos_log`). No reintroducir cifrado en el cliente.
- **Softdelete** en todo (`deleted_at`); DELETE físico solo JEFE (RLS).
- **Historial**: `asignaciones_cuenta` es append-only en la práctica — las
  asignaciones se cierran (`fecha_fin`), no se borran.
- Al editar una cuenta, enviar `password_cambiada: true` solo si el usuario
  escribió una contraseña nueva; si no, el update no debe tocar `password`
  (preserva el flag `requiere_rotacion` y `last_password_change`).
- Formato de código: seguir el estilo existente (componentes `<script setup>`,
  stores Pinia por módulo, capa de datos en `api/insforge.js` con mappers).

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
