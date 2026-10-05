// Una sola llamada para el Inicio: `getResumen()` (RPC `dashboard_resumen`) y
// el store que comparten el Inicio y el menú. Se prueba contra un cliente
// FALSO que cuenta cada consulta: el presupuesto es UNA llamada de datos.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { resumenVacio, resumenCompleto } from './stubs/resumen-inicio.js';

const cliente = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(() => { throw new Error('el Inicio no debe consultar tablas'); }),
}));
vi.mock('../src/api/client.js', () => ({
  getClient: () => ({ database: { rpc: cliente.rpc, from: cliente.from } }),
}));

import { dashboardApi } from '../src/api/domains/dashboard.js';
import { useDashboardStore } from '../src/stores/dashboard.js';

const responde = (data) => cliente.rpc.mockResolvedValue({ data, error: null });
const falla = (error) => cliente.rpc.mockResolvedValue({ data: null, error });

beforeEach(() => {
  setActivePinia(createPinia());
  cliente.rpc.mockReset();
  cliente.from.mockClear();
});

describe('getResumen', () => {
  it('llama a la RPC dashboard_resumen sin argumentos, una vez, y no toca tablas', async () => {
    responde(resumenVacio());
    await dashboardApi.getResumen();
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(cliente.rpc).toHaveBeenCalledWith('dashboard_resumen');
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it('devuelve el resumen con la forma del contrato y errores siempre como arreglo', async () => {
    const { errores: _quitado, ...sinErrores } = resumenCompleto();
    responde(sinErrores);
    const r = await dashboardApi.getResumen();
    expect(r.errores).toEqual([]);
    expect(r.tickets.mios_total).toBe(7);
    expect(r.custodia_hoy).toHaveLength(2);
  });

  it('acepta que el SDK devuelva el jsonb dentro de un arreglo', async () => {
    responde([resumenVacio()]);
    expect((await dashboardApi.getResumen()).errores).toEqual([]);
  });

  it('una sección null (sin módulo) sigue null: no se convierte en "vacía"', async () => {
    responde(resumenVacio({ problemas: null, licencias_por_vencer: null }));
    const r = await dashboardApi.getResumen();
    expect(r.problemas).toBeNull();
    expect(r.licencias_por_vencer).toBeNull();
  });

  it('una RPC que falla (backend sin la 103) lanza un error en español, sin el texto de Postgres', async () => {
    falla({ code: 'PGRST202', message: 'Could not find the function public.dashboard_resumen in the schema cache' });
    await expect(dashboardApi.getResumen()).rejects.toThrow('No se pudo cargar el resumen del Inicio.');
  });

  it('un error de permisos se traduce', async () => {
    falla({ code: '42501', message: 'No autorizado' });
    await expect(dashboardApi.getResumen()).rejects.toThrow('No tiene permiso para esta acción.');
  });

  it('una respuesta vacía no es "al día": es un error', async () => {
    responde(null);
    await expect(dashboardApi.getResumen()).rejects.toThrow();
  });
});

describe('store del Inicio', () => {
  it('cargar guarda el resumen, los errores de sección y la hora de la carga', async () => {
    responde(resumenVacio({ problemas: null, errores: ['problemas'] }));
    const store = useDashboardStore();
    await store.cargar();
    expect(store.resumen.errores).toEqual(['problemas']);
    expect(store.errores).toEqual(['problemas']);
    expect(store.error).toBe('');
    expect(store.cargando).toBe(false);
    expect(store.ultimaCarga).toBeTruthy();
  });

  it('el Inicio y el menú que piden a la vez comparten UNA llamada', async () => {
    let resolver;
    cliente.rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    const store = useDashboardStore();
    const desdeMenu = store.cargar({ silencioso: true });
    const desdeInicio = store.cargar();
    expect(store.cargando).toBe(true); // el Inicio sí enciende la línea de carga
    resolver({ data: resumenCompleto(), error: null });
    await Promise.all([desdeMenu, desdeInicio]);
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
    expect(store.cargando).toBe(false);
  });

  it('una carga silenciosa no enciende "cargando"', async () => {
    let resolver;
    cliente.rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    const store = useDashboardStore();
    const p = store.cargar({ silencioso: true });
    expect(store.cargando).toBe(false);
    resolver({ data: resumenVacio(), error: null });
    await p;
  });

  it('recargar conserva el resumen anterior mientras llega el nuevo (stale-while-revalidate)', async () => {
    responde(resumenCompleto());
    const store = useDashboardStore();
    await store.cargar();
    const anterior = store.resumen;
    let resolver;
    cliente.rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
    const p = store.cargar();
    expect(store.resumen).toBe(anterior);
    expect(store.cargando).toBe(true);
    resolver({ data: resumenVacio(), error: null });
    await p;
    expect(store.resumen.tickets.mios_total).toBe(0);
  });

  it('si la RPC falla entera guarda el error, deja el resumen en null y NO lanza', async () => {
    falla({ code: 'PGRST202', message: 'x' });
    const store = useDashboardStore();
    await expect(store.cargar()).resolves.toBeUndefined();
    expect(store.resumen).toBeNull();
    expect(store.error).toBe('No se pudo cargar el resumen del Inicio.');
    expect(store.cargando).toBe(false);
  });

  it('un fallo al actualizar conserva el último resumen bueno y reintentar lo limpia', async () => {
    responde(resumenCompleto());
    const store = useDashboardStore();
    await store.cargar();
    falla({ code: '08006', message: 'connection failure' });
    await store.cargar({ silencioso: true });
    expect(store.error).toBeTruthy();
    expect(store.resumen.tickets.mios_total).toBe(7);
    responde(resumenVacio());
    await store.cargar();
    expect(store.error).toBe('');
    expect(store.resumen.tickets.mios_total).toBe(0);
  });

  it('sinAsignar (badge del menú) sale del resumen y baja cuando alguien toma el ticket', async () => {
    const store = useDashboardStore();
    expect(store.sinAsignar).toBe(0); // antes de la primera carga
    responde(resumenCompleto());
    await store.cargar();
    expect(store.sinAsignar).toBe(1);
    responde(resumenVacio());
    await store.cargar({ silencioso: true });
    expect(store.sinAsignar).toBe(0);
  });

  it('sin módulo tickets el badge es 0', async () => {
    responde(resumenVacio({ tickets: null }));
    const store = useDashboardStore();
    await store.cargar();
    expect(store.sinAsignar).toBe(0);
  });

  describe('cargarSiHaceFalta (lo que usa el Inicio al montarse)', () => {
    it('sin ningún intento previo, carga', async () => {
      responde(resumenVacio());
      await useDashboardStore().cargarSiHaceFalta();
      expect(cliente.rpc).toHaveBeenCalledTimes(1);
    });

    it('si el menú acaba de cargar, NO repite la llamada (el chunk del Inicio llega después)', async () => {
      responde(resumenVacio());
      const store = useDashboardStore();
      await store.cargar({ silencioso: true });
      await store.cargarSiHaceFalta();
      expect(cliente.rpc).toHaveBeenCalledTimes(1);
    });

    it('un fallo reciente tampoco se reintenta a espaldas de quien lo va a leer', async () => {
      falla({ code: 'PGRST202', message: 'x' });
      const store = useDashboardStore();
      await store.cargar({ silencioso: true });
      await store.cargarSiHaceFalta();
      expect(cliente.rpc).toHaveBeenCalledTimes(1);
      expect(store.error).toBeTruthy();
      // "Reintentar" sí llama, siempre.
      responde(resumenVacio());
      await store.cargar();
      expect(cliente.rpc).toHaveBeenCalledTimes(2);
      expect(store.error).toBe('');
    });

    it('con la carga en curso se une a ella', async () => {
      let resolver;
      cliente.rpc.mockReturnValue(new Promise((r) => { resolver = r; }));
      const store = useDashboardStore();
      const a = store.cargar({ silencioso: true });
      const b = store.cargarSiHaceFalta();
      resolver({ data: resumenVacio(), error: null });
      await Promise.all([a, b]);
      expect(cliente.rpc).toHaveBeenCalledTimes(1);
    });

    it('pasada la edad máxima vuelve a cargar', async () => {
      responde(resumenVacio());
      const store = useDashboardStore();
      await store.cargar();
      await store.cargarSiHaceFalta({ maxEdadMs: -1 });
      expect(cliente.rpc).toHaveBeenCalledTimes(2);
    });
  });

  it('cada instancia de Pinia tiene su propia carga en curso', async () => {
    responde(resumenVacio());
    await useDashboardStore().cargar();
    setActivePinia(createPinia());
    await useDashboardStore().cargar();
    expect(cliente.rpc).toHaveBeenCalledTimes(2);
  });
});
