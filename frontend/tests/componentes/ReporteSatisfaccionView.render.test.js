// @vitest-environment happy-dom
//
// Reporte de Satisfacción (/reportes/satisfaccion): el consolidado de la 115
// en la hoja común (antes, Tickets › Satisfacción con PDF de jsPDF). Datos de
// la maqueta (misma aritmética que el SQL); solo la API y la descarga del CSV
// están mockeadas.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReporteSatisfaccionView from '../../src/modules/reportes/ReporteSatisfaccionView.vue';
import { TABLAS } from '../../src/maqueta/datos.js';
import { satisfaccionConsolidadaDe } from '../../src/maqueta/rpc-reportes.js';

vi.mock('../../src/api/insforge.js', () => ({ insforgeApi: { obtenerSatisfaccionConsolidado: vi.fn() } }));
vi.mock('../../src/core/exportar.js', () => ({ exportarCSV: vi.fn() }));
import { insforgeApi } from '../../src/api/insforge.js';
import { exportarCSV } from '../../src/core/exportar.js';

const espera = () => new Promise((r) => setTimeout(r, 0));
let wrapper;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.obtenerSatisfaccionConsolidado.mockResolvedValue(satisfaccionConsolidadaDe(JSON.parse(JSON.stringify(TABLAS)), { user: 'u-jefe' }));
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ReporteSatisfaccionView', () => {
  it('pinta las cinco secciones en la hoja común y el CSV es una fila por encuesta', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div />' } }] });
    router.push('/reportes/satisfaccion');
    await router.isReady();
    wrapper = mount(ReporteSatisfaccionView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
    for (let i = 0; i < 6; i += 1) await espera();
    expect(wrapper.find('[data-caratula] h1').text()).toBe('Satisfacción');
    expect(wrapper.findAll('section > div > h2').map((h) => h.text())).toEqual([
      '1. Resumen', '2. Por mes de resolución', '3. Por técnico', '4. Por solicitante', '5. Comentarios de respuestas insatisfechas',
    ]);
    expect(wrapper.find('[data-sello]').exists()).toBe(false);
    expect(wrapper.find('#reporte-glosario-titulo').text()).toContain('reportes-2026-10-03');
    await wrapper.findAll('[data-caratula] button').find((b) => b.text() === 'CSV').trigger('click');
    const [nombre, cabecera, filas] = exportarCSV.mock.calls[0];
    expect(nombre).toBe('Reporte_satisfaccion');
    expect(cabecera[0]).toBe('Ticket');
    const consolidado = await insforgeApi.obtenerSatisfaccionConsolidado.mock.results[0].value;
    expect(filas).toHaveLength(consolidado.respuestas.length);
  });
});
