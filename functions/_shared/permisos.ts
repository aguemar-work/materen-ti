// Permisos vía la RPC `public.puede`. Fuente única: scripts/build-functions.mjs
// inlina este archivo en el dist de cada function.
// @inline ./tipos.ts

// Ciclo 21 (migración 099): `public.puede(p_user, p_permiso)` es la fuente de
// verdad (activo + JEFE + modulo:<id> + credenciales.ver + acceso_sensible:<uuid>);
// las policies de RLS usan la misma función vía puede_actual(). Se llama por RPC
// con el cliente ADMIN pasando el user id del JWT (auth.uid() sería NULL en este
// contexto; EXECUTE solo para el cliente admin).
//
// FAIL-CLOSED y sin confundir causas: un error de la RPC se LANZA (→ error_interno
// 500 por el envoltorio de primer nivel) en vez de contarse como "sin permiso";
// solo un `false` explícito niega con 403 no_autorizado, y cualquier valor
// distinto de `true` también niega. El atajo de JEFE (solo si el llamador pasa
// `rol`, leído de la fila de staff ya validada como activa en esta petición)
// coincide con la semántica de la RPC y evita una llamada.
export async function puede(
  admin: ClienteAdmin,
  userId: string,
  permiso: string,
  rol?: string,
): Promise<boolean> {
  if (rol === 'JEFE') return true;
  const { data, error } = await admin.database.rpc('puede', { p_user: userId, p_permiso: permiso });
  if (error) throw new Error(`No se pudo verificar el permiso ${permiso}: ${error.message}`);
  return data === true;
}
