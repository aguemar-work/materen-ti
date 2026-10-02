// ============================================================
// Edge function: equipos-fotos
// Único punto por donde se sube/elimina una foto del bucket público
// "equipos-fotos". Antes, el navegador llamaba directo a
// storage.uploadAuto() con la sesión de staff — sin ninguna validación
// server-side de tipo/tamaño (auditoría externa, 2026-08-17): un staff
// con DevTools abierto (o un token robado) podía subir cualquier byte con
// cualquier extensión a un bucket público. Mismo patrón que
// functions/tickets.ts para adjuntos: se ignora el `tipo` declarado por el
// cliente y se valida el contenido real por magic bytes.
//
// Requiere sesión de staff activo CON el módulo "equipos" otorgado
// (mismo patrón que functions/credenciales.ts: Authorization: Bearer
// <token>, no hay acción pública acá). Hasta 2026-08-20 solo exigía staff
// activo, sin mirar el módulo — un ASISTENTE sin "equipos" podía subir o
// borrar cualquier foto del bucket completo aunque la RLS de la tabla
// `equipos` (migración 068) ya se lo negara ahí. Hallazgo de auditoría
// externa, cerrado agregando tienePermisoModulo('equipos') a subirFoto/
// eliminarFoto.
//
// Acciones (POST { action, ... }):
//   subirFoto   staff { contenidoBase64, equipoId? } → { url, key }
//   eliminarFoto staff { key }            → { ok }
//   subirActa   staff { asignacionId, tipo, archivo (base64 de un PDF), nombre?, firmadoAt? }
//               → { ok, acta: { id, tipo, tamanoBytes, firmadoAt, creadaEn } }
//               (acta firmada en físico, migración 110; bucket PRIVADO actas-firmadas)
//   urlActa     staff { actaId }          → { ok, url, expiraEn, expiraSegundos }
//   version     staff  {}                 → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping        público {}                → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk@1.5.2';

const ORIGENES_PERMITIDOS = new Set([
  'https://materen-ti.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]);

// Cabeceras CORS calculadas POR PETICIÓN (Ciclo 20): antes vivían en un
// `let CORS` global de módulo, reasignado al entrar cada petición — con
// peticiones concurrentes en el mismo isolate, una podía pisar el valor de
// otra entre dos `await`. Mismo cambio en las 4 edge functions.
function corsPara(origin: string | null): Record<string, string> {
  if (!origin || !ORIGENES_PERMITIDOS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// Sin una clave `error` (string) en el body, el SDK del cliente descarta el
// body completo en toda respuesta no-2xx y arma un InsForgeError genérico
// ("Request failed: <statusText>") — `code` nunca llega al frontend
// (`"error" in data` es el único gate que usa @insforge/sdk para conservar
// las claves del body). Se espeja `code` en `error` solo para status >= 400.
function respuesta(cors: Record<string, string>, body: unknown, status = 200): Response {
  const payload =
    status >= 400 && body && typeof body === 'object' && 'code' in body && !('error' in body)
      ? { ...body, error: (body as { code: string }).code }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Tamaño máximo del archivo YA COMPRIMIDO por el cliente (frontend/src/core/
// imagenes.js deja ~150-250KB) — mismo tope que adjuntos de tickets, margen
// amplio y consistente con el resto del sistema.
const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Tope de CANTIDAD de fotos por equipo. Duplicado A PROPÓSITO del
// `MAX_FOTOS` de frontend/src/modules/equipos/EquipoForm.vue: el proyecto no
// comparte código entre el cliente y las edge functions (ver AGENTS.md), y
// hasta 2026-08-31 este número vivía SOLO en el cliente — como esta función
// sube con el cliente ADMIN (bypasea la RLS de `equipos`), el tope era
// evitable con la sesión de cualquier staff con el módulo "equipos". Misma
// clase de hallazgo que la validación de tipo/tamaño de 2026-08-17.
// ⚠️ Los dos valores tienen que moverse JUNTOS: si acá dice 4 y el cliente
// dice 6, el usuario ve el botón habilitado y la subida falla en el servidor.
const MAX_FOTOS_POR_EQUIPO = 4;

// Rate-limit por usuario de subirFoto/eliminarFoto (Ciclo 21): 30 / 10 min.
const FOTOS_MAX_USUARIO = 30;
const FOTOS_VENTANA_MIN = 10;

type ClienteAdmin = ReturnType<typeof createAdminClient>;

// Rate-limit genérico sobre `intentos_publicos` (Ciclo 21): cuenta los
// intentos recientes del par (ámbito, clave) y, si todavía hay cupo, registra
// este. Devuelve true cuando YA se alcanzó el tope (el llamador responde 429
// `demasiados_intentos`; un intento bloqueado no se registra). FAIL-CLOSED: si
// no se puede contar o registrar se LANZA (→ error_interno), nunca se asume
// "0 intentos". Copia a propósito en cada function (sin imports entre ellas).
async function excedeLimite(
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

// Usuario dueño del token de sesión (Ciclo 21). Distingue "no hay usuario"
// (token inválido/expirado/anónimo → null → 401) de "falló la consulta"
// (caída de red, 5xx, 408/429 → LANZA → error_interno 500). Antes se ignoraba
// el `error`. Copia a propósito en cada function.
async function usuarioDeToken(
  userClient: ReturnType<typeof createClient>,
): Promise<{ id: string; email: string | null } | null> {
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

// Duplicado a propósito de functions/tickets.ts (sniffImagen/MIME_POR_EXT):
// el proyecto no comparte código entre edge functions (ver AGENTS.md).
// export: probado en frontend/tests/equipos-fotos-validaciones.test.js
export function sniffImagen(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

// ── Actas firmadas (migración 110) ──────────────────────────────────────────
// Bucket PRIVADO: contiene nombre, DNI y firma. Se crea a mano
// (`insforge storage create-bucket actas-firmadas --private`); nunca público.
const ACTAS_BUCKET = 'actas-firmadas';

// Tope del PDF ya escaneado (el frontend convierte la foto a PDF antes de subir).
const ACTA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Rate-limit por usuario: subirActa 30 / 10 min (§3.7 del plan); urlActa es
// lectura y admite más: 60 / 10 min.
const ACTAS_MAX_USUARIO = 30;
const ACTAS_URL_MAX_USUARIO = 60;
const ACTAS_VENTANA_MIN = 10;

// Vida de la URL firmada: lo justo para abrir el PDF en una pestaña nueva.
const ACTA_URL_SEGUNDOS = 120;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// PDF por sus primeros bytes ("%PDF-"), nunca por el tipo ni el nombre que
// declare el cliente. Estricto: la cabecera debe estar al inicio del archivo
// (la especificación tolera basura previa, un escáner normal no la deja).
// export: probado en frontend/tests/functions-handler-actas.test.js
export function esPdf(b: Uint8Array): boolean {
  return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}

// SHA-256 en hex minúsculas (el CHECK de actas.sha256 exige 64 [0-9a-f]).
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const huella = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(huella, (x) => x.toString(16).padStart(2, '0')).join('');
}

// Fecha de hoy en Lima (UTC-5 todo el año, sin horario de verano), AAAA-MM-DD.
function hoyLima(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ¿Es una fecha AAAA-MM-DD real? (rechaza 2026-02-31)
function fechaValida(s: string): boolean {
  if (!FECHA_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Envoltorio de primer nivel (Ciclo 20): toda excepción no controlada
// termina en { ok:false, code:'error_interno' } (500) con las cabeceras CORS
// de esta petición, en vez de un 500 opaco sin CORS. Al log solo va el
// mensaje, nunca el contenido base64 de la foto.
export default async function (req: Request): Promise<Response> {
  const cors = corsPara(req.headers.get('Origin'));
  try {
    return await manejar(req, cors);
  } catch (e) {
    console.error('[equipos-fotos] error no controlado:', e instanceof Error ? e.message : String(e));
    return respuesta(cors, { ok: false, code: 'error_interno' }, 500);
  }
}

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
    return json({ ok: true, funcion: 'equipos-fotos', hora: new Date().toISOString() });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  // Permiso de módulo (Ciclo 21, migración 099): la regla vive en UN solo
  // lugar, la RPC `public.puede(p_user, 'modulo:<id>')` (EXECUTE solo para el
  // cliente admin; auth.uid() sería NULL acá). Antes se repetía a mano con una
  // consulta directa a staff_modulos_permisos (hallazgo de auditoría externa,
  // 2026-08-20: sin este chequeo un staff sin "equipos" subía/borraba fotos
  // del bucket completo porque esta function usa el cliente ADMIN).
  // FAIL-CLOSED y sin confundir causas: un error de la RPC se LANZA (→
  // error_interno 500), solo un `false` explícito niega con 403; cualquier
  // valor distinto de `true` también niega. El atajo de JEFE usa la fila de
  // staff ya leída (activa) y evita una llamada. Duplicado a propósito, no se
  // comparte código entre edge functions (ver AGENTS.md).
  async function tienePermisoModulo(rol: string, userId: string, modulo: string): Promise<boolean> {
    if (rol === 'JEFE') return true;
    const { data, error } = await admin.database.rpc('puede', { p_user: userId, p_permiso: `modulo:${modulo}` });
    if (error) throw new Error(`No se pudo verificar el permiso modulo:${modulo}: ${error.message}`);
    return data === true;
  }

  // Toda acción requiere staff activo — no hay ninguna pública acá.
  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
  if (!userToken) return json({ ok: false, code: 'no_autenticado' }, 401);

  // Ciclo 21: sin usuario (token inválido/anónimo) → 401; consulta que FALLA
  // (sesión o tabla staff) → se lanza y el envoltorio responde error_interno.
  const userClient = createClient({ baseUrl, accessToken: userToken });
  const user = await usuarioDeToken(userClient);
  if (!user) return json({ ok: false, code: 'no_autenticado' }, 401);

  const { data: staffRow, error: eStaff } = await admin.database
    .from('staff')
    .select('activo, rol')
    .eq('user_id', user.id)
    .maybeSingle();
  if (eStaff) throw new Error(`No se pudo leer la fila de staff: ${eStaff.message}`);
  if (!staffRow?.activo) return json({ ok: false, code: 'no_es_staff' }, 403);

  // version: cierra el pendiente de H-12 — ver el mismo comentario en
  // functions/credenciales.ts.
  if (body.action === 'version') {
    const [{ data: migracion }, { data: deploy }] = await Promise.all([
      admin.database.from('schema_migrations').select('version, nombre_archivo, aplicada_en')
        .order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.database.from('function_deploys').select('sha256, commit_sha, desplegado_en')
        .eq('funcion', 'equipos-fotos').order('desplegado_en', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json({
      ok: true,
      funcion: 'equipos-fotos',
      sdkVersion: '1.5.2',
      ultimaMigracion: migracion || null,
      ultimoDeploy: deploy || null,
    });
  }

  // subirFoto: valida el contenido real (magic bytes) y el tamaño en
  // servidor — el navegador ya comprime/reencoda a JPEG antes de llamar
  // acá (primera línea de defensa, no la única). Key generada en servidor,
  // nunca con datos del cliente.
  if (body.action === 'subirFoto') {
    const contenidoBase64 = String(body.contenidoBase64 || '');
    if (!contenidoBase64) return json({ ok: false, code: 'archivo_requerido' });

    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'equipos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    // Rate-limit por usuario (Ciclo 21): 30 / 10 min. Fail-closed.
    if (await excedeLimite(admin, 'equipos-fotos.subirFoto', user.id, FOTOS_MAX_USUARIO, FOTOS_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    // Tope de cantidad, server-side (2026-08-31). Dónde vive el estado real
    // de las fotos de un equipo, verificado contra el esquema y no supuesto:
    // NO hay tabla `equipos_fotos` ni prefijo por equipo en el bucket (las
    // keys son planas, `equipos/<uuid>.<ext>`, generadas acá). Las fotos son
    // la columna jsonb `equipos.fotos` — array de {url, key} (migración 015)
    // — que es también lo único que `eliminarFoto` deja dangling cuando el
    // formulario no se guarda. Por eso "fotos vigentes" = largo de ese array
    // del equipo, excluyendo equipos con soft-delete (deleted_at).
    //
    // Límites conocidos y aceptados de este chequeo (no son un olvido):
    //   1. En un equipo NUEVO todavía no hay fila que contar (el formulario
    //      sube las fotos antes del primer INSERT), así que `equipoId` llega
    //      vacío y no hay tope que aplicar en ese caso.
    //   2. Quien omita `equipoId` a propósito esquiva el conteo. El chequeo
    //      cierra el uso accidental y el bypass por DevTools del formulario,
    //      no es una frontera dura: la única enforcement completa sería un
    //      `check (jsonb_array_length(fotos) <= 4)` en `equipos` (migración
    //      pendiente de decidir), porque el array lo escribe el cliente con
    //      su propia sesión, no esta función.
    // Solo SELECT a propósito: un UPDATE desde acá correría con el cliente
    // admin y el trigger trg_equipos_by (migración 005) pisaría
    // `updated_by` con NULL — auth.uid() no existe en este contexto.
    const equipoId = body.equipoId ? String(body.equipoId) : '';
    if (equipoId) {
      const { data: equipo } = await admin.database
        .from('equipos')
        .select('fotos')
        .eq('id', equipoId)
        .is('deleted_at', null)
        .maybeSingle();
      const vigentes = Array.isArray(equipo?.fotos) ? equipo.fotos.length : 0;
      if (vigentes >= MAX_FOTOS_POR_EQUIPO) {
        // Status 200 con { ok:false, code } a propósito, igual que
        // archivo_invalido/key_invalida de esta misma función: el SDK
        // devuelve data=null en toda respuesta no-2xx (solo `statusCode`),
        // así que con un 409 el cliente perdería el `code` y con él el
        // mensaje en español de api/domains/equipos.js. Los status
        // explícitos de este archivo quedan para autenticación (401),
        // autorización (403) y fallas del servidor (500).
        return json({ ok: false, code: 'limite_fotos' });
      }
    }

    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const binario = atob(contenidoBase64);
      if (!binario.length || binario.length > FOTO_MAX_BYTES) {
        return json({ ok: false, code: 'archivo_invalido' });
      }
      bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    } catch {
      return json({ ok: false, code: 'archivo_invalido' });
    }

    const ext = sniffImagen(bytes);
    if (!ext) return json({ ok: false, code: 'archivo_invalido' });

    const blob = new Blob([bytes], { type: MIME_POR_EXT[ext] });
    const key = `equipos/${crypto.randomUUID()}.${ext}`;
    const { data: subida, error: eSubida } = await admin.storage.from('equipos-fotos').upload(key, blob);
    if (eSubida || !subida) return json({ ok: false, code: 'error_subiendo' }, 500);

    return json({ ok: true, url: subida.url, key: subida.key });
  }

  // eliminarFoto: exige el prefijo "equipos/" para que la acción no sirva
  // como "borrar cualquier cosa del bucket por key arbitrario".
  if (body.action === 'eliminarFoto') {
    const key = String(body.key || '');
    if (!key.startsWith('equipos/')) return json({ ok: false, code: 'key_invalida' });

    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'equipos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    // Rate-limit por usuario (Ciclo 21): 30 / 10 min. Fail-closed.
    if (await excedeLimite(admin, 'equipos-fotos.eliminarFoto', user.id, FOTOS_MAX_USUARIO, FOTOS_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { error } = await admin.storage.from('equipos-fotos').remove(key);
    if (error) return json({ ok: false, code: 'error_eliminando' }, 500);

    return json({ ok: true });
  }

  // subirActa (migración 110, plan §3.7): acta de entrega/devolución firmada en
  // físico. El navegador convierte la foto a PDF ANTES de subir, así que acá
  // solo se acepta PDF (magic bytes `%PDF-`, hasta 10 MB); un JPEG/PNG se
  // rechaza con archivo_invalido. Nada del cliente decide dónde queda: la key
  // sale de la asignación leída en la base, nunca del `nombre` que envíe.
  // Orden (fail-closed): forma de la petición → módulo equipos → rate-limit →
  // tamaño y PDF → asignación válida → subir al bucket → registrar_acta (RPC:
  // retira la vigente y crea la nueva en UNA transacción). Si el registro
  // falla, el objeto recién subido se borra (best-effort).
  if (body.action === 'subirActa') {
    const archivo = String(body.archivo || '').replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
    if (!archivo) return json({ ok: false, code: 'archivo_requerido' });

    const asignacionId = String(body.asignacionId || '');
    const tipo = String(body.tipo || '');
    if (!UUID_RE.test(asignacionId) || (tipo !== 'entrega' && tipo !== 'devolucion')) {
      return json({ ok: false, code: 'asignacion_invalida' });
    }

    const firmadoAt = body.firmadoAt ? String(body.firmadoAt) : null;
    if (firmadoAt !== null && (!fechaValida(firmadoAt) || firmadoAt > hoyLima())) {
      return json({ ok: false, code: 'fecha_invalida' });
    }

    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'equipos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    if (await excedeLimite(admin, 'equipos-fotos.subirActa', user.id, ACTAS_MAX_USUARIO, ACTAS_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    // Tamaño: se estima desde el base64 ANTES de decodificar (no se asigna
    // memoria para un archivo que ya se sabe que sobra).
    const relleno = archivo.endsWith('==') ? 2 : archivo.endsWith('=') ? 1 : 0;
    if (Math.floor((archivo.length * 3) / 4) - relleno > ACTA_MAX_BYTES) {
      return json({ ok: false, code: 'archivo_muy_grande' });
    }
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const binario = atob(archivo);
      if (!binario.length) return json({ ok: false, code: 'archivo_invalido' });
      if (binario.length > ACTA_MAX_BYTES) return json({ ok: false, code: 'archivo_muy_grande' });
      bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    } catch {
      return json({ ok: false, code: 'archivo_invalido' });
    }
    if (!esPdf(bytes)) return json({ ok: false, code: 'archivo_invalido' });

    // La asignación manda: debe existir, ser a una persona y, para la
    // devolución, estar cerrada. (La misma regla vive en registrar_acta, que
    // es la que garantiza; acá se valida antes para no subir un PDF huérfano.)
    const { data: asignacion, error: eAsig } = await admin.database
      .from('asignaciones_equipo')
      .select('id, empleado_id, fecha_fin')
      .eq('id', asignacionId)
      .maybeSingle();
    if (eAsig) throw new Error(`No se pudo leer la asignación: ${eAsig.message}`);
    if (!asignacion) return json({ ok: false, code: 'no_existe' });
    if (!asignacion.empleado_id || (tipo === 'devolucion' && !asignacion.fecha_fin)) {
      return json({ ok: false, code: 'asignacion_invalida' });
    }

    // Un reemplazo NO pisa el PDF anterior (que queda como evidencia): la
    // primera subida usa la key del plan, `<asignacion>-<tipo>.pdf`, y las
    // siguientes `-2`, `-3`... según las actas ya registradas (vigentes o no).
    const { data: previas, error: ePrevias } = await admin.database
      .from('actas')
      .select('id')
      .eq('asignacion_equipo_id', asignacionId)
      .eq('tipo', tipo);
    if (ePrevias) throw new Error(`No se pudo contar las actas previas: ${ePrevias.message}`);
    const version = (previas?.length || 0) + 1;
    const key = `actas/${asignacion.empleado_id}/${asignacionId}-${tipo}${version > 1 ? `-${version}` : ''}.pdf`;

    const sha256 = await sha256Hex(bytes);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const { data: subida, error: eSubida } = await admin.storage.from(ACTAS_BUCKET).upload(key, blob);
    if (eSubida || !subida) return json({ ok: false, code: 'error_subiendo' }, 500);

    const { data: registro, error: eRegistro } = await admin.database.rpc('registrar_acta', {
      p_asignacion_id: asignacionId,
      p_tipo: tipo,
      p_pdf_key: key,
      p_tamano_bytes: bytes.length,
      p_sha256: sha256,
      p_firmado_at: firmadoAt,
      p_subido_por: user.id,
    });
    if (eRegistro) {
      // Sin acta registrada no debe quedar un PDF suelto en el bucket.
      await admin.storage.from(ACTAS_BUCKET).remove(key).catch(() => null);
      const codigoSql = (eRegistro as { code?: string }).code;
      if (codigoSql === 'P0002' || codigoSql === '22023') return json({ ok: false, code: 'asignacion_invalida' });
      console.error('[equipos-fotos] registrar_acta falló:', eRegistro.message);
      return json({ ok: false, code: 'error_subiendo' }, 500);
    }

    const acta = (Array.isArray(registro) ? registro[0] : registro) as {
      id: string; tipo: string; tamano_bytes: number; firmado_at: string | null; created_at: string;
    } | null;
    if (!acta?.id) return json({ ok: false, code: 'error_subiendo' }, 500);

    // Sin pdf_key ni sha256: la key no sale nunca de la function.
    return json({
      ok: true,
      acta: {
        id: acta.id,
        tipo: acta.tipo,
        tamanoBytes: acta.tamano_bytes,
        firmadoAt: acta.firmado_at,
        creadaEn: acta.created_at,
      },
    });
  }

  // urlActa: URL firmada de corta vida (120 s) para abrir el PDF. El bucket es
  // privado y la key no se envía al cliente: la autorización se comprueba acá,
  // al emitir la URL (sesión de staff + módulo equipos). Solo actas vigentes.
  if (body.action === 'urlActa') {
    const actaId = String(body.actaId || '');
    if (!UUID_RE.test(actaId)) return json({ ok: false, code: 'no_existe' });

    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'equipos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
    }

    if (await excedeLimite(admin, 'equipos-fotos.urlActa', user.id, ACTAS_URL_MAX_USUARIO, ACTAS_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { data: acta, error: eActa } = await admin.database
      .from('actas')
      .select('id, pdf_key')
      .eq('id', actaId)
      .is('deleted_at', null)
      .maybeSingle();
    if (eActa) throw new Error(`No se pudo leer el acta: ${eActa.message}`);
    if (!acta?.pdf_key) return json({ ok: false, code: 'no_existe' });

    const { data: firmada, error: eUrl } = await admin.storage
      .from(ACTAS_BUCKET)
      .createSignedUrl(acta.pdf_key, ACTA_URL_SEGUNDOS);
    if (eUrl || !firmada?.signedUrl) {
      // Objeto ausente en el bucket (404) ≠ falla al firmar.
      const faltante = (eUrl as { statusCode?: number } | null)?.statusCode === 404;
      return json({ ok: false, code: faltante ? 'no_existe' : 'error_url' }, faltante ? 200 : 500);
    }

    return json({
      ok: true,
      url: firmada.signedUrl,
      expiraEn: firmada.expiresAt || null,
      expiraSegundos: ACTA_URL_SEGUNDOS,
    });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
