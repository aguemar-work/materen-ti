// Forma del CSV de tickets — una sola definición, compartida por los TRES
// lugares que exportan la misma entidad: el botón "Exportar" de la toolbar de
// TicketsView.vue (bandeja con los filtros puestos) y las dos exportaciones de
// ReporteTicketsModal.vue (periodo del reporte y bandeja).
//
// Estaba solo dentro del modal (CABECERA_CSV + filaCsv locales). Al sumar el
// botón de la toolbar habrían quedado dos definiciones de la misma cabecera
// que se desincronizan a la primera columna nueva — que es exactamente lo que
// acaba de pasar con "Nivel".
import { formatFechaHora } from './formatters.js';
import { estadoInfo, prioridadInfo } from './dominio-tickets.js';

// Incluye "Sin clasificar" para los tickets viejos con tipo NULL (migración
// 035 lo agregó después de que ya hubiera tickets cargados).
const TIPO_LABELS = {
  incidente: 'Incidente',
  solicitud: 'Solicitud',
  sin_clasificar: 'Sin clasificar',
};

// "Nivel" se sumó en ago 2026, junto con la columna del mismo nombre en la
// tabla: el CSV espeja lo que se ve en pantalla. Es un cambio de forma del
// archivo — si alguien tenía una hoja de cálculo apuntando a posiciones
// fijas, la columna nueva la corre.
export const CABECERA_CSV_TICKETS = [
  'Código', 'Fecha', 'Solicitante', 'Título', 'Categoría',
  'Tipo', 'Estado', 'Prioridad', 'Nivel', 'Asignado a',
];

/**
 * @param {object} t         ticket con la forma de mapTicketResumen()
 * @param {object} staffPorId mapa user_id → nombre (insforgeApi.nombresStaff())
 */
export function filaCsvTicket(t, staffPorId = {}) {
  return [
    t.codigo,
    formatFechaHora(t.created_at),
    // Un ticket no vinculado tiene `solicitante` con el texto que escribió el
    // empleado, que no identifica a nadie — en el CSV se rotula como tal.
    t.vinculado === false ? 'Sin vincular' : (t.solicitante || 'Sin vincular'),
    t.titulo,
    t.categoria,
    TIPO_LABELS[t.tipo || 'sin_clasificar'] || '',
    estadoInfo(t.estado).label,
    prioridadInfo(t.prioridad).label,
    t.nivel_atencion || 'Sin nivel',
    t.asignado_a ? (staffPorId[t.asignado_a] || 'Staff') : 'Sin asignar',
  ];
}
