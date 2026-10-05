<script setup>
// Dar de baja a un empleado en dos tiempos:
//   1. Resumen de consecuencias + motivo opcional.
//   2. El RESULTADO real: la baja es una sola transacción de servidor
//      (`dar_baja_empleado`, migración 102) y, desde la 108, deja una solicitud
//      de baja con lo que de verdad quedó pendiente —rotar la contraseña de cada
//      cuenta compartida, recuperar cada equipo, cerrar las cuentas personales en
//      su plataforma—. Antes un checklist animado fingía progreso por paso; ahora
//      se muestra lo que la RPC devolvió, con el enlace a cada pendiente.
//
// Los equipos NO forman parte de la baja (nunca se cierran sus asignaciones,
// docs/PANORAMA-SISTEMA.md §2): son pasos PENDIENTES de TI, cada uno con el
// enlace a su hoja de vida donde se registra la devolución.
// Sobre AppDialog (diálogo único del sistema).
import { ref, computed, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { destinoPaso, avanceSolicitud } from '../../core/dominio-solicitudes.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
});
const emit = defineEmits(['cerrar']);

const MOTIVO_MAX = 500;

const dialogo = ref(null);
let resultado = false;

const store = useEmpleadosStore();

const cuentas = ref([]);
const licencias = ref([]);
const equipos = ref([]);
const cargando = ref(true);
const error = ref('');
const motivo = ref('');
const infoError = infoNotificacion('error');
const campoMotivo = useCampoAccesible();

// 'resumen' | 'procesando' | 'hecha'
const fase = ref('resumen');
// La solicitud de baja que devolvió la RPC (null si el backend aún no tiene la 108).
const solicitud = ref(null);

const nombreCompleto = computed(() => nombreCompletoDe(props.empleado));
const descripcionEquipo = (eq) => [eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(' ');

const personales = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'personal'));
const reutilizables = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'reutilizable'));
const compartidas = computed(() => cuentas.value.filter((c) => c.tipo_cuenta === 'compartida'));
const sinAccesos = computed(
  () => cuentas.value.length === 0 && licencias.value.length === 0 && equipos.value.length === 0,
);

onMounted(async () => {
  try {
    const resumen = await insforgeApi.resumenBaja(props.empleado.id);
    cuentas.value = resumen.cuentas;
    licencias.value = resumen.licencias;
    equipos.value = resumen.equipos;
  } catch (e) {
    error.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los accesos del empleado.' }).mensaje;
  } finally {
    cargando.value = false;
  }
});

// Sobre qué actúa cada paso con `objetivo_id`, con lo que el resumen ya trajo:
// la cuenta (por su id) y el equipo (por el id de su asignación).
const objetivos = computed(() => ({
  ...Object.fromEntries(cuentas.value.map((c) => [c.cuenta_id, { usuario: c.usuario }])),
  ...Object.fromEntries(equipos.value.map((eq) => [eq.asignacion_id, { equipo_id: eq.equipo_id, codigo: eq.codigo }])),
}));

// Los pasos de la solicitud de baja, ya con su enlace.
const pasosResultado = computed(() => (solicitud.value?.pasos || []).map((p) => ({
  ...p,
  hecho: p.estado !== 'pendiente',
  destino: p.estado === 'pendiente' ? destinoPaso(p, { empleadoId: props.empleado.id, objetivo: objetivos.value[p.objetivo_id] }) : null,
})));
const avance = computed(() => avanceSolicitud(solicitud.value?.pasos));

async function confirmarBaja() {
  error.value = '';
  fase.value = 'procesando';
  try {
    const r = await store.darDeBaja(props.empleado.id, motivo.value.trim() || null);
    solicitud.value = r?.solicitud || null;
    resultado = true;
    showToast(`${nombreCompleto.value} dado de baja`);
    fase.value = 'hecha';
  } catch (e) {
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo dar de baja al empleado.' }).mensaje;
    fase.value = 'resumen';
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="md"
    :mostrar-cerrar="fase !== 'procesando'"
    :cerrar-en-backdrop="fase === 'resumen'"
    :confirmar-cierre="() => fase !== 'procesando'"
    @cerrado="emit('cerrar', resultado)"
  >
    <template #titulo>
      <span class="block truncate">{{ fase === 'hecha' ? `Baja registrada · ${nombreCompleto}` : `Dar de baja a ${nombreCompleto}` }}</span>
      <span class="block text-xs font-normal text-gray-500">{{ fase === 'hecha' ? 'Esto es lo que quedó pendiente' : 'Revise las consecuencias antes de confirmar' }}</span>
    </template>

    <p v-if="cargando" class="py-8 text-center text-sm text-gray-500" role="status">Cargando resumen de accesos...</p>

    <p v-else-if="fase === 'procesando'" class="py-8 text-center text-sm text-gray-600" role="status" aria-live="polite">
      <i class="ti ti-loader-2 mr-1 animate-spin" aria-hidden="true"></i>
      Registrando la baja de {{ nombreCompleto }}...
    </p>

    <!-- ══ Resultado: lo que la RPC dejó hecho y pendiente ════════ -->
    <div v-else-if="fase === 'hecha'" class="space-y-4" aria-live="polite">
      <template v-if="solicitud">
        <p class="text-sm text-gray-700">
          Quedó la solicitud
          <RouterLink
            class="rounded-sm text-primary-600 hover:underline focus-visible:underline focus-visible:outline-none"
            :to="`/solicitudes/${solicitud.id}`"
          ><AppCodigo :valor="solicitud.codigo" titulo="Número de solicitud" /></RouterLink>
          con
          <span class="tabular-nums">{{ avance.resueltos }} de {{ avance.total }}</span>
          {{ avance.total === 1 ? 'paso hecho' : 'pasos hechos' }}.
          <template v-if="avance.pendientes === 0">No queda nada pendiente.</template>
        </p>
        <ol class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200" aria-label="Pasos de la baja">
          <li v-for="p in pasosResultado" :key="p.id" class="flex items-start gap-2.5 px-3 py-2.5 text-sm" :data-hecho="p.hecho">
            <i
              class="mt-0.5 text-lg"
              :class="p.hecho ? 'ti ti-circle-check text-green-700' : 'ti ti-clock text-amber-700'"
              aria-hidden="true"
            ></i>
            <span class="min-w-0 flex-1" :class="p.hecho ? 'text-gray-500' : 'text-gray-900'">
              <span class="sr-only">{{ p.hecho ? 'Hecho' : 'Pendiente' }}: </span>{{ p.label }}
              <span v-if="p.hecho && p.nota" class="block text-xs text-gray-500">{{ p.nota }}</span>
            </span>
            <RouterLink
              v-if="p.destino"
              class="shrink-0 rounded-sm text-xs text-primary-600 hover:underline focus-visible:underline focus-visible:outline-none"
              :to="p.destino.to"
              :aria-label="`${p.destino.texto}: ${p.label}`"
            >{{ p.destino.texto }}</RouterLink>
          </li>
        </ol>
      </template>
      <p v-else class="text-sm text-gray-700">
        La baja quedó registrada. Revise en el expediente las contraseñas por rotar y los equipos por recuperar.
      </p>
    </div>

    <!-- ══ Fase 1: resumen de consecuencias ═══════════════════════ -->
    <div v-else class="space-y-5">
      <section aria-labelledby="baja-automatico">
        <h3 id="baja-automatico" class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Al confirmar, el sistema</h3>
        <ul class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          <li v-if="personales.length" class="px-3 py-3">
            <p class="text-sm font-medium text-gray-900">
              Elimina {{ personales.length }} {{ personales.length === 1 ? 'cuenta personal' : 'cuentas personales' }}
            </p>
            <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
              <li v-for="c in personales" :key="c.asignacion_id" class="truncate">
                <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
              </li>
            </ul>
          </li>

          <li v-if="reutilizables.length" class="px-3 py-3">
            <p class="text-sm font-medium text-gray-900">
              Libera {{ reutilizables.length }} {{ reutilizables.length === 1 ? 'cuenta reutilizable' : 'cuentas reutilizables' }}
              <span class="font-normal text-gray-500">— quedan disponibles para otro empleado</span>
            </p>
            <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
              <li v-for="c in reutilizables" :key="c.asignacion_id" class="truncate">
                <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
              </li>
            </ul>
          </li>

          <li v-if="compartidas.length" class="px-3 py-3">
            <p class="text-sm font-medium text-gray-900">
              Le quita el acceso a {{ compartidas.length }} {{ compartidas.length === 1 ? 'cuenta compartida' : 'cuentas compartidas' }}
              <span class="font-normal text-gray-500">— los demás usuarios continúan</span>
            </p>
            <ul class="mt-1 space-y-0.5 text-xs text-gray-500">
              <li v-for="c in compartidas" :key="c.asignacion_id" class="truncate">
                <span class="text-gray-700">{{ c.usuario }}</span> · {{ c.plataforma }}
              </li>
            </ul>
          </li>

          <li v-if="licencias.length" class="px-3 py-3">
            <p class="text-sm font-medium text-gray-900">
              Libera {{ licencias.length }} {{ licencias.length === 1 ? 'asiento de licencia' : 'asientos de licencia' }}
            </p>
            <p class="mt-1 truncate text-xs text-gray-500">{{ licencias.map((l) => l.software).join(', ') }}</p>
          </li>

          <li class="px-3 py-3">
            <p class="text-sm font-medium text-gray-900">Marca al empleado como Inactivo y abre su solicitud de baja</p>
            <p v-if="sinAccesos" class="mt-1 text-xs text-gray-500">No tiene cuentas, licencias ni equipos asignados actualmente.</p>
          </li>
        </ul>
      </section>

      <!-- Lo que queda a cargo de TI -->
      <section v-if="reutilizables.length || compartidas.length || equipos.length" aria-labelledby="baja-pendiente">
        <h3 id="baja-pendiente" class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Queda pendiente para TI</h3>
        <ul class="space-y-2">
          <li v-if="reutilizables.length || compartidas.length" class="notif notif--warning">
            <i class="ti ti-key" aria-hidden="true"></i>
            <div class="notif__texto">
              <p class="notif__titulo">Rotar contraseñas</p>
              <p class="notif__detalle">
                Las cuentas reutilizables y compartidas quedarán marcadas “Rotar contraseña”: el empleado conoce las claves actuales. Cámbielas cuanto antes.
              </p>
            </div>
          </li>
          <li v-if="equipos.length" class="notif notif--warning">
            <i class="ti ti-devices" aria-hidden="true"></i>
            <div class="notif__texto">
              <p class="notif__titulo">
                Recuperar {{ equipos.length }} {{ equipos.length === 1 ? 'equipo' : 'equipos' }}
              </p>
              <ul class="my-1 space-y-0.5">
                <li v-for="eq in equipos" :key="eq.asignacion_id" class="truncate">
                  <RouterLink
                    class="rounded-sm text-primary-600 hover:underline focus-visible:underline focus-visible:outline-none"
                    :to="`/equipos/${eq.equipo_id}`"
                  ><AppCodigo :valor="eq.codigo" titulo="Código del equipo" /></RouterLink>
                  · {{ descripcionEquipo(eq) }}
                </li>
              </ul>
              <p class="notif__detalle">
                La baja no los marca como devueltos: recupérelos y registre la devolución en la hoja de vida de cada equipo. Mientras tanto aparecen como “Sin devolver” en Inicio.
              </p>
            </div>
          </li>
        </ul>
      </section>

      <div class="campo">
        <label class="campo__etiqueta" :for="campoMotivo.id">Motivo de la baja</label>
        <div class="campo__caja">
          <textarea
            :id="campoMotivo.id"
            v-model="motivo"
            class="campo__control campo__control--area"
            rows="3"
            :maxlength="MOTIVO_MAX"
            placeholder="Opcional: término de contrato, renuncia..."
            :aria-describedby="campoMotivo.describedBy.value"
          ></textarea>
        </div>
        <p class="campo__pie tabular-nums">Queda en la hoja de vida del empleado. {{ motivo.length }}/{{ MOTIVO_MAX }}</p>
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>
    </div>

    <template v-if="fase === 'resumen'" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" @click="dialogo?.cerrar()" />
      <AppButton severity="danger" icon="ti ti-user-off" label="Confirmar baja" :disabled="cargando" @click="confirmarBaja" />
    </template>
    <template v-else-if="fase === 'hecha'" #acciones>
      <AppButton v-if="solicitud" variant="outline" severity="secondary" label="Ver solicitud" :to="`/solicitudes/${solicitud.id}`" @click="dialogo?.cerrar()" />
      <AppButton label="Cerrar" @click="dialogo?.cerrar()" />
    </template>
  </AppDialog>
</template>
