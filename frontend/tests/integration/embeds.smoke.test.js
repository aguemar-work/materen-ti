// Smoke test de INTEGRACIÓN: una consulta por cada `select()` con embed que
// existe en frontend/src/api/domains, contra el backend real. Nace del
// incidente de producción del 2026-08-17 (docs/HISTORIAL-AUDITORIAS.md,
// hallazgo Q-01): la migración 059 eliminó `areas_obras.ubicacion_id` y
// `empleados.js` seguía pidiendo el embed anidado `areas_obras(nombre,
// ubicaciones(nombre))` — PGRST200 en producción. tickets-api.smoke.test.js
// ya cubría `tickets`; este archivo cubre el resto de dominios con embed,
// para que un cambio de esquema en CUALQUIERA de ellos rompa el build en vez
// de producción.
//
// Mismos requisitos que tickets-api.smoke.test.js (ver ese archivo): 4
// variables de entorno, cuenta de staff DEDICADA a CI. Sin ellas, se omite.
// No verifica datos, solo que la consulta no explote (PGRST200/PGRST100).
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
    '[integración] Faltan INSFORGE_TEST_STAFF_EMAIL/PASSWORD o VITE_INSFORGE_URL/ANON_KEY: se omite el smoke test de embeds contra el API real.',
  );
}

const hoy = new Date();
const hace30dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);

// Un caso por cada select() con embed (o familia de embeds) fuera de
// tickets.js — agrupados por el dominio que los define en domains/*.js.
const CASOS = [
  ['empleados: empresas/areas_obras/ubicaciones (el select del incidente)',
    () => insforgeApi.listEmpleadosPage({ tamPagina: 1 })],
  ['correos: plataformas + asignaciones_cuenta->empleados',
    () => insforgeApi.listCorreosPage({ tamPagina: 1 })],
  ['licencias: empresas + cuentas->asignaciones_cuenta->empleados + asignaciones_licencia->empleados',
    () => insforgeApi.listLicenciasPage({ tamPagina: 1 })],
  ['equipos: tipos_equipo/empresas/equipo_accesorios + asignaciones_equipo->empleados/ubicaciones',
    () => insforgeApi.listEquiposPage({ tamPagina: 1 })],
  ['kb: categorias_ticket',
    () => insforgeApi.listKbPage({ tamPagina: 1 })],
  ['staff: staff_permisos',
    () => insforgeApi.listStaff()],
  ['problemas: tickets->categorias_ticket (categorías recurrentes)',
    () => insforgeApi.listCategoriasRecurrentes()],
  ['reportes de tickets: empleados + categorias_ticket (SELECT_CREADOS)',
    () => insforgeApi.obtenerReporteTickets({ desde: hace30dias.toISOString(), hasta: hoy.toISOString(), asignadoA: '' })],
  ['dashboard: pendientes (plataformas, empleados, equipos, empresas)',
    () => insforgeApi.listPendientes()],
  ['dashboard: búsqueda global (empresas, plataformas, tipos_equipo)',
    () => insforgeApi.buscarGlobal('te')],
  ['tickets: listado (empleados, categorias_ticket, subcategorias_ticket)',
    () => insforgeApi.listTicketsPage({ tamPagina: 1 })],
];

describe.skipIf(!listo)('smoke test de integración — selects con embed del API real', () => {
  beforeAll(async () => {
    const { error } = await getClient().auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (error) throw new Error(`No se pudo iniciar sesión con la cuenta de staff de prueba: ${error.message}`);
  });

  afterAll(async () => {
    await getClient().auth.signOut();
  });

  it.each(CASOS)('%s — no lanza error', async (_descripcion, ejecutar) => {
    await expect(ejecutar()).resolves.toBeTruthy();
  });
});
