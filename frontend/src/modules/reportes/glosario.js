// Glosario del reporte de tickets: una línea por término, la misma que se
// imprime al pie de la hoja. Las definiciones son las de las migraciones 115 y
// 118 (cabeceras) y del análisis de reportes del Ciclo 21 (§5.1). Si cambia una
// definición en SQL, cambia `definiciones_version` allá y este texto acá: la
// hoja muestra la versión que trajo el servidor y avisa si no es la que este
// glosario describe.
export const VERSION_DEFINICIONES = 'reportes-2026-10-06';

export const GLOSARIO = [
  { termino: 'Período', definicion: 'días de calendario de Lima, de 00:00 a 24:00; la semana va de lunes a domingo.' },
  { termino: 'Ingresaron', definicion: 'tickets creados en el período, incluidos los rechazados (se informan aparte).' },
  { termino: '% resuelto', definicion: 'de los que ingresaron en el período y no se rechazaron, cuántos ya están resueltos al cierre; nunca pasa de 100 %. Los resueltos que ingresaron antes se informan como «de antes».' },
  { termino: 'Pendientes', definicion: 'tickets sin resolver al inicio y al cierre del período (o ahora, si el período no terminó), reconstruidos por sus cambios de estado.' },
  { termino: 'Técnico de mesa', definicion: 'integrante del staff marcado en Configuración › Staff; lo que resolvió cualquier otra persona va en «Jefatura y otros», para que los totales cuadren.' },
  { termino: 'Satisfacción', definicion: 'respuestas con nivel 4 o 5 entre todas las respondidas; se publica con la muestra mínima, como el promedio.' },
  { termino: 'Creado en el período', definicion: 'fecha de creación dentro del período, en días de calendario de Lima.' },
  { termino: 'Resuelto en el período', definicion: 'fecha de resolución vigente dentro del período y estado actual resuelto o cerrado; un ticket cuenta en un solo período.' },
  { termino: 'Rechazado', definicion: 'estado actual rechazado; se informa aparte y nunca entra en resueltos ni en tiempos.' },
  { termino: 'Arrastrado', definicion: 'resuelto en el período pero creado antes de él.' },
  { termino: 'Horas corridas', definicion: 'tiempo de reloj entre creación y resolución (o primera respuesta), sin descontar noches ni fines de semana; no existe horario laboral.' },
  { termino: 'Mediana', definicion: 'valor central de la muestra; se publica antes que el promedio porque un ticket olvidado no la desplaza. Siempre con n.' },
  { termino: 'Primera respuesta', definicion: 'primer comentario visible para el solicitante escrito por alguien de TI.' },
  { termino: 'Reapertura', definicion: 'paso a reabierto desde resuelto o cerrado (no desde rechazado).' },
  { termino: 'Tasa de reapertura', definicion: 'de los tickets resueltos por primera vez en el período, cuántos se reabrieron dentro del corte de días tras una resolución.' },
  { termino: 'CSAT', definicion: 'promedio de las encuestas respondidas de los tickets resueltos en el período; se publica solo con n igual o mayor a la muestra mínima.' },
  { termino: 'Insatisfecho', definicion: 'respuesta con nivel 1 o 2.' },
  { termino: 'Tasa de respuesta', definicion: 'encuestas respondidas sobre encuestas generadas (una por ticket cerrado con solicitante identificado).' },
  { termino: 'Resolvió', definicion: 'quien marcó el ticket como resuelto por última vez.' },
  { termino: 'Asignados hoy', definicion: 'tickets vigentes asignados a la persona en este momento; no es la carga al cierre de un período pasado.' },
  { termino: 'Backlog', definicion: 'tickets vigentes al cierre del período (reconstruidos por sus cambios de estado) o ahora si el período está en curso, por tramos de días corridos.' },
  { termino: 'Área', definicion: 'área u obra del empleado hoy, no la del momento del ticket.' },
  { termino: 'Período comparable', definicion: 'solo períodos completos; un mes se compara con el mes anterior, y un día, una semana o un rango con los días anteriores de igual largo; el período en curso no se compara.' },
];

// ── Reportes centralizados (migración 117) ─────────────────────────────────
// Una lista por reporte, con las definiciones de la cabecera de la 117. Si una
// cambia en SQL, sube `definiciones_version` allá y este texto acá.
export const VERSION_DEFINICIONES_117 = 'reportes-2026-10-05';

const FOTO = { termino: 'Foto al corte', definicion: 'lo que hay registrado al momento de generar el reporte; no tiene período ni se compara.' };
const PERIODO = { termino: 'Período', definicion: 'días de calendario de Lima, del primero al último inclusive; como mucho 366 días; no se compara con el anterior.' };

export const GLOSARIOS = {
  satisfaccion: [
    { termino: 'Período', definicion: 'tickets con resolución vigente dentro del período (días de calendario de Lima); «Todo» no recorta.' },
    { termino: 'Tickets', definicion: 'tickets de esa persona o de ese técnico resueltos en el período; cada uno genera a lo sumo una encuesta.' },
    { termino: 'Le faltan', definicion: 'encuestas enviadas que todavía no se respondieron.' },
    { termino: 'Satisfacción', definicion: 'respuestas con nivel 4 o 5 entre las respondidas. 3 es regular; 1 y 2, insatisfecho.' },
    { termino: 'Situación', definicion: 'conforme desde el umbral de Configuración (80 %), regular desde el segundo (60 %), inconforme debajo; con menos respuestas que el mínimo por persona (3), «Pocas respuestas».' },
    { termino: 'Promedio', definicion: 'de las respuestas con nivel 1 a 5; se publica solo con n igual o mayor a la muestra mínima (si no, «n insuficiente»).' },
    { termino: 'Técnico', definicion: 'quien marcó el ticket como resuelto por última vez; quien no es técnico de mesa va en «Jefatura y otros». Solo lo ve un JEFE.' },
    { termino: 'Mes', definicion: 'mes de la resolución vigente del ticket, en hora de Lima.' },
  ],
  inventario: [
    FOTO,
    { termino: 'Situación', definicion: 'el estado físico si el equipo no está operativo; si lo está, asignado (lo tiene una persona), en ubicación (sede, obra o almacén) o disponible.' },
    { termino: 'Garantía por vencer', definicion: 'equipos operativos o en reparación con garantía hasta hoy más el parámetro de días (el mismo del Inicio); incluye las vencidas.' },
    { termino: 'Sin devolver', definicion: 'equipo aún asignado a una persona dada de baja; la fecha de baja sale de su hoja de vida.' },
    { termino: 'Acta pendiente', definicion: 'entrega a una persona sin acta firmada adjunta, con más días que el parámetro y posterior a la fecha de inicio del control.' },
  ],
  licencias: [
    FOTO,
    { termino: 'Usados', definicion: 'asignaciones activas de la licencia; si la licencia se usa con un correo, los titulares activos de ese correo.' },
    { termino: 'Libres', definicion: 'asientos comprados menos usados, nunca menos de cero.' },
    { termino: 'Vencida / por vencer', definicion: 'fecha de vencimiento anterior a hoy / dentro del parámetro de días; las perpetuas no vencen.' },
  ],
  correos: [
    FOTO,
    { termino: 'Rotación pendiente', definicion: 'cuenta marcada para cambiar la contraseña (por ejemplo, tras la salida de un titular).' },
    { termino: 'Días sin cambiar', definicion: 'días corridos desde el último cambio de contraseña registrado; no se guarda cuándo se marcó la rotación.' },
    { termino: 'Titulares', definicion: 'personas con una asignación activa de la cuenta.' },
  ],
  personal: [
    PERIODO,
    { termino: 'Personal hoy', definicion: 'activos, suspendidos y dados de baja al momento de generar el reporte; empresa, área y cargo son los de hoy.' },
    { termino: 'Alta / baja', definicion: 'según la hoja de vida: alta = registro, baja = baja ejecutada o paso a Inactivo (una baja anterior a la auditoría lleva fecha aproximada).' },
    { termino: 'Revisión pendiente', definicion: 'persona activa o suspendida cuya última revisión de accesos (o su alta, si nunca se revisó) supera el parámetro de días.' },
  ],
  solicitudes: [
    PERIODO,
    { termino: 'Creadas, completadas, canceladas', definicion: 'cada una por la fecha de ese hecho dentro del período.' },
    { termino: 'Tiempo de trámite', definicion: 'días corridos de creada a completada, de las completadas en el período; mediana primero, siempre con n.' },
    { termino: 'Antigüedad', definicion: 'días corridos desde que se creó una solicitud que sigue abierta.' },
  ],
  cambios: [
    PERIODO,
    { termino: 'Pedidos', definicion: 'cambios creados en el período que llegaron a pedirse (sin borradores ni cancelados).' },
    { termino: 'Ejecutados', definicion: 'en ejecución, implementados, cerrados o revertidos.' },
    { termino: 'Revertidos de los ejecutados', definicion: 'revertidos sobre ejecutados del mismo tipo.' },
    { termino: 'Emergencia sin aprobar', definicion: 'emergencia en ejecución o implementada sin aprobación de un jefe y con el plazo de 48 horas vencido, hoy.' },
  ],
  problemas: [
    PERIODO,
    { termino: 'Error conocido', definicion: 'problema con causa raíz o workaround documentado; vigente mientras no se cierre.' },
    { termino: 'Acción vencida', definicion: 'acción correctiva pendiente o en progreso con fecha límite anterior a hoy.' },
    { termino: 'Uso de un artículo', definicion: 'artículo registrado como usado para resolver un ticket.' },
    { termino: 'Recurrente', definicion: 'categoría con tantos tickets como el umbral de Configuración en sus días, sin problema vinculado.' },
  ],
  encuestas: [
    { termino: 'Ronda', definicion: 'un envío de la encuesta con su propio enlace; sus respuestas son anónimas.' },
    { termino: 'Porcentaje', definicion: 'sobre quienes respondieron esa pregunta, no sobre el total de la ronda.' },
    { termino: 'Promedio', definicion: 'de las respuestas de escala 1 a 5 de la pregunta.' },
  ],
  auditoria: [
    PERIODO,
    { termino: 'Quién', definicion: 'el integrante del staff que actuó; sin sesión, «Empleado, vía enlace» (entregas y portal) o «Sistema».' },
    { termino: 'Revelado fallido o denegado', definicion: 'intento de ver una contraseña que falló o que el permiso no dejó.' },
    { termino: 'Privacidad', definicion: 'el reporte nunca muestra la IP ni el navegador de quien actuó.' },
  ],
};
