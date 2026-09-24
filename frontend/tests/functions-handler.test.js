// Tests del HANDLER completo de las edge functions (Ciclo 20, revisión
// integral v2), con un SDK falso y programable (tests/stubs/sdk-falso.js) en
// vez del stub que falla fuerte: sin red, sin BD, sin secrets reales (las
// claves AES son las de prueba de tests/setup.js).
//
// Cubre lo que cambió en ese ciclo y antes no tenía ninguna prueba ejecutable:
//   - el tope de revelados cuenta también 'enviar' (ENTREGACREAR-RATELIMIT-BYPASS)
//   - auditoría fail-closed: si accesos_log falla, el valor sensible no sale
//   - rate-limits fail-closed en credenciales/tickets/encuestas
//   - filtro de soft-delete en revelar/revelarClaveLicencia/entregaCrear
//   - entregaCrear rechaza empleados no vigentes (empleado_inactivo)
//   - entregaAbrir no consume el token si el payload no se puede leer
//   - try/catch de primer nivel → error_interno con CORS
//   - CORS calculado por petición (sin estado global compartido)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sdk, reiniciarSdk, tieneFiltro, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: credenciales, encryptV2 } = await import('../../functions/credenciales.ts');
const { default: tickets } = await import('../../functions/tickets.ts');
const { default: encuestas } = await import('../../functions/encuestas.ts');
const { default: equiposFotos } = await import('../../functions/equipos-fotos.ts');

const ORIGEN = 'http://localhost:5173';
const ORIGEN_PROD = 'https://materen-ti.vercel.app';
const FALLA_BD = { data: null, error: { message: 'falla simulada de BD' } };

function peticion(body, { origin = ORIGEN, token = 'token-de-prueba' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://funciones.test/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

// Respuestas por defecto de un JEFE activo con todos los permisos; cada test
// pisa solo las tablas/operaciones que le interesan con `extra`.
function responderCon(extra = {}) {
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (q.tabla === 'staff') return { data: { rol: 'JEFE', activo: true }, error: null };
    if (q.tabla === 'staff_permisos' || q.tabla === 'staff_modulos_permisos') {
      return { data: { staff_user_id: 'u-1' }, error: null };
    }
    if (q.tabla === 'accesos_log' && q.op === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = { id: 'u-1', email: 'jefe@materen.test' };
});

describe('credenciales — revelar', () => {
  let cifrada;
  beforeEach(async () => {
    cifrada = await encryptV2('Secreto-Real-123');
  });
  const cuenta = () => ({ id: 'c-1', usuario: 'ana@x.pe', password: cifrada, tipo_cuenta: 'compartida', plataformas: { nombre: 'Gmail' } });

  it('el tope de revelados cuenta ver, copiar y enviar (entregaCrear)', async () => {
    sdk.responder = responderCon({ 'cuentas:select': () => ({ data: cuenta(), error: null }) });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1', motivo: 'ver' }));
    expect(r.status).toBe(200);
    const conteo = consultasDe('accesos_log', 'select')[0];
    expect(tieneFiltro(conteo, 'in', 'accion', ['ver', 'copiar', 'enviar'])).toBe(true);
  });

  it('con 40 revelados recientes (incluidos envíos) responde 429', async () => {
    sdk.responder = responderCon({
      'cuentas:select': () => ({ data: cuenta(), error: null }),
      'accesos_log:select': () => ({ data: new Array(40).fill({ id: 'x' }), error: null }),
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_revelados');
  });

  it('ignora cuentas con soft-delete (filtra deleted_at)', async () => {
    sdk.responder = responderCon({ 'cuentas:select': () => ({ data: cuenta(), error: null }) });
    await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    expect(tieneFiltro(consultasDe('cuentas', 'select')[0], 'is', 'deleted_at', null)).toBe(true);
  });

  it('si accesos_log no se puede escribir, responde error_interno SIN la contraseña', async () => {
    sdk.responder = responderCon({
      'cuentas:select': () => ({ data: cuenta(), error: null }),
      'accesos_log:insert': () => FALLA_BD,
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto)).toEqual({ ok: false, code: 'error_interno' });
    expect(texto).not.toContain('Secreto-Real-123');
  });

  it('si el tope no se puede contar, bloquea (no asume 0 revelados)', async () => {
    sdk.responder = responderCon({
      'cuentas:select': () => ({ data: cuenta(), error: null }),
      'accesos_log:select': () => FALLA_BD,
    });
    const r = await credenciales(peticion({ action: 'revelar', cuentaId: 'c-1' }));
    expect(r.status).toBe(500);
    expect((await r.text())).not.toContain('Secreto-Real-123');
    expect(consultasDe('accesos_log', 'insert')).toHaveLength(0);
  });
});

describe('credenciales — revelarClaveLicencia', () => {
  it('ignora licencias con soft-delete (filtra deleted_at)', async () => {
    const clave = await encryptV2('XXXX-YYYY');
    sdk.responder = responderCon({
      'licencias:select': () => ({ data: { id: 'l-1', software: 'Office', clave }, error: null }),
    });
    const r = await credenciales(peticion({ action: 'revelarClaveLicencia', licenciaId: 'l-1' }));
    expect(r.status).toBe(200);
    expect(tieneFiltro(consultasDe('licencias', 'select')[0], 'is', 'deleted_at', null)).toBe(true);
  });
});

describe('credenciales — entregaCrear', () => {
  const cuerpo = { action: 'entregaCrear', empleadoId: 'e-1', cuentaIds: ['c-1'] };
  let cifrada;
  beforeEach(async () => {
    cifrada = await encryptV2('Clave-De-Entrega');
  });
  const base = (empleado) => ({
    'empleados:select': () => ({ data: empleado, error: null }),
    'asignaciones_cuenta:select': () => ({ data: [{ cuenta_id: 'c-1' }], error: null }),
    'cuentas:select': () => ({
      data: [{ id: 'c-1', usuario: 'ana@x.pe', password: cifrada, url: '', plataformas: { nombre: 'Gmail' } }],
      error: null,
    }),
    'entregas:insert': () => ({ data: { id: 'ent-1' }, error: null }),
  });

  it.each([
    ['Inactivo', null],
    ['Suspendido', null],
    ['Activo', '2026-09-01T00:00:00Z'],
  ])('rechaza con empleado_inactivo (estado %s, deleted_at %s) sin crear la entrega', async (estado, deletedAt) => {
    sdk.responder = responderCon(base({ nombres: 'Ana', apellidos: 'Pérez', estado, deleted_at: deletedAt }));
    const r = await credenciales(peticion(cuerpo));
    expect(await r.json()).toEqual({ ok: false, code: 'empleado_inactivo' });
    expect(consultasDe('entregas', 'insert')).toHaveLength(0);
    expect(consultasDe('cuentas')).toHaveLength(0);
  });

  it('empleado vigente: filtra cuentas con soft-delete y audita "enviar" en un solo INSERT', async () => {
    sdk.responder = responderCon(base({ nombres: 'Ana', apellidos: 'Pérez', estado: 'Activo', deleted_at: null }));
    const r = await credenciales(peticion(cuerpo));
    const datos = await r.json();
    expect(datos.ok).toBe(true);
    expect(typeof datos.token).toBe('string');
    expect(tieneFiltro(consultasDe('cuentas', 'select')[0], 'is', 'deleted_at', null)).toBe(true);
    const inserts = consultasDe('accesos_log', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.map((f) => f.accion)).toEqual(['enviar']);
  });

  it('si la auditoría falla, no devuelve el token y deja la entrega vencida', async () => {
    sdk.responder = responderCon({
      ...base({ nombres: 'Ana', apellidos: 'Pérez', estado: 'Activo', deleted_at: null }),
      'accesos_log:insert': () => FALLA_BD,
    });
    const r = await credenciales(peticion(cuerpo));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(JSON.parse(texto)).toEqual({ ok: false, code: 'error_interno' });
    const vencida = consultasDe('entregas', 'update')[0];
    expect(vencida.payload).toHaveProperty('expires_at');
    expect(tieneFiltro(vencida, 'eq', 'id', 'ent-1')).toBe(true);
  });
});

describe('credenciales — entregaAbrir (pública)', () => {
  const vigente = (payload) => ({
    id: 'ent-1',
    empleado_nombre: 'Ana Pérez',
    payload,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    viewed_at: null,
  });

  it('payload ilegible: responde error_interno SIN consumir el token', async () => {
    sdk.responder = responderCon({ 'entregas:select': () => ({ data: vigente('enc2:###:###'), error: null }) });
    const r = await credenciales(peticion({ action: 'entregaAbrir', token: 'abc' }, { token: null }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(consultasDe('entregas', 'update')).toHaveLength(0);
  });

  it('auditoría fallida: no entrega credenciales y devuelve el enlace a "sin abrir"', async () => {
    const payload = await encryptV2(JSON.stringify([{ cuenta_id: 'c-1', plataforma: 'Gmail', usuario: 'ana', password: 'Pw-Entrega-9', url: '' }]));
    sdk.responder = responderCon({
      'entregas:select': () => ({ data: vigente(payload), error: null }),
      'entregas:update': (q) => ({ data: q.payload.viewed_at ? [{ id: 'ent-1' }] : null, error: null }),
      'accesos_log:insert': () => FALLA_BD,
    });
    const r = await credenciales(peticion({ action: 'entregaAbrir', token: 'abc' }, { token: null }));
    const texto = await r.text();
    expect(r.status).toBe(500);
    expect(texto).not.toContain('Pw-Entrega-9');
    const updates = consultasDe('entregas', 'update');
    expect(updates).toHaveLength(2);
    expect(updates[1].payload).toEqual({ viewed_at: null });
  });

  it('camino feliz: marca, audita en un solo INSERT y devuelve las credenciales', async () => {
    const payload = await encryptV2(JSON.stringify([{ cuenta_id: 'c-1', plataforma: 'Gmail', usuario: 'ana', password: 'Pw-Entrega-9', url: '' }]));
    sdk.responder = responderCon({
      'entregas:select': () => ({ data: vigente(payload), error: null }),
      'entregas:update': () => ({ data: [{ id: 'ent-1' }], error: null }),
    });
    const r = await credenciales(peticion({ action: 'entregaAbrir', token: 'abc' }, { token: null }));
    const datos = await r.json();
    expect(datos.ok).toBe(true);
    expect(datos.credenciales[0].password).toBe('Pw-Entrega-9');
    expect(consultasDe('accesos_log', 'insert')).toHaveLength(1);
  });
});

describe('primer nivel: excepciones y CORS', () => {
  it('una excepción no controlada responde error_interno (500) con CORS', async () => {
    sdk.responder = () => {
      throw new Error('explota el SDK');
    };
    const r = await credenciales(peticion({ action: 'encrypt', value: 'x' }));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, code: 'error_interno' });
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
  });

  it.each([
    ['tickets', () => tickets],
    ['encuestas', () => encuestas],
    ['equipos-fotos', () => equiposFotos],
  ])('%s también envuelve el handler (error_interno con CORS)', async (_nombre, fn) => {
    sdk.responder = () => {
      throw new Error('explota el SDK');
    };
    const cuerpo = _nombre === 'tickets'
      ? { action: 'catalogo' }
      : _nombre === 'encuestas'
        ? { action: 'abrir', slug: 's' }
        : { action: 'eliminarFoto', key: 'equipos/x.jpg' };
    const r = await fn()(peticion(cuerpo));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
  });

  it('las cabeceras CORS son por petición: dos peticiones concurrentes no se pisan', async () => {
    let liberarPrimera;
    const esperaPrimera = new Promise((r) => {
      liberarPrimera = r;
    });
    let llamadasStaff = 0;
    sdk.responder = responderCon({
      'staff:select': async () => {
        llamadasStaff += 1;
        if (llamadasStaff === 1) await esperaPrimera;
        return { data: { rol: 'JEFE', activo: true }, error: null };
      },
    });
    // La primera que llegue a leer `staff` queda retenida mientras la otra
    // entra y termina — con el viejo `let CORS` global, la retenida salía
    // con el origen de la otra. Se libera por timer para no depender de
    // cuál de las dos llega primero.
    const a = credenciales(peticion({ action: 'accesoDenegado', ruta: '/a' }, { origin: ORIGEN_PROD }));
    const b = credenciales(peticion({ action: 'accesoDenegado', ruta: '/b' }, { origin: ORIGEN }));
    setTimeout(liberarPrimera, 20);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN_PROD);
    expect(rb.headers.get('Access-Control-Allow-Origin')).toBe(ORIGEN);
  });

  it('un origen no listado no recibe cabeceras CORS', async () => {
    sdk.responder = responderCon();
    const r = await credenciales(peticion({ action: 'encrypt', value: '' }, { origin: 'https://malicioso.test' }));
    expect(r.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('rate-limits fail-closed en funciones públicas', () => {
  it('tickets.buscarPorDni: si no se puede contar, bloquea sin consultar empleados', async () => {
    sdk.responder = responderCon({ 'ticket_busqueda_intentos:select': () => FALLA_BD });
    const r = await tickets(peticion({ action: 'buscarPorDni', dni: '12345678' }, { token: null }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(consultasDe('empleados')).toHaveLength(0);
  });

  it('tickets.crear (público): si no se puede registrar el intento, no crea el ticket', async () => {
    sdk.responder = responderCon({
      'ticket_creacion_intentos:select': () => ({ data: [], error: null }),
      'ticket_creacion_intentos:insert': () => FALLA_BD,
    });
    const r = await tickets(peticion({ action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'c' }, { token: null }));
    expect(r.status).toBe(500);
    expect(consultasDe('siguiente_codigo_ticket', 'rpc')).toHaveLength(0);
    expect(consultasDe('tickets', 'insert')).toHaveLength(0);
  });

  it('encuestas.abrir: si no se puede contar, bloquea; y responde con no-store', async () => {
    sdk.responder = responderCon({ 'encuesta_respuesta_intentos:select': () => FALLA_BD });
    const r = await encuestas(peticion({ action: 'abrir', slug: 'ronda-1' }, { token: null }));
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(consultasDe('encuesta_rondas')).toHaveLength(0);
  });
});
