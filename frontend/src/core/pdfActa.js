// Acta firmada en papel → PDF para subirla al expediente (plan §3.7).
//
// La edge function `equipos-fotos` (acción `subirActa`) SOLO acepta PDF
// (magic bytes `%PDF-`, hasta 10 MB). Quien sube el acta puede traer un PDF ya
// escaneado, o una FOTO tomada con la cámara del celular: la foto se convierte
// a PDF aquí, en el navegador, antes de subir. Nada sale del equipo hasta
// entonces.
//
// jsPDF se importa de forma diferida: solo se descarga cuando alguien sube una
// foto. Desde 2026-10-05 es el ÚNICO uso de jsPDF (los reportes se imprimen
// con window.print() desde el módulo Reportes); es un DOCUMENTO, no un reporte.
import { comprimirImagen } from './imagenes.js';

// Lado largo de la foto del acta: más que una foto de equipo (1280) para que
// la firma y lo manuscrito se lean al imprimirla de nuevo.
const LADO_ACTA = 2000;
const MARGEN_MM = 8;

export const TOPE_ACTA_BYTES = 10 * 1024 * 1024;

export function esPdf(archivo) {
  return archivo?.type === 'application/pdf' || /\.pdf$/i.test(archivo?.name || '');
}

export function esImagen(archivo) {
  return String(archivo?.type || '').startsWith('image/');
}

function leerComoDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(new Error('No se pudo leer la imagen'));
    lector.readAsDataURL(blob);
  });
}

// Tamaño de página (mm) y de la imagen dentro de ella: A4 vertical u
// horizontal según la foto, con margen, sin deformarla. Puro (se prueba solo).
export function disposicionPagina(anchoPx, altoPx) {
  const horizontal = anchoPx > altoPx;
  const pagina = horizontal ? { ancho: 297, alto: 210 } : { ancho: 210, alto: 297 };
  const util = { ancho: pagina.ancho - MARGEN_MM * 2, alto: pagina.alto - MARGEN_MM * 2 };
  const escala = Math.min(util.ancho / anchoPx, util.alto / altoPx);
  const ancho = anchoPx * escala;
  const alto = altoPx * escala;
  return {
    orientacion: horizontal ? 'landscape' : 'portrait',
    imagen: { x: (pagina.ancho - ancho) / 2, y: (pagina.alto - alto) / 2, ancho, alto },
  };
}

/**
 * Foto del acta (JPG, PNG, HEIC ya decodificable por el navegador) → File PDF.
 * `comprimir` se inyecta en los tests.
 */
export async function imagenAPdf(foto, { comprimir = comprimirImagen } = {}) {
  const jpeg = await comprimir(foto, { maxLado: LADO_ACTA, calidad: 0.82 });
  const dataUrl = await leerComoDataUrl(jpeg);
  const bitmap = await createImageBitmap(jpeg);
  const { width, height } = bitmap;
  bitmap.close?.();

  const { jsPDF } = await import('jspdf');
  const { orientacion, imagen } = disposicionPagina(width, height);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orientacion });
  doc.addImage(dataUrl, 'JPEG', imagen.x, imagen.y, imagen.ancho, imagen.alto);

  const nombre = (foto.name || 'acta').replace(/\.[^.]+$/, '') || 'acta';
  return new File([doc.output('blob')], `${nombre}.pdf`, { type: 'application/pdf' });
}

/**
 * Lo que sube el selector de archivo: un PDF pasa tal cual, una imagen se
 * convierte a PDF, cualquier otra cosa se rechaza con un mensaje en español.
 */
export async function prepararActaParaSubir(archivo, opciones) {
  if (!archivo) throw new Error('Seleccione el acta firmada.');
  const pdf = esPdf(archivo) ? archivo : esImagen(archivo) ? await imagenAPdf(archivo, opciones) : null;
  if (!pdf) throw new Error('El archivo debe ser un PDF o una foto (JPG o PNG) del acta firmada.');
  if (pdf.size > TOPE_ACTA_BYTES) throw new Error('El acta supera el tope de 10 MB. Escanéela con menor resolución.');
  return pdf;
}
