// Escenarios y RPC `dashboard_resumen` de la maqueta (`npm run dev:maqueta`).
//
// Simula la RPC de la migración 103 con los MISMOS datos inventados que el
// resto de la maqueta (mismos tickets, equipos, cuentas y empleados de
// `datos.js`), aplicando las mismas reglas que el servidor: secciones `null`
// por módulo, umbrales de 30 días, ticket viejo a más de 3 días, etc. Lee la
// base en memoria, así que lo que se haga durante la sesión (asignar un
// ticket, entregar un equipo) se refleja en el Inicio.
//
// ── Escenarios (parámetro de la URL, se lee al cargar la página) ─────────
//   /dashboard?maqueta=normal           (por defecto) críticos y atención.
//   /dashboard?maqueta=aldia            sin pendientes (todo al día).
//   /dashboard?maqueta=errorseccion     la sección `problemas` falla en la
//                                       PRIMERA llamada; "Reintentar" la corrige.
//   /dashboard?maqueta=errorseccion-fijo  igual, pero siempre falla.
//   /dashboard?maqueta=errortotal       la RPC falla ENTERA en la primera
//                                       llamada; "Reintentar" la corrige.
//   /dashboard?maqueta=sinrpc           la RPC falla siempre (backend sin la 103).
//   /dashboard?maqueta=asistente        sesión de ASISTENTE (Diego Huamán):
//                                       sin módulos licencias ni problemas,
//                                       esas secciones llegan `null`.
// Cambiar de escenario = recargar la página con otro valor (la URL del SPA
// no conserva el parámetro al navegar, pero el escenario queda fijo).

const ESCENARIOS = ['normal', 'aldia', 'errorseccion', 'errorseccion-fijo', 'errortotal', 'sinrpc', 'asistente'];

function leerEscenario() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || '').get('maqueta');
    return ESCENARIOS.includes(q) ? q : 'normal';
  } catch {
    return 'normal';
  }
}

export const ESCENARIO = leerEscenario();

// ── Utilidades de fecha (locales, como `datos.js`) ───────────────────────
const DIA_MS = 86400000;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fecha = (dias = 0) => iso(new Date(Date.now() + dias * DIA_MS));
const diaDe = (ts) => iso(new Date(ts));
const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const haceHoy = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const nombreDe = (e) => (e ? `${e.nombres} ${e.apellidos}`.trim() : '');

const VIGENTE = (t) => !['resuelto', 'cerrado', 'rechazado'].includes(t.estado);
const RANGO = { baja: 0, media: 1, alta: 2, urgente: 3 };
const MODULOS_TODOS = ['tickets', 'empleados', 'correos', 'licencias', 'equipos', 'base_conocimiento', 'problemas', 'encuestas'];

// Movimientos de hoy "de ejemplo": la maqueta no tiene entregas fechadas hoy.
// Referencian equipos y personas reales de `datos.js`; las entregas que se
// hagan en la sesión se suman a estos (ver `custodiaHoy`).
const MOVIMIENTOS_HOY_BASE = [
  { hora: [10, 12], evento: 'entregado', equipo: 'LAP-003', persona: 'e07' },
  { hora: [9, 40], evento: 'devuelto', equipo: 'TAB-001', persona: 'e10' },
];

let llamadas = 0;

export function resumenInicio(db, { usuarioId }) {
  llamadas += 1;
  const primera = llamadas === 1;
  // Presupuesto del Inicio: una sola llamada al montar. Se ve en la consola.
  console.info(`[maqueta] dashboard_resumen · llamada ${llamadas} · escenario ${ESCENARIO}`);

  if (ESCENARIO === 'sinrpc' || (ESCENARIO === 'errortotal' && primera)) {
    throw Object.assign(
      new Error('Could not find the function public.dashboard_resumen without parameters in the schema cache'),
      { code: 'PGRST202' },
    );
  }

  const staff = db.staff.find((s) => s.user_id === usuarioId);
  const modulos = staff?.rol === 'JEFE'
    ? MODULOS_TODOS
    : db.staff_modulos_permisos.filter((m) => m.staff_user_id === usuarioId).map((m) => m.modulo);
  const puede = (m) => modulos.includes(m);

  const hoy = fecha(0);
  const empleado = (id) => db.empleados.find((e) => e.id === id);
  const equipo = (id) => db.equipos.find((e) => e.id === id);
  const plataforma = (id) => db.plataformas.find((p) => p.id === id)?.nombre || '';
  const tituloEquipo = (q) => `${q.marca || ''} ${q.modelo || ''}`.trim();
  const tipoEquipo = (q) => db.tipos_equipo.find((t) => t.id === q.tipo_id)?.nombre || '';

  const titulares = (cuentaId) => db.asignaciones_cuenta
    .filter((a) => a.cuenta_id === cuentaId && a.fecha_fin == null)
    .map((a) => ({ id: a.empleado_id, nombre: nombreDe(empleado(a.empleado_id)) }));
  const filaCuenta = (c) => ({
    cuenta_id: c.id, usuario: c.usuario, tipo_cuenta: c.tipo_cuenta || 'personal',
    plataforma: plataforma(c.plataforma_id), titulares: titulares(c.id),
  });
  const cuentasVivas = db.cuentas.filter((c) => !c.deleted_at);

  const vigentes = db.tickets.filter(VIGENTE);
  const filaTicket = (t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at });
  const porAntiguedad = (a, b) => a.created_at.localeCompare(b.created_at);
  const mios = vigentes
    .filter((t) => t.asignado_a === usuarioId)
    .sort((a, b) => (RANGO[b.prioridad] ?? -1) - (RANGO[a.prioridad] ?? -1) || porAntiguedad(a, b));

  const asignacionesPersona = db.asignaciones_equipo.filter((a) => a.empleado_id && a.fecha_fin == null);

  // ── Secciones (null = sin módulo; null + nombre en `errores` = falló) ──
  const kpis = {
    empleados_activos: puede('empleados') ? db.empleados.filter((e) => !e.deleted_at && e.estado === 'Activo').length : null,
    empleados_total: puede('empleados') ? db.empleados.filter((e) => !e.deleted_at).length : null,
    cuentas_asignadas: puede('correos') ? db.asignaciones_cuenta.filter((a) => a.fecha_fin == null).length : null,
    correos_compartidos: puede('correos') ? cuentasVivas.filter((c) => c.tipo_cuenta === 'compartida').length : null,
    cuentas_por_rotar: puede('correos') ? cuentasVivas.filter((c) => c.requiere_rotacion).length : null,
    licencias_por_vencer: puede('licencias')
      ? db.licencias.filter((l) => !l.deleted_at && l.fecha_vencimiento && l.fecha_vencimiento <= fecha(30)).length : null,
    equipos_total: puede('equipos') ? db.equipos.filter((e) => !e.deleted_at).length : null,
    tickets_abiertos: puede('tickets') ? vigentes.length : null,
  };

  const tickets = puede('tickets')
    ? {
        sin_asignar: vigentes.filter((t) => !t.asignado_a).sort(porAntiguedad).map(filaTicket),
        sin_vincular: vigentes.filter((t) => t.vinculado === false).sort(porAntiguedad).map(filaTicket),
        viejos: vigentes.filter((t) => diaDe(t.created_at) < fecha(-3)).sort(porAntiguedad).map(filaTicket),
        mios: mios.slice(0, 5).map((t) => ({
          id: t.id, codigo: t.codigo, titulo: t.titulo, prioridad: t.prioridad, estado: t.estado, created_at: t.created_at,
        })),
        mios_total: mios.length,
        vigentes: vigentes.length,
        vencidos: null,
        por_vencer: null,
      }
    : null;

  const rotaciones = puede('correos') ? cuentasVivas.filter((c) => c.requiere_rotacion).map(filaCuenta) : null;
  const sinPassword = puede('correos') ? cuentasVivas.filter((c) => c.password == null).map(filaCuenta) : null;

  const altas = puede('correos')
    ? db.empleados
      .filter((e) => !e.deleted_at && e.estado === 'Activo' && e.fecha_alta && e.fecha_alta <= hoy && e.fecha_alta >= fecha(-30))
      .filter((e) => !db.asignaciones_cuenta.some((a) => a.empleado_id === e.id && a.fecha_fin == null
        && cuentasVivas.some((c) => c.id === a.cuenta_id)))
      .map((e) => ({
        empleado_id: e.id, nombre: nombreDe(e), cargo: e.cargo || '', fecha_alta: e.fecha_alta,
        dias: Math.round((Date.parse(hoy) - Date.parse(e.fecha_alta)) / DIA_MS), faltan: ['cuenta'],
      }))
    : null;

  const licencias = puede('licencias')
    ? db.licencias
      .filter((l) => !l.deleted_at && l.fecha_vencimiento && l.fecha_vencimiento <= fecha(30))
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento))
      .map((l) => ({
        licencia_id: l.id, software: l.software, cantidad: l.cantidad, fecha_vencimiento: l.fecha_vencimiento,
        empresa: db.empresas.find((e) => e.id === l.empresa_id)?.nombre || '', vencida: l.fecha_vencimiento < hoy,
      }))
    : null;

  const sinDevolver = puede('equipos')
    ? asignacionesPersona
      .filter((a) => empleado(a.empleado_id)?.estado === 'Inactivo' && equipo(a.equipo_id) && !equipo(a.equipo_id).deleted_at)
      .map((a) => ({
        asignacion_id: a.id, codigo: equipo(a.equipo_id).codigo, equipo: tituloEquipo(equipo(a.equipo_id)),
        empleado: nombreDe(empleado(a.empleado_id)), empleado_id: a.empleado_id, desde: a.fecha_inicio,
        empleado_baja_at: empleado(a.empleado_id)?.updated_at || a.fecha_inicio,
      }))
    : null;

  const garantias = puede('equipos')
    ? db.equipos
      .filter((q) => !q.deleted_at && ['operativo', 'en_reparacion'].includes(q.estado) && q.garantia_hasta && q.garantia_hasta <= fecha(30))
      .sort((a, b) => a.garantia_hasta.localeCompare(b.garantia_hasta))
      .map((q) => ({
        equipo_id: q.id, codigo: q.codigo, equipo: tituloEquipo(q), garantia_hasta: q.garantia_hasta, vencida: q.garantia_hasta < hoy,
      }))
    : null;

  // Movimientos de hoy: los de ejemplo + las asignaciones creadas hoy en la sesión.
  const custodia = puede('equipos')
    ? [
      ...MOVIMIENTOS_HOY_BASE.map((m) => {
        const q = db.equipos.find((e) => e.codigo === m.equipo);
        const ts = haceHoy(...m.hora);
        return q && {
          hora: hhmm(ts), ocurrido_at: ts, evento: m.evento, equipo_id: q.id, equipo_codigo: q.codigo,
          equipo_descripcion: `${tipoEquipo(q)} ${tituloEquipo(q)}`.trim(), persona: nombreDe(empleado(m.persona)),
        };
      }).filter(Boolean),
      ...db.asignaciones_equipo
        .filter((a) => a.empleado_id && diaDe(a.created_at) === hoy)
        .map((a) => {
          const q = equipo(a.equipo_id);
          return q && {
            hora: hhmm(a.created_at), ocurrido_at: a.created_at, evento: 'entregado', equipo_id: q.id, equipo_codigo: q.codigo,
            equipo_descripcion: `${tipoEquipo(q)} ${tituloEquipo(q)}`.trim(), persona: nombreDe(empleado(a.empleado_id)),
          };
        }).filter(Boolean),
    ].sort((a, b) => b.ocurrido_at.localeCompare(a.ocurrido_at)).slice(0, 10)
    : null;

  // La migración 110 aún no existe en el backend real (sección `null`); la
  // maqueta la simula: entregas a personas de los últimos 60 días con más de
  // 3 días y sin acta (la tabla `actas` no existe en la maqueta; el corte de
  // 60 días hace de `actas_pendientes_desde`, que deja fuera el histórico).
  const actas = puede('equipos')
    ? asignacionesPersona
      .filter((a) => a.fecha_inicio >= fecha(-60) && a.fecha_inicio <= fecha(-3) && equipo(a.equipo_id))
      .map((a) => {
        const q = equipo(a.equipo_id);
        return {
          asignacion_id: a.id, equipo_id: q.id, equipo_codigo: q.codigo,
          equipo_descripcion: `${tipoEquipo(q)} ${tituloEquipo(q)}`.trim(),
          empleado_id: a.empleado_id, empleado: nombreDe(empleado(a.empleado_id)), fecha_inicio: a.fecha_inicio,
          dias: Math.round((Date.parse(hoy) - Date.parse(a.fecha_inicio)) / DIA_MS),
        };
      })
    : null;

  let problemas = null;
  if (puede('problemas')) {
    const vinculados = new Set(db.problema_tickets.map((p) => p.ticket_id));
    const porCategoria = new Map();
    for (const t of db.tickets) {
      if (!t.categoria_id || diaDe(t.created_at) < fecha(-30) || vinculados.has(t.id)) continue;
      porCategoria.set(t.categoria_id, [...(porCategoria.get(t.categoria_id) || []), t]);
    }
    problemas = {
      acciones_vencidas: db.acciones_correctivas
        .filter((a) => ['pendiente', 'en_progreso'].includes(a.estado) && !a.deleted_at && a.fecha_limite < hoy)
        .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite))
        .map((a) => ({
          accion_id: a.id, descripcion: a.descripcion, fecha_limite: a.fecha_limite, problema_id: a.problema_id,
          problema_titulo: db.problemas.find((p) => p.id === a.problema_id)?.titulo || '',
        })),
      recurrentes: puede('tickets')
        ? [...porCategoria.entries()]
          .filter(([, ts]) => ts.length >= 3)
          .map(([id, ts]) => ({
            categoria_id: id, categoria_nombre: db.categorias_ticket.find((c) => c.id === id)?.nombre || '',
            total: ts.length, tickets: ts.map(filaTicket),
          }))
        : null,
    };
  }

  const encuestas = puede('tickets') ? db.ticket_satisfaccion.filter((s) => s.fecha_envio == null).length : null;

  const errores = [];
  let problemasFinal = problemas;
  if (puede('problemas') && (ESCENARIO === 'errorseccion-fijo' || (ESCENARIO === 'errorseccion' && primera))) {
    errores.push('problemas');
    problemasFinal = null;
  }

  const resumen = {
    generado_en: new Date().toISOString(),
    kpis,
    tickets,
    rotaciones_pendientes: rotaciones,
    cuentas_sin_password: sinPassword,
    equipos_sin_devolver: sinDevolver,
    licencias_por_vencer: licencias,
    garantias_por_vencer: garantias,
    altas_incompletas: altas,
    problemas: problemasFinal,
    encuestas_sin_responder: encuestas,
    custodia_hoy: custodia,
    actas_pendientes: actas,
    solicitudes_abiertas: [],
    errores,
  };

  // "Al día": no queda NADA pendiente en las listas del feed (los paneles de
  // "Mis tickets" y "Hoy en custodia" conservan sus datos).
  if (ESCENARIO === 'aldia') {
    for (const k of ['rotaciones_pendientes', 'cuentas_sin_password', 'equipos_sin_devolver', 'licencias_por_vencer',
      'garantias_por_vencer', 'altas_incompletas', 'actas_pendientes']) {
      if (resumen[k]) resumen[k] = [];
    }
    if (resumen.tickets) Object.assign(resumen.tickets, { sin_asignar: [], sin_vincular: [], viejos: [] });
    if (resumen.problemas) Object.assign(resumen.problemas, { acciones_vencidas: [], recurrentes: [] });
  }

  return resumen;
}
