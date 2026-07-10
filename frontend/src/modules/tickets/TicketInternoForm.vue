<script setup>
// Ticket creado por staff: interno (tarea de TI) o a nombre de un
// empleado que llamó/pasó en persona. Usa la MISMA acción "crear" de
// la edge function que el formulario público — al venir con sesión de
// staff, el backend fija creado_por y respeta origen=staff_interno.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { crearTicket } from '../../api/ticketsPublicos.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { showToast } from '../../core/toast.js';

const emit = defineEmits(['cerrar']);

// Cierre animado (Fase 3): cerrar() dispara la transición de salida y el
// emit real sale en @after-leave, así el padre desmonta sin cortarla.
const visible = ref(true);
let resultadoCierre = false;

function cerrar(resultado) {
  resultadoCierre = resultado;
  visible.value = false;
}

function emitirCierre() {
  emit('cerrar', resultadoCierre);
}

// Foco atrapado mientras el modal vive; al desmontar vuelve a quien lo abrió
const panelModal = ref(null);
useFocoAtrapado(panelModal);

const cargandoCatalogo = ref(true);
const guardando = ref(false);
const error = ref('');

const categorias = ref([]);
const subcategorias = ref([]);
const empleadosActivos = ref([]);

const form = ref({
  categoriaId: '',
  subcategoriaId: '',
  titulo: '',
  descripcion: '',
});

const esParaEmpleado = ref(false);
const busquedaEmpleado = ref('');
const empleadoSelId = ref('');
const listaEmpAbierta = ref(false);

// Solo creación: el snapshot inicial es el form en blanco. El buscador de
// empleado es transitorio; la selección (empleadoSelId) sí cuenta.
const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => ({
  form: form.value,
  esParaEmpleado: esParaEmpleado.value,
  empleadoSelId: empleadoSelId.value,
}));
tomarSnapshot();
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

const subcategoriasFiltradas = computed(() =>
  subcategorias.value.filter((s) => s.categoria_id === form.value.categoriaId)
);

const empleadosFiltrados = computed(() => {
  const q = busquedaEmpleado.value.trim().toLowerCase();
  const base = q
    ? empleadosActivos.value.filter((e) =>
        `${e.nombres} ${e.apellidos}`.toLowerCase().includes(q) || e.dni.includes(q))
    : empleadosActivos.value;
  return base.slice(0, 8);
});

function seleccionarEmpleado(e) {
  empleadoSelId.value = e.id;
  busquedaEmpleado.value = `${e.nombres} ${e.apellidos}`;
  listaEmpAbierta.value = false;
}

function cerrarListaEmpleados() {
  setTimeout(() => { listaEmpAbierta.value = false; }, 150);
}

// Cancelar, la X y Escape pasan por acá: con cambios sin guardar se pide
// confirmación antes de descartar; limpio cierra directo.
function cancelar() {
  if (!visible.value) return;
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return;
  }
  cerrar(false);
}

function descartarCambios() {
  // El diálogo sale animado (su @cancel al terminar baja confirmarDescarte)
  // mientras el formulario inicia su propia salida en paralelo
  dialogoDescarte.value?.cerrar();
  cerrar(false);
}

// Formulario de captura: clic fuera NO cierra (se perdería lo escrito);
// solo Cancelar, la X o Escape.
useCerrarConEscape(() => { if (!guardando.value) cancelar(); });

async function guardar() {
  error.value = '';
  if (!form.value.categoriaId) {
    error.value = 'Selecciona el tipo de solicitud';
    return;
  }
  guardando.value = true;
  try {
    await crearTicket({
      titulo: form.value.titulo.trim(),
      descripcion: form.value.descripcion.trim(),
      categoriaId: form.value.categoriaId,
      subcategoriaId: form.value.subcategoriaId || null,
      origen: esParaEmpleado.value ? undefined : 'staff_interno',
      empleadoIdManual: esParaEmpleado.value ? empleadoSelId.value || null : null,
    });
    tomarSnapshot();
    cerrar(true);
  } catch (e) {
    error.value = e?.message || 'Error al crear el ticket';
  } finally {
    guardando.value = false;
  }
}

onMounted(async () => {
  try {
    const [cats, subs, empleados] = await Promise.all([
      insforgeApi.listCategoriasTicket(),
      insforgeApi.listSubcategoriasTicket(),
      insforgeApi.listEmpleados(),
    ]);
    categorias.value = cats;
    subcategorias.value = subs;
    empleadosActivos.value = empleados.filter((e) => e.estado === 'Activo');
  } catch (e) {
    error.value = e?.message || 'Error al cargar el catálogo';
  } finally {
    cargandoCatalogo.value = false;
  }
});
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal ticket-interno-form" role="dialog" aria-modal="true" aria-labelledby="ti-title" tabindex="-1">
      <div class="modal-title">
        <span id="ti-title">Nuevo ticket interno</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">
        <div class="form-group full">
          <label class="check-inline">
            <input v-model="esParaEmpleado" type="checkbox" :disabled="guardando">
            Es a nombre de un empleado (llamó o pasó en persona)
          </label>
        </div>

        <div v-if="esParaEmpleado" class="form-group full combo-emp">
          <label for="ti-empleado">Empleado</label>
          <div class="combo-wrap">
            <i class="ti ti-search combo-icon"></i>
            <input
              id="ti-empleado"
              v-model="busquedaEmpleado"
              type="text"
              autocomplete="off"
              placeholder="Buscar por nombre o DNI..."
              :class="{ 'combo-ok': empleadoSelId }"
              @input="empleadoSelId = ''; listaEmpAbierta = true"
              @focus="listaEmpAbierta = true"
              @blur="cerrarListaEmpleados"
            >
            <i v-if="empleadoSelId" class="ti ti-circle-check-filled combo-check"></i>
            <ul v-if="listaEmpAbierta && !empleadoSelId" class="combo-lista">
              <li v-if="empleadosFiltrados.length === 0" class="combo-vacio">Sin resultados</li>
              <li v-for="e in empleadosFiltrados" :key="e.id" @mousedown.prevent="seleccionarEmpleado(e)">
                <span>{{ e.nombres }} {{ e.apellidos }}</span>
                <span class="combo-sec">{{ e.dni }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="form-group full">
          <label for="ti-categoria">Tipo de solicitud *</label>
          <select id="ti-categoria" v-model="form.categoriaId" required :disabled="guardando || cargandoCatalogo">
            <option value="" disabled>Seleccionar</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </div>

        <div v-if="subcategoriasFiltradas.length" class="form-group full">
          <label for="ti-subcategoria">Subcategoría</label>
          <select id="ti-subcategoria" v-model="form.subcategoriaId" :disabled="guardando">
            <option value="">Seleccionar (opcional)</option>
            <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
        </div>

        <div class="form-group full">
          <label for="ti-titulo">Resumen breve *</label>
          <input id="ti-titulo" v-model="form.titulo" required :disabled="guardando">
        </div>

        <div class="form-group full">
          <label for="ti-descripcion">Detalle *</label>
          <textarea id="ti-descripcion" v-model="form.descripcion" required rows="4" :disabled="guardando"></textarea>
        </div>

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            {{ guardando ? 'Creando...' : 'Crear ticket' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  </Transition>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Tienes cambios sin guardar, ¿deseas continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
/* Ancho: .modal base (540px) de la escala centralizada (main.css) */

.check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  color: var(--color-text-primary);
  cursor: pointer;
}

.combo-wrap { position: relative; }
.combo-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-text-secondary); font-size: 15px; pointer-events: none;
}
.combo-wrap input { width: 100%; padding-left: 32px; padding-right: 32px; }
.combo-wrap input.combo-ok { border-color: var(--color-success); }
.combo-check {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-success); font-size: 16px; pointer-events: none;
}
.combo-lista {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: var(--z-popover);
  margin: 0; padding: 4px; list-style: none;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-height: 220px; overflow-y: auto;
}
.combo-lista li {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: var(--fs-base);
}
.combo-lista li:hover { background: var(--color-accent-subtle); }
.combo-vacio { color: var(--color-text-secondary); cursor: default !important; font-size: var(--fs-sm); }
.combo-vacio:hover { background: none !important; }
.combo-sec { font-size: var(--fs-sm); color: var(--color-text-secondary); }

.modal-actions.full { grid-column: 1 / -1; }
</style>
