# AGENTS.md

> **Materen — Sistema TI**: panel interno de inventario de empleados, accesos,
> tickets, correos, licencias y equipos. **UI sobre PrimeVue v4 Unstyled +
> Tailwind v4 desde el 2026-09-07** (IBM Carbon v11 se retiró por completo el
> 2026-09-05). Reglas de la base nueva: `frontend/AGENTS.md`, sección
> "UI/UX". Lo que se rescató del sistema anterior:
> [`docs/NOTAS-DISENO-ANTERIOR.md`](docs/NOTAS-DISENO-ANTERIOR.md).

**Estado del repo — a propósito no se anota a mano acá.** Este encabezado
llevaba una fecha y una lista de migraciones escritas a mano, y quedó 14 días y
16 migraciones atrás de su propio cuerpo sin que nada lo detectara (corregido
2026-08-31 quitando el dato, no actualizándolo: si se escribe a mano, vuelve a
podrirse). Para saber el estado real, mirar la fuente — nunca este archivo:

| Qué | Dónde |
| --- | --- |
| Migraciones aplicadas | `public.schema_migrations` + último número en `migrations/` |
| Qué cambió y cuándo | `docs/CHANGELOG.md` |
| Hallazgos de seguridad, abiertos y cerrados | `docs/HISTORIAL-AUDITORIAS.md` |
| Conteo de tests | correr la suite (`cd frontend && npm test`) |

⚠️ Una rama de trabajo puede no tener las últimas migraciones de `main`: antes
de numerar una nueva, comparar contra `origin/main`, no contra el working tree.

**Precedencia documental**: ante conflicto, `README.md` describe intención;
**ganan** el esquema real en `migrations/*.sql` y, en UI, el estado real de
`styles/main.css` (el `@theme` de Tailwind, único lugar con tokens) y los
presets `components/ui/pt/*`. `carbon-theme.css` sigue vacío a propósito.

Contexto para agentes de código. Lee también el `README.md` (dominio, flujos,
modelo de seguridad y estructura del repo), `docs/PANORAMA-SISTEMA.md`
(esquema real y decisiones verificadas), `docs/HISTORIAL-AUDITORIAS.md`
(hallazgos de seguridad/calidad con su estado) y
[`docs/GOTCHAS-CLI.md`](docs/GOTCHAS-CLI.md) — **obligatorio antes de aplicar
una migración**, ahí viven los tres gotchas del CLI de InsForge con su
workaround (se movieron ahí el 2026-08-31: son detalle de ejecución que no
hacía falta cargar en cada tarea, pero perderlos cuesta una migración a
medio aplicar).

## Invariantes — no romper sin leer el porqué más abajo

Estas son las reglas que no se negocian. Cada una tiene su justificación
completa más abajo en el documento; acá van sin narrativa a propósito, para que
no compitan por atención con el resto del contexto.

1. **`disable_signup` = `true`, siempre.** El trigger `handle_new_staff_user`
   crea el staff **inactivo** (`activo=false`) y siembra sus **tres** `insert`
   (staff + 8 filas de `staff_modulos_permisos` + la fila de `staff_permisos`).
   Si se reescribe la función, no perder ninguno. Revertir esto reintroduce la
   escalada **H-CRIT**.
2. **Contraseñas: nunca en listados ni precargadas en formularios.** Todo pasa
   por `api/passwords.js` → edge function `credenciales`. **Nunca** cifrado en
   el cliente.
3. **Softdelete (`deleted_at`) en todo.** DELETE físico solo JEFE, vía RLS.
4. **`credenciales.ver` vive en DOS lugares (tres, contando el atajo de JEFE)
   y nada los sincroniza en runtime:** `tiene_permiso_credenciales_ver()`
   (SQL) y `tienePermisoCredenciales()` (`functions/credenciales.ts`). Si
   cambia quién puede ver contraseñas, se cambian **las dos**. Hay un test
   que compara ambas rutas
   (`tests/integration/permisos-credenciales-sincronizados.smoke.test.js`),
   pero **hoy se salta** por falta de cuentas de prueba (P0-04) — no confiar
   en que CI lo atrape todavía.
5. **`tienePermisoModulo()` idem:** la regla vive en RLS **y** repetida a mano en
   `functions/credenciales.ts` y `functions/equipos-fotos.ts`, porque el cliente
   admin bypasea RLS. Una validación que solo existe del lado del cliente no es
   una validación.
6. **No usar `db migrations up`.** Leer
   [`docs/GOTCHAS-CLI.md`](docs/GOTCHAS-CLI.md) antes de aplicar una migración y
   verificar con un `select` después — siempre.
7. **No quitar `functionsUrl` de `getClient()`** (`api/client.js`). El SDK
   adivina un host que no existe en este backend, y lo cambió entre versiones
   menores.
8. **No fijar de memoria el conteo de tests.** Correr la suite y leer su
   resumen.
9. **Documentación en el mismo cambio.** Un PR que cambia comportamiento y no
   toca documentación queda incompleto, igual que uno sin tests.
10. **Ante conflicto entre documentación y código, gana el código:** los valores
    literales de `main.css` y el esquema real de `migrations/*.sql`.
11. **Español en todo** (UI, dominio, comentarios, mensajes) y nunca tutear en
    la UI: impersonal en títulos, imperativo de usted en formularios y errores.

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
  `docs/PANORAMA-SISTEMA.md` (esquema/decisiones) y/o `docs/NOTAS-DISENO-ANTERIOR.md`
  (mientras no exista un sistema de diseño nuevo con su propia guía), según
  lo que se tocó. Dejar además una línea en
  `docs/CHANGELOG.md`. Un hallazgo de auditoría cerrado o abierto se
  actualiza en `docs/HISTORIAL-AUDITORIAS.md`, no en un informe nuevo suelto.
  No es opcional ni una tarea aparte: un PR que cambia comportamiento y no
  toca documentación queda incompleto, igual que uno sin tests.
- **Diagnóstico/pruebas contra producción**: para reproducir un bug o
 verificar un fix, preferir un branch de InsForge (`npx @insforge/cli
 branch create`) en vez de escribir sobre datos reales (ver
 `docs/PANORAMA-SISTEMA.md` §7 — hasta ahora esa regla solo cubría tablas
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
 
   **Hoy las dos coinciden. Nada las mantiene sincronizadas en runtime**
   — si cambias quién puede ver contraseñas, cambia las dos, no una. Desde
   2026-08-31 hay un test que las compara cuenta por cuenta
   (`tests/integration/permisos-credenciales-sincronizados.smoke.test.js`,
   ver "Verificación"), pero **se salta mientras no existan las cuentas de
   prueba de P0-04**: es una red de seguridad instalada, no activa.
   Ojo con un tercer lugar que el test dejó a la vista: `credenciales.ts`
   corta por `rol === 'JEFE'` antes de mirar el permiso, y la función SQL
   **no tiene ese atajo**. Un
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
- **Helpers compartidos que NO hay que volver a duplicar** (Ciclo 15,
 2026-08-31 — los seis nacieron de una copia que ya había divergido, ver
 ARQ-01 a ARQ-08 en `docs/HISTORIAL-AUDITORIAS.md`):
   1. `api/invocarFuncion.js` — `crearInvocador(nombre, mensajeError)` es la
      ÚNICA mecánica de llamada a una edge function (reintento de red,
      `{ok:false,code}` → error con `.code`). Un archivo nuevo que hable con
      una edge function lo usa; no se escribe otro `invoke()` a mano. Lo
      propio de cada dominio es solo su mapa de códigos → mensaje.
   2. `modules/equipos/acta-base.js` — estilos, escapado y armado de las
      actas imprimibles. Un acta nueva aporta sus secciones/cláusula/firmas,
      no otra copia del `<style>` ni de `window.open`/`print`.
   3. `modules/tickets/TicketCamposGestion|TicketComentarios|TicketComposer|
      TicketHistorial.vue` — contenido compartido entre la página completa
      (`TicketDetalleView.vue`) y el panel del split-view
      (`TicketDetallePanel.vue`), que son **dos contenedores distintos del
      mismo detalle**. Las diferencias reales entre ambos van como prop
      (`id-prefijo`, `label-asignado`, `fecha-inline`, `acotado`); si hace
      falta cambiar el contenido, se cambia en el componente, nunca en uno
      solo de los dos contenedores.
   4. `stores/crearStorePaginado.js` — **todo listado con paginación
      server-side sale de acá** (hoy: tickets, empleados, correos, equipos,
      licencias, kb, problemas), igual que todo catálogo simple sale de
      `crearCatalogoStore()` en `stores/catalogos.js`. Trae
      `cargar/irAPagina/aplicarFiltros/resetearFiltros/ordenarPor` y el
      guard `_peticionId`; lo propio se pasa por `state`/`getters`/
      `actions`, y para los casos raros hay `enriquecer` (datos extra de la
      página) y `extra` (state que se llena en la misma tanda que la
      página). La **regla de coherencia** post-mutación (in-place vs.
      recargar) está en su encabezado: leerla antes de agregar un
      `crear`/`actualizar`/`softDelete` nuevo.
   5. `composables/useFormularioModal.js` — ref del modal + detección de
      cambios + descarte con confirmación, para todo formulario dentro de
      `<Modal>` (hoy 7). `EquipoForm.vue`/`LicenciaForm.vue` todavía no lo
      usan porque siguen siendo modales hand-rolled: al migrarlos a
      `<Modal>`, migran también a este composable.
   6. `composables/usePopoverFlotante.js` — abrir/cerrar, posicionar contra
      el trigger, cerrar al puntear afuera o con Escape (devolviendo el
      foco), para popovers teletransportados a `<body>` (`MenuAcciones`,
      `NotificacionesCampana`). No confundir con `useCerrarConEscape`/
      `useFocoAtrapado`, que son para modales hand-rolled.
- **UI/UX — PrimeVue v4 Unstyled + Tailwind v4 (desde el 2026-09-07)**: la
 base que reemplazó a IBM Carbon v11 (retirado el 2026-09-05). Las reglas
 (wrapper estricto `components/ui/*` + preset `pt/`, nunca `primevue/*`
 directo en una vista; tokens solo en el `@theme` de `styles/main.css`)
 viven en `frontend/AGENTS.md`, sección "UI/UX" — no se repiten acá.
 Migrados hoy: Licencias, Equipos, Tickets, `MenuAcciones`, `ConfirmDialog`;
 el resto de las vistas sigue en HTML nativo sin estilos hasta migrarse.
 Ningún componente `.vue` tiene bloque `<style>`. Lo rescatado del sistema
 anterior (marca, principios del JEFE, accesibilidad):
 `docs/NOTAS-DISENO-ANTERIOR.md`. Nombre del producto en UI: **Materen —
 Sistema TI**.
- **`frontend/src/components/carbon/` ya no existe** (borrada 2026-09-05).
 La lógica real que tenían 4 de sus 9 componentes (revelado auditado de
 contraseñas, matemática de paginación, colspan/agrupación de columnas,
 id+aria de un campo) se rescató en `composables/useRevelado.js`,
 `core/paginacionRender.js`, `core/tablaColumnas.js` y
 `composables/useCampoAccesible.js` — ver `docs/NOTAS-DISENO-ANTERIOR.md` §5.
- **Gotcha de `resetearFiltros()` en cada montaje (patrón de 18 módulos,
 Tickets es la ÚNICA excepción desde ago 2026)**: Empleados/Correos/
 Equipos/KB/Licencias/Problemas llaman
 `store.resetearFiltros()` en el `onMounted` de su vista — es a propósito
 (bug real reportado jul 2026, ver `stores/empleados.js`): sus filtros son
 refs LOCALES del componente, frescos en cada montaje, así que sin ese
 reset el store podía quedar con un filtro viejo aplicado mientras la UI
 se veía en blanco. Tickets dejó de llamarlo (tiene `resetearBusqueda()`,
 más angosto) porque migró sus filtros a `computed({get,set})` atado
 directo al store — ya no hay mismatch que corregir. **No copiar el cambio
 de Tickets a otro módulo sin migrar también sus filtros al store** — quitar
 el reset con los filtros todavía en refs locales reintroduce el bug de
 jul 2026. Desde el Ciclo 15 (2026-08-31) `resetearFiltros()` ya no se
 escribe en cada store: lo trae `crearStorePaginado.js`, que lo arma con los
 `filtrosIniciales` de cada uno. `resetearBusqueda()` de Tickets sigue
 siendo propio, por la misma razón de siempre.

## Flujo de trabajo backend

- **Migraciones**: archivos numerados `migrations/0XX_nombre.sql` (comentados,
 en español), un archivo por migración como fuente de verdad. **NO se usa `db
 migrations up`** (nombres incompatibles con el formato timestamp que exige ese
 subsistema). **Antes de aplicar una migración, leer
 [`docs/GOTCHAS-CLI.md`](docs/GOTCHAS-CLI.md)**: el CLI tiene tres fallas
 conocidas con causa raíz distinta (DDL rechazado, dollar-quoting,
 `ENAMETOOLONG` en Windows), cada una con su propio workaround. Y
 **verificar el resultado con un `select` después de aplicar es obligatorio**
 — tanto `db query` como `db import` pueden reportar un error habiendo
 ejecutado parte de los statements. `scripts/apply-migration.mjs` registra en
 `public.schema_migrations` qué versión quedó aplicada (desde la 069).
- **Windows, updates masivos**: `db query` ejecuta de forma poco fiable
 múltiples statements DML en una sola llamada — usar un solo
 `UPDATE ... FROM (VALUES ...)` por lote.
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
- **Edge function `encuestas`**: mismo patrón CORS/admin-client y mismo
 comando de deploy (`npx @insforge/cli functions deploy <nombre> --file
 functions/<nombre>.ts`). Expone `abrir`/`responder` sobre
 `encuesta_rondas`/`encuesta_respuestas` (sin INSERT de cliente en
 `encuesta_respuestas`). No confundir la encuesta de este módulo con
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
 admin bypasea la RLS, hay que repetir el chequeo a mano).
 ⚠️ **Tope de fotos — el valor `4` vive en DOS lugares que se mueven
 juntos** (2026-08-31, EQ-FOTOS-02): `MAX_FOTOS` en `EquipoForm.vue` y
 `MAX_FOTOS_POR_EQUIPO` en `equipos-fotos.ts`. Las fotos son la columna
 `equipos.fotos jsonb` (array de `{url, key}`, migración 015) — no hay tabla
 `equipos_fotos`, y las keys del bucket son planas
 (`equipos/<uuid>.<ext>`), así que **contar por storage es imposible**: el
 conteo sale de un SELECT a esa columna. Dos límites conocidos y aceptados,
 no olvidos: (1) en el **alta** de un equipo no hay fila que contar todavía
 (el formulario sube antes del primer INSERT), así que ahí no hay tope
 server-side; (2) un cliente que **omita `equipoId`** a propósito esquiva el
 conteo. Cierra el bypass accidental/DevTools, **no es una frontera dura** —
 esa sería un `check (jsonb_array_length(fotos) <= 4)` en `equipos`, no
 hecho todavía (el array lo escribe el cliente con su propia sesión, no esta
 función).
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
 de memoria — corre la suite y lee su propio resumen final.** Este párrafo ya
 fijó una cifra a mano tres veces y las tres quedaron obsoletas
 (2026-08-17 → `100+12`; 2026-08-18 → `148+1+25`, que además siguió afirmando
 durante 13 días que una falla era "esperada" cuando ya estaba corregida).
 Por eso acá no va ningún número: **la suite debe cerrar en 0 fallas**, y si
 falla algo es una regresión real, no un rojo tolerado.
   - **No hay ningún test que falle a propósito.** El que lo hacía
     (`autorizacion-anonima.smoke.test.js` → `tiene_permiso_modulo`, hallazgo
     **P0-05**) está en verde desde que la **migración 073** aplicó el
     `revoke ... from public` en producción (2026-08-18, verificado contra
     `pg_proc.proacl`). Si vuelve a ponerse rojo, es un hallazgo nuevo.
   - **Los que se saltan son smoke de integración condicionados a
     secrets/cuentas que hoy no existen**, no tests rotos:
     `tickets-api.smoke.test.js`, `embeds.smoke.test.js` y
     `autorizacion-roles.smoke.test.js`, todos con `describe.skipIf(!listo)`
     (ver P0-04 en `docs/HISTORIAL-AUDITORIAS.md`: mientras falten los 4
     secrets, el job `test-integration` de CI falla a propósito).
     `autorizacion-anonima.smoke.test.js` **no** se salta: corre completo
     porque solo necesita `VITE_INSFORGE_URL`/`ANON_KEY`.
 Cubre: cifrado, validaciones de la edge function de
 tickets, dominio de tickets, formatters, periodos y PDF del reporte, forma
 de `insforgeApi`, paginación, y (desde 2026-08-18) los propios discriminantes
 de autorización del arnés de pruebas (`autorizacion-helpers.test.js`, sin
 red — verifica que exigen un rechazo específico y que sus mensajes de
 fallo nunca imprimen un payload). Corren en CI en cada push
 (`.github/workflows/ci.yml`, job `build-y-tests`), junto con
 `node scripts/patrones-ui.mjs` (estructura/accesibilidad del marcado) y
 `npm audit --omit=dev --audit-level=high` (vulnerabilidades de
 dependencias). Los otros 4 guardrails de Design System
 (`contraste.mjs`, `tokens-vs-guia.mjs`, `literales-vs-tokens.mjs`,
 `clases-muertas.mjs`) se retiraron de CI en el reinicio del sistema de
 estilos (2026-09-05, ver `docs/NOTAS-DISENO-ANTERIOR.md`): dependían de
 tokens/CSS/`docs/GUIA-UX-UI.md`, que ya no existen. Siguen en `scripts/`
 sin invocarse.
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
 internas ni ejecuta RPC `SECURITY DEFINER` — incluido
 `tiene_permiso_modulo` (hallazgo P0-05), que pasó a verde con la migración
 073 y **ya no falla a propósito**: hoy la suite entera cierra en 0 fallas.
 `autorizacion-roles` cubre ASISTENTE sin módulo/sin
 `credenciales.ver`, staff inactivo y `accesos_sensibles` fila por fila,
 pero necesita hasta 4 cuentas de staff dedicadas que hoy no existen (ver
 README "Cuentas adicionales..." — cada bloque se omite por separado si
 falta la suya, no bloquea CI). Los discriminantes de autorización de
 ambos archivos (`_autorizacion-helpers.js`, compartido) exigen un
 rechazo específico — SQLSTATE `42501`, `P0001` con el mensaje del guard,
 o el status HTTP real de la edge function — nunca "hubo algún error" a
 secas; sus mensajes de fallo nunca imprimen el payload devuelto. Cubierto
 por `frontend/tests/autorizacion-helpers.test.js` (unitario, sin red).
- **Sincronía de `credenciales.ver` entre sus dos implementaciones**
 (`tests/integration/permisos-credenciales-sincronizados.smoke.test.js`,
 2026-08-31): compara, cuenta por cuenta, la RPC
 `tiene_permiso_credenciales_ver` contra lo que la edge function `credenciales`
 realmente permite, y falla si divergen — la red de seguridad que faltaba para
 la regla duplicada a mano (ver invariante 4). Traduce la respuesta de forma
 determinista por el orden real de chequeos de `credenciales.ts` (permiso →
 módulo → lookup): **403 = bloqueó**, **200 + `no_existe` = dejó pasar**, usando
 un `cuentaId` inexistente a propósito para que "permitido" no dispare un
 descifrado real ni escriba en `accesos_log`. Omite en runtime (`ctx.skip`) el
 caso de una cuenta sin el módulo `correos`, porque ahí los dos rechazos son
 403 indistinguibles — preferido a pasar por el motivo equivocado. **Hoy la
 suite lo salta completo**: necesita las cuentas de staff de P0-04, que no
 existen.
- Contraste WCAG de los tokens: `node scripts/contraste.mjs`.
- Deriva de tokens vs. guía de UX/UI: `node scripts/tokens-vs-guia.mjs`.
 Falla si la guía nombra un token que no existe (FANTASMA), si `main.css`
 define uno sin ningún consumidor (MUERTO), si un `var()` sin fallback
 apunta a un token inexistente (REFERENCIA ROTA — bug visual que ni el build
 ni los tests ven) o si vuelve a aparecer una CAPA DUPLICADA (dos nombres de
 rol para el mismo rol). Un token sin consumidor que se quiere conservar va
 en `DEUDA_DECLARADA` **con su motivo escrito**, dentro del propio script.
 Lee las dos capas de CSS: la vendor (`--cds-*`) queda fuera de MUERTO y de
 CAPA DUPLICADA a propósito — una escala de color es completa por
 definición, y un rol que apunta a un valor de escala es la indirección para
 la que sirve un design system, no su duplicación. Sus pasos sin mapear se
 reportan aparte, como inventario (PALETA VENDOR).
- Literales que deberían ser tokens: `node scripts/literales-vs-tokens.mjs`
 (`--detalle` para el desglose por archivo). Color/radio/sombra/tipografía se
 exigen en **0**; el espaciado va por **trinquete** con línea base en
 `scripts/literales-base.json` — falla solo si SUBE. Tras migrar espaciado,
 consolidar con `--fijar-base` (solo baja). **No subir la base a mano.**
- Invariantes de marcado: `node scripts/patrones-ui.mjs` (modal hecho a mano
 en vez del `<Modal>` compartido, `<img>` sin `alt`, botón solo-ícono sin
 nombre accesible).
- Clases CSS: `node scripts/clases-muertas.mjs` (`--detalle` para ver en qué
 archivo está cada una). **Falla solo ante una HUÉRFANA** — una clase
 aplicada en el marcado que ninguna hoja define: no hace nada, y "no hace
 nada" es indistinguible de "así se diseñó" (le pasó a `.badge-inline`
 durante meses, en 4 de sus 8 consumidores). Las **MUERTAS** — definidas y
 sin aplicar — se reportan como inventario y NO fallan, a propósito:
 durante la convergencia a Carbon suben, porque cada módulo que adopta
 `components/carbon/` deja atrás su familia vieja de `main.css` hasta que se
 borre. Son la lista de trabajo de esa limpieza, no una deuda a atajar.
- **Tests de render** (`frontend/tests/componentes/`): montan componentes de
 verdad con `@vue/test-utils` sobre `happy-dom`. El entorno se pide **por
 archivo** con el docblock `// @vitest-environment happy-dom` — NO cambiar
 `environment: 'node'` en `vitest.config.js`, los tests de lógica pura no
 deben pagar el costo de un DOM. Un asset de `public/` referenciado con ruta
 absoluta (`<img src="/logo.svg">`) se resuelve por alias a
 `tests/stubs/asset-publico.js`. Verifican estructura y comportamiento, **no
 apariencia**: `happy-dom` no calcula estilos.
- **Antes de corregir un hallazgo de diseño, preguntar por qué el sistema lo
 permitió.** Si nada lo impedía, el arreglo no está completo hasta que algo
 lo impida. Ver `docs/NOTAS-DISENO-ANTERIOR.md` §4.
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
