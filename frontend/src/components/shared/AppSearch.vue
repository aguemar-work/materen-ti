<script setup>
// Buscador global del sidebar. Extraído de AppLayout.vue (A-06): el estado
// de colapso del sidebar vive en el layout raíz, así que este componente
// solo emite intención ('expandir-sidebar', 'navegado') en vez de mutar
// sidebarColapsado/localStorage o cerrar el drawer por su cuenta.
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { insforgeApi } from '../../api/insforge.js';
import { estadoInfo } from '../../core/dominio-tickets.js';
import { useBusqueda } from '../../composables/useBusqueda.js';

const emit = defineEmits(['expandir-sidebar', 'navegado']);

const router = useRouter();
const inputBusqueda = ref(null);

async function expandirYBuscar() {
  emit('expandir-sidebar');
  await nextTick();
  inputBusqueda.value?.focus();
}

const SIN_RESULTADOS = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };
const resultados = ref({ ...SIN_RESULTADOS });
const busquedaAbierta = ref(false);

const hayResultados = computed(() =>
  resultados.value.empleados.length ||
  resultados.value.cuentas.length ||
  resultados.value.equipos.length ||
  resultados.value.tickets.length ||
  resultados.value.licencias.length
);

// peticionId descarta respuestas obsoletas: si dos búsquedas se
// superponen (red desordenada), solo se aplica la más reciente.
let peticionBusquedaId = 0;
const { termino: busqueda, cargando: buscando } = useBusqueda({
  onBuscar: async (q) => {
    const id = ++peticionBusquedaId;
    if (!q) { resultados.value = { ...SIN_RESULTADOS }; return; }
    try {
      const r = await insforgeApi.buscarGlobal(q);
      if (id === peticionBusquedaId) resultados.value = r;
    } catch {
      if (id === peticionBusquedaId) resultados.value = { ...SIN_RESULTADOS };
    }
  },
});
watch(busqueda, (q) => { busquedaAbierta.value = q.trim().length >= 2; });

function cerrarBusqueda() {
  setTimeout(() => { busquedaAbierta.value = false; }, 150);
}

function limpiarBusqueda() {
  busqueda.value = '';
  busquedaAbierta.value = false;
  emit('navegado');
}

function irAEmpleado(emp) {
  limpiarBusqueda();
  router.push(`/empleados/${emp.id}`);
}

function irACuenta(cuenta) {
  limpiarBusqueda();
  // Personal con titular → su ficha; compartida/reutilizable → Correos
  // prefiltrado con el usuario de la cuenta
  if (cuenta.tipo_cuenta === 'personal' && cuenta.titular_id) {
    router.push(`/empleados/${cuenta.titular_id}`);
  } else {
    router.push({ path: '/correos', query: { q: cuenta.usuario } });
  }
}

// Deep-links: la vista de lista lee ?q= y precarga su buscador, dejando
// visible el registro concreto (no hay vistas de detalle para estos).
function irAEquipo(eq) {
  limpiarBusqueda();
  router.push({ path: '/equipos', query: { q: eq.codigo } });
}

function irATicket(t) {
  limpiarBusqueda();
  router.push(`/tickets/${t.id}`);
}

function irALicencia(lic) {
  limpiarBusqueda();
  router.push({ path: '/licencias', query: { q: lic.software } });
}
</script>

<template>
  <!-- Búsqueda global (colapsado: solo un botón que expande y enfoca) -->
  <div class="sb-busqueda sb-busqueda--colapsada">
    <button
      class="sb-logout"
      type="button"
      title="Buscar en todo"
      @click="expandirYBuscar"
    >
      <i class="ti ti-search" aria-hidden="true"></i>
    </button>
  </div>
  <div class="sb-busqueda sb-busqueda--full">
    <i class="ti ti-search sb-busqueda-icon" aria-hidden="true"></i>
    <input
      ref="inputBusqueda"
      v-model="busqueda"
      type="text"
      placeholder="Buscar en todo..."
      aria-label="Búsqueda global"
      @focus="busqueda.trim().length >= 2 && (busquedaAbierta = true)"
      @blur="cerrarBusqueda"
    >
    <div v-if="busquedaAbierta" class="sb-resultados">
      <div v-if="buscando" class="sb-res-vacio">Buscando...</div>
      <template v-else-if="hayResultados">
        <template v-if="resultados.empleados.length">
          <div class="sb-res-grupo">Empleados</div>
          <button
            v-for="e in resultados.empleados"
            :key="e.id"
            type="button"
            class="sb-res-item"
            @mousedown.prevent="irAEmpleado(e)"
          >
            <i class="ti ti-user"></i>
            <span class="sb-res-main">{{ e.nombres }} {{ e.apellidos }}</span>
            <span class="sb-res-sec">{{ e.dni }}</span>
          </button>
        </template>
        <template v-if="resultados.cuentas.length">
          <div class="sb-res-grupo">Cuentas</div>
          <button
            v-for="c in resultados.cuentas"
            :key="c.id"
            type="button"
            class="sb-res-item"
            @mousedown.prevent="irACuenta(c)"
          >
            <i class="ti ti-key"></i>
            <span class="sb-res-main">{{ c.usuario }}</span>
            <span class="sb-res-sec">{{ c.plataforma_nombre }}</span>
          </button>
        </template>
        <template v-if="resultados.equipos.length">
          <div class="sb-res-grupo">Equipos</div>
          <button
            v-for="eq in resultados.equipos"
            :key="eq.id"
            type="button"
            class="sb-res-item"
            @mousedown.prevent="irAEquipo(eq)"
          >
            <i class="ti ti-devices"></i>
            <span class="sb-res-main">{{ eq.codigo }}</span>
            <span class="sb-res-sec">{{ eq.descripcion }}</span>
          </button>
        </template>
        <template v-if="resultados.tickets.length">
          <div class="sb-res-grupo">Tickets</div>
          <button
            v-for="t in resultados.tickets"
            :key="t.id"
            type="button"
            class="sb-res-item"
            @mousedown.prevent="irATicket(t)"
          >
            <i class="ti ti-headset"></i>
            <span class="sb-res-main">{{ t.titulo }}</span>
            <span class="sb-res-sec">{{ t.codigo }} · {{ estadoInfo(t.estado).label }}</span>
          </button>
        </template>
        <template v-if="resultados.licencias.length">
          <div class="sb-res-grupo">Licencias</div>
          <button
            v-for="lic in resultados.licencias"
            :key="lic.id"
            type="button"
            class="sb-res-item"
            @mousedown.prevent="irALicencia(lic)"
          >
            <i class="ti ti-license"></i>
            <span class="sb-res-main">{{ lic.software }}</span>
            <span class="sb-res-sec">{{ lic.proveedor }}</span>
          </button>
        </template>
      </template>
      <div v-else class="sb-res-vacio">Sin resultados para "{{ busqueda }}"</div>
    </div>
  </div>
</template>

<style scoped>
/* Botón de búsqueda visible solo cuando el sidebar está colapsado (desktop);
   mismo estilo que los otros iconos del footer del layout raíz (sb-logout),
   duplicado acá porque este botón vive en un componente distinto. */
.sb-logout {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--sb-text, var(--color-text-secondary));
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  font-size: 18px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}

.sb-logout:hover {
  background: var(--color-bg-hover);
  color: var(--sb-text-strong, var(--color-text-primary));
}

.sb-busqueda--colapsada {
  display: none;
}

.sb-busqueda {
  position: relative;
  padding: 12px 14px 4px;
  flex-shrink: 0;
}

.sb-busqueda-icon {
  position: absolute;
  left: 26px;
  top: 50%;
  transform: translateY(calc(-50% + 3px));
  color: var(--sb-text, var(--color-text-secondary));
  font-size: 14px;
  pointer-events: none;
}

.sb-busqueda input {
  width: 100%;
  padding: 8px 10px 8px 34px;
  font-size: 13px;
  color: var(--sb-text-strong, var(--color-text-primary));
  background: var(--color-bg-hover);
  border: 1px solid transparent;
  border-radius: 8px;
  outline: none;
  transition: background 0.15s, border-color 0.15s;
}

.sb-busqueda input::placeholder { color: var(--color-text-tertiary); }

.sb-busqueda input:focus {
  background: var(--color-bg-elevated);
  border-color: var(--color-border);
}

.sb-resultados {
  position: absolute;
  top: calc(100% + 2px);
  left: 14px;
  right: 14px;
  z-index: var(--z-popover);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  max-height: 340px;
  overflow-y: auto;
  padding: 4px;
}

.sb-res-grupo {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-secondary);
  padding: 8px 10px 3px;
}

.sb-res-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}

.sb-res-item:hover { background: var(--color-accent-subtle); }

.sb-res-item i {
  color: var(--color-accent-soft);
  font-size: 15px;
  flex-shrink: 0;
}

.sb-res-main {
  color: var(--color-text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.sb-res-sec {
  font-size: 11.5px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.sb-res-vacio {
  padding: 14px 10px;
  font-size: 12.5px;
  color: var(--color-text-secondary);
  text-align: center;
}
</style>

<!-- Sin scoped: .sidebar--colapsado vive en el <aside> del layout raíz
     (AppLayout.vue), un componente distinto — el pseudo-selector :global()
     de Vue no propaga el descendiente de esta regla (probado: lo pierde al
     compilar), así que va en un bloque de estilos global. -->
<style>
@media (min-width: 769px) {
  .sidebar--colapsado .sb-busqueda--full {
    display: none;
  }

  .sidebar--colapsado .sb-busqueda--colapsada {
    display: flex;
    justify-content: center;
    padding: 4px 0;
  }
}
</style>
