// Tests de las validaciones de servidor de functions/tickets.ts:
// adjuntos por magic bytes (H-03), identificación de contacto y la
// extracción de IP de confianza para el rate-limit (H-02).
import { describe, it, expect } from 'vitest';
import { sniffImagen, esEmail, soloDigitos, ipDesdeHeaders } from '../../functions/tickets.ts';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

describe('sniffImagen — allowlist por magic bytes', () => {
  it('reconoce los 4 formatos de imagen permitidos', () => {
    expect(sniffImagen(JPG)).toBe('jpg');
    expect(sniffImagen(PNG)).toBe('png');
    expect(sniffImagen(GIF)).toBe('gif');
    expect(sniffImagen(WEBP)).toBe('webp');
  });

  it('rechaza lo que no es imagen (aunque el cliente declare image/png)', () => {
    expect(sniffImagen(PDF)).toBe(null);
    expect(sniffImagen(EXE)).toBe(null);
    expect(sniffImagen(new Uint8Array(0))).toBe(null);
    expect(sniffImagen(new Uint8Array([0x00, 0x01]))).toBe(null);
  });

  it('RIFF sin marca WEBP no pasa (ej. un .wav)', () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImagen(wav)).toBe(null);
  });
});

describe('identificación de contacto', () => {
  it('esEmail', () => {
    expect(esEmail('persona@empresa.com')).toBe(true);
    expect(esEmail('no-es-correo')).toBe(false);
    expect(esEmail('a@b')).toBe(false);
    expect(esEmail('con espacios@x.com')).toBe(false);
  });

  it('soloDigitos normaliza DNI', () => {
    expect(soloDigitos('12.345.678')).toBe('12345678');
    expect(soloDigitos('DNI: 87654321')).toBe('87654321');
  });
});

describe('ipDesdeHeaders — rate-limit no confía en el cliente (H-02)', () => {
  it('prefiere cf-connecting-ip (lo pone el edge, un solo valor)', () => {
    const h = new Headers({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': 'falsa.del.cliente, 203.0.113.7',
    });
    expect(ipDesdeHeaders(h)).toBe('203.0.113.7');
  });

  it('x-real-ip gana sobre x-forwarded-for', () => {
    const h = new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '1.1.1.1' });
    expect(ipDesdeHeaders(h)).toBe('198.51.100.2');
  });

  it('de x-forwarded-for toma el ÚLTIMO valor, no el primero (spoofeable)', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1, 203.0.113.9' });
    expect(ipDesdeHeaders(h)).toBe('203.0.113.9');
  });

  it('sin headers devuelve el marcador, nunca string vacío', () => {
    expect(ipDesdeHeaders(new Headers())).toBe('desconocida');
  });
});
