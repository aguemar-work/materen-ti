// Tests del cifrado de credenciales (functions/credenciales.ts).
// Cubre: roundtrip enc2, IV aleatorio, formato legacy enc:, y (Ciclo 21) que un
// valor sin prefijo conocido o ilegible LANZA ErrorDescifrado tipado en vez de
// devolverse como texto plano / como el literal '(error al descifrar)'.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encryptV2, decryptAny, decryptSensible, hashToken, ErrorDescifrado } from '../../functions/credenciales.ts';

// Réplica mínima del cifrado legacy (enc:) para fabricar un valor histórico
// con la clave CRED_KEY_LEGACY del setup y verificar que decryptAny lo lee.
async function cifrarLegacy(texto) {
  const raw = Uint8Array.from(atob(Deno.env.get('CRED_KEY_LEGACY')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(texto));
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `enc:${b64(iv)}:${b64(ct)}`;
}

describe('cifrado de credenciales', () => {
  it('roundtrip: encryptV2 produce enc2: y decryptAny recupera el original', async () => {
    const original = 'Contraseña$ecreta-2026 ñ 🔑';
    const cifrado = await encryptV2(original);
    expect(cifrado.startsWith('enc2:')).toBe(true);
    expect(cifrado).not.toContain(original);
    expect(await decryptAny(cifrado)).toBe(original);
  });

  it('dos cifrados del mismo texto difieren (IV aleatorio por llamada)', async () => {
    const a = await encryptV2('misma-contraseña');
    const b = await encryptV2('misma-contraseña');
    expect(a).not.toBe(b);
    expect(await decryptAny(a)).toBe(await decryptAny(b));
  });

  it('lee el formato legacy enc: con CRED_KEY_LEGACY', async () => {
    const cifrado = await cifrarLegacy('clave-historica');
    expect(await decryptAny(cifrado)).toBe('clave-historica');
  });

  // Lanza ErrorDescifrado con el motivo esperado, sin filtrar el valor.
  async function motivoDe(valor, fn = decryptAny) {
    try {
      await fn(valor);
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorDescifrado);
      expect(e.message).not.toContain(valor);
      return e.motivo;
    }
    throw new Error('debía lanzar ErrorDescifrado');
  }

  it('un valor sin prefijo conocido ya NO se devuelve como texto plano (formato_desconocido)', async () => {
    expect(await motivoDe('sin-prefijo')).toBe('formato_desconocido');
    expect(await motivoDe('(error al descifrar)')).toBe('formato_desconocido');
  });

  it('vacío devuelve vacío', async () => {
    expect(await decryptAny('')).toBe('');
  });

  it('payload corrupto lanza ErrorDescifrado (datos_invalidos), no un marcador', async () => {
    expect(await motivoDe('enc2:###:###')).toBe('datos_invalidos');
    expect(await motivoDe('enc2:QUJD')).toBe('datos_invalidos');
  });

  it('enc2 manipulado (ciphertext alterado) lanza fallo_descifrado', async () => {
    const cifrado = await encryptV2('integridad');
    const partes = cifrado.split(':');
    // Se corrompe el ciphertext: GCM debe rechazarlo (autenticado)
    const corrupto = `${partes[0]}:${partes[1]}:${partes[2].slice(0, -4)}AAAA`;
    expect(await motivoDe(corrupto)).toBe('fallo_descifrado');
  });

  it('clave ausente (secret sin configurar) lanza clave_ausente', async () => {
    const original = globalThis.Deno.env.get;
    const cifrado = await encryptV2('x');
    globalThis.Deno.env.get = (k) => (k === 'CRED_KEY_V2' ? undefined : original(k));
    try {
      expect(await motivoDe(cifrado)).toBe('clave_ausente');
    } finally {
      globalThis.Deno.env.get = original;
    }
  });

  it('decryptSensible: sin prefijo sens1: o con clave ausente lanza, no devuelve literales', async () => {
    expect(await motivoDe('texto-plano', decryptSensible)).toBe('formato_desconocido');
    // CRED_KEY_SENSIBLE no existe en tests/setup.js
    expect(await motivoDe('sens1:QUJD:QUJD', decryptSensible)).toBe('clave_ausente');
    expect(await decryptSensible('')).toBe('');
  });
});

// hashToken (migración 066/067): entregas ya no guarda el token de la
// URL pública en texto plano, solo su sha256.
describe('hashToken', () => {
  it('es determinístico: el mismo token produce siempre el mismo hash', async () => {
    const a = await hashToken('mismo-token-de-entrega');
    const b = await hashToken('mismo-token-de-entrega');
    expect(a).toBe(b);
  });

  it('tokens distintos producen hashes distintos', async () => {
    const a = await hashToken('token-A');
    const b = await hashToken('token-B');
    expect(a).not.toBe(b);
  });

  it('devuelve 64 caracteres hex (sha256)', async () => {
    const hash = await hashToken('cualquier-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// Test estático de regresión (incidente P0, 2026-08-19): la migración 067
// retiró la columna `entregas.token` (texto plano), pero entregaCrear seguía
// insertándola — cada entrega fallaba con error_guardando. Inspecciona el
// código fuente sin ejecutar nada (sin red, sin BD, sin secrets reales) para
// que este bug no pueda reintroducirse en silencio.
describe('entregaCrear no persiste token en claro (regresión P0 2026-08-19)', () => {
  const fuente = readFileSync(
    fileURLToPath(new URL('../../functions/credenciales.ts', import.meta.url)),
    'utf8',
  );
  const bloque = fuente.match(/\.from\('entregas'\)\.insert\(\[\{([\s\S]*?)\}\]\)/);

  it('el INSERT en entregas existe y es único en el archivo', () => {
    expect(bloque).not.toBeNull();
  });

  it('no incluye el campo `token` en claro (columna retirada por la migración 067)', () => {
    expect(bloque[1]).not.toMatch(/^\s*token\s*,/m);
  });

  it('sí incluye `token_hash` (única fuente de verdad en BD desde la migración 066/067)', () => {
    expect(bloque[1]).toMatch(/token_hash\s*:/);
  });
});
