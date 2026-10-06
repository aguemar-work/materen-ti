// @vitest-environment happy-dom
//
// Hoja del reporte de Tickets (migraciones 115 y 118, ruta /reportes/tickets
// desde la 117) montada de verdad: tablero en cifras, gráfico por día, por
// técnico con «Jefatura y otros», «Copiar resumen», carátula con sello "Período en curso", controles
// fuera del papel, secciones en tablas con la mediana antes que el promedio y
// el CSAT como "n insuficiente", la sección por técnico solo cuando el
// servidor la mandó, Imprimir = window.print() y el CSV desde el mismo jsonb,
// que ahora también trae lo que daba el CSV de la bandeja (título y asignado
// hoy). Solo api/insforge.js está mockeado.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ReporteTicketsView from '../../src/modules/reportes/ReporteTicketsView.vue';
import { useAuthStore } from '../../src/stores/auth.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { obtenerReporteTickets: vi.fn(), nombresStaff: vi.fn() },
}));
vi.mock('../../src/core/exportar.js', () => ({ exportarCSV: vi.fn() }));
import { insforgeApi } from '../../src/api/insforge.js';
import { exportarCSV } from '../../src/core/exportar.js';

const REPORTE = {
  generado_en: '2026-10-03T15:00:00Z', generado_por: { user_id: 'u-jefe', nombre: 'Jefe Prueba' }, definiciones_version: 'reportes-2026-10-06',
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
    csat: { generadas: 5, respondidas: 3, tasa_respuesta_pct: 60, n: 3, promedio: null, insuficiente: true, minimo: 5, niveles: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 }, insatisfechos: 0, satisfechos: 2, regulares: 1, pct_satisfaccion: null },
    comentarios_bajos: [], comentarios_bajos_total: 0,
  },
  tablero: { ingresaron: 10, rechazados: 1, validos: 9, resueltos: 7, resueltos_de_ingresados: 6, pct_resuelto: 67, pendientes_inicio: 1, pendientes_cierre: 2 },
  por_dia: [
    { dia: '2026-10-01', ingresaron: 6, rechazados: 1, resueltos: 4 },
    { dia: '2026-10-02', ingresaron: 4, rechazados: 0, resueltos: 3 },
  ],
  pendientes: { referencia: 'ahora', total: 2, sin_asignar_hoy: 1, lista: [
    { codigo: 'TCK-0012', titulo: 'Impresora', prioridad: 'alta', estado_hoy: 'en_progreso', created_at: '2026-09-28T12:00:00Z', dias: 5, asignado_a: 'u-asis', solicitante: 'Ana Prueba' },
    { codigo: 'TCK-0013', titulo: 'Mouse', prioridad: 'baja', estado_hoy: 'abierto', created_at: '2026-10-02T12:00:00Z', dias: 1, asignado_a: null, solicitante: 'Luis Prueba' },
  ] },
  solicitantes: { total: 1, top: [{ solicitante: 'Ana Prueba', area: 'Obra Lurín', tickets: 10, sin_resolver: 2 }] },
  por_tecnico: [
    { grupo: 'tecnico', tecnico_id: 'u-asis', nombre: 'Asis Uno', resueltos: 4, mismo_periodo: 4, arrastrados: 0, tiempos: { n: 4, mediana_horas: 2, promedio_horas: 3 }, csat: { n: 2, promedio: null, insuficiente: true, satisfechos: 2, pct_satisfaccion: null }, reaperturas: { base: 4, reabiertos: 0 }, asignados_hoy: 1 },
    { grupo: 'otros', tecnico_id: null, nombre: null, resueltos: 3, mismo_periodo: 2, arrastrados: 1, tiempos: { n: 3, mediana_horas: 1, promedio_horas: 1 }, csat: { n: 1, promedio: null, insuficiente: true, satisfechos: 0, pct_satisfaccion: null }, reaperturas: { base: 3, reabiertos: 0 }, asignados_hoy: 0 },
  ],
  anexos: { arrastrados: [], cerrados_sin_encuesta: [] },
  tickets: [{ codigo: 'TCK-0010', titulo: 'Uno', estado: 'cerrado', prioridad: 'media', tipo: 'incidente', nivel_atencion: 'N1', categoria: 'Red', subcategoria: null, area: null, solicitante: 'Ana Prueba', asignado_a: 'u-asis', created_at: '2026-10-01T12:00:00Z', resuelto_at: '2026-10-01T13:30:00Z', horas_resolucion: 1.5, tecnico_id: 'u-asis', encuesta_nivel: 4, en_periodo: 'ambos' }],
  comparacion: null,
};

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(url = '/reportes/tickets', { rol = 'JEFE' } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/reportes/tickets', component: { template: '<div />' } }] });
  router.push(url);
  await router.isReady();
  const auth = useAuthStore();
  auth.user = { id: 'u-jefe' };
  auth.rol = rol;
  wrapper = mount(ReporteTicketsView, { attachTo: document.body, global: { plugins: [router, [PrimeVue, { unstyled: true }]] } });
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

describe('ReporteTicketsView', () => {
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
    expect(dl).toContain('reportes-2026-10-06');
    expect(dl).toContain('Todo el equipo');
  });

  it('el tablero va primero: cifras, gráfico por día, técnicos con «Jefatura y otros», pendientes y el detalle', async () => {
    const { w } = await montar();
    expect(w.find('[data-no-print] [aria-label="Tipo de período"]').exists()).toBe(true);
    expect(w.find('[data-no-print] [aria-label="Tipo de período"]').text()).toContain('Día');
    const titulos = w.findAll('section > div > h2').map((h) => h.text());
    expect(titulos).toEqual([
      '1. Resumen', '2. Por día', '3. Por técnico', '4. Pendientes ahora', '5. Quiénes generaron más tickets',
      '6. Tiempo de resolución por ticket', '7. Atención (horas corridas)', '8. Calidad', '9. Por categoría y por área', '10. Anexos',
    ]);
    const cifras = w.find('#reporte-resumen dl');
    expect(cifras.findAll('dt').map((d) => d.text())).toEqual(['Ingresaron', 'Resueltos', '% resuelto', 'Pendientes', 'Tiempo mediano', 'Satisfacción']);
    expect(cifras.text()).toContain('67%');
    expect(w.find('#reporte-por-dia svg[role="img"]').attributes('aria-label')).toContain('6 ingresaron, 4 resueltos');
    expect(w.find('#reporte-tecnicos').text()).toContain('Jefatura y otros');
    expect(w.find('#reporte-tecnicos').text()).toContain('Sin asignar');
    expect(w.find('#reporte-pendientes').text()).toContain('Asis Uno');
    const atencion = w.find('#reporte-atencion table');
    expect(atencion.findAll('th').map((t) => t.text()).slice(0, 4)).toEqual(['Tiempo', 'Mediana', 'Promedio', 'n']);
    expect(atencion.text()).toContain('1.5 h');
    expect(w.find('#reporte-calidad').text()).toContain('n insuficiente (3)');
    expect(w.find('#reporte-tecnicos').text()).toContain('Asis Uno');
    expect(w.findAll('table[data-libro]').length).toBeGreaterThan(5);
    expect(w.text()).toContain('no terminó');
    expect(w.find('#reporte-glosario-titulo').exists()).toBe(true);
  });

  it('sin la sección por técnico (asistente) no se pinta y el selector de alcance ofrece solo "mi actividad"', async () => {
    insforgeApi.obtenerReporteTickets.mockResolvedValue({ ...JSON.parse(JSON.stringify(REPORTE)), por_tecnico: null });
    const { w } = await montar('/reportes/tickets', { rol: 'ASISTENTE' });
    expect(w.find('#reporte-tecnicos').exists()).toBe(false);
    const opciones = w.findAll('select').at(-1).findAll('option').map((o) => o.text());
    expect(opciones).toEqual(['Todo el equipo', 'Solo mi actividad']);
  });

  it('«Copiar resumen» copia las cifras del tablero en texto para gerencia', async () => {
    const { w } = await montar();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await w.findAll('button').find((b) => b.text() === 'Copiar resumen').trigger('click');
    await espera();
    const texto = writeText.mock.calls[0][0];
    expect(texto.split('\n')[0]).toMatch(/^Mesa de ayuda TI · /);
    expect(texto).toContain('el 67 % ya está resuelto');
    expect(texto).toContain('Asis Uno 4 · Jefatura y otros 3');
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
    // Lo que aportaba el CSV de la bandeja de Tickets, ya retirado: título y asignado hoy.
    expect(cabecera.slice(0, 2)).toEqual(['Código', 'Título']);
    expect(filas[0][0]).toBe('TCK-0010');
    expect(filas[0][1]).toBe('Uno');
    expect(filas[0][cabecera.indexOf('Asignado hoy')]).toBe('Asis Uno');
    expect(cabecera.some((c) => /dni|tel[eé]fono|whatsapp|correo/i.test(c))).toBe(false);
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
