<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import { showToast } from '../../core/toast.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  cuenta: { type: Object, default: null },
  empleadoId: { type: String, required: true },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (pasada de diseño ago 2026, mismo patrón que
// EmpleadoForm.vue/AccesoSensibleForm.vue): Teleport, bloqueo de scroll del
// body, atrapamiento de foco y Escape los resuelve el componente
// compartido.
let resultado = false;

const store = useCuentasStore();

const plataformas = ref([]);
const cargandoPlataformas = ref(false);
const guardando = ref(false);
const error = ref('');

const modoCompartido = ref(false);
const correosCompartidos = ref([]);
const cargandoCompartidos = ref(false);
const cuentaCompartidaId = ref('');

const esEdicion = computed(() => !!props.cuenta?.id);

const form = ref({
  plataforma_id: '',
  usuario: '',
  password: '',
  url: '',
  notas: '',
});

const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
  form: form.value,
  modoCompartido: modoCompartido.value,
  cuentaCompartidaId: cuentaCompartidaId.value,
}));

function resetForm() {
  modoCompartido.value = false;
  cuentaCompartidaId.value = '';
  error.value = '';
  if (props.cuenta) {
    form.value = {
      plataforma_id: props.cuenta.plataforma_id,
      usuario: props.cuenta.usuario,
      // La contraseña actual nunca viaja al formulario:
      // vacío = se mantiene la actual, escribir algo = se cambia
      password: '',
      url: props.cuenta.url || '',
      notas: props.cuenta.notas || '',
    };
  } else {
    form.value = { plataforma_id: '', usuario: '', password: '', url: '', notas: '' };
  }
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.cuenta, resetForm, { immediate: true });

onMounted(async () => {
  cargandoPlataformas.value = true;
  try {
    plataformas.value = await insforgeApi.listPlataformas();
  } catch (e) {
    error.value = e?.message || 'Error al cargar plataformas';
  } finally {
    cargandoPlataformas.value = false;
  }
});

async function activarModoCompartido() {
  modoCompartido.value = true;
  error.value = '';
  if (!correosCompartidos.value.length) {
    cargandoCompartidos.value = true;
    try {
      correosCompartidos.value = await insforgeApi.listCorreosAsignables();
    } catch (e) {
      error.value = e?.message || 'Error al cargar correos compartidos';
    } finally {
      cargandoCompartidos.value = false;
    }
  }
}

// Guard de cierre del Modal compartido: Escape y la X (backdrop
// deshabilitado, ver template — formulario de captura, un clic afuera no
// debe perder lo escrito) pasan por acá igual que el botón "Cancelar" —
// con cambios sin guardar se pide confirmación antes de descartar; limpio
// cierra directo.
function generar() {
  form.value.password = generarPassword();
}

async function copiarGenerada() {
  try {
    await navigator.clipboard.writeText(form.value.password);
    showToast('Contraseña copiada');
  } catch {
    showToast('No se pudo copiar. Selecciónala manualmente', 'error');
  }
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    if (modoCompartido.value) {
      if (!cuentaCompartidaId.value) {
        error.value = 'Selecciona un correo compartido';
        guardando.value = false;
        return;
      }
      await store.asignarCompartida(props.empleadoId, cuentaCompartidaId.value);
    } else if (esEdicion.value) {
      // Campo vacío = mantener la contraseña actual; con texto = cambiarla
      // (al cambiarla se limpia el aviso "rotar contraseña")
      await store.actualizar(props.cuenta.id, {
        ...form.value,
        password_cambiada: form.value.password !== '',
      });
    } else {
      await store.crear(props.empleadoId, form.value);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar cuenta';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    :titulo="esEdicion ? 'Editar cuenta' : 'Nueva cuenta'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
      <!-- Toggle solo visible al crear, no al editar -->
      <div v-if="!esEdicion" class="modo-toggle">
        <button
          class="modo-btn"
          :class="{ 'modo-btn--active': !modoCompartido }"
          type="button"
          @click="modoCompartido = false; error = ''"
        >
          <i class="ti ti-user" aria-hidden="true"></i> Cuenta personal
        </button>
        <button
          class="modo-btn"
          :class="{ 'modo-btn--active': modoCompartido }"
          type="button"
          @click="activarModoCompartido"
        >
          <i class="ti ti-users" aria-hidden="true"></i> Correo compartido
        </button>
      </div>

      <form id="cuenta-form" @submit.prevent="guardar">
        <div class="form-grid">

        <!-- Modo: correo compartido existente -->
        <template v-if="modoCompartido">
          <div class="form-group full">
            <label for="cf-correo-compartido">Correo compartido *</label>
            <div v-if="cargandoCompartidos" class="loading-inline">Cargando correos compartidos...</div>
            <BuscadorCombo
              v-else
              id="cf-correo-compartido"
              v-model="cuentaCompartidaId"
              :items="correosCompartidos"
              :campos-busqueda="['usuario', 'plataforma_nombre']"
              :etiqueta="(c) => c.usuario"
              placeholder="Buscar correo por dirección o plataforma..."
              :disabled="guardando"
            >
              <template #resultado="{ item }">
                <span class="combo-usuario">{{ item.usuario }}</span>
                <span class="combo-plataforma">{{ item.plataforma_nombre }} · {{ item.tipo_cuenta === 'compartida' ? 'Compartido' : 'Reutilizable' }}</span>
              </template>
            </BuscadorCombo>
            <p v-if="!cargandoCompartidos && correosCompartidos.length === 0" class="field-hint">
              No hay correos compartidos registrados.
              <a href="/correos" target="_blank">Ir al módulo de correos compartidos</a>
            </p>
          </div>
        </template>

        <!-- Modo: cuenta personal nueva o edición -->
        <template v-else>
          <CarbonCampo
            v-model="form.plataforma_id"
            class="full"
            etiqueta="Plataforma"
            tipo="select"
            requerido
            :deshabilitado="guardando || cargandoPlataformas"
          >
            <template #opciones>
              <option value="" disabled>Seleccionar plataforma</option>
              <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
            </template>
          </CarbonCampo>

          <CarbonCampo v-model="form.usuario" class="full" etiqueta="Usuario" requerido :deshabilitado="guardando" />

          <div class="full input-with-action">
            <CarbonCampo
              v-model="form.password"
              :etiqueta="esEdicion ? 'Nueva contraseña' : 'Contraseña'"
              autocomplete="new-password"
              :placeholder="esEdicion ? 'Dejar vacío para mantener la actual' : ''"
              :deshabilitado="guardando"
            />
            <button class="icon-btn" type="button" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generar">
              <i class="ti ti-refresh" aria-hidden="true"></i>
            </button>
            <button
              v-if="form.password"
              class="icon-btn"
              type="button"
              title="Copiar contraseña"
              aria-label="Copiar contraseña"
              :disabled="guardando"
              @click="copiarGenerada"
            >
              <i class="ti ti-copy" aria-hidden="true"></i>
            </button>
          </div>

          <CarbonCampo v-model="form.url" class="full" etiqueta="URL" tipo="text" placeholder="https://..." :deshabilitado="guardando" />

          <CarbonCampo v-model="form.notas" class="full" etiqueta="Notas" tipo="textarea" :deshabilitado="guardando" />
        </template>

        </div>

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
      </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="cuenta-form" :deshabilitado="guardando" :cargando="guardando">
        {{ guardando ? 'Guardando...' : (modoCompartido ? 'Asignar' : 'Guardar') }}
      </CarbonButton>
    </template>
  </Modal>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Hay cambios sin guardar, ¿desea continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
.modo-toggle {
  display: flex;
  gap: 0;
  padding: 0 24px 0;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 4px;
}

.modo-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: var(--fs-body-01);
  font-weight: 500;
  color: var(--color-text-secondary);
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}

.modo-btn:hover {
  color: var(--color-text-primary);
}

.modo-btn--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.loading-inline {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  padding: 8px 0;
}

/* .form-group.full (main.css) exige la clase .form-group, que trae consigo
   estilos de <input>/<select> viejos que pisarían los de CarbonCampo — acá
   se repite solo el grid-column (mismo criterio que LicenciaForm.vue). */
.full {
  grid-column: 1 / -1;
}

.input-with-action {
  display: flex;
  gap: 4px;
  align-items: flex-end;
}

.input-with-action :deep(.cds-campo) { flex: 1; min-width: 0; }

.field-hint {
  margin: 4px 0 0;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.field-hint a {
  color: var(--color-primary);
  text-decoration: none;
}

.field-hint a:hover {
  text-decoration: underline;
}
</style>
