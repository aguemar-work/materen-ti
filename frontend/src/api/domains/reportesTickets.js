// Dominio reportes de tickets: agregaciones para el modal "Reporte" del
// módulo de tickets (volumen/distribución, desempeño por técnico y
// satisfacción). Sin cambios de esquema: como `tickets` no guarda un
// timestamp por estado, "resueltos en el periodo" se deriva de
// ticket_eventos (evento estado_cambiado con detalle 'a "resuelto"').
import { getClient } from '../client.js';

export const reportesTicketsApi = {
  async obtenerReporteTickets({ desde, hasta }) {
    const db = getClient().database;

    const [creadosRes, resueltosEvRes, satisfaccionRes] = await Promise.all([
      db.from('tickets')
        .select('id, estado, prioridad, categorias_ticket(nombre)')
        .gte('created_at', desde)
        .lte('created_at', hasta),
      db.from('ticket_eventos')
        .select('ticket_id')
        .eq('evento', 'estado_cambiado')
        .ilike('detalle', '%a "resuelto"%')
        .gte('created_at', desde)
        .lte('created_at', hasta),
      db.from('ticket_satisfaccion')
        .select('nivel, comentario, fecha_envio')
        .gte('fecha_envio', desde)
        .lte('fecha_envio', hasta),
    ]);
    if (creadosRes.error) throw creadosRes.error;
    if (resueltosEvRes.error) throw resueltosEvRes.error;
    if (satisfaccionRes.error) throw satisfaccionRes.error;

    const creados = creadosRes.data || [];
    const idsResueltos = [...new Set((resueltosEvRes.data || []).map((e) => e.ticket_id))];

    let resueltos = [];
    if (idsResueltos.length) {
      const { data, error } = await db.from('tickets').select('id, asignado_a').in('id', idsResueltos);
      if (error) throw error;
      resueltos = data || [];
    }

    const porTecnico = {};
    for (const t of resueltos) {
      const clave = t.asignado_a || 'sin_asignar';
      porTecnico[clave] = (porTecnico[clave] || 0) + 1;
    }

    const encuestas = satisfaccionRes.data || [];
    const respondidas = encuestas.filter((e) => e.nivel !== null);
    const promedioSatisfaccion = respondidas.length
      ? respondidas.reduce((acc, e) => acc + e.nivel, 0) / respondidas.length
      : null;

    return {
      totalCreados: creados.length,
      totalResueltos: resueltos.length,
      porCategoria: contarPor(creados, (t) => t.categorias_ticket?.nombre || 'Sin categoría'),
      porPrioridad: contarPor(creados, (t) => t.prioridad),
      porEstado: contarPor(creados, (t) => t.estado),
      porTecnico,
      encuestasEnviadas: encuestas.length,
      encuestasRespondidas: respondidas.length,
      promedioSatisfaccion,
      comentarios: respondidas
        .filter((e) => e.comentario)
        .sort((a, b) => new Date(b.fecha_envio) - new Date(a.fecha_envio))
        .map((e) => ({ nivel: e.nivel, comentario: e.comentario, fecha: e.fecha_envio })),
    };
  },
};

function contarPor(lista, fnClave) {
  const mapa = {};
  for (const item of lista) {
    const clave = fnClave(item) || 'Sin definir';
    mapa[clave] = (mapa[clave] || 0) + 1;
  }
  return Object.entries(mapa)
    .map(([clave, cantidad]) => ({ clave, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}
