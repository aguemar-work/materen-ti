<script setup>
// Workaround y error conocido de un problema (KEDB, migración 106). Lee y
// escribe a través de useProblemaDetalleStore, el mismo que usa
// ProblemaDetalleView: el workaround y la bandera se guardan con el UPDATE de
// siempre (RLS del módulo problemas); publicarlo en la Base de conocimiento es
// una RPC (publicar_workaround_problema) que exige además el módulo
// base_conocimiento, por eso el botón solo se ofrece con los dos.
//
// Un problema marcado como error conocido no se cierra sin workaround o causa
// raíz: lo aplica el trigger check_problema_cierre y el mensaje llega al
// toast del botón de cierre de la vista, no de acá.
import { ref, computed } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useProblemaDetalleStore } from '../../stores/problemaDetalle.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppButton from '../../components/ui/AppButton.vue';

const MAX_WORKAROUND = 5000;

const auth = useAuthStore();
const store = useProblemaDetalleStore();
const problema = computed(() => store.problema);

// Mismas puertas que el servidor: sin base_conocimiento la RPC respondería 42501.
const puedePublicar = computed(() =>
  auth.puedeVerModulo('problemas') && auth.puedeVerModulo('base_conocimiento'),
);

const editando = ref(false);
const guardando = ref(false);
const publicando = ref(false);
const form = ref({ workaround: '', error_conocido: false });
const campoWorkaround = useCampoAccesible();
const campoErrorConocido = useCampoAccesible();

function abrirEdicion() {
  form.value = {
    workaround: problema.value.workaround || '',
    error_conocido: !!problema.value.error_conocido,
  };
  editando.value = true;
}

async function guardar() {
  guardando.value = true;
  try {
    await store.actualizarCampos({
      workaround: form.value.workaround.trim() || null,
      error_conocido: form.value.error_conocido,
    });
    editando.value = false;
    showToast('Workaround guardado');
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'problema' }).mensaje, 'error');
  } finally {
    guardando.value = false;
  }
}

async function publicar() {
  publicando.value = true;
  try {
    const articulo = await store.publicarWorkaround();
    showToast(
      articulo.estado === 'publicado'
        ? 'Workaround publicado en la base de conocimiento'
        : 'Workaround enviado a revisión: un jefe debe publicarlo en la base de conocimiento',
    );
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'problema' }).mensaje, 'error');
  } finally {
    publicando.value = false;
  }
}
</script>

<template>
  <AppSeccion
    v-if="problema"
    titulo="Workaround y error conocido"
    descripcion="Qué hacer mientras se corrige la causa raíz"
  >
    <template v-if="!editando" #acciones>
      <AppButton size="sm" variant="outline" severity="secondary" icon="ti ti-pencil" label="Editar workaround" @click="abrirEdicion" />
    </template>

    <form v-if="editando" class="space-y-4" @submit.prevent="guardar">
      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoWorkaround.id">Workaround</label>
        <div class="campo__caja">
          <textarea
            :id="campoWorkaround.id"
            v-model="form.workaround"
            class="campo__control campo__control--area"
            :rows="6"
            :maxlength="MAX_WORKAROUND"
            placeholder="Pasos para seguir trabajando mientras se corrige la causa"
            :disabled="guardando"
          ></textarea>
        </div>
      </div>
      <div class="flex items-start gap-2">
        <input :id="campoErrorConocido.id" v-model="form.error_conocido" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary-500" :disabled="guardando">
        <label :for="campoErrorConocido.id" class="text-sm text-gray-700">
          Es un error conocido
          <span class="block text-xs text-gray-500">Un error conocido no se puede cerrar sin workaround ni causa raíz.</span>
        </label>
      </div>
      <div class="flex justify-end gap-2">
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="editando = false" />
        <AppButton type="submit" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" :disabled="guardando" />
      </div>
    </form>

    <div v-else class="space-y-4">
      <p v-if="problema.error_conocido" class="text-sm text-gray-600">
        Error conocido: no se puede cerrar sin workaround ni causa raíz.
      </p>

      <p v-if="problema.workaround" class="max-w-prose whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-900">{{ problema.workaround }}</p>
      <p v-else class="text-sm text-gray-500">Todavía sin workaround documentado.</p>

      <div v-if="puedePublicar || problema.kb_articulo_id" class="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <AppButton
          v-if="puedePublicar"
          variant="outline"
          severity="secondary"
          :icon="publicando ? 'ti ti-loader-2' : 'ti ti-books'"
          label="Publicar workaround en la base de conocimiento"
          :loading="publicando"
          :disabled="publicando || !problema.workaround"
          @click="publicar"
        />
        <p v-if="puedePublicar && !problema.workaround" class="text-xs text-gray-500">Escriba el workaround para poder publicarlo.</p>
        <RouterLink
          v-if="problema.kb_articulo_id"
          :to="`/base-conocimiento/${problema.kb_articulo_id}`"
          class="text-sm text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >Ver el artículo en la base de conocimiento</RouterLink>
      </div>
    </div>
  </AppSeccion>
</template>
