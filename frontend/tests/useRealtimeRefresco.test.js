// Tests del debounce/coalescencia de refrescos disparados por realtime
// (crearRefrescoDebounced) — ver P-02 en docs/HISTORIAL-AUDITORIAS.md.
// El wrapper Vue (useRealtimeRefresco en sí, con onMounted/onUnmounted) no
// se prueba acá, mismo criterio que el resto del pegamento de lifecycle.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crearRefrescoDebounced, REFRESCO_LISTA_DEBOUNCE_MS } from '../src/composables/useRealtimeRefresco.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function deferido() {
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  return { promesa, resolver };
}

describe('crearRefrescoDebounced', () => {
  it('un evento aislado dispara fn una sola vez (leading), sin llamada trailing', async () => {
    const fn = vi.fn().mockResolvedValue();
    const refrescar = crearRefrescoDebounced(fn);

    refrescar('a');
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('una ráfaga de eventos se coalesce en leading + una trailing', async () => {
    const fn = vi.fn().mockResolvedValue();
    const refrescar = crearRefrescoDebounced(fn);

    refrescar('a');
    expect(fn).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(10);
      refrescar(`evento-${i}`);
    }
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('dos ráfagas separadas por más que el delay producen cada una su propio leading+trailing', async () => {
    const fn = vi.fn().mockResolvedValue();
    const refrescar = crearRefrescoDebounced(fn);

    refrescar('burst1-a');
    refrescar('burst1-b');
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);
    expect(fn).toHaveBeenCalledTimes(2);

    refrescar('burst2-a');
    expect(fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('no superpone una segunda ejecución mientras la primera está en curso; dispara una pasada de alcance al terminar', async () => {
    const { promesa, resolver } = deferido();
    const fn = vi.fn().mockReturnValueOnce(promesa).mockResolvedValue();
    const refrescar = crearRefrescoDebounced(fn);

    refrescar('a');
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);
    refrescar('b');
    refrescar('c');
    expect(fn).toHaveBeenCalledTimes(1); // sigue en curso, no se superpone

    resolver();
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('la llamada de alcance usa el último payload recibido, no el primero', async () => {
    const fn = vi.fn().mockResolvedValue();
    const refrescar = crearRefrescoDebounced(fn);

    refrescar('primero');
    refrescar('segundo');
    refrescar('ultimo');
    await vi.advanceTimersByTimeAsync(REFRESCO_LISTA_DEBOUNCE_MS + 10);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 'primero');
    expect(fn).toHaveBeenNthCalledWith(2, 'ultimo');
  });
});
