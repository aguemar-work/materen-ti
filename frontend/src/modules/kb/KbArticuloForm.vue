<script setup>
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useKbStore } from '../../stores/kb.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const emit = defineEmits(['cerrar']);

const modal = ref(null);
let resultado = false;

const store = useKbStore();

const cargandoCategorias = ref(true);
const guardando = ref(false);
const error = ref('');
const categorias = ref([]);

const form = ref({ titulo: '', categoria_id: '', sintoma: '', solucion: '' });

const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => form.value);
tomarSnapshot();
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

function confirmarCierre() {
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return false;
  }
  return true;
}

function cancelar() {
  if (confirmarCierre()) modal.value?.cerrar();
}

function descartarCambios() {
  dialogoDescarte.value?.cerrar();
  modal.value?.cerrar();
}

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
      <div class="form-group full">
        <label for="kb-titulo">Título *</label>
        <input id="kb-titulo" v-model="form.titulo" required :disabled="guardando" placeholder="Ej.: No conecta a la VPN institucional">
      </div>

      <div class="form-group full">
        <label for="kb-categoria">Categoría</label>
        <select id="kb-categoria" v-model="form.categoria_id" :disabled="guardando || cargandoCategorias">
          <option value="">Sin categoría</option>
          <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </div>

      <div class="form-group full">
        <label for="kb-sintoma">Síntoma</label>
        <input id="kb-sintoma" v-model="form.sintoma" :disabled="guardando" placeholder="Cómo lo describe quien reporta">
      </div>

      <div class="form-group full">
        <label for="kb-solucion">Solución</label>
        <textarea id="kb-solucion" v-model="form.solucion" rows="6" :disabled="guardando" placeholder="Pasos para resolverlo (texto plano)"></textarea>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #acciones>
      <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
      <button class="btn btn-primary" type="submit" form="kb-form" :disabled="guardando">
        <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
        {{ guardando ? 'Creando...' : 'Crear artículo' }}
      </button>
    </template>
  </Modal>

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
