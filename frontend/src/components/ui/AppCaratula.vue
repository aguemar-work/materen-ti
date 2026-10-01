<script setup>
// Carátula del expediente (regla 20, "Versión Expediente"): toda ficha abre
// con ella. Reemplaza al perfil "avatar grande + lista con íconos".
//
//   ROTULO · IDENTIFICADOR                                  [acciones]
//   Título (h1)  [sello]
//   RÓTULO valor · RÓTULO valor · RÓTULO valor        (3 a 6 pares, en fila)
//   ─────────────────────────────────────────────────  (regla a sangre)
//
//   · `rotulo`: qué es el expediente y su número, en el token de rótulo
//     (11px semibold mayúsculas gris): "EMPLEADO · DNI 45678912",
//     "TICKET · TCK-0281 · INCIDENTE". Si necesita marcado propio (un
//     `AppCodigo`), usar el slot `rotulo`.
//   · `titulo`: el único `<h1>` de la página.
//   · slot `sello`: un `AppSello` si el estado es terminal (CERRADO, DE BAJA).
//   · `datos`: [{ rotulo, valor }] como `<dl>` horizontal. Un valor vacío se
//     muestra "Sin registrar" en gris. Un valor con formato propio (enlace,
//     AppCodigo) va en el slot `valor-<i>`.
//   · slot `acciones`: a la derecha; UNA sola acción sólida (regla de un solo
//     acento por pantalla).
//   · Sin avatar grande (el avatar queda en listas y menú de usuario) y sin
//     "← Volver" (las migas ya llevan al módulo).
//
// La regla horizontal (`border-b border-gray-200`) llega de borde a borde de
// la hoja; el relleno lateral es el de página (`px-4 sm:px-6`).
//
// PIEZA NUEVA, aún no adoptada por las pantallas. En impresión es la
// cabecera del documento (styles/impresion.css la reconoce por
// `data-caratula`).
defineProps({
  rotulo: { type: String, default: '' },
  titulo: { type: String, required: true },
  datos: { type: Array, default: () => [] },
});
</script>

<template>
  <div data-caratula class="border-b border-gray-200 px-4 pb-4 pt-6 sm:px-6">
    <div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div class="min-w-0">
        <p v-if="rotulo || $slots.rotulo" class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          <slot name="rotulo">{{ rotulo }}</slot>
        </p>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 class="text-2xl font-semibold tracking-tight text-gray-900 [overflow-wrap:anywhere]">{{ titulo }}</h1>
          <slot name="sello" />
        </div>
      </div>
      <div v-if="$slots.acciones" data-no-print class="flex shrink-0 flex-wrap items-center gap-2">
        <slot name="acciones" />
      </div>
    </div>

    <dl v-if="datos.length" class="mt-4 flex flex-wrap gap-x-8 gap-y-3">
      <div v-for="(dato, i) in datos" :key="dato.rotulo" class="min-w-0">
        <dt class="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{{ dato.rotulo }}</dt>
        <dd
          class="mt-0.5 min-w-0 text-sm [overflow-wrap:anywhere]"
          :class="dato.valor || $slots[`valor-${i}`] ? 'text-gray-900' : 'text-gray-500'"
        >
          <slot :name="`valor-${i}`">{{ dato.valor || 'Sin registrar' }}</slot>
        </dd>
      </div>
    </dl>
  </div>
</template>
