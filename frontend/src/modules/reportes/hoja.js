// Arma las secciones de la hoja imprimible a partir del jsonb de
// reporte_tickets (migración 115). Solo da FORMATO: no suma, no promedia, no
// decide qué es "resuelto". Cada tabla es { titulo?, nota?, columnas, filas }
// y cada fila una lista de celdas { texto, num?, tenue? }; ReporteTicketsView la
// pinta con ReporteTabla. Separado del .vue para probarlo sin montar nada.
import { formatHoras, formatFecha } from '../../core/formatters.js';
import { prioridadInfo } from '../../core/dominio-tickets.js';

const TIPO = { incidente: 'Incidente', solicitud: 'Solicitud', sin_clasificar: 'Sin clasificar' };
const SIN = 'Sin registrar';

export const celda = (texto, extra = {}) => ({ texto: texto == null || texto === '' ? '—' : String(texto), ...extra });
const num = (v, extra = {}) => (v == null ? celda('—', { num: true, tenue: true, ...extra }) : celda(v, { num: true, ...extra }));
const horas = (v) => (v == null ? celda('—', { num: true, tenue: true }) : celda(formatHoras(Number(v)), { num: true }));
const pct = (v) => (v == null ? celda('—', { num: true, tenue: true }) : celda(`${v} %`, { num: true }));

/** Promedio de CSAT: "4,2 / 5" o "n insuficiente (3)". */
export function textoCsat(c) {
  if (!c) return '—';
  if (c.insuficiente || c.promedio == null) return `n insuficiente (${c.n ?? 0})`;
  return `${Number(c.promedio).toFixed(1).replace('.', ',')} / 5`;
}

/** Diferencia contra el período anterior: "+3" / "−2" / "igual"; '' si no hay con qué comparar. */
export function textoDelta(actual, anterior, decimales = 0) {
  if (actual == null || anterior == null) return '';
  const d = Number((Number(actual) - Number(anterior)).toFixed(decimales));
  if (d === 0) return 'igual';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(decimales)}`;
}

function etiquetaPrioridad(p) {
  return p && p !== 'sin_definir' ? prioridadInfo(p).label : 'Sin definir';
}

function filaDimension(d) {
  return [celda(d.nombre), num(d.creados), num(d.resueltos)];
}

/**
 * @param {object} r         jsonb de reporte_tickets
 * @param {object} opciones  { nombresStaff: {user_id: nombre} } para rotular técnicos en anexos
 * @returns {Array<{ id, titulo, nota?, tablas: Array }>}
 */
export function armarSecciones(r, { nombresStaff = {} } = {}) {
  if (!r) return [];
  const tecnico = r.alcance?.tipo === 'tecnico';
  const c = r.comparacion;
  const conTecnicos = Array.isArray(r.por_tecnico);
  const porTecnicoNombres = new Map((r.por_tecnico || []).map((t) => [t.tecnico_id, t.nombre]));
  const nombreTecnico = (id) => (id ? porTecnicoNombres.get(id) || nombresStaff[id] || 'Sin registrar' : SIN);
  const secciones = [];

  // 1 Volumen
  const v = r.volumen || {};
  const volumen = [
    ['Creados en el período', v.creados, c?.volumen?.creados],
    ['Rechazados (aparte)', v.rechazados, c?.volumen?.rechazados],
    ['Resueltos en el período', v.resueltos, c?.volumen?.resueltos],
    ['· creados en el mismo período', v.resueltos_mismo_periodo, c?.volumen?.resueltos_mismo_periodo],
    ['· arrastrados de períodos anteriores', v.resueltos_arrastrados, c?.volumen?.resueltos_arrastrados],
    ['Cerrados sin encuesta', v.cerrados_sin_encuesta, c?.volumen?.cerrados_sin_encuesta],
  ].filter(([, valor]) => !(tecnico && valor == null));
  const tablaVolumen = {
    columnas: [{ titulo: 'Indicador' }, { titulo: 'Cantidad', num: true }, ...(c ? [{ titulo: 'Anterior', num: true }, { titulo: 'Diferencia', num: true }] : [])],
    filas: volumen.map(([rotulo, valor, previo]) => [celda(rotulo), num(valor), ...(c ? [num(previo, { tenue: true }), celda(textoDelta(valor, previo) || '—', { num: true, tenue: true })] : [])]),
  };
  const tablas = [tablaVolumen];
  if (v.backlog) {
    tablas.push({
      titulo: v.backlog.referencia === 'cierre' ? 'Backlog al cierre del período (reconstruido por eventos)' : 'Backlog ahora (período en curso)',
      nota: v.backlog.dias_mas_antiguo != null ? `${v.backlog.total} vigentes · el más antiguo lleva ${v.backlog.dias_mas_antiguo} días corridos` : `${v.backlog.total} vigentes`,
      columnas: [{ titulo: 'Antigüedad (días corridos)' }, { titulo: 'Tickets', num: true }],
      filas: (v.backlog.tramos || []).map((t) => [celda(t.etiqueta), num(t.cantidad)]),
    });
  }
  secciones.push({ id: 'volumen', titulo: '1. Volumen', nota: tecnico ? 'Alcance de un técnico: solo lo que resolvió; los creados no se atribuyen a una persona.' : '', tablas });

  // 2 Atención
  const a = r.atencion || {};
  const resol = a.resolucion || {};
  const pr = a.primera_respuesta || {};
  secciones.push({
    id: 'atencion',
    titulo: '2. Atención (horas corridas)',
    nota: 'Horas de reloj, sin descontar noches ni fines de semana: no existe horario laboral. La mediana va primero porque un solo ticket olvidado no la desplaza.',
    tablas: [
      {
        columnas: [{ titulo: 'Tiempo' }, { titulo: 'Mediana', num: true }, { titulo: 'Promedio', num: true }, { titulo: 'n', num: true }, ...(c ? [{ titulo: 'Mediana anterior', num: true }] : [])],
        filas: [
          [celda('Resolución (creación → resolución)'), horas(resol.mediana_horas), horas(resol.promedio_horas), num(resol.n), ...(c ? [horas(c.atencion?.mediana_horas)] : [])],
          [celda('Primera respuesta (creación → primer mensaje de TI)'), horas(pr.mediana_horas), horas(pr.promedio_horas), num(pr.n), ...(c ? [celda('—', { num: true, tenue: true })] : [])],
        ],
      },
      {
        titulo: 'Resolución por prioridad',
        columnas: [{ titulo: 'Prioridad' }, { titulo: 'Mediana', num: true }, { titulo: 'Promedio', num: true }, { titulo: 'n', num: true }],
        filas: (a.por_prioridad || []).map((p) => [celda(etiquetaPrioridad(p.prioridad)), horas(p.mediana_horas), horas(p.promedio_horas), num(p.n)]),
      },
    ],
  });

  // 3 Calidad
  const q = r.calidad || {};
  const re = q.reaperturas || {};
  const cs = q.csat || {};
  const tablasCalidad = [
    {
      titulo: 'Reaperturas',
      nota: re.ventana_completa === false ? `El corte de ${re.corte_dias} días aún no venció para todo el período: la tasa puede subir.` : '',
      columnas: [{ titulo: 'Indicador' }, { titulo: 'Valor', num: true }, ...(c ? [{ titulo: 'Anterior', num: true }] : [])],
      filas: [
        [celda('Tickets resueltos por primera vez en el período'), num(re.base), ...(c ? [num(c.reaperturas?.base, { tenue: true })] : [])],
        [celda(`· reabiertos dentro de ${re.corte_dias ?? 30} días`), num(re.reabiertos), ...(c ? [num(c.reaperturas?.reabiertos, { tenue: true })] : [])],
        [celda('Tasa de reapertura'), pct(re.tasa_pct), ...(c ? [pct(c.reaperturas?.tasa_pct)] : [])],
        [celda('Reaperturas ocurridas en el período (no desde rechazado)'), num(re.eventos), ...(c ? [num(c.reaperturas?.eventos, { tenue: true })] : [])],
      ],
    },
    {
      titulo: `Satisfacción (CSAT, muestra mínima ${cs.minimo ?? 5})`,
      columnas: [{ titulo: 'Indicador' }, { titulo: 'Valor', num: true }, ...(c ? [{ titulo: 'Anterior', num: true }] : [])],
      filas: [
        [celda('Encuestas generadas'), num(cs.generadas), ...(c ? [num(c.csat?.generadas, { tenue: true })] : [])],
        [celda('Respondidas'), num(cs.respondidas), ...(c ? [num(c.csat?.respondidas, { tenue: true })] : [])],
        [celda('Tasa de respuesta'), pct(cs.tasa_respuesta_pct), ...(c ? [pct(c.csat?.tasa_respuesta_pct)] : [])],
        [celda('Promedio (1 a 5)'), celda(textoCsat(cs), { num: true, tenue: !!cs.insuficiente }), ...(c ? [celda(textoCsat(c.csat), { num: true, tenue: true })] : [])],
        [celda('Respuestas por nivel 1 · 2 · 3 · 4 · 5'), celda([1, 2, 3, 4, 5].map((k) => cs.niveles?.[k] ?? 0).join(' · '), { num: true }), ...(c ? [celda('—', { num: true, tenue: true })] : [])],
        [celda('Insatisfechos (nivel 1 o 2)'), num(cs.insatisfechos), ...(c ? [num(c.csat?.insatisfechos, { tenue: true })] : [])],
      ],
    },
  ];
  if ((q.comentarios_bajos || []).length) {
    tablasCalidad.push({
      titulo: 'Comentarios de respuestas insatisfechas',
      nota: q.comentarios_bajos_total > q.comentarios_bajos.length ? `Se muestran ${q.comentarios_bajos.length} de ${q.comentarios_bajos_total}.` : '',
      columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Nivel', num: true, ancho: 'w-16' }, { titulo: 'Comentario' }, { titulo: 'Fecha', ancho: 'w-28' }],
      filas: q.comentarios_bajos.map((x) => [celda(x.codigo, { codigo: true }), num(x.nivel), celda(x.comentario), celda(formatFecha(x.fecha))]),
    });
  }
  secciones.push({ id: 'calidad', titulo: '3. Calidad', tablas: tablasCalidad });

  // 4 Por técnico (solo llega al JEFE)
  if (Array.isArray(r.por_tecnico)) {
    secciones.push({
      id: 'tecnicos',
      titulo: '4. Por técnico',
      nota: '"Resolvió" es quien marcó el ticket como resuelto por última vez. "Asignados hoy" son los vigentes a su cargo en este momento, no la carga al cierre del período.',
      tablas: [{
        columnas: [
          { titulo: 'Resolvió' }, { titulo: 'Resueltos', num: true }, { titulo: 'Del período', num: true }, { titulo: 'Arrastrados', num: true },
          { titulo: 'Mediana', num: true }, { titulo: 'Promedio', num: true }, { titulo: 'n', num: true }, { titulo: 'CSAT', num: true }, { titulo: 'Reabiertos', num: true }, { titulo: 'Asignados hoy', num: true },
        ],
        filas: r.por_tecnico.map((t) => [
          celda(t.nombre || SIN), num(t.resueltos), num(t.mismo_periodo), num(t.arrastrados),
          horas(t.tiempos?.mediana_horas), horas(t.tiempos?.promedio_horas), num(t.tiempos?.n),
          celda(textoCsat(t.csat), { num: true, tenue: !!t.csat?.insuficiente }),
          celda(t.reaperturas ? `${t.reaperturas.reabiertos} de ${t.reaperturas.base}` : '—', { num: true }),
          num(t.asignados_hoy),
        ]),
      }],
    });
  }

  // 5 Por categoría y por área
  const p = r.por || {};
  const n5 = Array.isArray(r.por_tecnico) ? 5 : 4;
  secciones.push({
    id: 'distribuciones',
    titulo: `${n5}. Por categoría y por área`,
    nota: 'Creados y resueltos del período en cada grupo. El área es la del empleado hoy.',
    tablas: [
      { titulo: 'Por categoría', columnas: [{ titulo: 'Categoría' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (p.categoria || []).map(filaDimension) },
      { titulo: 'Por subcategoría', columnas: [{ titulo: 'Categoría › subcategoría' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (p.subcategoria || []).map(filaDimension) },
      { titulo: 'Por prioridad', columnas: [{ titulo: 'Prioridad' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (p.prioridad || []).map((d) => [celda(etiquetaPrioridad(d.clave)), num(d.creados), num(d.resueltos)]) },
      { titulo: 'Por tipo y nivel', columnas: [{ titulo: 'Tipo / nivel' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }],
        filas: [...(p.tipo || []).map((d) => [celda(TIPO[d.nombre] || d.nombre), num(d.creados), num(d.resueltos)]), ...(p.nivel || []).map(filaDimension)] },
      { titulo: 'Por área u obra', columnas: [{ titulo: 'Área / obra' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (p.area || []).map(filaDimension) },
    ],
  });

  // 6 Anexos
  const an = r.anexos || {};
  secciones.push({
    id: 'anexos',
    titulo: `${n5 + 1}. Anexos`,
    tablas: [
      {
        // La columna "Resolvió" solo existe cuando el servidor entregó la
        // sección por técnico (JEFE): el nombre del técnico no se muestra a
        // quien no tiene ese rol.
        titulo: 'Arrastrados: resueltos en el período, creados antes',
        columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Título' }, { titulo: 'Creado', ancho: 'w-24' }, { titulo: 'Resuelto', ancho: 'w-24' }, { titulo: 'Días', num: true, ancho: 'w-16' }, ...(conTecnicos ? [{ titulo: 'Resolvió', ancho: 'w-40' }] : [])],
        filas: (an.arrastrados || []).map((x) => [celda(x.codigo, { codigo: true }), celda(x.titulo), celda(formatFecha(x.created_at)), celda(formatFecha(x.resuelto_at)), num(x.dias_abierto), ...(conTecnicos ? [celda(nombreTecnico(x.tecnico_id))] : [])]),
      },
      {
        titulo: 'Cerrados sin encuesta',
        columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Título' }, { titulo: 'Resuelto', ancho: 'w-24' }, { titulo: 'Motivo', ancho: 'w-40' }],
        filas: (an.cerrados_sin_encuesta || []).map((x) => [celda(x.codigo, { codigo: true }), celda(x.titulo), celda(formatFecha(x.resuelto_at)), celda(x.motivo === 'sin_solicitante' ? 'Sin solicitante identificado' : 'Sin encuesta generada')]),
      },
    ],
  });

  return secciones;
}

/** Pares rótulo/valor de la carátula. */
export function datosCaratula(r, etiquetaPeriodo) {
  if (!r) return [];
  const alcance = r.alcance?.tipo === 'tecnico' ? `Técnico · ${r.alcance.tecnico_nombre || SIN}` : 'Todo el equipo';
  return [
    { rotulo: 'Período', valor: etiquetaPeriodo },
    { rotulo: 'Alcance', valor: alcance },
    { rotulo: 'Generado por', valor: r.generado_por?.nombre || SIN },
    { rotulo: 'Generado el', valor: r.generado_en ? formatFecha(r.generado_en.slice(0, 10)) : '' },
    { rotulo: 'Definiciones', valor: r.definiciones_version || '' },
  ];
}
