// Generador de contraseña para el formulario de cuentas: 12 caracteres con
// una estructura fija acordada con el área de TI — 10 caracteres alfanuméricos
// en mayúscula, el símbolo "@" y 1 letra minúscula. Usa crypto.getRandomValues
// (no Math.random) para que sea aleatoriedad criptográfica real.
const ALFANUMERICO_MAYUS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MINUSCULAS = 'abcdefghijklmnopqrstuvwxyz';

function caracterAlAzar(alfabeto) {
  const indices = new Uint32Array(1);
  crypto.getRandomValues(indices);
  return alfabeto[indices[0] % alfabeto.length];
}

export function generarPassword() {
  const bloque = Array.from({ length: 10 }, () => caracterAlAzar(ALFANUMERICO_MAYUS)).join('');
  return `${bloque}@${caracterAlAzar(MINUSCULAS)}`;
}
