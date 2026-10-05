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

import { createAdminClient } from 'npm:@insforge/sdk@1.5.2';

// Helpers compartidos (functions/_shared/): scripts/build-functions.mjs pega
// cada bloque aquí para generar functions/dist/portal.ts, que es lo que se
// despliega (el runtime exige UN archivo por function). No editar el dist.
// @inline ./_shared/http.ts
// @inline ./_shared/errores.ts
// @inline ./_shared/auth.ts
// @inline ./_shared/ratelimit.ts
// @inline ./_shared/version.ts

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
