// Lado servidor FALSO del portal del empleado (migración 109) para la maqueta
// (`npm run dev:maqueta`): las RPC de staff (emitir y revocar el enlace) y la
// edge function pública `portal` (abrir y confirmar un equipo). Opera sobre la
// base en memoria de client.js. NADA de esto entra al bundle de producción
// (solo lo importan client.js y datos.js, que solo carga el plugin de la maqueta).
//
// Todo es inventado: el "token" de la maqueta se guarda en claro porque no
// protege nada; en producción solo existe su sha256. Enlaces de ejemplo, listos
// para abrir en `/mi/<token>`:
//   maqueta-portal-completo   Rosa Quispe, alcance completo (equipos, cuentas, tickets, confirmar)
//   maqueta-portal-accesos    Rosa Quispe, solo «Mis accesos»
//   maqueta-portal-vacio      Julio Vargas (alta reciente): una cuenta, sin equipos ni tickets
//   maqueta-portal-limite     responde demasiados_intentos
//   maqueta-portal-error      responde error_interno
//   cualquier otro            enlace no válido (igual que uno inexistente, vencido o revocado)
// Además sirven los enlaces que se emitan en la sesión desde el expediente de un empleado.

const DIA_MS = 86400000;
const ALCANCES = ['ver_accesos', 'ver_equipos', 'ver_tickets', 'confirmar_equipo'];
const DEMOS = {
  'maqueta-portal-completo': { empleado_id: 'e01', alcance: ALCANCES },
  'maqueta-portal-accesos': { empleado_id: 'e01', alcance: ['ver_accesos'] },
  'maqueta-portal-vacio': { empleado_id: 'e12', alcance: ALCANCES },
};

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

let secuencia = 0;
const idNuevo = () => `maq-enl-${Date.now().toString(36)}-${(secuencia += 1)}`;
const tokenNuevo = () => {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let t = 'maq';
  for (let i = 0; i < 21; i += 1) t += abc[Math.floor(Math.random() * abc.length)];
  return t;
};

// Enlace vigente de un token o null (no se distingue por qué falla, como en el servidor).
function resolver(db, token) {
  if (DEMOS[token]) return { id: `demo-${token}`, ...DEMOS[token] };
  const fila = (db.empleado_enlaces || []).find((l) => l.token_hash === token);
  if (!fila || fila.revocado_at || new Date(fila.expires_at).getTime() <= Date.now()) return null;
  const emp = db.empleados.find((e) => e.id === fila.empleado_id);
  return emp && emp.estado === 'Activo' ? fila : null;
}

function datosPortal(db, enlace) {
  const emp = db.empleados.find((e) => e.id === enlace.empleado_id);
  if (!emp || emp.estado !== 'Activo') return null;
  const salida = {
    ok: true,
    nombre: `${emp.nombres} ${emp.apellidos}`.trim(),
    vence: enlace.expires_at || new Date(Date.now() + 7 * DIA_MS).toISOString(),
    alcance: [...enlace.alcance],
  };
  if (enlace.alcance.includes('ver_equipos')) {
    salida.equipos = db.asignaciones_equipo
      .filter((a) => a.empleado_id === emp.id && !a.fecha_fin)
      .map((a) => ({ a, q: db.equipos.find((x) => x.id === a.equipo_id && !x.deleted_at) }))
      .filter(({ q }) => q)
      .map(({ a, q }) => ({
        asignacion_id: a.id,
        codigo: q.codigo,
        tipo: db.tipos_equipo.find((t) => t.id === q.tipo_id)?.nombre || '',
        entregado: a.fecha_inicio,
        condicion: a.condicion_entrega || null,
        confirmado_at: a.confirmado_por_empleado_at || null,
      }));
  }
  if (enlace.alcance.includes('ver_accesos')) {
    salida.accesos = db.asignaciones_cuenta
      .filter((ac) => ac.empleado_id === emp.id && !ac.fecha_fin)
      .map((ac) => db.cuentas.find((c) => c.id === ac.cuenta_id && !c.deleted_at))
      .filter(Boolean)
      .map((c) => ({ plataforma: db.plataformas.find((p) => p.id === c.plataforma_id)?.nombre || c.plataforma_id, usuario: c.usuario }));
  }
  if (enlace.alcance.includes('ver_tickets')) {
    salida.tickets = db.tickets
      .filter((t) => t.empleado_id === emp.id && !['resuelto', 'cerrado'].includes(t.estado))
      .slice(0, 20)
      .map((t) => ({ codigo: t.codigo, titulo: t.titulo, estado: t.estado, creado: t.created_at }));
  }
  return salida;
}

// ── Edge function pública `portal` ───────────────────────────────────────────
export function funcionPortal(db, body = {}) {
  const accion = body.action;
  if (accion !== 'abrir' && accion !== 'confirmarEquipo') return null;
  const token = String(body.token || '');
  if (token === 'maqueta-portal-limite') return { ok: false, code: 'demasiados_intentos' };
  if (token === 'maqueta-portal-error') return { ok: false, code: 'error_interno' };

  const enlace = resolver(db, token);
  if (!enlace) return { ok: false, code: 'no_existe' };

  if (accion === 'abrir') {
    const datos = datosPortal(db, enlace);
    if (!datos) return { ok: false, code: 'no_existe' };
    if (enlace.usos !== undefined) Object.assign(enlace, { usos: enlace.usos + 1, ultimo_uso_at: new Date().toISOString() });
    return datos;
  }

  if (!enlace.alcance.includes('confirmar_equipo')) return { ok: false, code: 'sin_alcance' };
  const asig = db.asignaciones_equipo.find((a) => a.id === body.asignacionId && a.empleado_id === enlace.empleado_id && !a.fecha_fin);
  if (!asig) return { ok: false, code: 'no_encontrada' };
  if (asig.confirmado_por_empleado_at) return { ok: true, yaConfirmada: true, confirmadoAt: asig.confirmado_por_empleado_at };
  const ahora = new Date().toISOString();
  Object.assign(asig, { confirmado_por_empleado_at: ahora, confirmacion_enlace_id: enlace.id });
  db.eventos_equipo.push({
    id: idNuevo(), equipo_id: asig.equipo_id, evento: 'recepcion_confirmada',
    detalle: 'El empleado confirmó la recepción desde su enlace del portal', user_id: null, user_email: null, created_at: ahora,
  });
  return { ok: true, yaConfirmada: false, confirmadoAt: ahora };
}

// ── RPC de staff ─────────────────────────────────────────────────────────────
export const RPC_PORTAL = {
  portal_emitir_enlace: (db, args = {}) => {
    const emp = db.empleados.find((e) => e.id === args.p_empleado_id && !e.deleted_at);
    if (!emp) rechazar('P0002', 'El empleado no existe.');
    if (emp.estado !== 'Activo') rechazar('P0001', `Solo se emite el enlace del portal a un empleado Activo (estado actual: ${emp.estado}).`);
    let alcance = args.p_alcance && args.p_alcance.length ? [...new Set(args.p_alcance)] : [...ALCANCES];
    if (alcance.some((a) => !ALCANCES.includes(a))) {
      rechazar('P0001', 'El alcance del enlace solo admite: ver_accesos, ver_equipos, ver_tickets y confirmar_equipo.');
    }
    if (alcance.includes('confirmar_equipo') && !alcance.includes('ver_equipos')) alcance.push('ver_equipos');
    alcance = alcance.sort();
    const dias = args.p_dias ?? 7;
    if (!Number.isInteger(dias) || dias < 1 || dias > 30) rechazar('P0001', 'La vigencia del enlace debe estar entre 1 y 30 días.');

    const ahora = new Date().toISOString();
    for (const l of db.empleado_enlaces) {
      if (l.empleado_id === emp.id && !l.revocado_at) l.revocado_at = ahora;
    }
    const token = tokenNuevo();
    const fila = {
      id: idNuevo(), empleado_id: emp.id, token_hash: token, alcance, expires_at: new Date(Date.now() + dias * DIA_MS).toISOString(),
      created_by: 'u-jefe', created_at: ahora, revocado_at: null, usos: 0, ultimo_uso_at: null,
    };
    db.empleado_enlaces.push(fila);
    return { ok: true, id: fila.id, token, expires_at: fila.expires_at, alcance, dias };
  },

  portal_revocar_enlace: (db, args = {}) => {
    const vivos = db.empleado_enlaces.filter((l) => l.empleado_id === args.p_empleado_id && !l.revocado_at);
    vivos.forEach((l) => { l.revocado_at = new Date().toISOString(); });
    return vivos.length > 0;
  },
};
