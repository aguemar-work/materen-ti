<script setup>
// Ticket creado por staff: interno (tarea de TI) o a nombre de un
// empleado que llamó/pasó en persona. Usa la MISMA acción "crear" de
// la edge function que el formulario público — al venir con sesión de
// staff, el backend fija creado_por y respeta origen=staff_interno.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { crearTicket } from '../../api/ticketsPublicos.js';
import { OPCIONES_TIPO as TIPOS } from '../../core/dominio-tickets.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (mismo patrón que EmpleadoForm.vue/AccesoSensibleForm.vue):
// Teleport, bloqueo de scroll del body, atrapamiento de foco y Escape los
// resuelve el componente compartido.
let resultado = false;

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
const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
    form: form.value,
    esParaEmpleado: esParaEmpleado.value,
    empleadoSelId: empleadoSelId.value,
  }));
tomarSnapshot();

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
    resultado = true;
    modal.value?.cerrar();
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
  <Modal
    ref="modal"
    titulo="Nuevo ticket interno"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="ti-form" class="form-grid" @submit.prevent="guardar">
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

        <CarbonCampo class="full" v-model="form.categoriaId" etiqueta="Tipo de solicitud" tipo="select" requerido :deshabilitado="guardando || cargandoCatalogo">
          <template #opciones>
            <option value="" disabled>Seleccionar</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </template>
        </CarbonCampo>

        <CarbonCampo v-if="subcategoriasFiltradas.length" class="full" v-model="form.subcategoriaId" etiqueta="Subcategoría" tipo="select" :deshabilitado="guardando">
          <template #opciones>
            <option value="">Seleccionar (opcional)</option>
            <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </template>
        </CarbonCampo>

        <CarbonCampo class="full" v-model="form.tipo" etiqueta="Tipo" tipo="select" :deshabilitado="guardando">
          <template #opciones>
            <option value="">Sin definir</option>
            <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
          </template>
        </CarbonCampo>

        <CarbonCampo class="full" v-model="form.titulo" etiqueta="Resumen breve" requerido maxlength="200" :deshabilitado="guardando" />

        <CarbonCampo class="full" v-model="form.descripcion" etiqueta="Detalle" tipo="textarea" :filas="4" requerido maxlength="5000" :deshabilitado="guardando" />

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="ti-form" :cargando="guardando">
        {{ guardando ? 'Creando...' : 'Crear ticket' }}
      </CarbonButton>
    </template>
  </Modal>

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

/* CarbonCampo no puede envolverse en el viejo .form-group.full (le filtraría
   el estilo de <input>/<select>/<textarea> anterior), así que repite solo el
   grid-column (mismo criterio que EquipoForm.vue/EmpleadoForm.vue). */
.full {
  grid-column: 1 / -1;
}

.check-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-body-01);
  color: var(--color-text-primary);
  cursor: pointer;
}
</style>
