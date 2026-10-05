<script setup>
// Reingresar a un empleado dado de baja (RPC reingresar_empleado, migración
// 102): vuelve a Activo con fecha de alta = hoy y, opcionalmente, con otra
// empresa, área/obra, ubicación o cargo. Es una etapa nueva; para recuperar la
// misma etapa (sin tocar la fecha de alta) está "Reactivar".
//
// Solo viajan las claves que CAMBIARON respecto de la ficha: una clave ausente
// conserva el valor y una presente con '' lo limpia (salvo la empresa, que es
// obligatoria).
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
});
const emit = defineEmits(['cerrar']);

const store = useEmpleadosStore();
const dialogo = ref(null);
const empresas = ref([]);
const areas = ref([]);
const ubicaciones = ref([]);
const cargando = ref(true);
const guardando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');
let resultado = false;

const form = ref({
  empresa_id: props.empleado.empresa_id || '',
  area_obra_id: props.empleado.area_obra_id || '',
  ubicacion_id: props.empleado.ubicacion_id || '',
  cargo: props.empleado.cargo || '',
});

const campoEmpresa = useCampoAccesible();
const campoArea = useCampoAccesible();
const campoUbicacion = useCampoAccesible();
const campoCargo = useCampoAccesible();

const nombre = computed(() => nombreCompletoDe(props.empleado));

// Solo lo que cambió: es lo que viaja en `p_datos`.
const cambios = computed(() => {
  const e = props.empleado;
  const f = form.value;
  const datos = {};
  if (f.empresa_id !== (e.empresa_id || '')) datos.empresa_id = f.empresa_id;
  if (f.area_obra_id !== (e.area_obra_id || '')) datos.area_obra_id = f.area_obra_id;
  if (f.ubicacion_id !== (e.ubicacion_id || '')) datos.ubicacion_id = f.ubicacion_id;
  if (f.cargo.trim() !== (e.cargo || '')) datos.cargo = f.cargo.trim();
  return datos;
});

onMounted(async () => {
  try {
    [empresas.value, areas.value, ubicaciones.value] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listAreasObras(),
      insforgeApi.listUbicaciones(),
    ]);
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los catálogos.' }).mensaje;
  } finally {
    cargando.value = false;
  }
});

async function confirmar() {
  error.value = '';
  guardando.value = true;
  try {
    await store.reingresar(props.empleado.id, cambios.value);
    showToast(`${nombre.value} reingresado`);
    resultado = true;
    dialogo.value?.cerrar();
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo reingresar al empleado.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="md"
    titulo="Reingresar empleado"
    :confirmar-cierre="() => !guardando"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="empleado-reingreso-form" class="space-y-4" @submit.prevent="confirmar">
      <p class="text-sm text-gray-600">
        <span class="font-medium text-gray-900">{{ nombre }}</span> vuelve a Activo con la fecha de alta de hoy.
        Cambie solo lo que corresponda a esta etapa; lo demás se conserva.
      </p>

      <div class="form-grid">
        <div class="campo" :class="{ 'campo--inerte': guardando || cargando }">
          <label class="campo__etiqueta" :for="campoEmpresa.id">Empresa<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select
              :id="campoEmpresa.id"
              v-model="form.empresa_id"
              class="campo__control campo__control--select"
              required
              :disabled="guardando || cargando"
            >
              <option value="" disabled>Seleccionar empresa</option>
              <option v-for="emp in empresas" :key="emp.id" :value="emp.id">{{ emp.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="campoCargo.id">Cargo</label>
          <div class="campo__caja">
            <input
              :id="campoCargo.id"
              v-model="form.cargo"
              class="campo__control"
              type="text"
              placeholder="Sin cambios"
              :disabled="guardando"
            >
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando || cargando }">
          <label class="campo__etiqueta" :for="campoArea.id">Área/Obra</label>
          <div class="campo__caja">
            <select
              :id="campoArea.id"
              v-model="form.area_obra_id"
              class="campo__control campo__control--select"
              :disabled="guardando || cargando"
            >
              <option value="">Sin asignar</option>
              <option v-for="ao in areas" :key="ao.id" :value="ao.id">{{ ao.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>

        <div class="campo" :class="{ 'campo--inerte': guardando || cargando }">
          <label class="campo__etiqueta" :for="campoUbicacion.id">Ubicación</label>
          <div class="campo__caja">
            <select
              :id="campoUbicacion.id"
              v-model="form.ubicacion_id"
              class="campo__control campo__control--select"
              :disabled="guardando || cargando"
            >
              <option value="">Sin asignar</option>
              <option v-for="ub in ubicaciones" :key="ub.id" :value="ub.id">{{ ub.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </form>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="dialogo?.cerrar()" />
      <AppButton
        type="submit"
        form="empleado-reingreso-form"
        icon="ti ti-user-check"
        :label="guardando ? 'Reingresando...' : 'Reingresar'"
        :loading="guardando"
        :disabled="cargando || !form.empresa_id"
      />
    </template>
  </AppDialog>
</template>
