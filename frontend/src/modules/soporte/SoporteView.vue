<script setup>
// Página PÚBLICA (sin sesión): landing de soporte para empleados.
// Punto de entrada único y memorable (/soporte) hacia las acciones
// públicas existentes; no consulta ningún dato, solo navega.
import PublicBrand from '../../components/shared/PublicBrand.vue';
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Soporte de TI" />

      <h2 class="soporte-title">¿En qué te ayudamos?</h2>
      <p class="soporte-subtitulo">
        Reporta un problema o consulta el estado de tus solicitudes.
      </p>

      <nav class="soporte-acciones" aria-label="Acciones de soporte">
        <RouterLink class="soporte-accion" to="/ticket/nuevo">
          <span class="soporte-accion-icono soporte-accion-icono--accent">
            <i class="ti ti-tool" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">Reportar un problema</span>
            <span class="soporte-accion-desc">
              Cuéntanos qué pasó y recibe un enlace para seguir tu solicitud.
            </span>
          </span>
          <i class="ti ti-chevron-right soporte-accion-chevron" aria-hidden="true"></i>
        </RouterLink>

        <RouterLink class="soporte-accion" to="/ticket/buscar">
          <span class="soporte-accion-icono">
            <i class="ti ti-search" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">Seguir mis tickets</span>
            <span class="soporte-accion-desc">
              Consulta tus solicitudes activas con tu DNI.
            </span>
          </span>
          <i class="ti ti-chevron-right soporte-accion-chevron" aria-hidden="true"></i>
        </RouterLink>
        <div class="soporte-accion soporte-accion--disabled" aria-disabled="true">
          <span class="soporte-accion-icono">
            <i class="ti ti-devices" aria-hidden="true"></i>
          </span>
          <span class="soporte-accion-texto">
            <span class="soporte-accion-titulo">
              Consultar mis equipos
              <span class="badge badge--neutral">Próximamente</span>
            </span>
            <span class="soporte-accion-desc">
              Revisa qué equipos tienes asignados.
            </span>
          </span>
        </div>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.soporte-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.soporte-subtitulo {
  font-size: var(--fs-sm);
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
  border-radius: var(--radius-md);
  padding: 14px 12px;
  text-decoration: none;
  transition: background 0.15s;
}

.soporte-accion:hover {
  background: var(--color-bg-subtle);
}

.soporte-accion-icono {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-neutral-bg);
  color: var(--color-text-secondary);
  font-size: 19px;
}

.soporte-accion-icono--accent {
  background: var(--color-accent-subtle);
  color: var(--color-accent-text);
}

.soporte-accion-texto {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.soporte-accion-titulo {
  font-size: var(--fs-base);
  font-weight: 600;
  color: var(--color-text-primary);
}

.soporte-accion-desc {
  font-size: var(--fs-sm);
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

.soporte-accion--disabled .soporte-accion-icono,
.soporte-accion--disabled .soporte-accion-desc {
  color: var(--color-text-tertiary);
}
</style>
