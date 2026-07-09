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

export const PRIORIDADES_TICKET = {
  baja:    { label: 'Baja',    clase: 'badge--neutral' },
  media:   { label: 'Media',   clase: 'badge--info' },
  alta:    { label: 'Alta',    clase: 'badge--warning' },
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

export function estadoInfo(e) {
  return ESTADOS_TICKET[e] || { label: e, clase: 'badge--neutral' };
}

export function prioridadInfo(p) {
  return PRIORIDADES_TICKET[p] || { label: p, clase: 'badge--neutral' };
}
