<script setup>
// Dar de baja a un empleado: resumen de consecuencias, motivo opcional y un
// checklist que se completa cuando la RPC `dar_baja_empleado` (migración 102)
// responde. Sobre AppDialog (diálogo único del sistema).
//
// El checklist animado es de PRESENTACIÓN: la baja es una sola transacción de
// servidor, no hay progreso real por paso. Marca el último paso recién cuando
// la RPC real resolvió (`Promise.all` en confirmarBaja), así que nunca miente
// sobre si la baja ya ocurrió.
//
// Los equipos NO forman parte de la baja (nunca se cierran sus asignaciones,
// docs/PANORAMA-SISTEMA.md §2): se muestran como lo que son, pasos PENDIENTES
// de TI, cada uno con el enlace a su hoja de vida donde se registra la
// devolución.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useEmpleadosStore } from '../../stores/empleados.js';
import { showToast } from '../../core/toast.js';
import { nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
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

// ── Checklist progresivo (300 ms por paso) ───────────────────────────────────
const fase = ref('resumen'); // 'resumen' | 'confirmando'
const pasoActivo = ref(-1);
let temporizadores = [];

function limpiarTemporizadores() {
  temporizadores.forEach(clearTimeout);
  temporizadores = [];
}
onUnmounted(limpiarTemporizadores);

const pasosConfirmacion = computed(() => {
  const pasos = [];
  if (personales.value.length) {
    pasos.push({ id: 'personales', label: `Dando de baja ${personales.value.length} ${personales.value.length === 1 ? 'cuenta personal' : 'cuentas personales'}`, estado: 'exito' });
  }
  if (reutilizables.value.length || compartidas.value.length) {
    const n = reutilizables.value.length + compartidas.value.length;
    pasos.push({ id: 'rotacion', label: `Liberando ${n} ${n === 1 ? 'cuenta' : 'cuentas'} y marcando la rotación de contraseña pendiente`, estado: 'exito' });
  }
  if (licencias.value.length) {
    pasos.push({ id: 'licencias', label: `Liberando ${licencias.value.length} ${licencias.value.length === 1 ? 'asiento' : 'asientos'} de licencia`, estado: 'exito' });
  }
  pasos.push({ id: 'estado', label: 'Marcando al empleado como Inactivo', estado: 'exito' });
  for (const eq of equipos.value) {
    pasos.push({ id: `equipo-${eq.asignacion_id}`, label: 'Pendiente de devolución', estado: 'pendiente', equipo: eq });
  }
  return pasos;
});

async function confirmarBaja() {
  error.value = '';
  fase.value = 'confirmando';
  pasoActivo.value = -1;

  const pasos = pasosConfirmacion.value;
  const avance = new Promise((resolve) => {
    let i = 0;
    function siguiente() {
      if (i >= pasos.length) { resolve(); return; }
      pasoActivo.value = i;
      temporizadores.push(setTimeout(() => { i += 1; siguiente(); }, 300));
    }
    siguiente();
  });

  try {
    await Promise.all([store.darDeBaja(props.empleado.id, motivo.value.trim() || null), avance]);
    pasoActivo.value = pasos.length;
    showToast(`${nombreCompleto.value} dado de baja`);
    resultado = true;
    temporizadores.push(setTimeout(() => dialogo.value?.cerrar(), 450));
  } catch (e) {
    limpiarTemporizadores();
    error.value = traducirErrorDb(e, { entidad: 'empleado', porDefecto: 'No se pudo dar de baja al empleado.' }).mensaje;
    fase.value = 'resumen';
  }
}
</script>

<template>
  <AppDialog
    ref="dialogo"
    size="md"
    :mostrar-cerrar="fase !== 'confirmando'"
    :cerrar-en-backdrop="fase !== 'confirmando'"
    :confirmar-cierre="() => fase !== 'confirmando'"
    @cerrado="emit('cerrar', resultado)"
  >
    <template #titulo>
      <span class="block truncate">Dar de baja a {{ nombreCompleto }}</span>
      <span class="block text-xs font-normal text-gray-500">Revise las consecuencias antes de confirmar</span>
    </template>

    <p v-if="cargando" class="py-8 text-center text-sm text-gray-500" role="status">Cargando resumen de accesos...</p>

    <!-- ══ Fase 2: procesando (checklist progresivo) ══════════════ -->
    <div v-else-if="fase === 'confirmando'" role="status" aria-live="polite">
      <p class="mb-3 text-sm text-gray-600">Procesando la baja de {{ nombreCompleto }}:</p>
      <ol class="space-y-2">
        <li v-for="(paso, idx) in pasosConfirmacion" :key="paso.id" class="flex items-start gap-2.5 text-sm">
          <i
            v-if="idx < pasoActivo && paso.estado === 'exito'"
            class="ti ti-circle-check mt-0.5 text-lg text-green-600"
            aria-hidden="true"
          ></i>
          <i
            v-else-if="idx < pasoActivo"
            class="ti ti-clock mt-0.5 text-lg text-amber-600"
            aria-hidden="true"
          ></i>
          <i
            v-else-if="idx === pasoActivo"
            class="ti ti-loader-2 mt-0.5 animate-spin text-lg text-gray-500"
            aria-hidden="true"
          ></i>
          <i v-else class="ti ti-circle-dashed mt-0.5 text-lg text-gray-300" aria-hidden="true"></i>
          <span class="min-w-0" :class="idx > pasoActivo ? 'text-gray-500' : 'text-gray-900'">
            <template v-if="paso.equipo">
              <RouterLink
                class="rounded-sm text-primary-600 hover:underline focus-visible:underline focus-visible:outline-none"
                :to="`/equipos/${paso.equipo.equipo_id}`"
              ><AppCodigo :valor="paso.equipo.codigo" titulo="Código del equipo" /></RouterLink>
              {{ descripcionEquipo(paso.equipo) }} · {{ paso.label }}
            </template>
            <template v-else>{{ paso.label }}</template>
          </span>
        </li>
      </ol>
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
            <p class="text-sm font-medium text-gray-900">Marca al empleado como Inactivo</p>
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

    <template v-if="fase !== 'confirmando'" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" @click="dialogo?.cerrar()" />
      <AppButton severity="danger" icon="ti ti-user-off" label="Confirmar baja" :disabled="cargando" @click="confirmarBaja" />
    </template>
  </AppDialog>
</template>
