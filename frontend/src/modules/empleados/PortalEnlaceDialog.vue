<script setup>
// Enlace del portal del empleado (migración 109), para el staff con el módulo
// `empleados`. Dos pasos en la misma ventana:
//   1. Elegir qué podrá ver o hacer quien abra el enlace y cuántos días vale, y
//      generarlo. Generar uno nuevo deja sin efecto el anterior.
//   2. El enlace aparece UNA sola vez (el servidor solo guarda su hash): copiarlo
//      y enviarlo al empleado por el canal de siempre. El sistema NO lo envía por
//      correo ni por WhatsApp.
// Desde el paso 1 también se puede «Revocar enlace» si hay uno sin revocar. El
// alcance nunca incluye contraseñas.
import { ref, computed } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import {
  ALCANCES_PORTAL, ALCANCE_COMPLETO, VIGENCIAS_PORTAL, VIGENCIA_PORTAL_DEFECTO, textoVigencia,
  normalizarAlcance, urlPortal, estadoEnlacePortal, fechaLocal,
} from '../../core/dominio-portal.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
  // Enlace sin revocar del empleado (columnas no secretas) o null.
  enlace: { type: Object, default: null },
});
const emit = defineEmits(['cerrar']);

const dialogo = ref(null);
const alcance = ref([...ALCANCE_COMPLETO]);
const dias = ref(VIGENCIA_PORTAL_DEFECTO);
const emitido = ref(null); // { url, expiraEn, dias } — el token solo vive aquí
const copiado = ref(false);
const guardando = ref(false);
const error = ref('');
const pendienteRevocar = ref(false);
const revocando = ref(false);
let huboCambio = false;

const infoError = infoNotificacion('error');
const campoVigencia = useCampoAccesible({ error: () => error.value });
const nombre = computed(() => nombreCompletoDe(props.empleado));
const estado = computed(() => estadoEnlacePortal(props.enlace));
const sinAlcance = computed(() => alcance.value.length === 0);

// Confirmar la recepción implica ver los equipos; quitar los equipos quita la confirmación.
function alternar(id) {
  const activo = alcance.value.includes(id);
  let ids = activo ? alcance.value.filter((a) => a !== id) : [...alcance.value, id];
  if (activo && id === 'ver_equipos') ids = ids.filter((a) => a !== 'confirmar_equipo');
  alcance.value = normalizarAlcance(ids);
}

async function generar() {
  if (sinAlcance.value || guardando.value) return;
  error.value = '';
  guardando.value = true;
  try {
    const r = await insforgeApi.emitirEnlacePortal(props.empleado.id, { alcance: alcance.value, dias: Number(dias.value) });
    emitido.value = { url: urlPortal(r.token), expiraEn: r.expiraEn, dias: r.dias };
    huboCambio = true;
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo generar el enlace.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}

async function copiar() {
  try {
    await navigator.clipboard.writeText(emitido.value.url);
    copiado.value = true;
    setTimeout(() => { copiado.value = false; }, 2000);
  } catch {
    error.value = 'No se pudo copiar. Seleccione el enlace y cópielo a mano.';
  }
}

async function revocar() {
  revocando.value = true;
  try {
    await insforgeApi.revocarEnlacePortal(props.empleado.id);
    huboCambio = true;
    showToast('Enlace del portal revocado');
    pendienteRevocar.value = false;
    dialogo.value?.cerrar();
  } catch (e) {
    pendienteRevocar.value = false;
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo revocar el enlace.' }).mensaje;
  } finally {
    revocando.value = false;
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="sm"
    titulo="Enlace del portal del empleado"
    :confirmar-cierre="() => !guardando && !revocando"
    @cerrado="emit('cerrar', huboCambio)"
  >
    <div v-if="emitido" class="space-y-4">
      <p class="notif notif--success notif--inline">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        <span class="notif__texto">Enlace generado para {{ nombre }}. Se muestra una sola vez: cópielo ahora.</span>
      </p>
      <div class="campo">
        <label class="campo__etiqueta" for="portal-enlace-url">Enlace del portal</label>
        <div class="campo__caja">
          <input
            id="portal-enlace-url"
            class="campo__control select-all"
            type="text"
            readonly
            :value="emitido.url"
            @focus="$event.target.select()"
          >
        </div>
      </div>
      <AppButton
        block
        :icon="copiado ? 'ti ti-check' : 'ti ti-copy'"
        :label="copiado ? 'Enlace copiado' : 'Copiar enlace'"
        @click="copiar"
      />
      <p class="sr-only" role="status" aria-live="polite">{{ copiado ? 'Enlace copiado' : '' }}</p>
      <p class="text-sm text-gray-600">
        Vence el {{ fechaLocal(emitido.expiraEn) }} ({{ textoVigencia(emitido.dias) }}). Envíelo al empleado por
        el canal que ya usa (WhatsApp o mensaje): el sistema no lo envía solo. Quien tenga el enlace verá lo
        marcado, nunca una contraseña.
      </p>
      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </div>

    <form v-else id="portal-enlace-form" class="space-y-4" @submit.prevent="generar">
      <p class="text-sm text-gray-600">
        <span class="font-medium text-gray-900">{{ nombre }}</span> abrirá su portal con un enlace personal, sin
        crear una cuenta. Quien tenga el enlace verá lo que marque abajo; nunca la contraseña.
      </p>

      <fieldset class="space-y-2">
        <legend class="campo__etiqueta">Qué podrá ver o hacer</legend>
        <label v-for="a in ALCANCES_PORTAL" :key="a.id" class="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
            :checked="alcance.includes(a.id)"
            :disabled="guardando"
            @change="alternar(a.id)"
          >
          <span class="min-w-0">
            <span class="block text-gray-900">{{ a.etiqueta }}</span>
            <span class="block text-xs text-gray-500">{{ a.ayuda }}</span>
          </span>
        </label>
      </fieldset>

      <div class="campo">
        <label class="campo__etiqueta" :for="campoVigencia.id">Vigencia</label>
        <div class="campo__caja">
          <select :id="campoVigencia.id" v-model="dias" class="campo__control" :disabled="guardando">
            <option v-for="d in VIGENCIAS_PORTAL" :key="d" :value="d">{{ textoVigencia(d) }}</option>
          </select>
        </div>
      </div>

      <p v-if="estado" class="notif notif--warning notif--inline">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        <span class="notif__texto">
          Ya hay un enlace {{ estado === 'vigente' ? `vigente hasta el ${fechaLocal(enlace.expires_at)}` : `vencido el ${fechaLocal(enlace.expires_at)}` }}.
          Al generar uno nuevo, el anterior deja de funcionar.
        </span>
      </p>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ error }}</p></div>
      </div>
    </form>

    <template #acciones>
      <template v-if="emitido">
        <AppButton label="Listo" @click="dialogo?.cerrar()" />
      </template>
      <template v-else>
        <AppButton
          v-if="estado"
          class="mr-auto"
          variant="outline"
          severity="danger"
          icon="ti ti-link-off"
          label="Revocar enlace"
          :disabled="guardando"
          @click="pendienteRevocar = true"
        />
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="dialogo?.cerrar()" />
        <AppButton
          type="submit"
          form="portal-enlace-form"
          icon="ti ti-link"
          :label="guardando ? 'Generando...' : 'Generar enlace'"
          :loading="guardando"
          :disabled="sinAlcance"
        />
      </template>
    </template>
  </AppDialog>

  <ConfirmDialog
    v-if="pendienteRevocar"
    titulo="Revocar enlace del portal"
    :mensaje="`El enlace de ${nombre} dejará de funcionar de inmediato. Podrá generar uno nuevo cuando lo necesite.`"
    confirmar-label="Revocar enlace"
    destructivo
    :cargando="revocando"
    @confirm="revocar"
    @cerrado="pendienteRevocar = false"
  />
</template>
