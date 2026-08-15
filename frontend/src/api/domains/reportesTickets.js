// Dominio reportes de tickets: agregaciones para el modal "Reporte" del
// módulo de tickets. Sin cambios de esquema — todo sale de lo que ya registran
// tickets, ticket_eventos y ticket_satisfaccion.
//
// Criterios que hay que respetar al tocar este archivo:
// - "Resueltos en el periodo" se deriva de ticket_eventos: se leen TODOS los
//   'estado_cambiado' del periodo y se mira el estado destino con
//   destinoDeCambio(). No se filtra con un ilike sobre el texto del detalle:
//   así el reporte no se cae en silencio a 0 si cambia el texto del trigger, y
//   de paso las reaperturas salen de la misma consulta.
// - El técnico de una resolución es el user_id del evento (quien marcó
//   resuelto), no el asignado_a actual, que puede cambiar después.
// - 'rechazado' también es terminal, pero NO es una resolución (migración 017:
//   "terminal alterno desde abierto, sin encuesta"): columna propia.
// - En ticket_satisfaccion, created_at es cuando se GENERÓ la encuesta (al
//   cerrar el ticket) y fecha_envio es cuando el empleado la RESPONDIÓ. Ese es
//   el único criterio de "respondida" en todo el reporte.
// - La tasa de respuesta va contra las encuestas generadas: el correo no es el
//   único canal, el empleado también las alcanza buscando su ticket por DNI.
import { getClient } from '../client.js';
import { destinoDeCambio } from '../../core/dominio-tickets.js';

const ESTADOS_RESUELTO = ['resuelto', 'cerrado'];
const ESTADO_RECHAZADO = 'rechazado';

// Tope de comentarios que viajan al modal y al PDF: un mes cargado devolvía
// cientos y volvía el documento ilegible. Se informa el total aparte.
const MAX_COMENTARIOS = 20;

// Los filtros `in` viajan en la URL (~40 caracteres por UUID): con más de ~180
// tickets en el periodo la petición reventaba el límite de URL y el reporte
// entero fallaba con 414. Se trocea.
const TAM_LOTE = 100;

function lotes(lista, tam = TAM_LOTE) {
  const salida = [];
  for (let i = 0; i < lista.length; i += tam) salida.push(lista.slice(i, i + tam));
  return salida;
}

async function porLotes(ids, consulta) {
  const partes = await Promise.all(lotes(ids).map(async (lote) => {
    const { data, error } = await consulta(lote);
    if (error) throw error;
    return data || [];
  }));
  return partes.flat();
}

const SELECT_CREADOS = 'id, estado, prioridad, tipo, created_at, vinculado, contacto_ingresado, empleados(nombres, apellidos), categorias_ticket(nombre)';

export const reportesTicketsApi = {
  async obtenerReporteTickets({ desde, hasta }) {
    const db = getClient().database;

    const [creadosRes, eventosRes, satisfaccionRes, todosRes] = await Promise.all([
      db.from('tickets')
        .select(SELECT_CREADOS)
        .gte('created_at', desde)
        .lte('created_at', hasta)
        .order('created_at', { ascending: false }),
      db.from('ticket_eventos')
        .select('ticket_id, user_id, detalle, created_at')
        .eq('evento', 'estado_cambiado')
        .gte('created_at', desde)
        .lte('created_at', hasta)
        .order('created_at', { ascending: true }),
      db.from('ticket_satisfaccion')
        .select('nivel, comentario, fecha_envio')
        .gte('created_at', desde)
        .lte('created_at', hasta),
      // Sin filtro de fecha: la columna "Total" de la tabla por solicitante es
      // su histórico completo, no solo lo creado en este periodo.
      db.from('tickets').select('vinculado, contacto_ingresado, empleados(nombres, apellidos)'),
    ]);
    if (creadosRes.error) throw creadosRes.error;
    if (eventosRes.error) throw eventosRes.error;
    if (satisfaccionRes.error) throw satisfaccionRes.error;
    if (todosRes.error) throw todosRes.error;

    const creados = creadosRes.data || [];
    const eventos = eventosRes.data || [];

    // Un ticket cuenta una sola vez aunque se resuelva varias veces en el
    // periodo (reabierto): se atribuye a quien lo marcó resuelto por última vez.
    const { resoluciones, reaperturas } = resolucionesPorTicket(eventos);

    // De los resueltos del periodo, cuántos también se crearon en el mismo
    // periodo (vs. arrastrados de antes) — sin esto, "Resueltos" se leía como
    // si fuera lo mismo que "Creados", cuando puede ser un ticket de semanas
    // atrás que recién hoy se cerró.
    const creadosIds = new Set(creados.map((t) => t.id));
    let resueltosMismoPeriodo = 0;
    for (const id of resoluciones.keys()) {
      if (creadosIds.has(id)) resueltosMismoPeriodo += 1;
    }

    // Segunda ronda, en paralelo (las dos dependen de la primera pero no entre
    // ellas): el alta y la prioridad de los tickets resueltos —muchos se crearon
    // antes de la ventana, así que no están en `creados`— y el estado de encuesta
    // de los creados, para la tabla de solicitantes.
    const idsResueltos = [...resoluciones.keys()];
    const [datosResueltos, filasEncuesta] = await Promise.all([
      idsResueltos.length
        ? porLotes(idsResueltos, (lote) => db.from('tickets').select('id, codigo, titulo, created_at, prioridad').in('id', lote))
        : [],
      creados.length
        ? porLotes(creados.map((t) => t.id), (lote) => db.from('ticket_satisfaccion').select('ticket_id, fecha_envio').in('ticket_id', lote))
        : [],
    ]);

    const tiempos = calcularTiempos(resoluciones, datosResueltos);

    const encuestaPorTicket = new Map();
    for (const e of filasEncuesta) encuestaPorTicket.set(e.ticket_id, esRespondida(e) ? 'respondida' : 'pendiente');

    const totalHistoricoPorSolicitante = contarHistoricoPorSolicitante(todosRes.data || []);

    // Detalle de los resueltos que NO son de este periodo (venían de antes):
    // cuáles son, quién los cerró y cuánto llevaban abiertos.
    const porIdResueltos = new Map(datosResueltos.map((t) => [t.id, t]));
    const arrastrados = resumenArrastrados(resoluciones, porIdResueltos, creadosIds);

    const encuestas = satisfaccionRes.data || [];
    const respondidas = encuestas.filter(esRespondida);
    const conNivel = respondidas.filter((e) => e.nivel !== null);
    const promedioSatisfaccion = conNivel.length
      ? conNivel.reduce((acc, e) => acc + e.nivel, 0) / conNivel.length
      : null;

    const comentarios = respondidas
      .filter((e) => e.comentario && e.nivel !== null)
      .sort((a, b) => new Date(b.fecha_envio) - new Date(a.fecha_envio))
      .map((e) => ({ nivel: e.nivel, comentario: e.comentario, fecha: e.fecha_envio }));

    return {
      totalCreados: creados.length,
      totalResueltos: resoluciones.size,
      resueltosMismoPeriodo,
      resueltosArrastrados: resoluciones.size - resueltosMismoPeriodo,
      porCategoria: contarPor(creados, (t) => t.categorias_ticket?.nombre || 'Sin categoría'),
      porPrioridad: contarPor(creados, (t) => t.prioridad),
      porTipo: contarPor(creados, (t) => t.tipo || 'sin_clasificar'),
      porDia: contarPorDia(creados),
      porTecnico: contarPorTecnico(resoluciones, creadosIds),
      porSolicitante: resumenPorSolicitante(creados, encuestaPorTicket, totalHistoricoPorSolicitante),
      tiempoResolucion: tiempos.global,
      tiempoPorPrioridad: tiempos.porPrioridad,
      tiempoPorTecnico: tiempos.porTecnico,
      reaperturas,
      // Denominador = resueltos del periodo (no total creados).
      tasaReapertura: resoluciones.size ? Math.round((reaperturas / resoluciones.size) * 100) : null,
      arrastrados,
      encuestasGeneradas: encuestas.length,
      encuestasRespondidas: respondidas.length,
      promedioSatisfaccion,
      comentarios: comentarios.slice(0, MAX_COMENTARIOS),
      comentariosTotal: comentarios.length,
    };
  },

  // Resumen liviano para comparar con el periodo anterior: solo los cuatro
  // números de las tarjetas, sin distribuciones ni tablas.
  async obtenerResumenTickets({ desde, hasta }) {
    const db = getClient().database;

    const [creadosRes, eventosRes, satisfaccionRes] = await Promise.all([
      db.from('tickets').select('id').gte('created_at', desde).lte('created_at', hasta),
      db.from('ticket_eventos')
        .select('ticket_id, detalle')
        .eq('evento', 'estado_cambiado')
        .gte('created_at', desde)
        .lte('created_at', hasta),
      db.from('ticket_satisfaccion')
        .select('nivel, fecha_envio')
        .gte('created_at', desde)
        .lte('created_at', hasta),
    ]);
    if (creadosRes.error) throw creadosRes.error;
    if (eventosRes.error) throw eventosRes.error;
    if (satisfaccionRes.error) throw satisfaccionRes.error;

    const resueltos = new Set();
    for (const ev of eventosRes.data || []) {
      if (destinoDeCambio(ev.detalle) === 'resuelto') resueltos.add(ev.ticket_id);
    }

    const encuestas = satisfaccionRes.data || [];
    const conNivel = encuestas.filter((e) => esRespondida(e) && e.nivel !== null);

    return {
      totalCreados: (creadosRes.data || []).length,
      totalResueltos: resueltos.size,
      promedioSatisfaccion: conNivel.length
        ? conNivel.reduce((acc, e) => acc + e.nivel, 0) / conNivel.length
        : null,
      tasaRespuesta: encuestas.length
        ? Math.round((encuestas.filter(esRespondida).length / encuestas.length) * 100)
        : null,
    };
  },

  // Tickets del periodo para exportar a CSV (el recorte del reporte, no la
  // bandeja): trae los campos que la exportación necesita mostrar.
  async listarTicketsDelPeriodo({ desde, hasta }) {
    const { data, error } = await getClient().database
      .from('tickets')
      .select('codigo, titulo, estado, prioridad, tipo, created_at, asignado_a, vinculado, contacto_ingresado, empleados(nombres, apellidos), categorias_ticket(nombre)')
      .gte('created_at', desde)
      .lte('created_at', hasta)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map((t) => ({
      codigo: t.codigo,
      titulo: t.titulo,
      estado: t.estado,
      prioridad: t.prioridad,
      tipo: t.tipo,
      created_at: t.created_at,
      asignado_a: t.asignado_a,
      categoria: t.categorias_ticket?.nombre || '',
      solicitante: nombreSolicitante(t),
    }));
  },

  // Consolidado histórico de satisfacción (TODO el histórico, sin recorte de
  // fecha — a diferencia del resto de este archivo): todas las respuestas +
  // el resumen por solicitante y por técnico. Se trae todo de una sola vez y
  // se pagina/ordena en el cliente (vista ReporteSatisfaccionView.vue), a
  // propósito: como los dos resúmenes ya necesitan el histórico completo, no
  // tiene sentido pedirlo de nuevo página por página para la tabla.
  async obtenerSatisfaccionConsolidado() {
    const db = getClient().database;
    const { data, error } = await db.from('ticket_satisfaccion')
      .select('id, ticket_id, nivel, comentario, fecha_envio, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const encuestas = data || [];
    if (!encuestas.length) return { respuestas: [], porSolicitante: [], porTecnico: [] };

    const ticketIds = encuestas.map((e) => e.ticket_id);
    const [tickets, eventos] = await Promise.all([
      porLotes(ticketIds, (lote) => db.from('tickets')
        .select('id, codigo, titulo, empleado_id, empleados(nombres, apellidos)')
        .in('id', lote)),
      porLotes(ticketIds, (lote) => db.from('ticket_eventos')
        .select('ticket_id, user_id, detalle, created_at')
        .eq('evento', 'estado_cambiado')
        .in('ticket_id', lote)),
    ]);

    const ticketPorId = new Map(tickets.map((t) => [t.id, t]));
    const { resoluciones } = resolucionesPorTicket(eventos);

    const respuestas = encuestas.map((e) => {
      const ticket = ticketPorId.get(e.ticket_id);
      return {
        id: e.id,
        ticket_id: e.ticket_id,
        ticket_codigo: ticket?.codigo || '',
        ticket_titulo: ticket?.titulo || '',
        empleado_id: ticket?.empleado_id || null,
        solicitante: ticket?.empleados ? `${ticket.empleados.nombres} ${ticket.empleados.apellidos}`.trim() : 'Sin datos',
        tecnico_id: resoluciones.get(e.ticket_id)?.userId || null,
        nivel: e.nivel,
        comentario: e.comentario,
        fecha_envio: e.fecha_envio,
        created_at: e.created_at,
        respondida: esRespondida(e),
      };
    });

    return {
      respuestas,
      porSolicitante: resumenSatisfaccionPorSolicitante(respuestas),
      porTecnico: resumenSatisfaccionPorTecnico(respuestas),
    };
  },
};

// fecha_envio es el marcador explícito del esquema ("NULL = encuesta pendiente
// de respuesta"). Antes el KPI usaba `nivel` y la tabla `fecha_envio`: dos
// definiciones del mismo concepto en el mismo reporte.
export function esRespondida(encuesta) {
  return encuesta.fecha_envio !== null && encuesta.fecha_envio !== undefined;
}

export function nombreSolicitante(t) {
  if (!t.vinculado) return 'Sin vincular';
  if (t.empleados) return `${t.empleados.nombres} ${t.empleados.apellidos}`.trim();
  return t.contacto_ingresado || 'Sin vincular';
}

// Quién marcó resuelto cada ticket (y cuántas reaperturas hubo), a partir de
// los eventos 'estado_cambiado'. Extraído para reusarse tal cual en el
// reporte por periodo y en el consolidado histórico de satisfacción — es la
// misma regla de negocio (última resolución gana) en los dos lugares.
export function resolucionesPorTicket(eventos) {
  const resoluciones = new Map();   // ticket_id -> { userId, fecha }
  let reaperturas = 0;
  for (const ev of eventos) {
    const destino = destinoDeCambio(ev.detalle);
    if (destino === 'resuelto') resoluciones.set(ev.ticket_id, { userId: ev.user_id, fecha: ev.created_at });
    else if (destino === 'reabierto') reaperturas += 1;
  }
  return { resoluciones, reaperturas };
}

// Bajo esta cantidad de respuestas CON nivel, el promedio se sigue calculando
// pero la vista lo marca como poco confiable (un solo nivel 1 no debe leerse
// igual que un promedio sobre 20 respuestas).
export const MIN_MUESTRA_PROMEDIO = 3;

export function promedioYMuestra(niveles) {
  const conNivel = niveles.filter((n) => n !== null && n !== undefined);
  return {
    promedio: conNivel.length ? conNivel.reduce((a, b) => a + b, 0) / conNivel.length : null,
    muestra: conNivel.length,
  };
}

// Sin promedio (nadie respondió con nivel todavía) va al final, no al
// principio: no tiene sentido leerlo como "el peor".
export function ordenarPeorPrimero(filas) {
  return [...filas].sort((a, b) => {
    if (a.promedio === null && b.promedio === null) return b.encuestasGeneradas - a.encuestasGeneradas;
    if (a.promedio === null) return 1;
    if (b.promedio === null) return -1;
    return a.promedio - b.promedio;
  });
}

export function resumenSatisfaccionPorSolicitante(respuestas) {
  const mapa = new Map();
  for (const r of respuestas) {
    const clave = r.empleado_id || 'sin_empleado';
    if (!mapa.has(clave)) {
      mapa.set(clave, { empleado_id: r.empleado_id, nombre: r.solicitante, encuestasGeneradas: 0, encuestasRespondidas: 0, niveles: [] });
    }
    const fila = mapa.get(clave);
    fila.encuestasGeneradas += 1;
    if (r.respondida) fila.encuestasRespondidas += 1;
    fila.niveles.push(r.nivel);
  }
  const filas = [...mapa.values()].map((f) => ({
    empleado_id: f.empleado_id,
    nombre: f.nombre,
    encuestasGeneradas: f.encuestasGeneradas,
    encuestasRespondidas: f.encuestasRespondidas,
    ...promedioYMuestra(f.niveles),
  }));
  return ordenarPeorPrimero(filas);
}

export function resumenSatisfaccionPorTecnico(respuestas) {
  const mapa = new Map();
  for (const r of respuestas) {
    const clave = r.tecnico_id || 'sin_asignar';
    if (!mapa.has(clave)) {
      mapa.set(clave, { tecnico_id: r.tecnico_id, encuestasGeneradas: 0, encuestasRespondidas: 0, niveles: [] });
    }
    const fila = mapa.get(clave);
    fila.encuestasGeneradas += 1;
    if (r.respondida) fila.encuestasRespondidas += 1;
    fila.niveles.push(r.nivel);
  }
  const filas = [...mapa.values()].map((f) => ({
    tecnico_id: f.tecnico_id,
    encuestasGeneradas: f.encuestasGeneradas,
    encuestasRespondidas: f.encuestasRespondidas,
    ...promedioYMuestra(f.niveles),
  }));
  return ordenarPeorPrimero(filas);
}

// Por técnico, cuántos resolvió y de esos cuántos son de este mismo periodo
// vs. arrastrados de antes — mismo desglose que el KPI "Resueltos", pero por
// persona: no es lo mismo cerrar 5 tickets nuevos que 5 que venían de otros.
export function contarPorTecnico(resoluciones, creadosIds) {
  const porTecnico = {};
  for (const [ticketId, { userId }] of resoluciones) {
    const clave = userId || 'sin_asignar';
    if (!porTecnico[clave]) porTecnico[clave] = { total: 0, mismoPeriodo: 0, arrastrados: 0 };
    porTecnico[clave].total += 1;
    if (creadosIds.has(ticketId)) porTecnico[clave].mismoPeriodo += 1;
    else porTecnico[clave].arrastrados += 1;
  }
  return porTecnico;
}

// Detalle de los tickets resueltos en el periodo que NO se crearon en él: qué
// ticket es, quién lo cerró y cuánto llevaba abierto al momento de resolverse.
// Orden por antigüedad descendente: el más demorado primero.
export function resumenArrastrados(resoluciones, porIdResueltos, creadosIds) {
  const filas = [];
  for (const [ticketId, { userId, fecha }] of resoluciones) {
    if (creadosIds.has(ticketId)) continue;
    const info = porIdResueltos.get(ticketId);
    if (!info) continue;
    const diasAbierto = Math.floor((new Date(fecha) - new Date(info.created_at)) / 86400000);
    if (!Number.isFinite(diasAbierto)) continue;
    filas.push({ codigo: info.codigo, titulo: info.titulo, tecnicoId: userId, diasAbierto, creadoEn: info.created_at });
  }
  return filas.sort((a, b) => b.diasAbierto - a.diasAbierto);
}

// Tiempo de atención: de la creación del ticket al evento que lo marcó
// resuelto, en horas. Se reporta el promedio y la MEDIANA porque un solo
// ticket olvidado un mes desplaza el promedio y hace ver mal a todo el equipo.
export function calcularTiempos(resoluciones, datosResueltos) {
  const porId = new Map(datosResueltos.map((t) => [t.id, t]));
  const horas = [];
  const porPrioridad = new Map();
  const porTecnico = new Map();

  for (const [ticketId, { userId, fecha }] of resoluciones) {
    const ticket = porId.get(ticketId);
    if (!ticket) continue;
    const h = (new Date(fecha) - new Date(ticket.created_at)) / 3600000;
    if (!Number.isFinite(h) || h < 0) continue;
    horas.push(h);
    acumular(porPrioridad, ticket.prioridad || 'sin_definir', h);
    acumular(porTecnico, userId || 'sin_asignar', h);
  }

  return {
    global: { promedio: promedio(horas), mediana: mediana(horas), muestra: horas.length },
    porPrioridad: resumirAcumulado(porPrioridad),
    porTecnico: resumirAcumulado(porTecnico),
  };
}

function acumular(mapa, clave, valor) {
  if (!mapa.has(clave)) mapa.set(clave, []);
  mapa.get(clave).push(valor);
}

function resumirAcumulado(mapa) {
  const salida = {};
  for (const [clave, valores] of mapa) {
    salida[clave] = { promedio: promedio(valores), mediana: mediana(valores), muestra: valores.length };
  }
  return salida;
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

// Histórico completo de tickets por solicitante, SIN recorte de fecha (a
// diferencia del resto de este reporte): es la columna "Total" de la tabla por
// solicitante, para distinguirla de "Ticket creado" (solo este periodo).
export function contarHistoricoPorSolicitante(todos) {
  const mapa = new Map();
  for (const t of todos) {
    const clave = nombreSolicitante(t);
    mapa.set(clave, (mapa.get(clave) || 0) + 1);
  }
  return mapa;
}

// Resumen por solicitante: cuántos tickets creó en el periodo, su estado
// ACTUAL (resuelto / rechazado) y las encuestas contestadas/pendientes, más su
// histórico completo (columna "Total", ver contarHistoricoPorSolicitante).
export function resumenPorSolicitante(creados, encuestaPorTicket, totalHistoricoPorSolicitante) {
  const mapa = new Map();
  for (const t of creados) {
    const clave = nombreSolicitante(t);
    if (!mapa.has(clave)) {
      mapa.set(clave, { solicitante: clave, creados: 0, resueltos: 0, rechazados: 0, encuestasContestadas: 0, encuestasPendientes: 0 });
    }
    const fila = mapa.get(clave);
    fila.creados += 1;
    if (ESTADOS_RESUELTO.includes(t.estado)) fila.resueltos += 1;
    else if (t.estado === ESTADO_RECHAZADO) fila.rechazados += 1;
    const encuesta = encuestaPorTicket.get(t.id);
    if (encuesta === 'respondida') fila.encuestasContestadas += 1;
    else if (encuesta === 'pendiente') fila.encuestasPendientes += 1;
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, total: totalHistoricoPorSolicitante.get(f.solicitante) ?? f.creados }))
    .sort((a, b) => b.creados - a.creados);
}

// Volumen por día del periodo, en orden cronológico (para el gráfico de
// barras del PDF). Fecha local: created_at es timestamptz.
export function contarPorDia(creados) {
  const mapa = new Map();
  for (const t of creados) {
    const f = new Date(t.created_at);
    if (Number.isNaN(f.getTime())) continue;
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    mapa.set(clave, (mapa.get(clave) || 0) + 1);
  }
  return [...mapa.entries()]
    .map(([fecha, cantidad]) => ({ fecha, cantidad }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function contarPor(lista, fnClave) {
  const mapa = {};
  for (const item of lista) {
    const clave = fnClave(item) || 'Sin definir';
    mapa[clave] = (mapa[clave] || 0) + 1;
  }
  return Object.entries(mapa)
    .map(([clave, cantidad]) => ({ clave, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}
