<script setup>
import {
  OPCIONES_PRIORIDAD as PRIORIDADES,
  OPCIONES_TIPO as TIPOS,
  NIVELES_ATENCION,
  ESTADOS_EN_CURSO,
  ESTADOS_TERMINALES,
} from '../../core/dominio-tickets.js';
import TextoVacio from '../../components/shared/TextoVacio.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';

// Campos de gestión de un ticket (prioridad, nivel de atención, responsable
// y tipo) en las 3 formas que toman según el estado:
//   - abierto:  editables, todavía sin guardar — se aplican al iniciar la
//               atención (atencion-*, con v-model del contenedor).
//   - en curso: editables que guardan al vuelo (eventos cambiar-*).
//   - terminal: solo lectura.
// Compartido por TicketDetalleView.vue (página completa) y
// TicketDetallePanel.vue (split-view): hasta ago 2026 cada uno tenía su
// copia de estos 3 bloques, idénticos salvo el prefijo de los `id` y la
// etiqueta del responsable — y ya habían empezado a divergir.
defineProps({
  ticket: { type: Object, required: true },
  staffActivo: { type: Array, required: true },
  staffPorId: { type: Object, required: true },
  usuarioId: { type: String, default: '' },
  iniciando: { type: Boolean, default: false },
  guardandoCampo: { type: Boolean, default: false },
  tipoAmbiguoSinClasificar: { type: Boolean, default: false },
  // Los `id` deben ser únicos en la página: el panel prefija los suyos.
  idPrefijo: { type: String, default: '' },
  labelAsignado: { type: String, default: 'Asignado a' },
  atencionPrioridad: { type: String, default: '' },
  atencionNivel: { type: String, default: '' },
  atencionAsignado: { type: String, default: '' },
  atencionTipo: { type: String, default: '' },
});

const emit = defineEmits([
  'update:atencionPrioridad',
  'update:atencionNivel',
  'update:atencionAsignado',
  'update:atencionTipo',
  'cambiar-prioridad',
  'cambiar-nivel',
  'cambiar-asignado',
  'cambiar-tipo',
]);
</script>

<template>
  <!-- abierto: se guardan recién al iniciar la atención -->
  <template v-if="ticket.estado === 'abierto'">
    <CarbonCampo
      tipo="select"
      etiqueta="Prioridad"
      :model-value="atencionPrioridad"
      :deshabilitado="iniciando"
      @update:model-value="emit('update:atencionPrioridad', $event)"
    >
      <template #opciones>
        <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
      </template>
    </CarbonCampo>

    <CarbonCampo
      tipo="select"
      etiqueta="Nivel de atención"
      :model-value="atencionNivel"
      :deshabilitado="iniciando"
      @update:model-value="emit('update:atencionNivel', $event)"
    >
      <template #opciones>
        <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
      </template>
    </CarbonCampo>

    <CarbonCampo
      tipo="select"
      :etiqueta="labelAsignado"
      :model-value="atencionAsignado"
      :deshabilitado="iniciando"
      @update:model-value="emit('update:atencionAsignado', $event)"
    >
      <template #opciones>
        <option value="" disabled>Seleccionar</option>
        <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">
          {{ s.user_id === usuarioId ? `${s.nombre} (yo)` : s.nombre }}
        </option>
      </template>
    </CarbonCampo>

    <CarbonCampo
      tipo="select"
      etiqueta="Tipo"
      :model-value="atencionTipo"
      :ayuda="tipoAmbiguoSinClasificar ? 'Esta subcategoría no tiene un tipo por defecto (puede ser incidente o solicitud según el caso) — elígelo manualmente antes de iniciar.' : ''"
      :deshabilitado="iniciando"
      @update:model-value="emit('update:atencionTipo', $event)"
    >
      <template #opciones>
        <option value="" disabled>Seleccionar</option>
        <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
      </template>
    </CarbonCampo>
  </template>

  <!-- en curso: cada cambio se guarda al vuelo -->
  <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
    <CarbonCampo
      tipo="select"
      etiqueta="Prioridad"
      :model-value="ticket.prioridad"
      :deshabilitado="guardandoCampo"
      @update:model-value="emit('cambiar-prioridad', $event)"
    >
      <template #opciones>
        <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
      </template>
    </CarbonCampo>

    <CarbonCampo
      tipo="select"
      etiqueta="Nivel de atención"
      :model-value="ticket.nivel_atencion || ''"
      :deshabilitado="guardandoCampo"
      @update:model-value="emit('cambiar-nivel', $event)"
    >
      <template #opciones>
        <option value="" disabled>Sin definir</option>
        <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
      </template>
    </CarbonCampo>

    <!-- Sin v-model: el handler necesita el $event.target real (para
         revertir el <select> a mano si el usuario cancela desasignar, ver
         useTicketDetalleLogica.js) — @change llega al control real por
         $attrs igual que en el <select> nativo anterior. -->
    <CarbonCampo
      tipo="select"
      :etiqueta="labelAsignado"
      :model-value="ticket.asignado_a || ''"
      :deshabilitado="guardandoCampo"
      @change="emit('cambiar-asignado', $event.target.value, $event)"
    >
      <template #opciones>
        <option value="">Sin asignar</option>
        <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
      </template>
    </CarbonCampo>

    <CarbonCampo
      tipo="select"
      etiqueta="Tipo"
      :model-value="ticket.tipo"
      :deshabilitado="guardandoCampo"
      @update:model-value="emit('cambiar-tipo', $event)"
    >
      <template #opciones>
        <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
      </template>
    </CarbonCampo>
  </template>

  <!-- terminal: solo lectura -->
  <template v-if="ESTADOS_TERMINALES.includes(ticket.estado)">
    <p class="tk-detalle">
      Prioridad: {{ PRIORIDADES.find((p) => p.valor === ticket.prioridad)?.label || ticket.prioridad }}
    </p>
    <p class="tk-detalle">
      Nivel de atención:
      <TextoVacio :valor="NIVELES_ATENCION.find((n) => n.valor === ticket.nivel_atencion)?.label" placeholder="Sin definir" />
    </p>
    <p class="tk-detalle">
      {{ labelAsignado }}: <TextoVacio :valor="staffPorId[ticket.asignado_a]" placeholder="Sin asignar" />
    </p>
  </template>
</template>

