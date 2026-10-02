// Autenticación de staff por sesión (Bearer). Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.
// @inline ./tipos.ts
import { createClient } from 'npm:@insforge/sdk@1.5.2';

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
