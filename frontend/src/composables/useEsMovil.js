import { ref, onMounted, onUnmounted } from 'vue';

// Mismo corte que ya usa el resto del sistema en CSS (main.css,
// .solo-movil/.solo-escritorio, @media max-width: 768px) — acá el mismo
// valor pero como estado reactivo en JS, para decisiones de
// COMPORTAMIENTO (no solo de estilo). Primer uso: TicketsView.vue decide
// si el click de una fila abre el panel del split-view (desktop) o navega
// a /tickets/:id como página completa (mobile, sin cambios).
const CONSULTA_MOVIL = '(max-width: 768px)';

export function useEsMovil() {
  const mql = window.matchMedia(CONSULTA_MOVIL);
  const esMovil = ref(mql.matches);

  function actualizar(e) {
    esMovil.value = e.matches;
  }

  onMounted(() => mql.addEventListener('change', actualizar));
  onUnmounted(() => mql.removeEventListener('change', actualizar));

  return { esMovil };
}
