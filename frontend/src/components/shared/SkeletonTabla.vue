<script setup>
// Filas de carga para el <tbody> de una tabla, mientras se resuelve la
// petición inicial. Uso:
//   <tbody>
//     <SkeletonTabla v-if="cargando" :columnas="7" />
//     <template v-else>
//       <tr v-for="fila in lista" :key="fila.id">...</tr>
//     </template>
//   </tbody>
// Los anchos por defecto varían entre columnas para simular texto real en
// vez de una franja gris uniforme.
const ANCHOS_DEFECTO = ['70%', '45%', '60%', '35%', '55%', '40%'];

const props = defineProps({
  columnas: { type: Number, required: true },
  filas: { type: Number, default: 6 },
  anchos: { type: Array, default: () => [] },
});

function anchoDe(col) {
  return props.anchos[col] || ANCHOS_DEFECTO[col % ANCHOS_DEFECTO.length];
}
</script>

<template>
  <tr v-for="f in filas" :key="f" class="skeleton-fila" aria-hidden="true">
    <td v-for="c in columnas" :key="c">
      <span class="skeleton-bar" :style="{ width: anchoDe(c - 1) }"></span>
    </td>
  </tr>
</template>
