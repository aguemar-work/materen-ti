// Reglas del dominio que sostienen el expediente del empleado: qué acciones
// ofrece cada estado, qué pasos de la guía de alta ve cada rol y el DNI
// enmascarado de lo impreso. Más la maqueta, que simula las RPC con el mismo
// SQLSTATE y el mismo texto que el servidor para poder probar sus errores.
import { describe, it, expect } from 'vitest';
import {
  accionesExpediente,
  pasosAlta,
  pasosAltaVisibles,
  altaLista,
} from '../src/core/dominio-empleados.js';
import { enmascararDni } from '../src/core/formatters.js';
import { iconoNotificacion } from '../src/core/notificacionIconos.js';
import { TABLAS } from '../src/maqueta/datos.js';
import { RPC_EMPLEADOS as RPC } from '../src/maqueta/rpc-empleados.js';

describe('accionesExpediente', () => {
  it('Activo: dar de baja y editar (la sólida); suspender, revisar e imprimir en Más', () => {
    expect(accionesExpediente('Activo')).toEqual({
      botones: ['baja', 'editar'], solida: 'editar', menu: ['suspender', 'revisar', 'imprimir'],
    });
  });

  it('Suspendido: la sólida es Reactivar; dar de baja pasa al menú', () => {
    const a = accionesExpediente('Suspendido');
    expect(a.solida).toBe('reactivar');
    expect(a.botones).toEqual(['editar', 'reactivar']);
    expect(a.menu).toContain('baja');
    expect(a.menu).not.toContain('suspender');
  });

  it('Inactivo: Reingresar es la sólida y Reactivar queda como alternativa', () => {
    const a = accionesExpediente('Inactivo');
    expect(a.solida).toBe('reingresar');
    expect(a.botones).toEqual(['editar', 'reactivar', 'reingresar']);
    expect(a.menu).not.toContain('baja');
    expect(a.menu).not.toContain('suspender');
  });

  it('en cualquier estado hay UNA sola acción sólida y está entre los botones', () => {
    for (const estado of ['Activo', 'Suspendido', 'Inactivo', 'Otro']) {
      const a = accionesExpediente(estado);
      expect(a.botones).toContain(a.solida);
      expect(a.menu).toContain('imprimir');
    }
  });
});

describe('pasosAltaVisibles', () => {
  const pasos = pasosAlta({ cuentas: 1, equipos: 0, licencias: 0, entregaEnviada: false });

  it('con todos los módulos quedan los 4 pasos accionables (sin el registro)', () => {
    expect(pasosAltaVisibles(pasos, () => true).map((p) => p.id)).toEqual(['cuenta', 'entrega', 'equipo', 'licencia']);
  });

  it('sin el módulo de un paso, ese paso no se muestra', () => {
    const solo = (...ok) => (m) => ok.includes(m);
    expect(pasosAltaVisibles(pasos, solo('equipos')).map((p) => p.id)).toEqual(['equipo']);
    expect(pasosAltaVisibles(pasos, solo('correos', 'licencias')).map((p) => p.id)).toEqual(['cuenta', 'entrega', 'licencia']);
    expect(pasosAltaVisibles(pasos, () => false)).toEqual([]);
  });

  it('el alta está lista cuando los pasos requeridos que el rol ve están hechos', () => {
    const conCuentaYEntrega = pasosAlta({ cuentas: 1, entregaEnviada: true });
    expect(altaLista(pasosAltaVisibles(conCuentaYEntrega, () => true))).toBe(true);
    expect(altaLista(pasosAltaVisibles(pasos, () => true))).toBe(false);
  });
});

describe('enmascararDni', () => {
  it('deja los 4 últimos dígitos detrás de ****', () => {
    expect(enmascararDni('45871236')).toBe('****1236');
    expect(enmascararDni(' 4587 1236 ')).toBe('****1236');
  });

  it('un valor corto o vacío no revela nada', () => {
    expect(enmascararDni('123')).toBe('****');
    expect(enmascararDni('')).toBe('');
    expect(enmascararDni(null)).toBe('');
  });
});

describe('notificación empleado_suspendido', () => {
  it('tiene su propio ícono', () => {
    expect(iconoNotificacion('empleado_suspendido')).toBe('ti-user-pause');
    expect(iconoNotificacion('tipo_que_no_existe')).toBe('ti-bell');
  });
});

// ── Maqueta: RPC simuladas ──────────────────────────────────────────────────
function baseNueva() {
  return JSON.parse(JSON.stringify(TABLAS));
}
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };

describe('maqueta — RPC del ciclo de vida', () => {
  it('suspender exige motivo (P0001) y solo parte de Activo', () => {
    const db = baseNueva();
    expect(rechazo(() => RPC.suspender_empleado(db, { p_empleado_id: 'e01', p_motivo: '  ' }))).toMatchObject({
      code: 'P0001', message: 'El motivo de la suspensión es obligatorio.',
    });
    expect(rechazo(() => RPC.suspender_empleado(db, { p_empleado_id: 'e06', p_motivo: 'x' })).message).toMatch(/estado actual: Inactivo/);
    const emp = RPC.suspender_empleado(db, { p_empleado_id: 'e01', p_motivo: 'Investigación' });
    expect(emp.estado).toBe('Suspendido');
    const ultimo = db.empleado_eventos.at(-1);
    expect(ultimo).toMatchObject({ evento: 'suspendido', empleado_id: 'e01', detalle: 'Investigación' });
    expect(db.notificaciones.at(-1).tipo).toBe('empleado_suspendido');
  });

  it('la suspensión marca "Rotar contraseña" en las cuentas compartidas sin cerrar nada', () => {
    const db = baseNueva();
    db.cuentas.find((c) => c.id === 'c10').requiere_rotacion = false;
    RPC.suspender_empleado(db, { p_empleado_id: 'e01', p_motivo: 'x' });
    expect(db.cuentas.find((c) => c.id === 'c10').requiere_rotacion).toBe(true);
    expect(db.asignaciones_cuenta.filter((a) => a.empleado_id === 'e01' && !a.fecha_fin).length).toBeGreaterThan(0);
  });

  it('reactivar rechaza a un Activo y restaura a un Suspendido o Inactivo', () => {
    const db = baseNueva();
    expect(rechazo(() => RPC.reactivar_empleado(db, { p_empleado_id: 'e01' })).message).toBe('El empleado ya está Activo.');
    expect(RPC.reactivar_empleado(db, { p_empleado_id: 'e08', p_motivo: 'Caso cerrado' }).estado).toBe('Activo');
    expect(RPC.reactivar_empleado(db, { p_empleado_id: 'e06' }).estado).toBe('Activo');
  });

  it('reingresar solo desde Inactivo, con fecha de alta = hoy y los cambios en la hoja de vida', () => {
    const db = baseNueva();
    expect(rechazo(() => RPC.reingresar_empleado(db, { p_empleado_id: 'e01', p_datos: {} })).message).toMatch(/Solo se puede reingresar/);
    const emp = RPC.reingresar_empleado(db, { p_empleado_id: 'e06', p_datos: { cargo: 'Jefe de Almacén', area_obra_id: '' } });
    expect(emp).toMatchObject({ estado: 'Activo', cargo: 'Jefe de Almacén', area_obra_id: null });
    const eventos = db.empleado_eventos.filter((e) => e.empleado_id === 'e06').map((e) => e.evento);
    expect(eventos).toEqual(expect.arrayContaining(['cargo_cambiado', 'area_cambiada', 'reingreso']));
  });

  it('dar de baja con motivo cierra las cuentas, elimina las personales y deja la rotación en las compartidas', () => {
    const db = baseNueva();
    const emp = RPC.dar_baja_empleado(db, { p_empleado_id: 'e11', p_motivo: 'Término de contrato' });
    expect(emp.estado).toBe('Inactivo');
    expect(db.cuentas.find((c) => c.id === 'c14').deleted_at).not.toBeNull(); // personal
    expect(db.cuentas.find((c) => c.id === 'c10').requiere_rotacion).toBe(true); // compartida
    expect(db.asignaciones_cuenta.filter((a) => a.empleado_id === 'e11' && !a.fecha_fin)).toEqual([]);
    expect(db.empleado_eventos.at(-1)).toMatchObject({ evento: 'baja_ejecutada', detalle: 'Término de contrato' });
    expect(rechazo(() => RPC.dar_baja_empleado(db, { p_empleado_id: 'e11' })).message).toBe('El empleado ya está dado de baja.');
  });

  it('registrar una revisión de accesos actualiza la vista de la última revisión', () => {
    const db = baseNueva();
    const fila = RPC.registrar_revision_accesos(db, { p_empleado_id: 'e01', p_resultado: { cuentas: 2 }, p_nota: 'Sin observaciones' });
    expect(fila.nota).toBe('Sin observaciones');
    const vista = db.v_empleado_ultima_revision_acceso.filter((v) => v.empleado_id === 'e01');
    expect(vista).toHaveLength(1);
    expect(vista[0].revision_id).toBe(fila.id);
    expect(db.empleado_eventos.at(-1).evento).toBe('accesos_revisados');
  });
});

describe('maqueta — RPC de cuentas', () => {
  it('crear_cuenta_asignada crea la cuenta y su asignación; rechaza usuario duplicado y empleado dado de baja', () => {
    const db = baseNueva();
    const asig = RPC.crear_cuenta_asignada(db, {
      p_plataforma_id: 'gmail', p_usuario: 'Nuevo.Usuario@materen.pe', p_empleado_id: 'e07', p_password_cifrada: 'enc2:AA:BB',
    });
    expect(asig).toMatchObject({ empleado_id: 'e07', fecha_fin: null });
    expect(db.cuentas.find((c) => c.id === asig.cuenta_id)).toMatchObject({ usuario: 'nuevo.usuario@materen.pe', tipo_cuenta: 'personal' });
    expect(rechazo(() => RPC.crear_cuenta_asignada(db, { p_plataforma_id: 'gmail', p_usuario: 'nuevo.usuario@materen.pe', p_empleado_id: 'e07' })).code).toBe('23505');
    expect(rechazo(() => RPC.crear_cuenta_asignada(db, { p_plataforma_id: 'gmail', p_usuario: 'otro@materen.pe', p_empleado_id: 'e06' })).message).toMatch(/dado de baja/);
    expect(rechazo(() => RPC.crear_cuenta_asignada(db, { p_plataforma_id: 'gmail', p_usuario: 'otro@materen.pe', p_empleado_id: 'e07', p_password_cifrada: 'texto plano' })).message).toMatch(/cifrada/);
  });

  it('traspasar_cuenta rechaza las personales y los destinos no activos; con una reutilizable cierra y abre', () => {
    const db = baseNueva();
    const personal = db.asignaciones_cuenta.find((a) => a.id === 'ac01');
    expect(rechazo(() => RPC.traspasar_cuenta(db, { p_asignacion_id: personal.id, p_nuevo_empleado_id: 'e02' })).message).toMatch(/personal no se traspasa/);
    const reutilizable = db.asignaciones_cuenta.find((a) => a.id === 'ac09'); // c08, e09
    expect(rechazo(() => RPC.traspasar_cuenta(db, { p_asignacion_id: reutilizable.id, p_nuevo_empleado_id: 'e06' })).message).toBe('El empleado destino no está activo.');
    const nueva = RPC.traspasar_cuenta(db, { p_asignacion_id: reutilizable.id, p_nuevo_empleado_id: 'e01', p_notas: 'Traspaso: cambio de puesto' });
    expect(nueva).toMatchObject({ empleado_id: 'e01', cuenta_id: 'c08', fecha_fin: null });
    expect(db.asignaciones_cuenta.find((a) => a.id === 'ac09')).toMatchObject({ notas: 'Traspaso: cambio de puesto' });
    expect(db.asignaciones_cuenta.find((a) => a.id === 'ac09').fecha_fin).not.toBeNull();
    expect(db.cuentas.find((c) => c.id === 'c08').requiere_rotacion).toBe(true);
  });

  it('con contraseña nueva el traspaso limpia la rotación pendiente', () => {
    const db = baseNueva();
    RPC.traspasar_cuenta(db, { p_asignacion_id: 'ac09', p_nuevo_empleado_id: 'e01', p_password_cifrada: 'enc2:AA:BB' });
    expect(db.cuentas.find((c) => c.id === 'c08')).toMatchObject({ requiere_rotacion: false, password: 'enc2:AA:BB' });
  });

  it('cerrar_asignacion_cuenta es idempotente y revocar_cuenta_personal elimina la cuenta', () => {
    const db = baseNueva();
    const a1 = RPC.cerrar_asignacion_cuenta(db, { p_asignacion_id: 'ac10', p_notas: 'Revocada' });
    const fin = a1.fecha_fin;
    const a2 = RPC.cerrar_asignacion_cuenta(db, { p_asignacion_id: 'ac10', p_notas: 'Otra' });
    expect(a2.fecha_fin).toBe(fin);
    expect(a2.notas).toBe('Revocada');
    RPC.revocar_cuenta_personal(db, { p_asignacion_id: 'ac01' });
    expect(db.cuentas.find((c) => c.id === 'c01').deleted_at).not.toBeNull();
  });
});
