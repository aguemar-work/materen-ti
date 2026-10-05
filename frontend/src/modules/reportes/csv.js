// CSV único del reporte: las filas de `tickets` que ya vienen en el jsonb de
// reporte_tickets (creados o resueltos en el período), sin volver a consultar
// nada. Nunca lleva DNI ni contacto (el servidor no los envía); el nombre de
// quien resolvió solo va cuando el servidor entregó la sección por técnico
// (es decir, cuando el rol lo permite): para el resto la columna no existe.
import { formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, prioridadInfo } from '../../core/dominio-tickets.js';

const TIPO = { incidente: 'Incidente', solicitud: 'Solicitud' };
const EN_PERIODO = { creado: 'Creado', resuelto: 'Resuelto', ambos: 'Creado y resuelto' };

function cabecera(conTecnico) {
  return [
    'Código', 'En el período', 'Creado', 'Resuelto', 'Horas corridas', 'Estado', 'Prioridad', 'Tipo',
    'Nivel', 'Categoría', 'Subcategoría', 'Área', 'Solicitante', ...(conTecnico ? ['Resolvió'] : []), 'Encuesta (1-5)',
  ];
}

/**
 * @param {object} reporte  jsonb de reporte_tickets
 * @returns {{ cabecera: string[], filas: string[][] }}
 */
export function filasCsvReporte(reporte) {
  const conTecnico = Array.isArray(reporte?.por_tecnico);
  const nombres = new Map((reporte?.por_tecnico || []).map((t) => [t.tecnico_id, t.nombre || 'Sin registrar']));
  const filas = (reporte?.tickets || []).map((t) => [
    t.codigo,
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
    ...(conTecnico ? [t.tecnico_id ? (nombres.get(t.tecnico_id) || 'Sin registrar') : ''] : []),
    t.encuesta_nivel == null ? '' : String(t.encuesta_nivel),
  ]);
  return { cabecera: cabecera(conTecnico), filas };
}
