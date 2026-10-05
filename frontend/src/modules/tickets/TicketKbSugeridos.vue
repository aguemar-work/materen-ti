<script setup>
// Artículos de la Base de conocimiento sugeridos para un ticket y el botón
// «Registrar uso» (KEDB, migración 106): mide cuántas veces un artículo sirvió
// para resolver un ticket (ticket_kb_usos → v_kpi_kb).
//
// Componente AUTÓNOMO, pensado para montarse después en el detalle de ticket de
// V2 sin tocar su cableado: recibe solo el id del ticket y su categoría, y
// consulta y escribe por su cuenta (insforgeApi). Sin los módulos tickets y
// base_conocimiento no pinta nada (el servidor respondería 42501). Las
// sugerencias son un apoyo: si no cargan, el ticket sigue funcionando.
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useAuthStore } from '../../stores/auth.js';
import { showToast } from '../../core/toast.js';
import { tipoKbInfo } from '../../core/dominio-kb.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  ticketId: { type: String, required: true },
  categoriaId: { type: String, default: null },
});
const emit = defineEmits(['uso-registrado']);

const auth = useAuthStore();
const visible = computed(() => auth.puedeVerModulo('tickets') && auth.puedeVerModulo('base_conocimiento'));

const articulos = ref([]);
const usados = ref(new Set());
const cargando = ref(false);
const fallo = ref(false);
const registrando = ref('');

async function cargar() {
  if (!visible.value || !props.ticketId) return;
  cargando.value = true;
  fallo.value = false;
  try {
    const [sugeridos, usos] = await Promise.all([
      insforgeApi.listArticulosRelacionados({ categoriaId: props.categoriaId }),
      insforgeApi.listUsosKbTicket(props.ticketId),
    ]);
    articulos.value = sugeridos;
    usados.value = new Set(usos.map((u) => u.kb_articulo_id));
  } catch {
    fallo.value = true;
  } finally {
    cargando.value = false;
  }
}

async function registrar(articulo) {
  registrando.value = articulo.id;
  try {
    await insforgeApi.registrarUsoKbTicket(props.ticketId, articulo.id);
    usados.value = new Set([...usados.value, articulo.id]);
    showToast('Uso registrado en el artículo');
    emit('uso-registrado', articulo);
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'artículo' }).mensaje, 'error');
  } finally {
    registrando.value = '';
  }
}

onMounted(cargar);
watch(() => [props.ticketId, props.categoriaId], cargar);
</script>

<template>
  <div v-if="visible">
    <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500">
      <i class="ti ti-books" aria-hidden="true"></i>Artículos sugeridos
    </p>
    <p v-if="cargando" class="text-sm text-gray-500" role="status">Buscando artículos…</p>
    <p v-else-if="fallo" class="text-sm text-gray-500">No se pudieron cargar las sugerencias.</p>
    <ul v-else-if="articulos.length" class="space-y-2">
      <li v-for="a in articulos" :key="a.id" class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <RouterLink
            :to="`/base-conocimiento/${a.id}`"
            class="text-sm text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >{{ a.titulo }}</RouterLink>
          <AppTag v-if="a.tipo !== 'solucion'" class="ml-2 align-middle" :tono="tipoKbInfo(a.tipo).tono">{{ tipoKbInfo(a.tipo).label }}</AppTag>
        </div>
        <span v-if="usados.has(a.id)" class="shrink-0 text-xs text-gray-500">Usado en este ticket</span>
        <AppButton
          v-else
          size="sm"
          variant="outline"
          severity="secondary"
          label="Registrar uso"
          :loading="registrando === a.id"
          :disabled="!!registrando"
          @click="registrar(a)"
        />
      </li>
    </ul>
    <p v-else class="text-sm text-gray-500">Sin artículos publicados en esta categoría todavía.</p>
  </div>
</template>
