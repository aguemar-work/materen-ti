// Vocabulario del dominio Gestión de Problemas: ciclo de vida del problema
// y de sus acciones correctivas. Único origen — mismo patrón que
// dominio-tickets.js/dominio-kb.js.

export const ESTADOS_PROBLEMA = {
  abierto:     { label: 'Abierto',      clase: 'badge--info' },
  diagnostico: { label: 'Diagnóstico',  clase: 'badge--warning' },
  acciones:    { label: 'Acciones',     clase: 'badge--teal' },
  cerrado:     { label: 'Cerrado',      clase: 'badge--neutral' },
};

export const OPCIONES_ESTADO_PROBLEMA = Object.entries(ESTADOS_PROBLEMA)
  .map(([valor, v]) => ({ valor, label: v.label }));

export const ESTADOS_PROBLEMA_ABIERTOS = ['abierto', 'diagnostico', 'acciones'];

// Paleta propia, separada de ESTADOS_PROBLEMA — estado y severidad se pintan
// uno junto al otro en la misma fila y no pueden compartir color con
// significado distinto (ver GUIA-UX-UI.md).
export const SEVERIDADES_PROBLEMA = {
  baja:     { label: 'Baja',     clase: 'badge--neutral' },
  media:    { label: 'Media',    clase: 'badge--teal' },
  alta:     { label: 'Alta',     clase: 'badge--purple' },
  critica:  { label: 'Crítica',  clase: 'badge--danger' },
};

export const OPCIONES_SEVERIDAD_PROBLEMA = Object.entries(SEVERIDADES_PROBLEMA)
  .map(([valor, v]) => ({ valor, label: v.label }));

export const ESTADOS_ACCION = {
  pendiente:    { label: 'Pendiente',    clase: 'badge--neutral' },
  en_progreso:  { label: 'En progreso',  clase: 'badge--warning' },
  completada:   { label: 'Completada',   clase: 'badge--success' },
};

export const OPCIONES_ESTADO_ACCION = Object.entries(ESTADOS_ACCION)
  .map(([valor, v]) => ({ valor, label: v.label }));

export function estadoProblemaInfo(e) {
  return ESTADOS_PROBLEMA[e] || { label: e, clase: 'badge--neutral' };
}

export function severidadProblemaInfo(s) {
  return SEVERIDADES_PROBLEMA[s] || { label: s, clase: 'badge--neutral' };
}

export function estadoAccionInfo(e) {
  return ESTADOS_ACCION[e] || { label: e, clase: 'badge--neutral' };
}
