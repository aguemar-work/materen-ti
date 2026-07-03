// ============================================================
// Edge function: credenciales
// Único punto por donde pasan las contraseñas del sistema.
// Las claves de cifrado (CRED_KEY_V2 y CRED_KEY_LEGACY) viven en
// los secrets del servidor y NUNCA llegan al navegador.
//
// Acciones (POST { action, ... }):
//   encrypt              staff   { value }                 → { encrypted }
//   revelar              staff   { cuentaId, motivo }      → { password }  (audita)
//   revelarClaveLicencia staff   { licenciaId, motivo }    → { clave }  (audita)
//   entregaCrear         staff   { empleadoId, cuentaIds } → { token, expiresAt }  (audita)
//   entregaAbrir         público { token }                 → { empleadoNombre, credenciales }  (un solo uso, audita)
//
// Formatos de cifrado:
//   enc2:<iv>:<ct>  AES-256-GCM con CRED_KEY_V2 (actual, servidor)
//   enc:<iv>:<ct>   AES-256-GCM con CRED_KEY_LEGACY (histórico, cliente)
//   otro            texto plano histórico, se devuelve tal cual
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk';

// Solo el frontend de producción y los puertos de desarrollo local.
// Un origen no listado no recibe cabeceras CORS: el navegador bloquea.
const ORIGENES_PERMITIDOS = new Set([
  'https://materen-ti.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]);

let CORS: Record<string, string> = {};

function corsPara(origin: string | null): Record<string, string> {
  if (!origin || !ORIGENES_PERMITIDOS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Cifrado AES-256-GCM ──────────────────────────────────────

const keyCache = new Map<string, CryptoKey>();

async function importKey(b64: string): Promise<CryptoKey> {
  let key = keyCache.get(b64);
  if (!key) {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.set(b64, key);
  }
  return key;
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function encryptV2(text: string): Promise<string> {
  const key = await importKey(Deno.env.get('CRED_KEY_V2')!);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `enc2:${toB64(iv)}:${toB64(ct)}`;
}

async function decryptAny(stored: string): Promise<string> {
  if (!stored) return '';
  let keyB64: string | undefined;
  let payload: string;
  if (stored.startsWith('enc2:')) {
    keyB64 = Deno.env.get('CRED_KEY_V2');
    payload = stored.slice(5);
  } else if (stored.startsWith('enc:')) {
    keyB64 = Deno.env.get('CRED_KEY_LEGACY');
    payload = stored.slice(4);
  } else {
    return stored; // texto plano histórico
  }
  try {
    const [ivB64, ctB64] = payload.split(':');
    const key = await importKey(keyB64!);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
    return new TextDecoder().decode(plain);
  } catch {
    return '(error al descifrar)';
  }
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Handler ──────────────────────────────────────────────────

export default async function (req: Request): Promise<Response> {
  CORS = corsPara(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'metodo_invalido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body_invalido' }, 400);
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  async function log(entry: {
    user_id?: string | null;
    user_email?: string | null;
    cuenta_id?: string | null;
    cuenta_usuario: string;
    plataforma?: string | null;
    accion: string;
    detalle?: string | null;
  }) {
    await admin.database.from('accesos_log').insert([entry]);
  }

  // ── Acción pública: abrir una entrega de un solo uso ───────
  if (body.action === 'entregaAbrir') {
    const token = String(body.token || '');
    if (!token) return json({ ok: false, code: 'token_requerido' });

    const { data: entrega } = await admin.database
      .from('entregas')
      .select('id, empleado_nombre, payload, expires_at, viewed_at')
      .eq('token', token)
      .maybeSingle();

    if (!entrega) return json({ ok: false, code: 'no_existe' });
    if (entrega.viewed_at) return json({ ok: false, code: 'ya_abierta' });
    if (new Date(entrega.expires_at) < new Date()) return json({ ok: false, code: 'expirada' });

    // Marcado atómico: si dos abren a la vez, solo el primero gana
    const { data: marcada } = await admin.database
      .from('entregas')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', entrega.id)
      .is('viewed_at', null)
      .select('id');
    if (!marcada?.length) return json({ ok: false, code: 'ya_abierta' });

    const credenciales = JSON.parse(await decryptAny(entrega.payload));
    for (const c of credenciales) {
      await log({
        cuenta_id: c.cuenta_id || null,
        cuenta_usuario: c.usuario || '(desconocido)',
        plataforma: c.plataforma || null,
        accion: 'entrega_abierta',
        detalle: `Entrega abierta — ${entrega.empleado_nombre}`,
      });
    }

    return json({
      ok: true,
      empleadoNombre: entrega.empleado_nombre,
      credenciales: credenciales.map((c: Record<string, string>) => ({
        plataforma: c.plataforma,
        usuario: c.usuario,
        password: c.password,
        url: c.url,
      })),
    });
  }

  // ── Resto de acciones: requieren staff activo ──────────────
  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
  if (!userToken) return json({ ok: false, code: 'no_autenticado' }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  const user = userData?.user;
  if (!user?.id) return json({ ok: false, code: 'no_autenticado' }, 401);

  const { data: staffRow } = await admin.database
    .from('staff')
    .select('rol, activo')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!staffRow?.activo) return json({ ok: false, code: 'no_es_staff' }, 403);

  // encrypt: cifrar un valor antes de guardarlo (no audita: es escritura)
  if (body.action === 'encrypt') {
    const value = String(body.value || '');
    if (!value) return json({ ok: true, encrypted: null });
    if (value.length > 500) return json({ ok: false, code: 'valor_muy_largo' });
    return json({ ok: true, encrypted: await encryptV2(value) });
  }

  // revelar: devolver la contraseña de una cuenta (audita quién y por qué)
  if (body.action === 'revelar') {
    const cuentaId = String(body.cuentaId || '');
    const motivo = body.motivo === 'copiar' ? 'copiar' : 'ver';
    if (!cuentaId) return json({ ok: false, code: 'cuenta_requerida' });

    const { data: cuenta } = await admin.database
      .from('cuentas')
      .select('id, usuario, password, plataformas(nombre)')
      .eq('id', cuentaId)
      .maybeSingle();
    if (!cuenta) return json({ ok: false, code: 'no_existe' });

    const password = cuenta.password ? await decryptAny(cuenta.password) : '';

    await log({
      user_id: user.id,
      user_email: user.email || null,
      cuenta_id: cuenta.id,
      cuenta_usuario: cuenta.usuario,
      plataforma: cuenta.plataformas?.nombre || null,
      accion: motivo,
    });

    return json({ ok: true, password });
  }

  // revelarClaveLicencia: devolver la clave/serial de una licencia (audita)
  if (body.action === 'revelarClaveLicencia') {
    const licenciaId = String(body.licenciaId || '');
    const motivo = body.motivo === 'copiar' ? 'copiar' : 'ver';
    if (!licenciaId) return json({ ok: false, code: 'licencia_requerida' });

    const { data: licencia } = await admin.database
      .from('licencias')
      .select('id, software, clave')
      .eq('id', licenciaId)
      .maybeSingle();
    if (!licencia) return json({ ok: false, code: 'no_existe' });

    const clave = licencia.clave ? await decryptAny(licencia.clave) : '';

    await log({
      user_id: user.id,
      user_email: user.email || null,
      cuenta_usuario: licencia.software,
      plataforma: null,
      accion: motivo,
      detalle: 'Clave de licencia',
    });

    return json({ ok: true, clave });
  }

  // entregaCrear: generar enlace de un solo uso con las credenciales
  if (body.action === 'entregaCrear') {
    const empleadoId = String(body.empleadoId || '');
    const cuentaIds = Array.isArray(body.cuentaIds) ? body.cuentaIds.map(String) : [];
    const horas = Math.min(Math.max(Number(body.horas) || 24, 1), 168);
    if (!empleadoId || !cuentaIds.length) return json({ ok: false, code: 'datos_requeridos' });

    const { data: empleado } = await admin.database
      .from('empleados')
      .select('nombres, apellidos')
      .eq('id', empleadoId)
      .maybeSingle();
    if (!empleado) return json({ ok: false, code: 'empleado_no_existe' });
    const empleadoNombre = `${empleado.nombres} ${empleado.apellidos}`.trim();

    const { data: cuentas } = await admin.database
      .from('cuentas')
      .select('id, usuario, password, url, plataformas(nombre)')
      .in('id', cuentaIds);
    if (!cuentas?.length) return json({ ok: false, code: 'cuentas_no_existen' });

    const items = [];
    for (const c of cuentas) {
      items.push({
        cuenta_id: c.id,
        plataforma: c.plataformas?.nombre || '',
        usuario: c.usuario,
        password: c.password ? await decryptAny(c.password) : '',
        url: c.url || '',
      });
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + horas * 3600 * 1000).toISOString();

    const { error: insErr } = await admin.database.from('entregas').insert([{
      token,
      empleado_id: empleadoId,
      empleado_nombre: empleadoNombre,
      payload: await encryptV2(JSON.stringify(items)),
      expires_at: expiresAt,
      created_by: user.id,
    }]);
    if (insErr) return json({ ok: false, code: 'error_guardando' }, 500);

    for (const c of items) {
      await log({
        user_id: user.id,
        user_email: user.email || null,
        cuenta_id: c.cuenta_id,
        cuenta_usuario: c.usuario,
        plataforma: c.plataforma || null,
        accion: 'enviar',
        detalle: `Entrega creada para ${empleadoNombre} (expira en ${horas}h)`,
      });
    }

    return json({ ok: true, token, expiresAt });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
