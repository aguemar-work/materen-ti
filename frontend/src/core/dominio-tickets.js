// Vocabulario del dominio tickets: estados, prioridades y niveles con su
// color semántico (badge--*). Única fuente — antes había 4 copias del mapa
// de estados repartidas entre vistas.

// 'resuelto' y 'cerrado' se muestran como una sola cosa para el staff
// (decisión de producto 2026-08-21): en la práctica nadie ve nunca un
// ticket parado en 'resuelto' — cerrar_ticket() (migración 051) encadena
// ambos en un solo clic — así que mostrarlos con label/color distinto solo
// generaba la pregunta de "¿en qué se diferencian?". La columna `estado`
// de la tabla sigue guardando los 2 valores reales (crear_encuesta_al_cerrar
// depende del literal 'cerrado', igual que el resto de los triggers de
// tickets) — esto es puramente la fachada que ve el staff. Ver
// OPCIONES_FILTRO_ESTADO más abajo para el filtro (que sí necesita
// colapsarlos en una sola opción, no solo un mismo label).
export const ESTADOS_TICKET = {
  abierto:     { label: 'Abierto',       clase: 'badge--info' },
  en_progreso: { label: 'En progreso',   clase: 'badge--warning' },
  resuelto:    { label: 'Resuelto',      clase: 'badge--success' },
  cerrado:     { label: 'Resuelto',      clase: 'badge--success' },
  reabierto:   { label: 'Reabierto',     clase: 'badge--danger' },
  rechazado:   { label: 'Rechazado',     clase: 'badge--neutral' },
};

// Paleta propia, separada de ESTADOS_TICKET — Estado y Prioridad se pintan
// una junto a la otra en la misma fila y no pueden compartir color con
// significado distinto (ver GUIA-UX-UI.md).
export const PRIORIDADES_TICKET = {
  baja:    { label: 'Baja',    clase: 'badge--neutral' },
  media:   { label: 'Media',   clase: 'badge--teal' },
  alta:    { label: 'Alta',    clase: 'badge--purple' },
  urgente: { label: 'Urgente', clase: 'badge--danger' },
};

// Para selects: [{ valor, label }]
export const OPCIONES_PRIORIDAD = Object.entries(PRIORIDADES_TICKET)
  .map(([valor, v]) => ({ valor, label: v.label }));

// Incidente/solicitud (migración 035). Sin color propio todavía: no se
// pinta como badge en ningún lado hasta que haga falta mostrarlo (bandeja,
// reporte) — acá solo el vocabulario para los selects de triage.
export const OPCIONES_TIPO = [
  { valor: 'incidente', label: 'Incidente' },
  { valor: 'solicitud', label: 'Solicitud' },
];

export const NIVELES_ATENCION = [
  { valor: 'N1', label: 'N1 — Soporte básico' },
  { valor: 'N2', label: 'N2 — Especializado' },
  { valor: 'N3', label: 'N3 — Experto / desarrollo' },
];

// Estados en los que el ticket ya está en curso: campos editables + botón Resuelto
export const ESTADOS_EN_CURSO = ['en_progreso', 'reabierto', 'resuelto'];
export const ESTADOS_TERMINALES = ['cerrado', 'rechazado'];

// Valor de filtro (no un estado real): "vigentes" = todo lo que no sea
// Resuelto (incluye 'cerrado' en la base) ni Rechazado — todo lo que
// sigue necesitando atención activa. Default de la Lista de Tickets
// (GUIA-UX-UI.md, "Filtro de estado con default no-vacío") — centralizado
// acá en vez de repetir el string literal en el store, el API y la vista.
// El WHERE real (los 3 valores excluidos) vive en queryTickets()
// (api/domains/tickets.js) — acá solo el nombre del valor de filtro.
export const ESTADO_FILTRO_VIGENTES = 'vigentes';

// Opciones del <select> de estado en la Lista de Tickets: DISTINTO de
// iterar ESTADOS_TICKET directamente, porque ese mapa tiene 'resuelto' Y
// 'cerrado' como dos claves con el mismo label ahora ("Resuelto") — un
// v-for ahí mostraría la opción duplicada. Esta lista la colapsa en una
// sola opción "Resuelto" (ver queryTickets(): filtra por
// .in('estado', ['resuelto','cerrado']), no por .eq()).
export const OPCIONES_FILTRO_ESTADO = [
  { valor: 'abierto', label: 'Abierto' },
  { valor: 'en_progreso', label: 'En progreso' },
  { valor: 'resuelto', label: 'Resuelto' },
  { valor: 'reabierto', label: 'Reabierto' },
  { valor: 'rechazado', label: 'Rechazado' },
];

export const EVENTO_LABELS = {
  creado: 'Ticket creado',
  reasignado: 'Reasignado',
  estado_cambiado: 'Cambio de estado',
  prioridad_cambiada: 'Cambio de prioridad',
  nivel_atencion_cambiado: 'Cambio de nivel de atención',
  encuesta_enviada: 'Encuesta enviada',
  encuesta_respondida: 'Encuesta respondida',
};

// Hitos del historial esencial (TicketDetalleView): a qué estado se
// transicionó un evento "estado_cambiado", en lenguaje de hito de
// atención (no el nombre técnico del estado).
export const HITO_LABELS = {
  en_progreso: 'Inicio de atención',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
  rechazado: 'Rechazado',
};

// Los triggers registran los cambios de estado/prioridad como 'De "x" a "y"'
// (evento_ticket_cambios, migración 035). Esta es la ÚNICA función que conoce
// ese formato: si el texto del trigger cambia, se arregla acá y no en cada
// vista ni en el reporte.
export function destinoDeCambio(detalle) {
  return /a "(\w+)"\s*$/.exec(String(detalle || ''))?.[1] || null;
}

export function estadoInfo(e) {
  return ESTADOS_TICKET[e] || { label: e, clase: 'badge--neutral' };
}

export function prioridadInfo(p) {
  return PRIORIDADES_TICKET[p] || { label: p, clase: 'badge--neutral' };
}
