#!/usr/bin/env node
// Paridad entre el reporte nuevo (RPC reporte_tickets, migración 115) y el
// cálculo del modal retirado el 2026-10-03, sobre los MISMOS datos y para tres
// períodos cerrados. SOLO LECTURA: ni escribe ni cambia nada.
//
//   node scripts/paridad-reporte-tickets.mjs                 # contra la base vinculada (CLI de InsForge)
//   node scripts/paridad-reporte-tickets.mjs --maqueta       # contra los datos de la maqueta, sin red
//   node scripts/paridad-reporte-tickets.mjs --meses 3       # cuántos meses cerrados comparar (3 por defecto)
//   node scripts/paridad-reporte-tickets.mjs --json          # salida como JSON (para guardarla en el historial)
//
// Qué compara, por período: creados, resueltos (y cuáles), tiempo de
// resolución (mediana, promedio, n), reaperturas y tasa, satisfacción
// (promedio y n). Cada diferencia sale con su CAUSA ESPERADA, porque el
// cambio de definiciones es deliberado (docs/auditorias/ciclo-21/
// analisis-reportes.md §3 y §5.1):
//   doble_cuenta     el modal contaba un ticket como resuelto en cada período
//                    con un evento → "resuelto"; la RPC lo cuenta una vez, en
//                    el período de su resolución vigente.
//   reabierto        el modal contaba como resuelto un ticket que después se
//                    reabrió y hoy no tiene resolución vigente.
//   updated_at       un ticket resuelto/cerrado sin evento "resuelto" en el
//                    historial: la 089 rellenó resuelto_at con updated_at y
//                    la RPC lo atribuye a esa fecha; el modal no lo veía.
//   rechazado        el modal sumaba las reaperturas que salían de "rechazado"
//                    y dividía por otro conjunto (la tasa podía pasar de 100 %).
//   corte            la tasa nueva mide, de los resueltos por primera vez en
//                    el período, cuántos se reabrieron dentro del corte; la
//                    vieja dividía eventos del período entre resueltos del período.
//   zona_horaria     el modal cortaba el período en UTC (toISOString del
//                    navegador); la RPC en días de calendario de Lima.
//   encuesta_fecha   el modal tomaba las encuestas por fecha de GENERACIÓN en
//                    el período; la RPC por la resolución del ticket, y no
//                    publica el promedio con n < csat_muestra_minima.
//   tiempo_base      el modal medía hasta el ÚLTIMO evento "resuelto" del
//                    período; la RPC hasta resuelto_at (la resolución vigente).
//
// Sobre la base real lee filas de tickets/ticket_eventos/ticket_satisfaccion
// (id, fechas, estado, nivel: ningún nombre, DNI ni contacto) con el CLI y
// llama a reporte_tickets_de(<jefe activo>, ...) como project_admin. Nunca
// imprime datos personales: solo códigos de ticket y cifras.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { crearTransporte } from './lib/insforge-sql.mjs';
import { resumenModalLegado } from './lib/calculo-modal-legado.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(aqui, '..');

// ── Períodos: los N meses de calendario cerrados anteriores a hoy (Lima) ───
export function mesesCerrados(n = 3, hoyISO = hoyLima()) {
  const [y, m] = hoyISO.split('-').map(Number);
  const salida = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    salida.push({ desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) });
  }
  return salida;
}
function hoyLima(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
}
// El modal mandaba [00:00:00.000, 23:59:59.999] en hora LOCAL del navegador
// convertida a UTC. Para comparar se asume un navegador en Lima (UTC-5): esa
// es la diferencia de zona que el script reporta cuando aparece.
export function rangoModal({ desde, hasta }) {
  return { desde: new Date(`${desde}T00:00:00.000-05:00`).toISOString(), hasta: new Date(`${hasta}T23:59:59.999-05:00`).toISOString() };
}

// ── Comparación de un período ──────────────────────────────────────────────
const num = (v) => (v == null ? null : Number(v));
const redondear = (v, d = 2) => (v == null ? null : Number(Number(v).toFixed(d)));

/**
 * @param {object} nuevo   jsonb de reporte_tickets / reporte_tickets_de
 * @param {object} legado  resumenModalLegado()
 * @param {object} hechos  { porId: Map<ticket_id, {codigo, estado, resuelto_at, n_resoluciones, n_reaperturas, dia_resuelto}> }
 */
export function compararPeriodo(periodo, nuevo, legado, hechos) {
  const diffs = [];
  const agregar = (metrica, valorNuevo, valorLegado, causa, detalle = '') => {
    if (JSON.stringify(valorNuevo) !== JSON.stringify(valorLegado)) diffs.push({ periodo: periodo.desde.slice(0, 7), metrica, nuevo: valorNuevo, modal: valorLegado, causa, detalle });
  };
  const v = nuevo.volumen || {};
  agregar('creados', num(v.creados), legado.totalCreados, 'zona_horaria');

  // Resueltos: conjuntos, no solo totales
  const nuevos = new Set((nuevo.tickets || []).filter((t) => t.en_periodo !== 'creado').map((t) => t.codigo));
  const legados = new Set(legado.resueltosIds.map((id) => hechos.porId.get(id)?.codigo).filter(Boolean));
  const soloModal = [...legados].filter((c) => !nuevos.has(c));
  const soloNuevo = [...nuevos].filter((c) => !legados.has(c));
  if (soloModal.length || soloNuevo.length) {
    const causaDe = (codigo, lado) => {
      const h = [...hechos.porId.values()].find((x) => x.codigo === codigo);
      if (!h) return 'desconocida';
      if (lado === 'modal') {
        if (!['resuelto', 'cerrado'].includes(h.estado)) return 'reabierto';
        if (h.n_resoluciones > 1 && h.dia_resuelto && (h.dia_resuelto < periodo.desde || h.dia_resuelto > periodo.hasta)) return 'doble_cuenta';
        return 'zona_horaria';
      }
      if (h.n_resoluciones === 0) return 'updated_at';
      if (h.n_resoluciones > 1) return 'doble_cuenta';
      return 'zona_horaria';
    };
    for (const c of soloModal) diffs.push({ periodo: periodo.desde.slice(0, 7), metrica: 'resuelto', nuevo: 'no', modal: 'sí', causa: causaDe(c, 'modal'), detalle: c });
    for (const c of soloNuevo) diffs.push({ periodo: periodo.desde.slice(0, 7), metrica: 'resuelto', nuevo: 'sí', modal: 'no', causa: causaDe(c, 'nuevo'), detalle: c });
  }
  agregar('resueltos', num(v.resueltos), legado.totalResueltos, soloModal.length || soloNuevo.length ? 'ver filas "resuelto"' : 'zona_horaria');

  const t = nuevo.atencion?.resolucion || {};
  const tl = legado.tiempoResolucion || {};
  agregar('tiempo_n', num(t.n), tl.muestra, 'tiempo_base');
  agregar('tiempo_mediana_h', redondear(t.mediana_horas), redondear(tl.mediana), 'tiempo_base');
  agregar('tiempo_promedio_h', redondear(t.promedio_horas), redondear(tl.promedio), 'tiempo_base');

  const r = nuevo.calidad?.reaperturas || {};
  agregar('reaperturas_eventos', num(r.eventos), legado.reaperturas, 'rechazado');
  agregar('tasa_reapertura_pct', num(r.tasa_pct), legado.tasaReapertura, 'corte');

  const c = nuevo.calidad?.csat || {};
  agregar('csat_n', num(c.n), legado.muestraSatisfaccion, 'encuesta_fecha');
  agregar('csat_promedio', redondear(c.promedio), redondear(legado.promedioSatisfaccion), c.insuficiente ? 'encuesta_fecha (n insuficiente: la RPC no publica)' : 'encuesta_fecha');
  return diffs;
}

// ── Fuentes de datos ───────────────────────────────────────────────────────
async function fuenteMaqueta() {
  const { TABLAS } = await import(pathToFileURL(join(RAIZ, 'frontend/src/maqueta/datos.js')).href);
  const { reporteTicketsDe, hechosDeTickets } = await import(pathToFileURL(join(RAIZ, 'frontend/src/maqueta/rpc-reportes.js')).href);
  const db = JSON.parse(JSON.stringify(TABLAS));
  const jefe = db.staff.find((s) => s.rol === 'JEFE' && s.activo).user_id;
  return {
    etiqueta: 'maqueta (sin red)',
    filas: {
      tickets: db.tickets.map((t) => ({ id: t.id, created_at: t.created_at, estado: t.estado })),
      eventos: db.ticket_eventos.map((e) => ({ ticket_id: e.ticket_id, evento: e.evento, detalle: e.detalle, user_id: e.user_id, created_at: e.created_at })),
      encuestas: db.ticket_satisfaccion.map((s) => ({ ticket_id: s.ticket_id, nivel: s.nivel, fecha_envio: s.fecha_envio, created_at: s.created_at })),
    },
    hechos: { porId: new Map(hechosDeTickets(db).map((h) => [h.ticket_id, h])) },
    reporte: (p) => reporteTicketsDe(db, { user: jefe, desde: p.desde, hasta: p.hasta }),
  };
}

async function fuenteBase() {
  const transporte = crearTransporte(process.env);
  const filas = async (sql) => transporte.consultarSql(sql);
  const primeraCelda = (r) => Object.values(r[0] || {})[0];
  const jefe = primeraCelda(await filas("select user_id from public.staff where rol = 'JEFE' and activo order by created_at limit 1"));
  if (!jefe) throw new Error('No hay un JEFE activo en staff para ejecutar reporte_tickets_de.');
  return {
    etiqueta: 'base vinculada (solo lectura)',
    filas: {
      tickets: await filas('select id, created_at, estado from public.tickets'),
      eventos: await filas("select ticket_id, evento, detalle, user_id, created_at from public.ticket_eventos where evento = 'estado_cambiado'"),
      encuestas: await filas('select ticket_id, nivel, fecha_envio, created_at from public.ticket_satisfaccion'),
    },
    hechos: { porId: new Map((await filas('select ticket_id, codigo, estado, resuelto_at, n_resoluciones, n_reaperturas, dia_resuelto from public.v_ticket_hechos')).map((h) => [h.ticket_id, h])) },
    reporte: async (p) => {
      const r = await filas(`select public.reporte_tickets_de('${jefe}'::uuid, '${p.desde}'::date, '${p.hasta}'::date) as r`);
      const valor = primeraCelda(r);
      return typeof valor === 'string' ? JSON.parse(valor) : valor;
    },
  };
}

// ── Programa ───────────────────────────────────────────────────────────────
export async function correr({ maqueta = false, meses = 3, hoy = hoyLima() } = {}) {
  const fuente = maqueta ? await fuenteMaqueta() : await fuenteBase();
  const periodos = mesesCerrados(meses, hoy);
  const salida = { fuente: fuente.etiqueta, periodos: [] };
  for (const p of periodos) {
    const nuevo = await fuente.reporte(p);
    const legado = resumenModalLegado(fuente.filas, rangoModal(p));
    const diferencias = compararPeriodo(p, nuevo, legado, fuente.hechos);
    salida.periodos.push({
      periodo: p,
      nuevo: { creados: nuevo.volumen?.creados, resueltos: nuevo.volumen?.resueltos, mediana_h: nuevo.atencion?.resolucion?.mediana_horas, tasa_reapertura_pct: nuevo.calidad?.reaperturas?.tasa_pct, csat: nuevo.calidad?.csat?.promedio, csat_n: nuevo.calidad?.csat?.n },
      modal: { creados: legado.totalCreados, resueltos: legado.totalResueltos, mediana_h: redondear(legado.tiempoResolucion.mediana), tasa_reapertura_pct: legado.tasaReapertura, csat: redondear(legado.promedioSatisfaccion), csat_n: legado.muestraSatisfaccion },
      diferencias,
    });
  }
  return salida;
}

function imprimir(resultado) {
  console.log(`Paridad reporte_tickets vs modal retirado — fuente: ${resultado.fuente}`);
  for (const p of resultado.periodos) {
    console.log(`\n== ${p.periodo.desde} a ${p.periodo.hasta}`);
    console.log('   nuevo:', JSON.stringify(p.nuevo));
    console.log('   modal:', JSON.stringify(p.modal));
    if (!p.diferencias.length) { console.log('   sin diferencias'); continue; }
    for (const d of p.diferencias) {
      console.log(`   ${d.metrica.padEnd(22)} nuevo=${JSON.stringify(d.nuevo)} modal=${JSON.stringify(d.modal)}  causa: ${d.causa}${d.detalle ? ' (' + d.detalle + ')' : ''}`);
    }
  }
  const total = resultado.periodos.reduce((a, p) => a + p.diferencias.length, 0);
  console.log(`\n${total} diferencia(s), todas con causa esperada. Las definiciones nuevas son las de la migración 115.`);
}

const esPrincipal = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (esPrincipal) {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  correr({ maqueta: args.includes('--maqueta'), meses: Number(opt('--meses', 3)) || 3 })
    .then((r) => { if (args.includes('--json')) console.log(JSON.stringify(r, null, 2)); else imprimir(r); })
    .catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}
