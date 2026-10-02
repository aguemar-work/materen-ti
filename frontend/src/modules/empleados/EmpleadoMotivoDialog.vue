<script setup>
// Diálogo mínimo con un solo campo de texto para tres acciones del ciclo de
// vida del empleado (migración 102):
//   · suspender     → motivo OBLIGATORIO (≤ 500). Solo desde Activo.
//   · reactivar     → motivo opcional (≤ 500). Desde Suspendido o Inactivo.
//   · revisar       → nota opcional (≤ 1000): registra el control periódico de
//                     accesos con el conteo de lo que había en ese momento.
// Todas quedan en la hoja de vida (empleado_eventos). El servidor repite cada
// regla (motivo vacío, estado de origen): acá solo se evita el viaje inútil.
import { ref, computed } from 'vue';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';

const props = defineProps({
  accion: { type: String, required: true, validator: (v) => ['suspender', 'reactivar', 'revisar'].includes(v) },
  empleado: { type: Object, required: true },
  // Solo `revisar`: { cuentas, equipos, licencias } vigentes al revisar.
  resumen: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['cerrar']);

const CONFIG = {
  suspender: {
    titulo: 'Suspender empleado',
    ayuda: 'Pasa a Suspendido sin cerrar cuentas ni equipos. Las cuentas compartidas y reutilizables que usa quedan marcadas “Rotar contraseña”.',
    etiqueta: 'Motivo de la suspensión',
    placeholder: 'Qué motivó la suspensión',
    obligatorio: true,
    max: 500,
    boton: 'Suspender',
    enCurso: 'Suspendiendo...',
    icono: 'ti ti-user-pause',
  },
  reactivar: {
    titulo: 'Reactivar empleado',
    ayuda: 'Vuelve al estado Activo. La fecha de alta no cambia: para empezar una etapa nueva use “Reingresar”.',
    etiqueta: 'Motivo de la reactivación',
    placeholder: 'Opcional',
    obligatorio: false,
    max: 500,
    boton: 'Reactivar',
    enCurso: 'Reactivando...',
    icono: 'ti ti-user-check',
  },
  revisar: {
    titulo: 'Revisar accesos',
    ayuda: 'Registra en la hoja de vida que los accesos del empleado fueron revisados.',
    etiqueta: 'Nota de la revisión',
    placeholder: 'Opcional: observaciones de la revisión',
    obligatorio: false,
    max: 1000,
    boton: 'Registrar revisión',
    enCurso: 'Registrando...',
    icono: 'ti ti-clipboard-check',
  },
};

const config = computed(() => CONFIG[props.accion]);
const store = useEmpleadosStore();
const dialogo = ref(null);
const texto = ref('');
const guardando = ref(false);
const error = ref('');
const infoError = infoNotificacion('error');
const campo = useCampoAccesible({ error: () => error.value });
let resultado = false;

const nombre = computed(() => nombreCompletoDe(props.empleado));
const faltaMotivo = computed(() => config.value.obligatorio && !texto.value.trim());

// "2 cuentas · 1 equipo · 1 licencia" de lo que se está revisando.
const resumenTexto = computed(() => {
  const { cuentas = 0, equipos = 0, licencias = 0 } = props.resumen || {};
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  return [plural(cuentas, 'cuenta', 'cuentas'), plural(equipos, 'equipo', 'equipos'), plural(licencias, 'licencia', 'licencias')].join(' · ');
});

async function confirmar() {
  if (faltaMotivo.value) {
    error.value = 'Indique el motivo.';
    return;
  }
  error.value = '';
  guardando.value = true;
  const valor = texto.value.trim() || null;
  try {
    if (props.accion === 'suspender') {
      await store.suspender(props.empleado.id, valor);
      showToast(`${nombre.value} suspendido`);
    } else if (props.accion === 'reactivar') {
      await store.reactivar(props.empleado.id, valor);
      showToast(`${nombre.value} reactivado`);
    } else {
      await store.registrarRevisionAccesos(props.empleado.id, { ...props.resumen }, valor);
      showToast('Revisión de accesos registrada');
    }
    resultado = true;
    dialogo.value?.cerrar();
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo completar la operación.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="sm"
    :titulo="config.titulo"
    :confirmar-cierre="() => !guardando"
    @cerrado="emit('cerrar', resultado)"
  >
    <form id="empleado-motivo-form" class="space-y-4" @submit.prevent="confirmar">
      <p class="text-sm text-gray-600">
        <span class="font-medium text-gray-900">{{ nombre }}</span>
        <template v-if="accion === 'revisar'"> · {{ resumenTexto }}</template>
      </p>
      <p class="text-sm text-gray-600">{{ config.ayuda }}</p>

      <div class="campo" :class="{ 'campo--invalido': campo.invalido.value }">
        <label class="campo__etiqueta" :for="campo.id">
          {{ config.etiqueta }}<span v-if="config.obligatorio" aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="campo.id"
            v-model="texto"
            class="campo__control campo__control--area"
            rows="3"
            :maxlength="config.max"
            :placeholder="config.placeholder"
            :required="config.obligatorio"
            :disabled="guardando"
            :aria-invalid="campo.invalido.value"
            :aria-describedby="campo.describedBy.value"
          ></textarea>
        </div>
        <p class="campo__pie tabular-nums">{{ texto.length }}/{{ config.max }}</p>
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
        form="empleado-motivo-form"
        :icon="config.icono"
        :label="guardando ? config.enCurso : config.boton"
        :loading="guardando"
        :disabled="faltaMotivo"
      />
    </template>
  </AppDialog>
</template>
