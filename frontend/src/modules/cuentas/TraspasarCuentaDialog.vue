<script setup>
// Traspasar una cuenta reutilizable a otro empleado (RPC traspasar_cuenta,
// migración 101). El servidor rechaza las cuentas personales (se revocan y se
// crea una nueva) y los destinos que no estén Activos: acá solo se ofrecen
// empleados Activos y la acción solo aparece en cuentas reutilizables.
//
// Contraseña nueva OPCIONAL: sin ella la cuenta queda marcada "Rotar
// contraseña" (el empleado anterior conoce la clave). Con ella viaja cifrada
// por la edge function `credenciales` y la marca se limpia.
import { ref, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { generarPassword } from '../../core/generarPassword.js';
import { showToast } from '../../core/toast.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';

const props = defineProps({
  cuenta: { type: Object, required: true },
  empleadoId: { type: String, required: true },
});
const emit = defineEmits(['cerrado']);

const store = useCuentasStore();
const dialogo = ref(null);
const destinos = ref([]);
const nuevoEmpleadoId = ref('');
const notas = ref('');
const password = ref('');
const cargando = ref(true);
const guardando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');
const campoNotas = useCampoAccesible();
const campoPassword = useCampoAccesible();
let traspasada = false;

onMounted(async () => {
  try {
    const todos = await insforgeApi.listEmpleados();
    destinos.value = todos.filter((e) => e.id !== props.empleadoId && e.estado === 'Activo');
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudo cargar la lista de empleados.' }).mensaje;
  } finally {
    cargando.value = false;
  }
});

async function confirmar() {
  if (!nuevoEmpleadoId.value) return;
  error.value = '';
  guardando.value = true;
  try {
    // Sin notas, la RPC deja "Traspaso a otro empleado"; con notas se antepone
    // "Traspaso:" para que el libro y el historial sigan reconociéndolo.
    const nota = notas.value.trim() ? `Traspaso: ${notas.value.trim()}` : null;
    await store.traspasar(props.cuenta.asignacion_id, nuevoEmpleadoId.value, nota, password.value || null);
    traspasada = true;
    showToast(`Cuenta traspasada: ${props.cuenta.plataforma_nombre}`);
    dialogo.value?.cerrar();
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'cuenta', porDefecto: 'No se pudo traspasar la cuenta.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="sm"
    titulo="Traspasar cuenta"
    :confirmar-cierre="() => !guardando"
    @cerrado="emit('cerrado', traspasada)"
  >
    <div class="space-y-4">
      <p class="text-sm text-gray-600">
        <span class="font-medium text-gray-900">{{ cuenta.plataforma_nombre }}</span> · {{ cuenta.usuario }}
      </p>
      <p v-if="cargando" class="py-6 text-center text-sm text-gray-500" role="status">Cargando empleados...</p>
      <template v-else>
        <div class="campo">
          <label class="campo__etiqueta" for="tr-empleado">Asignar a<span aria-hidden="true"> *</span></label>
          <BuscadorCombo
            id="tr-empleado"
            v-model="nuevoEmpleadoId"
            :items="destinos"
            :campos-busqueda="['nombres', 'apellidos', 'dni']"
            :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
            placeholder="Buscar por nombre o DNI..."
            :disabled="guardando"
          >
            <template #resultado="{ item }">
              <span>{{ item.nombres }} {{ item.apellidos }}</span>
              <span class="combo-sec">{{ item.cargo || 'Sin cargo' }}</span>
            </template>
          </BuscadorCombo>
        </div>
        <div class="campo">
          <label class="campo__etiqueta" :for="campoPassword.id">Contraseña nueva</label>
          <div class="campo__caja pr-1">
            <input
              :id="campoPassword.id"
              v-model="password"
              type="text"
              class="campo__control"
              autocomplete="new-password"
              placeholder="Opcional"
              :disabled="guardando"
              :aria-describedby="campoPassword.describedBy.value"
            >
            <button
              class="icon-btn shrink-0"
              type="button"
              title="Generar contraseña"
              aria-label="Generar contraseña"
              :disabled="guardando"
              @click="password = generarPassword()"
            >
              <i class="ti ti-refresh" aria-hidden="true"></i>
            </button>
          </div>
          <p class="campo__pie">Sin contraseña nueva, la cuenta queda marcada “Rotar contraseña”.</p>
        </div>
        <div class="campo">
          <label class="campo__etiqueta" :for="campoNotas.id">Notas</label>
          <div class="campo__caja">
            <input
              :id="campoNotas.id"
              v-model="notas"
              class="campo__control"
              type="text"
              placeholder="Motivo del traspaso"
              :disabled="guardando"
            >
          </div>
        </div>
      </template>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </div>

    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="dialogo?.cerrar()" />
      <AppButton
        :label="guardando ? 'Traspasando...' : 'Traspasar'"
        :loading="guardando"
        :disabled="!nuevoEmpleadoId || cargando"
        @click="confirmar"
      />
    </template>
  </AppDialog>
</template>
