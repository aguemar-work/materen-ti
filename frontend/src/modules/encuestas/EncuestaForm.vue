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
import AppButton from '../../components/ui/AppButton.vue';
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
    <form id="enc-form" class="space-y-5" @submit.prevent="guardar">
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
            class="campo__control campo__control--area"
            :rows="2"
            placeholder="Se muestra a quien responde, antes de las preguntas"
            :disabled="guardando"
            :aria-invalid="campoDescripcion.invalido.value"
            :aria-describedby="campoDescripcion.describedBy.value"
          ></textarea>
        </div>
      </div>

      <!-- ── Preguntas ── -->
      <section aria-labelledby="enc-preguntas-titulo">
        <div class="flex items-center justify-between gap-3">
          <h3 id="enc-preguntas-titulo" class="text-sm font-semibold text-gray-900">
            Preguntas<span aria-hidden="true"> *</span>
            <span class="ml-1 rounded-full bg-gray-100 px-2 text-xs font-medium leading-5 text-gray-600 tabular-nums">{{ form.preguntas.length }}</span>
          </h3>
          <AppButton size="sm" variant="text" icon="ti ti-plus" label="Agregar pregunta" :disabled="guardando" @click="agregarPregunta" />
        </div>

        <p v-if="!form.preguntas.length" class="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
          Agregue la primera pregunta de la encuesta.
        </p>

        <ol v-else class="mt-3 space-y-3">
          <li v-for="(p, idx) in form.preguntas" :key="p.id" class="rounded-lg border border-gray-200 p-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-gray-500 tabular-nums">Pregunta {{ idx + 1 }}</span>
              <div class="flex items-center gap-0.5">
                <button class="icon-btn" type="button" title="Subir" aria-label="Subir" :disabled="guardando || idx === 0" @click="moverPregunta(idx, -1)">
                  <i class="ti ti-arrow-up" aria-hidden="true"></i>
                </button>
                <button class="icon-btn" type="button" title="Bajar" aria-label="Bajar" :disabled="guardando || idx === form.preguntas.length - 1" @click="moverPregunta(idx, 1)">
                  <i class="ti ti-arrow-down" aria-hidden="true"></i>
                </button>
                <button class="icon-btn danger" type="button" title="Quitar" aria-label="Quitar pregunta" :disabled="guardando" @click="quitarPregunta(idx)">
                  <i class="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>

            <div class="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div class="campo" :class="{ 'campo--inerte': guardando }">
                <label class="campo__etiqueta sr-only" :for="`pregunta-etiqueta-${p.id}`">Texto de la pregunta</label>
                <div class="campo__caja">
                  <input
                    :id="`pregunta-etiqueta-${p.id}`"
                    v-model="p.etiqueta"
                    class="campo__control"
                    placeholder="ej: ¿Cómo calificaría la atención recibida?"
                    :disabled="guardando"
                  >
                </div>
              </div>
              <div class="campo" :class="{ 'campo--inerte': guardando }">
                <label class="campo__etiqueta sr-only" :for="`pregunta-tipo-${p.id}`">Tipo de pregunta</label>
                <div class="campo__caja">
                  <select
                    :id="`pregunta-tipo-${p.id}`"
                    v-model="p.tipo"
                    class="campo__control campo__control--select"
                    :disabled="guardando"
                  >
                    <option v-for="(info, tipo) in TIPOS_PREGUNTA" :key="tipo" :value="tipo">{{ info.label }}</option>
                  </select>
                  <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
                </div>
              </div>
            </div>

            <div v-if="p.tipo === 'opcion_unica'" class="campo mt-3" :class="{ 'campo--inerte': guardando }">
              <label class="campo__etiqueta" :for="`pregunta-opciones-${p.id}`">Opciones (una por línea)<span aria-hidden="true"> *</span></label>
              <div class="campo__caja">
                <textarea
                  :id="`pregunta-opciones-${p.id}`"
                  class="campo__control campo__control--area"
                  :rows="3"
                  required
                  placeholder="Excelente&#10;Bueno&#10;Regular&#10;Malo"
                  :disabled="guardando"
                  :value="opcionesTexto(p)"
                  @input="onOpcionesInput(p, $event.target.value)"
                ></textarea>
              </div>
            </div>

            <label class="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input v-model="p.requerido" type="checkbox" class="h-4 w-4 accent-primary-600" :disabled="guardando">
              Respuesta obligatoria
            </label>
          </li>
        </ol>
      </section>

      <div v-if="errorForm" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ errorForm }}</p>
        </div>
      </div>
    </form>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cerrar" />
      <AppButton
        type="submit"
        form="enc-form"
        :label="guardando ? 'Guardando...' : 'Guardar'"
        :loading="guardando"
        :disabled="guardando"
      />
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
