<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useLicenciasStore } from '../../stores/licencias.js';

const props = defineProps({
  licencia: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

const store = useLicenciasStore();

const empresas = ref([]);
const correos = ref([]);
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
const listaCorreosAbierta = ref(false);

const correosFiltrados = computed(() => {
  const q = busquedaCorreo.value.trim().toLowerCase();
  const base = q
    ? correos.value.filter((c) =>
        c.usuario.toLowerCase().includes(q) ||
        (c.plataforma_nombre || '').toLowerCase().includes(q))
    : correos.value;
  return base.slice(0, 8);
});

function seleccionarCorreo(c) {
  form.value.cuenta_id = c.id;
  busquedaCorreo.value = c.usuario;
  listaCorreosAbierta.value = false;
}

function onBuscarCorreo() {
  // Escribir invalida la selección anterior hasta elegir de la lista
  form.value.cuenta_id = '';
  listaCorreosAbierta.value = true;
}

function cerrarListaCorreos() {
  // Pequeño retraso para que el clic en una opción alcance a ejecutarse
  setTimeout(() => { listaCorreosAbierta.value = false; }, 150);
}

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
}

watch(() => props.licencia, resetForm, { immediate: true });

onMounted(async () => {
  cargandoCatalogos.value = true;
  try {
    const [emp, corr] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listCorreosCompartidos(),
    ]);
    empresas.value = emp;
    correos.value = corr;
  } catch (e) {
    error.value = e?.message || 'Error al cargar catálogos';
  } finally {
    cargandoCatalogos.value = false;
  }
});

function cancelar() {
  emit('cerrar', false);
}

async function guardar() {
  error.value = '';
  if (modoAcceso.value === 'login' && !form.value.cuenta_id) {
    error.value = 'Selecciona el correo que da acceso a la licencia';
    return;
  }
  guardando.value = true;
  try {
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
    emit('cerrar', true);
  } catch (e) {
    error.value = e?.message || 'Error al guardar licencia';
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="cancelar">
    <div class="modal licencia-form" role="dialog" aria-labelledby="lic-form-title">
      <div class="modal-title">
        <span id="lic-form-title">{{ esEdicion ? 'Editar licencia' : 'Nueva licencia' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form class="form-grid" @submit.prevent="guardar">
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
            <div class="combo-wrap">
              <i class="ti ti-search combo-icon" aria-hidden="true"></i>
              <input
                id="lf-cuenta"
                v-model="busquedaCorreo"
                type="text"
                autocomplete="off"
                :placeholder="cargandoCatalogos ? 'Cargando correos...' : 'Buscar correo por dirección o plataforma...'"
                :disabled="guardando || cargandoCatalogos"
                :class="{ 'combo-ok': form.cuenta_id }"
                @input="onBuscarCorreo"
                @focus="listaCorreosAbierta = true"
                @blur="cerrarListaCorreos"
              >
              <i v-if="form.cuenta_id" class="ti ti-circle-check-filled combo-check" aria-hidden="true"></i>
              <ul v-if="listaCorreosAbierta && !form.cuenta_id" class="combo-lista">
                <li v-if="correosFiltrados.length === 0" class="combo-vacio">
                  Sin resultados. Regístralo primero en el módulo Correos.
                </li>
                <li
                  v-for="c in correosFiltrados"
                  :key="c.id"
                  @mousedown.prevent="seleccionarCorreo(c)"
                >
                  <span class="combo-usuario">{{ c.usuario }}</span>
                  <span class="combo-plataforma">{{ c.plataforma_nombre }}</span>
                </li>
              </ul>
            </div>
            <p class="field-hint">
              Los usuarios de la licencia se asignan a través de ese correo (desde la ficha
              del empleado). El sistema no permitirá más personas que asientos comprados.
            </p>
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

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <div class="modal-actions full">
          <button class="btn" type="button" :disabled="guardando" @click="cancelar">Cancelar</button>
          <button class="btn btn-primary" type="submit" :disabled="guardando">
            {{ guardando ? 'Guardando...' : 'Guardar' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.licencia-form {
  width: 560px;
  max-width: 95vw;
}

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

.combo-wrap {
  position: relative;
}

.combo-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary);
  font-size: 15px;
  pointer-events: none;
}

.combo-wrap input {
  width: 100%;
  padding-left: 32px;
  padding-right: 32px;
}

.combo-wrap input.combo-ok {
  border-color: var(--color-success);
}

.combo-check {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-success);
  font-size: 16px;
  pointer-events: none;
}

.combo-lista {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: var(--color-bg-elevated, #fff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  max-height: 240px;
  overflow-y: auto;
}

.combo-lista li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.combo-lista li:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 8%, transparent);
}

.combo-vacio {
  color: var(--color-text-secondary);
  cursor: default !important;
  font-size: 12.5px;
}

.combo-vacio:hover {
  background: none !important;
}

.combo-usuario {
  font-family: var(--font-mono, monospace);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-plataforma {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
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
