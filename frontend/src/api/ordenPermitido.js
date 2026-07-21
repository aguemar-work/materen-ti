// Valida un pedido de orden (columna elegida por el usuario en la tabla)
// contra una lista blanca de columnas reales de la tabla — nunca se pasa
// el valor del cliente directo a .order(), y las columnas calculadas o de
// tablas relacionadas (join) quedan fuera porque .order() de PostgREST solo
// ordena por columnas de la tabla base.
export function ordenValido(orden, permitidas, porDefecto) {
  if (orden?.columna && permitidas.includes(orden.columna)) {
    return { columna: orden.columna, ascending: orden.direccion !== 'desc' };
  }
  return porDefecto;
}
