// Limpieza de metadatos (EXIF/GPS, XMP, IPTC, ICC, comentarios) de las imágenes
// que suben las edge functions `tickets` (captura del ticket) y `equipos-fotos`
// (fotos del equipo). Plan de mejora Ciclo 21, §5 "EXIF" (migración 111).
//
// Una sola fuente: functions/_shared/imagenes.ts, que scripts/build-functions.mjs
// inlina en functions/dist/tickets.ts y functions/dist/equipos-fotos.ts (lo que se
// despliega). El mismo conjunto de casos corre contra los dos dist para comprobar
// que lo desplegado incluye la limpieza; que ambas copias sean el mismo código es
// ahora trivial (ver la última prueba) y lo exige también build-functions.test.mjs.
//
// Los fixtures se arman byte a byte: no hay imágenes binarias en el repo. Lo que
// se comprueba es el CONTENEDOR (qué bloques quedan), no la decodificación de
// los píxeles, que la función nunca toca.
import { describe, it, expect } from 'vitest';
import { stripExif as stripTickets } from '../../functions/dist/tickets.ts';
import { stripExif as stripEquipos } from '../../functions/dist/equipos-fotos.ts';
import { stripExif as stripFuente } from '../../functions/_shared/imagenes.ts';

const enc = (s) => Array.from(s, (c) => c.charCodeAt(0));
const bytes = (...partes) => new Uint8Array(partes.flat());
const texto = (u8) => Array.from(u8, (c) => String.fromCharCode(c)).join('');
const be16 = (n) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const le32 = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

// ── JPEG ────────────────────────────────────────────────────────────────
const segJpeg = (marcador, carga) => [0xff, marcador, ...be16(carga.length + 2), ...carga];
const GPS = enc('Exif\0\0GPSLatitude=-12.0464 GPSLongitude=-77.0428 Make=Acme Serial=SN-123');
const SCAN = [0x12, 0x34, 0xff, 0x00, 0xff, 0xd0, 0x56, 0x78]; // incluye un byte stuffing y un RSTn
const jpegConMetadatos = () =>
  bytes(
    [0xff, 0xd8],
    segJpeg(0xe0, enc('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), // APP0: se conserva
    segJpeg(0xe1, GPS), // APP1: EXIF
    segJpeg(0xe1, enc('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>')), // APP1: XMP
    segJpeg(0xe2, enc('ICC_PROFILE\0\x01\x01perfil')), // APP2
    segJpeg(0xed, enc('Photoshop 3.0\0IPTC')), // APP13
    segJpeg(0xfe, enc('hecho con Cámara')), // COM
    segJpeg(0xdb, [0x00, ...new Array(64).fill(1)]), // DQT: se conserva
    [0xff, 0xff, 0xff, 0xc0, ...be16(11), 8, 0, 1, 0, 1, 1, 1, 0x11, 0], // relleno 0xFF + SOF0
    [0xff, 0xda, ...be16(8), 1, 1, 0, 0, 0x3f, 0, ...SCAN, 0xff, 0xd9],
  );

// ── PNG ─────────────────────────────────────────────────────────────────
const chunkPng = (tipo, carga) => [...be32(carga.length), ...enc(tipo), ...carga, 0, 0, 0, 0]; // CRC no se valida
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const pngConMetadatos = (cola = []) =>
  bytes(
    FIRMA_PNG,
    chunkPng('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    chunkPng('tEXt', enc('Author\0Maria Quispe')),
    chunkPng('eXIf', GPS),
    chunkPng('iTXt', enc('XML:com.adobe.xmp\0\0\0\0\0<x/>')),
    chunkPng('zTXt', enc('Comment\0\0datos')),
    chunkPng('tIME', [0x07, 0xea, 10, 2, 9, 30, 0]),
    chunkPng('IDAT', [0x78, 0x9c, 0x63, 0x60, 0x00, 0x00]),
    chunkPng('IEND', []),
    cola,
  );

// ── WebP ────────────────────────────────────────────────────────────────
const chunkWebp = (tipo, carga) => [...enc(tipo), ...le32(carga.length), ...carga, ...(carga.length & 1 ? [0] : [])];
const webpConMetadatos = (flags = 0x1c) => {
  const cuerpo = [
    ...enc('WEBP'),
    ...chunkWebp('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]), // 0x10 alfa | 0x08 EXIF | 0x04 XMP
    ...chunkWebp('VP8 ', [1, 2, 3, 4, 5]), // longitud impar: lleva un byte de alineación
    ...chunkWebp('EXIF', GPS),
    ...chunkWebp('XMP ', enc('<x:xmpmeta/>')),
  ];
  return bytes(enc('RIFF'), le32(cuerpo.length), cuerpo);
};
const tiposWebp = (u8) => {
  const tipos = [];
  for (let i = 12; i + 8 <= u8.length;) {
    const len = u8[i + 4] | (u8[i + 5] << 8) | (u8[i + 6] << 16) | (u8[i + 7] << 24);
    tipos.push(texto(u8.subarray(i, i + 4)));
    i += 8 + len + (len & 1);
  }
  return tipos;
};
const tiposPng = (u8) => {
  const tipos = [];
  for (let i = 8; i + 12 <= u8.length;) {
    const len = ((u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3]) >>> 0;
    tipos.push(texto(u8.subarray(i + 4, i + 8)));
    i += 12 + len;
  }
  return tipos;
};
const marcadoresJpeg = (u8) => {
  const ms = [];
  for (let i = 2; i < u8.length;) {
    while (u8[i + 1] === 0xff) i++;
    const m = u8[i + 1];
    ms.push(m);
    if (m === 0xda) break;
    i += 2 + ((u8[i + 2] << 8) | u8[i + 3]);
  }
  return ms;
};

describe.each([
  ['dist/tickets.ts', stripTickets],
  ['dist/equipos-fotos.ts', stripEquipos],
  ['_shared/imagenes.ts (fuente)', stripFuente],
])('stripExif — %s', (_nombre, stripExif) => {
  describe('JPEG', () => {
    it('quita APP1 (EXIF y XMP), APP2, APP13 y COM; conserva APP0, DQT y SOF', () => {
      const sucio = jpegConMetadatos();
      expect(texto(sucio)).toContain('GPSLatitude');
      const limpio = stripExif(sucio, 'image/jpeg');
      expect(marcadoresJpeg(limpio)).toEqual([0xe0, 0xdb, 0xc0, 0xda]);
      const t = texto(limpio);
      for (const rastro of ['Exif', 'GPSLatitude', 'Serial', 'xmpmeta', 'ICC_PROFILE', 'Photoshop', 'Cámara']) {
        expect(t).not.toContain(rastro);
      }
      expect(limpio.length).toBeLessThan(sucio.length);
    });

    it('el flujo de píxeles (desde SOS hasta EOI) queda byte a byte igual', () => {
      const sucio = jpegConMetadatos();
      const limpio = stripExif(sucio, 'image/jpeg');
      const desde = (u8) => u8.subarray(u8.findIndex((v, i) => v === 0xff && u8[i + 1] === 0xda));
      expect(Array.from(desde(limpio))).toEqual(Array.from(desde(sucio)));
      expect(limpio[0]).toBe(0xff);
      expect(limpio[1]).toBe(0xd8);
      expect(limpio.at(-2)).toBe(0xff);
      expect(limpio.at(-1)).toBe(0xd9);
    });

    it('un JPEG sin metadatos queda idéntico y la limpieza es idempotente', () => {
      const una = stripExif(jpegConMetadatos(), 'image/jpeg');
      const dos = stripExif(una, 'image/jpeg');
      expect(Array.from(dos)).toEqual(Array.from(una));
    });

    it('fail-closed: truncado, sin SOS o sin firma devuelven null', () => {
      const sucio = jpegConMetadatos();
      expect(stripExif(sucio.subarray(0, 12), 'image/jpeg')).toBeNull(); // corta a mitad de un segmento
      expect(stripExif(bytes([0xff, 0xd8], segJpeg(0xe0, enc('JFIF\0'))), 'image/jpeg')).toBeNull(); // nunca llega al SOS
      expect(stripExif(bytes([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]), 'image/jpeg')).toBeNull(); // longitud mayor que el archivo
      expect(stripExif(bytes([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, 0xff, 0xda]), 'image/jpeg')).toBeNull(); // longitud inválida (< 2)
      expect(stripExif(bytes([0x00, 0x01, 0x02, 0x03, 0x04]), 'image/jpeg')).toBeNull();
      expect(stripExif(new Uint8Array(0), 'image/jpeg')).toBeNull();
    });
  });

  describe('PNG', () => {
    it('quita eXIf, tEXt, iTXt, zTXt y tIME; conserva IHDR, IDAT e IEND', () => {
      const sucio = pngConMetadatos();
      const limpio = stripExif(sucio, 'image/png');
      expect(tiposPng(limpio)).toEqual(['IHDR', 'IDAT', 'IEND']);
      const t = texto(limpio);
      for (const rastro of ['GPSLatitude', 'Maria', 'xmp', 'Comment']) expect(t).not.toContain(rastro);
      expect(Array.from(limpio.subarray(0, 8))).toEqual(FIRMA_PNG);
    });

    it('descarta lo que sigue a IEND (datos escondidos tras la imagen)', () => {
      const limpio = stripExif(pngConMetadatos(enc('PK-secreto-adjunto')), 'image/png');
      expect(texto(limpio)).not.toContain('secreto');
      expect(tiposPng(limpio).at(-1)).toBe('IEND');
    });

    it('idempotente y fail-closed (sin IEND, chunk que excede el archivo, firma falsa)', () => {
      const una = stripExif(pngConMetadatos(), 'image/png');
      expect(Array.from(stripExif(una, 'image/png'))).toEqual(Array.from(una));
      expect(stripExif(pngConMetadatos().subarray(0, 60), 'image/png')).toBeNull();
      expect(stripExif(bytes(FIRMA_PNG, [0x7f, 0xff, 0xff, 0xff], enc('IDAT'), [1, 2, 3, 4]), 'image/png')).toBeNull();
      expect(stripExif(bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]), 'image/png')).toBeNull();
    });
  });

  describe('WebP', () => {
    it('quita EXIF y XMP, corrige el tamaño RIFF y apaga sus banderas en VP8X (conserva alfa)', () => {
      const sucio = webpConMetadatos(0x1c);
      const limpio = stripExif(sucio, 'image/webp');
      expect(tiposWebp(limpio)).toEqual(['VP8X', 'VP8 ']);
      expect(limpio[20]).toBe(0x10); // byte de banderas de VP8X: solo queda alfa
      const riff = limpio[4] | (limpio[5] << 8) | (limpio[6] << 16) | (limpio[7] << 24);
      expect(riff).toBe(limpio.length - 8);
      expect(texto(limpio.subarray(0, 4))).toBe('RIFF');
      expect(texto(limpio.subarray(8, 12))).toBe('WEBP');
      const t = texto(limpio);
      for (const rastro of ['GPSLatitude', 'xmpmeta']) expect(t).not.toContain(rastro);
    });

    it('conserva el chunk de imagen con su byte de alineación y es idempotente', () => {
      const limpio = stripExif(webpConMetadatos(), 'image/webp');
      const i = texto(limpio).indexOf('VP8 ');
      expect(Array.from(limpio.subarray(i + 8, i + 14))).toEqual([1, 2, 3, 4, 5, 0]);
      expect(Array.from(stripExif(limpio, 'image/webp'))).toEqual(Array.from(limpio));
    });

    it('fail-closed: chunk que excede el archivo, sin RIFF/WEBP o archivo corto', () => {
      expect(stripExif(webpConMetadatos().subarray(0, 40), 'image/webp')).toBeNull();
      expect(stripExif(bytes(enc('RIFF'), le32(4), enc('WAVE')), 'image/webp')).toBeNull();
      expect(stripExif(bytes(enc('RIFF')), 'image/webp')).toBeNull();
    });
  });

  describe('otros formatos', () => {
    it('GIF (sin EXIF) y tipos no manejados se devuelven sin tocar', () => {
      const gif = bytes(enc('GIF89a'), [1, 0, 1, 0, 0, 0, 0, 0x3b]);
      expect(stripExif(gif, 'image/gif')).toBe(gif);
      expect(stripExif(gif, 'application/pdf')).toBe(gif);
    });
  });
});

describe('tickets y equipos-fotos comparten UNA sola implementación de stripExif (_shared/imagenes.ts)', () => {
  it('el código desplegado en los dos dist es literalmente el mismo', () => {
    expect(stripTickets.toString()).toBe(stripEquipos.toString());
    expect(stripTickets.toString()).toBe(stripFuente.toString());
  });

  it.each([
    ['image/jpeg', jpegConMetadatos()],
    ['image/png', pngConMetadatos(enc('cola'))],
    ['image/webp', webpConMetadatos()],
  ])('%s', (mime, entrada) => {
    expect(Array.from(stripTickets(entrada, mime))).toEqual(Array.from(stripEquipos(entrada, mime)));
  });
});
