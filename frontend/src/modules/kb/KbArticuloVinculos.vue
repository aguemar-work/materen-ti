<script setup>
// Tipo del artículo, problema del que sale y cuánto se usó (KEDB, migración
// 106). Lateral de KbArticuloDetalleView. El uso sale de v_kpi_kb (usos del
// artículo para resolver tickets, ticket_kb_usos); si la consulta falla, el
// resto de la ficha se muestra igual y el uso queda sin cifra.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { tipoKbInfo } from '../../core/dominio-kb.js';
import { formatFechaHora } from '../../core/formatters.js';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  articulo: { type: Object, required: true },
});

const uso = ref(null);

// El uso solo cuenta en artículos publicados (el servidor no registra otros).
const mideUso = computed(() => props.articulo.estado === 'publicado');

const datos = computed(() => {
  const filas = [{ label: 'Tipo', valor: tipoKbInfo(props.articulo.tipo).label }];
  // Sin cifra (cargando o consulta fallida) no se muestra la fila: "Sin
  // registrar" diría que nunca se usó.
  if (mideUso.value && uso.value) {
    filas.push({ label: 'Uso en tickets', valor: `${uso.value.usos_90d} en 90 días · ${uso.value.usos_total} en total` });
    if (uso.value.ultimo_uso_at) filas.push({ label: 'Último uso', valor: formatFechaHora(uso.value.ultimo_uso_at), mono: true });
  }
  return filas;
});

onMounted(async () => {
  if (!mideUso.value) return;
  try {
    uso.value = await insforgeApi.kpiKbArticulo(props.articulo.id);
  } catch { /* sin cifra de uso; el resto de la ficha no depende de ella */ }
});
</script>

<template>
  <AppSeccion titulo="Conocimiento">
    <AppListaDatos :datos="datos">
      <template #valor-0>
        <AppTag :tono="tipoKbInfo(articulo.tipo).tono">{{ tipoKbInfo(articulo.tipo).label }}</AppTag>
      </template>
    </AppListaDatos>
    <RouterLink
      v-if="articulo.problema_id"
      :to="`/problemas/${articulo.problema_id}`"
      class="mt-4 inline-block text-sm text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >Ver el problema de origen</RouterLink>
  </AppSeccion>
</template>
