<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';
import { useCerrarConEscape } from '../../composables/useCerrarConEscape.js';
import { useDetectorDeCambios } from '../../composables/useDetectorDeCambios.js';
import { useFocoAtrapado } from '../../composables/useFocoAtrapado.js';
import { generarPassword } from '../../core/generarPassword.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';

const props = defineProps({
  licencia: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Cierre animado (Fase 3): cerrar() dispara la transición de salida y el
// emit real sale en @after-leave, así el padre desmonta sin cortarla.
const visible = ref(true);
let resultadoCierre = false;

function cerrar(resultado) {
  resultadoCierre = resultado;
  visible.value = false;
}

function emitirCierre() {
  emit('cerrar', resultadoCierre);
}

// Foco atrapado mientras el modal vive; al desmontar vuelve a quien lo abrió
const panelModal = ref(null);
useFocoAtrapado(panelModal);

const store = useLicenciasStore();

const empresas = ref([]);
const correos = ref([]);
const plataformas = ref([]);
const cargandoCatalogos = ref(false);
const guardando = ref(false);
const error = ref('');
const claveVisible = ref(false);

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
}

function elegirRegistrarCorreo() {
  busquedaCorreo.value = busquedaCorreo.value.trim().toLowerCase();
  registrandoCorreo.value = true;
}

// Además del form entran el modo de acceso, el correo buscado/escrito y los
// datos del correo nuevo en línea — todo es captura del usuario.
const { estaSucio, tomarSnapshot } = useDetectorDeCambios(() => ({
  form: form.value,
  modoAcceso: modoAcceso.value,
  busquedaCorreo: busquedaCorreo.value,
  registrandoCorreo: registrandoCorreo.value,
  nuevoCorreo: nuevoCorreo.value,
}));
const confirmarDescarte = ref(false);
const dialogoDescarte = ref(null);

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

// Cancelar, la X y Escape pasan por acá: con cambios sin guardar se pide
// confirmación antes de descartar; limpio cierra directo.
function cancelar() {
  if (!visible.value) return;
  if (estaSucio.value) {
    confirmarDescarte.value = true;
    return;
  }
  cerrar(false);
}

function descartarCambios() {
  // El diálogo sale animado (su @cancel al terminar baja confirmarDescarte)
  // mientras el formulario inicia su propia salida en paralelo
  dialogoDescarte.value?.cerrar();
  cerrar(false);
}

// Formulario de captura: clic fuera NO cierra (se perdería lo escrito);
// solo Cancelar, la X o Escape.
useCerrarConEscape(() => { if (!guardando.value) cancelar(); });

function generarPasswordCorreo() {
  nuevoCorreo.value.password = generarPassword();
  passwordCorreoVisible.value = true;
}

async function guardar() {
  error.value = '';
  if (modoAcceso.value === 'login' && !form.value.cuenta_id && !registrandoCorreo.value) {
    error.value = 'Selecciona el correo que da acceso a la licencia';
    return;
  }
  if (modoAcceso.value === 'login' && registrandoCorreo.value) {
    if (!correoEscritoValido.value) {
      error.value = 'Escribe un correo válido para registrarlo';
      return;
    }
    if (!nuevoCorreo.value.plataforma_id) {
      error.value = 'Selecciona la plataforma del correo nuevo';
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
    cerrar(true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar licencia';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Transition name="modal-anim" appear @after-leave="emitirCierre">
  <div v-if="visible" class="modal-bg">
    <div ref="panelModal" class="modal modal-lg licencia-form" role="dialog" aria-modal="true" aria-labelledby="lic-form-title" tabindex="-1">
      <div class="modal-title">
        <span id="lic-form-title">{{ esEdicion ? 'Editar licencia' : 'Nueva licencia' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form @submit.prevent="guardar">
        <div class="modal-body form-grid">
        <div class="form-group full">
          <label for="lf-software">Software *</label>
          <input id="lf-software" v-model="form.software" required placeholder="ej: Microsoft 365 Business" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="lf-tipo">Tipo *</label>
          <select id="lf-tipo" v-model="form.tipo" :disabled="guardando">
            <option value="suscripcion">Suscripción (se renueva)</option>
            <option value="perpetua">Perpetua (no vence)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="lf-cantidad">Asientos (usuarios máx.) *</label>
          <input id="lf-cantidad" v-model.number="form.cantidad" type="number" min="1" required :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="lf-empresa">Empresa</label>
          <select id="lf-empresa" v-model="form.empresa_id" :disabled="guardando || cargandoCatalogos">
            <option value="">Del grupo (sin empresa)</option>
            <option v-for="e in empresas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </select>
        </div>

        <template v-if="form.tipo === 'suscripcion'">
          <div class="form-group">
            <label for="lf-vence">Próximo vencimiento</label>
            <input id="lf-vence" v-model="form.fecha_vencimiento" type="date" :disabled="guardando">
          </div>

          <div class="form-group">
            <label for="lf-renovacion">Renovación</label>
            <select id="lf-renovacion" v-model="form.renovacion_meses" :disabled="guardando">
              <option v-for="p in PERIODOS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
          </div>
        </template>

        <div class="form-group">
          <label for="lf-proveedor">Proveedor</label>
          <input id="lf-proveedor" v-model="form.proveedor" :disabled="guardando">
        </div>

        <div class="form-group costo-group">
          <label for="lf-costo">Costo</label>
          <div class="costo-inputs">
            <input id="lf-costo" v-model="form.costo" type="number" step="0.01" min="0" placeholder="0.00" :disabled="guardando">
            <select v-model="form.moneda" :disabled="guardando" aria-label="Moneda">
              <option value="PEN">S/</option>
              <option value="USD">US$</option>
            </select>
          </div>
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
          <div class="form-group full combo-correo">
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
          <div v-if="registrandoCorreo" class="form-group full nuevo-correo-panel">
            <p class="nuevo-correo-titulo">
              <i class="ti ti-mail-plus" aria-hidden="true"></i>
              Este correo no existe todavía: se registrará en el módulo Correos al guardar.
            </p>
            <div class="nuevo-correo-campos">
              <div class="form-group">
                <label for="lf-nc-plataforma">Plataforma *</label>
                <select id="lf-nc-plataforma" v-model="nuevoCorreo.plataforma_id" required :disabled="guardando">
                  <option value="" disabled>Seleccionar plataforma</option>
                  <option v-for="p in plataformas" :key="p.id" :value="p.id">{{ p.nombre }}</option>
                </select>
              </div>
              <div class="form-group">
                <label for="lf-nc-tipo">Tipo de correo</label>
                <select id="lf-nc-tipo" v-model="nuevoCorreo.tipo_cuenta" :disabled="guardando">
                  <option value="compartida">Compartido (varios a la vez)</option>
                  <option value="reutilizable">Reutilizable (uno a la vez)</option>
                </select>
              </div>
              <div class="form-group full">
                <label for="lf-nc-password">Contraseña del correo</label>
                <div class="input-with-action">
                  <input
                    id="lf-nc-password"
                    v-model="nuevoCorreo.password"
                    :type="passwordCorreoVisible ? 'text' : 'password'"
                    autocomplete="new-password"
                    placeholder="Opcional, se puede completar después en Correos"
                    :disabled="guardando"
                  >
                  <button type="button" class="icon-btn" title="Generar contraseña" aria-label="Generar contraseña" :disabled="guardando" @click="generarPasswordCorreo">
                    <i class="ti ti-refresh" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="icon-btn" :title="passwordCorreoVisible ? 'Ocultar' : 'Mostrar'" @click="passwordCorreoVisible = !passwordCorreoVisible">
                    <i :class="passwordCorreoVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="form-group full">
            <label for="lf-clave-sw">{{ esEdicion && licencia?.tiene_clave ? 'Nueva contraseña del software' : 'Contraseña del software' }}</label>
            <div class="input-with-action">
              <input
                id="lf-clave-sw"
                v-model="form.clave"
                :type="claveVisible ? 'text' : 'password'"
                autocomplete="off"
                :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'Dejar vacío si es la misma del correo'"
                :disabled="guardando"
              >
              <button type="button" class="icon-btn" :title="claveVisible ? 'Ocultar' : 'Mostrar'" @click="claveVisible = !claveVisible">
                <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
              </button>
            </div>
            <p class="field-hint">
              Algunos software (ej: AutoCAD) usan el correo como usuario pero tienen su
              propia contraseña. Si se entra con la contraseña del correo, déjalo vacío.
            </p>
          </div>
        </template>

        <div v-if="modoAcceso === 'clave'" class="form-group full">
          <label for="lf-clave">{{ esEdicion && licencia?.tiene_clave ? 'Nueva clave/serial' : 'Clave / serial' }}</label>
          <div class="input-with-action">
            <input
              id="lf-clave"
              v-model="form.clave"
              :type="claveVisible ? 'text' : 'password'"
              autocomplete="off"
              :placeholder="esEdicion && licencia?.tiene_clave ? 'Dejar vacío para mantener la actual' : 'XXXXX-XXXXX-XXXXX'"
              :disabled="guardando"
            >
            <button type="button" class="icon-btn" :title="claveVisible ? 'Ocultar' : 'Mostrar'" @click="claveVisible = !claveVisible">
              <i :class="claveVisible ? 'ti ti-eye-off' : 'ti ti-eye'"></i>
            </button>
          </div>
        </div>

        <div class="form-group full">
          <label for="lf-notas">Notas</label>
          <textarea id="lf-notas" v-model="form.notas" :disabled="guardando"></textarea>
        </div>

        </div>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            <i v-if="guardando" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
  </Transition>

  <ConfirmDialog
    v-if="confirmarDescarte"
    ref="dialogoDescarte"
    destructivo
    titulo="Cambios sin guardar"
    mensaje="Tienes cambios sin guardar, ¿deseas continuar?"
    confirmar-label="Descartar y salir"
    cancelar-label="Seguir editando"
    @cancel="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>

<style scoped>
/* Ancho: .modal-lg de la escala centralizada (main.css) */

.costo-inputs {
  display: flex;
  gap: 6px;
}

.costo-inputs input { flex: 1; }
.costo-inputs select { width: 76px; }

.acceso-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.acceso-option {
  display: flex;
  cursor: pointer;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
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
  font-size: 17px;
  color: var(--color-primary);
  margin-bottom: 3px;
}

.acceso-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.acceso-desc {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.nuevo-correo-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-subtle, var(--color-bg));
  padding: 12px;
}

.nuevo-correo-titulo {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
}

.nuevo-correo-titulo i {
  font-size: 15px;
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
  align-items: center;
}

.input-with-action input { flex: 1; }

.field-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
