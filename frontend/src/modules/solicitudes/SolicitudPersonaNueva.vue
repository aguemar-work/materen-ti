<script setup>
// Datos de la persona que ingresa (solo en la solicitud de alta cuando todavía
// no está registrada): `crear_solicitud` la crea en la MISMA transacción que el
// trámite, así que no puede quedar una persona sin su alta ni un alta sin
// persona. Son los campos mínimos para empezar a trabajar; el resto (teléfono,
// correo personal, notas) se completa después con «Editar» en el expediente.
//
// Edita una copia local y avisa con `update:modelValue` (un `v-model` directo
// sobre el objeto del padre mutaría una prop).
import { reactive, ref, watch, onMounted } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { normalizarTelefono } from '../../core/formatters.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  deshabilitado: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const f = reactive({ ...props.modelValue });
watch(f, () => emit('update:modelValue', { ...f }), { deep: true });

const empresas = ref([]);
const areasObras = ref([]);
const ubicaciones = ref([]);
const cargando = ref(true);
const errorCatalogos = ref('');

const cNombres = useCampoAccesible();
const cApellidos = useCampoAccesible();
const cDni = useCampoAccesible();
const cEmpresa = useCampoAccesible();
const cCargo = useCampoAccesible();
const cArea = useCampoAccesible();
const cUbicacion = useCampoAccesible();
const cFecha = useCampoAccesible();
const cWhatsapp = useCampoAccesible();

onMounted(async () => {
  try {
    [empresas.value, areasObras.value, ubicaciones.value] = await Promise.all([
      insforgeApi.listEmpresas(),
      insforgeApi.listAreasObras(),
      insforgeApi.listUbicaciones(),
    ]);
  } catch (e) {
    errorCatalogos.value = traducirErrorDb(e, { porDefecto: 'No se pudieron cargar los catálogos.' }).mensaje;
  } finally {
    cargando.value = false;
  }
});

// Al salir del campo, el número queda en formato internacional (wa.me siempre funciona).
function normalizarWhatsapp() {
  f.whatsapp = normalizarTelefono(f.whatsapp) || '';
}

const inerte = (extra = false) => ({ 'campo--inerte': props.deshabilitado || extra });
</script>

<template>
  <fieldset class="form-grid" :disabled="deshabilitado" aria-label="Persona que ingresa">
    <div class="section-label !mt-0 !border-t-0 !pt-0 col-span-full">
      <i class="ti ti-id" aria-hidden="true"></i> Persona que ingresa
    </div>

    <p v-if="errorCatalogos" class="col-span-full text-sm text-red-700" role="alert">{{ errorCatalogos }}</p>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cNombres.id">Nombres<span aria-hidden="true"> *</span></label>
      <div class="campo__caja">
        <input :id="cNombres.id" v-model="f.nombres" class="campo__control" type="text" required autocomplete="off">
      </div>
    </div>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cApellidos.id">Apellidos<span aria-hidden="true"> *</span></label>
      <div class="campo__caja">
        <input :id="cApellidos.id" v-model="f.apellidos" class="campo__control" type="text" required autocomplete="off">
      </div>
    </div>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cDni.id">DNI<span aria-hidden="true"> *</span></label>
      <div class="campo__caja">
        <input
          :id="cDni.id"
          v-model="f.dni"
          class="campo__control tabular-nums"
          type="text"
          inputmode="numeric"
          maxlength="8"
          pattern="[0-9]{8}"
          required
          autocomplete="off"
        >
      </div>
    </div>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cFecha.id">Fecha de ingreso</label>
      <div class="campo__caja">
        <input :id="cFecha.id" v-model="f.fecha_alta" class="campo__control tabular-nums" type="date">
      </div>
    </div>

    <div class="campo" :class="inerte(cargando)">
      <label class="campo__etiqueta" :for="cEmpresa.id">Empresa<span aria-hidden="true"> *</span></label>
      <div class="campo__caja">
        <select :id="cEmpresa.id" v-model="f.empresa_id" class="campo__control campo__control--select" required :disabled="cargando">
          <option value="" disabled>Seleccionar empresa</option>
          <option v-for="e in empresas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cCargo.id">Cargo</label>
      <div class="campo__caja">
        <input :id="cCargo.id" v-model="f.cargo" class="campo__control" type="text" autocomplete="off">
      </div>
    </div>

    <div class="campo" :class="inerte(cargando)">
      <label class="campo__etiqueta" :for="cArea.id">Área/obra</label>
      <div class="campo__caja">
        <select :id="cArea.id" v-model="f.area_obra_id" class="campo__control campo__control--select" :disabled="cargando">
          <option value="">Sin asignar</option>
          <option v-for="a in areasObras" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="inerte(cargando)">
      <label class="campo__etiqueta" :for="cUbicacion.id">Ubicación</label>
      <div class="campo__caja">
        <select :id="cUbicacion.id" v-model="f.ubicacion_id" class="campo__control campo__control--select" :disabled="cargando">
          <option value="">Sin asignar</option>
          <option v-for="u in ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
        </select>
        <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
      </div>
    </div>

    <div class="campo" :class="inerte()">
      <label class="campo__etiqueta" :for="cWhatsapp.id">WhatsApp</label>
      <div class="campo__caja">
        <input
          :id="cWhatsapp.id"
          v-model="f.whatsapp"
          class="campo__control tabular-nums"
          type="text"
          inputmode="tel"
          placeholder="987 654 321"
          autocomplete="off"
          @blur="normalizarWhatsapp"
        >
      </div>
    </div>
  </fieldset>
</template>
