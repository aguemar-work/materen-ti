// Kardex de un equipo: arma las filas de AppLibro de su hoja de vida.
//
// Fuentes (tres lecturas de PostgREST, ninguna nueva en el servidor):
//   · eventos_equipo        — lo que escriben los triggers y las RPC (101/110):
//                             registrado, asignado, devuelto, estado_cambiado,
//                             verificado, acta_adjuntada, recepcion_confirmada.
//   · asignaciones_equipo   — para enlazar cada entrega/devolución con SU
//                             asignación (y, por ella, con su acta firmada).
//   · actas                 — las vigentes (migración 110).
//
// El evento no guarda el id de la asignación, así que el cruce es por tiempo y
// nombre: el trigger corre en la misma transacción que el INSERT/UPDATE, de
// modo que `created_at` coincide con el de la asignación (entrega) o con el
// día de `fecha_fin` (devolución). Cuando no hay cruce seguro la fila queda sin
// referencia: se prefiere no enlazar a enlazar al acta equivocada.
//
// Regla 19 del sistema de diseño: movimiento en participio, anterior → nuevo;
// "Por" = el actor, o "no registrado (legado)" cuando el evento no lo trae
// (AppLibro lo pone si `por` viene vacío).
import { ESTADOS_FISICO_EQUIPO } from '../../core/dominio-equipos.js';

const TOLERANCIA_ENTREGA_MS = 10 * 60 * 1000;

export const MOTIVOS_CIERRE = {
  devolucion: 'Devolución normal',
  cambio_equipo: 'Cambio de equipo',
  baja_empleado: 'Baja del empleado',
  perdida: 'Pérdida o robo',
  robo: 'Pérdida o robo',
  movimiento: 'Movimiento',
  entrega_a_empleado: 'Entrega a un empleado',
  baja_equipo: 'Baja del equipo',
};

// Fecha local 'YYYY-MM-DD' de un instante (misma regla que usa el resto de la
// app: el día de Lima, nunca el UTC de toISOString).
function diaLocal(iso) {
  const d = new Date(iso);
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

const norm = (t) => String(t ?? '').trim().toLowerCase();
const nombreDe = (a) => (a.empleados ? `${a.empleados.nombres} ${a.empleados.apellidos}`.trim() : '');

function etiquetaEstado(estado) {
  return ESTADOS_FISICO_EQUIPO[estado]?.label ?? estado;
}

// "Diego Huamán Rojas" → "Diego Huamán"; sin nombre, la parte local del correo.
export function actorCorto({ user_id: userId, user_email: correo }, nombresPorId = new Map()) {
  const nombre = userId ? nombresPorId.get(userId) : null;
  if (nombre) return nombre.split(/\s+/).slice(0, 2).join(' ');
  if (correo) return String(correo).split('@')[0];
  return '';
}

const ESTADO_A_MOVIMIENTO = {
  en_reparacion: 'A reparación',
  de_baja: 'Dado de baja',
  perdido: 'Marcado perdido o robado',
};

function movimientoDeEstado(anterior, nuevo) {
  if (nuevo === 'operativo') {
    if (anterior === 'en_reparacion') return 'Reparado';
    if (anterior === 'perdido') return 'Recuperado';
    if (anterior === 'de_baja') return 'Reactivado';
    return 'Operativo';
  }
  return ESTADO_A_MOVIMIENTO[nuevo] ?? 'Estado cambiado';
}

/** Ruta imprimible del acta de una asignación. */
export function rutaActa(equipoId, asignacionId, tipo) {
  return `/equipos/${equipoId}/acta/${asignacionId}?tipo=${tipo}`;
}

// ¿Cuál asignación de persona originó este evento? null si no hay cruce seguro.
function asignacionDeEntrega(evento, persona, asignaciones, usadas) {
  const t = new Date(evento.created_at).getTime();
  let mejor = null;
  for (const a of asignaciones) {
    if (!a.empleado_id || usadas.has(a.id)) continue;
    const dif = Math.abs(new Date(a.created_at).getTime() - t);
    const mismoDia = a.fecha_inicio === diaLocal(evento.created_at);
    if (dif > TOLERANCIA_ENTREGA_MS && !mismoDia) continue;
    const puntaje = (norm(nombreDe(a)) === norm(persona) ? 0 : 1e12) + (dif <= TOLERANCIA_ENTREGA_MS ? dif : 1e9 + dif);
    if (!mejor || puntaje < mejor.puntaje) mejor = { a, puntaje };
  }
  return mejor?.a ?? null;
}

function asignacionDeDevolucion(evento, persona, asignaciones, usadas) {
  const dia = diaLocal(evento.created_at);
  let mejor = null;
  for (const a of asignaciones) {
    if (!a.empleado_id || !a.fecha_fin || usadas.has(a.id) || a.fecha_fin !== dia) continue;
    const puntaje = norm(nombreDe(a)) === norm(persona) ? 0 : 1;
    if (!mejor || puntaje < mejor.puntaje) mejor = { a, puntaje };
  }
  return mejor?.a ?? null;
}

/**
 * @param {object} p
 * @param {string} p.equipoId
 * @param {Array}  p.eventos         filas de eventos_equipo
 * @param {Array}  p.asignaciones    filas de asignaciones_equipo (con empleados/ubicaciones)
 * @param {Array}  p.actas           actas vigentes ya mapeadas ({id, asignacionId, tipo, creadaEn, firmadoAt})
 * @param {Map}    p.nombresStaff    user_id → nombre
 * @returns {Array} filas de AppLibro, lo más reciente primero
 */
export function filasKardex({ equipoId, eventos = [], asignaciones = [], actas = [], nombresStaff = new Map() }) {
  const actaDe = (asignacionId, tipo) => actas.find((x) => x.asignacionId === asignacionId && x.tipo === tipo) || null;
  const refActa = (asignacion, tipo) => {
    const acta = actaDe(asignacion.id, tipo);
    return { texto: acta ? 'Acta firmada' : 'Acta', to: rutaActa(equipoId, asignacion.id, tipo) };
  };

  // Cronológico para que el cruce evento ↔ asignación consuma cada asignación una sola vez.
  const cronologicos = [...eventos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const entregasUsadas = new Set();
  const devolucionesUsadas = new Set();

  const filas = cronologicos.map((ev) => {
    const base = { id: ev.id, fecha: ev.created_at, por: actorCorto(ev, nombresStaff) };
    const detalle = String(ev.detalle ?? '');

    if (ev.evento === 'registrado') {
      return { ...base, movimiento: 'Registrado', detalle: detalle.replace(/^Código\s+/i, 'Código ') };
    }

    if (ev.evento === 'asignado') {
      const persona = /^Entregado a (.+?)(?: — (.+))?$/.exec(detalle);
      if (persona) {
        const asig = asignacionDeEntrega(ev, persona[1], asignaciones, entregasUsadas);
        if (asig) entregasUsadas.add(asig.id);
        return {
          ...base,
          movimiento: 'Entregado',
          detalle: [persona[1], persona[2]].filter(Boolean).join(' · '),
          ref: asig ? refActa(asig, 'entrega') : undefined,
        };
      }
      const lugar = /^(?:Ubicado en|Entregado a) (.+)$/.exec(detalle);
      return { ...base, movimiento: 'Ubicado', detalle: lugar ? lugar[1] : detalle };
    }

    if (ev.evento === 'devuelto') {
      const persona = /^Devuelto por (.+?)(?: — (.+?))?(?: \(([a-z_]+)\))?$/.exec(detalle);
      if (persona) {
        const asig = asignacionDeDevolucion(ev, persona[1], asignaciones, devolucionesUsadas);
        if (asig) devolucionesUsadas.add(asig.id);
        const motivo = persona[3] && persona[3] !== 'devolucion' ? MOTIVOS_CIERRE[persona[3]] : '';
        return {
          ...base,
          movimiento: 'Devuelto',
          detalle: [persona[1], persona[2], motivo].filter(Boolean).join(' · '),
          ref: asig ? refActa(asig, 'devolucion') : undefined,
        };
      }
      const lugar = /^Retirado de (.+?)(?: \(([a-z_]+)\))?$/.exec(detalle);
      return { ...base, movimiento: 'Retirado', detalle: lugar ? lugar[1] : detalle };
    }

    if (ev.evento === 'estado_cambiado') {
      const m = /^De "(\w+)" a "(\w+)"$/.exec(detalle);
      if (!m) return { ...base, movimiento: 'Estado cambiado', detalle };
      return {
        ...base,
        movimiento: movimientoDeEstado(m[1], m[2]),
        detalle: `${etiquetaEstado(m[1])} → ${etiquetaEstado(m[2])}`,
      };
    }

    if (ev.evento === 'verificado') {
      return { ...base, movimiento: 'Verificado', detalle: detalle.replace(/^Verificado físicamente\s*/i, '').replace(/^[—-]\s*/, '') || 'Verificación física' };
    }

    if (ev.evento === 'acta_adjuntada') {
      const tipo = /devoluci/i.test(detalle) ? 'devolucion' : 'entrega';
      const t = new Date(ev.created_at).getTime();
      const acta = actas
        .filter((x) => x.tipo === tipo)
        .sort((a, b) => Math.abs(new Date(a.creadaEn) - t) - Math.abs(new Date(b.creadaEn) - t))[0];
      const cerca = acta && Math.abs(new Date(acta.creadaEn) - t) <= TOLERANCIA_ENTREGA_MS;
      return {
        ...base,
        movimiento: 'Acta adjuntada',
        detalle: detalle.replace(/^Acta de (entrega|devolución) firmada adjuntada\s*/i, `Acta de ${tipo === 'entrega' ? 'entrega' : 'devolución'} firmada `).trim(),
        ref: cerca ? { texto: 'Acta firmada', to: rutaActa(equipoId, acta.asignacionId, tipo) } : undefined,
      };
    }

    if (ev.evento === 'recepcion_confirmada') {
      return { ...base, movimiento: 'Recepción confirmada', detalle };
    }

    return { ...base, movimiento: ev.evento, detalle };
  });

  // Lo más reciente arriba (los empates conservan el orden inverso de inserción).
  return filas.reverse().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
}
