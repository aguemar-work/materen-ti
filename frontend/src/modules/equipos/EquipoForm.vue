<script setup>
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { comprimirImagen } from '../../core/imagenes.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

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

const infoError = infoNotificacion('error');
const campoCodigo = useCampoAccesible({
  error: () => (campoInvalido.value === 'codigo' ? 'Ya existe un equipo con ese código' : ''),
});
const campoCodigoAlmacen = useCampoAccesible({
  error: () => (campoInvalido.value === 'codigo_almacen' ? 'Ya existe un equipo con ese código de almacén' : ''),
});
const campoTipo = useCampoAccesible();
const campoMarca = useCampoAccesible();
const campoModelo = useCampoAccesible();
const campoSerie = useCampoAccesible({
  error: () => (campoInvalido.value === 'serie' ? 'Ya existe un equipo con ese número de serie' : ''),
});
const campoFechaCompra = useCampoAccesible();
const campoGarantia = useCampoAccesible();
const campoCosto = useCampoAccesible();
const campoNotas = useCampoAccesible();

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

        <div class="campo" :class="{ 'campo--invalido': campoCodigo.invalido.value, 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoCodigo.id">Código de equipo<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input
              :id="campoCodigo.id"
              ref="refCodigo"
              v-model="form.codigo"
              class="campo__control"
              type="text"
              placeholder="EQ-0001"
              required
              :disabled="guardando"
              :aria-invalid="campoCodigo.invalido.value"
              :aria-describedby="campoCodigo.describedBy.value"
              @input="campoInvalido === 'codigo' && (campoInvalido = '')"
            >
            <i v-if="campoCodigo.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
          </div>
          <p v-if="campoInvalido === 'codigo'" :id="campoCodigo.idAyuda" class="campo__pie campo__pie--error" role="alert">
            Ya existe un equipo con ese código
          </p>
        </div>

        <div class="campo" :class="{ 'campo--invalido': campoCodigoAlmacen.invalido.value, 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoCodigoAlmacen.id">Código de almacén</label>
          <div class="campo__caja">
            <input
              :id="campoCodigoAlmacen.id"
              ref="refCodigoAlmacen"
              v-model="form.codigo_almacen"
              class="campo__control"
              type="text"
              placeholder="Según sistema de almacén"
              :disabled="guardando"
              :aria-invalid="campoCodigoAlmacen.invalido.value"
              :aria-describedby="campoCodigoAlmacen.describedBy.value"
              @input="campoInvalido === 'codigo_almacen' && (campoInvalido = '')"
            >
            <i v-if="campoCodigoAlmacen.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
          </div>
          <p v-if="campoInvalido === 'codigo_almacen'" :id="campoCodigoAlmacen.idAyuda" class="campo__pie campo__pie--error" role="alert">
            Ya existe un equipo con ese código de almacén
          </p>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoTipo.id">Tipo de equipo<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select
              :id="campoTipo.id"
              v-model="form.tipo_id"
              class="campo__control campo__control--select"
              required
              :disabled="guardando"
            >
              <option value="" disabled>Seleccionar tipo</option>
              <option v-for="t in store.tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoMarca.id">Marca</label>
          <div class="campo__caja">
            <input :id="campoMarca.id" v-model="form.marca" class="campo__control" type="text" placeholder="HP, Lenovo, Epson..." :disabled="guardando">
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoModelo.id">Modelo</label>
          <div class="campo__caja">
            <input :id="campoModelo.id" v-model="form.modelo" class="campo__control" type="text" :disabled="guardando">
          </div>
        </div>

        <div class="campo" :class="{ 'campo--invalido': campoSerie.invalido.value, 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoSerie.id">Número de serie</label>
          <div class="campo__caja">
            <input
              :id="campoSerie.id"
              ref="refSerie"
              v-model="form.serie"
              class="campo__control"
              type="text"
              :disabled="guardando"
              :aria-invalid="campoSerie.invalido.value"
              :aria-describedby="campoSerie.describedBy.value"
              @input="campoInvalido === 'serie' && (campoInvalido = '')"
            >
            <i v-if="campoSerie.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
          </div>
          <p v-if="campoInvalido === 'serie'" :id="campoSerie.idAyuda" class="campo__pie campo__pie--error" role="alert">
            Ya existe un equipo con ese número de serie
          </p>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoFechaCompra.id">Fecha de compra</label>
          <div class="campo__caja">
            <input :id="campoFechaCompra.id" v-model="form.fecha_compra" class="campo__control" type="date" :disabled="guardando">
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoGarantia.id">Garantía hasta</label>
          <div class="campo__caja">
            <input :id="campoGarantia.id" v-model="form.garantia_hasta" class="campo__control" type="date" :disabled="guardando">
          </div>
        </div>

        <div class="costo-inputs">
          <div class="campo" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="campoCosto.id">Precio</label>
            <div class="campo__caja">
              <input
                :id="campoCosto.id"
                v-model="form.costo"
                class="campo__control"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                :disabled="guardando"
              >
            </div>
          </div>
          <select v-model="form.moneda" :disabled="guardando" aria-label="Moneda" class="costo-moneda">
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
        </div>

        <template v-if="camposSpec.length">
          <div class="form-group full section-label">
            <i class="ti ti-list-details"></i> Especificaciones ({{ tipoActual?.nombre }})
          </div>
          <div v-for="campo in camposSpec" :key="campo" class="campo" :class="{ 'campo--inerte': guardando }">
            <label class="campo__etiqueta" :for="`eq-spec-${campo}`">{{ campo }}</label>
            <div class="campo__caja">
              <input :id="`eq-spec-${campo}`" v-model="form.specs[campo]" class="campo__control" type="text" :disabled="guardando">
            </div>
          </div>
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
              <button type="button" class="btn btn--secondary btn--sm" :disabled="guardando || !nuevaLinea.descripcion.trim()" @click="agregarLineaManual">
                Agregar
              </button>
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

        <div class="campo full" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoNotas.id">Notas</label>
          <div class="campo__caja">
            <textarea :id="campoNotas.id" v-model="form.notas" class="campo__control campo__control--area" :rows="3" :disabled="guardando"></textarea>
          </div>
        </div>

        <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto">
            <p class="notif__detalle">{{ error }}</p>
          </div>
        </div>
    </form>

    <template #acciones>
      <button type="button" class="btn btn--secondary" :disabled="guardando" @click="cancelar">Cancelar</button>
      <button type="submit" form="eq-form" class="btn btn--primary" :disabled="guardando">
        {{ guardando ? 'Guardando...' : 'Guardar' }}
        <i v-if="guardando" class="ti ti-loader-2" aria-hidden="true"></i>
      </button>
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


