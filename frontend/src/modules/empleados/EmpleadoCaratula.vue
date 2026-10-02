<script setup>
// Carátula del expediente del empleado (regla 20): rótulo con el DNI, el
// nombre como único `h1`, el sello o el estado, el `dl` de datos y las
// acciones a la derecha. Sin avatar grande.
//
//   EMPLEADO · DNI 45871236                          [Dar de baja] [Editar] [Más ▾]
//   Rosa Quispe Mamani   [Activo]
//   EMPRESA … · ÁREA/OBRA … · CARGO … · ALTA … · WHATSAPP … · CORREO …
//
// DNI (decisión del dueño, plan §3.10): completo en el panel del staff;
// ENMASCARADO (`****1236`) en lo impreso. Ambos se pintan y la hoja de
// impresión (print:) elige: en pantalla se oculta el enmascarado, en papel el
// completo. Las actas, que sí llevan el DNI completo, no pasan por acá.
//
// Qué acciones hay y cuál es la sólida lo decide el estado
// (core/dominio-empleados.js → accionesExpediente). Este componente solo las
// pinta y avisa con `accion`: el manejador es de la vista.
import { computed } from 'vue';
import { accionesExpediente, nombreCompleto as nombreCompletoDe } from '../../core/dominio-empleados.js';
import { enmascararDni, fechaISO, formatFecha, formatTelefono } from '../../core/formatters.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCaratula from '../../components/ui/AppCaratula.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppSello from '../../components/ui/AppSello.vue';

const props = defineProps({
  empleado: { type: Object, required: true },
  // Fecha de la baja (ISO) para el sello; solo se usa si está Inactivo.
  fechaBaja: { type: String, default: null },
  deshabilitado: { type: Boolean, default: false },
});
const emit = defineEmits(['accion']);

const nombre = computed(() => nombreCompletoDe(props.empleado));
const inactivo = computed(() => props.empleado.estado === 'Inactivo');
const dniEnmascarado = computed(() => enmascararDni(props.empleado.dni));
// Un timestamp se pasa a la fecha LOCAL (un 'YYYY-MM-DD' ya lo es).
const fechaBajaTexto = computed(() => {
  const f = props.fechaBaja;
  if (!f) return '';
  return formatFecha(/^\d{4}-\d{2}-\d{2}$/.test(f) ? f : fechaISO(new Date(f)));
});
const whatsappLimpio = computed(() => String(props.empleado.whatsapp || '').replace(/\D/g, ''));

const datos = computed(() => {
  const e = props.empleado;
  return [
    { rotulo: 'Empresa', valor: e.empresa_nombre },
    { rotulo: 'Área/obra', valor: e.area_obra_nombre },
    { rotulo: 'Cargo', valor: e.cargo },
    { rotulo: 'Alta', valor: e.fecha_alta ? formatFecha(e.fecha_alta) : '' },
    { rotulo: 'WhatsApp', valor: e.whatsapp ? formatTelefono(e.whatsapp) : '' },
    { rotulo: 'Correo', valor: e.correo_personal },
  ];
});

// ── Acciones ─────────────────────────────────────────────────────────────────
const BOTONES = {
  baja: { icon: 'ti ti-user-off', label: 'Dar de baja', severity: 'danger' },
  editar: { icon: 'ti ti-pencil', label: 'Editar', severity: 'secondary' },
  reactivar: { icon: 'ti ti-user-check', label: 'Reactivar', severity: 'secondary' },
  reingresar: { icon: 'ti ti-user-plus', label: 'Reingresar', severity: 'secondary' },
};
const ITEMS_MENU = {
  suspender: { icono: 'ti-user-pause', label: 'Suspender' },
  baja: { icono: 'ti-user-off', label: 'Dar de baja', danger: true },
  revisar: { icono: 'ti-clipboard-check', label: 'Revisar accesos' },
  imprimir: { icono: 'ti-printer', label: 'Imprimir expediente' },
};

const plan = computed(() => accionesExpediente(props.empleado.estado));
const botones = computed(() => plan.value.botones.map((id) => {
  const base = BOTONES[id];
  const solida = plan.value.solida === id;
  return { id, ...base, variant: solida ? 'solid' : 'outline', severity: solida ? 'primary' : base.severity };
}));
const menu = computed(() => plan.value.menu.map((id) => ({
  ...ITEMS_MENU[id],
  onClick: () => emit('accion', id),
})));
</script>

<template>
  <AppCaratula :titulo="nombre" :datos="datos">
    <template #rotulo>
      EMPLEADO ·
      <span class="print:hidden">DNI <AppCodigo :valor="empleado.dni" titulo="DNI" /></span>
      <span class="hidden print:inline">DNI <AppCodigo :valor="dniEnmascarado" titulo="DNI (enmascarado en lo impreso)" /></span>
    </template>

    <template #sello>
      <AppSello v-if="inactivo" tono="neutro">BAJA {{ fechaBajaTexto }}</AppSello>
      <BadgeEstado v-else tipo="empleado" :valor="empleado.estado" />
    </template>

    <template v-if="empleado.whatsapp" #valor-4>
      <a
        class="rounded-sm tabular-nums text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :href="`https://wa.me/${whatsappLimpio}`"
        target="_blank"
        rel="noopener noreferrer"
      >{{ formatTelefono(empleado.whatsapp) }}</a>
    </template>

    <template v-if="empleado.correo_personal" #valor-5>
      <a
        class="rounded-sm text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :href="`mailto:${empleado.correo_personal}`"
      >{{ empleado.correo_personal }}</a>
    </template>

    <template #acciones>
      <AppButton
        v-for="b in botones"
        :key="b.id"
        :variant="b.variant"
        :severity="b.severity"
        :icon="b.icon"
        :label="b.label"
        :disabled="deshabilitado"
        @click="emit('accion', b.id)"
      />
      <MenuAcciones :acciones="menu" label="Más acciones del expediente" texto="Más" icono="ti-chevron-down" />
    </template>
  </AppCaratula>
</template>
