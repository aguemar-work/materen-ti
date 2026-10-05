<script setup>
// Página PÚBLICA (sin sesión): formulario de creación de ticket.
// Siempre se pide el DNI para intentar el match automático (un correo
// puede repetirse entre empleados o una persona tener varios, el DNI no —
// si no hay match, el ticket se crea igual, sin bloquear).
//
// Antes existía una segunda ruta de entrada (?entrega=<token>, llegando
// desde /entrega/:token) que autoidentificaba al empleado sin pedir DNI,
// reutilizando el token de entrega de credenciales ya consumido. Se
// retiró (2026-08-17, verificación de auditoría externa): ese token
// quedaba en la URL/historial del navegador con un propósito distinto al
// que lo generó. functions/tickets.ts sigue aceptando `tokenEntrega` en
// el body por compatibilidad, pero este formulario ya no lo envía.
import { ref, computed, onMounted } from 'vue';
import { catalogoTickets, crearTicket, MENSAJES_ERROR_TICKETS } from '../../api/ticketsPublicos.js';
import { comprimirImagen, archivoABase64 } from '../../core/imagenes.js';
import { esDniValido } from '../../core/utils.js';
import { resolverAvisoCategoria } from '../../core/dominio-tickets.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';
import AvisoCategoria from './AvisoCategoria.vue';
import { useCampoAccesible } from '../../composables/useCampoAccesible.js';
import { infoNotificacion } from '../../core/notificacionInfo.js';

// estado: 'cargando_catalogo' | 'formulario' | 'enviando' | 'confirmacion' | 'error_catalogo'
const estado = ref('cargando_catalogo');
const error = ref('');

const categorias = ref([]);
const subcategorias = ref([]);

const form = ref({
  contacto: '',
  categoriaId: '',
  subcategoriaId: '',
  titulo: '',
  descripcion: '',
});

// Identificación SOLO por DNI (igual que TicketBuscarView): un correo puede
// repetirse entre empleados o una persona tener varios, el DNI no.
const dniTocado = ref(false);
const dniValido = computed(() => esDniValido(form.value.contacto));
const errorDni = computed(() =>
  dniTocado.value && !dniValido.value ? MENSAJES_ERROR_TICKETS.dni_invalido : ''
);
function onDniInput(valor) {
  form.value.contacto = valor.replace(/\D/g, '').slice(0, 8);
}

const subcategoriasFiltradas = computed(() =>
  subcategorias.value.filter((s) => s.categoria_id === form.value.categoriaId)
);

// Cambiar de categoría descarta la subcategoría elegida: la anterior ya no
// está en la lista y, si quedara, su aviso (abajo) seguiría mostrándose.
function elegirCategoria(id) {
  form.value.categoriaId = id;
  form.value.subcategoriaId = '';
}

// Aviso fijo de la categoría/subcategoría (migración 114): gana el de la
// subcategoría. Vacío = nada que mostrar.
const avisoCategoria = computed(() => resolverAvisoCategoria(
  categorias.value.find((c) => c.id === form.value.categoriaId),
  subcategoriasFiltradas.value.find((s) => s.id === form.value.subcategoriaId),
));

const archivo = ref(null);
const previewUrl = ref('');
const inputArchivo = ref(null);

const resultado = ref(null); // { codigo, token, vinculado }

const campoDni = useCampoAccesible({ error: () => errorDni.value });
const campoCategoria = useCampoAccesible();
const campoSubcategoria = useCampoAccesible();
const campoTitulo = useCampoAccesible();
const campoDescripcion = useCampoAccesible();
const infoError = infoNotificacion('error');

async function onArchivoSeleccionado(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    archivo.value = await comprimirImagen(file);
    previewUrl.value = URL.createObjectURL(archivo.value);
  } catch {
    error.value = 'No se pudo procesar la imagen. Intente con otra captura.';
  }
}

function quitarArchivo() {
  archivo.value = null;
  previewUrl.value = '';
}

async function enviar() {
  error.value = '';
  if (!form.value.categoriaId) {
    error.value = 'Seleccione el tipo de solicitud';
    return;
  }
  if (!dniValido.value) {
    dniTocado.value = true;
    error.value = MENSAJES_ERROR_TICKETS.dni_invalido;
    return;
  }
  estado.value = 'enviando';
  try {
    let adjunto = null;
    if (archivo.value) {
      adjunto = {
        nombre: archivo.value.name,
        tipo: archivo.value.type,
        contenidoBase64: await archivoABase64(archivo.value),
      };
    }
    resultado.value = await crearTicket({
      titulo: form.value.titulo.trim(),
      descripcion: form.value.descripcion.trim(),
      categoriaId: form.value.categoriaId,
      subcategoriaId: form.value.subcategoriaId || null,
      contacto: form.value.contacto.trim(),
      adjunto,
    });
    estado.value = 'confirmacion';
  } catch (e) {
    error.value = e?.message || 'No se pudo registrar la solicitud';
    estado.value = 'formulario';
  }
}

async function cargarCatalogo() {
  estado.value = 'cargando_catalogo';
  try {
    const catalogo = await catalogoTickets();
    categorias.value = catalogo.categorias;
    subcategorias.value = catalogo.subcategorias;
    estado.value = 'formulario';
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar el formulario';
    estado.value = 'error_catalogo';
  }
}

onMounted(cargarCatalogo);

// ── Solo presentación (rediseño 2026-09-24, receta 4.5) ──────────────────
// Controles del portal: 44px de alto (objetivo táctil) y 16px en móvil para
// que iOS no haga zoom al enfocar.
const CLASE_CONTROL = 'campo__control h-11 text-base sm:text-sm';

const encabezado = computed(() => {
  if (estado.value === 'error_catalogo') {
    return { titulo: 'No se pudo cargar el formulario', icono: 'ti ti-plug-connected-x', tono: 'neutral' };
  }
  if (estado.value === 'confirmacion') {
    return { titulo: 'Solicitud registrada', icono: 'ti ti-circle-check', tono: 'success' };
  }
  return {
    titulo: 'Nuevo ticket',
    icono: '',
    tono: 'neutral',
    descripcion: 'Complete los datos para registrar su solicitud de soporte.',
  };
});
</script>

<template>
  <AppPortal
    seccion="Soporte técnico"
    :titulo="encabezado.titulo"
    :descripcion="encabezado.descripcion || ''"
    :icono="encabezado.icono"
    :tono="encabezado.tono"
  >
    <p v-if="estado === 'cargando_catalogo'" class="py-4 text-center text-sm text-gray-500" role="status">
      Cargando formulario...
    </p>

    <template v-else-if="estado === 'error_catalogo'">
      <p class="text-center text-sm text-gray-600">{{ error }}</p>
      <AppButton
        class="mt-6"
        size="lg"
        block
        label="Reintentar"
        icon="ti ti-refresh"
        icon-pos="right"
        @click="cargarCatalogo"
      />
    </template>

    <form v-else-if="estado === 'formulario' || estado === 'enviando'" class="flex flex-col gap-5" @submit.prevent="enviar">
      <div class="campo" :class="{ 'campo--invalido': campoDni.invalido.value, 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoDni.id">
          DNI<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <input
            :id="campoDni.id"
            :class="[CLASE_CONTROL, 'tabular-nums']"
            type="text"
            :value="form.contacto"
            inputmode="numeric"
            maxlength="8"
            placeholder="8 dígitos"
            required
            :disabled="estado === 'enviando'"
            :aria-invalid="campoDni.invalido.value"
            :aria-describedby="campoDni.describedBy.value"
            @input="onDniInput($event.target.value)"
            @blur="dniTocado = true"
          >
          <i v-if="campoDni.invalido.value" class="ti ti-alert-circle campo__adorno campo__adorno--error" aria-hidden="true"></i>
        </div>
        <p
          v-if="errorDni"
          :id="campoDni.idAyuda"
          class="campo__pie campo__pie--error"
          role="alert"
        >{{ errorDni }}</p>
      </div>

      <div class="campo" :class="{ 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoCategoria.id">
          Tipo de solicitud<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <select
            :id="campoCategoria.id"
            :class="[CLASE_CONTROL, 'campo__control--select']"
            :value="form.categoriaId"
            required
            :disabled="estado === 'enviando'"
            @change="elegirCategoria($event.target.value)"
          >
            <option value="" disabled>Seleccionar</option>
            <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <div v-if="subcategoriasFiltradas.length" class="campo" :class="{ 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoSubcategoria.id">Subcategoría</label>
        <div class="campo__caja">
          <select
            :id="campoSubcategoria.id"
            :class="[CLASE_CONTROL, 'campo__control--select']"
            :value="form.subcategoriaId"
            :disabled="estado === 'enviando'"
            @change="form.subcategoriaId = $event.target.value"
          >
            <option value="">Seleccionar (opcional)</option>
            <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
          </select>
          <i class="ti ti-chevron-down campo__adorno" aria-hidden="true"></i>
        </div>
      </div>

      <!-- Aviso fijo de la categoría/subcategoría elegida (114). Sin transición:
           el portal no tiene un patrón de entrada/salida permitido para esto. -->
      <AvisoCategoria v-if="avisoCategoria" :texto="avisoCategoria" />

      <div class="campo" :class="{ 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoTitulo.id">
          Resumen breve<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <input
            :id="campoTitulo.id"
            v-model="form.titulo"
            :class="CLASE_CONTROL"
            type="text"
            maxlength="200"
            placeholder="Ej.: sin acceso al correo institucional"
            required
            :disabled="estado === 'enviando'"
          >
        </div>
      </div>

      <div class="campo" :class="{ 'campo--inerte': estado === 'enviando' }">
        <label class="campo__etiqueta" :for="campoDescripcion.id">
          Detalle de la solicitud<span aria-hidden="true"> *</span>
        </label>
        <div class="campo__caja">
          <textarea
            :id="campoDescripcion.id"
            v-model="form.descripcion"
            class="campo__control campo__control--area text-base sm:text-sm"
            :rows="4"
            maxlength="5000"
            placeholder="Indique el problema, fecha de inicio y detalles relevantes"
            required
            :disabled="estado === 'enviando'"
          ></textarea>
        </div>
      </div>

      <!-- Adjunto: el <input type=file> real queda oculto; el botón lo abre. -->
      <div class="campo">
        <span id="ticket-adjunto-etiqueta" class="campo__etiqueta">Captura de pantalla (opcional)</span>
        <div v-if="!archivo">
          <AppButton
            variant="outline"
            severity="secondary"
            icon="ti ti-camera-plus"
            label="Adjuntar captura"
            aria-describedby="ticket-adjunto-etiqueta"
            :disabled="estado === 'enviando'"
            @click="inputArchivo?.click()"
          />
        </div>
        <div v-else class="flex items-center gap-3 rounded-md border border-gray-200 p-2">
          <img :src="previewUrl" alt="Captura adjunta" class="h-20 w-auto max-w-[60%] rounded object-contain">
          <span class="min-w-0 flex-1 truncate text-sm text-gray-600">{{ archivo.name }}</span>
          <AppButton
            class="w-10 shrink-0 px-0"
            variant="text"
            severity="secondary"
            icon="ti ti-x"
            title="Quitar"
            aria-label="Quitar la captura adjunta"
            :disabled="estado === 'enviando'"
            @click="quitarArchivo"
          />
        </div>
        <input
          ref="inputArchivo"
          class="hidden"
          type="file"
          accept="image/*"
          aria-labelledby="ticket-adjunto-etiqueta"
          @change="onArchivoSeleccionado"
        >
      </div>

      <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
        <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
        <div class="notif__texto">
          <p class="notif__detalle">{{ error }}</p>
        </div>
      </div>

      <AppButton
        type="submit"
        size="lg"
        block
        :label="estado === 'enviando' ? 'Enviando...' : 'Enviar solicitud'"
        :loading="estado === 'enviando'"
        :disabled="!dniValido"
      />
    </form>

    <template v-else-if="estado === 'confirmacion'">
      <p class="text-center text-sm text-gray-600">Código de seguimiento</p>
      <p class="mt-1 text-center font-mono text-2xl font-semibold tracking-tight text-gray-900 tabular-nums">
        {{ resultado.codigo }}
      </p>
      <AppButton
        class="mt-6"
        size="lg"
        block
        label="Ver seguimiento"
        icon="ti ti-arrow-right"
        icon-pos="right"
        :to="{ name: 'ticket-seguimiento', params: { token: resultado.token } }"
      />
      <p class="mt-4 text-center text-sm text-gray-500">
        Si el enlace se pierde, el ticket puede
        <RouterLink
          class="text-primary-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          :to="{ name: 'ticket-buscar' }"
        >recuperarse con el DNI</RouterLink>.
      </p>
    </template>

    <template #pie>
      <AppButton
        variant="text"
        severity="secondary"
        icon="ti ti-arrow-left"
        label="Volver a soporte"
        to="/soporte"
      />
    </template>
  </AppPortal>
</template>
