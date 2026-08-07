// El índice único uq_cuentas_usuario_plataforma (migración 039) evita
// registrar el mismo usuario/correo dos veces en la misma plataforma.
// Sin este mapeo, el error crudo de Postgres ("duplicate key value
// violates unique constraint...") llegaría tal cual al formulario.
export function mensajeSiUsuarioDuplicado(error) {
  if (error?.code !== '23505') return null;
  if (!String(error?.message || '').includes('uq_cuentas_usuario_plataforma')) return null;
  return 'Ya existe una cuenta registrada con este usuario en esta plataforma. Búscala en Correos o en la ficha del empleado en vez de crear una nueva.';
}
