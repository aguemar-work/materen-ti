// Punto único para resolver label + clase de badge según el dominio.
// Los mapas viven en dominio-*.js; este módulo solo despacha.
import { estadoEmpleadoInfo } from './dominio-empleados.js';
import { estadoInfo, prioridadInfo } from './dominio-tickets.js';
import { situacionInfo } from './dominio-equipos.js';
import { categoriaAccesoSensibleInfo } from './dominio-accesos-sensibles.js';
import { estadoKbInfo } from './dominio-kb.js';
import { estadoProblemaInfo, severidadProblemaInfo, estadoAccionInfo } from './dominio-problemas.js';
import {
  claseBadge,
  TONO_TIPO_CUENTA,
  TONO_TIPO_UBICACION,
  TONO_ACTIVO_STAFF,
  TONO_TICKET_SIN_VINCULAR,
} from './tonos.js';

// El tono de cada valor sale SIEMPRE de core/tonos.js (mapa único, regla 24):
// acá y en los dominio-*.js solo se pone la etiqueta.

const TIPOS_CUENTA = {
  compartida: { label: 'Compartido', clase: claseBadge(TONO_TIPO_CUENTA.compartida) },
  reutilizable: { label: 'Reutilizable', clase: claseBadge(TONO_TIPO_CUENTA.reutilizable) },
  personal: { label: 'Personal', clase: claseBadge(TONO_TIPO_CUENTA.personal) },
};

// ubicaciones.tipo (migración 059): clasifica el catálogo físico — no
// confundir con areas_obras (función/asignación laboral, sin tipo propio).
const TIPOS_UBICACION = {
  sede: { label: 'Sede', clase: claseBadge(TONO_TIPO_UBICACION.sede) },
  almacen: { label: 'Almacén', clase: claseBadge(TONO_TIPO_UBICACION.almacen) },
  obra: { label: 'Obra', clase: claseBadge(TONO_TIPO_UBICACION.obra) },
  otro: { label: 'Otro', clase: claseBadge(TONO_TIPO_UBICACION.otro) },
};

/** @returns {{ label: string, clase: string }} */
export function badgeInfo(tipo, valor) {
  switch (tipo) {
    case 'empleado':
      return estadoEmpleadoInfo(valor);
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
    case 'tipo_ubicacion':
      return TIPOS_UBICACION[valor] || { label: valor, clase: 'badge--neutral' };
    case 'activo_staff': {
      const on = valor === true || valor === 'true';
      return {
        label: on ? 'Activo' : 'Inactivo',
        clase: claseBadge(on ? TONO_ACTIVO_STAFF.activo : TONO_ACTIVO_STAFF.inactivo),
      };
    }
    case 'ticket_sin_vincular':
      return { label: 'Sin vincular', clase: claseBadge(TONO_TICKET_SIN_VINCULAR) };
    default:
      return { label: valor, clase: 'badge--neutral' };
  }
}
