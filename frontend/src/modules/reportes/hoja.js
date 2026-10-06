// Arma las secciones de la hoja imprimible a partir del jsonb de
// reporte_tickets (migraciones 115 y 118). Solo da FORMATO: no suma, no
// promedia, no decide qué es "resuelto". Cada tabla es { titulo?, nota?,
// columnas, filas } y cada fila una lista de celdas { texto, num?, tenue? };
// ReporteTicketsView la pinta con ReporteSecciones. Separado del .vue para
// probarlo sin montar nada.
//
// Orden de la hoja (118, tablero para gerencia): lo que se lee primero
// (resumen en cifras, por día, por técnico, pendientes, quiénes generan más y
// el tiempo de cada ticket) y después el detalle de siempre (atención,
// calidad, distribuciones y anexos). Con alcance de un técnico el servidor no
// manda el tablero y la hoja abre con el volumen, como en la 115.
import { formatHoras, formatFecha, formatFechaHora } from '../../core/formatters.js';
import { estadoInfo, prioridadInfo } from '../../core/dominio-tickets.js';

const TIPO = { incidente: 'Incidente', solicitud: 'Solicitud', sin_clasificar: 'Sin clasificar' };
const SIN = 'Sin registrar';
export const JEFATURA_Y_OTROS = 'Jefatura y otros';
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

/** % de satisfacción (118): "93 %" o "n insuficiente (3)". */
export function textoPctSatisfaccion(c) {
  if (!c) return '—';
  if (c.pct_satisfaccion == null) return `n insuficiente (${c.n ?? 0})`;
  return `${c.pct_satisfaccion} %`;
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

/** Nombre de una fila por técnico: el técnico de mesa, o «Jefatura y otros». */
export function nombreGrupoTecnico(t) {
  return t.grupo === 'otros' ? JEFATURA_Y_OTROS : (t.nombre || SIN);
}

/** Rótulo de un día para el gráfico: "Lun 28" en una semana, solo el número en un mes. */
function rotuloDia(iso, total) {
  const [y, m, d] = iso.split('-').map(Number);
  if (total > 7) return String(d);
  return `${DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * @param {object} r         jsonb de reporte_tickets
 * @param {object} opciones  { nombresStaff: {user_id: nombre} } para rotular a quién está asignado
 * @returns {Array<{ id, titulo, nota?, cifras?, dias?, tablas: Array }>}
 */
export function armarSecciones(r, { nombresStaff = {} } = {}) {
  if (!r) return [];
  const c = r.comparacion;
  const conTecnicos = Array.isArray(r.por_tecnico);
  // Técnico de cada ticket en la hoja: el de mesa por su nombre; cualquier otro, «Jefatura y otros».
  const mesa = new Map((r.por_tecnico || []).filter((t) => t.grupo === 'tecnico').map((t) => [t.tecnico_id, t.nombre]));
  const grupoDeTicket = (id) => (id ? (mesa.get(id) || JEFATURA_Y_OTROS) : SIN);
  const asignado = (id) => (id ? (nombresStaff[id] || 'Staff') : 'Sin asignar');
  const v = r.volumen || {};
  const a = r.atencion || {};
  const resol = a.resolucion || {};
  const q = r.calidad || {};
  const cs = q.csat || {};
  const secciones = [];

  // ── Resumen en cifras (tablero, 118) o volumen (alcance técnico) ──────────
  const t = r.tablero;
  if (t) {
    const antes = (x) => (c && x != null ? ` · anterior: ${x}` : '');
    secciones.push({
      id: 'resumen',
      titulo: 'Resumen',
      nota: c
        ? `Comparado con ${c.periodo.desde === c.periodo.hasta ? formatFecha(c.periodo.desde) : `${formatFecha(c.periodo.desde)} – ${formatFecha(c.periodo.hasta)}`}${c.parcial ? ' (período anterior parcial: empieza antes del primer ticket registrado)' : ''}.`
        : (r.periodo?.en_curso ? 'El período no terminó: las cifras siguen cambiando y no se comparan con el anterior.' : ''),
      cifras: [
        { rotulo: 'Ingresaron', valor: t.ingresaron, detalle: `${plural(t.rechazados, 'rechazado', 'rechazados')}${antes(c?.tablero?.ingresaron)}` },
        { rotulo: 'Resueltos', valor: t.resueltos, detalle: `${t.resueltos_de_ingresados} de este período · ${t.resueltos - t.resueltos_de_ingresados} de antes` },
        {
          rotulo: '% resuelto',
          valor: t.pct_resuelto ?? '—',
          unidad: t.pct_resuelto == null ? '' : '%',
          detalle: `${t.resueltos_de_ingresados} de ${t.validos} ingresados sin rechazar${antes(c?.tablero?.pct_resuelto == null ? null : `${c.tablero.pct_resuelto} %`)}`,
        },
        { rotulo: 'Pendientes', valor: t.pendientes_cierre, detalle: `${r.pendientes?.referencia === 'ahora' ? 'ahora' : 'al cierre'} · al inicio: ${t.pendientes_inicio}` },
        { rotulo: 'Tiempo mediano', valor: resol.mediana_horas == null ? '—' : formatHoras(Number(resol.mediana_horas)), detalle: resol.n ? `promedio ${formatHoras(Number(resol.promedio_horas))} · n ${resol.n}` : 'sin resueltos' },
        {
          rotulo: 'Satisfacción',
          valor: cs.pct_satisfaccion ?? '—',
          unidad: cs.pct_satisfaccion == null ? '' : '%',
          detalle: cs.pct_satisfaccion == null ? `n insuficiente (${cs.n ?? 0} de ${cs.minimo ?? 5})` : `${cs.satisfechos} de ${cs.n} respondieron 4 o 5`,
        },
      ],
    });
  } else {
    const tecnico = r.alcance?.tipo === 'tecnico';
    const volumen = [
      ['Creados en el período', v.creados, c?.volumen?.creados],
      ['Rechazados (aparte)', v.rechazados, c?.volumen?.rechazados],
      ['Resueltos en el período', v.resueltos, c?.volumen?.resueltos],
      ['· creados en el mismo período', v.resueltos_mismo_periodo, c?.volumen?.resueltos_mismo_periodo],
      ['· arrastrados de períodos anteriores', v.resueltos_arrastrados, c?.volumen?.resueltos_arrastrados],
      ['Cerrados sin encuesta', v.cerrados_sin_encuesta, c?.volumen?.cerrados_sin_encuesta],
    ].filter(([, valor]) => !(tecnico && valor == null));
    secciones.push({
      id: 'volumen',
      titulo: 'Volumen',
      nota: [
        tecnico ? 'Alcance de un técnico: solo lo que resolvió; los creados no se atribuyen a una persona.' : '',
        r.periodo?.en_curso ? 'El período no terminó: las cifras siguen cambiando.' : '',
      ].filter(Boolean).join(' '),
      tablas: [{
        columnas: [{ titulo: 'Indicador' }, { titulo: 'Cantidad', num: true }, ...(c ? [{ titulo: 'Anterior', num: true }, { titulo: 'Diferencia', num: true }] : [])],
        filas: volumen.map(([rotulo, valor, previo]) => [celda(rotulo), num(valor), ...(c ? [num(previo, { tenue: true }), celda(textoDelta(valor, previo) || '—', { num: true, tenue: true })] : [])]),
      }],
    });
  }

  // ── Por día (semana, mes o rango de hasta 31 días) ───────────────────────
  if (Array.isArray(r.por_dia) && r.por_dia.length > 1) {
    secciones.push({
      id: 'por-dia',
      titulo: 'Por día',
      dias: r.por_dia.map((d) => ({ etiqueta: rotuloDia(d.dia, r.por_dia.length), ingresaron: d.ingresaron, resueltos: d.resueltos })),
      tablas: [{
        columnas: [{ titulo: 'Día' }, { titulo: 'Ingresaron', num: true }, { titulo: 'Rechazados', num: true }, { titulo: 'Resueltos', num: true }],
        filas: r.por_dia.map((d) => [celda(formatFecha(d.dia)), num(d.ingresaron), num(d.rechazados), num(d.resueltos)]),
      }],
    });
  }

  // ── Por técnico (solo llega al JEFE) ─────────────────────────────────────
  if (conTecnicos) {
    const filas = r.por_tecnico.map((x) => [
      celda(nombreGrupoTecnico(x), { tenue: x.grupo === 'otros' }), num(x.resueltos), num(x.mismo_periodo), num(x.arrastrados),
      horas(x.tiempos?.mediana_horas),
      celda(textoPctSatisfaccion(x.csat), { num: true, tenue: x.csat?.pct_satisfaccion == null }),
      celda(x.reaperturas ? `${x.reaperturas.reabiertos} de ${x.reaperturas.base}` : '—', { num: true }),
      num(x.asignados_hoy),
    ]);
    if (r.pendientes) {
      filas.push([celda('Sin asignar', { tenue: true }), num(null), num(null), num(null), horas(null), celda('—', { num: true, tenue: true }), celda('—', { num: true, tenue: true }), num(r.pendientes.sin_asignar_hoy)]);
    }
    if (t) {
      filas.push([
        celda('Total'), num(v.resueltos), num(v.resueltos_mismo_periodo), num(v.resueltos_arrastrados), horas(resol.mediana_horas),
        celda(textoPctSatisfaccion(cs), { num: true, tenue: cs.pct_satisfaccion == null }), celda('—', { num: true, tenue: true }), celda('—', { num: true, tenue: true }),
      ]);
    }
    secciones.push({
      id: 'tecnicos',
      titulo: 'Por técnico',
      nota: '"Resolvió" es quien marcó el ticket como resuelto por última vez. Cada técnico de mesa de ayuda tiene su fila; lo que resolvió cualquier otra persona va en «Jefatura y otros». "A cargo hoy" son los vigentes asignados en este momento.',
      tablas: [{
        columnas: [
          { titulo: 'Técnico' }, { titulo: 'Resueltos', num: true }, { titulo: 'Del período', num: true }, { titulo: 'De antes', num: true },
          { titulo: 'Mediana', num: true }, { titulo: 'Satisfacción', num: true }, { titulo: 'Reabiertos', num: true }, { titulo: 'A cargo hoy', num: true },
        ],
        filas,
      }],
    });
  }

  // ── Pendientes al cierre ────────────────────────────────────────────────
  const p = r.pendientes;
  if (p) {
    const tramos = (v.backlog?.tramos || []).map((x) => `${x.etiqueta}: ${x.cantidad}`).join(' · ');
    const recorte = p.total > (p.lista || []).length ? ` Se muestran los ${p.lista.length} más antiguos de ${p.total}.` : '';
    secciones.push({
      id: 'pendientes',
      titulo: p.referencia === 'ahora' ? 'Pendientes ahora' : 'Pendientes al cierre',
      nota: `${plural(p.total, 'ticket sin resolver', 'tickets sin resolver')}${tramos ? ` (${tramos})` : ''}. Técnico y estado son los de hoy.${recorte}`,
      tablas: [{
        columnas: [
          { titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Asunto' }, { titulo: 'Prioridad', ancho: 'w-24' }, { titulo: 'Solicitante' },
          { titulo: 'A cargo hoy' }, { titulo: 'Estado hoy', ancho: 'w-28' }, { titulo: 'Días', num: true, ancho: 'w-16' },
        ],
        filas: (p.lista || []).map((x) => [
          celda(x.codigo, { codigo: true }), celda(x.titulo), celda(etiquetaPrioridad(x.prioridad)), celda(x.solicitante),
          celda(asignado(x.asignado_a), { tenue: !x.asignado_a }), celda(estadoInfo(x.estado_hoy).label), num(x.dias),
        ]),
        vacio: 'Sin tickets pendientes',
      }],
    });
  }

  // ── Quiénes generaron más tickets ───────────────────────────────────────
  const s = r.solicitantes;
  if (s) {
    secciones.push({
      id: 'solicitantes',
      titulo: 'Quiénes generaron más tickets',
      nota: s.total > (s.top || []).length
        ? `${s.total} personas generaron tickets en el período; se muestran las ${s.top.length} con más.`
        : `${plural(s.total, 'persona generó', 'personas generaron')} tickets en el período.`,
      tablas: [{
        columnas: [{ titulo: 'Persona' }, { titulo: 'Área u obra' }, { titulo: 'Tickets', num: true }, { titulo: 'Sin resolver', num: true }],
        filas: (s.top || []).map((x) => [celda(x.solicitante), celda(x.area || SIN, { tenue: !x.area }), num(x.tickets), num(x.sin_resolver)]),
        vacio: 'Ningún ticket ingresó en el período',
      }],
    });
  }

  // ── Tiempo de resolución por ticket ─────────────────────────────────────
  const resueltos = (r.tickets || [])
    .filter((x) => (x.en_periodo === 'resuelto' || x.en_periodo === 'ambos') && x.horas_resolucion != null)
    .sort((x, y) => (Number(y.horas_resolucion) - Number(x.horas_resolucion)) || String(x.codigo).localeCompare(String(y.codigo)));
  secciones.push({
    id: 'tiempos',
    titulo: 'Tiempo de resolución por ticket',
    nota: 'Los resueltos del período, del más lento al más rápido, en horas de reloj desde que ingresó hasta que se resolvió.',
    tablas: [{
      columnas: [
        { titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Asunto' }, { titulo: 'Solicitante' }, ...(conTecnicos ? [{ titulo: 'Resolvió' }] : []),
        { titulo: 'Ingresó', ancho: 'w-36' }, { titulo: 'Resuelto', ancho: 'w-36' }, { titulo: 'Tiempo', num: true, ancho: 'w-20' },
      ],
      filas: resueltos.map((x) => [
        celda(x.codigo, { codigo: true }), celda(x.titulo), celda(x.solicitante), ...(conTecnicos ? [celda(grupoDeTicket(x.tecnico_id))] : []),
        celda(x.created_at ? formatFechaHora(x.created_at) : ''), celda(x.resuelto_at ? formatFechaHora(x.resuelto_at) : ''), horas(x.horas_resolucion),
      ]),
      vacio: 'Sin tickets resueltos en el período',
    }],
  });

  // ── Atención ────────────────────────────────────────────────────────────
  const pr = a.primera_respuesta || {};
  secciones.push({
    id: 'atencion',
    titulo: 'Atención (horas corridas)',
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
        filas: (a.por_prioridad || []).map((x) => [celda(etiquetaPrioridad(x.prioridad)), horas(x.mediana_horas), horas(x.promedio_horas), num(x.n)]),
      },
    ],
  });

  // ── Calidad ─────────────────────────────────────────────────────────────
  const re = q.reaperturas || {};
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
      titulo: `Satisfacción (muestra mínima ${cs.minimo ?? 5})`,
      columnas: [{ titulo: 'Indicador' }, { titulo: 'Valor', num: true }, ...(c ? [{ titulo: 'Anterior', num: true }] : [])],
      filas: [
        [celda('Encuestas generadas'), num(cs.generadas), ...(c ? [num(c.csat?.generadas, { tenue: true })] : [])],
        [celda('Respondidas'), num(cs.respondidas), ...(c ? [num(c.csat?.respondidas, { tenue: true })] : [])],
        [celda('Tasa de respuesta'), pct(cs.tasa_respuesta_pct), ...(c ? [pct(c.csat?.tasa_respuesta_pct)] : [])],
        [celda('Satisfechos (respondieron 4 o 5)'), celda(textoPctSatisfaccion(cs), { num: true, tenue: cs.pct_satisfaccion == null }), ...(c ? [celda(textoPctSatisfaccion(c.csat), { num: true, tenue: true })] : [])],
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
  secciones.push({ id: 'calidad', titulo: 'Calidad', tablas: tablasCalidad });

  // ── Por categoría y por área ────────────────────────────────────────────
  const por = r.por || {};
  secciones.push({
    id: 'distribuciones',
    titulo: 'Por categoría y por área',
    nota: 'Creados y resueltos del período en cada grupo. El área es la del empleado hoy.',
    tablas: [
      { titulo: 'Por categoría', columnas: [{ titulo: 'Categoría' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (por.categoria || []).map(filaDimension) },
      { titulo: 'Por subcategoría', columnas: [{ titulo: 'Categoría › subcategoría' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (por.subcategoria || []).map(filaDimension) },
      { titulo: 'Por prioridad', columnas: [{ titulo: 'Prioridad' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (por.prioridad || []).map((d) => [celda(etiquetaPrioridad(d.clave)), num(d.creados), num(d.resueltos)]) },
      { titulo: 'Por tipo y nivel', columnas: [{ titulo: 'Tipo / nivel' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }],
        filas: [...(por.tipo || []).map((d) => [celda(TIPO[d.nombre] || d.nombre), num(d.creados), num(d.resueltos)]), ...(por.nivel || []).map(filaDimension)] },
      { titulo: 'Por área u obra', columnas: [{ titulo: 'Área / obra' }, { titulo: 'Creados', num: true }, { titulo: 'Resueltos', num: true }], filas: (por.area || []).map(filaDimension) },
    ],
  });

  // ── Anexos ──────────────────────────────────────────────────────────────
  const an = r.anexos || {};
  secciones.push({
    id: 'anexos',
    titulo: 'Anexos',
    tablas: [
      {
        // La columna "Resolvió" solo existe cuando el servidor entregó la
        // sección por técnico (JEFE): quien no tiene ese rol no la ve.
        titulo: 'Arrastrados: resueltos en el período, creados antes',
        columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Título' }, { titulo: 'Creado', ancho: 'w-24' }, { titulo: 'Resuelto', ancho: 'w-24' }, { titulo: 'Días', num: true, ancho: 'w-16' }, ...(conTecnicos ? [{ titulo: 'Resolvió', ancho: 'w-40' }] : [])],
        filas: (an.arrastrados || []).map((x) => [celda(x.codigo, { codigo: true }), celda(x.titulo), celda(formatFecha(x.created_at)), celda(formatFecha(x.resuelto_at)), num(x.dias_abierto), ...(conTecnicos ? [celda(grupoDeTicket(x.tecnico_id))] : [])]),
      },
      {
        titulo: 'Cerrados sin encuesta',
        columnas: [{ titulo: 'Ticket', ancho: 'w-28' }, { titulo: 'Título' }, { titulo: 'Resuelto', ancho: 'w-24' }, { titulo: 'Motivo', ancho: 'w-40' }],
        filas: (an.cerrados_sin_encuesta || []).map((x) => [celda(x.codigo, { codigo: true }), celda(x.titulo), celda(formatFecha(x.resuelto_at)), celda(x.motivo === 'sin_solicitante' ? 'Sin solicitante identificado' : 'Sin encuesta generada')]),
      },
    ],
  });

  // Numeración de la hoja: la que corresponde a las secciones presentes.
  return secciones.map((x, i) => ({ ...x, titulo: `${i + 1}. ${x.titulo}` }));
}

/**
 * Resumen en texto para pegar en un correo o en WhatsApp (118): las mismas
 * cifras del tablero, en frases. '' con alcance de un técnico (no hay tablero).
 */
export function resumenTexto(r, etiqueta) {
  const t = r?.tablero;
  if (!t) return '';
  const cs = r.calidad?.csat || {};
  const resol = r.atencion?.resolucion || {};
  const lineas = [
    `Mesa de ayuda TI · ${etiqueta}`,
    `Ingresaron ${plural(t.ingresaron, 'ticket', 'tickets')}${t.rechazados ? ` (${plural(t.rechazados, 'rechazado', 'rechazados')})` : ''}.`,
    `Se resolvieron ${t.resueltos}: ${t.resueltos_de_ingresados} de este período y ${t.resueltos - t.resueltos_de_ingresados} de antes.`,
    t.pct_resuelto == null
      ? `Quedan ${plural(t.pendientes_cierre, 'pendiente', 'pendientes')}.`
      : `De los ${t.validos} ingresados sin rechazar, el ${t.pct_resuelto} % ya está resuelto. Quedan ${plural(t.pendientes_cierre, 'pendiente', 'pendientes')}.`,
  ];
  if (resol.n) lineas.push(`Tiempo mediano de resolución: ${formatHoras(Number(resol.mediana_horas))}.`);
  if (cs.pct_satisfaccion != null) lineas.push(`Satisfacción: ${cs.pct_satisfaccion} % (${cs.satisfechos} de ${cs.n} respondieron 4 o 5).`);
  if (Array.isArray(r.por_tecnico) && r.por_tecnico.length) {
    lineas.push(`Resueltos por técnico: ${r.por_tecnico.map((x) => `${nombreGrupoTecnico(x)} ${x.resueltos}`).join(' · ')}.`);
  }
  return lineas.join('\n');
}

/** Pares rótulo/valor de la carátula. */
export function datosCaratula(r, etiquetaPeriodo) {
  if (!r) return [];
  const alcance = r.alcance?.tipo === 'tecnico' ? `Técnico · ${r.alcance.tecnico_nombre || SIN}` : 'Todo el equipo';
  return [
    { rotulo: 'Período', valor: etiquetaPeriodo },
    { rotulo: 'Alcance', valor: alcance },
    { rotulo: 'Generado por', valor: r.generado_por?.nombre || SIN },
    { rotulo: 'Generado el', valor: r.generado_en ? formatFechaHora(r.generado_en) : '' },
    { rotulo: 'Definiciones', valor: r.definiciones_version || '' },
  ];
}
