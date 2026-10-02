// Envoltorio de primer nivel de las edge functions. Fuente única:
// scripts/build-functions.mjs inlina este archivo en el dist de cada function.
// @inline ./cors.ts
// @inline ./http.ts

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
