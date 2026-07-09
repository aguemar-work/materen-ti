// Tests del cifrado de credenciales (functions/credenciales.ts).
// Cubre: roundtrip enc2, IV aleatorio, formato legacy enc:, texto plano
// histórico y payloads corruptos.
import { describe, it, expect } from 'vitest';
import { encryptV2, decryptAny } from '../../functions/credenciales.ts';

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

  it('texto plano histórico se devuelve tal cual', async () => {
    expect(await decryptAny('sin-prefijo')).toBe('sin-prefijo');
  });

  it('vacío devuelve vacío', async () => {
    expect(await decryptAny('')).toBe('');
  });

  it('payload corrupto no lanza: devuelve el marcador de error', async () => {
    expect(await decryptAny('enc2:###:###')).toBe('(error al descifrar)');
    expect(await decryptAny('enc2:QUJD')).toBe('(error al descifrar)');
  });

  it('enc2 manipulado (ciphertext alterado) no descifra', async () => {
    const cifrado = await encryptV2('integridad');
    const partes = cifrado.split(':');
    // Se corrompe el ciphertext: GCM debe rechazarlo (autenticado)
    const corrupto = `${partes[0]}:${partes[1]}:${partes[2].slice(0, -4)}AAAA`;
    expect(await decryptAny(corrupto)).toBe('(error al descifrar)');
  });
});
