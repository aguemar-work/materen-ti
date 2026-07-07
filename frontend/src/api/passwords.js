// Todas las operaciones con contraseñas pasan por la edge function
// "credenciales": la clave de cifrado vive en el servidor y cada
// revelado queda registrado en la auditoría (accesos_log).
import { getClient } from './insforge.js';

async function invoke(body) {
  const { data, error } = await getClient().functions.invoke('credenciales', { body });
  if (error) throw new Error(error.message || 'Error en el servidor de credenciales');
  if (!data?.ok) throw new Error(mensajeError(data?.code));
  return data;
}

function mensajeError(code) {
  const mensajes = {
    no_autenticado: 'Sesión expirada — vuelve a iniciar sesión',
    no_es_staff: 'No tienes permisos para esta acción',
    no_existe: 'El registro no existe',
    ya_abierta: 'Este enlace ya fue utilizado',
    expirada: 'Este enlace expiró',
    demasiados_revelados: 'Demasiadas contraseñas reveladas en poco tiempo. Espera unos minutos.',
  };
  return mensajes[code] || `Error de credenciales (${code || 'desconocido'})`;
}

// Cifra un valor antes de guardarlo. Devuelve el texto cifrado (enc2:...)
export async function cifrarPassword(value) {
  if (!value) return null;
  const data = await invoke({ action: 'encrypt', value });
  return data.encrypted;
}

// Revela la contraseña de una cuenta. motivo: 'ver' | 'copiar' (queda auditado)
export async function revelarPassword(cuentaId, motivo = 'ver') {
  const data = await invoke({ action: 'revelar', cuentaId, motivo });
  return data.password;
}

// Revela la clave/serial de una licencia. motivo: 'ver' | 'copiar' (auditado)
export async function revelarClaveLicencia(licenciaId, motivo = 'ver') {
  const data = await invoke({ action: 'revelarClaveLicencia', licenciaId, motivo });
  return data.clave;
}

// Crea un enlace de un solo uso con las credenciales indicadas
export async function crearEntrega(empleadoId, cuentaIds, horas = 24) {
  const data = await invoke({ action: 'entregaCrear', empleadoId, cuentaIds, horas });
  return { token: data.token, expiresAt: data.expiresAt };
}

// Abre una entrega (público, sin sesión). Un solo uso.
export async function abrirEntrega(token) {
  const data = await invoke({ action: 'entregaAbrir', token });
  return { empleadoNombre: data.empleadoNombre, credenciales: data.credenciales };
}
