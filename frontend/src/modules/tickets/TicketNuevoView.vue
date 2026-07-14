<script setup>
// Página PÚBLICA (sin sesión): formulario de creación de ticket.
// Dos rutas de entrada:
//   - Con ?entrega=<token>: el empleado llega desde /entrega/:token,
//     el backend resuelve quién es sin pedir nada más.
//   - Sin token: se pide correo o DNI para intentar el match automático
//     (si no hay match, el ticket se crea igual, sin bloquear).
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { catalogoTickets, crearTicket } from '../../api/ticketsPublicos.js';
import { comprimirImagen, archivoABase64 } from '../../core/imagenes.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

const route = useRoute();
const tokenEntrega = route.query.entrega ? String(route.query.entrega) : '';

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
  if (!tokenEntrega && !form.value.contacto.trim()) {
    error.value = 'Ingresa tu correo institucional o tu DNI para poder ubicarte';
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
      tokenEntrega: tokenEntrega || undefined,
      contacto: tokenEntrega ? undefined : form.value.contacto.trim(),
      adjunto,
    });
    estado.value = 'confirmacion';
  } catch (e) {
    error.value = e?.message || 'No se pudo registrar tu solicitud';
    estado.value = 'formulario';
  }
}

onMounted(async () => {
  try {
    const catalogo = await catalogoTickets();
    categorias.value = catalogo.categorias;
    subcategorias.value = catalogo.subcategorias;
    estado.value = 'formulario';
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar el formulario';
    estado.value = 'error_catalogo';
  }
});
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Soporte técnico" />

      <template v-if="estado === 'cargando_catalogo'">
        <p class="ticket-texto">Cargando formulario...</p>
      </template>

      <template v-else-if="estado === 'error_catalogo'">
        <div class="ticket-error-icon"><i class="ti ti-plug-connected-x"></i></div>
        <h2 class="ticket-title">No se pudo cargar el formulario</h2>
        <p class="ticket-texto">{{ error }}</p>
      </template>

      <template v-else-if="estado === 'formulario' || estado === 'enviando'">
        <h2 class="ticket-title">Reportar un problema</h2>
        <p class="ticket-subtitulo">
          Cuéntanos qué pasó y te ayudamos a resolverlo.
        </p>
        <RouterLink class="ticket-ver-mios" to="/ticket/buscar">
          <i class="ti ti-search" aria-hidden="true"></i> ¿Ya reportaste algo? Busca tu ticket
        </RouterLink>

        <form class="ticket-form" @submit.prevent="enviar">
          <div v-if="!tokenEntrega" class="form-group full">
            <label for="tk-contacto">Correo institucional o DNI *</label>
            <input
              id="tk-contacto"
              v-model="form.contacto"
              type="text"
              placeholder="tu@empresa.com o tu DNI"
              :disabled="estado === 'enviando'"
            >
            <p class="field-hint">Así podemos ubicarte y avisarte cuando resolvamos tu caso.</p>
          </div>
          <div v-else class="ticket-identificado">
            <i class="ti ti-user-check"></i> Te identificamos automáticamente.
          </div>

          <div class="form-group full">
            <label for="tk-categoria">Tipo de solicitud *</label>
            <select id="tk-categoria" v-model="form.categoriaId" required :disabled="estado === 'enviando'">
              <option value="" disabled>Seleccionar</option>
              <option v-for="c in categorias" :key="c.id" :value="c.id">{{ c.nombre }}</option>
            </select>
          </div>

          <div v-if="subcategoriasFiltradas.length" class="form-group full">
            <label for="tk-subcategoria">¿Sobre qué específicamente?</label>
            <select id="tk-subcategoria" v-model="form.subcategoriaId" :disabled="estado === 'enviando'">
              <option value="">Seleccionar (opcional)</option>
              <option v-for="s in subcategoriasFiltradas" :key="s.id" :value="s.id">{{ s.nombre }}</option>
            </select>
          </div>

          <div class="form-group full">
            <label for="tk-titulo">Resumen breve *</label>
            <input
              id="tk-titulo"
              v-model="form.titulo"
              required
              placeholder="ej: No puedo entrar a mi correo"
              :disabled="estado === 'enviando'"
            >
          </div>

          <div class="form-group full">
            <label for="tk-descripcion">Detalle de la solicitud *</label>
            <textarea
              id="tk-descripcion"
              v-model="form.descripcion"
              required
              rows="4"
              placeholder="Describe qué pasó, desde cuándo y cualquier detalle que ayude"
              :disabled="estado === 'enviando'"
            ></textarea>
          </div>

          <div class="form-group full">
            <label>Captura de pantalla (opcional)</label>
            <div v-if="!archivo" class="ticket-adjuntar">
              <button type="button" class="btn" :disabled="estado === 'enviando'" @click="inputArchivo?.click()">
                <i class="ti ti-camera-plus" aria-hidden="true"></i> Adjuntar captura
              </button>
            </div>
            <div v-else class="ticket-preview">
              <img :src="previewUrl" alt="Captura adjunta">
              <button type="button" class="icon-btn" title="Quitar" :disabled="estado === 'enviando'" @click="quitarArchivo">
                <i class="ti ti-x"></i>
              </button>
            </div>
            <input ref="inputArchivo" type="file" accept="image/*" style="display: none" @change="onArchivoSeleccionado">
          </div>

          <p v-if="error" class="form-error" role="alert">{{ error }}</p>

          <button class="btn btn-primary ticket-submit" type="submit" :disabled="estado === 'enviando'">
            {{ estado === 'enviando' ? 'Enviando...' : 'Enviar solicitud' }}
          </button>
        </form>
      </template>

      <template v-else-if="estado === 'confirmacion'">
        <div class="ticket-ok-icon"><i class="ti ti-circle-check"></i></div>
        <h2 class="ticket-title">Solicitud registrada</h2>
        <p class="ticket-texto">
          Tu código de seguimiento es <strong>{{ resultado.codigo }}</strong>.
        </p>
        <p class="ticket-texto">
          Guarda este enlace para ver el estado de tu solicitud en cualquier momento:
        </p>
        <RouterLink class="ticket-link" :to="`/ticket/${resultado.token}`">
          {{ resultado.codigo }} — Ver seguimiento
        </RouterLink>
        <p class="aviso-correo-off">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          <span>Guarda el enlace de arriba: es tu comprobante. El correo automático puede no enviarse; el seguimiento siempre funciona desde este enlace o buscando por DNI.</span>
        </p>
        <p v-if="resultado.vinculado" class="ticket-texto ticket-nota">
          Si dejaste un correo, intentamos enviarte este enlace — no dependas solo del correo.
        </p>
        <p v-else class="ticket-texto ticket-nota">
          No pudimos identificarte automáticamente — un agente revisará tu caso a la brevedad.
        </p>
        <p class="ticket-texto ticket-nota">
          Si pierdes este enlace, puedes <RouterLink to="/ticket/buscar">buscar tu ticket por DNI</RouterLink>.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ticket-title {
  font-size: var(--fs-xl);
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0 0 4px;
}

.ticket-subtitulo {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin: 0 0 16px;
}

.ticket-texto {
  font-size: var(--fs-base);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 10px;
}

.ticket-ver-mios {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--color-accent-text);
  text-decoration: none;
  margin-bottom: 16px;
}

.ticket-ver-mios:hover {
  text-decoration: underline;
}

.ticket-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field-hint {
  margin: 4px 0 0;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

.ticket-identificado {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-base);
  color: var(--color-success-text);
  background: var(--color-success-bg);
  border-radius: var(--radius-md);
  padding: 8px 12px;
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
  border-radius: var(--radius-md);
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
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-top: 4px;
}

.ticket-ok-icon {
  font-size: 40px;
  color: var(--color-success-text);
  margin-bottom: 8px;
}

.ticket-error-icon {
  font-size: 40px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.ticket-link {
  display: block;
  text-align: center;
  padding: 10px 14px;
  margin: 12px 0;
  border: 1.5px solid var(--color-accent);
  border-radius: var(--radius-md);
  color: var(--color-accent-text);
  font-weight: 600;
  text-decoration: none;
}

.ticket-link:hover {
  background: var(--color-accent-subtle);
}

.ticket-nota {
  font-size: var(--fs-sm);
}
</style>
