// DNI en documentos impresos (plan de mejora §3.10): en el acta de entrega y
// devolución va COMPLETO (la persona firma identificándose con él: documento
// legal); en reportes, hoja de vida impresa y etiquetas va enmascarado,
// "****8912". Un solo helper para que ningún impreso decida por su cuenta.

/**
 * "45678912" → "****8912". Solo deja a la vista los últimos 4 dígitos; un
 * valor de 4 caracteres o menos se enmascara entero (no hay nada que mostrar
 * sin revelarlo todo). Vacío → '' (el llamador pinta "Sin registrar").
 */
export function enmascararDni(dni) {
  const limpio = String(dni ?? '').replace(/\s+/g, '');
  if (!limpio) return '';
  if (limpio.length <= 4) return '****';
  return `****${limpio.slice(-4)}`;
}
