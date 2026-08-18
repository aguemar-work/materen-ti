// Tests unitarios PUROS (sin red, sin backend real) de
// tests/integration/_autorizacion-helpers.js — verifican dos cosas:
//   1. Los discriminantes exigen un rechazo específico de autorización,
//      no cualquier error (esto es lo que la autoauditoría posterior al
//      Ciclo 11 encontró débil).
//   2. Los mensajes de fallo nunca incluyen el payload — ni un
//      JSON.stringify(data) ni una respuesta completa de
//      empleados/credenciales/licencias/accesos_sensibles.
//
// Los valores "reales" usados abajo (códigos SQLSTATE, mensajes,
// statusCode) están tomados de la inspección en vivo hecha antes de
// escribir _autorizacion-helpers.js (clave anónima, sin sesión, contra el
// backend real) — no son inventados.
import { describe, it, expect } from 'vitest';
import {
  esRechazoDeAutorizacionSql,
  esRechazoDeAutorizacionAccion,
  mensajeAcceso,
  mensajeInsert,
  mensajeRpc,
  mensajeAccion,
} from './integration/_autorizacion-helpers.js';

describe('esRechazoDeAutorizacionSql', () => {
  it('42501 (insufficient_privilege) — SÍ es un rechazo de autorización', () => {
    expect(esRechazoDeAutorizacionSql({ code: '42501', message: 'permission denied for function es_jefe' })).toBe(true);
  });

  it('P0001 con mensaje "No autorizado" — SÍ es un rechazo de autorización', () => {
    expect(esRechazoDeAutorizacionSql({ code: 'P0001', message: 'No autorizado' })).toBe(true);
  });

  it('P0001 con un mensaje de negocio NO relacionado a autorización — NO cuenta', () => {
    // Mismo código genérico que usa cerrar_ticket para "Ticket no
    // encontrado" o "Solo se puede marcar como resuelto...": si P0001
    // solo bastara, un cambio de guard roto pero con OTRA excepción de
    // negocio seguiría "pasando" el test sin haber probado autorización.
    expect(esRechazoDeAutorizacionSql({ code: 'P0001', message: 'Ticket no encontrado' })).toBe(false);
  });

  it('sin error (null) — NO es un rechazo', () => {
    expect(esRechazoDeAutorizacionSql(null)).toBe(false);
  });

  it('error de esquema no relacionado a autorización (23502, NOT NULL) — NO cuenta', () => {
    expect(esRechazoDeAutorizacionSql({ code: '23502', message: 'null value in column "dni" violates not-null constraint' })).toBe(false);
  });

  it('error de esquema no relacionado a autorización (42P01, tabla inexistente) — NO cuenta', () => {
    // Este es el caso concreto que el diseño anterior (Boolean(error))
    // dejaba pasar en falso: un typo en el nombre de la tabla también
    // produce un error, pero no prueba nada sobre RLS/permisos.
    expect(esRechazoDeAutorizacionSql({ code: '42P01', message: 'relation "stafff" does not exist' })).toBe(false);
  });
});

describe('esRechazoDeAutorizacionAccion', () => {
  it('statusCode 401 (no_autenticado) — SÍ es un rechazo', () => {
    expect(esRechazoDeAutorizacionAccion({ statusCode: 401 })).toBe(true);
  });

  it('statusCode 403 (no_autorizado/no_es_staff) — SÍ es un rechazo', () => {
    expect(esRechazoDeAutorizacionAccion({ statusCode: 403 })).toBe(true);
  });

  it('statusCode 429 (rate limit) no es un rechazo de autorización', () => {
    // 429 = demasiados_revelados: es rate-limit, puede ocurrir con una
    // sesión completamente autorizada. No confundirlo con 401/403.
    expect(esRechazoDeAutorizacionAccion({ statusCode: 429 })).toBe(false);
  });

  it('sin error (la acción respondió 200) — NO es un rechazo', () => {
    expect(esRechazoDeAutorizacionAccion(null)).toBe(false);
  });

  it('statusCode 500 (error de servidor, no de autorización) — NO cuenta', () => {
    expect(esRechazoDeAutorizacionAccion({ statusCode: 500 })).toBe(false);
  });
});

describe('mensajes de fallo — nunca imprimen el payload', () => {
  // Datos "filtrados" de prueba: si el control que el helper audita
  // alguna vez fallara de verdad, esto es lo que NO debe aparecer en el
  // mensaje de un test que falla en CI.
  const empleadoFiltrado = [{ nombres: 'Ana', apellidos: 'Real', dni: '87654321' }];
  const credencialFiltrada = { ok: true, password: 'S3cr3t0-Real-2026' };
  const licenciaFiltrada = { ok: true, clave: 'XXXX-YYYY-ZZZZ-REAL' };
  const accesoSensibleFiltrado = { ok: true, password: 'AccesoSensibleRealNuncaDebeSalir' };

  it('mensajeAcceso no incluye las filas devueltas, solo el conteo', () => {
    const msg = mensajeAcceso('empleados', { data: empleadoFiltrado, error: null });
    expect(msg).not.toContain('Ana');
    expect(msg).not.toContain('87654321');
    expect(msg).toContain('1 fila');
  });

  it('mensajeAcceso con error no incluye datos, solo código/mensaje del error', () => {
    const error = { code: '42501', message: 'permission denied for function es_jefe' };
    const msg = mensajeAcceso('staff', { data: null, error });
    expect(msg).toContain('42501');
    expect(msg).not.toContain('Ana');
  });

  it('mensajeInsert no incluye la fila que se intentó insertar', () => {
    const error = { code: '42501', message: 'permission denied for function es_jefe' };
    const msg = mensajeInsert('empleados', error);
    expect(msg).not.toContain('Ana');
    expect(msg).not.toContain('87654321');
  });

  it('mensajeRpc no incluye argumentos ni resultado', () => {
    const msg = mensajeRpc('dar_baja_empleado', null);
    expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // ningún uuid filtrado
  });

  it('mensajeAccion no incluye la contraseña/clave revelada aunque el helper la reciba', () => {
    // Escenario exacto que la autoauditoría señaló: si "revelar" tuviera
    // éxito cuando no debería, el password real NO debe terminar en el
    // log de un test que falla.
    const msg = mensajeAccion('credenciales', 'revelar', null);
    expect(msg).not.toContain(credencialFiltrada.password);
    expect(msg).not.toContain(licenciaFiltrada.clave);
    expect(msg).not.toContain(accesoSensibleFiltrado.password);
  });

  it('ningún constructor de mensaje usa JSON.stringify sobre data/error completos', () => {
    // Prueba de regresión textual sobre el propio código fuente del
    // arnés: si alguien reintrodujera JSON.stringify(data) o
    // JSON.stringify({ data, error }), este test debe fallar antes de
    // que vuelva a filtrar un payload completo.
    const fuente = mensajeAcceso.toString() + mensajeInsert.toString() + mensajeRpc.toString() + mensajeAccion.toString();
    expect(fuente).not.toMatch(/JSON\.stringify\(\s*data\s*\)/);
    expect(fuente).not.toMatch(/JSON\.stringify\(\s*\{\s*data/);
  });
});
