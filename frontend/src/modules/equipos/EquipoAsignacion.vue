<script setup>
// Celda "Asignación" de un equipo, igual en la tabla de escritorio y en la
// tarjeta móvil: quién lo tiene (con enlace a su expediente) o, si está en
// almacén, DÓNDE está — con la ubicación editable en el lugar: se guarda al
// cambiar el <select>, sin diálogo (cambio de un solo campo, reversible y de
// bajo riesgo, mismo patrón que "Rol" en Staff). "Crear nueva ubicación…"
// abre un campo de texto en la misma celda.
//
// Mover pasa por la RPC `mover_equipo` (migración 101), vía `acciones` (el
// objeto de useEquiposAcciones): este componente no habla con la API.
import { ref } from 'vue';
import { showToast } from '../../core/toast.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { enAlmacen } from './useEquiposAcciones.js';
import AppAvatar from '../../components/ui/AppAvatar.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  equipo: { type: Object, required: true },
  // Objeto reactivo de useEquiposAcciones(): ubicaciones, moverA, crearUbicacionYMover.
  acciones: { type: Object, required: true },
  // Tarjeta móvil: el select lleva borde (en la tabla es "fantasma").
  tarjeta: { type: Boolean, default: false },
});

const moviendo = ref(false);
const creando = ref(false);
const nombreNueva = ref('');

async function ejecutar(accion, textoExito) {
  moviendo.value = true;
  try {
    await accion();
    showToast(textoExito());
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: 'No se pudo mover el equipo' }).mensaje, 'error');
  } finally {
    moviendo.value = false;
  }
}

function alElegir(valor) {
  if (valor === '__nueva__') {
    creando.value = true;
    nombreNueva.value = '';
    return;
  }
  if (!valor || valor === props.equipo.ubicacion_id) return;
  ejecutar(() => props.acciones.moverA(props.equipo, valor), () => `${props.equipo.codigo} movido`);
}

function cancelarNueva() {
  creando.value = false;
  nombreNueva.value = '';
}

async function confirmarNueva() {
  const nombre = nombreNueva.value.trim();
  if (!nombre) return;
  let creada = null;
  await ejecutar(
    async () => { creada = await props.acciones.crearUbicacionYMover(props.equipo, nombre); },
    () => `Ubicación "${creada?.nombre ?? nombre}" creada: ${props.equipo.codigo} movido`,
  );
  cancelarNueva();
}
</script>

<template>
  <!-- Quién lo tiene -->
  <div v-if="equipo.portador" class="flex min-w-0 items-center gap-2" @click.stop>
    <AppAvatar :nombre="equipo.portador" />
    <div class="min-w-0">
      <RouterLink
        class="block truncate text-gray-900 hover:text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :to="`/empleados/${equipo.empleado_id}`"
      >{{ equipo.portador }}</RouterLink>
      <AppTag v-if="equipo.portador_inactivo" tono="danger" class="mt-0.5" title="Este empleado fue dado de baja y no ha devuelto el equipo">Sin devolver</AppTag>
    </div>
  </div>

  <!-- En almacén: la ubicación se cambia aquí mismo -->
  <div v-else-if="creando" class="flex items-center gap-1" @click.stop>
    <input
      v-model="nombreNueva"
      class="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      :class="tarjeta ? 'flex-1' : 'w-44'"
      aria-label="Nombre de la ubicación nueva"
      placeholder="Nombre de la ubicación"
      :disabled="moviendo"
      @keydown.enter.prevent="confirmarNueva"
      @keydown.esc.prevent="cancelarNueva"
    >
    <button class="icon-btn" type="button" title="Crear y mover aquí" aria-label="Crear y mover aquí" :disabled="moviendo || !nombreNueva.trim()" @click="confirmarNueva">
      <i class="ti" :class="moviendo ? 'ti-loader-2 animate-spin' : 'ti-check'" aria-hidden="true"></i>
    </button>
    <button class="icon-btn" type="button" title="Cancelar" aria-label="Cancelar" :disabled="moviendo" @click="cancelarNueva">
      <i class="ti ti-x" aria-hidden="true"></i>
    </button>
  </div>

  <label v-else-if="enAlmacen(equipo)" class="relative inline-flex min-w-0 items-center" @click.stop>
    <span class="sr-only tabular-nums">Ubicación de {{ equipo.codigo }}</span>
    <i class="ti ti-map-pin pointer-events-none absolute left-2 text-gray-500" aria-hidden="true"></i>
    <select
      class="h-8 cursor-pointer appearance-none truncate rounded-md border pl-7 pr-7 text-sm hover:bg-gray-100 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
      :class="[
        equipo.ubicacion_id ? 'text-gray-700' : 'text-gray-500',
        tarjeta ? 'max-w-full border-gray-200 bg-white' : 'max-w-48 border-transparent bg-transparent',
      ]"
      data-ui
      :value="equipo.ubicacion_id || ''"
      :disabled="moviendo"
      @change="alElegir($event.target.value)"
    >
      <option value="" disabled>En almacén, sin ubicación</option>
      <option v-for="u in acciones.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
      <option value="__nueva__">+ Crear nueva ubicación…</option>
    </select>
    <i class="ti ti-chevron-down pointer-events-none absolute right-2 text-xs text-gray-500" aria-hidden="true"></i>
  </label>

  <span v-else-if="equipo.ubicacion_nombre" class="inline-flex items-center gap-1.5 text-gray-700">
    <i class="ti ti-map-pin text-gray-500" aria-hidden="true"></i>{{ equipo.ubicacion_nombre }}
  </span>
  <span v-else class="text-gray-500">Sin asignar</span>
</template>
