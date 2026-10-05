// Vocabulario del dominio Base de Conocimiento: ciclo de vida del artículo.
// Única fuente — mismo patrón que dominio-tickets.js/dominio-equipos.js.

import { claseBadge, TONO_ESTADO_KB as TK } from './tonos.js';

export const ESTADOS_KB = {
  borrador:    { label: 'Borrador',      clase: claseBadge(TK.borrador) },
  en_revision: { label: 'En revisión',   clase: claseBadge(TK.en_revision) },
  publicado:   { label: 'Publicado',     clase: claseBadge(TK.publicado) },
  obsoleto:    { label: 'Obsoleto',      clase: claseBadge(TK.obsoleto) },
};

export const OPCIONES_ESTADO_KB = Object.entries(ESTADOS_KB)
  .map(([valor, v]) => ({ valor, label: v.label }));

export function estadoKbInfo(e) {
  return ESTADOS_KB[e] || { label: e, clase: 'badge--neutral' };
}

// Tipo de artículo (migración 106, KEDB). No es un estado sino una categoría
// del contenido: se pinta con el tono `categoria` de core/tonos.js.
//   solucion      arreglo definitivo (el de siempre)
//   workaround    solución provisional de un problema (error conocido)
//   procedimiento paso a paso recurrente
export const TIPOS_KB = {
  solucion:      { label: 'Solución',      tono: 'categoria' },
  workaround:    { label: 'Workaround',    tono: 'categoria' },
  procedimiento: { label: 'Procedimiento', tono: 'categoria' },
};

export const TIPO_KB_POR_DEFECTO = 'solucion';

export const OPCIONES_TIPO_KB = Object.entries(TIPOS_KB)
  .map(([valor, v]) => ({ valor, label: v.label }));

export function tipoKbInfo(t) {
  return TIPOS_KB[t] || { label: t || TIPOS_KB[TIPO_KB_POR_DEFECTO].label, tono: 'categoria' };
}
