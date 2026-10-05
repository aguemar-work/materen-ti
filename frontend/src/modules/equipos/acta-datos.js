// Contenido de las actas de equipos (entrega y devolución). Reemplaza al trío
// acta-base.js / acta.js / acta-devolucion.js, que armaban un HTML a mano en una
// ventana con `document.write` (Arial, sin QR, sin cabecera de expediente).
//
// Acá NO hay HTML ni ventanas: solo se decide QUÉ dice el acta (secciones,
// filas, cláusula, firmantes). La hoja imprimible es `ActaView.vue`, ruta
// `/equipos/:id/acta/:asignacionId` (plan de mejora, regla 23: "imprimir es la
// misma hoja"), que dibuja este contenido con la Inter del bundle.
//
// El DNI va COMPLETO: es un documento legal y la persona firma identificándose
// con él (plan §3.10). En reportes, hoja de vida impresa y etiquetas va
// enmascarado (core/dni.js); acá no.
import { formatFecha } from '../../core/formatters.js';
import { ESTADOS_FISICO_EQUIPO } from '../../core/dominio-equipos.js';
import { MOTIVOS_CIERRE } from './kardex.js';

export const TIPOS_ACTA = ['entrega', 'devolucion'];

export const TITULO_ACTA = {
  entrega: 'Acta de entrega de equipo',
  devolucion: 'Acta de devolución de equipo',
};

const CLAUSULA_ENTREGA = `Declaro haber recibido el equipo descrito en la presente acta, junto con los accesorios detallados, en la condición indicada, y me comprometo a: (a) darle uso exclusivamente laboral; (b) custodiarlo y mantenerlo en buen estado; (c) reportar de inmediato al área de TI cualquier falla, daño, pérdida o robo; y (d) devolverlo con todos sus accesorios al término de la relación laboral o cuando el área de TI lo requiera. Asumo responsabilidad por los daños o pérdidas atribuibles a negligencia en su uso o custodia.`;

const CLAUSULA_DEVOLUCION = `Declaro haber devuelto el equipo descrito en la presente acta, junto con los accesorios detallados, en la condición indicada, quedando liberado de la responsabilidad de custodia asumida al momento de la entrega. El área de TI verificará el estado del equipo y, de existir daños o faltantes no reportados en este documento, se reserva el derecho de determinar la responsabilidad correspondiente.`;

/** El tipo de la URL (`?tipo=`) o `entrega` si falta o no es válido. */
export function tipoActaDe(valor) {
  return TIPOS_ACTA.includes(valor) ? valor : 'entrega';
}

/** Accesorios como líneas {codigo, descripcion, cantidad}; vacío si no hay. */
export function lineasAccesorios(equipo) {
  const lineas = equipo.accesorios_lineas?.length
    ? equipo.accesorios_lineas
    : (equipo.accesorios || []).map((descripcion) => ({ descripcion, cantidad: 1 }));
  return lineas.map((l) => ({
    codigo: l.codigo || '',
    descripcion: l.descripcion,
    cantidad: l.cantidad || 1,
  }));
}

/**
 * @param {object} p
 * @param {'entrega'|'devolucion'} p.tipo
 * @param {object} p.equipo       fila de equipos ya mapeada (api/domains/equipos.js)
 * @param {object} p.empleado     ficha completa del empleado (con DNI y cargo)
 * @param {object} p.asignacion   fila de asignaciones_equipo del acta
 * @returns {{ tipo, titulo, rotulo, fecha, secciones, accesorios, clausula, firmas }}
 *   `secciones`: [{ titulo, filas: [[etiqueta, valor]] }]. La sección del
 *   equipo no lleva la fila de accesorios (van aparte, como lista).
 */
export function contenidoActa({ tipo, equipo, empleado, asignacion }) {
  const esEntrega = tipo === 'entrega';
  const fecha = formatFecha(esEntrega ? asignacion.fecha_inicio : asignacion.fecha_fin);
  const nombre = `${empleado.nombres} ${empleado.apellidos}`.trim();

  const persona = {
    titulo: esEntrega ? '1. Datos del receptor' : '1. Datos de quien devuelve',
    filas: [
      ['Nombre completo', nombre],
      ['DNI', empleado.dni],
      ['Cargo', empleado.cargo || '—'],
      ['Empresa', empleado.empresa_nombre || '—'],
    ],
  };

  const datosEquipo = {
    titulo: '2. Datos del equipo',
    filas: [
      ['Código de equipo', equipo.codigo],
      ['Código de almacén', equipo.codigo_almacen || '—'],
      ['Tipo', equipo.tipo_nombre],
      ['Marca / Modelo', [equipo.marca || '—', equipo.modelo].filter(Boolean).join(' ')],
      ['Número de serie', equipo.serie || '—'],
      ...(esEntrega
        ? [
            ['Condición de entrega', asignacion.condicion_entrega || 'Operativo'],
            ['Fecha de entrega', fecha],
          ]
        : []),
    ],
  };

  const secciones = [persona, datosEquipo];

  if (!esEntrega) {
    secciones.push({
      titulo: '3. Datos de la devolución',
      filas: [
        ['Condición de devolución', asignacion.condicion_devolucion || '—'],
        ['Motivo', MOTIVOS_CIERRE[asignacion.motivo_cierre] || asignacion.motivo_cierre || '—'],
        ['Estado del equipo a la fecha de emisión', ESTADOS_FISICO_EQUIPO[equipo.estado]?.label ?? equipo.estado],
        ['Fecha de devolución', fecha],
      ],
    });
  }

  return {
    tipo,
    titulo: TITULO_ACTA[tipo],
    rotulo: esEntrega ? 'ACTA DE ENTREGA' : 'ACTA DE DEVOLUCIÓN',
    fecha,
    secciones,
    accesorios: lineasAccesorios(equipo),
    etiquetaAccesorios: esEntrega ? 'Accesorios entregados' : 'Accesorios devueltos',
    clausula: esEntrega ? CLAUSULA_ENTREGA : CLAUSULA_DEVOLUCION,
    // Entrega: firma TI primero y recibe el empleado; devolución, al revés
    // (mismo orden que las actas anteriores).
    firmas: esEntrega
      ? [{ rol: 'Entrega — Área de TI' }, { rol: 'Recibe conforme', nombre, dni: empleado.dni }]
      : [{ rol: 'Entrega conforme', nombre, dni: empleado.dni }, { rol: 'Recibe — Área de TI' }],
  };
}
