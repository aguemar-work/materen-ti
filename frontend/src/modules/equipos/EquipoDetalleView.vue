<script setup>
// Hoja de vida de un equipo (`/equipos/:id`): el expediente del equipo, con URL.
// Reemplaza al modal "Hoja de vida" del listado (plan de mejora §3.3, pantalla
// 5). Carátula (código, almacén, serie, estado, quién lo tiene) · acción sólida
// única según la situación (Entregar si está libre, Devolver si tiene portador)
// · kardex con AppLibro (quién hizo qué y con qué acta) · especificaciones,
// accesorios y fotos.
//
// Las acciones (entregar, devolver, mover, estado, verificar) son las mismas
// del listado: useEquiposAcciones + EquipoAccionesModales, sobre las RPC de la
// migración 101. Legible a 390 px (se abre con la cámara desde el QR): en
// móvil suma "Verificar" y "Adjuntar acta" (foto) como botones de 44 px.
//
// Imprimir (regla 23): la carátula es la cabecera y el kardex una tabla; el DNI
// del portador sale enmascarado (core/dni.js). Un equipo inexistente muestra
// "no encontrado" (reintentar no lo arregla) distinto de un error de red.
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useEquiposStore } from '../../stores/equipos.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { formatFecha, fechaLocalISO } from '../../core/formatters.js';
import { enmascararDni } from '../../core/dni.js';
import { prepararActaParaSubir } from '../../core/pdfActa.js';
import { rolDeTag } from '../../core/tagRol.js';
import { nombreEquipo, estadoFisicoInfo, selloDeEquipo } from '../../core/dominio-equipos.js';
import { useHojaDeVida } from './useHojaDeVida.js';
import { useEquiposAcciones } from './useEquiposAcciones.js';
import { rutaActa } from './kardex.js';
import EquipoAccionesModales from './EquipoAccionesModales.vue';
import EquipoFotos from './EquipoFotos.vue';
import EquipoForm from './EquipoForm.vue';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppSello from '../../components/ui/AppSello.vue';
import AppTag from '../../components/ui/AppTag.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';
import AppLibro from '../../components/ui/AppLibro.vue';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';

const route = useRoute();
const store = useEquiposStore();
const { tipos } = storeToRefs(store);

const {
  estado, mensaje, equipo, portador, filas, actaEntrega, kardexCargando, kardexError, cargar, cargarKardex,
} = useHojaDeVida(() => String(route.params.id));

const acciones = useEquiposAcciones({ alCambiar: () => cargar({ silencioso: true }) });

// ── Edición (el mismo formulario del listado) ──────────────────────────────
const mostrarForm = ref(false);
acciones.alEditar(() => { mostrarForm.value = true; });

async function alCerrarForm(guardado) {
  mostrarForm.value = false;
  if (guardado) {
    showToast('Equipo actualizado');
    await cargar({ silencioso: true });
  }
}

onMounted(async () => {
  cargar();
  // El formulario necesita los tipos (el listado los trae con su página).
  if (!tipos.value.length) {
    try {
      store.tipos = await insforgeApi.listTiposEquipo();
    } catch {
      // Sin tipos el selector del formulario queda vacío; la hoja se ve igual.
    }
  }
});
// Navegar de un equipo a otro (búsqueda global) reutiliza la vista.
watch(() => route.params.id, (id) => { if (id) cargar(); });

// ── Carátula ────────────────────────────────────────────────────────────────
const sello = computed(() => (equipo.value ? selloDeEquipo(equipo.value) : null));
const tonoEstado = computed(() => rolDeTag(estadoFisicoInfo(equipo.value).clase));

const garantia = computed(() => {
  const hasta = equipo.value?.garantia_hasta;
  if (!hasta) return '';
  return `hasta ${formatFecha(hasta)}${hasta < fechaLocalISO() ? ' · vencida' : ''}`;
});

// Quién lo tiene (o dónde está). El DNI del portador solo sale en papel y
// enmascarado: en pantalla basta el nombre con enlace a su expediente.
const rotuloCustodia = computed(() => {
  if (equipo.value.empleado_id) return 'En custodia de';
  return equipo.value.ubicacion_nombre ? 'En ubicación' : 'Situación';
});

// Los pares 3 y 4 llevan su propio marcado (slots valor-3 y valor-4).
const datosCaratula = computed(() => [
  { rotulo: 'Empresa', valor: equipo.value.empresa_nombre },
  { rotulo: 'Tipo', valor: equipo.value.tipo_nombre },
  { rotulo: 'Garantía', valor: garantia.value },
  { rotulo: 'Estado', valor: estadoFisicoInfo(equipo.value).label },
  { rotulo: rotuloCustodia.value, valor: '' },
]);

// ── Acciones ────────────────────────────────────────────────────────────────
const principal = computed(() => (equipo.value ? acciones.accionPrincipalDe(equipo.value) : null));

const actasPendientes = computed(() => Boolean(equipo.value?.asignacion_id && equipo.value?.empleado_id));
const hrefActa = computed(() => (actasPendientes.value ? rutaActa(equipo.value.id, equipo.value.asignacion_id, 'entrega') : ''));

// "Más": todo lo que no es la acción sólida, más imprimir.
const menuMas = computed(() => {
  if (!equipo.value) return [];
  const resto = acciones.accionesVisibles(equipo.value, { hoja: true }).filter((a) => a.id !== principal.value?.id);
  return [
    ...resto,
    { id: 'imprimir', icono: 'ti-printer', label: 'Imprimir hoja de vida', onClick: () => window.print() },
  ];
});

// ── Móvil: adjuntar el acta firmada con la cámara ──────────────────────────
const entradaCamara = ref(null);
const subiendoActa = ref(false);

async function alFotografiarActa(evento) {
  const archivo = evento.target.files?.[0];
  evento.target.value = '';
  if (!archivo || !actasPendientes.value) return;
  subiendoActa.value = true;
  try {
    const pdf = await prepararActaParaSubir(archivo);
    await insforgeApi.subirActa({ asignacionId: equipo.value.asignacion_id, tipo: 'entrega', archivo: pdf, nombre: pdf.name });
    showToast('Acta firmada adjuntada');
    await cargarKardex();
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo adjuntar el acta' }).mensaje, 'error');
  } finally {
    subiendoActa.value = false;
  }
}

// ── Fotos: se guardan al instante (la hoja no tiene botón Guardar) ─────────
const errorFotos = ref('');
async function guardarFotos(fotos) {
  const anteriores = equipo.value.fotos;
  equipo.value = { ...equipo.value, fotos };
  try {
    await insforgeApi.guardarFotosEquipo(equipo.value.id, fotos);
  } catch (e) {
    equipo.value = { ...equipo.value, fotos: anteriores };
    errorFotos.value = traducirErrorDb(e, { porDefecto: 'No se pudieron guardar las fotos' }).mensaje;
  }
}

const especificaciones = computed(() => Object.entries(equipo.value?.specs || {}).map(([label, valor]) => ({ label, valor })));
</script>

<template>
  <div class="w-full pb-10">
    <p v-if="estado === 'cargando'" class="px-6 py-16 text-center text-sm text-gray-500" role="status">Cargando equipo...</p>

    <div v-else-if="estado === 'error'" class="mx-auto max-w-lg px-6 py-16 text-center" role="alert">
      <p class="text-sm text-gray-900">{{ mensaje }}</p>
      <AppButton class="mt-4" variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="cargar()" />
    </div>

    <div v-else-if="estado === 'no_encontrado'" class="flex px-4 pt-6 sm:px-6">
      <AppVacio
        icono="ti ti-device-desktop-off"
        titulo="Equipo no encontrado"
        mensaje="No existe un equipo con esa dirección, o fue eliminado. Si escaneó una etiqueta, revise que sea de este sistema."
      >
        <div class="flex flex-wrap justify-center gap-2">
          <AppButton variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="cargar()" />
          <AppButton variant="outline" severity="secondary" label="Ir a Equipos" to="/equipos" />
        </div>
      </AppVacio>
    </div>

    <template v-else-if="equipo">
      <!-- ══ Carátula ════════════════════════════════════════════ -->
      <AppCaratula :titulo="nombreEquipo(equipo)" :datos="datosCaratula">
        <template #rotulo>
          EQUIPO · <AppCodigo :valor="equipo.codigo" titulo="Código de equipo" />
          <template v-if="equipo.codigo_almacen"> · ALMACÉN <AppCodigo :valor="equipo.codigo_almacen" titulo="Código de almacén" /></template>
          <template v-if="equipo.serie"> · SERIE <AppCodigo :valor="equipo.serie" titulo="Número de serie" /></template>
        </template>

        <template v-if="sello" #sello>
          <AppSello :tono="sello.tono">{{ sello.texto }}</AppSello>
        </template>

        <template #valor-3>
          <AppTag :tono="tonoEstado">{{ estadoFisicoInfo(equipo).label }}</AppTag>
        </template>

        <template #valor-4>
          <template v-if="equipo.empleado_id">
            <RouterLink
              :to="`/empleados/${equipo.empleado_id}`"
              class="rounded text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >{{ equipo.portador }} ↗</RouterLink>
            <span v-if="portador?.dni" class="hidden tabular-nums print:inline"> · DNI {{ enmascararDni(portador.dni) }}</span>
            <span v-if="equipo.fecha_asignacion" class="text-gray-600"> desde {{ formatFecha(equipo.fecha_asignacion) }}</span>
            <span v-if="equipo.portador_inactivo" class="text-red-700"> · sin devolver (empleado dado de baja)</span>
            <span class="text-gray-600"> · acta de entrega {{ actaEntrega ? 'firmada ✓' : 'sin firmar' }}</span>
          </template>
          <template v-else-if="equipo.ubicacion_nombre">
            {{ equipo.ubicacion_nombre }}<span v-if="equipo.fecha_asignacion" class="text-gray-600"> desde {{ formatFecha(equipo.fecha_asignacion) }}</span>
          </template>
          <span v-else class="text-gray-500">{{ equipo.estado === 'operativo' ? 'Libre, sin ubicación' : 'Sin portador' }}</span>
        </template>

        <template #acciones>
          <AppButton
            v-if="principal"
            class="max-sm:h-11"
            :icon="`ti ${principal.icono}`"
            :label="principal.label.replace(' a un empleado', '').replace('Registrar devolución', 'Devolver').replace(' (operativo)', '')"
            @click="principal.onClick()"
          />
          <AppButton v-if="hrefActa" class="max-sm:h-11" variant="outline" severity="secondary" icon="ti ti-file-text" label="Acta" :to="hrefActa" />
          <MenuAcciones
            label="Más acciones"
            :acciones="menuMas"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-xs max-sm:h-11 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <template #trigger>
              <i class="ti ti-dots" aria-hidden="true"></i>
              Más
            </template>
          </MenuAcciones>
        </template>
      </AppCaratula>

      <!-- Móvil: lo que se hace con el equipo en la mano (44 px) -->
      <div data-no-print class="flex flex-wrap gap-2 px-4 pt-3 sm:hidden">
        <AppButton size="lg" variant="outline" severity="secondary" icon="ti ti-checklist" label="Verificar" @click="acciones.abrirVerificar(equipo)" />
        <AppButton
          v-if="actasPendientes"
          size="lg"
          variant="outline"
          severity="secondary"
          icon="ti ti-camera"
          :label="subiendoActa ? 'Subiendo...' : 'Adjuntar acta'"
          :loading="subiendoActa"
          @click="entradaCamara?.click()"
        />
        <input ref="entradaCamara" type="file" class="hidden" accept="image/*" capture="environment" aria-label="Fotografiar el acta firmada" @change="alFotografiarActa">
      </div>

      <div class="grid gap-6 px-4 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="min-w-0 space-y-6">
          <!-- ══ Kardex ══ -->
          <AppSeccion titulo="Kardex" :conteo="filas.length" sin-padding>
            <p v-if="kardexCargando && !filas.length" class="px-4 py-6 text-sm text-gray-500" role="status">Cargando kardex...</p>
            <div v-else-if="kardexError" class="px-4 py-6 text-sm" role="alert">
              <p class="text-gray-900">{{ kardexError }}</p>
              <AppButton class="mt-3" size="sm" variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="cargarKardex" />
            </div>
            <AppLibro v-else :filas="filas" etiqueta="Kardex del equipo" />
          </AppSeccion>

          <!-- ══ Fotos ══ -->
          <AppSeccion titulo="Fotos" :conteo="`${equipo.fotos.length} de 4`">
            <EquipoFotos :model-value="equipo.fotos" :equipo-id="equipo.id" @update:model-value="guardarFotos" @error="(m) => (errorFotos = m)" />
            <p v-if="errorFotos" class="mt-2 text-sm text-red-700" role="alert">{{ errorFotos }}</p>
          </AppSeccion>
        </div>

        <aside class="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
          <AppSeccion titulo="Especificaciones">
            <AppListaDatos v-if="especificaciones.length" :datos="especificaciones" />
            <p v-else class="text-sm text-gray-500">Sin registrar</p>
          </AppSeccion>

          <AppSeccion titulo="Identificación">
            <AppListaDatos
              :datos="[
                { label: 'Código', valor: equipo.codigo },
                { label: 'Almacén', valor: equipo.codigo_almacen },
                { label: 'Serie', valor: equipo.serie },
              ]"
            >
              <template #valor-0><AppCodigo :valor="equipo.codigo" titulo="Código de equipo" /></template>
              <template v-if="equipo.codigo_almacen" #valor-1><AppCodigo :valor="equipo.codigo_almacen" titulo="Código de almacén" /></template>
              <template v-if="equipo.serie" #valor-2><AppCodigo :valor="equipo.serie" titulo="Número de serie" /></template>
            </AppListaDatos>
            <RouterLink
              data-no-print
              :to="{ path: '/equipos/etiquetas', query: { ids: equipo.id } }"
              class="mt-3 inline-block rounded text-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >Imprimir etiqueta</RouterLink>
          </AppSeccion>

          <AppSeccion titulo="Accesorios" :conteo="equipo.accesorios_lineas.length">
            <ul v-if="equipo.accesorios_lineas.length" class="space-y-1.5 text-sm">
              <li v-for="(a, i) in equipo.accesorios_lineas" :key="a.id || i" class="flex items-baseline justify-between gap-3">
                <span class="min-w-0 text-gray-900 [overflow-wrap:anywhere]"><AppCodigo v-if="a.codigo" :valor="a.codigo" titulo="Código de almacén" /> {{ a.descripcion }}</span>
                <span v-if="a.cantidad > 1" class="shrink-0 text-xs text-gray-500 tabular-nums">× {{ a.cantidad }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-500">Sin accesorios registrados</p>
          </AppSeccion>

          <AppSeccion v-if="equipo.notas" titulo="Notas">
            <p class="whitespace-pre-line text-sm text-gray-700">{{ equipo.notas }}</p>
          </AppSeccion>
        </aside>
      </div>
    </template>

    <EquipoAccionesModales :acciones="acciones" />
    <EquipoForm v-if="mostrarForm" :equipo="equipo" @cerrar="alCerrarForm" />
  </div>
</template>
