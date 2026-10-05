// RPC simuladas de la maqueta para los Cambios (migración 107). Cada función recibe
// la base en memoria y los argumentos NOMBRADOS (`p_...`), muta la base y devuelve la
// fila, igual que la RPC real. Los rechazos de negocio se lanzan con el mismo SQLSTATE
// y el MISMO texto en español que `crear_cambio_nucleo` y compañía (P0001 regla de
// negocio, P0002 no existe, 42501 sin permiso), así la UI puede probarse con sus
// mensajes de error reales. tests/maqueta-cambios.test.js compara la whitelist y los
// textos con el SQL de la migración.
//
// También deja al día las vistas derivadas (`v_kpi_cambios` y
// `v_cambios_aprobacion_vencida`) después de cada cambio, para que el aviso de una
// emergencia sin aprobar desaparezca al aprobarla.
//
// Todo es inventado: nada sale de esta sesión (recargar devuelve los datos iniciales).
import { TRANSICIONES_CAMBIO } from '../core/dominio-cambios.js';

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

let secuencia = 0;
const idNuevo = (prefijo) => `maq-${prefijo}-${Date.now().toString(36)}-${(secuencia += 1)}`;
const ahora = () => new Date().toISOString();
const HORA_MS = 3600000;

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE) con ?maqueta=asistente.
// datos.js lo fija al importar (este archivo no puede importar datos.js).
let actor = { id: 'u-jefe', esJefe: true, email: 'jefe@materen.pe' };
export function definirActorCambios(nuevo) {
  actor = { ...actor, ...nuevo };
}

const ESTADOS = ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado', 'cerrado', 'rechazado', 'cancelado', 'revertido'];
const TIPOS = ['estandar', 'normal', 'emergencia'];
const RIESGOS = ['bajo', 'medio', 'alto'];

// texto_limpio: recorta y colapsa espacios (títulos). texto_multilinea: solo recorta (conserva saltos).
const limpio = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};
const multilinea = (v) => {
  const t = String(v ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  return t || null;
};

function siguienteCodigo(db) {
  const max = db.cambios.reduce((m, c) => Math.max(m, Number(String(c.codigo).slice(4)) || 0), 0);
  return `CHG-${String(max + 1).padStart(4, '0')}`;
}

const rolActor = () => (actor.esJefe ? 'jefe' : 'tecnico');

function evento(db, cambio, ev, anterior, nuevo, detalle) {
  db.cambio_eventos.push({
    id: idNuevo('cev'), cambio_id: cambio.id, orden: db.cambio_eventos.length + 1, evento: ev,
    estado_anterior: anterior, estado_nuevo: nuevo, user_id: actor.id, user_email: actor.email,
    rol_actor: rolActor(), detalle: detalle || null, created_at: ahora(),
  });
}

// ── Vistas derivadas ─────────────────────────────────────────────────────────
export function calcularVistasCambios(cambios, servicios, desde = Date.now()) {
  const hace90 = desde - 90 * 24 * HORA_MS;
  const vencida = (c) => c.tipo === 'emergencia' && !c.aprobado_por && ['en_ejecucion', 'implementado'].includes(c.estado)
    && c.aprobacion_pendiente_hasta && new Date(c.aprobacion_pendiente_hasta).getTime() < desde;
  const base = TIPOS.map((tipo) => {
    const propios = cambios.filter((c) => c.tipo === tipo && !['borrador', 'cancelado'].includes(c.estado) && new Date(c.created_at).getTime() >= hace90);
    return {
      tipo,
      total: propios.length,
      ejecutados: propios.filter((c) => ['en_ejecucion', 'implementado', 'cerrado', 'revertido'].includes(c.estado)).length,
      implementados: propios.filter((c) => ['implementado', 'cerrado'].includes(c.estado)).length,
      revertidos: propios.filter((c) => c.estado === 'revertido').length,
      sin_aprobar: propios.filter(vencida).length,
    };
  });
  const suma = base.reduce((s, b) => s + b.total, 0);
  const redondo = (n) => Math.round(n * 10) / 10;
  return {
    v_kpi_cambios: base.map((b) => ({
      tipo: b.tipo, total_90d: b.total, ejecutados_90d: b.ejecutados, implementados_90d: b.implementados,
      revertidos_90d: b.revertidos, emergencias_sin_aprobar_vencidas: b.sin_aprobar,
      pct_del_total_90d: suma > 0 ? redondo((100 * b.total) / suma) : 0,
      pct_revertidos_90d: b.ejecutados > 0 ? redondo((100 * b.revertidos) / b.ejecutados) : 0,
    })),
    v_cambios_aprobacion_vencida: cambios.filter(vencida).map((c) => ({
      cambio_id: c.id, codigo: c.codigo, titulo: c.titulo, servicio_id: c.servicio_id,
      servicio: servicios.find((s) => s.id === c.servicio_id)?.nombre ?? null, estado: c.estado,
      inicio_real_at: c.inicio_real_at, aprobacion_pendiente_hasta: c.aprobacion_pendiente_hasta,
      vencida_hace: `${Math.round((desde - new Date(c.aprobacion_pendiente_hasta).getTime()) / HORA_MS)} hours`,
    })),
  };
}

function refrescarVistas(db) {
  Object.assign(db, calcularVistasCambios(db.cambios, db.servicios));
}

// ── Validación (cambio_validar_campos) ───────────────────────────────────────
function validar(db, { titulo, tipo, riesgo, servicioId, descripcion, plan, inicio, fin }) {
  if (!titulo || titulo.length < 3) rechazar('P0001', 'El título es obligatorio (mínimo 3 caracteres).');
  if (titulo.length > 120) rechazar('P0001', 'El título no puede superar los 120 caracteres.');
  if (!TIPOS.includes(tipo)) rechazar('P0001', 'El tipo de cambio no es válido (estándar, normal o emergencia).');
  if (!RIESGOS.includes(riesgo)) rechazar('P0001', 'El riesgo no es válido (bajo, medio o alto).');
  if (!servicioId || !db.servicios.some((s) => s.id === servicioId && !s.deleted_at)) {
    rechazar('P0001', 'El servicio indicado no existe o fue dado de baja.');
  }
  if (!descripcion) rechazar('P0001', 'La descripción del cambio es obligatoria.');
  if (descripcion.length > 4000) rechazar('P0001', 'La descripción no puede superar los 4000 caracteres.');
  if (plan && plan.length > 4000) rechazar('P0001', 'El plan de retroceso no puede superar los 4000 caracteres.');
  if (Boolean(inicio) !== Boolean(fin)) rechazar('P0001', 'Indique el inicio y el fin de la ventana, o ninguno de los dos.');
  if (inicio && new Date(fin) <= new Date(inicio)) rechazar('P0001', 'La ventana de ejecución termina antes de empezar.');
}

const camposDe = (a) => ({
  titulo: limpio(a.p_titulo),
  tipo: a.p_tipo,
  riesgo: a.p_riesgo,
  servicioId: a.p_servicio_id,
  descripcion: multilinea(a.p_descripcion),
  plan: multilinea(a.p_plan_retroceso),
  inicio: a.p_ventana_inicio || null,
  fin: a.p_ventana_fin || null,
});

function buscar(db, id) {
  const c = db.cambios.find((x) => x.id === id);
  if (!c) rechazar('P0002', 'El cambio no existe.');
  return c;
}

// ── transicionar_cambio_nucleo ───────────────────────────────────────────────
export function transicionar(db, id, destino, notaCruda, { aprobador = actor.esJefe } = {}) {
  const c = buscar(db, id);
  const nota = multilinea(notaCruda);
  if (!ESTADOS.includes(destino)) rechazar('P0001', 'El estado de destino no es válido.');
  const t = TRANSICIONES_CAMBIO.find((x) => x.origen === c.estado && x.destino === destino);
  if (!t || !t.tipos.includes(c.tipo)) {
    rechazar('P0001', `El cambio ${c.codigo} (${c.tipo}) no puede pasar de "${c.estado}" a "${destino}".`);
  }
  if (t.soloJefe && !aprobador) rechazar('P0001', 'Solo un jefe puede aprobar o rechazar un cambio.');
  if (nota && nota.length > 1000) rechazar('P0001', 'La nota no puede superar los 1000 caracteres.');
  if (!nota && (['rechazado', 'revertido'].includes(destino) || (destino === 'cancelado' && c.estado !== 'borrador'))) {
    const verbo = { rechazado: 'rechazar', revertido: 'revertir', cancelado: 'cancelar' }[destino];
    rechazar('P0001', `El motivo es obligatorio para ${verbo} un cambio.`);
  }
  if (c.estado === 'borrador' && destino !== 'cancelado') {
    if (c.tipo !== 'estandar' && !multilinea(c.plan_retroceso)) rechazar('P0001', `Un cambio ${c.tipo} necesita un plan de retroceso.`);
    if (c.tipo !== 'emergencia' && !c.ventana_inicio) rechazar('P0001', 'Indique la ventana de ejecución (inicio y fin) del cambio.');
  }
  if (destino === 'cerrado' && c.tipo === 'emergencia' && !c.aprobado_por) {
    rechazar('P0001', 'Un cambio de emergencia no se cierra sin la aprobación a posteriori de un jefe (plazo de 48 horas).');
  }

  const origen = c.estado;
  let hasta = c.aprobacion_pendiente_hasta;
  if (destino === 'en_ejecucion' && c.tipo === 'emergencia' && !c.aprobado_por) hasta = new Date(Date.now() + 48 * HORA_MS).toISOString();
  const t0 = ahora();
  Object.assign(c, {
    estado: destino,
    solicitado_at: destino === 'solicitado' ? t0 : c.solicitado_at,
    aprobado_por: destino === 'aprobado' && t.soloJefe ? actor.id : c.aprobado_por,
    aprobado_at: destino === 'aprobado' && t.soloJefe ? t0 : c.aprobado_at,
    aprobacion_pendiente_hasta: hasta,
    inicio_real_at: destino === 'en_ejecucion' ? t0 : c.inicio_real_at,
    fin_real_at: ['implementado', 'revertido'].includes(destino) ? t0 : c.fin_real_at,
    resultado: ['rechazado', 'cancelado', 'revertido', 'implementado', 'cerrado'].includes(destino) && nota ? nota : c.resultado,
    updated_at: t0,
  });

  const nombreEvento = {
    solicitado: 'solicitado', aprobado: 'aprobado', rechazado: 'rechazado', en_ejecucion: 'iniciado',
    implementado: 'implementado', cerrado: 'cerrado', revertido: 'revertido',
  }[destino] || 'cancelado';
  let detalle = nota;
  if (destino === 'aprobado' && !t.soloJefe) detalle = `Cambio estándar: preautorizado, sin aprobación de un jefe.${nota ? ` · ${nota}` : ''}`;
  else if (destino === 'en_ejecucion' && hasta) {
    detalle = `Emergencia sin aprobación previa: un jefe debe aprobarla antes del ${new Date(hasta).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}.${nota ? ` · ${nota}` : ''}`;
  }
  evento(db, c, nombreEvento, origen, destino, detalle);
  refrescarVistas(db);
  return c;
}

// ── RPC públicas ─────────────────────────────────────────────────────────────
function crearCambio(db, a = {}) {
  const f = camposDe(a);
  validar(db, f);
  const t0 = ahora();
  const cambio = {
    id: idNuevo('chg'), codigo: siguienteCodigo(db), titulo: f.titulo, tipo: f.tipo, riesgo: f.riesgo, servicio_id: f.servicioId,
    descripcion: f.descripcion, plan_retroceso: f.plan, ventana_inicio: f.inicio, ventana_fin: f.fin, estado: 'borrador',
    solicitado_por: actor.id, solicitado_at: null, aprobado_por: null, aprobado_at: null, aprobacion_pendiente_hasta: null,
    inicio_real_at: null, fin_real_at: null, resultado: null, created_at: t0, updated_at: t0,
  };
  const eventos0 = db.cambio_eventos.length;
  db.cambios.push(cambio);
  evento(db, cambio, 'creado', null, 'borrador', `Cambio ${cambio.tipo} · riesgo ${cambio.riesgo}`);
  if (a.p_enviar) {
    try {
      transicionar(db, cambio.id, cambio.tipo === 'estandar' ? 'aprobado' : 'solicitado', null);
    } catch (e) {
      // El servidor hace todo en una transacción: si enviar falla, el cambio no se crea.
      db.cambios.pop();
      db.cambio_eventos.splice(eventos0);
      throw e;
    }
  }
  refrescarVistas(db);
  return cambio;
}

function actualizarCambio(db, a = {}) {
  const c = buscar(db, a.p_cambio_id);
  if (c.estado !== 'borrador') rechazar('P0001', `El cambio ${c.codigo} ya salió de borrador: no se edita. Cancélelo y registre uno nuevo.`);
  const f = camposDe(a);
  validar(db, f);
  Object.assign(c, {
    titulo: f.titulo, tipo: f.tipo, riesgo: f.riesgo, servicio_id: f.servicioId, descripcion: f.descripcion,
    plan_retroceso: f.plan, ventana_inicio: f.inicio, ventana_fin: f.fin, updated_at: ahora(),
  });
  evento(db, c, 'editado', 'borrador', 'borrador', 'Se editó el borrador');
  return c;
}

function transicionarCambio(db, a = {}) {
  return transicionar(db, a.p_cambio_id, a.p_destino, a.p_nota);
}

function exigirJefe() {
  if (!actor.esJefe) rechazar('42501', 'No autorizado');
}

function aprobarCambio(db, a = {}) {
  exigirJefe();
  const nota = multilinea(a.p_nota);
  if (nota && nota.length > 1000) rechazar('P0001', 'La nota no puede superar los 1000 caracteres.');
  const c = buscar(db, a.p_cambio_id);
  if (c.tipo === 'emergencia' && ['en_ejecucion', 'implementado'].includes(c.estado) && !c.aprobado_por) {
    Object.assign(c, { aprobado_por: actor.id, aprobado_at: ahora(), aprobacion_pendiente_hasta: null, updated_at: ahora() });
    evento(db, c, 'aprobado', c.estado, c.estado, `Aprobación a posteriori del cambio de emergencia.${nota ? ` · ${nota}` : ''}`);
    refrescarVistas(db);
    return c;
  }
  if (c.estado !== 'solicitado') rechazar('P0001', `El cambio ${c.codigo} está "${c.estado}": no admite aprobación.`);
  return transicionar(db, c.id, 'aprobado', nota);
}

function rechazarCambio(db, a = {}) {
  exigirJefe();
  return transicionar(db, a.p_cambio_id, 'rechazado', a.p_motivo);
}

function vincularTicket(db, a = {}) {
  const c = buscar(db, a.p_cambio_id);
  const t = db.tickets.find((x) => x.id === a.p_ticket_id);
  if (!t) rechazar('P0002', 'El ticket no existe.');
  const previo = db.cambio_tickets.find((x) => x.cambio_id === c.id && x.ticket_id === t.id);
  if (previo) return previo;
  const fila = { cambio_id: c.id, ticket_id: t.id, vinculado_por: actor.id, created_at: ahora() };
  db.cambio_tickets.push(fila);
  evento(db, c, 'ticket_vinculado', c.estado, c.estado, `Ticket ${t.codigo}`);
  return fila;
}

function desvincularTicket(db, a = {}) {
  const c = buscar(db, a.p_cambio_id);
  const i = db.cambio_tickets.findIndex((x) => x.cambio_id === c.id && x.ticket_id === a.p_ticket_id);
  if (i < 0) return false;
  db.cambio_tickets.splice(i, 1);
  const t = db.tickets.find((x) => x.id === a.p_ticket_id);
  evento(db, c, 'ticket_desvinculado', c.estado, c.estado, `Ticket ${t?.codigo ?? '(eliminado)'}`);
  return true;
}

export const RPC_CAMBIOS = {
  crear_cambio: crearCambio,
  actualizar_cambio: actualizarCambio,
  transicionar_cambio: transicionarCambio,
  aprobar_cambio: aprobarCambio,
  rechazar_cambio: rechazarCambio,
  vincular_cambio_ticket: vincularTicket,
  desvincular_cambio_ticket: desvincularTicket,
};
