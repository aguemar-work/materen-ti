<script setup>
// Página PÚBLICA (sin sesión): landing de soporte para empleados.
// Punto de entrada único y memorable (/soporte) hacia las acciones
// públicas existentes; no consulta ningún dato, solo navega.
import PublicBrand from '../../components/shared/PublicBrand.vue';
import { rolDeTag } from '../../core/tagRol.js';
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Soporte de TI" />

      <h2 class="soporte-title">Solicitudes de soporte</h2>
      <p class="soporte-subtitulo">
        Registro y seguimiento de incidencias técnicas.
      </p>

      <nav class="soporte-acciones" aria-label="Acciones de soporte">
        <RouterLink class="soporte-accion" :to="{ name: 'ticket-nuevo' }">
          <span class="icon-box icon-box--brand">
            <i class="ti ti-tool" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">Reportar un problema</span>
            <span class="soporte-accion-desc">
              Registro del incidente con código de seguimiento.
            </span>
          </span>
          <i class="ti ti-chevron-right soporte-accion-chevron" aria-hidden="true"></i>
        </RouterLink>

        <RouterLink class="soporte-accion" :to="{ name: 'ticket-buscar' }">
          <span class="icon-box icon-box--neutral">
            <i class="ti ti-search" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">Seguimiento de tickets</span>
            <span class="soporte-accion-desc">
              Búsqueda de solicitudes por DNI.
            </span>
          </span>
          <i class="ti ti-chevron-right soporte-accion-chevron" aria-hidden="true"></i>
        </RouterLink>
        <div class="soporte-accion soporte-accion--disabled" aria-disabled="true">
          <span class="icon-box icon-box--neutral">
            <i class="ti ti-devices" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">
              Equipos asignados
              <span class="tag" :class="`tag--${rolDeTag('neutral')}`">Próximamente</span>
            </span>
            <span class="soporte-accion-desc">
              Consulta de equipos asignados.
            </span>
          </span>
        </div>
      </nav>
    </div>
  </div>
</template>


