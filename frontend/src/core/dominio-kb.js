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
