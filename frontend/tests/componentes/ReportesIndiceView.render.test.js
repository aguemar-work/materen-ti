// @vitest-environment happy-dom
//
// Índice de Reportes (/reportes, migración 117): agrupado por área y SOLO con
// los reportes que el usuario puede ver (mismo permiso que su RPC); el enlace
// «Ver reporte» de los módulos aparece con la misma regla.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReportesIndiceView from '../../src/modules/reportes/ReportesIndiceView.vue';
import EnlaceReporte from '../../src/components/shared/EnlaceReporte.vue';
import { useAuthStore } from '../../src/stores/auth.js';

let wrapper;

async function montar(componente, { rol = 'JEFE', modulos = [], props = {} } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });
  router.push('/reportes');
  await router.isReady();
  const auth = useAuthStore();
  auth.user = { id: 'u1' };
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  wrapper = mount(componente, { props, attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  return wrapper;
}

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ReportesIndiceView', () => {
  it('JEFE: las cuatro áreas con sus once reportes, cada uno con su ruta', async () => {
    const w = await montar(ReportesIndiceView);
    expect(w.find('h1').text()).toBe('Reportes');
    expect(w.findAll('h2').map((h) => h.text())).toEqual(['Mesa de ayuda', 'Personas', 'Custodia', 'Administración']);
    const enlaces = w.findAll('a').map((a) => [a.text(), a.attributes('href')]);
    expect(enlaces).toHaveLength(11);
    expect(enlaces).toContainEqual(['Inventario de equipos', '/reportes/inventario']);
    expect(enlaces).toContainEqual(['Auditoría', '/reportes/auditoria']);
  });

  it('un asistente solo ve los reportes de sus módulos, sin Auditoría', async () => {
    const w = await montar(ReportesIndiceView, { rol: 'ASISTENTE', modulos: ['equipos', 'empleados'] });
    expect(w.findAll('h2').map((h) => h.text())).toEqual(['Personas', 'Custodia']);
    expect(w.findAll('a').map((a) => a.text())).toEqual(['Personal', 'Solicitudes', 'Inventario de equipos']);
    expect(w.text()).not.toContain('Auditoría');
  });

  it('sin ningún módulo con reporte: una línea de texto, sin áreas', async () => {
    const w = await montar(ReportesIndiceView, { rol: 'ASISTENTE', modulos: ['base_conocimiento'] });
    expect(w.findAll('h2')).toHaveLength(0);
    expect(w.text()).toContain('No tiene acceso a ningún reporte');
  });
});

describe('EnlaceReporte', () => {
  it('lleva a la hoja del reporte (con sus filtros) si se puede ver', async () => {
    const w = await montar(EnlaceReporte, { rol: 'ASISTENTE', modulos: ['encuestas'], props: { reporte: 'encuestas', query: { ronda: 'r1' } } });
    const a = w.find('a');
    expect(a.text()).toContain('Ver reporte');
    expect(a.attributes('href')).toBe('/reportes/encuestas?ronda=r1');
  });

  it('no se muestra sin el permiso del reporte (auditoría para un asistente)', async () => {
    const w = await montar(EnlaceReporte, { rol: 'ASISTENTE', modulos: ['tickets'], props: { reporte: 'auditoria' } });
    expect(w.find('a').exists()).toBe(false);
  });
});
