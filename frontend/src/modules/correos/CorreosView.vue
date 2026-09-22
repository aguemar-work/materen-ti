<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute } from 'vue-router';
import { useCorreosStore } from '../../stores/correos.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarPassword } from '../../api/passwords.js';
import { useRealtimeRefresco, REFRESCO_LISTA_DEBOUNCE_MS } from '../../composables/useRealtimeRefresco.js';
import { exportarCSV } from '../../core/exportar.js';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { rolDeTag } from '../../core/tagRol.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';
import { totalPaginasDe, paginasDe, rangoDe, clampPagina } from '../../core/paginacionRender.js';
import CorreoForm from './CorreoForm.vue';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { useBusqueda } from '../../composables/useBusqueda.js';
import { TAMANOS_PAGINA } from '../../constants/paginacion.js';

const store = useCorreosStore();
const authStore = useAuthStore();
const { lista, total, cargando, error, orden } = storeToRefs(store);
const ordenColumna = computed(() => orden.value?.columna || '');
const ordenDireccion = computed(() => orden.value?.direccion || 'asc');

useRealtimeRefresco('cuentas:list', () => store.cargar(), { debounceMs: REFRESCO_LISTA_DEBOUNCE_MS });

const { termino: busqueda } = useBusqueda({ onBuscar: (q) => store.aplicarFiltros({ q }) });

// Deep-link desde la búsqueda global: /correos?q=usuario@dominio
const route = useRoute();
busqueda.value = String(route.query.q ?? '');
watch(() => route.query.q, (q) => { if (q != null) busqueda.value = String(q); });

const filtroTipo = ref('');
const mostrarForm = ref(false);
const correoEditar = ref(null);

watch(filtroTipo, (tipo) => store.aplicarFiltros({ tipo }));

const totalPaginas = computed(() => totalPaginasDe(total.value, store.tamPagina));
const paginas = computed(() => paginasDe(totalPaginas.value));
const rango = computed(() => rangoDe(store.pagina, store.tamPagina, total.value));
function irA(pagina) {
  const destino = clampPagina(pagina, totalPaginas.value);
  if (destino !== store.pagina) store.irAPagina(destino);
}

const exportando = ref(false);
async function exportar() {
  exportando.value = true;
  try {
    const filas = await store.listaParaExportar();
    exportarCSV(
      'correos',
      ['Plataforma', 'Tipo', 'Correo / Usuario', 'Asignados', 'URL', 'Notas'],
      filas.map((c) => [
        c.plataforma_nombre,
        c.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable',
        c.usuario,
        (c.asignados || []).map((a) => a.nombre).join(', '),
        c.url,
        c.notas,
      ]),
    );
  } catch (e) {
    showToast(e?.message || 'Error al exportar', 'error');
  } finally {
    exportando.value = false;
  }
}

// El revelado de una credencial (peticion a la edge function `credenciales`,
// auditoria en accesos_log con el motivo, cuenta regresiva de 8 segundos y
// ocultado automatico) vive en composables/useRevelado.js. Esta vista solo
// declara QUE se revela — una instancia por fila, creada perezosamente.
const revelados = new Map();
function revelarDe(fila) {
  if (!revelados.has(fila.id)) {
    revelados.set(fila.id, crearRevelado({
      revelar: (motivo) => revelarPassword(fila.id, motivo),
      etiqueta: 'contraseña',
    }));
  }
  return revelados.get(fila.id);
}
// Bloqueo uniforme (no por fila): si el permiso general se cae mientras hay
// credenciales a la vista, se ocultan todas.
watch(() => authStore.puedeVerCredenciales, (puede) => {
  if (!puede) revelados.forEach((r) => r.ocultar());
});
const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

function abrirNuevo() {
  correoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(correo) {
  correoEditar.value = correo;
  mostrarForm.value = true;
}

// Definición de columnas: paginación y orden son de
// servidor (store.ordenarPor). "Cuenta" es la elástica; URL y Notas no
// tienen sentido en la tarjeta móvil angosta (no se mostraban ahí antes).
const columnas = [
  { clave: 'usuario', label: 'Cuenta', ordenable: true, elastica: true, movil: 'principal' },
  { clave: 'asignado', label: 'Asignado a', movil: 'sec' },
  { clave: 'contrasena', label: 'Contraseña', movil: 'sec' },
  { clave: 'url', label: 'URL', ordenable: true, movil: false },
  { clave: 'notas', label: 'Notas', ordenable: true, movil: false },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
const columnasVisiblesLista = columnasVisibles(columnas);
const totalColumnas = columnasVisiblesLista.length;

function onFormCerrado(guardado) {
  const fueEdicion = !!correoEditar.value;
  mostrarForm.value = false;
  correoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Correo actualizado' : 'Correo compartido creado');
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const c = porEliminar.value;
  if (!c) return;
  eliminando.value = true;
  try {
    await store.softDelete(c.id);
    showToast('Correo eliminado');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  store.resetearFiltros();
  try {
    if (busqueda.value.trim()) {
      await store.aplicarFiltros({ q: busqueda.value.trim() });
    } else {
      await store.cargar();
    }
  } catch {
    showToast(error.value || 'Error al cargar correos compartidos', 'error');
  }
});
</script>

<template>
  <div class="correos-page vista-modulo">
    <PageHeader titulo="Correos" icono="ti ti-mail-share" :conteo="total">
      <template #acciones>
        <button type="button" class="btn btn--secondary" title="Exportar a Excel (CSV)" :disabled="exportando" @click="exportar">
          {{ exportando ? 'Exportando...' : 'Exportar' }}
          <i v-if="exportando" class="ti ti-loader-2" aria-hidden="true"></i>
          <i v-else class="ti ti-table-export" aria-hidden="true"></i>
        </button>
        <button type="button" class="btn btn--primary" @click="abrirNuevo">
          Nuevo correo
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input
              v-model="busqueda"
              type="text"
              placeholder="Buscar por correo o plataforma..."
            >
          </div>
          <div class="filter-field">
            <label for="filtro-tipo">Tipo</label>
            <select id="filtro-tipo" v-model="filtroTipo">
              <option value="">Todos los tipos</option>
              <option value="compartida">Compartidos</option>
              <option value="reutilizable">Reutilizables</option>
            </select>
          </div>
        </div>

        <div v-if="error" class="no-results correos-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando correos compartidos…</p>

        <div class="tabla-envoltorio">
          <table class="tabla" aria-label="Correos compartidos y reutilizables">
            <thead>
              <tr>
                <template v-for="col in columnasVisiblesLista" :key="col.clave">
                  <ThOrdenable
                    v-if="col.ordenable"
                    :clave="col.clave"
                    :columna="ordenColumna"
                    :direccion="ordenDireccion"
                    :style="estiloColumna(col)"
                    @ordenar="store.ordenarPor(col.clave)"
                  >{{ col.label }}</ThOrdenable>
                  <th v-else scope="col" :style="estiloColumna(col)">{{ col.label }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!lista.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-mail-share"
                    titulo="Sin correos compartidos"
                    :mensaje="busqueda ? 'No hay resultados con ese filtro.' : 'Registra un correo compartido para asignarlo a empleados.'"
                  >
                    <button v-if="!busqueda" type="button" class="btn btn--secondary" @click="abrirNuevo">
                      Nuevo correo compartido
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in lista" :key="fila.id">
                  <td>
                    <!-- Plataforma + Tipo colapsan en la celda "Cuenta" (mismo
                         criterio que Tickets: identificador+categoría arriba en gris
                         chico, dato principal abajo). Tipo deja de ser badge — es
                         metadato de clasificación fijo (compartida/reutilizable/
                         personal), no un estado — mismo argumento que bajó Categoría
                         a texto en Tickets. -->
                    <div class="celda-apilada">
                      <span class="celda-apilada__meta">
                        <TextoVacio :valor="fila.plataforma_nombre" />
                        <span class="celda-sep" aria-hidden="true">·</span>
                        <span>{{ badgeInfo('tipo_cuenta', fila.tipo_cuenta).label }}</span>
                      </span>
                      <span class="celda-apilada__principal correo-usuario">{{ fila.usuario }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="asignado-cell">
                      <template v-if="fila.tipo_cuenta === 'reutilizable'">
                        <RouterLink
                          v-if="fila.asignados?.length"
                          class="asignado-nombre empleado-link"
                          :to="`/empleados/${fila.asignados[0].id}`"
                          :title="fila.asignados.map((a) => a.nombre).join(', ')"
                        >
                          {{ fila.asignados[0].nombre }}
                        </RouterLink>
                        <span v-else class="tag" :class="`tag--${rolDeTag('success')}`">
                          <i class="ti ti-circle-check"></i> Libre
                        </span>
                      </template>
                      <template v-else>
                        <span
                          v-if="fila.asignados?.length"
                          class="asignado-nombre"
                          :title="fila.asignados.map((a) => a.nombre).join(', ')"
                        >
                          {{ fila.asignados.length }} usuario{{ fila.asignados.length === 1 ? '' : 's' }}
                        </span>
                        <TextoVacio v-else placeholder="Sin usuarios" />
                      </template>
                      <span v-if="fila.requiere_rotacion" class="tag" :class="`tag--${rolDeTag('warning')}`" title="Un titular dejó esta cuenta y la contraseña no se ha cambiado">
                        <i class="ti ti-alert-triangle"></i> Rotar contraseña
                      </span>
                    </div>
                  </td>
                  <td>
                    <div class="cred">
                      <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                      <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                      <template v-if="authStore.puedeVerCredenciales">
                        <button
                          type="button"
                          class="cred__accion"
                          :disabled="revelarDe(fila).pidiendo.value"
                          :aria-label="revelarDe(fila).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                          @click="revelarDe(fila).mostrar()"
                        >
                          <i :class="revelarDe(fila).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                        </button>
                        <button
                          type="button"
                          class="cred__accion"
                          :disabled="revelarDe(fila).pidiendo.value"
                          aria-label="Copiar contraseña"
                          @click="revelarDe(fila).copiar()"
                        >
                          <i class="ti ti-copy" aria-hidden="true"></i>
                        </button>
                        <span v-if="revelarDe(fila).valor.value" class="cred__cuenta" aria-live="off">{{ revelarDe(fila).restante.value }}s</span>
                      </template>
                      <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas" title="Sin permiso para ver contraseñas">
                        <i class="ti ti-lock" aria-hidden="true"></i>
                      </span>
                    </div>
                  </td>
                  <td>
                    <a
                      v-if="fila.url"
                      :href="fila.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="url-link"
                      :title="fila.url"
                      aria-label="Abrir URL de la plataforma"
                    >
                      <i class="ti ti-external-link"></i>
                    </a>
                    <TextoVacio v-else />
                  </td>
                  <td>
                    <span v-if="fila.notas" class="notas-cell" :title="fila.notas">{{ fila.notas }}</span>
                    <TextoVacio v-else />
                  </td>
                  <td>
                    <div class="actions">
                      <button class="icon-btn fila-accion" type="button" title="Editar" aria-label="Editar" @click="abrirEditar(fila)">
                        <i class="ti ti-pencil"></i>
                      </button>
                      <button class="icon-btn danger fila-accion" type="button" title="Eliminar" aria-label="Eliminar" @click="porEliminar = fila">
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Correos compartidos y reutilizables">
          <li v-for="fila in lista" :key="fila.id" class="tarjeta-fila">
            <div class="tarjeta-fila__principal">
              <div class="celda-apilada">
                <span class="celda-apilada__meta">
                  <TextoVacio :valor="fila.plataforma_nombre" />
                  <span class="celda-sep" aria-hidden="true">·</span>
                  <span>{{ badgeInfo('tipo_cuenta', fila.tipo_cuenta).label }}</span>
                </span>
                <span class="celda-apilada__principal correo-usuario">{{ fila.usuario }}</span>
              </div>
            </div>
            <div class="tarjeta-fila__sec">
              <div class="asignado-cell">
                <template v-if="fila.tipo_cuenta === 'reutilizable'">
                  <RouterLink
                    v-if="fila.asignados?.length"
                    class="asignado-nombre empleado-link"
                    :to="`/empleados/${fila.asignados[0].id}`"
                  >{{ fila.asignados[0].nombre }}</RouterLink>
                  <span v-else class="tag" :class="`tag--${rolDeTag('success')}`"><i class="ti ti-circle-check"></i> Libre</span>
                </template>
                <template v-else>
                  <span v-if="fila.asignados?.length" class="asignado-nombre">{{ fila.asignados.length }} usuario{{ fila.asignados.length === 1 ? '' : 's' }}</span>
                  <TextoVacio v-else placeholder="Sin usuarios" />
                </template>
                <span v-if="fila.requiere_rotacion" class="tag" :class="`tag--${rolDeTag('warning')}`"><i class="ti ti-alert-triangle"></i> Rotar contraseña</span>
              </div>
            </div>
            <div class="tarjeta-fila__sec">
              <div class="cred">
                <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                <template v-if="authStore.puedeVerCredenciales">
                  <button type="button" class="cred__accion" :disabled="revelarDe(fila).pidiendo.value" :aria-label="revelarDe(fila).valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="revelarDe(fila).mostrar()">
                    <i :class="revelarDe(fila).valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="cred__accion" :disabled="revelarDe(fila).pidiendo.value" aria-label="Copiar contraseña" @click="revelarDe(fila).copiar()">
                    <i class="ti ti-copy" aria-hidden="true"></i>
                  </button>
                </template>
                <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver contraseñas"><i class="ti ti-lock" aria-hidden="true"></i></span>
              </div>
            </div>
            <div class="tarjeta-fila__pie">
              <div class="actions">
                <button class="icon-btn fila-accion" type="button" aria-label="Editar" @click="abrirEditar(fila)"><i class="ti ti-pencil"></i></button>
                <button class="icon-btn danger fila-accion" type="button" aria-label="Eliminar" @click="porEliminar = fila"><i class="ti ti-trash"></i></button>
              </div>
            </div>
          </li>
        </ul>
        </template>

        <nav v-if="!cargando && total > 0" class="paginacion" aria-label="Paginación">
          <div class="paginacion__lado">
            <label class="paginacion__campo">
              <span>Filas por página:</span>
              <select class="paginacion__select" :value="store.tamPagina" @change="store.cambiarTamPagina(Number($event.target.value))">
                <option v-for="t in TAMANOS_PAGINA" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <span class="paginacion__rango">{{ rango.desde }}–{{ rango.hasta }} de {{ total }} correos</span>
          </div>
          <div v-if="totalPaginas > 1" class="paginacion__lado">
            <label class="paginacion__campo">
              <span class="sr-only">Ir a la página</span>
              <select class="paginacion__select" :value="store.pagina" @change="irA(Number($event.target.value))">
                <option v-for="p in paginas" :key="p" :value="p">{{ p }}</option>
              </select>
              <span>de {{ totalPaginas }}</span>
            </label>
            <button class="paginacion__flecha" type="button" :disabled="store.pagina <= 1" aria-label="Página anterior" @click="irA(store.pagina - 1)">
              <i class="ti ti-chevron-left" aria-hidden="true"></i>
            </button>
            <button class="paginacion__flecha" type="button" :disabled="store.pagina >= totalPaginas" aria-label="Página siguiente" @click="irA(store.pagina + 1)">
              <i class="ti ti-chevron-right" aria-hidden="true"></i>
            </button>
          </div>
        </nav>
      </div>
    </main>

    <CorreoForm
      v-if="mostrarForm"
      :correo="correoEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar correo compartido"
      :mensaje="`¿Eliminar el correo compartido “${porEliminar.usuario}”? Las asignaciones activas quedarán en el historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


