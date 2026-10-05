import { formatFecha } from '../../core/formatters.js';
import { DIAS_SOLICITUD_CRITICA, TIPOS_CRITICOS_SI_VIEJOS } from '../../core/dominio-solicitudes.js';
import { diasDesde, textoAntiguedad } from './tiempoLima.js';

// Aplana los pendientes del Inicio (tickets, accesos, custodia, problemas)
// en un solo feed ordenado por urgencia real, a partir del resumen que
// devuelve la RPC `dashboard_resumen` (migración 103, ver
// `core/resumen-inicio.js`). Los umbrales de días (ventana de alta, licencias,
// garantías, ticket viejo, acta sin adjuntar) ya los aplica el servidor desde
// `config_parametros`: acá no hay ningún literal de ese tipo. Las solicitudes de
// servicio (altas, bajas, accesos, equipos; migración 108) vienen ya abiertas y
// con su avance desde el servidor: acá solo se ordenan.
//
// Reglas de tier/orden (decisión de producto, no derivar de nuevo):
// - Tier 1 (crítico): cuentas sin contraseña, equipos sin devolver, licencias
//   y garantías YA vencidas, acciones correctivas vencidas y altas o bajas
//   abiertas con más de `DIAS_SOLICITUD_CRITICA` días.
// - Tier 2 (atención): por rotar, licencias/garantías por vencer (aún no
//   vencidas), tickets sin asignar / sin vincular / abiertos hace tiempo,
//   posibles problemas recurrentes, actas sin adjuntar, solicitudes abiertas
//   (las altas y bajas recientes incluidas).
// - Dentro de un tier ordena por `diasUrgencia` descendente (más días de
//   atraso primero). Sin fecha confiable en el esquema (`porRotar`,
//   `sinPassword`, `equiposSinDevolver`: no hay fecha de baja ni
//   `requiere_rotacion_desde`) → `diasUrgencia` null, al final de su tier.
//
// Cada ítem: { key, tier, grupo, codigo?, codigoTitulo?, titulo, sujeto?,
// contexto, destino, diasUrgencia, antiguedad }. `codigo` se dibuja con
// AppCodigo; `antiguedad` es el texto de la columna de la izquierda ("3 d",
// "hoy", "—").

/** Vistas del Inicio: cada una es un `grupo` del feed. */
export const GRUPOS_INICIO = Object.freeze({
  tickets: { label: 'Tickets', secciones: ['tickets'] },
  solicitudes: { label: 'Solicitudes', secciones: ['solicitudes_abiertas'] },
  accesos: { label: 'Accesos', secciones: ['rotaciones_pendientes', 'cuentas_sin_password'] },
  custodia: { label: 'Custodia', secciones: ['equipos_sin_devolver', 'garantias_por_vencer', 'licencias_por_vencer', 'actas_pendientes'] },
  problemas: { label: 'Problemas', secciones: ['problemas'] },
});

function destinoCuenta(item) {
  if (item.tipo_cuenta === 'personal' && item.titulares?.length) {
    return `/empleados/${item.titulares[0].id}`;
  }
  // Sin titular personal: no hay ficha propia, así que se apunta a Correos
  // ya filtrado por el usuario de la cuenta (mismo input que la búsqueda de esa vista).
  return `/correos?q=${encodeURIComponent(item.usuario)}`;
}

function contextoCuenta(item) {
  if (item.titulares?.length) return `Asignada a ${item.titulares.map((t) => t.nombre).join(', ')}`;
  if (item.tipo_cuenta === 'reutilizable') return 'Libre — rotar antes de reasignar';
  return 'Sin titular activo';
}

const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
const unir = (...partes) => partes.filter(Boolean).join(' · ');

/**
 * @param {object|null} resumen  resultado de `getResumen()` (normalizado)
 * @param {{ ahora?: Date }} [opciones]  `ahora` solo para pruebas
 * @returns {Array} ítems ordenados por urgencia; `[]` sin resumen
 */
export function construirFeedPendientes(resumen, { ahora = new Date() } = {}) {
  const items = [];
  if (!resumen) return items;
  const edad = (valor) => diasDesde(valor, ahora);
  const agregar = (item) => items.push({ ...item, antiguedad: textoAntiguedad(item.diasUrgencia) });

  // ── Accesos ─────────────────────────────────────────────────────────
  for (const c of resumen.cuentas_sin_password || []) {
    agregar({
      key: `sinpw-${c.cuenta_id}`,
      tier: 1,
      grupo: 'accesos',
      codigo: c.usuario,
      codigoTitulo: 'Usuario de la cuenta',
      titulo: 'Sin contraseña',
      contexto: `${c.plataforma} · ${contextoCuenta(c)}`,
      destino: destinoCuenta(c),
      diasUrgencia: null,
    });
  }

  for (const c of resumen.rotaciones_pendientes || []) {
    agregar({
      key: `rotar-${c.cuenta_id}`,
      tier: 2,
      grupo: 'accesos',
      codigo: c.usuario,
      codigoTitulo: 'Usuario de la cuenta',
      titulo: 'Rotar contraseña',
      contexto: `${c.plataforma} · ${contextoCuenta(c)}`,
      destino: destinoCuenta(c),
      diasUrgencia: null,
    });
  }

  // ── Solicitudes de servicio (migración 108) ─────────────────────────
  // El trámite lo guarda el servidor: el Inicio solo lo ordena. Una alta o una
  // baja abierta por más de DIAS_SOLICITUD_CRITICA días es crítica (una persona
  // sin poder trabajar, o accesos y equipos de alguien que ya se fue); el resto
  // es atención. El texto dice cuánto va y qué falta ahora.
  for (const s of resumen.solicitudes_abiertas || []) {
    const urgente = TIPOS_CRITICOS_SI_VIEJOS.includes(s.tipo_id) && s.dias > DIAS_SOLICITUD_CRITICA;
    agregar({
      key: `sol-${s.solicitud_id}`,
      tier: urgente ? 1 : 2,
      grupo: 'solicitudes',
      codigo: s.codigo,
      codigoTitulo: 'Número de solicitud',
      titulo: s.tipo,
      sujeto: s.empleado,
      contexto: unir(
        `${s.pasos_hechos} de ${s.pasos_total} ${s.pasos_total === 1 ? 'paso' : 'pasos'}`,
        s.siguiente && `falta: ${s.siguiente}`,
        s.dias === 0 ? 'abierta hoy' : `abierta el ${formatFecha(s.creada_at)}`,
      ),
      destino: `/solicitudes/${s.solicitud_id}`,
      diasUrgencia: Number.isFinite(s.dias) ? s.dias : edad(s.creada_at),
    });
  }

  // ── Tickets: uno por ticket, con TODOS sus motivos ──────────────────
  // Un ticket sin asignar y viejo es un solo asunto, no dos filas con el mismo
  // código. Mismo tier (2) y misma antigüedad (la de `desde`) en los tres.
  const tickets = new Map();
  const motivo = (t, texto) => {
    const previo = tickets.get(t.ticket_id) || { t, motivos: [] };
    previo.motivos.push(texto);
    tickets.set(t.ticket_id, previo);
  };
  for (const t of resumen.tickets?.sin_asignar || []) motivo(t, 'Sin asignar');
  for (const t of resumen.tickets?.sin_vincular || []) motivo(t, 'Sin vincular a un empleado');
  for (const t of resumen.tickets?.viejos || []) {
    const d = edad(t.desde);
    motivo(t, d == null ? 'Abierto hace tiempo' : `Abierto hace ${dias(d)}`);
  }
  for (const { t, motivos } of tickets.values()) {
    agregar({
      key: `tk-${t.ticket_id}`,
      tier: 2,
      grupo: 'tickets',
      codigo: t.codigo,
      codigoTitulo: 'Número de ticket',
      titulo: t.titulo,
      contexto: motivos.join(' · '),
      destino: `/tickets/${t.ticket_id}`,
      diasUrgencia: edad(t.desde),
    });
  }

  // ── Custodia: equipos, actas, garantías y licencias ─────────────────
  for (const e of resumen.equipos_sin_devolver || []) {
    agregar({
      key: `equipo-${e.asignacion_id}`,
      tier: 1,
      grupo: 'custodia',
      codigo: e.codigo,
      codigoTitulo: 'Código del equipo',
      titulo: 'Sin devolver',
      contexto: unir(e.equipo, `${e.empleado} (dado de baja)`, e.empleado_baja_at ? `baja el ${formatFecha(e.empleado_baja_at)}` : e.desde && `desde ${formatFecha(e.desde)}`),
      destino: `/equipos?q=${encodeURIComponent(e.codigo)}`,
      // Antigüedad real del pendiente: desde la baja del empleado (el servidor la
      // aproxima con la última edición de su ficha hasta que exista el evento
      // `baja_ejecutada` de la migración 102). Sin ese dato queda en null.
      diasUrgencia: e.empleado_baja_at ? edad(e.empleado_baja_at) : null,
    });
  }

  // La entrega de un equipo a una persona se firma en papel y el PDF se
  // adjunta al expediente (plan §3.7): aviso hasta que el acta esté subida.
  for (const a of resumen.actas_pendientes || []) {
    agregar({
      key: `acta-${a.asignacion_id}`,
      tier: 2,
      grupo: 'custodia',
      codigo: a.equipo_codigo,
      codigoTitulo: 'Código del equipo',
      titulo: 'Acta sin adjuntar',
      contexto: unir(a.equipo_descripcion, a.empleado, a.fecha_inicio && `entregado el ${formatFecha(a.fecha_inicio)}`),
      destino: `/equipos/${a.equipo_id}/acta/${a.asignacion_id}?tipo=entrega`,
      diasUrgencia: Number.isFinite(a.dias) ? a.dias : edad(a.fecha_inicio),
    });
  }

  for (const g of resumen.garantias_por_vencer || []) {
    agregar({
      key: `garantia-${g.equipo_id}`,
      tier: g.vencida ? 1 : 2,
      grupo: 'custodia',
      codigo: g.codigo,
      codigoTitulo: 'Código del equipo',
      titulo: g.vencida ? 'Garantía vencida' : 'Garantía por vencer',
      contexto: unir(g.equipo, `${g.vencida ? 'venció' : 'vence'} el ${formatFecha(g.garantia_hasta)}`),
      destino: g.equipo_id ? `/equipos/${g.equipo_id}` : `/equipos?q=${encodeURIComponent(g.codigo)}`,
      diasUrgencia: edad(g.garantia_hasta),
    });
  }

  for (const l of resumen.licencias_por_vencer || []) {
    agregar({
      key: `lic-${l.licencia_id}`,
      tier: l.vencida ? 1 : 2,
      grupo: 'custodia',
      titulo: l.software,
      contexto: unir(`${l.vencida ? 'Vencida el' : 'Vence el'} ${formatFecha(l.fecha_vencimiento)}`, l.empresa),
      destino: `/licencias?q=${encodeURIComponent(l.software)}`,
      diasUrgencia: edad(l.fecha_vencimiento),
    });
  }

  // ── Problemas ───────────────────────────────────────────────────────
  for (const a of resumen.problemas?.acciones_vencidas || []) {
    agregar({
      key: `accion-vencida-${a.accion_id}`,
      tier: 1,
      grupo: 'problemas',
      titulo: a.descripcion,
      contexto: unir('Acción correctiva vencida', a.problema_titulo, `venció el ${formatFecha(a.fecha_limite)}`),
      destino: `/problemas/${a.problema_id}`,
      diasUrgencia: edad(a.fecha_limite),
    });
  }

  for (const c of resumen.problemas?.recurrentes || []) {
    const n = Number.isFinite(c.total) ? c.total : (c.tickets?.length ?? 0);
    agregar({
      key: `recurrencia-${c.categoria_id}`,
      tier: 2,
      grupo: 'problemas',
      titulo: 'Posible problema recurrente',
      sujeto: c.categoria_nombre || c.categoria_id,
      contexto: `${n} tickets recientes sin un problema abierto`,
      // Tickets ya filtrado por esa categoría. Vista "Todos": el conteo del
      // pendiente incluye tickets ya resueltos.
      destino: `/tickets?vista=todos&categoria=${encodeURIComponent(c.categoria_id)}`,
      diasUrgencia: null,
    });
  }

  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const da = a.diasUrgencia ?? -Infinity;
    const db_ = b.diasUrgencia ?? -Infinity;
    return db_ - da;
  });

  return items;
}
