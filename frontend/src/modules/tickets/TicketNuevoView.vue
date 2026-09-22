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
import PublicBrand from '../../components/shared/PublicBrand.vue';
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
    error.value = 'No se pudo procesar la imagen. Intenta con otra captura.';
  }
}

function quitarArchivo() {
  archivo.value = null;
  previewUrl.value = '';
}

async function enviar() {
  error.value = '';
  if (!form.value.categoriaId) {
    error.value = 'Selecciona el tipo de solicitud';
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
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Soporte técnico" />

      <template v-if="estado === 'cargando_catalogo'">
        <p class="ticket-texto">Cargando formulario...</p>
      </template>

      <template v-else-if="estado === 'error_catalogo'">
        <div class="ticket-error-icon"><i class="ti ti-plug-connected-x" aria-hidden="true"></i></div>
        <h2 class="ticket-title">No se pudo cargar el formulario</h2>
        <p class="ticket-texto">{{ error }}</p>
        <button type="button" class="btn btn--primary btn--ancho ticket-submit" @click="cargarCatalogo">
          Reintentar
          <i class="ti ti-refresh" aria-hidden="true"></i>
        </button>
      </template>

      <template v-else-if="estado === 'formulario' || estado === 'enviando'">
        <h2 class="ticket-title">Nuevo ticket</h2>

        <form class="ticket-form" @submit.prevent="enviar">
          <div class="campo" :class="{ 'campo--invalido': campoDni.invalido.value, 'campo--inerte': estado === 'enviando' }">
            <label class="campo__etiqueta" :for="campoDni.id">
              DNI<span aria-hidden="true"> *</span>
            </label>
            <div class="campo__caja">
              <input
                :id="campoDni.id"
                class="campo__control"
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
              <i v-if="campoDni.invalido.value" class="ti ti-alert-circle-filled campo__adorno" aria-hidden="true"></i>
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
                class="campo__control campo__control--select"
                :value="form.categoriaId"
                required
                :disabled="estado === 'enviando'"
                @change="form.categoriaId = $event.target.value"
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
                class="campo__control campo__control--select"
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

          <div class="campo" :class="{ 'campo--inerte': estado === 'enviando' }">
            <label class="campo__etiqueta" :for="campoTitulo.id">
              Resumen breve<span aria-hidden="true"> *</span>
            </label>
            <div class="campo__caja">
              <input
                :id="campoTitulo.id"
                v-model="form.titulo"
                class="campo__control"
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
                class="campo__control campo__control--area"
                :rows="4"
                maxlength="5000"
                placeholder="Indique el problema, fecha de inicio y detalles relevantes"
                required
                :disabled="estado === 'enviando'"
              ></textarea>
            </div>
          </div>

          <div class="form-group full">
            <label>Captura de pantalla (opcional)</label>
            <div v-if="!archivo" class="ticket-adjuntar">
              <button type="button" class="btn btn--secondary" :disabled="estado === 'enviando'" @click="inputArchivo?.click()">
                Adjuntar captura
                <i class="ti ti-camera-plus" aria-hidden="true"></i>
              </button>
            </div>
            <div v-else class="ticket-preview">
              <img :src="previewUrl" alt="Captura adjunta">
              <button type="button" class="icon-btn" title="Quitar" aria-label="Quitar la captura adjunta" :disabled="estado === 'enviando'" @click="quitarArchivo">
                <i class="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
            <input ref="inputArchivo" type="file" accept="image/*" style="display: none" @change="onArchivoSeleccionado">
          </div>

          <div v-if="error" class="notif" :class="[`notif--${infoError.rol}`, 'notif--inline']" :role="infoError.rolAria">
            <i class="ti" :class="infoError.icono" aria-hidden="true"></i>
            <div class="notif__texto">
              <p class="notif__detalle">{{ error }}</p>
            </div>
          </div>

          <button type="submit" class="btn btn--primary btn--ancho ticket-submit" :disabled="estado === 'enviando' || !dniValido">
            {{ estado === 'enviando' ? 'Enviando...' : 'Enviar solicitud' }}
            <i v-if="estado === 'enviando'" class="ti ti-loader-2" aria-hidden="true"></i>
          </button>
        </form>
      </template>

      <template v-else-if="estado === 'confirmacion'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check" aria-hidden="true"></i></div>
        <h2 class="ticket-title">Solicitud registrada</h2>
        <p class="ticket-texto">
          Código: <strong>{{ resultado.codigo }}</strong>
        </p>
        <RouterLink class="ticket-link" :to="{ name: 'ticket-seguimiento', params: { token: resultado.token } }">
          Ver seguimiento
        </RouterLink>
        <p class="ticket-texto ticket-nota">
          Si el enlace se pierde, el ticket puede <RouterLink :to="{ name: 'ticket-buscar' }">recuperarse con el DNI</RouterLink>.
        </p>
      </template>

      <RouterLink class="public-volver" to="/soporte">
        <i class="ti ti-arrow-left" aria-hidden="true"></i> Volver a soporte
      </RouterLink>
    </div>
  </div>
</template>


