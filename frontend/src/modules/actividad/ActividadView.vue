<script setup>
// Auditoría de accesos a contraseñas — solo visible para el JEFE.
// Los registros los escribe la edge function; nadie puede crearlos
// ni borrarlos desde el cliente.
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { formatFechaHora, formatAntiguedad } from '../../core/formatters.js';
import { usePaginacion } from '../../composables/usePaginacion.js';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import { rolDeTag } from '../../core/tagRol.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import { columnasVisibles, estiloColumna, agruparParaTarjeta } from '../../core/tablaColumnas.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const registros = ref([]);
const cargando = ref(true);
const filtroAccion = ref('');

const ACCIONES = {
  ver:             { label: 'Vio la contraseña',   icon: 'ti ti-eye',              clase: 'badge--info' },
  copiar:          { label: 'Copió la contraseña', icon: 'ti ti-copy',             clase: 'badge--accent' },
  enviar:          { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_creada:  { label: 'Creó una entrega',    icon: 'ti ti-send',             clase: 'badge--success' },
  entrega_abierta: { label: 'Entrega abierta',     icon: 'ti ti-mail-opened',     clase: 'badge--warning' },
  acceso_denegado: { label: 'Acceso denegado',     icon: 'ti ti-shield-x',        clase: 'badge--danger' },
};

const listaFiltrada = computed(() =>
  filtroAccion.value
    ? registros.value.filter((r) => r.accion === filtroAccion.value)
    : registros.value
);

const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(listaFiltrada);
const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

function infoAccion(accion) {
  return ACCIONES[accion] || { label: accion, icon: 'ti ti-activity', clase: '' };
}

function exportar() {
  exportarCSV(
    'actividad',
    ['Fecha', 'Quién', 'Acción', 'Cuenta', 'Plataforma', 'Detalle'],
    listaFiltrada.value.map((r) => [
      formatFechaHora(r.created_at),
      r.user_email || '(empleado, vía enlace)',
      infoAccion(r.accion).label,
      r.cuenta_usuario,
      r.plataforma,
      r.detalle,
    ]),
  );
}

// "Cuenta" lleva un slot propio que apila Plataforma (metadato) sobre el
// nombre de cuenta (mono); "Detalle" es la elástica (mismo criterio que
// .col-elastica en la tabla vieja). Sin tarjeta móvil previa: agrupamos con
// el mismo esquema que EmpresasView (acción como cabecera-tag, cuenta como
// dato principal, quién/detalle de apoyo, fecha al pie).
const columnas = [
  { clave: 'user_email', label: 'Quién', ordenable: true, movil: 'sec' },
  { clave: 'accion', label: 'Acción', ordenable: true, movil: 'cab' },
  { clave: 'cuenta_usuario', label: 'Cuenta', ordenable: true, movil: 'principal' },
  { clave: 'detalle', label: 'Detalle', elastica: true, movil: 'sec' },
  { clave: 'created_at', label: 'Fecha', ordenable: true, num: true, movil: 'pie' },
];

const columnasVisiblesLista = computed(() => columnasVisibles(columnas));
const totalColumnas = computed(() => columnasVisiblesLista.value.length);
const enTarjeta = computed(() => agruparParaTarjeta(columnasVisiblesLista.value));

const totalPaginas = computed(() => totalPaginasDe(totalItems.value, tamPagina.value));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rangoPagina = computed(() => rangoDe(paginaActual.value, tamPagina.value, totalItems.value));
const desde = computed(() => rangoPagina.value.desde);
const hasta = computed(() => rangoPagina.value.hasta);
function irA(pagina) {
  paginaActual.value = clampPagina(pagina, totalPaginas.value);
}

onMounted(async () => {
  try {
    registros.value = await insforgeApi.listActividad(200);
  } catch (e) {
    showToast(e?.message || 'Error al cargar la actividad', 'error');
  } finally {
    cargando.value = false;
  }
});
</script>

<template>
  <div class="actividad-page vista-modulo">
    <PageHeader titulo="Actividad" icono="ti ti-activity" :conteo="listaFiltrada.length">
      <template #acciones>
        <button type="button" class="btn btn--secondary" title="Exportar a Excel (CSV)" @click="exportar">
          Exportar
          <i class="ti ti-table-export" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="filter-field">
            <label for="filtro-accion">Acción</label>
            <select id="filtro-accion" v-model="filtroAccion">
              <option value="">Todas las acciones</option>
              <option value="ver">Vio contraseña</option>
              <option value="copiar">Copió contraseña</option>
              <option value="enviar">Creó entrega</option>
              <option value="entrega_abierta">Entrega abierta</option>
              <option value="acceso_denegado">Acceso denegado</option>
            </select>
          </div>
        </div>

        <div class="tabla-envoltorio">
          <table class="tabla tabla--sm" aria-label="Auditoría de accesos a contraseñas">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="columna"
                    :direccion="direccion"
                    :class="{ 'col-num': col.num }"
                    :style="estiloColumna(col)"
                    @ordenar="ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :class="{ 'col-num': col.num }" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!listaPaginada.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState icono="ti ti-activity" titulo="Sin actividad registrada" mensaje="Aquí aparecerá cada vez que alguien vea, copie o envíe una contraseña." />
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in listaPaginada" :key="fila.id">
                  <td v-for="col in columnasVisiblesLista" :key="col.clave" :class="{ 'col-num': col.num }">
                    <template v-if="col.clave === 'user_email'">
                      {{ fila.user_email || '(empleado, vía enlace)' }}
                    </template>
                    <span
                      v-else-if="col.clave === 'accion'"
                      class="tag"
                      :class="`tag--${rolDeTag(infoAccion(fila.accion).clase)}`"
                    >
                      <i :class="infoAccion(fila.accion).icon"></i>
                      {{ infoAccion(fila.accion).label }}
                    </span>
                    <!-- Cuenta + Plataforma colapsan (mismo criterio que
                         Tickets): Plataforma es el metadato que agrupa,
                         Cuenta es el dato principal de la fila. -->
                    <div v-else-if="col.clave === 'cuenta_usuario'" class="celda-apilada">
                      <span class="celda-apilada__meta"><TextoVacio :valor="fila.plataforma" /></span>
                      <span class="celda-apilada__principal cuenta-cell"><TextoVacio :valor="fila.cuenta_usuario" /></span>
                    </div>
                    <template v-else-if="col.clave === 'detalle'">
                      <span v-if="fila.detalle" class="detalle-cell" :title="fila.detalle">{{ fila.detalle }}</span>
                      <TextoVacio v-else />
                    </template>
                    <span v-else-if="col.clave === 'created_at'" class="fecha-cell" :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && listaPaginada.length" class="lista-tarjetas solo-movil" aria-label="Auditoría de accesos a contraseñas">
          <li v-for="fila in listaPaginada" :key="fila.id" class="tarjeta-fila">
            <div v-if="enTarjeta.cab.length" class="tarjeta-fila__cab">
              <template v-for="col in enTarjeta.cab" :key="col.clave">
                <span
                  v-if="col.clave === 'accion'"
                  class="tag"
                  :class="`tag--${rolDeTag(infoAccion(fila.accion).clase)}`"
                >
                  <i :class="infoAccion(fila.accion).icon"></i>
                  {{ infoAccion(fila.accion).label }}
                </span>
              </template>
            </div>
            <div v-for="col in enTarjeta.principal" :key="col.clave" class="tarjeta-fila__principal">
              <div v-if="col.clave === 'cuenta_usuario'" class="celda-apilada">
                <span class="celda-apilada__meta"><TextoVacio :valor="fila.plataforma" /></span>
                <span class="celda-apilada__principal cuenta-cell"><TextoVacio :valor="fila.cuenta_usuario" /></span>
              </div>
            </div>
            <div v-for="col in enTarjeta.sec" :key="col.clave" class="tarjeta-fila__sec">
              <template v-if="col.clave === 'user_email'">
                {{ fila.user_email || '(empleado, vía enlace)' }}
              </template>
              <template v-else-if="col.clave === 'detalle'">
                <span v-if="fila.detalle" class="detalle-cell" :title="fila.detalle">{{ fila.detalle }}</span>
                <TextoVacio v-else />
              </template>
            </div>
            <div v-if="enTarjeta.pie.length" class="tarjeta-fila__pie">
              <template v-for="col in enTarjeta.pie" :key="col.clave">
                <span v-if="col.clave === 'created_at'" class="fecha-cell" :title="formatFechaHora(fila.created_at)">{{ formatAntiguedad(fila.created_at) }}</span>
              </template>
            </div>
          </li>
        </ul>

        <nav v-if="!cargando && totalItems > 0" class="paginacion" aria-label="Paginación">
          <div class="paginacion__lado">
            <label v-if="TAMANOS_PAGINA?.length" class="paginacion__campo">
              <span>Filas por página:</span>
              <select class="paginacion__select" :value="tamPagina" @change="cambiarTamPagina($event.target.value)">
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ desde }}–{{ hasta }} de {{ totalItems }} movimientos</span>
          </div>

          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="paginaActual" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual <= 1" aria-label="Página anterior" @click="irA(paginaActual - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="paginaActual >= totalPaginas" aria-label="Página siguiente" @click="irA(paginaActual + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
      </div>
    </main>
  </div>
</template>


