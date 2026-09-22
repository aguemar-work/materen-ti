<script setup>
// Página PÚBLICA (sin sesión): el empleado abre el enlace que recibió
// por WhatsApp y ve sus credenciales UNA sola vez. Al revelarlas, el
// enlace se autodestruye en el servidor.
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { abrirEntrega } from '../../api/passwords.js';
import PublicBrand from '../../components/shared/PublicBrand.vue';

const route = useRoute();

// estado: 'inicial' | 'cargando' | 'revelado' | 'error'
const estado = ref('inicial');
const error = ref('');
const empleadoNombre = ref('');
const credenciales = ref([]);
const copiado = ref(null);

async function revelar() {
  estado.value = 'cargando';
  try {
    const data = await abrirEntrega(route.params.token);
    empleadoNombre.value = data.empleadoNombre;
    credenciales.value = data.credenciales;
    estado.value = 'revelado';
  } catch (e) {
    error.value = e?.message || 'No se pudo abrir la entrega';
    estado.value = 'error';
  }
}

async function copiar(texto, id) {
  try {
    await navigator.clipboard.writeText(texto);
    copiado.value = id;
    setTimeout(() => { if (copiado.value === id) copiado.value = null; }, 1500);
  } catch { /* portapapeles no disponible */ }
}
</script>

<template>
  <div class="public-page">
    <div class="card public-card">
      <PublicBrand subtitulo="Entrega de accesos" />

      <!-- Estado inicial: advertir antes de revelar -->
      <template v-if="estado === 'inicial'">
        <div class="entrega-centro">
          <h2 class="entrega-title">Accesos listos para entrega</h2>
          <p class="entrega-texto">
            Este enlace se puede abrir <strong>una sola vez</strong>. Antes de continuar,
            asegúrese de poder guardar las credenciales (anótelas o tome una
            captura de pantalla).
          </p>
        </div>
        <button type="button" class="btn btn--primary btn--ancho entrega-btn" @click="revelar">
          Ver accesos
          <i class="ti ti-lock-open" aria-hidden="true"></i>
        </button>
      </template>

      <div v-else-if="estado === 'cargando'" class="entrega-cargando" role="status">
        Abriendo entrega...
      </div>

      <!-- Credenciales reveladas -->
      <template v-else-if="estado === 'revelado'">
        <h2 class="entrega-title">Accesos de {{ empleadoNombre }}</h2>
        <p class="entrega-texto entrega-aviso">
          <i class="ti ti-alert-triangle" aria-hidden="true"></i>
          Guarde estos datos ahora: al cerrar esta página no será posible volver a verlos.
        </p>

        <div class="cred-lista">
          <div v-for="(c, i) in credenciales" :key="i" class="cred-item">
            <div class="cred-plataforma">{{ c.plataforma || 'Cuenta' }}</div>
            <div class="cred-fila">
              <span class="cred-label">Usuario</span>
              <span class="cred-valor">{{ c.usuario }}</span>
              <button class="icon-btn" type="button" title="Copiar usuario" aria-label="Copiar usuario" @click="copiar(c.usuario, `u${i}`)">
                <i :class="copiado === `u${i}` ? 'ti ti-check' : 'ti ti-copy'" aria-hidden="true"></i>
              </button>
            </div>
            <div v-if="c.password" class="cred-fila">
              <span class="cred-label">Contraseña</span>
              <span class="cred-valor">{{ c.password }}</span>
              <button class="icon-btn" type="button" title="Copiar contraseña" aria-label="Copiar contraseña" @click="copiar(c.password, `p${i}`)">
                <i :class="copiado === `p${i}` ? 'ti ti-check' : 'ti ti-copy'" aria-hidden="true"></i>
              </button>
            </div>
            <div v-if="c.url" class="cred-fila">
              <span class="cred-label">URL</span>
              <a class="cred-valor cred-url" :href="c.url" target="_blank" rel="noopener noreferrer">{{ c.url }}</a>
            </div>
          </div>
        </div>

      </template>

      <!-- Error: enlace usado, expirado o inexistente -->
      <template v-else>
        <div class="entrega-centro">
          <div class="entrega-error-icon"><i class="ti ti-link-off" aria-hidden="true"></i></div>
          <h2 class="entrega-title">Enlace no disponible</h2>
          <p class="entrega-texto">{{ error }}</p>
        </div>
        <div class="entrega-acciones">
          <p class="entrega-texto entrega-acciones-texto">
            Si las credenciales no fueron guardadas o se requiere un nuevo enlace,
            cree un ticket de soporte. Si el caso ya fue reportado, puede consultarse por DNI.
          </p>
          <RouterLink :to="{ name: 'ticket-nuevo' }" class="btn btn--primary btn--ancho entrega-accion-primaria">
            Crear ticket de soporte
            <i class="ti ti-ticket" aria-hidden="true"></i>
          </RouterLink>
          <RouterLink :to="{ name: 'ticket-buscar' }" class="btn btn--secondary btn--ancho">
            Buscar ticket por DNI
            <i class="ti ti-search" aria-hidden="true"></i>
          </RouterLink>
        </div>
      </template>

      <!-- Aviso de soporte (solo tras revelar credenciales) -->
      <div v-if="estado === 'revelado'" class="soporte-aviso">
        <p class="soporte-texto">
          <strong><i class="ti ti-alert-triangle" aria-hidden="true"></i> IMPORTANTE:</strong> Toda solicitud de soporte debe realizarse
          exclusivamente a través de ticket. No se atenderán consultas por WhatsApp
          ni por ningún otro canal.
        </p>
        <RouterLink :to="{ name: 'ticket-nuevo' }" class="btn btn--secondary btn--ancho">
          Crear ticket de soporte
          <i class="ti ti-ticket" aria-hidden="true"></i>
        </RouterLink>
      </div>
    </div>
  </div>
</template>


