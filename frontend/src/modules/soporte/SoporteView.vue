<script setup>
// Página PÚBLICA (sin sesión): landing de soporte para empleados.
// Punto de entrada único y memorable (/soporte) hacia las acciones
// públicas existentes; no consulta ningún dato, solo navega.
import PublicBrand from '../../components/shared/PublicBrand.vue';
import CarbonTag from '../../components/carbon/CarbonTag.vue';
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
              <CarbonTag variante="neutral">Próximamente</CarbonTag>
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

<style scoped>
.soporte-title {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.soporte-subtitulo {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  margin: 0 0 16px;
}

.soporte-acciones {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.soporte-accion {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-base);
  padding: 14px 12px;
  text-decoration: none;
  transition: background 0.15s;
}

.soporte-accion:hover {
  background: var(--color-bg-subtle);
}

/* El ícono de cada acción usa .icon-box de main.css (rediseño Materen,
   Fase 1): antes era .soporte-accion-icono, la otra mitad del patrón
   duplicado junto a .feed-icon del Dashboard. La variante sin color propio
   pasó de "neutral-bg + text-secondary" a .icon-box--neutral (neutral-bg +
   neutral-text): mismo fondo, el texto baja medio tono al par que ya usan
   .badge--neutral y el resto del sistema para "esto es neutro". */

.soporte-accion-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.soporte-accion-titulo {
  font-size: var(--fs-body-01);
  font-weight: 600;
  color: var(--color-text-primary);
}

.soporte-accion-desc {
  font-size: var(--fs-label-01);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.soporte-accion-chevron {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.soporte-accion--disabled {
  cursor: default;
  border-color: var(--color-border-subtle);
}

.soporte-accion--disabled:hover {
  background: transparent;
}

.soporte-accion--disabled .soporte-accion-titulo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-secondary);
}

.soporte-accion--disabled .icon-box,
.soporte-accion--disabled .soporte-accion-desc {
  color: var(--color-text-tertiary);
}
</style>
