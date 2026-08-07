// Periodos del reporte de tickets: el staff elige el DÍA, la SEMANA o el MES
// exacto a reportar, en vez de una ventana móvil relativa a hoy (antes
// "semanal" era "los últimos 7 días"). Así "el reporte de julio" o "la semana
// pasada" dan siempre el mismo número, sin importar el día en que se genere.
//
// El ancla es una fecha 'YYYY-MM-DD' del calendario LOCAL. Para 'semanal' se
// normaliza al lunes de su semana y para 'mensual' al día 1 de su mes, de modo
// que avanzar/retroceder nunca parte una semana ni desborda (31/01 + 1 mes).
import { formatFecha, fechaISO } from '../../core/formatters.js';

export const PERIODOS = [
  { valor: 'diario', label: 'Diario' },
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'mensual', label: 'Mensual' },
];

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Date local → 'YYYY-MM-DD'. No sirve toISOString(): convierte a UTC y en Perú
// (UTC-5) devolvería el día anterior para cualquier hora antes de las 19:00.
// Delega en core/formatters.js:fechaISO() — misma lógica, único punto de verdad.
export function aISO(fecha) {
  return fechaISO(fecha);
}

// 'YYYY-MM-DD' → Date local a medianoche (new Date('2026-08-05') sería UTC).
function aFecha(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function anclaDeHoy(periodo, hoy = new Date()) {
  return normalizarAncla(periodo, aISO(hoy));
}

export function normalizarAncla(periodo, ancla) {
  const f = aFecha(ancla);
  if (periodo === 'semanal') {
    const diaSemana = (f.getDay() + 6) % 7; // lunes = 0, domingo = 6
    f.setDate(f.getDate() - diaSemana);
  } else if (periodo === 'mensual') {
    f.setDate(1);
  }
  return aISO(f);
}

// Evita reportar un periodo que todavía no empezó (ej. elegir diciembre en el
// selector de mes estando en agosto): se queda en el periodo en curso.
export function limitarAncla(periodo, ancla, hoy = new Date()) {
  const maximo = anclaDeHoy(periodo, hoy);
  const normalizada = normalizarAncla(periodo, ancla);
  return aFecha(normalizada) > aFecha(maximo) ? maximo : normalizada;
}

export function desplazarAncla(periodo, ancla, delta) {
  const f = aFecha(normalizarAncla(periodo, ancla));
  if (periodo === 'diario') f.setDate(f.getDate() + delta);
  else if (periodo === 'semanal') f.setDate(f.getDate() + delta * 7);
  else f.setMonth(f.getMonth() + delta);
  return aISO(f);
}

// Rango cerrado [00:00:00.000 del primer día, 23:59:59.999 del último].
export function rangoDe(periodo, ancla) {
  const desde = aFecha(normalizarAncla(periodo, ancla));
  const hasta = new Date(desde);
  if (periodo === 'semanal') {
    hasta.setDate(hasta.getDate() + 6);
  } else if (periodo === 'mensual') {
    hasta.setMonth(hasta.getMonth() + 1);
    hasta.setDate(0); // día 0 del mes siguiente = último día de este mes
  }
  hasta.setHours(23, 59, 59, 999);
  return { desde, hasta };
}

// El periodo elegido incluye hoy: los totales todavía pueden subir, así que la
// UI y el PDF lo marcan como "en curso" para que nadie compare un mes completo
// contra uno a medias.
export function enCurso(periodo, ancla, hoy = new Date()) {
  const { desde, hasta } = rangoDe(periodo, ancla);
  return hoy >= desde && hoy <= hasta;
}

export function puedeAvanzar(periodo, ancla, hoy = new Date()) {
  const siguiente = desplazarAncla(periodo, ancla, 1);
  return rangoDe(periodo, siguiente).desde <= hoy;
}

// "05/08/2026" / "03/08/2026 — 09/08/2026" / "01/08/2026 — 31/08/2026"
export function etiquetaRango(periodo, ancla) {
  const { desde, hasta } = rangoDe(periodo, ancla);
  if (periodo === 'diario') return formatFecha(aISO(desde));
  return `${formatFecha(aISO(desde))} — ${formatFecha(aISO(hasta))}`;
}

// Título del periodo para el encabezado del PDF y el chip del modal:
// "Diario · 05/08/2026" / "Semanal · 03/08 al 09/08/2026" / "Mensual · Agosto 2026"
export function etiquetaPeriodo(periodo, ancla) {
  const { desde, hasta } = rangoDe(periodo, ancla);
  const nombre = PERIODOS.find((p) => p.valor === periodo)?.label || '';
  if (periodo === 'diario') return `${nombre} · ${formatFecha(aISO(desde))}`;
  if (periodo === 'mensual') return `${nombre} · ${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
  return `${nombre} · ${formatFecha(aISO(desde))} al ${formatFecha(aISO(hasta))}`;
}

// Etiqueta breve para nombrar el periodo dentro de una frase ("vs. Julio 2026"):
// "05/08/2026" / "semana del 03/08/2026" / "Julio 2026".
export function etiquetaCompacta(periodo, ancla) {
  const { desde } = rangoDe(periodo, ancla);
  if (periodo === 'diario') return formatFecha(aISO(desde));
  if (periodo === 'mensual') return `${MESES[desde.getMonth()]} ${desde.getFullYear()}`;
  return `semana del ${formatFecha(aISO(desde))}`;
}

// Nombre sugerido al "Guardar como PDF": identifica el periodo reportado, no
// el día en que se descargó. Sin "/" ni espacios (inválidos en un archivo).
export function nombreArchivoReporte(periodo, ancla) {
  const base = normalizarAncla(periodo, ancla);
  const sufijo = periodo === 'mensual' ? base.slice(0, 7) : base;
  const nombre = PERIODOS.find((p) => p.valor === periodo)?.label || 'Periodo';
  return `Reporte${nombre}_${sufijo}`;
}

// Años ofrecidos en el selector del periodo mensual (hacia atrás desde hoy).
export function aniosDisponibles(hoy = new Date(), cantidad = 5) {
  const anio = hoy.getFullYear();
  return Array.from({ length: cantidad }, (_, i) => anio - i);
}
