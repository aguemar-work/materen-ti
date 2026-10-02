// Lado servidor FALSO del dominio equipos para la maqueta (`npm run dev:maqueta`):
// las RPC de la migración 101 (asignar/devolver/mover/verificar equipo,
// migrar importación), el kardex que dejan los triggers, la tabla `actas`
// (migración 110) y las acciones `subirActa` / `urlActa` / fotos de la edge
// function `equipos-fotos`. Todo opera sobre la base en memoria de client.js y
// replica los rechazos de negocio (P0001 con el mismo mensaje en español, 42501
// no aplica: el JEFE ficticio siempre puede) para poder recorrer los flujos
// sin backend. NADA de esto entra al bundle de producción (solo lo importan
// datos.js y client.js, que solo carga el plugin del modo maqueta).

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ahora = () => new Date().toISOString();
let secuencia = 0;
const idNuevo = (pref) => `${pref}-${Date.now().toString(36)}-${(secuencia += 1)}`;

// Error con la forma que devuelve PostgREST ({ code, message }).
function errorSql(code, message) {
  return { code, message };
}

const ACTOR = { user_id: 'u-jefe', user_email: 'jefe@materen.pe' };

const equipoVivo = (db, id) => db.equipos.find((e) => e.id === id && !e.deleted_at);
const asignacionActiva = (db, equipoId) => db.asignaciones_equipo.find((a) => a.equipo_id === equipoId && !a.fecha_fin);
const nombreEmpleado = (e) => `${e.nombres} ${e.apellidos}`.trim();

function registrarEvento(db, equipo_id, evento, detalle, actor = ACTOR) {
  db.eventos_equipo.push({ id: idNuevo('ev'), equipo_id, evento, detalle, ...actor, created_at: ahora() });
}

function sincronizarAsignacion(db, equipoId) {
  const eq = db.equipos.find((e) => e.id === equipoId);
  if (eq) eq.tiene_asignacion_activa = !!asignacionActiva(db, equipoId);
}

function exigirEquipo(db, id) {
  const eq = equipoVivo(db, id);
  if (!eq) throw errorSql('P0002', 'El equipo no existe o está eliminado.');
  return eq;
}

function exigirOperativo(eq) {
  if (eq.estado !== 'operativo') {
    throw errorSql('P0001', `El equipo ${eq.codigo} no está operativo (estado: ${eq.estado}). No se puede asignar.`);
  }
}

function asignar(db, { p_equipo_id: equipoId, p_empleado_id: empleadoId, p_condicion_entrega: condicion = null }) {
  const eq = exigirEquipo(db, equipoId);
  exigirOperativo(eq);
  const emp = db.empleados.find((e) => e.id === empleadoId && !e.deleted_at);
  if (!emp) throw errorSql('P0002', 'El empleado no existe.');
  if (emp.estado !== 'Activo') throw errorSql('P0001', 'El empleado no está activo. No se le puede entregar un equipo.');

  const activa = asignacionActiva(db, equipoId);
  if (activa) {
    if (activa.empleado_id) {
      throw errorSql('P0001', `El equipo ${eq.codigo} ya tiene un portador activo. Registre la devolución antes de reasignar.`);
    }
    Object.assign(activa, { fecha_fin: hoyISO(), motivo_cierre: 'entrega_a_empleado' });
    const ubPrevia = db.ubicaciones.find((u) => u.id === activa.ubicacion_id);
    registrarEvento(db, equipoId, 'devuelto', `Retirado de ${ubPrevia?.nombre ?? '?'} (entrega_a_empleado)`);
  }
  const asig = {
    id: idNuevo('ae'), equipo_id: equipoId, empleado_id: empleadoId, ubicacion_id: null,
    fecha_inicio: hoyISO(), fecha_fin: null, condicion_entrega: condicion || null,
    condicion_devolucion: null, motivo_cierre: null, created_at: ahora(),
  };
  db.asignaciones_equipo.push(asig);
  sincronizarAsignacion(db, equipoId);
  registrarEvento(db, equipoId, 'asignado', `Entregado a ${nombreEmpleado(emp)}${condicion ? ` — ${condicion}` : ''}`);
  return asig;
}

const MOTIVOS_DEVOLUCION = ['devolucion', 'cambio_equipo', 'baja_empleado', 'perdida', 'robo'];

function devolver(db, { p_asignacion_id: asignacionId, p_condicion: condicion = null, p_motivo: motivo = 'devolucion', p_a_reparacion: aReparacion = false }) {
  const m = (motivo || '').trim() || 'devolucion';
  if (!MOTIVOS_DEVOLUCION.includes(m)) throw errorSql('P0001', 'El motivo de devolución no es válido.');
  const asig = db.asignaciones_equipo.find((a) => a.id === asignacionId);
  if (!asig) throw errorSql('P0002', 'La asignación no existe.');
  if (asig.fecha_fin) throw errorSql('P0001', 'La asignación ya está cerrada.');
  if (!asig.empleado_id) throw errorSql('P0001', 'La asignación no corresponde a una persona. Use el movimiento de ubicación.');

  Object.assign(asig, { fecha_fin: hoyISO(), condicion_devolucion: condicion || null, motivo_cierre: m });
  const eq = db.equipos.find((e) => e.id === asig.equipo_id);
  const emp = db.empleados.find((e) => e.id === asig.empleado_id);
  sincronizarAsignacion(db, eq.id);
  registrarEvento(db, eq.id, 'devuelto', `Devuelto por ${emp ? nombreEmpleado(emp) : 'un empleado'}${condicion ? ` — ${condicion}` : ''} (${m})`);

  const previo = eq.estado;
  if (m === 'perdida' || m === 'robo') eq.estado = 'perdido';
  else if (aReparacion) eq.estado = 'en_reparacion';
  if (eq.estado !== previo) registrarEvento(db, eq.id, 'estado_cambiado', `De "${previo}" a "${eq.estado}"`);
  return eq;
}

function mover(db, { p_equipo_id: equipoId, p_ubicacion_id: ubicacionId }) {
  const eq = exigirEquipo(db, equipoId);
  exigirOperativo(eq);
  const ub = db.ubicaciones.find((u) => u.id === ubicacionId && !u.deleted_at);
  if (!ub) throw errorSql('P0002', 'La ubicación no existe.');
  const activa = asignacionActiva(db, equipoId);
  if (activa) {
    if (activa.empleado_id) throw errorSql('P0001', 'El equipo lo tiene una persona. Registre la devolución antes de moverlo.');
    Object.assign(activa, { fecha_fin: hoyISO(), motivo_cierre: 'movimiento' });
    const ubPrevia = db.ubicaciones.find((u) => u.id === activa.ubicacion_id);
    registrarEvento(db, equipoId, 'devuelto', `Retirado de ${ubPrevia?.nombre ?? '?'} (movimiento)`);
  }
  const asig = {
    id: idNuevo('ae'), equipo_id: equipoId, empleado_id: null, ubicacion_id: ubicacionId,
    fecha_inicio: hoyISO(), fecha_fin: null, condicion_entrega: null,
    condicion_devolucion: null, motivo_cierre: null, created_at: ahora(),
  };
  db.asignaciones_equipo.push(asig);
  sincronizarAsignacion(db, equipoId);
  registrarEvento(db, equipoId, 'asignado', `Ubicado en ${ub.nombre}`);
  return asig;
}

function verificar(db, { p_equipo_id: equipoId, p_ubicacion_id: ubicacionId = null, p_nota: nota = null }) {
  exigirEquipo(db, equipoId);
  let lugar = '';
  if (ubicacionId) {
    const ub = db.ubicaciones.find((u) => u.id === ubicacionId && !u.deleted_at);
    if (!ub) throw errorSql('P0002', 'La ubicación no existe.');
    lugar = ` en ${ub.nombre}`;
  }
  registrarEvento(db, equipoId, 'verificado', `Verificado físicamente${lugar}${nota ? ` — ${nota}` : ''}`);
  return db.eventos_equipo.at(-1);
}

// ── Bandeja de importación → equipos ────────────────────────────────────────
function motivoBloqueo(db, fila, idsLote = null) {
  const codigo = String(fila.codigo || '').trim().toUpperCase();
  const serie = String(fila.serie || '').trim().toUpperCase();
  if (!codigo) return 'Falta el código del equipo.';
  if (!fila.tipo_id || !db.tipos_equipo.some((t) => t.id === fila.tipo_id)) return 'Falta el tipo de equipo.';
  if (db.equipos.some((e) => String(e.codigo).toUpperCase() === codigo)) return `Ya existe un equipo con el código ${codigo}.`;
  if (serie && db.equipos.some((e) => !e.deleted_at && String(e.serie || '').toUpperCase() === serie)) {
    return `Ya existe un equipo con el número de serie ${serie}.`;
  }
  if (idsLote) {
    const otras = db.equipos_importacion.filter((o) => idsLote.includes(o.id) && o.id !== fila.id);
    if (otras.some((o) => String(o.codigo || '').trim().toUpperCase() === codigo)) return `El código ${codigo} está repetido en el lote.`;
  }
  if (fila.modo !== 'disponible' && fila.estado !== 'operativo') return 'Un equipo que no está operativo no puede quedar asignado.';
  if (fila.modo === 'empleado' && !fila.empleado_id) return 'Falta elegir al empleado.';
  if (fila.modo === 'ubicacion' && !fila.ubicacion_id) return 'Falta elegir la ubicación.';
  return null;
}

function migrarFila(db, filaId, datos = null) {
  const i = db.equipos_importacion.findIndex((f) => f.id === filaId);
  if (i === -1) throw errorSql('P0002', 'La fila ya no está en la bandeja.');
  const fila = { ...db.equipos_importacion[i], ...(datos && typeof datos === 'object' ? datos : {}) };
  const motivo = motivoBloqueo(db, fila);
  if (motivo) throw errorSql('P0001', motivo);

  const eq = {
    id: idNuevo('q'), codigo: String(fila.codigo).trim().toUpperCase(), codigo_almacen: null, tipo_id: fila.tipo_id,
    marca: fila.marca || null, modelo: fila.modelo || null, serie: fila.serie || null, estado: 'operativo',
    empresa_id: null, fecha_compra: fila.fecha_compra || null, costo: fila.costo ?? null,
    moneda: fila.costo ? 'PEN' : null, garantia_hasta: null, specs: {}, accesorios: [], fotos: [],
    notas: fila.notas || '', tiene_asignacion_activa: false, deleted_at: null, created_at: ahora(),
  };
  db.equipos.push(eq);
  registrarEvento(db, eq.id, 'registrado', `Código ${eq.codigo}`);
  if (fila.modo === 'empleado') asignar(db, { p_equipo_id: eq.id, p_empleado_id: fila.empleado_id });
  else if (fila.modo === 'ubicacion') mover(db, { p_equipo_id: eq.id, p_ubicacion_id: fila.ubicacion_id });
  if (fila.estado && fila.estado !== 'operativo') {
    registrarEvento(db, eq.id, 'estado_cambiado', `De "operativo" a "${fila.estado}"`);
    eq.estado = fila.estado;
  }
  db.equipos_importacion.splice(db.equipos_importacion.findIndex((f) => f.id === filaId), 1);
  return eq;
}

function migrarLote(db, { p_fila_ids: ids = [] }) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return { ok: true, migrados: 0, bloqueados: [] };
  if (unicos.length > 100) throw errorSql('P0001', 'Migre como máximo 100 equipos por lote.');
  const bloqueados = unicos
    .map((id) => {
      const fila = db.equipos_importacion.find((f) => f.id === id);
      return {
        id, codigo: fila?.codigo ?? null,
        motivo: fila ? motivoBloqueo(db, fila, unicos) : 'La fila ya no está en la bandeja.',
      };
    })
    .filter((b) => b.motivo);
  if (bloqueados.length) return { ok: false, migrados: 0, bloqueados };
  for (const id of unicos) migrarFila(db, id);
  return { ok: true, migrados: unicos.length, bloqueados: [] };
}

export const RPC_EQUIPOS = {
  asignar_equipo: asignar,
  devolver_equipo: devolver,
  mover_equipo: mover,
  verificar_equipo: verificar,
  migrar_importacion_equipo: (db, args) => migrarFila(db, args.p_fila_id, args.p_datos),
  migrar_importacion_equipos: migrarLote,
};

// Lo que hace el trigger de la base cuando alguien cambia `equipos.estado` con
// un UPDATE directo (enviar a reparación, dar de baja...): una fila de kardex.
export function alActualizarFila(db, tabla, previa, actual) {
  if (tabla === 'equipos' && previa.estado !== actual.estado) {
    registrarEvento(db, actual.id, 'estado_cambiado', `De "${previa.estado}" a "${actual.estado}"`);
  }
}

// ── Edge function equipos-fotos: fotos y actas firmadas ─────────────────────
// PDF mínimo válido (una página con una línea de texto) para que "Ver acta
// firmada" abra algo de verdad en la maqueta.
function pdfDeMaqueta() {
  const texto = 'Acta firmada (maqueta) - documento de ejemplo, sin datos reales.';
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const flujo = `BT /F1 14 Tf 60 780 Td (${texto}) Tj ET`;
  objetos[3] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  let pdf = '%PDF-1.4\n';
  const posiciones = [];
  objetos.forEach((o, i) => { posiciones.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posiciones) pdf += `${String(p).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

export function funcionEquiposFotos(db, body = {}) {
  const accion = body.action;

  if (accion === 'subirFoto') {
    // La foto ya viene comprimida (JPEG en base64): se devuelve como data URI.
    return { ok: true, url: `data:image/jpeg;base64,${body.contenidoBase64 || ''}`, key: idNuevo('foto') };
  }
  if (accion === 'eliminarFoto') return { ok: true };

  if (accion === 'subirActa') {
    const asig = db.asignaciones_equipo.find((a) => a.id === body.asignacionId);
    if (!asig) return { ok: false, code: 'no_existe' };
    if (!['entrega', 'devolucion'].includes(body.tipo)) return { ok: false, code: 'asignacion_invalida' };
    if (!asig.empleado_id || (body.tipo === 'devolucion' && !asig.fecha_fin)) return { ok: false, code: 'asignacion_invalida' };
    if (!body.archivo) return { ok: false, code: 'archivo_requerido' };
    if (body.archivo.length * 0.75 > 10 * 1024 * 1024) return { ok: false, code: 'archivo_muy_grande' };
    // %PDF- en base64 empieza por "JVBERi0"
    if (!String(body.archivo).startsWith('JVBERi0')) return { ok: false, code: 'archivo_invalido' };
    if (body.firmadoAt && body.firmadoAt > hoyISO()) return { ok: false, code: 'fecha_invalida' };
    for (const previa of db.actas) {
      if (previa.asignacion_equipo_id === asig.id && previa.tipo === body.tipo && !previa.deleted_at) previa.deleted_at = ahora();
    }
    const acta = {
      id: idNuevo('act'), asignacion_equipo_id: asig.id, tipo: body.tipo, empleado_id: asig.empleado_id,
      equipo_id: asig.equipo_id, tamano_bytes: Math.floor(body.archivo.length * 0.75),
      firmado_at: body.firmadoAt || null, subido_por: ACTOR.user_id, created_at: ahora(), deleted_at: null,
    };
    db.actas.push(acta);
    registrarEvento(db, asig.equipo_id, 'acta_adjuntada',
      `Acta de ${body.tipo === 'entrega' ? 'entrega' : 'devolución'} firmada adjuntada`);
    return {
      ok: true,
      acta: { id: acta.id, tipo: acta.tipo, tamanoBytes: acta.tamano_bytes, firmadoAt: acta.firmado_at, creadaEn: acta.created_at },
    };
  }

  if (accion === 'urlActa') {
    const acta = db.actas.find((a) => a.id === body.actaId && !a.deleted_at);
    if (!acta) return { ok: false, code: 'no_existe' };
    return { ok: true, url: URL.createObjectURL(pdfDeMaqueta()), expiraEn: null, expiraSegundos: 120 };
  }

  return null;
}
