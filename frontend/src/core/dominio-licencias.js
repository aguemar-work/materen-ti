// Vocabulario del dominio licencias: estado de vencimiento derivado.
// Único umbral (30 días) — antes duplicado en LicenciasView.vue y
// EmpleadoDetalleView.vue con su propia copia de HOY/EN_30_DIAS. El texto
// del badge sigue siendo de cada vista (la de detalle de empleado omite a
// propósito las licencias sanas; el listado siempre muestra la fecha).
import { fechaLocalISO } from './formatters.js';

export function estadoVencimientoLicencia(lic) {
  if (lic.tipo === 'perpetua' || !lic.fecha_vencimiento) return 'perpetua';
  if (lic.fecha_vencimiento < fechaLocalISO()) return 'vencida';
  if (lic.fecha_vencimiento <= fechaLocalISO(30)) return 'por_vencer';
  return 'vigente';
}

export const CLASE_VENCIMIENTO_LICENCIA = {
  perpetua: 'badge--success',
  vencida: 'badge--danger',
  por_vencer: 'badge--warning',
  vigente: 'badge--success',
};
