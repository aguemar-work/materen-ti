// Lado servidor FALSO de las RPC de reportes (migraciones 115 y 118) para la
// maqueta: `reporte_tickets(p_desde, p_hasta, p_tecnico)`,
// `reporte_satisfaccion(p_desde, p_hasta)` y
// `reporte_satisfaccion_consolidado()`. Replica la MISMA aritmética que el SQL
// (v_ticket_hechos + reporte_tickets_de + reporte_satisfaccion_de) sobre la
// base en memoria, para que lo que el dueño ve en la maqueta sea lo que el
// servidor devolvería con esos datos: scripts/sql-local/verificar-migraciones.mjs
// (escenario S17) carga este mismo fixture en PGlite y compara los resultados.
//
// Es un módulo PURO (sin globals del navegador): también lo importan el script
// de paridad (`scripts/paridad-reporte-tickets.mjs --maqueta`) y los tests.
// NADA de esto entra al bundle de producción.

export const VERSION_DEFINICIONES = 'reportes-2026-10-06';
const ZONA = 'America/Lima';
const TERMINALES = ['resuelto', 'cerrado', 'rechazado'];
const ORDEN_PRIORIDAD = ['urgente', 'alta', 'media', 'baja'];
const HORA_MS = 3600000;

let actor = { id: 'u-jefe', esJefe: true };
export function definirActorReportes(nuevo) {
  actor = { ...actor, ...nuevo };
}
// Quien llama a las RPC de reportes de la maqueta (también las de la 117).
export function actorReportes() {
  return actor;
}

// ── Fechas de Lima ──────────────────────────────────────────────────────────
const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
export function diaLima(valor) {
  if (!valor) return null;
  const f = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(f.getTime()) ? null : FMT.format(f);
}
const mesDe = (dia) => (dia ? `${dia.slice(0, 7)}-01` : null);
// 00:00 de Lima del día `iso` (UTC-5 fijo, sin horario de verano).
const inicioLima = (iso) => new Date(`${iso}T00:00:00-05:00`);
const sumarDias = (iso, n) => {
  const f = new Date(`${iso}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
};
const sumarMeses = (iso, n) => {
  const f = new Date(`${iso}T00:00:00Z`);
  f.setUTCDate(1);
  f.setUTCMonth(f.getUTCMonth() + n);
  return f.toISOString().slice(0, 10);
};
const diasEntre = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

// ── Aritmética (idéntica a la del SQL) ──────────────────────────────────────
const redondear = (x) => (x == null ? null : Math.round(x * 100) / 100);
export function promedio(valores) {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}
export function mediana(valores) {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
const pct = (a, b) => (b > 0 ? Math.round((100 * a) / b) : null);
const destinoDe = (detalle) => /a "(\w+)"\s*$/.exec(String(detalle || ''))?.[1] || null;
const origenDe = (detalle) => /^De "(\w+)"/.exec(String(detalle || ''))?.[1] || null;

function parametro(db, clave, defecto) {
  const fila = (db.config_parametros || []).find((p) => p.clave === clave);
  return Number.isInteger(fila?.valor) ? fila.valor : defecto;
}
const rechazo = (code, message) => Object.assign(new Error(message), { code, message });

// ── v_ticket_hechos: una fila por ticket ────────────────────────────────────
export function hechosDeTickets(db) {
  const corte = parametro(db, 'dias_corte_reapertura', 30);
  const staff = new Set((db.staff || []).map((s) => s.user_id));
  const porId = (tabla, clave = 'id') => Object.fromEntries((db[tabla] || []).map((r) => [r[clave], r]));
  const cats = porId('categorias_ticket'), subs = porId('subcategorias_ticket'), emps = porId('empleados');
  const areas = porId('areas_obras'), ubis = porId('ubicaciones');
  const encuestaPor = porId('ticket_satisfaccion', 'ticket_id');
  const eventos = (db.ticket_eventos || []).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const comentarios = db.ticket_comentarios || [];

  return (db.tickets || []).map((t) => {
    const ev = eventos.filter((e) => e.ticket_id === t.id && e.evento === 'estado_cambiado')
      .map((e) => ({ at: new Date(e.created_at), user_id: e.user_id, origen: origenDe(e.detalle), destino: destinoDe(e.detalle) }));
    const res = ev.filter((e) => e.destino === 'resuelto');
    const reaps = ev.filter((e) => e.destino === 'reabierto' && (e.origen || '') !== 'rechazado');
    const enCorte = reaps.some((r) => {
      const previas = res.filter((x) => x.at <= r.at);
      if (!previas.length) return false;
      const previa = previas[previas.length - 1].at;
      return r.at <= new Date(previa.getTime() + corte * 86400000);
    });
    const emp = emps[t.empleado_id];
    const resueltoVigente = ['resuelto', 'cerrado'].includes(t.estado) && !!t.resuelto_at;
    const creado = new Date(t.created_at);
    const horas = ['resuelto', 'cerrado'].includes(t.estado) && t.resuelto_at && new Date(t.resuelto_at) >= creado
      ? (new Date(t.resuelto_at) - creado) / HORA_MS : null;
    const primeraRespuesta = comentarios
      .filter((c) => c.ticket_id === t.id && c.interno === false && c.autor_id && staff.has(c.autor_id))
      .map((c) => new Date(c.created_at)).sort((a, b) => a - b)[0] || null;
    const s = encuestaPor[t.id];
    const respondida = !!(s && s.fecha_envio);
    return {
      ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, estado: t.estado, prioridad: t.prioridad, tipo: t.tipo,
      nivel_atencion: t.nivel_atencion || null,
      categoria_id: t.categoria_id || null, categoria_nombre: cats[t.categoria_id]?.nombre || null,
      subcategoria_id: t.subcategoria_id || null, subcategoria_nombre: subs[t.subcategoria_id]?.nombre || null,
      empleado_id: t.empleado_id || null, vinculado: t.vinculado,
      solicitante: t.vinculado && emp ? `${emp.nombres} ${emp.apellidos}`.trim() : 'Sin vincular',
      area_obra_id: emp?.area_obra_id || null, area_obra_nombre: areas[emp?.area_obra_id]?.nombre || null,
      ubicacion_id: emp?.ubicacion_id || null, ubicacion_nombre: ubis[emp?.ubicacion_id]?.nombre || null,
      asignado_a: t.asignado_a || null,
      created_at: t.created_at, dia_creado: diaLima(t.created_at),
      resuelto_at: t.resuelto_at || null, dia_resuelto: diaLima(t.resuelto_at),
      resuelto_vigente: resueltoVigente, rechazado: t.estado === 'rechazado', cerrado: t.estado === 'cerrado',
      tecnico_resolvio_id: res.length ? (res[res.length - 1].user_id || null) : null,
      horas_resolucion: horas,
      primera_respuesta_at: primeraRespuesta ? primeraRespuesta.toISOString() : null,
      horas_primera_respuesta: primeraRespuesta && primeraRespuesta >= creado ? (primeraRespuesta - creado) / HORA_MS : null,
      n_reasignaciones: eventos.filter((e) => e.ticket_id === t.id && e.evento === 'reasignado').length,
      n_resoluciones: res.length,
      primera_resolucion_at: res.length ? res[0].at.toISOString() : null,
      dia_primera_resolucion: res.length ? diaLima(res[0].at) : null,
      ultima_resolucion_at: res.length ? res[res.length - 1].at.toISOString() : null,
      n_reaperturas: reaps.length,
      reaperturas_at: reaps.map((r) => r.at.toISOString()),
      reabierto_en_corte: enCorte,
      transiciones: ev.map((e) => ({ t: e.at.toISOString(), a: e.destino })),
      encuesta_id: s?.id || null, encuesta_generada: !!s, encuesta_generada_at: s?.created_at || null,
      encuesta_respondida: respondida,
      encuesta_nivel: respondida ? (s.nivel ?? null) : null,
      encuesta_comentario: respondida ? (s.comentario ?? null) : null,
      encuesta_respondida_at: s?.fecha_envio || null,
    };
  });
}

// ── backlog_tramos_en(instante) ─────────────────────────────────────────────
const TRAMOS = [
  { clave: 'hasta_3', etiqueta: '0 a 3 días', desde: 0, hasta: 3 },
  { clave: 'de_4_a_7', etiqueta: '4 a 7 días', desde: 4, hasta: 7 },
  { clave: 'de_8_a_30', etiqueta: '8 a 30 días', desde: 8, hasta: 30 },
  { clave: 'mas_30', etiqueta: 'Más de 30 días', desde: 31, hasta: null },
];
// backlog_tickets_en(instante) (118): los tickets vigentes con sus días.
export function backlogTicketsEn(hechos, instante) {
  return hechos.filter((h) => {
    if (new Date(h.created_at) > instante) return false;
    const previas = h.transiciones.filter((x) => new Date(x.t) <= instante);
    const estado = previas.length ? previas[previas.length - 1].a : (h.transiciones.length ? 'abierto' : h.estado);
    return !TERMINALES.includes(estado);
  }).map((h) => ({ hecho: h, dias: Math.floor((instante - new Date(h.created_at)) / 86400000) }));
}

export function backlogTramosEn(hechos, instante) {
  const vigentes = backlogTicketsEn(hechos, instante).map((v) => v.dias);
  return TRAMOS.map((t) => {
    const dias = vigentes.filter((d) => d >= t.desde && (t.hasta == null || d <= t.hasta));
    return { clave: t.clave, etiqueta: t.etiqueta, cantidad: dias.length, dias_mas_antiguo: dias.length ? Math.max(...dias) : null };
  });
}

// ── reporte_tickets_de ──────────────────────────────────────────────────────
function resumenTiempos(valores) {
  return { n: valores.length, mediana_horas: redondear(mediana(valores)), promedio_horas: redondear(promedio(valores)) };
}
const noNulos = (xs) => xs.filter((x) => x != null);
const ordenNombre = (a, b) => (b.creados - a.creados) || (b.resueltos - a.resueltos) || String(a.nombre).localeCompare(String(b.nombre));

export function reporteTicketsDe(db, { user, desde, hasta, tecnico = null, comparar = true, ahora = new Date() }) {
  const rol = (db.staff || []).find((s) => s.user_id === user);
  const modulos = (db.staff_modulos_permisos || []).filter((m) => m.staff_user_id === user).map((m) => m.modulo);
  const esJefe = !!rol && rol.activo && rol.rol === 'JEFE';
  if (!rol || !rol.activo || !(esJefe || modulos.includes('tickets'))) throw rechazo('42501', 'No autorizado');
  if (tecnico && tecnico !== user && !esJefe) throw rechazo('42501', 'No autorizado');
  if (!desde || !hasta || desde > hasta) throw rechazo('P0001', 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.');
  if (diasEntre(desde, hasta) >= 366) throw rechazo('P0001', 'El período no puede superar los 366 días.');

  const minimo = parametro(db, 'csat_muestra_minima', 5);
  const corte = parametro(db, 'dias_corte_reapertura', 30);
  const hoy = diaLima(ahora);
  const completo = hasta < hoy;
  const enCurso = desde <= hoy && hasta >= hoy;
  const cierre = new Date(Math.min(inicioLima(sumarDias(hasta, 1)).getTime(), ahora.getTime()));
  const hechos = hechosDeTickets(db);
  const enRango = (dia) => dia != null && dia >= desde && dia <= hasta;

  const h = hechos.map((x) => ({
    ...x,
    creado_en: tecnico == null && enRango(x.dia_creado),
    resuelto_en: x.resuelto_vigente && enRango(x.dia_resuelto) && (tecnico == null || x.tecnico_resolvio_id === tecnico),
    primera_resolucion_en: x.primera_resolucion_at != null && enRango(x.dia_primera_resolucion) && (tecnico == null || x.tecnico_resolvio_id === tecnico),
  }));
  const u = h.filter((x) => x.creado_en || x.resuelto_en || x.primera_resolucion_en);
  const universo = u.filter((x) => x.creado_en || x.resuelto_en);
  const resueltos = u.filter((x) => x.resuelto_en);
  const eventosReapertura = h.filter((x) => tecnico == null || x.tecnico_resolvio_id === tecnico)
    .flatMap((x) => x.reaperturas_at).filter((r) => enRango(diaLima(r))).length;

  const dimension = (clave, nombre) => {
    const mapa = new Map();
    for (const x of universo) {
      const k = clave(x) ?? '';
      if (!mapa.has(k)) mapa.set(k, { clave: k, nombre: nombre(x), creados: 0, resueltos: 0 });
      if (x.creado_en) mapa.get(k).creados += 1;
      if (x.resuelto_en) mapa.get(k).resueltos += 1;
    }
    return [...mapa.values()];
  };
  const por = {
    categoria: dimension((x) => x.categoria_id, (x) => x.categoria_nombre || 'Sin categoría').sort(ordenNombre),
    subcategoria: dimension((x) => x.subcategoria_id, (x) => `${x.categoria_nombre || 'Sin categoría'} › ${x.subcategoria_nombre || 'Sin subcategoría'}`).sort(ordenNombre),
    prioridad: dimension((x) => x.prioridad, (x) => x.prioridad || 'Sin definir')
      .sort((a, b) => (ORDEN_PRIORIDAD.indexOf(a.clave) + 1 || 99) - (ORDEN_PRIORIDAD.indexOf(b.clave) + 1 || 99)),
    tipo: dimension((x) => x.tipo, (x) => x.tipo || 'sin_clasificar').sort(ordenNombre),
    nivel: dimension((x) => x.nivel_atencion, (x) => x.nivel_atencion || 'Sin nivel').sort((a, b) => a.nombre.localeCompare(b.nombre)),
    area: dimension((x) => x.area_obra_id, (x) => x.area_obra_nombre || 'Sin registrar').sort(ordenNombre),
  };

  const horas = noNulos(resueltos.map((x) => x.horas_resolucion));
  const horasPr = noNulos(resueltos.map((x) => x.horas_primera_respuesta));
  const porPrioridad = [...new Set(resueltos.map((x) => x.prioridad || 'sin_definir'))]
    .sort((a, b) => (ORDEN_PRIORIDAD.indexOf(a) + 1 || 99) - (ORDEN_PRIORIDAD.indexOf(b) + 1 || 99))
    .map((p) => ({ prioridad: p, ...resumenTiempos(noNulos(resueltos.filter((x) => (x.prioridad || 'sin_definir') === p).map((x) => x.horas_resolucion))) }));

  const base = u.filter((x) => x.primera_resolucion_en);
  const reabiertos = base.filter((x) => x.reabierto_en_corte).length;
  const niveles = noNulos(resueltos.map((x) => x.encuesta_nivel));
  const csat = (xs) => {
    const n = noNulos(xs.map((x) => x.encuesta_nivel));
    return { n: n.length, promedio: n.length >= minimo ? redondear(promedio(n)) : null, insuficiente: n.length < minimo };
  };
  const comentariosBajos = resueltos.filter((x) => x.encuesta_nivel != null && x.encuesta_nivel <= 2 && x.encuesta_comentario)
    .sort((a, b) => new Date(b.encuesta_respondida_at) - new Date(a.encuesta_respondida_at));

  // Por técnico (118): cada técnico de mesa es su grupo; el resto, «Jefatura y otros».
  const staffDe = (id) => (db.staff || []).find((s) => s.user_id === id);
  const grupoDe = (x) => (staffDe(x.tecnico_resolvio_id)?.tecnico_mesa ? x.tecnico_resolvio_id : null);
  const carga = new Map();
  for (const x of hechos) if (x.asignado_a && !TERMINALES.includes(x.estado)) carga.set(x.asignado_a, (carga.get(x.asignado_a) || 0) + 1);
  const filaGrupo = (mios) => {
    const r = mios.filter((x) => x.resuelto_en);
    const b = mios.filter((x) => x.primera_resolucion_en);
    const c = csat(r);
    const satisfechos = r.filter((x) => x.encuesta_nivel != null && x.encuesta_nivel >= 4).length;
    return {
      resueltos: r.length, mismo_periodo: r.filter((x) => x.creado_en).length, arrastrados: r.filter((x) => !x.creado_en).length,
      tiempos: resumenTiempos(noNulos(r.map((x) => x.horas_resolucion))),
      csat: { ...c, satisfechos, pct_satisfaccion: c.n > 0 && c.n >= minimo ? pct(satisfechos, c.n) : null },
      reaperturas: { base: b.length, reabiertos: b.filter((x) => x.reabierto_en_corte).length },
    };
  };
  const ug = u.filter((x) => x.resuelto_en || x.primera_resolucion_en);
  const mesa = (db.staff || []).filter((s) => s.tecnico_mesa && s.activo && (tecnico == null || s.user_id === tecnico)).map((s) => s.user_id);
  const idsMesa = [...new Set([...mesa, ...ug.map(grupoDe).filter((g) => g != null)])];
  const filasMesa = idsMesa.map((id) => ({
    grupo: 'tecnico', tecnico_id: id, nombre: staffDe(id)?.nombre || null, ...filaGrupo(ug.filter((x) => grupoDe(x) === id)), asignados_hoy: carga.get(id) || 0,
  })).sort((a, b) => (b.resueltos - a.resueltos) || String(a.nombre ?? '￿').localeCompare(String(b.nombre ?? '￿')));
  const otros = {
    grupo: 'otros', tecnico_id: null, nombre: null, ...filaGrupo(ug.filter((x) => grupoDe(x) == null)),
    asignados_hoy: tecnico == null ? [...carga].filter(([id]) => !staffDe(id)?.tecnico_mesa).reduce((a, [, n]) => a + n, 0) : 0,
  };
  const tecnicos = [...filasMesa, ...(otros.resueltos > 0 || otros.reaperturas.base > 0 || otros.asignados_hoy > 0 ? [otros] : [])];

  // Tablero, por día, pendientes y solicitantes (118): solo alcance de equipo.
  const inicio = new Date(Math.min(inicioLima(desde).getTime(), ahora.getTime()));
  const pend = backlogTicketsEn(hechos, cierre);
  const ingresados = u.filter((x) => x.creado_en);
  const validos = ingresados.length - ingresados.filter((x) => x.rechazado).length;
  const resueltosDeIngresados = u.filter((x) => x.resuelto_en && x.creado_en).length;
  const porDia = [];
  if (tecnico == null && diasEntre(desde, hasta) < 31) {
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      porDia.push({
        dia: d,
        ingresaron: u.filter((x) => x.creado_en && x.dia_creado === d).length,
        rechazados: u.filter((x) => x.creado_en && x.rechazado && x.dia_creado === d).length,
        resueltos: u.filter((x) => x.resuelto_en && x.dia_resuelto === d).length,
      });
    }
  }
  const grupos = new Map();
  for (const x of ingresados) {
    const k = x.vinculado ? x.empleado_id : null;
    if (!grupos.has(k)) grupos.set(k, { empleado_id: k, solicitante: x.solicitante, area: k == null ? null : x.area_obra_nombre, tickets: 0, sin_resolver: 0 });
    const g = grupos.get(k);
    g.tickets += 1;
    if (!x.resuelto_en && !x.rechazado) g.sin_resolver += 1;
  }
  const solicitantes = [...grupos.values()]
    .sort((a, b) => (b.tickets - a.tickets) || ((a.empleado_id == null) - (b.empleado_id == null)) || String(a.solicitante).localeCompare(String(b.solicitante)));

  const arrastrados = resueltos.filter((x) => x.dia_creado < desde).map((x) => ({
    codigo: x.codigo, titulo: x.titulo, created_at: x.created_at, resuelto_at: x.resuelto_at,
    dias_abierto: Math.floor((new Date(x.resuelto_at) - new Date(x.created_at)) / 86400000), tecnico_id: x.tecnico_resolvio_id,
  })).sort((a, b) => (b.dias_abierto - a.dias_abierto) || a.codigo.localeCompare(b.codigo));
  const sinEncuesta = resueltos.filter((x) => x.cerrado && !x.encuesta_generada)
    .map((x) => ({ codigo: x.codigo, titulo: x.titulo, resuelto_at: x.resuelto_at, motivo: x.empleado_id == null ? 'sin_solicitante' : 'sin_encuesta' }))
    .sort((a, b) => new Date(b.resuelto_at) - new Date(a.resuelto_at));
  const backlog = backlogTramosEn(hechos, cierre);
  const primerTicket = hechos.length ? hechos.map((x) => x.created_at).sort()[0] : null;

  const resultado = {
    generado_en: ahora.toISOString(),
    generado_por: { user_id: user, nombre: rol.nombre },
    definiciones_version: VERSION_DEFINICIONES,
    periodo: { desde, hasta, dias: diasEntre(desde, hasta) + 1, completo, en_curso: enCurso, cierre_at: cierre.toISOString(), zona: ZONA },
    periodo_completo: completo,
    alcance: { tipo: tecnico ? 'tecnico' : 'equipo', tecnico_id: tecnico, tecnico_nombre: tecnico ? ((db.staff || []).find((s) => s.user_id === tecnico)?.nombre || null) : null },
    parametros: { csat_muestra_minima: minimo, dias_corte_reapertura: corte },
    primer_ticket_at: primerTicket,
    volumen: {
      creados: tecnico ? null : universo.filter((x) => x.creado_en).length,
      rechazados: tecnico ? null : universo.filter((x) => x.creado_en && x.rechazado).length,
      resueltos: resueltos.length,
      resueltos_mismo_periodo: resueltos.filter((x) => enRango(x.dia_creado)).length,
      resueltos_arrastrados: resueltos.filter((x) => x.dia_creado < desde).length,
      cerrados_sin_encuesta: sinEncuesta.length,
      backlog: tecnico ? null : {
        referencia: completo ? 'cierre' : 'ahora',
        total: backlog.reduce((a, t) => a + t.cantidad, 0),
        dias_mas_antiguo: backlog.some((t) => t.dias_mas_antiguo != null) ? Math.max(...backlog.map((t) => t.dias_mas_antiguo ?? -1)) : null,
        tramos: backlog.map(({ clave, etiqueta, cantidad }) => ({ clave, etiqueta, cantidad })),
      },
    },
    tablero: tecnico ? null : {
      ingresaron: ingresados.length, rechazados: ingresados.length - validos, validos,
      resueltos: resueltos.length, resueltos_de_ingresados: resueltosDeIngresados,
      pct_resuelto: pct(resueltosDeIngresados, validos),
      pendientes_inicio: backlogTicketsEn(hechos, inicio).length,
      pendientes_cierre: pend.length,
    },
    por_dia: porDia.length ? porDia : null,
    pendientes: tecnico ? null : {
      referencia: completo ? 'cierre' : 'ahora',
      total: pend.length,
      sin_asignar_hoy: hechos.filter((x) => !x.asignado_a && !TERMINALES.includes(x.estado)).length,
      lista: pend.slice().sort((a, b) => (b.dias - a.dias) || a.hecho.codigo.localeCompare(b.hecho.codigo)).slice(0, 100).map(({ hecho: x, dias }) => ({
        codigo: x.codigo, titulo: x.titulo, prioridad: x.prioridad, estado_hoy: x.estado, created_at: x.created_at,
        dias, asignado_a: x.asignado_a, solicitante: x.solicitante,
      })),
    },
    solicitantes: tecnico ? null : {
      total: solicitantes.length,
      top: solicitantes.slice(0, 10).map(({ solicitante, area, tickets, sin_resolver }) => ({ solicitante, area, tickets, sin_resolver })),
    },
    por,
    atencion: { unidad: 'horas corridas', resolucion: resumenTiempos(horas), primera_respuesta: resumenTiempos(horasPr), por_prioridad: porPrioridad },
    calidad: {
      reaperturas: { base: base.length, reabiertos, tasa_pct: pct(reabiertos, base.length), eventos: eventosReapertura, corte_dias: corte, ventana_completa: sumarDias(hasta, corte) < hoy },
      csat: {
        generadas: resueltos.filter((x) => x.encuesta_generada).length,
        respondidas: resueltos.filter((x) => x.encuesta_respondida).length,
        tasa_respuesta_pct: pct(resueltos.filter((x) => x.encuesta_respondida).length, resueltos.filter((x) => x.encuesta_generada).length),
        n: niveles.length,
        promedio: niveles.length >= minimo ? redondear(promedio(niveles)) : null,
        insuficiente: niveles.length < minimo,
        minimo,
        niveles: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [String(k), niveles.filter((x) => x === k).length])),
        insatisfechos: niveles.filter((x) => x <= 2).length,
        satisfechos: niveles.filter((x) => x >= 4).length,
        regulares: niveles.filter((x) => x === 3).length,
        pct_satisfaccion: niveles.length > 0 && niveles.length >= minimo ? pct(niveles.filter((x) => x >= 4).length, niveles.length) : null,
      },
      comentarios_bajos: comentariosBajos.slice(0, 20).map((x) => ({ codigo: x.codigo, nivel: x.encuesta_nivel, comentario: x.encuesta_comentario, fecha: x.encuesta_respondida_at })),
      comentarios_bajos_total: comentariosBajos.length,
    },
    por_tecnico: esJefe ? tecnicos : null,
    anexos: { arrastrados, cerrados_sin_encuesta: sinEncuesta },
    tickets: universo.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((x) => ({
      codigo: x.codigo, titulo: x.titulo, estado: x.estado, prioridad: x.prioridad, tipo: x.tipo, nivel_atencion: x.nivel_atencion,
      categoria: x.categoria_nombre, subcategoria: x.subcategoria_nombre, area: x.area_obra_nombre, solicitante: x.solicitante,
      created_at: x.created_at, resuelto_at: x.resuelto_at, horas_resolucion: x.resuelto_en ? redondear(x.horas_resolucion) : null,
      tecnico_id: x.tecnico_resolvio_id, asignado_a: x.asignado_a, encuesta_nivel: x.encuesta_nivel,
      en_periodo: x.creado_en && x.resuelto_en ? 'ambos' : (x.creado_en ? 'creado' : 'resuelto'),
    })),
    comparacion: null,
  };

  if (comparar && completo && tecnico == null) {
    const esMes = desde.endsWith('-01') && hasta === sumarDias(sumarMeses(desde, 1), -1);
    const antDesde = esMes ? sumarMeses(desde, -1) : sumarDias(desde, -(diasEntre(desde, hasta) + 1));
    const antHasta = sumarDias(desde, -1);
    const anterior = reporteTicketsDe(db, { user, desde: antDesde, hasta: antHasta, tecnico: null, comparar: false, ahora });
    const primerDia = diaLima(primerTicket);
    const { backlog: _b, ...volumen } = anterior.volumen;
    resultado.comparacion = {
      periodo: { desde: antDesde, hasta: antHasta },
      parcial: primerDia == null || antDesde < primerDia,
      volumen, tablero: anterior.tablero, atencion: anterior.atencion.resolucion, csat: anterior.calidad.csat, reaperturas: anterior.calidad.reaperturas,
    };
  }
  return resultado;
}

// ── satisfaccion_fila (118) ─────────────────────────────────────────────────
// La fila común de satisfacción: conteos, promedio con muestra mínima, % de
// satisfechos (4 o 5) y, con umbrales [conforme, regular, mínimo por persona],
// la situación del solicitante. Misma fórmula que public.satisfaccion_fila.
export function filaSatisfaccion(filas, minimo, umbrales = null) {
  const niveles = noNulos(filas.map((x) => x.encuesta_nivel));
  const n = [1, 2, 3, 4, 5].map((k) => niveles.filter((v) => v === k).length);
  const muestra = niveles.length;
  const satisfechos = n[3] + n[4];
  const generadas = filas.filter((x) => x.encuesta_generada).length;
  const respondidas = filas.filter((x) => x.encuesta_respondida).length;
  const pctv = muestra > 0 ? pct(satisfechos, muestra) : null;
  let situacion = null;
  if (umbrales) {
    if (muestra === 0) situacion = 'sin_respuestas';
    else if (muestra < umbrales[2]) situacion = 'pocas_respuestas';
    else if (pctv >= umbrales[0]) situacion = 'conforme';
    else if (pctv >= umbrales[1]) situacion = 'regular';
    else situacion = 'inconforme';
  }
  return {
    tickets: filas.length, encuestasGeneradas: generadas, encuestasRespondidas: respondidas, faltan: generadas - respondidas,
    tasaRespuestaPct: pct(respondidas, generadas), muestra,
    promedio: muestra >= minimo ? redondear(promedio(niveles)) : null, insuficiente: muestra < minimo,
    niveles: Object.fromEntries(n.map((c, i) => [String(i + 1), c])),
    satisfechos, regulares: n[2], insatisfechos: n[0] + n[1],
    pctSatisfaccion: muestra > 0 && (umbrales || muestra >= minimo) ? pctv : null,
    situacion,
  };
}

// ── reporte_satisfaccion_de (118) ───────────────────────────────────────────
export function satisfaccionDe(db, { user, desde = null, hasta = null, ahora = new Date() }) {
  const rol = (db.staff || []).find((s) => s.user_id === user);
  const modulos = (db.staff_modulos_permisos || []).filter((m) => m.staff_user_id === user).map((m) => m.modulo);
  const esJefe = !!rol && rol.activo && rol.rol === 'JEFE';
  if (!rol || !rol.activo || !(esJefe || modulos.includes('tickets'))) throw rechazo('42501', 'No autorizado');
  if ((desde == null) !== (hasta == null)) throw rechazo('P0001', 'Indique las dos fechas del período o ninguna (todo el historial).');
  if (desde != null && desde > hasta) throw rechazo('P0001', 'El período no es válido: la fecha inicial debe ser anterior o igual a la final.');
  if (desde != null && diasEntre(desde, hasta) >= 366) throw rechazo('P0001', 'El período no puede superar los 366 días.');

  const minimo = parametro(db, 'csat_muestra_minima', 5);
  const umbrales = [parametro(db, 'satisfaccion_conforme_pct', 80), parametro(db, 'satisfaccion_regular_pct', 60), parametro(db, 'satisfaccion_minimo_persona', 3)];
  const hoy = diaLima(ahora);
  const staffDe = (id) => (db.staff || []).find((s) => s.user_id === id);
  const b = hechosDeTickets(db)
    .filter((h) => h.resuelto_vigente && (desde == null || (h.dia_resuelto >= desde && h.dia_resuelto <= hasta)))
    .map((h) => ({ ...h, grupo_id: staffDe(h.tecnico_resolvio_id)?.tecnico_mesa ? h.tecnico_resolvio_id : null, solicitante_id: h.vinculado ? h.empleado_id : null }));
  const agrupar = (clave) => {
    const m = new Map();
    for (const x of b) {
      const k = clave(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const porMes = [...agrupar((x) => mesDe(x.dia_resuelto))].sort((a, c) => (a[0] < c[0] ? 1 : -1))
    .map(([mes, filas]) => ({ mes, ...filaSatisfaccion(filas, minimo) }));
  const grupos = agrupar((x) => x.grupo_id);
  const mesa = (db.staff || []).filter((s) => s.tecnico_mesa && s.activo).map((s) => s.user_id);
  const idsMesa = [...new Set([...mesa, ...[...grupos.keys()].filter((k) => k != null)])];
  const porTecnico = [
    ...idsMesa.map((id) => ({ grupo: 'tecnico', tecnico_id: id, nombre: staffDe(id)?.nombre || null, ...filaSatisfaccion(grupos.get(id) || [], minimo) }))
      .sort((a, c) => (c.tickets - a.tickets) || String(a.nombre ?? '￿').localeCompare(String(c.nombre ?? '￿'))),
    ...(grupos.has(null) ? [{ grupo: 'otros', tecnico_id: null, nombre: null, ...filaSatisfaccion(grupos.get(null), minimo) }] : []),
  ];
  const porSolicitante = [...agrupar((x) => x.solicitante_id)].map(([k, filas]) => ({
    empleado_id: k, nombre: filas[0].solicitante, area: k == null ? null : filas[0].area_obra_nombre, ...filaSatisfaccion(filas, minimo, umbrales),
  })).sort((a, c) => (c.tickets - a.tickets) || ((a.empleado_id == null) - (c.empleado_id == null)) || String(a.nombre).localeCompare(String(c.nombre)));

  return {
    generado_en: ahora.toISOString(),
    generado_por: { user_id: user, nombre: rol.nombre },
    definiciones_version: VERSION_DEFINICIONES,
    periodo: desde == null ? null : { desde, hasta, dias: diasEntre(desde, hasta) + 1, completo: hasta < hoy, en_curso: desde <= hoy && hasta >= hoy },
    muestraMinima: minimo,
    umbrales: { conformePct: umbrales[0], regularPct: umbrales[1], minimoPersona: umbrales[2] },
    resumen: filaSatisfaccion(b, minimo),
    porMes,
    porTecnico: esJefe ? porTecnico : null,
    porSolicitante,
    respuestas: b.filter((h) => h.encuesta_generada)
      .sort((a, c) => new Date(c.encuesta_generada_at) - new Date(a.encuesta_generada_at))
      .map((h) => ({
        id: h.encuesta_id, ticket_id: h.ticket_id, ticket_codigo: h.codigo, ticket_titulo: h.titulo,
        empleado_id: h.empleado_id, solicitante: h.solicitante, tecnico_id: esJefe ? h.tecnico_resolvio_id : null,
        nivel: h.encuesta_nivel, comentario: h.encuesta_comentario, fecha_envio: h.encuesta_respondida_at,
        created_at: h.encuesta_generada_at, respondida: h.encuesta_respondida,
      })),
  };
}

// ── reporte_satisfaccion_consolidado_de (115, delega desde la 118) ──────────
export function satisfaccionConsolidadaDe(db, { user, ahora = new Date() }) {
  const r = satisfaccionDe(db, { user, ahora });
  return Array.isArray(r.porTecnico) ? r : { ...r, porTecnico: [] };
}

// ── Entradas del mapa RPC de la maqueta (firma de la base) ──────────────────
export const RPC_REPORTES = {
  reporte_tickets: (db, args = {}) => reporteTicketsDe(db, { user: actor.id, desde: args.p_desde, hasta: args.p_hasta, tecnico: args.p_tecnico || null }),
  reporte_satisfaccion: (db, args = {}) => satisfaccionDe(db, { user: actor.id, desde: args.p_desde || null, hasta: args.p_hasta || null }),
  reporte_satisfaccion_consolidado: (db) => satisfaccionConsolidadaDe(db, { user: actor.id }),
};
