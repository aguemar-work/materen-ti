// Plomería de una pantalla de catálogo simple: cargar al montar, abrir el
// formulario para alta o edición, guardar, eliminar con confirmación, y el
// orden + paginación de la tabla.
//
// Las 5 pantallas de catálogo (Áreas/Obras, Ubicaciones, Tipos de equipo,
// Empresas, Plataformas) repetían este bloque casi byte a byte: ~55 líneas
// de refs y handlers idénticos salvo los textos de los toasts y la firma de
// `crear` (ARQ-05, ver docs/HISTORIAL-AUDITORIAS.md).
//
// Lo que NO absorbe, a propósito: el template. Las columnas de cada tabla y
// los campos de cada formulario no son duplicación — son lo que distingue a
// un catálogo del otro. El composable devuelve exactamente los nombres que
// esos templates ya usaban, así que migrar no los tocó.
//
// `CategoriasTicketPanel.vue` queda fuera: tiene dos niveles (categorías y
// subcategorías) y su propio flujo, no es el mismo patrón.
import { computed, ref, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { showToast } from '../core/toast.js';
import { usePaginacion } from './usePaginacion.js';
import { useOrdenTabla } from './useOrdenTabla.js';

export function useCrudCatalogo(store, {
  // () => ({...}) — el form en blanco para un alta.
  formVacio,
  // (item) => ({...}) — cómo se llena el form al editar.
  aForm,
  // (form) => Promise — las firmas de `crear` difieren por catálogo
  // (createUbicacion(nombre, desc, tipo) vs createTipoEquipo(datos)), mismo
  // motivo por el que `crearCatalogoStore` pasa `...args` tal cual.
  crear,
  // (id, form) => Promise — por defecto, el `actualizar` del store.
  actualizar = null,
  // Efectos posteriores a una mutación exitosa (ej. refrescar la copia del
  // catálogo que cachea otro store).
  despuesDeGuardar = null,
  despuesDeEliminar = null,
  // (error) => string | undefined — traducir un error conocido del backend
  // a un mensaje de negocio; devolver `undefined` deja el mensaje genérico.
  mensajeErrorGuardar = null,
  // { creado, actualizado, eliminado, errorCargar }
  textos,
  // Ref/computed a ordenar; por defecto `store.lista`. Las pantallas con
  // buscador propio pasan su lista ya filtrada.
  fuenteLista = null,
} = {}) {
  const { lista, cargando } = storeToRefs(store);

  const guardando = ref(false);
  const mostrarForm = ref(false);
  const editar = ref(null);
  const form = ref(formVacio());
  const errorForm = ref('');
  // Cerrar vía Modal.cerrar() reproduce la animación de salida;
  // el @close del Modal es quien baja mostrarForm.
  const modalForm = ref(null);

  const porEliminar = ref(null);
  const eliminando = ref(false);
  // Al terminar la eliminación se cierra el diálogo con su animación de
  // salida (cerrar()); el @cancel que emite al final baja porEliminar.
  const dialogoEliminar = ref(null);

  function abrirNueva() {
    editar.value = null;
    form.value = formVacio();
    errorForm.value = '';
    mostrarForm.value = true;
  }

  function abrirEditar(item) {
    editar.value = item;
    form.value = aForm(item);
    errorForm.value = '';
    mostrarForm.value = true;
  }

  async function guardar() {
    errorForm.value = '';
    guardando.value = true;
    try {
      if (editar.value) {
        await (actualizar ? actualizar(editar.value.id, form.value) : store.actualizar(editar.value.id, form.value));
        showToast(textos.actualizado);
      } else {
        await crear(form.value);
        showToast(textos.creado);
      }
      await despuesDeGuardar?.();
      modalForm.value?.cerrar();
    } catch (e) {
      errorForm.value = mensajeErrorGuardar?.(e) || e?.message || 'Error al guardar';
    } finally {
      guardando.value = false;
    }
  }

  async function confirmarEliminar() {
    const item = porEliminar.value;
    if (!item) return;
    eliminando.value = true;
    try {
      await store.softDelete(item.id);
      await despuesDeEliminar?.(item);
      showToast(typeof textos.eliminado === 'function' ? textos.eliminado(item) : textos.eliminado);
      dialogoEliminar.value?.cerrar();
    } catch (e) {
      showToast(e?.message || 'Error al eliminar', 'error');
    } finally {
      eliminando.value = false;
    }
  }

  onMounted(async () => {
    try {
      await store.cargar();
    } catch (e) {
      showToast(e?.message || textos.errorCargar, 'error');
    }
  });

  const { columna, direccion, ordenarPor, listaOrdenada } = useOrdenTabla(fuenteLista || lista);
  const { paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina } = usePaginacion(listaOrdenada);

  return {
    lista, cargando,
    guardando, mostrarForm, editar, esEdicion: computed(() => !!editar.value), form, errorForm, modalForm,
    porEliminar, eliminando, dialogoEliminar,
    abrirNueva, abrirEditar, guardar, confirmarEliminar,
    columna, direccion, ordenarPor, listaOrdenada,
    paginaActual, listaPaginada, totalItems, tamPagina, cambiarTamPagina,
  };
}
