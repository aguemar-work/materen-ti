<script setup>
// Cierre de "Entregar" y "Devolver": el cambio ya está hecho, y lo que sigue
// es el papel. Ofrece abrir el acta imprimible (ruta /equipos/:id/acta/:asignacionId)
// en una pestaña nueva. Es un enlace real, no un `window.open` tras un `await`:
// el clic del usuario abre la pestaña sin que el navegador la bloquee, y ya no
// hace falta reservar una ventana de antemano (adiós `reservarVentanaActa`).
import AppButton from '../../components/ui/AppButton.vue';

defineProps({
  // { tipo: 'entrega' | 'devolucion', mensaje }
  resultado: { type: Object, required: true },
  href: { type: String, default: '' },
});
defineEmits(['cerrar']);
</script>

<template>
  <div class="space-y-4" role="status">
    <p class="text-sm text-gray-900">{{ resultado.mensaje }}</p>
    <p class="text-sm text-gray-600">
      Falta el acta de {{ resultado.tipo === 'entrega' ? 'entrega' : 'devolución' }}: imprímala, hágala firmar y súbala firmada al expediente.
    </p>
    <div class="flex flex-wrap items-center justify-end gap-2">
      <AppButton variant="outline" severity="secondary" label="Cerrar" @click="$emit('cerrar')" />
      <AppButton
        v-if="href"
        icon="ti ti-file-text"
        label="Ver acta"
        :href="href"
        target="_blank"
        rel="noopener"
      />
    </div>
  </div>
</template>
