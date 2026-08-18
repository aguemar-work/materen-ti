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
// Requiere sesión de staff activo (mismo patrón que functions/credenciales.ts:
// Authorization: Bearer <token>, no hay acción pública acá).
//
// Acciones (POST { action, ... }):
//   subirFoto   staff { contenidoBase64 } → { url, key }
//   eliminarFoto staff { key }            → { ok }
//   version     staff  {}                 → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk@1.5.2';

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
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Tamaño máximo del archivo YA COMPRIMIDO por el cliente (frontend/src/core/
// imagenes.js deja ~150-250KB) — mismo tope que adjuntos de tickets, margen
// amplio y consistente con el resto del sistema.
const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

  // Toda acción requiere staff activo — no hay ninguna pública acá.
  const authHeader = req.headers.get('Authorization');
  const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
  if (!userToken) return json({ ok: false, code: 'no_autenticado' }, 401);

  const userClient = createClient({ baseUrl, accessToken: userToken });
  const { data: userData } = await userClient.auth.getCurrentUser();
  const user = userData?.user;
  if (!user?.id) return json({ ok: false, code: 'no_autenticado' }, 401);

  const { data: staffRow } = await admin.database
    .from('staff')
    .select('activo')
    .eq('user_id', user.id)
    .maybeSingle();
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

    const { error } = await admin.storage.from('equipos-fotos').remove(key);
    if (error) return json({ ok: false, code: 'error_eliminando' }, 500);

    return json({ ok: true });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
