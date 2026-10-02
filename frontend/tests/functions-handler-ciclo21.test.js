// Tests del HANDLER de las edge functions para el endurecimiento del Ciclo 21
// (docs/auditorias/ciclo-21/PLAN-DE-MEJORA.md §4 migraciones 099/104 y §5), con
// el SDK falso de tests/stubs/sdk-falso.js (sin red, sin BD, sin secrets
// reales). Complementa functions-handler.test.js (Ciclo 20):
//   - permisos por RPC `puede`: fail-closed, error de BD (500) ≠ "sin permiso" (403)
//   - getCurrentUser()/fila de staff: "sin usuario" (401) ≠ "la consulta falló" (500)
//   - tickets.staffDeSesion no degrada a público ante un error de BD
//   - descifrado fallido → 500 error_descifrado + fila 'revelado_fallido'
//   - 403 de revelado auditados como 'revelado_denegado' (best-effort)
//   - rate-limits nuevos sobre intentos_publicos
//   - tickets.crear público ignora equipoId/cuentaId/licenciaId
//   - acción pública `ping`
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sdk, reiniciarSdk, tieneFiltro, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: credenciales, encryptV2 } = await import('../../functions/credenciales.ts');
const { default: tickets } = await import('../../functions/tickets.ts');
const { default: encuestas } = await import('../../functions/encuestas.ts');
const { default: equiposFotos } = await import('../../functions/equipos-fotos.ts');

const ORIGEN = 'http://localhost:5173';
const FALLA_BD = { data: null, error: { message: 'falla simulada de BD' } };
// JPEG mínimo que el servidor sabe recorrer: SOI, SOS (longitud 2) y EOI.
const JPEG_MINIMO_B64 = btoa('\xff\xd8\xff\xda\x00\x02\xff\xd9');

function peticion(body, { token = 'token-de-prueba', ip = null } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGEN };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request('https://funciones.test/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

// Staff activo con el rol dado; cada test pisa lo que le interesa con `extra`.
// `puede` (RPC) responde lo que diga `rpcPuede` (por defecto true).
function responderCon({ rol = 'JEFE', extra = {}, rpcPuede = () => ({ data: true, error: null }) } = {}) {
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (q.op === 'rpc' && q.tabla === 'puede') return rpcPuede(q.payload);
    if (q.tabla === 'staff') return { data: { rol, activo: true }, error: null };
    if (q.tabla === 'accesos_log' && q.op === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

const llamadasPuede = () => consultasDe('puede', 'rpc').map((q) => q.payload);
const filasLog = () => consultasDe('accesos_log', 'insert').flatMap((q) => q.payload);

beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = { id: 'u-1', email: 'asistente@materen.test' };
});

// ── Permisos por RPC ─────────────────────────────────────────────────────

describe('credenciales — permisos por RPC `puede` (fail-closed)', () => {
  let cifrada;
  beforeEach(async () => {
    cifrada = await encryptV2('Secreto-Real-123');
  });
  const cuenta = (extra = {}) => ({
    id: 'c-1', usuario: 'ana@x.pe', password: cifrada, tipo_cuenta: 'compartida', plataformas: { nombre: 'Gmail' }, ...extra,
  });
  const pedir = () => credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));

  it('ASISTENTE con permiso: consulta credenciales.ver y modulo:correos por RPC con el id del JWT', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', extra: { 'cuentas:select': () => ({ data: cuenta(), error: null }) } });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).password).toBe('Secreto-Real-123');
    expect(llamadasPuede()).toEqual([
      { p_user: 'u-1', p_permiso: 'credenciales.ver' },
      { p_user: 'u-1', p_permiso: 'modulo:correos' },
    ]);
    expect(consultasDe('staff_permisos')).toHaveLength(0);
    expect(consultasDe('staff_modulos_permisos')).toHaveLength(0);
  });

  it('JEFE: el atajo evita las llamadas RPC', async () => {
    sdk.responder = responderCon({ rol: 'JEFE', extra: { 'cuentas:select': () => ({ data: cuenta(), error: null }) } });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(llamadasPuede()).toHaveLength(0);
  });

  it('puede=false: 403 no_autorizado, no lee la cuenta y audita revelado_denegado', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
    expect(consultasDe('cuentas')).toHaveLength(0);
    const filas = filasLog();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'revelado_denegado', user_id: 'u-1', cuenta_id: null });
    expect(filas[0].detalle).toContain('credenciales.ver');
  });

  it.each([[null], ['true'], [1], [undefined]])('puede=%j (distinto de true): también deniega con 403', async (valor) => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: valor, error: null }) });
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
  });

  it('error de la RPC: 500 error_interno (NO 403 no_autorizado) y nada se revela ni se audita', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => FALLA_BD });
    const r = await pedir();
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_interno');
    expect(texto).not.toContain('Secreto-Real-123');
    expect(consultasDe('cuentas')).toHaveLength(0);
    expect(consultasDe('accesos_log', 'insert')).toHaveLength(0);
  });

  it('con credenciales.ver pero sin el módulo correos: 403 y la fila dice qué faltó', async () => {
    sdk.responder = responderCon({
      rol: 'ASISTENTE',
      rpcPuede: (args) => ({ data: args.p_permiso === 'credenciales.ver', error: null }),
    });
    const r = await pedir();
    expect(r.status).toBe(403);
    expect(filasLog()[0].detalle).toContain('módulo correos');
  });

  it('si el log de la denegación falla, igual deniega con 403 (best-effort)', async () => {
    sdk.responder = responderCon({
      rol: 'ASISTENTE',
      rpcPuede: () => ({ data: false, error: null }),
      extra: { 'accesos_log:insert': () => FALLA_BD },
    });
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
  });

  it('cuenta personal + ASISTENTE: 403 y revelado_denegado con la cuenta resuelta', async () => {
    sdk.responder = responderCon({
      rol: 'ASISTENTE',
      extra: { 'cuentas:select': () => ({ data: cuenta({ tipo_cuenta: 'personal' }), error: null }) },
    });
    const r = await pedir();
    expect(r.status).toBe(403);
    const fila = filasLog()[0];
    expect(fila).toMatchObject({ accion: 'revelado_denegado', cuenta_id: 'c-1', cuenta_usuario: 'ana@x.pe', plataforma: 'Gmail' });
    expect(JSON.stringify(fila)).not.toContain('Secreto-Real-123');
  });

  it('revelarClaveLicencia: puede=false → 403 + revelado_denegado; módulo consultado = licencias', async () => {
    sdk.responder = responderCon({
      rol: 'ASISTENTE',
      rpcPuede: (args) => ({ data: args.p_permiso === 'credenciales.ver', error: null }),
    });
    const r = await credenciales(peticion({ action: 'revelarClaveLicencia', licenciaId: 'l-1' }));
    expect(r.status).toBe(403);
    expect(llamadasPuede().map((a) => a.p_permiso)).toEqual(['credenciales.ver', 'modulo:licencias']);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_denegado' });
    expect(consultasDe('licencias')).toHaveLength(0);
  });

  it('entregaCrear: error de la RPC → 500; puede=false → 403 + revelado_denegado y no toca empleados', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => FALLA_BD });
    const body = { action: 'entregaCrear', empleadoId: 'e-1', cuentaIds: ['c-1'] };
    const r500 = await credenciales(peticion(body));
    expect(r500.status).toBe(500);
    expect(consultasDe('empleados')).toHaveLength(0);

    reiniciarSdk();
    sdk.usuario = { id: 'u-1', email: 'asistente@materen.test' };
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r403 = await credenciales(peticion(body));
    expect(r403.status).toBe(403);
    expect(consultasDe('empleados')).toHaveLength(0);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_denegado', cuenta_usuario: '(entrega)' });
  });

  it('revelarAccesoSensible: ASISTENTE → 403 + revelado_denegado; JEFE sin permiso de fila → 403 + revelado_denegado', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE' });
    const rAsistente = await credenciales(peticion({ action: 'revelarAccesoSensible', accesoId: 'a-1' }));
    expect(rAsistente.status).toBe(403);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_denegado', user_id: 'u-1' });
    expect(consultasDe('accesos_sensibles')).toHaveLength(0);

    reiniciarSdk();
    sdk.usuario = { id: 'u-1', email: 'jefe@materen.test' };
    sdk.responder = responderCon({ rol: 'JEFE', extra: { 'accesos_sensibles_permisos:select': () => ({ data: null, error: null }) } });
    const rJefe = await credenciales(peticion({ action: 'revelarAccesoSensible', accesoId: 'a-1' }));
    expect(rJefe.status).toBe(403);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_denegado' });
    expect(consultasDe('accesos_sensibles')).toHaveLength(0);
    // la semántica de accesos sensibles no pasa por la RPC `puede`
    expect(llamadasPuede()).toHaveLength(0);
  });
});

describe('equipos-fotos — permiso de módulo por RPC', () => {
  const subir = () => equiposFotos(peticion({ action: 'subirFoto', contenidoBase64: JPEG_MINIMO_B64 }));

  it('ASISTENTE con permiso: consulta modulo:equipos por RPC y la subida sigue (falla después en el storage del stub)', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE' });
    const r = await subir();
    expect((await r.json()).code).toBe('error_subiendo');
    expect(llamadasPuede()).toEqual([{ p_user: 'u-1', p_permiso: 'modulo:equipos' }]);
    expect(consultasDe('staff_modulos_permisos')).toHaveLength(0);
  });

  it('puede=false → 403 no_autorizado', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r = await subir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
  });

  it('error de la RPC → 500 error_interno (no 403)', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => FALLA_BD });
    const r = await equiposFotos(peticion({ action: 'eliminarFoto', key: 'equipos/x.jpg' }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it('JEFE: el atajo evita la RPC', async () => {
    sdk.responder = responderCon({ rol: 'JEFE' });
    await equiposFotos(peticion({ action: 'eliminarFoto', key: 'equipos/x.jpg' }));
    expect(llamadasPuede()).toHaveLength(0);
  });
});

// ── getCurrentUser() y fila de staff ────────────────────────────────────

describe('sesión: "sin usuario" (401) distinto de "falló la consulta" (500)', () => {
  const funciones = [
    ['credenciales', () => credenciales, { action: 'encrypt', value: 'x' }],
    ['equipos-fotos', () => equiposFotos, { action: 'eliminarFoto', key: 'equipos/x.jpg' }],
    ['encuestas.version', () => encuestas, { action: 'version' }],
    ['tickets.version', () => tickets, { action: 'version' }],
  ];

  it.each(funciones)('%s: token sin usuario → 401 no_autenticado', async (_n, fn, body) => {
    sdk.usuario = null;
    sdk.responder = responderCon();
    const r = await fn()(peticion(body));
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe('no_autenticado');
  });

  it.each(funciones)('%s: getCurrentUser responde 401 → 401 no_autenticado', async (_n, fn, body) => {
    sdk.errorUsuario = { message: 'token inválido', statusCode: 401 };
    sdk.responder = responderCon();
    const r = await fn()(peticion(body));
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe('no_autenticado');
  });

  it.each(funciones)('%s: getCurrentUser falla (5xx) → 500 error_interno', async (_n, fn, body) => {
    sdk.errorUsuario = { message: 'plataforma caída', statusCode: 503 };
    sdk.responder = responderCon();
    const r = await fn()(peticion(body));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it.each(funciones)('%s: la consulta de staff falla → 500 error_interno (no no_es_staff)', async (_n, fn, body) => {
    sdk.responder = responderCon({ extra: { 'staff:select': () => FALLA_BD } });
    const r = await fn()(peticion(body));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it('un usuario que NO es staff activo sigue recibiendo 403 no_es_staff', async () => {
    sdk.responder = responderCon({ extra: { 'staff:select': () => ({ data: { rol: 'ASISTENTE', activo: false }, error: null }) } });
    const r = await credenciales(peticion({ action: 'encrypt', value: 'x' }));
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_es_staff');
  });
});

// Desde la migración 111 `crear` delega en la RPC `crear_ticket_publico` (ticket +
// evento + intento en una transacción): estos tests miran el `p_datos` que le
// llega, no inserts sueltos. El detalle del rate-limit y de la vinculación vive
// en tests/db/triggers.test.sql (bloque 111-a).
const TOKEN_RPC = 'T'.repeat(24);
const creadoOk = { data: { ok: true, id: 't-1', codigo: 'TCK-0001', token: TOKEN_RPC, vinculado: true }, error: null };
const datosRpc = () => consultasDe('crear_ticket_publico', 'rpc')[0].payload.p_datos;

describe('tickets.staffDeSesion (crear): sin sesión/anónimo = público; error de BD no degrada a público', () => {
  const cuerpo = { action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'cat-1' };
  const baseCrear = (extra = {}) =>
    responderCon({
      extra: {
        'crear_ticket_publico:rpc': () => creadoOk,
        ...extra,
      },
    });

  it('sin cabecera Authorization: público (como hoy), sin campos de staff en la RPC', async () => {
    sdk.responder = baseCrear();
    const r = await tickets(peticion({ ...cuerpo, origen: 'staff_interno' }, { token: null, ip: '10.0.0.7' }));
    expect((await r.json()).ok).toBe(true);
    expect(datosRpc()).not.toHaveProperty('staff_id');
    expect(datosRpc()).not.toHaveProperty('origen');
    expect(datosRpc().ip).toBe('10.0.0.7');
    expect(consultasDe('ticket_creacion_intentos')).toHaveLength(0);
    expect(consultasDe('tickets', 'insert')).toHaveLength(0);
  });

  it('token anónimo (sin usuario): público', async () => {
    sdk.usuario = null;
    sdk.responder = baseCrear();
    const r = await tickets(peticion({ ...cuerpo, origen: 'staff_interno' }));
    expect((await r.json()).ok).toBe(true);
    expect(datosRpc()).not.toHaveProperty('staff_id');
  });

  it('usuario autenticado que no es staff activo: público', async () => {
    sdk.responder = baseCrear({ 'staff:select': () => ({ data: { activo: false }, error: null }) });
    const r = await tickets(peticion({ ...cuerpo, origen: 'staff_interno' }));
    expect((await r.json()).ok).toBe(true);
    expect(datosRpc()).not.toHaveProperty('staff_id');
    expect(datosRpc()).not.toHaveProperty('origen');
  });

  it('staff activo: staff_id y origen staff_interno viajan a la RPC', async () => {
    sdk.responder = baseCrear({ 'staff:select': () => ({ data: { activo: true }, error: null }) });
    const r = await tickets(peticion({ ...cuerpo, origen: 'staff_interno' }));
    expect((await r.json()).ok).toBe(true);
    expect(datosRpc()).toMatchObject({ staff_id: 'u-1', origen: 'staff_interno' });
  });

  it('usuario autenticado y la consulta de staff FALLA: 500, NO degrada a público ni crea el ticket', async () => {
    sdk.responder = baseCrear({ 'staff:select': () => FALLA_BD });
    const r = await tickets(peticion({ ...cuerpo, origen: 'staff_interno' }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(consultasDe('crear_ticket_publico', 'rpc')).toHaveLength(0);
  });

  it('getCurrentUser falla (5xx): 500, no público', async () => {
    sdk.errorUsuario = { message: 'caída', statusCode: 500 };
    sdk.responder = baseCrear();
    const r = await tickets(peticion(cuerpo));
    expect(r.status).toBe(500);
    expect(consultasDe('crear_ticket_publico', 'rpc')).toHaveLength(0);
  });
});

// ── crear público: ids de activos ───────────────────────────────────────

describe('tickets.crear — equipoId/cuentaId/licenciaId solo con sesión de staff', () => {
  const cuerpo = { action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'cat-1', equipoId: 'eq-1', cuentaId: 'cu-1', licenciaId: 'li-1', tipo: 'incidente', empleadoIdManual: 'em-1' };
  const responder = (esStaff) =>
    responderCon({
      extra: {
        'staff:select': () => ({ data: { activo: esStaff }, error: null }),
        'crear_ticket_publico:rpc': () => creadoOk,
      },
    });

  it('público: los ids, el tipo y el empleado a mano NO viajan a la RPC', async () => {
    sdk.responder = responder(false);
    const r = await tickets(peticion(cuerpo, { token: null }));
    expect((await r.json()).ok).toBe(true);
    for (const k of ['equipo_id', 'cuenta_id', 'licencia_id', 'tipo', 'empleado_id_manual', 'staff_id']) {
      expect(datosRpc()).not.toHaveProperty(k);
    }
  });

  it('staff: los tres ids, el tipo y el empleado se aceptan como hoy', async () => {
    sdk.responder = responder(true);
    const r = await tickets(peticion(cuerpo));
    expect((await r.json()).ok).toBe(true);
    expect(datosRpc()).toMatchObject({
      equipo_id: 'eq-1', cuenta_id: 'cu-1', licencia_id: 'li-1', tipo: 'incidente', empleado_id_manual: 'em-1',
    });
  });
});

// ── Descifrado fallido ──────────────────────────────────────────────────

describe('descifrado fallido: 500 error_descifrado + revelado_fallido, sin valores sensibles', () => {
  const CIFRADO_ROTO = 'enc2:AAAAAAAAAAAAAAAA:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  const sinSecretos = (texto) => {
    expect(texto).not.toContain('ZZZZZZZZ');
    expect(texto).not.toContain('(error al descifrar)');
  };

  it('revelar: cifrado inválido → 500 error_descifrado, sin fila ver/copiar y con revelado_fallido', async () => {
    sdk.responder = responderCon({
      extra: { 'cuentas:select': () => ({ data: { id: 'c-1', usuario: 'ana@x.pe', password: CIFRADO_ROTO, tipo_cuenta: 'compartida', plataformas: { nombre: 'Gmail' } }, error: null }) },
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1', motivo: 'ver' }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto)).toEqual({ ok: false, code: 'error_descifrado', error: 'error_descifrado' });
    sinSecretos(texto);
    const filas = filasLog();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'revelado_fallido', user_id: 'u-1', cuenta_id: 'c-1', cuenta_usuario: 'ana@x.pe', plataforma: 'Gmail' });
    sinSecretos(JSON.stringify(filas));
  });

  it('revelar: valor sin prefijo conocido (texto plano histórico) también falla, ya no se devuelve', async () => {
    sdk.responder = responderCon({
      extra: { 'cuentas:select': () => ({ data: { id: 'c-1', usuario: 'ana', password: 'PlanoHistorico-1', tipo_cuenta: 'compartida', plataformas: null }, error: null }) },
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_descifrado');
    expect(texto).not.toContain('PlanoHistorico-1');
    expect(JSON.stringify(filasLog())).not.toContain('PlanoHistorico-1');
    expect(filasLog()[0].detalle).toContain('formato_desconocido');
  });

  it('revelar: si ni siquiera se puede auditar el fallo, error_interno (auditoría fail-closed)', async () => {
    sdk.responder = responderCon({
      extra: {
        'cuentas:select': () => ({ data: { id: 'c-1', usuario: 'ana', password: CIFRADO_ROTO, tipo_cuenta: 'compartida', plataformas: null }, error: null }),
        'accesos_log:insert': () => FALLA_BD,
      },
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it('revelarClaveLicencia: 500 error_descifrado + revelado_fallido', async () => {
    sdk.responder = responderCon({
      extra: { 'licencias:select': () => ({ data: { id: 'l-1', software: 'Office', clave: CIFRADO_ROTO }, error: null }) },
    });
    const r = await credenciales(peticion({ action: 'revelarClaveLicencia', licenciaId: 'l-1' }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_descifrado');
    sinSecretos(texto);
    expect(filasLog()).toHaveLength(1);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_fallido', cuenta_usuario: 'Office' });
    sinSecretos(JSON.stringify(filasLog()));
  });

  it('revelarAccesoSensible: 500 error_descifrado + revelado_fallido', async () => {
    sdk.responder = responderCon({
      extra: {
        'accesos_sensibles_permisos:select': () => ({ data: { acceso_id: 'a-1' }, error: null }),
        'accesos_sensibles:select': () => ({ data: { id: 'a-1', nombre: 'Router', categoria: 'Red', password: 'sens1:AAAAAAAAAAAAAAAA:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ' }, error: null }),
      },
    });
    const r = await credenciales(peticion({ action: 'revelarAccesoSensible', accesoId: 'a-1' }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_descifrado');
    sinSecretos(texto);
    expect(filasLog()).toHaveLength(1);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_fallido', cuenta_usuario: 'Router', plataforma: 'Red' });
    sinSecretos(JSON.stringify(filasLog()));
  });

  it('entregaCrear: una cuenta ilegible aborta TODO el lote: sin entrega, sin token, con revelado_fallido', async () => {
    const buena = await encryptV2('Clave-Buena');
    sdk.responder = responderCon({
      extra: {
        'empleados:select': () => ({ data: { nombres: 'Ana', apellidos: 'P', estado: 'Activo', deleted_at: null }, error: null }),
        'asignaciones_cuenta:select': () => ({ data: [{ cuenta_id: 'c-1' }, { cuenta_id: 'c-2' }], error: null }),
        'cuentas:select': () => ({
          data: [
            { id: 'c-1', usuario: 'ok', password: buena, url: '', plataformas: { nombre: 'Gmail' } },
            { id: 'c-2', usuario: 'roto', password: CIFRADO_ROTO, url: '', plataformas: { nombre: 'Zoom' } },
          ],
          error: null,
        }),
      },
    });
    const r = await credenciales(peticion({ action: 'entregaCrear', empleadoId: 'e-1', cuentaIds: ['c-1', 'c-2'] }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto).code).toBe('error_descifrado');
    expect(texto).not.toContain('Clave-Buena');
    expect(consultasDe('entregas', 'insert')).toHaveLength(0);
    expect(filasLog()).toHaveLength(1);
    expect(filasLog()[0]).toMatchObject({ accion: 'revelado_fallido', cuenta_id: 'c-2', cuenta_usuario: 'roto', plataforma: 'Zoom' });
  });
});

// ── Rate-limits sobre intentos_publicos ─────────────────────────────────

describe('rate-limits nuevos (intentos_publicos)', () => {
  const llenos = (n) => ({ data: new Array(n).fill({ id: 1 }), error: null });
  const vacio = { data: [], error: null };
  const IP = '203.0.113.7';

  // Cada caso: [nombre, función, cuerpo, ámbito, tope, clave esperada, token]
  const casos = [
    ['credenciales.entregaAbrir', () => credenciales, { action: 'entregaAbrir', token: 'abc' }, 'credenciales.entregaAbrir', 10, IP, null],
    ['tickets.seguimiento', () => tickets, { action: 'seguimiento', token: 'abc' }, 'tickets.seguimiento', 60, IP, null],
    ['tickets.encuestaEstado', () => tickets, { action: 'encuestaEstado', token: 'abc' }, 'tickets.encuestaEstado', 30, IP, null],
    ['tickets.encuesta', () => tickets, { action: 'encuesta', token: 'abc', nivel: 4 }, 'tickets.encuesta', 30, IP, null],
    ['tickets.catalogo', () => tickets, { action: 'catalogo' }, 'tickets.catalogo', 60, IP, null],
    ['equipos-fotos.subirFoto', () => equiposFotos, { action: 'subirFoto', contenidoBase64: btoa('\xff\xd8\xffxxxx') }, 'equipos-fotos.subirFoto', 30, 'u-1', 'token-de-prueba'],
    ['equipos-fotos.eliminarFoto', () => equiposFotos, { action: 'eliminarFoto', key: 'equipos/x.jpg' }, 'equipos-fotos.eliminarFoto', 30, 'u-1', 'token-de-prueba'],
  ];

  it.each(casos)('%s: con el tope alcanzado responde 429 demasiados_intentos y no hace el trabajo', async (_n, fn, body, ambito, max, clave, token) => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => llenos(max) } });
    const r = await fn()(peticion(body, { ip: IP, token }));
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ ok: false, code: 'demasiados_intentos', error: 'demasiados_intentos' });
    const conteo = consultasDe('intentos_publicos', 'select')[0];
    expect(tieneFiltro(conteo, 'eq', 'ambito', ambito)).toBe(true);
    expect(tieneFiltro(conteo, 'eq', 'clave', clave)).toBe(true);
    // un intento bloqueado no se registra, y no se llegó a leer/escribir nada de dominio
    expect(consultasDe('intentos_publicos', 'insert')).toHaveLength(0);
    for (const t of ['entregas', 'tickets', 'ticket_satisfaccion', 'categorias_ticket']) expect(consultasDe(t)).toHaveLength(0);
  });

  it.each(casos)('%s: bajo el tope registra el intento (ámbito + clave) y sigue', async (_n, fn, body, ambito, max, clave, token) => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => llenos(max - 1) } });
    const r = await fn()(peticion(body, { ip: IP, token }));
    expect(r.status).not.toBe(429);
    const ins = consultasDe('intentos_publicos', 'insert');
    expect(ins).toHaveLength(1);
    expect(ins[0].payload).toEqual([{ ambito, clave }]);
  });

  it.each(casos)('%s: fail-closed si no se puede contar (500 error_interno, sin trabajo)', async (_n, fn, body, _a, _m, _c, token) => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => FALLA_BD } });
    const r = await fn()(peticion(body, { ip: IP, token }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(consultasDe('intentos_publicos', 'insert')).toHaveLength(0);
  });

  it.each(casos)('%s: fail-closed si no se puede registrar el intento', async (_n, fn, body, _a, _m, _c, token) => {
    sdk.responder = responderCon({
      extra: { 'intentos_publicos:select': () => vacio, 'intentos_publicos:insert': () => FALLA_BD },
    });
    const r = await fn()(peticion(body, { ip: IP, token }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });

  it('entregaAbrir cuenta TAMBIÉN los intentos con token inexistente (el intento se registra antes de buscar la entrega)', async () => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => vacio } });
    const r = await credenciales(peticion({ action: 'entregaAbrir', token: 'no-existe' }, { ip: IP, token: null }));
    expect((await r.json()).code).toBe('no_existe');
    expect(consultasDe('intentos_publicos', 'insert')).toHaveLength(1);
  });

  it('token_requerido / datos_invalidos no consumen cupo', async () => {
    sdk.responder = responderCon();
    await credenciales(peticion({ action: 'entregaAbrir' }, { token: null }));
    await tickets(peticion({ action: 'seguimiento' }, { token: null }));
    await tickets(peticion({ action: 'encuesta', token: 'x', nivel: 9 }, { token: null }));
    expect(consultasDe('intentos_publicos')).toHaveLength(0);
  });

  it('el límite de subirFoto no se evalúa para quien no tiene el módulo (403 antes)', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r = await equiposFotos(peticion({ action: 'subirFoto', contenidoBase64: btoa('\xff\xd8\xffxxxx') }));
    expect(r.status).toBe(403);
    expect(consultasDe('intentos_publicos')).toHaveLength(0);
  });
});

// ── ping ────────────────────────────────────────────────────────────────

describe('ping público (healthcheck)', () => {
  it.each([
    ['credenciales', () => credenciales],
    ['tickets', () => tickets],
    ['encuestas', () => encuestas],
    ['equipos-fotos', () => equiposFotos],
  ])('%s: responde ok sin sesión ni consultas, con CORS y no-store', async (nombre, fn) => {
    // Si ping tocara el SDK, el responder lanzaría y la respuesta sería 500.
    sdk.responder = () => {
      throw new Error('ping no debe tocar la BD');
    };
    const r = await fn()(peticion({ action: 'ping' }, { token: null }));
    expect(r.status).toBe(200);
    const datos = await r.json();
    expect(datos).toMatchObject({ ok: true, funcion: nombre });
    expect(new Date(datos.hora).toISOString()).toBe(datos.hora);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
    expect(sdk.consultas).toHaveLength(0);
  });
});
