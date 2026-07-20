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
        <button class="btn btn-primary entrega-btn" type="button" @click="revelar">
          <i class="ti ti-lock-open" aria-hidden="true"></i> Ver accesos
        </button>
      </template>

      <div v-else-if="estado === 'cargando'" class="entrega-cargando">
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
          <RouterLink
            class="btn btn-primary entrega-accion-primaria"
            :to="{ name: 'ticket-nuevo', query: { entrega: route.params.token } }"
          >
            <i class="ti ti-ticket" aria-hidden="true"></i> Crear ticket de soporte
          </RouterLink>
          <RouterLink class="entrega-accion-secundaria" :to="{ name: 'ticket-buscar' }">
            <i class="ti ti-search" aria-hidden="true"></i> Buscar ticket por DNI
          </RouterLink>
        </div>
      </template>

      <!-- Aviso de soporte (solo tras revelar credenciales) -->
      <div v-if="estado === 'revelado'" class="soporte-aviso">
        <p class="soporte-texto">
          <strong>⚠️ IMPORTANTE:</strong> Toda solicitud de soporte debe realizarse
          exclusivamente a través de ticket. No se atenderán consultas por WhatsApp
          ni por ningún otro canal.
        </p>
        <RouterLink class="soporte-btn" :to="{ name: 'ticket-nuevo', query: { entrega: route.params.token } }">
          <i class="ti ti-ticket" aria-hidden="true"></i> Crear ticket de soporte
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entrega-centro {
  text-align: center;
}

.entrega-title {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}

.entrega-texto {
  font-size: 13.5px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0 0 12px;
}

.entrega-btn {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-top: 4px;
}

.entrega-cargando {
  text-align: center;
  padding: 24px 0;
  color: var(--color-text-secondary);
  font-size: 13.5px;
}

.entrega-aviso {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--color-warning-text-strong);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.entrega-aviso i { font-size: 16px; flex-shrink: 0; }

.cred-lista {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.cred-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}

.cred-plataforma {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-primary, var(--color-accent));
  margin-bottom: 6px;
}

.cred-fila {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  min-width: 0;
}

.cred-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  width: 82px;
  flex-shrink: 0;
}

.cred-valor {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: var(--color-text-primary);
  overflow-wrap: anywhere;
  min-width: 0;
  flex: 1;
}

.cred-url {
  color: var(--color-primary, var(--color-accent));
  text-decoration: none;
}

.cred-url:hover { text-decoration: underline; }

.entrega-error-icon {
  font-size: 40px;
  color: var(--color-text-secondary);
  text-align: center;
  margin-bottom: 8px;
}

.entrega-acciones {
  margin-top: 4px;
}

.entrega-acciones-texto {
  margin-bottom: 14px;
  text-align: center;
}

.entrega-accion-primaria {
  width: 100%;
  justify-content: center;
  padding: 10px 14px;
  margin-bottom: 8px;
  text-decoration: none;
}

.entrega-accion-secundaria {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, var(--color-accent));
  border: 1.5px solid var(--color-primary, var(--color-accent));
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: background 0.15s;
}

.entrega-accion-secundaria:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 8%, transparent);
}

.soporte-aviso {
  margin-top: 16px;
  border-top: 1px solid var(--color-border);
  padding-top: 14px;
}

.soporte-texto {
  font-size: 12.5px;
  line-height: 1.5;
  text-align: center;
  color: var(--color-warning-text-strong);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin: 0 0 10px;
}

.soporte-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, var(--color-accent));
  border: 1.5px solid var(--color-primary, var(--color-accent));
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: background 0.15s;
}

.soporte-btn:hover {
  background: color-mix(in srgb, var(--color-primary, var(--color-accent)) 8%, transparent);
}
</style>
