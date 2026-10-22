// RPC simulada de la maqueta para el escalamiento de tickets por niveles
// (migración 121): escalar_ticket, devolver_nivel_ticket y
// registrar_avance_escalamiento. Misma regla y mismos rechazos que el SQL (42501
// sin el módulo tickets; P0001 con el mensaje de la regla; P0002 ticket
// inexistente), con el MISMO texto en español:
// tests/maqueta-escalamiento-tickets.test.js lo compara con la migración.
// Como en el servidor, cada paso deja su tramo, su evento y el comentario
// público; la reasignación deja `reasignado` con origen y destino (lo hace el
// trigger evento_ticket_cambios). Todo es inventado: nada sale de esta sesión.

// Quién actúa: el JEFE ficticio, o Diego Huamán (ASISTENTE, con el módulo
// tickets) con ?maqueta=asistente. datos.js lo fija al importar.
let actor = { id: 'u-jefe', esJefe: true, moduloTickets: true, email: 'jefe@materen.pe' };
export function definirActorEscalamiento(nuevo) {
  actor = { ...actor, ...nuevo };
}

export const MENSAJES_ESCALAMIENTO = {
  sinPermiso: 'No autorizado',
  sinTicket: 'El ticket no existe.',
  noEnAtencion: 'Solo se escala un ticket en atención (en progreso o reabierto).',
  sinNivel: 'Indique el nivel al que escala: Nivel 2 o Nivel 3.',
  mismoNivel: (n) => `El ticket ya está en ${n} o en un nivel superior: para bajarlo, use «Devolver nivel».`,
  sinMotivo: 'Indique qué pasó y qué se intentó antes de escalar.',
  motivoLargo: 'El motivo no puede superar los 1000 caracteres.',
  sinResponsableN2: 'Indique quién atiende el ticket en el Nivel 2.',
  responsableInvalido: 'El responsable debe ser un integrante activo del staff con el módulo Tickets.',
  sinEspecialistaTipo: 'Indique el tipo de especialista del Nivel 3.',
  sinEspecialista: 'Indique el especialista o proveedor del Nivel 3.',
  especialistaLargo: 'El nombre del especialista no puede superar los 120 caracteres.',
  referenciaLarga: 'La referencia no puede superar los 80 caracteres.',
  fechaInvalida: 'La fecha estimada no es válida.',
  fechaPasada: 'La fecha estimada no puede ser anterior a hoy.',
  devolverNoEnAtencion: 'Solo se devuelve de nivel un ticket en atención (en progreso o reabierto).',
  devolverSinNivel: 'Indique el nivel al que devuelve el ticket.',
  devolverNoInferior: (n) => `Solo se devuelve a un nivel inferior al actual (${n}).`,
  devolverSinMotivo: 'Indique por qué devuelve el ticket de nivel.',
  avanceTerminado: 'El ticket está terminado: no admite avances.',
  avanceSinTramo: 'El ticket no tiene un escalamiento abierto.',
  avanceSinNota: 'Indique el avance.',
  avanceLargo: 'El avance no puede superar los 1000 caracteres.',
};
const M = MENSAJES_ESCALAMIENTO;

// Duplica nivel_atencion_publico() del SQL (y NIVEL_PUBLICO del dominio).
const NIVEL_PUBLICO = { N1: 'Nivel 1 – Soporte', N2: 'Nivel 2 – Especializado', N3: 'Nivel 3 – Especialista' };
const RANGO = { N1: 1, N2: 2, N3: 3 };
const TIPOS_ESPECIALISTA = ['experto_interno', 'desarrollo', 'proveedor', 'garantia', 'otro'];

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

// texto_multilinea (107) y texto_limpio (101).
const multilinea = (v) => String(v ?? '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '') || null;
const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').trim() || null;

let secuencia = 0;
const nuevoId = (p) => `maq-${p}-${Date.now().toString(36)}-${(secuencia += 1)}`;

function hoyLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// escalamiento_fecha(): null si falta; P0001 si no es válida o es anterior a hoy.
function fechaDe(datos) {
  const txt = multilinea(datos.fecha_estimada);
  if (!txt) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(txt) || Number.isNaN(Date.parse(txt))) rechazar('P0001', M.fechaInvalida);
  if (txt < hoyLocal()) rechazar('P0001', M.fechaPasada);
  return txt;
}

// escalamiento_responsable(): staff activo con el módulo tickets (el JEFE, exento).
function responsableDe(db, datos) {
  const id = multilinea(datos.responsable_id);
  if (!id) return null;
  const s = (db.staff || []).find((x) => x.user_id === id && x.activo);
  const conModulo = s && (s.rol === 'JEFE'
    || (db.staff_modulos_permisos || []).some((m) => m.staff_user_id === id && m.modulo === 'tickets'));
  if (!conModulo) rechazar('P0001', M.responsableInvalido);
  return id;
}

function guard(db, args) {
  if (!actor.esJefe && !actor.moduloTickets) rechazar('42501', M.sinPermiso);
  const t = (db.tickets || []).find((x) => x.id === args?.p_ticket_id);
  if (!t) rechazar('P0002', M.sinTicket);
  return { t, datos: args?.p_datos || {}, ahora: new Date().toISOString() };
}

const fechaCorta = (f) => f.split('-').reverse().join('/');
const nombreStaff = (db, id) => (db.staff || []).find((s) => s.user_id === id)?.nombre || 'Sin asignar';

function asegurarTablas(db) {
  db.ticket_escalamientos ||= [];
  db.ticket_escalamiento_avances ||= [];
  db.ticket_comentarios ||= [];
  db.ticket_eventos ||= [];
  db.notificaciones ||= [];
}

function evento(db, t, nombre, detalle, ahora) {
  db.ticket_eventos.push({ id: nuevoId('tev'), ticket_id: t.id, evento: nombre, detalle, user_id: actor.id, user_email: actor.email, created_at: ahora });
}

function comentarioPublico(db, t, mensaje, ahora) {
  db.ticket_comentarios.push({ id: nuevoId('tcm'), ticket_id: t.id, mensaje, interno: false, autor_id: actor.id, created_at: ahora });
}

// Cierra el tramo abierto, abre el nuevo y aplica nivel y responsable al
// ticket (con el `reasignado` que deja el trigger si el responsable cambia).
function abrirTramo(db, t, tramo, ahora) {
  for (const e of db.ticket_escalamientos) {
    if (e.ticket_id === t.id && !e.fin_at) Object.assign(e, { fin_at: ahora, fin_motivo: tramo.direccion === 'devuelto' ? 'devuelto' : 'escalado' });
  }
  const fila = {
    id: nuevoId('esc'), ticket_id: t.id, especialista_tipo: null, especialista_nombre: null, referencia_externa: null,
    fecha_estimada: null, inicio_at: ahora, fin_at: null, fin_motivo: null, created_by: actor.id, ...tramo,
  };
  db.ticket_escalamientos.push(fila);
  if (tramo.responsable_id && tramo.responsable_id !== t.asignado_a) {
    evento(db, t, 'reasignado', `De "${nombreStaff(db, t.asignado_a)}" a "${nombreStaff(db, tramo.responsable_id)}"`, ahora);
    t.asignado_a = tramo.responsable_id;
  }
  t.nivel_atencion = tramo.nivel_hacia;
  t.updated_at = ahora;
  return fila;
}

export const RPC_ESCALAMIENTO = {
  escalar_ticket: (db, args) => {
    asegurarTablas(db);
    const { t, datos, ahora } = guard(db, args);
    if (!['en_progreso', 'reabierto'].includes(t.estado)) rechazar('P0001', M.noEnAtencion);
    const desde = t.nivel_atencion || 'N1';
    const nivel = multilinea(datos.nivel)?.toUpperCase();
    if (!['N2', 'N3'].includes(nivel)) rechazar('P0001', M.sinNivel);
    if (RANGO[nivel] <= RANGO[desde]) rechazar('P0001', M.mismoNivel(desde));
    const motivo = multilinea(datos.motivo);
    if (!motivo) rechazar('P0001', M.sinMotivo);
    if (motivo.length > 1000) rechazar('P0001', M.motivoLargo);
    let responsable = responsableDe(db, datos);
    const fecha = fechaDe(datos);
    let espTipo = null;
    let espNombre = null;
    if (nivel === 'N2') {
      if (!responsable) rechazar('P0001', M.sinResponsableN2);
    } else {
      espTipo = multilinea(datos.especialista_tipo);
      if (!TIPOS_ESPECIALISTA.includes(espTipo)) rechazar('P0001', M.sinEspecialistaTipo);
      espNombre = limpio(datos.especialista_nombre);
      if (!espNombre) rechazar('P0001', M.sinEspecialista);
      if (espNombre.length > 120) rechazar('P0001', M.especialistaLargo);
      responsable ||= t.asignado_a;
    }
    const referencia = limpio(datos.referencia);
    if (referencia && referencia.length > 80) rechazar('P0001', M.referenciaLarga);

    let mensaje = `Su ticket fue derivado al ${NIVEL_PUBLICO[nivel]}.`;
    if (fecha) mensaje += ` Fecha estimada de solución: ${fechaCorta(fecha)}.`;
    comentarioPublico(db, t, mensaje, ahora);
    const tramo = abrirTramo(db, t, {
      nivel_desde: desde, nivel_hacia: nivel, direccion: 'escalado', motivo, responsable_id: responsable,
      especialista_tipo: espTipo, especialista_nombre: espNombre, referencia_externa: referencia, fecha_estimada: fecha,
    }, ahora);
    evento(db, t, 'escalado', `De "${desde}" a "${nivel}". Motivo: ${motivo}${nivel === 'N3' ? ` Especialista: ${espNombre}.` : ''}`, ahora);
    if (nivel === 'N3') {
      for (const j of (db.staff || []).filter((s) => s.rol === 'JEFE' && s.activo && s.user_id !== actor.id)) {
        db.notificaciones.push({
          id: nuevoId('ntf'), tipo: 'ticket_escalado', entidad_tipo: 'ticket', entidad_id: t.id,
          titulo: `Ticket ${t.codigo} escalado a Nivel 3 — ${t.titulo.slice(0, 120)}`, url_destino: `/tickets/${t.id}`,
          destinatario_id: j.user_id, creado_en: ahora,
        });
      }
    }
    return { ticket_id: t.id, codigo: t.codigo, nivel, asignado_a: t.asignado_a, escalamiento_id: tramo.id };
  },

  devolver_nivel_ticket: (db, args) => {
    asegurarTablas(db);
    const { t, datos, ahora } = guard(db, args);
    if (!['en_progreso', 'reabierto'].includes(t.estado)) rechazar('P0001', M.devolverNoEnAtencion);
    const desde = t.nivel_atencion || 'N1';
    const nivel = multilinea(datos.nivel)?.toUpperCase();
    if (!RANGO[nivel]) rechazar('P0001', M.devolverSinNivel);
    if (RANGO[nivel] >= RANGO[desde]) rechazar('P0001', M.devolverNoInferior(desde));
    const motivo = multilinea(datos.motivo);
    if (!motivo) rechazar('P0001', M.devolverSinMotivo);
    if (motivo.length > 1000) rechazar('P0001', M.motivoLargo);
    const responsable = responsableDe(db, datos) || t.asignado_a;

    comentarioPublico(db, t, `Su ticket continúa en atención en el ${NIVEL_PUBLICO[nivel]}.`, ahora);
    const tramo = abrirTramo(db, t, { nivel_desde: desde, nivel_hacia: nivel, direccion: 'devuelto', motivo, responsable_id: responsable }, ahora);
    evento(db, t, 'nivel_devuelto', `De "${desde}" a "${nivel}". Motivo: ${motivo}`, ahora);
    return { ticket_id: t.id, codigo: t.codigo, nivel, asignado_a: t.asignado_a, escalamiento_id: tramo.id };
  },

  registrar_avance_escalamiento: (db, args) => {
    asegurarTablas(db);
    const { t, datos, ahora } = guard(db, args);
    if (['cerrado', 'rechazado'].includes(t.estado)) rechazar('P0001', M.avanceTerminado);
    const tramo = db.ticket_escalamientos.find((e) => e.ticket_id === t.id && !e.fin_at);
    if (!tramo) rechazar('P0001', M.avanceSinTramo);
    const nota = multilinea(datos.nota);
    if (!nota) rechazar('P0001', M.avanceSinNota);
    if (nota.length > 1000) rechazar('P0001', M.avanceLargo);
    const referencia = limpio(datos.referencia);
    if (referencia && referencia.length > 80) rechazar('P0001', M.referenciaLarga);
    const fecha = fechaDe(datos);
    const visible = datos.visible_usuario === true;

    const avance = {
      id: nuevoId('ava'), escalamiento_id: tramo.id, ticket_id: t.id, nota, fecha_estimada_nueva: fecha,
      visible_usuario: visible, autor_id: actor.id, created_at: ahora,
    };
    db.ticket_escalamiento_avances.push(avance);
    const fechaAnterior = tramo.fecha_estimada;
    if (fecha) tramo.fecha_estimada = fecha;
    if (referencia) tramo.referencia_externa = referencia;
    if (visible) comentarioPublico(db, t, fecha ? `${nota}\nNueva fecha estimada de solución: ${fechaCorta(fecha)}.` : nota, ahora);
    evento(db, t, 'escalamiento_actualizado', fecha && fecha !== fechaAnterior ? `${nota} Fecha estimada: ${fechaCorta(fecha)}.` : nota, ahora);
    return { ticket_id: t.id, escalamiento_id: tramo.id, avance_id: avance.id, fecha_estimada: tramo.fecha_estimada, visible_usuario: visible };
  },
};
