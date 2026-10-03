// @vitest-environment happy-dom
//
// Hoja de Reportes (migración 115) montada de verdad: carátula con sello
// "Período en curso", controles fuera del papel, secciones en tablas con la
// mediana antes que el promedio y el CSAT como "n insuficiente", la sección
// por técnico solo cuando el servidor la mandó, Imprimir = window.print() y
// el CSV desde el mismo jsonb. Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReportesView from '../../src/modules/reportes/ReportesView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { obtenerReporteTickets: vi.fn(), nombresStaff: vi.fn() },
}));
vi.mock('../../src/core/exportar.js', () => ({ exportarCSV: vi.fn() }));
import { insforgeApi } from '../../src/api/insforge.js';
import { exportarCSV } from '../../src/core/exportar.js';

const REPORTE = {
  generado_en: '2026-10-03T15:00:00Z', generado_por: { user_id: 'u-jefe', nombre: 'Jefe Prueba' }, definiciones_version: 'reportes-2026-10-03',
  periodo: { desde: '2026-10-01', hasta: '2026-10-31', completo: false, en_curso: true }, periodo_completo: false,
  alcance: { tipo: 'equipo', tecnico_id: null, tecnico_nombre: null },
  parametros: { csat_muestra_minima: 5, dias_corte_reapertura: 30 },
  primer_ticket_at: '2026-07-14T12:00:00Z',
  volumen: { creados: 10, rechazados: 1, resueltos: 7, resueltos_mismo_periodo: 6, resueltos_arrastrados: 1, cerrados_sin_encuesta: 0,
    backlog: { referencia: 'ahora', total: 2, dias_mas_antiguo: 5, tramos: [{ clave: 'hasta_3', etiqueta: '0 a 3 días', cantidad: 1 }, { clave: 'de_4_a_7', etiqueta: '4 a 7 días', cantidad: 1 }] } },
  por: { categoria: [{ clave: 'red', nombre: 'Red', creados: 4, resueltos: 3 }], subcategoria: [], prioridad: [], tipo: [], nivel: [], area: [] },
  atencion: { unidad: 'horas corridas', resolucion: { n: 7, mediana_horas: 1.5, promedio_horas: 20 }, primera_respuesta: { n: 3, mediana_horas: 0.5, promedio_horas: 1 }, por_prioridad: [] },
  calidad: {
    reaperturas: { base: 7, reabiertos: 0, tasa_pct: 0, eventos: 0, corte_dias: 30, ventana_completa: false },
    csat: { generadas: 5, respondidas: 3, tasa_respuesta_pct: 60, n: 3, promedio: null, insuficiente: true, minimo: 5, niveles: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 }, insatisfechos: 0 },
    comentarios_bajos: [], comentarios_bajos_total: 0,
  },
  por_tecnico: [{ tecnico_id: 'u-asis', nombre: 'Asis Uno', resueltos: 4, mismo_periodo: 4, arrastrados: 0, tiempos: { n: 4, mediana_horas: 2, promedio_horas: 3 }, csat: { n: 2, promedio: null, insuficiente: true }, reaperturas: { base: 4, reabiertos: 0 }, asignados_hoy: 1 }],
  anexos: { arrastrados: [], cerrados_sin_encuesta: [] },
  tickets: [{ codigo: 'TCK-0010', titulo: 'Uno', estado: 'cerrado', prioridad: 'media', tipo: 'incidente', nivel_atencion: 'N1', categoria: 'Red', subcategoria: null, area: null, solicitante: 'Ana Prueba', created_at: '2026-10-01T12:00:00Z', resuelto_at: '2026-10-01T13:30:00Z', horas_resolucion: 1.5, tecnico_id: 'u-asis', encuesta_nivel: 4, en_periodo: 'ambos' }],
  comparacion: null,
};

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(url = '/reportes', { rol = 'JEFE' } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reportes', component: { template: '<div />' } }] });
  router.push(url);
  await router.isReady();
  const auth = useAuthStore();
  auth.user = { id: 'u-jefe' };
  auth.rol = rol;
  wrapper = mount(ReportesView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  for (let i = 0; i < 6; i += 1) await espera();
  return { w: wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.obtenerReporteTickets.mockResolvedValue(JSON.parse(JSON.stringify(REPORTE)));
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u-asis', nombre: 'Asis Uno' }]);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ReportesView', () => {
  it('pide el mes en curso por defecto, lo escribe en la URL y pinta la carátula con el sello', async () => {
    const { w, router } = await montar();
    const llamada = insforgeApi.obtenerReporteTickets.mock.calls.at(-1)[0];
    expect(llamada.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(llamada.tecnicoId).toBeNull();
    expect(router.currentRoute.value.query.desde).toBe(llamada.desde);
    expect(w.find('[data-caratula] h1').text()).toBe('Reporte de tickets');
    expect(w.find('[data-sello]').text()).toBe('Período en curso');
    const dl = w.find('[data-caratula] dl').text();
    expect(dl).toContain('Jefe Prueba');
    expect(dl).toContain('reportes-2026-10-03');
    expect(dl).toContain('Todo el equipo');
  });

  it('los controles no se imprimen y las secciones son tablas: mediana antes que promedio, CSAT "n insuficiente"', async () => {
    const { w } = await montar();
    expect(w.find('[data-no-print] [aria-label="Tipo de período"]').exists()).toBe(true);
    const titulos = w.findAll('h2').map((h) => h.text());
    expect(titulos).toEqual(expect.arrayContaining(['1. Volumen', '2. Atención (horas corridas)', '3. Calidad', '4. Por técnico', '5. Por categoría y por área', '6. Anexos']));
    const atencion = w.find('#reporte-atencion table');
    expect(atencion.findAll('th').map((t) => t.text()).slice(0, 4)).toEqual(['Tiempo', 'Mediana', 'Promedio', 'n']);
    expect(atencion.text()).toContain('1.5 h');
    expect(w.find('#reporte-calidad').text()).toContain('n insuficiente (3)');
    expect(w.find('#reporte-tecnicos').text()).toContain('Asis Uno');
    expect(w.findAll('table[data-libro]').length).toBeGreaterThan(5);
    expect(w.text()).toContain('no se compara con el anterior');
    expect(w.find('#reporte-glosario-titulo').exists()).toBe(true);
  });

  it('sin la sección por técnico (asistente) no se pinta y el selector de alcance ofrece solo "mi actividad"', async () => {
    insforgeApi.obtenerReporteTickets.mockResolvedValue({ ...JSON.parse(JSON.stringify(REPORTE)), por_tecnico: null });
    const { w } = await montar('/reportes', { rol: 'ASISTENTE' });
    expect(w.find('#reporte-tecnicos').exists()).toBe(false);
    expect(insforgeApi.nombresStaff).not.toHaveBeenCalled();
    const opciones = w.findAll('select').at(-1).findAll('option').map((o) => o.text());
    expect(opciones).toEqual(['Todo el equipo', 'Solo mi actividad']);
  });

  it('Imprimir llama a window.print y el CSV sale del mismo jsonb', async () => {
    const { w } = await montar();
    // happy-dom no implementa window.print: se define para poder observarlo.
    const print = vi.fn();
    window.print = print;
    const botones = w.findAll('[data-caratula] button');
    await botones.find((b) => b.text().includes('Imprimir')).trigger('click');
    expect(print).toHaveBeenCalledTimes(1);
    await botones.find((b) => b.text() === 'CSV').trigger('click');
    expect(exportarCSV).toHaveBeenCalledTimes(1);
    const [nombre, cabecera, filas] = exportarCSV.mock.calls[0];
    expect(nombre).toMatch(/^Reporte_tickets_\d{4}-\d{2}$/);
    expect(cabecera).toContain('Resolvió');
    expect(filas[0][0]).toBe('TCK-0010');
    delete window.print;
  });

  it('cambiar el período por la URL recarga; un 42501 se muestra traducido, sin texto crudo', async () => {
    const { router } = await montar();
    await router.replace({ query: { tipo: 'mes', desde: '2026-08-01', hasta: '2026-08-31' } });
    for (let i = 0; i < 6; i += 1) await espera();
    expect(insforgeApi.obtenerReporteTickets.mock.calls.at(-1)[0]).toMatchObject({ desde: '2026-08-01', hasta: '2026-08-31' });
    insforgeApi.obtenerReporteTickets.mockRejectedValue(Object.assign(new Error('permission denied for function reporte_tickets'), { code: '42501' }));
    await router.replace({ query: { tipo: 'mes', desde: '2026-07-01', hasta: '2026-07-31' } });
    for (let i = 0; i < 6; i += 1) await espera();
    const alerta = wrapper.find('[role="alert"]');
    expect(alerta.exists()).toBe(true);
    expect(alerta.text()).toBe('No tiene permiso para esta acción.');
    expect(wrapper.text()).not.toContain('permission denied');
  });
});
