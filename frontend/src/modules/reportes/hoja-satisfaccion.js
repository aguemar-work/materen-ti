// Hoja y CSV del reporte de Satisfacción a partir de reporte_satisfaccion
// (migración 118; antes el consolidado de la 115). Solo da FORMATO: cada %,
// promedio y situación ya viene del servidor con su muestra (la MISMA muestra
// mínima que el reporte de Tickets y los umbrales de Configuración); acá no se
// promedia ni se cuenta. La hoja se imprime con window.print().
import { formatFecha } from '../../core/formatters.js';
import { TONO_SITUACION_SATISFACCION } from '../../core/tonos.js';
import { celda, textoCsat, nombreGrupoTecnico, JEFATURA_Y_OTROS } from './hoja.js';
import { MESES } from './periodo.js';

const SIN = 'Sin registrar';
const num = (v) => (v == null ? celda('—', { num: true, tenue: true }) : celda(v, { num: true }));
const promedio = (f) => celda(textoCsat({ promedio: f.promedio, insuficiente: f.insuficiente, n: f.muestra }), { num: true, tenue: !!f.insuficiente });
const pctFila = (f, { tenue = false } = {}) => (f.pctSatisfaccion == null
  ? celda(f.muestra ? `n insuficiente (${f.muestra})` : '—', { num: true, tenue: true })
  : celda(`${f.pctSatisfaccion} %`, { num: true, tenue }));

export const SITUACIONES_SATISFACCION = {
  conforme: 'Conforme',
  regular: 'Regular',
  inconforme: 'Inconforme',
  pocas_respuestas: 'Pocas respuestas',
  sin_respuestas: 'Sin respuestas',
};

function etiquetaMes(iso) {
  if (!iso) return SIN;
  const [y, m] = String(iso).slice(0, 7).split('-').map(Number);
  const mes = MESES[m - 1] || '';
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} ${y}`;
}

const esInsatisfecha = (r) => r.nivel != null && r.nivel <= 2;

// Revisión de una calificación baja (120): qué se hizo y si fue a tiempo.
const DESENLACES = { reabierto: 'Reabierto', nota: 'Nota interna' };
const aTiempo = (v) => (v == null ? celda('—', { tenue: true }) : celda(v ? 'Sí' : 'No', { tag: v ? 'ok' : 'critico' }));

/**
 * @param {object} c  jsonb de insforgeApi.obtenerReporteSatisfaccion()
 * @returns {Array<{ id, titulo, nota?, cifras?, distribucion?, barras?, tablas? }>}
 */
export function seccionesSatisfaccion(c) {
  if (!c) return [];
  const r = c.resumen || {};
  const conTecnicos = Array.isArray(c.porTecnico);
  const u = c.umbrales || {};
  const mesa = new Map((c.porTecnico || []).filter((t) => t.grupo === 'tecnico').map((t) => [t.tecnico_id, t.nombre]));
  // En la hoja, el técnico de mesa por su nombre; cualquier otra persona, «Jefatura y otros».
  const tecnicoDe = (id) => (id ? (mesa.get(id) || JEFATURA_Y_OTROS) : SIN);
  const secciones = [];

  secciones.push({
    id: 'resumen',
    titulo: 'Resumen',
    nota: `${c.periodo ? 'Tickets resueltos en el período' : 'Todo el historial'}. Un % o un promedio se publica con ${c.muestraMinima} respuestas o más (la misma muestra mínima del reporte de Tickets).`,
    cifras: [
      {
        rotulo: 'Satisfacción',
        valor: r.pctSatisfaccion ?? '—',
        unidad: r.pctSatisfaccion == null ? '' : '%',
        detalle: r.pctSatisfaccion == null ? `n insuficiente (${r.muestra ?? 0})` : `${r.satisfechos} de ${r.muestra} respondieron 4 o 5`,
      },
      { rotulo: 'Promedio', valor: r.promedio == null ? '—' : Number(r.promedio).toFixed(2).replace('.', ','), detalle: 'escala de 1 a 5' },
      { rotulo: 'Respondidas', valor: r.encuestasRespondidas ?? 0, unidad: ` / ${r.encuestasGeneradas ?? 0}`, detalle: r.tasaRespuestaPct == null ? 'sin encuestas' : `${r.tasaRespuestaPct} % de respuesta` },
      { rotulo: 'Faltan responder', valor: r.faltan ?? 0, detalle: 'encuestas sin respuesta' },
      { rotulo: 'Insatisfechos', valor: r.insatisfechos ?? 0, detalle: 'respondieron 1 o 2' },
      { rotulo: 'Tickets resueltos', valor: r.tickets ?? 0, detalle: c.periodo ? 'en el período' : 'en todo el historial' },
      // 120: se cuentan aparte; sin calificación no entran en ninguna muestra.
      ...(c.cierresSinValidacion ? [{ rotulo: 'Cerrados sin validación', valor: c.cierresSinValidacion.total ?? 0, detalle: 'nadie calificó a tiempo; no cuentan como satisfechos' }] : []),
    ],
    distribucion: {
      titulo: 'Cómo respondieron',
      segmentos: [
        { etiqueta: 'Satisfechos (4 y 5)', cantidad: r.satisfechos ?? 0, tono: 'ok' },
        { etiqueta: 'Regulares (3)', cantidad: r.regulares ?? 0, tono: 'neutro' },
        { etiqueta: 'Insatisfechos (1 y 2)', cantidad: r.insatisfechos ?? 0, tono: 'critico' },
      ],
    },
  });

  if (conTecnicos) {
    secciones.push({
      id: 'tecnicos',
      titulo: 'Por técnico',
      nota: 'Satisfacción de los tickets que resolvió cada técnico de mesa de ayuda; lo que resolvió cualquier otra persona va en «Jefatura y otros».',
      barras: {
        titulo: 'Satisfacción por técnico',
        filas: c.porTecnico.map((t) => ({ etiqueta: nombreGrupoTecnico(t), pct: t.pctSatisfaccion, nota: `n insuficiente (${t.muestra})` })),
      },
      tablas: [{
        columnas: [
          { titulo: 'Técnico' }, { titulo: 'Tickets', num: true }, { titulo: 'Encuestas', num: true }, { titulo: 'Respondidas', num: true },
          { titulo: 'Faltan', num: true }, { titulo: 'Satisfechos', num: true }, { titulo: 'Regulares', num: true }, { titulo: 'Insatisf.', num: true },
          { titulo: '% satisf.', num: true }, { titulo: 'Promedio', num: true },
        ],
        filas: c.porTecnico.map((t) => [
          celda(nombreGrupoTecnico(t), { tenue: t.grupo === 'otros' }), num(t.tickets), num(t.encuestasGeneradas), num(t.encuestasRespondidas),
          num(t.faltan), num(t.satisfechos), num(t.regulares), num(t.insatisfechos), pctFila(t), promedio(t),
        ]),
        vacio: 'Sin técnicos de mesa marcados ni tickets resueltos',
      }],
    });
  }

  secciones.push({
    id: 'solicitantes',
    titulo: 'Por solicitante',
    nota: `Quién pidió, cuánto respondió y si está conforme: conforme desde ${u.conformePct ?? 80} %, regular desde ${u.regularPct ?? 60} %, inconforme debajo; con menos de ${u.minimoPersona ?? 3} respuestas, «Pocas respuestas».`,
    tablas: [{
      columnas: [
        { titulo: 'Persona' }, { titulo: 'Área u obra' }, { titulo: 'Tickets', num: true }, { titulo: 'Encuestas', num: true },
        { titulo: 'Respondió', num: true }, { titulo: 'Le faltan', num: true }, { titulo: '% satisf.', num: true }, { titulo: 'Situación', ancho: 'w-36' },
      ],
      filas: (c.porSolicitante || []).map((f) => [
        celda(f.nombre || 'Sin vincular', { tenue: !f.empleado_id }), celda(f.area || SIN, { tenue: !f.area }), num(f.tickets), num(f.encuestasGeneradas),
        num(f.encuestasRespondidas), num(f.faltan), pctFila(f, { tenue: f.situacion === 'pocas_respuestas' }),
        celda(SITUACIONES_SATISFACCION[f.situacion] || SIN, { tag: TONO_SITUACION_SATISFACCION[f.situacion] || 'neutro' }),
      ]),
      vacio: 'Sin tickets resueltos en el período',
    }],
  });

  if ((c.porMes || []).length > 1) {
    secciones.push({
      id: 'meses',
      titulo: 'Por mes de resolución',
      tablas: [{
        columnas: [
          { titulo: 'Mes' }, { titulo: 'Tickets', num: true }, { titulo: 'Respondidas', num: true }, { titulo: 'Faltan', num: true },
          { titulo: '% satisf.', num: true }, { titulo: 'Promedio', num: true }, { titulo: 'Insatisf.', num: true },
        ],
        filas: c.porMes.map((f) => [celda(etiquetaMes(f.mes)), num(f.tickets), num(f.encuestasRespondidas), num(f.faltan), pctFila(f), promedio(f), num(f.insatisfechos)]),
      }],
    });
  }

  // 120: cada respuesta de 1 o 2 del período con su revisión (informe mensual).
  const cb = c.calificacionesBajas;
  if (cb) {
    secciones.push({
      id: 'revision',
      titulo: 'Calificaciones bajas y su revisión',
      nota: 'Cada respuesta de 1 o 2 del período, por fecha de respuesta. El técnico la revisa a más tardar el día hábil siguiente (lunes a viernes, sin feriados): reabre el ticket si la necesidad no se resolvió o deja una nota interna si se resolvió.',
      cifras: [
        { rotulo: 'Calificaciones bajas', valor: cb.total ?? 0, detalle: 'respuestas de 1 o 2' },
        { rotulo: 'Reabiertas', valor: cb.reabiertos ?? 0, detalle: 'la atención continuó' },
        { rotulo: 'Con nota', valor: cb.conNota ?? 0, detalle: 'se explicó la solución' },
        { rotulo: 'Sin revisar', valor: cb.pendientes ?? 0, detalle: 'todavía pendientes' },
        { rotulo: 'Fuera de plazo', valor: cb.fueraDePlazo ?? 0, detalle: 'revisadas tarde o vencidas' },
      ],
      tablas: [{
        columnas: [
          { titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Nivel', num: true, ancho: 'w-16' }, { titulo: 'Respondió', ancho: 'w-28' },
          { titulo: 'Plazo', ancho: 'w-28' }, { titulo: 'Revisión' }, { titulo: 'A tiempo', ancho: 'w-24' },
          ...(conTecnicos ? [{ titulo: 'Revisó' }] : []), { titulo: 'Nota' },
        ],
        filas: (cb.lista || []).map((x) => [
          celda(x.ticket_codigo, { codigo: true }), num(x.nivel), celda(formatFecha(x.fecha_envio)), celda(formatFecha(x.plazo)),
          celda(DESENLACES[x.desenlace] || 'Sin revisar', { tenue: !x.desenlace }), aTiempo(x.a_tiempo),
          ...(conTecnicos ? [celda(x.revisado_por || SIN, { tenue: !x.revisado_por })] : []), celda(x.nota || '—', { tenue: !x.nota }),
        ]),
        vacio: 'Ninguna calificación de 1 o 2 en el período',
      }],
    });
  }

  const bajas = (c.respuestas || []).filter((x) => esInsatisfecha(x) && x.comentario)
    .sort((a, b) => new Date(b.fecha_envio || b.created_at) - new Date(a.fecha_envio || a.created_at));
  secciones.push({
    id: 'comentarios',
    titulo: 'Comentarios de respuestas insatisfechas',
    tablas: [{
      columnas: [
        { titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Persona' }, ...(conTecnicos ? [{ titulo: 'Técnico' }] : []),
        { titulo: 'Nivel', num: true, ancho: 'w-16' }, { titulo: 'Comentario' }, { titulo: 'Fecha', ancho: 'w-28' },
      ],
      filas: bajas.map((x) => [
        celda(x.ticket_codigo, { codigo: true }), celda(x.solicitante || 'Sin vincular'), ...(conTecnicos ? [celda(tecnicoDe(x.tecnico_id))] : []),
        num(x.nivel), celda(x.comentario), celda(formatFecha(x.fecha_envio || x.created_at)),
      ]),
      vacio: 'Ninguna respuesta insatisfecha con comentario',
    }],
  });

  return secciones.map((x, i) => ({ ...x, titulo: `${i + 1}. ${x.titulo}` }));
}

/** Datos de la carátula. */
export function caratulaSatisfaccion(c, etiqueta) {
  const r = c?.resumen || {};
  return [
    { rotulo: 'Período', valor: etiqueta },
    { rotulo: 'Encuestas', valor: `${r.encuestasRespondidas ?? 0} respondidas de ${r.encuestasGeneradas ?? 0}` },
    { rotulo: 'Muestra mínima', valor: String(c?.muestraMinima ?? '') },
    { rotulo: 'Generado por', valor: c?.generado_por?.nombre || SIN },
    { rotulo: 'Definiciones', valor: c?.definiciones_version || '' },
  ];
}

/**
 * CSV: una fila por encuesta generada, sin DNI ni contacto (el servidor no los
 * envía). «Resolvió» solo cuando el servidor mandó la sección por técnico
 * (JEFE), con el nombre de la persona.
 */
export function csvSatisfaccion(c, { nombresStaff = {} } = {}) {
  const conTecnicos = Array.isArray(c?.porTecnico);
  return {
    cabecera: ['Ticket', 'Título', 'Solicitante', ...(conTecnicos ? ['Resolvió'] : []), 'Respondida', 'Nivel (1-5)', 'Comentario', 'Generada', 'Respondida el'],
    filas: (c?.respuestas || []).map((r) => [
      r.ticket_codigo, r.ticket_titulo || '', r.solicitante || 'Sin vincular',
      ...(conTecnicos ? [r.tecnico_id ? (nombresStaff[r.tecnico_id] || SIN) : ''] : []),
      r.respondida ? 'Sí' : 'No', r.nivel == null ? '' : String(r.nivel), r.comentario || '',
      r.created_at ? formatFecha(r.created_at.slice(0, 10)) : '', r.fecha_envio ? formatFecha(r.fecha_envio.slice(0, 10)) : '',
    ]),
  };
}
