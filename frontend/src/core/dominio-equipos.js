// Vocabulario del dominio equipos: situación derivada y estado físico.
// Única fuente — antes vivía solo en EquiposView.vue.

import { claseBadge, TONO_SITUACION_EQUIPO as TS, TONO_ESTADO_FISICO_EQUIPO as TF } from './tonos.js';

export const SITUACIONES_EQUIPO = {
  disponible:    { label: 'Disponible',     clase: claseBadge(TS.disponible) },
  asignado:      { label: 'Asignado',       clase: claseBadge(TS.asignado) },
  en_ubicacion:  { label: 'En ubicación',   clase: claseBadge(TS.en_ubicacion) },
  en_reparacion: { label: 'En reparación',  clase: claseBadge(TS.en_reparacion) },
  de_baja:       { label: 'De baja',        clase: claseBadge(TS.de_baja) },
  perdido:       { label: 'Robado/Perdido', clase: claseBadge(TS.perdido) },
};

// Estado FÍSICO (`equipos.estado`). 'operativo' no es una situación derivada
// (disponible/asignado/en_ubicacion lo cubren), por eso tiene su propio mapa.
export const ESTADOS_FISICO_EQUIPO = {
  operativo:     { label: 'Operativo',      clase: claseBadge(TF.operativo) },
  en_reparacion: { label: 'En reparación',  clase: claseBadge(TF.en_reparacion) },
  de_baja:       { label: 'De baja',        clase: claseBadge(TF.de_baja) },
  perdido:       { label: 'Robado/Perdido', clase: claseBadge(TF.perdido) },
};

export function situacionInfo(situacion) {
  return SITUACIONES_EQUIPO[situacion] || { label: situacion, clase: '' };
}
