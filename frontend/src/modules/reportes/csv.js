// CSV único del reporte de tickets: las filas de `tickets` que ya vienen en el
// jsonb de reporte_tickets (creados o resueltos en el período), sin volver a
// consultar nada. Desde la 117 también es la exportación que antes daba la
// bandeja de Tickets («Exportar datos»): suma el título y quién lo tiene
// asignado hoy (la bandeja ya lo mostraba a todo el módulo). Nunca lleva DNI ni
// contacto (el servidor no los envía); el nombre de quien RESOLVIÓ solo va
// cuando el servidor entregó la sección por técnico (es decir, al JEFE): para
// el resto la columna no existe.
import { formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, prioridadInfo } from '../../core/dominio-tickets.js';

const TIPO = { incidente: 'Incidente', solicitud: 'Solicitud' };
const EN_PERIODO = { creado: 'Creado', resuelto: 'Resuelto', ambos: 'Creado y resuelto' };

function cabecera(conTecnico) {
  return [
    'Código', 'Título', 'En el período', 'Creado', 'Resuelto', 'Horas corridas', 'Estado', 'Prioridad', 'Tipo',
    'Nivel', 'Categoría', 'Subcategoría', 'Área', 'Solicitante', 'Asignado hoy', ...(conTecnico ? ['Resolvió'] : []), 'Encuesta (1-5)',
  ];
}

/**
 * @param {object} reporte   jsonb de reporte_tickets
 * @param {object} opciones  { nombresStaff: {user_id: nombre} } para rotular «Asignado hoy»
 * @returns {{ cabecera: string[], filas: string[][] }}
 */
export function filasCsvReporte(reporte, { nombresStaff = {} } = {}) {
  const conTecnico = Array.isArray(reporte?.por_tecnico);
  const nombres = new Map((reporte?.por_tecnico || []).map((t) => [t.tecnico_id, t.nombre || 'Sin registrar']));
  const filas = (reporte?.tickets || []).map((t) => [
    t.codigo,
    t.titulo || '',
    EN_PERIODO[t.en_periodo] || '',
    t.created_at ? formatFechaHora(t.created_at) : '',
    t.resuelto_at ? formatFechaHora(t.resuelto_at) : '',
    t.horas_resolucion == null ? '' : String(t.horas_resolucion),
    estadoInfo(t.estado).label,
    prioridadInfo(t.prioridad).label,
    TIPO[t.tipo] || 'Sin clasificar',
    t.nivel_atencion || 'Sin nivel',
    t.categoria || 'Sin categoría',
    t.subcategoria || '',
    t.area || 'Sin registrar',
    t.solicitante || 'Sin vincular',
    t.asignado_a ? (nombresStaff[t.asignado_a] || 'Staff') : 'Sin asignar',
    ...(conTecnico ? [t.tecnico_id ? (nombres.get(t.tecnico_id) || 'Sin registrar') : ''] : []),
    t.encuesta_nivel == null ? '' : String(t.encuesta_nivel),
  ]);
  return { cabecera: cabecera(conTecnico), filas };
}
