<script setup>
// Bandeja de importación de equipos desde el Excel de activos fijos: pegar →
// mapear columnas → corregir fila por fila (tipo, estado físico, a quién
// está asignado) → migrar a Equipos. La bandeja vive en la tabla
// equipos_importacion (migración 057), no en el navegador: son ~400 filas,
// se trabaja en varias sesiones/días, y cualquier staff debe poder retomar
// donde quedó otro. Una fila desaparece de la bandeja al migrarla — recién
// ahí pasa a existir en el módulo Equipos real.
import { ref, computed, onMounted, watch } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { showToast } from '../../core/toast.js';
import { useVolverContextual } from '../../composables/useVolverContextual.js';
import { toTitleCase, trimText } from '../../core/formatters.js';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppEncabezado from '../../components/ui/AppEncabezado.vue';
import AppBuscador from '../../components/ui/AppBuscador.vue';
import AppSegmentado from '../../components/ui/AppSegmentado.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import AppPaginacion from '../../components/ui/AppPaginacion.vue';
import AppTag from '../../components/ui/AppTag.vue';
import { totalPaginasDe, clampPagina } from '../../core/paginacionRender.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { TAM_PAGINA_DEFECTO } from '../../constants/paginacion.js';
import {
  CAMPOS_SISTEMA,
  detectarCampo,
  parsearPegado,
  sugerirTipoId,
  parsearCosto,
  parsearFecha,
  esDuplicadoKapo,
  sugerirEstadoFisico,
  sugerirAsignacion,
  consolidarNotas,
} from './importarEquipos.js';

const { volver } = useVolverContextual();

// ── Paso actual: 'pegar' → 'mapeo' → 'grid' ──────────────────────
const paso = ref('pegar');
const textoPegado = ref('');
const campoTextoPegado = useCampoAccesible();
const encabezadosDetectados = ref([]); // [{ original, campo }]
const filasCrudas = ref([]); // matriz de celdas, sin mapear todavía

// ── Catálogos (una sola carga, no paginados) ─────────────────────
const tipos = ref([]);
const ubicaciones = ref([]);
const empleadosActivos = ref([]);
const existentesCodigo = ref(new Set());
const existentesSerie = ref(new Set());
const cargandoCatalogos = ref(true);

async function cargarCatalogos() {
  cargandoCatalogos.value = true;
  try {
    const [tiposRes, ubicacionesRes, empleadosRes, equiposRes] = await Promise.all([
      insforgeApi.listTiposEquipo(),
      insforgeApi.listUbicaciones(),
      insforgeApi.listEmpleados(),
      insforgeApi.listEquipos(),
    ]);
    tipos.value = tiposRes;
    ubicaciones.value = ubicacionesRes;
    empleadosActivos.value = empleadosRes.filter((e) => e.estado === 'Activo');
    existentesCodigo.value = new Set(equiposRes.map((e) => (e.codigo || '').toUpperCase()).filter(Boolean));
    existentesSerie.value = new Set(equiposRes.map((e) => (e.serie || '').toUpperCase()).filter(Boolean));
  } catch (e) {
    showToast(e?.message || 'Error al cargar catálogos', 'error');
  } finally {
    cargandoCatalogos.value = false;
  }
}

// ── Filas de la bandeja (mapeadas desde equipos_importacion) ─────
const filas = ref([]);

function mapStagingRowToFila(row) {
  return {
    id: row.id,
    raw: row.raw || {},
    duplicadoKapo: !!row.duplicado_kapo,
    codigo: row.codigo || '',
    tipo_id: row.tipo_id || '',
    marca: row.marca || '',
    modelo: row.modelo || '',
    serie: row.serie || '',
    costo: row.costo != null ? Number(row.costo) : '',
    fecha_compra: row.fecha_compra || '',
    estado: row.estado,
    notas: row.notas || '',
    modo: row.modo,
    empleado_id: row.empleado_id || '',
    ubicacion_id: row.ubicacion_id || '',
    estadoFila: 'pendiente', // transitorio, solo UI: 'pendiente' | 'guardando' | 'error'
    errorMsg: '',
  };
}

function siguienteCodigoAuto(contadorRef) {
  contadorRef.valor += 1;
  return `EQ-${String(contadorRef.valor).padStart(4, '0')}`;
}

// Arma las filas en la forma de la tabla equipos_importacion (snake_case),
// listas para el insert masivo — todavía no son objetos de la grilla.
function construirFilasParaInsertar() {
  const indices = {};
  encabezadosDetectados.value.forEach((h, i) => { if (h.campo !== 'ignorar') indices[h.campo] = i; });
  const val = (celdas, campo) => (indices[campo] != null ? (trimText(celdas[indices[campo]]) || '') : '');

  const numsExistentes = [...existentesCodigo.value]
    .map((c) => /^EQ-(\d+)$/.exec(c)?.[1]).filter(Boolean).map(Number);
  const contador = { valor: numsExistentes.length ? Math.max(...numsExistentes) : 0 };

  return filasCrudas.value.map((celdas) => {
    const raw = {
      categoria: val(celdas, 'categoria'),
      tipo: val(celdas, 'tipo'),
      marca: val(celdas, 'marca'),
      modelo: val(celdas, 'modelo'),
      serie: val(celdas, 'serie'),
      costo: val(celdas, 'costo'),
      fecha_compra: val(celdas, 'fecha_compra'),
      estado_texto: val(celdas, 'estado_texto'),
      usuario: val(celdas, 'usuario'),
      ubicacion_texto: val(celdas, 'ubicacion_texto'),
      observaciones: val(celdas, 'observaciones'),
      subido_kapo: val(celdas, 'subido_kapo'),
      nota_adicional: val(celdas, 'nota_adicional'),
    };
    const codigoExcel = val(celdas, 'codigo').toUpperCase();
    const estado = sugerirEstadoFisico(raw);
    // Un equipo no operativo no puede quedar asignado (lo bloquea el mismo
    // trigger de la BD que usa el resto del sistema): si la condición
    // sugerida ya no es "operativo", la sugerencia de asignación se
    // descarta y la fila arranca en "Disponible" — el usuario decide.
    const asign = estado === 'operativo'
      ? sugerirAsignacion(raw, ubicaciones.value, empleadosActivos.value)
      : { modo: 'disponible', empleado: null, ubicacion: null };

    return {
      raw,
      duplicado_kapo: esDuplicadoKapo(raw.subido_kapo),
      codigo: codigoExcel || siguienteCodigoAuto(contador),
      tipo_id: sugerirTipoId(raw.categoria, raw.tipo, tipos.value) || null,
      marca: toTitleCase(raw.marca),
      modelo: trimText(raw.modelo),
      serie: trimText(raw.serie),
      costo: parsearCosto(raw.costo),
      fecha_compra: parsearFecha(raw.fecha_compra),
      estado,
      notas: consolidarNotas(raw),
      modo: asign.modo,
      empleado_id: asign.empleado?.id || null,
      ubicacion_id: asign.ubicacion?.id || null,
    };
  });
}

// ── Paso 1 → 2: pegar y detectar columnas ────────────────────────
function continuarAMapeo() {
  const { encabezados, filas: datos } = parsearPegado(textoPegado.value);
  if (!encabezados.length || !datos.length) {
    showToast('No se detectaron filas de datos. Verifique que copió también la fila de encabezados.', 'error');
    return;
  }
  encabezadosDetectados.value = encabezados.map((original) => ({ original, campo: detectarCampo(original) }));
  filasCrudas.value = datos;
  paso.value = 'mapeo';
}

const generandoGrilla = ref(false);

async function continuarAGrilla() {
  generandoGrilla.value = true;
  try {
    const filasInsertar = construirFilasParaInsertar();
    await insforgeApi.bulkCrearImportacion(filasInsertar);
    const pendientes = await insforgeApi.listImportacionPendiente();
    filas.value = pendientes.map(mapStagingRowToFila);
    textoPegado.value = '';
    paso.value = 'grid';
  } catch (e) {
    showToast(e?.message || 'Error al guardar el lote en la bandeja', 'error');
  } finally {
    generandoGrilla.value = false;
  }
}

// ── "Empezar de nuevo": vacía la bandeja completa (destructivo) ──
const confirmarVaciar = ref(false);
const vaciando = ref(false);

async function confirmarVaciarBandeja() {
  vaciando.value = true;
  try {
    await insforgeApi.vaciarImportacion();
    filas.value = [];
    encabezadosDetectados.value = [];
    filasCrudas.value = [];
    migradosSesion.value = 0;
    paso.value = 'pegar';
    confirmarVaciar.value = false;
    showToast('Bandeja vaciada');
  } catch (e) {
    showToast(e?.message || 'Error al vaciar la bandeja', 'error');
  } finally {
    vaciando.value = false;
  }
}

// ── Autoguardado de cada corrección (debounced, por fila) ────────
const timersFila = new Map();

function onModoChange(fila) {
  if (fila.modo === 'disponible') { fila.empleado_id = ''; fila.ubicacion_id = ''; }
  else if (fila.modo === 'empleado') { fila.ubicacion_id = ''; }
  else { fila.empleado_id = ''; }
  marcarSucia(fila);
}

function marcarSucia(fila) {
  clearTimeout(timersFila.get(fila.id));
  timersFila.set(fila.id, setTimeout(() => persistirFila(fila), 700));
}

async function persistirFila(fila) {
  try {
    await insforgeApi.updateImportacion(fila.id, {
      codigo: fila.codigo || null,
      tipo_id: fila.tipo_id || null,
      marca: fila.marca || null,
      modelo: fila.modelo || null,
      serie: fila.serie || null,
      costo: fila.costo === '' ? null : fila.costo,
      fecha_compra: fila.fecha_compra || null,
      estado: fila.estado,
      notas: fila.notas || null,
      modo: fila.modo,
      empleado_id: fila.modo === 'empleado' ? (fila.empleado_id || null) : null,
      ubicacion_id: fila.modo === 'ubicacion' ? (fila.ubicacion_id || null) : null,
    });
  } catch (e) {
    showToast(e?.message || 'Error al guardar cambios de la fila', 'error');
  }
}

// ── Duplicados (contra el sistema y dentro del propio lote) ──────
const codigoCounts = computed(() => {
  const m = new Map();
  for (const f of filas.value) {
    const c = (f.codigo || '').trim().toUpperCase();
    if (c) m.set(c, (m.get(c) || 0) + 1);
  }
  return m;
});
const serieCounts = computed(() => {
  const m = new Map();
  for (const f of filas.value) {
    const s = (f.serie || '').trim().toUpperCase();
    if (s) m.set(s, (m.get(s) || 0) + 1);
  }
  return m;
});

function duplicadoCodigo(fila) {
  const c = (fila.codigo || '').trim().toUpperCase();
  if (!c) return false;
  return existentesCodigo.value.has(c) || (codigoCounts.value.get(c) || 0) > 1;
}

function duplicadoSerie(fila) {
  const s = (fila.serie || '').trim().toUpperCase();
  if (!s) return false;
  return existentesSerie.value.has(s) || (serieCounts.value.get(s) || 0) > 1;
}

// ── Filtros y paginación de la grilla ─────────────────────────────
const busquedaGrid = ref('');
const filtroEstadoFila = ref('');
const paginaGrid = ref(1);
// Reactivo (antes una constante): la bandeja puede tener ~400 filas de un
// Excel completo, así que el selector "Filas por página" (CarbonPagination)
// paga acá — no es una lista efímera de 5 filas. Arranca en el mismo tamaño
// que el resto de los listados (antes 25, que no era una de las opciones
// ofrecidas y dejaba el selector mostrando otro número).
const tamPaginaGrid = ref(TAM_PAGINA_DEFECTO);

function cambiarTamPaginaGrid(nuevoTam) {
  tamPaginaGrid.value = nuevoTam;
  paginaGrid.value = 1;
}

const totalPaginasGrid = computed(() => totalPaginasDe(filasFiltradas.value.length, tamPaginaGrid.value));

function irAPaginaGrid(pagina) {
  paginaGrid.value = clampPagina(pagina, totalPaginasGrid.value);
}

const filasFiltradas = computed(() => {
  const q = busquedaGrid.value.trim().toLowerCase();
  return filas.value.filter((f) => {
    if (filtroEstadoFila.value === 'duplicado' && !f.duplicadoKapo && !duplicadoCodigo(f) && !duplicadoSerie(f)) return false;
    if (filtroEstadoFila.value && filtroEstadoFila.value !== 'duplicado' && f.estadoFila !== filtroEstadoFila.value) return false;
    if (!q) return true;
    const texto = `${f.codigo} ${f.marca} ${f.modelo} ${f.serie} ${f.raw.usuario} ${f.raw.categoria}`.toLowerCase();
    return texto.includes(q);
  });
});

watch([busquedaGrid, filtroEstadoFila], () => { paginaGrid.value = 1; });

const filasPagina = computed(() => {
  const desde = (paginaGrid.value - 1) * tamPaginaGrid.value;
  return filasFiltradas.value.slice(desde, desde + tamPaginaGrid.value);
});

// Definición de columnas de CarbonDataTable. Son siempre las mismas 11 —a
// diferencia de la primera impresión, el mapeo del Excel decide qué llena
// cada celda, no qué columnas existen— así que no hay nada dinámico acá.
// `:con-tarjetas="false"` porque esto es una grilla de EDICIÓN (input/select/
// textarea por celda, varias BuscadorCombo), no un listado: no existe una
// tarjeta móvil razonable para esto, ya vivía como tabla con scroll
// horizontal (`min-width: 1400px`) y sigue así.
const columnasImportar = [
  { clave: 'excel', label: 'Excel' },
  { clave: 'codigo', label: 'Código' },
  { clave: 'tipo', label: 'Tipo' },
  { clave: 'marca_modelo', label: 'Marca / Modelo' },
  { clave: 'serie', label: 'Serie' },
  { clave: 'costo', label: 'Costo' },
  { clave: 'fecha_compra', label: 'F. compra' },
  { clave: 'estado_fisico', label: 'Estado físico' },
  { clave: 'asignacion', label: 'Asignación' },
  { clave: 'notas', label: 'Notas', elastica: true },
  { clave: 'migrar', label: 'Migrar' },
];
const columnasImportarVisibles = computed(() => columnasImportar.filter((c) => !c.oculta));
const totalColumnasImportar = computed(() => columnasImportarVisibles.value.length);

// Fila con error de migración resaltada (caso de uso real para `claseFila`):
// el mensaje de error ya se ve en su celda, pero el tinte de fila entera
// ayuda a ubicarla de un vistazo en una bandeja de ~400 filas.
function claseFilaImportar(fila) {
  return fila.estadoFila === 'error' ? 'bg-red-50/60' : 'bg-white';
}

// ── Presentación del paso 3 (rediseño 2026-09-23) ──────────────
const conAvisoDuplicado = computed(() => filas.value.filter((f) => f.duplicadoKapo || duplicadoCodigo(f) || duplicadoSerie(f)).length);
const opcionesEstadoFila = computed(() => [
  { valor: '', label: 'Todas', conteo: filas.value.length },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'error', label: 'Con error', conteo: conErrores.value || null },
  { valor: 'duplicado', label: 'Duplicados', conteo: conAvisoDuplicado.value || null },
]);
const PASOS = [
  { id: 'pegar', label: 'Pegar datos' },
  { id: 'mapeo', label: 'Confirmar columnas' },
  { id: 'grid', label: 'Corregir y migrar' },
];
const indicePaso = computed(() => PASOS.findIndex((p) => p.id === paso.value));

// Ancho de cada columna de la grilla (la de Notas toma el resto).
const ANCHOS_IMPORTAR = {
  excel: '11rem', codigo: '8rem', tipo: '10rem', marca_modelo: '11rem', serie: '9rem', costo: '7rem',
  fecha_compra: '9.5rem', estado_fisico: '9.5rem', asignacion: '14rem', notas: null, migrar: '9rem',
};

// Clases compartidas de los controles de la grilla de edición.
const CTRL = 'h-8 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 aria-[invalid=true]:border-red-500';

// ── Progreso ───────────────────────────────────────────────────────
const migradosSesion = ref(0);
const conErrores = computed(() => filas.value.filter((f) => f.estadoFila === 'error').length);

// Un equipo no operativo no puede tener asignación activa (mismo trigger de
// BD que ya respeta EquiposView.vue): se bloquea acá para no descubrirlo
// recién en el error del servidor.
function asignacionIncompatible(fila) {
  return fila.modo !== 'disponible' && fila.estado !== 'operativo';
}

function puedeMigrar(fila) {
  if (fila.estadoFila === 'guardando') return false;
  if (!fila.codigo?.trim() || !fila.tipo_id) return false;
  if (duplicadoCodigo(fila) || duplicadoSerie(fila)) return false;
  if (asignacionIncompatible(fila)) return false;
  if (fila.modo === 'empleado' && !fila.empleado_id) return false;
  if (fila.modo === 'ubicacion' && !fila.ubicacion_id) return false;
  return true;
}

function mensajeErrorMigracion(e) {
  const msg = e?.message || '';
  if (msg.includes('uq_equipos_serie')) return 'Ya existe un equipo con ese número de serie';
  if (msg.includes('uq_equipos_codigo_almacen')) return 'Ya existe un equipo con ese código de almacén';
  if (msg.includes('equipos_codigo') || msg.includes('codigo')) return 'Ya existe un equipo con ese código';
  return msg || 'Error al migrar';
}

async function migrarFila(fila) {
  if (!puedeMigrar(fila)) return;
  fila.estadoFila = 'guardando';
  fila.errorMsg = '';
  try {
    const { id } = await insforgeApi.createEquipo({
      codigo: fila.codigo,
      tipo_id: fila.tipo_id,
      marca: fila.marca,
      modelo: fila.modelo,
      serie: fila.serie,
      fecha_compra: fila.fecha_compra || null,
      costo: fila.costo === '' ? null : fila.costo,
      moneda: fila.costo ? 'PEN' : null,
      notas: fila.notas,
    });
    // Orden importante: el equipo nace "operativo" (default de la tabla), así
    // que la asignación se hace primero — si se cambiara el estado antes, el
    // mismo trigger que usa el resto del sistema rechazaría la asignación.
    if (fila.modo === 'empleado' && fila.empleado_id) {
      await insforgeApi.asignarEquipo(id, fila.empleado_id, '');
    } else if (fila.modo === 'ubicacion' && fila.ubicacion_id) {
      await insforgeApi.moverEquipo(id, fila.ubicacion_id);
    }
    if (fila.estado !== 'operativo') {
      await insforgeApi.cambiarEstadoEquipo(id, fila.estado);
    }
    await insforgeApi.eliminarImportacion(fila.id);
    // Para que la siguiente fila del lote detecte este código/serie como
    // ocupado (ya no está en `filas`, así que codigoCounts/serieCounts ya
    // no lo ven).
    const c = fila.codigo.trim().toUpperCase();
    if (c) existentesCodigo.value.add(c);
    const s = (fila.serie || '').trim().toUpperCase();
    if (s) existentesSerie.value.add(s);
    filas.value = filas.value.filter((f) => f.id !== fila.id);
    migradosSesion.value += 1;
  } catch (e) {
    fila.estadoFila = 'error';
    fila.errorMsg = mensajeErrorMigracion(e);
  }
}

const migrandoLote = ref(false);
const progresoLote = ref({ hecho: 0, total: 0 });
const confirmarMigrarTodas = ref(false);

const hayListasParaMigrar = computed(() => filas.value.some(puedeMigrar));
const cantidadParaMigrar = computed(() => filas.value.filter(puedeMigrar).length);

async function migrarTodasListas() {
  confirmarMigrarTodas.value = false;
  const pendientes = filas.value.filter(puedeMigrar);
  if (!pendientes.length) return;
  migrandoLote.value = true;
  progresoLote.value = { hecho: 0, total: pendientes.length };
  for (const fila of pendientes) {
    await migrarFila(fila);
    progresoLote.value = { hecho: progresoLote.value.hecho + 1, total: pendientes.length };
  }
  migrandoLote.value = false;
  showToast(`${progresoLote.value.hecho} equipos migrados`);
}

onMounted(async () => {
  await cargarCatalogos();
  try {
    const pendientes = await insforgeApi.listImportacionPendiente();
    if (pendientes.length) {
      filas.value = pendientes.map(mapStagingRowToFila);
      paso.value = 'grid';
    }
  } catch (e) {
    showToast(e?.message || 'Error al cargar la bandeja de importación', 'error');
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppEncabezado
      titulo="Importar equipos desde Excel"
      volver-label="Equipos"
      :subtitulo="paso === 'grid'
        ? `${filas.length} ${filas.length === 1 ? 'equipo' : 'equipos'} en la bandeja · ${cantidadParaMigrar} ${cantidadParaMigrar === 1 ? 'listo' : 'listos'} para migrar`
        : 'Pegue el inventario, confirme las columnas y corrija cada equipo antes de migrarlo'"
      @volver="volver('/equipos')"
    >
      <template v-if="paso === 'grid' && !cargandoCatalogos" #acciones>
        <AppButton variant="outline" severity="danger" icon="ti ti-trash" label="Vaciar bandeja" :disabled="migrandoLote" @click="confirmarVaciar = true" />
        <AppButton
          icon="ti ti-file-import"
          :label="migrandoLote ? `Migrando ${progresoLote.hecho}/${progresoLote.total}...` : 'Migrar filas listas'"
          :loading="migrandoLote"
          :disabled="!hayListasParaMigrar"
          @click="confirmarMigrarTodas = true"
        />
      </template>
    </AppEncabezado>

    <!-- ══ Pasos del asistente ═══════════════════════════════════ -->
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 pb-4 text-sm sm:px-6" aria-label="Pasos de la importación">
      <li v-for="(p, i) in PASOS" :key="p.id" class="flex items-center gap-2" :aria-current="paso === p.id ? 'step' : undefined">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
          :class="i < indicePaso ? 'bg-green-50 text-green-700' : i === indicePaso ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200' : 'bg-gray-100 text-gray-500'"
        >
          <i v-if="i < indicePaso" class="ti ti-check" aria-hidden="true"></i>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span :class="i === indicePaso ? 'font-medium text-gray-900' : 'text-gray-500'">{{ p.label }}</span>
        <i v-if="i < PASOS.length - 1" class="ti ti-chevron-right mx-1 text-gray-300" aria-hidden="true"></i>
      </li>
    </ol>

    <div class="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
      <p v-if="cargandoCatalogos" class="py-16 text-center text-sm text-gray-500" role="status">Cargando catálogos...</p>

      <template v-else>
        <!-- ── Paso 1: pegar ── -->
        <section v-if="paso === 'pegar'" class="max-w-3xl rounded-lg border border-gray-200 bg-white p-5" aria-labelledby="paso-pegar">
          <h2 id="paso-pegar" class="text-base font-semibold text-gray-900">Pegar los datos</h2>
          <p class="mt-1 text-sm text-gray-500">
            En Excel, seleccione el rango con la fila de encabezados incluida, cópielo (Ctrl+C) y péguelo aquí abajo.
            Esto crea la bandeja de trabajo: desde ahí se corrige cada equipo y se migra a Equipos cuando esté listo.
          </p>
          <div class="campo mt-4">
            <label class="campo__etiqueta" :for="campoTextoPegado.id">Datos pegados desde Excel</label>
            <div class="campo__caja">
              <textarea
                :id="campoTextoPegado.id"
                v-model="textoPegado"
                class="campo__control campo__control--area font-mono text-xs"
                :rows="12"
                placeholder="Pegue aquí las filas copiadas de Excel..."
              ></textarea>
            </div>
          </div>
          <div class="mt-5 flex justify-end border-t border-gray-100 pt-4">
            <AppButton icon="ti ti-arrow-right" icon-pos="right" label="Continuar" :disabled="!textoPegado.trim()" @click="continuarAMapeo" />
          </div>
        </section>

        <!-- ── Paso 2: mapeo de columnas ── -->
        <section v-else-if="paso === 'mapeo'" class="max-w-3xl rounded-lg border border-gray-200 bg-white" aria-labelledby="paso-mapeo">
          <div class="p-5 pb-4">
            <h2 id="paso-mapeo" class="text-base font-semibold text-gray-900">Confirmar columnas</h2>
            <p class="mt-1 text-sm text-gray-500">
              Se detectaron <span class="font-medium text-gray-900 tabular-nums">{{ encabezadosDetectados.length }}</span> columnas y
              <span class="font-medium text-gray-900 tabular-nums">{{ filasCrudas.length }}</span> filas. Revise que cada una apunte al campo correcto.
            </p>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] gap-3 border-y border-gray-100 bg-gray-50 px-5 py-2 text-xs font-medium text-gray-500">
            <span>Columna del Excel</span>
            <span></span>
            <span>Campo del sistema</span>
          </div>
          <ul class="divide-y divide-gray-100">
            <li
              v-for="(h, i) in encabezadosDetectados"
              :key="i"
              class="grid grid-cols-[minmax(0,1fr)_1.5rem_minmax(0,1fr)] items-center gap-3 px-5 py-2"
            >
              <span class="truncate text-sm" :class="h.original ? 'text-gray-900' : 'text-gray-500'">{{ h.original || `(columna ${i + 1})` }}</span>
              <i class="ti ti-arrow-right text-center text-gray-300" aria-hidden="true"></i>
              <label class="relative block">
                <span class="sr-only">Campo del sistema para {{ h.original || `columna ${i + 1}` }}</span>
                <select
                  v-model="h.campo"
                  data-ui
                  class="h-9 w-full cursor-pointer appearance-none rounded-md border bg-white pl-3 pr-9 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  :class="h.campo === 'ignorar' ? 'border-gray-200 text-gray-500' : 'border-gray-300 text-gray-900'"
                >
                  <option v-for="c in CAMPOS_SISTEMA" :key="c.clave" :value="c.clave">{{ c.label }}</option>
                </select>
                <i class="ti ti-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden="true"></i>
              </label>
            </li>
          </ul>
          <div class="flex justify-end gap-2 border-t border-gray-100 p-4">
            <AppButton variant="outline" severity="secondary" icon="ti ti-arrow-left" label="Atrás" :disabled="generandoGrilla" @click="paso = 'pegar'" />
            <AppButton
              :icon="generandoGrilla ? undefined : 'ti ti-arrow-right'"
              icon-pos="right"
              :label="generandoGrilla ? 'Guardando bandeja...' : 'Crear bandeja de corrección'"
              :loading="generandoGrilla"
              @click="continuarAGrilla"
            />
          </div>
        </section>

        <!-- ── Paso 3: bandeja / grilla de corrección ── -->
        <template v-else>
          <p v-if="migradosSesion" class="mb-3 flex items-center gap-2 text-sm text-green-700" role="status">
            <i class="ti ti-circle-check" aria-hidden="true"></i>
            {{ migradosSesion }} {{ migradosSesion === 1 ? 'equipo migrado' : 'equipos migrados' }} a Equipos en esta sesión
          </p>

          <AppVacio
            v-if="!filas.length"
            icono="ti ti-inbox"
            titulo="Bandeja vacía"
            mensaje="Todo lo pegado ya se migró a Equipos. Pegue otro lote para continuar."
          >
            <AppButton variant="outline" severity="secondary" icon="ti ti-clipboard" label="Pegar otro lote" @click="paso = 'pegar'" />
          </AppVacio>

          <template v-else>
            <div class="flex flex-wrap items-center gap-3 pb-4">
              <AppBuscador v-model="busquedaGrid" label="Buscar en la bandeja" placeholder="Buscar por código, marca, serie o usuario del Excel" />
              <AppSegmentado v-model="filtroEstadoFila" :opciones="opcionesEstadoFila" label="Filtrar por estado de fila" />
            </div>

            <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
              <!-- Grilla de EDICIÓN (input/select por celda): se desplaza en
                   horizontal dentro de la card a propósito, también en móvil. -->
              <div class="min-h-0 flex-1 overflow-auto">
                <table class="w-full min-w-[1400px] border-collapse text-sm" aria-label="Grilla de corrección de equipos importados">
                  <thead class="sticky top-0 z-[1] bg-white">
                    <tr>
                      <th
                        v-for="col in columnasImportarVisibles"
                        :key="col.clave"
                        scope="col"
                        class="whitespace-nowrap border-b border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-600"
                        :class="col.clave === 'migrar' ? 'sticky right-0 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-gray-200' : ''"
                        :style="ANCHOS_IMPORTAR[col.clave] ? { width: ANCHOS_IMPORTAR[col.clave], minWidth: ANCHOS_IMPORTAR[col.clave] } : null"
                      >{{ col.label }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!filasPagina.length">
                      <td :colspan="totalColumnasImportar" class="px-4 py-12 text-center">
                        <p class="text-sm font-medium text-gray-900">Sin resultados</p>
                        <p class="mt-1 text-sm text-gray-500">Ninguna fila coincide con la búsqueda o el filtro.</p>
                      </td>
                    </tr>
                    <template v-else>
                      <tr v-for="fila in filasPagina" :key="fila.id" :class="claseFilaImportar(fila)" class="align-top">
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <div class="flex flex-col items-start gap-1">
                            <span class="text-xs text-gray-500">{{ fila.raw.categoria }}<template v-if="fila.raw.tipo"> / {{ fila.raw.tipo }}</template></span>
                            <span v-if="fila.raw.usuario" class="text-xs text-gray-500">{{ fila.raw.usuario }}</span>
                            <AppTag v-if="fila.duplicadoKapo" tono="warning" icono="ti ti-alert-triangle" title="El Excel marca esta fila como duplicada (columna SUBIDO A KAPO)">
                              Duplicado en Excel
                            </AppTag>
                          </div>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <input v-model="fila.codigo" :class="[CTRL, 'tabular-nums']" aria-label="Código" :aria-invalid="duplicadoCodigo(fila) ? 'true' : undefined" @input="marcarSucia(fila)">
                          <AppTag v-if="duplicadoCodigo(fila)" tono="danger" class="mt-1">Código duplicado</AppTag>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <select v-model="fila.tipo_id" :class="[CTRL, !fila.tipo_id && 'border-amber-400']" aria-label="Tipo" @change="marcarSucia(fila)">
                            <option v-for="t in tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                          </select>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <div class="flex flex-col gap-1">
                            <input v-model="fila.marca" :class="CTRL" placeholder="Marca" aria-label="Marca" @input="marcarSucia(fila)">
                            <input v-model="fila.modelo" :class="CTRL" placeholder="Modelo" aria-label="Modelo" @input="marcarSucia(fila)">
                          </div>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <input v-model="fila.serie" :class="[CTRL, 'tabular-nums']" aria-label="Serie" :aria-invalid="duplicadoSerie(fila) ? 'true' : undefined" @input="marcarSucia(fila)">
                          <AppTag v-if="duplicadoSerie(fila)" tono="danger" class="mt-1">Serie duplicada</AppTag>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <input v-model.number="fila.costo" :class="[CTRL, 'tabular-nums']" type="number" step="0.01" min="0" aria-label="Costo" @input="marcarSucia(fila)">
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <input v-model="fila.fecha_compra" :class="CTRL" type="date" aria-label="Fecha de compra" @change="marcarSucia(fila)">
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <select v-model="fila.estado" :class="CTRL" aria-label="Estado físico" @change="marcarSucia(fila)">
                            <option value="operativo">Operativo</option>
                            <option value="en_reparacion">En reparación</option>
                            <option value="de_baja">De baja</option>
                            <option value="perdido">Perdido/robado</option>
                          </select>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <div class="flex flex-col gap-1">
                            <select v-model="fila.modo" :class="CTRL" aria-label="Asignación" @change="onModoChange(fila)">
                              <option value="disponible">Disponible</option>
                              <option value="empleado">Asignado a empleado</option>
                              <option value="ubicacion">En ubicación</option>
                            </select>
                            <BuscadorCombo
                              v-if="fila.modo === 'empleado'"
                              v-model="fila.empleado_id"
                              :items="empleadosActivos"
                              :campos-busqueda="['nombres', 'apellidos', 'dni']"
                              :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
                              placeholder="Buscar empleado..."
                              @update:model-value="marcarSucia(fila)"
                            >
                              <template #resultado="{ item }">
                                <span>{{ item.nombres }} {{ item.apellidos }}</span>
                                <span class="combo-sec">{{ item.dni }}</span>
                              </template>
                            </BuscadorCombo>
                            <select v-else-if="fila.modo === 'ubicacion'" v-model="fila.ubicacion_id" :class="CTRL" aria-label="Ubicación" @change="marcarSucia(fila)">
                              <option value="" disabled>Seleccionar ubicación</option>
                              <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                            </select>
                            <p v-if="asignacionIncompatible(fila)" class="text-xs text-red-700" role="alert">
                              Un equipo no operativo no puede quedar asignado: pase esta fila a "Disponible" o corrija el estado físico.
                            </p>
                          </div>
                        </td>
                        <td class="border-b border-gray-100 px-3 py-2.5">
                          <textarea
                            v-model="fila.notas"
                            rows="2"
                            class="min-h-16 w-full min-w-48 resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                            aria-label="Notas"
                            @input="marcarSucia(fila)"
                          ></textarea>
                        </td>
                        <!-- Fija a la derecha: la acción de la fila siempre a la vista -->
                        <td class="sticky right-0 border-b border-gray-100 px-3 py-2.5 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-gray-200" :class="fila.estadoFila === 'error' ? 'bg-red-50' : 'bg-white'">
                          <div class="flex flex-col items-start gap-1">
                            <AppButton
                              variant="outline"
                              severity="secondary"
                              size="sm"
                              icon="ti ti-arrow-right"
                              icon-pos="right"
                              :label="fila.estadoFila === 'guardando' ? 'Migrando...' : 'Migrar'"
                              :loading="fila.estadoFila === 'guardando'"
                              :disabled="!puedeMigrar(fila)"
                              :aria-label="`Migrar ${fila.codigo || 'fila'} a Equipos`"
                              @click="migrarFila(fila)"
                            />
                            <p v-if="fila.errorMsg" class="text-xs text-red-700" role="alert">{{ fila.errorMsg }}</p>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <AppPaginacion
                v-if="filasFiltradas.length > 0"
                :pagina="paginaGrid"
                :tam-pagina="tamPaginaGrid"
                :total="filasFiltradas.length"
                @update:pagina="irAPaginaGrid"
                @update:tam-pagina="cambiarTamPaginaGrid"
              />
            </div>
          </template>
        </template>
      </template>
    </div>

    <ConfirmDialog
      v-if="confirmarVaciar"
      destructivo
      icono="ti-trash"
      titulo="Vaciar la bandeja de importación"
      mensaje="Se borrarán todas las filas pendientes de la bandeja (no afecta lo que ya se migró a Equipos). Úselo si pegó el lote equivocado."
      confirmar-label="Vaciar bandeja"
      :cargando="vaciando"
      @cerrado="confirmarVaciar = false"
      @confirm="confirmarVaciarBandeja"
    />

    <ConfirmDialog
      v-if="confirmarMigrarTodas"
      icono="ti-file-import"
      titulo="Migrar todas las filas listas"
      :mensaje="`Se crearán ${cantidadParaMigrar} equipos nuevos en el sistema (con su asignación/ubicación indicada). Esta acción no se puede deshacer desde acá.`"
      confirmar-label="Migrar"
      @cerrado="confirmarMigrarTodas = false"
      @confirm="migrarTodasListas"
    />
  </div>
</template>
