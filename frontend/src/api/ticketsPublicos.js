// Todo lo público de tickets (creación, seguimiento, encuesta de
// satisfacción) pasa por la edge function "tickets" — igual patrón que
// passwords.js: el cliente nunca escribe directo en la tabla `tickets`.
import { crearInvocador } from './invocarFuncion.js';

const invoke = crearInvocador('tickets', mensajeError);

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
  texto_muy_largo: 'El texto es demasiado largo. Acórtelo e intente de nuevo',
  categoria_invalida: 'Seleccione una categoría válida',
  empleado_invalido: 'El empleado seleccionado no existe',
  vinculo_invalido: 'El equipo, la cuenta o la licencia vinculada no es válida',
  // Captura adjunta privada (acción adjuntoStaff, migración 111)
  no_autenticado: 'Sesión expirada — vuelva a iniciar sesión',
  no_autorizado: 'Sin permiso sobre el módulo Tickets',
  error_url: 'No se pudo generar el enlace de la captura',
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

// Estado + comentarios visibles de un ticket, por su token. Si tiene captura,
// trae `adjuntoUrl`: URL firmada que vence en `adjuntoExpiraSegundos` (300);
// para abrirla más tarde se vuelve a llamar a esta función.
export async function seguimientoTicket(token) {
  const data = await invoke({ action: 'seguimiento', token });
  const { ok, ...resto } = data;
  return resto;
}

// URL firmada de la captura adjunta de un ticket, para el STAFF (migración 111).
// El bucket `tickets-adjuntos` es privado: la URL vive 300 s y se pide al
// momento de mostrar o abrir la captura, nunca se guarda. La autorización
// (sesión + módulo tickets) la comprueba la edge function.
export async function urlAdjuntoTicket(ticketId) {
  const data = await invoke({ action: 'adjuntoStaff', ticketId });
  return { url: data.url, expiraSegundos: data.expiraSegundos };
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
