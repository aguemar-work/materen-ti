// Compresión de imágenes en el navegador antes de subirlas al storage.
// Una foto de celular (3-5MB) queda en ~150-250KB: suficiente para
// identificar un equipo y no consumir la cuota de InsForge.

const MAX_LADO = 1280;
const CALIDAD_JPEG = 0.8;

export async function comprimirImagen(file) {
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
