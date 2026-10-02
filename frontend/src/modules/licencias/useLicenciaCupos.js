// Cupos (asientos) de las licencias del listado: la barra de capacidad, el
// aviso "sin asientos libres" del subtítulo y los chips de usuarios que se
// expanden. Extraído de LicenciasView.vue al partirla; no cambia ninguna regla.
import { computed, ref } from 'vue';

// Barra de capacidad: comunica cercanía al tope de asientos antes de que
// el trigger de BD (check_tope_licencia) bloquee la asignación.
export function capacidadInfo(l) {
  const pct = l.cantidad > 0 ? Math.min(100, Math.round((l.usados / l.cantidad) * 100)) : 0;
  let clase = 'bg-green-500';
  if (pct >= 100) clase = 'bg-red-500';
  else if (pct >= 70) clase = 'bg-amber-500';
  return { pct, clase, libres: Math.max(0, l.cantidad - l.usados) };
}

// Vencidas y por vencer ya las cuentan las vistas; "sin asientos libres" no
// se puede filtrar en el servidor, así que se informa en el subtítulo, y solo
// cuando la página trae TODAS las filas (contar sobre una página parcial
// mentiría).
export function useLicenciaCupos({ lista, total }) {
  const sinCupo = computed(() => {
    if (!lista.value.length || lista.value.length < total.value) return 0;
    return lista.value.filter((l) => l.cantidad > 0 && l.usados >= l.cantidad).length;
  });
  return { sinCupo };
}

// Chips de usuarios: se muestran los primeros y el resto tras "+N".
const MAX_CHIPS = 2;

export function useUsuariosVisibles() {
  const expandidas = ref(new Set());
  function usuariosVisibles(l) {
    return expandidas.value.has(l.id) ? l.usuarios : l.usuarios.slice(0, MAX_CHIPS);
  }
  function expandir(l) {
    expandidas.value = new Set([...expandidas.value, l.id]);
  }
  return { usuariosVisibles, expandir };
}
