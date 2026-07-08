// Flujo compartido de "enviar credenciales": genera un enlace de
// entrega de un solo uso (expira en 24h o al abrirse) y abre WhatsApp
// con el mensaje estándar. Usado por el perfil del empleado
// (CuentasPanel) y por la acción rápida de la tabla de Empleados.
import { crearEntrega } from '../api/passwords.js';

export async function enviarCredencialesWhatsApp({ empleadoId, empleadoNombre, whatsapp, cuentaIds }) {
  const { token } = await crearEntrega(empleadoId, cuentaIds, 24);
  const link = `${window.location.origin}/entrega/${token}`;
  const texto =
    `Bienvenido/a, ${empleadoNombre} 👋\n` +
    `Tus accesos están listos. Puedes obtenerlos en el siguiente enlace:\n` +
    `🔗 ${link}\n` +
    `⚠️ Importante:\n\n` +
    `Este enlace se puede abrir solo una vez.\n` +
    `Expira en 24 horas.\n` +
    `Guarda tus credenciales en un lugar seguro apenas las veas (no podrás volver a acceder al enlace).\n\n` +
    `Si tienes algún problema para acceder, contáctanos lo antes posible.`;
  const digits = (whatsapp || '').replace(/\D/g, '');
  const url = digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, '_blank', 'noopener');
}
