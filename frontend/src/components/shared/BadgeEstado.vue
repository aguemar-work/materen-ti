<script setup>
import { computed } from 'vue';
import { badgeInfo } from '../../core/badges.js';

const props = defineProps({
  /** empleado | ticket | prioridad | situacion | tipo_cuenta | categoria_acceso_sensible */
  tipo: { type: String, required: true },
  valor: { type: [String, Boolean], default: '' },
  /** Usa .status (pill más compacta) en tablas de empleados */
  status: { type: Boolean, default: false },
  inline: { type: Boolean, default: false },
});

const info = computed(() => badgeInfo(props.tipo, props.valor));
</script>

<template>
  <span
    class="badge"
    :class="[info.clase, { status: status, 'badge-inline': inline }]"
  >{{ info.label }}</span>
</template>
