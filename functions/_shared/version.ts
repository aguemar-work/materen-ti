// Acción `version` (staff) común a las 4 edge functions: qué versión de
// esquema/SDK/deploy tiene ESTA instancia desplegada (migraciones 069/070).
// Fuente única: scripts/build-functions.mjs inlina este archivo en el dist de
// cada function. El pin del SDK vive en los imports `npm:@insforge/sdk@<versión>`;
// el build falla si un dist mezcla versiones distintas.
// @inline ./tipos.ts

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
