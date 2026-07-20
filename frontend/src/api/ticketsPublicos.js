// Todo lo público de tickets (creación, seguimiento, encuesta de
// satisfacción) pasa por la edge function "tickets" — igual patrón que
// passwords.js: el cliente nunca escribe directo en la tabla `tickets`.
import { getClient } from './insforge.js';
import { esErrorRed, esperarReintento, MENSAJE_ERROR_RED } from '../core/error-red.js';

async function invoke(body) {
  const { data, error } = await getClient().functions.invoke('tickets', { body });
  if (error) {
    // Fallo de transporte (sin red, DNS caído, timeout): fallback global
    // con reintento de ESTA misma petición (core/error-red.js). Distinto
    // de un error de negocio { ok:false, code }, que maneja cada vista.
    if (esErrorRed(error)) {
      try {
        await esperarReintento();
      } catch {
        throw new Error(MENSAJE_ERROR_RED);
      }
      return invoke(body);
    }
    throw new Error(error.message || 'Error en el servidor de tickets');
  }
  if (!data?.ok) {
    const e = new Error(mensajeError(data?.code));
    e.code = data?.code;
    throw e;
  }
  return data;
}

// Exportado para que las vistas reutilicen el mismo texto en validaciones
// locales (ej. el aviso de DNI en vivo de TicketBuscarView) sin duplicarlo.
export const MENSAJES_ERROR_TICKETS = {
  datos_requeridos: 'Complete el título, la descripción y la categoría',
  no_existe: 'El ticket no existe o el enlace ya no es válido',
  no_disponible: 'La encuesta de este ticket no está disponible',
  ya_respondida: 'Ya se registró una respuesta para esta encuesta',
  datos_invalidos: 'Seleccione un nivel de satisfacción válido',
  error_codigo: 'No se pudo generar el código del ticket',
  error_creando: 'No se pudo registrar el ticket',
  dni_invalido: 'Ingrese un DNI válido (8 dígitos)',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos e intente de nuevo',
};

function mensajeError(code) {
  return MENSAJES_ERROR_TICKETS[code] || `Error de tickets (${code || 'desconocido'})`;
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

// Si ya se respondió antes (ej. el usuario refresca la página tras enviar),
// para no mostrar el formulario de nuevo como si nada se hubiera enviado
export async function encuestaYaRespondida(token) {
  const data = await invoke({ action: 'encuestaEstado', token });
  return data.respondida;
}

// Respuesta a la encuesta de satisfacción
export async function responderEncuesta(token, nivel, comentario) {
  await invoke({ action: 'encuesta', token, nivel, comentario });
}

// Tickets ACTIVOS de un empleado, para quien perdió el enlace de seguimiento
export async function buscarTicketsPorDni(dni) {
  const data = await invoke({ action: 'buscarPorDni', dni });
  return data.tickets;
}
