// Tests de la validación de servidor de functions/equipos-fotos.ts:
// magic bytes, mismo criterio que functions/tickets.ts (H-03) — antes la
// subida iba directo del navegador al bucket sin validar el contenido
// real (verificación de auditoría externa, 2026-08-17).
import { describe, it, expect } from 'vitest';
import { sniffImagen } from '../../functions/equipos-fotos.ts';

const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const SVG_COMO_TEXTO = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

describe('sniffImagen (equipos-fotos) — allowlist por magic bytes', () => {
  it('reconoce los 4 formatos de imagen permitidos', () => {
    expect(sniffImagen(JPG)).toBe('jpg');
    expect(sniffImagen(PNG)).toBe('png');
    expect(sniffImagen(GIF)).toBe('gif');
    expect(sniffImagen(WEBP)).toBe('webp');
  });

  it('rechaza lo que no es imagen, aunque el cliente declare otro tipo', () => {
    expect(sniffImagen(EXE)).toBe(null);
    expect(sniffImagen(new Uint8Array(0))).toBe(null);
  });

  it('rechaza SVG (no está en la allowlist de magic bytes)', () => {
    expect(sniffImagen(SVG_COMO_TEXTO)).toBe(null);
  });
});
