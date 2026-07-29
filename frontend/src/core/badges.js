// Punto único para resolver label + clase de badge según el dominio.
// Los mapas viven en dominio-*.js; este módulo solo despacha.
import { claseEstado } from './dominio-empleados.js';
import { estadoInfo, prioridadInfo } from './dominio-tickets.js';
import { situacionInfo } from './dominio-equipos.js';
import { categoriaAccesoSensibleInfo } from './dominio-accesos-sensibles.js';
import { estadoKbInfo } from './dominio-kb.js';
import { estadoProblemaInfo, severidadProblemaInfo, estadoAccionInfo } from './dominio-problemas.js';

const TIPOS_CUENTA = {
  compartida: { label: 'Compartido', clase: 'badge--sky' },
  reutilizable: { label: 'Reutilizable', clase: 'badge--sky' },
  personal: { label: 'Personal', clase: 'badge--sky' },
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
    case 'categoria_acceso_sensible':
      return categoriaAccesoSensibleInfo(valor);
    case 'kb_estado':
      return estadoKbInfo(valor);
    case 'problema_estado':
      return estadoProblemaInfo(valor);
    case 'problema_severidad':
      return severidadProblemaInfo(valor);
    case 'accion_estado':
      return estadoAccionInfo(valor);
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
