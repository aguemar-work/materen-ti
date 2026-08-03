# Materen — Sistema TI

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
| Soporte | Edge function `tickets` (`functions/tickets.ts`) — mesa de ayuda interna, reemplaza el helpdesk externo (Bitrix24) |

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

- **Ticket**: reporte de soporte, público y sin sesión (el empleado **nunca**
  entra al sistema). Se crea desde `/soporte/nuevo` de dos formas: (a) con el
  **token de entrega** en la URL → se autorresuelve el empleado, sin pedirle
  datos; (b) sin token → intenta emparejar por correo/DNI contra `empleados`
  (si no hay match único, el ticket se crea igual con `vinculado = false` para
  revisión manual — el emparejamiento nunca bloquea el envío). No confundir el
  **token de entrega** (credenciales) con el **token de ticket** (seguimiento
  del reporte): son dos tokens distintos con propósitos distintos. El staff
  también puede abrir tickets internos desde `/tickets` (a nombre propio o de
  un empleado), donde además tiene botones para copiar los enlaces públicos
  de reportar (`/soporte/nuevo`) y de búsqueda por DNI (`/soporte/buscar`) para
  difundirlos a los empleados. Cada ticket tiene código (`TCK-####`) y token
  propio; con el token el empleado sigue su caso en `/soporte/:token` (solo ve
  comentarios no internos) sin volver a autenticarse, con CTAs para copiar el
  enlace/código, o puede recuperarlo en `/soporte/buscar` (por DNI, solo
  tickets activos, limitado por IP). Flujo de estados guiado por botones (no
  un select libre):
  desde `abierto`, el staff elige **Rechazar** (estado terminal `rechazado`,
  pide motivo obligatorio visible al empleado, sin encuesta) o **Iniciar
  atención** (pasa a `en_progreso`, exige elegir de una vez prioridad + nivel
  de atención N1/N2/N3 + asignado a — precargado con quien inicia, editable).
  En curso, **Marcar como resuelto** encadena `resuelto → cerrado` en un solo
  clic y dispara la encuesta si hay empleado vinculado. Solo el **JEFE** puede
  **Reabrir** un ticket cerrado/rechazado (reforzado también por trigger en
  BD, no solo en la UI) — conserva prioridad/nivel/asignado previos. Al
  cerrarse con empleado vinculado, se reutiliza el **mismo token** del ticket
  para el enlace de encuesta (`/soporte/:token/satisfaccion`) — a diferencia de
  Bitrix24, el empleado no tiene que anotar ningún ID. Esa página consulta
  primero si ya se respondió (`encuestaEstado`) antes de mostrar el
  formulario, para que un refresco después de enviar no la haga parecer
  reenviable. `ticket_eventos` es la hoja de vida append-only del ticket
  (asignaciones, cambios de estado/prioridad/nivel de atención, fallos de
  correo, envío/respuesta de encuesta).

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
4. **Soporte por ticket**: el empleado reporta un problema en `/soporte/nuevo`
   (con o sin token de entrega) → recibe su código y token en pantalla y por
   correo (best-effort) → el staff lo triaga en `/tickets` (asignar,
   priorizar, comentar interno/visible vía Timeline) → al cerrar, se dispara
   la encuesta de satisfacción reutilizando el mismo token.

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
  soporte: solo por ticket, con enlace a `/soporte/nuevo` (token de entrega ya
  en la URL) — ya no enlaza al helpdesk externo de Bitrix24.
- Las tablas `tickets` y `ticket_satisfaccion` no tienen política de INSERT
  para clientes: solo la edge function `tickets` (cliente admin) escribe,
  igual que `entregas`. `ticket_eventos` es append-only por trigger.
- **Sin registro público**: `disable_signup = true` en `insforge.toml`. El
  staff lo aprovisiona solo el JEFE desde el dashboard; el trigger de auto-alta
  crea la fila `staff` **inactiva** (`activo = false`) y el JEFE la activa a
  mano (defensa en profundidad, migración 018).
- **Política de contraseñas** de staff: mínimo 12 caracteres con número,
  minúscula, mayúscula y símbolo (`insforge.toml`).
- **Rate-limits**: el revelado de contraseñas está topado por usuario
  (40 / 5 min, vía `accesos_log`); la búsqueda pública por DNI, por IP y por
  DNI (`ticket_busqueda_intentos`).
- **Integridad de tickets** (migración 019): un ticket `cerrado`/`rechazado`
  solo sale de ese estado si el JEFE lo reabre; `token`, `codigo`, `origen` y
  `creado_por` son inmutables tras la creación.
- El detalle completo del análisis estático y su remediación vive en
  `auditoria_seguridad_sistema-ti_2026-07-07.md`.

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
│       │   ├── entregas/      # página pública /entrega/:token
│       │   └── tickets/       # mesa de ayuda: público (nuevo/seguimiento/encuesta) + staff (bandeja/detalle)
│       ├── router/            # rutas + guards (meta.public para entregas y tickets)
│       └── stores/            # Pinia
├── functions/
│   ├── credenciales.ts     # edge function: encrypt / revelar / entregaCrear / entregaAbrir
│   └── tickets.ts          # edge function: catalogo / crear / seguimiento / buscarPorDni /
│                           #   encuestaEstado / encuesta / enviarEncuesta
├── migrations/             # 001..019 — esquema completo, en orden, comentado
├── docs/
│   └── GUIA-UX-UI.md       # design system y convenciones de UI
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

- **Migraciones**: archivos numerados en `migrations/`, aplicados manualmente.
  En Linux/macOS:
  `npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"`.
  En **Windows** (límite ~8 KB por línea de comandos), usar el script:
  `node scripts/apply-migration.mjs migrations/0XX_nombre.sql`.
  Para updates masivos usar un solo `UPDATE ... FROM (VALUES ...)` por lote.
- **Edge function**: editar `functions/credenciales.ts` y desplegar con
  `npx @insforge/cli functions deploy credenciales --file functions/credenciales.ts`.
  Lo mismo para `functions/tickets.ts` → `npx @insforge/cli functions deploy
  tickets --file functions/tickets.ts` (tiene su propio `ORIGENES_PERMITIDOS`,
  se actualiza igual que en `credenciales.ts`).
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
| 016 | Tickets: `categorias_ticket`/`subcategorias_ticket`, `tickets`, `ticket_comentarios`, `ticket_eventos`, `ticket_satisfaccion` + triggers (código autogenerado, bloqueo de comentarios en cerrado, encuesta automática al cerrar) |
| 017 | Tickets — flujo guiado: estado `rechazado`, columna `nivel_atencion` (N1/N2/N3), trigger que exige nivel+asignado al iniciar, trigger que restringe "reabrir" al jefe, `ticket_busqueda_intentos` (rate-limit de la búsqueda pública por DNI) |
| 018 | Seguridad (auditoría H-CRIT): el trigger de auto-alta crea el `staff` **inactivo** (`activo=false`); el JEFE lo activa. Complementa `disable_signup=true` en `insforge.toml` |
| 019 | Seguridad (auditoría H-01/H-06): trigger que impide sacar un ticket de `cerrado`/`rechazado` salvo reabriéndolo (solo JEFE); `token`/`codigo`/`origen`/`creado_por` inmutables tras crear |
| 020 | Áreas/obras: catálogo `areas_obras` + `empleados.area_obra_id` |
| 021 | `areas_obras`: trazabilidad `created_by` / `updated_by` |
| 022 | Accesorios de equipo con código de almacén (catálogo `equipo_accesorios`) |
| 023 | `codigo_almacen` en `equipos` (activos grandes) |
| 024 | Accesos sensibles: `accesos_sensibles` + `accesos_sensibles_permisos`, visibilidad JEFE-con-permiso-por-fila (no todo JEFE), clave de cifrado aislada `CRED_KEY_SENSIBLE`, auditoría de ciclo de vida en `accesos_log` |
| 035 | Distinción incidente/solicitud: `tickets.tipo` + `subcategorias_ticket.tipo_sugerido` (heredado al crear, editable por staff); `check_iniciar_completo` exige `tipo` antes de pasar a en_progreso; alta de subcategorías nuevas exige elegir `tipo_sugerido` |

## Checklist de deploy

1. Aplicar migraciones pendientes (`node scripts/apply-migration.mjs migrations/0XX_….sql` en Windows).
2. Redesplegar edge functions si cambiaron: `credenciales`, `tickets`.
3. Push de `insforge.toml` si cambió auth/storage.
4. Build frontend: `cd frontend && npm run build`.
5. Deploy Vercel (o push a la rama conectada).
6. Verificar CORS: `ORIGENES_PERMITIDOS` en ambas edge functions incluye el dominio de producción.
7. Smoke test: login → dashboard → revelar contraseña → entrega pública → ticket público.

## Producción

- Frontend desplegado en Vercel: **https://materen-ti.vercel.app**
- SPA rewrites: `frontend/vercel.json` (copiado a `dist/` vía `public/`) — sin
  esto las rutas profundas (`/entrega/:token`, `/empleados/:id`) dan 404.
- CORS de las edge functions `credenciales` y `tickets`: allowlist con el
  dominio de producción + localhost (dev), una por función. Si cambia el
  dominio, actualizar `ORIGENES_PERMITIDOS` en ambos archivos y redesplegar.
- Correo transaccional (confirmación de ticket, aviso de encuesta) es
  best-effort: el plan actual de InsForge (free) no tiene `emails.send()`
  habilitado, así que esos envíos fallan y quedan registrados como evento
  `correo_fallido` en `ticket_eventos`, sin bloquear la creación/cierre del
  ticket. El canal garantizado es la pantalla (código + token visibles).

## Pendientes / roadmap

- [x] Desplegar el frontend → https://materen-ti.vercel.app (Vercel).
- [x] Tests automatizados (unitarios + triggers de BD con rollback; ver `.github/workflows/ci.yml`).
- [x] Restringir CORS de la edge function al dominio del frontend.
- [x] Partir `api/insforge.js` por dominio (`api/domains/*` + barrel).
- [x] Paginación server-side en listados principales (empleados, tickets, equipos, licencias, correos).
- [x] Lazy loading de rutas y code-splitting por vista.
- [x] Búsqueda global ampliada (empleados, cuentas, equipos, tickets, licencias).
- [ ] Multitenancy y modelo de cobro (si se comercializa).

Notas de equipos: el **acta de entrega imprimible** se genera desde la fila del
equipo asignado (🖨) — HTML listo para imprimir o guardar como PDF, con datos
del receptor, del equipo, specs, accesorios, condición, cláusula de
responsabilidad y firmas. Las **fotos** (máx. 4 por equipo) se comprimen en el
navegador (`core/imagenes.js`, ~200 KB c/u) antes de subir al bucket público
`equipos-fotos`; se guarda `{url, key}` por foto.
