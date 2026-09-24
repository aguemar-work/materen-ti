<script setup>
// Página PÚBLICA (sin sesión): el empleado abre el enlace que recibió
// por WhatsApp y ve sus credenciales UNA sola vez. Al revelarlas, el
// enlace se autodestruye en el servidor.
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { abrirEntrega } from '../../api/passwords.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppButton from '../../components/ui/AppButton.vue';

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

// ── Solo presentación (rediseño 2026-09-24, receta 4.5) ──────────────────
const titulo = computed(() => {
  if (estado.value === 'revelado') return `Accesos de ${empleadoNombre.value}`;
  if (estado.value === 'error') return 'Enlace no disponible';
  return 'Accesos listos para entrega';
});

// El ícono del botón copiar cambia a ✓, pero eso solo lo ve quien mira:
// este texto va a una región `aria-live` para que el lector de pantalla
// también confirme la copia.
const mensajeCopiado = computed(() => {
  if (!copiado.value) return '';
  return copiado.value.startsWith('p') ? 'Contraseña copiada' : 'Usuario copiado';
});
</script>

<template>
  <AppPortal
    seccion="Entrega de accesos"
    :titulo="titulo"
    :icono="estado === 'error' ? 'ti ti-link-off' : estado === 'revelado' ? '' : 'ti ti-lock'"
    :tono="estado === 'error' ? 'neutral' : 'primary'"
  >
    <!-- Estado inicial: advertir antes de revelar -->
    <template v-if="estado === 'inicial' || estado === 'cargando'">
      <p class="text-center text-sm text-gray-600">
        Este enlace se puede abrir <strong class="font-semibold text-gray-900">una sola vez</strong>. Antes de continuar,
        asegúrese de poder guardar las credenciales (anótelas o tome una
        captura de pantalla).
      </p>
      <AppButton
        class="mt-6"
        size="lg"
        block
        icon="ti ti-lock-open"
        icon-pos="right"
        :label="estado === 'cargando' ? 'Abriendo entrega...' : 'Ver accesos'"
        :loading="estado === 'cargando'"
        @click="revelar"
      />
      <p v-if="estado === 'cargando'" class="sr-only" role="status">Abriendo entrega...</p>
    </template>

    <!-- Credenciales reveladas -->
    <template v-else-if="estado === 'revelado'">
      <p class="notif notif--warning">
        <i class="ti ti-alert-triangle" aria-hidden="true"></i>
        <span class="notif__texto">Guarde estos datos ahora: al cerrar esta página no será posible volver a verlos.</span>
      </p>

      <ul class="mt-5 flex flex-col gap-3">
        <li v-for="(c, i) in credenciales" :key="i" class="rounded-lg border border-gray-200">
          <h2 class="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">{{ c.plataforma || 'Cuenta' }}</h2>
          <dl class="divide-y divide-gray-100">
            <div class="px-4 py-3">
              <dt class="text-xs font-medium text-gray-500">Usuario</dt>
              <dd class="mt-1 flex items-center gap-2">
                <span class="min-w-0 flex-1 select-all break-all font-mono text-sm text-gray-900">{{ c.usuario }}</span>
                <AppButton
                  class="w-10 shrink-0 px-0"
                  variant="outline"
                  severity="secondary"
                  :icon="copiado === `u${i}` ? 'ti ti-check' : 'ti ti-copy'"
                  :title="`Copiar usuario de ${c.plataforma || 'la cuenta'}`"
                  :aria-label="`Copiar usuario de ${c.plataforma || 'la cuenta'}`"
                  @click="copiar(c.usuario, `u${i}`)"
                />
              </dd>
            </div>
            <div v-if="c.password" class="px-4 py-3">
              <dt class="text-xs font-medium text-gray-500">Contraseña</dt>
              <dd class="mt-1 flex items-center gap-2">
                <span class="min-w-0 flex-1 select-all break-all font-mono text-sm text-gray-900">{{ c.password }}</span>
                <AppButton
                  class="w-10 shrink-0 px-0"
                  variant="outline"
                  severity="secondary"
                  :icon="copiado === `p${i}` ? 'ti ti-check' : 'ti ti-copy'"
                  :title="`Copiar contraseña de ${c.plataforma || 'la cuenta'}`"
                  :aria-label="`Copiar contraseña de ${c.plataforma || 'la cuenta'}`"
                  @click="copiar(c.password, `p${i}`)"
                />
              </dd>
            </div>
            <div v-if="c.url" class="px-4 py-3">
              <dt class="text-xs font-medium text-gray-500">URL</dt>
              <dd class="mt-1">
                <a
                  class="break-all text-sm text-primary-600 underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  :href="c.url"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ c.url }}<span class="sr-only"> (se abre en una pestaña nueva)</span></a>
              </dd>
            </div>
          </dl>
        </li>
      </ul>
      <p class="sr-only" role="status" aria-live="polite">{{ mensajeCopiado }}</p>

      <!-- Aviso de soporte. Abre en pestaña nueva A PROPÓSITO: navegar en
           esta misma pestaña descartaría las credenciales ya reveladas, y el
           enlace de entrega no se puede volver a abrir. -->
      <div class="mt-6 border-t border-gray-100 pt-5">
        <p class="text-sm text-gray-600">
          <strong class="font-semibold text-gray-900">Importante:</strong> toda solicitud de soporte debe realizarse
          exclusivamente a través de ticket. No se atenderán consultas por WhatsApp
          ni por ningún otro canal.
        </p>
        <AppButton
          class="mt-4"
          size="lg"
          block
          variant="outline"
          severity="secondary"
          icon="ti ti-external-link"
          icon-pos="right"
          :to="{ name: 'ticket-nuevo' }"
          target="_blank"
          rel="noopener noreferrer"
        >
          Crear ticket de soporte
          <span class="sr-only">(se abre en una pestaña nueva)</span>
        </AppButton>
      </div>
    </template>

    <!-- Error: enlace usado, expirado o inexistente -->
    <template v-else>
      <p class="text-center text-sm text-gray-600">{{ error }}</p>
      <p class="mt-4 text-center text-sm text-gray-600">
        Si las credenciales no fueron guardadas o se requiere un nuevo enlace,
        cree un ticket de soporte. Si el caso ya fue reportado, puede consultarse por DNI.
      </p>
      <div class="mt-6 flex flex-col gap-3">
        <AppButton
          size="lg"
          block
          icon="ti ti-ticket"
          icon-pos="right"
          label="Crear ticket de soporte"
          :to="{ name: 'ticket-nuevo' }"
        />
        <AppButton
          size="lg"
          block
          variant="outline"
          severity="secondary"
          icon="ti ti-search"
          icon-pos="right"
          label="Buscar ticket por DNI"
          :to="{ name: 'ticket-buscar' }"
        />
      </div>
    </template>
  </AppPortal>
</template>
