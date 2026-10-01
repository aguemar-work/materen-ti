<script setup>
// Identificador del dominio (regla 14 del sistema de diseño, "Versión
// Expediente"): TCK-0281, LAP-0142, código de almacén, serie, DNI. Todo
// código se compone con ESTE render.
//
//   · Inter `font-medium tabular-nums` (nunca `font-mono`: mono queda para lo
//     que se transcribe — contraseñas, usuarios, URLs).
//   · prefijo alfabético y separador en `text-gray-500`; dígitos en
//     `text-gray-900`. El prefijo se separa solo ("TCK-0281"); un valor sin
//     prefijo (DNI, serie) va entero en oscuro. `prefijo` explícito solo si el
//     valor viene sin él ("0281" + prefijo "TCK").
//   · `titulo` = el nombre completo del dato ("Número de ticket"); sin él, el
//     tooltip repite el código para que el `title` nunca falte.
//   · sin valor: "Sin registrar" en gris (regla 21), nunca un hueco.
//
// PIEZA NUEVA, aún no adoptada por las pantallas (se adopta por módulo junto
// con su rediseño). Hereda el tamaño y el color de contexto solo en el
// prefijo/dígitos; si el código es un enlace, el enlace lo envuelve.
import { computed } from 'vue';
import { partesCodigo } from '../../core/codigo.js';

const props = defineProps({
  valor: { type: [String, Number], default: '' },
  prefijo: { type: String, default: '' },
  titulo: { type: String, default: '' },
});

const partes = computed(() => partesCodigo(props.valor, props.prefijo));
const completo = computed(() => partes.value.prefijo + partes.value.numero);
</script>

<template>
  <span v-if="completo" data-codigo class="whitespace-nowrap font-medium tabular-nums" :title="titulo || completo"><span v-if="partes.prefijo" class="text-gray-500">{{ partes.prefijo }}</span><span class="text-gray-900">{{ partes.numero }}</span></span>
  <span v-else class="text-gray-500">Sin registrar</span>
</template>
