// Período del reporte: el staff elige un MES de calendario (por defecto el
// actual), una SEMANA (lunes a domingo) o un RANGO libre, siempre como fechas
// 'YYYY-MM-DD'. Acá solo se arman y se navegan esas fechas; el corte real
// (00:00 de Lima del primer día, 24:00 del último) lo construye el servidor
// (reporte_tickets, migración 115), nunca el navegador. "Hoy" también es el de
// Lima: un reloj del navegador en otra zona no cambia qué mes está en curso.
import { hoyLimaISO } from '../dashboard/tiempoLima.js';

export const TIPOS_PERIODO = [
  { valor: 'mes', label: 'Mes' },
  { valor: 'semana', label: 'Semana' },
  { valor: 'rango', label: 'Rango' },
];

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' → Date UTC a medianoche (la aritmética de calendario se hace en
// UTC para que ningún cambio de hora local mueva un día).
function aDia(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function aISO(fecha) {
  return fecha.toISOString().slice(0, 10);
}
function sumarDias(iso, n) {
  const f = aDia(iso);
  f.setUTCDate(f.getUTCDate() + n);
  return aISO(f);
}
function sumarMeses(iso, n) {
  const f = aDia(iso);
  f.setUTCDate(1);
  f.setUTCMonth(f.getUTCMonth() + n);
  return aISO(f);
}

export function esFechaISO(valor) {
  return ISO.test(String(valor || '')) && !Number.isNaN(aDia(valor).getTime());
}

/** Mes de calendario que contiene `iso`: { desde, hasta }. */
export function rangoMes(iso) {
  const desde = `${iso.slice(0, 7)}-01`;
  return { desde, hasta: sumarDias(sumarMeses(desde, 1), -1) };
}

/** Semana de lunes a domingo que contiene `iso`. */
export function rangoSemana(iso) {
  const f = aDia(iso);
  const lunes = sumarDias(iso, -((f.getUTCDay() + 6) % 7));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

/** Período por defecto: el mes en curso (Lima). */
export function periodoInicial(hoy = hoyLimaISO()) {
  return { tipo: 'mes', ...rangoMes(hoy) };
}

/**
 * Normaliza lo que llega por URL o del selector. Un tipo desconocido o una
 * fecha inválida vuelven al mes en curso; un rango invertido se endereza y un
 * rango de más de 366 días se recorta (el servidor lo rechazaría).
 */
export function normalizarPeriodo({ tipo, desde, hasta } = {}, hoy = hoyLimaISO()) {
  if (tipo === 'mes') return { tipo, ...rangoMes(esFechaISO(desde) ? desde : hoy) };
  if (tipo === 'semana') return { tipo, ...rangoSemana(esFechaISO(desde) ? desde : hoy) };
  if (tipo === 'rango' && esFechaISO(desde) && esFechaISO(hasta)) {
    let [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    if (diasEntre(a, b) > 366) a = sumarDias(b, -365);
    return { tipo, desde: a, hasta: b };
  }
  return periodoInicial(hoy);
}

/** Período anterior o siguiente del mismo tipo (delta −1 / +1). */
export function desplazarPeriodo(periodo, delta) {
  if (periodo.tipo === 'mes') return { tipo: 'mes', ...rangoMes(sumarMeses(periodo.desde, delta)) };
  if (periodo.tipo === 'semana') return { tipo: 'semana', ...rangoSemana(sumarDias(periodo.desde, 7 * delta)) };
  const largo = diasEntre(periodo.desde, periodo.hasta);
  return { tipo: 'rango', desde: sumarDias(periodo.desde, largo * delta), hasta: sumarDias(periodo.hasta, largo * delta) };
}

/** Días de calendario que abarca [desde, hasta] (ambos inclusive). */
export function diasEntre(desde, hasta) {
  return Math.round((aDia(hasta) - aDia(desde)) / 86400000) + 1;
}

/** El período empieza después de hoy: no hay nada que reportar todavía. */
export function esFuturo(periodo, hoy = hoyLimaISO()) {
  return periodo.desde > hoy;
}

function ddmm(iso, conAnio = true) {
  const [y, m, d] = iso.split('-');
  return conAnio ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** "Septiembre 2026" · "Semana del 28/09 al 04/10/2026" · "Del 01/09/2026 al 15/09/2026". */
export function etiquetaPeriodo(periodo) {
  if (periodo.tipo === 'mes') {
    const [y, m] = periodo.desde.split('-').map(Number);
    const mes = MESES[m - 1];
    return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${y}`;
  }
  if (periodo.tipo === 'semana') return `Semana del ${ddmm(periodo.desde, false)} al ${ddmm(periodo.hasta)}`;
  return `Del ${ddmm(periodo.desde)} al ${ddmm(periodo.hasta)}`;
}

/** Nombre de archivo para el CSV / PDF: identifica el período, no el día de descarga. */
export function nombreArchivoPeriodo(periodo) {
  if (periodo.tipo === 'mes') return `Reporte_tickets_${periodo.desde.slice(0, 7)}`;
  return `Reporte_tickets_${periodo.desde}_${periodo.hasta}`;
}

/** Meses ofrecidos en el selector: desde `desdeISO` (primer ticket) hasta hoy, más reciente primero. */
export function mesesDisponibles(desdeISO, hoy = hoyLimaISO()) {
  const inicio = esFechaISO(desdeISO) && desdeISO < hoy ? `${desdeISO.slice(0, 7)}-01` : `${hoy.slice(0, 7)}-01`;
  const salida = [];
  for (let m = `${hoy.slice(0, 7)}-01`; m >= inicio && salida.length < 60; m = sumarMeses(m, -1)) {
    salida.push({ valor: m, label: etiquetaPeriodo({ tipo: 'mes', desde: m }) });
  }
  return salida;
}
