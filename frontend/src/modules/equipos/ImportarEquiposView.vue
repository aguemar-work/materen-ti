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
import { toTitleCase, trimText } from '../../core/formatters.js';
import PageHeader from '../../components/shared/PageHeader.vue';
import Pagination from '../../components/shared/Pagination.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
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

// ── Paso actual: 'pegar' → 'mapeo' → 'grid' ──────────────────────
const paso = ref('pegar');
const textoPegado = ref('');
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
    showToast('No se detectaron filas de datos. Verifica que copiaste también la fila de encabezados.', 'error');
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
const TAM_PAGINA_GRID = 25;

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
  const desde = (paginaGrid.value - 1) * TAM_PAGINA_GRID;
  return filasFiltradas.value.slice(desde, desde + TAM_PAGINA_GRID);
});

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

const hayListasParaMigrar = computed(() => filas.value.some(puedeMigrar));

async function migrarTodasListas() {
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
  <div class="importar-page vista-modulo">
    <PageHeader titulo="Importar equipos desde Excel" icono="ti ti-file-import">
      <template #acciones>
        <RouterLink class="btn" to="/equipos"><i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a Equipos</RouterLink>
      </template>
    </PageHeader>

    <main class="page">
      <div v-if="cargandoCatalogos" class="no-results">Cargando catálogos...</div>

      <template v-else>
      <!-- Paso 1: pegar -->
      <div v-if="paso === 'pegar'" class="card importar-paso">
        <h2 class="importar-paso-title">Paso 1 — Pegar los datos</h2>
        <p class="field-hint">
          En Excel, selecciona el rango con la fila de encabezados incluida, cópialo (Ctrl+C) y pégalo aquí abajo.
          Esto crea la bandeja de trabajo — desde ahí corriges cada equipo y lo migras a Equipos cuando esté listo.
        </p>
        <div class="form-group">
          <label for="importar-texto-pegado" class="sr-only">Datos pegados desde Excel</label>
          <textarea id="importar-texto-pegado" v-model="textoPegado" rows="10" placeholder="Pega aquí las filas copiadas de Excel..."></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" :disabled="!textoPegado.trim()" @click="continuarAMapeo">
            Continuar <i class="ti ti-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- Paso 2: mapeo de columnas -->
      <div v-else-if="paso === 'mapeo'" class="card importar-paso">
        <h2 class="importar-paso-title">Paso 2 — Confirmar columnas</h2>
        <p class="field-hint">Se detectaron {{ encabezadosDetectados.length }} columnas y {{ filasCrudas.length }} filas. Revisa que cada una apunte al campo correcto.</p>
        <div class="mapeo-lista">
          <div class="mapeo-lista-head">
            <span>Columna del Excel</span>
            <span class="mapeo-spacer"></span>
            <span>Campo del sistema</span>
          </div>
          <div v-for="(h, i) in encabezadosDetectados" :key="i" class="mapeo-fila">
            <span class="mapeo-original">{{ h.original || `(columna ${i + 1})` }}</span>
            <i class="ti ti-arrow-right" aria-hidden="true"></i>
            <select v-model="h.campo">
              <option v-for="c in CAMPOS_SISTEMA" :key="c.clave" :value="c.clave">{{ c.label }}</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" :disabled="generandoGrilla" @click="paso = 'pegar'">Atrás</button>
          <button class="btn btn-primary" type="button" :disabled="generandoGrilla" @click="continuarAGrilla">
            <i v-if="generandoGrilla" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
            {{ generandoGrilla ? 'Guardando bandeja...' : 'Crear bandeja de corrección' }}
            <i v-if="!generandoGrilla" class="ti ti-arrow-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <!-- Paso 3: bandeja / grilla de corrección -->
      <template v-else>
        <div class="card importar-resumen">
          <div class="importar-resumen__conteo">
            Quedan <strong>{{ filas.length }}</strong> equipos por revisar en la bandeja
            <span v-if="migradosSesion"> · {{ migradosSesion }} migrados en esta sesión</span>
            <span v-if="conErrores" class="importar-resumen__errores"> · {{ conErrores }} con error</span>
          </div>
          <div class="importar-resumen__acciones">
            <button class="btn btn-danger" type="button" :disabled="migrandoLote" @click="confirmarVaciar = true">Vaciar bandeja</button>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="migrandoLote || !hayListasParaMigrar"
              @click="migrarTodasListas"
            >
              <i v-if="migrandoLote" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
              {{ migrandoLote ? `Migrando ${progresoLote.hecho}/${progresoLote.total}...` : 'Migrar todas las filas listas' }}
            </button>
          </div>
        </div>

        <div v-if="!filas.length" class="card no-results">
          Bandeja vacía — todo lo pegado ya se migró a Equipos.
          <button class="btn" type="button" @click="paso = 'pegar'">Pegar otro lote</button>
        </div>

        <div v-else class="card card--fill">
          <div class="filters">
            <div class="search-wrap">
              <i class="ti ti-search"></i>
              <input v-model="busquedaGrid" type="text" placeholder="Buscar por código, marca, serie, usuario del Excel...">
            </div>
            <div class="filter-field">
              <label for="filtro-estado-fila">Estado de fila</label>
              <select id="filtro-estado-fila" v-model="filtroEstadoFila">
                <option value="">Todas</option>
                <option value="pendiente">Pendientes</option>
                <option value="error">Con error</option>
                <option value="duplicado">Con aviso de duplicado</option>
              </select>
            </div>
          </div>

          <div class="table-wrap importar-tabla-wrap">
            <table aria-label="Grilla de corrección de equipos importados">
              <thead>
                <tr>
                  <th scope="col">Excel</th>
                  <th scope="col">Código</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Marca / Modelo</th>
                  <th scope="col">Serie</th>
                  <th scope="col">Costo</th>
                  <th scope="col">F. compra</th>
                  <th scope="col">Estado físico</th>
                  <th scope="col">Asignación</th>
                  <th scope="col">Notas</th>
                  <th scope="col"><span class="sr-only">Migrar</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fila in filasPagina" :key="fila.id">
                  <td class="importar-crudo">
                    <span>{{ fila.raw.categoria }}<template v-if="fila.raw.tipo"> / {{ fila.raw.tipo }}</template></span>
                    <span v-if="fila.duplicadoKapo" class="badge badge--warning badge-inline" title="El Excel marca esta fila como duplicada (columna SUBIDO A KAPO)">
                      <i class="ti ti-alert-triangle" aria-hidden="true"></i> Duplicado en Excel
                    </span>
                  </td>
                  <td>
                    <input v-model="fila.codigo" :aria-invalid="duplicadoCodigo(fila) ? 'true' : undefined" @input="marcarSucia(fila)">
                    <span v-if="duplicadoCodigo(fila)" class="badge badge--danger badge-inline">Código duplicado</span>
                  </td>
                  <td>
                    <select v-model="fila.tipo_id" @change="marcarSucia(fila)">
                      <option v-for="t in tipos" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                    </select>
                  </td>
                  <td class="importar-marca-modelo">
                    <input v-model="fila.marca" placeholder="Marca" @input="marcarSucia(fila)">
                    <input v-model="fila.modelo" placeholder="Modelo" @input="marcarSucia(fila)">
                  </td>
                  <td>
                    <input v-model="fila.serie" :aria-invalid="duplicadoSerie(fila) ? 'true' : undefined" @input="marcarSucia(fila)">
                    <span v-if="duplicadoSerie(fila)" class="badge badge--danger badge-inline">Serie duplicada</span>
                  </td>
                  <td>
                    <input v-model.number="fila.costo" type="number" step="0.01" min="0" @input="marcarSucia(fila)">
                  </td>
                  <td>
                    <input v-model="fila.fecha_compra" type="date" @change="marcarSucia(fila)">
                  </td>
                  <td>
                    <select v-model="fila.estado" @change="marcarSucia(fila)">
                      <option value="operativo">Operativo</option>
                      <option value="en_reparacion">En reparación</option>
                      <option value="de_baja">De baja</option>
                      <option value="perdido">Perdido/robado</option>
                    </select>
                  </td>
                  <td class="importar-asignacion">
                    <select v-model="fila.modo" @change="onModoChange(fila)">
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
                    <div v-else-if="fila.modo === 'ubicacion'" class="importar-ubicacion">
                      <select v-model="fila.ubicacion_id" @change="marcarSucia(fila)">
                        <option value="" disabled>Seleccionar ubicación</option>
                        <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
                      </select>
                    </div>
                    <span v-if="asignacionIncompatible(fila)" class="form-error importar-error-inline" role="alert">
                      Un equipo no operativo no puede quedar asignado — pasa esta fila a "Disponible" o corrige el estado físico
                    </span>
                  </td>
                  <td>
                    <textarea v-model="fila.notas" rows="2" @input="marcarSucia(fila)"></textarea>
                  </td>
                  <td class="importar-guardar">
                    <button
                      class="btn"
                      type="button"
                      :disabled="!puedeMigrar(fila) || fila.estadoFila === 'guardando'"
                      @click="migrarFila(fila)"
                    >
                      <i v-if="fila.estadoFila === 'guardando'" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                      {{ fila.estadoFila === 'guardando' ? '...' : 'Migrar a Equipos' }}
                    </button>
                    <span v-if="fila.errorMsg" class="form-error importar-error-inline" role="alert">{{ fila.errorMsg }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Pagination v-model="paginaGrid" :total-items="filasFiltradas.length" :page-size="TAM_PAGINA_GRID" />
        </div>
      </template>
      </template>
    </main>

    <ConfirmDialog
      v-if="confirmarVaciar"
      destructivo
      icono="ti-trash"
      titulo="Vaciar la bandeja de importación"
      mensaje="Se borrarán todas las filas pendientes de la bandeja (no afecta lo que ya migraste a Equipos). Úsalo si pegaste el lote equivocado."
      confirmar-label="Vaciar bandeja"
      :cargando="vaciando"
      @cancel="confirmarVaciar = false"
      @confirm="confirmarVaciarBandeja"
    />
  </div>
</template>

<style scoped>
.importar-paso {
  padding: 16px 20px 20px;
}

.importar-paso-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 10px;
}

.importar-page textarea { width: 100%; font-family: var(--font-mono, monospace); font-size: 12px; }

.mapeo-lista {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin: 12px 0;
}

.mapeo-lista-head,
.mapeo-fila {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.mapeo-lista-head {
  background: var(--color-bg-subtle);
  font-size: var(--fs-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.mapeo-fila + .mapeo-fila {
  border-top: 1px solid var(--color-border-subtle);
}

.mapeo-spacer { flex: 0 0 18px; }

.mapeo-original {
  flex: 0 0 220px;
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.mapeo-lista-head span:first-child { flex: 0 0 220px; }
.mapeo-lista-head span:last-child { flex: 1; max-width: 280px; }

.mapeo-fila select { flex: 1; max-width: 280px; }

.importar-resumen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 16px 20px 20px;
}

.importar-resumen__conteo { font-size: var(--fs-base); }
.importar-resumen__errores { color: var(--color-danger-text); }
.importar-resumen__acciones { display: flex; gap: 8px; }

.importar-tabla-wrap table { min-width: 1400px; }

.importar-tabla-wrap td,
.importar-tabla-wrap th {
  vertical-align: top;
  padding: 8px;
}

.importar-tabla-wrap input,
.importar-tabla-wrap select,
.importar-tabla-wrap textarea {
  width: 100%;
  min-width: 90px;
  font-size: 12.5px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  padding: 4px 8px;
}

.importar-tabla-wrap input:focus,
.importar-tabla-wrap select:focus,
.importar-tabla-wrap textarea:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--mat-ring);
  outline: none;
}

.importar-marca-modelo,
.importar-asignacion,
.importar-ubicacion {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}

.importar-crudo {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.importar-guardar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  min-width: 100px;
}

.badge-inline {
  margin-left: 6px;
  vertical-align: middle;
}

/* Compactado para caber en una celda densa de la grilla; mismo color,
   fondo y borde que .form-error, solo con menos padding/tamaño. */
.importar-error-inline.form-error {
  font-size: 11px;
  padding: 4px 8px;
  margin: 0;
}

.no-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
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
</style>
