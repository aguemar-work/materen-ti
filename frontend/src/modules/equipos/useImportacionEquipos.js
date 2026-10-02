// Estado y pasos de la bandeja de importación de equipos desde el Excel de
// activos fijos: pegar → mapear columnas → corregir fila por fila → migrar a
// Equipos. Salió de ImportarEquiposView.vue (781 líneas) para que la vista
// fuera solo el asistente y cada paso su componente (Pegar, Mapeo, Bandeja).
//
// La bandeja vive en la tabla equipos_importacion (migración 057), no en el
// navegador: son ~400 filas, se trabaja en varias sesiones y cualquier staff
// retoma donde quedó otro. Una fila desaparece de la bandeja al migrarla.
//
// MIGRAR: ya no es "crear + asignar + mover + cambiar estado + borrar" desde el
// cliente (4-5 llamadas, con equipos creados a medias si la red se cortaba):
// son las RPC `migrar_importacion_equipo` y `migrar_importacion_equipos` de la
// migración 101 (api/domains/equiposImportacion.js), todo o nada, con las
// mismas reglas de bloqueo que `puedeMigrar` aplica acá para avisar antes.
// Mientras la 101 no esté aplicada en la base, migrar falla contra el backend
// real (la maqueta lo simula).
import { reactive, ref, computed, watch } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { toTitleCase, trimText } from '../../core/formatters.js';
import { totalPaginasDe, clampPagina } from '../../core/paginacionRender.js';
import { TAM_PAGINA_DEFECTO } from '../../constants/paginacion.js';
import {
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

// Tope de filas por llamada de la RPC de lote (cada fila dispara ~6 escrituras).
const FILAS_POR_LOTE = 100;

const mensajeDe = (e, porDefecto) => traducirErrorDb(e, { porDefecto }).mensaje;

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

export function useImportacionEquipos() {
  // ── Paso actual: 'pegar' → 'mapeo' → 'grid' ───────────────────────────
  const paso = ref('pegar');
  const textoPegado = ref('');
  const encabezadosDetectados = ref([]); // [{ original, campo }]
  const filasCrudas = ref([]); // matriz de celdas, sin mapear todavía

  // ── Catálogos (una sola carga, no paginados) ──────────────────────────
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
      showToast(mensajeDe(e, 'Error al cargar catálogos'), 'error');
    } finally {
      cargandoCatalogos.value = false;
    }
  }

  // ── Filas de la bandeja (mapeadas desde equipos_importacion) ──────────
  const filas = ref([]);

  function siguienteCodigoAuto(contador) {
    contador.valor += 1;
    return `EQ-${String(contador.valor).padStart(4, '0')}`;
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
      // trigger de la BD): si la condición sugerida ya no es "operativo", la
      // sugerencia de asignación se descarta y la fila arranca en "Disponible".
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

  // ── Paso 1 → 2: pegar y detectar columnas ─────────────────────────────
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
      await insforgeApi.bulkCrearImportacion(construirFilasParaInsertar());
      const pendientes = await insforgeApi.listImportacionPendiente();
      filas.value = pendientes.map(mapStagingRowToFila);
      textoPegado.value = '';
      paso.value = 'grid';
    } catch (e) {
      showToast(mensajeDe(e, 'Error al guardar el lote en la bandeja'), 'error');
    } finally {
      generandoGrilla.value = false;
    }
  }

  // ── "Empezar de nuevo": vacía la bandeja completa (destructivo) ───────
  const confirmarVaciar = ref(false);
  const vaciando = ref(false);
  const migradosSesion = ref(0);

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
      showToast(mensajeDe(e, 'Error al vaciar la bandeja'), 'error');
    } finally {
      vaciando.value = false;
    }
  }

  // ── Autoguardado de cada corrección (debounced, por fila) ─────────────
  const timersFila = new Map();

  function marcarSucia(fila) {
    // Una fila que falló y se corrige vuelve a poder migrarse en lote.
    if (fila.estadoFila === 'error') {
      fila.estadoFila = 'pendiente';
      fila.errorMsg = '';
    }
    clearTimeout(timersFila.get(fila.id));
    timersFila.set(fila.id, setTimeout(() => persistirFila(fila), 700));
  }

  function onModoChange(fila) {
    if (fila.modo === 'disponible') { fila.empleado_id = ''; fila.ubicacion_id = ''; }
    else if (fila.modo === 'empleado') { fila.ubicacion_id = ''; }
    else { fila.empleado_id = ''; }
    marcarSucia(fila);
  }

  // Lo que se guarda (y lo que la RPC de migrar recibe como correcciones).
  function datosDeFila(fila) {
    return {
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
    };
  }

  async function persistirFila(fila) {
    try {
      await insforgeApi.updateImportacion(fila.id, datosDeFila(fila));
    } catch (e) {
      showToast(mensajeDe(e, 'Error al guardar cambios de la fila'), 'error');
    }
  }

  // ── Duplicados (contra el sistema y dentro del propio lote) ───────────
  const cuenta = (clave) => {
    const m = new Map();
    for (const f of filas.value) {
      const v = (f[clave] || '').trim().toUpperCase();
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return m;
  };
  const codigoCounts = computed(() => cuenta('codigo'));
  const serieCounts = computed(() => cuenta('serie'));

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

  // Un equipo no operativo no puede tener asignación activa (mismo trigger de
  // BD): se bloquea acá para no descubrirlo recién en el error del servidor.
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

  // ── Filtros y paginación de la grilla ─────────────────────────────────
  const busquedaGrid = ref('');
  const filtroEstadoFila = ref('');
  const paginaGrid = ref(1);
  // La bandeja puede tener ~400 filas de un Excel completo: el selector "Filas
  // por página" paga acá. Arranca en el mismo tamaño que el resto de listados.
  const tamPaginaGrid = ref(TAM_PAGINA_DEFECTO);

  const filasFiltradas = computed(() => {
    const q = busquedaGrid.value.trim().toLowerCase();
    return filas.value.filter((f) => {
      if (filtroEstadoFila.value === 'duplicado' && !f.duplicadoKapo && !duplicadoCodigo(f) && !duplicadoSerie(f)) return false;
      if (filtroEstadoFila.value && filtroEstadoFila.value !== 'duplicado' && f.estadoFila !== filtroEstadoFila.value) return false;
      if (!q) return true;
      return `${f.codigo} ${f.marca} ${f.modelo} ${f.serie} ${f.raw.usuario} ${f.raw.categoria}`.toLowerCase().includes(q);
    });
  });
  const totalPaginasGrid = computed(() => totalPaginasDe(filasFiltradas.value.length, tamPaginaGrid.value));
  const filasPagina = computed(() => {
    const desde = (paginaGrid.value - 1) * tamPaginaGrid.value;
    return filasFiltradas.value.slice(desde, desde + tamPaginaGrid.value);
  });

  watch([busquedaGrid, filtroEstadoFila], () => { paginaGrid.value = 1; });

  function irAPaginaGrid(pagina) {
    paginaGrid.value = clampPagina(pagina, totalPaginasGrid.value);
  }

  function cambiarTamPaginaGrid(nuevoTam) {
    tamPaginaGrid.value = nuevoTam;
    paginaGrid.value = 1;
  }

  // ── Progreso y migración ──────────────────────────────────────────────
  const conErrores = computed(() => filas.value.filter((f) => f.estadoFila === 'error').length);
  const conAvisoDuplicado = computed(() => filas.value.filter((f) => f.duplicadoKapo || duplicadoCodigo(f) || duplicadoSerie(f)).length);
  const hayListasParaMigrar = computed(() => filas.value.some(puedeMigrar));
  const cantidadParaMigrar = computed(() => filas.value.filter(puedeMigrar).length);

  // Para que la siguiente fila del lote detecte este código/serie como ocupado
  // (ya no está en `filas`, así que los contadores no lo ven).
  function recordarMigrada(fila) {
    const c = (fila.codigo || '').trim().toUpperCase();
    if (c) existentesCodigo.value.add(c);
    const s = (fila.serie || '').trim().toUpperCase();
    if (s) existentesSerie.value.add(s);
  }

  async function migrarFila(fila) {
    if (!puedeMigrar(fila)) return;
    fila.estadoFila = 'guardando';
    fila.errorMsg = '';
    try {
      // Las correcciones aún no autoguardadas viajan con la llamada.
      clearTimeout(timersFila.get(fila.id));
      await insforgeApi.migrarImportacionEquipo(fila.id, datosDeFila(fila));
      recordarMigrada(fila);
      filas.value = filas.value.filter((f) => f.id !== fila.id);
      migradosSesion.value += 1;
    } catch (e) {
      fila.estadoFila = 'error';
      fila.errorMsg = mensajeDe(e, 'Error al migrar');
    }
  }

  const migrandoLote = ref(false);
  const progresoLote = ref({ hecho: 0, total: 0 });
  const confirmarMigrarTodas = ref(false);

  // Lote: tandas de hasta 100 por la RPC `migrar_importacion_equipos`, que valida
  // TODAS las filas de la tanda antes de escribir. Si el servidor bloquea
  // alguna, no migra ninguna de esa tanda y devuelve el motivo de cada una: se
  // marcan con su motivo (y quedan fuera del lote hasta que se corrijan).
  async function migrarTodasListas() {
    confirmarMigrarTodas.value = false;
    const pendientes = filas.value.filter((f) => puedeMigrar(f) && f.estadoFila !== 'error');
    if (!pendientes.length) return;
    migrandoLote.value = true;
    progresoLote.value = { hecho: 0, total: pendientes.length };
    let migradas = 0;
    let bloqueadas = 0;
    for (let i = 0; i < pendientes.length; i += FILAS_POR_LOTE) {
      const tanda = pendientes.slice(i, i + FILAS_POR_LOTE);
      tanda.forEach((f) => { clearTimeout(timersFila.get(f.id)); f.estadoFila = 'guardando'; });
      try {
        // Las correcciones aún sin autoguardar se guardan antes de validar el lote.
        await Promise.all(tanda.map((f) => persistirFila(f)));
        const resultado = await insforgeApi.migrarImportacionEquipos(tanda.map((f) => f.id));
        if (resultado?.ok) {
          const ids = new Set(tanda.map((f) => f.id));
          tanda.forEach(recordarMigrada);
          filas.value = filas.value.filter((f) => !ids.has(f.id));
          migradas += resultado.migrados ?? tanda.length;
          migradosSesion.value += resultado.migrados ?? tanda.length;
        } else {
          const motivos = new Map((resultado?.bloqueados || []).map((b) => [b.id, b.motivo]));
          tanda.forEach((f) => {
            f.estadoFila = motivos.has(f.id) ? 'error' : 'pendiente';
            f.errorMsg = motivos.get(f.id) || '';
          });
          bloqueadas += motivos.size;
        }
      } catch (e) {
        tanda.forEach((f) => { f.estadoFila = 'error'; f.errorMsg = mensajeDe(e, 'Error al migrar el lote'); });
        bloqueadas += tanda.length;
      }
      progresoLote.value = { hecho: Math.min(i + tanda.length, pendientes.length), total: pendientes.length };
    }
    migrandoLote.value = false;
    if (bloqueadas) {
      showToast(`${migradas} equipos migrados; ${bloqueadas} bloqueados (el motivo está en cada fila)`, 'warning');
    } else {
      showToast(`${migradas} equipos migrados`);
    }
  }

  async function iniciar() {
    await cargarCatalogos();
    try {
      const pendientes = await insforgeApi.listImportacionPendiente();
      if (pendientes.length) {
        filas.value = pendientes.map(mapStagingRowToFila);
        paso.value = 'grid';
      }
    } catch (e) {
      showToast(mensajeDe(e, 'Error al cargar la bandeja de importación'), 'error');
    }
  }

  // `reactive`: los componentes de cada paso reciben este objeto entero y leen
  // `imp.paso`, `imp.filasPagina`… sin `.value` (no se desestructura).
  return reactive({
    paso, textoPegado, encabezadosDetectados, filasCrudas,
    tipos, ubicaciones, empleadosActivos, cargandoCatalogos,
    filas, filasFiltradas, filasPagina,
    busquedaGrid, filtroEstadoFila, paginaGrid, tamPaginaGrid, irAPaginaGrid, cambiarTamPaginaGrid,
    generandoGrilla, continuarAMapeo, continuarAGrilla,
    confirmarVaciar, vaciando, confirmarVaciarBandeja,
    marcarSucia, onModoChange,
    duplicadoCodigo, duplicadoSerie, asignacionIncompatible, puedeMigrar,
    conErrores, conAvisoDuplicado, hayListasParaMigrar, cantidadParaMigrar,
    migradosSesion, migrarFila, migrandoLote, progresoLote, confirmarMigrarTodas, migrarTodasListas,
    iniciar,
  });
}
