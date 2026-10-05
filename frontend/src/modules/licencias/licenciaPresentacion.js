// Presentación pura de una licencia (sin estado ni red): lo que LicenciasView y
// sus componentes calculan para pintar vencimiento, plazo y renovación.
// Extraído de LicenciasView.vue al partirla; no cambia ninguna regla.
import { formatFecha, fechaISO, fechaLocalISO } from '../../core/formatters.js';
import { estadoVencimientoLicencia, CLASE_VENCIMIENTO_LICENCIA } from '../../core/dominio-licencias.js';
import { rolDeTag } from '../../core/tagRol.js';

export function estadoVencimiento(l) {
  const estado = estadoVencimientoLicencia(l);
  const clase = CLASE_VENCIMIENTO_LICENCIA[estado];
  if (estado === 'perpetua') return { clase, texto: 'Perpetua' };
  if (estado === 'vencida') return { clase, texto: `Venció ${formatFecha(l.fecha_vencimiento)}` };
  if (estado === 'por_vencer') return { clase, texto: `Vence ${formatFecha(l.fecha_vencimiento)}` };
  return { clase, texto: formatFecha(l.fecha_vencimiento) };
}

export function tonoVencimiento(l) {
  return rolDeTag(estadoVencimiento(l).clase);
}

// "en 12 días" / "hace 3 días" junto a la fecha — el plazo se lee antes
// que la fecha misma.
export function plazoVencimiento(l) {
  if (l.tipo === 'perpetua' || !l.fecha_vencimiento) return '';
  const hoy = new Date(`${fechaLocalISO()}T00:00:00`);
  const venc = new Date(`${l.fecha_vencimiento}T00:00:00`);
  const dias = Math.round((venc - hoy) / 86400000);
  if (dias === 0) return 'vence hoy';
  if (dias > 0) return dias > 90 ? '' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
}

const PERIODO_LABELS = {
  1: 'Mensual', 3: 'Trimestral', 6: 'Cada 6 meses',
  12: 'Anual', 24: 'Cada 2 años', 36: 'Cada 3 años',
};

export function periodoLabel(meses) {
  return PERIODO_LABELS[meses] || `Cada ${meses} meses`;
}

// Línea secundaria bajo el vencimiento: plazo y periodo de renovación.
export function detalleVencimiento(l) {
  const periodo = l.tipo === 'suscripcion' && l.renovacion_meses ? periodoLabel(l.renovacion_meses) : '';
  return [plazoVencimiento(l), periodo].filter(Boolean).join(' · ');
}

// Próxima fecha: avanza el periodo desde el vencimiento actual las veces
// necesarias hasta quedar en el futuro (por si estuvo vencida un tiempo)
export function proximaFecha(l) {
  const d = new Date(`${l.fecha_vencimiento}T00:00:00`);
  do {
    d.setMonth(d.getMonth() + l.renovacion_meses);
  } while (fechaISO(d) <= fechaLocalISO());
  return fechaISO(d);
}

// Acciones por licencia para el menú ⋮ (fuente única de tabla y tarjetas).
// `on` = { renovar, asignar, editar, eliminar } con la licencia como argumento.
export function accionesDeLicencia(lic, on) {
  return [
    {
      icono: 'ti-refresh',
      label: 'Renovar',
      visible: lic.tipo === 'suscripcion' && !!lic.renovacion_meses && !!lic.fecha_vencimiento,
      onClick: () => on.renovar(lic),
    },
    {
      icono: 'ti-user-plus',
      label: 'Asignar asiento a un empleado',
      disabled: lic.usados >= lic.cantidad,
      onClick: () => on.asignar(lic),
    },
    { icono: 'ti-pencil', label: 'Editar', onClick: () => on.editar(lic) },
    { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => on.eliminar(lic) },
  ];
}
