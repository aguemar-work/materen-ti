// ============================================================
// ARCHIVO GENERADO — NO EDITAR A MANO.
// Fuente: functions/encuestas.ts
//         + functions/_shared/http.ts
//         + functions/_shared/errores.ts
//         + functions/_shared/cors.ts
//         + functions/_shared/auth.ts
//         + functions/_shared/tipos.ts
//         + functions/_shared/version.ts
// Regenerar: npm run build:functions (scripts/build-functions.mjs).
// CI verifica que coincida: npm run check:functions.
// ============================================================

// ============================================================
// Edge function: encuestas
// Formulario público (sin sesión) de encuestas anónimas: una ronda
// abierta se responde tantas veces como personas la abran (a diferencia
// de "entregas", no es de un solo uso). El navegador nunca escribe
// directo en `encuesta_respuestas` (sin policy de INSERT) ni lee
// `encuestas`/`encuesta_rondas` sin sesión (RLS solo staff) — todo pasa
// por acá con el cliente admin. El resto (crear plantillas, abrir/cerrar
// rondas, ver resultados) lo hace el staff vía RLS normal, sin pasar por
// esta función.
//
// Acciones (POST { action, ... }):
//   abrir     público { slug }               → { titulo, descripcion, preguntas }
//   responder público { slug, respuestas }    → { ok }
//   version   staff   {}                     → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping      público {}                     → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
// ============================================================

import { createAdminClient, createClient } from 'npm:@insforge/sdk@1.5.2';

// Helpers compartidos (functions/_shared/): scripts/build-functions.mjs pega
// cada bloque aquí para generar functions/dist/encuestas.ts, que es lo que se
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

// Rate-limit por IP: cuenta "abrir" y "responder" juntos para que alternar
// acciones no lo evada.
const INTENTOS_MAX_IP = 20;
const INTENTOS_VENTANA_MIN = 10;

// Mismo criterio que frontend/src/core/dominio-encuestas.js#respuestaValida
// — duplicado a propósito: esta es la copia AUTORITATIVA (el cliente no es
// de confianza), la del frontend es solo para feedback antes de enviar.
type Pregunta = {
  id: string;
  tipo: 'texto_corto' | 'texto_largo' | 'opcion_unica' | 'escala_1_5' | 'si_no';
  etiqueta: string;
  requerido: boolean;
  opciones?: string[];
};

const MAX_LEN: Record<string, number> = { texto_corto: 200, texto_largo: 2000 };

function respuestaValida(pregunta: Pregunta, valor: unknown): boolean {
  const vacio = valor === undefined || valor === null || valor === '';
  if (pregunta.requerido && vacio) return false;
  if (vacio) return true;
  switch (pregunta.tipo) {
    case 'texto_corto':
    case 'texto_largo':
      return typeof valor === 'string' && valor.length <= MAX_LEN[pregunta.tipo];
    case 'opcion_unica':
      return Array.isArray(pregunta.opciones) && pregunta.opciones.includes(valor as string);
    case 'escala_1_5':
      return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 5;
    case 'si_no':
      return typeof valor === 'boolean';
    default:
      return false;
  }
}

// Envoltorio de primer nivel (Ciclo 20): toda excepción no controlada — o la
// falla fail-closed del rate-limit — termina en
// { ok:false, code:'error_interno' } (500) con las cabeceras CORS de esta
// petición, en vez de un 500 opaco sin CORS. Al log solo va el mensaje.
export default (req: Request): Promise<Response> => conEnvoltorio('encuestas', req, manejar);

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

  // ping: healthcheck público (Ciclo 21). Sin sesión y SIN tocar la BD.
  if (body.action === 'ping') {
    return json({ ok: true, funcion: 'encuestas', hora: new Date().toISOString() });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  // version: staff únicamente (cierra el pendiente de H-12 — ver el mismo
  // comentario en functions/credenciales.ts). No es una acción pública.
  if (body.action === 'version') {
    const auth = await autenticarStaff(req, admin, baseUrl);
    if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status);
    return json(await datosVersion(admin, 'encuestas'));
  }

  // Fail-closed (Ciclo 20): si no se puede contar ni registrar el intento se
  // LANZA (→ error_interno). Antes un error de BD daba data=null → "0
  // intentos" y el tope quedaba desactivado justo cuando la BD fallaba.
  async function bajoLimite(): Promise<boolean> {
    const ip = ipDesdeHeaders(req.headers);
    const desde = new Date(Date.now() - INTENTOS_VENTANA_MIN * 60 * 1000).toISOString();
    const { data: intentos, error: eIntentos } = await admin.database
      .from('encuesta_respuesta_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if (eIntentos) throw new Error(`No se pudo contar encuesta_respuesta_intentos: ${eIntentos.message}`);
    if ((intentos?.length || 0) >= INTENTOS_MAX_IP) return false;
    const { error: eRegistro } = await admin.database.from('encuesta_respuesta_intentos').insert([{ ip }]);
    if (eRegistro) throw new Error(`No se pudo registrar el intento: ${eRegistro.message}`);
    return true;
  }

  // Busca la ronda abierta por slug + su plantilla. Devuelve null si no
  // existe o ya está cerrada (nunca distingue el motivo al público).
  async function rondaAbiertaConPlantilla(slug: string) {
    const { data: ronda } = await admin.database
      .from('encuesta_rondas')
      .select('id, cerrada, encuestas(id, titulo, descripcion, preguntas)')
      .eq('slug', slug)
      .maybeSingle();
    const encuesta = ronda ? uno(ronda.encuestas) : null;
    if (!ronda || ronda.cerrada || !encuesta) return null;
    return { rondaId: ronda.id, encuesta };
  }

  if (body.action === 'abrir') {
    const slug = String(body.slug || '');
    if (!slug) return json({ ok: false, code: 'slug_requerido' });
    if (!(await bajoLimite())) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    const encontrada = await rondaAbiertaConPlantilla(slug);
    if (!encontrada) return json({ ok: false, code: 'no_disponible' });

    return json({
      ok: true,
      titulo: encontrada.encuesta.titulo,
      descripcion: encontrada.encuesta.descripcion || '',
      preguntas: encontrada.encuesta.preguntas || [],
    });
  }

  if (body.action === 'responder') {
    const slug = String(body.slug || '');
    const respuestasEnviadas = body.respuestas;
    if (!slug || typeof respuestasEnviadas !== 'object' || respuestasEnviadas === null) {
      return json({ ok: false, code: 'datos_requeridos' });
    }
    if (!(await bajoLimite())) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    const encontrada = await rondaAbiertaConPlantilla(slug);
    if (!encontrada) return json({ ok: false, code: 'no_disponible' });

    const preguntas: Pregunta[] = encontrada.encuesta.preguntas || [];
    const entrada = respuestasEnviadas as Record<string, unknown>;
    const respuestasValidadas: Record<string, unknown> = {};

    for (const pregunta of preguntas) {
      const valor = entrada[pregunta.id];
      if (!respuestaValida(pregunta, valor)) {
        return json({ ok: false, code: 'respuesta_invalida' });
      }
      // Solo se guarda lo que corresponde a una pregunta real de la
      // plantilla — cualquier otra clave que mande el cliente se ignora.
      if (!(valor === undefined || valor === null || valor === '')) {
        respuestasValidadas[pregunta.id] = valor;
      }
    }

    const { error: eInsert } = await admin.database
      .from('encuesta_respuestas')
      .insert([{ ronda_id: encontrada.rondaId, respuestas: respuestasValidadas }]);
    if (eInsert) return json({ ok: false, code: 'error_guardando' }, 500);

    return json({ ok: true });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
