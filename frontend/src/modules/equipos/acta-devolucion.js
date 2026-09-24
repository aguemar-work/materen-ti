// Acta de devolución de equipo — documento imprimible para firma física.
// Se abre en una ventana nueva lista para imprimir o guardar como PDF.
// El armado del documento (estilos, tablas, firmas) vive en acta-base.js,
// compartido con el acta de entrega.
import { formatFecha } from '../../core/formatters.js';
import { abrirActa, fechaHoy, firma, firmanteEmpleado, listaAccesorios, seccion, tablaDatos } from './acta-base.js';

const MOTIVO_LABELS = {
  devolucion: 'Devolución normal',
  cambio_equipo: 'Cambio de equipo',
  baja_empleado: 'Baja del empleado',
  perdida: 'Pérdida / robo',
};

const CLAUSULA = `Declaro haber devuelto el equipo descrito en la presente acta, junto con los
    accesorios detallados, en la condición indicada, quedando liberado de la
    responsabilidad de custodia asumida al momento de la entrega. El área de TI
    verificará el estado del equipo y, de existir daños o faltantes no reportados
    en este documento, se reserva el derecho de determinar la responsabilidad
    correspondiente.`;

export function generarActaDevolucion(equipo, empleado, datosDevolucion, win) {
  const fechaDevolucion = datosDevolucion.fecha ? formatFecha(datosDevolucion.fecha) : fechaHoy();
  const motivoLabel = MOTIVO_LABELS[datosDevolucion.motivo] || datosDevolucion.motivo || '—';

  abrirActa({
    titulo: 'Acta de devolución',
    encabezado: 'Acta de Devolución de Equipo',
    fecha: fechaDevolucion,
    equipo,
    secciones: [
      seccion(
        '1. Datos de quien devuelve',
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
          ['Accesorios devueltos', { html: listaAccesorios(equipo) }],
        ]),
      ),
      seccion(
        '3. Datos de la devolución',
        tablaDatos([
          ['Condición de devolución', datosDevolucion.condicion || '—'],
          ['Motivo', motivoLabel],
          ['¿Enviado a reparación?', datosDevolucion.aReparacion ? 'Sí' : 'No'],
          ['Fecha de devolución', fechaDevolucion],
        ]),
      ),
    ],
    clausula: CLAUSULA,
    firmas: [firma('Entrega conforme', firmanteEmpleado(empleado)), firma('Recibe — Área de TI')],
  }, win);
}
