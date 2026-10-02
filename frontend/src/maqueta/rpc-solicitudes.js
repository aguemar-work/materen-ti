// RPC simuladas de la maqueta para las Solicitudes de servicio (migración 108).
// Cada función recibe la base en memoria y los argumentos NOMBRADOS (`p_...`),
// muta la base y devuelve la fila, igual que la RPC real. Los rechazos de
// negocio se lanzan con el mismo SQLSTATE y el MISMO texto en español que
// `crear_solicitud_nucleo` y compañía (P0001 regla de negocio, P0002 no existe),
// así la UI puede probarse con sus mensajes de error reales.
//
// También simula los TRIGGERS de autocompletado de la sección 5 de la migración:
// `autocompletarPaso` es lo que hace `solicitud_marcar_paso` cuando el staff usa
// los módulos de siempre (cuenta asignada, equipo entregado o devuelto, licencia
// asignada, contraseña rotada). Las RPC de cuentas y equipos de la maqueta
// (rpc-empleados.js, rpc-equipos.js) la llaman donde la base dispararía el trigger.
//
// Todo es inventado: nada sale de esta sesión (recargar devuelve los datos iniciales).
import { TIPOS, plantillaDe, plantillaPaso, pasoDePlantilla } from './solicitudes-plantilla.js';

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

let secuencia = 0;
const idNuevo = (prefijo) => `maq-${prefijo}-${Date.now().toString(36)}-${(secuencia += 1)}`;
const ahora = () => new Date().toISOString();
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE) con ?maqueta=asistente.
// datos.js lo fija al importar (este archivo no puede importar datos.js).
let actor = { id: 'u-jefe', esJefe: true };
export function definirActorSolicitudes(nuevo) {
  actor = { ...actor, ...nuevo };
}

const UNICAS = ['alta_empleado', 'baja_empleado', 'cambio_puesto'];
const ORIGENES = ['rrhh_correo', 'jefe_directo', 'ticket', 'sistema', 'otro'];

const limpio = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};

function siguienteCodigo(db) {
  const max = db.solicitudes.reduce((m, s) => Math.max(m, Number(String(s.codigo).slice(4)) || 0), 0);
  return `SOL-${String(max + 1).padStart(4, '0')}`;
}

const porAntiguedad = (a, b) => a.created_at.localeCompare(b.created_at)
  || a.codigo.length - b.codigo.length || a.codigo.localeCompare(b.codigo);

// ── Cierre automático ────────────────────────────────────────────────────────
export function evaluarCierre(db, solicitudId) {
  const s = db.solicitudes.find((x) => x.id === solicitudId);
  if (!s || s.estado !== 'abierta') return;
  const pasos = db.solicitud_pasos.filter((p) => p.solicitud_id === s.id);
  if (pasos.length && pasos.every((p) => p.estado !== 'pendiente')) {
    Object.assign(s, { estado: 'completada', completada_at: ahora(), updated_at: ahora() });
  }
}

/**
 * Lo que hace `solicitud_marcar_paso`: marca UN paso pendiente, el más antiguo
 * que corresponda entre las solicitudes abiertas (de la persona, o de cualquiera
 * si solo se conoce el objetivo). Un paso con objetivo solo sirve para él.
 */
export function autocompletarPaso(db, { empleadoId = null, clave, objetivoId = null, referenciaId = null }) {
  if (!empleadoId && !objetivoId) return;
  const abiertas = db.solicitudes
    .filter((s) => s.estado === 'abierta' && (!empleadoId || s.empleado_id === empleadoId))
    .sort(porAntiguedad);
  for (const s of abiertas) {
    const paso = db.solicitud_pasos
      .filter((p) => p.solicitud_id === s.id && p.estado === 'pendiente' && p.clave === clave
        && (p.objetivo_id == null || p.objetivo_id === objetivoId))
      .sort((a, b) => a.orden - b.orden)[0];
    if (!paso) continue;
    Object.assign(paso, { estado: 'hecho', referencia_id: referenciaId, automatico: true, hecho_por: actor.id, hecho_at: ahora() });
    evaluarCierre(db, s.id);
    return;
  }
}

// ── Triggers sobre escrituras directas (query builder) ───────────────────────
export function alInsertarFilaSolicitudes(db, tabla, fila) {
  if (tabla === 'asignaciones_cuenta') autocompletarPaso(db, { empleadoId: fila.empleado_id, clave: 'crear_cuenta', referenciaId: fila.id });
  if (tabla === 'asignaciones_licencia') autocompletarPaso(db, { empleadoId: fila.empleado_id, clave: 'asignar_licencia', referenciaId: fila.id });
  if (tabla === 'asignaciones_equipo' && fila.empleado_id) autocompletarPaso(db, { empleadoId: fila.empleado_id, clave: 'asignar_equipo', referenciaId: fila.id });
}

export function alActualizarFilaSolicitudes(db, tabla, previa, actual) {
  if (tabla === 'cuentas' && previa.requiere_rotacion && !actual.requiere_rotacion) {
    autocompletarPaso(db, { clave: 'rotar_contrasenas', objetivoId: actual.id, referenciaId: actual.id });
  }
  if (tabla === 'asignaciones_equipo' && !previa.fecha_fin && actual.fecha_fin && actual.empleado_id) {
    autocompletarPaso(db, { empleadoId: actual.empleado_id, clave: 'devolver_equipo', objetivoId: actual.id, referenciaId: actual.id });
  }
  if (tabla === 'entregas' && !previa.viewed_at && actual.viewed_at && actual.empleado_id) {
    autocompletarPaso(db, { empleadoId: actual.empleado_id, clave: 'entregar_credenciales', referenciaId: actual.id });
  }
}

// ── Baja: la solicitud con los pasos reales (solicitud_baja_crear) ───────────
export function crearSolicitudBaja(db, emp, { motivo = null, cuentasRotar = [], asignaciones = [], nCuentas = 0, nLicencias = 0, personales = 0 } = {}) {
  for (const s of db.solicitudes.filter((x) => x.empleado_id === emp.id && x.estado === 'abierta')) {
    Object.assign(s, {
      estado: 'cancelada', cancelada_at: ahora(), cancelada_por: actor.id,
      motivo_cancelacion: 'Cancelada por la baja del empleado.', updated_at: ahora(),
    });
  }
  const solicitud = {
    id: idNuevo('sol'), codigo: siguienteCodigo(db), tipo_id: 'baja_empleado', empleado_id: emp.id,
    estado: 'abierta', origen: 'sistema', nota: limpio(motivo), datos: {}, ticket_id: null,
    creada_por: actor.id, completada_at: null, cancelada_at: null, cancelada_por: null, motivo_cancelacion: null,
    created_at: ahora(), updated_at: ahora(),
  };
  db.solicitudes.push(solicitud);
  const nuevo = (clave, extra = {}) => {
    const p = pasoDePlantilla(plantillaPaso('baja_empleado', clave), solicitud.id, idNuevo('sp'), extra);
    db.solicitud_pasos.push(p);
    return p;
  };
  nuevo('cerrar_accesos', {
    estado: 'hecho', automatico: true, hecho_por: actor.id, hecho_at: ahora(),
    nota: `${nCuentas} asignaciones de cuenta y ${nLicencias} de licencia cerradas.`,
  });
  for (const c of cuentasRotar) {
    const pl = db.plataformas.find((x) => x.id === c.plataforma_id);
    nuevo('rotar_contrasenas', { label: `Rotar la contraseña de ${c.usuario}${pl ? ` · ${pl.nombre}` : ''}`, objetivo_id: c.id });
  }
  for (const a of asignaciones) {
    const q = db.equipos.find((x) => x.id === a.equipo_id);
    const desc = [q?.marca, q?.modelo].filter(Boolean).join(' ');
    nuevo('devolver_equipo', { label: `Recuperar el equipo ${q?.codigo ?? ''}${desc ? ` · ${desc}` : ''}`, objetivo_id: a.id });
  }
  if (personales > 0) {
    nuevo('cerrar_cuentas_plataforma', {
      nota: `${personales} ${personales === 1 ? 'cuenta personal dada de baja en el sistema.' : 'cuentas personales dadas de baja en el sistema.'}`,
    });
  }
  evaluarCierre(db, solicitud.id);
  return solicitud;
}

// ── crear_solicitud ──────────────────────────────────────────────────────────
function crearPersona(db, p) {
  const nombres = limpio(p.nombres);
  const apellidos = limpio(p.apellidos);
  const dni = String(p.dni ?? '').replace(/\D/g, '');
  if (!nombres || !apellidos) rechazar('P0001', 'Los nombres y los apellidos son obligatorios.');
  if (!/^[0-9]{8}$/.test(dni)) rechazar('P0001', 'El DNI debe tener 8 dígitos.');
  const dup = db.empleados.find((e) => e.dni === dni);
  if (dup) {
    rechazar('P0001', `Ya existe un empleado con ese DNI${dup.estado === 'Inactivo' ? ' (Inactivo): use «Reingresar» en su expediente' : ''}.`);
  }
  if (!limpio(p.empresa_id)) rechazar('P0001', 'La empresa es obligatoria.');
  if (!db.empresas.some((e) => e.id === p.empresa_id && !e.deleted_at)) rechazar('P0001', 'La empresa indicada no existe.');
  if (limpio(p.area_obra_id) && !db.areas_obras.some((e) => e.id === p.area_obra_id && !e.deleted_at)) rechazar('P0001', 'El área u obra indicada no existe.');
  if (limpio(p.ubicacion_id) && !db.ubicaciones.some((e) => e.id === p.ubicacion_id && !e.deleted_at)) rechazar('P0001', 'La ubicación indicada no existe.');
  let fecha = hoyISO();
  if (limpio(p.fecha_alta)) {
    if (Number.isNaN(Date.parse(p.fecha_alta))) rechazar('P0001', 'La fecha de ingreso no es válida.');
    fecha = String(p.fecha_alta).slice(0, 10);
  }
  const t = ahora();
  const emp = {
    id: idNuevo('e'), nombres, apellidos, dni, telefono: limpio(p.telefono), whatsapp: limpio(p.whatsapp),
    correo_personal: limpio(p.correo_personal)?.toLowerCase() ?? null, cargo: limpio(p.cargo),
    empresa_id: p.empresa_id, area_obra_id: limpio(p.area_obra_id), ubicacion_id: limpio(p.ubicacion_id),
    estado: 'Activo', fecha_alta: fecha, notas: limpio(p.notas), deleted_at: null, created_at: t, updated_at: t,
  };
  db.empleados.push(emp);
  db.empleado_eventos.push({
    id: idNuevo('eev'), empleado_id: emp.id, evento: 'creado', campo: 'estado', valor_anterior: null, valor_nuevo: 'Activo',
    user_id: actor.id, user_email: null, rol_actor: actor.esJefe ? 'jefe' : 'tecnico', detalle: 'Alta en el sistema', created_at: t,
  });
  return emp;
}

export function crearSolicitudNucleo(db, a = {}) {
  const tipo = TIPOS.find((t) => t.id === a.p_tipo && t.activo);
  if (!tipo) rechazar('P0001', 'El tipo de solicitud no existe o no está disponible.');
  if (tipo.id === 'baja_empleado') {
    rechazar('P0001', 'La baja se registra con «Dar de baja» en el expediente del empleado: ella crea la solicitud con sus pasos.');
  }
  const origen = limpio(a.p_origen) || 'otro';
  if (!ORIGENES.includes(origen)) rechazar('P0001', 'El origen del pedido no es válido.');
  const nota = limpio(a.p_nota);
  if (nota && nota.length > 1000) rechazar('P0001', 'La nota no puede superar los 1000 caracteres.');
  const datos = a.p_datos ?? {};
  if (typeof datos !== 'object' || Array.isArray(datos)) rechazar('P0001', 'p_datos debe ser un objeto JSON.');
  if (JSON.stringify(datos).length > 4000) rechazar('P0001', 'Los datos del pedido son demasiado extensos (máximo 4000 caracteres).');

  let empleadoId = a.p_empleado_id || null;
  if (empleadoId && a.p_empleado) rechazar('P0001', 'Indique a la persona existente o los datos de la persona nueva, no ambos.');
  let emp;
  if (!empleadoId) {
    if (tipo.id !== 'alta_empleado') rechazar('P0001', 'Elija al empleado de la solicitud.');
    if (!a.p_empleado || typeof a.p_empleado !== 'object') rechazar('P0001', 'Indique los datos de la persona que ingresa.');
    emp = crearPersona(db, a.p_empleado);
    empleadoId = emp.id;
  } else {
    emp = db.empleados.find((e) => e.id === empleadoId && !e.deleted_at);
    if (!emp) rechazar('P0002', 'El empleado no existe.');
    if (tipo.id !== 'devolucion_equipo' && emp.estado !== 'Activo') {
      rechazar('P0001', `El empleado no está activo (estado: ${emp.estado}). No se le puede abrir una solicitud de este tipo.`);
    }
  }

  if (UNICAS.includes(tipo.id)) {
    const existente = db.solicitudes.find((s) => s.empleado_id === empleadoId && s.tipo_id === tipo.id && s.estado === 'abierta');
    if (existente) rechazar('P0001', `Ya hay una solicitud de ${tipo.nombre.toLowerCase()} abierta para esta persona (${existente.codigo}).`);
  }
  if (a.p_ticket_id) {
    if (!db.tickets.some((t) => t.id === a.p_ticket_id)) rechazar('P0002', 'El ticket no existe.');
    const otra = db.solicitudes.find((s) => s.ticket_id === a.p_ticket_id && s.estado !== 'cancelada');
    if (otra) rechazar('P0001', `El ticket ya tiene una solicitud vinculada (${otra.codigo}).`);
  }

  const solicitud = {
    id: idNuevo('sol'), codigo: siguienteCodigo(db), tipo_id: tipo.id, empleado_id: empleadoId,
    estado: 'abierta', origen, nota, datos, ticket_id: a.p_ticket_id || null,
    creada_por: actor.id, completada_at: null, cancelada_at: null, cancelada_por: null, motivo_cancelacion: null,
    created_at: ahora(), updated_at: ahora(),
  };
  db.solicitudes.push(solicitud);
  for (const pl of plantillaDe(tipo.id)) {
    const registrar = tipo.id === 'alta_empleado' && pl.clave === 'registrar_empleado';
    db.solicitud_pasos.push(pasoDePlantilla(pl, solicitud.id, idNuevo('sp'), registrar
      ? { estado: 'hecho', referencia_id: empleadoId, automatico: true, hecho_por: actor.id, hecho_at: ahora() }
      : {}));
  }
  evaluarCierre(db, solicitud.id);
  return solicitud;
}

// ── completar / omitir / cancelar ────────────────────────────────────────────
function pasoYSolicitud(db, pasoId) {
  const paso = db.solicitud_pasos.find((p) => p.id === pasoId);
  if (!paso) rechazar('P0002', 'El paso no existe.');
  const sol = db.solicitudes.find((s) => s.id === paso.solicitud_id);
  if (sol.estado !== 'abierta') rechazar('P0001', `La solicitud ${sol.codigo} ya no está abierta.`);
  if (paso.estado !== 'pendiente') rechazar('P0001', 'El paso ya fue resuelto.');
  return { paso, sol };
}

function referenciaValida(db, paso, sol, referenciaId) {
  switch (paso.referencia_tipo) {
    case 'empleado': return referenciaId === sol.empleado_id;
    case 'cuenta': return db.asignaciones_cuenta.some((x) => x.id === referenciaId && x.empleado_id === sol.empleado_id);
    case 'equipo': return db.asignaciones_equipo.some((x) => x.id === referenciaId && x.empleado_id === sol.empleado_id);
    case 'licencia': return db.asignaciones_licencia.some((x) => x.id === referenciaId && x.empleado_id === sol.empleado_id);
    case 'entrega': return db.entregas.some((x) => x.id === referenciaId && x.empleado_id === sol.empleado_id);
    default: return rechazar('P0001', 'Este paso no admite una referencia.');
  }
}

function completarPaso(db, a = {}) {
  const { paso, sol } = pasoYSolicitud(db, a.p_paso_id);
  const nota = limpio(a.p_nota);
  if (nota && nota.length > 500) rechazar('P0001', 'La nota no puede superar los 500 caracteres.');
  if (a.p_referencia_id && !referenciaValida(db, paso, sol, a.p_referencia_id)) {
    rechazar('P0001', 'La referencia indicada no pertenece al empleado de la solicitud.');
  }
  Object.assign(paso, {
    estado: 'hecho', referencia_id: a.p_referencia_id || null, nota, automatico: false, hecho_por: actor.id, hecho_at: ahora(),
  });
  evaluarCierre(db, sol.id);
  return paso;
}

function omitirPaso(db, a = {}) {
  const motivo = limpio(a.p_motivo);
  if (!motivo) rechazar('P0001', 'El motivo para omitir el paso es obligatorio.');
  if (motivo.length > 500) rechazar('P0001', 'El motivo no puede superar los 500 caracteres.');
  const { paso, sol } = pasoYSolicitud(db, a.p_paso_id);
  if (paso.obligatorio && !actor.esJefe) rechazar('P0001', 'El paso es obligatorio: solo un jefe puede omitirlo.');
  Object.assign(paso, { estado: 'omitido', motivo_omision: motivo, automatico: false, hecho_por: actor.id, hecho_at: ahora() });
  evaluarCierre(db, sol.id);
  return paso;
}

function cancelarSolicitud(db, a = {}) {
  const motivo = limpio(a.p_motivo);
  if (!motivo) rechazar('P0001', 'El motivo de la cancelación es obligatorio.');
  if (motivo.length > 500) rechazar('P0001', 'El motivo no puede superar los 500 caracteres.');
  const sol = db.solicitudes.find((s) => s.id === a.p_solicitud_id);
  if (!sol) rechazar('P0002', 'La solicitud no existe.');
  if (sol.estado !== 'abierta') rechazar('P0001', `La solicitud ${sol.codigo} ya está ${sol.estado}.`);
  Object.assign(sol, {
    estado: 'cancelada', cancelada_at: ahora(), cancelada_por: actor.id, motivo_cancelacion: motivo, updated_at: ahora(),
  });
  return sol;
}

function convertirTicket(db, a = {}) {
  const t = db.tickets.find((x) => x.id === a.p_ticket_id);
  if (!t) rechazar('P0002', 'El ticket no existe.');
  if (!t.empleado_id) rechazar('P0001', 'El ticket no tiene un empleado vinculado. Vincúlelo antes de convertirlo en solicitud.');
  const sol = crearSolicitudNucleo(db, {
    p_tipo: a.p_tipo, p_empleado_id: t.empleado_id, p_empleado: null,
    p_datos: { ticket_codigo: t.codigo }, p_nota: a.p_nota, p_origen: 'ticket', p_ticket_id: t.id,
  });
  t.tipo = 'solicitud';
  return sol;
}

export const RPC_SOLICITUDES = {
  crear_solicitud: crearSolicitudNucleo,
  completar_paso_solicitud: completarPaso,
  omitir_paso_solicitud: omitirPaso,
  cancelar_solicitud: cancelarSolicitud,
  convertir_ticket_en_solicitud: convertirTicket,
};
