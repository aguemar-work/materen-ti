// @vitest-environment happy-dom
//
// Reporte de Satisfacción (/reportes/satisfaccion, migración 118): un período
// o todo el historial de reporte_satisfaccion en la hoja común. Datos de la
// maqueta (misma aritmética que el SQL); solo la API y la descarga del CSV
// están mockeadas.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReporteSatisfaccionView from '../../src/modules/reportes/ReporteSatisfaccionView.vue';
import { TABLAS } from '../../src/maqueta/datos.js';
import { satisfaccionDe } from '../../src/maqueta/rpc-reportes.js';

vi.mock('../../src/api/insforge.js', () => ({ insforgeApi: { obtenerReporteSatisfaccion: vi.fn(), nombresStaff: vi.fn() } }));
vi.mock('../../src/core/exportar.js', () => ({ exportarCSV: vi.fn() }));
import { insforgeApi } from '../../src/api/insforge.js';
import { exportarCSV } from '../../src/core/exportar.js';

const espera = () => new Promise((r) => setTimeout(r, 0));
let wrapper;

async function montar(ruta) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });
  router.push(ruta);
  await router.isReady();
  wrapper = mount(ReporteSatisfaccionView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  for (let i = 0; i < 6; i += 1) await espera();
  return router;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.obtenerReporteSatisfaccion.mockImplementation(async ({ desde, hasta } = {}) =>
    satisfaccionDe(JSON.parse(JSON.stringify(TABLAS)), { user: 'u-jefe', desde: desde || null, hasta: hasta || null }));
  insforgeApi.nombresStaff.mockResolvedValue(TABLAS.staff.map(({ user_id, nombre }) => ({ user_id, nombre })));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ReporteSatisfaccionView', () => {
  it('todo el historial: cifras, por técnico, por solicitante con su situación, y el CSV es una fila por encuesta', async () => {
    await montar('/reportes/satisfaccion?tipo=todo');
    expect(insforgeApi.obtenerReporteSatisfaccion).toHaveBeenCalledWith({});
    expect(wrapper.find('[data-caratula] h1').text()).toBe('Satisfacción');
    const titulos = wrapper.findAll('section > div > h2').map((h) => h.text());
    expect(titulos.slice(0, 3)).toEqual(['1. Resumen', '2. Por técnico', '3. Por solicitante']);
    expect(titulos.at(-1)).toMatch(/Comentarios de respuestas insatisfechas$/);
    expect(wrapper.findAll('dl dt').map((d) => d.text())).toContain('Faltan responder');
    expect(wrapper.findAll('[data-tag]').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-sello]').exists()).toBe(false);
    expect(wrapper.find('#reporte-glosario-titulo').text()).toContain('reportes-2026-10-06');
    await wrapper.findAll('[data-caratula] button').find((b) => b.text() === 'CSV').trigger('click');
    const [nombre, cabecera, filas] = exportarCSV.mock.calls[0];
    expect(nombre).toBe('Reporte_satisfaccion_historico');
    expect(cabecera).toContain('Resolvió');
    const r = await insforgeApi.obtenerReporteSatisfaccion.mock.results[0].value;
    expect(filas).toHaveLength(r.respuestas.length);
  });

  it('un mes: pide el período a la RPC y lo dice en la carátula', async () => {
    await montar('/reportes/satisfaccion?tipo=mes&desde=2026-09-01&hasta=2026-09-30');
    expect(insforgeApi.obtenerReporteSatisfaccion).toHaveBeenCalledWith({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(wrapper.find('[data-caratula]').text()).toContain('Septiembre 2026');
  });
});
