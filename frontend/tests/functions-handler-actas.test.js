// Tests del HANDLER de las acciones subirActa y urlActa de la edge function
// equipos-fotos (migración 110, plan de mejora Ciclo 21 §3.7): actas de
// entrega/devolución firmadas en físico, subidas como PDF a un bucket privado.
// Usa el SDK falso de tests/stubs/sdk-falso.js (sin red, sin BD, sin secrets):
//   - solo PDF (magic bytes %PDF-), tope 10 MB, JPEG/PNG rechazados
//   - la key sale de la asignación leída en la base, nunca del cliente
//   - reemplazo: no pisa el PDF anterior (sufijo -2, -3...)
//   - permisos por RPC `puede` y rate-limit fail-closed
//   - si registrar_acta falla, el objeto subido se borra
//   - la respuesta jamás incluye la key ni el hash; urlActa firma 120 s
import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sdk, reiniciarSdk, tieneFiltro, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: equiposFotos, esPdf, sha256Hex } = await import('../../functions/dist/equipos-fotos.ts');

const ORIGEN = 'http://localhost:5173';
const FALLA_BD = { data: null, error: { message: 'falla simulada de BD' } };

const ASIGNACION = '11111111-1111-4111-8111-111111111111';
const EMPLEADO = '22222222-2222-4222-8222-222222222222';
const EQUIPO = '33333333-3333-4333-8333-333333333333';
const ACTA = '44444444-4444-4444-8444-444444444444';

// PDF mínimo de fixture y variantes que NO lo son
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const PDF_B64 = PDF.toString('base64');
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64');
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
const MAX_BYTES = 10 * 1024 * 1024;

function peticion(body, { token = 'token-de-prueba' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGEN };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://funciones.test/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

const FILA_ACTA = {
  id: ACTA,
  asignacion_equipo_id: ASIGNACION,
  tipo: 'entrega',
  empleado_id: EMPLEADO,
  equipo_id: EQUIPO,
  pdf_key: `actas/${EMPLEADO}/${ASIGNACION}-entrega.pdf`,
  tamano_bytes: PDF.length,
  sha256: createHash('sha256').update(PDF).digest('hex'),
  firmado_at: '2026-09-30',
  subido_por: 'u-1',
  created_at: '2026-10-01T20:00:00.000Z',
  deleted_at: null,
};

// Staff activo con el rol dado; `extra` pisa lo que le interesa a cada test
// (clave 'tabla:op'; las RPC son 'nombre:rpc'). `puede` responde rpcPuede.
function responderCon({ rol = 'JEFE', extra = {}, rpcPuede = () => ({ data: true, error: null }) } = {}) {
  const base = {
    'asignaciones_equipo:select': () => ({ data: { id: ASIGNACION, empleado_id: EMPLEADO, fecha_fin: null }, error: null }),
    'actas:select': () => ({ data: [], error: null }),
    'registrar_acta:rpc': () => ({ data: FILA_ACTA, error: null }),
  };
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (q.op === 'rpc' && q.tabla === 'puede') return rpcPuede(q.payload);
    if (q.tabla === 'staff') return { data: { rol, activo: true }, error: null };
    if (base[clave]) return base[clave](q);
    return { data: null, error: null };
  };
}

const subir = (extra = {}, opciones) =>
  equiposFotos(peticion({ action: 'subirActa', asignacionId: ASIGNACION, tipo: 'entrega', archivo: PDF_B64, ...extra }, opciones));
const urlDe = (extra = {}) => equiposFotos(peticion({ action: 'urlActa', actaId: ACTA, ...extra }));

const subidas = () => sdk.almacenamiento.filter((o) => o.op === 'upload');
const borrados = () => sdk.almacenamiento.filter((o) => o.op === 'remove');
const llamadasPuede = () => consultasDe('puede', 'rpc').map((q) => q.payload);
const registros = () => consultasDe('registrar_acta', 'rpc');

beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = { id: 'u-1', email: 'asistente@materen.test' };
  sdk.storage.upload = ({ key }) => ({ data: { key, url: `https://almacen.test/${key}` }, error: null });
});

// ── helpers puros ────────────────────────────────────────────────────────

describe('esPdf / sha256Hex', () => {
  it('reconoce %PDF- al inicio y rechaza imágenes, texto, vacío y cabecera desplazada', () => {
    expect(esPdf(new Uint8Array(PDF))).toBe(true);
    expect(esPdf(new Uint8Array(Buffer.from('%PDF-')))).toBe(true);
    expect(esPdf(new Uint8Array(Buffer.from('%PDF')))).toBe(false);
    expect(esPdf(new Uint8Array(Buffer.from(JPEG_B64, 'base64')))).toBe(false);
    expect(esPdf(new Uint8Array(Buffer.from(PNG_B64, 'base64')))).toBe(false);
    expect(esPdf(new Uint8Array(Buffer.from('hola mundo')))).toBe(false);
    expect(esPdf(new Uint8Array(Buffer.from(' %PDF-1.4')))).toBe(false);
    expect(esPdf(new Uint8Array(0))).toBe(false);
  });

  it('sha256Hex coincide con node:crypto, en hex minúsculas de 64 caracteres', async () => {
    const hex = await sha256Hex(new Uint8Array(PDF));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hex).toBe(createHash('sha256').update(PDF).digest('hex'));
  });
});

// ── subirActa: camino feliz ──────────────────────────────────────────────

describe('subirActa — camino feliz', () => {
  it('sube el PDF al bucket privado con la key del plan y registra el acta por RPC', async () => {
    sdk.responder = responderCon();
    const r = await subir({ firmadoAt: '2026-09-30' });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo).toEqual({
      ok: true,
      acta: { id: ACTA, tipo: 'entrega', tamanoBytes: PDF.length, firmadoAt: '2026-09-30', creadaEn: '2026-10-01T20:00:00.000Z' },
    });

    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].bucket).toBe('actas-firmadas');
    expect(subidas()[0].key).toBe(`actas/${EMPLEADO}/${ASIGNACION}-entrega.pdf`);
    expect(subidas()[0].blob.type).toBe('application/pdf');

    expect(registros()).toHaveLength(1);
    expect(registros()[0].payload).toEqual({
      p_asignacion_id: ASIGNACION,
      p_tipo: 'entrega',
      p_pdf_key: `actas/${EMPLEADO}/${ASIGNACION}-entrega.pdf`,
      p_tamano_bytes: PDF.length,
      p_sha256: createHash('sha256').update(PDF).digest('hex'),
      p_firmado_at: '2026-09-30',
      p_subido_por: 'u-1',
    });
    expect(borrados()).toHaveLength(0);
  });

  it('la respuesta jamás incluye la key del bucket ni el hash', async () => {
    sdk.responder = responderCon();
    const texto = await (await subir()).text();
    expect(texto).not.toContain('actas/');
    expect(texto).not.toContain('pdf_key');
    expect(texto).not.toContain('sha256');
    expect(texto).not.toContain(FILA_ACTA.sha256);
  });

  it('ASISTENTE con permiso: consulta modulo:equipos por RPC', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE' });
    expect((await subir()).status).toBe(200);
    expect(llamadasPuede()).toEqual([{ p_user: 'u-1', p_permiso: 'modulo:equipos' }]);
  });

  it('acepta el prefijo data:application/pdf;base64, y espacios en el base64', async () => {
    sdk.responder = responderCon();
    const r = await subir({ archivo: `data:application/pdf;base64,${PDF_B64.slice(0, 20)}\n${PDF_B64.slice(20)}` });
    expect(r.status).toBe(200);
    expect(registros()[0].payload.p_tamano_bytes).toBe(PDF.length);
  });

  it('acepta un PDF de exactamente 10 MB', async () => {
    sdk.responder = responderCon();
    const grande = Buffer.concat([PDF, Buffer.alloc(MAX_BYTES - PDF.length)]);
    const r = await subir({ archivo: grande.toString('base64') });
    expect(r.status).toBe(200);
    expect(registros()[0].payload.p_tamano_bytes).toBe(MAX_BYTES);
  });

  it('el nombre del cliente se ignora: la key nunca lo contiene', async () => {
    sdk.responder = responderCon();
    await subir({ nombre: '../../etc/passwd.pdf' });
    expect(subidas()[0].key).not.toContain('passwd');
    expect(subidas()[0].key).toBe(`actas/${EMPLEADO}/${ASIGNACION}-entrega.pdf`);
  });

  it('devolución de una asignación cerrada: key -devolucion.pdf', async () => {
    sdk.responder = responderCon({
      extra: { 'asignaciones_equipo:select': () => ({ data: { id: ASIGNACION, empleado_id: EMPLEADO, fecha_fin: '2026-09-30' }, error: null }) },
    });
    const r = await subir({ tipo: 'devolucion' });
    expect(r.status).toBe(200);
    expect(subidas()[0].key).toBe(`actas/${EMPLEADO}/${ASIGNACION}-devolucion.pdf`);
    expect(registros()[0].payload.p_tipo).toBe('devolucion');
  });
});

// ── Reemplazo ────────────────────────────────────────────────────────────

describe('subirActa — reemplazo', () => {
  it.each([
    [1, `-entrega-2.pdf`],
    [2, `-entrega-3.pdf`],
  ])('con %i acta(s) previa(s) (vigentes o no) la key lleva sufijo y NO pisa el PDF anterior', async (n, sufijo) => {
    sdk.responder = responderCon({
      extra: { 'actas:select': () => ({ data: new Array(n).fill({ id: 'x' }), error: null }) },
    });
    const r = await subir();
    expect(r.status).toBe(200);
    expect(subidas()[0].key).toBe(`actas/${EMPLEADO}/${ASIGNACION}${sufijo}`);
    expect(registros()[0].payload.p_pdf_key).toBe(`actas/${EMPLEADO}/${ASIGNACION}${sufijo}`);
    // el conteo mira TODAS las actas del par (asignación, tipo), no solo las vigentes
    const conteo = consultasDe('actas', 'select')[0];
    expect(tieneFiltro(conteo, 'eq', 'asignacion_equipo_id', ASIGNACION)).toBe(true);
    expect(tieneFiltro(conteo, 'eq', 'tipo', 'entrega')).toBe(true);
    expect(tieneFiltro(conteo, 'is', 'deleted_at')).toBe(false);
  });
});

// ── Validación del archivo ───────────────────────────────────────────────

describe('subirActa — validación del archivo', () => {
  const sinTrabajo = () => {
    expect(subidas()).toHaveLength(0);
    expect(registros()).toHaveLength(0);
  };

  it('sin archivo: archivo_requerido', async () => {
    sdk.responder = responderCon();
    expect((await (await subir({ archivo: '' })).json()).code).toBe('archivo_requerido');
    sinTrabajo();
  });

  it.each([
    ['un JPEG', JPEG_B64],
    ['un PNG', PNG_B64],
    ['texto plano', Buffer.from('esto no es un pdf').toString('base64')],
    ['un PDF con la cabecera desplazada', Buffer.from(' %PDF-1.4').toString('base64')],
    ['base64 inválido', '@@@no-es-base64@@@'],
    ['solo relleno', '===='],
  ])('%s: archivo_invalido y no se sube nada', async (_n, archivo) => {
    sdk.responder = responderCon();
    const r = await subir({ archivo });
    expect((await r.json()).code).toBe('archivo_invalido');
    sinTrabajo();
  });

  it('más de 10 MB (aunque no sea PDF): archivo_muy_grande antes de decodificar', async () => {
    sdk.responder = responderCon();
    const r = await subir({ archivo: Buffer.alloc(MAX_BYTES + 1, 0x41).toString('base64') });
    expect((await r.json()).code).toBe('archivo_muy_grande');
    sinTrabajo();
  });
});

// ── Validación de la asignación ──────────────────────────────────────────

describe('subirActa — asignación', () => {
  const sinTrabajo = () => {
    expect(subidas()).toHaveLength(0);
    expect(registros()).toHaveLength(0);
  };

  it.each([
    ['asignacionId que no es uuid', { asignacionId: 'no-es-uuid' }],
    ['sin asignacionId', { asignacionId: undefined }],
    ['tipo desconocido', { tipo: 'baja' }],
    ['sin tipo', { tipo: undefined }],
  ])('%s: asignacion_invalida sin tocar la base', async (_n, extra) => {
    sdk.responder = responderCon();
    const r = await subir(extra);
    expect((await r.json()).code).toBe('asignacion_invalida');
    expect(consultasDe('asignaciones_equipo')).toHaveLength(0);
    sinTrabajo();
  });

  it('asignación inexistente: no_existe', async () => {
    sdk.responder = responderCon({ extra: { 'asignaciones_equipo:select': () => ({ data: null, error: null }) } });
    expect((await (await subir()).json()).code).toBe('no_existe');
    sinTrabajo();
  });

  it('entrega a una ubicación (sin persona): asignacion_invalida', async () => {
    sdk.responder = responderCon({
      extra: { 'asignaciones_equipo:select': () => ({ data: { id: ASIGNACION, empleado_id: null, fecha_fin: null }, error: null }) },
    });
    expect((await (await subir()).json()).code).toBe('asignacion_invalida');
    sinTrabajo();
  });

  it('devolución de una asignación todavía vigente: asignacion_invalida', async () => {
    sdk.responder = responderCon();
    expect((await (await subir({ tipo: 'devolucion' })).json()).code).toBe('asignacion_invalida');
    sinTrabajo();
  });

  it('error al leer la asignación: 500 error_interno (no se confunde con "no existe")', async () => {
    sdk.responder = responderCon({ extra: { 'asignaciones_equipo:select': () => FALLA_BD } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    sinTrabajo();
  });

  it('error al contar las actas previas: 500 error_interno y no se sube nada', async () => {
    sdk.responder = responderCon({ extra: { 'actas:select': () => FALLA_BD } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    sinTrabajo();
  });
});

describe('subirActa — fecha de firma', () => {
  it.each([['2026-02-31'], ['30/09/2026'], ['ayer'], ['2999-01-01']])('%s: fecha_invalida', async (firmadoAt) => {
    sdk.responder = responderCon();
    const r = await subir({ firmadoAt });
    expect((await r.json()).code).toBe('fecha_invalida');
    expect(subidas()).toHaveLength(0);
  });

  it('sin fecha: p_firmado_at null', async () => {
    sdk.responder = responderCon();
    await subir();
    expect(registros()[0].payload.p_firmado_at).toBeNull();
  });
});

// ── Permisos, sesión y rate-limit ────────────────────────────────────────

describe('subirActa — permisos, sesión y rate-limit', () => {
  it('sin token: 401 no_autenticado', async () => {
    sdk.responder = responderCon();
    const r = await subir({}, { token: null });
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe('no_autenticado');
  });

  it('sin módulo equipos (puede=false): 403 no_autorizado y nada se toca', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r = await subir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
    expect(consultasDe('asignaciones_equipo')).toHaveLength(0);
    expect(consultasDe('intentos_publicos')).toHaveLength(0);
    expect(subidas()).toHaveLength(0);
  });

  it('error de la RPC puede: 500 error_interno (no 403)', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => FALLA_BD });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(subidas()).toHaveLength(0);
  });

  it('staff inactivo: 403 no_es_staff', async () => {
    sdk.responder = (q) => (q.tabla === 'staff' ? { data: { rol: 'ASISTENTE', activo: false }, error: null } : { data: null, error: null });
    const r = await subir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_es_staff');
  });

  it('con el tope de 30 en 10 min alcanzado: 429 demasiados_intentos y no se sube nada', async () => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => ({ data: new Array(30).fill({ id: 1 }), error: null }) } });
    const r = await subir();
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_intentos');
    const conteo = consultasDe('intentos_publicos', 'select')[0];
    expect(tieneFiltro(conteo, 'eq', 'ambito', 'equipos-fotos.subirActa')).toBe(true);
    expect(tieneFiltro(conteo, 'eq', 'clave', 'u-1')).toBe(true);
    expect(consultasDe('intentos_publicos', 'insert')).toHaveLength(0);
    expect(subidas()).toHaveLength(0);
  });

  it('registra el intento cuando todavía hay cupo', async () => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => ({ data: new Array(29).fill({ id: 1 }), error: null }) } });
    await subir();
    expect(consultasDe('intentos_publicos', 'insert')[0].payload).toEqual([{ ambito: 'equipos-fotos.subirActa', clave: 'u-1' }]);
  });

  it('fail-closed: si no se puede contar los intentos, 500 y no se sube nada', async () => {
    sdk.responder = responderCon({ extra: { 'intentos_publicos:select': () => FALLA_BD } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(subidas()).toHaveLength(0);
  });
});

// ── Fallas del almacenamiento y del registro ─────────────────────────────

describe('subirActa — fallas', () => {
  it('si el bucket falla: 500 error_subiendo y no se registra ningún acta', async () => {
    sdk.responder = responderCon();
    sdk.storage.upload = () => ({ data: null, error: { message: 'Bucket not found' } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_subiendo');
    expect(registros()).toHaveLength(0);
  });

  it('si registrar_acta falla: borra el PDF recién subido y responde 500 error_subiendo', async () => {
    sdk.responder = responderCon({ extra: { 'registrar_acta:rpc': () => FALLA_BD } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_subiendo');
    expect(borrados()).toEqual([{ op: 'remove', bucket: 'actas-firmadas', key: `actas/${EMPLEADO}/${ASIGNACION}-entrega.pdf` }]);
  });

  it.each([['P0002'], ['22023']])('registrar_acta con SQLSTATE %s: asignacion_invalida (200) y limpia el objeto', async (code) => {
    sdk.responder = responderCon({ extra: { 'registrar_acta:rpc': () => ({ data: null, error: { message: 'x', code } }) } });
    const r = await subir();
    expect(r.status).toBe(200);
    expect((await r.json()).code).toBe('asignacion_invalida');
    expect(borrados()).toHaveLength(1);
  });

  it('si borrar el objeto también falla, igual responde el error original', async () => {
    sdk.responder = responderCon({ extra: { 'registrar_acta:rpc': () => FALLA_BD } });
    sdk.storage.remove = () => {
      throw new Error('remove roto');
    };
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_subiendo');
  });

  it('registrar_acta sin fila de vuelta: 500 error_subiendo', async () => {
    sdk.responder = responderCon({ extra: { 'registrar_acta:rpc': () => ({ data: null, error: null }) } });
    const r = await subir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_subiendo');
  });
});

// ── urlActa ──────────────────────────────────────────────────────────────

describe('urlActa', () => {
  beforeEach(() => {
    sdk.storage.createSignedUrl = ({ key }) => ({
      data: { signedUrl: `https://almacen.test/firmada/${key}?token=abc`, expiresAt: '2026-10-01T20:02:00.000Z' },
      error: null,
    });
  });
  const conActa = (extra = {}) =>
    responderCon({ extra: { 'actas:select': () => ({ data: { id: ACTA, pdf_key: FILA_ACTA.pdf_key }, error: null }), ...extra } });

  it('devuelve una URL firmada de 120 s del PDF vigente, sin exponer la key', async () => {
    sdk.responder = conActa();
    const r = await urlDe();
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo).toMatchObject({ ok: true, expiraSegundos: 120, expiraEn: '2026-10-01T20:02:00.000Z' });
    expect(cuerpo.url).toContain('https://almacen.test/firmada/');
    expect(Object.keys(cuerpo).sort()).toEqual(['expiraEn', 'expiraSegundos', 'ok', 'url']);

    const firmas = sdk.almacenamiento.filter((o) => o.op === 'createSignedUrl');
    expect(firmas).toEqual([{ op: 'createSignedUrl', bucket: 'actas-firmadas', key: FILA_ACTA.pdf_key, expiresIn: 120 }]);

    // solo actas vigentes, por id
    const lectura = consultasDe('actas', 'select')[0];
    expect(tieneFiltro(lectura, 'eq', 'id', ACTA)).toBe(true);
    expect(tieneFiltro(lectura, 'is', 'deleted_at', null)).toBe(true);
  });

  it('actaId que no es uuid: no_existe sin tocar la base', async () => {
    sdk.responder = conActa();
    expect((await (await urlDe({ actaId: 'x' })).json()).code).toBe('no_existe');
    expect(consultasDe('actas')).toHaveLength(0);
  });

  it('acta inexistente o eliminada: no_existe y no firma nada', async () => {
    sdk.responder = responderCon({ extra: { 'actas:select': () => ({ data: null, error: null }) } });
    expect((await (await urlDe()).json()).code).toBe('no_existe');
    expect(sdk.almacenamiento).toHaveLength(0);
  });

  it('sin módulo equipos: 403 no_autorizado', async () => {
    sdk.responder = responderCon({ rol: 'ASISTENTE', rpcPuede: () => ({ data: false, error: null }) });
    const r = await urlDe();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
    expect(consultasDe('actas')).toHaveLength(0);
  });

  it('sin token: 401', async () => {
    sdk.responder = conActa();
    const r = await equiposFotos(peticion({ action: 'urlActa', actaId: ACTA }, { token: null }));
    expect(r.status).toBe(401);
  });

  it('rate-limit propio: 60 en 10 min por usuario', async () => {
    sdk.responder = conActa({ 'intentos_publicos:select': () => ({ data: new Array(60).fill({ id: 1 }), error: null }) });
    const r = await urlDe();
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_intentos');
    const conteo = consultasDe('intentos_publicos', 'select')[0];
    expect(tieneFiltro(conteo, 'eq', 'ambito', 'equipos-fotos.urlActa')).toBe(true);
    expect(sdk.almacenamiento).toHaveLength(0);
  });

  it('objeto ausente en el bucket (404): no_existe', async () => {
    sdk.responder = conActa();
    sdk.storage.createSignedUrl = () => ({ data: null, error: { message: 'not found', statusCode: 404 } });
    const r = await urlDe();
    expect(r.status).toBe(200);
    expect((await r.json()).code).toBe('no_existe');
  });

  it('falla al firmar: 500 error_url', async () => {
    sdk.responder = conActa();
    sdk.storage.createSignedUrl = () => ({ data: null, error: { message: 'boom', statusCode: 500 } });
    const r = await urlDe();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_url');
  });

  it('error al leer el acta: 500 error_interno', async () => {
    sdk.responder = conActa({ 'actas:select': () => FALLA_BD });
    const r = await urlDe();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
  });
});
