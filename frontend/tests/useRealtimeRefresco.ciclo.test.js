// @vitest-environment happy-dom
//
// Ciclo de vida de useRealtimeRefresco: desmontar una vista nunca rompe, aunque
// InsForge no esté configurado (sin VITE_INSFORGE_* en un worktree, getClient()
// lanza). Antes onUnmounted volvía a llamar a getClient() fuera del try y el
// error tumbaba los render tests de Empleados, Equipos y Licencias.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';

const { getClient } = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('../src/api/client.js', () => ({ getClient }));

import { useRealtimeRefresco } from '../src/composables/useRealtimeRefresco.js';

const Vista = defineComponent({
  setup() {
    useRealtimeRefresco('equipos:list', () => {});
    return () => h('div');
  },
});

beforeEach(() => {
  getClient.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('useRealtimeRefresco — ciclo de vida', () => {
  it('sin cliente configurado, montar avisa y desmontar no lanza', async () => {
    getClient.mockImplementation(() => { throw new Error('InsForge no configurado'); });
    const w = mount(Vista);
    await flushPromises();
    expect(console.warn).toHaveBeenCalled();

    expect(() => w.unmount()).not.toThrow();
    expect(getClient).toHaveBeenCalledTimes(1);
  });

  it('con cliente, desmontar suelta el listener y la suscripción del mismo canal', async () => {
    const realtime = {
      isConnected: true,
      connect: vi.fn(),
      subscribe: vi.fn().mockResolvedValue({ ok: true }),
      on: vi.fn(),
      off: vi.fn(),
      unsubscribe: vi.fn(),
    };
    getClient.mockReturnValue({ realtime });
    const w = mount(Vista);
    await flushPromises();
    expect(realtime.subscribe).toHaveBeenCalledWith('equipos:list');

    w.unmount();
    expect(realtime.off).toHaveBeenCalledWith('changed', realtime.on.mock.calls[0][1]);
    expect(realtime.unsubscribe).toHaveBeenCalledWith('equipos:list');
  });
});
