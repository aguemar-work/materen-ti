// @vitest-environment happy-dom
//
// Tipo, problema de origen y uso de un artículo de la KB (KEDB, migración 106).
// El uso solo se consulta (y se muestra) en artículos publicados y, si la
// consulta falla, el resto de la ficha no se rompe.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import KbArticuloVinculos from '../../src/modules/kb/KbArticuloVinculos.vue';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: { kpiKbArticulo: vi.fn() },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const ART = (extra = {}) => ({ id: 'k1', titulo: 'Workaround: Caídas', estado: 'publicado', tipo: 'workaround', problema_id: 'p1', ...extra });

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let wrapper;

async function montar(articulo) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:resto(.*)*', component: { template: '<div />' } }] });
  router.push('/');
  await router.isReady();
  wrapper = mount(KbArticuloVinculos, { props: { articulo }, attachTo: document.body, global: { plugins: [router] } });
  for (let i = 0; i < 3; i += 1) await espera();
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  insforgeApi.kpiKbArticulo.mockResolvedValue({ usos_90d: 3, usos_total: 7, ultimo_uso_at: '2026-10-01T10:00:00' });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('KbArticuloVinculos', () => {
  it('muestra el tipo, el enlace al problema de origen y el uso del artículo publicado', async () => {
    const w = await montar(ART());
    expect(insforgeApi.kpiKbArticulo).toHaveBeenCalledWith('k1');
    const texto = w.text();
    expect(w.findAll('dt').map((d) => d.text())).toEqual(['Tipo', 'Uso en tickets', 'Último uso']);
    expect(w.find('dd').text()).toBe('Workaround');
    expect(texto).toContain('3 en 90 días · 7 en total');
    expect(texto).toContain('Último uso');
    const enlace = w.find('a[href="/problemas/p1"]');
    expect(enlace.exists()).toBe(true);
    expect(enlace.text()).toBe('Ver el problema de origen');
  });

  it('un artículo sin problema no enlaza a ninguno', async () => {
    const w = await montar(ART({ tipo: 'solucion', problema_id: null }));
    expect(w.find('a').exists()).toBe(false);
    expect(w.text()).toContain('Solución');
  });

  it('un artículo que no está publicado no consulta ni muestra el uso', async () => {
    const w = await montar(ART({ estado: 'en_revision' }));
    expect(insforgeApi.kpiKbArticulo).not.toHaveBeenCalled();
    expect(w.text()).not.toContain('Uso en tickets');
    expect(w.text()).toContain('Workaround');
  });

  it('si la consulta del uso falla, no inventa una cifra y el tipo se sigue viendo', async () => {
    insforgeApi.kpiKbArticulo.mockRejectedValue({ code: '42501', message: 'x' });
    const w = await montar(ART());
    expect(w.text()).not.toContain('Uso en tickets');
    expect(w.text()).not.toContain('Sin registrar');
    expect(w.text()).toContain('Workaround');
  });
});
