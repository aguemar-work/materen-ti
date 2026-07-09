// Vocabulario del dominio empleados — antes copiado en Dashboard,
// EmpleadosView y EmpleadoDetalleView.

// Estado del empleado → badge semántico
export function claseEstado(estado) {
  if (estado === 'Activo') return 'badge--success';
  if (estado === 'Suspendido') return 'badge--warning';
  return 'badge--neutral';
}

export function nombreCompleto(emp) {
  if (!emp) return '';
  return `${emp.nombres} ${emp.apellidos}`.trim();
}
