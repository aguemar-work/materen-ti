// Vocabulario del dominio empleados — antes copiado en Dashboard,
// EmpleadosView y EmpleadoDetalleView.
// Mismo patrón que dominio-kb.js/dominio-tickets.js/dominio-equipos.js:
// el mapa es la única fuente y `*Info()` resuelve con fallback (hasta
// ago 2026 este archivo era el único de los 7 dominios que lo hacía con
// una cadena de if/else, ver ARQ-12 en docs/HISTORIAL-AUDITORIAS.md).
//
// Las claves son los valores del enum `estado_empleado` de Postgres
// (`Activo`/`Inactivo`/`Suspendido`, capitalizados en la base — ver
// docs/PANORAMA-SISTEMA.md §2).

import { claseBadge, TONO_ESTADO_EMPLEADO as TE } from './tonos.js';

export const ESTADOS_EMPLEADO = {
  Activo:     { label: 'Activo',     clase: claseBadge(TE.Activo) },
  Suspendido: { label: 'Suspendido', clase: claseBadge(TE.Suspendido) },
  Inactivo:   { label: 'Inactivo',   clase: claseBadge(TE.Inactivo) },
};

export function estadoEmpleadoInfo(estado) {
  return ESTADOS_EMPLEADO[estado] || { label: estado, clase: 'badge--neutral' };
}

export function nombreCompleto(emp) {
  if (!emp) return '';
  return `${emp.nombres} ${emp.apellidos}`.trim();
}

// El alta de un empleado (qué pasos tiene y cuáles faltan) ya no se deriva en el
// cliente: es una SOLICITUD de alta guardada por el servidor (migración 108,
// core/dominio-solicitudes.js). Los antiguos `altaIncompleta()`, `pasosAlta()`,
// `altaLista()` y `DIAS_VENTANA_ALTA` se retiraron con ella.

// Acciones del expediente según el estado del empleado (migración 102). Una
// sola es sólida; el resto, outline o dentro del menú "Más". Los ids los
// resuelve la vista (EmpleadoCaratula) a etiqueta, ícono y manejador.
//   Activo      → Dar de baja · Editar (sólida)   · Más: Suspender, Revisar accesos, Imprimir
//   Suspendido  → Editar · Reactivar (sólida)     · Más: Dar de baja, Revisar accesos, Imprimir
//   Inactivo    → Editar · Reactivar · Reingresar (sólida) · Más: Revisar accesos, Imprimir
export function accionesExpediente(estado) {
  switch (estado) {
    case 'Activo':
      return { botones: ['baja', 'editar'], solida: 'editar', menu: ['suspender', 'revisar', 'imprimir'] };
    case 'Suspendido':
      return { botones: ['editar', 'reactivar'], solida: 'reactivar', menu: ['baja', 'revisar', 'imprimir'] };
    case 'Inactivo':
      return { botones: ['editar', 'reactivar', 'reingresar'], solida: 'reingresar', menu: ['revisar', 'imprimir'] };
    default:
      return { botones: ['editar'], solida: 'editar', menu: ['imprimir'] };
  }
}
