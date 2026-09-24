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
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const emit = defineEmits(['cerrar']);

// Migrado a AppDialog.vue (2026-09-08, Fase 3 de Tickets — primevue/dialog
// Unstyled + Tailwind, ver components/ui/AppDialog.vue): Teleport, foco
// atrapado, Escape, aria-modal y backdrop los resuelve PrimeVue Dialog por
// dentro. Sigue siendo el único formulario migrado a AppDialog — el resto
// de los ~21 formularios sobre <Modal> (EmpleadoForm.vue,
// AccesoSensibleForm.vue, etc.) no se tocaron, fuera de alcance de esta
// fase. useFormularioModal.js no supo nada de este cambio: su contrato
// (`modal.value?.cerrar()` incondicional + `:confirmar-cierre` como veto)
// es el mismo que ya exponía Modal.vue.
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

const campoCategoria = useCampoAccesible();
const campoSubcategoria = useCampoAccesible();
const campoTipo = useCampoAccesible();
const campoTitulo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
const infoError = infoNotificacion('error');

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
    error.value = 'Seleccione el tipo de solicitud';
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
  <AppDialog
    ref="modal"
    titulo="Nuevo ticket interno"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="ti-form" class="form-grid" @submit.prevent="guardar">
        <!-- Para quién es: interno de TI (por defecto) o a nombre de un
             empleado. Va primero porque cambia qué más hay que llenar. -->
        <div class="full">
          <label class="flex cursor-pointer items-start gap-2.5 rounded-md bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
            <input v-model="esParaEmpleado" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="guardando">
            <span>
              <span class="font-medium text-gray-900">Es a nombre de un empleado</span>
              <span class="block text-xs text-gray-500">Llamó o pasó en persona. Sin marcar, queda como tarea interna de TI.</span>
            </span>
          </label>
        </div>

        <div v-if="esParaEmpleado" class="campo full">
          <label class="campo__etiqueta" for="ti-empleado">Empleado</label>
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
              <span class="ml-auto text-xs text-gray-500 tabular-nums">{{ item.dni }}</span>
            </template>
          </BuscadorCombo>
        </div>

        <div class="campo full" :class="{ 'campo--inerte': guardando || cargandoCatalogo }">
          <label class="campo__etiqueta" :for="campoCategoria.id">
            Tipo de solicitud<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <select
              :id="campoCategoria.id"
              class="campo__control campo__control--select"
              :value="form.categoriaId"
              required
              :disabled="guardando || cargandoCatalogo"
              @change="form.categoriaId = $event.target.value"
            >
              <option value="" disabled>Seleccionar</option>
              <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div v-if="subcategoriasFiltradas.length" class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoSubcategoria.id">Subcategoría</label>
          <div class="campo__caja">
            <select
              :id="campoSubcategoria.id"
              class="campo__control campo__control--select"
              :value="form.subcategoriaId"
              :disabled="guardando"
              @change="form.subcategoriaId = $event.target.value"
            >
              <option value="">Seleccionar (opcional)</option>
              <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando, full: !subcategoriasFiltradas.length }">
          <label class="campo__etiqueta" :for="campoTipo.id">Tipo</label>
          <div class="campo__caja">
            <select
              :id="campoTipo.id"
              class="campo__control campo__control--select"
              :value="form.tipo"
              :disabled="guardando"
              @change="form.tipo = $event.target.value"
            >
              <option value="">Sin definir</option>
              <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo full" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoTitulo.id">
            Resumen breve<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <input
              :id="campoTitulo.id"
              v-model="form.titulo"
              class="campo__control"
              type="text"
              required
              maxlength="200"
              :disabled="guardando"
            >
          </div>
        </div>

        <div class="campo full" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoDescripcion.id">
            Detalle<span aria-hidden="true"> *</span>
          </label>
          <div class="campo__caja">
            <textarea
              :id="campoDescripcion.id"
              v-model="form.descripcion"
              class="campo__control campo__control--area"
              :rows="4"
              required
              maxlength="5000"
              :disabled="guardando"
            ></textarea>
          </div>
        </div>

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>
    </form>

    <template #acciones>
      <AppButton variant="text" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton
        type="submit"
        form="ti-form"
        severity="primary"
        :label="guardando ? 'Creando...' : 'Crear ticket'"
        :loading="guardando"
      />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar. ¿Desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>


