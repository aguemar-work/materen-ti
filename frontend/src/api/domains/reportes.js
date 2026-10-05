// Dominio reportes: TODO el cálculo vive en Postgres (migración 115). Este
// archivo solo llama a las RPC y traduce errores; ningún promedio, tasa ni
// "resuelto" se calcula en el cliente (principio del análisis de reportes del
// Ciclo 21: una métrica = una definición escrita = una consulta).
//
//   · reporte_tickets(p_desde date, p_hasta date, p_tecnico uuid) → jsonb con
//     volumen, atención (horas corridas), calidad, por técnico (solo lo recibe
//     el JEFE: llega null para el resto), anexos, detalle de tickets y la
//     comparación con el período anterior (solo períodos completos).
//   · reporte_satisfaccion_consolidado() → histórico de satisfacción con la
//     MISMA muestra mínima (csat_muestra_minima) que el reporte por período.
//
// Las fechas viajan como 'YYYY-MM-DD' de calendario y el servidor arma el
// rango en hora de Lima: el navegador no decide ningún corte.
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

  // Consolidado histórico de satisfacción (todo el tiempo, sin recorte): la
  // RPC devuelve respuestas, por solicitante, por técnico y por mes, cada
  // promedio ya con su `muestra`, `insuficiente` y la `muestraMinima` vigente.
  async obtenerSatisfaccionConsolidado() {
    const { data, error } = await getClient().database.rpc('reporte_satisfaccion_consolidado');
    if (error) throw anotarErrorDb(error, { porDefecto: 'No se pudo cargar la satisfacción de tickets.' });
    const r = (Array.isArray(data) ? data[0] : data) || {};
    return {
      muestraMinima: r.muestraMinima ?? 5,
      resumen: r.resumen || null,
      respuestas: r.respuestas || [],
      porSolicitante: r.porSolicitante || [],
      porTecnico: r.porTecnico || [],
      porMes: r.porMes || [],
    };
  },
};
