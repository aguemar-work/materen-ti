<script setup>
// Ticket creado por staff: interno (tarea de TI) o a nombre de un
// empleado que llamó/pasó en persona. Usa la MISMA acción "crear" de
// la edge function que el formulario público — al venir con sesión de
// staff, el backend fija creado_por y respeta origen=staff_interno.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { crearTicket } from '../../api/ticketsPublicos.js';
import { OPCIONES_TIPO as TIPOS } from '../../core/dominio-tickets.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';

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
  tipo: '',
});

const esParaEmpleado = ref(false);
const empleadoSelId = ref('');

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

// Precarga Tipo con el default de la subcategoría elegida (tipo_sugerido);
// queda vacío si la subcategoría es una de las ambiguas a propósito o si
// no hay subcategoría seleccionada. El staff puede corregirlo con el select
// antes de crear el ticket — esto solo fija el valor inicial.
watch(() => form.value.subcategoriaId, (id) => {
  const sub = subcategorias.value.find((s) => s.id === id);
  form.value.tipo = sub?.tipo_sugerido || '';
});

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
      tipo: form.value.tipo || null,
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

        <div v-if="esParaEmpleado" class="form-group full">
          <label for="ti-empleado">Empleado</label>
          <BuscadorCombo
            id="ti-empleado"
            v-model="empleadoSelId"
            :items="empleadosActivos"
            :campos-busqueda="['nombres', 'apellidos', 'dni']"
            :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
            placeholder="Buscar por nombre o DNI..."
            :disabled="guardando"
          >
            <template #resultado="{ item }">
              <span>{{ item.nombres }} {{ item.apellidos }}</span>
              <span class="combo-sec">{{ item.dni }}</span>
            </template>
          </BuscadorCombo>
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
          <label for="ti-tipo">Tipo</label>
          <select id="ti-tipo" v-model="form.tipo" :disabled="guardando">
            <option value="">Sin definir</option>
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
          </select>
        </div>

        <div class="form-group full">
          <label for="ti-titulo">Resumen breve *</label>
          <input id="ti-titulo" v-model="form.titulo" required maxlength="200" :disabled="guardando">
        </div>

        <div class="form-group full">
          <label for="ti-descripcion">Detalle *</label>
          <textarea id="ti-descripcion" v-model="form.descripcion" required rows="4" maxlength="5000" :disabled="guardando"></textarea>
        </div>

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
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
    mensaje="Hay cambios sin guardar. ¿Desea continuar?"
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

.modal-actions.full { grid-column: 1 / -1; }
</style>
