// Capa única de traducción de errores de la base (PostgREST/Postgres) y de
// la red a texto para el usuario. Hasta el Ciclo 21 solo se mapeaba 23505 +
// un índice; el resto llegaba crudo a los formularios y toasts (`e?.message`
// en ~149 sitios): triggers (P0001), RLS (42501), llaves foráneas (23503),
// CHECK (23514) y PGRST*. Ver docs/auditorias/ciclo-21/anexos/E-frontend.md §6.
//
// Contrato:
//   traducirErrorDb(error, { entidad, porDefecto }) → { mensaje, tipo, codigo, restriccion }
//   · tipo: 'permiso' | 'validacion' | 'conflicto' | 'no_encontrado' | 'red' |
//           'sesion' | 'desconocido'
//   · codigo: SQLSTATE / código PGRST (o null)
//   · restriccion: nombre de la restricción violada cuando se pudo extraer
//     (permite a un formulario enfocar el campo sin leer el texto crudo)
//   · Nunca devuelve texto crudo en inglés de PostgREST: si el mensaje no es
//     legible en español, cae a `porDefecto` ("No se pudo completar la
//     operación.").
//   · P0001 (RAISE EXCEPTION de los triggers del proyecto, ya en español) pasa
//     tal cual: varias pantallas dependen de ese texto.
//
// `anotarErrorDb(e, opciones)` es lo que usan stores y composables: devuelve
// el MISMO error si su mensaje ya era el traducido, o un `Error` nuevo con el
// mensaje traducido y `code`/`tipo`/`restriccion`/`original` adjuntos. Así el
// `e?.message` que ya leen las vistas muestra el texto correcto sin tocarlas.
import { esErrorRed } from '../core/error-red.js';

export const MENSAJE_SIN_PERMISO = 'No tiene permiso para esta acción.';
export const MENSAJE_SESION_EXPIRADA = 'La sesión expiró. Vuelva a iniciar sesión.';
export const MENSAJE_SIN_CONEXION = 'Sin conexión con el servidor.';
export const MENSAJE_GENERICO = 'No se pudo completar la operación.';

// 23505 (único) y 23514 (CHECK): nombre de restricción → texto. Se busca el
// nombre dentro del mensaje/detalle del error, el más largo primero (para que
// `uq_equipos_codigo_almacen` no lo capture `equipos_codigo_key`).
// `asignaciones_equipo_una_activa` aún no existe en la base (propuesta del
// plan de mejora, migración futura): se deja listo para cuando exista.
export const UNICOS = {
  uq_cuentas_usuario_plataforma:
    'Ya existe una cuenta registrada con este usuario en esta plataforma. Búsquela en Correos o en la ficha del empleado en vez de crear una nueva.',
  uq_cuentas_empleado_plataforma: 'El empleado ya tiene una cuenta en esa plataforma.',
  empleados_dni_key: 'Ya existe un empleado con ese DNI.',
  equipos_codigo_key: 'Ya existe un equipo con ese código.',
  uq_equipos_serie: 'Ya existe un equipo con ese número de serie.',
  uq_equipos_codigo_almacen: 'Ya existe un equipo con ese código de almacén.',
  uq_catalogo_almacen_codigo: 'Ya existe un registro con ese código de almacén.',
  asignaciones_equipo_una_activa: 'El equipo ya tiene un portador activo.',
  problema_tickets_problema_id_ticket_id_key: 'El ticket ya está vinculado a este problema.',
  entregas_token_hash_unique: 'Ya existe una entrega con ese enlace.',
  idx_entregas_token_hash: 'Ya existe una entrega con ese enlace.',
  solicitudes_una_abierta_por_tipo: 'Ya hay una solicitud abierta de ese tipo para esta persona.',
  solicitudes_ticket_unico: 'El ticket ya tiene una solicitud vinculada.',
  kb_articulos_workaround_por_problema: 'El problema ya tiene un artículo de workaround.',
  servicios_nombre_unico: 'Ya existe un servicio con ese nombre.',
  servicios_pkey: 'Ya existe un servicio con ese identificador.',
  cambio_tickets_pkey: 'El ticket ya está enlazado a este cambio.',
};

// 23514 (CHECK).
export const CHEQUEOS = {
  cuentas_password_formato_cifrado: 'La contraseña no llegó cifrada. Vuelva a intentarlo.',
  licencias_clave_formato_cifrado: 'La clave no llegó cifrada. Vuelva a intentarlo.',
  accesos_sensibles_password_formato_cifrado: 'La contraseña no llegó cifrada. Vuelva a intentarlo.',
  equipos_fotos_max: 'Un equipo admite hasta 4 fotos.',
  chk_asig_equipo_destino: 'La asignación debe tener un destino válido.',
  problemas_workaround_largo: 'El workaround no puede superar los 5000 caracteres.',
  kb_articulos_tipo_check: 'El tipo de artículo no es válido.',
  cambios_plan_retroceso_obligatorio: 'Un cambio necesita un plan de retroceso (salvo el estándar).',
  cambios_ventana_obligatoria: 'Indique la ventana de ejecución del cambio (inicio y fin).',
  cambios_ventana_coherente: 'La ventana de ejecución no es válida: indique inicio y fin, y que el fin sea posterior al inicio.',
};

export const CONSTRAINTS = { ...UNICOS, ...CHEQUEOS };

const CONSTRAINTS_POR_LARGO = Object.keys(CONSTRAINTS).sort((a, b) => b.length - a.length);

// Textos típicos de PostgREST/Postgres/fetch en inglés. Un mensaje sin código
// que los contenga no se muestra: se reemplaza por el genérico.
const INGLES_CRUDO =
  /\b(violates|constraint|duplicate key|permission denied|row-level security|null value|syntax error|invalid input|does not exist|already exists|could not|cannot|failed|unauthorized|forbidden|bad request|bad gateway|not found|internal server error|timed? ?out|request failed|jwt|relation|column|unexpected|undefined|schema cache)\b/i;

// Código técnico de Postgres (SQLSTATE de 5 caracteres) o de PostgREST. Los
// códigos de las edge functions son minúsculas con guion bajo (`no_existe`).
const CODIGO_TECNICO = /^(PGRST\d+|[0-9A-Z]{5})$/;

function textoDe(error) {
  return [error?.message, error?.details, error?.hint].filter((t) => typeof t === 'string').join(' | ');
}

function restriccionDe(error) {
  const texto = textoDe(error);
  return CONSTRAINTS_POR_LARGO.find((nombre) => texto.includes(nombre)) || null;
}

function esLegible(texto) {
  const t = String(texto || '').trim();
  return t.length > 0 && !INGLES_CRUDO.test(t);
}

function estadoHttp(error) {
  const s = error?.statusCode ?? error?.status;
  return typeof s === 'number' ? s : null;
}

export function traducirErrorDb(error, { entidad, porDefecto = MENSAJE_GENERICO } = {}) {
  const codigo = typeof error?.code === 'string' ? error.code : null;
  const estado = estadoHttp(error);
  const resultado = (mensaje, tipo, restriccion = null) => ({ mensaje, tipo, codigo, restriccion });

  // Ya pasó por anotarErrorDb (store o composable): su mensaje está traducido
  // y re-traducirlo con el `code` original perdería el detalle (p. ej. qué
  // restricción se violó).
  if (error?.tipo && error?.original !== undefined) {
    return { mensaje: error.message, tipo: error.tipo, codigo, restriccion: error.restriccion ?? null };
  }

  // Transporte: ni siquiera llegó al servidor (core/error-red.js decide).
  if (esErrorRed(error)) return resultado(MENSAJE_SIN_CONEXION, 'red');

  // Sesión vencida o inválida.
  if (
    codigo === 'PGRST301' ||
    codigo === 'PGRST303' ||
    estado === 401 ||
    /jwt expired/i.test(error?.message || '')
  ) {
    return resultado(MENSAJE_SESION_EXPIRADA, 'sesion');
  }

  switch (codigo) {
    case '42501':
      return resultado(MENSAJE_SIN_PERMISO, 'permiso');

    case 'P0001': {
      // RAISE EXCEPTION de los triggers del proyecto: ya está en español.
      const texto = String(error?.message || '').trim();
      return resultado(texto || porDefecto, 'validacion');
    }

    case 'P0002':
      return resultado('El registro ya no existe.', 'no_encontrado');

    case 'PGRST116':
      return resultado('No se encontró el registro.', 'no_encontrado');

    case '23505': {
      const restriccion = restriccionDe(error);
      if (restriccion) return resultado(CONSTRAINTS[restriccion], 'conflicto', restriccion);
      return resultado(
        entidad ? `Ya existe un registro de ${entidad} con esos datos.` : 'Ya existe un registro con esos datos.',
        'conflicto',
      );
    }

    case '23503': {
      // Borrar/actualizar algo que otras filas referencian vs. insertar/
      // actualizar apuntando a algo que ya no existe.
      const texto = textoDe(error);
      if (/still referenced|update or delete on table/i.test(texto)) {
        return resultado('No se puede eliminar: tiene registros relacionados.', 'conflicto');
      }
      return resultado('El elemento relacionado ya no existe.', 'conflicto');
    }

    case '23514': {
      const restriccion = restriccionDe(error);
      if (restriccion) return resultado(CONSTRAINTS[restriccion], 'validacion', restriccion);
      return resultado('Los datos no cumplen una regla del sistema.', 'validacion');
    }

    case '23502':
      return resultado('Falta completar un dato obligatorio.', 'validacion');
    case '22001':
      return resultado('Un valor es demasiado largo.', 'validacion');
    case '22P02':
      return resultado('Un valor no tiene el formato esperado.', 'validacion');

    default:
  }

  if (estado === 403) return resultado(MENSAJE_SIN_PERMISO, 'permiso');

  // Cualquier otro: el mensaje original solo si es legible en español. Con un
  // código técnico sin mapear el mensaje es siempre inglés de Postgres: no se
  // arriesga, genérico.
  // Sin código pero con el nombre de una restricción conocida en el texto
  // (p. ej. un error ya envuelto por la capa de datos): se traduce igual.
  const restriccion = restriccionDe(error);
  if (restriccion) {
    return resultado(CONSTRAINTS[restriccion], restriccion in CHEQUEOS ? 'validacion' : 'conflicto', restriccion);
  }

  if (!(codigo && CODIGO_TECNICO.test(codigo)) && esLegible(error?.message)) {
    return resultado(String(error.message).trim(), 'desconocido');
  }
  return resultado(porDefecto, 'desconocido');
}

// Para stores y composables que relanzan: ver encabezado.
export function anotarErrorDb(error, opciones = {}) {
  if (error?.tipo && error?.original !== undefined) return error; // ya anotado
  const t = traducirErrorDb(error, opciones);
  if (error instanceof Error && error.message === t.mensaje) return error;
  const e = new Error(t.mensaje);
  e.code = t.codigo ?? error?.code;
  e.tipo = t.tipo;
  e.restriccion = t.restriccion;
  e.original = error;
  if (error?.details !== undefined) e.details = error.details;
  return e;
}

// El índice único uq_cuentas_usuario_plataforma (migración 039) evita
// registrar el mismo usuario/correo dos veces en la misma plataforma.
// Se conserva por compatibilidad con api/domains/{correos,cuentas}.js; la
// traducción general ya lo cubre en CONSTRAINTS.
export function mensajeSiUsuarioDuplicado(error) {
  if (error?.code !== '23505') return null;
  if (!String(error?.message || '').includes('uq_cuentas_usuario_plataforma')) return null;
  return CONSTRAINTS.uq_cuentas_usuario_plataforma;
}
