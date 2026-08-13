# Changelog de documentación

> Registro discreto de cambios a la documentación del proyecto (no del
> producto — para eso están los commits y `migrations/`). Una línea por
> actualización; el detalle vive en el propio documento tocado. No forma
> parte de la lectura principal de README/AGENTS/PANORAMA/GUIA-UX-UI: es
> solo un rastro de cuándo y por qué se actualizó cada uno.
>
> Regla asociada (`AGENTS.md`, "Reglas del proyecto"): toda modificación de
> código/esquema que cambie dominio, seguridad o UI debe actualizar la
> documentación correspondiente en el mismo cambio, y dejar una línea acá.

- **2026-08-13** — Observabilidad y rendimiento del dashboard (roadmap
  pedido explícitamente por el usuario). `@sentry/vue` instalado e
  inicializado en `main.js` (solo `PROD` + `VITE_SENTRY_DSN` configurado,
  sin Session Replay/tracing/logs, `sendDefaultPii: false` — esta app
  maneja DNI/tickets/credenciales); DSN real y host de ingesta en el
  `connect-src` de ambos `vercel.json` ya configurados por el usuario —
  cierra D-01, verificado de punta a punta (build de producción real +
  Playwright: sin violaciones de CSP, evento de prueba aceptado por
  Sentry). `api/domains/dashboard.js`: `getEstadisticas()` pasa de
  descargar filas completas a `count`/`head` (P-01); `pendientesTickets()`
  consolida 3 round-trips solapados en 1 (P-04). Detalle y estado en
  `docs/HISTORIAL-AUDITORIAS.md` (Ciclo 2). También se agregó el atajo
  Ctrl/Cmd+K para el buscador global — ver `docs/GUIA-UX-UI.md`.
- **2026-08-13** — Cierre completo del backlog del Ciclo 4 (47 hallazgos
  UX4-07 a UX4-53, `docs/HISTORIAL-AUDITORIAS.md`): patrón de tarjetas
  móviles en 7 vistas, `aria-label` en botones de contraseña, objetivos
  táctiles bajo 44px, `ConfirmDialog` reemplazando `confirm()` nativo en
  `StaffView.vue`, foco visible en radios ocultos, `aria-live`/`role=status`
  en formularios públicos, campo "Notas" reactivado en `EmpleadoForm.vue`,
  esqueleto de carga en el Dashboard, y varias correcciones puntuales de
  accesibilidad/tokens/tono. Implementado por 6 agentes en paralelo sobre
  conjuntos de archivos sin superposición; verificado con `npm run build` +
  `npm test` tras consolidar, más revisión manual de los cambios de mayor
  riesgo. Detalle completo por ítem en `docs/HISTORIAL-AUDITORIAS.md`.
- **2026-08-13** — Retiro de toda funcionalidad de correo en tickets
  (decisión de producto: el sistema no debe enviar avisos/notificaciones por
  correo por el momento). Migración 055 elimina el trigger/función
  `notify_correo_fallido()` (049); `functions/tickets.ts` pierde el correo de
  confirmación al crear y la acción `enviarEncuesta` (con su `plantillaCorreo`
  helper); frontend pierde la llamada automática a `enviarEncuesta()` en
  `marcarResuelto()` (`TicketDetalleView.vue`/`ticketDetalle.js`) y las
  referencias a `correo_fallido`/`ticket_correo_fallido` en
  `dominio-tickets.js`/`notificacionIconos.js`. La encuesta de satisfacción
  sigue generándose al cerrar, pero sin ningún aviso — el enlace queda sin
  canal de entrega. Actualizados README.md, `docs/PANORAMA_SISTEMA.md` y
  `docs/HISTORIAL-AUDITORIAS.md` (S-01 marcado como superado).
- **2026-08-13** — Primer porteo real de `design.pen` a producción, 5
  commits (Fases A-E): tokens aditivos en `main.css` (`space-1..12`,
  `danger-hover`/`-solid`, `whatsapp-text`); 5 variantes de `.btn` con foco
  en anillo externo unificado (de paso resuelve DS-01, unifica `:disabled`
  a `.5`); 4 variantes semánticas de `.toast`; hover de fondo en
  `ThOrdenable`; símbolo de marca a 4 pétalos + diamante. DS-03/DS-04/DS-05
  y la propuesta de paleta en notación de puntos siguen sin portar, a
  propósito. Detalle en `docs/GUIA-UX-UI.md` y `docs/HISTORIAL-AUDITORIAS.md`.
- **2026-08-12** — Unificado el botón "Asignar a un empleado" en
  `LicenciasView.vue` para todas las licencias, sin importar si tienen
  login o no (antes solo aparecía para licencias sin login). Nuevas
  funciones `licenciasApi.asignarUsuario()`/`liberarUsuario()`
  (`frontend/src/api/domains/licencias.js`) deciden el mecanismo: con
  login delegan en `asignarCuentaExistente`/`cerrarAsignacion` del correo
  compartido (mismo camino que el módulo Correos); sin login usan
  `asignarLicencia`/`cerrarAsignacionLicencia` directo. `mapLicencia()`
  agrega `origen: 'cuenta'|'licencia'` a cada entrada de `usuarios` para
  que `liberarUsuario()` sepa a qué tabla cerrar. Actualizados
  `stores/licencias.js`, el hint de `LicenciaForm.vue`, `README.md` y la
  lista de métodos de `tests/insforge-api-shape.test.js` (150→152).
- **2026-08-12** — **Fix de incidente en producción**: la CSP agregada en
  S-04 bloqueaba el WebSocket del realtime (`wss://kjyj8t5t.us-east.insforge.app`)
  porque `connect-src` solo tenía el esquema `https://` del mismo host.
  Agregado `wss://` explícito en `frontend/vercel.json` y su copia
  `frontend/public/vercel.json`. Actualizado el hallazgo S-04 en
  `docs/HISTORIAL-AUDITORIAS.md` con el incidente y la lección aprendida.
- **2026-08-12** — Nueva regla en `AGENTS.md` ("Diagnóstico/pruebas contra
  producción"): extiende la práctica de usar un branch de InsForge (antes
  solo para tablas de prueba nuevas, `docs/PANORAMA_SISTEMA.md` §7) a
  cualquier INSERT/UPDATE/DELETE de diagnóstico contra datos reales —
  limpieza en la misma sesión + registro explícito obligatorio. Agregada
  nota junto a `siguiente_codigo_ticket()` en `docs/PANORAMA_SISTEMA.md`
  explicando que los huecos de `TCK-00XX` son esperables (`nextval()` no
  es transaccional), a raíz del salto 0096→0120 documentado en T-05.
- **2026-08-12** — **Fix de bug en producción** (migración 054): eliminada
  la sobrecarga vieja de 5 argumentos de `crear_notificacion()`, viva por
  error desde la migración 048 (`create or replace function` con firma
  distinta crea sobrecarga, no reemplaza), que rompía con 500 la creación
  de tickets/cuentas y el alta/baja de empleados (ambigüedad de función).
  Reproducido y verificado el fix directo contra producción. Agregado
  hallazgo T-05 (Resuelto) a `docs/HISTORIAL-AUDITORIAS.md`, fila 054 en
  el historial de migraciones de `README.md`, y corregida la descripción
  de `crear_notificacion()` en `docs/PANORAMA_SISTEMA.md`.
- **2026-08-12** — Dividido `AppLayout.vue` (1161 líneas, A-06) en
  `AppSearch.vue`, `AppNav.vue` y `AppNotifications.vue`; queda en 517
  líneas como orquestador (socket realtime, drawer/colapso, tema, logout).
  Icono de aviso centralizado en `core/notificacionIconos.js` (antes
  duplicado con `NotificacionesCampana.vue`). Actualizada la tabla de
  `docs/GUIA-UX-UI.md` con la nueva composición del shell y una nota sobre
  `:global()` en `<style scoped>` (pierde el selector descendiente al
  compilar en este proyecto — verificado contra el CSS de `dist/`).
- **2026-08-12** — Nuevo job `deploy-manual` en `.github/workflows/ci.yml`
  (`workflow_dispatch`): aplica una migración a la vez vía `db import` y/o
  redespliega las 4 edge functions, en Linux en vez de a mano en Windows.
  Actualizado el checklist de deploy y la nota de producción de `vercel.json`
  en `README.md`. Marca D-02/D-03 como **Parcial** en
  `docs/HISTORIAL-AUDITORIAS.md` (sigue siendo manual a propósito, no hay
  tracking de migraciones ya aplicadas).
- **2026-08-12** — Resueltos varios hallazgos de `docs/HISTORIAL-AUDITORIAS.md`
  con cambio de código: U-02/U-03/U-04 (tokens CSS, `:focus-visible`),
  A-02 (router `meta.roles`), S-04 (CSP/HSTS en `vercel.json`). Descartado
  D-07 (alias CSS con 677 usos reales, no es código muerto). Medido P-03:
  los chunks de `html2canvas`/`dompurify` existen en `dist/` pero nunca se
  cargan en producción (lazy dentro de jsPDF, `doc.html()` no se usa) — sin
  cambio de código.
- **2026-08-12** — Fusionado `AUDIT_REPORT.md` (raíz, reconciliación de
  solo lectura del 2026-08-11) dentro de `docs/HISTORIAL-AUDITORIAS.md`:
  actualizados con evidencia S-03/T-02, P-01, T-04, P-02, U-05, A-02, U-02,
  U-03/U-04, P-04 (quitado el matiz "no reverificado"); cambiados a
  **Resuelto** S-05/S-06 y U-06; cambiado a **Parcial** Q-02/Q-03;
  corregido A-03 (bajó a 1446 líneas, no creció); confirmado P-03 con
  evidencia dura. Se agregaron 3 hallazgos nuevos: A-06 (`AppLayout.vue`
  god-component), A-07 (duplicación de "encuesta"), D-07 (alias CSS legacy
  sin eliminar). `AUDIT_REPORT.md` se elimina de la raíz tras la fusión.
- **2026-08-11** — Inventario de archivos (`docs/INVENTARIO-ARCHIVOS.md`,
  nuevo): limpieza confirmada de bajo riesgo aplicada — eliminado
  `sistema_credenciales_ti.html.bak`, destrackeado `.vite/deps/*` (+
  `.gitignore`), borradas 5 reglas CSS muertas en `main.css`, limpiado un
  comentario obsoleto en `CorreosView.vue`, corregidas las secciones de
  clases legacy de `docs/GUIA-UX-UI.md` (decían "sin uso", en realidad ya
  no existen). Se agregaron 2 hallazgos nuevos a
  `docs/HISTORIAL-AUDITORIAS.md` (Q-06, W-06) y se marcaron D-04/D-05 como
  resueltos.
- **2026-08-12** — Cierre de la migración de `design.pen` (ronda 2): los 5
  puntos pendientes de la Fase 3 resueltos — adopción real de
  `space-1..12` en los 46 componentes (83 propiedades migradas, 2
  excepciones documentadas), sidebar real reagrupado en 3 subgrupos
  (antes solo mockup), `$social.whatsapp` tokenizado, `Botón icono` a
  49×49px con spec de `aria-label` por instancia, y foco visible
  extendido a `Ítem de navegación`/`Paginación`/`Ítem de menú` (`Ítem de
  combo` documentado como no-focusable). Los 5 hallazgos DS-01 a DS-05
  de la pasada anterior siguen abiertos a propósito — dependen de
  desarrollo, no de diseño. Detalle en `docs/GUIA-UX-UI.md`.
- **2026-08-12** — Auditoría de Design System (`design.pen` vs. producción):
  5 hallazgos nuevos en `docs/HISTORIAL-AUDITORIAS.md` (DS-01 a DS-05:
  `.btn-danger:hover` en oscuro, `:disabled` inconsistente, error de
  formulario sin tratamiento visual, cobertura de `:focus-visible`/`$ring`,
  selects de filtro sin nombre accesible), cada uno con ficha de desarrollo
  (qué cambia, selector, cómo verificar en QA). U-01 ampliado con la
  medición en tema oscuro. Ninguno de los 5 se corrigió en `main.css`/`.vue`
  en esta pasada — son hallazgos y propuestas, no cambios de código.
  `docs/GUIA-UX-UI.md` documenta en paralelo lo que sí se aplicó dentro de
  `design.pen` (3 fixes de bajo riesgo + fundación de escalamiento: escala
  `space-1..12`, variant sets completos de Botón/Campo de texto/Campo
  select, propuesta de reagrupación del sidebar sin tocar rutas).
- **2026-08-11** — Revisión general de toda la documentación: `README.md`
  (migraciones 039–047, módulos Notificaciones/Encuestas/Pre-registro de
  personal), `AGENTS.md` (vigencia, regla de "docs por cambio"),
  `docs/PANORAMA_SISTEMA.md` (esquema hasta 047, decisiones revisadas),
  `docs/GUIA-UX-UI.md` (vigencia, componente `NotificacionesCampana`). Se
  fusionaron los dos informes de auditoría sueltos en la raíz en
  `docs/HISTORIAL-AUDITORIAS.md` (con estado reconciliado hallazgo por
  hallazgo) y se crea este changelog.
