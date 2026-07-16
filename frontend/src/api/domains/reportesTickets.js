// Dominio reportes de tickets: agregaciones para el modal "Reporte" del
// módulo de tickets (volumen/distribución, desempeño por técnico y
// satisfacción). Sin cambios de esquema:
// - "Resueltos en el periodo" se deriva de ticket_eventos (evento
//   estado_cambiado con detalle 'a "resuelto"'); el técnico es el user_id
//   del evento (quien marcó resuelto), no el asignado_a actual del ticket,
//   que puede cambiar después (reabierto + reasignado).
// - En ticket_satisfaccion, created_at es cuando se generó la encuesta (al
//   cerrar el ticket) y fecha_envio es la fecha de RESPUESTA del empleado
//   (NULL = pendiente). "Enviadas en el periodo" filtra por created_at.
import { getClient } from '../client.js';

export const reportesTicketsApi = {
  async obtenerReporteTickets({ desde, hasta }) {
    const db = getClient().database;

    const [creadosRes, resueltosEvRes, satisfaccionRes] = await Promise.all([
      db.from('tickets')
        .select('id, codigo, estado, prioridad, vinculado, contacto_ingresado, empleados(nombres, apellidos), categorias_ticket(nombre)')
        .gte('created_at', desde)
        .lte('created_at', hasta)
        .order('created_at', { ascending: false }),
      db.from('ticket_eventos')
        .select('ticket_id, user_id, created_at')
        .eq('evento', 'estado_cambiado')
        .ilike('detalle', '%a "resuelto"%')
        .gte('created_at', desde)
        .lte('created_at', hasta)
        .order('created_at', { ascending: true }),
      db.from('ticket_satisfaccion')
        .select('nivel, comentario, fecha_envio')
        .gte('created_at', desde)
        .lte('created_at', hasta),
    ]);
    if (creadosRes.error) throw creadosRes.error;
    if (resueltosEvRes.error) throw resueltosEvRes.error;
    if (satisfaccionRes.error) throw satisfaccionRes.error;

    const creados = creadosRes.data || [];

    // Un ticket cuenta una sola vez aunque se resuelva varias veces en el
    // periodo (reabierto): se atribuye a quien lo marcó resuelto por última vez.
    const resueltoPor = new Map();
    for (const ev of resueltosEvRes.data || []) resueltoPor.set(ev.ticket_id, ev.user_id);

    const porTecnico = {};
    for (const userId of resueltoPor.values()) {
      const clave = userId || 'sin_asignar';
      porTecnico[clave] = (porTecnico[clave] || 0) + 1;
    }

    const encuestas = satisfaccionRes.data || [];
    const respondidas = encuestas.filter((e) => e.nivel !== null);
    const promedioSatisfaccion = respondidas.length
      ? respondidas.reduce((acc, e) => acc + e.nivel, 0) / respondidas.length
      : null;

    // Estado de encuesta de los tickets creados en el periodo, para la tabla
    // de solicitantes (respondida / pendiente / sin encuesta).
    const encuestaPorTicket = new Map();
    if (creados.length) {
      const { data, error } = await db.from('ticket_satisfaccion')
        .select('ticket_id, fecha_envio')
        .in('ticket_id', creados.map((t) => t.id));
      if (error) throw error;
      for (const e of data || []) encuestaPorTicket.set(e.ticket_id, e.fecha_envio ? 'respondida' : 'pendiente');
    }

    return {
      totalCreados: creados.length,
      totalResueltos: resueltoPor.size,
      porCategoria: contarPor(creados, (t) => t.categorias_ticket?.nombre || 'Sin categoría'),
      porPrioridad: contarPor(creados, (t) => t.prioridad),
      porEstado: contarPor(creados, (t) => t.estado),
      porTecnico,
      ticketsPeriodo: creados.map((t) => ({
        codigo: t.codigo,
        solicitante: t.vinculado
          ? (t.empleados ? `${t.empleados.nombres} ${t.empleados.apellidos}`.trim() : (t.contacto_ingresado || ''))
          : 'Sin vincular',
        encuesta: encuestaPorTicket.get(t.id) || null,
      })),
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
