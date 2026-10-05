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

// Tope de fotos por equipo. ⚠️ Duplicado a propósito como MAX_FOTOS_POR_EQUIPO en
// functions/equipos-fotos.ts (ahí es el tope real; acá oculta el botón): los dos
// valores se mueven JUNTOS.
export const MAX_FOTOS_EQUIPO = 4;

/** "Laptop Dell Latitude 5440": tipo, marca y modelo en una línea. */
export function nombreEquipo(equipo) {
  return [equipo.tipo_nombre, equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'Equipo sin descripción';
}

/** Etiqueta y clase de tag del estado físico de un equipo (`equipos.estado`). */
export function estadoFisicoInfo(equipo) {
  return ESTADOS_FISICO_EQUIPO[equipo.estado] || { label: equipo.estado, clase: '' };
}

/** ¿Estado terminal que se sella en la carátula? (de baja, perdido). */
export function selloDeEquipo(equipo) {
  if (equipo.estado === 'de_baja') return { tono: 'neutro', texto: 'De baja' };
  if (equipo.estado === 'perdido') return { tono: 'critico', texto: 'Perdido o robado' };
  return null;
}
