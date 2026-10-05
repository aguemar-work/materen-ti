<script setup>
// Catálogo de servicios de TI (migración 107): hasta 15 (Correo, Bitrix24, VPN,
// ERP, red, equipos...). Cada servicio tiene criticidad, un dueño del staff
// (opcional) y un horario en texto corto. Lo referencian los cambios, las
// categorías de ticket, las plataformas, las licencias y los tipos de equipo.
//
// Lo lee cualquier staff; solo un JEFE lo edita (RLS de `servicios`): quien no es
// jefe no ve las acciones. El tope de 15 y el nombre único los impone la base.
import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useServiciosStore } from '../../stores/catalogos.js';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb, anotarErrorDb } from '../../api/erroresDb.js';
import { showToast } from '../../core/toast.js';
import { slugDe } from '../../core/utils.js';
import { MAX_SERVICIOS, OPCIONES_CRITICIDAD_SERVICIO } from '../../core/dominio-cambios.js';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';
import BadgeEstado from '../../components/shared/BadgeEstado.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import MenuAcciones from '../../components/shared/MenuAcciones.vue';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppVacio from '../../components/ui/AppVacio.vue';
import EncabezadoCatalogo from './EncabezadoCatalogo.vue';

const store = useServiciosStore();
const auth = useAuthStore();
const { lista, cargando } = storeToRefs(store);

const esJefe = computed(() => auth.esJefe);
const lleno = computed(() => lista.value.length >= MAX_SERVICIOS);
const staff = ref([]);
const nombreDueno = (id) => staff.value.find((s) => s.user_id === id)?.nombre || '';

// ── Formulario ──────────────────────────────────────────────────────────
const vacio = () => ({ nombre: '', descripcion: '', criticidad: 'media', dueno_user_id: '', horario: '' });
const mostrarForm = ref(false);
const editar = ref(null);
const form = ref(vacio());
const guardando = ref(false);
const errorForm = ref('');
const modalForm = ref(null);
const infoError = infoNotificacion('error');
const cNombre = useCampoAccesible();
const cDescripcion = useCampoAccesible();
const cCriticidad = useCampoAccesible();
const cDueno = useCampoAccesible();
const cHorario = useCampoAccesible();

function abrirNuevo() {
  editar.value = null;
  form.value = vacio();
  errorForm.value = '';
  mostrarForm.value = true;
}

function abrirEditar(servicio) {
  editar.value = servicio;
  form.value = {
    nombre: servicio.nombre,
    descripcion: servicio.descripcion || '',
    criticidad: servicio.criticidad,
    dueno_user_id: servicio.dueno_user_id || '',
    horario: servicio.horario || '',
  };
  errorForm.value = '';
  mostrarForm.value = true;
}

// El identificador es un slug del nombre; si ese slug lo ocupa un servicio ya dado
// de baja (la fila sigue en la base), se reintenta con un sufijo.
async function crearConId(datos) {
  const base = slugDe(datos.nombre).slice(0, 34) || 'servicio';
  try {
    return await store.crear({ ...datos, id: base.length < 2 ? `${base}_s` : base });
  } catch (e) {
    if (anotarErrorDb(e, { entidad: 'servicio' }).restriccion !== 'servicios_pkey') throw e;
    return store.crear({ ...datos, id: `${base}_${Date.now().toString(36).slice(-5)}` });
  }
}

async function guardar() {
  errorForm.value = '';
  guardando.value = true;
  try {
    if (editar.value) {
      await store.actualizar(editar.value.id, form.value);
      showToast('Servicio actualizado');
    } else {
      await crearConId(form.value);
      showToast('Servicio creado');
    }
    modalForm.value?.cerrar();
  } catch (e) {
    errorForm.value = traducirErrorDb(e, { entidad: 'servicio', porDefecto: 'No se pudo guardar el servicio.' }).mensaje;
  } finally {
    guardando.value = false;
  }
}

// ── Eliminar (baja lógica) ──────────────────────────────────────────────
const porEliminar = ref(null);
const eliminando = ref(false);
const dialogoEliminar = ref(null);

async function confirmarEliminar() {
  const servicio = porEliminar.value;
  if (!servicio) return;
  eliminando.value = true;
  try {
    await store.softDelete(servicio.id);
    showToast('Servicio eliminado');
    dialogoEliminar.value?.cerrar();
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'servicio', porDefecto: 'No se pudo eliminar el servicio.' }).mensaje, 'error');
  } finally {
    eliminando.value = false;
  }
}

const accionesDe = (servicio) => [
  { icono: 'ti-pencil', label: 'Editar', onClick: () => abrirEditar(servicio) },
  { icono: 'ti-trash', label: 'Eliminar', danger: true, onClick: () => { porEliminar.value = servicio; } },
];

onMounted(async () => {
  insforgeApi.nombresStaff().then((l) => { staff.value = l; }).catch(() => {});
  try {
    await store.cargar();
  } catch (e) {
    showToast(traducirErrorDb(e, { entidad: 'servicio', porDefecto: 'Error al cargar los servicios.' }).mensaje, 'error');
  }
});
</script>

<template>
  <div class="space-y-4">
    <EncabezadoCatalogo
      titulo="Servicios"
      :conteo="`${lista.length} de ${MAX_SERVICIOS}`"
      descripcion="Los servicios de TI que la empresa usa. Los cambios, las categorías de tickets, las plataformas, las licencias y los tipos de equipo pueden apuntar a uno."
    >
      <template v-if="esJefe" #acciones>
        <AppButton icon="ti ti-plus" label="Nuevo servicio" :disabled="lleno" :title="lleno ? `El catálogo admite como máximo ${MAX_SERVICIOS} servicios` : undefined" @click="abrirNuevo" />
      </template>
    </EncabezadoCatalogo>

    <p v-if="!esJefe" class="text-sm text-gray-500" data-solo-jefe>Solo un jefe puede crear, editar o eliminar servicios.</p>
    <p v-else-if="lleno" class="text-sm text-gray-500" data-tope>El catálogo está completo ({{ MAX_SERVICIOS }} servicios). Elimine uno que ya no use para agregar otro.</p>

    <p v-if="cargando && !lista.length" class="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-500" role="status">Cargando servicios...</p>

    <AppVacio
      v-else-if="!lista.length"
      icono="ti ti-server-cog"
      titulo="Sin servicios todavía"
      mensaje="Cree los servicios que TI sostiene: correo, red, ERP..."
    >
      <AppButton v-if="esJefe" variant="outline" severity="secondary" icon="ti ti-plus" label="Agregar servicio" @click="abrirNuevo" />
    </AppVacio>

    <ul v-else class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" aria-label="Servicios de TI">
      <li v-for="s in lista" :key="s.id" class="flex items-start gap-3 px-4 py-3" data-servicio>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium text-gray-900">{{ s.nombre }}</span>
            <BadgeEstado tipo="criticidad_servicio" :valor="s.criticidad" />
          </div>
          <p v-if="s.descripcion" class="mt-0.5 text-sm text-gray-600 [overflow-wrap:anywhere]">{{ s.descripcion }}</p>
          <p class="mt-0.5 text-xs text-gray-500">
            Dueño: {{ nombreDueno(s.dueno_user_id) || 'Sin asignar' }} · Horario: {{ s.horario || 'Sin registrar' }}
          </p>
        </div>
        <MenuAcciones v-if="esJefe" :acciones="accionesDe(s)" :label="`Acciones de ${s.nombre}`" />
      </li>
    </ul>

    <!-- Formulario (AppDialog compartido) -->
    <AppDialog
      v-if="mostrarForm"
      ref="modalForm"
      :titulo="editar ? `Editar “${editar.nombre}”` : 'Nuevo servicio'"
      size="sm"
      @cerrado="mostrarForm = false"
    >
      <form id="servicio-form" class="space-y-4" @submit.prevent="guardar">
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cNombre.id">Nombre<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <input :id="cNombre.id" v-model="form.nombre" class="campo__control" type="text" maxlength="60" placeholder="ej: Correo corporativo" required :disabled="guardando">
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cDescripcion.id">Descripción</label>
          <div class="campo__caja">
            <textarea :id="cDescripcion.id" v-model="form.descripcion" class="campo__control campo__control--area" rows="2" maxlength="300" placeholder="Qué incluye el servicio" :disabled="guardando"></textarea>
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cCriticidad.id">Criticidad<span aria-hidden="true"> *</span></label>
          <div class="campo__caja">
            <select :id="cCriticidad.id" v-model="form.criticidad" class="campo__control campo__control--select" required :disabled="guardando">
              <option v-for="op in OPCIONES_CRITICIDAD_SERVICIO" :key="op.valor" :value="op.valor">{{ op.label }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cDueno.id">Dueño</label>
          <div class="campo__caja">
            <select :id="cDueno.id" v-model="form.dueno_user_id" class="campo__control campo__control--select" :disabled="guardando">
              <option value="">Sin asignar</option>
              <option v-for="p in staff" :key="p.user_id" :value="p.user_id">{{ p.nombre }}</option>
            </select>
            <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
          </div>
        </div>
        <div class="campo" :class="{ 'campo--inerte': guardando }">
          <label class="campo__etiqueta" :for="cHorario.id">Horario de atención</label>
          <div class="campo__caja">
            <input :id="cHorario.id" v-model="form.horario" class="campo__control" type="text" maxlength="60" placeholder="ej: 24 x 7, o Lunes a sábado 8:00 a 18:00" :disabled="guardando">
          </div>
        </div>
        <div v-if="errorForm" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
          <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
          <div class="notif__texto"><p class="notif__detalle">{{ errorForm }}</p></div>
        </div>
      </form>
      <template #acciones>
        <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="guardando" @click="modalForm?.cerrar()" />
        <AppButton type="submit" form="servicio-form" :label="guardando ? 'Guardando...' : 'Guardar'" :loading="guardando" />
      </template>
    </AppDialog>

    <!-- Confirmación destructiva (ConfirmDialog compartido) -->
    <ConfirmDialog
      v-if="porEliminar"
      ref="dialogoEliminar"
      destructivo
      icono="ti-trash"
      titulo="Eliminar servicio"
      :mensaje="`¿Eliminar el servicio “${porEliminar.nombre}”? Los cambios y catálogos que lo usan conservan su historial.`"
      confirmar-label="Eliminar"
      :cargando="eliminando"
      @cerrado="porEliminar = null"
      @confirm="confirmarEliminar"
    />
  </div>
</template>
