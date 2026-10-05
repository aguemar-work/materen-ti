import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { insforgeApi } from '../api/insforge.js';
import { ticketsSinAsignar } from '../core/resumen-inicio.js';

// Resumen del Inicio (RPC `dashboard_resumen`, migración 103), compartido por
// DOS lectores: el Inicio (`DashboardView`) y el contador de tickets sin
// asignar del menú (`AppLayout`). Un solo store = una sola llamada: antes el
// layout repetía `pendientesTickets()` y el Inicio disparaba ≈25 requests.
//
// Reglas de carga:
//   · Una carga en curso se COMPARTE: si el layout y el Inicio piden a la vez
//     (se montan juntos), la segunda llamada recibe la misma promesa.
//   · Stale-while-revalidate: recargar no borra `resumen`; la pantalla sigue
//     mostrando lo anterior y solo enciende `cargando` (la línea de 2 px).
//     `cargar({ silencioso: true })` (realtime, volver a la pestaña) ni
//     siquiera enciende `cargando`.
//   · Si la RPC falla ENTERA, `error` lleva el mensaje ya traducido y
//     `resumen` conserva el último valor bueno (o `null` si nunca hubo uno).
//     Nunca se interpreta como "al día".
//   · `errores` son las secciones que fallaron DENTRO de una respuesta buena.
//   · El Inicio se carga con `cargarSiHaceFalta()`: la ruta de /dashboard es
//     un chunk diferido y el menú (que se monta antes) ya pudo pedir el
//     resumen y terminar. Un intento reciente —bueno o malo— se respeta: así
//     abrir el Inicio es UNA llamada de datos y un fallo reciente no se
//     "reintenta" a espaldas de quien lo va a leer. "Reintentar" sí llama.
export const useDashboardStore = defineStore('dashboard', () => {
  const resumen = ref(null);
  const cargando = ref(false);
  const error = ref('');
  const errores = ref([]);
  const ultimaCarga = ref(null);

  // No reactivo a propósito: es la mecánica de deduplicación, no estado de
  // pantalla. Vive dentro del setup para que cada instancia de Pinia (cada
  // prueba) tenga la suya.
  let enCurso = null;
  let ultimoIntento = 0; // ms; cualquier intento terminado, bueno o malo

  async function pedir() {
    try {
      const datos = await insforgeApi.getResumen();
      resumen.value = datos;
      errores.value = datos.errores || [];
      error.value = '';
      ultimaCarga.value = new Date().toISOString();
    } catch (e) {
      // `getResumen` ya lanza el mensaje traducido (api/erroresDb.js).
      error.value = e?.message || 'No se pudo cargar el resumen del Inicio.';
    } finally {
      enCurso = null;
      ultimoIntento = Date.now();
      cargando.value = false;
    }
  }

  /**
   * @param {{ silencioso?: boolean }} [opciones] `silencioso` no enciende
   *   `cargando` (refrescos de fondo). Nunca lanza: el fallo queda en `error`.
   */
  function cargar({ silencioso = false } = {}) {
    if (!silencioso) cargando.value = true;
    if (!enCurso) enCurso = pedir();
    return enCurso;
  }

  /**
   * Carga solo si no hubo un intento hace menos de `maxEdadMs` (ni uno en
   * curso: ese se comparte igual). Es lo que usa el Inicio al montarse.
   */
  function cargarSiHaceFalta({ maxEdadMs = 5000 } = {}) {
    if (!enCurso && Date.now() - ultimoIntento < maxEdadMs) return Promise.resolve();
    return cargar();
  }

  // Lo que muestra el badge de "Tickets" en el menú (misma regla de siempre:
  // vigentes sin asignar). 0 sin módulo tickets o antes de la primera carga.
  const sinAsignar = computed(() => ticketsSinAsignar(resumen.value));

  return { resumen, cargando, error, errores, ultimaCarga, sinAsignar, cargar, cargarSiHaceFalta };
});
