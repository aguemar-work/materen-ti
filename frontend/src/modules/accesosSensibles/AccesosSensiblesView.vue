<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarAccesoSensible } from '../../api/passwords.js';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import { columnasVisibles, estiloColumna } from '../../core/tablaColumnas.js';
import { crearRevelado, escucharOcultamientoPorCambioDePestana } from '../../composables/useRevelado.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AccesoSensibleForm from './AccesoSensibleForm.vue';

const auth = useAuthStore();
const store = useAccesosSensiblesStore();
const { lista, cargando, error } = storeToRefs(store);

// El revelado (petición a la edge function `credenciales` con la clave
// aislada CRED_KEY_SENSIBLE, auditoría en accesos_log con el motivo, cuenta
// regresiva de 8 segundos y ocultado automático) vive en
// composables/useRevelado.js. Esta vista solo declara QUÉ credencial se
// revela y si el usuario puede — una instancia por fila, en `revelados`.
//
// `puedeRevelar` viene calculado por el API (join real contra
// accesos_sensibles_permisos) — el frontend no adivina nada. La barrera real
// sigue en la edge function.
const revelados = new Map();
// Creación perezosa: la primera lectura de una fila (al pintar la celda) crea
// su instancia. Evita depender del orden entre un watcher y el render para
// que `revelarDe(fila)` nunca sea undefined en el template.
function revelarDe(fila) {
  if (!revelados.has(fila.id)) {
    revelados.set(fila.id, crearRevelado({
      revelar: (motivo) => revelarAccesoSensible(fila.id, motivo),
      etiqueta: 'contraseña',
    }));
  }
  return revelados.get(fila.id);
}

// Si el permiso se cae mientras la credencial está a la vista, se oculta.
watch(lista, (nueva) => {
  for (const fila of nueva) {
    if (!fila.puedeRevelar) revelarDe(fila)?.ocultar();
  }
}, { deep: true });

const detenerOcultamiento = escucharOcultamientoPorCambioDePestana(() => [...revelados.values()]);
onBeforeUnmount(() => {
  detenerOcultamiento();
  revelados.forEach((r) => r.ocultar());
});

const mostrarForm = ref(false);
const accesoEditar = ref(null);

function abrirNuevo() {
  accesoEditar.value = null;
  mostrarForm.value = true;
}

function abrirEditar(acceso) {
  if (!acceso.puedeRevelar) return;
  accesoEditar.value = acceso;
  mostrarForm.value = true;
}

function onFormCerrado(guardado) {
  const fueEdicion = !!accesoEditar.value;
  mostrarForm.value = false;
  accesoEditar.value = null;
  if (guardado) showToast(fueEdicion ? 'Acceso actualizado' : 'Acceso creado');
}

// Confirmación destructiva (ConfirmDialog compartido, tier base)
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

// Definición de columnas: sin orden (esta vista nunca ordenó por columna).
// "Contraseña" es sintética (no hay campo crudo, la celda siempre monta el
// revelado auditado) y "Nombre" es la elástica.
const columnas = [
  { clave: 'nombre', label: 'Nombre', elastica: true, movil: 'principal' },
  { clave: 'usuario', label: 'Usuario', movil: 'sec' },
  { clave: 'contrasena', label: 'Contraseña', movil: 'sec' },
  { clave: 'notas', label: 'Notas', movil: 'pie' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];
const columnasVisiblesLista = columnasVisibles(columnas);
const totalColumnas = columnasVisiblesLista.length;

async function confirmarEliminar() {
  const a = porEliminar.value;
  if (!a) return;
  eliminando.value = true;
  try {
    await store.softDelete(a.id);
    showToast('Acceso eliminado');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(e?.message || 'Error al eliminar', 'error');
  } finally {
    eliminando.value = false;
  }
}

onMounted(async () => {
  try {
    await store.cargar(auth.user.id);
  } catch {
    showToast(error.value || 'Error al cargar accesos sensibles', 'error');
  }
});
</script>

<template>
  <div class="accesos-sensibles-page vista-modulo">
    <PageHeader titulo="Accesos sensibles" icono="ti ti-shield-lock" :conteo="lista.length">
      <template #acciones>
        <button type="button" class="btn btn--primary" @click="abrirNuevo">
          Nuevo acceso
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div v-if="error" class="no-results acc-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando accesos sensibles…</p>

        <div class="tabla-envoltorio">
          <table class="tabla" aria-label="Accesos sensibles">
            <thead>
              <tr>
                <th v-for="col in columnasVisiblesLista" :key="col.clave" scope="col" :style="estiloColumna(col)">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="cargando" :columnas="totalColumnas" />
              <tr v-else-if="!lista.length">
                <td :colspan="totalColumnas" class="tabla__vacio">
                  <EmptyState
                    icono="ti ti-shield-lock"
                    titulo="Sin accesos sensibles"
                    mensaje="Registra credenciales de alta sensibilidad (equipos, correos de gerencia/TI...) con visibilidad restringida por JEFE."
                  >
                    <button type="button" class="btn btn--secondary" @click="abrirNuevo">
                      Nuevo acceso
                      <i class="ti ti-plus" aria-hidden="true"></i>
                    </button>
                  </EmptyState>
                </td>
              </tr>
              <template v-else>
                <tr v-for="fila in lista" :key="fila.id">
                  <td>
                    <!-- Categoría + Nombre colapsan (mismo criterio que Tickets):
                         Categoría es metadato de clasificación fijo, baja de badge
                         a texto. -->
                    <div class="celda-apilada">
                      <span class="celda-apilada__meta">{{ badgeInfo('categoria_acceso_sensible', fila.categoria).label }}</span>
                      <span class="celda-apilada__principal">{{ fila.nombre }}</span>
                    </div>
                  </td>
                  <td>{{ fila.usuario }}</td>
                  <td>
                    <div class="cred">
                      <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                      <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                      <template v-if="fila.puedeRevelar">
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
                        <span v-if="revelarDe(fila).valor.value" class="cred__cuenta" aria-live="off">
                          {{ revelarDe(fila).restante.value }}s
                        </span>
                      </template>
                      <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver esta credencial" title="Sin permiso para ver esta credencial">
                        <i class="ti ti-lock" aria-hidden="true"></i>
                      </span>
                    </div>
                  </td>
                  <td><TextoVacio :valor="fila.notas" placeholder="Sin notas" /></td>
                  <td>
                    <div class="actions">
                      <button
                        class="icon-btn fila-accion"
                        type="button"
                        :disabled="!fila.puedeRevelar"
                        :title="fila.puedeRevelar ? 'Editar' : 'No tienes permiso para editar esta credencial'"
                        :aria-label="fila.puedeRevelar ? 'Editar' : 'No tienes permiso para editar esta credencial'"
                        @click="abrirEditar(fila)"
                      >
                        <i class="ti ti-pencil"></i>
                      </button>
                      <button
                        class="icon-btn danger fila-accion"
                        type="button"
                        :disabled="!fila.puedeRevelar"
                        :title="fila.puedeRevelar ? 'Eliminar' : 'No tienes permiso para eliminar esta credencial'"
                        :aria-label="fila.puedeRevelar ? 'Eliminar' : 'No tienes permiso para eliminar esta credencial'"
                        @click="porEliminar = fila"
                      >
                        <i class="ti ti-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ul v-if="!cargando && lista.length" class="lista-tarjetas solo-movil" aria-label="Accesos sensibles">
          <li v-for="fila in lista" :key="fila.id" class="tarjeta-fila">
            <div class="tarjeta-fila__principal">
              <div class="celda-apilada">
                <span class="celda-apilada__meta">{{ badgeInfo('categoria_acceso_sensible', fila.categoria).label }}</span>
                <span class="celda-apilada__principal">{{ fila.nombre }}</span>
              </div>
            </div>
            <div class="tarjeta-fila__sec">{{ fila.usuario }}</div>
            <div class="tarjeta-fila__sec">
              <div class="cred">
                <span v-if="revelarDe(fila).valor.value" class="cred__valor">{{ revelarDe(fila).valor.value }}</span>
                <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
                <template v-if="fila.puedeRevelar">
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
                </template>
                <span v-else class="cred__candado" role="img" aria-label="Sin permiso para ver esta credencial">
                  <i class="ti ti-lock" aria-hidden="true"></i>
                </span>
              </div>
            </div>
            <div class="tarjeta-fila__pie">
              <TextoVacio :valor="fila.notas" placeholder="Sin notas" />
              <div class="actions">
                <button
                  class="icon-btn fila-accion"
                  type="button"
                  :disabled="!fila.puedeRevelar"
                  :aria-label="fila.puedeRevelar ? 'Editar' : 'No tienes permiso para editar esta credencial'"
                  @click="abrirEditar(fila)"
                >
                  <i class="ti ti-pencil"></i>
                </button>
                <button
                  class="icon-btn danger fila-accion"
                  type="button"
                  :disabled="!fila.puedeRevelar"
                  :aria-label="fila.puedeRevelar ? 'Eliminar' : 'No tienes permiso para eliminar esta credencial'"
                  @click="porEliminar = fila"
                >
                  <i class="ti ti-trash"></i>
                </button>
              </div>
            </div>
          </li>
        </ul>
        </template>
      </div>
    </main>

    <AccesoSensibleForm
      v-if="mostrarForm"
      :acceso="accesoEditar"
      @cerrar="onFormCerrado"
    />

    <!-- Confirmación destructiva (ConfirmDialog compartido, tier base) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar acceso sensible"
      :mensaje="`¿Eliminar “${porEliminar.nombre}”? Esta acción no se puede deshacer.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cancel="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>


