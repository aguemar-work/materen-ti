// Paridad Punto 1 (auditoría 2026-08-11): compara el cálculo VIEJO
// (reportesTickets.js, interpretando tickets/ticket_eventos/ticket_satisfaccion
// crudos) contra el cálculo NUEVO (RPC de la migración 053) para varios
// periodos con datos reales, ANTES de cambiar el frontend para consumir la RPC.
//
// El cálculo viejo corre acá mismo importando las funciones puras YA
// existentes de reportesTickets.js (exportadas sin cambiar su lógica, ver
// migración 053) — no se duplica ninguna fórmula. Los datos crudos se leen
// con `db query` (cliente admin, bypasea RLS, igual que scripts/test-db.mjs),
// reproduciendo las mismas consultas que el frontend hace vía PostgREST.
//
// El cálculo nuevo llama a funciones GEMELAS de prueba
// (_test_reporte_tickets / _test_reporte_tickets_resumen /
// _test_reporte_satisfaccion_consolidado, ver scratchpad/_test_reporte_tickets.sql)
// idénticas a las de la migración 053 pero SIN el gate es_staff(): la
// conexión admin del CLI no tiene sesión real (auth.uid() es null), así que
// las funciones reales rechazarían la llamada con "No autorizado" — eso es
// el comportamiento CORRECTO en producción, no un bug a rodear ahí. Estas
// gemelas se crean y se destruyen en esta misma corrida, nunca quedan en el
// esquema versionado.
//
// Tolerancia: los números (promedio/mediana en horas) se comparan con
// epsilon por redondeo de punto flotante entre JS y Postgres. Los arrays
// que no tienen un orden de negocio definido (porCategoria/porPrioridad/
// porEstado/porTipo con empates de cantidad) se comparan como conjuntos,
// no por posición — el orden exacto de un empate nunca fue una garantía de
// reportesTickets.js (depende del orden de llegada de la consulta vieja).
import { spawnSync } from 'node:child_process';
import {
  mediana, promedio, resolucionesPorTicket, contarPor, contarPorDia,
  contarPorTecnico, calcularTiempos, resumenBacklog, resumenPorSolicitante,
  esRespondida, nombreSolicitante, resumenSatisfaccionPorSolicitante,
  resumenSatisfaccionPorTecnico,
} from '../frontend/src/api/domains/reportesTickets.js';

const ESTADOS_RESUELTO = ['resuelto', 'cerrado'];
const ESTADOS_ABIERTOS = ['abierto', 'en_progreso', 'reabierto'];

function dbQuery(sql) {
  const ps = `npx @insforge/cli db query --json -- @'\n${sql}\n'@`;
  const r = spawnSync('powershell.exe', [
    '-NoProfile',
    '-EncodedCommand',
    Buffer.from(ps, 'utf16le').toString('base64'),
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`db query falló:\n${r.stdout}\n${r.stderr}`);
  }
  const out = r.stdout.trim();
  const inicio = out.indexOf('{');
  if (inicio === -1) throw new Error(`Respuesta sin JSON:\n${out}`);
  return JSON.parse(out.slice(inicio)).rows;
}

function sqlStr(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

// ── Cálculo VIEJO: réplica de obtenerReporteTickets() usando datos crudos ──
async function calcularViejo(desde, hasta) {
  const creadosRaw = dbQuery(`
    select t.id, t.estado, t.prioridad, t.tipo, t.created_at, t.vinculado, t.contacto_ingresado,
      e.nombres as emp_nombres, e.apellidos as emp_apellidos,
      c.nombre as categoria_nombre
    from tickets t
    left join empleados e on e.id = t.empleado_id
    left join categorias_ticket c on c.id = t.categoria_id
    where t.created_at >= ${sqlStr(desde)} and t.created_at <= ${sqlStr(hasta)}
    order by t.created_at desc
  `);
  const creados = creadosRaw.map((t) => ({
    id: t.id, estado: t.estado, prioridad: t.prioridad, tipo: t.tipo,
    created_at: t.created_at, vinculado: t.vinculado, contacto_ingresado: t.contacto_ingresado,
    empleados: t.emp_nombres ? { nombres: t.emp_nombres, apellidos: t.emp_apellidos } : null,
    categorias_ticket: t.categoria_nombre ? { nombre: t.categoria_nombre } : null,
  }));

  const eventos = dbQuery(`
    select ticket_id, user_id, detalle, created_at
    from ticket_eventos
    where evento = 'estado_cambiado'
      and created_at >= ${sqlStr(desde)} and created_at <= ${sqlStr(hasta)}
    order by created_at asc
  `);

  const { resoluciones, reaperturas } = resolucionesPorTicket(eventos);

  const idsResueltos = [...resoluciones.keys()];
  const datosResueltos = idsResueltos.length ? dbQuery(`
    select id, created_at, prioridad from tickets where id in (${idsResueltos.map(sqlStr).join(',')})
  `) : [];

  const filasEncuesta = creados.length ? dbQuery(`
    select ticket_id, fecha_envio from ticket_satisfaccion
    where ticket_id in (${creados.map((t) => sqlStr(t.id)).join(',')})
  `) : [];

  const tiempos = calcularTiempos(resoluciones, datosResueltos);

  const encuestaPorTicket = new Map();
  for (const e of filasEncuesta) encuestaPorTicket.set(e.ticket_id, esRespondida(e) ? 'respondida' : 'pendiente');

  const satisfaccion = dbQuery(`
    select nivel, comentario, fecha_envio
    from ticket_satisfaccion
    where created_at >= ${sqlStr(desde)} and created_at <= ${sqlStr(hasta)}
  `);
  const respondidas = satisfaccion.filter(esRespondida);
  const conNivel = respondidas.filter((e) => e.nivel !== null);
  const promedioSatisfaccion = conNivel.length
    ? conNivel.reduce((acc, e) => acc + e.nivel, 0) / conNivel.length
    : null;
  const comentarios = respondidas
    .filter((e) => e.comentario && e.nivel !== null)
    .sort((a, b) => new Date(b.fecha_envio) - new Date(a.fecha_envio))
    .map((e) => ({ nivel: e.nivel, comentario: e.comentario, fecha: e.fecha_envio }));

  const backlogRaw = dbQuery(`select created_at from tickets where estado in (${ESTADOS_ABIERTOS.map(sqlStr).join(',')})`);

  return {
    totalCreados: creados.length,
    totalResueltos: resoluciones.size,
    porCategoria: contarPor(creados, (t) => t.categorias_ticket?.nombre || 'Sin categoría'),
    porPrioridad: contarPor(creados, (t) => t.prioridad),
    porEstado: contarPor(creados, (t) => t.estado),
    porTipo: contarPor(creados, (t) => t.tipo || 'sin_clasificar'),
    porDia: contarPorDia(creados),
    porTecnico: contarPorTecnico(resoluciones),
    porSolicitante: resumenPorSolicitante(creados, encuestaPorTicket),
    tiempoResolucion: tiempos.global,
    tiempoPorPrioridad: tiempos.porPrioridad,
    tiempoPorTecnico: tiempos.porTecnico,
    reaperturas,
    tasaReapertura: resoluciones.size ? Math.round((reaperturas / resoluciones.size) * 100) : null,
    backlog: resumenBacklog(backlogRaw),
    encuestasGeneradas: satisfaccion.length,
    encuestasRespondidas: respondidas.length,
    promedioSatisfaccion,
    comentarios: comentarios.slice(0, 20),
    comentariosTotal: comentarios.length,
  };
}

async function calcularViejoResumen(desde, hasta) {
  const creados = dbQuery(`select id from tickets where created_at >= ${sqlStr(desde)} and created_at <= ${sqlStr(hasta)}`);
  const eventos = dbQuery(`
    select ticket_id, detalle from ticket_eventos
    where evento = 'estado_cambiado' and created_at >= ${sqlStr(desde)} and created_at <= ${sqlStr(hasta)}
  `);
  const { destinoDeCambio } = await import('../frontend/src/core/dominio-tickets.js');
  const resueltos = new Set();
  for (const ev of eventos) if (destinoDeCambio(ev.detalle) === 'resuelto') resueltos.add(ev.ticket_id);

  const satisfaccion = dbQuery(`
    select nivel, fecha_envio from ticket_satisfaccion
    where created_at >= ${sqlStr(desde)} and created_at <= ${sqlStr(hasta)}
  `);
  const conNivel = satisfaccion.filter((e) => esRespondida(e) && e.nivel !== null);

  return {
    totalCreados: creados.length,
    totalResueltos: resueltos.size,
    promedioSatisfaccion: conNivel.length ? conNivel.reduce((a, e) => a + e.nivel, 0) / conNivel.length : null,
    tasaRespuesta: satisfaccion.length
      ? Math.round((satisfaccion.filter(esRespondida).length / satisfaccion.length) * 100)
      : null,
  };
}

async function calcularViejoConsolidado() {
  const encuestas = dbQuery(`select id, ticket_id, nivel, comentario, fecha_envio, created_at from ticket_satisfaccion`);
  if (!encuestas.length) return { respuestas: [], porSolicitante: [], porTecnico: [] };
  const ticketIds = encuestas.map((e) => e.ticket_id);
  const tickets = dbQuery(`
    select t.id, t.codigo, t.titulo, t.empleado_id, e.nombres as emp_nombres, e.apellidos as emp_apellidos
    from tickets t left join empleados e on e.id = t.empleado_id
    where t.id in (${ticketIds.map(sqlStr).join(',')})
  `);
  const eventos = dbQuery(`
    select ticket_id, user_id, detalle, created_at from ticket_eventos
    where evento = 'estado_cambiado' and ticket_id in (${ticketIds.map(sqlStr).join(',')})
  `);
  const ticketPorId = new Map(tickets.map((t) => [t.id, {
    id: t.id, codigo: t.codigo, titulo: t.titulo, empleado_id: t.empleado_id,
    empleados: t.emp_nombres ? { nombres: t.emp_nombres, apellidos: t.emp_apellidos } : null,
  }]));
  const { resoluciones } = resolucionesPorTicket(eventos);

  const respuestas = encuestas.map((e) => {
    const ticket = ticketPorId.get(e.ticket_id);
    return {
      id: e.id, ticket_id: e.ticket_id,
      ticket_codigo: ticket?.codigo || '', ticket_titulo: ticket?.titulo || '',
      empleado_id: ticket?.empleado_id || null,
      solicitante: ticket?.empleados ? `${ticket.empleados.nombres} ${ticket.empleados.apellidos}`.trim() : 'Sin datos',
      tecnico_id: resoluciones.get(e.ticket_id)?.userId || null,
      nivel: e.nivel, comentario: e.comentario, fecha_envio: e.fecha_envio, created_at: e.created_at,
      respondida: esRespondida(e),
    };
  });

  return {
    respuestas,
    porSolicitante: resumenSatisfaccionPorSolicitante(respuestas),
    porTecnico: resumenSatisfaccionPorTecnico(respuestas),
  };
}

// ── Cálculo NUEVO: RPC gemela de prueba ──
function calcularNuevo(desde, hasta) {
  const rows = dbQuery(`select public._test_reporte_tickets(${sqlStr(desde)}::timestamptz, ${sqlStr(hasta)}::timestamptz) as r`);
  return rows[0].r;
}
function calcularNuevoResumen(desde, hasta) {
  const rows = dbQuery(`select public._test_reporte_tickets_resumen(${sqlStr(desde)}::timestamptz, ${sqlStr(hasta)}::timestamptz) as r`);
  return rows[0].r;
}
function calcularNuevoConsolidado() {
  const rows = dbQuery(`select public._test_reporte_satisfaccion_consolidado() as r`);
  return rows[0].r;
}

// ── Comparación con tolerancia ──
const EPS = 0.001;
function numsCercanos(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) < EPS;
}
function comoConjunto(arr, claves) {
  return [...arr].map((o) => claves.map((k) => `${k}=${o[k]}`).join('|')).sort();
}

function compararTiempo(nombre, viejo, nuevo, errores) {
  if (!numsCercanos(viejo?.promedio, nuevo?.promedio)) errores.push(`${nombre}.promedio: viejo=${viejo?.promedio} nuevo=${nuevo?.promedio}`);
  if (!numsCercanos(viejo?.mediana, nuevo?.mediana)) errores.push(`${nombre}.mediana: viejo=${viejo?.mediana} nuevo=${nuevo?.mediana}`);
  if ((viejo?.muestra || 0) !== (nuevo?.muestra || 0)) errores.push(`${nombre}.muestra: viejo=${viejo?.muestra} nuevo=${nuevo?.muestra}`);
}

function compararReporte(periodo, viejo, nuevo) {
  const errores = [];
  const escalares = ['totalCreados', 'totalResueltos', 'reaperturas', 'tasaReapertura', 'encuestasGeneradas', 'encuestasRespondidas', 'comentariosTotal'];
  for (const k of escalares) {
    if (viejo[k] !== nuevo[k]) errores.push(`${k}: viejo=${viejo[k]} nuevo=${nuevo[k]}`);
  }
  if (!numsCercanos(viejo.promedioSatisfaccion, nuevo.promedioSatisfaccion)) {
    errores.push(`promedioSatisfaccion: viejo=${viejo.promedioSatisfaccion} nuevo=${nuevo.promedioSatisfaccion}`);
  }

  for (const grupo of ['porCategoria', 'porPrioridad', 'porEstado', 'porTipo']) {
    const a = comoConjunto(viejo[grupo], ['clave', 'cantidad']);
    const b = comoConjunto(nuevo[grupo], ['clave', 'cantidad']);
    if (JSON.stringify(a) !== JSON.stringify(b)) errores.push(`${grupo} difiere:\n  viejo=${JSON.stringify(a)}\n  nuevo=${JSON.stringify(b)}`);
  }
  {
    const a = JSON.stringify(viejo.porDia.map((d) => `${d.fecha}=${d.cantidad}`).sort());
    const b = JSON.stringify(nuevo.porDia.map((d) => `${d.fecha}=${d.cantidad}`).sort());
    if (a !== b) errores.push(`porDia difiere:\n  viejo=${a}\n  nuevo=${b}`);
  }
  {
    const a = JSON.stringify(Object.entries(viejo.porTecnico).sort());
    const b = JSON.stringify(Object.entries(nuevo.porTecnico).sort());
    if (a !== b) errores.push(`porTecnico difiere: viejo=${a} nuevo=${b}`);
  }
  {
    const a = comoConjunto(viejo.porSolicitante, ['solicitante', 'total', 'resueltos', 'rechazados', 'sinResolver', 'encuestasContestadas', 'encuestasPendientes']);
    const b = comoConjunto(nuevo.porSolicitante, ['solicitante', 'total', 'resueltos', 'rechazados', 'sinResolver', 'encuestasContestadas', 'encuestasPendientes']);
    if (JSON.stringify(a) !== JSON.stringify(b)) errores.push(`porSolicitante difiere:\n  viejo=${JSON.stringify(a)}\n  nuevo=${JSON.stringify(b)}`);
  }

  compararTiempo('tiempoResolucion', viejo.tiempoResolucion, nuevo.tiempoResolucion, errores);
  for (const clave of new Set([...Object.keys(viejo.tiempoPorPrioridad), ...Object.keys(nuevo.tiempoPorPrioridad)])) {
    compararTiempo(`tiempoPorPrioridad.${clave}`, viejo.tiempoPorPrioridad[clave], nuevo.tiempoPorPrioridad[clave], errores);
  }
  for (const clave of new Set([...Object.keys(viejo.tiempoPorTecnico), ...Object.keys(nuevo.tiempoPorTecnico)])) {
    compararTiempo(`tiempoPorTecnico.${clave}`, viejo.tiempoPorTecnico[clave], nuevo.tiempoPorTecnico[clave], errores);
  }

  if (viejo.backlog.total !== nuevo.backlog.total) errores.push(`backlog.total: viejo=${viejo.backlog.total} nuevo=${nuevo.backlog.total}`);
  if (viejo.backlog.diasMasAntiguo !== nuevo.backlog.diasMasAntiguo) errores.push(`backlog.diasMasAntiguo: viejo=${viejo.backlog.diasMasAntiguo} nuevo=${nuevo.backlog.diasMasAntiguo}`);
  {
    const a = JSON.stringify(viejo.backlog.tramos.map((t) => `${t.clave}=${t.cantidad}`));
    const b = JSON.stringify(nuevo.backlog.tramos.map((t) => `${t.clave}=${t.cantidad}`));
    if (a !== b) errores.push(`backlog.tramos difiere: viejo=${a} nuevo=${b}`);
  }

  {
    const a = comoConjunto(viejo.comentarios, ['nivel', 'comentario', 'fecha']);
    const b = comoConjunto(nuevo.comentarios, ['nivel', 'comentario', 'fecha']);
    if (JSON.stringify(a) !== JSON.stringify(b)) errores.push(`comentarios difiere:\n  viejo=${JSON.stringify(a)}\n  nuevo=${JSON.stringify(b)}`);
  }

  return errores;
}

function compararResumen(viejo, nuevo) {
  const errores = [];
  for (const k of ['totalCreados', 'totalResueltos', 'tasaRespuesta']) {
    if (viejo[k] !== nuevo[k]) errores.push(`${k}: viejo=${viejo[k]} nuevo=${nuevo[k]}`);
  }
  if (!numsCercanos(viejo.promedioSatisfaccion, nuevo.promedioSatisfaccion)) {
    errores.push(`promedioSatisfaccion: viejo=${viejo.promedioSatisfaccion} nuevo=${nuevo.promedioSatisfaccion}`);
  }
  return errores;
}

function compararConsolidado(viejo, nuevo) {
  const errores = [];
  const a = comoConjunto(viejo.respuestas, ['id', 'nivel', 'respondida']);
  const b = comoConjunto(nuevo.respuestas, ['id', 'nivel', 'respondida']);
  if (JSON.stringify(a) !== JSON.stringify(b)) errores.push(`respuestas difiere en cantidad/contenido: viejo=${a.length} nuevo=${b.length}`);

  for (const [nombreGrupo, clave] of [['porSolicitante', 'empleado_id'], ['porTecnico', 'tecnico_id']]) {
    const va = viejo[nombreGrupo], vb = nuevo[nombreGrupo];
    if (va.length !== vb.length) { errores.push(`${nombreGrupo}.length: viejo=${va.length} nuevo=${vb.length}`); continue; }
    const mapaB = new Map(vb.map((f) => [f[clave] ?? 'null', f]));
    for (const fila of va) {
      const otra = mapaB.get(fila[clave] ?? 'null');
      if (!otra) { errores.push(`${nombreGrupo}: falta ${clave}=${fila[clave]} en el nuevo`); continue; }
      if (fila.encuestasGeneradas !== otra.encuestasGeneradas) errores.push(`${nombreGrupo}.${fila[clave]}.encuestasGeneradas: viejo=${fila.encuestasGeneradas} nuevo=${otra.encuestasGeneradas}`);
      if (fila.encuestasRespondidas !== otra.encuestasRespondidas) errores.push(`${nombreGrupo}.${fila[clave]}.encuestasRespondidas: viejo=${fila.encuestasRespondidas} nuevo=${otra.encuestasRespondidas}`);
      if (!numsCercanos(fila.promedio, otra.promedio)) errores.push(`${nombreGrupo}.${fila[clave]}.promedio: viejo=${fila.promedio} nuevo=${otra.promedio}`);
    }
  }
  return errores;
}

async function main() {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const inicioMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const finMesAnterior = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59, 999);
  const hace90 = new Date(ahora.getTime() - 90 * 86400000);
  const desdeSiempre = new Date('2020-01-01T00:00:00.000Z');

  const periodos = [
    ['Mes en curso', inicioMes.toISOString(), ahora.toISOString()],
    ['Mes anterior completo', inicioMesAnterior.toISOString(), finMesAnterior.toISOString()],
    ['Últimos 90 días', hace90.toISOString(), ahora.toISOString()],
    ['Todo el histórico', desdeSiempre.toISOString(), ahora.toISOString()],
  ];

  let huboFallo = false;

  for (const [nombre, desde, hasta] of periodos) {
    process.stdout.write(`\n=== ${nombre} (${desde} → ${hasta}) ===\n`);

    const [viejo, nuevo] = [await calcularViejo(desde, hasta), calcularNuevo(desde, hasta)];
    const errores = compararReporte(nombre, viejo, nuevo);
    if (errores.length) {
      huboFallo = true;
      console.error(`✗ reporte_tickets — ${errores.length} diferencia(s):`);
      errores.forEach((e) => console.error(`  - ${e}`));
    } else {
      console.log(`✓ reporte_tickets OK (${viejo.totalCreados} creados, ${viejo.totalResueltos} resueltos)`);
    }

    const [viejoR, nuevoR] = [await calcularViejoResumen(desde, hasta), calcularNuevoResumen(desde, hasta)];
    const erroresR = compararResumen(viejoR, nuevoR);
    if (erroresR.length) {
      huboFallo = true;
      console.error(`✗ reporte_tickets_resumen — ${erroresR.length} diferencia(s):`);
      erroresR.forEach((e) => console.error(`  - ${e}`));
    } else {
      console.log('✓ reporte_tickets_resumen OK');
    }
  }

  process.stdout.write('\n=== Satisfacción consolidada (histórico completo) ===\n');
  const [viejoC, nuevoC] = [await calcularViejoConsolidado(), calcularNuevoConsolidado()];
  const erroresC = compararConsolidado(viejoC, nuevoC);
  if (erroresC.length) {
    huboFallo = true;
    console.error(`✗ reporte_satisfaccion_consolidado — ${erroresC.length} diferencia(s):`);
    erroresC.forEach((e) => console.error(`  - ${e}`));
  } else {
    console.log(`✓ reporte_satisfaccion_consolidado OK (${viejoC.respuestas.length} respuestas)`);
  }

  if (huboFallo) {
    console.error('\n✗ Paridad FALLÓ — no cortar el cable todavía.');
    process.exit(1);
  }
  console.log('\n✓ Paridad OK en todos los periodos — seguro cambiar el frontend a las RPC.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
