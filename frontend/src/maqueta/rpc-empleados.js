// RPC simuladas de la maqueta para el ciclo de vida del empleado y las cuentas
// (migraciones 101 y 102). Cada función recibe la base en memoria y los
// argumentos NOMBRADOS (`p_...`), muta la base y devuelve la fila, igual que
// la RPC real. Los rechazos de negocio se lanzan con el mismo SQLSTATE y el
// mismo texto en español (el cliente falso los convierte en `{ error }`), así
// la UI puede probarse con sus mensajes de error reales.
//
// Todo es inventado: ningún dato sale de esta sesión (recargar la página
// devuelve los datos iniciales).
import { autocompletarPaso, crearSolicitudBaja, crearSolicitudNucleo } from './rpc-solicitudes.js';

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let secuencia = 0;
const idNuevo = (prefijo) => `maq-${prefijo}-${Date.now().toString(36)}-${(secuencia += 1)}`;

function rechazar(code, message) {
  throw Object.assign(new Error(message), { code });
}

// El actor de la maqueta es el JEFE ficticio (maqueta/client.js → auth).
const ACTOR = { user_id: 'u-jefe', user_email: 'jefe@materen.pe', rol_actor: 'jefe' };

function registrarEvento(db, empleado_id, evento, extra = {}) {
  db.empleado_eventos.push({
    id: idNuevo('eev'),
    empleado_id,
    evento,
    campo: null,
    valor_anterior: null,
    valor_nuevo: null,
    detalle: null,
    ...ACTOR,
    created_at: new Date().toISOString(),
    ...extra,
  });
}

function empleadoPorId(db, id, { incluirEliminados = false } = {}) {
  const e = db.empleados.find((x) => x.id === id && (incluirEliminados || !x.deleted_at));
  if (!e) rechazar('P0001', 'Empleado no encontrado');
  return e;
}

function nombreDe(db, tabla, id) {
  return db[tabla]?.find((x) => x.id === id)?.nombre ?? null;
}

// Cierra las asignaciones de cuenta abiertas de un empleado con la regla de la
// baja: personal → cuenta eliminada; reutilizable/compartida → rotación pendiente.
function cerrarCuentasDe(db, empleado_id, notas) {
  const hoy = hoyISO();
  for (const a of db.asignaciones_cuenta.filter((x) => x.empleado_id === empleado_id && !x.fecha_fin)) {
    const cuenta = db.cuentas.find((c) => c.id === a.cuenta_id);
    a.fecha_fin = hoy;
    a.notas = a.notas || notas;
    if (!cuenta) continue;
    if (cuenta.tipo_cuenta === 'personal') cuenta.deleted_at = new Date().toISOString();
    else cuenta.requiere_rotacion = true;
  }
}

function validarMotivo(motivo, { obligatorio, accion }) {
  const m = String(motivo ?? '').trim();
  if (!m && obligatorio) rechazar('P0001', `El motivo de la ${accion} es obligatorio.`);
  if (m.length > 500) rechazar('P0001', 'El motivo no puede superar los 500 caracteres.');
  return m || null;
}

export const RPC_EMPLEADOS = {
  // ── Cuentas (migración 101) ───────────────────────────────────────────────
  crear_cuenta_asignada: (db, a = {}) => {
    const emp = empleadoPorId(db, a.p_empleado_id);
    if (emp.estado === 'Inactivo') {
      rechazar('P0001', 'El empleado está dado de baja. No se le pueden asignar cuentas.');
    }
    const usuario = String(a.p_usuario ?? '').trim().toLowerCase();
    if (!usuario) rechazar('P0001', 'El usuario de la cuenta es obligatorio.');
    const tipo = a.p_tipo_cuenta || 'personal';
    if (!['personal', 'reutilizable', 'compartida'].includes(tipo)) rechazar('P0001', 'El tipo de cuenta no es válido.');
    if (a.p_password_cifrada && !/^enc2?:/.test(a.p_password_cifrada)) {
      rechazar('P0001', 'La contraseña debe llegar cifrada. Vuelva a intentarlo.');
    }
    if (!db.plataformas.some((p) => p.id === a.p_plataforma_id && !p.deleted_at)) rechazar('P0002', 'La plataforma no existe.');
    if (db.cuentas.some((c) => !c.deleted_at && c.plataforma_id === a.p_plataforma_id && c.usuario === usuario)) {
      rechazar('23505', 'duplicate key value violates unique constraint "uq_cuentas_usuario_plataforma"');
    }
    const ahora = new Date().toISOString();
    const cuenta = {
      id: idNuevo('c'),
      plataforma_id: a.p_plataforma_id,
      usuario,
      tipo_cuenta: tipo,
      password: a.p_password_cifrada || null,
      url: a.p_url || '',
      notas: a.p_notas || '',
      last_password_change: a.p_password_cifrada ? ahora : null,
      requiere_rotacion: false,
      deleted_at: null,
      created_at: ahora,
    };
    db.cuentas.push(cuenta);
    const asignacion = {
      id: idNuevo('ac'),
      cuenta_id: cuenta.id,
      empleado_id: emp.id,
      fecha_inicio: hoyISO(),
      fecha_fin: null,
      notas: null,
      created_at: ahora,
    };
    db.asignaciones_cuenta.push(asignacion);
    // Trigger de la 108: asignar una cuenta marca el paso de la solicitud abierta.
    autocompletarPaso(db, { empleadoId: emp.id, clave: 'crear_cuenta', referenciaId: asignacion.id });
    return asignacion;
  },

  traspasar_cuenta: (db, a = {}) => {
    const asig = db.asignaciones_cuenta.find((x) => x.id === a.p_asignacion_id);
    if (!asig) rechazar('P0002', 'La asignación no existe.');
    if (asig.fecha_fin) rechazar('P0001', 'La asignación ya está cerrada.');
    const cuenta = db.cuentas.find((c) => c.id === asig.cuenta_id);
    if (!cuenta || cuenta.deleted_at) rechazar('P0001', 'La cuenta está eliminada.');
    if (cuenta.tipo_cuenta === 'personal') {
      rechazar('P0001', 'Una cuenta personal no se traspasa: revóquela y cree una nueva para el otro empleado.');
    }
    if (a.p_nuevo_empleado_id === asig.empleado_id) rechazar('P0001', 'La cuenta ya está asignada a ese empleado.');
    const destino = db.empleados.find((e) => e.id === a.p_nuevo_empleado_id && !e.deleted_at);
    if (!destino) rechazar('P0002', 'El empleado destino no existe.');
    if (destino.estado !== 'Activo') rechazar('P0001', 'El empleado destino no está activo.');
    if (a.p_password_cifrada && !/^enc2?:/.test(a.p_password_cifrada)) {
      rechazar('P0001', 'La contraseña debe llegar cifrada. Vuelva a intentarlo.');
    }
    const hoy = hoyISO();
    asig.fecha_fin = hoy;
    asig.notas = String(a.p_notas ?? '').trim() || 'Traspaso a otro empleado';
    // El trigger del cierre marca la rotación; una contraseña nueva la limpia.
    cuenta.requiere_rotacion = true;
    if (a.p_password_cifrada) {
      cuenta.password = a.p_password_cifrada;
      cuenta.last_password_change = new Date().toISOString();
      cuenta.requiere_rotacion = false;
    }
    const nueva = {
      id: idNuevo('ac'),
      cuenta_id: cuenta.id,
      empleado_id: destino.id,
      fecha_inicio: hoy,
      fecha_fin: null,
      notas: null,
      created_at: new Date().toISOString(),
    };
    db.asignaciones_cuenta.push(nueva);
    autocompletarPaso(db, { empleadoId: destino.id, clave: 'crear_cuenta', referenciaId: nueva.id });
    // Una contraseña nueva limpia la rotación: marca el paso de rotar ESA cuenta.
    if (a.p_password_cifrada) autocompletarPaso(db, { clave: 'rotar_contrasenas', objetivoId: cuenta.id, referenciaId: cuenta.id });
    return nueva;
  },

  cerrar_asignacion_cuenta: (db, a = {}) => {
    const asig = db.asignaciones_cuenta.find((x) => x.id === a.p_asignacion_id);
    if (!asig) rechazar('P0002', 'La asignación no existe.');
    if (asig.fecha_fin) return asig;
    asig.fecha_fin = hoyISO();
    const nota = String(a.p_notas ?? '').trim();
    if (nota) asig.notas = nota;
    const cuenta = db.cuentas.find((c) => c.id === asig.cuenta_id);
    if (cuenta && cuenta.tipo_cuenta !== 'personal') cuenta.requiere_rotacion = true;
    return asig;
  },

  revocar_cuenta_personal: (db, a = {}) => {
    const asig = db.asignaciones_cuenta.find((x) => x.id === a.p_asignacion_id);
    if (!asig) rechazar('P0002', 'La asignación no existe.');
    if (!asig.fecha_fin) asig.fecha_fin = hoyISO();
    const cuenta = db.cuentas.find((c) => c.id === asig.cuenta_id);
    if (cuenta) cuenta.deleted_at = new Date().toISOString();
    return null;
  },

  // ── Empleados (migración 102) ─────────────────────────────────────────────
  suspender_empleado: (db, a = {}) => {
    const motivo = validarMotivo(a.p_motivo, { obligatorio: true, accion: 'suspensión' });
    const emp = empleadoPorId(db, a.p_empleado_id);
    if (emp.estado !== 'Activo') {
      rechazar('P0001', `Solo se puede suspender a un empleado Activo (estado actual: ${emp.estado}).`);
    }
    emp.estado = 'Suspendido';
    // Efecto de la suspensión: las cuentas compartidas/reutilizables quedan
    // con la rotación pendiente, sin cerrar ninguna asignación.
    for (const asig of db.asignaciones_cuenta.filter((x) => x.empleado_id === emp.id && !x.fecha_fin)) {
      const cuenta = db.cuentas.find((c) => c.id === asig.cuenta_id);
      if (cuenta && !cuenta.deleted_at && cuenta.tipo_cuenta !== 'personal') cuenta.requiere_rotacion = true;
    }
    registrarEvento(db, emp.id, 'suspendido', {
      campo: 'estado', valor_anterior: 'Activo', valor_nuevo: 'Suspendido', detalle: motivo,
    });
    db.notificaciones.push({
      id: idNuevo('n'),
      tipo: 'empleado_suspendido',
      entidad_tipo: 'empleado',
      entidad_id: emp.id,
      titulo: `Empleado suspendido · ${emp.nombres} ${emp.apellidos}`,
      url_destino: `/empleados/${emp.id}`,
      creado_en: new Date().toISOString(),
    });
    return emp;
  },

  reactivar_empleado: (db, a = {}) => {
    const motivo = validarMotivo(a.p_motivo, { obligatorio: false, accion: 'reactivación' });
    const emp = empleadoPorId(db, a.p_empleado_id, { incluirEliminados: true });
    if (emp.estado === 'Activo' && !emp.deleted_at) rechazar('P0001', 'El empleado ya está Activo.');
    const anterior = emp.estado;
    emp.estado = 'Activo';
    emp.deleted_at = null;
    if (anterior !== 'Activo') {
      registrarEvento(db, emp.id, 'reactivado', {
        campo: 'estado', valor_anterior: anterior, valor_nuevo: 'Activo', detalle: motivo,
      });
    }
    return emp;
  },

  reingresar_empleado: (db, a = {}) => {
    const emp = empleadoPorId(db, a.p_empleado_id);
    if (emp.estado !== 'Inactivo') {
      rechazar('P0001', `Solo se puede reingresar a un empleado Inactivo (estado actual: ${emp.estado}).`);
    }
    const datos = a.p_datos && typeof a.p_datos === 'object' ? a.p_datos : {};
    const cambios = [];
    if ('area_obra_id' in datos) {
      const nueva = datos.area_obra_id || null;
      if (nueva && !db.areas_obras.some((x) => x.id === nueva && !x.deleted_at)) rechazar('P0001', 'El área u obra indicada no existe.');
      if (nueva !== emp.area_obra_id) cambios.push(['area_cambiada', 'area_obra', nombreDe(db, 'areas_obras', emp.area_obra_id), nombreDe(db, 'areas_obras', nueva)]);
      emp.area_obra_id = nueva;
    }
    if ('ubicacion_id' in datos) {
      const nueva = datos.ubicacion_id || null;
      if (nueva && !db.ubicaciones.some((x) => x.id === nueva && !x.deleted_at)) rechazar('P0001', 'La ubicación indicada no existe.');
      if (nueva !== emp.ubicacion_id) cambios.push(['ubicacion_cambiada', 'ubicacion', nombreDe(db, 'ubicaciones', emp.ubicacion_id), nombreDe(db, 'ubicaciones', nueva)]);
      emp.ubicacion_id = nueva;
    }
    if ('empresa_id' in datos) {
      if (!datos.empresa_id) rechazar('P0001', 'La empresa es obligatoria.');
      if (!db.empresas.some((x) => x.id === datos.empresa_id && !x.deleted_at)) rechazar('P0001', 'La empresa indicada no existe.');
      if (datos.empresa_id !== emp.empresa_id) cambios.push(['empresa_cambiada', 'empresa', nombreDe(db, 'empresas', emp.empresa_id), nombreDe(db, 'empresas', datos.empresa_id)]);
      emp.empresa_id = datos.empresa_id;
    }
    if ('cargo' in datos) {
      const nuevo = String(datos.cargo ?? '').trim() || null;
      if (nuevo !== (emp.cargo || null)) cambios.push(['cargo_cambiado', 'cargo', emp.cargo || null, nuevo]);
      emp.cargo = nuevo;
    }
    const anteriorAlta = emp.fecha_alta;
    emp.estado = 'Activo';
    emp.fecha_alta = hoyISO();
    for (const [evento, campo, anterior, nuevo] of cambios) {
      registrarEvento(db, emp.id, evento, { campo, valor_anterior: anterior, valor_nuevo: nuevo });
    }
    registrarEvento(db, emp.id, 'reingreso', {
      campo: 'estado', valor_anterior: 'Inactivo', valor_nuevo: 'Activo',
      detalle: `Reingreso; fecha de alta ${anteriorAlta} → ${emp.fecha_alta}`,
    });
    // Trigger de la 108: el reingreso abre su solicitud de alta (si no hay una abierta).
    if (!db.solicitudes.some((s) => s.empleado_id === emp.id && s.tipo_id === 'alta_empleado' && s.estado === 'abierta')) {
      crearSolicitudNucleo(db, {
        p_tipo: 'alta_empleado', p_empleado_id: emp.id, p_nota: 'Reingreso del empleado.', p_origen: 'sistema',
      });
    }
    return emp;
  },

  dar_baja_empleado: (db, a = {}) => {
    const motivo = validarMotivo(a.p_motivo, { obligatorio: false, accion: 'baja' });
    const emp = empleadoPorId(db, a.p_empleado_id);
    if (emp.estado === 'Inactivo') rechazar('P0001', 'El empleado ya está dado de baja.');
    const anterior = emp.estado;
    // Lo que la solicitud de baja deja pendiente se reúne ANTES de cerrar nada (108).
    const vigentes = db.asignaciones_cuenta.filter((x) => x.empleado_id === emp.id && !x.fecha_fin)
      .map((x) => ({ asig: x, cuenta: db.cuentas.find((c) => c.id === x.cuenta_id) }))
      .filter((x) => x.cuenta && !x.cuenta.deleted_at);
    const cuentasRotar = vigentes.filter((x) => x.cuenta.tipo_cuenta !== 'personal').map((x) => x.cuenta);
    const personales = vigentes.filter((x) => x.cuenta.tipo_cuenta === 'personal').length;
    const asignaciones = db.asignaciones_equipo.filter((x) => x.empleado_id === emp.id && !x.fecha_fin);
    const nCuentas = db.asignaciones_cuenta.filter((x) => x.empleado_id === emp.id && !x.fecha_fin).length;
    const licenciasAbiertas = db.asignaciones_licencia.filter((x) => x.empleado_id === emp.id && !x.fecha_fin);
    cerrarCuentasDe(db, emp.id, 'Baja del empleado');
    for (const al of licenciasAbiertas) {
      al.fecha_fin = hoyISO();
    }
    emp.estado = 'Inactivo';
    crearSolicitudBaja(db, emp, {
      motivo, cuentasRotar, asignaciones, nCuentas, nLicencias: licenciasAbiertas.length, personales,
    });
    registrarEvento(db, emp.id, 'baja_ejecutada', {
      campo: 'estado', valor_anterior: anterior, valor_nuevo: 'Inactivo', detalle: motivo || 'Baja del empleado',
    });
    db.notificaciones.push({
      id: idNuevo('n'),
      tipo: 'empleado_baja',
      entidad_tipo: 'empleado',
      entidad_id: emp.id,
      titulo: `Baja de empleado: ${emp.nombres} ${emp.apellidos}`,
      url_destino: `/empleados/${emp.id}`,
      creado_en: new Date().toISOString(),
    });
    return emp;
  },

  registrar_revision_accesos: (db, a = {}) => {
    const emp = empleadoPorId(db, a.p_empleado_id);
    const nota = String(a.p_nota ?? '').trim() || null;
    if (nota && nota.length > 1000) rechazar('P0001', 'La nota no puede superar los 1000 caracteres.');
    const resultado = a.p_resultado && typeof a.p_resultado === 'object' ? a.p_resultado : {};
    const fila = {
      id: idNuevo('rev'),
      empleado_id: emp.id,
      revisado_por: ACTOR.user_id,
      revisado_at: new Date().toISOString(),
      resultado,
      nota,
    };
    db.empleado_revisiones_acceso.push(fila);
    // La vista "última revisión" se mantiene a mano: una fila por empleado.
    db.v_empleado_ultima_revision_acceso = db.v_empleado_ultima_revision_acceso.filter((v) => v.empleado_id !== emp.id);
    db.v_empleado_ultima_revision_acceso.push({
      empleado_id: emp.id, revision_id: fila.id, revisado_por: fila.revisado_por,
      revisado_at: fila.revisado_at, resultado: fila.resultado, nota: fila.nota,
    });
    registrarEvento(db, emp.id, 'accesos_revisados', { detalle: nota || 'Revisión de accesos registrada' });
    return fila;
  },
};
