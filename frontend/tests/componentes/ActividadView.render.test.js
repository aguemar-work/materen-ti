// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import ActividadView from '../../src/modules/actividad/ActividadView.vue';

const listActividad = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/insforge.js', () => ({ insforgeApi: { listActividad } }));

it('distingue un fallo de una consulta vacía y muestra ambos tipos de denegación tras reintentar', async () => {
  listActividad.mockRejectedValueOnce(new Error('Error de red')).mockResolvedValueOnce([
    { id: '1', accion: 'acceso_denegado', created_at: '2026-11-09T12:00:00Z' },
    { id: '2', accion: 'revelado_denegado', created_at: '2026-11-10T12:00:00Z' },
    { id: '3', accion: 'purga_ejecutada', created_at: '2026-11-10T08:00:00Z' },
  ]);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/actividad', component: ActividadView }] });
  await router.push('/actividad?vista=denegados');
  const vista = mount(ActividadView, {
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: { EnlaceReporte: true } },
  });
  try {
    await flushPromises();
    expect(vista.get('[role="alert"]').text()).toContain('No se pudo cargar el registro');
    expect(vista.text()).not.toContain('Sin accesos denegados');
    await vista.get('[role="alert"] button').trigger('click');
    await flushPromises();
    const movimientos = vista.findAll('tbody tr').map((fila) => fila.findAll('td')[1].text());
    expect(movimientos).toEqual(['Revelación denegada', 'Acceso denegado']);
    expect(listActividad).toHaveBeenCalledTimes(2);
  } finally {
    vista.unmount();
  }
});
