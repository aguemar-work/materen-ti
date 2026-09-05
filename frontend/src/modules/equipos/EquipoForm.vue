<script setup>
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { comprimirImagen } from '../../core/imagenes.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

const props = defineProps({
  equipo: { type: Object, default: null },
});

const emit = defineEmits(['cerrar']);

// Migrado a Modal.vue (mismo patrón que EmpleadoForm.vue/AccesoSensibleForm.vue):
// Teleport, bloqueo de scroll del body, atrapamiento de foco y Escape los
// resuelve el componente compartido.
let resultado = false;

const store = useEquiposStore();

const guardando = ref(false);
const error = ref('');

// Campo que falló el último guardado ('' | 'codigo' | 'codigo_almacen' |
// 'serie'), para resaltar el control y llevarle el foco además del mensaje
// de CarbonNotification.
const campoInvalido = ref('');
const refCodigo = useTemplateRef('refCodigo');
const refCodigoAlmacen = useTemplateRef('refCodigoAlmacen');
const refSerie = useTemplateRef('refSerie');

async function enfocarCampoInvalido() {
  await nextTick();
  const refs = { codigo: refCodigo, codigo_almacen: refCodigoAlmacen, serie: refSerie };
  refs[campoInvalido.value]?.value?.focus();
}

const esEdicion = computed(() => !!props.equipo?.id);

const form = ref({
  codigo: '',
  codigo_almacen: '',
  tipo_id: '',
  marca: '',
  modelo: '',
  serie: '',
  // Sin campo en el formulario (se quitó "Empresa dueña"); se conserva en el
  // estado para no borrar el dato de equipos antiguos al editarlos
  empresa_id: '',
  fecha_compra: '',
  costo: '',
  moneda: 'PEN',
  garantia_hasta: '',
  specs: {},
  accesorios_lineas: [],
  fotos: [],
  notas: '',
});

// Alta rápida / búsqueda en catálogo de almacén
const sugerenciasAcc = ref([]);
const mostrarSugerencias = ref(false);
const { termino: busquedaAcc, cargando: buscandoAcc } = useBusqueda({
  onBuscar: async (q) => {
    if (!q) { sugerenciasAcc.value = []; mostrarSugerencias.value = false; return; }
    try {
      sugerenciasAcc.value = await insforgeApi.listCatalogoAlmacen({ q, limite: 12 });
      mostrarSugerencias.value = true;
    } catch {
      sugerenciasAcc.value = [];
    }
  },
});

const nuevaLinea = ref({ codigo: '', descripcion: '', cantidad: 1 });

// ── Fotos: comprimir y subir al seleccionar ───────────────────
// ⚠️ MAX_FOTOS está duplicado a propósito como MAX_FOTOS_POR_EQUIPO en
// functions/equipos-fotos.ts (2026-08-31): acá oculta el botón y avisa antes
// de subir, allá es el tope real (esta pantalla se puede saltear con
// DevTools). Los dos valores tienen que moverse JUNTOS.
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
      // props.equipo?.id: en alta todavía no hay equipo al que contarle
      // fotos guardadas, el servidor lo sabe y no aplica el tope ahí.
      const foto = await insforgeApi.subirFotoEquipo(comprimida, props.equipo?.id || null);
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

const tipoActual = computed(() => store.tipos.find((t) => t.id === form.value.tipo_id));
const camposSpec = computed(() => tipoActual.value?.campos_spec || []);
const accesoriosSugeridos = computed(() => tipoActual.value?.accesorios_sugeridos || []);

function sugerirCodigo() {
  const nums = store.lista
    .map((e) => /^EQ-(\d+)$/.exec(e.codigo)?.[1])
    .filter(Boolean)
    .map(Number);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `EQ-${String(next).padStart(4, '0')}`;
}

function lineaVacia() {
  return { catalogo_id: null, codigo: '', descripcion: '', cantidad: 1 };
}

// El buscador del catálogo (busquedaAcc) es transitorio y no cuenta como
// cambio; la línea manual a medio escribir (nuevaLinea) sí.
const { modal, tomarSnapshot, confirmarDescarte, dialogoDescarte, confirmarCierre, cancelar, descartarCambios } =
  useFormularioModal(() => ({
    form: form.value,
    nuevaLinea: nuevaLinea.value,
  }));

function resetForm() {
  error.value = '';
  if (props.equipo) {
    form.value = {
      fotos: [...(props.equipo.fotos || [])],
      codigo: props.equipo.codigo,
      codigo_almacen: props.equipo.codigo_almacen || '',
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
      accesorios_lineas: (props.equipo.accesorios_lineas || []).map((l) => ({ ...l })),
      notas: props.equipo.notas || '',
    };
  } else {
    form.value = {
      codigo: sugerirCodigo(), codigo_almacen: '', tipo_id: '', marca: '', modelo: '', serie: '',
      empresa_id: '', fecha_compra: '', costo: '', moneda: 'PEN',
      garantia_hasta: '', specs: {}, accesorios_lineas: [], fotos: [], notas: '',
    };
  }
  busquedaAcc.value = '';
  sugerenciasAcc.value = [];
  nuevaLinea.value = { codigo: '', descripcion: '', cantidad: 1 };
  // El snapshot se toma con el form ya poblado (edición) o en blanco (alta)
  tomarSnapshot();
}

watch(() => props.equipo, resetForm, { immediate: true });

// Al elegir tipo en equipo nuevo (o sin kit), precargar sugeridos del tipo
watch(() => form.value.tipo_id, (tipoId, prev) => {
  if (!tipoId || tipoId === prev) return;
  if (esEdicion.value && form.value.accesorios_lineas.length) return;
  const sugeridos = accesoriosSugeridos.value;
  if (!sugeridos.length) return;
  // Solo precarga si el kit está vacío
  if (form.value.accesorios_lineas.length) return;
  form.value.accesorios_lineas = sugeridos.map((descripcion) => ({
    ...lineaVacia(),
    descripcion,
  }));
});

function quitarLinea(idx) {
  form.value.accesorios_lineas.splice(idx, 1);
}

function yaEstaEnKit(descripcion, codigo) {
  const d = (descripcion || '').trim().toLowerCase();
  const c = (codigo || '').trim().toUpperCase();
  return form.value.accesorios_lineas.some((l) => {
    if (c && (l.codigo || '').toUpperCase() === c) return true;
    return (l.descripcion || '').trim().toLowerCase() === d;
  });
}

function agregarDesdeCatalogo(item) {
  if (yaEstaEnKit(item.descripcion, item.codigo)) {
    error.value = 'Ese accesorio ya está en el kit';
    return;
  }
  form.value.accesorios_lineas.push({
    catalogo_id: item.id,
    codigo: item.codigo || '',
    descripcion: item.descripcion,
    cantidad: 1,
  });
  busquedaAcc.value = '';
  sugerenciasAcc.value = [];
  mostrarSugerencias.value = false;
  error.value = '';
}

async function agregarLineaManual() {
  const descripcion = (nuevaLinea.value.descripcion || '').trim();
  const codigo = (nuevaLinea.value.codigo || '').trim().toUpperCase();
  if (!descripcion) {
    error.value = 'Indica la descripción del accesorio';
    return;
  }
  if (yaEstaEnKit(descripcion, codigo)) {
    error.value = 'Ese accesorio ya está en el kit';
    return;
  }
  let catalogo_id = null;
  try {
    // Si tiene código o es nuevo, lo dejamos en el catálogo para reutilizar
    const creado = await insforgeApi.createCatalogoAlmacen({ codigo, descripcion });
    catalogo_id = creado.id;
  } catch (e) {
    // Código duplicado u otro: igual se agrega al kit sin bloquear
    if (!String(e?.message || '').includes('uq_catalogo')) {
      // intenta buscar por descripción/código
      try {
        const hallados = await insforgeApi.listCatalogoAlmacen({ q: codigo || descripcion, limite: 5 });
        const match = hallados.find((h) =>
          (codigo && (h.codigo || '').toUpperCase() === codigo)
          || (h.descripcion || '').toLowerCase() === descripcion.toLowerCase()
        );
        if (match) catalogo_id = match.id;
      } catch { /* ignore */ }
    }
  }
  form.value.accesorios_lineas.push({
    catalogo_id,
    codigo,
    descripcion,
    cantidad: Math.min(999, Math.max(1, Number(nuevaLinea.value.cantidad) || 1)),
  });
  nuevaLinea.value = { codigo: '', descripcion: '', cantidad: 1 };
  error.value = '';
}

function ocultarSugerencias() {
  setTimeout(() => { mostrarSugerencias.value = false; }, 180);
}

async function guardar() {
  error.value = '';
  campoInvalido.value = '';
  guardando.value = true;
  try {
    const specs = {};
    for (const campo of camposSpec.value) {
      const v = (form.value.specs[campo] || '').trim();
      if (v) specs[campo] = v;
    }
    const lineas = form.value.accesorios_lineas
      .map((l) => ({
        catalogo_id: l.catalogo_id || null,
        codigo: (l.codigo || '').trim(),
        descripcion: (l.descripcion || '').trim(),
        cantidad: Math.min(999, Math.max(1, Number(l.cantidad) || 1)),
      }))
      .filter((l) => l.descripcion);
    const datos = { ...form.value, specs, accesorios_lineas: lineas };
    if (esEdicion.value) {
      await store.actualizar(props.equipo.id, datos);
    } else {
      await store.crear(datos);
    }
    tomarSnapshot();
    resultado = true;
    modal.value?.cerrar();
  } catch (e) {
    if (e?.message?.includes('uq_equipos_serie')) {
      error.value = 'Ya existe un equipo con ese número de serie';
      campoInvalido.value = 'serie';
    } else if (e?.message?.includes('uq_equipos_codigo_almacen')) {
      error.value = 'Ya existe un equipo con ese código de almacén';
      campoInvalido.value = 'codigo_almacen';
    } else if (e?.message?.includes('equipos_codigo') || e?.message?.includes('codigo')) {
      error.value = 'Ya existe un equipo con ese código';
      campoInvalido.value = 'codigo';
    } else {
      error.value = e?.message || 'Error al guardar equipo';
    }
    if (campoInvalido.value) enfocarCampoInvalido();
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <Modal
    ref="modal"
    size="lg"
    :titulo="esEdicion ? 'Editar equipo' : 'Nuevo equipo'"
    :confirmar-cierre="confirmarCierre"
    :cerrar-en-backdrop="false"
    @close="emit('cerrar', resultado)"
  >
    <form id="eq-form" class="form-grid" @submit.prevent="guardar">
        <div class="form-group full section-label">
          <i class="ti ti-device-desktop"></i> Datos del equipo
        </div>

        <CarbonCampo
          ref="refCodigo"
          v-model="form.codigo"
          etiqueta="Código de equipo"
          requerido
          placeholder="EQ-0001"
          :deshabilitado="guardando"
          :error="campoInvalido === 'codigo' ? 'Ya existe un equipo con ese código' : ''"
          @update:model-value="campoInvalido === 'codigo' && (campoInvalido = '')"
        />

        <CarbonCampo
          ref="refCodigoAlmacen"
          v-model="form.codigo_almacen"
          etiqueta="Código de almacén"
          placeholder="Según sistema de almacén"
          :deshabilitado="guardando"
          :error="campoInvalido === 'codigo_almacen' ? 'Ya existe un equipo con ese código de almacén' : ''"
          @update:model-value="campoInvalido === 'codigo_almacen' && (campoInvalido = '')"
        />

        <CarbonCampo v-model="form.tipo_id" etiqueta="Tipo de equipo" tipo="select" requerido :deshabilitado="guardando">
          <template #opciones>
            <option value="" disabled>Seleccionar tipo</option>
            <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
          </template>
        </CarbonCampo>

        <CarbonCampo v-model="form.marca" etiqueta="Marca" placeholder="HP, Lenovo, Epson..." :deshabilitado="guardando" />

        <CarbonCampo v-model="form.modelo" etiqueta="Modelo" :deshabilitado="guardando" />

        <CarbonCampo
          ref="refSerie"
          v-model="form.serie"
          etiqueta="Número de serie"
          :deshabilitado="guardando"
          :error="campoInvalido === 'serie' ? 'Ya existe un equipo con ese número de serie' : ''"
          @update:model-value="campoInvalido === 'serie' && (campoInvalido = '')"
        />

        <CarbonCampo v-model="form.fecha_compra" etiqueta="Fecha de compra" tipo="date" :deshabilitado="guardando" />

        <CarbonCampo v-model="form.garantia_hasta" etiqueta="Garantía hasta" tipo="date" :deshabilitado="guardando" />

        <div class="costo-inputs">
          <CarbonCampo
            v-model="form.costo"
            etiqueta="Precio"
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

        <template v-if="camposSpec.length">
          <div class="form-group full section-label">
            <i class="ti ti-list-details"></i> Especificaciones ({{ tipoActual?.nombre }})
          </div>
          <CarbonCampo
            v-for="campo in camposSpec"
            :key="campo"
            v-model="form.specs[campo]"
            :etiqueta="campo"
            :deshabilitado="guardando"
          />
        </template>

        <!-- Kit de accesorios: lista editable con código de almacén -->
        <template v-if="form.tipo_id">
          <div class="form-group full section-label">
            <i class="ti ti-plug"></i> Accesorios incluidos
          </div>
          <div class="form-group full">
            <div class="acc-buscar">
              <label for="ef-acc-buscar" class="sr-only">Buscar en almacén</label>
              <input
                id="ef-acc-buscar"
                v-model="busquedaAcc"
                placeholder="Buscar en almacén por código o descripción…"
                autocomplete="off"
                :disabled="guardando"
                @focus="mostrarSugerencias = sugerenciasAcc.length > 0"
                @blur="ocultarSugerencias"
              >
              <ul v-if="mostrarSugerencias && sugerenciasAcc.length" class="acc-sugerencias" role="listbox">
                <li
                  v-for="item in sugerenciasAcc"
                  :key="item.id"
                  role="option"
                  @mousedown.prevent="agregarDesdeCatalogo(item)"
                >
                  <span class="acc-sug-codigo">{{ item.codigo || '—' }}</span>
                  <span class="acc-sug-desc">{{ item.descripcion }}</span>
                </li>
              </ul>
              <p v-else-if="buscandoAcc" class="field-hint">Buscando…</p>
            </div>

            <div v-if="form.accesorios_lineas.length" class="acc-lista">
              <div class="acc-lista-head" aria-hidden="true">
                <span>Código</span>
                <span>Descripción</span>
                <span>Cant.</span>
                <span></span>
              </div>
              <div
                v-for="(linea, idx) in form.accesorios_lineas"
                :key="linea.id || `${linea.codigo}-${linea.descripcion}-${idx}`"
                class="acc-fila"
              >
                <input
                  v-model="linea.codigo"
                  placeholder="—"
                  aria-label="Código de almacén"
                  :disabled="guardando"
                >
                <input
                  v-model="linea.descripcion"
                  required
                  placeholder="Descripción"
                  aria-label="Descripción"
                  :disabled="guardando"
                >
                <input
                  v-model.number="linea.cantidad"
                  type="number"
                  min="1"
                  max="999"
                  aria-label="Cantidad"
                  :disabled="guardando"
                >
                <button
                  class="icon-btn"
                  type="button"
                  title="Quitar"
                  aria-label="Quitar accesorio"
                  :disabled="guardando"
                  @click="quitarLinea(idx)"
                >
                  <i class="ti ti-trash" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <p v-else class="field-hint acc-vacio">Sin accesorios. Busca en el almacén o agrega uno abajo.</p>

            <div class="acc-nueva">
              <input
                v-model="nuevaLinea.codigo"
                placeholder="Código almacén"
                :disabled="guardando"
                @keydown.enter.prevent="agregarLineaManual"
              >
              <input
                v-model="nuevaLinea.descripcion"
                placeholder="Descripción (ej. Mouse inalámbrico)"
                :disabled="guardando"
                @keydown.enter.prevent="agregarLineaManual"
              >
              <input
                v-model.number="nuevaLinea.cantidad"
                type="number"
                min="1"
                max="999"
                title="Cantidad"
                aria-label="Cantidad"
                :disabled="guardando"
              >
              <CarbonButton
                variante="secondary"
                tam="sm"
                :deshabilitado="guardando || !nuevaLinea.descripcion.trim()"
                @click="agregarLineaManual"
              >Agregar</CarbonButton>
            </div>
            <p class="field-hint">Los ítems nuevos se guardan en el catálogo de almacén para reutilizarlos.</p>
          </div>
        </template>

        <div class="form-group full section-label">
          <i class="ti ti-camera"></i> Fotos ({{ form.fotos.length }}/{{ MAX_FOTOS }})
        </div>
        <div class="form-group full">
          <div class="fotos-grid">
            <div v-for="foto in form.fotos" :key="foto.key" class="foto-thumb">
              <a :href="foto.url" target="_blank" rel="noopener noreferrer">
                <img :src="foto.url" alt="Foto del equipo">
              </a>
              <button class="foto-x" type="button" title="Quitar foto" aria-label="Quitar foto" :disabled="guardando" @click="quitarFoto(foto)">
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
              <i :class="subiendoFoto ? 'ti ti-loader-2 spinner-icon' : 'ti ti-camera-plus'"></i>
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

        <CarbonCampo v-model="form.notas" class="full" etiqueta="Notas" tipo="textarea" :deshabilitado="guardando" />

        <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>
    </form>

    <template #acciones>
      <CarbonButton variante="secondary" :deshabilitado="guardando" @click="cancelar">Cancelar</CarbonButton>
      <CarbonButton variante="primary" tipo="submit" form="eq-form" :cargando="guardando">
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
   estilos de <input>/<select>/<textarea> viejos que pisarían los de
   CarbonCampo — acá se repite solo el grid-column (mismo criterio que
   LicenciaForm.vue). */
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
   a mano la misma caja outlined que usa CarbonCampo (mismo criterio que
   LicenciaForm.vue). */
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

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.acc-buscar {
  position: relative;
  margin-bottom: 10px;
}

.acc-buscar > input { width: 100%; }

.acc-sugerencias {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  box-shadow: none;
  max-height: 220px;
  overflow-y: auto;
}

.acc-sugerencias li {
  display: flex;
  gap: 10px;
  align-items: baseline;
  padding: 8px 12px;
  cursor: pointer;
  font-size: var(--fs-body-01);
}

.acc-sugerencias li:hover {
  background: var(--color-bg-subtle);
}

.acc-sug-codigo {
  flex: 0 0 88px;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
}

.acc-sug-desc { flex: 1; min-width: 0; }

.acc-lista {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  overflow: hidden;
  margin-bottom: 10px;
}

.acc-lista-head,
.acc-fila {
  display: grid;
  grid-template-columns: 100px 1fr 64px 36px;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
}

.acc-lista-head {
  background: var(--color-bg-subtle);
  font-size: var(--fs-label-01);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.acc-fila + .acc-fila {
  border-top: 1px solid var(--color-border-subtle, var(--color-border));
}

.acc-fila input {
  width: 100%;
  min-width: 0;
}

.acc-fila input[type="number"] {
  text-align: center;
}

.acc-vacio { margin: 0 0 10px; }

.acc-nueva {
  display: grid;
  grid-template-columns: 100px 1fr 64px auto;
  gap: 6px;
  align-items: center;
}

.acc-nueva input { width: 100%; min-width: 0; }
.acc-nueva input[type="number"] { text-align: center; }

.fotos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.foto-thumb {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: var(--radius-base);
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
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--icon-sm);
}

.foto-x:hover { background: var(--color-danger-hover); }

.foto-agregar {
  width: 92px;
  height: 92px;
  border: 1.5px dashed var(--color-border);
  border-radius: var(--radius-base);
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-text-secondary);
  font-size: var(--fs-label-01);
}

.foto-agregar:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.foto-agregar i { font-size: var(--icon-md); }

.field-hint {
  margin: 6px 0 0;
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
}

@media (max-width: 768px) {
  .acc-lista-head,
  .acc-fila,
  .acc-nueva {
    grid-template-columns: 1fr 56px 36px;
  }
  .acc-lista-head span:first-child,
  .acc-fila > input:first-child,
  .acc-nueva > input:first-child {
    display: none;
  }
  .acc-nueva {
    grid-template-columns: 1fr 56px auto;
  }
}
</style>
