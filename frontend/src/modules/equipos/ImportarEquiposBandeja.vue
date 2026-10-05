<script setup>
// Paso 3 de la importación: la bandeja. Grilla de EDICIÓN (un input o select por
// celda) para corregir cada equipo —tipo, estado físico, a quién está
// asignado— y migrarlo a Equipos, de a una fila o todas las listas. Cada
// corrección se autoguarda (700 ms). Se desplaza en horizontal dentro de la
// card a propósito, también en móvil: no existe una tarjeta móvil razonable
// para una grilla de edición (importar no se diseña para móvil, plan §3.9).
import { computed } from 'vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppTag from '../../components/ui/AppTag.vue';

const props = defineProps({
  // Objeto reactivo de useImportacionEquipos().
  imp: { type: Object, required: true },
});
const imp = props.imp;

// Siempre las mismas 11 columnas: el mapeo del Excel decide qué llena cada
// celda, no qué columnas existen.
const COLUMNAS = [
  { clave: 'excel', label: 'Excel', ancho: '11rem' },
  { clave: 'codigo', label: 'Código', ancho: '8rem' },
  { clave: 'tipo', label: 'Tipo', ancho: '10rem' },
  { clave: 'marca_modelo', label: 'Marca / Modelo', ancho: '11rem' },
  { clave: 'serie', label: 'Serie', ancho: '9rem' },
  { clave: 'costo', label: 'Costo', ancho: '7rem' },
  { clave: 'fecha_compra', label: 'F. compra', ancho: '10.5rem' },
  { clave: 'estado_fisico', label: 'Estado físico', ancho: '9.5rem' },
  { clave: 'asignacion', label: 'Asignación', ancho: '14rem' },
  { clave: 'notas', label: 'Notas', ancho: null }, // toma el resto
  { clave: 'migrar', label: 'Migrar', ancho: '9rem' },
];

// Clases compartidas de los controles de la grilla de edición.
const CTRL = 'h-8 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 aria-[invalid=true]:border-red-500';

const opcionesEstadoFila = computed(() => [
  { valor: '', label: 'Todas', conteo: imp.filas.length },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'error', label: 'Con error', conteo: imp.conErrores || null },
  { valor: 'duplicado', label: 'Duplicados', conteo: imp.conAvisoDuplicado || null },
]);

// Fila con error de migración resaltada: el mensaje ya se ve en su celda, pero
// el tinte de la fila entera ayuda a ubicarla de un vistazo entre ~400.
const claseFila = (fila) => (fila.estadoFila === 'error' ? 'bg-red-50/60' : 'bg-white');
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <p v-if="imp.migradosSesion" class="mb-3 flex items-center gap-2 text-sm text-green-700" role="status">
      <i class="ti ti-circle-check" aria-hidden="true"></i>
      {{ imp.migradosSesion }} {{ imp.migradosSesion === 1 ? 'equipo migrado' : 'equipos migrados' }} a Equipos en esta sesión
    </p>

    <AppVacio
      v-if="!imp.filas.length"
      icono="ti ti-inbox"
      titulo="Bandeja vacía"
      mensaje="Todo lo pegado ya se migró a Equipos. Pegue otro lote para continuar."
    >
      <AppButton variant="outline" severity="secondary" icon="ti ti-clipboard" label="Pegar otro lote" @click="imp.paso = 'pegar'" />
    </AppVacio>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3 pb-4">
        <AppBuscador v-model="imp.busquedaGrid" label="Buscar en la bandeja" placeholder="Buscar por código, marca, serie o usuario del Excel" />
        <AppSegmentado v-model="imp.filtroEstadoFila" :opciones="opcionesEstadoFila" label="Filtrar por estado de fila" />
      </div>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div class="min-h-0 flex-1 overflow-auto">
          <table class="w-full min-w-[1400px] border-collapse text-sm" aria-label="Grilla de corrección de equipos importados">
            <thead class="sticky top-0 z-[1] bg-gray-50">
              <tr>
                <th
                  v-for="col in COLUMNAS"
                  :key="col.clave"
                  scope="col"
                  class="whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-xs font-medium text-gray-500"
                  :class="col.clave === 'migrar' ? 'sticky right-0' : ''"
                  :style="col.ancho ? { width: col.ancho, minWidth: col.ancho } : null"
                >{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!imp.filasPagina.length">
                <td :colspan="COLUMNAS.length" class="px-4 py-12 text-center">
                  <p class="text-sm font-medium text-gray-900">Sin resultados</p>
                  <p class="mt-1 text-sm text-gray-500">Ninguna fila coincide con la búsqueda o el filtro.</p>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in imp.filasPagina" :key="fila.id" :class="claseFila(fila)" class="align-top">
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <div class="flex flex-col items-start gap-1">
                      <span class="text-xs text-gray-500">{{ fila.raw.categoria }}<template v-if="fila.raw.tipo"> / {{ fila.raw.tipo }}</template></span>
                      <span v-if="fila.raw.usuario" class="text-xs text-gray-500">{{ fila.raw.usuario }}</span>
                      <AppTag v-if="fila.duplicadoKapo" tono="warning" icono="ti ti-alert-triangle" title="El Excel marca esta fila como duplicada (columna SUBIDO A KAPO)">
                        Duplicado en Excel
                      </AppTag>
                    </div>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <input v-model="fila.codigo" :class="[CTRL, 'tabular-nums']" aria-label="Código" :aria-invalid="imp.duplicadoCodigo(fila) ? 'true' : undefined" @input="imp.marcarSucia(fila)">
                    <AppTag v-if="imp.duplicadoCodigo(fila)" tono="danger" class="mt-1">Código duplicado</AppTag>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <select v-model="fila.tipo_id" :class="[CTRL, !fila.tipo_id && 'border-amber-400']" aria-label="Tipo" @change="imp.marcarSucia(fila)">
                      <option v-for="t in imp.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                    </select>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <div class="flex flex-col gap-1">
                      <input v-model="fila.marca" :class="CTRL" placeholder="Marca" aria-label="Marca" @input="imp.marcarSucia(fila)">
                      <input v-model="fila.modelo" :class="CTRL" placeholder="Modelo" aria-label="Modelo" @input="imp.marcarSucia(fila)">
                    </div>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <input v-model="fila.serie" :class="[CTRL, 'tabular-nums']" aria-label="Serie" :aria-invalid="imp.duplicadoSerie(fila) ? 'true' : undefined" @input="imp.marcarSucia(fila)">
                    <AppTag v-if="imp.duplicadoSerie(fila)" tono="danger" class="mt-1">Serie duplicada</AppTag>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <input v-model.number="fila.costo" :class="[CTRL, 'tabular-nums']" type="number" step="0.01" min="0" aria-label="Costo" @input="imp.marcarSucia(fila)">
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <input v-model="fila.fecha_compra" :class="CTRL" type="date" aria-label="Fecha de compra" @change="imp.marcarSucia(fila)">
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <select v-model="fila.estado" :class="CTRL" aria-label="Estado físico" @change="imp.marcarSucia(fila)">
                      <option value="operativo">Operativo</option>
                      <option value="en_reparacion">En reparación</option>
                      <option value="de_baja">De baja</option>
                      <option value="perdido">Perdido/robado</option>
                    </select>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <div class="flex flex-col gap-1">
                      <select v-model="fila.modo" :class="CTRL" aria-label="Asignación" @change="imp.onModoChange(fila)">
                        <option value="disponible">Disponible</option>
                        <option value="empleado">Asignado a empleado</option>
                        <option value="ubicacion">En ubicación</option>
                      </select>
                      <BuscadorCombo
                        v-if="fila.modo === 'empleado'"
                        v-model="fila.empleado_id"
                        :items="imp.empleadosActivos"
                        :campos-busqueda="['nombres', 'apellidos', 'dni']"
                        :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
                        placeholder="Buscar empleado..."
                        @update:model-value="imp.marcarSucia(fila)"
                      >
                        <template #resultado="{ item }">
                          <span>{{ item.nombres }} {{ item.apellidos }}</span>
                          <span class="combo-sec tabular-nums">{{ item.dni }}</span>
                        </template>
                      </BuscadorCombo>
                      <select v-else-if="fila.modo === 'ubicacion'" v-model="fila.ubicacion_id" :class="CTRL" aria-label="Ubicación" @change="imp.marcarSucia(fila)">
                        <option value="" disabled>Seleccionar ubicación</option>
                        <option v-for="u in imp.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                      </select>
                      <p v-if="imp.asignacionIncompatible(fila)" class="text-xs text-red-700" role="alert">
                        Un equipo no operativo no puede quedar asignado: pase esta fila a "Disponible" o corrija el estado físico.
                      </p>
                    </div>
                  </td>
                  <td class="border-b border-gray-100 px-3 py-2.5">
                    <textarea
                      v-model="fila.notas"
                      rows="2"
                      class="min-h-16 w-full min-w-48 resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      aria-label="Notas"
                      @input="imp.marcarSucia(fila)"
                    ></textarea>
                  </td>
                  <!-- Fija a la derecha: la acción de la fila siempre a la vista -->
                  <td class="sticky right-0 border-b border-gray-100 px-3 py-2.5" :class="fila.estadoFila === 'error' ? 'bg-red-50' : 'bg-white'">
                    <div class="flex flex-col items-start gap-1">
                      <AppButton
                        variant="outline"
                        severity="secondary"
                        size="sm"
                        icon="ti ti-arrow-right"
                        icon-pos="right"
                        :label="fila.estadoFila === 'guardando' ? 'Migrando...' : 'Migrar'"
                        :loading="fila.estadoFila === 'guardando'"
                        :disabled="!imp.puedeMigrar(fila)"
                        :aria-label="`Migrar ${fila.codigo || 'fila'} a Equipos`"
                        @click="imp.migrarFila(fila)"
                      />
                      <p v-if="fila.errorMsg" class="text-xs text-red-700" role="alert">{{ fila.errorMsg }}</p>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <AppPaginacion
          v-if="imp.filasFiltradas.length > 0"
          :pagina="imp.paginaGrid"
          :tam-pagina="imp.tamPaginaGrid"
          :total="imp.filasFiltradas.length"
          @update:pagina="imp.irAPaginaGrid"
          @update:tam-pagina="imp.cambiarTamPaginaGrid"
        />
      </div>
    </template>
  </div>
</template>
