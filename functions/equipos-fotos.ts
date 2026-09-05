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

  // Permiso de módulo (migración 068) — mismo patrón y mismo motivo que
  // tienePermisoModulo() en functions/credenciales.ts: la RLS de `equipos`
  // ya exige tiene_permiso_modulo('equipos') para el CRUD normal de la
  // tabla, pero esta función usa el cliente ADMIN (bypasea esa RLS) para
  // subir/eliminar en el bucket. Sin este chequeo, cualquier staff activo
  // sin el módulo "equipos" podía igual subir/borrar fotos del bucket
  // completo (hallazgo de auditoría externa, 2026-08-20). Duplicado a
  // propósito, no se comparte código entre edge functions (ver AGENTS.md).
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
    .select('activo, rol')
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

    if (!(await tienePermisoModulo(staffRow.rol, user.id, 'equipos'))) {
      return json({ ok: false, code: 'no_autorizado' }, 403);
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

    const { error } = await admin.storage.from('equipos-fotos').remove(key);
    if (error) return json({ ok: false, code: 'error_eliminando' }, 500);

    return json({ ok: true });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
