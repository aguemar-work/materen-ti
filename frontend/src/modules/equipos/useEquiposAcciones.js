// Acciones sobre UN equipo, compartidas por el listado (EquiposView) y la hoja
// de vida (EquipoDetalleView): entregar, devolver, mover de ubicación, cambiar
// el estado físico y verificar. Antes vivían copiadas dentro de EquiposView.vue
// (1183 líneas); ahora el estado y los pasos están acá y el marcado de los
// diálogos en EquipoAccionesModales.vue.
//
// Todo pasa por las RPC transaccionales de la migración 101 (api/domains/
// equipos.js): una acción es una sola llamada, o se hace entera o no se hace, y
// un rechazo de negocio llega ya en español. Mientras la 101 no esté aplicada
// en la base, estas acciones fallan contra el backend real (la maqueta las
// simula completas).
//
// Uso (en `setup`):
//   const acciones = useEquiposAcciones({ alCambiar: (idEquipo) => recargar() });
//   <EquipoAccionesModales :acciones="acciones" />
// El objeto devuelto es `reactive`: las plantillas leen `acciones.dialogo`,
// `acciones.form.empleadoId`… sin `.value`. No se desestructura (perdería la
// reactividad): se pasa entero.
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';

export const MOTIVOS_DEVOLUCION = [
  { valor: 'devolucion', label: 'Devolución normal' },
  { valor: 'cambio_equipo', label: 'Cambio de equipo' },
  { valor: 'baja_empleado', label: 'Baja del empleado' },
  { valor: 'perdida', label: 'Pérdida o robo' },
];

const textoDe = (e, porDefecto) => traducirErrorDb(e, { porDefecto }).mensaje;

// Equipo en almacén (libre o en una ubicación, sin portador): se puede
// entregar, mover o enviar a reparación.
export function enAlmacen(eq) {
  return eq.situacion === 'disponible' || eq.situacion === 'en_ubicacion';
}

/**
 * @param {object} [opciones]
 * @param {(equipoId: string) => any} [opciones.alCambiar] se llama tras cada
 *   cambio hecho (el listado recarga su página, la hoja recarga el equipo).
 * @param {import('vue').Ref<Array>} [opciones.ubicaciones] catálogo ya cargado
 *   por quien llama (el listado lo trae en la misma tanda que la página); si
 *   no se pasa, se pide la primera vez que hace falta.
 */
export function useEquiposAcciones({ alCambiar = () => {}, ubicaciones = ref([]) } = {}) {
  const router = useRouter();

  const dialogo = ref(null); // 'entregar' | 'devolver' | 'mover' | 'verificar' | null
  const equipo = ref(null);
  const procesando = ref(false);
  const error = ref('');
  // Tras entregar o devolver el diálogo no se cierra: ofrece "Ver acta".
  // { tipo: 'entrega' | 'devolucion', equipoId, asignacionId, mensaje }
  const resultado = ref(null);
  const confirmacion = ref(null); // cambio de estado pendiente de confirmar

  const empleados = ref([]);
  const cargandoEmpleados = ref(false);
  const form = reactive({
    empleadoId: '',
    condicion: '',
    motivo: 'devolucion',
    aReparacion: false,
    ubicacionId: '',
    ubicacionNueva: '',
    nota: '',
  });

  // El cambio ya está hecho en el servidor: si recargar falla, no se presenta
  // como un fallo de la acción (la vista que recarga ya muestra su propio error).
  async function refrescar(equipoId) {
    try {
      await alCambiar(equipoId);
    } catch {
      // sin acción: ver arriba
    }
  }

  function abrir(nombre, eq) {
    equipo.value = eq;
    error.value = '';
    resultado.value = null;
    Object.assign(form, {
      empleadoId: '', condicion: '', motivo: 'devolucion', aReparacion: false, ubicacionId: '', ubicacionNueva: '', nota: '',
    });
    dialogo.value = nombre;
  }

  function cerrar() {
    dialogo.value = null;
    equipo.value = null;
    resultado.value = null;
    error.value = '';
  }

  async function cargarUbicaciones() {
    if (ubicaciones.value.length) return;
    try {
      ubicaciones.value = await insforgeApi.listUbicaciones();
    } catch (e) {
      error.value = textoDe(e, 'No se pudo cargar la lista de ubicaciones');
    }
  }

  // ── Entregar ────────────────────────────────────────────────────────────
  async function abrirEntregar(eq) {
    abrir('entregar', eq);
    if (empleados.value.length) return;
    cargandoEmpleados.value = true;
    try {
      const todos = await insforgeApi.listEmpleados();
      empleados.value = todos.filter((e) => e.estado === 'Activo');
    } catch (e) {
      error.value = textoDe(e, 'No se pudo cargar la lista de empleados');
    } finally {
      cargandoEmpleados.value = false;
    }
  }

  async function confirmarEntregar() {
    if (!form.empleadoId || procesando.value) return;
    const eq = equipo.value;
    const empleado = empleados.value.find((e) => e.id === form.empleadoId);
    error.value = '';
    procesando.value = true;
    try {
      const asignacion = await insforgeApi.asignarEquipo(eq.id, form.empleadoId, form.condicion);
      resultado.value = {
        tipo: 'entrega',
        equipoId: eq.id,
        asignacionId: asignacion?.id ?? null,
        mensaje: `${eq.codigo} quedó a cargo de ${empleado ? `${empleado.nombres} ${empleado.apellidos}` : 'el empleado'}.`,
      };
      showToast(`${eq.codigo} entregado`);
      await refrescar(eq.id);
    } catch (e) {
      // El rechazo de negocio (portador activo, equipo no operativo) se muestra
      // dentro del diálogo, no solo en un toast.
      error.value = textoDe(e, 'No se pudo registrar la entrega');
    } finally {
      procesando.value = false;
    }
  }

  // ── Devolver ────────────────────────────────────────────────────────────
  function abrirDevolver(eq) {
    abrir('devolver', eq);
    form.motivo = eq.portador_inactivo ? 'baja_empleado' : 'devolucion';
  }

  // Pérdida o robo y "volvió dañado" se contradicen (el servidor le da
  // prioridad a la pérdida): al elegir ese motivo la casilla se apaga sola.
  function cambiarMotivo(motivo) {
    form.motivo = motivo;
    if (motivo === 'perdida') form.aReparacion = false;
  }

  async function confirmarDevolver() {
    const eq = equipo.value;
    if (!eq?.asignacion_id || !form.condicion.trim() || procesando.value) return;
    error.value = '';
    procesando.value = true;
    try {
      await insforgeApi.devolverEquipo(eq.asignacion_id, eq.id, {
        condicion: form.condicion,
        motivo: form.motivo,
        aReparacion: form.aReparacion,
      });
      resultado.value = {
        tipo: 'devolucion',
        equipoId: eq.id,
        asignacionId: eq.asignacion_id,
        mensaje: `${eq.codigo} devuelto${form.aReparacion ? ' y enviado a reparación' : ''}.`,
      };
      showToast(`${eq.codigo} devuelto${form.aReparacion ? ': enviado a reparación' : ''}`);
      await refrescar(eq.id);
    } catch (e) {
      error.value = textoDe(e, 'No se pudo registrar la devolución');
    } finally {
      procesando.value = false;
    }
  }

  // ── Mover de ubicación ──────────────────────────────────────────────────
  async function abrirMover(eq) {
    abrir('mover', eq);
    form.ubicacionId = eq.ubicacion_id || '';
    await cargarUbicaciones();
  }

  async function moverA(eq, ubicacionId) {
    await insforgeApi.moverEquipo(eq.id, ubicacionId);
    await refrescar(eq.id);
  }

  async function crearUbicacionYMover(eq, nombre) {
    const limpio = String(nombre || '').trim();
    if (!limpio) return null;
    const ubicacion = await insforgeApi.createUbicacion(limpio);
    ubicaciones.value = [...ubicaciones.value, ubicacion].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    await moverA(eq, ubicacion.id);
    return ubicacion;
  }

  async function confirmarMover() {
    const eq = equipo.value;
    if (procesando.value || (!form.ubicacionId && !form.ubicacionNueva.trim())) return;
    error.value = '';
    procesando.value = true;
    try {
      if (form.ubicacionNueva.trim()) {
        const ubicacion = await crearUbicacionYMover(eq, form.ubicacionNueva);
        showToast(`${eq.codigo} movido a ${ubicacion.nombre}`);
      } else {
        await moverA(eq, form.ubicacionId);
        showToast(`${eq.codigo} movido`);
      }
      cerrar();
    } catch (e) {
      error.value = textoDe(e, 'No se pudo mover el equipo');
    } finally {
      procesando.value = false;
    }
  }

  // ── Verificar (conciliación física) ─────────────────────────────────────
  async function abrirVerificar(eq) {
    abrir('verificar', eq);
    form.ubicacionId = eq.ubicacion_id || '';
    await cargarUbicaciones();
  }

  async function confirmarVerificar() {
    const eq = equipo.value;
    if (procesando.value) return;
    error.value = '';
    procesando.value = true;
    try {
      await insforgeApi.verificarEquipo(eq.id, { ubicacionId: form.ubicacionId, nota: form.nota });
      showToast(`${eq.codigo} verificado`);
      cerrar();
      await refrescar(eq.id);
    } catch (e) {
      error.value = textoDe(e, 'No se pudo registrar la verificación');
    } finally {
      procesando.value = false;
    }
  }

  // ── Estado físico (una sola confirmación para las cinco transiciones) ───
  // Solo "de baja" es destructiva; reactivar y recuperar devuelven el equipo a
  // servicio y usan el botón primario. Un equipo que conserva una asignación a
  // una UBICACIÓN vuelve a ella al quedar operativo (no a "libre").
  function pedirEstado(eq, estado, label) {
    if (eq.situacion === 'asignado' && (estado === 'de_baja' || estado === 'perdido')) {
      showToast('Registre primero la devolución (o ciérrela con motivo pérdida)', 'error');
      return;
    }
    confirmacion.value = {
      equipo: eq,
      estado,
      etiqueta: label,
      titulo: `Marcar como “${label}”`,
      mensaje: `¿Marcar ${eq.codigo} como “${label}”?`,
      confirmarLabel: label,
      destructivo: estado === 'de_baja',
    };
  }

  function pedirReactivar(eq) {
    confirmacion.value = {
      equipo: eq, estado: 'operativo', etiqueta: 'Operativo', titulo: 'Reactivar equipo',
      mensaje: '¿Reactivar este equipo? Volverá a estar disponible.', confirmarLabel: 'Reactivar', destructivo: false,
    };
  }

  function pedirRecuperar(eq) {
    confirmacion.value = {
      equipo: eq, estado: 'operativo', etiqueta: 'Operativo', titulo: 'Marcar como recuperado',
      mensaje: '¿Marcar este equipo como recuperado? Volverá a estar disponible.', confirmarLabel: 'Marcar recuperado', destructivo: false,
    };
  }

  async function confirmarEstado(dialogoConfirmacion) {
    const c = confirmacion.value;
    if (!c) return;
    procesando.value = true;
    try {
      await insforgeApi.cambiarEstadoEquipo(c.equipo.id, c.estado);
      showToast(`${c.equipo.codigo} → ${c.etiqueta}`);
      dialogoConfirmacion?.cerrar();
      await refrescar(c.equipo.id);
    } catch (e) {
      showToast(textoDe(e, 'No se pudo cambiar el estado'), 'error');
    } finally {
      procesando.value = false;
    }
  }

  // ── Acciones por equipo (menú ⋮ y botón contextual) ─────────────────────
  // Fuente única: la tabla las pinta como botón o menú, la tarjeta móvil las
  // cuelga del ⋮ y la hoja de vida las reparte entre el botón sólido y "Más".
  // `hoja: true` omite "Hoja de vida" (ya se está en ella).
  function accionesDe(eq, { hoja = false } = {}) {
    return [
      { id: 'entregar', icono: 'ti-user-plus', label: 'Entregar a un empleado', visible: enAlmacen(eq), onClick: () => abrirEntregar(eq) },
      { id: 'devolver', icono: 'ti-arrow-back-up', label: 'Registrar devolución', visible: eq.situacion === 'asignado', onClick: () => abrirDevolver(eq) },
      { id: 'mover', icono: 'ti-map-pin', label: 'Mover de ubicación', visible: enAlmacen(eq), overflow: true, onClick: () => abrirMover(eq) },
      { id: 'reparacion', icono: 'ti-tool', label: 'Enviar a reparación', visible: enAlmacen(eq), overflow: true, onClick: () => pedirEstado(eq, 'en_reparacion', 'En reparación') },
      { id: 'reparado', icono: 'ti-circle-check', label: 'Marcar reparado (operativo)', visible: eq.situacion === 'en_reparacion', onClick: () => pedirEstado(eq, 'operativo', 'Operativo') },
      { id: 'reactivar', icono: 'ti-refresh', label: 'Reactivar equipo', visible: eq.situacion === 'de_baja', onClick: () => pedirReactivar(eq) },
      { id: 'recuperar', icono: 'ti-circle-check', label: 'Marcar como recuperado', visible: eq.situacion === 'perdido', onClick: () => pedirRecuperar(eq) },
      { id: 'verificar', icono: 'ti-checklist', label: 'Verificar', visible: eq.estado !== 'de_baja', overflow: true, onClick: () => abrirVerificar(eq) },
      ...(hoja
        ? []
        : [{ id: 'hoja', icono: 'ti-history', label: 'Hoja de vida', overflow: true, onClick: () => router.push(`/equipos/${eq.id}`) }]),
      { id: 'etiqueta', icono: 'ti-qrcode', label: 'Imprimir etiqueta', overflow: true, onClick: () => router.push({ path: '/equipos/etiquetas', query: { ids: eq.id } }) },
      { id: 'editar', icono: 'ti-pencil', label: 'Editar', overflow: true, onClick: () => accionesExternas.editar?.(eq) },
      {
        id: 'baja',
        icono: 'ti-circle-off',
        label: 'Dar de baja el equipo',
        danger: true,
        overflow: true,
        visible: eq.situacion !== 'asignado' && eq.estado !== 'de_baja',
        onClick: () => pedirEstado(eq, 'de_baja', 'De baja'),
      },
    ];
  }

  // "Editar" abre un formulario que vive en la vista, no acá.
  const accionesExternas = {};
  function alEditar(fn) {
    accionesExternas.editar = fn;
  }

  function accionesVisibles(eq, opciones) {
    return accionesDe(eq, opciones).filter((a) => a.visible !== false);
  }

  // La acción contextual de la fila (Entregar, Devolver, Marcar reparado,
  // Reactivar, Recuperar: mutuamente excluyentes por situación) queda visible
  // con su etiqueta; el ⋮ trae todas.
  function accionPrincipalDe(eq) {
    return accionesVisibles(eq).find((a) => !a.overflow) || null;
  }

  // Ruta imprimible del acta, para "Ver acta" tras entregar o devolver. La
  // pestaña nueva la abre un enlace real (un gesto del usuario, sin `await`
  // antes: el navegador no la bloquea).
  const hrefActa = computed(() => {
    const r = resultado.value;
    if (!r?.asignacionId) return '';
    return router.resolve({
      path: `/equipos/${r.equipoId}/acta/${r.asignacionId}`,
      query: { tipo: r.tipo },
    }).href;
  });

  return reactive({
    dialogo,
    equipo,
    procesando,
    error,
    resultado,
    confirmacion,
    empleados,
    cargandoEmpleados,
    ubicaciones,
    form,
    hrefActa,
    cerrar,
    alEditar,
    abrirEntregar,
    confirmarEntregar,
    abrirDevolver,
    cambiarMotivo,
    confirmarDevolver,
    abrirMover,
    moverA,
    crearUbicacionYMover,
    confirmarMover,
    abrirVerificar,
    confirmarVerificar,
    pedirEstado,
    confirmarEstado,
    accionesDe,
    accionesVisibles,
    accionPrincipalDe,
  });
}
