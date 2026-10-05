<script setup>
// Diálogos de las acciones sobre un equipo (entregar, devolver, mover,
// verificar y confirmar cambio de estado). El estado y los pasos viven en
// useEquiposAcciones.js; este componente solo los dibuja. Lo montan el listado
// (EquiposView) y la hoja de vida (EquipoDetalleView) con el MISMO objeto
// `acciones`, así que ambas pantallas hacen exactamente lo mismo.
//
// Todos sobre AppDialog (decisión del dueño, 2026-10-01): `@cerrado` en todo
// cierre, y Escape / X / fondo vetados mientras se registra.
import { ref } from 'vue';
import AppDialog from '../../components/ui/AppDialog.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import ConfirmDialog from '../../components/shared/ConfirmDialog.vue';
import BuscadorCombo from '../../components/shared/BuscadorCombo.vue';
import EquipoActaOfrecida from './EquipoActaOfrecida.vue';
import { MOTIVOS_DEVOLUCION } from './useEquiposAcciones.js';
import { nombreEquipo } from '../../core/dominio-equipos.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

const props = defineProps({
  // Objeto reactivo de useEquiposAcciones(). Se usa como `a` en la plantilla
  // (un alias local, no la prop): el objeto ES el estado compartido del
  // composable y los diálogos lo editan a propósito (v-model sobre `a.form`).
  acciones: { type: Object, required: true },
});
const a = props.acciones;

const dlg = ref(null);
const dlgConfirmacion = ref(null);
const infoError = infoNotificacion('error');

// Mientras se registra no se cierra por la X, Escape ni el fondo.
const sinProcesar = (a) => () => !a.procesando;
</script>

<template>
  <!-- ── Entregar ─────────────────────────────────────────────── -->
  <!-- :key — al pasar del formulario al "Ver acta" el diálogo se vuelve a montar:
       AppDialog lee sus slots al montar, y el pie con los botones del formulario
       ya no existe en el segundo estado (quedaría una franja vacía). -->
  <AppDialog
    v-if="a.dialogo === 'entregar'"
    :key="a.resultado ? 'resultado' : 'formulario'"
    ref="dlg"
    size="sm"
    :confirmar-cierre="sinProcesar(a)"
    :cerrar-en-backdrop="false"
    @cerrado="a.cerrar()"
  >
    <template #titulo>{{ a.resultado ? 'Equipo entregado' : 'Entregar' }} <AppCodigo v-if="!a.resultado" :valor="a.equipo?.codigo" titulo="Código de equipo" /></template>

    <EquipoActaOfrecida
      v-if="a.resultado"
      :resultado="a.resultado"
      :href="a.hrefActa"
      @cerrar="dlg?.cerrar()"
    />
    <div v-else class="space-y-4">
      <div class="rounded-md bg-gray-50 px-3 py-2.5 text-sm">
        <p class="truncate font-medium text-gray-900">{{ nombreEquipo(a.equipo) }}</p>
        <p class="text-xs tabular-nums text-gray-500"><AppCodigo :valor="a.equipo.codigo" titulo="Código de equipo" /><template v-if="a.equipo.serie"> · Serie {{ a.equipo.serie }}</template></p>
      </div>

      <div class="campo">
        <label class="campo__etiqueta" for="acc-empleado">Empleado<span aria-hidden="true"> *</span></label>
        <BuscadorCombo
          id="acc-empleado"
          v-model="a.form.empleadoId"
          :items="a.empleados"
          :campos-busqueda="['nombres', 'apellidos', 'dni']"
          :etiqueta="(e) => `${e.nombres} ${e.apellidos}`"
          :placeholder="a.cargandoEmpleados ? 'Cargando empleados...' : 'Buscar por nombre o DNI...'"
          :disabled="a.procesando || a.cargandoEmpleados"
        >
          <template #resultado="{ item }">
            <span>{{ item.nombres }} {{ item.apellidos }}</span>
            <span class="combo-sec tabular-nums">{{ item.dni }}</span>
          </template>
        </BuscadorCombo>
      </div>

      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-condicion-entrega">Condición de entrega</label>
        <div class="campo__caja">
          <input
            id="acc-condicion-entrega"
            v-model="a.form.condicion"
            class="campo__control"
            type="text"
            placeholder="ej: nuevo, con cargador y mochila"
            :disabled="a.procesando"
          >
        </div>
      </div>

      <div v-if="a.error" class="notif notif--danger notif--inline" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ a.error }}</p></div>
      </div>
    </div>

    <template v-if="!a.resultado" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="a.procesando" @click="dlg?.cerrar()" />
      <AppButton
        :label="a.procesando ? 'Entregando...' : 'Entregar'"
        :loading="a.procesando"
        :disabled="!a.form.empleadoId"
        @click="a.confirmarEntregar()"
      />
    </template>
  </AppDialog>

  <!-- ── Devolver ─────────────────────────────────────────────── -->
  <AppDialog
    v-else-if="a.dialogo === 'devolver'"
    :key="a.resultado ? 'resultado' : 'formulario'"
    ref="dlg"
    size="sm"
    :confirmar-cierre="sinProcesar(a)"
    :cerrar-en-backdrop="false"
    @cerrado="a.cerrar()"
  >
    <template #titulo>{{ a.resultado ? 'Equipo devuelto' : 'Devolución de' }} <AppCodigo v-if="!a.resultado" :valor="a.equipo?.codigo" titulo="Código de equipo" /></template>

    <EquipoActaOfrecida
      v-if="a.resultado"
      :resultado="a.resultado"
      :href="a.hrefActa"
      @cerrar="dlg?.cerrar()"
    />
    <div v-else class="space-y-4">
      <div class="rounded-md bg-gray-50 px-3 py-2.5 text-sm">
        <p class="text-xs text-gray-500">Lo tiene</p>
        <p class="truncate font-medium text-gray-900">{{ a.equipo.portador }}</p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-condicion-devolucion">Condición en que vuelve<span aria-hidden="true"> *</span></label>
        <div class="campo__caja">
          <input
            id="acc-condicion-devolucion"
            v-model="a.form.condicion"
            class="campo__control"
            type="text"
            required
            placeholder="ej: operativo / pantalla rota / sin cargador"
            :disabled="a.procesando"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-motivo">Motivo</label>
        <div class="campo__caja">
          <select
            id="acc-motivo"
            :value="a.form.motivo"
            class="campo__control campo__control--select"
            :disabled="a.procesando"
            @change="a.cambiarMotivo($event.target.value)"
          >
            <option v-for="m in MOTIVOS_DEVOLUCION" :key="m.valor" :value="m.valor">{{ m.label }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div>
        <label
          class="flex items-start gap-2.5 text-sm"
          :class="a.form.motivo === 'perdida' ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer text-gray-700'"
        >
          <input
            v-model="a.form.aReparacion"
            type="checkbox"
            class="mt-0.5 h-4 w-4 shrink-0 accent-primary-500"
            :disabled="a.procesando || a.form.motivo === 'perdida'"
          >
          Volvió dañado: enviarlo a reparación
        </label>
        <p v-if="a.form.motivo === 'perdida'" class="mt-1 pl-6.5 text-xs text-gray-500">
          No aplica si el equipo se reporta como perdido o robado.
        </p>
      </div>

      <div v-if="a.error" class="notif notif--danger notif--inline" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ a.error }}</p></div>
      </div>
    </div>

    <template v-if="!a.resultado" #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="a.procesando" @click="dlg?.cerrar()" />
      <AppButton
        :label="a.procesando ? 'Registrando...' : 'Registrar devolución'"
        :loading="a.procesando"
        :disabled="!a.form.condicion.trim()"
        @click="a.confirmarDevolver()"
      />
    </template>
  </AppDialog>

  <!-- ── Mover de ubicación ───────────────────────────────────── -->
  <AppDialog
    v-else-if="a.dialogo === 'mover'"
    ref="dlg"
    size="sm"
    :confirmar-cierre="sinProcesar(a)"
    :cerrar-en-backdrop="false"
    @cerrado="a.cerrar()"
  >
    <template #titulo>Mover <AppCodigo :valor="a.equipo?.codigo" titulo="Código de equipo" /></template>
    <div class="space-y-4">
      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-ubicacion">Ubicación</label>
        <div class="campo__caja">
          <select
            id="acc-ubicacion"
            v-model="a.form.ubicacionId"
            class="campo__control campo__control--select"
            :disabled="a.procesando || !!a.form.ubicacionNueva.trim()"
          >
            <option value="" disabled>Seleccionar ubicación</option>
            <option v-for="u in a.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>
      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-ubicacion-nueva">O crear una ubicación nueva</label>
        <div class="campo__caja">
          <input
            id="acc-ubicacion-nueva"
            v-model="a.form.ubicacionNueva"
            class="campo__control"
            type="text"
            placeholder="Nombre de la ubicación"
            :disabled="a.procesando"
          >
        </div>
      </div>
      <div v-if="a.error" class="notif notif--danger notif--inline" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ a.error }}</p></div>
      </div>
    </div>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="a.procesando" @click="dlg?.cerrar()" />
      <AppButton
        :label="a.procesando ? 'Moviendo...' : 'Mover'"
        :loading="a.procesando"
        :disabled="!a.form.ubicacionId && !a.form.ubicacionNueva.trim()"
        @click="a.confirmarMover()"
      />
    </template>
  </AppDialog>

  <!-- ── Verificar (conciliación física) ──────────────────────── -->
  <AppDialog
    v-else-if="a.dialogo === 'verificar'"
    ref="dlg"
    size="sm"
    :confirmar-cierre="sinProcesar(a)"
    :cerrar-en-backdrop="false"
    @cerrado="a.cerrar()"
  >
    <template #titulo>Verificar <AppCodigo :valor="a.equipo?.codigo" titulo="Código de equipo" /></template>
    <div class="space-y-4">
      <p class="text-sm text-gray-600">Deja constancia de que alguien vio el equipo, con su nombre y la fecha. No cambia dónde está ni quién lo tiene.</p>
      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-verif-ubicacion">Dónde se encontró (opcional)</label>
        <div class="campo__caja">
          <select
            id="acc-verif-ubicacion"
            v-model="a.form.ubicacionId"
            class="campo__control campo__control--select"
            :disabled="a.procesando"
          >
            <option value="">Sin indicar</option>
            <option v-for="u in a.ubicaciones" :key="u.id" :value="u.id">{{ u.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>
      <div class="campo" :class="{ 'campo--inerte': a.procesando }">
        <label class="campo__etiqueta" for="acc-verif-nota">Nota (opcional)</label>
        <div class="campo__caja">
          <input
            id="acc-verif-nota"
            v-model="a.form.nota"
            class="campo__control"
            type="text"
            maxlength="200"
            placeholder="ej: conforme, sin cargador"
            :disabled="a.procesando"
          >
        </div>
      </div>
      <div v-if="a.error" class="notif notif--danger notif--inline" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto"><p class="notif__detalle">{{ a.error }}</p></div>
      </div>
    </div>
    <template #acciones>
      <AppButton variant="outline" severity="secondary" label="Cancelar" :disabled="a.procesando" @click="dlg?.cerrar()" />
      <AppButton
        :label="a.procesando ? 'Registrando...' : 'Registrar verificación'"
        :loading="a.procesando"
        @click="a.confirmarVerificar()"
      />
    </template>
  </AppDialog>

  <!-- ── Confirmar cambio de estado ───────────────────────────── -->
  <ConfirmDialog
    v-if="a.confirmacion"
    ref="dlgConfirmacion"
    :destructivo="a.confirmacion.destructivo"
    icono="ti-trash"
    :titulo="a.confirmacion.titulo"
    :mensaje="a.confirmacion.mensaje"
    :confirmar-label="a.confirmacion.confirmarLabel"
    :cargando="a.procesando"
    @cerrado="a.confirmacion = null"
    @confirm="a.confirmarEstado(dlgConfirmacion)"
  />
</template>
