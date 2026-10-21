import { ref, reactive, computed } from 'vue';
import { showToast } from '../core/toast.js';
import { traducirErrorDb } from '../api/erroresDb.js';
import { nivelesParaEscalar, nivelesParaDevolver, ESTADOS_TERMINALES } from '../core/dominio-tickets.js';

// Escalamiento por niveles de la ficha del ticket (migración 121): qué se
// puede hacer (escalar, devolver de nivel, registrar un avance), el tramo
// actual y los anteriores, y qué diálogo está abierto. Lo usa
// useTicketDetalleLogica y lo devuelve como un solo objeto `escalamiento`
// para TicketEscalamiento.vue (mismo patrón que `reclasificacion`): los
// contenedores (página y panel) solo lo pasan.
//
// Las reglas repiten las del servidor (lo que la RPC rechazaría no se
// ofrece): el módulo tickets, el ticket en atención (en progreso o
// reabierto) para escalar o devolver, un nivel por encima o por debajo del
// actual, y un tramo abierto en un ticket no terminado para los avances.
const ESTADOS_ESCALABLES = ['en_progreso', 'reabierto'];

export function useTicketEscalamiento({ ticket, auth, store }) {
  const dialogo = ref(null);

  const tramos = computed(() => store.escalamientos || []);
  const tramoActual = computed(() => tramos.value.find((t) => !t.fin_at) || null);

  const conModulo = computed(() => !!ticket.value && auth.puedeVerModulo('tickets'));
  const escalable = computed(() => conModulo.value && ESTADOS_ESCALABLES.includes(ticket.value.estado));
  const puedeEscalar = computed(() => escalable.value && nivelesParaEscalar(ticket.value.nivel_atencion).length > 0);
  const puedeDevolver = computed(() => escalable.value && nivelesParaDevolver(ticket.value.nivel_atencion).length > 0);
  const puedeAvance = computed(() => conModulo.value && !!tramoActual.value && !ESTADOS_TERMINALES.includes(ticket.value.estado));
  // La sección aparece si hay algo que hacer o algo que contar.
  const visible = computed(() => !!ticket.value && (tramos.value.length > 0 || puedeEscalar.value));

  function abrir(tipo) {
    dialogo.value = tipo;
  }

  const TOAST = {
    escalar: (r) => `Ticket escalado a ${r?.nivel || 'otro nivel'}`,
    devolver: (r) => `Ticket devuelto a ${r?.nivel || 'otro nivel'}`,
    avance: () => 'Avance registrado',
  };

  // Cada diálogo emite la respuesta de su RPC, o null si se canceló.
  async function alCerrar(resultado) {
    const tipo = dialogo.value;
    dialogo.value = null;
    if (!resultado) return;
    showToast(TOAST[tipo]?.(resultado) || 'Escalamiento actualizado');
    try {
      await store.recargarTrasEscalar();
    } catch (e) {
      showToast(traducirErrorDb(e, { porDefecto: 'El cambio se guardó, pero no se pudo actualizar la ficha. Recargue la página.' }).mensaje, 'error');
    }
  }

  return reactive({
    visible, puedeEscalar, puedeDevolver, puedeAvance,
    tramos, tramoActual,
    dialogo, abrir, alCerrar,
  });
}
