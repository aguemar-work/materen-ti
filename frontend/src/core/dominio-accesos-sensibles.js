// Vocabulario del dominio "accesos sensibles": categoría de la credencial.
// Mismo patrón que dominio-equipos.js (SITUACIONES_EQUIPO/situacionInfo).

import { claseBadge, TONO_CATEGORIA_ACCESO_SENSIBLE as TC } from './tonos.js';

export const CATEGORIAS_ACCESO_SENSIBLE = {
  equipos: { label: 'Equipos', clase: claseBadge(TC.equipos) },
  correos: { label: 'Correos', clase: claseBadge(TC.correos) },
  otro:    { label: 'Otro', clase: claseBadge(TC.otro) },
};

export function categoriaAccesoSensibleInfo(categoria) {
  return CATEGORIAS_ACCESO_SENSIBLE[categoria] || { label: categoria, clase: '' };
}
