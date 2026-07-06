// Todo lo público de tickets (creación, seguimiento, encuesta de
// satisfacción) pasa por la edge function "tickets" — igual patrón que
// passwords.js: el cliente nunca escribe directo en la tabla `tickets`.
import { getClient } from './insforge.js';

async function invoke(body) {
  const { data, error } = await getClient().functions.invoke('tickets', { body });
  if (error) throw new Error(error.message || 'Error en el servidor de tickets');
  if (!data?.ok) throw new Error(mensajeError(data?.code));
  return data;
}

function mensajeError(code) {
  const mensajes = {
    datos_requeridos: 'Completa el título, la descripción y la categoría',
    no_existe: 'El ticket no existe o el enlace ya no es válido',
    no_disponible: 'La encuesta de este ticket no está disponible',
    ya_respondida: 'Ya se registró una respuesta para esta encuesta',
    datos_invalidos: 'Selecciona un nivel de satisfacción válido',
    error_codigo: 'No se pudo generar el código del ticket',
    error_creando: 'No se pudo registrar el ticket',
  };
  return mensajes[code] || `Error de tickets (${code || 'desconocido'})`;
}

// Categorías/subcategorías activas, para poblar el formulario público
export async function catalogoTickets() {
  const data = await invoke({ action: 'catalogo' });
  return { categorias: data.categorias, subcategorias: data.subcategorias };
}

// Crea un ticket. datos: { titulo, descripcion, categoriaId, subcategoriaId?,
// tokenEntrega?, contacto?, equipoId?, cuentaId?, licenciaId?, adjunto? }
export async function crearTicket(datos) {
  const data = await invoke({ action: 'crear', ...datos });
  return { codigo: data.codigo, token: data.token, vinculado: data.vinculado };
}

// Estado + comentarios visibles de un ticket, por su token
export async function seguimientoTicket(token) {
  const data = await invoke({ action: 'seguimiento', token });
  const { ok, ...resto } = data;
  return resto;
}

// Respuesta a la encuesta de satisfacción
export async function responderEncuesta(token, nivel, comentario) {
  await invoke({ action: 'encuesta', token, nivel, comentario });
}
