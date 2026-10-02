// Validación y limpieza de imágenes subidas por clientes no confiables.
// Fuente única: scripts/build-functions.mjs inlina este archivo en el dist de
// tickets y equipos-fotos (antes estaba duplicado a mano en ambos).

// Devuelve la extensión canónica si los primeros bytes son de una imagen
// soportada; null si no lo es (no se sube). Se ignora el `tipo` que declare el
// cliente: manda el contenido real (magic bytes).
// export: probado en frontend/tests/tickets-validaciones.test.js
export function sniffImagen(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

export const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

// ── Limpieza de metadatos (EXIF, XMP, IPTC, ICC, comentarios) ────────────────
// Una foto del celular trae ubicación GPS, fecha, modelo y número de serie del
// aparato. El navegador ya re-codifica la imagen (core/imagenes.js), pero el
// cliente no es de confianza: el servidor recorre el contenedor y descarta los
// bloques de metadatos SIN decodificar ni re-comprimir los píxeles (el
// resultado se ve idéntico). Devuelve los bytes limpios, o null si el archivo
// no se puede recorrer con seguridad (truncado, corrupto): FAIL-CLOSED, quien
// llama debe rechazar la imagen. GIF no lleva EXIF y se devuelve tal cual.
//   JPEG: APP1 (EXIF/XMP), APP2 (ICC/MPF), APP13 (IPTC) y COM, hasta el SOS.
//   PNG:  eXIf, tEXt, iTXt, zTXt y tIME; lo que sigue a IEND se descarta.
//   WebP: EXIF y XMP, con el tamaño RIFF y las banderas de VP8X corregidos.
// Una sola fuente (esta); probado en frontend/tests/exif.test.js.
const JPEG_A_QUITAR = new Set([0xe1, 0xe2, 0xed, 0xfe]);
const PNG_A_QUITAR = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
const WEBP_A_QUITAR = new Set(['EXIF', 'XMP ']);

function unir(partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const salida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of partes) {
    salida.set(p, o);
    o += p.length;
  }
  return salida;
}

export function stripExif(b: Uint8Array<ArrayBuffer>, mime: string): Uint8Array<ArrayBuffer> | null {
  const tipo4 = (i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  const partes: Uint8Array[] = [];
  if (mime === 'image/jpeg') {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
    partes.push(b.subarray(0, 2));
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) return null;
      while (b[i + 1] === 0xff) i++; // bytes de relleno antes del marcador
      const m = b[i + 1];
      if (m === undefined) return null;
      if (m === 0x01 || m === 0xd9 || (m >= 0xd0 && m <= 0xd8)) { // marcadores sin longitud
        partes.push(b.subarray(i, i + 2));
        i += 2;
        continue;
      }
      if (m === 0xda) { // SOS: desde aquí es el flujo de píxeles hasta EOI, no se toca
        partes.push(b.subarray(i));
        return unir(partes);
      }
      if (i + 4 > b.length) return null;
      const fin = i + 2 + ((b[i + 2] << 8) | b[i + 3]);
      if (fin > b.length || fin < i + 4) return null;
      if (!JPEG_A_QUITAR.has(m)) partes.push(b.subarray(i, fin));
      i = fin;
    }
    return null; // sin SOS no es una imagen completa
  }
  if (mime === 'image/png') {
    const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (b.length < 8 || firma.some((v, k) => b[k] !== v)) return null;
    partes.push(b.subarray(0, 8));
    for (let i = 8; i + 12 <= b.length;) {
      const fin = i + 12 + (((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
      if (fin > b.length) return null;
      const tipo = tipo4(i + 4);
      if (!PNG_A_QUITAR.has(tipo)) partes.push(b.subarray(i, fin));
      if (tipo === 'IEND') return unir(partes);
      i = fin;
    }
    return null; // sin IEND está truncado
  }
  if (mime === 'image/webp') {
    if (b.length < 12 || tipo4(0) !== 'RIFF' || tipo4(8) !== 'WEBP') return null;
    const chunks: Uint8Array[] = [];
    for (let i = 12; i + 8 <= b.length;) {
      const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
      if (i + 8 + len > b.length) return null;
      const fin = i + 8 + len + (len & 1); // los chunks se alinean a par
      const tipo = tipo4(i);
      if (!WEBP_A_QUITAR.has(tipo)) {
        const chunk = new Uint8Array(8 + len + (len & 1)); // copia (rellena el byte de alineación si faltara)
        chunk.set(b.subarray(i, Math.min(fin, b.length)));
        if (tipo === 'VP8X') chunk[8] &= ~0x0c; // apaga las banderas EXIF (0x08) y XMP (0x04)
        chunks.push(chunk);
      }
      i = fin;
    }
    const cabecera = new Uint8Array(12);
    cabecera.set(b.subarray(0, 4)); // "RIFF"
    new DataView(cabecera.buffer).setUint32(4, 4 + chunks.reduce((n, c) => n + c.length, 0), true);
    cabecera.set(b.subarray(8, 12), 8); // "WEBP"
    return unir([cabecera, ...chunks]);
  }
  return b;
}
