// Subtítulo de un listado (SISTEMA-DISENO §1, principio 3: "la página dice
// qué estoy viendo"): cuántas filas hay, en qué vista y si hay filtros
// puestos, y después la descripción fija del módulo.
//
//   subtituloListado(9, ['empleado', 'empleados'], {
//     frase: ['activo', 'activos'], filtrado: true,
//     descripcion: 'Personal inventariado…',
//   })
//   → "9 empleados activos, con los filtros aplicados · Personal inventariado…"
//
// `frase` concuerda en número con el conteo; sin vista (Todos) va vacía.
export function subtituloListado(n, [singular, plural], { frase = null, filtrado = false, descripcion = '' } = {}) {
  const uno = n === 1;
  const partes = [`${n} ${uno ? singular : plural}`];
  if (frase) partes.push(` ${uno ? frase[0] : frase[1]}`);
  if (filtrado) partes.push(', con los filtros aplicados');
  const resumen = partes.join('');
  return descripcion ? `${resumen} · ${descripcion}` : resumen;
}
