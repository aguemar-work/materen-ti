// Tests del HANDLER de la edge function `tickets` para los adjuntos privados
// (migración 111, plan de mejora Ciclo 21 §4 "Adjuntos privados" y §5), con el
// SDK falso de tests/stubs/sdk-falso.js (sin red, sin BD, sin secrets):
//   - crear: la RPC crear_ticket_publico va PRIMERO; la captura se sube después a
//     tickets/<ticket.id>/captura.<ext> (nunca <token>/…), sin metadatos, y se
//     enlaza con adjuntar_captura_ticket; si el enlace falla, el objeto se borra
//   - un cliente bloqueado por el rate-limit (429) no llega a subir nada
//   - seguimiento: devuelve una URL firmada de 300 s y jamás la key del objeto
//   - adjuntoStaff: sesión de staff + permiso modulo:tickets por RPC `puede`
//     (fail-closed), rate-limit, 404 ≠ falla al firmar, sin key hacia el cliente
//   - equipos-fotos.subirFoto: el objeto subido no lleva EXIF
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sdk, reiniciarSdk, consultasDe } from './stubs/sdk-falso.js';

vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));

const { default: tickets } = await import('../../functions/dist/tickets.ts');
const { default: equiposFotos } = await import('../../functions/dist/equipos-fotos.ts');

const ORIGEN = 'http://localhost:5173';
const FALLA_BD = { data: null, error: { message: 'falla simulada de BD' } };
const TICKET_ID = '55555555-5555-4555-8555-555555555555';
const TOKEN_TICKET = 'AbCdEfGhIjKlMnOpQrStUvWx'; // 24 caracteres base64url, como el real

// JPEG con un APP1 (EXIF con GPS) y un SOS mínimo; sin él, la función rechaza el archivo.
const EXIF = 'Exif' + String.fromCharCode(0, 0) + 'GPSLatitude=-12.04';
const segmento = (marcador, texto) => [0xff, marcador, 0x00, texto.length + 2, ...Array.from(texto, (c) => c.charCodeAt(0))];
const JPEG_SUCIO = new Uint8Array([0xff, 0xd8, ...segmento(0xe1, EXIF), 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const JPEG_SUCIO_B64 = b64(JPEG_SUCIO);

function peticion(body, { token = 'token-de-prueba', ip = '10.0.0.7' } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGEN };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (ip) headers['cf-connecting-ip'] = ip;
  return new Request('https://funciones.test/fn', { method: 'POST', headers, body: JSON.stringify(body) });
}

const creadoOk = { data: { ok: true, id: TICKET_ID, codigo: 'TCK-0042', token: TOKEN_TICKET, vinculado: true }, error: null };

// Por defecto: el usuario autenticado es staff activo; `puede` responde rpcPuede.
function responderCon({ extra = {}, rpcPuede = () => ({ data: true, error: null }) } = {}) {
  return (q) => {
    const clave = `${q.tabla}:${q.op}`;
    if (extra[clave]) return extra[clave](q);
    if (q.op === 'rpc' && q.tabla === 'puede') return rpcPuede(q.payload);
    if (q.tabla === 'staff') return { data: { rol: 'ASISTENTE', activo: true }, error: null };
    if (q.tabla === 'intentos_publicos' && q.op === 'select') return { data: [], error: null };
    return { data: null, error: null };
  };
}

const subidas = () => sdk.almacenamiento.filter((o) => o.op === 'upload');
const borrados = () => sdk.almacenamiento.filter((o) => o.op === 'remove');
const firmas = () => sdk.almacenamiento.filter((o) => o.op === 'createSignedUrl');
const bytesSubidos = async (i = 0) => new Uint8Array(await subidas()[i].blob.arrayBuffer());
const texto = (u8) => Array.from(u8, (c) => String.fromCharCode(c)).join('');

beforeEach(() => {
  reiniciarSdk();
  sdk.usuario = { id: 'u-1', email: 'asistente@materen.test' };
  sdk.storage.upload = ({ key }) => ({ data: { key, url: `https://almacen.test/${key}` }, error: null });
});

// ── crear ────────────────────────────────────────────────────────────────

describe('tickets.crear — captura en tickets/<id>/captura.<ext>, sin metadatos', () => {
  const cuerpo = (extra = {}) => ({
    action: 'crear', titulo: 't', descripcion: 'd', categoriaId: 'cat-1', adjunto: { contenidoBase64: JPEG_SUCIO_B64 }, ...extra,
  });
  const base = (extra = {}) =>
    responderCon({
      extra: {
        'crear_ticket_publico:rpc': () => creadoOk,
        'adjuntar_captura_ticket:rpc': () => ({ data: true, error: null }),
        ...extra,
      },
    });

  it('sube a tickets/<ticket.id>/captura.jpg (jamás <token>/…), sin EXIF, y enlaza el adjunto', async () => {
    sdk.responder = base();
    const r = await tickets(peticion(cuerpo(), { token: null }));
    expect(await r.json()).toEqual({ ok: true, codigo: 'TCK-0042', token: TOKEN_TICKET, vinculado: true });

    expect(subidas()).toHaveLength(1);
    expect(subidas()[0].bucket).toBe('tickets-adjuntos');
    expect(subidas()[0].key).toBe(`tickets/${TICKET_ID}/captura.jpg`);
    expect(subidas()[0].key).not.toContain(TOKEN_TICKET);
    expect(subidas()[0].blob.type).toBe('image/jpeg');

    const subido = await bytesSubidos();
    expect(texto(subido)).not.toContain('GPSLatitude');
    expect(texto(subido)).not.toContain('Exif');
    expect(Array.from(subido)).toEqual([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);

    expect(consultasDe('adjuntar_captura_ticket', 'rpc')[0].payload).toEqual({
      p_ticket_id: TICKET_ID,
      p_key: `tickets/${TICKET_ID}/captura.jpg`,
    });
    expect(borrados()).toHaveLength(0);
  });

  it('la RPC va ANTES que la subida y ya no hay inserts sueltos en tickets ni ticket_eventos', async () => {
    sdk.responder = base();
    await tickets(peticion(cuerpo(), { token: null }));
    const orden = sdk.consultas.map((q) => q.tabla).filter((t) => ['crear_ticket_publico', 'adjuntar_captura_ticket'].includes(t));
    expect(orden).toEqual(['crear_ticket_publico', 'adjuntar_captura_ticket']);
    expect(consultasDe('tickets', 'insert')).toHaveLength(0);
    expect(consultasDe('ticket_eventos', 'insert')).toHaveLength(0);
    expect(consultasDe('ticket_creacion_intentos')).toHaveLength(0);
  });

  it('rate-limit de la RPC (demasiados_intentos): 429 y NO se sube nada al bucket', async () => {
    sdk.responder = base({ 'crear_ticket_publico:rpc': () => ({ data: { ok: false, code: 'demasiados_intentos' }, error: null }) });
    const r = await tickets(peticion(cuerpo(), { token: null }));
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_intentos');
    expect(sdk.almacenamiento).toHaveLength(0);
    expect(consultasDe('adjuntar_captura_ticket', 'rpc')).toHaveLength(0);
  });

  it('rechazo de negocio de la RPC (categoria_invalida): 200 ok:false con su code, sin subir', async () => {
    sdk.responder = base({ 'crear_ticket_publico:rpc': () => ({ data: { ok: false, code: 'categoria_invalida' }, error: null }) });
    const r = await tickets(peticion(cuerpo(), { token: null }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, code: 'categoria_invalida' });
    expect(sdk.almacenamiento).toHaveLength(0);
  });

  it('si adjuntar_captura_ticket no enlaza (false o error), el objeto recién subido se borra y el ticket igual se crea', async () => {
    for (const respuesta of [{ data: false, error: null }, FALLA_BD]) {
      reiniciarSdk();
      sdk.usuario = { id: 'u-1', email: 'x@materen.test' };
      sdk.storage.upload = ({ key }) => ({ data: { key }, error: null });
      sdk.responder = base({ 'adjuntar_captura_ticket:rpc': () => respuesta });
      const r = await tickets(peticion(cuerpo(), { token: null }));
      expect((await r.json()).ok).toBe(true);
      expect(borrados()).toEqual([{ op: 'remove', bucket: 'tickets-adjuntos', key: `tickets/${TICKET_ID}/captura.jpg` }]);
    }
  });

  it('si la subida falla, el ticket se crea sin adjunto (opcional)', async () => {
    sdk.storage.upload = () => ({ data: null, error: { message: 'storage caído' } });
    sdk.responder = base();
    const r = await tickets(peticion(cuerpo(), { token: null }));
    expect((await r.json()).ok).toBe(true);
    expect(consultasDe('adjuntar_captura_ticket', 'rpc')).toHaveLength(0);
  });

  it('un adjunto que no es imagen, o una imagen que no se puede limpiar, no se sube pero el ticket se crea', async () => {
    sdk.responder = base();
    const noImagen = { contenidoBase64: btoa('%PDF-1.4 no soy una imagen') };
    const jpegTruncado = { contenidoBase64: b64(JPEG_SUCIO.subarray(0, 6)) }; // corta dentro del APP1
    for (const adjunto of [noImagen, jpegTruncado]) {
      const r = await tickets(peticion(cuerpo({ adjunto }), { token: null }));
      expect((await r.json()).ok).toBe(true);
    }
    expect(subidas()).toHaveLength(0);
  });

  it('sin adjunto no toca el storage', async () => {
    sdk.responder = base();
    const r = await tickets(peticion(cuerpo({ adjunto: undefined }), { token: null }));
    expect((await r.json()).ok).toBe(true);
    expect(sdk.almacenamiento).toHaveLength(0);
  });
});

// ── seguimiento ──────────────────────────────────────────────────────────

describe('tickets.seguimiento — URL firmada de la captura, nunca la key', () => {
  const FILA = {
    id: TICKET_ID, codigo: 'TCK-0042', titulo: 't', descripcion: 'd', estado: 'abierto',
    adjunto_key: `tickets/${TICKET_ID}/captura.png`, created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z',
    categorias_ticket: { nombre: 'Equipos' }, subcategorias_ticket: null,
  };
  const pedir = () => tickets(peticion({ action: 'seguimiento', token: TOKEN_TICKET }, { token: null }));

  it('firma 300 s sobre el bucket privado y devuelve la URL, sin exponer la key', async () => {
    sdk.storage.createSignedUrl = ({ key }) => ({ data: { signedUrl: `https://almacen.test/firmada/${key}?firma=abc`, expiresAt: null }, error: null });
    sdk.responder = responderCon({ extra: { 'tickets:select': () => ({ data: FILA, error: null }) } });
    const r = await pedir();
    const datos = await r.json();
    expect(datos.ok).toBe(true);
    expect(datos.adjuntoUrl).toBe(`https://almacen.test/firmada/${FILA.adjunto_key}?firma=abc`);
    expect(datos.adjuntoExpiraSegundos).toBe(300);
    expect(firmas()).toEqual([{ op: 'createSignedUrl', bucket: 'tickets-adjuntos', key: FILA.adjunto_key, expiresIn: 300 }]);
    expect(JSON.stringify(datos)).not.toContain('adjunto_key');
    expect(consultasDe('tickets', 'select')[0].cols).toContain('adjunto_key');
  });

  it('sin adjunto: adjuntoUrl null y no se firma nada', async () => {
    sdk.responder = responderCon({ extra: { 'tickets:select': () => ({ data: { ...FILA, adjunto_key: null }, error: null }) } });
    const datos = await (await pedir()).json();
    expect(datos.ok).toBe(true);
    expect(datos.adjuntoUrl).toBeNull();
    expect(firmas()).toHaveLength(0);
  });

  it('si no se puede firmar, la respuesta sale igual con adjuntoUrl null', async () => {
    sdk.storage.createSignedUrl = () => ({ data: null, error: { message: 'boom', statusCode: 500 } });
    sdk.responder = responderCon({ extra: { 'tickets:select': () => ({ data: FILA, error: null }) } });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).adjuntoUrl).toBeNull();
  });
});

// ── adjuntoStaff ─────────────────────────────────────────────────────────

describe('tickets.adjuntoStaff — URL firmada para staff con el módulo tickets', () => {
  const KEY = `tickets/${TICKET_ID}/captura.jpg`;
  const pedir = (extra = {}, opciones) => tickets(peticion({ action: 'adjuntoStaff', ticketId: TICKET_ID, ...extra }, opciones));
  const conTicket = (extra = {}) =>
    responderCon({ extra: { 'tickets:select': () => ({ data: { adjunto_key: KEY }, error: null }), ...extra } });
  const llamadasPuede = () => consultasDe('puede', 'rpc').map((q) => q.payload);

  beforeEach(() => {
    sdk.storage.createSignedUrl = ({ key }) => ({ data: { signedUrl: `https://almacen.test/firmada/${key}?firma=abc`, expiresAt: null }, error: null });
  });

  it('con sesión y modulo:tickets (RPC puede con el id del JWT): URL firmada de 300 s, sin la key', async () => {
    sdk.responder = conTicket();
    const r = await pedir();
    const datos = await r.json();
    expect(r.status).toBe(200);
    expect(datos).toEqual({ ok: true, url: `https://almacen.test/firmada/${KEY}?firma=abc`, expiraSegundos: 300 });
    expect(llamadasPuede()).toEqual([{ p_user: 'u-1', p_permiso: 'modulo:tickets' }]);
    expect(firmas()).toEqual([{ op: 'createSignedUrl', bucket: 'tickets-adjuntos', key: KEY, expiresIn: 300 }]);
    expect(Object.keys(datos).sort()).toEqual(['expiraSegundos', 'ok', 'url']); // ni key ni ticketId
  });

  it('sin cabecera Authorization o con token anónimo: 401 no_autenticado, sin consultar nada', async () => {
    sdk.responder = conTicket();
    const sinToken = await pedir({}, { token: null });
    expect(sinToken.status).toBe(401);
    sdk.usuario = null;
    const anonimo = await pedir();
    expect(anonimo.status).toBe(401);
    expect((await anonimo.json()).code).toBe('no_autenticado');
    expect(llamadasPuede()).toHaveLength(0);
    expect(firmas()).toHaveLength(0);
  });

  it('usuario autenticado que NO es staff activo: 401 (no se entera de si el ticket existe)', async () => {
    sdk.responder = conTicket({ 'staff:select': () => ({ data: { rol: 'ASISTENTE', activo: false }, error: null }) });
    const r = await pedir();
    expect(r.status).toBe(401);
    expect(consultasDe('tickets')).toHaveLength(0);
  });

  it('puede=false → 403 no_autorizado y no se lee el ticket ni se firma', async () => {
    sdk.responder = responderCon({ rpcPuede: () => ({ data: false, error: null }) });
    const r = await pedir();
    expect(r.status).toBe(403);
    expect((await r.json()).code).toBe('no_autorizado');
    expect(consultasDe('tickets')).toHaveLength(0);
    expect(firmas()).toHaveLength(0);
  });

  it('error de la RPC puede → 500 error_interno (fail-closed, no 403 ni firma)', async () => {
    sdk.responder = responderCon({ rpcPuede: () => FALLA_BD });
    const r = await pedir();
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('error_interno');
    expect(firmas()).toHaveLength(0);
  });

  it('un valor distinto de true también niega (fail-closed)', async () => {
    sdk.responder = responderCon({ rpcPuede: () => ({ data: 'true', error: null }) });
    expect((await pedir()).status).toBe(403);
  });

  it('ticketId inválido → no_existe sin leer tickets ni consultar permisos; ticket sin adjunto → no_existe', async () => {
    sdk.responder = conTicket();
    expect((await (await pedir({ ticketId: 'no-es-uuid' })).json()).code).toBe('no_existe');
    expect(consultasDe('tickets')).toHaveLength(0);
    expect(llamadasPuede()).toHaveLength(0);
    sdk.responder = conTicket({ 'tickets:select': () => ({ data: { adjunto_key: null }, error: null }) });
    expect((await (await pedir()).json()).code).toBe('no_existe');
    expect(firmas()).toHaveLength(0);
  });

  it('objeto ausente en el bucket (404) → no_existe; otra falla al firmar → 500 error_url', async () => {
    sdk.responder = conTicket();
    sdk.storage.createSignedUrl = () => ({ data: null, error: { message: 'not found', statusCode: 404 } });
    const faltante = await pedir();
    expect(faltante.status).toBe(200);
    expect((await faltante.json()).code).toBe('no_existe');
    sdk.storage.createSignedUrl = () => ({ data: null, error: { message: 'boom', statusCode: 500 } });
    const falla = await pedir();
    expect(falla.status).toBe(500);
    expect((await falla.json()).code).toBe('error_url');
  });

  it('rate-limit por usuario sobre intentos_publicos (120 / 10 min): 429 al llegar al tope', async () => {
    sdk.responder = conTicket({ 'intentos_publicos:select': () => ({ data: new Array(120).fill({ id: 1 }), error: null }) });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await r.json()).code).toBe('demasiados_intentos');
    expect(firmas()).toHaveLength(0);
    sdk.responder = conTicket();
    await pedir();
    expect(consultasDe('intentos_publicos', 'insert')[0].payload).toEqual([{ ambito: 'tickets.adjuntoStaff', clave: 'u-1' }]);
  });
});

// ── equipos-fotos: EXIF también en las fotos del equipo ──────────────────

describe('equipos-fotos.subirFoto — sin metadatos', () => {
  const subir = (contenidoBase64) => equiposFotos(peticion({ action: 'subirFoto', contenidoBase64 }));
  const jefe = () => responderCon({ extra: { 'staff:select': () => ({ data: { rol: 'JEFE', activo: true }, error: null }) } });

  it('la foto subida no lleva EXIF/GPS y conserva el flujo de píxeles', async () => {
    sdk.responder = jefe();
    const r = await subir(JPEG_SUCIO_B64);
    expect((await r.json()).ok).toBe(true);
    expect(subidas()[0].bucket).toBe('equipos-fotos');
    expect(subidas()[0].key).toMatch(/^equipos\/[0-9a-f-]{36}\.jpg$/);
    expect(Array.from(await bytesSubidos())).toEqual([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
  });

  it('una imagen que no se puede recorrer con seguridad se rechaza (archivo_invalido), no se sube tal cual', async () => {
    sdk.responder = jefe();
    const r = await subir(b64(JPEG_SUCIO.subarray(0, 6)));
    expect((await r.json()).code).toBe('archivo_invalido');
    expect(subidas()).toHaveLength(0);
  });
});
