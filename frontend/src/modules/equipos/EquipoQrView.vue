<script setup>
// Destino del QR de la etiqueta de un equipo: `/e/:codigo` (ruta PÚBLICA, plan
// de mejora §3.6). Dos caras según quién escanee:
//
//   · SIN sesión de staff: no se consulta NADA a la base. Se muestra
//     "Equipo de Materen. Si lo encontró, comuníquese con el área de TI." y el
//     contacto de TI (core/marca.js → CONTACTO_TI) si el dueño lo completó. Así
//     una etiqueta pegada en un equipo ya entregado no revela datos ni permite
//     enumerar el inventario.
//   · CON sesión de staff con el módulo `equipos`: resuelve el código y lleva a
//     la hoja de vida (`router.replace`, para que "atrás" no vuelva a esta
//     pantalla de paso). La RLS decide qué ve cada sesión.
//
// La sesión ya se cargó al arrancar la app (main.js → cargarSesion): leerla
// acá no llama a la API de datos.
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { CONTACTO_TI } from '../../core/marca.js';
import AppPortal from '../../components/ui/AppPortal.vue';
import AppCodigo from '../../components/ui/AppCodigo.vue';
import AppButton from '../../components/ui/AppButton.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const codigo = String(route.params.codigo || '').trim();

// 'publico' | 'buscando' | 'sin_modulo' | 'sin_resultado' | 'error'
const estado = ref(auth.esStaff ? 'buscando' : 'publico');
const mensajeError = ref('');

async function resolver() {
  if (!auth.esStaff) {
    estado.value = 'publico';
    return;
  }
  if (!auth.puedeVerModulo('equipos')) {
    estado.value = 'sin_modulo';
    return;
  }
  estado.value = 'buscando';
  try {
    const equipo = await insforgeApi.buscarEquipoPorCodigo(codigo);
    if (!equipo) {
      estado.value = 'sin_resultado';
      return;
    }
    await router.replace(`/equipos/${equipo.id}`);
  } catch (e) {
    mensajeError.value = traducirErrorDb(e, { porDefecto: 'No se pudo buscar el equipo.' }).mensaje;
    estado.value = 'error';
  }
}

onMounted(resolver);
</script>

<template>
  <AppPortal
    seccion="Inventario de TI"
    :titulo="{ publico: 'Equipo de Materen', buscando: 'Buscando el equipo', sin_modulo: 'Sin acceso al módulo Equipos', sin_resultado: 'Equipo no encontrado', error: 'No se pudo abrir el equipo' }[estado]"
  >
    <!-- Sin sesión: un mensaje y el contacto. Ningún dato del equipo, ninguna consulta. -->
    <template v-if="estado === 'publico'">
      <p class="text-sm text-gray-700">Si lo encontró, comuníquese con el área de TI.</p>
      <p v-if="CONTACTO_TI.texto" class="mt-4 text-sm text-gray-900">
        <span class="block text-[11px] font-semibold uppercase tracking-wider text-gray-500">Contacto de TI</span>
        <a
          v-if="CONTACTO_TI.enlace"
          :href="CONTACTO_TI.enlace"
          class="rounded text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >{{ CONTACTO_TI.texto }}</a>
        <template v-else>{{ CONTACTO_TI.texto }}</template>
      </p>
    </template>

    <p v-else-if="estado === 'buscando'" class="text-sm text-gray-500" role="status">Abriendo la hoja de vida de <AppCodigo :valor="codigo" titulo="Código de equipo" />...</p>

    <p v-else-if="estado === 'sin_modulo'" class="text-sm text-gray-700">
      Su usuario no tiene acceso al módulo Equipos. Pida acceso al jefe de TI para ver la hoja de vida de <AppCodigo :valor="codigo" titulo="Código de equipo" />.
    </p>

    <template v-else-if="estado === 'sin_resultado'">
      <p class="text-sm text-gray-700">No hay un equipo con el código <AppCodigo :valor="codigo" titulo="Código de equipo" />, o fue eliminado.</p>
      <AppButton class="mt-4" variant="outline" severity="secondary" label="Ir a Equipos" to="/equipos" />
    </template>

    <template v-else>
      <p class="text-sm text-gray-700" role="alert">{{ mensajeError }}</p>
      <AppButton class="mt-4" variant="outline" severity="secondary" icon="ti ti-refresh" label="Reintentar" @click="resolver" />
    </template>
  </AppPortal>
</template>
