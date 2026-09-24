<script setup>
// Página PÚBLICA (sin sesión): landing de soporte para empleados.
// Punto de entrada único y memorable (/soporte) hacia las acciones
// públicas existentes; no consulta ningún dato, solo navega.
import AppPortal from '../../components/ui/AppPortal.vue';
import AppTag from '../../components/ui/AppTag.vue';

// Fila de acción del menú: toda la fila es el objetivo táctil (≥ 64px de
// alto), hover con fondo tenue, sin bordes extra (principios del JEFE).
const CLASE_FILA =
  'flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left no-underline ' +
  'transition-colors duration-150';
const CLASE_ENLACE =
  CLASE_FILA + ' hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';
</script>

<template>
  <AppPortal
    seccion="Soporte de TI"
    titulo="Solicitudes de soporte"
    descripcion="Registro y seguimiento de incidencias técnicas."
  >
    <nav aria-label="Acciones de soporte">
      <ul class="flex flex-col gap-3">
        <li>
          <RouterLink
            :to="{ name: 'ticket-nuevo' }"
            :class="CLASE_ENLACE"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-xl text-primary-600">
              <i class="ti ti-tool" aria-hidden="true"></i>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-sm font-semibold text-gray-900">Reportar un problema</span>
              <span class="text-sm text-gray-500">Registro del incidente con código de seguimiento.</span>
            </span>
            <i class="ti ti-chevron-right shrink-0 text-lg text-gray-400" aria-hidden="true"></i>
          </RouterLink>
        </li>

        <li>
          <RouterLink
            :to="{ name: 'ticket-buscar' }"
            :class="CLASE_ENLACE"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xl text-gray-600">
              <i class="ti ti-search" aria-hidden="true"></i>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="text-sm font-semibold text-gray-900">Seguimiento de tickets</span>
              <span class="text-sm text-gray-500">Búsqueda de solicitudes por DNI.</span>
            </span>
            <i class="ti ti-chevron-right shrink-0 text-lg text-gray-400" aria-hidden="true"></i>
          </RouterLink>
        </li>

        <li>
          <div :class="[CLASE_FILA, 'cursor-default bg-gray-50']" aria-disabled="true">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xl text-gray-500">
              <i class="ti ti-devices" aria-hidden="true"></i>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-600">
                Equipos asignados
                <AppTag>Próximamente</AppTag>
              </span>
              <span class="text-sm text-gray-500">Consulta de equipos asignados.</span>
            </span>
          </div>
        </li>
      </ul>
    </nav>
  </AppPortal>
</template>
