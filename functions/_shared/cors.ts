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
