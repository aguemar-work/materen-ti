// Smoke test de INTEGRACIÓN: golpea el backend real de InsForge (no el
// stub de tests/stubs/insforge-sdk.js, que solo intercepta el import
// `npm:@insforge/sdk` de las edge functions) — atrapa desincronizaciones
// esquema↔frontend que un test unitario no puede ver, como un `select`
// que pide una columna ya eliminada de la tabla (ver el 400 en la ficha
// de ticket del 2026-07-29: `getTicket()` seleccionaba
// `es_base_conocimiento` después de que la migración 031 la eliminó).
//
// Requiere una cuenta de staff DEDICADA para CI (nunca la cuenta de una
// persona real) + la configuración del proyecto que ya usa la app:
//   VITE_INSFORGE_URL, VITE_INSFORGE_ANON_KEY        (ya existen para el build)
//   INSFORGE_TEST_STAFF_EMAIL, INSFORGE_TEST_STAFF_PASSWORD  (nuevas, solo para esto)
//
// Sin esas 4 variables el test se OMITE (no falla) — mismo patrón que
// tests/db/triggers.test.sql en CI ("se omite si faltan secrets"). Para
// correrlo local: agregar INSFORGE_TEST_STAFF_EMAIL/PASSWORD al .env
// (además de las VITE_INSFORGE_* que ya pide el proyecto) y
// `npm run test:integration`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getClient } from '../../src/api/client.js';
import { insforgeApi } from '../../src/api/insforge.js';

const EMAIL = process.env.INSFORGE_TEST_STAFF_EMAIL;
const PASSWORD = process.env.INSFORGE_TEST_STAFF_PASSWORD;
const BASE_URL = import.meta.env.VITE_INSFORGE_URL;
const ANON_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY;

const listo = Boolean(EMAIL && PASSWORD && BASE_URL && ANON_KEY);

if (!listo) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integración] Faltan INSFORGE_TEST_STAFF_EMAIL/PASSWORD o VITE_INSFORGE_URL/ANON_KEY: se omite el smoke test contra el API real.',
  );
}

describe.skipIf(!listo)('smoke test de integración — API real de tickets', () => {
  beforeAll(async () => {
    const { error } = await getClient().auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw new Error(`No se pudo iniciar sesión con la cuenta de staff de prueba: ${error.message}`);
  });

  afterAll(async () => {
    await getClient().auth.signOut();
  });

  it('getTicket() sobre un ticket real no lanza error (detecta desincronización esquema↔frontend)', async () => {
    // Sin fixtures ni escritura: toma el primer ticket que ya exista.
    const { items } = await insforgeApi.listTicketsPage({ pagina: 1, tamPagina: 1 });
    expect(Array.isArray(items)).toBe(true);

    if (items.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[integración] El proyecto de prueba no tiene tickets — se omite la verificación de getTicket().');
      return;
    }

    const ticket = await insforgeApi.getTicket(items[0].id);
    expect(ticket).toBeTruthy();
    expect(ticket.id).toBe(items[0].id);
    expect(ticket.codigo).toBeTruthy();
  });
});
