// Rate-limit genérico sobre `intentos_publicos` (migración 104). Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.
// @inline ./tipos.ts

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
