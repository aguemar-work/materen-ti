<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { comprimirImagen } from '../../core/imagenes.js';

const props = defineProps({
  equipo: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

const store = useEquiposStore();

const empresas = ref([]);
const cargandoEmpresas = ref(false);
const guardando = ref(false);
const error = ref('');

const esEdicion = computed(() => !!props.equipo?.id);

const form = ref({
  codigo: '',
  tipo_id: '',
  marca: '',
  modelo: '',
  serie: '',
  empresa_id: '',
  fecha_compra: '',
  costo: '',
  moneda: 'PEN',
  garantia_hasta: '',
  specs: {},
  accesorios: [],
  fotos: [],
  notas: '',
});

const accesorioExtra = ref('');

// ── Fotos: comprimir y subir al seleccionar ───────────────────
const MAX_FOTOS = 4;
const subiendoFoto = ref(false);
const inputFotos = ref(null);

async function onFotosSeleccionadas(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  const disponibles = MAX_FOTOS - form.value.fotos.length;
  if (disponibles <= 0) {
    error.value = `Máximo ${MAX_FOTOS} fotos por equipo`;
    return;
  }
  subiendoFoto.value = true;
  error.value = '';
  try {
    for (const file of files.slice(0, disponibles)) {
      const comprimida = await comprimirImagen(file);
      const foto = await insforgeApi.subirFotoEquipo(comprimida);
      form.value.fotos.push(foto);
    }
  } catch (err) {
    error.value = err?.message || 'Error al subir la foto';
  } finally {
    subiendoFoto.value = false;
  }
}

async function quitarFoto(foto) {
  form.value.fotos = form.value.fotos.filter((f) => f.key !== foto.key);
  try {
    await insforgeApi.eliminarFotoEquipo(foto.key);
  } catch { /* si falla, la referencia igual ya no se guardará */ }
}

// Plantilla del tipo seleccionado: campos de specs y accesorios sugeridos
const tipoActual = computed(() => store.tipos.find((t) => t.id === form.value.tipo_id));
const camposSpec = computed(() => tipoActual.value?.campos_spec || []);
const accesoriosSugeridos = computed(() => tipoActual.value?.accesorios_sugeridos || []);

// Accesorios marcados que no están en la plantilla (agregados a mano)
const accesoriosExtras = computed(() =>
  form.value.accesorios.filter((a) => !accesoriosSugeridos.value.includes(a))
);

function sugerirCodigo() {
  // Siguiente correlativo EQ-#### según los equipos ya cargados
  const nums = store.lista
    .map((e) => /^EQ-(\d+)$/.exec(e.codigo)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `EQ-${String(next).padStart(4, '0')}`;
}

function resetForm() {
  error.value = '';
  if (props.equipo) {
    form.value = {
      fotos: [...(props.equipo.fotos || [])],
      codigo: props.equipo.codigo,
      tipo_id: props.equipo.tipo_id,
      marca: props.equipo.marca || '',
      modelo: props.equipo.modelo || '',
      serie: props.equipo.serie || '',
      empresa_id: props.equipo.empresa_id || '',
      fecha_compra: props.equipo.fecha_compra || '',
      costo: props.equipo.costo ?? '',
      moneda: props.equipo.moneda || 'PEN',
      garantia_hasta: props.equipo.garantia_hasta || '',
      specs: { ...(props.equipo.specs || {}) },
      accesorios: [...(props.equipo.accesorios || [])],
      notas: props.equipo.notas || '',
    };
  } else {
    form.value = {
      codigo: sugerirCodigo(), tipo_id: '', marca: '', modelo: '', serie: '',
      empresa_id: '', fecha_compra: '', costo: '', moneda: 'PEN',
      garantia_hasta: '', specs: {}, accesorios: [], fotos: [], notas: '',
    };
  }
  accesorioExtra.value = '';
}

watch(() => props.equipo, resetForm, { immediate: true });

function toggleAccesorio(acc) {
  const idx = form.value.accesorios.indexOf(acc);
  if (idx === -1) form.value.accesorios.push(acc);
  else form.value.accesorios.splice(idx, 1);
}

function agregarAccesorioExtra() {
  const v = accesorioExtra.value.trim();
  if (v && !form.value.accesorios.includes(v)) form.value.accesorios.push(v);
  accesorioExtra.value = '';
}

onMounted(async () => {
  cargandoEmpresas.value = true;
  try {
    empresas.value = await insforgeApi.listEmpresas();
  } catch (e) {
    error.value = e?.message || 'Error al cargar empresas';
  } finally {
    cargandoEmpresas.value = false;
  }
});

function cancelar() {
  emit('cerrar', false);
}

async function guardar() {
  error.value = '';
  guardando.value = true;
  try {
    // Solo se guardan los specs de la plantilla del tipo actual con valor
    const specs = {};
    for (const campo of camposSpec.value) {
      const v = (form.value.specs[campo] || '').trim();
      if (v) specs[campo] = v;
    }
    const datos = { ...form.value, specs };
    if (esEdicion.value) {
      await store.actualizar(props.equipo.id, datos);
    } else {
      await store.crear(datos);
    }
    emit('cerrar', true);
  } catch (e) {
    error.value = e?.message?.includes('uq_equipos_serie')
      ? 'Ya existe un equipo con ese número de serie'
      : e?.message?.includes('codigo')
        ? 'Ya existe un equipo con ese código'
        : (e?.message || 'Error al guardar equipo');
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div class="modal-bg" @click.self="cancelar">
    <div class="modal equipo-form" role="dialog" aria-labelledby="eq-form-title">
      <div class="modal-title">
        <span id="eq-form-title">{{ esEdicion ? 'Editar equipo' : 'Nuevo equipo' }}</span>
        <button class="icon-btn" type="button" aria-label="Cerrar" @click="cancelar">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>

      <form class="form-grid" @submit.prevent="guardar">
        <div class="form-group">
          <label for="ef-codigo">Código de inventario *</label>
          <input id="ef-codigo" v-model="form.codigo" required placeholder="EQ-0001" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="ef-tipo">Tipo de equipo *</label>
          <select id="ef-tipo" v-model="form.tipo_id" required :disabled="guardando">
            <option value="" disabled>Seleccionar tipo</option>
            <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="ef-marca">Marca</label>
          <input id="ef-marca" v-model="form.marca" placeholder="HP, Lenovo, Epson..." :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="ef-modelo">Modelo</label>
          <input id="ef-modelo" v-model="form.modelo" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="ef-serie">Número de serie</label>
          <input id="ef-serie" v-model="form.serie" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="ef-empresa">Empresa dueña</label>
          <select id="ef-empresa" v-model="form.empresa_id" :disabled="guardando || cargandoEmpresas">
            <option value="">Del grupo (sin empresa)</option>
            <option v-for="e in empresas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="ef-compra">Fecha de compra</label>
          <input id="ef-compra" v-model="form.fecha_compra" type="date" :disabled="guardando">
        </div>

        <div class="form-group">
          <label for="ef-garantia">Garantía hasta</label>
          <input id="ef-garantia" v-model="form.garantia_hasta" type="date" :disabled="guardando">
        </div>

        <div class="form-group costo-group">
          <label for="ef-costo">Precio</label>
          <div class="costo-inputs">
            <input id="ef-costo" v-model="form.costo" type="number" step="0.01" min="0" placeholder="0.00" :disabled="guardando">
            <select v-model="form.moneda" :disabled="guardando" aria-label="Moneda">
              <option value="PEN">S/</option>
              <option value="USD">US$</option>
            </select>
          </div>
        </div>

        <!-- Specs según la plantilla del tipo -->
        <template v-if="camposSpec.length">
          <div class="form-group full section-label">
            <i class="ti ti-list-details"></i> Especificaciones ({{ tipoActual?.nombre }})
          </div>
          <div v-for="campo in camposSpec" :key="campo" class="form-group">
            <label :for="`spec-${campo}`">{{ campo }}</label>
            <input :id="`spec-${campo}`" v-model="form.specs[campo]" :disabled="guardando">
          </div>
        </template>

        <!-- Accesorios: sugeridos por el tipo + libres -->
        <template v-if="form.tipo_id">
          <div class="form-group full section-label">
            <i class="ti ti-plug"></i> Accesorios incluidos
          </div>
          <div class="form-group full">
            <div class="acc-chips">
              <label
                v-for="acc in accesoriosSugeridos"
                :key="acc"
                class="acc-chip"
                :class="{ 'acc-chip--on': form.accesorios.includes(acc) }"
              >
                <input
                  type="checkbox"
                  :checked="form.accesorios.includes(acc)"
                  :disabled="guardando"
                  @change="toggleAccesorio(acc)"
                >
                {{ acc }}
              </label>
              <span
                v-for="acc in accesoriosExtras"
                :key="acc"
                class="acc-chip acc-chip--on"
              >
                {{ acc }}
                <button class="chip-x" type="button" title="Quitar" @click="toggleAccesorio(acc)">
                  <i class="ti ti-x"></i>
                </button>
              </span>
            </div>
            <div class="acc-extra">
              <input
                v-model="accesorioExtra"
                placeholder="Otro accesorio..."
                :disabled="guardando"
                @keydown.enter.prevent="agregarAccesorioExtra"
              >
              <button class="btn" type="button" :disabled="guardando || !accesorioExtra.trim()" @click="agregarAccesorioExtra">
                Agregar
              </button>
            </div>
          </div>
        </template>

        <!-- Fotos -->
        <div class="form-group full section-label">
          <i class="ti ti-camera"></i> Fotos ({{ form.fotos.length }}/{{ MAX_FOTOS }})
        </div>
        <div class="form-group full">
          <div class="fotos-grid">
            <div v-for="foto in form.fotos" :key="foto.key" class="foto-thumb">
              <a :href="foto.url" target="_blank" rel="noopener noreferrer">
                <img :src="foto.url" alt="Foto del equipo">
              </a>
              <button class="foto-x" type="button" title="Quitar foto" :disabled="guardando" @click="quitarFoto(foto)">
                <i class="ti ti-x"></i>
              </button>
            </div>
            <button
              v-if="form.fotos.length < MAX_FOTOS"
              class="foto-agregar"
              type="button"
              :disabled="guardando || subiendoFoto"
              @click="inputFotos?.click()"
            >
              <i :class="subiendoFoto ? 'ti ti-loader-2' : 'ti ti-camera-plus'"></i>
              <span>{{ subiendoFoto ? 'Subiendo...' : 'Agregar' }}</span>
            </button>
          </div>
          <input
            ref="inputFotos"
            type="file"
            accept="image/*"
            multiple
            style="display: none"
            @change="onFotosSeleccionadas"
          >
          <p class="field-hint">Se comprimen automáticamente (~200 KB c/u) para no llenar el almacenamiento.</p>
        </div>

        <div class="form-group full">
          <label for="ef-notas">Notas</label>
          <textarea id="ef-notas" v-model="form.notas" :disabled="guardando"></textarea>
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
.equipo-form {
  width: 640px;
  max-width: 95vw;
}

.costo-inputs {
  display: flex;
  gap: 6px;
}

.costo-inputs input { flex: 1; }
.costo-inputs select { width: 76px; }

/* Etiquetas de sección: .section-label global (main.css) */

.acc-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.acc-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  padding: 5px 10px;
  border: 1.5px solid var(--color-border);
  border-radius: 20px;
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s, background 0.15s;
}

.acc-chip input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.acc-chip:hover { border-color: var(--color-primary); }

.acc-chip--on {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  font-weight: 600;
}

.chip-x {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  display: inline-flex;
  font-size: 12px;
}

.acc-extra {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.acc-extra input { flex: 1; }

.fotos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.foto-thumb {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.foto-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.foto-x {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.foto-x:hover { background: rgba(185, 28, 28, 0.85); }

.foto-agregar {
  width: 92px;
  height: 92px;
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-text-secondary);
  font-size: 11.5px;
}

.foto-agregar:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.foto-agregar i { font-size: 20px; }

.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}


.modal-actions.full {
  grid-column: 1 / -1;
}
</style>
