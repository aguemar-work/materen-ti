# Plan de mejora — Materen Sistema TI, versión "Expediente"

**Fecha:** 2026-10-01. **Origen:** Fase 0 de la auditoría Ciclo 21 (`00-reconocimiento.md`, `hallazgos.md`, anexos A–E). **Encargo del dueño:** plan de mejora con libertad total para presentar una nueva versión, conservando la paleta y la tipografía, sin diseño genérico "hecho por IA". **Decisiones del dueño (2026-10-01):** evolución sobre la base actual (no reescritura); proponer una identidad ligera del empleado como opción con su riesgo; capacidad de 1 desarrollador + agentes en 6 meses; dejar la puerta abierta a otros dominios sin diseñarlos.

Este documento **propone**; no ejecuta nada. Cada frente se aprueba y se construye aparte, por checkpoints, con el mismo rito del plan V2 de Tickets (`docs/PLAN-V2-TICKETS.md` §0 y §9).

---

## 0. Qué no cambia

- Invariantes de `AGENTS.md`: sin registro público, staff nace inactivo, contraseñas solo en servidor, softdelete, auditoría inmutable, `functionsUrl` fijo, español impersonal.
- Paleta: rampa `primary-*` (#0064E0), grises de Tailwind, `green/amber/red` para estados y `sky/violet/teal` para categorías. Tipografía Inter Variable. Íconos Tabler.
- "Marco + hoja", las 13 reglas de `docs/SISTEMA-DISENO.md` §1, filtros V2 (vistas + chips + URL), InsForge como backend.
- Las decisiones aprobadas del plan V2 de Tickets (D1–D4, A1–A9). El plan V2 sigue su curso; este plan se acopla a sus fases y las cuestiona solo en §10.

**Numeración de migraciones:** el Checkpoint 1 del plan V2 reserva **096–098** (cola ordenada, prioridad sugerida, reaviso/autocierre). Este plan numera desde **099**.

---

## 1. Tesis: el expediente de custodia

El sistema custodia quién tuvo qué (acceso, equipo, licencia), desde cuándo, hasta cuándo y con qué acta. La nueva versión toma su lenguaje del **expediente**: la carpeta con carátula que una oficina abre por cada persona, cada equipo y cada caso, dentro de la cual se van cosiendo hojas fechadas y actas firmadas.

- Cada registro tiene **número**: DNI, código de inventario, `TCK-0281`, `SOL-0012`.
- Cada registro abre con **carátula**: qué es, en qué estado está, con quién está.
- Cada registro lleva un **libro de movimientos** en orden cronológico, con quién hizo qué y cuándo.
- Lo que se imprime y se firma (actas, hoja de vida, reporte) es **la misma hoja** que se ve en pantalla.
- El azul es **tinta**: aparece donde alguien escribió o va a actuar (enlace, acción principal, filtro aplicado, "estoy acá"), nunca como relleno de cajas.
- Los estados son **sellos**: una palabra, legible en pantalla, en papel y en blanco y negro.
- La densidad es la del **libro de registro**: filas de 40 px, identificadores alineados, fecha primero.

Esto no es genérico porque el patrón "dashboard SaaS" (hero, cuatro KPI con íconos de colores, dona, tarjetas flotantes, saludo entusiasta) está diseñado para *mostrar* un producto a quien lo ve una vez; el expediente está diseñado para *custodiar* información que 8 personas consultan y firman todos los días y que un auditor va a pedir. El carácter ya está latente en el código: `TCK-0001` con `lpad` (016), 101 entregas de un solo uso, 879 eventos en `accesos_log`, actas de entrega y devolución, la hoja de vida de equipos, el `historialUnificado` del empleado. La versión lo hace visible y lo convierte en reglas verificables por script.

**Principios de ejecución**
1. La regla de negocio vive en Postgres (tabla + trigger/RPC + RLS); la UI la refleja.
2. Proporcionado a 8 staff y ≈100 empleados: nada de motores genéricos ni "administrar flujos".
3. Primero drift y seguridad, después dominio: no se construye sobre una base que no se puede reconstruir.
4. Patrón de migración de 038/086/093: cabecera con dependencias y hallazgo, idempotente, `owner to project_admin`, `revoke`/`grant` explícitos, bloque de verificación al pie, rollback en `migrations/rollback/`.
5. Guard único en RPC: `raise exception 'No autorizado' using errcode = '42501'` (patrón 093 `exigir_staff_tickets`); nunca `P0001` genérico.

---

## 2. Frentes

| Frente | Qué resuelve | Hallazgos que cierra |
|---|---|---|
| **F-A Base operativa** | drift main↔producción, registros de migraciones/deploys, deploy desde commit, backups, drift de esquema en CI | C21-OPS-001..004, C13-e, T-03, D-02/D-03 |
| **F-B Dominio y reglas en la base** | eventos del empleado, solicitudes de servicio, RPC transaccionales, concurrencia, retención | anexo D §8, anexo E §5, EMPLEADOS-SIN-AUDITORIA, CUENTAS-SIN-AUDITORIA-CRUD, REVOCAR-CUENTA-LOGICA-DUPLICADA |
| **F-C Permisos y seguridad** | regla única `puede()`, gates faltantes, bucket privado, oráculos, rate-limits, EXIF, descifrado honesto | anexo A §6–8, anexo D §8, P0-04, C13-cat/ubic |
| **F-D Rediseño "Expediente"** | carátula, libro, códigos, sellos, impresión, Inicio como mesa del día, hoja de vida con URL | anexo E, UX6-*, ARQ-09/13 |
| **F-E Mesa de ayuda (plan V2 F2–F5)** | reloj laboral, doble cierre, solicitudes con trámite, KB desde la resolución, reportes | PLAN-V2-TICKETS, U-05, N1/N2 |
| **F-F Portal del empleado** | identidad ligera por enlace firmado (opción), confirmación de recepción y de cierre, prioridad sugerida | D2, A9 |
| **F-G Frontend** | errores traducidos, `dashboard_resumen()`, módulos en una lista, máquinas de estado desde la base, god-components | anexo E §5–8, T-04 |
| **F-H Medición y cumplimiento** | KPIs en SQL, reportes, retención y Ley 29733 | Fases 2 y 7 de la auditoría, W-06 |

---

## 3. Dirección visual

### 3.1 Reglas 14–25 (se suman a las 13 vigentes de SISTEMA-DISENO §1)

14. **Los identificadores son el nombre del expediente.** Todo código del dominio (TCK-0281, código de equipo, `codigo_almacen`, serie, DNI, usuario de cuenta) se compone con un único render `AppCodigo`: Inter `font-medium tabular-nums`, prefijo y separador en `text-gray-500`, dígitos en `text-gray-900`, `title` con el nombre completo del dato. Nunca `font-mono` para códigos (hoy el portal los pone en mono: `TicketNuevoView.vue:341`, `TicketSeguimientoView.vue:78`, y el panel en Inter). `font-mono` queda reservado a lo que se transcribe: contraseñas, usuarios y URLs (`.cred__valor`, `EntregaView.vue:98,113`). En tablas el identificador va en columna propia de ancho fijo, primera después de prioridad/estado. El buscador global trata un código completo como número de expediente: Enter abre el registro, no una lista.
15. **Los estados son sellos, no pastillas con ícono.** `AppTag` sigue siendo el único render de tag (20 px, fondo tenue) y pierde `icono` y `punto` en tags de estado: un estado es una palabra. Se agrega `AppSello` (escalón 2 de la escala: solo borde 1 px, `rounded-sm`, `text-[11px] font-semibold uppercase tracking-wider`), reservado a **estados terminales en carátulas y en impresión**: CERRADO · conforme 30/09, RECHAZADO, BAJA 12/08/2026, DE BAJA, PERDIDO. Un sello por carátula, nunca en filas de tabla. Colores: gris (terminal neutro), verde (cerrado conforme), rojo (rechazado, perdido).
16. **Jerarquía tipográfica de expediente, con Inter y tres pesos.** 400, 500 y 600; `font-bold` prohibido en UI (el `bold` de las actas en papel se mantiene). Cinco niveles: título de carátula `text-2xl font-semibold tracking-tight`; identificador junto al título `text-sm font-medium tabular-nums text-gray-600`; **rótulo de expediente** `text-[11px] font-semibold uppercase tracking-wider text-gray-500` (el mismo token del rótulo de grupo del menú, ahora también para "EXPEDIENTE · EMPLEADO", los `dt` de la carátula y los subtítulos del libro); cuerpo `text-sm`; fecha de libro `text-xs tabular-nums text-gray-500`. Ningún número con `tracking` negativo ni agrandado por énfasis: una cifra `text-2xl` solo existe en un reporte.
17. **El azul es tinta.** `text-primary-*` solo en texto interactivo (enlaces, el código que abre un expediente, "Ver mis 12 tickets →") y en el ícono del ítem activo del menú. `bg-primary-50` solo en lo que el usuario puso: chip aplicado, fila seleccionada, opción activa. Sólido `primary-500` solo en la acción principal, el foco y la marca de 2 px de `AppVistas`. Quedan fuera: cajas de ícono `bg-primary-50 text-primary-600` (`EmpleadoDetalleView.vue:443`, `DashboardView.vue:94-99`, `SoporteView.vue:30`, `AppKpi.vue:20`, `AppPortal.vue:42`) y barras de progreso azules decorativas (`EmpleadoDetalleView.vue:393-399`). Íconos informativos grises y escasos.
18. **Densidad de libro.** Dos densidades: *libro* (listados, kardex, Inicio): celdas `px-3 py-2`, fila 40 px, cabecera 32 px; *ficha* (carátulas, formularios): lo vigente. Toda tabla con `table-layout: fixed`. Orden de columnas en listados: lo que decide (prioridad, reloj) · identificador · qué · quién · responsable · estado · fecha. Fechas de listado según §3.3 vigente; en libros siempre `dd/mm/yy hh:mm` (un kardex cruza años).
19. **Un solo libro de movimientos: `AppLibro`.** Reemplaza los cinco renders de historial que hoy conviven: `historialUnificado` (`EmpleadoDetalleView.vue:431-453`), hoja de vida (`EquiposView.vue:512-517`), historial de cuenta (`CuentasPanel.vue:110-114`), hitos de `TicketTimelineUnificado.vue:53-60` y `ActividadView`. Fila: **Fecha** (88 px, `dd/mm/yy` arriba, `hh:mm` en gris) · **Movimiento** (verbo en participio: "Entregado", "Contraseña rotada", "Abierto → En progreso", siempre anterior → nuevo) · **Detalle** · **Por** (actor; "no registrado (legado)" cuando falta) · **Ref.** (enlace al otro expediente o al acta). Sin puntos de color, sin cajas de ícono, sin riel vertical. Los mensajes de un ticket son un segundo tipo de fila del mismo libro. Historiales con lo más reciente arriba; conversación de ticket con lo más reciente abajo y el composer al pie (ya decidido).
20. **Toda ficha abre con carátula: `AppCaratula`.** (1) rótulo + identificador: "EMPLEADO · DNI 45678912", "TICKET · TCK-0281 · INCIDENTE", "EQUIPO · LAP-0142 · ALMACÉN A-00231"; (2) `h1` + sello si es terminal; (3) `dl` horizontal de 3–6 pares rótulo/valor; acciones a la derecha, una sólida; regla horizontal a sangre. Sin avatar grande (queda en listas y menú de usuario). Sin "← Volver" (vigente).
21. **El vacío se registra, no se ilustra.** Dato ausente: "Sin registrar" en gris (vigente). Sección sin filas: **una fila de libro** en gris ("— Sin movimientos registrados") con la acción como enlace de texto en la misma fila. `AppVacio` con ícono solo para páginas completas. Se retira el círculo verde de "Todo al día" (`DashboardView.vue:226-235`): al día es una línea de texto.
22. **Microinteracciones: se anima lo que se mueve de lugar.** Permitido: panel móvil (200 ms), menú/popover/modal (100–150 ms), toast, barra de 8 s del revelado (`.cred__barra`), `animate-spin` en botón cargando, hover 150 ms. Prohibido: esqueletos `animate-pulse` con forma de tarjeta (`DashboardView.vue:180-188`): la carga es una línea de 2 px en el borde superior de la hoja y el contenido anterior se queda (stale-while-revalidate por sección); números que cuentan, `animate-bounce/ping`. `prefers-reduced-motion` respetado desde `main.css`.
23. **Imprimir es la misma hoja.** `styles/impresion.css` (`@media print`): el marco desaparece, la hoja ocupa A4, la carátula es la cabecera, el libro imprime como tabla con líneas finas, los sellos conservan el borde, el azul se vuelve subrayado. Toda ficha tiene "Imprimir" en Más. Las actas (`acta-base.js`, hoy Arial en una ventana con `document.write`) migran a una **ruta imprimible** `/equipos/:id/acta/:asignacionId` con el mismo vocabulario (Inter del bundle, rótulos, tabla de datos, cláusula, dos firmas, pie "Documento generado por Materen — Sistema TI el …"); `reservarVentanaActa()` deja de hacer falta. Los PDF jsPDF (`pdfReporte.js`) se alinean en títulos de sección.
24. **Prioridad como rango escrito.** `BAJA · MEDIA · ALTA · URGENTE` con `AppTag` neutro para las tres primeras y rojo solo para Urgente; el orden lo da el reloj y la posición en la cola (servidor, V2 §2.1), no el color. `sky/violet/teal` quedan para categorías (tipo de cuenta, tipo de ubicación, nivel N1–N3). Resuelve la colisión estado/prioridad que denuncia V2 §4.1 sin ampliar la paleta.
25. **Copy de registro.** Impersonal y de usted (vigente); además sin signos de exclamación ni "¡Listo!", "Genial", "Bienvenido"; verbos de libro en participio, botones en infinitivo, estados en adjetivo. Inicio conserva el saludo con nombre (decisión del dueño): "Buenos días, Alejandro" y debajo "Martes 1 de octubre · 8 asuntos, 2 críticos".

### 3.2 Arquitectura de información

| Hoy (`navegacion.js`) | Propuesta | Por qué |
|---|---|---|
| Inicio | **Inicio** (misma ruta `/dashboard`) | la vista cambia de tablero a mesa del día; ruta y etiqueta no, para no romper enlaces |
| Mesa de Ayuda: Tickets · Base de Conocimiento · Problemas · Encuestas | **Mesa de ayuda**: Tickets · **Solicitudes** · Problemas · Conocimiento | "Solicitudes" = tickets de tipo `solicitud` con trámite (§4, migración 108) |
| Gestión de Personal: Empleados | **Personas**: Empleados · **Encuestas** | el ítem "reservado para onboarding" desaparece: el alta es una solicitud y vive en el expediente. Encuestas se mueve acá porque sus campañas van dirigidas al personal (actualización de datos, satisfacción sobre un tema concreto; decisión del dueño 2026-10-01) |
| Inventario Global: Correos · Licencias · Equipos | **Custodia**: Equipos · Licencias · Correos | orden por volumen y peso documental (314 equipos con actas); "Custodia" dice qué hace el grupo |
| Administración: Actividad · Accesos sensibles · Configuración | **Administración**: Registro de actividad · Accesos sensibles · Configuración | "Actividad" suena a feed; es el libro de auditoría |

`navegacion.js` pasa a importar los ids desde `core/modulos.js` (hoy dos listas que nada sincroniza, anexo E §1).

**Expediente del empleado como nodo central.** Desde cualquier fila con una persona (ticket, equipo, cuenta compartida, licencia, actividad, entrega) el nombre enlaza al expediente; desde el expediente, cada fila del libro enlaza al equipo, al ticket o a la cuenta. Rutas nuevas: `/equipos/:id` (hoja de vida; hoy los enlaces van a `/equipos?q=CODIGO`, `EmpleadoDetalleView.vue:485`), `/equipos/:id/acta/:asignacionId`, `/mi/:token` (portal, §4 migración 109). Secciones nuevas en el expediente: "Tickets y solicitudes" (filtro `solicitante=<id>` en `filtrosTickets.js`) y "Entregas" (desde `entregas` y `accesos_log`: 163 aperturas registradas que hoy no se ven en ninguna ficha).

### 3.3 Las seis pantallas que definen la versión

**1. Inicio: la mesa del día** (`modules/dashboard/DashboardView.vue`)

```
┌ Materen │ Inicio ───────────────────────────────────────── [Buscar ⌘K] [🔔] ┐
│  Buenos días, Alejandro                                   [+ Ticket interno] │
│  Martes 1 de octubre · 8 asuntos pendientes, 2 críticos                      │
│  Todos 8    Tickets 5    Accesos 2    Custodia 1    Problemas 0              │
│  ─────────                                                                   │
│ ┌────────────────────────────────────────────────┐ ┌───────────────────────┐ │
│ │ CRÍTICO                                        │ │ Mis tickets        3  │ │
│ │ 3 d  TCK-0281  Impresora obra Lurín            │ │ TCK-0287 Sin acceso a │ │
│ │      Urgente · sin asignar · vencido hace 3 h  │ │ Bitrix   En progreso  │ │
│ │ 12 d LAP-0142  Sin devolver                    │ │          vence en 50 m│ │
│ │      J. Quispe (baja 19/09) · acta pendiente   │ │ Ver mis 3 tickets →   │ │
│ │ ATENCIÓN                                       │ ├───────────────────────┤ │
│ │ 1 d  TCK-0285  Instalar AutoCAD                │ │ VENCE ESTA SEMANA     │ │
│ │      Alta · D. Huamán · 2 h 10 m               │ │ 03/10 AutoCAD 2025    │ │
│ │ 1 d  Alta a medias  M. Torres                  │ │       3 asientos      │ │
│ │      sin cuenta de correo · entró 30/09        │ │ 05/10 Garantía        │ │
│ │ —    soporte@materen.pe  Rotar antes de        │ │       LAP-0098        │ │
│ │      reasignar · reutilizable                  │ ├───────────────────────┤ │
│ │ Ver 3 más                                      │ │ HOY EN CUSTODIA       │ │
│ └────────────────────────────────────────────────┘ │ 10:12 Entregado       │ │
│                                                    │  LAP-0150 → R. Salas  │ │
│                                                    │ 09:40 Devuelto        │ │
│                                                    │  MON-0031 ← J. Quispe │ │
│                                                    └───────────────────────┘ │
```

Decisiones: los 4 `AppKpi` con ícono (`DashboardView.vue:193-212`) se vuelven una fila de `AppVistas` con conteo que filtra el feed en el lugar; el feed es un `AppLibro` con "hace N días" en la columna de fecha, agrupado CRÍTICO / ATENCIÓN; se retira "Inventario" (`:321-339`, "82 empleados activos" no decide nada) y entra "Hoy en custodia"; cada sección carga sola con su reintento (V2 §2.3) y todo sale de **una** RPC `dashboard_resumen()` en vez de ≈25 requests (anexo E §7); `AppLayout.vue:117-125` deja de repetir `pendientesTickets()`.

**2. Expediente del empleado** (`modules/empleados/EmpleadoDetalleView.vue`)

```
┌ Personas › Empleados ──────────────────────────────────────────────────────┐
│ EMPLEADO · DNI 45678912                              [Editar] [Dar de baja] │
│ Juan Carlos Quispe Mamani                                     [Más ▾]       │
│ EMPRESA Materen · ÁREA/OBRA Obra Lurín · CARGO Residente · ALTA 14/03/24    │
│ WHATSAPP 987 654 321 · CORREO jquispe@gmail.com                             │
│ ──────────────────────────────────────────────────────────────────────────── │
│ ALTA EN CURSO · 2 de 4 pasos · entró hace 1 día                            │
│   ✓ Cuenta de correo   ✓ Entrega enviada   ○ Equipo  Entregar   ○ Licencia  │
│ ──────────────────────────────────────────────────────────────────────────── │
│ ┌ En custodia  5 ─────────────────────────────────┐ ┌ Entregas ──────────┐ │
│ │ TIPO     IDENTIFICADOR      DETALLE      DESDE   │ │ 12/09/26 enviada   │ │
│ │ Correo   jquispe@materen.pe Google Work. 14/03/24│ │ 12/09/26 abierta   │ │
│ │          •••••••• [ver 8 s]  ⋮                   │ │   20:14 · 1 cuenta │ │
│ │ ERP      JQUISPE            Contasis     14/03/24│ │ Enviar nueva →     │ │
│ │ Equipo   LAP-0142           HP ProBook   12/03/25│ ├ Organización ──────┤ │
│ │          acta firmada ✓      ⋮                   │ │ UBICACIÓN Sede Lima│ │
│ │ Equipo   MON-0031           Dell 24"     12/03/25│ │ NOTAS …            │ │
│ │ Licencia AutoCAD 2025       vence 03/10  01/02/26│ └────────────────────┘ │
│ └─────────────────────────────────────────────────┘                        │
│ ┌ Tickets y solicitudes  7 ───────────────────────┐                        │
│ │ TCK-0281  Impresora obra Lurín     Abierto  28/09│                        │
│ │ SOL-0012  Alta · 4/4 pasos         Completada 15/03│                      │
│ └─────────────────────────────────────────────────┘                        │
│ ┌ Libro de movimientos  23 ──── Todo · Accesos · Equipos · Licencias ─────┐ │
│ │ FECHA           MOVIMIENTO             DETALLE               POR    REF │ │
│ │ 12/09/26 20:14  Entrega abierta        1 cuenta · WhatsApp   —      ↗   │ │
│ │ 12/09/26 18:02  Contraseña rotada      jquispe@materen.pe    A. G.      │ │
│ │ 12/03/25 10:30  Equipo entregado       LAP-0142 · acta       D. H.  ↗   │ │
│ │ 14/03/24 09:00  Registrado             Alta en Materen       A. G.      │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
```

Decisiones: carátula con rótulo + DNI + `dl` en vez de avatar XL + lista con íconos; **"En custodia"** reúne en una sola tabla los tres paneles de hoy (`EmpleadoDetalleView.vue:455-546`, `CuentasPanel.vue`), con acciones por fila en ⋮ y el revelado de 8 s (`.cred*`, `useRevelado`) intacto; guía de alta como fila de pasos sin barra; el libro deja de armarse en cliente con fechas de inicio (`historialUnificado`) y se alimenta de eventos reales (`empleado_eventos`, asignaciones cerradas, `accesos_log`, entregas); "Imprimir expediente" en Más.

**3. Triage de tickets** (`modules/tickets/TicketsView.vue`)

```
┌ Mesa de ayuda › Tickets ───────────────────────────────────────────────────┐
│ Tickets                                              [Más ▾] [+ Ticket int.]│
│ 12 pendientes · 3 sin asignar · 1 sin vincular                              │
│ Todos 287   Pendientes 12   En espera 2   Resueltos 270   Rechazados 8      │
│             ──────────                                                       │
│ [🔍 Buscar por código, título o solicitante]  [+ Filtro]                     │
│ ┌──────┬──────────────┬───────────────────────────┬────────────┬──────┬─────┐│
│ │ PRIO │ RELOJ        │ TICKET                    │ SOLICITANTE│ RESP │ EST ││
│ │ URG  │ vencido 3 h  │ TCK-0281 Impresora Lurín  │ J. Quispe  │ —    │ Abi ││
│ │ ALTA │ 2 h 10 m     │ TCK-0285 Instalar AutoCAD │ M. Torres  │ DH   │ Pro ││
│ │ MED  │ pausado      │ TCK-0279 Teclado          │ R. Salas   │ AG   │ Esp ││
│ └──────┴──────────────┴───────────────────────────┴────────────┴──────┴─────┘│
│  Con una fila activa (Enter / clic), la hoja se parte:                      │
│ ┌ cola (PRIO · RELOJ · TICKET · RESP) 420 px ┐ ┌ TICKET · TCK-0281 ───────┐│
│ │ URG vencido 3 h TCK-0281 Impresora…   —    │ │ Impresora obra Lurín      ││
│ │ ALTA 2 h 10 m   TCK-0285 Instalar…    DH   │ │ J. Quispe ↗ · Recibido … ││
│ │ j/k mover · Enter abrir · a asignarme      │ │ [Asignarme] [Iniciar at.]││
│ └────────────────────────────────────────────┘ └───────────────────────────┘│
```

Decisiones: desaparece el selector Tabla / Doble columna (`TicketsView.vue:56-61`, `useVistaModulo`): una sola lista y el detalle como panel dentro de la hoja (Esc cierra); la cola angosta es la misma tabla con menos columnas (`TarjetaTicket` solo móvil); columna **Reloj** con texto del servidor (`estado_tiempo_ticket`) que reemplaza la heurística local `ticketEnvejecido` (`:345-350`); vista "En espera" para `en_espera_usuario`; selección múltiple solo para reasignar ("Cerrar seleccionados" se retira con el doble cierre, V2 §3.9); atajos `j/k/Enter/a/r` documentados con `?` (V2 §4.6).

**4. Detalle de ticket con doble cierre y reloj** (`TicketDetalleView.vue` / `TicketDetallePanel.vue`)

```
┌ Mesa de ayuda › Tickets ───────────────────────────────────────────────────┐
│ TICKET · TCK-0281 · INCIDENTE · Impresoras › Atascos        [Más ▾]        │
│ Impresora de obra Lurín no imprime                 [Pedir información]     │
│                                                    [Marcar resuelto]       │
│ SOLICITANTE J. Quispe ↗ · RECIBIDO 28/09 14:02 · RESPONSABLE D. Huamán      │
│ RELOJ objetivo 4 h · consumido 3 h 10 m · vence en 50 m                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ Recibido 28/09  ›  En atención 28/09  ›  Resuelto —  ›  Conforme —          │
│ ──────────────────────────────────────────────────────────────────────────── │
│ ┌ Libro y conversación ─── Todo · Mensajes ───────┐ ┌ Gestión ────────────┐ │
│ │ 28/09 14:02  Solicitud  "La impresora HP de la │ │ PRIORIDAD  Urgente  │ │
│ │              oficina de obra…"  📎 captura     │ │ NIVEL      N1       │ │
│ │ 28/09 14:30  Abierto → En progreso  D. Huamán  │ │ TIPO       Incidente│ │
│ │ 28/09 14:31  [D. Huamán · visible]             │ │ CATEGORÍA  Impresoras│ │
│ │              "¿Puede indicar el modelo?"       │ │ RESPONSABLE D. Huamán│ │
│ │ 28/09 16:10  [J. Quispe]  "HP M404"            │ ├ Solicitante ────────┤ │
│ │ 29/09 09:00  [D. Huamán · nota interna]        │ │ J. Quispe · Lurín   │ │
│ │ ──────────────────────────────────────────────│ │ Equipos: LAP-0142 ↗ │ │
│ │ [Mensaje visible ▾] ________________  [Enviar] │ ├ Relacionados ───────┤ │
│ └────────────────────────────────────────────────┘ │ Duplicado de — ·    │ │
│                                                    │ Problema — · KB —   │ │
│  En RESUELTO el bloque de acciones cambia a:       └─────────────────────┘ │
│  Esperando conformidad del solicitante desde 30/09 · se cierra solo el 05/10 │
│  [Reenviar aviso por WhatsApp]   (ningún botón sólido: la acción es de él)  │
```

Decisiones: "Marcar resuelto" abre la nota de resolución obligatoria y deja el ticket en `resuelto` (V2 §3.1); el trámite de cuatro pasos en texto muestra el doble cierre sin stepper gráfico; el reloj es una línea de texto + una barra de 2 px (la única barra, roja si vencido); `TicketResumen.vue` (íconos sin rótulo) se reemplaza por el `dl` de carátula; Gestión suma Categoría (V2 §3.6); Relacionados agrupa duplicado, problema y KB, y el botón KB solo aparece con nota de resolución (V2 §3.7).

**5. Hoja de vida de un equipo** (ruta nueva `/equipos/:id`)

```
┌ Custodia › Equipos ────────────────────────────────────────────────────────┐
│ EQUIPO · LAP-0142 · ALMACÉN A-00231 · SERIE 5CD1234XYZ      [Devolver]      │
│ Laptop HP ProBook 450 G8                              [Acta] [Más ▾]        │
│ EMPRESA Materen · TIPO Laptop · GARANTÍA hasta 05/10/26 · ESTADO Operativo  │
│ EN CUSTODIA DE J. Quispe ↗ desde 12/03/25 · acta de entrega firmada ✓       │
│ ──────────────────────────────────────────────────────────────────────────── │
│ ┌ Kardex  6 ──────────────────────────────────────┐ ┌ Especificaciones ───┐ │
│ │ FECHA           MOVIMIENTO       CON          REF│ │ PROCESADOR i5-1135G7│ │
│ │ 12/03/25 10:30  Entregado        J. Quispe    acta│ │ RAM 16 GB · SSD 512 │ │
│ │ 02/03/25 16:00  Reparado         Almacén Lima    │ ├ Identificación ─────┤ │
│ │ 20/02/25 09:15  A reparación     "no enciende"   │ │ CÓDIGO     LAP-0142 │ │
│ │ 20/02/25 09:10  Devuelto         M. Torres    acta│ │ ALMACÉN    A-00231  │ │
│ │ 08/01/24 15:20  Registrado       Importación     │ │ Imprimir etiqueta   │ │
│ └─────────────────────────────────────────────────┘ ├ Accesorios  3 ──────┤ │
│ ┌ Fotos  2 de 4 ──────────────────────────────────┐ │ CAR-0012 Cargador   │ │
│ │ [  ]  [  ]  Agregar foto                        │ │ MOU-0045 Mouse      │ │
│ └─────────────────────────────────────────────────┘ └─────────────────────┘ │
```

Decisiones: la hoja de vida deja de ser un modal (`EquiposView.vue:506-539`) y se vuelve un expediente con URL; la acción sólida la decide el estado (Entregar si está libre, Devolver si tiene portador); mover, reparación, baja y editar en Más; el kardex muestra en cada entrega/devolución si existe acta, con enlace a la ruta imprimible; "Imprimir etiqueta" con QR (código + empresa, 50×25 mm; decidido, ver §3.6) y "Verificar" para la conciliación física; `specs` jsonb con `AppListaDatos`.

**6. Portal del empleado a 390 px** (`modules/soporte`, `modules/tickets/Ticket*View.vue`, `modules/entregas/EntregaView.vue`)

```
 Nuevo ticket               Seguimiento (resuelto)       Entrega de accesos
┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐
│ ▣ Materen · Soporte TI  │ │ ▣ Materen · Soporte TI  │ │ ▣ Materen · Accesos     │
│ Nuevo ticket            │ │ TCK-0281    [RESUELTO]  │ │ ENTREGA · un solo uso   │
│ DNI                     │ │ Impresora de obra Lurín │ │ Accesos de J. Quispe    │
│ [ 4 5 6 7 8 9 1 2    ]  │ │ RECIBIDO 28/09 14:02    │ │ Guarde estos datos      │
│ ¿Le impide trabajar?    │ │ RESUELTO 30/09 por D.H. │ │ ahora. Al cerrar no     │
│ [ Sí ] [ No ]           │ │ SOLUCIÓN                │ │ podrá volver a verlos.  │
│ ¿Afecta a más personas? │ │ Se reemplazó el fusor…  │ │ GOOGLE WORKSPACE        │
│ [ Sí ] [ No ]           │ │ ¿Quedó resuelto?        │ │ USUARIO                 │
│ Tipo de solicitud       │ │ ┌────────────────────┐  │ │ jquispe@materen.pe  [⧉] │
│ [ Impresoras        ▾ ] │ │ │   Sí, conforme     │  │ │ CONTRASEÑA              │
│ Resumen breve           │ │ └────────────────────┘  │ │ Xk9#mP2v…           [⧉] │
│ [                    ]  │ │ [ No, sigue fallando ]  │ │ CONTASIS …              │
│ Detalle                 │ │ Si no responde, se      │ │ Soporte: solo por       │
│ [                    ]  │ │ cierra el 05/10.        │ │ ticket. [Crear ticket ↗]│
│ [📷 Adjuntar captura]   │ │ ACTUALIZACIONES         │ │                         │
│ ┌────────────────────┐  │ │ 30/09 15:10 D. Huamán   │ │                         │
│ │  Enviar solicitud  │  │ │ Se reemplazó…           │ │                         │
│ └────────────────────┘  │ └────────────────────────┘ └────────────────────────┘
│ ← Volver a soporte      │
└────────────────────────┘
```

Decisiones: `AppPortal` conserva la card única y los 44 px, pero el encabezado se vuelve **comprobante** (código con `AppCodigo`, sello de estado, `dl` de fechas); el círculo de ícono tonal (`AppPortal.vue:69-75`) se retira salvo en errores; nuevo ticket incorpora las dos preguntas de impacto (V2 §2.2) como `AppSegmentado` de 44 px (el solicitante no elige prioridad) y no confirma el nombre tras el DNI (oráculo, `00-reconocimiento.md` §0.6); seguimiento muestra la **nota de resolución** y las dos acciones del doble cierre con la fecha de autocierre escrita; la entrega mantiene el flujo de un solo uso y el aviso de soporte en pestaña nueva, con rótulos de expediente y `font-mono` solo en usuario/contraseña.

### 3.4 Lo que se retira o se simplifica

| Qué | Dónde | Por qué |
|---|---|---|
| 4 tarjetas KPI con ícono + bloque "Inventario" | `DashboardView.vue:193-212, 321-339`; `AppKpi.vue` | cifras que no deciden nada; la fila de vistas hace el mismo filtro. `AppKpi` queda para `ReporteSatisfaccionView` |
| Esqueletos `animate-pulse`, círculo verde "Todo al día" | `DashboardView.vue:180-188, 226-235` | reglas 21 y 22 |
| Selector Tabla / Doble columna, `useVistaModulo('tickets')` | `TicketsView.vue:56-61, 542` | dos vistas de lo mismo |
| "Cerrar seleccionados" en lote | `TicketsView.vue:234-259, 574-582, 856-868` | con doble cierre el técnico no cierra (V2 §3.9) |
| Heurísticas locales de antigüedad | `TicketsView.vue:345-350`, `dashboard.js` | un solo `estado_tiempo_ticket` |
| `TicketResumen.vue` con íconos sin rótulo | `modules/tickets/TicketResumen.vue` | en un expediente los datos llevan nombre |
| Puntos de color y cajas de ícono en historiales | `TicketTimelineUnificado.vue:34-40,54`; `EmpleadoDetalleView.vue:443,472,508`; `DashboardView.vue:94-99,252` | regla 19 |
| Tres paneles Cuentas / Equipos / Licencias en la ficha | `EmpleadoDetalleView.vue:455-546`, `CuentasPanel.vue` (render) | una tabla "En custodia"; la lógica se conserva |
| `historialUnificado` por fechas de inicio | `EmpleadoDetalleView.vue:151-213` | eventos reales de servidor |
| Hoja de vida como modal | `EquiposView.vue:506-539` | ruta `/equipos/:id` |
| Actas por `window.open` + `document.write` en Arial | `acta-base.js:72-151`, `acta.js`, `acta-devolucion.js` | ruta imprimible |
| Avatares y cajas de ícono en el portal | `SoporteView.vue:30,46,59`; `AppPortal.vue:69-75` | regla 17 |
| `font-mono` en códigos | `TicketNuevoView.vue:341`; `TicketSeguimientoView.vue:78` | regla 14 |
| Barra de progreso de la guía de alta | `EmpleadoDetalleView.vue:393-399` | "2 de 4 pasos" ya lo dice |
| Tonos `sky/violet/teal` en prioridad | `core/dominio-tickets.js:27-32` | regla 24 |

### 3.5 Verificación por script

`scripts/patrones-ui.mjs` ya corre en CI; se agregan reglas al objeto `REGLAS`, cada una con `titulo / porque / arreglo / buscar(tpl)` y el formato de excepciones existente. Cada regla cita el número de la regla de SISTEMA-DISENO en su `porque`, para que una regla sin script o un script sin regla salten a la vista.

| Regla | Qué busca en el `<template>` | Excepciones previstas |
|---|---|---|
| `borde-lateral` | `border-[lr]-`, `border-x-`, `divide-x` | ninguna (regla dura del dueño; hoy ningún script la cuida) |
| `caja-de-icono` | `<span` con `h-\d+ w-\d+` + `rounded-(md|lg|full)` + `bg-*-(50|100)` cuyo único hijo es `<i` | `AppAvatar.vue`, `AppPortal.vue` (solo errores) |
| `azul-decorativo` | `text-primary-\d+` en `<i` fuera de `AppNav.vue`; `bg-primary-(50|100)` sin `aria-pressed/current/selected` ni `data-chip` | `AppFiltros`, `AppVistas`, `AppNav`, `AppSegmentado` |
| `mono-fuera-de-credenciales` | `font-mono` | `EntregaView.vue`, consumidores de `.cred__valor` |
| `codigo-sin-tabular` | `{{ x.codigo }}`, `{{ x.dni }}`, `{{ x.serie }}`, `{{ x.codigo_almacen }}` sin `tabular-nums` ni `<AppCodigo` | ninguna |
| `punto-de-color` | `h-(1\.5|2) w-(1\.5|2)[^"]*rounded-full` | `AppTag.vue` (`punto`), `TarjetaTicket.vue` |
| `peso-700` | `font-bold`, `font-extrabold` | ninguna en `.vue` |
| `sombra-flotante` | `shadow-(md|lg|xl|2xl)` | `AppLayout` (panel móvil), `AppMenu`, `Modal`, `AppDialog`, `BuscadorCombo`, `AppSearch`, `NotificacionesCampana`, `AppNotifications` |
| `radio-enorme-o-gradiente` | `rounded-(2xl|3xl)`, `bg-gradient-`, `from-`, `to-`, `backdrop-blur` | ninguna |
| `animacion-no-permitida` | `animate-(pulse|bounce|ping)` | ninguna |
| `kpi-fuera-de-reporte` | `<AppKpi` fuera de `modules/*/Reporte*` | ninguna |
| `copy-entusiasta-o-tuteo` | `¡`, `!` en texto de plantilla; `\b(Genial|Excelente|Bienvenid[oa]|puedes|tienes|tu ticket|tus datos|haz clic)\b` | ninguna |
| `historial-a-mano` | `<ol|<ul` con `formatFecha(` y `divide-y` fuera de `AppLibro.vue` | `TicketSeguimientoView.vue` hasta migrarlo |
| `error-crudo` | `e?.message` / `error.message` en `modules/**` | ninguna (ver §6) |
| `vue-mayor-400-lineas` | archivos `.vue` > 400 líneas | lista inicial de los 4 god-components hasta partirlos |

Otros guardrails: tests de render con **presupuesto de requests** (`DashboardView` ≤ 4 llamadas al montar, `/empleados/:id` ≤ 4, cambio de filtro en Tickets ≤ 2; hoy 7); estructura de `AppLibro`/`AppCaratula` (primera celda `tabular-nums` con `dd/mm/yy`, `h1` precedido de rótulo `uppercase`, ningún `<i>` del libro con clase de color); `tests/impresion.test.js` (oculta `aside`, `header` de la hoja y `[data-no-print]`; rutas de expediente con `meta.imprimible`); snapshot HTML del acta en la ruta nueva (reemplaza los tests de `construirActa`); test del lexicon de tags (`badgeInfo('prioridad', x).clase` nunca coincide con la clase de un estado de ticket). Nota: `NOTAS-DISENO-ANTERIOR.md` dice que 4 scripts de guardrail "quedan en disco", pero en `scripts/` solo hay `apply-migration.mjs`, `patrones-ui.mjs` y `test-db.mjs`; si se quieren, se recuperan de git.

### 3.6 Etiquetas QR de equipos (decidido por el dueño, 2026-10-01)

Todo equipo lleva una etiqueta con QR que abre su hoja de vida. Es la pieza que conecta el objeto físico con el expediente.

- **Qué codifica.** Una URL corta: `https://<dominio>/e/<codigo>` (por ejemplo `/e/LAP-0142`). Solo el código de inventario, que no es secreto. Nunca un token, un id interno, la serie ni el nombre de una persona.
- **Ruta `/e/:codigo` (nueva, `meta.public`).** Sin sesión no consulta nada a la base: muestra "Equipo de Materen. Si lo encontró, comuníquese con TI" y el contacto de TI tomado de `config_parametros`. Con sesión de staff resuelve el código y redirige a `/equipos/:id`; si el código no existe, avisa. Así el QR no expone datos ni permite enumerar el inventario. Mientras `/equipos/:id` no exista (H2-4), redirige a `/equipos?q=<codigo>`.
- **Etiqueta física.** 50×25 mm: QR de unos 18 mm, el código con `AppCodigo` y la empresa. Hoja A4 de etiquetas para imprimir por lote ("Imprimir etiquetas" desde la selección en Equipos), usando `impresion.css`. Los 314 equipos actuales se imprimen en lote la primera vez. Corrección de errores nivel M. Material: etiqueta adhesiva resistente (polipropileno); es una compra, no una decisión de software.
- **El código legible no se reemplaza.** Si la etiqueta se daña, el buscador global abre el expediente por código (regla 14). El QR convive con el código de almacén ya pegado en los equipos.
- **Actas.** El acta de entrega y la de devolución llevan el mismo QR del equipo.
- **Celular.** La cámara nativa abre la URL; no hace falta un escáner propio para consultar. La hoja de vida se diseña legible a 390 px, con las acciones rápidas Entregar, Devolver y Verificar.
- **Conciliación física.** Acción "Verificar" en la hoja de vida: RPC `verificar_equipo(p_equipo_id, p_ubicacion_id default null, p_nota default null)` (guard `modulo:equipos`) que escribe el evento `verificado` en `eventos_equipo` con actor y fecha. Vista `v_equipos_sin_verificar` (más de 180 días sin verificación, valor en `config_parametros`) y su KPI. Segunda etapa opcional: escáner dentro de la app (`BarcodeDetector` donde exista, con ingreso manual de respaldo) para recorrer un almacén escaneando en serie.
- **Dependencia nueva, justificada.** Una librería de QR que renderice SVG (por ejemplo `qrcode`, pequeña y sin dependencias). Generarlo a mano no es viable y el SVG imprime nítido. Se genera en el navegador; el código no se envía a ningún servicio externo.
- **Riesgos.** Una etiqueta pegada en un equipo ya entregado solo revela el mensaje público: sin sesión no hay datos. Una etiqueta falsificada apunta a otro equipo, no a información sensible. Impresión masiva inicial: probar primero con 10 equipos para validar tamaño y lectura.
- **Verificación.** Test de render del componente `EtiquetaEquipo` (el SVG codifica exactamente la URL esperada), test del router (`/e/:codigo` sin sesión no llama a la API), regla de `patrones-ui.mjs` que prohíbe `qrcode`/`toDataURL` hacia dominios externos.

### 3.7 Actas firmadas en físico (decidido por el dueño, 2026-10-01)

Las actas se firman en papel. El flujo es: imprimir o descargar el PDF desde la ruta imprimible, firmar, escanear o fotografiar, y **subir el PDF firmado al expediente del empleado**, enlazado a la asignación que lo originó.

- **Tabla `actas`** (migración 110): `id`, `asignacion_equipo_id fk`, `tipo check (entrega|devolucion)`, `empleado_id fk`, `equipo_id fk`, `pdf_key`, `tamano_bytes`, `sha256`, `firmado_at date`, `subido_por`, `created_at`, `deleted_at`. Una fila por documento firmado; `unique(asignacion_equipo_id, tipo) where deleted_at is null`. Evento `acta_adjuntada` en `eventos_equipo` y en `empleado_eventos`.
- **Bucket `actas-firmadas`, privado.** Key `actas/<empleado_id>/<asignacion_id>-<tipo>.pdf`. Solo se accede con URL firmada (misma mecánica que los adjuntos de tickets, 110). Nunca público: contiene nombre, DNI y firma.
- **Subida**: acción `subirActa` en la edge function `equipos-fotos` (que ya exige sesión, staff activo y módulo `equipos`): valida magic bytes `%PDF-`, tope 10 MB, calcula sha256, escribe la fila de `actas` y el evento en la misma llamada; acepta también JPEG/PNG (foto del acta) convertido a PDF en el navegador antes de subir. Rate-limit 30 por usuario y 10 min.
- **Dónde se ve**: en la fila de "En custodia" del expediente ("acta firmada ✓" enlaza al PDF; sin acta: "Adjuntar acta firmada" como enlace de texto), en el kardex de la hoja de vida (columna REF) y en el pendiente "Acta sin adjuntar" del Inicio para entregas de más de 3 días laborables sin acta (parámetro en `config_parametros`).
- **Retención**: el PDF se conserva mientras exista el expediente; al anonimizar al empleado (104) el acta **no** se borra ni se anonimiza (es documento legal firmado), pero deja de ser accesible desde la UI y se registra en `docs/PROTECCION-DATOS.md`.
- **Verificación**: test de la function con un PDF de fixture y uno falso; test de render del expediente con y sin acta.

### 3.8 Tags, sellos y prioridad: mapa único de tonos (decidido por el auditor a pedido del dueño)

Un solo módulo `core/tonos.js` exporta el mapa semántico; `core/badges.js`, `AppTag`, `AppSello`, `AppKpi`, `AppPortal`, `DashboardView`, `ActividadView`, `TicketTimelineUnificado` y `AppNotifications` lo consumen (cierra V2 §4.2 "un solo mapa de tonos"). El tono dice **qué tiene que hacer quien lo lee**, no de qué entidad es:

| Tono | Significado | Estados que lo usan |
|---|---|---|
| `amber` (fondo 50, texto 800) | requiere acción de TI | ticket `abierto`, `reabierto`; licencia por vencer; cuenta con rotación pendiente; equipo sin devolver; alta a medias; empleado `Suspendido` |
| `sky` (fondo 50, texto 800) | TI está trabajando | ticket `en_progreso`; problema `diagnostico`, `acciones`; equipo `en_reparacion`; solicitud `abierta` |
| `violet` (fondo 50, texto 800) | esperando a un tercero | ticket `en_espera_usuario`, `resuelto` (esperando conformidad); cambio `propuesto` |
| `green` (fondo 50, texto 800) | terminado bien / vigente | ticket `cerrado`; solicitud `completada`; equipo `operativo` libre; empleado `Activo`; KB `publicado`; cuenta vigente; licencia perpetua o vigente |
| `neutral` (fondo gray-100, texto gray-700) | terminal neutro o inactivo | ticket `rechazado`; solicitud `cancelada`; empleado `Inactivo`; equipo `de_baja`; KB `borrador`, `en_revision`, `obsoleto`; cambio `cancelado` |
| `red` (fondo 50, texto 800) | pérdida, vencimiento o urgencia | equipo `perdido`; licencia `vencida`; reloj `vencido`; prioridad `urgente`; cambio `revertido` |
| `teal` (fondo 50, texto 800) | categoría, no estado | tipo de cuenta (personal / reutilizable / compartida), nivel N1–N3, tipo incidente / solicitud, tipo de ubicación, tipo de cambio |

Reglas: un estado de ticket y una prioridad nunca comparten tono (prioridad `baja/media/alta` = `neutral` en texto, `urgente` = `red`; cumple la regla 24). Severidad de problemas usa la misma escala que prioridad. Ningún tono nuevo: son los seis de la paleta más el neutro. Tipografía: `AppTag` 20 px, `text-[11px] font-medium`, **sentence case** ("En progreso", "Por vencer"), `rounded-md`, sin ícono ni punto en estados; prioridad y severidad en `font-semibold uppercase tracking-wider` dentro del mismo `AppTag`; `AppSello` (terminales en carátulas e impresión) 11 px `font-semibold uppercase tracking-wider`, borde 1 px del tono, sin fondo, `rounded-sm`. En impresión todos los tags se vuelven texto con el borde; el color no es el único portador de significado (texto siempre presente; regla de accesibilidad vigente). Test unitario: cada estado de `core/dominio-*.js` tiene un tono asignado y ninguno queda en el tono por defecto.

### 3.9 Móvil: solo lo necesario (decidido por el dueño)

Versión a 390 px **sí** para: Inicio (lectura y abrir el detalle), Triage y detalle de ticket (leer, asignarme, comentar, pedir información, marcar resuelto), hoja de vida del equipo abierta por QR (leer, Entregar, Devolver, Verificar, adjuntar acta por foto), expediente del empleado (lectura), portal público completo. **No** se diseña móvil para: importación de equipos, reportes y PDF, configuración y staff, formularios largos de licencia y equipo (edición completa), constructor de encuestas, accesos sensibles. En esas pantallas el móvil muestra la hoja a tamaño completo con el aviso "Esta pantalla está pensada para escritorio" y las acciones de lectura que quepan. Regla en `patrones-ui.mjs`: toda vista con `meta.movil: false` en el router declara ese aviso; todo lo demás pasa la prueba de 390 px de `SISTEMA-DISENO` §7.

### 3.10 DNI (decidido por el auditor a pedido del dueño)

- **Panel (staff con sesión)**: DNI completo en la carátula del expediente y en el formulario; es el identificador de la persona y se necesita para WhatsApp y actas. No se muestra como columna en listados (se busca por él, no se lee en masa). Registro de actividad y `accesos_log` nunca lo guardan.
- **Impresos**: en el **acta de entrega y devolución** va completo, porque la persona firma identificándose con él (documento legal). En **reportes, hoja de vida impresa y etiquetas** va enmascarado: `****8912`.
- **Portal público**: nunca se muestra; solo se escribe para buscar. La respuesta de `buscarPorDni` no lo devuelve (ya es así).
- **Exportaciones CSV**: enmascarado por defecto; completo solo con la opción "Incluir DNI" reservada a JEFE y auditada en `accesos_log` como `exportacion` (valor nuevo en el CHECK, migración 101).
- Al anonimizar (104), `ANON-<hash>` en todos lados.

### 3.11 Unificación `Modal.vue` → `AppDialog.vue` (decidido por el dueño)

`AppDialog` (sobre PrimeVue Dialog, coherente con la estrategia Unstyled) absorbe lo que `Modal` tiene y él no: prop `lateral` (drawer), `confirmarCierre`/`estaSucio` (guard de datos sin guardar), evento `cerrado` en todo cierre, y las clases `.modal-*` de `componentes.css` pasan al preset `pt/dialog.pt.js`. Los 25 consumidores de `Modal` migran por módulo junto con su rediseño (Tickets primero, V2 §4.3), `Modal.vue` se elimina al terminar y `patrones-ui.mjs` marca cualquier `<Modal` como hallazgo. Los tests de render de `Modal` (foco atrapado, Escape, `aria-modal`) se portan a `AppDialog` antes de borrar nada.

---

## 4. Dominio: modelo objetivo (migraciones 099–110)

Todas siguen el patrón de 038/086/093; guards con `exigir_permiso()` → `42501`; fechas con `(now() at time zone 'America/Lima')::date`.

### 099 — Permisos: una sola regla

```sql
create or replace function public.puede(p_user uuid, p_permiso text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_rol text; v_activo boolean;
begin
  if p_user is null then return false; end if;
  select rol, activo into v_rol, v_activo from staff where user_id = p_user;
  if not coalesce(v_activo, false) then return false; end if;      -- staff inactivo: nada
  if p_permiso = 'staff:activo' then return true; end if;
  if p_permiso = 'rol:jefe' then return v_rol = 'JEFE'; end if;
  if v_rol = 'JEFE' then return true; end if;                       -- atajo JEFE (hoy solo en TS)
  if p_permiso like 'modulo:%' then
    return exists (select 1 from staff_modulos_permisos where staff_user_id = p_user and modulo = substr(p_permiso, 8));
  end if;
  if p_permiso like 'acceso_sensible:%' then
    return exists (select 1 from accesos_sensibles_permisos where staff_user_id = p_user and acceso_id = substr(p_permiso, 17)::uuid);
  end if;
  return exists (select 1 from staff_permisos where staff_user_id = p_user and permiso = p_permiso);  -- 'credenciales.ver'
end $$;
-- EXECUTE solo project_admin (lo invocan las edge functions por RPC con el user id del JWT)
-- puede_actual(p_permiso) := puede(auth.uid(), p_permiso), EXECUTE a authenticated (RLS y RPC)
-- exigir_permiso(p_permiso): raise exception 'No autorizado' using errcode = '42501'
```

- `es_staff()`, `es_jefe()`, `tiene_permiso_modulo()` se conservan como wrappers (no se reescriben 126 policies de golpe); las nuevas y las que se toquen usan `puede_actual('modulo:x')`, que ya incluye activo + JEFE.
- Edge functions: `tienePermisoModulo` (`credenciales.ts:370-379`, `equipos-fotos.ts:135-144`) y `tienePermisoCredenciales` (`credenciales.ts:348-357`) pasan a `rpc('puede', {p_user, p_permiso})`, fail-closed. La invariante 4/5 de AGENTS.md pasa de "escrita dos veces" a "escrita una vez, leída de dos formas". Se borra el test de sincronía huérfano (C21-DOC-002).
- Huecos: `empresas` INSERT/UPDATE gate `empleados` (DELETE JEFE, SELECT abierto porque se embebe); `kb_registrar_feedback` gate `base_conocimiento`; UPDATE de `kb_articulos` con `puede_actual` (hoy sin `es_staff()`); `ticket_token_existe` valida la forma del token (24 chars base64url) antes de consultar y se documenta como riesgo aceptado (144 bits); `categorias_ticket`/`ubicaciones`: lectura `es_staff()`, escritura gateada por `tickets`/`equipos`, DELETE JEFE (cierra la decisión pendiente C13); trigger en `staff` que impide desactivar al único JEFE con permiso sobre un acceso sensible (RPC `transferir_permiso_acceso_sensible`). Fuera de migración: borrar el usuario de auth sin `staff` (C21-DAT-001).

### 100 — Integridad concurrente y CHECKs

| Hoy | Cambio |
|---|---|
| `check_asignacion_equipo` (`013:253-258`) cuenta activas sin bloqueo | `create unique index asignaciones_equipo_una_activa on asignaciones_equipo (equipo_id) where fecha_fin is null`; el trigger queda para el mensaje legible |
| `check_reutilizable_exclusividad` (`041:28-34`), `check_tope_licencia` (`011:139-144`) con `count(*)` | `perform 1 from cuentas/licencias where id = … for update;` al inicio del trigger |
| `check_tope_licencia_cuenta` (`011:167-195`, `limit 1` sin orden) | `min(cantidad)` y `for update`; documentar que una cuenta login de 2+ licencias toma el tope más restrictivo |
| `asignaciones_equipo.motivo_cierre` texto libre (cliente escribe `'movimiento'`, `'entrega a empleado'`, `'devolucion'`, `'perdida'`: `equipos.js:208,269,293,301`) | normalizar a snake_case y CHECK (`devolucion`, `movimiento`, `entrega_a_empleado`, `perdida`, `robo`, `baja_equipo`, `baja_empleado`) |
| `MAX_FOTOS=4` solo en `EquipoForm.vue:106` y `equipos-fotos.ts:80` (fail-open) | `equipos_fotos_max check (jsonb_array_length(coalesce(fotos,'[]')) <= 4)` |
| `password_cambiada` decidido en cliente (`cuentas.js:74-78`, `correos.js:146-150`, `accesosSensibles.js:79-80`) | trigger `cuentas_password_cambio` BEFORE UPDATE: si `password` cambia → `last_password_change=now()`, `requiere_rotacion=false`; si no, conserva ambos. Ídem `licencias.clave`. El cliente deja de mandar esas columnas |
| `encuestas`/`encuenta_rondas.created_by` sin trigger (D-08) | `set_created_by_only()` |
| `realtime.publish()` dentro de la transacción (anexo D §8) | `begin … exception when others then raise warning …; end;` en `notify_list_changed`, `notify_ticket_estado`, `crear_notificacion` |
| `sync_equipo_tiene_asignacion_activa` pisa `updated_by` (085) | `set_created_updated_by()` conserva `old.updated_by/updated_at` cuando `pg_trigger_depth() > 1` |
| `empleados.dni` sin CHECK | `check (dni ~ '^[0-9]{8}$' or dni like 'ANON-%')` |
| Transición de problemas solo en `ProblemaDetalleView.vue:108-113` | `transiciones_problema_permitidas` + `check_transicion_problema` (patrón 050): `abierto→diagnostico→acciones→cerrado`, `cerrado→abierto` (JEFE, motivo) |

### 101 — RPC transaccionales

| RPC | Firma | Reemplaza | Guard |
|---|---|---|---|
| `crear_cuenta_asignada` | `(p_plataforma_id, p_usuario, p_password_cifrada, p_url, p_notas, p_tipo_cuenta, p_empleado_id) returns asignaciones_cuenta` | `cuentas.js:24-60` (3 escrituras) | `modulo:correos`; el cifrado sigue viniendo de `credenciales.encrypt` (el CHECK 086 rechaza texto plano) |
| `traspasar_cuenta` | `(p_asignacion_id, p_nuevo_empleado_id, p_notas, p_password_cifrada default null)` | `cuentas.js:94-130` (4 escrituras; si falla la 3.ª la cuenta queda sin titular) | `modulo:correos`; `for update` sobre la cuenta; rechaza `personal` |
| `cerrar_asignacion_cuenta` | `(p_asignacion_id, p_notas)` | UPDATE directo; `revocar_cuenta_personal` (077/086) delega la parte común | `modulo:correos` |
| `asignar_equipo` | `(p_equipo_id, p_empleado_id, p_condicion_entrega) returns asignaciones_equipo` | `equipos.js:260-282` | `modulo:equipos`; cierra la asignación a ubicación con `entrega_a_empleado` |
| `devolver_equipo` | `(p_asignacion_id, p_condicion, p_motivo, p_a_reparacion bool) returns equipos` | `equipos.js:286-314` | `modulo:equipos`; `perdida` ⇒ `perdido`; `p_a_reparacion` ⇒ `en_reparacion` |
| `mover_equipo` | `(p_equipo_id, p_ubicacion_id)` | `equipos.js:198-219` | `modulo:equipos`; "si lo tiene una persona, devolver primero" se lanza desde SQL |
| `migrar_importacion_equipo(s)` | `(p_fila_id, p_datos jsonb)` / `(p_fila_ids uuid[]) returns jsonb` | `ImportarEquiposView.vue` (3-4 escrituras por fila) | `modulo:equipos`; todo o nada; el lote valida todo antes de escribir y devuelve `bloqueados` (patrón `reasignar_tickets` 093) |
| `crear_licencia_con_cuenta` | `(p_licencia jsonb, p_cuenta jsonb default null) returns licencias` | `LicenciasView` crea el correo "al vuelo" en 2 pasos | `modulo:licencias` **y** `modulo:correos` si viene cuenta |
| `verificar_equipo` | `(p_equipo_id, p_ubicacion_id default null, p_nota default null) returns eventos_equipo` | conciliación física con QR (§3.6); no existe hoy | `modulo:equipos`; amplía el CHECK de `eventos_equipo.evento` con `verificado` y `recepcion_confirmada` |

Además: `accesos_log.accion` gana `revelado_fallido`, `revelado_denegado`, `purga_ejecutada`, `portal_abierto`; trigger `cuentas_log_evento` (CRUD de `cuentas` a `accesos_log` con `cuenta_id`, usuario y plataforma, nunca `password`; patrón `accesos_sensibles_log_evento` 024). Rechazar/reabrir con motivo obligatorio ya lo resuelven 092/093: la tarea es que `useTicketDetalleLogica.js:215-222, 283-287` llame `rechazar_ticket`/`reabrir_ticket` (V2 F3).

### 102 — Ciclo de vida del empleado

| Objeto | Definición |
|---|---|
| `empleado_eventos` | `empleado_id`, `evento` CHECK (`creado`, `estado_cambiado`, `area_cambiada`, `ubicacion_cambiada`, `cargo_cambiado`, `empresa_cambiada`, `contacto_cambiado`, `baja_ejecutada`, `reingreso`, `suspendido`, `reactivado`, `eliminado`, `restaurado`, `accesos_revisados`, `anonimizado`), `campo`, `valor_anterior`, `valor_nuevo`, `user_id`, `user_email`, `rol_actor` (CHECK de 091), `detalle`, `created_at`. Append-only: SELECT `es_staff()`, sin policies de escritura, trigger que rechaza UPDATE/DELETE |
| `transiciones_empleado_permitidas` | `Activo→Suspendido`, `Suspendido→Activo`, `Activo→Inactivo` (`dar_baja_empleado`), `Suspendido→Inactivo`, `Inactivo→Activo` (`reingresar_empleado`); todas `via_rpc` |
| `check_transicion_empleado` BEFORE UPDATE | rechaza cambio de `estado` fuera de la whitelist y, si `via_rpc`, exige `contexto_transaccion.origen='rpc_empleado'` |
| `evento_empleado_cambios` AFTER INSERT/UPDATE | registra cada cambio de las columnas listadas (patrón `evento_ticket_cambios` 091/092) |
| `contexto_transaccion (txid pk, rol, origen)` | generaliza `ticket_contexto_actor` (093): `marcar_contexto(p_rol, p_origen)`, `contexto_actual()`; 093 se adapta con `create or replace` |
| RPC | `suspender_empleado(p_id, p_motivo)` (estado + evento + `requiere_rotacion` en sus compartidas/reutilizables sin cerrar asignaciones + notificación `empleado_suspendido`), `reactivar_empleado(p_id, p_motivo)`, `reingresar_empleado(p_id, p_datos)` (`Inactivo→Activo`, `fecha_alta=hoy Lima`, crea solicitud de alta), `dar_baja_empleado(p_id, p_motivo)` emite `baja_ejecutada` |
| `empleado_revisiones_acceso (empleado_id, revisado_por, revisado_at, resultado jsonb)` + `registrar_revision_accesos` | revisión periódica de accesos (KPI §8) |

Backfill: un evento `creado` por empleado (`created_at = empleados.created_at`, `rol_actor='legado'`, `user_id = created_by`); para los `Inactivo`, `estado_cambiado` con `updated_at` (aproximación documentada).

### 103 — Parámetros y dashboard

- `config_parametros (clave pk, valor jsonb, descripcion, updated_by, updated_at)`: `dias_ventana_alta: 30`, `dias_por_vencer_licencia: 30`, `umbral_recurrencia_tickets: {n:3, dias:30}`, `dias_autocierre_resuelto: 5`, `max_reavisos: 3`. RLS SELECT staff, UPDATE JEFE. Retira los literales de `dominio-empleados.js:44`, `dominio-licencias.js:12-19`, `dashboard.js:125`, `problemas.js:247-271`.
- `dashboard_resumen() returns jsonb` (SD, `es_staff()`): `{ kpis, tickets: {sin_asignar, vencidos, por_vencer, mios[5]}, rotaciones_pendientes[], equipos_sin_devolver[], licencias_por_vencer[], solicitudes_abiertas[], problemas: {acciones_vencidas, recurrentes}, encuestas_sin_responder, custodia_hoy[], errores[] }`; cada sección en `begin … exception` y solo para las que `puede_actual('modulo:x')`; "Todo al día" solo si `errores = []`. Reemplaza `dashboard.js:75,109,189,225`, `pendientesProblemas()`, `altasIncompletas()`.
- Vistas `v_licencias_cupo` (reemplaza el cálculo de `licencias.js:243-296`) y `v_categorias_recurrentes`.

### 104 — Retención, purga y entorno (Ley 29733)

| Objeto | Regla |
|---|---|
| `intentos_publicos (id, ambito, clave, created_at)` + índice `(ambito, clave, created_at desc)` | reemplaza `ticket_busqueda_intentos`, `ticket_creacion_intentos`, `encuesta_respuesta_intentos` (INSERT … SELECT y drop) |
| `config_retencion (tabla pk, dias, accion check in ('borrar','anonimizar','nulificar_columna'), columna, activo)` | `intentos_publicos` 7 d borrar · `contexto_transaccion` 1 d · `entregas` 30 d nulificar `payload` (la fila queda: es auditoría) · `notificaciones` leídas por todos 180 d · `accesos_log` 365 d nulificar `ip, user_agent` (nunca borrar filas) · `empleado_enlaces` vencidos 30 d · `fotos_subidas_pendientes` 1 d |
| `purgar_datos_temporales() returns jsonb` | SD, solo `project_admin`; devuelve conteos; audita `purga_ejecutada`; cron diario `pg_cron` (o `schedules` hacia una acción `mantenimiento` protegida por secret, misma vía que 098) |
| `anonimizar_empleado(p_id, p_motivo)` | JEFE; solo `Inactivo` ≥ N años (configurable); nombres → "Empleado anonimizado", `dni` → `'ANON-' || left(encode(sha256(dni::bytea),'hex'),12)` (conserva unicidad y detecta reingreso), contacto/notas → null, `tickets.contacto_ingresado` → null; **el historial de asignaciones se conserva íntegro**; `empleados.anonimizado_at` + evento |
| `entorno (id check (id=1), nombre check in ('produccion','branch'))` | en producción se inserta `produccion` una vez; `scripts/preparar-branch.mjs` lo pone en `branch`; `scripts/anonimizar.sql` aborta si no es branch |
| `docs/PROTECCION-DATOS.md` | inventario de datos personales por tabla, base legal, plazos, quién ejecuta la anonimización: lo que la LPDP exige poder mostrar |

### 105 — Horario laboral, OLA y KPIs

| Objeto | Definición |
|---|---|
| `horario_laboral (dia_semana 1..7 pk, inicio, fin, activo)` | default lun–vie 08:00–18:00, sáb 08:00–13:00 (confirmar); editable por JEFE |
| `dias_no_laborables (fecha pk, motivo)` | feriados nacionales 2026–2027 sembrados |
| `minutos_laborables_entre(p_desde, p_hasta) returns integer` | STABLE, itera por días en `America/Lima`; tests SQL con feriado y fin de semana |
| `config_tiempo_atencion.modo_reloj` (`corrido`/`laboral`, default `laboral`) y `minutos_primera_respuesta` (OLA 1 h urgente / 4 h alta / 8 h media / 24 h baja) | A1 pasa a horas laborables; cierra N2 |
| `config_parametros.portal_fuera_de_horario` (`cerrado` por defecto, `aviso` como alternativa) + RPC `mesa_abierta() returns jsonb` (`{abierta, proximo_inicio}`) ejecutable por anon | **El horario laboral cierra la mesa de ayuda** (decisión del dueño): fuera de horario `/soporte/nuevo` muestra "Mesa de ayuda cerrada · abre lunes 08:00" y no acepta tickets (`crear_ticket_publico` lo rechaza con `fuera_de_horario`, también para quien llame a la function directo); `/soporte/buscar` y `/soporte/:token` siguen abiertos (consultar no es atender); el staff con sesión siempre puede crear tickets internos. Con `aviso`, el portal registra igual y avisa que se atiende el siguiente día hábil. El reloj de atención no corre fuera de horario en ningún caso |
| `estado_tiempo_ticket(t)` (094) reescrita | mismo tipo de retorno + `primera_respuesta_estado`; descuenta pausas; mide con `minutos_laborables_entre` si `laboral`; la consume la vista 096 sin cambio de firma |
| `tickets.primera_accion_tecnico_at` | trigger: primera vez que `ultima_accion_tecnico_at` pasa de null |
| `tickets.tiempo_consumido_min`, `vencido_al_resolver` | congelados por el trigger de transición a `resuelto`: el KPI no se recalcula contra una configuración que cambie después |
| `ticket_eventos.evento` + `aviso_usuario_enviado`; RPC `registrar_aviso_usuario(p_ticket_id, p_canal)` | el autocierre de 098 cuenta desde este evento (§10, A5) |
| `revisar_tiempos_atencion()` (098) | usa `minutos_laborables_entre` para no reavisar fuera de horario |
| Vistas `v_kpi_tickets_resueltos`, `v_kpi_reaperturas_mes`, `v_kpi_cumplimiento`, `v_kpi_csat`, `v_kpi_volumen`, `v_backlog_tramos`, `v_pendientes_rotacion`, `v_pendientes_devolucion`, `v_kpi_revisiones_acceso`, `v_kpi_kb`, `v_kpi_solicitudes`, `v_kpi_cambios` | `security_invoker` si Postgres ≥ 15 en InsForge (verificar); si no, RPC con guard `puede_actual('modulo:tickets')`. `reporte_tickets()` se reescribe como composición de estas vistas (F5) |

### 106 — KEDB: KB ↔ Problemas ↔ Tickets

`problemas.workaround`, `error_conocido bool`, `kb_articulo_id`; `kb_articulos.tipo` CHECK (`solucion`, `workaround`, `procedimiento`) y `problema_id`; `ticket_kb_usos (ticket_id, kb_articulo_id, user_id, created_at)` ("este artículo se usó para resolver este ticket"); `check_problema_cierre` (033) ampliado: cerrar con `error_conocido` exige `workaround` o `causa_raiz`; RPC `publicar_workaround_problema(p_problema_id)` (crea/actualiza el artículo tipo `workaround` y enlaza ambas FK) y `crear_kb_desde_ticket(p_ticket_id)` (exige `nota_resolucion`, copia `sintoma=descripcion`, `solucion=nota_resolucion`; reemplaza `stores/ticketDetalle.js:103-110`, cierra U-05). La recurrencia de `problemas.js:247-271` pasa a `v_categorias_recurrentes`.

### 107 — Catálogo de servicios y registro mínimo de cambios

- `servicios (id text pk, nombre, descripcion, dueno_user_id, criticidad check (baja|media|alta), horario check (laboral|24x7), activo, trazabilidad, deleted_at)`: ≤ 15 filas (Correo, Bitrix24, VPN, ERP, Internet/red, Equipos de cómputo, Impresión, Telefonía, Licencias de diseño…). FK opcionales `servicio_id` en `categorias_ticket`, `plataformas`, `licencias`, `tipos_equipo`.
- `cambios (id, codigo CHG-####, titulo, tipo check (estandar|normal|emergencia), riesgo check (bajo|medio|alto), servicio_id, descripcion, plan_retroceso not null salvo estandar, ventana_inicio/fin, estado check (propuesto|aprobado|en_ejecucion|implementado|revertido|cancelado), solicitado_por, aprobado_por, aprobado_at, ticket_id, problema_id, resultado, trazabilidad, deleted_at)` + `cambio_eventos` (append-only) + `transiciones_cambio_permitidas`. Trigger: `normal`/`emergencia` solo pasan a `aprobado` si `es_jefe()`; `emergencia` puede ejecutarse sin aprobación pero exige `aprobado_por` antes de `implementado` (≤ 48 h); `estandar` nace aprobado.
- `schema_migrations.cambio_id`, `function_deploys.cambio_id`: `scripts/deploy.mjs --cambio CHG-00xx` obligatorio para `normal`/`emergencia`.

### 108 — Solicitudes de servicio (distintas del Ticket-incidente)

**Por qué**: el alta vive repartida en 4 módulos sin nada que garantice completarla (PANORAMA §7); la baja es atómica pero no deja checklist de equipos pendientes; `tickets.tipo='solicitud'` solo clasifica. `pasosAlta()` y `altasIncompletas()` (`core/dominio-empleados.js:44-104`) son una heurística de cliente de 30 días.

| Tabla | Columnas clave |
|---|---|
| `solicitud_tipos` | `id text pk` (`alta_empleado`, `baja_empleado`, `cambio_puesto`, `acceso_nuevo`, `entrega_equipo`, `devolucion_equipo`, `licencia`), `nombre`, `modulo_responsable`, `activo` — catálogo cerrado |
| `solicitud_plantilla_pasos` | `tipo_id`, `orden`, `clave` (`registrar_empleado`, `crear_cuenta`, `entregar_credenciales`, `asignar_equipo`, `asignar_licencia`, `cerrar_accesos`, `devolver_equipo`, `rotar_contrasenas`…), `label`, `obligatorio`, `referencia_tipo` — ≈ 20 filas |
| `solicitudes` | `codigo SOL-####` (secuencia propia), `tipo_id`, `empleado_id`, `estado check (abierta|completada|cancelada)`, `ticket_id null`, `datos jsonb`, `creada_por`, `completada_at`, `cancelada_at`, `motivo_cancelacion`, trazabilidad, `deleted_at` |
| `solicitud_pasos` | `solicitud_id`, `orden`, `clave`, `label`, `obligatorio`, `estado check (pendiente|hecho|omitido)`, `referencia_tipo`, `referencia_id`, `hecho_por`, `hecho_at`, `nota`; `unique(solicitud_id, clave)` |

RPC y triggers: `crear_solicitud(p_tipo, p_empleado_id, p_datos)` (guard `modulo:empleados`; copia los pasos; si es alta y no hay empleado, lo crea en la misma transacción); `completar_paso_solicitud(p_paso_id, p_referencia_id, p_nota)` (valida que la referencia pertenezca al empleado); `omitir_paso_solicitud` (solo no obligatorios); trigger `solicitud_auto_completa`; **auto-marcado** por triggers AFTER INSERT en `asignaciones_cuenta`, `entregas` (`viewed_at`), `asignaciones_equipo`, `asignaciones_licencia`: el staff sigue usando los módulos de siempre y el checklist se llena solo; `dar_baja_empleado` crea la solicitud `baja_empleado` con `cerrar_accesos` (hecho en la misma tx), `rotar_contrasenas` (uno por cuenta con `requiere_rotacion`) y `devolver_equipo` (uno por asignación activa), reemplazando el checklist cosmético de `BajaEmpleadoModal`; `tickets.solicitud_id` + `convertir_ticket_en_solicitud(p_ticket_id, p_tipo)`; al completarse, el ticket pasa a `resuelto` con `nota_resolucion` autogenerada. RLS: SELECT `es_staff()`; escritura solo por RPC; DELETE JEFE. Entra por tres puertas: "Nuevo empleado" (persona + solicitud de alta), el portal (si el dueño confirma que RRHH o jefes de obra piden altas por ahí) y "Dar de baja". La cola de Solicitudes es la misma tabla de Tickets con el tipo fijado y una columna "Trámite · pasos 2/4". Retira `altasIncompletas()` y `DIAS_VENTANA_ALTA`.

### 109 — Identidad ligera del empleado en el portal (sin login)

| Riesgo | Mitigación | Residual |
|---|---|---|
| El enlace por WhatsApp es un *bearer token*: quien lo reciba o reenvíe es el empleado | 144 bits (patrón `entregas`), `token_hash` sha256, vigencia 7 d (1..30), revocable desde la ficha, un enlace activo por empleado, rate-limit por IP y por token, audit `portal_abierto` | medio-bajo: el alcance nunca incluye contraseñas |
| Enumeración | token no adivinable; `no_existe`/`expirado` con el mismo cuerpo y tiempo | bajo |
| Exposición | solo nombre, equipos (código, tipo, fecha, condición), accesos (plataforma + usuario, **nunca** contraseña ni URL), tickets activos | bajo |
| Suplantar confirmación de recepción | queda `ip`/`user_agent`/`token_id`; el acta impresa sigue para equipos de alto valor | aceptado |

Vale la pena por una razón concreta: los equipos se entregan en obra y hoy la firma es un acta impresa; una confirmación digital de recepción cierra el hueco "equipo asignado que el empleado dice que nunca recibió" y le da al empleado su inventario personal sin crear 100 cuentas. Se hace **después** del bucket privado y los rate-limits, y nunca antes que 102.

`empleado_enlaces (id, empleado_id, token_hash unique, alcance text[] ⊆ {ver_accesos, ver_equipos, confirmar_equipo, confirmar_ticket}, expires_at, created_by, revocado_at, usos, ultimo_uso_at, ultimo_ip)`; `asignaciones_equipo.confirmado_por_empleado_at`, `confirmacion_enlace_id`; evento `recepcion_confirmada` en `eventos_equipo`. RPC `portal_emitir_enlace(p_empleado_id, p_dias, p_alcance)` (staff con `modulo:empleados`; devuelve el token una vez; audita `enviar`), `portal_abrir(p_token_hash)` (solo `project_admin`), `portal_confirmar_equipo(p_token_hash, p_asignacion_id)` (marca `contexto_transaccion('usuario','portal')`), `portal_confirmar_cierre(p_token_hash, p_ticket_id)` (delega en `confirmar_cierre_usuario` 093). Edge function `functions/portal.ts` (`abrir`, `confirmarEquipo`, `confirmarCierre`; sin sesión; rate-limit IP y token 20/10 min; todas las lecturas por RPC). Ruta pública `/mi/:token` sobre `AppPortal`: "Equipos a su cargo", "Confirmar recepción".

### 110 — Adjuntos privados

`tickets-adjuntos` → `public=false`; key nueva `tickets/<ticket.id>/captura.<ext>` (hoy `<token>/…`, `tickets.ts:317`, expone el token de seguimiento en la URL del objeto); `scripts/migrar-adjuntos.mjs` (copy → update → remove) para los 73 objetos actuales, registrado como cambio `estandar`; `seguimiento` devuelve `adjuntoUrl` **firmada** (verificar `createSignedUrl` en `@insforge/sdk@1.5.2`; si no existe, acción `adjunto` que hace stream con `Content-Disposition` tras validar token); `adjuntoStaff` con sesión + `puede('modulo:tickets')`. `equipos-fotos` sigue público (fotos de hardware, key uuid; se documenta). En la misma migración: tabla `actas` y bucket privado `actas-firmadas` (§3.7), evento `acta_adjuntada` en `eventos_equipo` y `empleado_eventos`, y la acción `subirActa` en la function `equipos-fotos`.

---

## 5. Edge functions

- **Helpers compartidos sin imports en runtime.** `functions/_shared/`: `cors.ts`, `http.ts` (`respuesta`, `uno`, `ipDesdeHeaders`), `auth.ts` (`staffDeSesion` **fail-closed**: error → 401; hoy `tickets.ts:186-201` degrada a público), `permisos.ts` (`puede()` vía RPC), `imagenes.ts` (`sniffImagen`, `stripExif`), `ratelimit.ts` (`excedeLimite(ambito, clave, max, ventanaMin)` sobre `intentos_publicos`), `errores.ts`. `scripts/build-functions.mjs` inlina textualmente cada `// @inline _shared/x.ts` en `functions/dist/<nombre>.ts`; `deno check`, los tests `functions-handler*` y el deploy corren sobre `dist/`; CI falla si `dist/` no coincide con el build. Por qué no `deno bundle`/esbuild: deprecado en Deno 2, y el pin `npm:@insforge/sdk@1.5.2` debe quedar como import externo; un inliner de 40 líneas es más auditable para la pieza que cifra contraseñas. Alternativa (peor): mantener la duplicación con `tests/functions-paridad.test.js` por hash.
- **Rate-limits faltantes** (anexo A §1): `entregaAbrir` IP 10/10 min (también cuentan `no_existe`/`expirada`); `seguimiento` 60; `encuestaEstado`/`encuesta` 30; `catalogo` 60; `subirFoto`/`eliminarFoto` 30 por usuario; `portal.*` 20 por IP y por token; `crear` público también por **DNI** 5/10 min.
- **Cifrado**: `decryptAny` (`credenciales.ts:183`) lanza `formato_desconocido` en vez de devolver texto plano; descifrado fallido (`:190-191, 216`) responde `{ok:false, code:'error_descifrado'}` 500 y audita `revelado_fallido`; los 403 auditan `revelado_denegado` (cierra CREDENCIALES-REVELADO-DENEGADO-SIN-AUDITAR).
- **`crear` público**: ignora `equipoId/cuentaId/licenciaId` sin sesión (`tickets.ts:368-370`); pasa a RPC `crear_ticket_publico(p_datos)` (ticket + evento + intento en una transacción; cierra el fail-open de `ticket_eventos`, `:179-183`); `vinculado` se conserva (el empleado necesita saber que se equivocó de DNI) pero el mensaje deja de distinguir inexistente de inactivo.
- **`eliminarFoto`** (`equipos-fotos.ts:263-269`): exige `equipoId` y que la key esté en `equipos.fotos` de ese equipo o fue subida por el mismo usuario hace < 1 h (`fotos_subidas_pendientes`).
- **EXIF**: `stripExif(bytes, mime)` para JPEG (segmentos APP1/APP2), PNG (chunks `eXIf`, `tEXt`, `iTXt`, `zTXt`) y WebP (chunk `EXIF`), ≈ 60 líneas con fixtures, aplicado en `crear` y `subirFoto`.
- Acción pública `ping` en las 4 functions (sin DB) para el healthcheck (§7).

---

## 6. Frontend

- **Capa única de traducción de errores** (`api/erroresDb.js`; hoy solo mapea `23505` + un índice, anexo E §6): `traducirErrorDb(error, {entidad}) → {mensaje, tipo, codigo}` con `42501` → "No tiene permiso para esta acción." + `registrarAccesoDenegado`; `P0001` → texto del `raise` tal cual (desde 093 son mensajes de usuario; regla nueva `scripts/patrones-sql.mjs` rechaza tuteo en `raise exception`); `P0002` → "El registro ya no existe."; `23505`/`23514` → tabla de constraints a texto (`uq_cuentas_usuario_plataforma`, `empleados_dni_key`, `equipos_codigo_key`, `asignaciones_equipo_una_activa`, `equipos_fotos_max`…); `23503` → según `details`; `PGRST116` → "No encontrado."; `PGRST301`/401 → "La sesión expiró" + `auth.cerrarSesion()`; `Failed to fetch` → banner de `core/error-red.js` (hoy solo cubre functions). Integrada en `crearStorePaginado`, `useFormularioModal` y `crearInvocador`; regla `error-crudo` en `patrones-ui.mjs`.
- **`dashboard_resumen()`**: una llamada al aterrizar; carga por sección con `Promise.allSettled` a nivel de render (V2 §2.3).
- **Reportes**: `reportesTickets.js:61-200` (lotes de 30 ids, `MAX_COMENTARIOS=20`, T-04 sin cota) → `reporte_tickets()` jsonb (F5); `ReporteTicketsModal.vue`, `reporte.js` y el CSV consumen el mismo jsonb.
- **Registro único de módulos**: `core/modulos.js` exporta `MODULOS [{id, label, path, icon, grupo}]`; `navegacion.js:42-61` y `StaffModulosForm` lo consumen; `tests/modulos-unicos.test.js` compara los 8 ids con un fixture del CHECK de 056.
- **Máquinas de estado desde la base**: `stores/catalogos.js` carga `transiciones_{ticket,problema,empleado}_permitidas` al iniciar sesión; `core/maquinas.js` → `transicionesDesde(tabla, estado, {esJefe})` → botones disponibles; se retiran las listas a mano de `dominio-tickets.js`, `useTicketDetalleLogica.js:176-183`, `ProblemaDetalleView.vue:108-113`. El servidor sigue siendo la barrera.
- **God-components** (junto con el rediseño de cada vista): `EquiposView.vue` (1183) → vista + `EquiposTabla` + `EquipoAccionesModales` (sobre las RPC de 101) + `useEquiposAcciones` + hoja de vida en ruta; `TicketsView.vue` (870) → vista + `TicketsTabla` + panel + `useTicketsSeleccion` (lote → `reasignar_tickets`); `LicenciasView.vue` (812) → `LicenciaForm` sobre `crear_licencia_con_cuenta` + `useLicenciaCupos` (lee `v_licencias_cupo`); `ImportarEquiposView.vue` (780) → `ImportarPegado` / `ImportarMapeo` / `ImportarBandeja` + `core/importacion-equipos.js` (parsing puro). Regla: ningún `.vue` > 400 líneas.
- Duplicaciones residuales del anexo E §8: stores `empresas`/`plataformas` sobre `crearCatalogoStore`; un `useCopiar()` para los ≥ 6 "copiado 1500 ms"; `ESTADOS_VIGENTES` como única lista de exclusión; `pendientesTickets()` una sola vez.

---

## 7. Operación y entrega

### 7.1 Resolver el drift ahora (C21-OPS-001..004), orden exacto

1. `git push -u origin rediseno/sistema-visual release/v2 v2/tickets-f1` (se revierte "no subir ramas de trabajo" de `V2-ORGANIZACION.md` §3; ver §10).
2. En `rediseno`: borrar los 2 untracked (`migrations/088`, `docs/PLAN-V2-TICKETS.md`, idénticos a lo commiteado); `git merge origin/main` tomando main en `AGENTS.md`/`README.md`/`credenciales.ts`; borrar `tests/integration/permisos-credenciales-sincronizados.smoke.test.js`. Resultado: secuencia única 001–089.
3. Registrar 086/087/088 en `schema_migrations` (`aplicada_por='reconciliacion-ciclo-21'`); aplicar y registrar 089 con `apply-migration.mjs`.
4. Redesplegar `credenciales` desde el commit del merge y registrar en `function_deploys` (sha256 + commit). Borrar los 2 stashes.
5. PR `rediseno → main`; `main` vuelve a ser producción. `release/v2` se rebasa sobre `main`.
6. Activar backups de plataforma y verificar que `system.database_backups` deje de estar vacío.

### 7.2 Ramas

`main` = producción, protegida (required: `lint-y-typecheck`, `build-y-tests`, `test-integration`, `drift-esquema`; `tests-db` cuando 7.6 funcione). `release/v2` = integración de V2 **en el remoto**, protegida; `v2/<frente>-<tema>` cortas con PR a `release/v2`; `release/v2 → main` por PR al cerrar cada fase aprobada, no al final. Al terminar F5 se elimina `release/v2` y se pasa a trunk. Borrar las 25 ramas del anexo B §7.

### 7.3 `scripts/deploy.mjs` (reemplaza el `deploy-manual` roto y el deploy desde working tree)

```
node scripts/deploy.mjs migracion migrations/0XX.sql [--entorno produccion|v2] [--cambio CHG-0001]
node scripts/deploy.mjs function  credenciales      [--entorno …] [--cambio …]
```
Aborta si: working tree sucio; `HEAD` no contenido en `origin/main` (o `origin/release/v2` con `--entorno v2`); migración no commiteada; `dist/` desactualizado. Hace: `db import` + ejecución e impresión del bloque `-- Verificación`; registra `schema_migrations (version, nombre_archivo, checksum sha256 real, aplicada_por = git user.email, commit_sha, entorno, cambio_id)`; para functions `functions deploy` + `function_deploys (funcion, sha256, commit_sha, desplegado_por, entorno, cambio_id)`. `apply-migration.mjs` queda como alias. La acción `version` compara su propio hash contra `function_deploys` y responde `coincide`.

### 7.4 Backups y restauración probada

Plataforma: diarios, retención ≥ 30 d; alerta si la última fila de `system.database_backups` > 48 h. Externo: `scripts/exportar-respaldo.mjs` semanal (Actions cron, Linux) que exporta cada tabla de negocio vía PostgREST paginado, empaqueta y cifra con `age` (clave privada solo con el dueño), artifact 90 d + copia mensual fuera de GitHub. Un respaldo sin `CRED_KEY_*` es inútil para contraseñas: `docs/CONTINUIDAD.md` documenta dónde viven las claves, RPO 24 h / RTO 4 h. Restauración probada trimestral en una branch con `scripts/verificar-restauracion.sql` (conteos por tabla) y un revelado de prueba con las claves reales.

### 7.5 Entorno de pruebas = branch InsForge anonimizada

`insforge branch create` → `scripts/preparar-branch.mjs` (marca `entorno='branch'`, corre `anonimizar.sql` con su guard, aplica las migraciones del PR) → tests → `branch delete`. Anonimización: `empleados` → "Empleado N", `dni` → `lpad((10000000+rn)::text,8,'0')`, contacto null; `cuentas.usuario` → `usuarioN@ejemplo.test`, `password` null; `licencias.clave` null; `accesos_sensibles` truncate; `entregas.payload` null; textos de tickets/comentarios/KB/problemas → fijos; `accesos_log.ip/user_agent` null.

### 7.6 Drift de esquema en CI y `tests-db` sin el CLI

`scripts/snapshot-esquema.mjs` ejecuta 6 consultas de catálogo ordenadas (pg_policies; pg_trigger; pg_proc de `public` con `prosecdef`, `proconfig`, `md5(prosrc)`, ACL normalizada; pg_constraint; pg_indexes; columns) y escribe `docs/esquema/snapshot.json`. Toda migración que entra por PR actualiza el snapshot desde la branch; job `drift-esquema` (push a `main` + cron diario) toma el de producción con un token de solo lectura y `git diff --exit-code`. Un drift = alguien tocó producción sin migración o una migración commiteada no se aplicó (lo que pasó con 086–089). Transporte sin el bug del CLI (C13-e): (a) el endpoint HTTP que usa `db query` (verificar en `node_modules/@insforge/cli`); (b) `DATABASE_URL` con `pg` desde Node si la plataforma expone conexión directa; (c) runner self-hosted con el CLI logueado (solo para `tests-db`). `scripts/test-db.mjs` usa el mismo transporte, CRLF-safe (TEST-DB-CRLF), bloques nuevos por migración; con `pg` directo puede ejercitar RLS (`set local role authenticated` + claims), cerrando "ninguna prueba automatizada ejercita RLS" (PANORAMA §6). Mientras no exista: gate local `npm run verify:db` en pre-push + checkbox en el PR template.

### 7.7 Observabilidad mínima

Sentry (ya en `main.js:27`) con `release` = commit sha (`VERCEL_GIT_COMMIT_SHA`). `healthcheck.yml` horario: `ping` ×4, `select 1` por 7.6, último backup < 48 h, última migración registrada = última en `migrations/`; en fallo abre o actualiza un issue `incidente` (con 8 usuarios es más honesto que un dashboard). Errores de functions a Sentry por HTTP envelope (≈ 30 líneas en `_shared/errores.ts`), solo `error_interno`, nunca payloads.

---

## 8. Medición: KPIs calculados en la base

| KPI | Fuente / fórmula | Objeto (105) |
|---|---|---|
| MTTR (resolución) | `avg(resuelto_at - created_at)` en horas **laborables**, excluye `rechazado` y duplicados; por prioridad, técnico, categoría, área/obra | `v_kpi_tickets_resueltos` |
| Tiempo a primera respuesta | `primera_accion_tecnico_at - created_at` | ídem |
| FCR | resueltos sin `reasignado`, sin `en_espera_usuario`, sin reapertura, cerrados por el usuario | `v_kpi_tickets_resueltos.fcr` |
| Backlog por antigüedad | tramos 0-3 / 4-7 / 8-30 / >30 días sobre vigentes (hoy 287 tickets ya lo justifica) | `v_backlog_tramos` |
| Reaperturas | `estado→reabierto` con `rol_actor='usuario'` separado de `'jefe'` / resueltos del periodo | `v_kpi_reaperturas_mes` |
| Cumplimiento del tiempo objetivo | `% not vencido_al_resolver` por prioridad y técnico | `v_kpi_cumplimiento` |
| CSAT | `ticket_satisfaccion` vigentes × técnico × empleado; tasa de respuesta y promedio; `MIN_MUESTRA` de `config_parametros` | `v_kpi_csat` |
| Volumen | por empleado / área / obra / categoría / tipo / periodo | `v_kpi_volumen` |
| Rotaciones pendientes y edad | `requiere_rotacion` × `max(asignaciones_cuenta.fecha_fin)` | `v_pendientes_rotacion` |
| Equipos sin devolver y edad | asignación activa × empleado `Inactivo` × fecha de `baja_ejecutada` | `v_pendientes_devolucion` |
| Accesos revisados | % activos con revisión < 180 d | `v_kpi_revisiones_acceso` |
| Valor de la KB | `ticket_kb_usos` por artículo; % resoluciones con artículo | `v_kpi_kb` |
| Solicitudes | tiempo `created_at → completada_at` por tipo; abiertas > 7 d | `v_kpi_solicitudes` |
| Cambios | por tipo; % emergencia; revertidos | `v_kpi_cambios` |

`reporte_tickets()` se reescribe como composición de estas vistas (F5); `reporte_satisfaccion_consolidado` lee `v_kpi_csat`. Ninguna fórmula en cliente.

---

## 9. Hoja de ruta

### Estado de ejecución (2026-10-01, rama local `mejora/h1-estabilizar`)

| Ítem | Estado |
|---|---|
| H1-1 drift | **Parcial.** Hecho en local: `origin/main` mezclado en la rama del rediseño, secuencia 001–089 única, smoke test huérfano eliminado, invariantes 4 y 12. **Falta, con autorización**: publicar ramas (contradice la regla guardada de no subir ramas de trabajo), registrar 086–088 y aplicar 089 en producción, redesplegar `credenciales` desde un commit, borrar stashes y ramas |
| H1-2 backups | **Parcial.** `healthcheck.yml` y `docs/CONTINUIDAD.md` escritos; activar los backups es una acción del panel de InsForge (dueño) |
| H1-3 `deploy.mjs` | Hecho y probado con dependencias falsas y `--dry-run`; el flujo real de aplicar y registrar no se ha ejecutado |
| H1-4 migración 099 + wrappers TS | Hecho en código; **migración sin aplicar** |
| H1-5 migración 100 | Hecho en código; **sin aplicar** (hay un DNI de 9 dígitos que deja el CHECK en `NOT VALID`; ver decisiones) |
| H1-6 `erroresDb.js` | Hecho; faltan enganchar la sesión expirada, el acceso denegado y el banner de red |
| H1-7 módulos únicos | Hecho |
| H1-8 rate-limits y `decryptAny` | Hecho en código; **sin desplegar** |
| H1-9 snapshot y `drift-esquema` | Hecho; el job no se pudo ejecutar en GitHub y su transporte en CI sigue sin resolver (C13-e) |
| H1-10 V2 F2 (096–098) | **No tocado**: pertenece al worktree `sistema-ti-v2` y a su propio checkpoint |
| H1-11 diseño base y `AppDialog` | Hecho; Tickets migrado a `AppDialog`, quedan 23 consumidores de `Modal`; las piezas nuevas aún no están en las pantallas |

**Horizonte 2, avance local (2026-10-01):** hechos y sin aplicar: H2-1 (101), H2-2 (102), H2-3 (103 y Inicio como mesa del día), H2-4 (expediente del empleado, hoja de vida del equipo, actas imprimibles y subida del PDF firmado) y H2-12 (etiquetas QR y verificación). Pendientes: H2-5 (Triage y detalle de ticket: dependen de la fase 3 del plan V2 en su worktree), H2-6 (105, depende de 094), H2-7 (110 adjuntos privados de tickets), H2-8 (`_shared` de functions), H2-10 (rama anonimizada y `tests-db` en CI) y H2-11 (104 retención y purga). Regla del dueño: todo se revisa en local y solo lo revisado va a producción.

**Orden de puesta en producción** (todo requiere autorización explícita del dueño): reconciliar 086–088 → aplicar 104 → 099 → 100 (con el frontend ya desplegado) → desplegar las 4 functions → desplegar el frontend. Antes de 100 hay que corregir el DNI de 9 dígitos (el dueño confirmó que el DNI es solo de 8; es un error de digitación y el CHECK no se amplía), y antes de 099 la sección separable de `categorias_ticket`/`ubicaciones`.


Esfuerzo: S ≤ 2 días · M ≤ 1 semana · L ≤ 3 semanas (1 desarrollador + agentes). "V2" = fase del plan de Tickets; "Diseño" = frente `v2/diseno-*`. Prioridad: H1 completo antes de cualquier H2; dentro de H2, 101/102 antes que F3 (toca las mismas pantallas); 108 es el ítem de mayor valor de negocio y va al final porque necesita 101, 102 y 103 debajo.

### Horizonte 1 — 0 a 30 días (estabilizar)

| # | Ítem | Esf. | Depende de | Encaje |
|---|---|---|---|---|
| H1-1 | §7.1 drift: publicar ramas, merge main↔rediseno, reconciliar 086–089, redeploy desde commit, borrar stashes y ramas | M | — | bloquea todo |
| H1-2 | Backups de plataforma + `healthcheck.yml` | S | H1-1 | — |
| H1-3 | `scripts/deploy.mjs` + columnas de tracking | S | H1-1 | V2 F2 ya lo usa |
| H1-4 | 099 permisos unificados + wrappers TS | M | H1-1 | antes de F2 |
| H1-5 | 100 integridad | S | H1-1 | — |
| H1-6 | `erroresDb.js` + regla `error-crudo` | S | — | Diseño / V2 4.5 |
| H1-7 | Módulos únicos + test | S | — | — |
| H1-8 | Rate-limits + `intentos_publicos` (104 parcial) + `decryptAny`/`revelado_fallido` | S | H1-3 | — |
| H1-9 | Snapshot de esquema + job `drift-esquema` (incluye resolver el transporte) | M | H1-1 | cierra C21-DOC-001 |
| H1-10 | V2 **F2** (096–098) con `puede_actual` en los guards | L | H1-4 | V2 |
| H1-11 | Diseño: `AppCodigo`, `AppSello`, `AppCaratula`, `AppLibro`, `impresion.css`, `core/tonos.js` (§3.8); reglas 14–25 en SISTEMA-DISENO y en `patrones-ui.mjs` (calibradas con excepciones); `AppDialog` absorbe `Modal` (§3.11) y migra el módulo Tickets | M | — | base del rediseño |

### Horizonte 2 — 1 a 3 meses (regla al servidor; ciclo de vida; expedientes)

| # | Ítem | Esf. | Depende de | Encaje |
|---|---|---|---|---|
| H2-1 | 101 RPC transaccionales + auditoría CRUD de cuentas; los dominios las consumen | M | H1-4/5 | modales sobre RPC |
| H2-2 | 102 `empleado_eventos`, máquina de estados, `contexto_transaccion`, revisiones | M | H1-4 | — |
| H2-3 | 103 `dashboard_resumen` + `config_parametros` + transiciones de problemas; **Inicio = mesa del día** | M | H2-2 | V2 2.3 |
| H2-4 | **Expediente del empleado** y **hoja de vida `/equipos/:id`** + actas como ruta imprimible + **actas firmadas subidas al expediente** (§3.7; tabla `actas`, bucket privado, `subirActa`) + migración de los `Modal` de Empleados y Equipos a `AppDialog` | L | H2-1, H2-2, H1-11, H2-7 (bucket privado) | Diseño |
| H2-5 | V2 **F3** (UI del ciclo de vida) con carátula y libro nuevos; **Triage** una lista + panel | L | H1-10, H1-11 | V2 / Diseño |
| H2-6 | 105 horario laboral, OLA, KPIs persistidos, vistas `v_kpi_*`, `aviso_usuario_enviado` | M | H1-10 | cierra N2; base de F5 |
| H2-7 | 110 bucket privado + URL firmada + EXIF + `crear_ticket_publico` | M | H1-8 | — |
| H2-8 | `_shared` + build de functions | S | H2-7 | — |
| H2-9 | Partir `EquiposView`/`TicketsView` (con H2-4/H2-5) | M | H2-1, H2-5 | Diseño |
| H2-10 | Branch anonimizada + `tests-db` por HTTP/`pg` (+ RLS) | M | H1-9 | — |
| H2-11 | 104 retención/purga completa + `docs/PROTECCION-DATOS.md` | S | H2-2 | — |
| H2-12 | Etiquetas QR (§3.6): ruta pública `/e/:codigo`, componente `EtiquetaEquipo`, impresión por lote, `verificar_equipo`, vista `v_equipos_sin_verificar`; piloto con 10 equipos y luego los 314 | M | H2-4 (la ruta puede salir antes con redirección a `/equipos?q=`), H2-1 | Diseño |

### Horizonte 3 — 3 a 6 meses (dominio nuevo; portal)

| # | Ítem | Esf. | Depende de | Encaje |
|---|---|---|---|---|
| H3-1 | V2 **F4** (atajos, rendimiento) y **F5** (reportes sobre `v_kpi_*`) | L | H2-5/6 | V2 / Diseño |
| H3-2 | 106 KEDB | S | H2-5 | — |
| H3-3 | 108 Solicitudes de servicio + UI (alta/baja guiadas; retiro de `altasIncompletas`) | L | H2-1/2/3 | mayor valor de negocio |
| H3-4 | 107 servicios + cambios; `deploy.mjs --cambio` | M | H1-3 | — |
| H3-5 | 109 portal `/mi/:token` + function `portal` + confirmación de recepción | M | H2-7, H2-2 | Diseño (portal) |
| H3-6 | Partir `LicenciasView`/`ImportarEquiposView`; ningún `.vue` > 400 líneas | M | H2-1 | Diseño |
| H3-7 | Restauración probada #1 + respaldo externo cifrado | S | H1-2, H2-10 | — |
| H3-8 | Anonimización y primera revisión de accesos | S | H2-2, H2-11 | — |

---

## 10. Cuestionamiento de decisiones (aparte de los defectos)

| Decisión | Riesgo que se ve | Propuesta |
|---|---|---|
| **A2** (reloj desde la última acción del TÉCNICO; mensaje visible reinicia) | un "estamos en ello" visible reinicia el reloj sin resolver nada; un solo reloj mezcla alarma operativa con métrica | dos relojes: el **operativo** (094, se reinicia con estado/reasignación/mensaje, es la alarma) y el **de resolución** (`created_at → resuelto_at`, nunca se reinicia, es el KPI). Adoptar N1 (prioridad/nivel no reinician) |
| **A3 + A4** (reaviso cada 50 % mientras siga vencido; escalamiento al doble) | con 8 personas, un ticket vencido de 72 h genera avisos sin fin; en modo corrido, de madrugada | `max_reavisos` (3) en `config_parametros`; después solo escalamiento; nunca fuera de `horario_laboral` |
| **A5 + D2** (autocierre a 5 días corridos; doble cierre con canal manual A9) | **el canal al USUARIO es manual**: si el técnico no manda el WhatsApp, el usuario jamás sabe que debe confirmar; a los 5 días se cierra "automáticamente" y la encuesta se genera sin que nadie la vea; D2 queda como teatro y el CSAT se sesga | el reloj de A5 arranca con `aviso_usuario_enviado`, no con `resuelto_at`; sin aviso en 2 días laborables, reaviso **al técnico**; 5 días **laborables** |
| **A8** (otra encuesta por cierre) | correcto; solo asegurar que los KPIs usen la vigente | mantener |
| **A1/A6/A7/A9, D1/D3/D4** | sin objeción; A1 pasa de "horas" a "horas laborables" si N2 = laboral | mantener |
| **"Sin correo"** (055) | fue por el plan sin `emails.send()`; hoy todo el doble cierre, la encuesta y el autocierre dependen de un copy-paste manual. El 93 % de respuesta demuestra que el canal funciona *cuando se usa*, no que se use siempre | reverificar si el plan actual habilita email; si no, mantener manual pero **registrado**. No integrar WhatsApp Business API: desproporcionado para 100 empleados |
| **"Empleados sin sesión"** | correcto para el tamaño; el costo es que no hay forma de que el empleado vea lo suyo ni confirme nada | 109 es el punto medio; no crear cuentas |
| **"Pendientes del dashboard no persistidos"** | está bien no persistir "visto"; lo que está mal es calcularlos en cliente con ≈ 25 requests y literales | `dashboard_resumen()`: siguen sin persistir, pero en SQL con `config_parametros` |
| **`categorias_ticket`/`ubicaciones` en `es_staff()`** | lectura abierta es correcta (satélites); escritura abierta a cualquier staff no | escritura gateada por `tickets`/`equipos` (099) |
| **Bucket público "a propósito"** | válido para `equipos-fotos` (0 objetos, key uuid); **no** para `tickets-adjuntos` (capturas con datos personales y el token en la key) | 110 |
| **"Sin workaround al bug del CLI"** (C13-e) | dejó `tests-db` ciego desde 2026-08-21 y forzó el deploy desde working tree (C21-OPS-003); no es un bug del proyecto, pero su aceptación sí es una decisión del proyecto | tres rutas concretas (§7.6); mientras tanto gate local obligatorio |
| **V2-ORGANIZACION §3 "no se suben ramas de trabajo"** | causa directa de C21-OPS-001 (76 commits solo en un disco) | revertir: toda rama viva se sube; lo que no se sube son worktrees |
| **093 `ticket_contexto_actor` por `txid`** | correcto como mecanismo; evitar una segunda tabla igual para empleados/portal | generalizar a `contexto_transaccion` (102); purga en 104 |
| **092 comentario de espera exigido con `created_at = now()`** | funciona porque `now()` es constante por transacción; frágil ante un `clock_timestamp()` futuro | marcar el comentario con `contexto_transaccion.origen='pedir_informacion'` o pasar su id |
| **094 `es_staff()` dentro de triggers BEFORE UPDATE** | un UPDATE hecho por una edge function (cliente admin, `auth.uid()` null) no cuenta como acción del técnico | documentar: las functions nunca actualizan `tickets` en nombre de staff |

---

## 11. Decisiones que requieren al dueño

1. ~~Etiquetas QR de equipos~~ **Decidido (2026-10-01): sí llevan QR** (ver §3.6). Quedan pendientes: formato de código real (`equipos.codigo` es texto libre; `codigo_almacen` viene del sistema de almacén) y qué código imprime el QR, y el contacto de TI que mostrará la página pública `/e/:codigo`.
2. **Decidido: las actas se firman en físico; se descarga el PDF, se firma y se sube el PDF firmado al expediente del empleado** (§3.7).
3. **Decidido: las altas las origina RRHH por correo y TI las registra a mano.** Solicitudes entra solo desde el panel. El formulario para RRHH o la carga por API quedan como propuesta a futuro (§14), no se aplican ahora.
4. **Decidido: se conserva el saludo "Buenos días, Alejandro"** (regla 25 ajustada).
5. **Decidido: avatares como se propuso**: se conservan en listas y en el menú de usuario; fuera de las carátulas.
6. **Decidido por el auditor**: mapa único de tonos y tipografía de tags en §3.8; prioridad como texto, solo Urgente en rojo.
7. **Decidido: móvil solo para lo necesario** (§3.9).
8. **Decidido: Encuestas se queda como módulo** (campañas al personal: actualización de datos, satisfacción sobre un tema concreto) y se mueve al grupo Personas.
9. **Decidido por el auditor**: DNI completo en panel y actas; enmascarado en reportes, hoja de vida impresa, etiquetas y CSV; nunca en el portal (§3.10).
10. **Decidido: se unifican `Modal.vue` y `AppDialog.vue` en `AppDialog`** (§3.11).
11. **Decidido: existe horario laboral y cierra la mesa de ayuda fuera de horario** (105, `portal_fuera_de_horario='cerrado'`). Pendiente confirmar las horas reales y si los sábados cuentan.
12. **Decidido: anonimización a los 5 años** de inactividad (104).
13. **Decidido: se renombran todos los grupos y módulos** (Inicio · Mesa de ayuda: Tickets, Solicitudes, Problemas, Conocimiento · Personas: Empleados, Encuestas · Custodia: Equipos, Licencias, Correos · Administración: Registro de actividad, Accesos sensibles, Configuración).
14. **Decidido: se acepta `dist/` commiteado** para las edge functions (§5).

---

## 12. Relación con la auditoría Ciclo 21

Este plan se escribió al cierre de la Fase 0. Las Fases 1–7 de la auditoría siguen pendientes de confirmación y pueden ajustar prioridades (en especial las Fases 2, 3 y 7); los hallazgos nuevos se anexan a `hallazgos.md` y, si cambian la hoja de ruta, se refleja aquí con fecha. Propuesta de líneas para `docs/CHANGELOG.md` al adoptar el plan: "**2026-10-01** (Ciclo 21, plan de mejora) — `docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md`: versión 'Expediente'; migraciones reservadas 099–110; reglas de diseño 14–25 pendientes de incorporar a `SISTEMA-DISENO.md`; hoja de ruta en tres horizontes acoplada al plan V2 de Tickets; decisiones del dueño del 2026-10-01 registradas en §11."

---

## 13. Mejoras adicionales detectadas (fuera de los frentes principales)

Mejoras que el reconocimiento dejó ver y que no entran en §2 porque son pequeñas o porque dependen de otra pieza. Cada una tiene valor propio y se puede tomar sola cuando convenga.

| # | Mejora | Qué resuelve | Esf. | Cuándo |
|---|---|---|---|---|
| M-01 | **Pendiente "acta sin adjuntar"** en Inicio para entregas de más de N días sin acta firmada | hoy nadie sabe qué entregas quedaron sin firmar | S | con H2-4 |
| M-02 | **Garantías y vencimientos con acción**: "Vence esta semana" enlaza a renovar o a abrir un ticket al proveedor, y la licencia guarda `proveedor`, `contrato`, `contacto` | hoy el vencimiento solo se lista; renovar es un trámite por fuera | S | H2-3 |
| M-03 | **Mantenimiento preventivo**: `equipos.proximo_mantenimiento` + evento `mantenimiento` en el kardex + pendiente en Inicio; la verificación por QR (§3.6) puede marcarlo | los 314 equipos no tienen ningún ciclo de revisión | S | H2-12 |
| M-04 | **Préstamos temporales**: `asignaciones_equipo.fecha_devolucion_prevista` + pendiente "Préstamo vencido" | un proyector prestado por un día queda igual que una laptop entregada por tres años | S | H2-1 |
| M-05 | **Respuestas predefinidas administrables** (V2 §4.6) y plantillas de WhatsApp editables por el JEFE en `config_parametros` | las macros de hoy son texto fijo en código | S | H2-5 |
| M-06 | **Costos y depreciación mínimos**: `equipos.costo` ya existe; vista `v_inventario_valorizado` por empresa y tipo, y vida útil por `tipos_equipo` | contabilidad pregunta cuánto vale el inventario y nadie lo puede responder | S | H3 |
| M-07 | **Ubicaciones con QR** (estantes de almacén, salas): la misma etiqueta de §3.6 para `ubicaciones`, y "Mover a" por escaneo | mover equipos en almacén exige buscar la ubicación a mano | S | tras H2-12 |
| M-08 | **Dos personas para accesos sensibles** (opcional por fila): revelar exige que un segundo JEFE apruebe en 10 min | 9 accesos sensibles con control de una sola persona | M | H3 |
| M-09 | **MFA para JEFE** por código TOTP si InsForge lo ofrece; si no, sesión más corta para JEFE (`config_parametros`) | las cuentas JEFE abren todas las contraseñas de la empresa | S/M | H2 |
| M-10 | **Rotación programada de cuentas compartidas**: `cuentas.rotar_cada_dias` + pendiente "Rotación vencida" | hoy la rotación solo se marca al salir un titular | S | H2-3 |
| M-11 | **Reporte mensual automático** (PDF de `v_kpi_*` enviado al JEFE o guardado en un bucket privado el día 1) | los reportes se generan a mano | S | tras H3-1 |
| M-12 | **Deflexión en el portal**: antes de enviar el ticket, mostrar 3 artículos de la KB publicada que coincidan con la categoría (sin sesión, solo título y solución) | la KB no le sirve al empleado; el ticket se crea igual | M | tras H3-2 (necesita KB con contenido) |
| M-13 | **Encuestas con campaña**: una ronda puede nacer con la lista de destinatarios (empleados activos de un área) y el enlace se copia por persona desde el expediente; sigue siendo anónima en la respuesta | la encuesta "actualizar datos de personal" hoy no sabe a quién se envió | M | H3 |
| M-14 | **Exportación completa del expediente** de un empleado (PDF: carátula, custodia, libro, actas) para una baja o una auditoría | hoy hay que copiar pantalla por pantalla | S | con H2-4 e `impresion.css` |
| M-15 | **Búsqueda global por serie, código de almacén y DNI** con apertura directa (regla 14) | hoy la búsqueda devuelve listas | S | H1-11 |
| M-16 | **Equipos: reparación con proveedor y costo** (`eventos_equipo.detalle` estructurado: proveedor, costo, fecha de salida/retorno) | "en reparación" no dice dónde está el equipo ni cuánto costó | S | H2-1 |

## 14. Propuestas a futuro (no se aplican ahora)

### 14.1 Agente de inventario de equipos (tipo OCS Inventory)

El dueño ya tiene un agente escrito en Go, empaquetado como MSI, que detecta el hardware y el software de los equipos. Integrarlo con el sistema es la continuación natural de la hoja de vida: el expediente del equipo deja de depender de lo que alguien escribió al registrarlo y pasa a reflejar lo que la máquina reporta.

**Diseño propuesto (cuando se tome):**
- **Identidad del agente.** Cada instalación recibe un token propio emitido desde la hoja de vida ("Enrolar agente": QR o cadena que se pega en el instalador). Tabla `equipos_agentes (id, equipo_id, token_hash, nombre_host, instalado_at, ultimo_reporte_at, version_agente, revocado_at)`. Un token por equipo; revocable. El agente nunca lleva la `API_KEY` del proyecto.
- **Edge function `inventario`** (sin sesión de staff; autentica por token del agente, rate-limit por token 1 reporte cada 10 min): acción `reportar` recibe `{hardware, software, red, usuario_sesion, fecha}`; valida tamaño (≤ 1 MB) y esquema; escribe en `equipo_reportes (equipo_id, recibido_at, payload jsonb, sha256)` y actualiza columnas derivadas en `equipos` (`specs` reales, `serie` confirmada, `ultimo_reporte_at`, `usuario_sesion_detectado`).
- **Conciliación.** Vista `v_equipos_discrepancias`: serie reportada ≠ serie registrada; equipo con reporte reciente pero `de_baja`/`perdido` (¡reapareció!); equipo `operativo` sin reporte en 30 días; usuario de sesión ≠ portador según `asignaciones_equipo` (señal de que el equipo cambió de manos sin acta). Cada discrepancia es un pendiente de Inicio con la acción que lo resuelve.
- **Software instalado → Licencias.** Tabla `equipo_software (equipo_id, nombre, version, editor, detectado_at, retirado_at)`; vista `v_licencias_cumplimiento`: instalaciones detectadas de un software con licencia vs asientos asignados (AutoCAD en 5 equipos con 3 asientos). Es la pieza que convierte el módulo de Licencias en control real.
- **Enrolamiento en el alta.** Paso opcional de la solicitud `entrega_equipo`: "agente instalado" se marca solo cuando llega el primer reporte.
- **Privacidad.** El agente no reporta contenido de archivos, historial ni capturas; sí nombre de host, hardware, software, versión del SO, IP interna y usuario de sesión. Se documenta en `docs/PROTECCION-DATOS.md` y se informa al personal (Ley 29733). Retención de `equipo_reportes`: 90 días de detalle, resumen mensual después.
- **Esfuerzo:** L (function + 3 tablas + vistas + UI en hoja de vida y pendientes). Depende de H2-4 (hoja de vida con URL), 110 (buckets y rate-limits), 104 (retención) y de fijar el formato JSON del agente actual.

### 14.2 Altas iniciadas por RRHH (formulario o API)

Hoy RRHH envía un correo y TI registra a mano. Dos escalamientos posibles, en orden:
1. **Formulario para RRHH** sobre la identidad ligera (109): RRHH recibe un enlace con alcance `crear_solicitud_alta`, llena nombre, DNI, área/obra, cargo, fecha de ingreso y adjunta el correo; la solicitud nace `abierta` en Mesa de ayuda › Solicitudes con el paso `registrar_empleado` pendiente para TI (TI valida y confirma, no copia). Esfuerzo M; depende de 108 y 109.
2. **API de RRHH**: si RRHH usa un sistema con API (planilla, ERP), la edge function `solicitudes` acepta `crear_alta` con un token de integración y el mismo esquema; conciliación por DNI. Esfuerzo M; depende del punto 1 y de que exista esa API.

### 14.3 Otras propuestas que exceden el horizonte de 6 meses

- **Creación automática de cuentas** en Google Workspace y Bitrix24 por API al completar el paso `crear_cuenta` de una solicitud de alta (hoy se crean a mano en cada plataforma). Depende de credenciales de administrador de esas plataformas guardadas como accesos sensibles.
- **Correo transaccional** si el plan de InsForge lo habilita: aviso de resolución y de encuesta al empleado sin copy-paste (ver §10, "Sin correo").
- **Firma digital del acta en el portal** (identidad ligera 109): el empleado confirma la recepción con un código enviado por WhatsApp; no reemplaza la firma física para equipos de alto valor, pero cubre accesorios y préstamos.
- **Multi-empresa real**: aislamiento por `empresa_id` en RLS, filtros y reportes, cuando entre la primera empresa con staff propio (hoy `empresas` es un atributo, no un límite de visibilidad).
- **Módulos no-TI** (RRHH, Finanzas) como áreas nuevas del menú y cambio del descriptor "Sistema TI" (`core/marca.js`), según `NOTAS-DISENO-ANTERIOR.md` §1.
- **Modo sin conexión para almacén**: la hoja de vida y "Verificar" por QR funcionando sin red y sincronizando después (PWA con cola local). Solo si la cobertura en obras lo justifica.
