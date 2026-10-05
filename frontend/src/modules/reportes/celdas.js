// Formato de los reportes centralizados (migración 117): el servidor manda
// cada tabla como { columnas: [{ clave, titulo, tipo }], filas: [{ clave: valor }] }
// y el CSV como { columnas, filas: [[valor, ...]] }. Acá solo se da FORMATO
// según el tipo de columna (texto, codigo, numero, decimal, pct, fecha,
// fecha_hora): nada se suma, se promedia ni se filtra. Separado del .vue para
// probarlo sin montar nada.
import { formatFecha, formatFechaHora } from '../../core/formatters.js';

const NUMERICOS = new Set(['numero', 'decimal', 'pct']);

const decimal = (v) => Number(v).toFixed(1).replace('.', ',');

/** Texto de un valor según el tipo de su columna; null si no hay dato. */
export function textoValor(tipo, valor) {
  if (valor == null || valor === '') return null;
  switch (tipo) {
    case 'fecha': return formatFecha(valor);
    case 'fecha_hora': return formatFechaHora(valor);
    case 'decimal': return decimal(valor);
    case 'pct': return `${valor} %`;
    default: return String(valor);
  }
}

/**
 * Celda de ReporteTabla. El vacío se registra (regla 21): "Sin registrar" en
 * gris para un texto, "—" para una cifra.
 */
export function celdaDe(columna, valor) {
  const num = NUMERICOS.has(columna.tipo);
  const texto = textoValor(columna.tipo, valor);
  if (texto == null) return { texto: num ? '—' : 'Sin registrar', num, tenue: true };
  return { texto, num, codigo: columna.tipo === 'codigo' };
}

/** Una tabla del jsonb → la forma de ReporteTabla ({ titulo, nota, columnas, filas }). */
export function tablaParaHoja(t) {
  const columnas = t.columnas || [];
  return {
    titulo: t.titulo || '',
    nota: t.nota || '',
    columnas: columnas.map((c) => ({ titulo: c.titulo, num: NUMERICOS.has(c.tipo) })),
    filas: (t.filas || []).map((f) => columnas.map((c) => celdaDe(c, f[c.clave]))),
  };
}

/** Secciones del jsonb → secciones de la hoja (las pinta ReporteSecciones). */
export function seccionesParaHoja(secciones) {
  return (secciones || []).map((s) => ({ id: s.id, titulo: s.titulo, nota: s.nota || '', tablas: (s.tablas || []).map(tablaParaHoja) }));
}

/**
 * CSV del reporte: la cabecera son los títulos y cada valor va con el mismo
 * formato de la hoja (fechas dd/mm/aaaa); las cifras, sin unidad. Sale del
 * MISMO jsonb que la hoja: no se vuelve a consultar nada.
 */
export function csvDeReporte(reporte) {
  const columnas = reporte?.filas_csv?.columnas || [];
  const cabecera = columnas.map((c) => c.titulo);
  const filas = (reporte?.filas_csv?.filas || []).map((fila) => columnas.map((c, i) => {
    const v = fila[i];
    if (v == null || v === '') return '';
    if (c.tipo === 'fecha') return formatFecha(v);
    if (c.tipo === 'fecha_hora') return formatFechaHora(v);
    return String(v);
  }));
  return { cabecera, filas };
}

/** Nombre del archivo: el reporte y lo que identifica su contenido (período, corte o ronda), no el día de descarga. */
export function nombreArchivo(reporteId, reporte) {
  const p = reporte?.periodo;
  if (p?.desde) return `Reporte_${reporteId}_${p.desde}_${p.hasta}`;
  if (reporte?.ronda?.abierta_el) return `Reporte_${reporteId}_ronda_${reporte.ronda.abierta_el}`;
  const corte = String(reporte?.corte_at || reporte?.generado_en || '').slice(0, 10);
  return corte ? `Reporte_${reporteId}_${corte}` : `Reporte_${reporteId}`;
}
