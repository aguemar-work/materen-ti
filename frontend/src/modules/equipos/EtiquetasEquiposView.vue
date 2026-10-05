<script setup>
// Hoja de etiquetas QR para imprimir por lote (plan de mejora §3.6):
//   /equipos/etiquetas?ids=a,b,c      la selección del listado (o un solo equipo)
//   /equipos/etiquetas?todos=1&...    todos los del listado con sus filtros
//                                     (q, situacion, tipo, empresa): así se
//                                     imprimen los 314 equipos la primera vez
//
// Hoja A4 con etiquetas de 50 × 25 mm en 4 columnas × 11 filas (44 por hoja),
// pegadas entre sí: se corta a guillotina o se imprime sobre papel adhesivo
// precortado. El QR de cada una codifica `<origen>/e/<código>` (EtiquetaEquipo).
// La página de impresión es la propia hoja (`@page etiquetas`, en
// styles/impresion.css): márgenes de 5 mm, sin cabeceras, sin el marco.
//
// Probar primero con 10 equipos: el tamaño real y la lectura del QR con el
// celular dependen de la impresora y del papel (riesgo anotado en el plan).
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import EtiquetaEquipo from '../../components/ui/EtiquetaEquipo.vue';

const POR_HOJA = 44;

const route = useRoute();
const cargando = ref(true);
const error = ref('');
const equipos = ref([]);
const pedidos = ref(0);

const lista = (valor) => String(valor || '').split(',').map((v) => v.trim()).filter(Boolean);

async function cargar() {
  cargando.value = true;
  error.value = '';
  try {
    const q = route.query;
    if (q.todos) {
      equipos.value = await insforgeApi.listEquiposFiltrados({
        q: String(q.q || ''),
        situacion: String(q.situacion || ''),
        tipoIds: lista(q.tipo),
        empresaIds: lista(q.empresa),
      });
      pedidos.value = equipos.value.length;
    } else {
      const ids = lista(q.ids);
      pedidos.value = ids.length;
      equipos.value = ids.length ? await insforgeApi.listEquiposPorIds(ids) : [];
    }
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los equipos.' }).mensaje;
  } finally {
    cargando.value = false;
  }
}

onMounted(cargar);

function imprimir() {
  window.print();
}

const faltantes = computed(() => Math.max(0, pedidos.value - equipos.value.length));
const hojas = computed(() => Math.max(1, Math.ceil(equipos.value.length / POR_HOJA)));
const subtitulo = computed(() => {
  const n = equipos.value.length;
  return `${n} ${n === 1 ? 'etiqueta' : 'etiquetas'} de 50 × 25 mm · ${hojas.value} ${hojas.value === 1 ? 'hoja' : 'hojas'} A4`;
});
</script>

<template>
  <div class="w-full pb-10">
    <div data-no-print>
      <AppEncabezado titulo="Etiquetas de equipos" :subtitulo="cargando ? '' : subtitulo">
        <template #acciones>
          <AppButton variant="outline" severity="secondary" label="Volver a Equipos" to="/equipos" />
          <AppButton icon="ti ti-printer" label="Imprimir" :disabled="cargando || !equipos.length" @click="imprimir" />
        </template>
      </AppEncabezado>
      <div class="space-y-1 px-4 pb-4 text-sm text-gray-600 sm:px-6">
        <p>Hoja A4 de 4 columnas por 11 filas, sin márgenes entre etiquetas. Imprímala al 100 % (sin ajustar a la página).</p>
        <p>Pruebe primero con 10 equipos: valide el tamaño y que el celular lea el QR antes de imprimir el lote completo.</p>
        <p class="sm:hidden">Esta pantalla está pensada para escritorio: la hoja se imprime a tamaño real.</p>
        <p v-if="faltantes" class="text-gray-900" role="status">{{ faltantes }} {{ faltantes === 1 ? 'equipo no se encontró' : 'equipos no se encontraron' }} (eliminados o fuera de su acceso).</p>
      </div>
    </div>

    <p v-if="cargando" class="px-6 py-10 text-center text-sm text-gray-500" role="status">Cargando equipos...</p>

    <div v-else-if="error" class="mx-auto max-w-lg px-6 py-10 text-center" role="alert">
      <p class="text-sm text-gray-900">{{ error }}</p>
      <AppButton class="mt-4" variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="cargar" />
    </div>

    <div v-else-if="!equipos.length" class="flex px-4 sm:px-6">
      <AppVacio
        icono="ti ti-qrcode"
        titulo="Sin equipos que etiquetar"
        mensaje="Elija equipos en el listado (casillas de la izquierda) y use Imprimir etiquetas."
      >
        <AppButton variant="outline" severity="secondary" label="Ir a Equipos" to="/equipos" />
      </AppVacio>
    </div>

    <!-- La hoja: en pantalla se desplaza si no cabe; en papel ocupa la página. -->
    <div v-else class="overflow-x-auto px-4 sm:px-6 print:overflow-visible print:px-0">
      <div
        data-hoja-etiquetas
        class="grid w-[200mm] auto-rows-[25mm] grid-cols-[repeat(4,50mm)] bg-white [page:etiquetas]"
      >
        <EtiquetaEquipo
          v-for="eq in equipos"
          :key="eq.id"
          :codigo="eq.codigo"
          :empresa="eq.empresa_nombre"
          class="break-inside-avoid outline-1 -outline-offset-1 outline-dashed outline-gray-300 print:outline-none"
        />
      </div>
    </div>
  </div>
</template>
