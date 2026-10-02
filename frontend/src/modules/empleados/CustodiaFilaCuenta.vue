<script setup>
// Fila de una cuenta en la tabla "En custodia" del expediente. Solo presenta:
// las acciones (⋮) las arma EmpleadoCustodia y el revelado auditado de la
// contraseña llega ya resuelto (composables/useRevelado.js vía
// modules/cuentas/useRevelados.js). El marcado `.cred*` es el de siempre y NO
// se toca: es el contrato visual del revelado de 8 s.
import { badgeInfo } from '../../core/badges.js';
import { formatFechaLibro } from '../../core/formatters.js';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppTag from '../../components/ui/AppTag.vue';

defineProps({
  cuenta: { type: Object, required: true },
  // Resultado de revelarDe(cuenta): { valor, restante, pidiendo, mostrar, copiar }.
  revelado: { type: Object, required: true },
  puedeRevelar: { type: Boolean, default: false },
  motivoBloqueo: { type: String, default: '' },
  acciones: { type: Array, required: true },
});
</script>

<template>
  <tr class="border-b border-gray-100 align-top" data-custodia="cuenta">
    <td class="px-3 py-2 text-xs text-gray-500">Cuenta</td>

    <td class="px-3 py-2">
      <AppCodigo :valor="cuenta.usuario" titulo="Usuario de la cuenta" class="whitespace-normal! [overflow-wrap:anywhere]" />

      <!-- Contraseña: revelado auditado, sin imprimir nunca. -->
      <div data-no-print class="mt-1">
        <div class="cred">
          <span v-if="revelado.valor.value" class="cred__valor">{{ revelado.valor.value }}</span>
          <span v-else class="cred__oculto" aria-hidden="true">••••••••</span>
          <template v-if="puedeRevelar">
            <button
              type="button"
              class="cred__accion"
              :disabled="revelado.pidiendo.value"
              :aria-label="revelado.valor.value ? 'Ocultar contraseña' : 'Mostrar contraseña'"
              @click="revelado.mostrar()"
            >
              <i :class="revelado.valor.value ? 'ti ti-eye-off' : 'ti ti-eye'" aria-hidden="true"></i>
            </button>
            <button
              type="button"
              class="cred__accion"
              :disabled="revelado.pidiendo.value"
              aria-label="Copiar contraseña"
              @click="revelado.copiar()"
            >
              <i class="ti ti-copy" aria-hidden="true"></i>
            </button>
            <span v-if="revelado.valor.value" class="cred__cuenta" aria-live="off">{{ revelado.restante.value }}s</span>
          </template>
          <span v-else class="cred__candado" role="img" :aria-label="motivoBloqueo" :title="motivoBloqueo">
            <i class="ti ti-lock" aria-hidden="true"></i>
          </span>
        </div>
      </div>

      <!-- Móvil: el detalle y la fecha pasan bajo el identificador. -->
      <p class="mt-1 text-xs text-gray-500 sm:hidden">
        {{ cuenta.plataforma_nombre }} · desde {{ formatFechaLibro(cuenta.fecha_inicio).fecha }}
      </p>
      <AppTag v-if="cuenta.requiere_rotacion" tono="warning" class="mt-1 sm:hidden">Rotar contraseña</AppTag>
    </td>

    <td class="hidden px-3 py-2 sm:table-cell">
      <div class="text-gray-900">{{ cuenta.plataforma_nombre }}</div>
      <div class="mt-1 flex flex-wrap gap-1">
        <AppTag v-if="cuenta.tipo_cuenta !== 'personal'" tono="teal">{{ badgeInfo('tipo_cuenta', cuenta.tipo_cuenta).label }}</AppTag>
        <AppTag
          v-if="cuenta.requiere_rotacion"
          tono="warning"
          title="Un titular anterior dejó esta cuenta y la contraseña no se ha cambiado"
        >Rotar contraseña</AppTag>
      </div>
    </td>

    <td class="hidden px-3 py-2 text-xs tabular-nums text-gray-500 sm:table-cell">
      {{ formatFechaLibro(cuenta.fecha_inicio).fecha }}
    </td>

    <td class="px-3 py-2 text-right" data-no-print>
      <MenuAcciones :acciones="acciones" :label="`Acciones de la cuenta ${cuenta.usuario}`" />
    </td>
  </tr>
</template>
