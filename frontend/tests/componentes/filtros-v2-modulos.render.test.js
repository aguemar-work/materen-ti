// @vitest-environment happy-dom
//
// Filtros V2 (vistas + chips + URL, 2026-09-25) en Problemas y Actividad:
// los dos módulos cuyo modelo cambió más allá de "segmentado → pestañas".
// - Problemas: la vista por defecto pasa a "Abiertos" y la etapa del ciclo
//   es un chip que se poda en "Cerrados".
// - Actividad: filtra en el cliente sobre los últimos 200 registros; las
//   vistas agrupan acciones y los conteos responden a los chips.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ProblemasView from '../../src/modules/problemas/ProblemasView.vue';
import ActividadView from '../../src/modules/actividad/ActividadView.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    listProblemasPage: vi.fn(),
    conteosProblemasPorVista: vi.fn(),
    nombresStaff: vi.fn(),
    listActividad: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function montar(Vista, url, rutas) {
  const router = createRouter({ history: createMemoryHistory(), routes: rutas });
  router.push(url);
  await router.isReady();
  const w = mount(Vista, { global: { plugins: [router], stubs: { ProblemaForm: true } } });
  await flush();
  return { w, router };
}

const RUTAS_PROBLEMAS = [
  { path: '/problemas', component: { template: '<div />' } },
  { path: '/problemas/:id', component: { template: '<div />' } },
];
const RUTAS_ACTIVIDAD = [{ path: '/actividad', component: { template: '<div />' } }];

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  insforgeApi.listProblemasPage.mockResolvedValue({ items: [], total: 0 });
  insforgeApi.conteosProblemasPorVista.mockResolvedValue({ abiertos: 2, cerrados: 1, todos: 3 });
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 's1', nombre: 'Sofía' }]);
});

describe('ProblemasView — filtros V2', () => {
  it('arranca en "Abiertos": los 3 estados vigentes, no todos', async () => {
    const { w } = await montar(ProblemasView, '/problemas', RUTAS_PROBLEMAS);
    expect(insforgeApi.listProblemasPage.mock.calls.at(-1)[0].estados).toEqual(['abierto', 'diagnostico', 'acciones']);
    const vistas = w.find('[role="group"][aria-label="Vista de problemas"]').findAll('button');
    expect(vistas.map((b) => b.text().replace(/\d+/g, '').trim())).toEqual(['Todos', 'Abiertos', 'Cerrados']);
    // Vacío en "Abiertos" con problemas en otras vistas: buena noticia.
    expect(w.text()).toContain('Nada abierto');
  });

  it('el chip Etapa refina "Abiertos" y se poda al pasar a "Cerrados"', async () => {
    const { router } = await montar(ProblemasView, '/problemas?vista=abiertos&etapa=diagnostico', RUTAS_PROBLEMAS);
    expect(insforgeApi.listProblemasPage.mock.calls.at(-1)[0].estados).toEqual(['diagnostico']);
    await router.replace('/problemas?vista=cerrados&etapa=diagnostico');
    await flush();
    await flush();
    expect(insforgeApi.listProblemasPage.mock.calls.at(-1)[0].estados).toEqual(['cerrado']);
    expect(router.currentRoute.value.query.etapa).toBeUndefined();
  });

  it('"Sin responsable" viaja como centinela junto a la severidad', async () => {
    await montar(ProblemasView, '/problemas?responsable=sin&severidad=critica,alta', RUTAS_PROBLEMAS);
    expect(insforgeApi.listProblemasPage.mock.calls.at(-1)[0]).toMatchObject({
      responsables: ['sin'], severidades: ['critica', 'alta'],
    });
  });
});

describe('ActividadView — filtros V2 (en el cliente)', () => {
  const hoy = new Date().toISOString();
  beforeEach(() => {
    insforgeApi.listActividad.mockResolvedValue([
      { id: 1, accion: 'ver', user_email: 'jefe@x.pe', plataforma: 'Gmail', created_at: hoy },
      { id: 2, accion: 'copiar', user_email: 'ana@x.pe', plataforma: 'Gmail', created_at: hoy },
      { id: 3, accion: 'entrega_abierta', user_email: null, plataforma: 'ERP', created_at: hoy },
      { id: 4, accion: 'acceso_denegado', user_email: 'ana@x.pe', plataforma: 'ERP', created_at: hoy },
    ]);
  });

  const conteos = (w) => w.find('[role="group"][aria-label="Vista de actividad"]').findAll('button').map((b) => b.text().replace(/\s+/g, ' ').trim());

  it('las vistas agrupan acciones y cuentan cada grupo', async () => {
    const { w } = await montar(ActividadView, '/actividad', RUTAS_ACTIVIDAD);
    expect(conteos(w)).toEqual(['Todo 4', 'Contraseñas 2', 'Entregas 1', 'Denegados 1']);
  });

  it('el chip "Quién" (incluido el empleado sin sesión) recalcula los conteos', async () => {
    const { w } = await montar(ActividadView, '/actividad?quien=ana@x.pe', RUTAS_ACTIVIDAD);
    expect(conteos(w)).toEqual(['Todo 2', 'Contraseñas 1', 'Entregas 0', 'Denegados 1']);
    const { w: w2 } = await montar(ActividadView, '/actividad?vista=entregas&quien=enlace', RUTAS_ACTIVIDAD);
    expect(w2.text()).toContain('Empleado, vía enlace');
  });
});
