// Libro de movimientos del expediente del empleado (regla 19, "Versión
// Expediente"). Función pura: recibe lo que cada fuente leyó del servidor y
// devuelve las filas que `AppLibro` pinta, ya mezcladas y ordenadas (lo más
// reciente arriba). Cada fuente es opcional: el expediente solo pide las que el
// usuario puede ver (módulos `correos`, `licencias`, `equipos`, `tickets`), y
// una fuente ausente simplemente no aporta filas.
//
// Fuentes REALES, ninguna inventada en el cliente:
//   · eventos            empleado_eventos (hoja de vida de la migración 102)
//   · equipos            asignaciones del empleado + eventos_equipo de sus equipos
//   · actas              actas firmadas (migración 110)
//   · cuentas/licencias  asignaciones con fecha de inicio y de cierre
//   · entregas           enlaces de un solo uso (enviada / abierta / vencida)
//   · tickets            los últimos del empleado
//
// Cada fila: { id, fecha, orden, movimiento, detalle, por, ref, categoria }.
//   · `fecha` va tal cual la guardó la base (ISO o 'YYYY-MM-DD'): AppLibro la
//     formatea y no inventa una hora para las fechas sin hora.
//   · `por` es null cuando no hay actor ("no registrado (legado)" en AppLibro).
//   · `categoria` es el filtro del libro: accesos | equipos | licencias |
//     empleado | tickets. Los dos últimos solo se ven en "Todo".
import { badgeInfo } from '../../core/badges.js';

export const FILTROS_LIBRO = [
  { valor: '', label: 'Todo' },
  { valor: 'accesos', label: 'Accesos' },
  { valor: 'equipos', label: 'Equipos' },
  { valor: 'licencias', label: 'Licencias' },
];

const DIA_MS = 86400000;

// ── Utilidades ──────────────────────────────────────────────────────────────
// Un 'YYYY-MM-DD' se ordena a las 00:00 locales; un timestamp, tal cual.
function aMs(fecha) {
  if (!fecha) return 0;
  const texto = String(fecha);
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? Date.parse(`${texto}T00:00:00`) : Date.parse(texto);
  return Number.isFinite(ms) ? ms : 0;
}

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const unir = (...partes) => partes.filter(Boolean).join(' · ');
const inicial = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/**
 * Nombre legible del actor de un movimiento, o null si no se sabe quién fue
 * (eventos de antes de la auditoría: "no registrado (legado)").
 *  - rol 'sistema' → "Sistema"
 *  - el nombre del staff si se conoce su `user_id`
 *  - si no, la parte local del correo ("dhuaman@materen.pe" → "dhuaman")
 */
export function actorLegible({ userId = null, email = null, rol = null } = {}, nombresStaff = {}) {
  if (rol === 'sistema') return 'Sistema';
  if (userId && nombresStaff[userId]) return nombresStaff[userId];
  if (email) return String(email).split('@')[0];
  return null;
}

// ── empleado_eventos ────────────────────────────────────────────────────────
const MOVIMIENTO_EMPLEADO = {
  creado: 'Registrado',
  estado_cambiado: 'Estado cambiado',
  area_cambiada: 'Área/obra cambiada',
  ubicacion_cambiada: 'Ubicación cambiada',
  cargo_cambiado: 'Cargo cambiado',
  empresa_cambiada: 'Empresa cambiada',
  contacto_cambiado: 'Contacto actualizado',
  baja_ejecutada: 'Baja ejecutada',
  reingreso: 'Reingresado',
  suspendido: 'Suspendido',
  reactivado: 'Reactivado',
  eliminado: 'Eliminado',
  restaurado: 'Restaurado',
  accesos_revisados: 'Accesos revisados',
  anonimizado: 'Datos anonimizados',
};

const CAMPOS_CONTACTO = { telefono: 'Teléfono', whatsapp: 'WhatsApp', correo_personal: 'Correo personal' };

function transicion(ev) {
  if (ev.valor_anterior == null && ev.valor_nuevo == null) return '';
  return `${ev.valor_anterior || 'Sin registrar'} → ${ev.valor_nuevo || 'Sin registrar'}`;
}

function detalleEvento(ev) {
  switch (ev.evento) {
    case 'contacto_cambiado': {
      const campos = String(ev.campo || '').split(',').map((c) => CAMPOS_CONTACTO[c.trim()]).filter(Boolean);
      return campos.length ? `${campos.join(', ')}: valor actualizado` : 'Datos de contacto actualizados';
    }
    case 'creado':
    case 'accesos_revisados':
    case 'eliminado':
    case 'restaurado':
    case 'anonimizado':
      return ev.detalle || '';
    case 'estado_cambiado':
    case 'suspendido':
    case 'reactivado':
    case 'baja_ejecutada':
    case 'reingreso':
      return unir(transicion(ev), ev.detalle);
    default:
      // área, ubicación, cargo, empresa: "anterior → nuevo".
      return unir(transicion(ev), ev.detalle);
  }
}

function filasEventos(eventos, nombresStaff) {
  return eventos.map((ev) => ({
    id: `evento-${ev.id}`,
    fecha: ev.created_at,
    orden: aMs(ev.created_at),
    movimiento: MOVIMIENTO_EMPLEADO[ev.evento] || inicial(String(ev.evento).replace(/_/g, ' ')),
    detalle: detalleEvento(ev),
    por: ev.rol_actor === 'legado' ? null : actorLegible({ userId: ev.user_id, email: ev.user_email, rol: ev.rol_actor }, nombresStaff),
    ref: null,
    categoria: ev.evento === 'accesos_revisados' ? 'accesos' : 'empleado',
  }));
}

/**
 * Fecha de la baja del empleado a partir de su hoja de vida: el último
 * `baja_ejecutada`, o el cambio de estado (heredado) a Inactivo. Null si no hay.
 */
export function fechaDeBaja(eventos = []) {
  const bajas = eventos
    .filter((ev) => ev.evento === 'baja_ejecutada' || (ev.evento === 'estado_cambiado' && ev.valor_nuevo === 'Inactivo'))
    .map((ev) => ev.created_at)
    .sort((a, b) => aMs(b) - aMs(a));
  return bajas[0] || null;
}

// ── Equipos ─────────────────────────────────────────────────────────────────
const MOVIMIENTO_EQUIPO = {
  asignado: 'Equipo entregado',
  devuelto: 'Equipo devuelto',
  acta_adjuntada: 'Acta firmada adjuntada',
  verificado: 'Equipo verificado',
  estado_cambiado: 'Estado del equipo cambiado',
};

// "Entregado a X — Buen estado" → "Buen estado" (la condición tras el guion).
function condicionDe(detalle) {
  const i = String(detalle || '').indexOf(' — ');
  return i === -1 ? '' : String(detalle).slice(i + 3);
}

function rutaActa(equipoId, asignacionId, tipo) {
  return `/equipos/${equipoId}/acta/${asignacionId}?tipo=${tipo}`;
}

function filasEquipos({ asignaciones = [], eventos = [] }, actas, empleado, nombresStaff) {
  const filas = [];
  const nombre = sinTildes(`${empleado.nombres} ${empleado.apellidos}`.replace(/\s+/g, ' ').trim());
  const actasConEvento = new Set();

  for (const a of asignaciones) {
    const desde = aMs(a.created_at || a.fecha_inicio) - DIA_MS;
    const hasta = a.fecha_fin ? aMs(a.fecha_fin) + 2 * DIA_MS : Infinity;
    const propios = eventos.filter((ev) => {
      if (ev.equipo_id !== a.equipo_id || ev.evento === 'registrado') return false;
      const ms = aMs(ev.created_at);
      if (ms < desde || ms > hasta) return false;
      // Entregas y devoluciones del mismo equipo a OTRA persona el mismo día
      // caen en la ventana: se descartan por el nombre que el trigger escribe.
      if (ev.evento === 'asignado' || ev.evento === 'devuelto') return sinTildes(ev.detalle).includes(nombre);
      return true;
    });

    const descripcion = unir(a.codigo, a.descripcion);
    for (const ev of propios) {
      const esActa = ev.evento === 'acta_adjuntada';
      const tipo = /devoluci/i.test(ev.detalle || '') ? 'devolucion' : 'entrega';
      if (esActa) actasConEvento.add(`${a.id}|${tipo}`);
      const cond = ev.evento === 'asignado' || ev.evento === 'devuelto' ? condicionDe(ev.detalle) : '';
      filas.push({
        id: `equipo-${ev.id}`,
        fecha: ev.created_at,
        orden: aMs(ev.created_at),
        movimiento: MOVIMIENTO_EQUIPO[ev.evento] || inicial(String(ev.evento).replace(/_/g, ' ')),
        detalle: esActa || ev.evento === 'verificado' || ev.evento === 'estado_cambiado'
          ? unir(a.codigo, ev.detalle)
          : unir(descripcion, cond),
        por: actorLegible({ email: ev.user_email }, nombresStaff),
        ref: esActa
          ? { texto: 'Acta', to: rutaActa(a.equipo_id, a.id, tipo) }
          : { texto: a.codigo, to: `/equipos/${a.equipo_id}` },
        categoria: 'equipos',
      });
    }

    // Entregas y devoluciones anteriores a la auditoría (o de un equipo sin
    // evento) salen de la propia asignación, con su fecha sin hora.
    if (!propios.some((ev) => ev.evento === 'asignado')) {
      filas.push({
        id: `equipo-${a.id}-entrega`,
        fecha: a.fecha_inicio,
        orden: aMs(a.fecha_inicio),
        movimiento: MOVIMIENTO_EQUIPO.asignado,
        detalle: descripcion,
        por: null,
        ref: { texto: a.codigo, to: `/equipos/${a.equipo_id}` },
        categoria: 'equipos',
      });
    }
    if (a.fecha_fin && !propios.some((ev) => ev.evento === 'devuelto')) {
      filas.push({
        id: `equipo-${a.id}-devolucion`,
        fecha: a.fecha_fin,
        orden: aMs(a.fecha_fin),
        movimiento: MOVIMIENTO_EQUIPO.devuelto,
        detalle: descripcion,
        por: null,
        ref: { texto: a.codigo, to: `/equipos/${a.equipo_id}` },
        categoria: 'equipos',
      });
    }
  }

  // Actas firmadas que no tienen su evento en la hoja de vida del equipo.
  const asigPorId = Object.fromEntries(asignaciones.map((a) => [a.id, a]));
  for (const acta of actas) {
    if (actasConEvento.has(`${acta.asignacion_equipo_id}|${acta.tipo}`)) continue;
    const a = asigPorId[acta.asignacion_equipo_id];
    filas.push({
      id: `acta-${acta.id}`,
      fecha: acta.created_at,
      orden: aMs(acta.created_at),
      movimiento: 'Acta firmada adjuntada',
      detalle: unir(a?.codigo, acta.tipo === 'devolucion' ? 'Acta de devolución' : 'Acta de entrega'),
      por: null,
      ref: { texto: 'Acta', to: rutaActa(acta.equipo_id, acta.asignacion_equipo_id, acta.tipo) },
      categoria: 'equipos',
    });
  }
  return filas;
}

// ── Cuentas y licencias ─────────────────────────────────────────────────────
function filasCuentas(cuentas) {
  const filas = [];
  for (const c of cuentas) {
    const base = unir(c.plataforma, c.usuario, c.tipo_cuenta && c.tipo_cuenta !== 'personal' ? badgeInfo('tipo_cuenta', c.tipo_cuenta).label : '');
    filas.push({
      id: `cuenta-${c.id}-inicio`,
      fecha: c.fecha_inicio,
      orden: aMs(c.fecha_inicio),
      movimiento: 'Cuenta asignada',
      detalle: base,
      por: null,
      ref: null,
      categoria: 'accesos',
    });
    if (c.fecha_fin) {
      filas.push({
        id: `cuenta-${c.id}-fin`,
        fecha: c.fecha_fin,
        orden: aMs(c.fecha_fin),
        movimiento: /traspaso/i.test(c.notas) ? 'Cuenta traspasada' : 'Cuenta cerrada',
        detalle: unir(base, c.notas),
        por: null,
        ref: null,
        categoria: 'accesos',
      });
    }
  }
  return filas;
}

function filasLicencias(licencias) {
  const filas = [];
  for (const l of licencias) {
    const ref = l.software ? { texto: 'Licencias', to: { path: '/licencias', query: { q: l.software } } } : null;
    filas.push({
      id: `licencia-${l.id}-inicio`,
      fecha: l.fecha_inicio,
      orden: aMs(l.fecha_inicio),
      movimiento: 'Licencia asignada',
      detalle: l.software,
      por: null,
      ref,
      categoria: 'licencias',
    });
    if (l.fecha_fin) {
      filas.push({
        id: `licencia-${l.id}-fin`,
        fecha: l.fecha_fin,
        orden: aMs(l.fecha_fin),
        movimiento: 'Licencia liberada',
        detalle: l.software,
        por: null,
        ref,
        categoria: 'licencias',
      });
    }
  }
  return filas;
}

// ── Entregas y tickets ──────────────────────────────────────────────────────
/** Estado derivado de una entrega: 'abierta' | 'vencida' | 'enviada'. */
export function estadoEntrega(entrega, ahora = Date.now()) {
  if (entrega.viewed_at) return 'abierta';
  if (entrega.expires_at && aMs(entrega.expires_at) < ahora) return 'vencida';
  return 'enviada';
}

function filasEntregas(entregas, nombresStaff, ahora) {
  const filas = [];
  for (const e of entregas) {
    filas.push({
      id: `entrega-${e.id}-enviada`,
      fecha: e.created_at,
      orden: aMs(e.created_at),
      movimiento: 'Entrega enviada',
      detalle: 'Enlace de un solo uso',
      por: actorLegible({ userId: e.created_by }, nombresStaff),
      ref: null,
      categoria: 'accesos',
    });
    if (e.viewed_at) {
      filas.push({
        id: `entrega-${e.id}-abierta`,
        fecha: e.viewed_at,
        orden: aMs(e.viewed_at),
        movimiento: 'Entrega abierta',
        detalle: 'Abierta desde el enlace',
        por: 'Empleado',
        ref: null,
        categoria: 'accesos',
      });
    } else if (estadoEntrega(e, ahora) === 'vencida') {
      filas.push({
        id: `entrega-${e.id}-vencida`,
        fecha: e.expires_at,
        orden: aMs(e.expires_at),
        movimiento: 'Entrega vencida',
        detalle: 'Expiró sin abrirse',
        por: 'Sistema',
        ref: null,
        categoria: 'accesos',
      });
    }
  }
  return filas;
}

function filasTickets(tickets) {
  return tickets.map((t) => ({
    id: `ticket-${t.id}`,
    fecha: t.created_at,
    orden: aMs(t.created_at),
    movimiento: t.tipo === 'solicitud' ? 'Solicitud registrada' : 'Ticket registrado',
    detalle: t.titulo,
    por: t.origen === 'empleado' ? 'Empleado' : null,
    ref: { texto: t.codigo, to: `/tickets/${t.id}` },
    categoria: 'tickets',
  }));
}

// ── Armado ──────────────────────────────────────────────────────────────────
/**
 * @param {object} fuentes  { eventos, equipos: { asignaciones, eventos }, actas,
 *   cuentas, licencias, entregas, tickets } — todas opcionales
 * @param {object} opciones { empleado (nombres/apellidos), nombresStaff
 *   ({ user_id: nombre }), ahora (ms, para probar el vencimiento) }
 * @returns {object[]} filas del libro, la más reciente primero
 */
export function armarLibroEmpleado(fuentes = {}, { empleado, nombresStaff = {}, ahora = Date.now() } = {}) {
  const filas = [
    ...filasEventos(fuentes.eventos || [], nombresStaff),
    ...(fuentes.equipos ? filasEquipos(fuentes.equipos, fuentes.actas || [], empleado || {}, nombresStaff) : []),
    ...filasCuentas(fuentes.cuentas || []),
    ...filasLicencias(fuentes.licencias || []),
    ...filasEntregas(fuentes.entregas || [], nombresStaff, ahora),
    ...filasTickets(fuentes.tickets || []),
  ];
  // Orden estable: por instante (desc) y, a igual instante, por id.
  return filas.sort((a, b) => b.orden - a.orden || String(a.id).localeCompare(String(b.id)));
}

/** Filtra por la categoría del chip; '' = todo. */
export function filtrarLibro(filas, filtro) {
  return filtro ? filas.filter((f) => f.categoria === filtro) : filas;
}
