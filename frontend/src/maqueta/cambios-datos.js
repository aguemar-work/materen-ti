// Datos inventados de los Cambios y los Servicios del modo "maqueta" (migración 107).
// El catálogo de servicios es ESPEJO de la siembra del SQL (10 servicios de la 107
// más los 2 de la 116, mismos ids y nombres: tests/maqueta-cambios.test.js los compara). Los cambios cubren
// todos los estados a la vista: uno por aprobar, una emergencia ejecutada sin
// aprobación con el plazo de 48 h vencido (el aviso del listado), uno en ejecución,
// un estándar preautorizado, uno cerrado, uno rechazado, uno revertido y un borrador.
import { calcularVistasCambios } from './rpc-cambios.js';

// [id, nombre, descripcion, criticidad, horario, dueno_user_id]
const SERVICIOS = [
  ['correo', 'Correo corporativo', 'Buzones de la empresa y cuentas compartidas.', 'alta', '24 x 7', 'u-jefe'],
  ['bitrix24', 'Bitrix24', 'Gestión de tareas y comunicación interna.', 'alta', '24 x 7', 'u-asis-1'],
  ['vpn', 'VPN y acceso remoto', 'Conexión de las obras y del personal remoto a la red.', 'alta', '24 x 7', 'u-asis-2'],
  ['erp', 'ERP', 'Sistema de gestión administrativa y contable.', 'critica', 'Horario laboral', 'u-jefe'],
  ['red', 'Internet y red', 'Red local, Wi-Fi, enlaces de internet y equipos de red.', 'critica', '24 x 7', 'u-asis-1'],
  ['equipos', 'Equipos de cómputo', 'Laptops, desktops, monitores, celulares y tablets.', 'media', 'Horario laboral', 'u-asis-2'],
  ['impresion', 'Impresión', 'Impresoras, multifuncionales y suministros.', 'baja', 'Horario laboral', null],
  ['telefonia', 'Telefonía', 'Líneas fijas, anexos y telefonía móvil corporativa.', 'media', 'Horario laboral', null],
  ['licencias', 'Licencias de software', 'Software con licencia: diseño, ofimática y utilitarios.', 'media', 'Horario laboral', 'u-asis-1'],
  ['accesos', 'Accesos y cuentas', 'Altas, bajas y permisos de las cuentas de los sistemas.', 'alta', 'Horario laboral', 'u-jefe'],
  // Los dos que crea la migración 116 para las categorías nuevas (Seguridad y CCTV).
  ['seguridad', 'Seguridad de la información', 'Antivirus, correos sospechosos, pérdida o robo de equipos y respaldos.', 'alta', 'Horario laboral', null],
  ['cctv', 'Videovigilancia', 'Cámaras de seguridad de sedes y obras: visualización y grabaciones.', 'media', 'Horario laboral', null],
];

// Transiciones de la migración (14 filas): espejo, también de core/dominio-cambios.js.
const TODOS = ['estandar', 'normal', 'emergencia'];
const WHITELIST = [
  ['borrador', 'solicitado', TODOS, false], ['borrador', 'aprobado', ['estandar'], false],
  ['borrador', 'en_ejecucion', ['emergencia'], false], ['borrador', 'cancelado', TODOS, false],
  ['solicitado', 'aprobado', TODOS, true], ['solicitado', 'rechazado', TODOS, true],
  ['solicitado', 'en_ejecucion', ['emergencia'], false], ['solicitado', 'cancelado', TODOS, false],
  ['aprobado', 'en_ejecucion', TODOS, false], ['aprobado', 'cancelado', TODOS, false],
  ['en_ejecucion', 'implementado', TODOS, false], ['en_ejecucion', 'revertido', TODOS, false],
  ['implementado', 'cerrado', TODOS, false], ['implementado', 'revertido', TODOS, false],
];

const JEFE = { user_id: 'u-jefe', user_email: 'jefe@materen.pe' };
const DIEGO = { user_id: 'u-asis-1', user_email: 'dhuaman@materen.pe' };

/** @param {(dias?: number, horas?: number) => string} hace marca ISO relativa a hoy */
export function crearDatosCambios(hace) {
  const servicios = SERVICIOS.map(([id, nombre, descripcion, criticidad, horario, dueno]) => ({
    id, nombre, descripcion, dueno_user_id: dueno, criticidad, horario, created_at: hace(300), updated_at: hace(300), deleted_at: null,
  }));

  const cambios = [];
  const cambio_eventos = [];
  const cambio_tickets = [];
  let orden = 0;

  function cambio(n, campos, libro) {
    const c = {
      id: `chg${String(n).padStart(2, '0')}`, codigo: `CHG-${String(n).padStart(4, '0')}`,
      plan_retroceso: null, ventana_inicio: null, ventana_fin: null, solicitado_por: DIEGO.user_id, solicitado_at: null,
      aprobado_por: null, aprobado_at: null, aprobacion_pendiente_hasta: null, inicio_real_at: null, fin_real_at: null, resultado: null,
      ...campos,
    };
    cambios.push(c);
    // libro: [evento, desde, hasta, autor, detalle, dias, horas]
    for (const [ev, desde, hasta, autor, detalle, dias, horas = 0] of libro) {
      orden += 1;
      cambio_eventos.push({
        id: `${c.id}-e${orden}`, orden, cambio_id: c.id, evento: ev, estado_anterior: desde, estado_nuevo: hasta,
        user_id: autor.user_id, user_email: autor.user_email, rol_actor: autor === JEFE ? 'jefe' : 'tecnico',
        detalle: detalle || null, created_at: hace(dias, horas),
      });
    }
    return c;
  }

  cambio(1, {
    titulo: 'Reemplazo del router principal de la sede', tipo: 'normal', riesgo: 'medio', servicio_id: 'red',
    descripcion: 'El router actual no recibe actualizaciones. Se reemplaza por uno nuevo con la misma configuración.\nSe hace fuera de horario.',
    plan_retroceso: 'Volver a conectar el router anterior (queda en la sede) y restaurar su configuración guardada.',
    ventana_inicio: hace(21, 2), ventana_fin: hace(21), estado: 'cerrado', solicitado_at: hace(24),
    aprobado_por: JEFE.user_id, aprobado_at: hace(23), inicio_real_at: hace(21, 2), fin_real_at: hace(21),
    resultado: 'Router cambiado sin incidentes; la red quedó estable.', created_at: hace(25), updated_at: hace(20),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo medio', 25],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 24],
    ['aprobado', 'solicitado', 'aprobado', JEFE, 'Autorizado', 23],
    ['iniciado', 'aprobado', 'en_ejecucion', DIEGO, null, 21, 2],
    ['implementado', 'en_ejecucion', 'implementado', DIEGO, 'Router cambiado sin incidentes; la red quedó estable.', 21],
    ['cerrado', 'implementado', 'cerrado', JEFE, null, 20],
  ]);
  cambio_tickets.push({ cambio_id: 'chg01', ticket_id: 't107', vinculado_por: DIEGO.user_id, created_at: hace(24) });

  cambio(2, {
    titulo: 'Rotación mensual de respaldos', tipo: 'estandar', riesgo: 'bajo', servicio_id: 'equipos',
    descripcion: 'Rotación de los discos de respaldo del almacén según el calendario mensual.',
    ventana_inicio: hace(-1, -2), ventana_fin: hace(-1, -3), estado: 'aprobado', solicitado_at: hace(1),
    created_at: hace(1), updated_at: hace(1),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio estandar · riesgo bajo', 1],
    ['aprobado', 'borrador', 'aprobado', DIEGO, 'Cambio estándar: preautorizado, sin aprobación de un jefe.', 1],
  ]);

  cambio(3, {
    titulo: 'Actualización del ERP a la versión 14', tipo: 'normal', riesgo: 'alto', servicio_id: 'erp',
    descripcion: 'El proveedor entrega la versión 14 con correcciones de seguridad. Se prueba antes en el ambiente de pruebas.',
    plan_retroceso: 'Restaurar la copia completa de la base y de la aplicación tomada antes de empezar.',
    ventana_inicio: hace(-5), ventana_fin: hace(-5, -4), estado: 'solicitado', solicitado_at: hace(2),
    created_at: hace(3), updated_at: hace(2),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo alto', 3],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 2],
  ]);

  cambio(4, {
    titulo: 'Reinicio del concentrador VPN por caída', tipo: 'emergencia', riesgo: 'alto', servicio_id: 'vpn',
    descripcion: 'Las obras perdieron conexión remota a las 7:40. Se reinicia el concentrador VPN fuera de ventana.',
    plan_retroceso: 'Si el concentrador no levanta, activar el enlace de respaldo por el router de la sede.',
    estado: 'implementado', solicitado_at: hace(3, 2), aprobacion_pendiente_hasta: hace(1, 2),
    inicio_real_at: hace(3, 1), fin_real_at: hace(3), resultado: 'Concentrador reiniciado; la VPN respondió en 5 minutos.',
    created_at: hace(3, 3), updated_at: hace(3),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio emergencia · riesgo alto', 3, 3],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 3, 2],
    ['iniciado', 'solicitado', 'en_ejecucion', DIEGO, 'Emergencia sin aprobación previa: un jefe debe aprobarla en 48 horas.', 3, 1],
    ['implementado', 'en_ejecucion', 'implementado', DIEGO, 'Concentrador reiniciado; la VPN respondió en 5 minutos.', 3],
  ]);
  cambio_tickets.push({ cambio_id: 'chg04', ticket_id: 't112', vinculado_por: DIEGO.user_id, created_at: hace(3, 2) });

  cambio(5, {
    titulo: 'Migración de buzones al nuevo dominio', tipo: 'normal', riesgo: 'medio', servicio_id: 'correo',
    descripcion: 'Se mueven los buzones al dominio nuevo y se actualizan los alias.',
    plan_retroceso: 'Revertir los alias al dominio anterior; los buzones originales se conservan 7 días.',
    ventana_inicio: hace(0, 1), ventana_fin: hace(-0.2), estado: 'en_ejecucion', solicitado_at: hace(4),
    aprobado_por: JEFE.user_id, aprobado_at: hace(3), inicio_real_at: hace(0, 1), created_at: hace(5), updated_at: hace(0, 1),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo medio', 5],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 4],
    ['aprobado', 'solicitado', 'aprobado', JEFE, null, 3],
    ['iniciado', 'aprobado', 'en_ejecucion', DIEGO, null, 0, 1],
  ]);

  cambio(6, {
    titulo: 'Cambio del servidor de impresión', tipo: 'normal', riesgo: 'bajo', servicio_id: 'impresion',
    descripcion: 'Reemplazar el servidor de impresión antiguo.',
    plan_retroceso: 'Reinstalar el servidor anterior.', ventana_inicio: hace(-9), ventana_fin: hace(-9, -1), estado: 'rechazado',
    solicitado_at: hace(8), resultado: 'La ventana coincide con el cierre contable; proponer otra fecha.', created_at: hace(9), updated_at: hace(7),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo bajo', 9],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 8],
    ['rechazado', 'solicitado', 'rechazado', JEFE, 'La ventana coincide con el cierre contable; proponer otra fecha.', 7],
  ]);

  cambio(7, {
    titulo: 'Renovación del servidor de licencias', tipo: 'normal', riesgo: 'medio', servicio_id: 'licencias',
    descripcion: 'Preparar el reemplazo del servidor que reparte las licencias de diseño.', estado: 'borrador',
    created_at: hace(1), updated_at: hace(1),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo medio', 1],
  ]);

  cambio(8, {
    titulo: 'Segmentación de la red de obra', tipo: 'normal', riesgo: 'alto', servicio_id: 'red',
    descripcion: 'Separar la red de cámaras de la red de oficinas con VLAN.',
    plan_retroceso: 'Quitar las VLAN y volver a la configuración de puertos anterior.',
    ventana_inicio: hace(13, 4), ventana_fin: hace(13, 1), estado: 'revertido', solicitado_at: hace(16),
    aprobado_por: JEFE.user_id, aprobado_at: hace(15), inicio_real_at: hace(13, 4), fin_real_at: hace(13, 2),
    resultado: 'Las oficinas perdieron acceso a la impresora de red; se volvió a la configuración anterior.', created_at: hace(17), updated_at: hace(13),
  }, [
    ['creado', null, 'borrador', DIEGO, 'Cambio normal · riesgo alto', 17],
    ['solicitado', 'borrador', 'solicitado', DIEGO, null, 16],
    ['aprobado', 'solicitado', 'aprobado', JEFE, null, 15],
    ['iniciado', 'aprobado', 'en_ejecucion', DIEGO, null, 13, 4],
    ['revertido', 'en_ejecucion', 'revertido', DIEGO, 'Las oficinas perdieron acceso a la impresora de red; se volvió a la configuración anterior.', 13, 2],
  ]);

  const transiciones_cambio_permitidas = WHITELIST.map(([origen, destino, tipos, solo_jefe]) => ({ origen, destino, tipos, solo_jefe }));
  return { servicios, cambios, cambio_eventos, cambio_tickets, transiciones_cambio_permitidas, ...calcularVistasCambios(cambios, servicios) };
}
