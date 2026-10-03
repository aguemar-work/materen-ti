// COPIA CONGELADA de la aritmética del modal "Reporte de tickets" tal como
// vivía en frontend/src/api/domains/reportesTickets.js hasta el 2026-10-03
// (retirado por la migración 115 y el módulo Reportes). Existe SOLO para que
// scripts/paridad-reporte-tickets.mjs pueda comparar, sobre los mismos datos,
// lo que el modal habría mostrado contra lo que devuelve reporte_tickets(), y
// explicar cada diferencia por su causa. No la importa ninguna pantalla; no se
// corrige ni se mejora: si se toca, deja de ser el punto de comparación.
//
// Definiciones que replicaba el modal (ver análisis-reportes.md §1.1):
//   · "Resuelto" = ticket con al menos un evento estado_cambiado → "resuelto"
//     dentro del período (por fecha del EVENTO): un ticket resuelto en dos
//     períodos distintos contaba en los dos.
//   · El período llegaba en UTC desde el navegador (toISOString); acá se recibe
//     [desde, hasta] como instantes y se compara created_at ISO.
//   · Tiempos: horas corridas desde created_at al último evento "resuelto".
//   · Tasa de reapertura: eventos "reabierto" del período (incluidos los que
//     salían de "rechazado") / resueltos del período.
//   · Satisfacción: encuestas con created_at (generación) en el período y
//     fecha_envio no nulo; sin muestra mínima.

export function destinoDeCambio(detalle) {
  return /a "(\w+)"\s*$/.exec(String(detalle || ''))?.[1] || null;
}

export function esRespondida(encuesta) {
  return encuesta.fecha_envio !== null && encuesta.fecha_envio !== undefined;
}

export function resolucionesPorTicket(eventos) {
  const resoluciones = new Map();
  const reaperturasPorTicket = new Map();
  let reaperturas = 0;
  for (const ev of eventos) {
    const destino = destinoDeCambio(ev.detalle);
    if (destino === 'resuelto') {
      resoluciones.set(ev.ticket_id, { userId: ev.user_id, fecha: ev.created_at });
    } else if (destino === 'reabierto') {
      reaperturas += 1;
      reaperturasPorTicket.set(ev.ticket_id, (reaperturasPorTicket.get(ev.ticket_id) || 0) + 1);
    }
  }
  return { resoluciones, reaperturas, reaperturasPorTicket };
}

export function promedio(valores) {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

export function mediana(valores) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[mitad] : (orden[mitad - 1] + orden[mitad]) / 2;
}

export function calcularTiempos(resoluciones, datosResueltos) {
  const porId = new Map(datosResueltos.map((t) => [t.id, t]));
  const horas = [];
  for (const [ticketId, { fecha }] of resoluciones) {
    const ticket = porId.get(ticketId);
    if (!ticket) continue;
    const h = (new Date(fecha) - new Date(ticket.created_at)) / 3600000;
    if (!Number.isFinite(h) || h < 0) continue;
    horas.push(h);
  }
  return { promedio: promedio(horas), mediana: mediana(horas), muestra: horas.length };
}

/**
 * El resumen del modal para un período [desde, hasta] (instantes ISO), a
 * partir de las filas crudas que leía: tickets (id, created_at, estado),
 * eventos estado_cambiado (ticket_id, user_id, detalle, created_at) y
 * encuestas (ticket_id, nivel, fecha_envio, created_at).
 */
export function resumenModalLegado({ tickets, eventos, encuestas }, { desde, hasta }) {
  const enPeriodo = (iso) => iso >= desde && iso <= hasta;
  const creados = tickets.filter((t) => enPeriodo(t.created_at));
  const eventosPeriodo = eventos
    .filter((e) => e.evento === 'estado_cambiado' && enPeriodo(e.created_at))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const { resoluciones, reaperturas } = resolucionesPorTicket(eventosPeriodo);
  const tiempos = calcularTiempos(resoluciones, tickets);
  const encuestasPeriodo = encuestas.filter((e) => enPeriodo(e.created_at));
  const conNivel = encuestasPeriodo.filter((e) => esRespondida(e) && e.nivel !== null && e.nivel !== undefined);
  const creadosIds = new Set(creados.map((t) => t.id));
  let resueltosMismoPeriodo = 0;
  for (const id of resoluciones.keys()) if (creadosIds.has(id)) resueltosMismoPeriodo += 1;
  return {
    totalCreados: creados.length,
    totalResueltos: resoluciones.size,
    resueltosMismoPeriodo,
    resueltosArrastrados: resoluciones.size - resueltosMismoPeriodo,
    resueltosIds: [...resoluciones.keys()],
    tiempoResolucion: tiempos,
    reaperturas,
    tasaReapertura: resoluciones.size ? Math.round((reaperturas / resoluciones.size) * 100) : null,
    encuestasGeneradas: encuestasPeriodo.length,
    encuestasRespondidas: encuestasPeriodo.filter(esRespondida).length,
    promedioSatisfaccion: promedio(conNivel.map((e) => e.nivel)),
    muestraSatisfaccion: conNivel.length,
  };
}
