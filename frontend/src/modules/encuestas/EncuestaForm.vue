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
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const infoError = infoNotificacion('error');

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

const campoTitulo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();

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
      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoTitulo.id">Título<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoTitulo.id"
            v-model="form.titulo"
            class="campo__control"
            type="text"
            placeholder="ej: Satisfacción general de TI"
            required
            :disabled="guardando"
            :aria-invalid="campoTitulo.invalido.value"
            :aria-describedby="campoTitulo.describedBy.value"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoDescripcion.id">Descripción</label>
        <div class="campo__caja">
          <textarea
            :id="campoDescripcion.id"
            v-model="form.descripcion"
            class="campo__control"
            :rows="2"
            placeholder="Se muestra a quien responde, antes de las preguntas"
            :disabled="guardando"
            :aria-invalid="campoDescripcion.invalido.value"
            :aria-describedby="campoDescripcion.describedBy.value"
          ></textarea>
        </div>
      </div>

      <div class="preguntas-header">
        <label>Preguntas *</label>
        <button type="button" class="btn btn--secondary btn--sm" :disabled="guardando" @click="agregarPregunta">
          Agregar pregunta
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>

      <div v-for="(p, idx) in form.preguntas" :key="p.id" class="pregunta-card">
        <div class="pregunta-fila">
          <select v-model="p.tipo" aria-label="Tipo de pregunta" :disabled="guardando">
            <option v-for="(info, tipo) in TIPOS_PREGUNTA" :key="tipo" :value="tipo">{{ info.label }}</option>
          </select>
          <input v-model="p.etiqueta" aria-label="Texto de la pregunta" placeholder="ej: ¿Cómo calificaría la atención recibida?" :disabled="guardando" class="pregunta-etiqueta">
          <label class="pregunta-requerido">
            <input v-model="p.requerido" type="checkbox" :disabled="guardando"> Requerida
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
        <div v-if="p.tipo === 'opcion_unica'" class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="`pregunta-opciones-${p.id}`">Opciones (una por línea)<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <textarea
              :id="`pregunta-opciones-${p.id}`"
              class="campo__control"
              :rows="3"
              required
              placeholder="Excelente&#10;Bueno&#10;Regular&#10;Malo"
              :disabled="guardando"
              :value="opcionesTexto(p)"
              @input="onOpcionesInput(p, $event.target.value)"
            ></textarea>
          </div>
        </div>
      </div>

      <div v-if="errorForm" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ errorForm }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <button type="button" class="btn btn--secondary" :disabled="guardando" @click="cerrar">Cancelar</button>
      <button type="submit" form="enc-form" class="btn btn--primary" :disabled="guardando">
        <span class="btn__label">{{ guardando ? 'Guardando...' : 'Guardar' }}</span>
        <i v-if="guardando" class="ti ti-loader-2 btn__icono--girando" aria-hidden="true"></i>
      </button>
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


