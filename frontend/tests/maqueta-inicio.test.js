// La maqueta simula `dashboard_resumen` con los mismos datos inventados del
// resto de la maqueta y permite probar los cinco escenarios del Inicio:
// normal, al día, sección con error, RPC que falla entera y ASISTENTE sin
// módulos. El escenario se elige con `?maqueta=...` al cargar la página
// (src/maqueta/inicio.js).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { construirFeedPendientes } from '../src/modules/dashboard/pendientesFeed.js';
import { normalizarResumen, ticketsSinAsignar, SECCIONES_RESUMEN } from '../src/core/resumen-inicio.js';

// Carga una copia NUEVA de la maqueta con el escenario pedido.
async function maquetaCon(escenario) {
  vi.resetModules();
  globalThis.location = { search: escenario ? `?maqueta=${escenario}` : '' };
  const { getClient } = await import('../src/maqueta/client.js');
  return getClient();
}
const resumenDe = async (cliente) => {
  const { data, error } = await cliente.database.rpc('dashboard_resumen');
  return { data, error };
};

afterEach(() => { delete globalThis.location; });
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => {}));

describe('maqueta — escenario normal', () => {
  it('devuelve las 14 claves del contrato y ningún error', async () => {
    const { data, error } = await resumenDe(await maquetaCon());
    expect(error).toBeNull();
    expect(Object.keys(data).sort()).toEqual([
      'actas_pendientes', 'cuentas_sin_password', 'custodia_hoy', 'encuestas_sin_responder',
      'equipos_sin_devolver', 'errores', 'garantias_por_vencer', 'generado_en', 'kpis', 'licencias_por_vencer',
      'problemas', 'rotaciones_pendientes', 'solicitudes_abiertas', 'tickets',
    ]);
    expect(data.errores).toEqual([]);
    for (const s of SECCIONES_RESUMEN) expect(data[s], s).not.toBeUndefined();
  });

  it('tiene críticos y atención, con datos coherentes con el resto de la maqueta', async () => {
    const { data } = await resumenDe(await maquetaCon());
    const feed = construirFeedPendientes(normalizarResumen(data));
    expect(feed.filter((i) => i.tier === 1).length).toBeGreaterThan(0);
    expect(feed.filter((i) => i.tier === 2).length).toBeGreaterThan(0);
    // Los mismos hechos que dicen datos.js: ESET y SketchUp vencidas, LAP-004 sin garantía,
    // la cuenta c07/c13 sin contraseña, el celular de Pedro Ticona sin devolver.
    const keys = feed.map((i) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['lic-l03', 'lic-l07', 'sinpw-c07', 'sinpw-c13', 'rotar-c12', 'rotar-c04']));
    expect(data.equipos_sin_devolver.map((e) => e.codigo)).toEqual(['CEL-001']);
    expect(data.equipos_sin_devolver[0].empleado).toBe('Pedro Ticona Apaza');
    expect(data.licencias_por_vencer.find((l) => l.licencia_id === 'l03').vencida).toBe(true);
    expect(data.licencias_por_vencer.find((l) => l.licencia_id === 'l02').vencida).toBe(false);
  });

  it('los tickets de la RPC son los de la tabla: sin asignar = los vigentes sin responsable', async () => {
    const cliente = await maquetaCon();
    const { data } = await resumenDe(cliente);
    expect(data.tickets.sin_asignar.map((t) => t.codigo).sort()).toEqual(['TCK-0115', 'TCK-0117', 'TCK-0118']);
    expect(data.tickets.sin_vincular.map((t) => t.codigo)).toEqual(['TCK-0115']);
    expect(data.tickets.vencidos).toBeNull();
    // La cola del menú coincide con el feed (un asunto por ticket).
    const feed = construirFeedPendientes(normalizarResumen(data));
    const delMenu = ticketsSinAsignar(data);
    const sinAsignarEnFeed = feed.filter((i) => i.key.startsWith('tk-') && i.contexto.includes('Sin asignar')).length;
    expect(sinAsignarEnFeed).toBe(delMenu);
  });

  it('"Mis tickets" son los del usuario, la prioridad más alta primero y como mucho 5', async () => {
    const { data } = await resumenDe(await maquetaCon());
    const { mios, mios_total } = data.tickets;
    expect(mios.length).toBeLessThanOrEqual(5);
    expect(mios_total).toBeGreaterThanOrEqual(mios.length);
    expect(mios[0].prioridad).toBe('urgente'); // TCK-0112
    expect(mios.every((t) => !['resuelto', 'cerrado', 'rechazado'].includes(t.estado))).toBe(true);
  });

  it('hoy en custodia lista los movimientos con hora, evento, equipo y persona', async () => {
    const { data } = await resumenDe(await maquetaCon());
    expect(data.custodia_hoy.length).toBeGreaterThan(0);
    expect(data.custodia_hoy.length).toBeLessThanOrEqual(10);
    expect(data.custodia_hoy[0]).toMatchObject({
      hora: expect.stringMatching(/^\d{2}:\d{2}$/), evento: expect.stringMatching(/^(entregado|devuelto)$/),
      equipo_codigo: expect.any(String), persona: expect.any(String),
    });
  });

  it('una entrega hecha durante la sesión aparece en custodia de hoy', async () => {
    const cliente = await maquetaCon();
    const antes = (await resumenDe(cliente)).data.custodia_hoy.length;
    await cliente.database.from('asignaciones_equipo').insert([{
      equipo_id: 'q03', empleado_id: 'e09', ubicacion_id: null, fecha_inicio: '2026-10-01', fecha_fin: null,
    }]);
    const despues = (await resumenDe(cliente)).data.custodia_hoy;
    expect(despues.length).toBe(antes + 1);
    expect(despues.some((m) => m.equipo_codigo === 'LAP-003' && m.persona.startsWith('Sofía'))).toBe(true);
  });

  it('acta sin adjuntar: la maqueta simula la migración 110 con las entregas recientes sin acta', async () => {
    const { data } = await resumenDe(await maquetaCon());
    expect(data.actas_pendientes.length).toBeGreaterThan(0);
    expect(data.actas_pendientes[0]).toMatchObject({ asignacion_id: expect.any(String), equipo_id: expect.any(String), dias: expect.any(Number) });
  });
});

describe('maqueta — escenario al día', () => {
  it('no queda nada pendiente en el feed y errores está vacío', async () => {
    const { data } = await resumenDe(await maquetaCon('aldia'));
    expect(data.errores).toEqual([]);
    expect(construirFeedPendientes(normalizarResumen(data))).toEqual([]);
    expect(ticketsSinAsignar(data)).toBe(0);
  });

  it('conserva "Mis tickets" y "Hoy en custodia"', async () => {
    const { data } = await resumenDe(await maquetaCon('aldia'));
    expect(data.tickets.mios_total).toBeGreaterThan(0);
    expect(data.custodia_hoy.length).toBeGreaterThan(0);
  });
});

describe('maqueta — sección con error', () => {
  it('problemas llega null con su nombre en errores, y el resto sigue', async () => {
    const { data } = await resumenDe(await maquetaCon('errorseccion'));
    expect(data.errores).toEqual(['problemas']);
    expect(data.problemas).toBeNull();
    expect(data.tickets).not.toBeNull();
  });

  it('"errorseccion" falla solo la primera vez: el reintento la corrige', async () => {
    const cliente = await maquetaCon('errorseccion');
    await resumenDe(cliente);
    const { data } = await resumenDe(cliente);
    expect(data.errores).toEqual([]);
    expect(data.problemas).not.toBeNull();
  });

  it('"errorseccion-fijo" siempre falla', async () => {
    const cliente = await maquetaCon('errorseccion-fijo');
    await resumenDe(cliente);
    expect((await resumenDe(cliente)).data.errores).toEqual(['problemas']);
  });
});

describe('maqueta — la RPC falla entera', () => {
  it('"errortotal": la primera llamada devuelve error y el reintento responde', async () => {
    const cliente = await maquetaCon('errortotal');
    const primera = await resumenDe(cliente);
    expect(primera.data).toBeNull();
    expect(primera.error).toMatchObject({ code: 'PGRST202' });
    const segunda = await resumenDe(cliente);
    expect(segunda.error).toBeNull();
    expect(segunda.data.errores).toEqual([]);
  });

  it('"sinrpc": falla siempre (backend sin la migración 103)', async () => {
    const cliente = await maquetaCon('sinrpc');
    expect((await resumenDe(cliente)).error).toBeTruthy();
    expect((await resumenDe(cliente)).error).toBeTruthy();
  });
});

describe('maqueta — ASISTENTE sin algunos módulos', () => {
  it('la sesión es la de Diego Huamán y las secciones sin módulo llegan null (sin error)', async () => {
    const cliente = await maquetaCon('asistente');
    const { data: sesion } = await cliente.auth.getCurrentUser();
    expect(sesion.user.id).toBe('u-asis-1');
    const { data } = await resumenDe(cliente);
    expect(data.errores).toEqual([]);
    // Diego tiene tickets, empleados, correos, equipos y base de conocimiento.
    expect(data.licencias_por_vencer).toBeNull();
    expect(data.problemas).toBeNull();
    expect(data.kpis.licencias_por_vencer).toBeNull();
    expect(data.tickets).not.toBeNull();
    expect(data.equipos_sin_devolver).not.toBeNull();
    expect(data.rotaciones_pendientes).not.toBeNull();
  });

  it('"Mis tickets" son los de Diego, no los del JEFE', async () => {
    const { data } = await resumenDe(await maquetaCon('asistente'));
    expect(data.tickets.mios.map((t) => t.codigo)).toEqual(['TCK-0116']);
  });
});

describe('maqueta — sin parámetro o con uno desconocido', () => {
  it('cae al escenario normal', async () => {
    const { data } = await resumenDe(await maquetaCon('nada'));
    expect(data.errores).toEqual([]);
    expect(data.problemas).not.toBeNull();
  });
});
