<script setup>
// Cabecera de módulo: título + slot de acciones (un solo .btn-primary por vista).
defineProps({
  titulo: { type: String, required: true },
  icono: { type: String, default: '' },
  conteo: { type: [Number, String], default: null },
});
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <div v-if="$slots.izquierda" class="header-left">
        <slot name="izquierda" />
      </div>
      <div v-else class="header-title">
        <h1>
          <i v-if="icono" :class="icono" aria-hidden="true"></i>
          {{ titulo }}
          <span v-if="conteo != null" class="badge-count">{{ conteo }}</span>
        </h1>
      </div>
      <div v-if="$slots.acciones" class="header-btns">
        <slot name="acciones" />
      </div>
    </div>
    <slot name="extra" />
  </header>
</template>
