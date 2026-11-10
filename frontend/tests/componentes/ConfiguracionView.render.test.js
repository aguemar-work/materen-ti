// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import configRoutes from '../../src/router/routes/config.routes.js';
import ConfiguracionView from '../../src/modules/configuracion/ConfiguracionView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

it('abre el índice, muestra el catálogo de personal solo a jefatura y conserva enlaces antiguos', async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.rol = 'ASISTENTE';
  const [configuracion, ...redirecciones] = configRoutes;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{
      ...configuracion,
      component: ConfiguracionView,
      children: configuracion.children.map((hija) => ({
        ...hija,
        ...(hija.component ? { component: { template: '<p>Catálogo</p>' } } : {}),
      })),
    }, ...redirecciones],
  });
  await router.push('/configuracion');
  const vista = mount(ConfiguracionView, { global: { plugins: [pinia, router] } });
  try {
    expect(router.currentRoute.value.name).toBe('configuracion');
    expect(vista.find('a[href="/configuracion/empresas"]').exists()).toBe(true);
    expect(vista.find('a[href="/configuracion/staff"]').exists()).toBe(false);
    auth.rol = 'JEFE';
    await vista.vm.$nextTick();
    expect(vista.find('a[href="/configuracion/staff"]').exists()).toBe(true);

    await router.push('/configuracion/ubicaciones');
    expect(vista.get('select').element.value).toBe('configuracion-ubicaciones');
    await router.push('/configuracion?tab=plataformas');
    expect(router.currentRoute.value.path).toBe('/configuracion/plataformas');
    expect(vista.get('select').element.value).toBe('configuracion-plataformas');
  } finally {
    vista.unmount();
  }
});
