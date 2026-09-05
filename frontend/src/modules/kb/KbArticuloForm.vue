<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useKbStore } from '../../stores/kb.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const emit = defineEmits(['cerrar']);

let resultado = false;

const store = useKbStore();

const cargandoCategorias = ref(true);
const guardando = ref(false);
const error = ref('');
const categorias = ref([]);

const form = ref({ titulo: '', categoria_id: '', sintoma: '', solucion: '' });

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
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
    error.value = e?.message || 'Error al crear el artículo';
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
  <Modal ref="modal" titulo="Nuevo artículo" :confirmar-cierre="confirmarCierre" @close="emit('cerrar', resultado)">
    <form id="kb-form" class="form-grid" @submit.prevent="guardar">
      <CarbonCampo
        v-model="form.titulo"
        class="full"
        etiqueta="Título"
        requerido
        :deshabilitado="guardando"
        placeholder="Ej.: No conecta a la VPN institucional"
      />

      <CarbonCampo v-model="form.categoria_id" class="full" etiqueta="Categoría" tipo="select" :deshabilitado="guardando || cargandoCategorias">
        <template #opciones>
          <option value="">Sin categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </template>
      </CarbonCampo>

      <CarbonCampo
        v-model="form.sintoma"
        class="full"
        etiqueta="Síntoma"
        :deshabilitado="guardando"
        placeholder="Cómo lo describe quien reporta"
      />

      <CarbonCampo
        v-model="form.solucion"
        class="full"
        etiqueta="Solución"
        tipo="textarea"
        :filas="6"
        :deshabilitado="guardando"
        placeholder="Pasos para resolverlo (texto plano)"
      />

      <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="kb-form" :cargando="guardando">
        {{ guardando ? 'Creando...' : 'Crear artículo' }}
      </CarbonButton>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
/* .form-group.full (main.css) exige la clase .form-group, que trae consigo
   estilos de <input>/<select> viejos que pisarían los de CarbonCampo — acá
   se repite solo el grid-column. Vue aplica el scope del padre también a la
   raíz de un componente hijo (CarbonCampo incluido), así que esta regla
   simple alcanza a los <CarbonCampo class="full">. */
.full {
  grid-column: 1 / -1;
}
</style>
