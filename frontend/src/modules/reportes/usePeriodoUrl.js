// Período de un reporte en la URL (?tipo=mes&desde=…&hasta=…), común a todas
// las hojas por período: la URL es la fuente de verdad (un enlace reproduce la
// misma hoja) y el período siempre se normaliza (periodo.js). `extra` suma
// claves propias del reporte (p. ej. el técnico del reporte de Tickets o la
// ronda de Encuestas) con el mismo esquema de useFiltrosUrl.
import { computed } from 'vue';
import { useFiltrosUrl } from '../../composables/useFiltrosUrl.js';
import { normalizarPeriodo, etiquetaPeriodo } from './periodo.js';

// `permitirTodo` (Satisfacción): acepta `?tipo=todo`, todo el historial sin fechas.
export function usePeriodoUrl(extra = {}, { permitirTodo = false } = {}) {
  const { filtros } = useFiltrosUrl({
    tipo: { tipo: 'valor', defecto: 'mes' },
    desde: { tipo: 'valor' },
    hasta: { tipo: 'valor' },
    ...extra,
  });
  const normalizar = (p) => normalizarPeriodo(p, undefined, { permitirTodo });
  const periodo = computed(() => normalizar(filtros));
  const etiqueta = computed(() => etiquetaPeriodo(periodo.value));

  function fijarPeriodo(p) {
    filtros.tipo = p.tipo;
    filtros.desde = p.desde;
    filtros.hasta = p.hasta;
  }

  /**
   * Al montar: sin período en la URL, el mes en curso escrito en la URL (el
   * watcher del llamador carga). Devuelve true si la URL ya estaba normalizada
   * (entonces el llamador carga una vez).
   */
  function normalizarUrl() {
    const p = normalizar(filtros);
    if (p.tipo !== filtros.tipo || p.desde !== filtros.desde || p.hasta !== filtros.hasta) {
      fijarPeriodo(p);
      return false;
    }
    return true;
  }

  return { filtros, periodo, etiqueta, fijarPeriodo, normalizarUrl };
}
