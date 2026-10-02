# Protección de datos personales

> Plan de mejora Ciclo 21, §4 "104 — Retención, purga y entorno (Ley 29733)",
> H2-11 y H3-8. Este documento es lo que el sistema debe poder mostrar sobre los
> datos personales que trata: **qué guarda, para qué, durante cuánto tiempo,
> quién accede, cómo se anonimiza, cómo se purga y cómo se atienden los
> derechos de las personas**. La parte técnica la implementa la migración
> `112_retencion_y_anonimizacion.sql` (sin aplicar en producción al escribir
> esto; ver `docs/CHANGELOG.md`).
>
> **No es asesoría legal.** Lo que depende de la interpretación de la Ley
> N.º 29733 (Ley de Protección de Datos Personales) y de su Reglamento está
> marcado **(a confirmar con asesoría legal)**: no se da por válido. No cita
> artículos ni plazos legales porque no se pudieron verificar. No contiene URLs,
> claves ni datos reales; los nombres de tablas y columnas no son secretos.

## 1. Resumen

- El sistema es un panel **interno** de TI (8 usuarios de staff). Los datos
  personales son los de los **empleados de la empresa** y de quienes abren un
  ticket por el portal público; no hay clientes ni venta.
- El identificador es el **DNI** (8 dígitos). Contraseñas de cuentas: nunca en
  claro (cifradas en servidor, `docs/CONTINUIDAD.md` §3).
- Lo temporal se **purga solo** (intentos de rate-limit, contexto de
  transacción, credenciales de entregas usadas, notificaciones leídas, IP y
  navegador de la auditoría). Lo permanente (expediente del empleado) se
  **anonimiza a los 5 años de la baja**, conservando el historial.
- Una **branch de pruebas** nunca lleva datos reales: se anonimiza entera con
  `scripts/anonimizar.sql`, que solo corre donde `entorno` dice `branch`.

## 2. Inventario de datos personales

Base de tratamiento y finalidad son **propuestas** para validar
**(a confirmar con asesoría legal)**: relación laboral (alta, baja, entrega de
equipos y cuentas) para el expediente del empleado, e interés legítimo de la
empresa en la seguridad de sus sistemas para la auditoría y el rate-limit.
"Quién accede" es el control real del sistema (RLS y guards), no una intención.

### 2.1 Datos del empleado (permanentes hasta la anonimización)

| Tabla.columna | Dato | Finalidad | Quién accede | Plazo | Al vencer |
| --- | --- | --- | --- | --- | --- |
| `empleados.nombres`, `apellidos` | Nombre | Identificar a quien recibe equipos, cuentas y soporte | Todo el staff activo lee (excepción deliberada: Equipos, Licencias y Correos embeben el nombre); escribe el módulo `empleados` | Mientras sea empleado + 5 años desde la baja | `anonimizar_empleado()`: `Empleado` / `anonimizado` |
| `empleados.dni` | DNI | Identificador único; vincula el ticket del portal con el empleado; va completo en las actas | Staff lee (nunca como columna de listado); el portal solo lo recibe para buscar, no lo devuelve | Ídem | `ANON-` + 16 hex aleatorios (ver §4.2) |
| `empleados.correo_personal`, `telefono`, `whatsapp` | Contacto | Entregar credenciales y avisos por WhatsApp o correo | Staff | Ídem | `NULL` |
| `empleados.notas` | Texto libre | Observaciones de TI | Staff | Ídem | `NULL` |
| `empleados.cargo`, `area_obra_id`, `ubicacion_id`, `empresa_id`, `fecha_alta`, `estado` | Datos del puesto | Asignar accesos y equipos según el puesto | Staff | Ídem | **Se conservan**: no identifican por sí solos |
| `empleado_eventos` | Hoja de vida (qué cambió, quién, cuándo, motivo) | Auditoría del ciclo de vida | Staff lee; solo triggers y RPC escriben; **inmutable** | Indefinido (es el historial) | Se conserva. Por diseño no guarda DNI ni valores de contacto; sí el nombre del **área, ubicación, empresa y cargo** y el correo del **staff** que actuó |
| `empleado_revisiones_acceso` | Resultado y nota de la revisión de accesos | Control periódico de accesos | Módulo `empleados` | Indefinido | Se conserva (texto libre: ver §4.3) |
| `asignaciones_equipo`, `asignaciones_cuenta`, `asignaciones_licencia` | Quién tuvo qué y cuándo | Custodia de activos | Staff por módulo | Indefinido (historial) | Se conserva íntegro; las `notas` son texto libre (§4.3) |
| `eventos_equipo.detalle` | "Entregado a / Devuelto por Nombre Apellido" | Hoja de vida del equipo | Módulo `equipos` | Indefinido | Se conserva el evento; el **nombre** se reemplaza por `Empleado anonimizado` |

### 2.2 Datos de quien abre un ticket

| Tabla.columna | Dato | Finalidad | Quién accede | Plazo | Al vencer |
| --- | --- | --- | --- | --- | --- |
| `tickets.contacto_ingresado` | Lo que escribió el solicitante: DNI, teléfono o correo | Identificar al solicitante y responderle | Módulo `tickets` | Con el ticket | `NULL` al anonimizar al empleado vinculado |
| `tickets.titulo`, `descripcion`, `ticket_comentarios.mensaje`, `ticket_satisfaccion.comentario` | Texto libre (puede contener nombres, teléfonos) | Atender el caso | Módulo `tickets` | Con el ticket | No se editan automáticamente (§4.3) |
| `tickets.token` | Enlace de seguimiento (da acceso al ticket) | Que el solicitante siga su caso | Quien tenga el enlace | Con el ticket | Se conserva |
| Captura adjunta (bucket `tickets-adjuntos`, privado) | Imagen que puede mostrar datos personales | Evidencia del problema | URL firmada de corta vida: el dueño del enlace y el staff | Con el ticket | No se borra automáticamente **(pendiente de decidir)** |

### 2.3 Documentos y credenciales

| Tabla / bucket | Dato | Quién accede | Plazo | Al vencer |
| --- | --- | --- | --- | --- |
| `actas` + bucket `actas-firmadas` (privado) | PDF firmado con nombre, DNI y firma | Módulo `equipos`, por URL firmada | Mientras exista el expediente | **No se borra ni se anonimiza**: es documento legal firmado; al anonimizar al empleado deja de ser accesible desde la UI **(a confirmar con asesoría legal si debe destruirse)** |
| `cuentas.usuario` (suele ser el correo corporativo) | Identificador de la cuenta | Módulo `correos` | Con la cuenta | Se conserva: es el identificador del recurso en la auditoría **(decisión pendiente del dueño)** |
| `cuentas.password`, `licencias.clave`, `accesos_sensibles.password` | Secretos cifrados | Solo por la edge function `credenciales`, con auditoría | Con el recurso | Nunca en listados ni formularios (invariante 2) |
| `entregas.payload` | Credenciales cifradas de un enlace de un solo uso | Solo la edge function | **30 días** tras abrirse o vencer | Se vacía (`''`); la fila queda como auditoría |
| `entregas.empleado_nombre` | Nombre del destinatario | Staff con el módulo `correos` | Con la fila | `Empleado anonimizado` al anonimizar |

### 2.4 Auditoría y datos técnicos

| Tabla.columna | Dato | Quién accede | Plazo | Al vencer |
| --- | --- | --- | --- | --- |
| `accesos_log.user_email`, `cuenta_usuario`, `plataforma`, `accion`, `created_at` | Quién hizo qué sobre qué cuenta | Solo el JEFE | Indefinido: es la auditoría | Se conserva siempre |
| `accesos_log.ip`, `user_agent` | De dónde se hizo | Solo el JEFE | **365 días** | `NULL` (la fila no se borra) |
| `accesos_log.detalle` | Texto como "Entrega abierta — Nombre" | Solo el JEFE | Indefinido | Al anonimizar al empleado, el **nombre** se reemplaza dentro del texto |
| `intentos_publicos.clave` | IP, DNI o id de usuario del intento | Nadie con sesión (solo el cliente admin de las functions) | **7 días** | Borrado |
| `ticket_busqueda_intentos` (DNI, IP), `ticket_creacion_intentos` (IP), `encuesta_respuesta_intentos` (IP) | Tablas legadas de rate-limit | JEFE (SELECT) | **7 días** | Borrado |
| `contexto_transaccion` | Rol y origen de una transacción | Nadie con sesión | **1 día** | Borrado |
| `notificaciones.titulo` | Texto como "Empleado registrado · Nombre" | Staff (las generales) o su destinatario | **180 días**, solo las **leídas** | Borrado; al anonimizar, el nombre pasa a `Empleado anonimizado` |
| `equipos_importacion.raw` | Texto crudo del Excel de activos (incluye el usuario del equipo) | Módulo `equipos` | Hasta migrar la fila a Equipos (es una bandeja de trabajo; la fila desaparece al migrarse) | Una fila que nunca se migra conserva el texto **(pendiente de decidir)**; en la branch se vacía |
| `encuesta_respuestas.respuestas` | Respuestas anónimas | Staff | Con la ronda | Se conserva (anónimas por diseño) |

### 2.5 Staff

`staff.nombre` y `auth.users.email` son datos del personal de TI que usa el
sistema. Base: relación laboral. No se anonimizan automáticamente; si una
persona del staff se retira se **desactiva** (`staff.activo = false`) y su
usuario queda en `accesos_log` y en los eventos como autor. Qué hacer con esos
datos al cabo de un tiempo **(a confirmar con asesoría legal)**.

### 2.6 Copias y terceros

- **Respaldos de plataforma** (diarios, retención >= 30 días, `docs/CONTINUIDAD.md`
  §2): contienen los datos tal como estaban ese día. Un dato purgado o
  anonimizado hoy sigue en los respaldos hasta que estos rotan. Es normal, pero
  debe decírsele a quien ejerza un derecho de cancelación.
- **Copia externa cifrada** (`exportar-respaldo.mjs`, plan §7.4, artifact de 90
  días y copia mensual): aún no existe; cuando exista, su retención se suma al
  plazo anterior.
- **Sentry** (monitoreo de errores del frontend): puede recibir mensajes de
  error con fragmentos de datos. Confirmar qué se envía **(pendiente de
  verificar)**.
- **Edge functions y proveedor de correo** (aviso de tickets): tratan el correo
  del solicitante. Confirmar contrato y ubicación del proveedor **(a confirmar
  con asesoría legal)**.

## 3. Retención y purga automática

Reglas en `public.config_retencion` (una fila por tabla). El **JEFE** puede
cambiar `dias` (de 1 a 3650) y `activo`; la tabla, la acción y las columnas las
fija la migración. La ejecuta `purgar_datos_temporales()`, que solo puede correr
`project_admin` (el schedule) o el JEFE a través de
`purgar_datos_temporales_manual()`. Cada corrida deja **una fila
`purga_ejecutada` en `accesos_log`** con los conteos por tabla (sin datos
personales); si esa fila no puede escribirse, la purga se revierte entera.

| Tabla | Días | Acción |
| --- | --- | --- |
| `intentos_publicos` | 7 | borrar filas |
| `ticket_busqueda_intentos`, `ticket_creacion_intentos`, `encuesta_respuesta_intentos` | 7 | borrar filas (tablas legadas hasta su retiro) |
| `contexto_transaccion` | 1 | borrar filas |
| `entregas` | 30 | vaciar `payload` (desde que se abrió; si nunca se abrió, desde que venció) |
| `notificaciones` | 180 | borrar las **leídas** (personales: por su destinatario; generales: por todo el staff activo) |
| `accesos_log` | 365 | `NULL` en `ip` y `user_agent`; **nunca** se borran filas |

Programación diaria: **todavía no existe**. Pasos y compromisos en la cabecera de
la migración 112 (`schedules create` hacia una acción de mantenimiento, o hacia
el RPC con la clave de administrador). Mientras tanto la purga se corre a mano.
Alarma: si pasan más de 2 días sin una fila `purga_ejecutada`, la programación
falló.

`accesos_log` no es "inmutable" por trigger sino por permisos (RLS sin policies
de escritura); por eso la purga puede vaciar `ip` y `user_agent` desde una
función `SECURITY DEFINER` sin tocar nada más. Un endurecimiento opcional sería
un trigger que solo admita ese UPDATE; no se agregó porque debería dejar pasar
los `on delete set null` de las claves foráneas.

## 4. Anonimización de empleados

### 4.1 Cuándo y quién

- `anonimizar_empleado(p_id, p_motivo)`: **solo JEFE** (`42501` si no).
- Solo a un empleado **Inactivo** cuya baja cumpla **5 años** (parámetro
  `anios_anonimizacion_empleado` de `config_parametros`; mínimo efectivo de 1
  año aunque se escriba 0). La fecha de baja es la del último `baja_ejecutada` en
  su hoja de vida (si no hay, su última actualización).
- Motivo obligatorio (máximo 200 caracteres): **sin datos personales**; queda en
  la hoja de vida.
- La vista `v_empleados_anonimizables` lista a los candidatos (solo al JEFE).
- **Irreversible.** Sin interfaz todavía: hasta que exista, se invoca con la
  sesión del JEFE o, con su autorización escrita, un administrador ejecuta
  `anonimizar_empleado_interno`.

### 4.2 Qué cambia

| Dato | Resultado |
| --- | --- |
| Nombres, apellidos | `Empleado` / `anonimizado` |
| DNI | `ANON-` + 16 caracteres hexadecimales **aleatorios** |
| Correo personal, teléfono, WhatsApp, notas | `NULL` |
| `tickets.contacto_ingresado` | `NULL` en los tickets del empleado y en los que repiten su DNI, teléfono, WhatsApp o correo |
| `entregas.empleado_nombre` | `Empleado anonimizado` |
| `notificaciones.titulo` (del empleado) | "… · Empleado anonimizado" |
| `accesos_log.detalle`, `eventos_equipo.detalle` | El nombre (completo) dentro del texto pasa a `Empleado anonimizado` |
| `empleados.anonimizado_at` | Fecha de la anonimización |
| `empleado_eventos` | +1 evento `anonimizado` (quién, cuándo, motivo) |

**Se conserva** el historial: hoja de vida, asignaciones de equipos, cuentas y
licencias, tickets (código, estado, fechas, título y descripción), actas, cargo,
área, ubicación, empresa y fecha de alta.

**Desvío respecto al plan, a confirmar con el dueño:** el plan proponía
`'ANON-' || left(encode(sha256(dni), 'hex'), 12)` para "detectar el reingreso".
Un DNI tiene 8 dígitos (10^8 posibilidades): ese hash, sin sal, se revierte por
fuerza bruta en segundos, o sea que **seudonimiza pero no anonimiza**. Se usa un
hash con un valor aleatorio que se descarta, que es irreversible. Se pierde la
detección de reingreso por DNI: un reingreso posterior se da de alta como una
persona nueva.

### 4.3 Qué NO se anonimiza (revisión manual si lo pide el titular)

- Texto libre escrito por el personal o por el solicitante: `tickets.titulo` y
  `descripcion`, `ticket_comentarios.mensaje`, `ticket_satisfaccion.comentario`,
  `asignaciones_*.notas`, `empleado_revisiones_acceso.nota`, `cuentas.notas`, el
  motivo de `empleado_eventos.detalle`. No hay forma fiable de detectar nombres
  dentro de un texto.
- `cuentas.usuario` de las cuentas personales dadas de baja (suele ser el correo
  corporativo) y `accesos_log.cuenta_usuario`, que lo repite **(decisión
  pendiente del dueño)**.
- Archivos: actas firmadas, fotos de equipos (bucket público), capturas de
  tickets. SQL no puede tocarlos.
- Empleados Activos con `deleted_at` (eliminados): la anonimización exige
  `Inactivo`; deben darse de baja primero.
- Respaldos (§2.6).

## 5. Entorno de pruebas

- `public.entorno` tiene una fila: `produccion` o `branch`; `es_branch()` es
  `true` solo con `branch`.
- `scripts/anonimizar.sql` anonimiza **todo** el conjunto de datos personales de
  una branch (empleados, cuentas, textos libres, entregas, notificaciones,
  importaciones, auditoría) y **aborta sin tocar nada** si `es_branch()` no es
  `true`. Es un solo bloque atómico.
- Una branch hereda la fila `produccion`; el paso que prepara la branch debe
  marcarla (`update public.entorno set nombre = 'branch'`) **después de comprobar
  con el CLI que está vinculado a la branch**. El guard evita el error
  accidental, no el sabotaje: quien marque `branch` a mano en producción y
  corra el script destruye datos reales. **Nunca** se hace en producción.
- No cubre `staff`, `auth.users` (son las cuentas de prueba), las encuestas
  anónimas ni los buckets de archivos: la branch no debe montar los de
  producción.

## 6. Derechos de las personas (ARCO)

La Ley 29733 reconoce los derechos de **acceso**, **rectificación**,
**cancelación** y **oposición** (además del derecho a ser informado). Los
**plazos de respuesta y los requisitos de la solicitud** están en el
Reglamento: **(a confirmar con asesoría legal)**; este documento no los fija.

### Procedimiento (propuesto)

1. **Recepción.** La solicitud llega por el contacto de TI publicado
   (`config_parametros.contacto_ti`) o por RR. HH. Se anota fecha de recepción,
   quién la pide y qué derecho ejerce. Hoy **no hay un registro de solicitudes**:
   se propone llevarlas como ticket de tipo solicitud con una categoría
   "Protección de datos" **(pendiente de crear)**.
2. **Verificar identidad.** Antes de entregar o cambiar nada, comprobar que quien
   pide es el titular (documento de identidad). Nunca por el portal público.
3. **Atender** según el derecho:

| Derecho | Qué se hace en el sistema |
| --- | --- |
| **Acceso** | El JEFE reúne lo que el sistema tiene de la persona: ficha de `empleados`, `empleado_eventos`, asignaciones (equipos, cuentas y licencias), tickets con su `empleado_id` o su contacto, `entregas`, `notificaciones`, actas firmadas y las filas de `accesos_log` donde figura su nombre. Se entrega en un formato legible. No incluye contraseñas ni datos de otras personas. |
| **Rectificación** | Se corrige en el módulo Empleados (queda en la hoja de vida como `contacto_cambiado`, sin el valor). Si el error está en un texto libre, se edita a mano. |
| **Cancelación** | Si el empleado cumple las condiciones de §4.1 se ejecuta `anonimizar_empleado`. Antes de ese plazo, qué se puede cancelar sin incumplir obligaciones laborales o de custodia **(a confirmar con asesoría legal)**; un plazo menor a 1 año requiere una decisión explícita y un cambio de la migración, no basta el parámetro. Se informa al titular que los respaldos conservan la copia hasta rotar (§2.6) y que las actas firmadas se conservan. |
| **Oposición** | Hoy no hay tratamientos con fines publicitarios ni de perfilado. La solicitud se evalúa caso por caso (p. ej., dejar de recibir avisos por WhatsApp = vaciar ese campo) **(a confirmar con asesoría legal)**. |

4. **Responder y registrar** dentro del plazo legal, con constancia de lo hecho.

## 7. Pendientes y decisiones abiertas

| # | Tema | Quién |
| --- | --- | --- |
| 1 | Aprobar el desvío del DNI aleatorio (§4.2) | Dueño |
| 2 | `cuentas.usuario` y `accesos_log.cuenta_usuario` de cuentas personales dadas de baja: ¿se anonimizan? | Dueño y asesoría legal |
| 3 | Actas firmadas: ¿se destruyen al anonimizar? ¿Plazo de conservación del documento? | Asesoría legal |
| 4 | Base de tratamiento, finalidades y, si corresponde, inscripción del banco de datos y deber de informar al personal | Asesoría legal |
| 5 | Plazos de atención de ARCO y contenido mínimo de la solicitud | Asesoría legal |
| 6 | Programar la purga diaria (cabecera de la 112) y vigilar la alarma de 2 días | Dueño |
| 7 | Pantalla del JEFE para ver `v_empleados_anonimizables`, anonimizar y editar `config_retencion` | Desarrollo (frontend) |
| 8 | Retención de capturas de tickets, fotos de equipos y respaldos externos | Dueño |
| 9 | Qué recibe Sentry y qué proveedor de correo se usa | Desarrollo y asesoría legal |
| 10 | Registro de solicitudes ARCO (categoría de ticket) | Dueño |
| 11 | Endurecimiento opcional: trigger que limite los UPDATE de `accesos_log` a `ip`/`user_agent` | Desarrollo |

*Documento creado junto con la migración 112 (2026-10-02). Si el código y este
documento se contradicen, gana el código (`AGENTS.md`, invariante 10).*
