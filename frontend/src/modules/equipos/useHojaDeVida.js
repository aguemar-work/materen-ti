// Datos de la hoja de vida de UN equipo (`/equipos/:id`): el equipo, su kardex y
// el portador actual. Aparte de EquipoDetalleView.vue para que la vista quede
// en lo que dibuja.
//
// Tres estados de carga honestos (la vista los distingue):
//   · 'ok'             el equipo existe y se leyó
//   · 'no_encontrado'  el servidor respondió y no hay equipo (id inexistente o
//                      eliminado): reintentar no lo arregla
//   · 'error'          no se pudo leer (red, sesión, permisos): reintentar sí
// El kardex se pide aparte y su fallo NO tumba la hoja: `kardexError` lo
// muestra dentro de su sección, con reintento.
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { filasKardex } from './kardex.js';

export function useHojaDeVida(idDe) {
  const estado = ref('cargando'); // 'cargando' | 'ok' | 'no_encontrado' | 'error'
  const mensaje = ref('');
  const equipo = ref(null);
  const portador = ref(null); // ficha del empleado que lo tiene (para el DNI enmascarado impreso)

  const filas = ref([]);
  const actas = ref([]);
  const kardexCargando = ref(false);
  const kardexError = ref('');

  // Acta de entrega firmada vigente de la asignación actual, si la hay.
  const actaEntrega = computed(() => {
    const asignacionId = equipo.value?.asignacion_id;
    if (!asignacionId) return null;
    return actas.value.find((a) => a.asignacionId === asignacionId && a.tipo === 'entrega') || null;
  });

  async function cargarKardex() {
    const id = idDe();
    kardexCargando.value = true;
    kardexError.value = '';
    try {
      const [eventos, asignaciones, nombres] = await Promise.all([
        insforgeApi.eventosEquipo(id),
        insforgeApi.asignacionesDeEquipo(id),
        insforgeApi.nombresStaff().catch(() => []), // sin nombres, "Por" cae al correo
      ]);
      // Las actas viven en otra tabla (migración 110): si aún no existe o no
      // hay permiso, el kardex se muestra igual, sin enlaces a actas.
      let listaActas = [];
      try {
        listaActas = await insforgeApi.listActasEquipo(id);
      } catch {
        listaActas = [];
      }
      actas.value = listaActas;
      filas.value = filasKardex({
        equipoId: id,
        eventos,
        asignaciones,
        actas: listaActas,
        nombresStaff: new Map((nombres || []).map((n) => [n.user_id, n.nombre])),
      });
    } catch (e) {
      kardexError.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar el kardex.' }).mensaje;
    } finally {
      kardexCargando.value = false;
    }
  }

  async function cargarPortador(eq) {
    portador.value = null;
    if (!eq?.empleado_id) return;
    try {
      portador.value = await insforgeApi.getEmpleado(eq.empleado_id);
    } catch {
      portador.value = null; // solo afecta al DNI enmascarado del impreso
    }
  }

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) estado.value = 'cargando';
    mensaje.value = '';
    try {
      const eq = await insforgeApi.getEquipo(idDe());
      if (!eq) {
        equipo.value = null;
        estado.value = 'no_encontrado';
        return;
      }
      equipo.value = eq;
      estado.value = 'ok';
      cargarPortador(eq);
      await cargarKardex();
    } catch (e) {
      // Con la hoja ya a la vista, un fallo de recarga no la reemplaza por un error.
      if (silencioso && equipo.value) return;
      equipo.value = null;
      mensaje.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar el equipo.' }).mensaje;
      estado.value = 'error';
    }
  }

  return { estado, mensaje, equipo, portador, filas, actas, actaEntrega, kardexCargando, kardexError, cargar, cargarKardex };
}
