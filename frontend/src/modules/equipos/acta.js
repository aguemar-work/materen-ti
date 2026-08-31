// Acta de entrega de equipo — documento imprimible para firma física.
// Se abre en una ventana nueva lista para imprimir o guardar como PDF.
// El armado del documento (estilos, tablas, firmas) vive en acta-base.js,
// compartido con el acta de devolución.
import { formatFecha } from '../../core/formatters.js';
import { abrirActa, fechaHoy, firma, firmanteEmpleado, listaAccesorios, seccion, tablaDatos } from './acta-base.js';

const CLAUSULA = `Declaro haber recibido el equipo descrito en la presente acta, junto con los
    accesorios detallados, en la condición indicada, y me comprometo a: (a) darle
    uso exclusivamente laboral; (b) custodiarlo y mantenerlo en buen estado;
    (c) reportar de inmediato al área de TI cualquier falla, daño, pérdida o robo;
    y (d) devolverlo con todos sus accesorios al término de la relación laboral o
    cuando el área de TI lo requiera. Asumo responsabilidad por los daños o
    pérdidas atribuibles a negligencia en su uso o custodia.`;

export function generarActa(equipo, empleado) {
  const fechaEntrega = equipo.fecha_asignacion ? formatFecha(equipo.fecha_asignacion) : fechaHoy();

  abrirActa({
    titulo: 'Acta de entrega',
    encabezado: 'Acta de Entrega de Equipo',
    fecha: fechaEntrega,
    equipo,
    secciones: [
      seccion(
        '1. Datos del receptor',
        tablaDatos([
          ['Nombre completo', `${empleado.nombres} ${empleado.apellidos}`],
          ['DNI', empleado.dni],
          ['Cargo', empleado.cargo || '—'],
          ['Empresa', empleado.empresa_nombre || '—'],
        ]),
      ),
      seccion(
        '2. Datos del equipo',
        tablaDatos([
          ['Código de equipo', equipo.codigo],
          ['Código de almacén', equipo.codigo_almacen || '—'],
          ['Tipo', equipo.tipo_nombre],
          ['Marca / Modelo', `${equipo.marca || '—'} ${equipo.modelo || ''}`],
          ['Número de serie', equipo.serie || '—'],
          ['Accesorios entregados', { html: listaAccesorios(equipo) }],
          ['Condición de entrega', equipo.condicion_entrega || 'Operativo'],
          ['Fecha de entrega', fechaEntrega],
        ]),
      ),
    ],
    clausula: CLAUSULA,
    firmas: [firma('Entrega — Área de TI'), firma('Recibe conforme', firmanteEmpleado(empleado))],
  });
}
