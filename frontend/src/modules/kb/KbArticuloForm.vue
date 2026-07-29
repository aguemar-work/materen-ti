<script setup>
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useKbStore } from '../../stores/kb.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const emit = defineEmits(['cerrar']);

// Cierre animado (mismo patrón que TicketInternoForm/CorreoForm): cerrar()
// dispara la transición de salida y el emit real sale en @after-leave.
const visible = ref(true);
let resultadoCierre = false;

function cerrar(resultado) {
  resultadoCierre = resultado;
  visible.value = false;
}

function emitirCierre() {
  emit('cerrar', resultadoCierre);
}

const panelModal = ref(null);
useFocoAtrapado(panelModal);

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

function cancelar() {
  if (!visible.value) return;
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return;
  }
  cerrar(false);
}

function descartarCambios() {
  dialogoDescarte.value?.cerrar();
  cerrar(false);
}

useCerrarConEscape(() => { if (!guardando.value) cancelar(); });

async function guardar() {
  error.value = '';
  if (!form.value.titulo.trim()) {
    error.value = 'Escribe un título';
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
    cerrar(articulo);
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
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal kb-articulo-form" role="dialog" aria-modal="true" aria-labelledby="kb-form-title" tabindex="-1">
      <div class="modal-title">
        <span id="kb-form-title">Nuevo artículo</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">
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
        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ guardando ? 'Creando...' : 'Crear artículo' }}
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
.modal-actions.full { grid-column: 1 / -1; }
</style>
