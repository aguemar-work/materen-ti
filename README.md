# Sistema TI — Inventario de empleados y control de accesos

Panel interno de TI para registrar empleados, administrar sus credenciales de
acceso a plataformas (Gmail, Bitrix24, VPN, ERP, etc.) y entregarlas de forma
segura. No es solo un almacén de contraseñas: el corazón del sistema es el
**historial de asignaciones** — quién tuvo qué acceso, desde cuándo, hasta
cuándo y si la contraseña se rotó después.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Vue 3 + Vite + Pinia + vue-router (`frontend/`) |
| Backend | [InsForge](https://insforge.dev) (BaaS sobre Postgres) — proyecto `sistema-ti`, API `https://kjyj8t5t.us-east.insforge.app` |
| Seguridad | Edge function `credenciales` (`functions/credenciales.ts`) — cifrado AES-256-GCM en servidor, auditoría y entregas de un solo uso |

## Conceptos del dominio

- **Empleado**: persona inventariada. No inicia sesión en el sistema. Tiene
  estado `Activo / Inactivo / Suspendido` y pertenece a una **empresa**.
- **Staff**: quien sí inicia sesión (tabla `staff`, 1:1 con `auth.users`).
  Dos roles: **JEFE** (todo: eliminar, staff, auditoría) y **ASISTENTE**
  (operativo). Aplicado con RLS en todas las tablas.
- **Cuenta**: una credencial en una plataforma. Tres tipos (`tipo_cuenta`):
  - `personal` — de una sola persona; **se da de baja junto con el empleado**.
  - `reutilizable` — un titular a la vez; al salir el titular queda **Libre**
    para heredarse al siguiente (un trigger de BD impide dos titulares activos).
  - `compartida` — varios titulares simultáneos.
- **Asignación** (`asignaciones_cuenta`): quién tiene/tuvo cada cuenta.
  `fecha_fin NULL` = activa. Nunca se borra: es el historial.
- **Rotación**: cuando una cuenta reutilizable/compartida pierde un titular,
  un trigger la marca `requiere_rotacion = true` (badge "Rotar contraseña" y
  pendiente en el Dashboard) hasta que alguien cambie la contraseña. Es
  advertencia, no bloqueo.
- **Entrega**: enlace de un solo uso (`/entrega/<token>`) con las credenciales
  de un empleado. Expira en 24 h o al abrirse. Es lo que se envía por WhatsApp
  (nunca contraseñas en el mensaje).
- **Licencia**: software comprado con N asientos (`cantidad`). Dos variantes:
  - **Con login** (`cuenta_id`) — el usuario de acceso es un correo compartido
    del módulo Correos (ej: `autocad@inacons.com.pe`). Si el software tiene
    **contraseña propia** distinta a la del correo (caso AutoCAD), va cifrada
    en `clave`; si `clave` es NULL se entra con la contraseña del correo. Los
    usuarios de la licencia son las asignaciones de ese correo y un trigger
    impide asignar más personas que asientos.
  - **Sin login** (`clave`) — clave/serial cifrada en servidor (revelado
    auditado); los usuarios van en `asignaciones_licencia`, con el mismo tope.

  Las suscripciones con `fecha_vencimiento` a ≤30 días aparecen como pendiente
  en el Dashboard. La baja de empleado también libera sus asientos.

- **Equipo**: activo físico con código de inventario único (etiqueta), tipo
  (catálogo `tipos_equipo` con plantilla de specs y accesorios por tipo),
  serie, garantía y costo. El estado guardado es **solo el físico**
  (`operativo / en_reparacion / de_baja / perdido`); "Disponible/Asignado" se
  **deriva** de la asignación activa — nunca se escribe a mano. Regla clave:
  **la baja de empleado NO cierra asignaciones de equipos** — quedan
  "pendientes de devolución" (rojo en el Dashboard) hasta registrar la
  devolución física con su condición. `eventos_equipo` es la hoja de vida
  append-only del activo (escrita por triggers, inmutable desde el cliente).
  Un equipo se asigna a una **persona o a una ubicación** (catálogo
  `ubicaciones`: almacenes, áreas, sedes — exactamente uno de los dos por
  asignación). Mover entre ubicaciones es libre; si lo tiene una persona,
  se exige registrar la devolución primero.

## Flujos principales

1. **Alta guiada**: Empleados → "Nuevo empleado" → guarda → aterriza en la
   ficha (`/empleados/:id?nuevo=1`) con guía de 3 pasos: registrado → asignar
   accesos → enviar por WhatsApp (genera la entrega de un solo uso).
2. **Baja**: botón "Dar de baja" → modal con resumen de qué pasará con cada
   cuenta (personales se dan de baja, reutilizables quedan libres, compartidas
   pierden a ese usuario) → confirmar. Las cuentas heredables quedan marcadas
   "Rotar contraseña".
3. **Auditoría**: cada vez que alguien **ve, copia o envía** una contraseña
   queda registrado en `accesos_log`. El JEFE lo consulta en `/actividad`.

## Modelo de seguridad

- Las contraseñas se cifran **en el servidor** (AES-256-GCM). Las claves viven
  en los secrets de InsForge: `CRED_KEY_V2` (formato `enc2:`) y
  `CRED_KEY_LEGACY` (formato histórico `enc:`). **Ninguna clave llega al
  navegador.**
- Los listados no traen contraseñas (ni cifradas). Se revelan bajo demanda vía
  la edge function (`frontend/src/api/passwords.js`), que verifica staff activo
  y audita cada revelado.
- `accesos_log` no tiene políticas de escritura para usuarios: solo la edge
  function (cliente admin) escribe. Ni el JEFE puede alterar la auditoría.
- En formularios de edición, el campo contraseña vacío significa "mantener la
  actual" — la contraseña vigente nunca se precarga.
- La página `/entrega/:token` es pública (sin sesión) e incluye la política de
  soporte: solo por ticket (helpdesk Bitrix24).

## Estructura del repo

```
├── frontend/               # SPA Vue 3
│   └── src/
│       ├── api/
│       │   ├── insforge.js    # capa de datos (PostgREST vía SDK)
│       │   └── passwords.js   # todo lo que toca contraseñas → edge function
│       ├── components/shared/AppLayout.vue
│       ├── core/              # formatters, toast, utils
│       ├── modules/           # una carpeta por módulo de UI
│       │   ├── actividad/     # auditoría (solo JEFE)
│       │   ├── auth/          # login + reestablecer contraseña (código por email)
│       │   ├── configuracion/ # /configuracion con pestañas: Empresas, Plataformas,
│       │   │                  #   Tipos de equipo, Ubicaciones, Staff (JEFE)
│       │   ├── correos/       # cuentas reutilizables/compartidas
│       │   ├── cuentas/       # panel de accesos de un empleado + formularios
│       │   ├── dashboard/     # stats + pendientes accionables
│       │   ├── empleados/     # lista, ficha (/empleados/:id), alta, baja
│       │   ├── empresas/  plataformas/  staff/   # paneles embebidos en Configuración
│       │   ├── licencias/     # licencias de software con tope de asientos
│       │   ├── equipos/       # inventario físico: entrega/devolución/hoja de vida
│       │   └── entregas/      # página pública /entrega/:token
│       ├── router/            # rutas + guards (meta.public para entregas)
│       └── stores/            # Pinia
├── functions/
│   └── credenciales.ts     # edge function: encrypt / revelar / entregaCrear / entregaAbrir
├── migrations/             # 001..010 — esquema completo, en orden, comentado
├── docs/
│   └── GUIA-UX-UI.md       # colores, tipografías, layout y componentes del panel
├── AGENTS.md               # contexto para agentes de código
└── insforge.toml           # config del backend (auth por código, password min 6)
```

## Desarrollo

```bash
cd frontend
npm install
cp .env.example .env        # completar VITE_INSFORGE_ANON_KEY
npm run dev
```

La anon key se obtiene con `npx @insforge/cli secrets get ANON_KEY` (requiere
`npx @insforge/cli login` y el proyecto vinculado en `.insforge/project.json`).

> Nota: los enlaces de entrega usan `window.location.origin`; en desarrollo
> solo abren desde la misma máquina. En producción (frontend desplegado)
> funcionan desde cualquier dispositivo.

## Backend: migraciones y función

- **Migraciones**: archivos numerados en `migrations/`, aplicados manualmente:
  `npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"`.
  No se usa el tracking de migraciones del CLI. En Windows, cuidado con el
  límite de línea de comandos (~8 KB): para updates masivos usar un solo
  `UPDATE ... FROM (VALUES ...)` por lote.
- **Edge function**: editar `functions/credenciales.ts` y desplegar con
  `npx @insforge/cli functions deploy credenciales --file functions/credenciales.ts`.
- **Gotcha del SDK**: `functions.invoke()` deriva por defecto un subdominio
  que no existe en este backend; por eso `getClient()` pasa
  `functionsUrl: baseUrl + '/functions'`. No quitar esa opción.

## Historial de migraciones

| # | Contenido |
|---|---|
| 001 | Catálogos `empresas` y `plataformas` + trigger `updated_at` |
| 002 | `empleados` y `cuentas` |
| 003 | `staff`, roles JEFE/ASISTENTE, funciones `es_jefe()/es_staff()`, RLS en todo |
| 004 | Modelo de asignaciones: `asignaciones_cuenta`, cuentas sin `empleado_id` |
| 005 | Trazabilidad `created_by/updated_by` |
| 006 | `tipo_cuenta`: personal / reutilizable / compartida |
| 007 | Fix trigger de asignaciones |
| 008 | `last_password_change` + trigger de exclusividad para reutilizables |
| 009 | `requiere_rotacion` + trigger al cerrar asignaciones |
| 010 | Seguridad: `accesos_log` (auditoría) y `entregas` (enlaces de un solo uso) |
| 011 | Licencias: `licencias`, `asignaciones_licencia` y triggers de tope de asientos |
| 012 | `renovacion_meses` en licencias (periodo de renovación; botón "Renovar" en la UI) |
| 013 | Equipos: `tipos_equipo`, `equipos`, `asignaciones_equipo`, `eventos_equipo` + triggers |
| 014 | `ubicaciones` + asignaciones de equipo a persona O ubicación (exactamente uno) |
| 015 | `fotos` en equipos (bucket público `equipos-fotos`, compresión en cliente) |

## Producción

- Frontend desplegado en Vercel: **https://materen-ti.vercel.app**
- SPA rewrites: `frontend/vercel.json` (copiado a `dist/` vía `public/`) — sin
  esto las rutas profundas (`/entrega/:token`, `/empleados/:id`) dan 404.
- CORS de la edge function `credenciales`: allowlist con el dominio de
  producción + localhost (dev). Si cambia el dominio, actualizar
  `ORIGENES_PERMITIDOS` en `functions/credenciales.ts` y redesplegar.

## Pendientes / roadmap

- [x] Desplegar el frontend → https://materen-ti.vercel.app (Vercel).
- [ ] Tests automatizados (candidatos: triggers de BD y edge function).
- [x] Restringir CORS de la edge function al dominio del frontend.
- [ ] Partir `api/insforge.js` por dominio a medida que crezca.
- [ ] Multitenancy y modelo de cobro (si se comercializa).
- [x] Búsqueda global en la UI (sidebar: empleados, cuentas y equipos).

Notas de equipos: el **acta de entrega imprimible** se genera desde la fila del
equipo asignado (🖨) — HTML listo para imprimir o guardar como PDF, con datos
del receptor, del equipo, specs, accesorios, condición, cláusula de
responsabilidad y firmas. Las **fotos** (máx. 4 por equipo) se comprimen en el
navegador (`core/imagenes.js`, ~200 KB c/u) antes de subir al bucket público
`equipos-fotos`; se guarda `{url, key}` por foto.
