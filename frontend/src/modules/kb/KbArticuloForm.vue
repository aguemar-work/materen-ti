<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useKbStore } from '../../stores/kb.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';

const emit = defineEmits(['cerrar']);

let resultado = false;

const store = useKbStore();

const cargandoCategorias = ref(true);
const guardando = ref(false);
const error = ref('');
const categorias = ref([]);

const form = ref({ titulo: '', categoria_id: '', sintoma: '', solucion: '' });
const infoError = infoNotificacion('error');

const campoTitulo = useCampoAccesible();
const campoCategoria = useCampoAccesible();
const campoSintoma = useCampoAccesible();
const campoSolucion = useCampoAccesible();

const { modal, mensajeError, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

async function guardar() {
  error.value = '';
  if (!form.value.titulo.trim()) {
    error.value = 'Escriba un título';
    return;
  }
  guardando.value = true;
  try {
    const articulo = await store.crear({
      titulo: form.value.titulo,
      categoria_id: form.value.categoria_id || null,
      sintoma: form.value.sintoma,
      solucion: form.value.solucion,
    });
    tomarSnapshot();
    resultado = articulo;
    modal.value?.cerrar();
  } catch (e) {
    error.value = mensajeError(e, { porDefecto: 'Error al crear el artículo' });
  } finally {
    guardando.value = false;
  }
}

onMounted(async () => {
  try {
    categorias.value = await insforgeApi.listCategoriasTicket();
  } catch (e) {
    error.value = e?.message || 'Error al cargar categorías';
  } finally {
    cargandoCategorias.value = false;
  }
});
</script>

<template>
  <AppDialog ref="modal" titulo="Nuevo artículo" :confirmar-cierre="confirmarCierre" @cerrado="emit('cerrar', resultado)">
    <form id="kb-form" class="form-grid" @submit.prevent="guardar">
      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTitulo.id">Título<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoTitulo.id"
            v-model="form.titulo"
            class="campo__control"
            type="text"
            required
            placeholder="Ej.: No conecta a la VPN institucional"
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando || cargandoCategorias }">
        <label class="campo__etiqueta" :for="campoCategoria.id">Categoría</label>
        <div class="campo__caja">
          <select
            :id="campoCategoria.id"
            class="campo__control campo__control--select"
            :value="form.categoria_id"
            :disabled="guardando || cargandoCategorias"
            @change="form.categoria_id = $event.target.value"
          >
            <option value="">Sin categoría</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoSintoma.id">Síntoma</label>
        <div class="campo__caja">
          <input
            :id="campoSintoma.id"
            v-model="form.sintoma"
            class="campo__control"
            type="text"
            placeholder="Cómo lo describe quien reporta"
            :disabled="guardando"
          >
        </div>
      </div>

      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoSolucion.id">Solución</label>
        <div class="campo__caja">
          <textarea
            :id="campoSolucion.id"
            v-model="form.solucion"
            class="campo__control campo__control--area"
            :rows="8"
            placeholder="Pasos para resolverlo (texto plano)"
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
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="kb-form" :label="guardando ? 'Creando...' : 'Crear artículo'" :loading="guardando" :disabled="guardando" />
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>


