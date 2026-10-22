<script setup>
import { computed } from 'vue';
import {
  OPCIONES_PRIORIDAD as PRIORIDADES,
  OPCIONES_TIPO as TIPOS,
  NIVELES_ATENCION,
  ESTADOS_EN_CURSO,
  ESTADOS_TERMINALES,
} from '../../core/dominio-tickets.js';
import AppListaDatos from '../../components/ui/AppListaDatos.vue';
import AppButton from '../../components/ui/AppButton.vue';
import ReclasificarTicketDialog from './ReclasificarTicketDialog.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

// Campos de gestión de un ticket: arriba la categoría con «Reclasificar»
// (116/119: quien atiende corrige la categoría que eligió el solicitante; el
// estado y las acciones vienen de useTicketDetalleLogica en `reclasificacion`)
// y después prioridad, nivel de atención, responsable y tipo en las 3 formas
// que toman según el estado:
//   - abierto:  editables, todavía sin guardar — se aplican al iniciar la
//               atención (atencion-*, con v-model del contenedor).
//   - en curso: editables que guardan al vuelo (eventos cambiar-*).
//   - terminal: solo lectura.
// Compartido por TicketDetalleView.vue (página completa) y
// TicketDetallePanel.vue (split-view): hasta ago 2026 cada uno tenía su
// copia de estos 3 bloques, idénticos salvo el prefijo de los `id` y la
// etiqueta del responsable — y ya habían empezado a divergir.
const props = defineProps({
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
  // { puede, abriendo, ticket, catalogo, abrir(), alCerrar(resultado) } de
  // useTicketDetalleLogica (`puede`: módulo tickets; ticket terminado, JEFE).
  reclasificacion: { type: Object, default: null },
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

const clasificacion = computed(() => {
  const t = props.ticket;
  if (!t.categoria_nombre) return '';
  return t.subcategoria_nombre ? `${t.categoria_nombre} › ${t.subcategoria_nombre}` : t.categoria_nombre;
});

// Un useCampoAccesible por campo (no se reutiliza entre distintos <select>) —
// mismo criterio que useId() adentro de CarbonCampo.vue antes de retirarlo.
const campoPrioridadAbierto = useCampoAccesible();
const campoNivelAbierto = useCampoAccesible();
const campoAsignadoAbierto = useCampoAccesible();
const ayudaTipoAbierto = computed(() => (props.tipoAmbiguoSinClasificar
  ? 'Esta subcategoría no tiene un tipo por defecto (puede ser incidente o solicitud según el caso) — elíjalo manualmente antes de iniciar.'
  : ''));
const campoTipoAbierto = useCampoAccesible({ ayuda: () => ayudaTipoAbierto.value });
const campoPrioridadCurso = useCampoAccesible();
const campoNivelCurso = useCampoAccesible();
const campoAsignadoCurso = useCampoAccesible();
const campoTipoCurso = useCampoAccesible();

// Terminal: solo lectura, como pares etiqueta/valor (un vacío se ve como
// "Sin registrar" en gris, nunca un guion suelto).
const datosTerminal = computed(() => [
  { label: 'Prioridad', valor: PRIORIDADES.find((p) => p.valor === props.ticket.prioridad)?.label || props.ticket.prioridad || '' },
  { label: 'Nivel de atención', valor: NIVELES_ATENCION.find((n) => n.valor === props.ticket.nivel_atencion)?.label || '' },
  { label: props.labelAsignado, valor: props.staffPorId[props.ticket.asignado_a] || '' },
  { label: 'Tipo', valor: TIPOS.find((t) => t.valor === props.ticket.tipo)?.label || '' },
]);
</script>

<template>
  <div class="grid gap-3">
  <!-- categoría: en todos los estados; se cambia con un motivo (diálogo) -->
  <div class="flex items-start justify-between gap-3" data-clasificacion>
    <dl class="min-w-0 text-sm">
      <dt class="text-xs text-gray-500">Categoría</dt>
      <dd class="mt-0.5 break-words" :class="clasificacion ? 'text-gray-900' : 'text-gray-500'">{{ clasificacion || 'Sin categoría' }}</dd>
    </dl>
    <AppButton
      v-if="reclasificacion?.puede"
      class="-mr-2 shrink-0"
      size="sm"
      variant="text"
      severity="secondary"
      icon="ti ti-arrows-exchange"
      label="Reclasificar"
      title="Corregir la categoría del ticket: el motivo queda en el historial; el tipo y la prioridad no cambian"
      :loading="reclasificacion.abriendo"
      :disabled="guardandoCampo || iniciando"
      @click="reclasificacion.abrir()"
    />
  </div>
  <ReclasificarTicketDialog
    v-if="reclasificacion?.ticket"
    :ticket="reclasificacion.ticket"
    :categorias="reclasificacion.catalogo.categorias"
    :subcategorias="reclasificacion.catalogo.subcategorias"
    @cerrar="reclasificacion.alCerrar"
  />

  <!-- abierto: se guardan recién al iniciar la atención -->
  <template v-if="ticket.estado === 'abierto'">
    <div class="campo" :class="{ 'campo--inerte': iniciando }">
      <label class="campo__etiqueta" :for="campoPrioridadAbierto.id">Prioridad</label>
      <div class="campo__caja">
        <select
          :id="campoPrioridadAbierto.id"
          class="campo__control campo__control--select"
          :value="atencionPrioridad"
          :disabled="iniciando"
          :aria-invalid="campoPrioridadAbierto.invalido.value"
          :aria-describedby="campoPrioridadAbierto.describedBy.value"
          @change="emit('update:atencionPrioridad', $event.target.value)"
        >
          <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="{ 'campo--inerte': iniciando }">
      <label class="campo__etiqueta" :for="campoNivelAbierto.id">Nivel de atención</label>
      <div class="campo__caja">
        <select
          :id="campoNivelAbierto.id"
          class="campo__control campo__control--select"
          :value="atencionNivel"
          :disabled="iniciando"
          :aria-invalid="campoNivelAbierto.invalido.value"
          :aria-describedby="campoNivelAbierto.describedBy.value"
          @change="emit('update:atencionNivel', $event.target.value)"
        >
          <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="{ 'campo--inerte': iniciando }">
      <label class="campo__etiqueta" :for="campoAsignadoAbierto.id">{{ labelAsignado }}</label>
      <div class="campo__caja">
        <select
          :id="campoAsignadoAbierto.id"
          class="campo__control campo__control--select"
          :value="atencionAsignado"
          :disabled="iniciando"
          :aria-invalid="campoAsignadoAbierto.invalido.value"
          :aria-describedby="campoAsignadoAbierto.describedBy.value"
          @change="emit('update:atencionAsignado', $event.target.value)"
        >
          <option value="" disabled>Seleccionar</option>
          <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">
            {{ s.user_id === usuarioId ? `${s.nombre} (yo)` : s.nombre }}
          </option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="{ 'campo--inerte': iniciando }">
      <label class="campo__etiqueta" :for="campoTipoAbierto.id">Tipo</label>
      <div class="campo__caja">
        <select
          :id="campoTipoAbierto.id"
          class="campo__control campo__control--select"
          :value="atencionTipo"
          :disabled="iniciando"
          :aria-invalid="campoTipoAbierto.invalido.value"
          :aria-describedby="campoTipoAbierto.describedBy.value"
          @change="emit('update:atencionTipo', $event.target.value)"
        >
          <option value="" disabled>Seleccionar</option>
          <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
      <p
        v-if="ayudaTipoAbierto"
        :id="campoTipoAbierto.idAyuda"
        class="campo__pie"
      >{{ ayudaTipoAbierto }}</p>
    </div>
  </template>

  <!-- en curso: cada cambio se guarda al vuelo -->
  <template v-if="ESTADOS_EN_CURSO.includes(ticket.estado)">
    <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
      <label class="campo__etiqueta" :for="campoPrioridadCurso.id">Prioridad</label>
      <div class="campo__caja">
        <select
          :id="campoPrioridadCurso.id"
          class="campo__control campo__control--select"
          :value="ticket.prioridad"
          :disabled="guardandoCampo"
          :aria-invalid="campoPrioridadCurso.invalido.value"
          :aria-describedby="campoPrioridadCurso.describedBy.value"
          @change="emit('cambiar-prioridad', $event.target.value)"
        >
          <option v-for="p in PRIORIDADES" :key="p.valor" :value="p.valor">{{ p.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
      <label class="campo__etiqueta" :for="campoNivelCurso.id">Nivel de atención</label>
      <div class="campo__caja">
        <select
          :id="campoNivelCurso.id"
          class="campo__control campo__control--select"
          :value="ticket.nivel_atencion || ''"
          :disabled="guardandoCampo"
          :aria-invalid="campoNivelCurso.invalido.value"
          :aria-describedby="campoNivelCurso.describedBy.value"
          @change="emit('cambiar-nivel', $event.target.value)"
        >
          <option value="" disabled>Sin definir</option>
          <option v-for="n in NIVELES_ATENCION" :key="n.valor" :value="n.valor">{{ n.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <!-- Sin v-model: el handler necesita el $event.target real (para
         revertir el <select> a mano si el usuario cancela desasignar, ver
         useTicketDetalleLogica.js). -->
    <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
      <label class="campo__etiqueta" :for="campoAsignadoCurso.id">{{ labelAsignado }}</label>
      <div class="campo__caja">
        <select
          :id="campoAsignadoCurso.id"
          class="campo__control campo__control--select"
          :value="ticket.asignado_a || ''"
          :disabled="guardandoCampo"
          :aria-invalid="campoAsignadoCurso.invalido.value"
          :aria-describedby="campoAsignadoCurso.describedBy.value"
          @change="emit('cambiar-asignado', $event.target.value, $event)"
        >
          <option value="">Sin asignar</option>
          <option v-for="s in staffActivo" :key="s.user_id" :value="s.user_id">{{ s.nombre }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="{ 'campo--inerte': guardandoCampo }">
      <label class="campo__etiqueta" :for="campoTipoCurso.id">Tipo</label>
      <div class="campo__caja">
        <select
          :id="campoTipoCurso.id"
          class="campo__control campo__control--select"
          :value="ticket.tipo"
          :disabled="guardandoCampo"
          :aria-invalid="campoTipoCurso.invalido.value"
          :aria-describedby="campoTipoCurso.describedBy.value"
          @change="emit('cambiar-tipo', $event.target.value)"
        >
          <option v-for="t in TIPOS" :key="t.valor" :value="t.valor">{{ t.label }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>
  </template>

  <!-- terminal: solo lectura -->
  <AppListaDatos v-if="ESTADOS_TERMINALES.includes(ticket.estado)" :datos="datosTerminal" />
  </div>
</template>
