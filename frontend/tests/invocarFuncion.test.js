import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeSdk = vi.fn();
vi.mock('../src/api/client.js', () => ({
  getClient: () => ({ functions: { invoke: invokeSdk } }),
}));

const { crearInvocador } = await import('../src/api/invocarFuncion.js');
const { MENSAJE_ERROR_RED, errorRedActivo, reintentarErrorRed, cancelarErrorRed } = await import(
  '../src/core/error-red.js'
);

const ERROR_RED = { error: 'NETWORK_ERROR' };

describe('crearInvocador', () => {
  beforeEach(() => {
    invokeSdk.mockReset();
    cancelarErrorRed();
  });

  it('invoca la edge function indicada y devuelve el payload', async () => {
    invokeSdk.mockResolvedValue({ data: { ok: true, codigo: 'TCK-0001' }, error: null });

    const invocar = crearInvocador('tickets', () => 'no se usa');
    await expect(invocar({ action: 'crear' })).resolves.toEqual({ ok: true, codigo: 'TCK-0001' });
    expect(invokeSdk).toHaveBeenCalledWith('tickets', { body: { action: 'crear' } });
  });

  // Las 3 vías deben adjuntar `code` al error: antes solo lo hacían
  // tickets/encuestas y no credenciales, y nada detectaba la diferencia.
  it('ante { ok:false, code } lanza el mensaje del dominio y conserva el code', async () => {
    invokeSdk.mockResolvedValue({ data: { ok: false, code: 'no_existe' }, error: null });

    const invocar = crearInvocador('credenciales', (code) => `traducido:${code}`);
    await expect(invocar({ action: 'revelar' })).rejects.toMatchObject({
      message: 'traducido:no_existe',
      code: 'no_existe',
    });
  });

  it('con reintentarRed:false no activa el fallback global', async () => {
    invokeSdk.mockResolvedValue({ data: null, error: ERROR_RED });

    const invocar = crearInvocador('credenciales', () => 'x');
    await expect(invocar({ action: 'accesoDenegado' }, { reintentarRed: false })).rejects.toThrow(
      MENSAJE_ERROR_RED,
    );
    expect(errorRedActivo.value).toBe(false);
    expect(invokeSdk).toHaveBeenCalledTimes(1);
  });

  it('tras el fallback de red repite la MISMA petición conservando las opciones', async () => {
    invokeSdk
      .mockResolvedValueOnce({ data: null, error: ERROR_RED })
      .mockResolvedValueOnce({ data: { ok: true, valor: 7 }, error: null });

    const invocar = crearInvocador('encuestas', () => 'x');
    const promesa = invocar({ action: 'abrir', slug: 'abc' });

    await vi.waitFor(() => expect(errorRedActivo.value).toBe(true));
    reintentarErrorRed();

    await expect(promesa).resolves.toEqual({ ok: true, valor: 7 });
    expect(invokeSdk).toHaveBeenCalledTimes(2);
    expect(invokeSdk.mock.calls[1]).toEqual(['encuestas', { body: { action: 'abrir', slug: 'abc' } }]);
  });

  it('un error de transporte que no es de red se propaga sin fallback', async () => {
    invokeSdk.mockResolvedValue({ data: null, error: { message: 'boom', statusCode: 500 } });

    const invocar = crearInvocador('tickets', () => 'x');
    await expect(invocar({ action: 'catalogo' })).rejects.toThrow('boom');
    expect(errorRedActivo.value).toBe(false);
  });

  // Ciclo 20 bis: las 4 edge functions espejan `code` en `error` (body) en
  // toda respuesta no-2xx para que el SDK lo conserve — @insforge/sdk arma
  // un InsForgeError con esas claves extra (incluida `code`) en vez de
  // descartar el body entero. Antes de esto, un 401/403/429/500 real
  // llegaba SIEMPRE como "Request failed: <statusText>" en inglés, sin
  // pasar nunca por `mensajeError`.
  it('ante un error no-2xx con .code (401/403/429/500 reales) traduce igual que un { ok:false, code }', async () => {
    invokeSdk.mockResolvedValue({
      data: null,
      error: { message: '', statusCode: 401, code: 'no_autenticado' },
    });

    const invocar = crearInvocador('credenciales', (code) => `traducido:${code}`);
    await expect(invocar({ action: 'revelar' })).rejects.toMatchObject({
      message: 'traducido:no_autenticado',
      code: 'no_autenticado',
    });
  });
});
