<script setup>
// «Crear artículo desde este ticket» (KEDB, migración 106): reemplaza al
// borrador vacío que armaba el cliente. La RPC crear_kb_desde_ticket exige un
// ticket resuelto o cerrado y una solución (la que se escribe acá o la nota de
// resolución del ticket cuando exista) y copia título, síntoma y categoría.
//
// Componente AUTÓNOMO, pensado para montarse después en el detalle de ticket de
// V2 sin tocar su cableado: recibe el ticket y escribe por su cuenta. No se
// ofrece donde el servidor lo rechazaría (ticket sin resolver o sin los
// módulos tickets y base_conocimiento).
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  // { id, estado } del ticket abierto en pantalla.
  ticket: { type: Object, required: true },
});
const emit = defineEmits(['creado']);

const auth = useAuthStore();
const visible = computed(() =>
  ['resuelto', 'cerrado'].includes(props.ticket?.estado)
  && auth.puedeVerModulo('tickets')
  && auth.puedeVerModulo('base_conocimiento'),
);

const abierto = ref(false);
const solucion = ref('');
const creando = ref(false);
const error = ref('');
const creado = ref(null);
const campoSolucion = useCampoAccesible();

async function crear() {
  creando.value = true;
  error.value = '';
  try {
    creado.value = await insforgeApi.crearKbDesdeTicket(props.ticket.id, { solucion: solucion.value });
    abierto.value = false;
    showToast('Borrador creado en la base de conocimiento');
    emit('creado', creado.value);
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'artículo' }).mensaje;
  } finally {
    creando.value = false;
  }
}
</script>

<template>
  <div v-if="visible" class="space-y-2">
    <p v-if="creado" class="text-sm text-gray-700">
      Borrador creado.
      <RouterLink
        :to="`/base-conocimiento/${creado.id}`"
        class="text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      >Abrir el artículo</RouterLink>
    </p>

    <AppButton
      v-else-if="!abierto"
      size="sm"
      variant="outline"
      severity="secondary"
      icon="ti ti-books"
      label="Crear artículo desde este ticket"
      @click="abierto = true"
    />

    <form v-else class="space-y-3" @submit.prevent="crear">
      <div class="campo" :class="{ 'campo--inerte': creando }">
        <label class="campo__etiqueta" :for="campoSolucion.id">Solución</label>
        <div class="campo__caja">
          <textarea
            :id="campoSolucion.id"
            v-model="solucion"
            class="campo__control campo__control--area"
            :rows="5"
            placeholder="Pasos que resolvieron el ticket (si el ticket ya tiene nota de resolución, puede dejarlo vacío)"
            :disabled="creando"
          ></textarea>
        </div>
      </div>
      <p v-if="error" class="text-sm text-red-700" role="alert">{{ error }}</p>
      <div class="flex gap-2">
        <AppButton variant="outline" severity="secondary" size="sm" label="Cancelar" :disabled="creando" @click="abierto = false; error = ''" />
        <AppButton type="submit" size="sm" :label="creando ? 'Creando...' : 'Crear borrador'" :loading="creando" :disabled="creando" />
      </div>
    </form>
  </div>
</template>
