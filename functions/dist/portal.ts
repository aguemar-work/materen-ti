// ============================================================
// ARCHIVO GENERADO — NO EDITAR A MANO.
// Fuente: functions/portal.ts
//         + functions/_shared/http.ts
//         + functions/_shared/errores.ts
//         + functions/_shared/cors.ts
//         + functions/_shared/auth.ts
//         + functions/_shared/tipos.ts
//         + functions/_shared/ratelimit.ts
//         + functions/_shared/version.ts
// Regenerar: npm run build:functions (scripts/build-functions.mjs).
// CI verifica que coincida: npm run check:functions.
// ============================================================

// ============================================================
// Edge function: portal
// Portal del empleado SIN cuentas (migración 109): el empleado abre su enlace
// personal (/mi/<token>) y ve lo suyo; sin sesión. El navegador nunca lee ni
// escribe `empleado_enlaces` (sin privilegios de cliente): todo pasa por acá
// con el cliente admin y por las RPC `portal_abrir` y `portal_confirmar_equipo`
// (EXECUTE solo project_admin). El enlace lo EMITE y REVOCA el staff con sesión,
// por las RPC `portal_emitir_enlace` / `portal_revocar_enlace`, sin pasar por acá.
//
// Acciones (POST { action, ... }):
//   abrir           público { token }                  → { nombre, vence, alcance, equipos?, accesos?, tickets? }
//   confirmarEquipo público { token, asignacionId }    → { yaConfirmada, confirmadoAt }
//   version         staff   {}                         → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping            público {}                         → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
//
// El token es un bearer token de 144 bits (24 caracteres base64url): quien lo
// tiene ES ese empleado. Reglas de esta function:
//   * Nunca se loguea, se devuelve ni se guarda el token (el rate-limit usa un
//     hash truncado; los errores no lo incluyen).
//   * Sin oráculo: un token inexistente, mal formado, vencido, revocado o de un
//     empleado que ya no está Activo responden IGUAL ({ ok:false, code:'no_existe' }).
//   * Rate-limit sobre `intentos_publicos` (migración 104): 20 por IP y 20 por
//     token cada 10 min, entre las dos acciones públicas.
//   * Lo que se entrega se proyecta campo por campo: aunque la RPC cambiara,
//     una contraseña, una URL o unas notas no saldrían de acá.
// ============================================================

import { createAdminClient, createClient } from 'npm:@insforge/sdk@1.5.2';

// Helpers compartidos (functions/_shared/): scripts/build-functions.mjs pega
// cada bloque aquí para generar functions/dist/portal.ts, que es lo que se
// despliega (el runtime exige UN archivo por function). No editar el dist.

// ── _shared/http.ts (inlinado por scripts/build-functions.mjs) ──
// Respuestas HTTP y utilidades de petición comunes a las edge functions.
// Fuente única: scripts/build-functions.mjs inlina este archivo en el dist de
// cada function (un solo archivo, sin imports).

// Sin una clave `error` (string) en el body, el SDK del cliente descarta el
// body completo en toda respuesta no-2xx y arma un InsForgeError genérico
// ("Request failed: <statusText>") — `code` nunca llega al frontend
// (`"error" in data` es el único gate que usa @insforge/sdk para conservar
// las claves del body). Se espeja `code` en `error` solo para status >= 400.
// `Cache-Control: no-store` en TODA respuesta: pueden llevar contraseñas,
// tokens de ticket, datos de contacto o plantillas que no deben quedar en la
// caché del navegador ni de un proxy.
export function respuesta(cors: Record<string, string>, body: unknown, status = 200): Response {
  const payload =
    status >= 400 && body && typeof body === 'object' && 'code' in body && !('error' in body)
      ? { ...body, error: (body as { code: string }).code }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// El SDK (postgrest-js sin Database schema generado) tipa toda relación
// embebida en un select() como arreglo, aunque en runtime sea un solo
// objeto cuando el embed es por FK 1:1 desde la fila consultada (ej.
// tickets.categoria_id → categorias_ticket.id). Sin esto, TS marca
// `.nombre` como inexistente en un arreglo — el dato real siempre fue
// un objeto.
export function uno<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

// IP de confianza del cliente. cf-connecting-ip / x-real-ip los pone el
// edge (un solo valor, no falsificables). x-forwarded-for es el último
// recurso y se toma su ÚLTIMO valor: los proxies AGREGAN la IP real al
// final; el primero lo controla el cliente (auditoría H-02).
export function ipDesdeHeaders(headers: Headers): string {
  const xff = (headers.get('x-forwarded-for') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    xff[xff.length - 1] ||
    'desconocida'
  );
}

// ── _shared/errores.ts (inlinado por scripts/build-functions.mjs) ──
// Envoltorio de primer nivel de las edge functions. Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.

// ── _shared/cors.ts (inlinado por scripts/build-functions.mjs) ──
// CORS de las edge functions. Fuente única: scripts/build-functions.mjs inlina
// este archivo en el dist de cada function (un solo archivo, sin imports).

// Solo el frontend de producción y los puertos de desarrollo local.
// Un origen no listado no recibe cabeceras CORS: el navegador bloquea.
export const ORIGENES_PERMITIDOS = new Set([
  'https://materen-ti.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]);

// Cabeceras CORS calculadas POR PETICIÓN (Ciclo 20): antes vivían en un
// `let CORS` global de módulo, reasignado al entrar cada petición — con
// peticiones concurrentes en el mismo isolate, una podía pisar el valor de
// otra entre dos `await`. Viajan como argumento, nunca como estado global.
export function corsPara(origin: string | null): Record<string, string> {
  if (!origin || !ORIGENES_PERMITIDOS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// Ciclo 20: toda excepción no controlada — una falla de red hacia la BD, un
// error del SDK, o una falla fail-closed que lanza la propia function (rate-limit
// que no se pudo contar/registrar, auditoría que no se pudo escribir) — termina
// en { ok:false, code:'error_interno' } (500) con las cabeceras CORS de ESTA
// petición, en vez de un 500 opaco sin CORS de la plataforma (el navegador lo
// veía como un error de red). Al log solo va el mensaje, nunca el body (puede
// traer DNI, contacto, contenido de archivos o un valor descifrado).
export async function conEnvoltorio(
  funcion: string,
  req: Request,
  manejar: (req: Request, cors: Record<string, string>) => Promise<Response>,
): Promise<Response> {
  const cors = corsPara(req.headers.get('Origin'));
  try {
    return await manejar(req, cors);
  } catch (e) {
    console.error(`[${funcion}] error no controlado:`, e instanceof Error ? e.message : String(e));
    return respuesta(cors, { ok: false, code: 'error_interno' }, 500);
  }
}

// ── _shared/auth.ts (inlinado por scripts/build-functions.mjs) ──
// Autenticación de staff por sesión (Bearer). Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.

// ── _shared/tipos.ts (inlinado por scripts/build-functions.mjs) ──
// Tipos compartidos del SDK. Fuente única: scripts/build-functions.mjs inlina
// este archivo en el dist de cada edge function (que se despliega como UN solo
// archivo, sin imports locales). No editar los dist a mano.

export type ClienteAdmin = ReturnType<typeof createAdminClient>;


export type UsuarioSesion = { id: string; email: string | null };

// Usuario dueño del token de sesión (Ciclo 21). Distingue "no hay usuario"
// (token inválido/expirado/anónimo → null → 401 no_autenticado) de "falló la
// consulta" (caída de red, 5xx, 408/429 → LANZA → error_interno 500). Antes se
// ignoraba el `error` y una caída de la plataforma se veía como sesión expirada.
export async function usuarioDeToken(
  userClient: ReturnType<typeof createClient>,
): Promise<UsuarioSesion | null> {
  const { data, error } = await userClient.auth.getCurrentUser();
  if (error) {
    const sc = (error as { statusCode?: number }).statusCode;
    if (typeof sc === 'number' && sc >= 400 && sc < 500 && sc !== 408 && sc !== 429) return null;
    throw new Error(`No se pudo verificar la sesión: ${error.message}`);
  }
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email || null };
}

export type ResultadoStaff =
  | { ok: true; user: UsuarioSesion; rol: string }
  | { ok: false; code: 'no_autenticado'; status: 401 }
  | { ok: false; code: 'no_es_staff'; status: 403 };

// Staff ACTIVO dueño de la sesión de la petición. FAIL-CLOSED (Ciclo 21):
//   - sin cabecera Authorization / token inválido o anónimo → no_autenticado 401
//   - usuario autenticado sin fila de staff activa → no_es_staff 403
//   - la consulta de la sesión o de la tabla `staff` FALLA → se LANZA (el
//     envoltorio de primer nivel responde error_interno 500). Nunca se degrada
//     un error de BD a "no es staff" ni a "es público".
export async function autenticarStaff(
  req: Request,
  admin: ClienteAdmin,
  baseUrl: string,
): Promise<ResultadoStaff> {
  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
  if (!userToken) return { ok: false, code: 'no_autenticado', status: 401 };

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const user = await usuarioDeToken(userClient);
  if (!user) return { ok: false, code: 'no_autenticado', status: 401 };

  const { data: staffRow, error: eStaff } = await admin.database
    .from('staff')
    .select('rol, activo')
    .eq('user_id', user.id)
    .maybeSingle();
  if (eStaff) throw new Error(`No se pudo leer la fila de staff: ${eStaff.message}`);
  if (!staffRow?.activo) return { ok: false, code: 'no_es_staff', status: 403 };
  return { ok: true, user, rol: staffRow.rol };
}

// Variante para acciones con sesión OPCIONAL (tickets.crear): "sin cabecera /
// token anónimo o inválido / usuario que no es staff activo" son público (null);
// si HAY un usuario autenticado y la consulta de sesión o de `staff` FALLA, se
// LANZA igual que en autenticarStaff (fail-closed).
export async function staffDeSesion(
  req: Request,
  admin: ClienteAdmin,
  baseUrl: string,
): Promise<{ id: string; email: string | null; rol: string } | null> {
  const r = await autenticarStaff(req, admin, baseUrl);
  return r.ok ? { id: r.user.id, email: r.user.email, rol: r.rol } : null;
}

// ── _shared/ratelimit.ts (inlinado por scripts/build-functions.mjs) ──
// Rate-limit genérico sobre `intentos_publicos` (migración 104). Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.
// Cuenta los intentos recientes del par (ámbito, clave) y, si todavía hay cupo,
// registra este. Devuelve true cuando YA se alcanzó el tope (el llamador
// responde 429 `demasiados_intentos`; un intento bloqueado no se registra).
// FAIL-CLOSED: si no se puede contar o registrar se LANZA (→ error_interno),
// nunca se asume "0 intentos".
export async function excedeLimite(
  admin: ClienteAdmin,
  ambito: string,
  clave: string,
  max: number,
  ventanaMin: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - ventanaMin * 60 * 1000).toISOString();
  const { data, error } = await admin.database
    .from('intentos_publicos')
    .select('id')
    .eq('ambito', ambito)
    .eq('clave', clave)
    .gte('created_at', desde)
    .limit(max);
  if (error) throw new Error(`No se pudo contar intentos_publicos (${ambito}): ${error.message}`);
  if ((data?.length || 0) >= max) return true;
  const { error: eRegistro } = await admin.database.from('intentos_publicos').insert([{ ambito, clave }]);
  if (eRegistro) throw new Error(`No se pudo registrar el intento en intentos_publicos (${ambito}): ${eRegistro.message}`);
  return false;
}

// ── _shared/version.ts (inlinado por scripts/build-functions.mjs) ──
// Acción `version` (staff) común a las 4 edge functions: qué versión de
// esquema/SDK/deploy tiene ESTA instancia desplegada (migraciones 069/070).
// Fuente única: scripts/build-functions.mjs inlina este archivo en el dist de
// cada function. El pin del SDK vive en los imports `npm:@insforge/sdk@<versión>`;
// el build falla si un dist mezcla versiones distintas.
export const SDK_VERSION = '1.5.2';

export async function datosVersion(admin: ClienteAdmin, funcion: string) {
  const [{ data: migracion }, { data: deploy }] = await Promise.all([
    admin.database.from('schema_migrations').select('version, nombre_archivo, aplicada_en')
      .order('version', { ascending: false }).limit(1).maybeSingle(),
    admin.database.from('function_deploys').select('sha256, commit_sha, desplegado_en')
      .eq('funcion', funcion).order('desplegado_en', { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    ok: true,
    funcion,
    sdkVersion: SDK_VERSION,
    ultimaMigracion: migracion || null,
    ultimoDeploy: deploy || null,
  };
}

const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rate-limit (ventana de 10 min, tope por IP y por token, compartido entre acciones).
const LIMITE_VENTANA_MIN = 10;
const LIMITE_MAX = 20;

// Códigos que el portal puede devolver al navegador; cualquier otro es un fallo
// interno (no se reenvía texto de la base).
const CODIGOS_NEGOCIO = new Set(['no_existe', 'sin_alcance', 'no_encontrada']);

// SHA-256 en hexadecimal, truncado: es la CLAVE del contador por token. Así el
// token nunca queda en `intentos_publicos` (una tabla que solo lee el admin,
// pero que no debe guardar un bearer token en claro).
async function claveDeToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

type Fila = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const textoONulo = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function filas(v: unknown): Fila[] {
  return Array.isArray(v) ? (v as Fila[]) : [];
}

// Proyección explícita de la respuesta de portal_abrir (defensa en profundidad).
function proyectarPortal(r: Fila) {
  const salida: Record<string, unknown> = {
    ok: true,
    nombre: texto(r.nombre),
    vence: textoONulo(r.vence),
    alcance: Array.isArray(r.alcance) ? (r.alcance as unknown[]).filter((a): a is string => typeof a === 'string') : [],
  };
  if (Array.isArray(r.equipos)) {
    salida.equipos = filas(r.equipos).map((e) => ({
      asignacion_id: texto(e.asignacion_id),
      codigo: texto(e.codigo),
      tipo: texto(e.tipo),
      entregado: textoONulo(e.entregado),
      condicion: textoONulo(e.condicion),
      confirmado_at: textoONulo(e.confirmado_at),
    }));
  }
  if (Array.isArray(r.accesos)) {
    salida.accesos = filas(r.accesos).map((a) => ({ plataforma: texto(a.plataforma), usuario: texto(a.usuario) }));
  }
  if (Array.isArray(r.tickets)) {
    salida.tickets = filas(r.tickets).map((t) => ({
      codigo: texto(t.codigo),
      titulo: texto(t.titulo),
      estado: texto(t.estado),
      creado: textoONulo(t.creado),
    }));
  }
  return salida;
}

// Envoltorio de primer nivel: toda excepción no controlada — o una falla
// fail-closed del rate-limit — termina en { ok:false, code:'error_interno' }
// (500) con las cabeceras CORS de esta petición. Al log solo va el mensaje.
export default (req: Request): Promise<Response> => conEnvoltorio('portal', req, manejar);

async function manejar(req: Request, cors: Record<string, string>): Promise<Response> {
  const json = (body: unknown, status = 200) => respuesta(cors, body, status);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'metodo_invalido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body_invalido' }, 400);
  }

  // ping: healthcheck público. Sin sesión y SIN tocar la BD.
  if (body.action === 'ping') {
    return json({ ok: true, funcion: 'portal', hora: new Date().toISOString() });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  // version: staff únicamente.
  if (body.action === 'version') {
    const auth = await autenticarStaff(req, admin, baseUrl);
    if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status);
    return json(await datosVersion(admin, 'portal'));
  }

  if (body.action !== 'abrir' && body.action !== 'confirmarEquipo') {
    return json({ ok: false, code: 'accion_desconocida' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const ip = ipDesdeHeaders(req.headers);

  // Rate-limit: primero por IP (cuenta también los tokens mal formados) y, si el
  // token tiene forma de token, por token. Un intento bloqueado no se registra.
  if (await excedeLimite(admin, 'portal.ip', ip, LIMITE_MAX, LIMITE_VENTANA_MIN)) {
    return json({ ok: false, code: 'demasiados_intentos' }, 429);
  }
  if (!TOKEN_RE.test(token)) return json({ ok: false, code: 'no_existe' });
  if (await excedeLimite(admin, 'portal.token', await claveDeToken(token), LIMITE_MAX, LIMITE_VENTANA_MIN)) {
    return json({ ok: false, code: 'demasiados_intentos' }, 429);
  }

  if (body.action === 'abrir') {
    const { data, error } = await admin.database.rpc('portal_abrir', { p_token: token, p_ip: ip });
    // Solo el mensaje de la base (nunca el token) llega al log del envoltorio.
    if (error) throw new Error(`portal_abrir falló: ${error.message}`);
    const r = (Array.isArray(data) ? data[0] : data) as Fila | null;
    if (!r || r.ok !== true) {
      if (r && typeof r.code === 'string' && r.code !== 'no_existe') throw new Error('portal_abrir devolvió un código inesperado');
      return json({ ok: false, code: 'no_existe' });
    }
    return json(proyectarPortal(r));
  }

  // confirmarEquipo
  const asignacionId = typeof body.asignacionId === 'string' ? body.asignacionId : '';
  if (!UUID_RE.test(asignacionId)) return json({ ok: false, code: 'no_encontrada' });
  const { data, error } = await admin.database.rpc('portal_confirmar_equipo', {
    p_token: token,
    p_asignacion_id: asignacionId,
    p_ip: ip,
  });
  if (error) throw new Error(`portal_confirmar_equipo falló: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Fila | null;
  if (!r) throw new Error('portal_confirmar_equipo no devolvió respuesta');
  if (r.ok !== true) {
    const code = typeof r.code === 'string' && CODIGOS_NEGOCIO.has(r.code) ? r.code : '';
    if (!code) throw new Error('portal_confirmar_equipo devolvió un código inesperado');
    return json({ ok: false, code });
  }
  return json({ ok: true, yaConfirmada: r.ya_confirmada === true, confirmadoAt: textoONulo(r.confirmado_at) });
}
