// Vocabulario del dominio Gestión de Problemas: ciclo de vida del problema
// y de sus acciones correctivas. Único origen — mismo patrón que
// dominio-tickets.js/dominio-kb.js.

import { claseBadge, TONO_ESTADO_PROBLEMA as TEP, TONO_SEVERIDAD_PROBLEMA as TSP, TONO_ESTADO_ACCION as TEA } from './tonos.js';

export const ESTADOS_PROBLEMA = {
  abierto:     { label: 'Abierto',      clase: claseBadge(TEP.abierto) },
  diagnostico: { label: 'Diagnóstico',  clase: claseBadge(TEP.diagnostico) },
  acciones:    { label: 'Acciones',     clase: claseBadge(TEP.acciones) },
  cerrado:     { label: 'Cerrado',      clase: claseBadge(TEP.cerrado) },
};

export const OPCIONES_ESTADO_PROBLEMA = Object.entries(ESTADOS_PROBLEMA)
  .map(([valor, v]) => ({ valor, label: v.label }));

export const ESTADOS_PROBLEMA_ABIERTOS = ['abierto', 'diagnostico', 'acciones'];

// Severidad = misma escala que la prioridad de ticket (rango escrito, neutra
// salvo 'Crítica'). El modificador `badge--rango` la separa de un estado que
// se pinte al lado aunque ambos sean neutros.
export const SEVERIDADES_PROBLEMA = {
  baja:     { label: 'Baja',     clase: claseBadge(TSP.baja, { rango: true }) },
  media:    { label: 'Media',    clase: claseBadge(TSP.media, { rango: true }) },
  alta:     { label: 'Alta',     clase: claseBadge(TSP.alta, { rango: true }) },
  critica:  { label: 'Crítica',  clase: claseBadge(TSP.critica, { rango: true }) },
};

export const OPCIONES_SEVERIDAD_PROBLEMA = Object.entries(SEVERIDADES_PROBLEMA)
  .map(([valor, v]) => ({ valor, label: v.label }));

export const ESTADOS_ACCION = {
  pendiente:    { label: 'Pendiente',    clase: claseBadge(TEA.pendiente) },
  en_progreso:  { label: 'En progreso',  clase: claseBadge(TEA.en_progreso) },
  completada:   { label: 'Completada',   clase: claseBadge(TEA.completada) },
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
