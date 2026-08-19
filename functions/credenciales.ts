// ============================================================
// Edge function: credenciales
// Único punto por donde pasan las contraseñas del sistema.
// Las claves de cifrado (CRED_KEY_V2 y CRED_KEY_LEGACY) viven en
// los secrets del servidor y NUNCA llegan al navegador.
//
// Acciones (POST { action, ... }):
//   encrypt              staff   { value }                 → { encrypted }
//   revelar              staff*† { cuentaId, motivo }      → { password }  (audita)
//     (*solo JEFE si la cuenta es tipo_cuenta='personal' — se entrega a un
//      empleado, no se opera directamente. Compartida/reutilizable: staff)
//   revelarClaveLicencia staff†  { licenciaId, motivo }    → { clave }  (audita)
//   entregaCrear         staff†  { empleadoId, cuentaIds } → { token, expiresAt }  (audita)
//     (ASISTENTE no puede "revelar" una cuenta personal, pero sí armar y
//      enviar por WhatsApp un enlace de un solo uso con las cuentas del
//      empleado — decisión de producto 2026-08-07)
//     (†migración 060: además de ser staff activo, exige el permiso
//      individual "credenciales.ver" — staff_permisos, JEFE exento siempre)
//   entregaAbrir         público { token }                 → { empleadoNombre, credenciales }  (un solo uso, audita)
//   accesoDenegado       staff   { ruta }                  → { ok }  (audita un bloqueo por rol del router)
//   version              staff   {}                        → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//
//   -- Módulo "accesos sensibles" (más estricto que lo de arriba: no
//      alcanza con ser staff activo, hace falta ser JEFE Y estar en
//      accesos_sensibles_permisos para ese acceso_id) --
//   encryptSensible       JEFE    { value, accesoId? }      → { encrypted }
//     (accesoId ausente = credencial nueva, cualquier JEFE puede cifrar
//      para crearla; accesoId presente = edición, exige permiso sobre esa fila)
//   revelarAccesoSensible JEFE+permiso { accesoId, motivo } → { password }  (audita)
//
// Formatos de cifrado:
//   enc2:<iv>:<ct>  AES-256-GCM con CRED_KEY_V2 (actual, servidor — Cuentas/Licencias)
//   enc:<iv>:<ct>   AES-256-GCM con CRED_KEY_LEGACY (histórico, cliente)
//   sens1:<iv>:<ct> AES-256-GCM con CRED_KEY_SENSIBLE (clave aislada, solo accesos_sensibles)
//   otro            texto plano histórico, se devuelve tal cual
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk@1.5.2';

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
    // no-store: toda respuesta de esta function puede llevar una contraseña
    // o su metadata — nunca debe quedar en la caché del navegador/proxy.
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// IP de confianza del cliente — mismo criterio que functions/tickets.ts
// (auditoría H-02): cf-connecting-ip/x-real-ip los pone el edge, no el
// cliente; x-forwarded-for es el último recurso y se toma su ÚLTIMO valor.
function ipDesdeHeaders(headers: Headers): string {
  const xff = (headers.get('x-forwarded-for') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    xff[xff.length - 1] ||
    'desconocida'
  );
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

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// El SDK (postgrest-js sin Database schema generado) tipa toda relación
// embebida en un select() como arreglo, aunque en runtime sea un solo
// objeto cuando el embed es por FK 1:1 desde la fila consultada (ej.
// cuentas.plataforma_id → plataformas.id). Sin esto, TS marca `.nombre`
// como inexistente en un arreglo — el dato real siempre fue un objeto.
function uno<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

// export: probado en frontend/tests/credenciales.test.js
export async function encryptV2(text: string): Promise<string> {
  const key = await importKey(Deno.env.get('CRED_KEY_V2')!);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `enc2:${toB64(iv)}:${toB64(ct)}`;
}

// export: probado en frontend/tests/credenciales.test.js
export async function decryptAny(stored: string): Promise<string> {
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

// ── Cifrado aislado para "accesos sensibles" ─────────────────
// Clave propia (CRED_KEY_SENSIBLE) y prefijo propio (sens1:), separados
// de CRED_KEY_V2/enc2: — si esa clave general se viera comprometida
// alguna vez, esta tabla no cae con ella (y viceversa).

async function encryptSensible(text: string): Promise<string> {
  const key = await importKey(Deno.env.get('CRED_KEY_SENSIBLE')!);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return `sens1:${toB64(iv)}:${toB64(ct)}`;
}

async function decryptSensible(stored: string): Promise<string> {
  if (!stored) return '';
  if (!stored.startsWith('sens1:')) return '(formato desconocido)';
  try {
    const [ivB64, ctB64] = stored.slice(6).split(':');
    const key = await importKey(Deno.env.get('CRED_KEY_SENSIBLE')!);
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

// sha256(token) en hex — migración 066/067: entregas ya no guarda el token
// de la URL pública en texto plano, solo su hash. El token en claro nunca
// se persiste desde acá; solo se devuelve al llamador para armar la URL.
// export: probado en frontend/tests/credenciales.test.js
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Rate-limit de revelado (auditoría H-05) ──────────────────
// Un staff activo puede revelar cualquier contraseña por ID; sin tope,
// un insider (o una cuenta comprometida) exfiltra todo el almacén en un
// bucle. Se limita por usuario reutilizando accesos_log, que ya registra
// cada 'ver'/'copiar'. No frena el uso normal (clics sueltos), sí el
// barrido masivo. La auditoría sigue siendo el control detectivo.
const REVELADO_MAX = 40;          // revelados permitidos por ventana
const REVELADO_VENTANA_MIN = 5;   // minutos

// entregaCrear descifra una contraseña por cada cuentaId del lote — sin
// tope, una sola llamada podía pedir el catálogo entero de una vez,
// evadiendo por completo el límite de arriba (hallazgo 2026-08-07).
const ENTREGA_MAX_CUENTAS = 20;

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

  // Capturados una sola vez por request (migración 064): permite reconstruir
  // desde dónde se hizo cada acción de accesos_log, incluyendo intentos
  // fallidos de abrir una entrega (ver entregaAbrir más abajo).
  const ip = ipDesdeHeaders(req.headers);
  const userAgent = req.headers.get('user-agent') || null;

  async function log(entry: {
    user_id?: string | null;
    user_email?: string | null;
    cuenta_id?: string | null;
    cuenta_usuario: string;
    plataforma?: string | null;
    accion: string;
    detalle?: string | null;
  }) {
    await admin.database.from('accesos_log').insert([{ ...entry, ip, user_agent: userAgent }]);
  }

  // Cuántas contraseñas reveló este usuario en la ventana reciente.
  async function reveladosRecientes(userId: string): Promise<number> {
    const desde = new Date(Date.now() - REVELADO_VENTANA_MIN * 60 * 1000).toISOString();
    const { data } = await admin.database
      .from('accesos_log')
      .select('id')
      .eq('user_id', userId)
      .in('accion', ['ver', 'copiar'])
      .gte('created_at', desde);
    return data?.length || 0;
  }

  // ── Permiso "credenciales.ver" (migración 060) ─────────────
  // Gate de quién puede revelar/enviar contraseñas de Cuentas y Licencias
  // (no accesos_sensibles, que ya tiene su propio candado desde la 024).
  // JEFE lo tiene siempre, sin consultar la tabla — mismo criterio que
  // staff_modulos_permisos. Consulta DIRECTA a staff_permisos, NO RPC a
  // tiene_permiso_credenciales_ver(): este handler corre con el cliente
  // admin, sin sesión de usuario — auth.uid() sería NULL dentro de esa
  // función SQL. Mismo patrón ya usado para accesos_sensibles_permisos más
  // abajo (revelarAccesoSensible).
  // ⚠️ Esta regla existe DOS VECES (acá y en tiene_permiso_credenciales_ver,
  // SQL) — ver la advertencia completa en AGENTS.md antes de cambiar
  // cualquiera de las dos: hoy coinciden, pero nada las mantiene
  // sincronizadas automáticamente.
  async function tienePermisoCredenciales(rol: string, userId: string): Promise<boolean> {
    if (rol === 'JEFE') return true;
    const { data } = await admin.database
      .from('staff_permisos')
      .select('staff_user_id')
      .eq('staff_user_id', userId)
      .eq('permiso', 'credenciales.ver')
      .maybeSingle();
    return !!data;
  }

  // ── Permiso de módulo (migración 068) ──────────────────────
  // La RLS de cuentas/licencias ya exige tiene_permiso_modulo() para el
  // CRUD normal (crear/editar la fila desde el cliente), pero revelar/
  // revelarClaveLicencia/entregaCrear leen esas tablas con el cliente
  // ADMIN — bypasean esa RLS. Sin este chequeo, un ASISTENTE sin el
  // módulo "correos"/"licencias" seguiría pudiendo revelar/entregar esas
  // contraseñas aunque ya no pueda ver la fila por RLS. Consulta DIRECTA a
  // staff_modulos_permisos, NO RPC a tiene_permiso_modulo(): mismo motivo
  // que tienePermisoCredenciales — auth.uid() sería NULL en este contexto.
  // ⚠️ Esta regla existe DOS VECES (acá y en tiene_permiso_modulo, SQL) —
  // mismo criterio que credenciales.ver, ver advertencia en AGENTS.md.
  async function tienePermisoModulo(rol: string, userId: string, modulo: string): Promise<boolean> {
    if (rol === 'JEFE') return true;
    const { data } = await admin.database
      .from('staff_modulos_permisos')
      .select('staff_user_id')
      .eq('staff_user_id', userId)
      .eq('modulo', modulo)
      .maybeSingle();
    return !!data;
  }

  // ── Acción pública: abrir una entrega de un solo uso ───────
  // Los 3 retornos tempranos de acá abajo (no_existe/ya_abierta/expirada)
  // auditan igual que el camino de éxito (migración 064) — antes no dejaban
  // rastro, así que un intento de fuerza bruta o un enlace ya usado
  // reintentado eran invisibles en accesos_log. Solo se guardan los
  // primeros caracteres del token en `detalle`: alcanza para correlacionar
  // en soporte, no reconstruye el secreto.
  async function logEntregaFallida(motivo: string, tokenRecibido: string) {
    await log({
      cuenta_usuario: '(entrega)',
      accion: 'entrega_fallida',
      detalle: `Intento fallido (${motivo}) — token ${tokenRecibido.slice(0, 8)}…`,
    });
  }

  if (body.action === 'entregaAbrir') {
    const token = String(body.token || '');
    if (!token) return json({ ok: false, code: 'token_requerido' });

    // Búsqueda por hash (migración 066/067): el token en claro nunca se
    // persiste en BD, solo su sha256. El UPDATE atómico de más abajo sigue
    // usando el `id` ya resuelto acá, no cambia.
    const tokenHash = await hashToken(token);
    const { data: entrega } = await admin.database
      .from('entregas')
      .select('id, empleado_nombre, payload, expires_at, viewed_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (!entrega) {
      await logEntregaFallida('no_existe', token);
      return json({ ok: false, code: 'no_existe' });
    }
    if (entrega.viewed_at) {
      await logEntregaFallida('ya_abierta', token);
      return json({ ok: false, code: 'ya_abierta' });
    }
    if (new Date(entrega.expires_at) < new Date()) {
      await logEntregaFallida('expirada', token);
      return json({ ok: false, code: 'expirada' });
    }

    // Marcado atómico: si dos abren a la vez, solo el primero gana
    const { data: marcada } = await admin.database
      .from('entregas')
      .update({ viewed_at: new Date().toISOString() })
      .eq('id', entrega.id)
      .is('viewed_at', null)
      .select('id');
    if (!marcada?.length) {
      await logEntregaFallida('ya_abierta', token);
      return json({ ok: false, code: 'ya_abierta' });
    }

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

  // version: expone qué versión de esquema/SDK/deploy tiene ESTA instancia
  // desplegada (migraciones 069/070) — cierra el pendiente de H-12 (pin a
  // @insforge/sdk@1.5.2 resuelto en código desde 2026-08-16, pero sin forma
  // de confirmar desde adentro si el redeploy real ya ocurrió, o si esta
  // function quedó desincronizada respecto a las otras 3/4). Requiere
  // sesión de staff (ya validada arriba), no es una acción pública.
  if (body.action === 'version') {
    const [{ data: migracion }, { data: deploy }] = await Promise.all([
      admin.database.from('schema_migrations').select('version, nombre_archivo, aplicada_en')
        .order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.database.from('function_deploys').select('sha256, commit_sha, desplegado_en')
        .eq('funcion', 'credenciales').order('desplegado_en', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json({
      ok: true,
      funcion: 'credenciales',
      sdkVersion: '1.5.2',
      ultimaMigracion: migracion || null,
      ultimoDeploy: deploy || null,
    });
  }

  // accesoDenegado: el guard del router bloqueó una ruta restringida por
  // rol (ej. /accesos-sensibles para un ASISTENTE) y lo reporta acá para
  // que quede rastro en accesos_log (migración 030). Usuario y rol salen
  // del token y de la fila de staff, no del body — el cliente solo aporta
  // la ruta, así no puede fabricar registros a nombre de otro.
  if (body.action === 'accesoDenegado') {
    const ruta = String(body.ruta || '');
    if (!ruta.startsWith('/') || ruta.length > 200) {
      return json({ ok: false, code: 'ruta_invalida' });
    }
    await log({
      user_id: user.id,
      user_email: user.email || null,
      cuenta_id: null,
      cuenta_usuario: ruta,
      plataforma: null,
      accion: 'acceso_denegado',
      detalle: `Bloqueado por rol ${staffRow.rol}`,
    });
    return json({ ok: true });
  }

  // encrypt: cifrar un valor antes de guardarlo (no audita: es escritura)
  if (body.action === 'encrypt') {
    const value = String(body.value || '');
    if (!value) return json({ ok: true, encrypted: null });
    if (value.length > 500) return json({ ok: false, code: 'valor_muy_largo' });
    return json({ ok: true, encrypted: await encryptV2(value) });
  }

  // ── Acciones del módulo "accesos sensibles" ────────────────
  // Más estrictas que todo lo de arriba: no alcanza con staffRow.activo
  // (eso ya se chequeó arriba para llegar hasta acá) — hace falta además
  // rol === 'JEFE', y para tocar una fila puntual, estar en
  // accesos_sensibles_permisos para ese acceso_id. La RLS ya protege la
  // tabla en sí; este chequeo protege específicamente el descifrado
  // (que corre con el cliente admin, fuera del alcance de la RLS).

  // encryptSensible: cifrar antes de guardar (crear o editar una credencial)
  if (body.action === 'encryptSensible') {
    if (staffRow.rol !== 'JEFE') return json({ ok: false, code: 'no_autorizado' }, 403);

    const value = String(body.value || '');
    if (!value) return json({ ok: true, encrypted: null });
    if (value.length > 500) return json({ ok: false, code: 'valor_muy_largo' });

    // accesoId presente = está editando una fila existente: exige permiso
    // sobre ESA fila. Ausente = está creando una nueva: cualquier JEFE puede
    // (el propio creador queda con permiso automático vía trigger de BD).
    const accesoId = body.accesoId ? String(body.accesoId) : null;
    if (accesoId) {
      const { data: permiso } = await admin.database
        .from('accesos_sensibles_permisos')
        .select('acceso_id')
        .eq('acceso_id', accesoId)
        .eq('staff_user_id', user.id)
        .maybeSingle();
      if (!permiso) return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    return json({ ok: true, encrypted: await encryptSensible(value) });
  }

  // revelarAccesoSensible: descifrar (audita, mismo rate-limit que revelar)
  if (body.action === 'revelarAccesoSensible') {
    const accesoId = String(body.accesoId || '');
    const motivo = body.motivo === 'copiar' ? 'copiar' : 'ver';
    if (!accesoId) return json({ ok: false, code: 'acceso_requerido' });

    if (staffRow.rol !== 'JEFE') return json({ ok: false, code: 'no_autorizado' }, 403);

    const { data: permiso } = await admin.database
      .from('accesos_sensibles_permisos')
      .select('acceso_id')
      .eq('acceso_id', accesoId)
      .eq('staff_user_id', user.id)
      .maybeSingle();
    if (!permiso) return json({ ok: false, code: 'no_autorizado' }, 403);

    if (await reveladosRecientes(user.id) >= REVELADO_MAX) {
      return json({ ok: false, code: 'demasiados_revelados' }, 429);
    }

    const { data: acceso } = await admin.database
      .from('accesos_sensibles')
      .select('id, nombre, categoria, password')
      .eq('id', accesoId)
      .maybeSingle();
    if (!acceso) return json({ ok: false, code: 'no_existe' });

    const password = acceso.password ? await decryptSensible(acceso.password) : '';

    await log({
      user_id: user.id,
      user_email: user.email || null,
      cuenta_id: null,
      cuenta_usuario: acceso.nombre,
      plataforma: acceso.categoria,
      accion: motivo,
      detalle: `Acceso sensible id=${acceso.id}`,
    });

    return json({ ok: true, password });
  }

  // revelar: devolver la contraseña de una cuenta (audita quién y por qué)
  // Decisión de producto (2026-08-07): una cuenta PERSONAL (se entrega a un
  // empleado) solo la revela JEFE — el ASISTENTE la entrega por enlace de
  // WhatsApp (entregaCrear), nunca la ve él mismo. Correos compartidos y
  // reutilizables quedan fuera de esta restricción: el ASISTENTE los usa
  // para operar la bandeja, no para entregarlos a un tercero.
  if (body.action === 'revelar') {
    const cuentaId = String(body.cuentaId || '');
    const motivo = body.motivo === 'copiar' ? 'copiar' : 'ver';
    if (!cuentaId) return json({ ok: false, code: 'cuenta_requerida' });

    if (!(await tienePermisoCredenciales(staffRow.rol, user.id))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }
    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'correos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    const { data: cuenta } = await admin.database
      .from('cuentas')
      .select('id, usuario, password, tipo_cuenta, plataformas(nombre)')
      .eq('id', cuentaId)
      .maybeSingle();
    if (!cuenta) return json({ ok: false, code: 'no_existe' });

    if (cuenta.tipo_cuenta === 'personal' && staffRow.rol !== 'JEFE') {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    if (await reveladosRecientes(user.id) >= REVELADO_MAX) {
      return json({ ok: false, code: 'demasiados_revelados' }, 429);
    }

    const password = cuenta.password ? await decryptAny(cuenta.password) : '';

    await log({
      user_id: user.id,
      user_email: user.email || null,
      cuenta_id: cuenta.id,
      cuenta_usuario: cuenta.usuario,
      plataforma: uno(cuenta.plataformas)?.nombre || null,
      accion: motivo,
    });

    return json({ ok: true, password });
  }

  // revelarClaveLicencia: devolver la clave/serial de una licencia (audita)
  // Sin restricción de rol (decisión de producto 2026-08-07): el ASISTENTE
  // instala/activa software con estas claves como parte de su trabajo.
  if (body.action === 'revelarClaveLicencia') {
    const licenciaId = String(body.licenciaId || '');
    const motivo = body.motivo === 'copiar' ? 'copiar' : 'ver';
    if (!licenciaId) return json({ ok: false, code: 'licencia_requerida' });

    if (!(await tienePermisoCredenciales(staffRow.rol, user.id))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }
    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'licencias'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    if (await reveladosRecientes(user.id) >= REVELADO_MAX) {
      return json({ ok: false, code: 'demasiados_revelados' }, 429);
    }

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
  // Descifra tantas contraseñas como cuentaIds recibidos, igual que
  // "revelar" en bucle — por eso pasa por el mismo tope de lote y el mismo
  // rate-limit (H-05), y solo puede incluir cuentas realmente asignadas al
  // empleado (nunca credenciales de otra persona).
  if (body.action === 'entregaCrear') {
    const empleadoId = String(body.empleadoId || '');
    const cuentaIds = Array.isArray(body.cuentaIds) ? [...new Set(body.cuentaIds.map(String))] : [];
    const horas = Math.min(Math.max(Number(body.horas) || 24, 1), 168);
    if (!empleadoId || !cuentaIds.length) return json({ ok: false, code: 'datos_requeridos' });
    if (cuentaIds.length > ENTREGA_MAX_CUENTAS) return json({ ok: false, code: 'demasiadas_cuentas' });

    if (!(await tienePermisoCredenciales(staffRow.rol, user.id))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }
    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'correos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    if ((await reveladosRecientes(user.id)) + cuentaIds.length > REVELADO_MAX) {
      return json({ ok: false, code: 'demasiados_revelados' }, 429);
    }

    const { data: empleado } = await admin.database
      .from('empleados')
      .select('nombres, apellidos')
      .eq('id', empleadoId)
      .maybeSingle();
    if (!empleado) return json({ ok: false, code: 'empleado_no_existe' });
    const empleadoNombre = `${empleado.nombres} ${empleado.apellidos}`.trim();

    // Solo cuentas con asignación ACTIVA a este empleado — nunca las de
    // otra persona, aunque el llamador haya mandado ese id por error o
    // a propósito.
    const { data: asignadas } = await admin.database
      .from('asignaciones_cuenta')
      .select('cuenta_id')
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .in('cuenta_id', cuentaIds);
    const idsPermitidos = new Set((asignadas || []).map((a) => a.cuenta_id));
    const cuentaIdsValidos = cuentaIds.filter((id) => idsPermitidos.has(id));
    if (!cuentaIdsValidos.length) return json({ ok: false, code: 'cuentas_no_asignadas' });

    const { data: cuentas } = await admin.database
      .from('cuentas')
      .select('id, usuario, password, url, plataformas(nombre)')
      .in('id', cuentaIdsValidos);
    if (!cuentas?.length) return json({ ok: false, code: 'cuentas_no_existen' });

    const items = [];
    for (const c of cuentas) {
      items.push({
        cuenta_id: c.id,
        plataforma: uno(c.plataformas)?.nombre || '',
        usuario: c.usuario,
        password: c.password ? await decryptAny(c.password) : '',
        url: c.url || '',
      });
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + horas * 3600 * 1000).toISOString();

    // Solo se inserta token_hash (migración 066/067 ya completa: la columna
    // `token` en claro fue retirada de la tabla). `token` sigue existiendo
    // como variable local — hace falta para calcular el hash y para el
    // enlace que se devuelve al llamador — pero nunca se persiste en BD.
    const { error: insErr } = await admin.database.from('entregas').insert([{
      token_hash: await hashToken(token),
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
