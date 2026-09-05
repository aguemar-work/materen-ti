<script setup>
import { ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAccesosSensiblesStore } from '../../stores/accesosSensibles.js';
import { useAuthStore } from '../../stores/auth.js';
import { revelarAccesoSensible } from '../../api/passwords.js';
import { showToast } from '../../core/toast.js';
import { badgeInfo } from '../../core/badges.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import CarbonPasswordReveal from '../../components/carbon/CarbonPasswordReveal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonDataTable from '../../components/carbon/CarbonDataTable.vue';
import AccesoSensibleForm from './AccesoSensibleForm.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';

const auth = useAuthStore();
const store = useAccesosSensiblesStore();
const { lista, cargando, error } = storeToRefs(store);

// El revelado (petición a la edge function `credenciales` con la clave
// aislada CRED_KEY_SENSIBLE, auditoría en accesos_log con el motivo, cuenta
// regresiva de 8 segundos y ocultado automático) vive en
// CarbonPasswordReveal.vue desde el 2026-09-02. Esta vista solo declara QUÉ
// credencial se revela y si el usuario puede.
//
// `puedeRevelar` viene calculado por el API (join real contra
// accesos_sensibles_permisos) — el frontend no adivina nada, solo pasa ese
// campo como `bloqueado`. La barrera real sigue en la edge function.

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

// Definición de columnas de CarbonDataTable: sin orden (esta vista nunca
// ordenó por columna). "Contraseña" es sintética (no hay campo crudo, el
// slot siempre monta CarbonPasswordReveal) y "Nombre" es la elástica.
const columnas = [
  { clave: 'nombre', label: 'Nombre', elastica: true, movil: 'principal' },
  { clave: 'usuario', label: 'Usuario', movil: 'sec' },
  { clave: 'contrasena', label: 'Contraseña', movil: 'sec' },
  { clave: 'notas', label: 'Notas', movil: 'pie' },
  { clave: 'acciones', label: 'Acciones', ancho: '96px', movil: 'pie' },
];

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
        <CarbonButton variante="primary" icono="ti-plus" @click="abrirNuevo">Nuevo acceso</CarbonButton>
      </template>
    </PageHeader>

    <main class="page">
      <div class="card card--fill">
        <div v-if="error" class="no-results acc-error">{{ error }}</div>

        <template v-else>
        <p v-if="cargando" class="sr-only" role="status">Cargando accesos sensibles…</p>

        <CarbonDataTable
          :columnas="columnas"
          :filas="lista"
          :cargando="cargando"
          etiqueta="Accesos sensibles"
          vacio-icono="ti ti-shield-lock"
          vacio-titulo="Sin accesos sensibles"
          vacio-mensaje="Registra credenciales de alta sensibilidad (equipos, correos de gerencia/TI...) con visibilidad restringida por JEFE."
        >
          <template #celda-nombre="{ fila }">
            <!-- Categoría + Nombre colapsan (mismo criterio que Tickets):
                 Categoría es metadato de clasificación fijo, baja de badge
                 a texto. -->
            <div class="celda-apilada">
              <span class="celda-apilada__meta">{{ badgeInfo('categoria_acceso_sensible', fila.categoria).label }}</span>
              <span class="celda-apilada__principal">{{ fila.nombre }}</span>
            </div>
          </template>
          <template #celda-contrasena="{ fila }">
            <CarbonPasswordReveal
              :revelar="(motivo) => revelarAccesoSensible(fila.id, motivo)"
              :bloqueado="!fila.puedeRevelar"
              motivo-bloqueo="Sin permiso para ver esta credencial"
            />
          </template>
          <template #celda-notas="{ valor }">
            <TextoVacio :valor="valor" placeholder="Sin notas" />
          </template>
          <template #celda-acciones="{ fila }">
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
          </template>
          <template #vacio-accion>
            <CarbonButton variante="secondary" icono="ti-plus" @click="abrirNuevo">Nuevo acceso</CarbonButton>
          </template>
        </CarbonDataTable>
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

<style scoped>
.acc-error { color: var(--color-danger); }

</style>
