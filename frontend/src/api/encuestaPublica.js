// Lado público de una ronda de encuesta: pasa por la edge function
// "encuestas" — igual patrón que personalRegistro.js, el cliente nunca
// lee/escribe directo en encuesta_rondas/encuesta_respuestas.
import { getClient } from './insforge.js';
import { esErrorRed, esperarReintento, MENSAJE_ERROR_RED } from '../core/error-red.js';

async function invoke(body) {
  const { data, error } = await getClient().functions.invoke('encuestas', { body });
  if (error) {
    if (esErrorRed(error)) {
      try {
        await esperarReintento();
      } catch {
        throw new Error(MENSAJE_ERROR_RED);
      }
      return invoke(body);
    }
    throw new Error(error.message || 'Error en el servidor de encuestas');
  }
  if (!data?.ok) {
    const e = new Error(mensajeError(data?.code));
    e.code = data?.code;
    throw e;
  }
  return data;
}

export const MENSAJES_ERROR_ENCUESTA = {
  slug_requerido: 'Enlace inválido',
  no_disponible: 'Esta encuesta no está disponible (puede haberse cerrado)',
  datos_requeridos: 'Complete las preguntas obligatorias',
  respuesta_invalida: 'Alguna respuesta no es válida. Revise el formulario',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos e intente de nuevo',
  error_guardando: 'No se pudo enviar la respuesta',
};

function mensajeError(code) {
  return MENSAJES_ERROR_ENCUESTA[code] || `Error de encuesta (${code || 'desconocido'})`;
}

// { titulo, descripcion, preguntas } de la ronda, o lanza si no está disponible.
export async function abrirEncuesta(slug) {
  const data = await invoke({ action: 'abrir', slug });
  return { titulo: data.titulo, descripcion: data.descripcion, preguntas: data.preguntas };
}

// respuestas: { [preguntaId]: valor }
export async function responderEncuesta(slug, respuestas) {
  await invoke({ action: 'responder', slug, respuestas });
}
