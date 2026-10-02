// Etiquetas QR de equipos (plan de mejora §3.6, decidido por el dueño).
//
// Todo equipo lleva una etiqueta con un QR que abre su hoja de vida. El QR
// codifica una URL corta: `<origen>/e/<codigo>`. SOLO el código de
// inventario, que no es secreto: nunca un token, un id interno, la serie ni el
// nombre de una persona. Sin sesión la ruta `/e/:codigo` no consulta nada.
//
// El QR se genera EN EL NAVEGADOR con la librería `qrcode` (solo su función
// `create`, que arma la matriz de módulos, sin red); el dibujo es un SVG
// armado acá. Nada se envía a ningún servicio externo, y una regla de
// `scripts/patrones-ui.mjs` lo vigila.
import { create } from 'qrcode';

/** Corrección de errores de la etiqueta: M (~15 %), la elegida por el dueño. */
export const NIVEL_CORRECCION_QR = 'M';

/**
 * URL que codifica la etiqueta de un equipo. `origen` por defecto es el del
 * navegador (en la maqueta y en producción, el dominio desde el que se
 * imprime); se inyecta en los tests.
 */
export function urlEtiqueta(codigo, origen = globalThis.location?.origin ?? '') {
  const limpio = String(codigo ?? '').trim();
  return `${String(origen).replace(/\/+$/, '')}/e/${encodeURIComponent(limpio)}`;
}

/**
 * Matriz de módulos de un texto: `{ tamano, oscuros }` donde `oscuros` es un
 * Uint8Array de tamano×tamano con 1 = módulo oscuro. Es exactamente lo que
 * codifica el QR; el test de EtiquetaEquipo la compara contra el dibujo.
 */
export function matrizQr(texto) {
  const qr = create(String(texto), { errorCorrectionLevel: NIVEL_CORRECCION_QR });
  return { tamano: qr.modules.size, oscuros: qr.modules.data };
}

/**
 * Trazo SVG (atributo `d`) de los módulos oscuros, en unidades de módulo: una
 * pasada por fila que fusiona los tramos horizontales contiguos
 * ("M x y h<largo> v1 h-<largo> z"). Cabe en un `viewBox="0 0 tamano tamano"`.
 */
export function trazoQr(texto) {
  const { tamano, oscuros } = matrizQr(texto);
  const partes = [];
  for (let fila = 0; fila < tamano; fila += 1) {
    let col = 0;
    while (col < tamano) {
      if (!oscuros[fila * tamano + col]) {
        col += 1;
        continue;
      }
      const inicio = col;
      while (col < tamano && oscuros[fila * tamano + col]) col += 1;
      const largo = col - inicio;
      partes.push(`M${inicio} ${fila}h${largo}v1h-${largo}z`);
    }
  }
  return { tamano, trazo: partes.join('') };
}

/**
 * Operación inversa de `trazoQr`, para verificar un dibujo: lee un trazo y
 * devuelve la matriz que representa (Uint8Array tamano×tamano).
 */
export function matrizDeTrazo(trazo, tamano) {
  const oscuros = new Uint8Array(tamano * tamano);
  for (const m of String(trazo).matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [, x, y, largo] = m.map(Number);
    for (let i = 0; i < largo; i += 1) oscuros[y * tamano + x + i] = 1;
  }
  return oscuros;
}
