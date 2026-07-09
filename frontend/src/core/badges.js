// Punto único para resolver label + clase de badge según el dominio.
// Los mapas viven en dominio-*.js; este módulo solo despacha.
import { claseEstado } from './dominio-empleados.js';
import { estadoInfo, prioridadInfo } from './dominio-tickets.js';
import { situacionInfo } from './dominio-equipos.js';

const TIPOS_CUENTA = {
  compartida: { label: 'Compartido', clase: 'badge--accent' },
  reutilizable: { label: 'Reutilizable', clase: 'badge--success' },
  personal: { label: 'Personal', clase: 'badge--teal' },
};

/** @returns {{ label: string, clase: string }} */
export function badgeInfo(tipo, valor) {
  switch (tipo) {
    case 'empleado':
      return { label: valor, clase: claseEstado(valor) };
    case 'ticket':
      return estadoInfo(valor);
    case 'prioridad':
      return prioridadInfo(valor);
    case 'situacion':
      return situacionInfo(valor);
    case 'tipo_cuenta':
      return TIPOS_CUENTA[valor] || { label: valor, clase: 'badge--neutral' };
    case 'activo_staff': {
      const on = valor === true || valor === 'true';
      return { label: on ? 'Activo' : 'Inactivo', clase: on ? 'badge--success' : 'badge--neutral' };
    }
    default:
      return { label: valor, clase: 'badge--neutral' };
  }
}
