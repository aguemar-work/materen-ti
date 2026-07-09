// Vocabulario del dominio equipos: situación derivada y estado físico.
// Única fuente — antes vivía solo en EquiposView.vue.

export const SITUACIONES_EQUIPO = {
  disponible:    { label: 'Disponible',     clase: 'badge--success' },
  asignado:      { label: 'Asignado',       clase: 'badge--info' },
  en_ubicacion:  { label: 'En ubicación',   clase: 'badge--purple' },
  en_reparacion: { label: 'En reparación',  clase: 'badge--warning' },
  de_baja:       { label: 'De baja',        clase: 'badge--neutral' },
  perdido:       { label: 'Robado/Perdido', clase: 'badge--danger' },
};

export function situacionInfo(situacion) {
  return SITUACIONES_EQUIPO[situacion] || { label: situacion, clase: '' };
}
