// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import AppSearch from '../../src/components/shared/AppSearch.vue';

const { buscarGlobal, push } = vi.hoisted(() => ({
  buscarGlobal: vi.fn(),
  push: vi.fn(),
}));
vi.mock('../../src/api/insforge.js', () => ({ insforgeApi: { buscarGlobal } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

const vacio = { empleados: [], cuentas: [], equipos: [], tickets: [], licencias: [] };

describe('AppSearch', () => {
  let vista;
  beforeEach(async () => {
    vi.useFakeTimers();
    buscarGlobal.mockReset();
    push.mockReset();
    vista = mount(AppSearch, { attachTo: document.body });
    await vista.get('button').trigger('click');
  });

  afterEach(() => {
    vista.unmount();
    vi.useRealTimers();
  });

  it('mantiene el foco en la búsqueda y abre con Enter el resultado señalado', async () => {
    buscarGlobal.mockResolvedValue({
      ...vacio,
      empleados: [{ id: 'persona-1', nombres: 'Ana', apellidos: 'Pérez' }],
    });
    const campo = vista.get('[role="combobox"]');
    await campo.setValue('ana');
    await vi.advanceTimersByTimeAsync(300);
    await campo.trigger('keydown', { key: 'ArrowDown' });

    const opcion = document.querySelector('[role="option"]');
    expect(campo.attributes('aria-activedescendant')).toBe(opcion.id);
    expect(opcion.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(campo.element);

    await campo.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(push).toHaveBeenCalledWith('/empleados/persona-1');
    expect(vista.emitted('navegado')).toHaveLength(1);
  });

  it('distingue una consulta incompleta de una vacía y reintenta con el mismo término', async () => {
    buscarGlobal.mockResolvedValueOnce({ ...vacio, incompleta: true }).mockResolvedValueOnce(vacio);
    const campo = vista.get('[role="combobox"]');
    await campo.setValue('ana');
    await vi.advanceTimersByTimeAsync(300);
    expect(vista.get('[role="status"]').text()).toContain('No se pudieron consultar todos los módulos');

    await campo.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(buscarGlobal.mock.calls).toEqual([['ana'], ['ana']]);
    expect(vista.get('[role="status"]').text()).toContain('Sin resultados');
  });
});
