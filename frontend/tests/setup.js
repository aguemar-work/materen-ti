// Stub mínimo del runtime Deno que usan las edge functions.
// Solo se emula Deno.env con claves AES de prueba (32 bytes en base64) —
// las claves reales viven en los secrets del servidor y nunca se usan aquí.
const CLAVES = {
  CRED_KEY_V2: Buffer.from(new Uint8Array(32).fill(7)).toString('base64'),
  CRED_KEY_LEGACY: Buffer.from(new Uint8Array(32).fill(9)).toString('base64'),
};

globalThis.Deno = {
  env: { get: (clave) => CLAVES[clave] },
};
