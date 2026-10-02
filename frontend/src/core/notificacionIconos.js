// Icono por tipo de notificación/aviso — compartido entre la campana
// persistente (NotificacionesCampana.vue) y el toast emergente
// (AppNotifications.vue) para que no diverjan.
const ICONO_POR_TIPO = {
  ticket_creado: 'ti-headset',
  cuenta_creada: 'ti-key',
  empleado_alta: 'ti-user-plus',
  empleado_baja: 'ti-user-off',
  // Migración 102: la suspensión también marca "Rotar contraseña" en las
  // cuentas compartidas y reutilizables del empleado. El destino
  // (`/empleados/<id>`) lo trae la propia notificación.
  empleado_suspendido: 'ti-user-pause',
  ticket_asignado: 'ti-user-check',
  ticket_estado_cambiado: 'ti-progress',
  ticket_comentario_nuevo: 'ti-message-circle',
};

export function iconoNotificacion(tipo) {
  return ICONO_POR_TIPO[tipo] || 'ti-bell';
}
