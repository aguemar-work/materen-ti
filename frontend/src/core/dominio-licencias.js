// Vocabulario del dominio licencias: estado de vencimiento derivado.
// Único umbral (30 días) — antes duplicado en LicenciasView.vue y
// EmpleadoDetalleView.vue con su propia copia de HOY/EN_30_DIAS. El texto
// del badge sigue siendo de cada vista (la de detalle de empleado omite a
// propósito las licencias sanas; el listado siempre muestra la fecha).
import { fechaLocalISO } from './formatters.js';
import { claseBadge, TONO_VENCIMIENTO_LICENCIA as TV } from './tonos.js';

// Ventana de "por vencer", en días. La usan el tag de cada fila (abajo) y el
// filtro de situación del listado (api/domains/licencias.js), para que el
// segmento "Por vencer" traiga exactamente las filas que se pintan así.
// (El Inicio ya no usa esta constante: la ventana de "por vencer" de sus
// pendientes la fija el servidor, `config_parametros.dias_por_vencer_licencia`,
// migración 103. Acá solo rige para las etiquetas y filtros de los listados.)
export const DIAS_POR_VENCER_LICENCIA = 30;

export function estadoVencimientoLicencia(lic) {
  if (lic.tipo === 'perpetua' || !lic.fecha_vencimiento) return 'perpetua';
  if (lic.fecha_vencimiento < fechaLocalISO()) return 'vencida';
  if (lic.fecha_vencimiento <= fechaLocalISO(DIAS_POR_VENCER_LICENCIA)) return 'por_vencer';
  return 'vigente';
}

export const CLASE_VENCIMIENTO_LICENCIA = {
  perpetua: claseBadge(TV.perpetua),
  vencida: claseBadge(TV.vencida),
  por_vencer: claseBadge(TV.por_vencer),
  vigente: claseBadge(TV.vigente),
};
