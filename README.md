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
| Backend | [InsForge](https://insforge.dev) (BaaS sobre Postgres) — proyecto `<PROJECT_NAME>`, API `<INSFORGE_PROJECT_URL>` |
| Seguridad | Edge function `credenciales` (`functions/credenciales.ts`) — cifrado AES-256-GCM en servidor, auditoría y entregas de un solo uso |
| Soporte | Edge function `tickets` (`functions/tickets.ts`) — mesa de ayuda interna, reemplaza el helpdesk externo (Bitrix24) |
| Encuestas | Edge function `encuestas` (`functions/encuestas.ts`) — encuestas anónimas reutilizables (plantilla + rondas), distintas de la encuesta de satisfacción por ticket |

> `<PROJECT_NAME>`/`<INSFORGE_PROJECT_URL>` son placeholders a propósito — ver
> ["Documentación sensible" en `AGENTS.md`](AGENTS.md#documentación-sensible--no-pegar-en-herramientas-externas-sin-revisar)
> antes de compartir este README o pegarlo en una IA externa.

Las 4 edge functions corren en **Deno Subhosting** (no Node) — de ahí
`Deno.env.get(...)` y el especificador de import `npm:@insforge/sdk`.
Type-check con `deno check` (`functions/tsconfig.json`, ver AGENTS.md
§Verificación), no `tsc`: un tsconfig de Node no resuelve `npm:` ni conoce el
global `Deno`.

## Conceptos del dominio

- **Empleado**: persona inventariada. No inicia sesión en el sistema. Tiene
  estado `Activo / Inactivo / Suspendido` y pertenece a una **empresa**.
  Su **área/obra** (función/asignación laboral, catálogo `areas_obras`) y su
  **ubicación** (lugar físico, catálogo `ubicaciones` — el mismo que usan los
  equipos) son dos ejes independientes desde la migración 059: ninguno se
  deriva del otro. Antes de esa migración estaban mezclados (`areas_obras`
  tenía una `ubicacion_id` opcional) — se separaron porque no eran el mismo
  concepto: "Almacén" es un área funcional de logística, no un lugar.
- **Staff**: quien sí inicia sesión (tabla `staff`, 1:1 con `auth.users`).
  Dos roles: **JEFE** (todo: eliminar, staff, auditoría) y **ASISTENTE**
  (operativo). Aplicado con RLS en todas las tablas.
- **Permisos de módulo** (`staff_modulos_permisos`, migración 056): además
  del rol, cada ASISTENTE tiene una lista de módulos operativos habilitados
  (Tickets, Empleados, Correos, Licencias, Equipos, Base de Conocimiento,
  Problemas, Encuestas). Un módulo sin fila para ese usuario se oculta del
  sidebar y bloquea la navegación directa por URL (router guard) — eso
  sigue siendo solo control de UI. Pero desde la migración 068, licencias,
  equipos y correos (cuentas) **también lo exigen en RLS**
  (`tiene_permiso_modulo('...')`, JEFE exento siempre): un ASISTENTE sin el
  módulo ya no puede leer/escribir esas tablas vía SDK directo, no solo que
  desaparecen del sidebar. `empleados` es la excepción a propósito: el
  SELECT sigue abierto a cualquier staff activo (Equipos/Licencias/Correos
  embeben el nombre del empleado asignado), solo alta/edición quedan
  gateadas por el módulo. JEFE siempre ve los 8 módulos, sin excepción.
- **Cuenta**: una credencial en una plataforma. Tres tipos (`tipo_cuenta`):
  - `personal` — de una sola persona; **se da de baja junto con el empleado**
    (un trigger de BD impide dos titulares activos, igual que `reutilizable`).
  - `reutilizable` — un titular a la vez; al salir el titular queda **Libre**
    para heredarse al siguiente (mismo trigger de exclusividad).
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
    impide asignar más personas que asientos. Se asigna con el mismo botón
    "Asignar a un empleado" de la lista de Licencias que las licencias sin
    login (`licenciasApi.asignarUsuario`, delega en `asignarCuentaExistente`
    del módulo Correos) — no hace falta ir a otro módulo.
  - **Sin login** (`clave`) — clave/serial cifrada en servidor (revelado
    auditado); los usuarios van en `asignaciones_licencia`, con el mismo tope.

  Las suscripciones con `fecha_vencimiento` a ≤30 días aparecen como pendiente
  en el Dashboard. La baja de empleado también libera sus asientos.

- **Ticket**: reporte de soporte, público y sin sesión (el empleado **nunca**
  entra al sistema). Se crea desde `/soporte/nuevo` pidiendo el **DNI** del
  empleado: el backend intenta emparejar por DNI contra `empleados` (si no
  hay match, el ticket se crea igual con `vinculado = false` para revisión
  manual — el emparejamiento nunca bloquea el envío). Ya no existe la ruta de
  entrada con **token de entrega** en la URL (autorresolvía el empleado sin
  pedirle DNI) — se retiró el 2026-08-17 (migración 067, ver
  `docs/HISTORIAL-AUDITORIAS.md`); el único token de este flujo es el
  **token de ticket** (seguimiento del reporte). El staff
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
  correo, envío/respuesta de encuesta). **Canal de entrega de la encuesta**
  (sin correo, ver más abajo): el mismo formulario (`EncuestaSatisfaccionForm.vue`)
  se **embebe** en `/soporte/:token` en cuanto el ticket pasa a `cerrado` —
  el empleado ya tiene ese enlace de seguimiento desde que creó el ticket, no
  hace falta que navegue a otra URL. Si la encuesta no existe todavía para
  ese ticket (sin empleado vinculado) o falla la consulta, el bloque
  simplemente no aparece — no rompe una página de seguimiento que por lo
  demás carga bien. Además, en `/tickets/:id` el staff tiene un botón
  **"Copiar mensaje de WhatsApp"** (junto a "Satisfacción", visible mientras
  la encuesta esté sin responder) que copia al portapapeles un mensaje con
  el enlace directo — mismo patrón de copiar-y-pegar que el enlace de
  soporte (`copiarEnlaceSoporte()`, `TicketsView.vue`), sin abrir WhatsApp
  por su cuenta. El consolidado histórico (`/tickets/satisfaccion`, sin
  recorte de periodo) tiene buscador propio + chip **"Solo insatisfechos"**
  (nivel ≤ 3) sobre "Todas las respuestas"; "Por solicitante"
  (Respondidas/Pendientes) y "Por técnico" (Total/Respondidas) muestran
  además el desglose de respuestas por nivel (1 a 5), calculado en el
  cliente sobre el histórico ya cargado — sin tocar la RPC. Botón
  **"Descargar PDF"** con KPIs + esas dos tablas + "Todas las respuestas"
  (40 más recientes) + una sección aparte de "Respuestas con baja
  satisfacción" ordenada peor-primero (`reporteSatisfaccion.js`, mismas
  primitivas de layout que el PDF del "Reporte" de Tickets, extraídas a
  `core/pdfReporte.js`). **Workspace de 3 columnas** (`/tickets`, modo
  Triage — por defecto desde el Plan Maestro v2, Frente 2, 2026-09-04; el
  modo Tabla sigue disponible para selección múltiple/reasignación en
  lote): Bandejas + lista angosta + `TicketDetallePanel.vue`, que a su vez
  gana una 3ra columna de **contexto** (equipos asignados al solicitante,
  artículos de KB relacionados, problema vinculado — colapsable, con botón
  propio en el header del panel) y una sección de **Acciones rápidas** con
  2 macros para copiar al portapapeles: "Pedir más información" (nueva) y
  "Resuelto + encuesta" (la misma de arriba, ahora también disponible acá).

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
  se exige registrar la devolución primero. En `/equipos`, 3 tarjetas KPI
  (Libres para entregar / Ocupados / En reparación, sobre todo el
  inventario, no solo la página filtrada) resumen la disponibilidad de un
  vistazo y filtran la lista al hacer clic. La "Hoja de vida" (histórico de
  eventos + fotos + especificaciones técnicas + accesorios) se abre en un
  panel lateral (drawer), no en un modal centrado — mismo componente
  `Modal.vue` compartido, con su prop `lateral`.

- **Notificación**: aviso persistente para todo el staff sobre 4 eventos
  concretos (`ticket_creado`, `cuenta_creada`, `empleado_alta`,
  `empleado_baja`), cada uno con su propio trigger explícito — no es un
  motor de reglas genérico (decisión deliberada, migración 045). Cada
  usuario de staff tiene su propio estado leído/no-leído
  (`notificaciones_lecturas`) sobre la misma notificación. Se muestra en la
  campana del layout (`NotificacionesCampana.vue`) vía el canal realtime
  `notificaciones:nuevas`. Distinto del aviso emergente de "ticket nuevo"
  (canal `tickets:nuevos`, migración 044), que es solo un toast efímero con
  sonido, sin persistencia ni estado de lectura.
- **Encuesta** (módulo `/encuestas`, JEFE crea/edita): plantilla reutilizable
  de preguntas (5 tipos: texto corto/largo, opción única, escala 1-5, sí/no)
  que se relanza como **ronda** (`encuesta_rondas`) cada vez que se quiere
  recolectar feedback, con su propio link público (`/encuesta/:slug`) y sus
  propias respuestas anónimas (`encuesta_respuestas`) — las rondas nunca
  mezclan respuestas entre sí. Las preguntas de una plantilla quedan
  congeladas en cuanto tiene alguna ronda. **No confundir con la encuesta de
  satisfacción de un ticket** (`ticket_satisfaccion`): esa es automática,
  por ticket cerrado y con el empleado vinculado; esta es manual, genérica
  (p. ej. clima laboral) y sin relación con tickets.

## Flujos principales

1. **Alta guiada**: Empleados → "Nuevo empleado" → guarda → aterriza en la
   ficha (`/empleados/:id?nuevo=1`) con guía de 5 pasos: registrado → cuenta de
   correo → **credenciales entregadas** (enviar por WhatsApp — requisito, no
   opcional: tener la cuenta creada no es lo mismo que el empleado ya la
   conozca) → equipo y licencia (ofrecidos, no exigidos). Cada paso pendiente
   trae su propio botón, que abre directo el formulario/acción que corresponde
   (`core/dominio-empleados.js`, `pasosAlta()`).
2. **Baja**: botón "Dar de baja" → modal con resumen de qué pasará con cada
   cuenta (personales se dan de baja, reutilizables quedan libres, compartidas
   pierden a ese usuario) → confirmar. Al confirmar, un checklist animado
   (retardo fijo de 300ms por ítem) muestra cada escritura del RPC atómico
   `dar_baja_empleado()` marcándose una por una — el último ítem solo se marca
   listo cuando el RPC real también resolvió, nunca antes. Las cuentas
   heredables quedan marcadas "Rotar contraseña"; los equipos, aparte, quedan
   como último ítem "pendiente" (no "hecho": la baja nunca los toca, ver
   Modelo de seguridad).
3. **Auditoría**: cada vez que alguien **ve, copia o envía** una contraseña
   queda registrado en `accesos_log`. El JEFE lo consulta en `/actividad`.
4. **Soporte por ticket**: el empleado reporta un problema en `/soporte/nuevo`
   (con o sin token de entrega) → recibe su código y token en pantalla → el
   staff lo triaga en `/tickets` (asignar, priorizar, comentar interno/visible
   vía Timeline) → al cerrar, se genera la encuesta de satisfacción
   reutilizando el mismo token (sin aviso por correo: el sistema no envía
   avisos/notificaciones por correo, ver nota más abajo). Canal real: el
   formulario se embebe solo en `/soporte/:token` (el empleado ya tiene ese
   enlace) y el staff puede copiar un mensaje de WhatsApp con el enlace
   directo desde `/tickets/:id`.

## Modelo de seguridad

- Las contraseñas se cifran **en el servidor** (AES-256-GCM). Las claves viven
  en los secrets de InsForge: `CRED_KEY_V2` (formato `enc2:`) y
  `CRED_KEY_LEGACY` (formato histórico `enc:`). **Ninguna clave llega al
  navegador.**
- Los listados no traen contraseñas (ni cifradas). Se revelan bajo demanda vía
  la edge function (`frontend/src/api/passwords.js`), que verifica staff activo
  y audita cada revelado. Desde la migración 060, revelar/enviar una
  contraseña de Cuentas o Licencias exige además el permiso individual
  `credenciales.ver` (`staff_permisos`) — JEFE siempre lo tiene; a un
  ASISTENTE se le otorga/revoca desde Configuración·Staff. El gate real vive
  en `functions/credenciales.ts` (única fuente de verdad desde la migración
  088, ver `AGENTS.md`); el del frontend es cosmético.
- `accesos_log` no tiene políticas de escritura para usuarios: solo la edge
  function (cliente admin) escribe. Ni el JEFE puede alterar la auditoría.
- En formularios de edición, el campo contraseña vacío significa "mantener la
  actual" — la contraseña vigente nunca se precarga.
- La página `/entrega/:token` es pública (sin sesión) e incluye la política de
  soporte: solo por ticket, con enlace a `/ticket/nuevo` (pide DNI como
  cualquier otro ingreso; desde 2026-08-17 ya no propaga el token de entrega
  como query param — quedaba en el historial/URL del navegador reutilizando
  un secreto ya consumido) — ya no enlaza al helpdesk externo de Bitrix24.
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
  DNI (`ticket_busqueda_intentos`); la creación pública de tickets, por IP
  (8 / 10 min, `ticket_creacion_intentos`, migración 037 — no aplica a
  tickets creados por staff autenticado); las respuestas a encuestas
  públicas, por IP (`encuesta_respuesta_intentos`, migración 043).
- **Tickets públicos**: `titulo`/`descripcion` tienen tope de longitud en
  servidor (200 / 5000 caracteres).
- **Baja de empleado atómica** (migración 038): las 4 escrituras (cerrar
  asignaciones de cuenta/licencia, dar de baja cuentas personales, marcar
  Inactivo) corren en una sola transacción de servidor vía RPC
  (`dar_baja_empleado`), no como 4 updates secuenciales desde el cliente.
- **Integridad de tickets** (migración 019): un ticket `cerrado`/`rechazado`
  solo sale de ese estado si el JEFE lo reabre; `token`, `codigo`, `origen` y
  `creado_por` son inmutables tras la creación.
- El historial de auditorías (seguridad estática 2026-07-07 + auditoría
  integral 2026-08-05, arquitectura/UX/seguridad/QA/DevOps/performance/datos)
  vive consolidado con el estado de cada hallazgo en
  `docs/HISTORIAL-AUDITORIAS.md`.

## Estructura del repo

```
├── frontend/               # SPA Vue 3
│   └── src/
│       ├── api/
│       │   ├── insforge.js    # capa de datos (PostgREST vía SDK)
│       │   └── passwords.js   # todo lo que toca contraseñas → edge function
│       ├── styles/
│       │   ├── main.css        # @theme de Tailwind (único lugar con tokens)
│       │   └── componentes.css # primitivas oficiales (.campo, .notif, .cred, .modal...)
│       ├── components/
│       │   ├── ui/             # wrappers de PrimeVue + componentes base (AppButton, AppTable, AppPortal...)
│       │   └── shared/         # AppLayout, AppNav, Modal, ConfirmDialog, MenuAcciones, ...
│       ├── core/              # dominio-*.js, formatters, toast, utils, paginacionRender.js, tagRol.js
│       ├── maqueta/           # datos inventados para `npm run dev:maqueta` (sin backend)
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
│       │   ├── tickets/       # mesa de ayuda: público (nuevo/seguimiento/encuesta) + staff (bandeja/detalle)
│       │   ├── kb/            # Base de Conocimiento
│       │   ├── problemas/     # Gestión de Problemas (Fase 2)
│       │   ├── encuestas/     # encuestas anónimas reutilizables (plantilla + rondas)
│       │   └── soporte/       # portal público de tickets
│       ├── router/            # rutas + guards (meta.public para entregas y tickets)
│       └── stores/            # Pinia (incluye `notificaciones` — campana del layout)
├── functions/
│   ├── credenciales.ts     # edge function: encrypt / revelar / entregaCrear / entregaAbrir / version
│   ├── tickets.ts          # edge function: catalogo / crear / seguimiento / buscarPorDni /
│   │                       #   encuestaEstado / encuesta / version
│   ├── encuestas.ts        # edge function: abrir / responder / version (rondas de encuesta pública)
│   └── equipos-fotos.ts    # edge function: subirFoto / eliminarFoto / version (staff, valida magic bytes)
├── migrations/             # 001..089 + 099, 100, 104 (090–098 reservadas al plan V2 de Tickets) — esquema completo, en orden, comentado
│   └── rollback/           # rollbacks fuera de la secuencia lineal (075)
├── docs/
│   ├── SISTEMA-DISENO.md      # sistema de diseño vigente: tokens, componentes, recetas de página
│   ├── NOTAS-DISENO-ANTERIOR.md # qué se rescató del sistema anterior (principios del JEFE, accesibilidad)
│   ├── PANORAMA-SISTEMA.md    # arquitectura, modelo de datos y decisiones verificadas
│   ├── HISTORIAL-AUDITORIAS.md # hallazgos de auditoría con estado y pendientes de despliegue
│   ├── GOTCHAS-CLI.md         # gotchas del CLI de InsForge: leer antes de aplicar una migración
│   ├── CHANGELOG.md           # historial de cambios de documentación, producto y diseño
│   ├── archivo/               # historia retirada (apéndice de diseño v1)
│   └── propuestas/            # cambios a AGENTS.md pendientes de aprobación
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

## CI: secrets del smoke de integración

**Actualización (2026-09-26) — P0-04 resuelto**: las 5 cuentas de staff
dedicadas a CI (la genérica + las 4 de pruebas negativas de autorización)
están creadas, correctamente configuradas y sus secrets cargados en GitHub
Actions — `test-integration` corrió por primera vez de verdad contra el
backend real. Al hacerlo, salieron a la luz 2 bugs de test que llevaban
documentados desde agosto sin haberse visto correr nunca en CI
(`ENTREGACREAR-TEST-BUG` y `ACCESOS-SENSIBLES-UPDATE-DELETE-TEST`, ver
`docs/HISTORIAL-AUDITORIAS.md` Ciclo 14) — ya corregidos en
`autorizacion-roles.smoke.test.js`. El resto de esta sección se conserva
como referencia de cómo se provisionó cada cuenta.

`test-integration` (`.github/workflows/ci.yml`) corre los smoke tests de
`tests/integration/*.test.js` contra el backend real de InsForge — la única
clase de check que atrapa una desincronización esquema↔frontend (un `select`
con embed que pide una relación que una migración ya rompió; ver
`docs/HISTORIAL-AUDITORIAS.md`, Q-01, incidente 2026-08-17).

**Desde 2026-08-18 (Ciclo 10, P0-04) los 4 secrets de abajo son obligatorios:
si falta cualquiera, el job FALLA** (`::error::` + `exit 1`), ya no se omite
en verde con un aviso. Si hoy no existen en el repo, **todo push/PR quedará
en rojo en este check** hasta completar los pasos siguientes.

1. **Crear la cuenta de staff dedicada a CI** (nunca la de una persona real):
   **no por registro público** — `disable_signup = true` en `insforge.toml`
   es innegociable (cierre de H-CRIT, ver `AGENTS.md`) y no se reabre para
   esto. Crear el usuario directamente desde el **dashboard de InsForge**
   (Authentication → Users → crear usuario) con un correo propio del
   equipo para esto (ej. `ci-tests@<dominio>`, no el de una persona). La
   creación por dashboard sigue disparando el trigger `handle_new_staff_user`
   igual que el alta pública, así que el staff `ASISTENTE` nace **inactivo**
   por diseño (migración 018) — el paso 2 de abajo lo activa.
2. **Activarla**: con una sesión JEFE, ir a Configuración → Staff, buscar esa
   fila y pulsar "Activar". No hace falta rol JEFE ni ningún permiso extra en
   `staff_permisos`: los smoke tests solo hacen lecturas de nivel `staff`
   (`es_staff()`), ningún endpoint gateado por `es_jefe()`.
3. **Cargar los 4 secrets** del repo (GitHub → Settings → Secrets and
   variables → Actions → New repository secret):
   - `VITE_INSFORGE_URL` / `VITE_INSFORGE_ANON_KEY` — los mismos valores que
     ya usa el build (`.env` local; la anon key sale de
     `npx @insforge/cli secrets get ANON_KEY`, ver sección Desarrollo).
   - `INSFORGE_TEST_STAFF_EMAIL` / `INSFORGE_TEST_STAFF_PASSWORD` — las
     credenciales de la cuenta creada en el paso 1.
4. Verificar: relanzar el job `test-integration` de un PR/push — debe pasar
   de fallar por secrets faltantes a ejecutar de verdad (`npm run
   test:integration`, cubre los 4 archivos de `tests/integration/`:
   `tickets-api.smoke.test.js`, `embeds.smoke.test.js`,
   `autorizacion-anonima.smoke.test.js` y, si además se provisionan las
   cuentas de la sección siguiente, `autorizacion-roles.smoke.test.js`).

   ~~**Ojo — aun con los 4 secrets bien cargados, el job va a seguir en
   rojo, por un motivo DISTINTO**~~ **Corregido**: el hallazgo P0-05
   (`tiene_permiso_modulo(text)` sin `revoke ... from public`) ya fue
   cerrado por la migración 073 (aplicada 2026-08-18, verificada a nivel de
   esquema — ver `docs/HISTORIAL-AUDITORIAS.md` Ciclo 11/13). Con los 4
   secrets cargados, el job no debería tener este motivo adicional de rojo.

Mientras estos secrets no existan, `test-integration` falla en cada push/PR
(a propósito). El job `resumen-verificacion` (mismo workflow) sigue
consolidando en un solo lugar del resumen del run si `tests-db` corrió de
verdad o solo pasó en verde sin verificar nada (ese job, aparte, mantiene el
patrón de omitirse con `::warning::` si falta `INSFORGE_ACCESS_TOKEN` — no se
tocó en este cambio), y el recordatorio semanal (`secrets-smoke-pendientes`,
`on: schedule`) sigue fallando a propósito mientras los secrets no existan.

**Pendiente aparte, no cubierto por este cambio**: marcar `test-integration`
(y `tests-db`, cuando corresponda) como *required status check* en la
protección de la rama `main` (GitHub → Settings → Branches) — hoy `main` no
tiene ninguna regla de protección configurada, así que aunque el job falle,
nada impide mergear igual. Eso requiere una decisión y acción del usuario en
la configuración del repositorio, no un cambio de código.

### Cuentas adicionales para las pruebas negativas de autorización (opcionales)

Desde 2026-08-18 (Ciclo 11), `tests/integration/` tiene dos archivos más:

- **`autorizacion-anonima.smoke.test.js`** — no necesita ninguna cuenta
  nueva, solo `VITE_INSFORGE_URL`/`VITE_INSFORGE_ANON_KEY` (los mismos de
  arriba). Corre siempre que esos dos existan.
- **`autorizacion-roles.smoke.test.js`** — necesita hasta 4 cuentas de staff
  dedicadas **distintas** de la cuenta genérica del paso 1 de arriba. **No
  son obligatorias**: a diferencia de los 4 secrets de arriba, si faltan
  estas el job sigue en verde (cada bloque se omite con `console.warn`, no
  con `::error::`). Cada una habilita un bloque de pruebas por separado —
  se pueden ir agregando de una a la vez:
  1. `INSFORGE_TEST_ASISTENTE_SIN_MODULO_EMAIL`/`_PASSWORD` — cuenta creada y
     activada igual que la genérica, pero con una diferencia importante:
     **por el default "opt-out" de las migraciones 056/060, toda cuenta
     nueva nace con los 8 módulos y `credenciales.ver` ya otorgados** — hay
     que entrar como JEFE a Configuración → Staff y **revocarle** el módulo
     "Licencias", el módulo "Equipos" (2026-08-20, cierra el hallazgo de
     `equipos-fotos` sin gate de módulo) y el permiso "Ver contraseñas" a
     propósito. Sin ese paso manual, esta cuenta no sirve como caso
     negativo (se comportaría igual que la genérica).
  2. `INSFORGE_TEST_STAFF_INACTIVO_EMAIL`/`_PASSWORD` — crear el usuario
     desde el dashboard y **no activarlo**. Es la más simple: activo=false
     ya es el estado de alta por defecto (migración 018).
  3. `INSFORGE_TEST_JEFE_CON_FILA_EMAIL`/`_PASSWORD` y
     `INSFORGE_TEST_JEFE_SIN_FILA_EMAIL`/`_PASSWORD` — dos cuentas JEFE
     reales (no ASISTENTE). La más costosa de las cuatro: crear dos cuentas
     con rol JEFE es una decisión organizativa, no solo un checkbox de CI;
     evaluar si vale la pena antes de provisionarlas.

## Backend: migraciones y función

- **Migraciones**: archivos numerados en `migrations/`, aplicados manualmente.
  En Linux/macOS:
  `npx @insforge/cli db query --json -- "$(cat migrations/0XX_nombre.sql)"`.
  En **Windows** (límite ~8 KB por línea de comandos), usar el script:
  `node scripts/apply-migration.mjs migrations/0XX_nombre.sql`.
  Para updates masivos usar un solo `UPDATE ... FROM (VALUES ...)` por lote.
- **Edge function**: editar `functions/credenciales.ts` y desplegar con
  `npx @insforge/cli functions deploy credenciales --file functions/credenciales.ts`.
  Mismo patrón para las otras 2: `tickets`, `encuestas`
  (`npx @insforge/cli functions deploy <nombre> --file functions/<nombre>.ts`).
  Cada una tiene su propio `ORIGENES_PERMITIDOS` (helpers CORS/admin
  duplicados a propósito entre las 3, no se comparte código).
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
| 025 | Reordenar `categorias_ticket` (orden de presentación en el formulario público) |
| 026 | Realtime de listados: `notify_list_changed()` en empleados, cuentas, licencias, equipos y tickets (canales `<tabla>:list`) |
| 027 | Realtime del seguimiento público de un ticket: `notify_ticket_estado()` sobre el canal `ticket:<token>` |
| 028 | Fix de RLS del realtime de tickets |
| 029 | Fix del evento de realtime de ticket |
| 030 | Auditoría de acceso denegado: acción `acceso_denegado` en `accesos_log`, escrita por la edge function cuando el guard del router bloquea una ruta por rol |
| 031 | Base de Conocimiento: `kb_articulos` (borrador→en_revision→publicado→obsoleto), visibilidad por estado/autoría; elimina `tickets.es_base_conocimiento`. **Nota: el backfill se perdió durante la aplicación — decisión cerrada de no restaurar, ver `docs/PANORAMA-SISTEMA.md` §6** |
| 032 | Cierra un hueco de RLS del voto de KB: reemplaza la policy amplia de UPDATE por el RPC `kb_registrar_feedback()` (`SECURITY DEFINER`, solo toca `util_si`/`util_no`) |
| 033 | Gestión de Problemas (Fase 2): `problemas`, `problema_tickets`, `acciones_correctivas` + triggers de cierre y de responsable activo. Unifica lo que iba a ser "Lecciones Aprendidas" |
| 034 | Elimina las tablas de prueba huérfanas `test_probe`, `test_probe2`, `test_probe3` (vacías, sin referencias en el código) |
| 035 | Distinción incidente/solicitud: `tickets.tipo` + `subcategorias_ticket.tipo_sugerido` (heredado al crear, editable por staff); `check_iniciar_completo` exige `tipo` antes de pasar a en_progreso; alta de subcategorías nuevas exige elegir `tipo_sugerido` |
| 036 | Índices para el reporte de tickets: `tickets(created_at desc)`, `ticket_eventos(evento, created_at)`, `ticket_satisfaccion(created_at)`. Solo índices: reversible con `DROP INDEX`, no cambia resultados |
| 037 | Rate-limit de creación pública de tickets: `ticket_creacion_intentos` (ip, created_at), mismo patrón que `ticket_busqueda_intentos` (migración 017). Corrige que la acción `crear` de la edge function `tickets` no tenía ningún tope de frecuencia (auditoría integral 2026-08-05, hallazgo S-01) |
| 038 | Baja de empleado atómica: RPC `dar_baja_empleado()` (`SECURITY DEFINER`) hace en una sola transacción las 4 escrituras que antes corrían secuenciales desde el cliente (cerrar asignaciones de cuenta/licencia, dar de baja cuentas personales, marcar Inactivo) — evita que un fallo a medio camino deje al empleado en un estado inconsistente (hallazgo A-01). **Requiere `db import`, no `db query`/`apply-migration.mjs` — ver gotcha en `AGENTS.md`** |
| 039 | Índice único `(plataforma_id, lower(usuario))` en `cuentas` (activas): evita registrar el mismo usuario/correo dos veces en la misma plataforma. Limpiados 5 duplicados reales en producción antes de aplicar |
| 040 | `licencias.tiene_clave` (columna generada `clave is not null`): permite al listado saber si hay clave propia sin traer el ciphertext completo en cada carga |
| 041 | Exclusividad de asignación también para cuentas `personal` (antes solo `reutilizable` la tenía en BD): cierra un candado de negocio que vivía solo en la disciplina de la app, no en el esquema |
| 042 | Pre-registro público de personal: `personal_registros` + `personal_registro_intentos` (rate-limit por IP), mismo patrón que `tickets` (sin policy de INSERT para cliente, todo vía edge function `personal-registro`). **Revertido por la migración 084** (2026-08-29): el módulo entero se retiró — ver esa fila |
| 043 | Módulo de Encuestas: `encuestas` (plantilla), `encuesta_rondas` (cada lanzamiento, con su propio link público), `encuesta_respuestas` (anónimas) y `encuesta_respuesta_intentos` (rate-limit). Preguntas de una plantilla inmutables en cuanto tiene alguna ronda. Solo JEFE crea/edita/lanza; cualquier staff ve resultados |
| 044 | Realtime: canal `tickets:nuevos` con detalle mínimo (id/código/título) en cada ticket creado, para el aviso emergente con sonido del sidebar — convive con el `tickets:list` de sentencia (026), no lo reemplaza |
| 045 | Notificaciones: `notificaciones` (4 eventos concretos: `ticket_creado`, `cuenta_creada`, `empleado_alta`, `empleado_baja`, cada uno con su propio trigger) + `notificaciones_lecturas` (estado leído/no-leído por usuario de staff) + canal realtime `notificaciones:nuevas`. Alcance deliberadamente mínimo: no es un motor de reglas genérico |
| 046 | Hard delete de `personal_registros` (solo JEFE): única tabla del sistema con borrado físico real desde el cliente — sin historial de negocio ni FKs entrantes, se limpia al migrar el registro a Empleados. **Revertido por la migración 084** |
| 047 | RLS de `personal_registros` restringido a JEFE (antes SELECT/UPDATE eran de cualquier staff, con el ocultamiento del menú como única barrera real): cierra el hueco entre "oculto en el sidebar" y "bloqueado por RLS", mismo criterio que `accesos_sensibles` (024). **Revertido por la migración 084** |
| 048 | Notificaciones personales: `notificaciones.destinatario_id` (NULL = broadcast, como hoy; no nulo = solo ese usuario) + canal realtime wildcard `notificaciones:usuario:%`. `crear_notificacion()` gana un 6º parámetro opcional — **la intención era que fuera compatible con las 4 llamadas de 5 argumentos de la migración 045, pero `create or replace` con una firma distinta crea una sobrecarga nueva en vez de reemplazar la vieja; no lo fue hasta la 054** |
| 049 | Triggers de notificación personal de tickets: asignación y cambio de estado (`notify_ticket_personal`), comentario nuevo (`notify_ticket_comentario_personal`) y correo fallido (`notify_correo_fallido`, sobre `ticket_eventos`). Con autoexclusión: nadie se autonotifica de su propia acción |
| 050 | Máquina de estados formal: tabla `transiciones_ticket_permitidas` (whitelist, default-deny) + `check_transicion_ticket_permitida()`, que reemplaza los triggers puntuales `check_reabrir_solo_jefe` (017) y `check_transicion_ticket` (019) |
| 051 | RPC `cerrar_ticket()` (`SECURITY DEFINER`): hace resuelto→cerrado en una sola transacción de servidor, reemplazando las 2 llamadas HTTP secuenciales que hacía `marcarResuelto()`. **Requiere `db import`, no `db query`/`apply-migration.mjs`** |
| 052 | Retira el canal realtime `tickets:nuevos` (044), reemplazado por `notificaciones:nuevas` (045) y sin ningún consumidor en el frontend. La fila de `realtime.channels` queda `enabled=false` (reversible), no se borra |
| 054 | **Fix de bug en producción** (detectado 2026-08-12 al crear un ticket): elimina la sobrecarga vieja de 5 argumentos de `crear_notificacion()` que la 048 dejó viva sin querer — cualquier llamada de 5 argumentos (las 4 de la 045: `ticket_creado`, `cuenta_creada`, `empleado_alta`, `empleado_baja`) quedaba ambigua entre las dos sobrecargas y fallaba con `function ... is not unique`, rompiendo el INSERT completo (crear ticket, crear cuenta, alta/baja de empleado) |
| 055 | **Decisión de producto** (2026-08-13): retira el trigger/función `notify_correo_fallido()` (049), huérfano tras quitar de `functions/tickets.ts` el correo de confirmación al crear y la acción `enviarEncuesta` — el sistema no debe enviar avisos/notificaciones por correo por el momento. No toca los checks de `ticket_eventos`/`notificaciones` (podría haber filas históricas con esos valores) |
| 056 | Permisos de módulo por usuario: `staff_modulos_permisos` (puente `staff_user_id ↔ módulo`, mismo patrón que `accesos_sensibles_permisos` de 024). Backfill con los 8 módulos habilitados para todo staff existente y trigger de alta (`handle_new_staff_user`, extendido) que siembra igual a cualquier staff nuevo — es "opt-out" (JEFE desmarca), no "opt-in". Solo UI/navegación (sidebar + router guard en el frontend); no toca RLS de correos/licencias/equipos/etc |
| 057 | Bandeja de importación de equipos desde Excel: tabla `equipos_importacion` (campos editables 1 a 1 con `equipos` + `raw` jsonb de referencia). RLS: staff ve/crea/edita/**elimina** (sin jefe-only, mismo caso que `equipo_accesorios` — es cola de trabajo, no historial de negocio) |
| 059 | Separa `areas_obras` (función/asignación laboral) de `ubicaciones` (lugar físico) — la 058 los había mezclado en una sola relación. `ubicaciones` gana `tipo` (text+check: sede/almacen/obra/otro); `empleados` gana `ubicacion_id` propio e independiente (ya no derivado de su área); `areas_obras.ubicacion_id` se elimina. Backfill de 28 empleados (27 → Oficina Principal, 1 → Almacén Pucusana) leyendo `areas_obras.ubicacion_id` antes de borrarla, verificado antes y después de aplicar. Ver decisión completa en `docs/PANORAMA-SISTEMA.md` §6 |
| 060 | Permiso individual `credenciales.ver`: tabla `staff_permisos` (mismo patrón que `staff_modulos_permisos` de 056, pero para capacidades). Gatea revelar/enviar contraseñas de Cuentas y Licencias en `functions/credenciales.ts` (consulta directa, no RPC — ver `AGENTS.md`); JEFE exento siempre. Backfill de los 3 staff activos + `handle_new_staff_user` extendido (ya sembraba `staff_modulos_permisos`). Otorgar/revocar queda auditado en `accesos_log` vía trigger `staff_permisos_log_evento` |
| 061 | **Fix de bug en producción** (nombres de staff invisibles para un ASISTENTE — la RLS de SELECT de `staff` es "propio registro o jefe", así que cualquier UI que resolvía el nombre de un compañero caía a "Staff": reporte de tickets, bandeja, "Asignado a", Responsable de Problemas/acciones correctivas, autor de KB, reporte de satisfacción). RPC `staff_nombres()` (`SECURITY DEFINER`, mismo patrón que `kb_registrar_feedback` de 032): devuelve solo `(user_id, nombre)` de staff activo, sin ampliar la policy de SELECT. De paso, extiende el UPDATE de `staff` (antes solo JEFE) para que cualquier staff edite su propio `nombre` — JEFE sigue pudiendo editar cualquier fila — blindado con un trigger que congela `rol`/`activo` cuando quien edita no es JEFE (mismo patrón que `check_ticket_identidad_inmutable` de 019, hallazgo H-06) |
| 062 | **InsForge Backend Advisor** (2026-08-17, 80 hallazgos): `REVOKE EXECUTE ... FROM PUBLIC` en las 16 funciones `SECURITY DEFINER` marcadas "callable by: public" (ninguna se convierte a `SECURITY INVOKER` — romperían el patrón de RLS/guard interno ya documentado), con `GRANT ... TO authenticated` de vuelta solo en las 10 que un rol autenticado realmente invoca (RLS o RPC); `log_evento_equipo`/`log_evento_ticket`/`crear_notificacion` quedan sin ningún grant de runtime — solo los llaman triggers `SECURITY DEFINER`. Elimina `_test_reporte_tickets`/`_test_reporte_tickets_resumen`/`_test_reporte_satisfaccion_consolidado`, gemelas de prueba de `scripts/paridad-reporte-tickets.mjs` que quedaron en producción por descuido **sin** el guard `es_staff()` de las reales — una fuga de datos sin autenticar más grave que el hallazgo original del advisor. 61 índices en columnas FK sin índice (`CREATE INDEX` simple, no `CONCURRENTLY` — ver detalle en `docs/PANORAMA-SISTEMA.md` §6). Autovacuum más agresivo en `entregas`/`eventos_equipo`/`asignaciones_cuenta` (>20% tuplas muertas) + `VACUUM ANALYZE` inmediato de las 3. **Aplicada en varios `db query` por lote** (no con `apply-migration.mjs`): el archivo completo excede el límite de línea de comandos de Windows del gotcha de `AGENTS.md` — cada lote es idempotente (`REVOKE`/`GRANT`/`DROP FUNCTION IF EXISTS`/`CREATE INDEX IF NOT EXISTS`), así que no hay riesgo de aplicación parcial inconsistente |
| 063 | **InsForge Backend Advisor, segunda pasada** (2026-08-17, 31 hallazgos tras la 062): `ALTER POLICY` en 9 políticas de 5 tablas (`staff_permisos`, `kb_articulos` ×2, `notificaciones`, `notificaciones_lecturas` ×2, `staff` ×2, `staff_modulos_permisos`) para envolver `auth.uid()` en `(select auth.uid())` — Postgres lo evalúa una vez por consulta en vez de una vez por fila, mismo `qual`/`with_check` de siempre. `REVOKE`/`GRANT` faltante en `staff_nombres()` (migración 061, quedó fuera del hardening de la 062 por no estar en el reporte original de 80). Los otros 2 grupos del reporte (10 funciones `SECURITY DEFINER` marcadas "dangerous" por tener `EXECUTE` a `authenticated`, y 11 tablas marcadas por tener RLS de solo SELECT) **quedan sin cambios a propósito** — aplicar la sugerencia del advisor rompería el patrón de RLS-helper/RPC-gateada o abriría un hueco de auditoría real; ver Ciclo 7 de `docs/HISTORIAL-AUDITORIAS.md` para el detalle de por qué cada uno es riesgo aceptado |
| 064 | **Verificación de auditoría externa** (2026-08-17): `accesos_log` gana columnas `ip`/`user_agent` (antes ausentes pese a que el patrón de extracción segura ya existía en otras edge functions) y la acción `'entrega_fallida'` en el check de `accion` — los 3 retornos tempranos de `entregaAbrir` (token inexistente/ya abierto/expirado) antes no dejaban ningún rastro en la auditoría |
| 065 | Rate-limit de `personal-registro` gana límite también por DNI (antes solo por IP, compartido entre `buscarDni`/`crear`): cierra la misma evasión por rotación de IP que `ticket_busqueda_intentos` ya cerraba (H-02) pero que este endpoint no tenía. **Revertido por la migración 084** |
| 066 | Paso 1/2: `entregas` gana `token_hash` (sha256 del token, backfill de las filas existentes). El token en claro sigue en la columna `token` durante la transición — se retira en la 067 |
| 067 | Paso 2/2 (aplicar solo ≥7 días después de la 066, ver advertencia en el propio archivo): retira la columna `token` en claro de `entregas` — desde acá el token de la URL pública ya no se persiste en texto plano en BD, solo su hash |
| 068 | RLS real por módulo: `licencias`/`asignaciones_licencia`, `equipos`/`tipos_equipo`/`asignaciones_equipo`/`eventos_equipo` y `cuentas`/`asignaciones_cuenta` exigen `tiene_permiso_modulo('...')` además de `es_staff()` (JEFE exento siempre) — antes `staff_modulos_permisos` (056) solo controlaba sidebar/router, cualquier staff activo podía leer/escribir esas tablas vía SDK directo. `empleados` es un caso especial a propósito: el SELECT sigue abierto (Equipos/Licencias/Correos embeben el nombre del empleado), solo INSERT/UPDATE quedan gateados por el módulo. **Requiere `db import`, no `db query`/`apply-migration.mjs` — tiene un `create or replace function` con dollar-quoting** |
| 069 | Tabla `schema_migrations`: tracking real de qué migración ya se aplicó (backfill de 001-068), llenada desde ahora por `scripts/apply-migration.mjs` y por el job `deploy-manual` de CI. No reemplaza `db migrations up` (sigue sin usarse, ver migración 035) |
| 070 | Tabla `function_deploys`: qué versión (sha256 + commit) de cada edge function está realmente desplegada, llenada solo por el job `deploy-manual` de CI. Cierra el pendiente de H-12 (confirmar si el redeploy real ya ocurrió) |
| 071-083 | Existen como archivos en `migrations/` y ya están aplicadas en producción (incluye el hardening de RLS de "tablas satélite" en cuentas/tickets/problemas, migraciones 081-083), pero esta tabla todavía no las documenta fila por fila — pendiente de reconciliar junto con la divergencia de esta rama respecto a `main` (ver `docs/HISTORIAL-AUDITORIAS.md`) |
| 084 | **Retiro completo del módulo "Pre-registro de personal"** (2026-08-29): dropea `personal_registros`/`personal_registro_intentos` (revierte 042/046/047/065). El módulo fue un experimento puntual — sus datos ya se habían exportado y usado (0 filas verificadas antes de aplicar) — que después sirvió de piloto para el módulo de Encuestas (043). Junto con esta migración se retiró también el código: edge function `personal-registro` (des-desplegada de InsForge), módulo frontend `modules/personal/`, store, dominios de API, rutas `/personal-registro`/`/personal-registros` e ítem de sidebar |
| 085 | Disponibilidad derivada de equipos: columna `equipos.tiene_asignacion_activa` mantenida por triggers (`set_equipo_tiene_asignacion_activa`, `sync_equipo_tiene_asignacion_activa`); arregla el HTTP 414 del listado de Equipos |
| 086 | Revisión integral v2 (Ciclo 20): gate de módulo en las RPC `dar_baja_empleado`, `cerrar_ticket` y `reporte_*`; canales realtime de staff solo para staff activo; `siguiente_codigo_ticket` sin EXECUTE público; `revocar_cuenta_personal` con fecha de Lima; CHECK de formato cifrado en `cuentas.password`, `licencias.clave` y `accesos_sensibles.password` |
| 087 | RLS de `areas_obras` con gate del módulo `empleados` (cierra el patrón de tablas satélite sin gate) |
| 088 | Elimina `tiene_permiso_credenciales_ver()` (huérfana: ninguna policy la usaba); `tienePermisoCredenciales()` en `functions/credenciales.ts` queda como única fuente de la regla |
| 089 | `tickets.resuelto_at` mantenida por trigger (antes se aproximaba con `updated_at`) |
| 099 | **(Ciclo 21, escrita, sin aplicar)** Permisos: regla única en el servidor — `puede(user, permiso)` (solo `project_admin`), `puede_actual()` y `exigir_permiso()` (42501); cierra `empresas`, `kb_registrar_feedback`, UPDATE de `kb_articulos`, `ticket_token_existe` y el último JEFE de un acceso sensible; amplía `accesos_log_accion_check` con 5 acciones; sección separable (decisión pendiente del dueño) con gate de escritura en `categorias_ticket` y `ubicaciones` |
| 100 | **(Ciclo 21, escrita, sin aplicar)** Integridad concurrente y trazabilidad: índice único `asignaciones_equipo_una_activa`; `FOR UPDATE` en los topes de licencia y exclusividad de cuentas; CHECK de `motivo_cierre`, `equipos_fotos_max` y `empleados_dni_formato` (`NOT VALID`); trigger `cuentas_password_cambio`; `realtime.publish()` tolerante; whitelist de transiciones de problemas; `commit_sha`/`entorno` en `schema_migrations`/`function_deploys` |
| 104 | **(Ciclo 21, escrita, sin aplicar)** `intentos_publicos (ambito, clave, created_at)`: rate-limit unificado de los endpoints públicos; reemplazará a las tres tablas `*_intentos` (aún no se borran) |
| 110 | **(Ciclo 21, escrita, sin aplicar)** Actas firmadas en físico: tabla `actas` (solo PDF, bucket privado `actas-firmadas`, paso manual de creación), `registrar_acta`, evento `acta_adjuntada`, vista `v_actas_pendientes`; acciones `subirActa` y `urlActa` de la function `equipos-fotos`. Requiere 099, 101 y 103 |
| 111 | **(Ciclo 21, escrita, sin aplicar)** Adjuntos privados de tickets: `crear_ticket_publico` (ticket + evento + rate-limit en una transacción) y `adjuntar_captura_ticket`; key `tickets/<id>/captura.<ext>` y URL firmada; el bucket `tickets-adjuntos` se vuelve privado a mano en el panel al final. Requiere 099 y 104 |
| 112 | **(Ciclo 21, escrita, sin aplicar)** Retención y anonimización: `config_retencion`, `purgar_datos_temporales()`, `anonimizar_empleado`, `v_empleados_anonimizables`, `entorno`/`es_branch()`. Requiere 099, 102, 103 y 104 |
| 109 | **(Ciclo 21, escrita, sin aplicar)** Portal del empleado por enlace firmado: `empleado_enlaces` (solo `sha256`), `asignaciones_equipo.confirmado_por_empleado_at`; RPC `portal_emitir_enlace`, `portal_revocar_enlace`, `portal_abrir`, `portal_confirmar_equipo`; extiende la purga de la 112. **Se aplica después de la 112.** Requiere 099, 101, 102 y 112 |
| 113 | **(Ciclo 21, escrita, sin aplicar)** Corrige la 107: se puede borrar de `auth.users` a quien registró o aprobó un cambio (`check_transicion_cambio` y `cambios_aprobacion_coherente`). Requiere 107 |
| 114 | **(escrita, sin aplicar)** `aviso` en `categorias_ticket` y `subcategorias_ticket` (≤ 600, sin HTML, blanco → NULL); se muestra al solicitante y al técnico. Sin dependencias nuevas |
| 115 | **(aplicada; registro pendiente con `scripts/sql/registrar-115.sql`)** Reportes: `v_ticket_hechos`, `v_kpi_volumen/tiempos/reaperturas/csat`, `v_backlog_tramos`, RPC `reporte_tickets(date,date,uuid)`; `reporte_satisfaccion_consolidado` reescrita; se eliminan `reporte_tickets(timestamptz,timestamptz)` y `reporte_tickets_resumen`; parámetros `csat_muestra_minima`, `dias_corte_reapertura`. Requiere 089, 099 y 103 |
| 116 | **(escrita, sin aplicar)** Catálogo de tickets v2 (7 categorías, 31 subcategorías), `subcategorias_ticket.prioridad_sugerida` usada por `crear_ticket_publico`, servicios `seguridad` y `cctv`, RPC `reclasificar_ticket` (JEFE), vista `v_tickets_por_reclasificar`, evento `categoria_cambiada`. Requiere 107, 111 y 114 |
| 117 | **(escrita, sin aplicar)** Reportes centralizados: una RPC por reporte (inventario, licencias, correos, personal, solicitudes, cambios, problemas y conocimiento, encuestas, auditoría) con guard del módulo fuente, auxiliares `reporte_*`, parámetro `dias_revision_accesos`; reemplaza `reporte_tickets_de` sumando `asignado_a`. Requiere 103, 106, 107, 108, 110 y 115 |
| 108 | **(Ciclo 21, escrita, sin aplicar)** Solicitudes de servicio: `solicitud_tipos`, `solicitud_plantilla_pasos`, `solicitudes` (`SOL-####`), `solicitud_pasos`; RPC `crear_solicitud`, `completar_paso_solicitud`, `omitir_paso_solicitud`, `cancelar_solicitud`, `convertir_ticket_en_solicitud`; autocompletado por triggers; `dar_baja_empleado` crea la solicitud de baja; `dashboard_resumen` con `solicitudes_abiertas`. Requiere 099, 101, 102 y 103 |
| 107 | **(Ciclo 21, aplicada por el dueño el 2026-10-02)** Servicios y cambios: `servicios` (≤15) con `servicio_id` opcional en categorías, plataformas, licencias y tipos de equipo; `cambios` (`CHG-####`), `cambio_eventos`, `cambio_tickets`; RPC `crear_cambio`, `transicionar_cambio`, `aprobar_cambio`, `rechazar_cambio`; `cambio_id` en `schema_migrations`/`function_deploys`. Requiere 099 y 101 |
| 106 | **(Ciclo 21, escrita, sin aplicar)** KEDB: `problemas.workaround/error_conocido/kb_articulo_id`, `kb_articulos.tipo/problema_id`, `ticket_kb_usos`, `v_kpi_kb`; `check_problema_cierre` ampliado; RPC `publicar_workaround_problema`, `crear_kb_desde_ticket`, `registrar_uso_kb_ticket`. Requiere 099 y 101 |
| 101 | **(Ciclo 21, escrita, sin aplicar)** RPC transaccionales: `crear_cuenta_asignada`, `traspasar_cuenta`, `cerrar_asignacion_cuenta`, `asignar_equipo`, `devolver_equipo`, `mover_equipo`, `migrar_importacion_equipo(s)`, `crear_licencia_con_cuenta` y `verificar_equipo` (guard `exigir_permiso`; la lógica vive en funciones `*_nucleo` solo para `project_admin`); trigger `cuentas_log_evento` (CRUD de cuentas en `accesos_log`, nunca la contraseña); CHECK de `eventos_equipo` ampliado (`verificado`, `acta_adjuntada`, `recepcion_confirmada`); `revocar_cuenta_personal` delega en `cerrar_asignacion_cuenta`. Requiere 099 y 100 |
| 102 | **(Ciclo 21, escrita, sin aplicar)** Ciclo de vida del empleado: `empleado_eventos` (inmutable, sin DNI ni valores de contacto), `transiciones_empleado_permitidas`, `contexto_transaccion`, RPC `suspender_empleado`, `reactivar_empleado`, `reingresar_empleado`, `dar_baja_empleado(uuid, motivo)` y `registrar_revision_accesos`; interruptor `empleados_ajustes.exigir_contexto_rpc` (nace en `false` hasta que el frontend use las RPC); backfill de eventos. Requiere 099 |
| 103 | **(Ciclo 21, escrita, sin aplicar)** `config_parametros` (10 umbrales editables por el JEFE), vistas `v_licencias_cupo` y `v_categorias_recurrentes`, y la RPC `dashboard_resumen()` que reemplaza ≈25 consultas del Inicio (secciones por módulo y errores por sección). Requiere 099 |

## Checklist de deploy

1. Aplicar migraciones pendientes (`node scripts/deploy.mjs migracion migrations/0XX_….sql --dry-run` primero; exige árbol limpio y HEAD en `origin/main`; `apply-migration.mjs` quedó como alias en desuso; para migraciones con `create function`/`do $$...$$` como la 037/038, usar `npx @insforge/cli db import migrations/0XX_….sql` — ver gotcha en `AGENTS.md`). Alternativa sin los gotchas de Windows: disparar manualmente el job `deploy-manual` de `.github/workflows/ci.yml` (`workflow_dispatch`, un archivo de migración a la vez — nunca aplica "todas las pendientes", el proyecto no trackea cuáles ya corrieron).
2. Redesplegar edge functions si cambiaron: `credenciales`, `tickets`,
   `encuestas`, `equipos-fotos` (o marcar `desplegar_functions` al disparar el mismo job `deploy-manual`).
   **Pendiente de este redeploy (H-12, 2026-08-16)**: el import de las 4 pasó
   de `npm:@insforge/sdk` (sin versión, resolvía a la última en cada deploy)
   a `npm:@insforge/sdk@1.5.2` (fijo, igual que `frontend/package.json`).
   Hasta que se redespliegue cada función, sigue corriendo en producción con
   la versión que quedó resuelta en su último deploy real (no con la que dice
   el código fuente) — probablemente distinta entre las 4, según cuándo se
   desplegó cada una por última vez.
3. Push de `insforge.toml` si cambió auth/storage.
4. Build frontend: `cd frontend && npm run build`.
5. Deploy Vercel (o push a la rama conectada).
6. Verificar CORS: `ORIGENES_PERMITIDOS` en las 4 edge functions incluye el dominio de producción.
7. Smoke test: login → dashboard → revelar contraseña → entrega pública → ticket público.

## Producción

- Frontend desplegado en Vercel: **https://materen-ti.vercel.app**
- SPA rewrites: `frontend/vercel.json` (copiado a `dist/` vía `public/`) — sin
  esto las rutas profundas (`/entrega/:token`, `/empleados/:id`) dan 404.
  El mismo archivo define los headers de seguridad (CSP/HSTS/anti-framing,
  S-04) — si se agrega un origen externo nuevo (fuente, CDN, API), hay que
  sumarlo a la CSP ahí o el navegador lo bloquea en silencio.
- CORS de las 4 edge functions (`credenciales`, `tickets`, `encuestas`,
  `equipos-fotos`): allowlist con el dominio de producción + localhost
  (dev), una por función. Si cambia el dominio, actualizar
  `ORIGENES_PERMITIDOS` en los 4 archivos y redesplegar.
- **El sistema no envía avisos ni notificaciones por correo** (retirado en la
  migración 055, agosto 2026): ni confirmación de ticket al crear, ni aviso
  de la encuesta de satisfacción al cerrar. Antes existía como envío
  best-effort, pero el plan actual de InsForge (free) no tiene `emails.send()`
  habilitado, así que en la práctica siempre fallaba; se retiró en vez de
  dejarlo a medias. El canal garantizado sigue siendo la pantalla (código +
  token visibles al crear). La encuesta de satisfacción quedó sin ningún
  canal de entrega tras ese retiro (2026-08-13 a 2026-08-16); se cerró
  embebiendo el formulario en `/soporte/:token` al cerrar el ticket y con un
  botón de copiar mensaje de WhatsApp en `/tickets/:id` (ver arriba) — sigue
  sin haber correo, el canal es la pantalla y WhatsApp manual.

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
navegador (`core/imagenes.js`, ~200 KB c/u) y se suben vía la edge function
`equipos-fotos` (valida magic bytes + tamaño en servidor — ya no directo al
storage desde el navegador, ver migración de 2026-08-17) al bucket público
`equipos-fotos`; se guarda `{url, key}` por foto.

**Importar equipos desde Excel** (`/equipos/importar`): se pegan las filas
copiadas de un Excel de activos fijos y se confirma el mapeo de columnas; eso
crea una **bandeja de trabajo** (`equipos_importacion`, migración 057) donde
se corrige fila por fila (tipo, estado físico, a quién está asignado) antes
de migrar cada una a Equipos — no hay alta masiva sin revisión humana, porque
la columna "Usuario" del Excel de origen no siempre coincide con el nombre
real del empleado en el sistema. La bandeja vive en la base de datos (no en
el navegador) para poder retomarla desde cualquier sesión/computadora; una
fila desaparece de la bandeja recién cuando se migra al inventario real.
