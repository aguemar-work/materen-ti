<script setup>
// Confirmación de las 3 acciones sobre una licencia del listado —eliminar,
// liberar un asiento y renovar— con un único ConfirmDialog, diferenciadas por
// `accion.tipo`. Renovar no es destructiva (botón primario). Extraído de
// LicenciasView.vue al partirla. El padre lo monta con v-if y lo desmonta con
// @cerrado (se emite en todo cierre, regla de ConfirmDialog).
import { computed, ref } from 'vue';
import { useLicenciasStore } from '../../stores/licencias.js';
import { showToast } from '../../core/toast.js';
import { formatFecha } from '../../core/formatters.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import { periodoLabel } from './licenciaPresentacion.js';

const props = defineProps({
  // { tipo: 'eliminar'|'liberar'|'renovar', licencia, usuario?, nuevaFecha? }
  accion: { type: Object, required: true },
});
const emit = defineEmits(['cerrado']);

const store = useLicenciasStore();
const procesando = ref(false);
const dialogo = ref(null);

const titulo = computed(() => {
  if (props.accion.tipo === 'liberar') return 'Liberar asiento';
  if (props.accion.tipo === 'renovar') return 'Renovar licencia';
  return 'Eliminar licencia';
});

const mensaje = computed(() => {
  const a = props.accion;
  if (a.tipo === 'liberar') return `¿Liberar el asiento de ${a.usuario.nombre} en “${a.licencia.software}”?`;
  if (a.tipo === 'renovar') {
    return `¿Renovar “${a.licencia.software}”? Nuevo vencimiento: ${formatFecha(a.nuevaFecha)} (${periodoLabel(a.licencia.renovacion_meses).toLowerCase()}).`;
  }
  return `¿Eliminar la licencia “${a.licencia.software}”? El historial de asignaciones se conserva.`;
});

const confirmarLabel = computed(() => {
  if (props.accion.tipo === 'liberar') return 'Liberar';
  if (props.accion.tipo === 'renovar') return 'Renovar';
  return 'Eliminar';
});

const icono = computed(() => (props.accion.tipo === 'liberar' ? 'ti-user-minus' : 'ti-trash'));

const VERBOS = { liberar: 'liberar', renovar: 'renovar', eliminar: 'eliminar' };

async function confirmar() {
  const a = props.accion;
  procesando.value = true;
  try {
    if (a.tipo === 'liberar') {
      await store.liberar(a.usuario);
      showToast('Asiento liberado');
    } else if (a.tipo === 'renovar') {
      await store.renovar(a.licencia.id, a.nuevaFecha);
      showToast(`${a.licencia.software} renovada hasta ${formatFecha(a.nuevaFecha)}`);
    } else {
      await store.softDelete(a.licencia.id);
      showToast('Licencia eliminada');
    }
    dialogo.value?.cerrar();
  } catch (e) {
    showToast(traducirErrorDb(e, { porDefecto: `Error al ${VERBOS[a.tipo]}` }).mensaje, 'error');
  } finally {
    procesando.value = false;
  }
}
</script>

<template>
  <ConfirmDialog
    ref="dialogo"
    :destructivo="accion.tipo !== 'renovar'"
    :icono="icono"
    :titulo="titulo"
    :mensaje="mensaje"
    :confirmar-label="confirmarLabel"
    :cargando="procesando"
    @cerrado="emit('cerrado')"
    @confirm="confirmar"
  />
</template>
