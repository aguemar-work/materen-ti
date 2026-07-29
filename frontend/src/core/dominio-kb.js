// Vocabulario del dominio Base de Conocimiento: ciclo de vida del artículo.
// Única fuente — mismo patrón que dominio-tickets.js/dominio-equipos.js.

export const ESTADOS_KB = {
  borrador:    { label: 'Borrador',      clase: 'badge--neutral' },
  en_revision: { label: 'En revisión',   clase: 'badge--warning' },
  publicado:   { label: 'Publicado',     clase: 'badge--success' },
  obsoleto:    { label: 'Obsoleto',      clase: 'badge--danger' },
};

export const OPCIONES_ESTADO_KB = Object.entries(ESTADOS_KB)
  .map(([valor, v]) => ({ valor, label: v.label }));

// Estados visibles para cualquier staff sin importar autoría (ver RLS de
// kb_articulos, migración 031): el resto solo lo ve el autor o el JEFE.
export const ESTADOS_KB_PUBLICOS = ['publicado', 'obsoleto'];

export function estadoKbInfo(e) {
  return ESTADOS_KB[e] || { label: e, clase: 'badge--neutral' };
}
