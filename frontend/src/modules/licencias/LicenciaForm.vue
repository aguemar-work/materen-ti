<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { generarPassword } from '../../core/generarPassword.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  licencia: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (mismo patrón que EmpleadoForm.vue/AccesoSensibleForm.vue):
// Teleport, bloqueo de scroll del body, atrapamiento de foco y Escape los
// resuelve el componente compartido.
let resultado = false;

const store = useLicenciasStore();

const empresas = ref([]);
const correos = ref([]);
const plataformas = ref([]);
const cargandoCatalogos = ref(false);
const guardando = ref(false);
const error = ref('');
const claveVisible = ref(false);

// Campo que falló la última validación ('' | 'correo' | 'plataforma'), para
// resaltar el control y llevarle el foco además del mensaje de CarbonNotification.
const campoInvalido = ref('');
const refGrupoCorreo = ref(null);
const refPlataforma = ref(null);

async function enfocarCampoInvalido() {
  await nextTick();
  if (campoInvalido.value === 'correo') {
    refGrupoCorreo.value?.querySelector('input')?.focus();
  } else if (campoInvalido.value === 'plataforma') {
    refPlataforma.value?.focus();
  }
}

const esEdicion = computed(() => !!props.licencia?.id);

// modo de acceso: 'ninguno' | 'login' (correo vinculado) | 'clave' (serial)
const modoAcceso = ref('ninguno');

const PERIODOS = [
  { value: '', label: 'Sin definir' },
  { value: 1, label: 'Mensual' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Cada 6 meses' },
  { value: 12, label: 'Anual' },
  { value: 24, label: 'Cada 2 años' },
  { value: 36, label: 'Cada 3 años' },
];

const form = ref({
  software: '',
  tipo: 'suscripcion',
  cantidad: 1,
  empresa_id: '',
  proveedor: '',
  fecha_vencimiento: '',
  renovacion_meses: '',
  costo: '',
  moneda: 'PEN',
  cuenta_id: '',
  clave: '',
  notas: '',
});

// ── Buscador del correo vinculado ─────────────────────────────
const busquedaCorreo = ref('');

// Registro en línea de un correo que aún no existe en el módulo Correos
const registrandoCorreo = ref(false);
const nuevoCorreo = ref({ plataforma_id: '', tipo_cuenta: 'compartida', password: '' });
const passwordCorreoVisible = ref(false);

const correoEscritoValido = computed(() =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(busquedaCorreo.value.trim())
);

// Si ya existe exactamente ese correo, no tiene sentido ofrecer registrarlo
const correoYaRegistrado = computed(() => {
  const q = busquedaCorreo.value.trim().toLowerCase();
  return correos.value.some((c) => c.usuario.toLowerCase() === q);
});

// Cualquier cambio de selección (elegir de la lista o volver a escribir)
// cancela el modo "registrar correo nuevo" en curso.
function onSeleccionCorreo() {
  registrandoCorreo.value = false;
  campoInvalido.value = '';
}

function elegirRegistrarCorreo() {
  busquedaCorreo.value = busquedaCorreo.value.trim().toLowerCase();
  registrandoCorreo.value = true;
}

// Además del form entran el modo de acceso, el correo buscado/escrito y los
// datos del correo nuevo en línea — todo es captura del usuario.
const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
    form: form.value,
    modoAcceso: modoAcceso.value,
    busquedaCorreo: busquedaCorreo.value,
    registrandoCorreo: registrandoCorreo.value,
    nuevoCorreo: nuevoCorreo.value,
  }));

function resetForm() {
  error.value = '';
  if (props.licencia) {
    form.value = {
      software: props.licencia.software,
      tipo: props.licencia.tipo,
      cantidad: props.licencia.cantidad,
      empresa_id: props.licencia.empresa_id || '',
      proveedor: props.licencia.proveedor || '',
      fecha_vencimiento: props.licencia.fecha_vencimiento || '',
      renovacion_meses: props.licencia.renovacion_meses || '',
      costo: props.licencia.costo ?? '',
      moneda: props.licencia.moneda || 'PEN',
      cuenta_id: props.licencia.cuenta_id || '',
      // La clave actual nunca viaja al formulario: vacío = mantenerla
      clave: '',
      notas: props.licencia.notas || '',
    };
    modoAcceso.value = props.licencia.cuenta_id
      ? 'login'
      : (props.licencia.tiene_clave ? 'clave' : 'ninguno');
    busquedaCorreo.value = props.licencia.cuenta_usuario || '';
  } else {
    form.value = {
      software: '', tipo: 'suscripcion', cantidad: 1, empresa_id: '',
      proveedor: '', fecha_vencimiento: '', renovacion_meses: '',
      costo: '', moneda: 'PEN', cuenta_id: '', clave: '', notas: '',
    };
    modoAcceso.value = 'ninguno';
    busquedaCorreo.value = '';
  }
  registrandoCorreo.value = false;
  nuevoCorreo.value = { plataforma_id: '', tipo_cuenta: 'compartida', password: '' };
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.licencia, resetForm, { immediate: true });

// Al corregir el campo señalado, se apaga el resaltado sin esperar a un
// nuevo intento de guardar.
watch(() => nuevoCorreo.value.plataforma_id, (v) => {
  if (v && campoInvalido.value === 'plataforma') campoInvalido.value = '';
});
watch(busquedaCorreo, () => {
  if (campoInvalido.value === 'correo') campoInvalido.value = '';
});

onMounted(async () => {
  cargandoCatalogos.value = true;
  try {
    const [emp, corr, plats] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listCorreosCompartidos(),
      insforgeApi.listPlataformas(),
    ]);
    empresas.value = emp;
    correos.value = corr;
    plataformas.value = plats;
  } catch (e) {
    error.value = e?.message || 'Error al cargar catálogos';
  } finally {
    cargandoCatalogos.value = false;
  }
});

function generarPasswordCorreo() {
  nuevoCorreo.value.password = generarPassword();
  passwordCorreoVisible.value = true;
}

async function guardar() {
  error.value = '';
  campoInvalido.value = '';
  if (modoAcceso.value === 'login' && !form.value.cuenta_id && !registrandoCorreo.value) {
    error.value = 'Selecciona el correo que da acceso a la licencia';
    campoInvalido.value = 'correo';
    enfocarCampoInvalido();
    return;
  }
  if (modoAcceso.value === 'login' && registrandoCorreo.value) {
    if (!correoEscritoValido.value) {
      error.value = 'Escribe un correo válido para registrarlo';
      campoInvalido.value = 'correo';
      enfocarCampoInvalido();
      return;
    }
    if (!nuevoCorreo.value.plataforma_id) {
      error.value = 'Selecciona la plataforma del correo nuevo';
      campoInvalido.value = 'plataforma';
      enfocarCampoInvalido();
      return;
    }
  }
  guardando.value = true;
  try {
    // Correo no registrado: se crea primero en Correos y se vincula.
    // Al lograrlo queda seleccionado, así un reintento no lo duplica.
    if (modoAcceso.value === 'login' && registrandoCorreo.value) {
      const creado = await insforgeApi.createCorreo({
        plataforma_id: nuevoCorreo.value.plataforma_id,
        usuario: busquedaCorreo.value,
        password: nuevoCorreo.value.password,
        tipo_cuenta: nuevoCorreo.value.tipo_cuenta,
      });
      correos.value.push(creado);
      form.value.cuenta_id = creado.id;
      registrandoCorreo.value = false;
    }
    // En modo login, clave = contraseña propia del software (opcional:
    // vacía significa que se entra con la contraseña del correo)
    const conClave = modoAcceso.value === 'clave' || modoAcceso.value === 'login';
    const datos = {
      ...form.value,
      cuenta_id: modoAcceso.value === 'login' ? form.value.cuenta_id : null,
      clave: conClave ? form.value.clave : '',
      clave_cambiada: !conClave || form.value.clave !== '',
    };
    if (esEdicion.value) {
      await store.actualizar(props.licencia.id, datos);
    } else {
      await store.crear(datos);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    error.value = e?.message || 'Error al guardar licencia';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar licencia' : 'Nueva licencia'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="lic-form" class="form-grid" @submit.prevent="guardar">
        <CarbonCampo
          v-model="form.software"
          class="full"
          etiqueta="Software"
          requerido
          placeholder="ej: Microsoft 365 Business"
          :deshabilitado="guardando"
        />

        <CarbonCampo v-model="form.tipo" etiqueta="Tipo" tipo="select" requerido :deshabilitado="guardando">
          <template #opciones>
            <option value="suscripcion">Suscripción (se renueva)</option>
            <option value="perpetua">Perpetua (no vence)</option>
          </template>
        </CarbonCampo>

        <CarbonCampo
          v-model.number="form.cantidad"
          etiqueta="Asientos (usuarios máx.)"
          tipo="number"
          min="1"
          requerido
          :deshabilitado="guardando"
        />

        <CarbonCampo v-model="form.empresa_id" etiqueta="Empresa" tipo="select" :deshabilitado="guardando || cargandoCatalogos">
          <template #opciones>
            <option value="">Del grupo (sin empresa)</option>
            <option v-for="e in empresas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </template>
        </CarbonCampo>

        <template v-if="form.tipo === 'suscripcion'">
          <CarbonCampo
            v-model="form.fecha_vencimiento"
            etiqueta="Próximo vencimiento"
            tipo="date"
            :deshabilitado="guardando"
          />

          <CarbonCampo v-model="form.renovacion_meses" etiqueta="Renovación" tipo="select" :deshabilitado="guardando">
            <template #opciones>
              <option v-for="p in PERIODOS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </template>
          </CarbonCampo>
        </template>

        <CarbonCampo v-model="form.proveedor" etiqueta="Proveedor" :deshabilitado="guardando" />

        <div class="costo-inputs">
          <CarbonCampo
            v-model="form.costo"
            etiqueta="Costo"
            tipo="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            :deshabilitado="guardando"
          />
          <select v-model="form.moneda" :disabled="guardando" aria-label="Moneda" class="costo-moneda">
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </div>

        <!-- Modo de acceso -->
        <div class="form-group full">
          <label>Acceso al software</label>
          <div class="acceso-options">
            <label class="acceso-option" :class="{ 'acceso-option--active': modoAcceso === 'ninguno' }">
              <input v-model="modoAcceso" type="radio" value="ninguno" :disabled="guardando">
              <div class="acceso-body">
                <i class="ti ti-ban"></i>
                <span class="acceso-label">Sin credencial</span>
                <span class="acceso-desc">Solo registro del contrato</span>
              </div>
            </label>
            <label class="acceso-option" :class="{ 'acceso-option--active': modoAcceso === 'login' }">
              <input v-model="modoAcceso" type="radio" value="login" :disabled="guardando">
              <div class="acceso-body">
                <i class="ti ti-mail"></i>
                <span class="acceso-label">Con login</span>
                <span class="acceso-desc">Se entra con un correo del sistema</span>
              </div>
            </label>
            <label class="acceso-option" :class="{ 'acceso-option--active': modoAcceso === 'clave' }">
              <input v-model="modoAcceso" type="radio" value="clave" :disabled="guardando">
              <div class="acceso-body">
                <i class="ti ti-key"></i>
                <span class="acceso-label">Con clave/serial</span>
                <span class="acceso-desc">Clave de activación cifrada</span>
              </div>
            </label>
          </div>
        </div>

        <template v-if="modoAcceso === 'login'">
          <div ref="refGrupoCorreo" class="form-group full combo-correo" :class="{ 'campo-invalido': campoInvalido === 'correo' }">
            <label for="lf-cuenta">Correo que da acceso *</label>
            <BuscadorCombo
              id="lf-cuenta"
              v-model="form.cuenta_id"
              v-model:busqueda="busquedaCorreo"
              :items="correos"
              :campos-busqueda="['usuario', 'plataforma_nombre']"
              :etiqueta="(c) => c.usuario"
              :placeholder="cargandoCatalogos ? 'Cargando correos...' : 'Buscar correo por dirección o plataforma...'"
              :disabled="guardando || cargandoCatalogos"
              :forzar-cerrado="registrandoCorreo"
              @update:model-value="onSeleccionCorreo"
            >
              <template #icono="{ seleccionado }">
                <i v-if="seleccionado" class="ti ti-circle-check combo-check" aria-hidden="true"></i>
                <i v-else-if="registrandoCorreo" class="ti ti-circle-plus combo-check combo-check--nuevo" aria-hidden="true"></i>
              </template>
              <template #resultado="{ item }">
                <span class="combo-usuario">{{ item.usuario }}</span>
                <span class="combo-plataforma">{{ item.plataforma_nombre }}</span>
              </template>
              <template #vacio="{ sinResultados }">
                <li v-if="sinResultados && !correoEscritoValido" class="combo-vacio">
                  Sin resultados. Escribe el correo completo para registrarlo desde aquí.
                </li>
              </template>
              <template #extra>
                <li
                  v-if="correoEscritoValido && !correoYaRegistrado"
                  class="combo-registrar"
                  @mousedown.prevent="elegirRegistrarCorreo"
                >
                  <i class="ti ti-circle-plus" aria-hidden="true"></i>
                  <span>Registrar <strong>{{ busquedaCorreo.trim().toLowerCase() }}</strong> como correo nuevo</span>
                </li>
              </template>
            </BuscadorCombo>
            <p class="field-hint">
              Los usuarios de la licencia se asignan desde la lista de Licencias (mismo botón
              que las licencias sin login) o desde Correos/la ficha del empleado — es la misma
              cuenta. El sistema no permitirá más personas que asientos comprados.
            </p>
          </div>

          <!-- Datos mínimos del correo que se registrará en Correos -->
          <div v-if="registrandoCorreo" class="full nuevo-correo-panel">
            <p class="nuevo-correo-titulo">
              <i class="ti ti-mail-plus" aria-hidden="true"></i>
              Este correo no existe todavía: se registrará en el módulo Correos al guardar.
            </p>
            <div class="nuevo-correo-campos">
              <CarbonCampo
                ref="refPlataforma"
                v-model="nuevoCorreo.plataforma_id"
                etiqueta="Plataforma"
                tipo="select"
                requerido
                :deshabilitado="guardando"
                :error="campoInvalido === 'plataforma' ? 'Selecciona la plataforma del correo nuevo' : ''"
              >
                <template #opciones>
                  <option value="" disabled>Seleccionar plataforma</option>
                  <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
                </template>
              </CarbonCampo>

              <CarbonCampo v-model="nuevoCorreo.tipo_cuenta" etiqueta="Tipo de correo" tipo="select" :deshabilitado="guardando">
                <template #opciones>
                  <option value="compartida">Compartido (varios a la vez)</option>
                  <option value="reutilizable">Reutilizable (uno a la vez)</option>
                </template>
              </CarbonCampo>

              <div class="full input-with-action">
                <CarbonCampo
                  v-model="nuevoCorreo.password"
                  etiqueta="Contraseña del correo"
                  :tipo="passwordCorreoVisible ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="Opcional, se puede completar después en Correos"
                  :deshabilitado="guardando"
                />
                <button type="button" class="icon-btn" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generarPasswordCorreo">
                  <i class="ti ti-refresh" aria-hidden="true"></i>
                </button>
                <button type="button" class="icon-btn" :title="passwordCorreoVisible ? 'Ocultar' : 'Mostrar'" :aria-label="passwordCorreoVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="passwordCorreoVisible = !passwordCorreoVisible">
                  <i :class="passwordCorreoVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="full input-with-action">
            <CarbonCampo
              v-model="form.clave"
              :etiqueta="esEdicion && licencia?.tiene_clave ? 'Nueva contraseña del software' : 'Contraseña del software'"
              :tipo="claveVisible ? 'text' : 'password'"
              autocomplete="off"
              :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'Dejar vacío si es la misma del correo'"
              :deshabilitado="guardando"
              ayuda="Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su propia contraseña. Si se entra con la contraseña del correo, déjalo vacío."
            />
            <button type="button" class="icon-btn" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
              <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
            </button>
          </div>
        </template>

        <div v-if="modoAcceso === 'clave'" class="full input-with-action">
          <CarbonCampo
            v-model="form.clave"
            :etiqueta="esEdicion && licencia?.tiene_clave ? 'Nueva clave/serial' : 'Clave / serial'"
            :tipo="claveVisible ? 'text' : 'password'"
            autocomplete="off"
            :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'XXXXX-XXXXX-XXXXX'"
            :deshabilitado="guardando"
          />
          <button type="button" class="icon-btn" :title="claveVisible ? 'Ocultar' : 'Mostrar'" :aria-label="claveVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'" @click="claveVisible = !claveVisible">
            <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
          </button>
        </div>

        <CarbonCampo v-model="form.notas" class="full" etiqueta="Notas" tipo="textarea" :deshabilitado="guardando" />

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="lic-form" :cargando="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
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
/* Ancho: .modal-lg de la escala centralizada (main.css) */

/* .form-group.full (main.css) exige la clase .form-group, que trae consigo
   estilos de <input>/<select> viejos que pisarían los de CarbonCampo — acá
   se repite solo el grid-column. Vue aplica el scope del padre también a la
   raíz de un componente hijo (CarbonCampo incluido), así que esta regla
   simple alcanza tanto a los <div class="full"> propios como a los
   <CarbonCampo class="full">. */
.full {
  grid-column: 1 / -1;
}

.costo-inputs {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.costo-inputs :deep(.cds-campo) { flex: 1; min-width: 0; }

/* La moneda ya no vive dentro de .form-group (para no filtrarle su estilo
   viejo de <select> al <input> de CarbonCampo de al lado), así que reproduce
   a mano la misma caja outlined que usa CarbonCampo. */
.costo-moneda {
  width: 76px;
  height: var(--space-11);
  padding: 0 var(--space-6);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: var(--fs-body-01);
  cursor: pointer;
}

.costo-moneda:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--ring);
}

.costo-moneda:disabled {
  cursor: not-allowed;
  color: var(--color-text-disabled);
  background: var(--color-bg-subtle);
}

.acceso-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.acceso-option {
  display: flex;
  cursor: pointer;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 10px 12px;
  transition: border-color 0.15s, background 0.15s;
}

.acceso-option input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.acceso-option:hover {
  border-color: var(--color-primary);
  background: var(--color-accent-subtle);
}

.acceso-option:focus-within {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.acceso-option--active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.acceso-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.acceso-body > i {
  font-size: var(--icon-md);
  color: var(--color-primary);
  margin-bottom: 3px;
}

.acceso-label {
  font-size: var(--fs-label-01);
  font-weight: 600;
  color: var(--color-text-primary);
}

.acceso-desc {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.nuevo-correo-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  background: var(--color-bg-subtle, var(--color-bg));
  padding: 12px;
}

.nuevo-correo-titulo {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

.nuevo-correo-titulo i {
  font-size: var(--icon-sm);
  color: var(--color-primary);
  flex-shrink: 0;
}

.nuevo-correo-campos {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.nuevo-correo-campos .full {
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
  line-height: 1.4;
}

/* Resalta el campo que falló la última validación (ver campoInvalido en el
   script) — respaldo visual del mensaje de CarbonNotification, no un reemplazo.
   El select de plataforma ahora usa el estado inválido propio de CarbonCampo
   (prop :error); esta regla solo cubre el combo de correo, que no es CarbonCampo. */
.combo-correo.campo-invalido :deep(input) {
  border-color: var(--color-danger-border);
}
</style>
