// Vocabulario del dominio "accesos sensibles": categoría de la credencial.
// Mismo patrón que dominio-equipos.js (SITUACIONES_EQUIPO/situacionInfo).

export const CATEGORIAS_ACCESO_SENSIBLE = {
  equipos: { label: 'Equipos', clase: 'badge--sky' },
  correos: { label: 'Correos', clase: 'badge--purple' },
  otro:    { label: 'Otro', clase: 'badge--neutral' },
};

export function categoriaAccesoSensibleInfo(categoria) {
  return CATEGORIAS_ACCESO_SENSIBLE[categoria] || { label: categoria, clase: '' };
}
