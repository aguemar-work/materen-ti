// Hoja y CSV del reporte de Satisfacción a partir del consolidado de
// reporte_satisfaccion_consolidado (migración 115). Solo da FORMATO: cada
// promedio ya viene del servidor con su muestra y su `insuficiente` (la MISMA
// muestra mínima que el reporte de Tickets); acá no se promedia ni se cuenta.
// Reemplaza a la vista de Tickets › Satisfacción y a su PDF de jsPDF
// (2026-10-05): la hoja se imprime con window.print().
import { formatFecha } from '../../core/formatters.js';
import { celda, textoCsat } from './hoja.js';
import { MESES } from './periodo.js';

const SIN = 'Sin registrar';
const num = (v) => (v == null ? celda('—', { num: true, tenue: true }) : celda(v, { num: true }));
const niveles = (n) => celda([1, 2, 3, 4, 5].map((k) => n?.[k] ?? 0).join(' · '), { num: true });
const promedio = (f) => celda(textoCsat({ promedio: f.promedio, insuficiente: f.insuficiente, n: f.muestra }), { num: true, tenue: !!f.insuficiente });

function etiquetaMes(iso) {
  if (!iso) return SIN;
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number);
  const mes = MESES[m - 1] || '';
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${y}`;
}

const COLUMNAS_GRUPO = (primera) => [
  { titulo: primera }, { titulo: 'Generadas', num: true }, { titulo: 'Respondidas', num: true }, { titulo: 'n', num: true },
  { titulo: 'Promedio', num: true }, { titulo: 'Niveles 1 · 2 · 3 · 4 · 5', num: true }, { titulo: 'Insatisfechos', num: true },
];
const filaGrupo = (nombre, f) => [
  celda(nombre), num(f.encuestasGeneradas), num(f.encuestasRespondidas), num(f.muestra), promedio(f), niveles(f.niveles), num(f.insatisfechos),
];

const esInsatisfecha = (r) => r.nivel != null && r.nivel <= 2;

/**
 * @param {object} c  consolidado de insforgeApi.obtenerSatisfaccionConsolidado()
 * @returns {Array<{ id, titulo, nota?, tablas }>}
 */
export function seccionesSatisfaccion(c) {
  if (!c) return [];
  const r = c.resumen || {};
  const bajas = (c.respuestas || []).filter((x) => esInsatisfecha(x) && x.comentario)
    .sort((a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at));
  return [
    {
      id: 'resumen',
      titulo: '1. Resumen',
      nota: `Todo el historial. Un promedio se publica con ${c.muestraMinima} respuestas o más (la misma muestra mínima del reporte de Tickets).`,
      tablas: [{
        columnas: [{ titulo: 'Indicador' }, { titulo: 'Valor', num: true }],
        filas: [
          [celda('Encuestas generadas'), num(r.encuestasGeneradas)],
          [celda('Respondidas'), num(r.encuestasRespondidas)],
          [celda('Tasa de respuesta'), r.tasaRespuestaPct == null ? num(null) : celda(`${r.tasaRespuestaPct} %`, { num: true })],
          [celda('Promedio (1 a 5)'), promedio(r)],
          [celda('Insatisfechos (nivel 1 o 2)'), num(r.insatisfechos)],
        ],
      }],
    },
    {
      id: 'meses',
      titulo: '2. Por mes de resolución',
      tablas: [{ columnas: COLUMNAS_GRUPO('Mes'), filas: (c.porMes || []).map((f) => filaGrupo(etiquetaMes(f.mes), f)) }],
    },
    {
      id: 'tecnicos',
      titulo: '3. Por técnico',
      nota: '«Resolvió» es quien marcó el ticket como resuelto por última vez. Peor promedio primero; sin promedio publicable al final.',
      tablas: [{ columnas: COLUMNAS_GRUPO('Resolvió'), filas: (c.porTecnico || []).map((f) => filaGrupo(f.nombre || SIN, f)) }],
    },
    {
      id: 'solicitantes',
      titulo: '4. Por solicitante',
      tablas: [{ columnas: COLUMNAS_GRUPO('Solicitante'), filas: (c.porSolicitante || []).map((f) => filaGrupo(f.nombre || 'Sin vincular', f)) }],
    },
    {
      id: 'comentarios',
      titulo: '5. Comentarios de respuestas insatisfechas',
      tablas: [{
        columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Nivel', num: true, ancho: 'w-16' }, { titulo: 'Comentario' }, { titulo: 'Fecha', ancho: 'w-28' }],
        filas: bajas.map((x) => [celda(x.ticket_codigo, { codigo: true }), num(x.nivel), celda(x.comentario), celda(formatFecha(x.fecha_envio || x.created_at))]),
      }],
    },
  ];
}

/** Datos de la carátula. */
export function caratulaSatisfaccion(c) {
  const r = c?.resumen || {};
  return [
    { rotulo: 'Alcance', valor: 'Todo el historial' },
    { rotulo: 'Encuestas', valor: `${r.encuestasRespondidas ?? 0} respondidas de ${r.encuestasGeneradas ?? 0}` },
    { rotulo: 'Muestra mínima', valor: String(c?.muestraMinima ?? '') },
  ];
}

/** CSV: una fila por encuesta generada, sin DNI ni contacto (el servidor no los envía). */
export function csvSatisfaccion(c) {
  const tecnicos = new Map((c?.porTecnico || []).map((t) => [t.tecnico_id, t.nombre || SIN]));
  return {
    cabecera: ['Ticket', 'Título', 'Solicitante', 'Resolvió', 'Respondida', 'Nivel (1-5)', 'Comentario', 'Generada', 'Respondida el'],
    filas: (c?.respuestas || []).map((r) => [
      r.ticket_codigo, r.ticket_titulo || '', r.solicitante || 'Sin vincular', r.tecnico_id ? (tecnicos.get(r.tecnico_id) || SIN) : '',
      r.respondida ? 'Sí' : 'No', r.nivel == null ? '' : String(r.nivel), r.comentario || '',
      r.created_at ? formatFecha(r.created_at.slice(0, 10)) : '', r.fecha_envio ? formatFecha(r.fecha_envio.slice(0, 10)) : '',
    ]),
  };
}
