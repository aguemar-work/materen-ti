import { formatFecha, fechaLocalISO } from '../../core/formatters.js';

// Aplana las categorías de pendientes del Dashboard (cuentas, licencias,
// equipos, tickets, problemas y altas de personal a medias) en un solo feed
// ordenado por urgencia real, en vez de mostrarlas como cajas separadas de
// igual peso visual.
//
// Reglas de tier/orden (decisión de producto, no derivar de nuevo):
// - Tier 1 (crítico): sin contraseña, equipos sin devolver, licencias y
//   garantías YA vencidas.
// - Tier 2 (atención): por rotar, licencias/garantías por vencer (aún no
//   vencidas), los 3 tipos de pendiente de ticket.
// - Dentro de un tier, ordena por `diasUrgencia` descendente (más días de
//   atraso primero). `porRotar`, `sinPassword` y `equiposSinDevolver` no
//   tienen una fecha confiable en el esquema (no existe
//   `requiere_rotacion_desde` ni fecha de baja del empleado) → diasUrgencia
//   null, quedan al final de su tier.

const HOY = () => fechaLocalISO();

function diasDesde(fechaISO) {
  if (!fechaISO) return null;
  const ms = Date.parse(HOY()) - Date.parse(fechaISO.split('T')[0]);
  return Math.round(ms / 86400000);
}

function destinoCuenta(item) {
  if (item.tipo_cuenta === 'personal' && item.titulares.length) {
    return `/empleados/${item.titulares[0].id}`;
  }
  // Sin titular personal: no hay ficha propia, así que se apunta a Correos
  // ya filtrado por el usuario de la cuenta (mismo input que la búsqueda de esa vista).
  return `/correos?q=${encodeURIComponent(item.usuario)}`;
}

function contextoCuenta(item) {
  if (item.titulares.length) return `Asignada a ${item.titulares.map((t) => t.nombre).join(', ')}`;
  if (item.tipo_cuenta === 'reutilizable') return 'Libre — rotar antes de reasignar';
  return 'Sin titular activo';
}

export function construirFeedPendientes(pendientes, pendientesTickets, pendientesProblemas = {}, altasIncompletas = []) {
  const items = [];

  for (const c of pendientes.sinPassword || []) {
    items.push({
      key: `sinpw-${c.cuenta_id}`,
      tier: 1,
      icono: 'ti ti-key-off',
      colorFamilia: 'danger',
      categoriaLabel: 'Sin contraseña',
      titulo: c.usuario,
      contexto: `${c.plataforma} · ${contextoCuenta(c)}`,
      destino: destinoCuenta(c),
      diasUrgencia: null,
    });
  }

  for (const e of pendientes.equiposSinDevolver || []) {
    items.push({
      key: `equipo-${e.asignacion_id}`,
      tier: 1,
      icono: 'ti ti-devices-off',
      colorFamilia: 'danger',
      categoriaLabel: 'Equipo sin devolver',
      titulo: `${e.codigo} — ${e.equipo}`,
      contexto: `Lo tiene ${e.empleado} (dado de baja)`,
      destino: `/equipos?q=${encodeURIComponent(e.codigo)}`,
      diasUrgencia: null,
    });
  }

  for (const l of pendientes.licenciasPorVencer || []) {
    items.push({
      key: `lic-${l.licencia_id}`,
      tier: l.vencida ? 1 : 2,
      icono: 'ti ti-license',
      colorFamilia: l.vencida ? 'danger' : 'info',
      categoriaLabel: 'Licencia',
      titulo: l.software,
      contexto: `${l.vencida ? 'VENCIDA el' : 'Vence el'} ${formatFecha(l.fecha_vencimiento)}${l.empresa ? ` · ${l.empresa}` : ''}`,
      destino: `/licencias?q=${encodeURIComponent(l.software)}`,
      diasUrgencia: diasDesde(l.fecha_vencimiento),
    });
  }

  for (const g of pendientes.garantiasPorVencer || []) {
    items.push({
      key: `garantia-${g.equipo_id}`,
      tier: g.vencida ? 1 : 2,
      icono: 'ti ti-shield-check',
      // 'teal' colisionaba con la prioridad "Media" de Tickets (dominio-tickets.js) —
      // se alinea con el mismo criterio que Licencia por vencer (info, no vencida)
      // / vencida (danger), en vez de introducir un color sin relación (ago 2026).
      colorFamilia: g.vencida ? 'danger' : 'info',
      categoriaLabel: 'Garantía',
      titulo: `${g.codigo} — ${g.equipo}`,
      contexto: `${g.vencida ? 'Venció el' : 'Vence el'} ${formatFecha(g.garantia_hasta)}`,
      destino: `/equipos?q=${encodeURIComponent(g.codigo)}`,
      diasUrgencia: diasDesde(g.garantia_hasta),
    });
  }

  for (const c of pendientes.porRotar || []) {
    items.push({
      key: `rotar-${c.cuenta_id}`,
      tier: 2,
      icono: 'ti ti-alert-triangle',
      colorFamilia: 'warning',
      categoriaLabel: 'Rotar contraseña',
      titulo: c.usuario,
      contexto: `${c.plataforma} · ${contextoCuenta(c)}`,
      destino: destinoCuenta(c),
      diasUrgencia: null,
    });
  }

  for (const t of pendientesTickets.sinAsignar || []) {
    items.push({
      key: `tk-sinasignar-${t.ticket_id}`,
      tier: 2,
      icono: 'ti ti-headset',
      // 'purple' colisionaba con Ubicaciones/rol JEFE y con la prioridad
      // "Alta" de Tickets — 'warning' ya es el color de "atención" de este
      // mismo feed (Rotar contraseña, Ticket abierto +3 días) (ago 2026).
      colorFamilia: 'warning',
      categoriaLabel: 'Ticket sin asignar',
      titulo: t.codigo,
      contexto: t.titulo,
      destino: `/tickets/${t.ticket_id}`,
      diasUrgencia: diasDesde(t.desde),
    });
  }

  for (const t of pendientesTickets.sinVincular || []) {
    items.push({
      key: `tk-sinvincular-${t.ticket_id}`,
      tier: 2,
      icono: 'ti ti-user-question',
      // 'accent' colisionaba con contadores/"copió contraseña" — es un dato
      // incompleto, no una urgencia de acción, así que va en 'neutral'
      // (mismo significado que "inactivo/de baja" en la tabla de badges).
      colorFamilia: 'neutral',
      categoriaLabel: 'Ticket sin vincular',
      titulo: t.codigo,
      contexto: t.titulo,
      destino: `/tickets/${t.ticket_id}`,
      diasUrgencia: diasDesde(t.desde),
    });
  }

  for (const t of pendientesTickets.abiertosViejos || []) {
    items.push({
      key: `tk-viejo-${t.ticket_id}`,
      tier: 2,
      icono: 'ti ti-clock-exclamation',
      colorFamilia: 'warning',
      categoriaLabel: 'Ticket abierto +3 días',
      titulo: t.codigo,
      contexto: `${t.titulo} · desde ${formatFecha(t.desde)}`,
      destino: `/tickets/${t.ticket_id}`,
      diasUrgencia: diasDesde(t.desde),
    });
  }

  // ── Altas a medias ──────────────────────────────────────────────────
  // Alguien que entró hace poco y todavía no tiene con qué trabajar. La
  // regla vive en core/dominio-empleados.js; el Dashboard solo la pide si
  // el usuario tiene el módulo `correos` (ver empleadosApi.altasIncompletas).
  //
  // Sube a tier 1 pasados 3 días con el mismo criterio que "Ticket abierto
  // +3 días" ya usa en este archivo: al principio es un alta en curso, no un
  // olvido; después son días de una persona sin poder trabajar.
  for (const a of altasIncompletas || []) {
    const urgente = a.dias > 3;
    items.push({
      key: `alta-${a.empleado_id}`,
      tier: urgente ? 1 : 2,
      icono: 'ti ti-user-exclamation',
      colorFamilia: urgente ? 'danger' : 'warning',
      categoriaLabel: 'Alta sin completar',
      titulo: a.nombre,
      contexto: a.dias === 0
        ? `Entró hoy${a.cargo ? ` · ${a.cargo}` : ''} · sin cuenta todavía`
        : `Entró hace ${a.dias} ${a.dias === 1 ? 'día' : 'días'}${a.cargo ? ` · ${a.cargo}` : ''} · sigue sin cuenta`,
      destino: `/empleados/${a.empleado_id}`,
      diasUrgencia: a.dias,
    });
  }

  // ── Gestión de Problemas (migración 033): sin tabla de notificaciones,
  // se computa en vivo cada carga — mismo criterio que el resto del feed.
  for (const a of pendientesProblemas.accionesVencidas || []) {
    items.push({
      key: `accion-vencida-${a.accion_id}`,
      tier: 1,
      icono: 'ti ti-list-check',
      colorFamilia: 'danger',
      categoriaLabel: 'Acción correctiva vencida',
      titulo: a.descripcion,
      contexto: `${a.problema_titulo} · venció el ${formatFecha(a.fecha_limite)}`,
      destino: `/problemas/${a.problema_id}`,
      diasUrgencia: diasDesde(a.fecha_limite),
    });
  }

  for (const c of pendientesProblemas.categoriasRecurrentes || []) {
    items.push({
      key: `recurrencia-${c.categoria_id}`,
      tier: 2,
      icono: 'ti ti-repeat',
      colorFamilia: 'warning',
      categoriaLabel: 'Posible problema recurrente',
      titulo: c.categoria_nombre || c.categoria_id,
      contexto: `${c.tickets.length} tickets en los últimos 30 días sin un problema abierto`,
      // Tickets ya filtrado por esa categoría (antes llevaba a /tickets a
      // secas y había que buscarlos a mano).
      destino: `/tickets?categoria=${encodeURIComponent(c.categoria_id)}`,
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
