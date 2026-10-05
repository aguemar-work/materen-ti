// Partición de un identificador del dominio para AppCodigo (regla 14).
//
// "TCK-0281" → prefijo "TCK-" (gris) + número "0281" (oscuro). El prefijo es
// la parte alfabética del principio con su separador; el resto, lo que se
// teclea/lee para encontrar el expediente. Un identificador que no empieza
// con letras seguidas de un dígito (DNI "45678912", serie "5CD1234XYZ", un
// usuario) no tiene prefijo: va entero en oscuro.
//
// Falsos positivos conocidos: "AB12" parte en "AB" + "12" aunque no sea un
// código con prefijo. Es inocuo (solo cambia el tono de dos letras) y quien lo
// sepa mejor pasa `prefijo` explícito.

const PATRON = /^([A-Za-zÁÉÍÓÚÑáéíóúñ]+)([-_ ./]?)(\d.*)$/;
const SEPARADORES = /^[-_ ./]*/;

/**
 * @param {string|number} valor     el identificador completo ("TCK-0281")
 * @param {string} [prefijo]        prefijo explícito ("TCK"); si el valor ya
 *   lo trae al principio se respeta su separador, si no se antepone con "-"
 * @returns {{ prefijo: string, numero: string }} `prefijo` ya incluye el
 *   separador ("TCK-"); `prefijo + numero` reconstruye el código mostrado
 */
export function partesCodigo(valor, prefijo = '') {
  const v = String(valor ?? '').trim();
  if (!v) return { prefijo: '', numero: '' };

  const p = String(prefijo ?? '').trim();
  if (p) {
    if (v.toUpperCase().startsWith(p.toUpperCase())) {
      const resto = v.slice(p.length);
      const sep = SEPARADORES.exec(resto)[0];
      return { prefijo: p + sep, numero: resto.slice(sep.length) };
    }
    return { prefijo: `${p}-`, numero: v };
  }

  const m = PATRON.exec(v);
  if (!m) return { prefijo: '', numero: v };
  return { prefijo: m[1] + m[2], numero: m[3] };
}
