// @vitest-environment happy-dom
//
// Hoja de los reportes centralizados (migración 117) montada de verdad, con
// los datos de la MAQUETA (misma aritmética que el SQL): carátula, controles
// fuera del papel, una sección por cada una del jsonb con sus tablas de libro,
// glosario al pie, Imprimir = window.print() y CSV del mismo jsonb sin DNI ni
// contacto. Solo api/insforge.js y la descarga del CSV están mockeados.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReporteGenericoView from '../../src/modules/reportes/ReporteGenericoView.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { REPORTES } from '../../src/core/reportes.js';
import { TABLAS } from '../../src/maqueta/datos.js';
import { reporteInventarioDe, reporteLicenciasDe, reporteCorreosDe } from '../../src/maqueta/rpc-reportes-custodia.js';
import { reportePersonalDe, reporteSolicitudesDe, reporteEncuestasDe } from '../../src/maqueta/rpc-reportes-personas.js';
import { reporteCambiosDe, reporteProblemasDe, reporteAuditoriaDe } from '../../src/maqueta/rpc-reportes-gestion.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    obtenerReporteInventario: vi.fn(), obtenerReporteLicencias: vi.fn(), obtenerReporteCorreos: vi.fn(),
    obtenerReportePersonal: vi.fn(), obtenerReporteSolicitudes: vi.fn(), obtenerReporteCambios: vi.fn(),
    obtenerReporteProblemas: vi.fn(), obtenerReporteEncuestas: vi.fn(), obtenerReporteAuditoria: vi.fn(),
  },
}));
vi.mock('../../src/core/exportar.js', () => ({ exportarCSV: vi.fn() }));
import { insforgeApi } from '../../src/api/insforge.js';
import { exportarCSV } from '../../src/core/exportar.js';

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const db = () => JSON.parse(JSON.stringify(TABLAS));
let usuario = 'u-jefe';
let wrapper;

const MAQUETA = {
  obtenerReporteInventario: () => reporteInventarioDe(db(), { user: usuario }),
  obtenerReporteLicencias: () => reporteLicenciasDe(db(), { user: usuario }),
  obtenerReporteCorreos: () => reporteCorreosDe(db(), { user: usuario }),
  obtenerReportePersonal: (p) => reportePersonalDe(db(), { user: usuario, ...p }),
  obtenerReporteSolicitudes: (p) => reporteSolicitudesDe(db(), { user: usuario, ...p }),
  obtenerReporteCambios: (p) => reporteCambiosDe(db(), { user: usuario, ...p }),
  obtenerReporteProblemas: (p) => reporteProblemasDe(db(), { user: usuario, ...p }),
  obtenerReporteEncuestas: (p) => reporteEncuestasDe(db(), { user: usuario, ronda: p.rondaId }),
  obtenerReporteAuditoria: (p) => reporteAuditoriaDe(db(), { user: usuario, ...p }),
};

async function montar(id, { query = {}, rol = 'JEFE' } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reportes/:id', component: { template: '<div />' } }] });
  router.push({ path: `/reportes/${id}`, query });
  await router.isReady();
  const auth = useAuthStore();
  auth.user = { id: usuario };
  auth.rol = rol;
  wrapper = mount(ReporteGenericoView, { props: { reporteId: id }, attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
  for (let i = 0; i < 8; i += 1) await espera();
  return { w: wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  usuario = 'u-jefe';
  for (const [metodo, impl] of Object.entries(MAQUETA)) {
    insforgeApi[metodo].mockImplementation(async (p = {}) => impl(p));
  }
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('ReporteGenericoView: una hoja por reporte de la 117', () => {
  for (const r of REPORTES.filter((x) => x.metodo)) {
    it(`${r.id}: carátula, controles fuera del papel, secciones en tablas y glosario`, async () => {
      const { w } = await montar(r.id);
      expect(insforgeApi[r.metodo]).toHaveBeenCalledTimes(1);
      const jsonb = await insforgeApi[r.metodo].mock.results[0].value;
      expect(w.find('[data-caratula] h1').text()).toBe(r.titulo);
      const dl = w.find('[data-caratula] dl').text();
      expect(dl).toContain('Alejandro Guevara');
      expect(dl).toContain('reportes-2026-10-05');
      expect(w.find('[data-no-print]').exists()).toBe(true);
      const titulos = w.findAll('section > div > h2').map((h) => h.text());
      expect(titulos).toEqual(jsonb.secciones.map((s) => s.titulo));
      expect(w.findAll('table[data-libro]').length).toBe(jsonb.secciones.reduce((n, s) => n + s.tablas.length, 0));
      expect(w.find('#reporte-glosario-titulo').exists()).toBe(true);
      expect(w.text()).not.toMatch(/undefined|\[object Object\]/);
    });
  }

  it('por período: escribe el mes en curso en la URL, lleva el sello y recarga al cambiar la URL', async () => {
    const { w, router } = await montar('personal');
    const llamada = insforgeApi.obtenerReportePersonal.mock.calls[0][0];
    expect(llamada.desde).toMatch(/^\d{4}-\d{2}-01$/);
    expect(router.currentRoute.value.query.desde).toBe(llamada.desde);
    expect(w.find('[data-sello]').text()).toBe('Período en curso');
    expect(w.find('[data-no-print] [aria-label="Tipo de período"]').exists()).toBe(true);
    await router.replace({ query: { tipo: 'rango', desde: '2026-01-01', hasta: '2026-06-30' } });
    for (let i = 0; i < 8; i += 1) await espera();
    expect(insforgeApi.obtenerReportePersonal.mock.calls.at(-1)[0]).toEqual({ desde: '2026-01-01', hasta: '2026-06-30' });
  });

  it('foto al corte: sin sello ni período; Imprimir = window.print y el CSV sale del jsonb sin DNI', async () => {
    const { w } = await montar('inventario');
    expect(w.find('[data-sello]').exists()).toBe(false);
    expect(w.find('[data-caratula] dl').text()).toContain('Corte');
    const print = vi.fn();
    window.print = print;
    const botones = w.findAll('[data-caratula] button');
    await botones.find((b) => b.text().includes('Imprimir')).trigger('click');
    expect(print).toHaveBeenCalledTimes(1);
    await botones.find((b) => b.text() === 'CSV').trigger('click');
    const [nombre, cabecera, filas] = exportarCSV.mock.calls[0];
    expect(nombre).toMatch(/^Reporte_inventario_\d{4}-\d{2}-\d{2}$/);
    expect(cabecera[0]).toBe('Código');
    expect(filas).toHaveLength(12);
    const dnis = TABLAS.empleados.map((e) => e.dni);
    expect(JSON.stringify(filas)).not.toMatch(new RegExp(dnis.join('|')));
    delete window.print;
  });

  it('personal: el CSV no tiene columnas de DNI ni de contacto', async () => {
    const { w } = await montar('personal');
    await w.findAll('[data-caratula] button').find((b) => b.text() === 'CSV').trigger('click');
    const [, cabecera, filas] = exportarCSV.mock.calls[0];
    expect(cabecera.some((c) => /dni|tel[eé]fono|whatsapp|correo/i.test(c))).toBe(false);
    const privados = TABLAS.empleados.flatMap((e) => [e.dni, e.telefono, e.whatsapp, e.correo_personal]);
    for (const v of privados) expect(JSON.stringify(filas)).not.toContain(v);
  });

  it('encuestas: elegir otra ronda la escribe en la URL y pide esa ronda', async () => {
    const { w, router } = await montar('encuestas');
    expect(w.find('[data-caratula] dl').text()).toContain('Satisfacción con el soporte de TI 2026');
    const select = w.find('[data-no-print] select');
    expect(select.findAll('option')).toHaveLength(3);
    await select.setValue('ron03');
    for (let i = 0; i < 8; i += 1) await espera();
    expect(router.currentRoute.value.query.ronda).toBe('ron03');
    expect(insforgeApi.obtenerReporteEncuestas.mock.calls.at(-1)[0]).toEqual({ rondaId: 'ron03' });
    expect(w.find('[data-caratula] dl').text()).toContain('Inventario de equipos en obra');
  });

  it('problemas para quien no tiene Conocimiento ni Tickets: avisa qué secciones faltan', async () => {
    usuario = 'u-asis-2';
    insforgeApi.obtenerReporteProblemas.mockImplementation(async (p) => {
      const d = db();
      d.staff_modulos_permisos = [{ staff_user_id: 'u-asis-2', modulo: 'problemas' }];
      return reporteProblemasDe(d, { user: 'u-asis-2', ...p });
    });
    const { w } = await montar('problemas', { rol: 'ASISTENTE' });
    const avisos = w.findAll('[role="status"]').map((p) => p.text());
    expect(avisos).toEqual(expect.arrayContaining([
      'La sección de base de conocimiento requiere el módulo Conocimiento.',
      'Las recurrencias y las resoluciones con artículo requieren el módulo Tickets.',
    ]));
  });

  it('un 42501 se muestra traducido, sin texto crudo', async () => {
    insforgeApi.obtenerReporteAuditoria.mockRejectedValue(Object.assign(new Error('permission denied for function reporte_auditoria'), { code: '42501' }));
    const { w } = await montar('auditoria');
    expect(w.find('[role="alert"]').text()).toBe('No tiene permiso para esta acción.');
    expect(w.text()).not.toContain('permission denied');
  });
});
