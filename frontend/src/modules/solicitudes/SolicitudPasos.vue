<script setup>
// Los pasos de una solicitud (migración 108) como lista de verificación: cada
// uno con su estado, quién y cuándo lo cumplió, y —si sigue pendiente y la
// solicitud está abierta— lo que se puede hacer ahí mismo:
//
//   ○ Crear la cuenta de correo                    Se marca solo al asignar una cuenta
//        [Abrir expediente] [Marcar hecho] [Omitir]
//   ✓ Registrar a la persona                       Automático · 14/10/26 09:02
//
// Reglas de lo que se OFRECE (el servidor repite cada una):
//   · «Abrir …» solo si la persona tiene el módulo donde se hace el paso
//     (cuentas, equipos, licencias): una acción que el servidor rechazaría no
//     se muestra.
//   · «Omitir» solo si el paso es opcional o quien mira es jefe.
//   · Una solicitud completada o cancelada no ofrece nada: está cerrada.
// Los pasos que el sistema marca solo avisan «Se marca solo…», pero también se
// pueden marcar a mano por si el trabajo se hizo fuera del sistema.
import { computed } from 'vue';
import { formatFechaLibro } from '../../core/formatters.js';
import { destinoPaso, estadoPasoInfo } from '../../core/dominio-solicitudes.js';
import AppButton from '../../components/ui/AppButton.vue';
import AppSeccion from '../../components/ui/AppSeccion.vue';

const props = defineProps({
  solicitud: { type: Object, required: true },
  // { [objetivo_id]: { usuario } | { equipo_id, codigo } } (store.objetivos).
  objetivos: { type: Object, default: () => ({}) },
  // user_id → nombre del staff.
  nombresStaff: { type: Object, default: () => ({}) },
  // (modulo) => boolean: ¿la persona puede abrir ese módulo?
  puedeModulo: { type: Function, default: () => true },
  esJefe: { type: Boolean, default: false },
  // paso.id en curso (deshabilita sus botones).
  ocupado: { type: String, default: '' },
});
defineEmits(['completar', 'omitir']);

const ICONO = {
  hecho: 'ti ti-circle-check text-green-700',
  omitido: 'ti ti-circle-minus text-gray-500',
  pendiente: 'ti ti-circle-dashed text-gray-500',
};
const TEXTO_AUTO = {
  crear_cuenta: 'Se marca solo al asignar una cuenta',
  entregar_credenciales: 'Se marca solo cuando la persona abre su enlace',
  asignar_equipo: 'Se marca solo al entregar un equipo',
  asignar_licencia: 'Se marca solo al asignar una licencia',
  rotar_contrasenas: 'Se marca solo al cambiar la contraseña',
  devolver_equipo: 'Se marca solo al registrar la devolución',
};

const abierta = computed(() => props.solicitud.estado === 'abierta');

const filas = computed(() => props.solicitud.pasos.map((p) => {
  const destino = destinoPaso(p, { empleadoId: props.solicitud.empleado_id, objetivo: props.objetivos[p.objetivo_id] });
  const cuando = p.hecho_at ? formatFechaLibro(p.hecho_at) : null;
  const quien = props.nombresStaff[p.hecho_por] || (p.automatico ? 'Automático' : '');
  return {
    ...p,
    icono: ICONO[p.estado] || ICONO.pendiente,
    estadoTexto: estadoPasoInfo(p.estado).label,
    pendiente: p.estado === 'pendiente',
    aviso: p.estado === 'pendiente' && p.autocompleta ? (TEXTO_AUTO[p.clave] || 'Se marca solo al hacerlo en el sistema') : '',
    resolucion: cuando ? [quien, `${cuando.fecha}${cuando.hora ? ` ${cuando.hora}` : ''}`].filter(Boolean).join(' · ') : '',
    destino: p.estado === 'pendiente' && props.puedeModulo(destino.modulo) ? destino : null,
    puedeOmitir: !p.obligatorio || props.esJefe,
  };
}));

const resueltos = computed(() => filas.value.filter((f) => !f.pendiente).length);
</script>

<template>
  <AppSeccion titulo="Pasos" :conteo="`${resueltos}/${filas.length}`" sin-padding>
    <p v-if="!filas.length" class="px-4 py-3 text-sm text-gray-500">— Esta solicitud no tiene pasos.</p>
    <ol v-else class="divide-y divide-gray-100" aria-label="Pasos de la solicitud">
      <li
        v-for="p in filas"
        :key="p.id"
        class="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3"
        data-paso
        :data-estado="p.estado"
      >
        <i :class="p.icono" class="mt-0.5 text-lg" aria-hidden="true"></i>
        <div class="min-w-0 flex-1">
          <p class="text-sm" :class="p.pendiente ? 'font-medium text-gray-900' : 'text-gray-500'">
            <span class="sr-only">{{ p.estadoTexto }}: </span>{{ p.label }}
            <span v-if="!p.obligatorio" class="ml-1 text-xs font-normal text-gray-500">opcional</span>
          </p>
          <p v-if="p.aviso" class="mt-0.5 text-xs text-gray-500">{{ p.aviso }}</p>
          <p v-if="p.resolucion" class="mt-0.5 text-xs tabular-nums text-gray-500">{{ p.estadoTexto }} · {{ p.resolucion }}</p>
          <p v-if="p.nota" class="mt-0.5 text-xs text-gray-500">{{ p.nota }}</p>
          <p v-if="p.motivo_omision" class="mt-0.5 text-xs text-gray-500">Motivo: {{ p.motivo_omision }}</p>
        </div>

        <div v-if="abierta && p.pendiente" data-no-print class="flex shrink-0 flex-wrap items-center gap-1">
          <AppButton
            v-if="p.destino"
            size="sm"
            variant="text"
            :to="p.destino.to"
            :label="p.destino.texto"
            :aria-label="`${p.destino.texto}: ${p.label}`"
          />
          <AppButton
            size="sm"
            variant="outline"
            severity="secondary"
            label="Marcar hecho"
            :aria-label="`Marcar hecho: ${p.label}`"
            :disabled="!!ocupado"
            :loading="ocupado === p.id"
            @click="$emit('completar', p)"
          />
          <AppButton
            v-if="p.puedeOmitir"
            size="sm"
            variant="text"
            severity="secondary"
            label="Omitir"
            :aria-label="`Omitir: ${p.label}`"
            :disabled="!!ocupado"
            @click="$emit('omitir', p)"
          />
        </div>
      </li>
    </ol>
  </AppSeccion>
</template>
