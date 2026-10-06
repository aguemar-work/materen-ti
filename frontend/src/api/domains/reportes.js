// Dominio reportes: TODO el cálculo vive en Postgres (migración 115). Este
// archivo solo llama a las RPC y traduce errores; ningún promedio, tasa ni
// "resuelto" se calcula en el cliente (principio del análisis de reportes del
// Ciclo 21: una métrica = una definición escrita = una consulta).
//
//   · reporte_tickets(p_desde date, p_hasta date, p_tecnico uuid) → jsonb con
//     volumen, atención (horas corridas), calidad, por técnico (solo lo recibe
//     el JEFE: llega null para el resto), anexos, detalle de tickets y la
//     comparación con el período anterior (solo períodos completos).
//   · reporte_satisfaccion(p_desde, p_hasta) (118) → satisfacción de un
//     período o de todo el historial con la MISMA muestra mínima
//     (csat_muestra_minima) que el reporte de tickets.
//
// Las fechas viajan como 'YYYY-MM-DD' de calendario y el servidor arma el
// rango en hora de Lima: el navegador no decide ningún corte.
//
// Migración 117 (reportes centralizados): una RPC por reporte, todas con la
// misma forma — {generado_*, definiciones_version, periodo|null,
// periodo_completo, corte_at, parametros, avisos, secciones[{tablas}],
// filas_csv} — y con el guard del módulo de su fuente (auditoría: solo JEFE).
// Las secciones llegan listas para la hoja y el CSV sale del mismo jsonb, sin
// tope de filas: el cliente no suma, no pagina y no vuelve a consultar.
import { getClient } from '../client.js';
import { anotarErrorDb } from '../erroresDb.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function exigirFecha(valor, nombre) {
  if (!FECHA.test(String(valor || ''))) {
    throw new Error(`Indique la fecha "${nombre}" del período (AAAA-MM-DD).`);
  }
  return valor;
}

export const reportesApi = {
  /**
   * @param {{ desde: string, hasta: string, tecnicoId?: string|null }} p
   *   desde/hasta: 'YYYY-MM-DD' (calendario de Lima, ambos inclusive).
   *   tecnicoId: alcance de un técnico (el propio usuario, o cualquiera si es JEFE).
   */
  async obtenerReporteTickets({ desde, hasta, tecnicoId = null }) {
    const { data, error } = await getClient().database.rpc('reporte_tickets', {
      p_desde: exigirFecha(desde, 'desde'),
      p_hasta: exigirFecha(hasta, 'hasta'),
      p_tecnico: tecnicoId || null,
    });
    if (error) throw anotarErrorDb(error, { porDefecto: 'No se pudo generar el reporte.' });
    const reporte = Array.isArray(data) ? data[0] : data;
    if (!reporte || typeof reporte !== 'object') throw new Error('El servidor devolvió un reporte vacío.');
    return reporte;
  },

  // Satisfacción de la mesa de ayuda (migración 118): un período de Lima o,
  // sin fechas, todo el historial. La RPC devuelve resumen, por mes, por
  // solicitante (con lo que le falta responder y su situación), por técnico
  // (solo al JEFE: null para el resto) y las respuestas; cada % y promedio ya
  // viene con su muestra y la mínima vigente. Reemplaza al consolidado de la
  // 115 (reporte_satisfaccion_consolidado sigue en la base para el frontend
  // anterior).
  async obtenerReporteSatisfaccion({ desde = '', hasta = '' } = {}) {
    const args = desde || hasta ? periodo(desde, hasta) : { p_desde: null, p_hasta: null };
    const { data, error } = await getClient().database.rpc('reporte_satisfaccion', args);
    if (error) throw anotarErrorDb(error, { porDefecto: 'No se pudo cargar la satisfacción de tickets.' });
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      ...r,
      muestraMinima: r.muestraMinima ?? 5,
      resumen: r.resumen || null,
      respuestas: r.respuestas || [],
      porSolicitante: r.porSolicitante || [],
      porTecnico: Array.isArray(r.porTecnico) ? r.porTecnico : null,
      porMes: r.porMes || [],
    };
  },

  // ── Reportes centralizados (117) ──────────────────────────────────────────
  obtenerReporteInventario: () => llamar('reporte_inventario_equipos', {}),
  obtenerReporteLicencias: () => llamar('reporte_licencias', {}),
  obtenerReporteCorreos: () => llamar('reporte_correos', {}),
  obtenerReportePersonal: ({ desde, hasta }) => llamar('reporte_personal', periodo(desde, hasta)),
  obtenerReporteSolicitudes: ({ desde, hasta }) => llamar('reporte_solicitudes', periodo(desde, hasta)),
  obtenerReporteCambios: ({ desde, hasta }) => llamar('reporte_cambios', periodo(desde, hasta)),
  obtenerReporteProblemas: ({ desde, hasta }) => llamar('reporte_problemas', periodo(desde, hasta)),
  obtenerReporteAuditoria: ({ desde, hasta }) => llamar('reporte_auditoria', periodo(desde, hasta)),
  /** @param {{ rondaId?: string|null }} p  sin ronda: la más reciente con respuestas. */
  obtenerReporteEncuestas: ({ rondaId = null } = {}) => llamar('reporte_encuestas', { p_ronda: rondaId || null }),
};

function periodo(desde, hasta) {
  return { p_desde: exigirFecha(desde, 'desde'), p_hasta: exigirFecha(hasta, 'hasta') };
}

async function llamar(rpc, args) {
  const { data, error } = await getClient().database.rpc(rpc, args);
  if (error) throw anotarErrorDb(error, { porDefecto: 'No se pudo generar el reporte.' });
  const reporte = Array.isArray(data) ? data[0] : data;
  if (!reporte || typeof reporte !== 'object' || !Array.isArray(reporte.secciones)) {
    throw new Error('El servidor devolvió un reporte vacío.');
  }
  return reporte;
}
