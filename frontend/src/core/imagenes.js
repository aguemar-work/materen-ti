// Compresión de imágenes en el navegador antes de subirlas al storage.
// Una foto de celular (3-5MB) queda en ~150-250KB: suficiente para
// identificar un equipo y no consumir la cuota de InsForge.

const MAX_LADO = 1280;
const CALIDAD_JPEG = 0.8;

// Tope del archivo DE ENTRADA (la compresión ocurre después): por encima
// de esto ni siquiera se intenta decodificar.
const MAX_BYTES_ENTRADA = 20 * 1024 * 1024; // 20MB

export async function comprimirImagen(file) {
  // Chequeo barato y síncrono antes de decodificar: con un archivo que no
  // es imagen o es desmesurado, createImageBitmap puede colgar el
  // navegador varios segundos antes de fallar.
  if (!file?.type?.startsWith('image/') || file.size > MAX_BYTES_ENTRADA) {
    throw new Error('No se pudo procesar la imagen');
  }

  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  if (width > MAX_LADO || height > MAX_LADO) {
    const escala = MAX_LADO / Math.max(width, height);
    width = Math.round(width * escala);
    height = Math.round(height * escala);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG)
  );
  if (!blob) throw new Error('No se pudo procesar la imagen');

  const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], nombre, { type: 'image/jpeg' });
}

// Para enviar un archivo dentro de un JSON (ej. al crear un ticket desde
// una página pública, sin sesión para subir directo a storage)
export async function archivoABase64(file) {
  const buffer = await file.arrayBuffer();
  let binario = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}
