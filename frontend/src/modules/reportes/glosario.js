// Glosario del reporte de tickets: una línea por término, la misma que se
// imprime al pie de la hoja. Las definiciones son las de la migración 115
// (cabecera) y del análisis de reportes del Ciclo 21 (§5.1). Si cambia una
// definición en SQL, cambia `definiciones_version` allá y este texto acá: la
// hoja muestra la versión que trajo el servidor y avisa si no es la que este
// glosario describe.
export const VERSION_DEFINICIONES = 'reportes-2026-10-03';

export const GLOSARIO = [
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
  { termino: 'Período comparable', definicion: 'solo períodos completos; un mes se compara con el mes anterior y un rango con los días anteriores de igual largo; el período en curso no se compara.' },
];
