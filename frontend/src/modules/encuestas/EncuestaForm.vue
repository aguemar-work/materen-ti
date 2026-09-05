<script setup>
// Builder de plantilla de encuesta (solo JEFE — la vista que lo abre ya
// lo verifica, esto es defensa en profundidad). Si la encuesta ya tiene
// rondas, el trigger de BD (migración 043) rechaza el cambio de
// "preguntas" con un mensaje pensado para mostrarse tal cual; no se
// duplica esa regla acá, se deja que el intento de guardar la revele.
import { ref } from 'vue';
import { useEncuestasStore } from '../../stores/encuestas.js';
import { TIPOS_PREGUNTA, nuevaPregunta } from '../../core/dominio-encuestas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  encuesta: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const store = useEncuestasStore();
const esEdicion = !!props.encuesta?.id;
const guardando = ref(false);
const errorForm = ref('');

const form = ref({
  titulo: props.encuesta?.titulo || '',
  descripcion: props.encuesta?.descripcion || '',
  preguntas: props.encuesta ? JSON.parse(JSON.stringify(props.encuesta.preguntas || [])) : [],
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, descartarCambios } =
  useFormularioModal(() => form.value);
tomarSnapshot();

function agregarPregunta() {
  form.value.preguntas.push(nuevaPregunta());
}

function quitarPregunta(idx) {
  form.value.preguntas.splice(idx, 1);
}

function moverPregunta(idx, delta) {
  const destino = idx + delta;
  if (destino < 0 || destino >= form.value.preguntas.length) return;
  const [p] = form.value.preguntas.splice(idx, 1);
  form.value.preguntas.splice(destino, 0, p);
}

// El textarea de opciones guarda una por línea; se convierte a array al
// escribir y de vuelta a texto al mostrar, sin campo extra en el modelo.
function opcionesTexto(pregunta) {
  return (pregunta.opciones || []).join('\n');
}
function onOpcionesInput(pregunta, texto) {
  pregunta.opciones = texto.split('\n').map((o) => o.trim()).filter(Boolean);
}

function cerrar() {
  if (confirmarCierre()) modal.value?.cerrar();
}

async function guardar() {
  errorForm.value = '';
  if (!form.value.titulo.trim()) {
    errorForm.value = 'El título es obligatorio';
    return;
  }
  if (!form.value.preguntas.length) {
    errorForm.value = 'Agregue al menos una pregunta';
    return;
  }
  for (const p of form.value.preguntas) {
    if (!p.etiqueta.trim()) {
      errorForm.value = 'Todas las preguntas necesitan un texto';
      return;
    }
    if (p.tipo === 'opcion_unica' && (p.opciones || []).length < 2) {
      errorForm.value = `La pregunta “${p.etiqueta}” necesita al menos 2 opciones`;
      return;
    }
  }
  guardando.value = true;
  try {
    if (esEdicion) {
      await store.actualizar(props.encuesta.id, form.value);
    } else {
      await store.crear(form.value);
    }
    tomarSnapshot();
    modal.value?.cerrar();
  } catch (e) {
    errorForm.value = e?.message || 'Error al guardar la encuesta';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal ref="modal" :titulo="esEdicion ? 'Editar encuesta' : 'Nueva encuesta'" size="lg" :confirmar-cierre="confirmarCierre" @close="emit('cerrar')">
    <form id="enc-form" class="enc-form" @submit.prevent="guardar">
      <CarbonCampo
        v-model="form.titulo"
        etiqueta="Título"
        requerido
        placeholder="ej: Satisfacción general de TI"
        :deshabilitado="guardando"
      />

      <CarbonCampo
        v-model="form.descripcion"
        etiqueta="Descripción"
        tipo="textarea"
        :filas="2"
        placeholder="Se muestra a quien responde, antes de las preguntas"
        :deshabilitado="guardando"
      />

      <div class="preguntas-header">
        <label>Preguntas *</label>
        <CarbonButton variante="secondary" tam="sm" icono="ti-plus" :deshabilitado="guardando" @click="agregarPregunta">Agregar pregunta</CarbonButton>
      </div>

      <div v-for="(p, idx) in form.preguntas" :key="p.id" class="pregunta-card">
        <div class="pregunta-fila">
          <select v-model="p.tipo" aria-label="Tipo de pregunta" :disabled="guardando">
            <option v-for="(info, tipo) in TIPOS_PREGUNTA" :key="tipo" :value="tipo">{{ info.label }}</option>
          </select>
          <input v-model="p.etiqueta" aria-label="Texto de la pregunta" placeholder="ej: ¿Cómo calificaría la atención recibida?" :disabled="guardando" class="pregunta-etiqueta">
          <label class="pregunta-requerido">
            <input type="checkbox" v-model="p.requerido" :disabled="guardando"> Requerida
          </label>
          <div class="pregunta-acciones">
            <button class="icon-btn" type="button" title="Subir" aria-label="Subir" :disabled="guardando || idx === 0" @click="moverPregunta(idx, -1)">
              <i class="ti ti-arrow-up"></i>
            </button>
            <button class="icon-btn" type="button" title="Bajar" aria-label="Bajar" :disabled="guardando || idx === form.preguntas.length - 1" @click="moverPregunta(idx, 1)">
              <i class="ti ti-arrow-down"></i>
            </button>
            <button class="icon-btn danger" type="button" title="Quitar" aria-label="Quitar pregunta" :disabled="guardando" @click="quitarPregunta(idx)">
              <i class="ti ti-trash"></i>
            </button>
          </div>
        </div>
        <CarbonCampo
          v-if="p.tipo === 'opcion_unica'"
          :model-value="opcionesTexto(p)"
          etiqueta="Opciones (una por línea)"
          tipo="textarea"
          requerido
          placeholder="Excelente&#10;Bueno&#10;Regular&#10;Malo"
          :deshabilitado="guardando"
          @update:model-value="onOpcionesInput(p, $event)"
        />
      </div>

      <CarbonNotification v-if="errorForm" tipo="error">{{ errorForm }}</CarbonNotification>
    </form>
    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cerrar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="enc-form" :cargando="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
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
.enc-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preguntas-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}

.pregunta-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pregunta-fila {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pregunta-etiqueta { flex: 1; min-width: 160px; }

.pregunta-requerido {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-body-01);
  font-weight: 400;
  white-space: nowrap;
}

.pregunta-acciones {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
</style>
