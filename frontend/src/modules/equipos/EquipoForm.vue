<script setup>
import { ref, computed, watch, nextTick, useTemplateRef } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { useEquiposStore } from '../../stores/equipos.js';
import { comprimirImagen } from '../../core/imagenes.js';
import { useFormularioModal } from '../../composables/useFormularioModal.js';
import { useBusqueda } from '../../composables/useBusqueda.js';
import Modal from '../../components/shared/Modal.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
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
    error.value = 'Indique la descripción del accesorio';
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
    } else if (e?.message?.includes('equipos_codigo')) {
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
      <!-- ── Identificación ── -->
      <div class="section-label !mt-0 !border-t-0 !pt-0">
        <i class="ti ti-device-desktop" aria-hidden="true"></i> Datos del equipo
      </div>

      <div class="campo" :class="{ 'campo--invalido': campoCodigo.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCodigo.id">Código de equipo<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            :id="campoCodigo.id"
            ref="refCodigo"
            v-model="form.codigo"
            class="campo__control tabular-nums"
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
            class="campo__control tabular-nums"
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

      <div class="campo" :class="{ 'campo--invalido': campoCodigoAlmacen.invalido.value, 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCodigoAlmacen.id">Código de almacén</label>
        <div class="campo__caja">
          <input
            :id="campoCodigoAlmacen.id"
            ref="refCodigoAlmacen"
            v-model="form.codigo_almacen"
            class="campo__control tabular-nums"
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

      <!-- ── Compra y garantía ── -->
      <div class="section-label">
        <i class="ti ti-receipt" aria-hidden="true"></i> Compra y garantía
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

      <div class="campo" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta" :for="campoCosto.id">Precio</label>
        <div class="campo__caja">
          <select
            v-model="form.moneda"
            :disabled="guardando"
            aria-label="Moneda"
            data-ui
            class="shrink-0 cursor-pointer self-stretch rounded-l-md border-0 border-r border-gray-200 bg-gray-50 pl-3 pr-2 text-sm text-gray-700 focus:outline-none"
          >
            <option value="PEN">S/</option>
            <option value="USD">US$</option>
          </select>
          <input
            :id="campoCosto.id"
            v-model="form.costo"
            class="campo__control tabular-nums"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            :disabled="guardando"
          >
        </div>
      </div>

      <!-- ── Especificaciones (según el tipo) ── -->
      <template v-if="camposSpec.length">
        <div class="section-label">
          <i class="ti ti-list-details" aria-hidden="true"></i> Especificaciones ({{ tipoActual?.nombre }})
        </div>
        <div v-for="campo in camposSpec" :key="campo" class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="`eq-spec-${campo}`">{{ campo }}</label>
          <div class="campo__caja">
            <input :id="`eq-spec-${campo}`" v-model="form.specs[campo]" class="campo__control" type="text" :disabled="guardando">
          </div>
        </div>
      </template>

      <!-- ── Kit de accesorios ── -->
      <template v-if="form.tipo_id">
        <div class="section-label">
          <i class="ti ti-plug" aria-hidden="true"></i> Accesorios incluidos
          <span v-if="form.accesorios_lineas.length" class="rounded-full bg-gray-100 px-1.5 font-medium normal-case tracking-normal text-gray-600 tabular-nums">{{ form.accesorios_lineas.length }}</span>
        </div>
        <div class="full space-y-3">
          <div class="relative">
            <label for="ef-acc-buscar" class="sr-only">Buscar en almacén</label>
            <i class="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
            <input
              id="ef-acc-buscar"
              v-model="busquedaAcc"
              class="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50"
              placeholder="Buscar en almacén por código o descripción…"
              autocomplete="off"
              :disabled="guardando"
              @focus="mostrarSugerencias = sugerenciasAcc.length > 0"
              @blur="ocultarSugerencias"
            >
            <ul
              v-if="mostrarSugerencias && sugerenciasAcc.length"
              class="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
              role="listbox"
            >
              <li
                v-for="item in sugerenciasAcc"
                :key="item.id"
                role="option"
                class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50"
                @mousedown.prevent="agregarDesdeCatalogo(item)"
              >
                <span class="w-24 shrink-0 truncate text-xs text-gray-500 tabular-nums">{{ item.codigo || 'Sin código' }}</span>
                <span class="min-w-0 flex-1 truncate text-gray-900">{{ item.descripcion }}</span>
              </li>
            </ul>
            <p v-else-if="buscandoAcc" class="mt-1 text-xs text-gray-500">Buscando…</p>
          </div>

          <div class="overflow-hidden rounded-md border border-gray-200">
            <div
              class="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem_2.25rem] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500"
              aria-hidden="true"
            >
              <span>Código</span>
              <span>Descripción</span>
              <span>Cant.</span>
              <span></span>
            </div>
            <div
              v-for="(linea, idx) in form.accesorios_lineas"
              :key="linea.id || `${linea.codigo}-${linea.descripcion}-${idx}`"
              class="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem_2.25rem] items-center gap-2 border-b border-gray-100 px-3 py-1.5"
            >
              <input
                v-model="linea.codigo"
                class="h-8 min-w-0 rounded border border-transparent bg-transparent px-1.5 text-sm tabular-nums hover:border-gray-200 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Sin código"
                aria-label="Código de almacén"
                :disabled="guardando"
              >
              <input
                v-model="linea.descripcion"
                class="h-8 min-w-0 rounded border border-transparent bg-transparent px-1.5 text-sm text-gray-900 hover:border-gray-200 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                required
                placeholder="Descripción"
                aria-label="Descripción"
                :disabled="guardando"
              >
              <input
                v-model.number="linea.cantidad"
                class="h-8 min-w-0 rounded border border-transparent bg-transparent px-1.5 text-sm tabular-nums hover:border-gray-200 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                type="number"
                min="1"
                max="999"
                aria-label="Cantidad"
                :disabled="guardando"
              >
              <button
                class="icon-btn danger"
                type="button"
                title="Quitar"
                aria-label="Quitar accesorio"
                :disabled="guardando"
                @click="quitarLinea(idx)"
              >
                <i class="ti ti-trash" aria-hidden="true"></i>
              </button>
            </div>
            <p v-if="!form.accesorios_lineas.length" class="border-b border-gray-100 px-3 py-3 text-sm text-gray-500">
              Sin accesorios. Busque en el almacén o agregue uno abajo.
            </p>

            <!-- Línea nueva, al pie de la misma lista -->
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem_auto] items-center gap-2 bg-gray-50/60 px-3 py-2">
              <input
                v-model="nuevaLinea.codigo"
                class="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Código"
                aria-label="Código de almacén del accesorio nuevo"
                :disabled="guardando"
                @keydown.enter.prevent="agregarLineaManual"
              >
              <input
                v-model="nuevaLinea.descripcion"
                class="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Descripción (ej. Mouse inalámbrico)"
                aria-label="Descripción del accesorio nuevo"
                :disabled="guardando"
                @keydown.enter.prevent="agregarLineaManual"
              >
              <input
                v-model.number="nuevaLinea.cantidad"
                class="h-8 min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                type="number"
                min="1"
                max="999"
                title="Cantidad"
                aria-label="Cantidad"
                :disabled="guardando"
              >
              <AppButton
                size="sm"
                variant="outline"
                severity="secondary"
                icon="ti ti-plus"
                label="Agregar"
                :disabled="guardando || !nuevaLinea.descripcion.trim()"
                @click="agregarLineaManual"
              />
            </div>
          </div>
          <p class="text-xs text-gray-500">Los ítems nuevos se guardan en el catálogo de almacén para reutilizarlos.</p>
        </div>
      </template>

      <!-- ── Fotos (hasta MAX_FOTOS; suben por la edge function equipos-fotos) ── -->
      <div class="section-label">
        <i class="ti ti-camera" aria-hidden="true"></i> Fotos
        <span class="rounded-full bg-gray-100 px-1.5 font-medium normal-case tracking-normal text-gray-600 tabular-nums">{{ form.fotos.length }}/{{ MAX_FOTOS }}</span>
      </div>
      <div class="full">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div v-for="foto in form.fotos" :key="foto.key" class="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
            <a :href="foto.url" target="_blank" rel="noopener noreferrer" class="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500">
              <img :src="foto.url" alt="Foto del equipo" class="h-full w-full object-cover">
            </a>
            <button
              class="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-gray-600 ring-1 ring-gray-200 transition-colors hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
              type="button"
              title="Quitar foto"
              aria-label="Quitar foto"
              :disabled="guardando"
              @click="quitarFoto(foto)"
            >
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
          <button
            v-if="form.fotos.length < MAX_FOTOS"
            class="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            :disabled="guardando || subiendoFoto"
            @click="inputFotos?.click()"
          >
            <i class="text-2xl" :class="subiendoFoto ? 'ti ti-loader-2 animate-spin' : 'ti ti-camera-plus'" aria-hidden="true"></i>
            <span>{{ subiendoFoto ? 'Subiendo...' : 'Agregar foto' }}</span>
          </button>
        </div>
        <input
          ref="inputFotos"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onFotosSeleccionadas"
        >
        <p class="mt-2 text-xs text-gray-500">Se comprimen automáticamente (~200 KB c/u) para no llenar el almacenamiento.</p>
      </div>

      <div class="section-label">
        <i class="ti ti-notes" aria-hidden="true"></i> Notas
      </div>
      <div class="campo full" :class="{ 'campo--inerte': guardando }">
        <label class="campo__etiqueta sr-only" :for="campoNotas.id">Notas</label>
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
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="cancelar" />
      <AppButton type="submit" form="eq-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
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
    @cerrado="confirmarDescarte = false"
    @confirm="descartarCambios"
  />
</template>
