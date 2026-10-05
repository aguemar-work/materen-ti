// Fechas del Inicio en hora de Lima (America/Lima, UTC-5 sin horario de
// verano), la misma zona con la que la RPC `dashboard_resumen` calcula "hoy"
// y los umbrales (migración 103). El navegador de quien abre el panel puede
// estar en otra zona o con el reloj movido: el saludo, la fecha larga y los
// "hace N días" no deben depender de eso.
//
// Todo recibe `ahora` (un Date) para poder probarse con una hora fija.

const ZONA = 'America/Lima';

const partes = (fmt, fecha) => Object.fromEntries(fmt.formatToParts(fecha).map((p) => [p.type, p.value]));

const FMT_FECHA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
});
const FMT_HORA = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA, hour: '2-digit', hourCycle: 'h23',
});
const FMT_LARGA = new Intl.DateTimeFormat('es-PE', {
  timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long',
});

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' de hoy en Lima. */
export function hoyLimaISO(ahora = new Date()) {
  const p = partes(FMT_FECHA, ahora);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hora (0-23) en Lima. */
export function horaLima(ahora = new Date()) {
  return Number(partes(FMT_HORA, ahora).hour);
}

/**
 * Día calendario (Lima) de una fecha de la base. Una fecha sola
 * ('YYYY-MM-DD': fecha_limite, garantia_hasta...) se respeta tal cual; un
 * timestamp (created_at) se lleva a Lima: a las 20:00 de Lima ya es el día
 * siguiente en UTC y `slice(0, 10)` daría el día equivocado.
 */
export function diaLima(valor) {
  if (!valor) return null;
  const s = String(valor);
  if (SOLO_FECHA.test(s)) return s;
  const f = new Date(s);
  return Number.isNaN(f.getTime()) ? null : hoyLimaISO(f);
}

/** Días calendario entre un día de la base y hoy (positivo = ya pasó). */
export function diasDesde(valor, ahora = new Date()) {
  const dia = diaLima(valor);
  if (!dia) return null;
  return Math.round((Date.parse(hoyLimaISO(ahora)) - Date.parse(dia)) / 86400000);
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches" según la hora de Lima. */
export function tramoDelDia(ahora = new Date()) {
  const h = horaLima(ahora);
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** "Martes 1 de octubre" (hora de Lima). */
export function fechaLarga(ahora = new Date()) {
  const txt = FMT_LARGA.format(ahora).replace(',', '');
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

/** Texto de la columna de antigüedad: "3 d", "hoy" o "—" (sin fecha o futura). */
export function textoAntiguedad(dias) {
  if (dias == null || dias < 0) return '—';
  return dias === 0 ? 'hoy' : `${dias} d`;
}
