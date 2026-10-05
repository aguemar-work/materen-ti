// Lado servidor FALSO de los reportes de Personas (migración 117):
// reporte_personal, reporte_solicitudes y reporte_encuestas. Misma aritmética,
// mismas columnas y mismos rótulos que el SQL; el escenario S17 del arnés SQL
// compara el reporte de Personal de esta maqueta con la RPC. Nunca DNI ni
// contacto. NADA de esto entra al bundle de producción.
import {
  cabecera, col, tabla, seccion, etiqueta, exigir, parametro, porId, nombreDe, agrupar, contar, cmpTexto,
  diaLima, restaDias, validarPeriodo, mediana1, promedio1, pct0, maxIso, rechazo,
} from './reportes-forma.js';

// ── Personal ────────────────────────────────────────────────────────────────
const MOVIMIENTOS = ['creado', 'reingreso', 'baja_ejecutada', 'suspendido', 'reactivado'];

export function reportePersonalDe(db, { user, desde, hasta, ahora = new Date() }) {
  exigir(db, user, 'modulo:empleados');
  validarPeriodo(desde, hasta);
  const hoy = diaLima(ahora);
  const diasRev = parametro(db, 'dias_revision_accesos', 180);
  const empresas = porId(db.empresas), areas = porId(db.areas_obras), ubis = porId(db.ubicaciones);

  const emp = (db.empleados || []).filter((e) => !e.deleted_at).map((e) => {
    const ultima = maxIso((db.empleado_revisiones_acceso || []).filter((r) => r.empleado_id === e.id).map((r) => r.revisado_at));
    return {
      id: e.id, nombres: e.nombres, apellidos: e.apellidos, nombre: nombreDe(e), estado: e.estado, cargo: e.cargo ?? null,
      fecha_alta: e.fecha_alta, empresa: empresas[e.empresa_id]?.nombre ?? null, area: areas[e.area_obra_id]?.nombre ?? null,
      ubicacion: ubis[e.ubicacion_id]?.nombre ?? null, ultima_revision: ultima ? diaLima(ultima) : null,
    };
  });
  const porEmp = porId(emp);
  const mov = (db.empleado_eventos || []).filter((ev) => porEmp[ev.empleado_id]).map((ev) => ({ ...ev, dia: diaLima(ev.created_at) }))
    .filter((ev) => ev.dia >= desde && ev.dia <= hasta
      && (MOVIMIENTOS.includes(ev.evento) || (ev.evento === 'estado_cambiado' && ev.valor_nuevo === 'Inactivo')))
    .map((ev) => {
      const e = porEmp[ev.empleado_id];
      return {
        id: ev.id, tipo: ev.evento === 'estado_cambiado' ? 'baja_registro' : ev.evento, detalle: ev.detalle ?? null, dia: ev.dia,
        nombre: e.nombre, empresa: e.empresa, area: e.area, cargo: e.cargo,
      };
    })
    .sort((a, b) => a.dia.localeCompare(b.dia) || cmpTexto(a.nombre, b.nombre));
  const pendientes = emp.filter((e) => ['Activo', 'Suspendido'].includes(e.estado) && restaDias(hoy, e.ultima_revision ?? e.fecha_alta) > diasRev)
    .map((e) => ({ ...e, dias: restaDias(hoy, e.ultima_revision ?? e.fecha_alta) }))
    .sort((a, b) => b.dias - a.dias || cmpTexto(a.nombre, b.nombre));
  const activos = emp.filter((e) => e.estado === 'Activo');
  const conteo = (clave) => agrupar(activos, (e) => e[clave]).map(([k, xs]) => ({ [clave]: k, activos: xs.length }))
    .sort((a, b) => b.activos - a.activos || cmpTexto(a[clave], b[clave]));
  const detalleMov = (tipos, extra) => mov.filter((m) => tipos.includes(m.tipo)).map((m) => ({
    fecha: m.dia, persona: m.nombre, empresa: m.empresa, area: m.area, cargo: m.cargo, ...extra(m),
  }));

  return {
    ...cabecera(db, user, 'personal', { desde, hasta, ahora }),
    parametros: { dias_revision_accesos: diasRev },
    avisos: [],
    secciones: [
      seccion('hoy', '1. Personal hoy', [
        tabla('resumen', null, [col('indicador', 'Indicador'), col('cantidad', 'Cantidad', 'numero')], [
          { indicador: 'Activos', cantidad: activos.length },
          { indicador: 'Suspendidos', cantidad: contar(emp, (e) => e.estado === 'Suspendido') },
          { indicador: 'Dados de baja', cantidad: contar(emp, (e) => e.estado === 'Inactivo') },
          { indicador: 'Revisiones de acceso pendientes', cantidad: pendientes.length },
        ]),
        tabla('por_empresa', 'Por empresa', [col('empresa', 'Empresa'), col('activos', 'Activos', 'numero'), col('suspendidos', 'Suspendidos', 'numero')],
          agrupar(emp.filter((e) => ['Activo', 'Suspendido'].includes(e.estado)), (e) => e.empresa).map(([empresa, xs]) => ({
            empresa, activos: contar(xs, (e) => e.estado === 'Activo'), suspendidos: contar(xs, (e) => e.estado === 'Suspendido'),
          })).sort((a, b) => b.activos - a.activos || cmpTexto(a.empresa, b.empresa))),
        tabla('por_area', 'Activos por área u obra', [col('area', 'Área u obra'), col('activos', 'Activos', 'numero')], conteo('area')),
        tabla('por_cargo', 'Activos por cargo', [col('cargo', 'Cargo'), col('activos', 'Activos', 'numero')], conteo('cargo')),
      ], 'Foto al momento de generar el reporte: empresa, área y cargo son los de hoy.'),
      seccion('movimientos', '2. Altas y bajas del período', [
        tabla('resumen_movimientos', null, [col('movimiento', 'Movimiento'), col('cantidad', 'Cantidad', 'numero')], [
          { movimiento: 'Altas', cantidad: contar(mov, (m) => m.tipo === 'creado') },
          { movimiento: 'Reingresos', cantidad: contar(mov, (m) => m.tipo === 'reingreso') },
          { movimiento: 'Bajas', cantidad: contar(mov, (m) => ['baja_ejecutada', 'baja_registro'].includes(m.tipo)) },
          { movimiento: 'Suspensiones', cantidad: contar(mov, (m) => m.tipo === 'suspendido') },
          { movimiento: 'Reactivaciones', cantidad: contar(mov, (m) => m.tipo === 'reactivado') },
        ]),
        tabla('altas', 'Altas y reingresos', [
          col('fecha', 'Fecha', 'fecha'), col('persona', 'Persona'), col('empresa', 'Empresa'), col('area', 'Área u obra'),
          col('cargo', 'Cargo'), col('movimiento', 'Movimiento'),
        ], detalleMov(['creado', 'reingreso'], (m) => ({ movimiento: etiqueta('movimiento_empleado', m.tipo) }))),
        tabla('bajas', 'Bajas', [
          col('fecha', 'Fecha', 'fecha'), col('persona', 'Persona'), col('empresa', 'Empresa'), col('area', 'Área u obra'),
          col('cargo', 'Cargo'), col('detalle', 'Detalle'),
        ], detalleMov(['baja_ejecutada', 'baja_registro'], (m) => ({ detalle: m.detalle }))),
      ], 'Según la hoja de vida de cada persona, en días de Lima. Una baja anterior a la auditoría lleva su fecha aproximada.'),
      seccion('revisiones', '3. Revisiones de acceso pendientes', [
        tabla('pendientes', null, [
          col('persona', 'Persona'), col('empresa', 'Empresa'), col('area', 'Área u obra'), col('fecha_alta', 'Alta', 'fecha'),
          col('ultima_revision', 'Última revisión', 'fecha'), col('dias', 'Días', 'numero'),
        ], pendientes.map((p) => ({
          persona: p.nombre, empresa: p.empresa, area: p.area, fecha_alta: p.fecha_alta, ultima_revision: p.ultima_revision, dias: p.dias,
        }))),
      ], `Personas activas o suspendidas sin revisión de accesos en los últimos ${diasRev} días corridos; si nunca se revisaron, se cuenta desde el alta.`),
    ],
    filas_csv: {
      columnas: [
        col('nombres', 'Nombres'), col('apellidos', 'Apellidos'), col('empresa', 'Empresa'), col('area', 'Área u obra'),
        col('ubicacion', 'Ubicación'), col('cargo', 'Cargo'), col('estado', 'Estado'), col('fecha_alta', 'Fecha de alta', 'fecha'),
        col('ultima_revision', 'Última revisión de accesos', 'fecha'),
      ],
      filas: emp.slice().sort((a, b) => cmpTexto(a.apellidos, b.apellidos) || cmpTexto(a.nombres, b.nombres)).map((e) => [
        e.nombres, e.apellidos, e.empresa, e.area, e.ubicacion, e.cargo, e.estado, e.fecha_alta, e.ultima_revision,
      ]),
    },
  };
}

// ── Solicitudes ─────────────────────────────────────────────────────────────
const TRAMOS = [['hasta_3', 0, 3], ['de_4_a_7', 4, 7], ['de_8_a_30', 8, 30], ['mas_30', 31, Infinity]];

export function reporteSolicitudesDe(db, { user, desde, hasta, ahora = new Date() }) {
  exigir(db, user, 'modulo:empleados');
  validarPeriodo(desde, hasta);
  const hoy = diaLima(ahora);
  const tipos = porId(db.solicitud_tipos), emps = porId(db.empleados);
  const enRango = (d) => d != null && d >= desde && d <= hasta;
  const m = (db.solicitudes || []).filter((s) => tipos[s.tipo_id] && emps[s.empleado_id]).map((s) => {
    const pasos = (db.solicitud_pasos || []).filter((p) => p.solicitud_id === s.id);
    const pendientes = pasos.filter((p) => p.estado === 'pendiente').sort((a, b) => a.orden - b.orden || cmpTexto(a.label, b.label));
    const dia = diaLima(s.created_at), diaC = s.completada_at ? diaLima(s.completada_at) : null, diaX = s.cancelada_at ? diaLima(s.cancelada_at) : null;
    return {
      codigo: s.codigo, tipo: tipos[s.tipo_id].nombre, tipo_orden: tipos[s.tipo_id].orden, estado: s.estado, origen: s.origen,
      persona: nombreDe(emps[s.empleado_id]), dia_creada: dia, dia_completada: diaC, dia_cancelada: diaX,
      dias_tramite: s.completada_at ? (new Date(s.completada_at) - new Date(s.created_at)) / 86400000 : null,
      pasos_total: pasos.length, pasos_hechos: pasos.length - pendientes.length, siguiente: pendientes[0]?.label ?? null,
      creada_en: enRango(dia), completada_en: s.estado === 'completada' && enRango(diaC), cancelada_en: s.estado === 'cancelada' && enRango(diaX),
      abierta: s.estado === 'abierta', dias_abierta: restaDias(hoy, dia),
    };
  });
  const porTipo = agrupar(m, (x) => x.tipo).map(([tipo, xs]) => {
    const tiempos = xs.filter((x) => x.completada_en && x.dias_tramite != null).map((x) => x.dias_tramite);
    return {
      tipo, orden: Math.min(...xs.map((x) => x.tipo_orden)), creadas: contar(xs, (x) => x.creada_en), completadas: contar(xs, (x) => x.completada_en),
      canceladas: contar(xs, (x) => x.cancelada_en), abiertas: contar(xs, (x) => x.abierta),
      mediana: mediana1(tiempos), promedio: promedio1(tiempos), n: tiempos.length,
    };
  }).filter((g) => g.creadas + g.completadas + g.canceladas + g.abiertas > 0).sort((a, b) => a.orden - b.orden || cmpTexto(a.tipo, b.tipo));
  const abiertas = m.filter((x) => x.abierta);

  return {
    ...cabecera(db, user, 'solicitudes', { desde, hasta, ahora }),
    parametros: {},
    avisos: [],
    secciones: [
      seccion('resumen', '1. Resumen', [
        tabla('indicadores', null, [col('indicador', 'Indicador'), col('cantidad', 'Cantidad', 'numero')], [
          { indicador: 'Creadas en el período', cantidad: contar(m, (x) => x.creada_en) },
          { indicador: 'Completadas en el período', cantidad: contar(m, (x) => x.completada_en) },
          { indicador: 'Canceladas en el período', cantidad: contar(m, (x) => x.cancelada_en) },
          { indicador: 'Abiertas hoy', cantidad: abiertas.length },
        ]),
        tabla('por_tipo', 'Por tipo', [
          col('tipo', 'Tipo'), col('creadas', 'Creadas', 'numero'), col('completadas', 'Completadas', 'numero'), col('canceladas', 'Canceladas', 'numero'),
          col('abiertas', 'Abiertas hoy', 'numero'), col('mediana', 'Mediana (días)', 'decimal'), col('promedio', 'Promedio (días)', 'decimal'), col('n', 'n', 'numero'),
        ], porTipo.map(({ orden: _o, ...g }) => g),
        'Tiempo de trámite: días corridos de creada a completada, de las completadas en el período. La mediana va primero; siempre con n.'),
      ]),
      seccion('abiertas', '2. Abiertas hoy', [
        tabla('antiguedad', 'Por antigüedad (días corridos)', [
          col('tipo', 'Tipo'), col('hasta_3', '0 a 3 días', 'numero'), col('de_4_a_7', '4 a 7 días', 'numero'), col('de_8_a_30', '8 a 30 días', 'numero'),
          col('mas_30', 'Más de 30 días', 'numero'), col('total', 'Total', 'numero'),
        ], agrupar(abiertas, (x) => x.tipo).map(([tipo, xs]) => ({
          tipo, orden: Math.min(...xs.map((x) => x.tipo_orden)),
          ...Object.fromEntries(TRAMOS.map(([k, a, b]) => [k, contar(xs, (x) => x.dias_abierta >= a && x.dias_abierta <= b)])),
          total: xs.length,
        })).sort((a, b) => a.orden - b.orden).map(({ orden: _o, ...g }) => g)),
        tabla('detalle', 'Detalle', [
          col('codigo', 'Código', 'codigo'), col('tipo', 'Tipo'), col('persona', 'Persona'), col('creada', 'Creada', 'fecha'),
          col('dias', 'Días', 'numero'), col('avance', 'Avance'), col('siguiente', 'Siguiente paso'),
        ], abiertas.slice().sort((a, b) => b.dias_abierta - a.dias_abierta || a.codigo.localeCompare(b.codigo)).map((x) => ({
          codigo: x.codigo, tipo: x.tipo, persona: x.persona, creada: x.dia_creada, dias: x.dias_abierta,
          avance: `${x.pasos_hechos} de ${x.pasos_total}`, siguiente: x.siguiente,
        }))),
      ], 'Foto al momento de generar el reporte, sin importar el período elegido.'),
    ],
    filas_csv: {
      columnas: [
        col('codigo', 'Código', 'codigo'), col('tipo', 'Tipo'), col('persona', 'Persona'), col('estado', 'Estado'), col('origen', 'Origen'),
        col('creada', 'Creada', 'fecha'), col('completada', 'Completada', 'fecha'), col('cancelada', 'Cancelada', 'fecha'),
        col('dias', 'Días', 'numero'), col('pasos_hechos', 'Pasos resueltos', 'numero'), col('pasos_total', 'Pasos', 'numero'),
      ],
      filas: m.filter((x) => x.creada_en || x.completada_en || x.cancelada_en || x.abierta)
        .sort((a, b) => a.dia_creada.localeCompare(b.dia_creada) || a.codigo.localeCompare(b.codigo))
        .map((x) => [
          x.codigo, x.tipo, x.persona, etiqueta('estado_solicitud', x.estado), etiqueta('origen_solicitud', x.origen), x.dia_creada,
          x.dia_completada, x.dia_cancelada, restaDias(x.dia_completada ?? x.dia_cancelada ?? hoy, x.dia_creada), x.pasos_hechos, x.pasos_total,
        ]),
    },
  };
}

// ── Encuestas (por ronda, anónimas) ─────────────────────────────────────────
const respondida = (v) => v !== undefined && v !== null && v !== '';
const textoCsv = (v) => (typeof v === 'boolean' ? (v ? 'Sí' : 'No') : typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function reporteEncuestasDe(db, { user, ronda = null, ahora = new Date() }) {
  exigir(db, user, 'modulo:encuestas');
  const encuestas = porId((db.encuestas || []).filter((e) => !e.deleted_at));
  const respuestasDe = (id) => (db.encuesta_respuestas || []).filter((x) => x.ronda_id === id)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  const rondas = (db.encuesta_rondas || []).filter((r) => encuestas[r.encuesta_id])
    .sort((a, b) => new Date(b.abierta_en) - new Date(a.abierta_en) || String(a.id).localeCompare(String(b.id)))
    .map((r) => ({ ronda_id: r.id, encuesta: encuestas[r.encuesta_id].titulo, abierta_el: diaLima(r.abierta_en), cerrada: !!r.cerrada, respuestas: respuestasDe(r.id).length }));
  const base = cabecera(db, user, 'encuestas', { ahora });
  if (ronda && !rondas.some((r) => r.ronda_id === ronda)) throw rechazo('P0001', 'La ronda de encuesta no existe.');
  const elegida = ronda ? rondas.find((r) => r.ronda_id === ronda) : (rondas.find((r) => r.respuestas > 0) || rondas[0] || null);
  if (!elegida) {
    return { ...base, parametros: {}, avisos: [], rondas, ronda: null, secciones: [], filas_csv: { columnas: [], filas: [] } };
  }
  const r = (db.encuesta_rondas || []).find((x) => x.id === elegida.ronda_id);
  const preguntas = encuestas[r.encuesta_id].preguntas || [];
  const resp = respuestasDe(r.id).map((x) => x.respuestas || {});
  const n = resp.length;
  const tablas = preguntas.map((p, i) => {
    const ord = i + 1;
    const valores = resp.map((x) => x[p.id]).filter(respondida);
    const total = valores.length;
    let nota = `${total} de ${n} respondieron`;
    const titulo = `${ord}. ${p.etiqueta}`;
    const cols = (primera) => [col('opcion', primera), col('respuestas', 'Respuestas', 'numero'), col('pct', 'Porcentaje', 'pct')];
    if (p.tipo === 'escala_1_5') {
      const nums = resp.map((x) => x[p.id]).filter((v) => typeof v === 'number');
      if (nums.length) nota += `; promedio ${(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100).toFixed(2).replace('.', ',')} sobre 5`;
      return tabla(`p${ord}`, titulo, cols('Nivel'), [5, 4, 3, 2, 1].map((k) => {
        const c = contar(valores, (v) => v === k);
        return { opcion: String(k), respuestas: c, pct: total > 0 ? pct0(c, total) : null };
      }), nota);
    }
    if (p.tipo === 'opcion_unica') {
      return tabla(`p${ord}`, titulo, cols('Opción'), (p.opciones || []).map((o) => {
        const c = contar(valores, (v) => v === o);
        return { opcion: o, respuestas: c, pct: total > 0 ? pct0(c, total) : null };
      }), nota);
    }
    if (p.tipo === 'si_no') {
      return tabla(`p${ord}`, titulo, cols('Respuesta'), [['Sí', true], ['No', false]].map(([etq, b]) => {
        const c = contar(valores, (v) => v === b);
        return { opcion: etq, respuestas: c, pct: total > 0 ? pct0(c, total) : null };
      }), nota);
    }
    return tabla(`p${ord}`, titulo, [col('respuesta', 'Respuesta')], valores.map((v) => ({ respuesta: String(v) })), nota);
  });

  return {
    ...base,
    parametros: {},
    avisos: [],
    rondas,
    ronda: elegida,
    secciones: [seccion('resultados', 'Resultados por pregunta', tablas,
      'Respuestas anónimas: no se guarda quién respondió ni se muestra cuándo. Los porcentajes son sobre quienes respondieron esa pregunta.')],
    filas_csv: {
      columnas: preguntas.map((p) => col(p.id, p.etiqueta)),
      filas: resp.map((x) => preguntas.map((p) => textoCsv(x[p.id]))),
    },
  };
}
