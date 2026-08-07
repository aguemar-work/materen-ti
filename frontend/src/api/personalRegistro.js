// Pre-registro público de personal: pasa por la edge function
// "personal-registro" — igual patrón que ticketsPublicos.js, el cliente
// nunca escribe directo en la tabla `personal_registros`.
import { getClient } from './insforge.js';
import { esErrorRed, esperarReintento, MENSAJE_ERROR_RED } from '../core/error-red.js';

async function invoke(body) {
  const { data, error } = await getClient().functions.invoke('personal-registro', { body });
  if (error) {
    if (esErrorRed(error)) {
      try {
        await esperarReintento();
      } catch {
        throw new Error(MENSAJE_ERROR_RED);
      }
      return invoke(body);
    }
    throw new Error(error.message || 'Error en el servidor de pre-registro');
  }
  if (!data?.ok) {
    const e = new Error(mensajeError(data?.code));
    e.code = data?.code;
    throw e;
  }
  return data;
}

export const MENSAJES_ERROR_PERSONAL_REGISTRO = {
  dni_invalido: 'Ingrese un DNI válido (8 dígitos)',
  datos_requeridos: 'Complete nombres y apellidos',
  texto_muy_largo: 'Alguno de los datos ingresados es demasiado largo',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos e intente de nuevo',
  error_guardando: 'No se pudo registrar sus datos',
};

function mensajeError(code) {
  return MENSAJES_ERROR_PERSONAL_REGISTRO[code] || `Error de pre-registro (${code || 'desconocido'})`;
}

// Si el DNI ya trabajó aquí antes, autocompleta desde `empleados`.
// Devuelve null si no hay match (no es un error, se llena a mano).
export async function buscarDniPersonal(dni) {
  const data = await invoke({ action: 'buscarDni', dni });
  if (!data.encontrado) return null;
  return {
    nombres: data.nombres,
    apellidos: data.apellidos,
    celular: data.celular,
    correoPersonal: data.correoPersonal,
  };
}

// datos: { dni, nombres, apellidos, celular?, correoPersonal? }
export async function crearPersonalRegistro(datos) {
  const data = await invoke({ action: 'crear', ...datos });
  return { yaPendiente: !!data.yaPendiente };
}
