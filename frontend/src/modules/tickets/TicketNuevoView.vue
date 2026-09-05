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
import CarbonButton from '../../components/carbon/CarbonButton.vue';
import CarbonCampo from '../../components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../components/carbon/CarbonNotification.vue';

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
        <CarbonButton variante="primary" ancho icono="ti-refresh" class="ticket-submit" @click="cargarCatalogo">Reintentar</CarbonButton>
      </template>

      <template v-else-if="estado === 'formulario' || estado === 'enviando'">
        <h2 class="ticket-title">Nuevo ticket</h2>

        <form class="ticket-form" @submit.prevent="enviar">
          <CarbonCampo
            :model-value="form.contacto"
            etiqueta="DNI"
            requerido
            inputmode="numeric"
            maxlength="8"
            placeholder="8 dígitos"
            :deshabilitado="estado === 'enviando'"
            :error="errorDni"
            @update:model-value="onDniInput"
            @blur="dniTocado = true"
          />

          <CarbonCampo
            v-model="form.categoriaId"
            etiqueta="Tipo de solicitud"
            tipo="select"
            requerido
            :deshabilitado="estado === 'enviando'"
          >
            <template #opciones>
              <option value="" disabled>Seleccionar</option>
              <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </template>
          </CarbonCampo>

          <CarbonCampo
            v-if="subcategoriasFiltradas.length"
            v-model="form.subcategoriaId"
            etiqueta="Subcategoría"
            tipo="select"
            :deshabilitado="estado === 'enviando'"
          >
            <template #opciones>
              <option value="">Seleccionar (opcional)</option>
              <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
            </template>
          </CarbonCampo>

          <CarbonCampo
            v-model="form.titulo"
            etiqueta="Resumen breve"
            requerido
            maxlength="200"
            placeholder="Ej.: sin acceso al correo institucional"
            :deshabilitado="estado === 'enviando'"
          />

          <CarbonCampo
            v-model="form.descripcion"
            etiqueta="Detalle de la solicitud"
            tipo="textarea"
            :filas="4"
            requerido
            maxlength="5000"
            placeholder="Indique el problema, fecha de inicio y detalles relevantes"
            :deshabilitado="estado === 'enviando'"
          />

          <div class="form-group full">
            <label>Captura de pantalla (opcional)</label>
            <div v-if="!archivo" class="ticket-adjuntar">
              <CarbonButton variante="secondary" icono="ti-camera-plus" :deshabilitado="estado === 'enviando'" @click="inputArchivo?.click()">Adjuntar captura</CarbonButton>
            </div>
            <div v-else class="ticket-preview">
              <img :src="previewUrl" alt="Captura adjunta">
              <button type="button" class="icon-btn" title="Quitar" aria-label="Quitar la captura adjunta" :disabled="estado === 'enviando'" @click="quitarArchivo">
                <i class="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
            <input ref="inputArchivo" type="file" accept="image/*" style="display: none" @change="onArchivoSeleccionado">
          </div>

          <CarbonNotification v-if="error" tipo="error">{{ error }}</CarbonNotification>

          <CarbonButton variante="primary" ancho tipo="submit" class="ticket-submit" :cargando="estado === 'enviando'" :deshabilitado="!dniValido">
            {{ estado === 'enviando' ? 'Enviando...' : 'Enviar solicitud' }}
          </CarbonButton>
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

<style scoped>
.ticket-title {
  font-size: var(--fs-heading-02);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-body-01);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ticket-adjuntar { display: flex; }

.ticket-preview {
  position: relative;
  width: 96px;
  height: 96px;
}

.ticket-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-base);
  border: 1px solid var(--color-border);
}

.ticket-preview .icon-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-radius: 50%;
  width: 22px;
  height: 22px;
}

.ticket-submit {
  margin-top: 4px;
}

.ticket-ok-icon {
  font-size: var(--icon-lg);
  color: var(--color-success-text);
  margin-bottom: 8px;
}

.ticket-error-icon {
  font-size: var(--icon-lg);
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.ticket-link {
  display: block;
  text-align: center;
  padding: 10px 14px;
  margin: 12px 0;
  border: 1.5px solid var(--color-accent);
  border-radius: var(--radius-base);
  color: var(--color-accent-text);
  font-weight: 600;
  text-decoration: none;
}

.ticket-link:hover {
  background: var(--color-accent-subtle);
}

.ticket-nota {
  font-size: var(--fs-label-01);
}
</style>
