import { formatFecha } from '../../core/formatters.js';

// Aplana las 8 categorías de pendientes del Dashboard (cuentas, licencias,
// equipos, tickets) en un solo feed ordenado por urgencia real, en vez de
// mostrarlas como cajas separadas de igual peso visual.
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

const HOY = () => new Date().toISOString().split('T')[0];

function diasDesde(fechaISO) {
  if (!fechaISO) return null;
  const ms = Date.parse(HOY()) - Date.parse(fechaISO.split('T')[0]);
  return Math.round(ms / 86400000);
}

function destinoCuenta(item) {
  if (item.tipo_cuenta === 'personal' && item.titulares.length) {
    return `/empleados/${item.titulares[0].id}`;
  }
  return '/correos';
}

function contextoCuenta(item) {
  if (item.titulares.length) return `Asignada a ${item.titulares.map((t) => t.nombre).join(', ')}`;
  if (item.tipo_cuenta === 'reutilizable') return 'Libre — rotar antes de reasignar';
  return 'Sin titular activo';
}

export function construirFeedPendientes(pendientes, pendientesTickets) {
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
      destino: '/equipos',
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
      destino: '/licencias',
      diasUrgencia: diasDesde(l.fecha_vencimiento),
    });
  }

  for (const g of pendientes.garantiasPorVencer || []) {
    items.push({
      key: `garantia-${g.equipo_id}`,
      tier: g.vencida ? 1 : 2,
      icono: 'ti ti-shield-check',
      colorFamilia: g.vencida ? 'danger' : 'teal',
      categoriaLabel: 'Garantía',
      titulo: `${g.codigo} — ${g.equipo}`,
      contexto: `${g.vencida ? 'Venció el' : 'Vence el'} ${formatFecha(g.garantia_hasta)}`,
      destino: '/equipos',
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
      colorFamilia: 'purple',
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
      colorFamilia: 'accent',
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

  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const da = a.diasUrgencia ?? -Infinity;
    const db_ = b.diasUrgencia ?? -Infinity;
    return db_ - da;
  });

  return items;
}
