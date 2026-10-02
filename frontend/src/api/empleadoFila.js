// Fila de `empleados` a partir de los datos de un formulario (EmpleadoForm y el
// alta de Solicitudes): normaliza nombres, DNI y teléfonos igual en los dos
// caminos. Vive en su propio archivo porque la leen dos dominios de la capa de
// datos (empleados.js y solicitudes.js) y entre ellos no puede haber import
// circular.
import { toTitleCase, toLower, normalizarTelefono, onlyDigits, trimText } from '../core/formatters.js';

export function empleadoToRow(datos) {
  // "notas" volvió al formulario (UX4-26, docs/HISTORIAL-AUDITORIAS.md Ciclo 4):
  // se mostraba en la ficha sin ningún control de edición.
  // ubicacion_id (migración 059): independiente de area_obra_id, sin
  // derivarse ni sincronizarse con ella.
  return {
    nombres:         toTitleCase(datos.nombres),
    apellidos:       toTitleCase(datos.apellidos),
    dni:             onlyDigits(datos.dni),
    empresa_id:      datos.empresa_id,
    area_obra_id:    datos.area_obra_id || null,
    ubicacion_id:    datos.ubicacion_id || null,
    estado:          datos.estado,
    fecha_alta:      datos.fecha_alta,
    telefono:        normalizarTelefono(datos.telefono),
    whatsapp:        normalizarTelefono(datos.whatsapp),
    correo_personal: toLower(datos.correo_personal),
    cargo:           toTitleCase(datos.cargo),
    notas:           trimText(datos.notas),
  };
}
