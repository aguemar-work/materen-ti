// Vocabulario del dominio tickets: estados, prioridades y niveles con su
// color semántico (badge--*). Única fuente — antes había 4 copias del mapa
// de estados repartidas entre vistas.

export const ESTADOS_TICKET = {
  abierto:     { label: 'Abierto',       clase: 'badge--info' },
  en_progreso: { label: 'En progreso',   clase: 'badge--warning' },
  resuelto:    { label: 'Resuelto',      clase: 'badge--success' },
  cerrado:     { label: 'Cerrado',       clase: 'badge--neutral' },
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

export const NIVELES_ATENCION = [
  { valor: 'N1', label: 'N1 — Soporte básico' },
  { valor: 'N2', label: 'N2 — Especializado' },
  { valor: 'N3', label: 'N3 — Experto / desarrollo' },
];

// Estados en los que el ticket ya está en curso: campos editables + botón Resuelto
export const ESTADOS_EN_CURSO = ['en_progreso', 'reabierto', 'resuelto'];
export const ESTADOS_TERMINALES = ['cerrado', 'rechazado'];

export const EVENTO_LABELS = {
  creado: 'Ticket creado',
  reasignado: 'Reasignado',
  estado_cambiado: 'Cambio de estado',
  prioridad_cambiada: 'Cambio de prioridad',
  nivel_atencion_cambiado: 'Cambio de nivel de atención',
  correo_fallido: 'No se pudo enviar el correo',
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

export function estadoInfo(e) {
  return ESTADOS_TICKET[e] || { label: e, clase: 'badge--neutral' };
}

export function prioridadInfo(p) {
  return PRIORIDADES_TICKET[p] || { label: p, clase: 'badge--neutral' };
}
