// Dominio cuentas: asignaciones de cuentas a empleados (alta, edición,
// traspaso, historial y cierre). mapAsignacion se comparte con correos.
import { getClient } from '../client.js';
// El cifrado/descifrado ocurre en la edge function "credenciales":
// aquí solo se envía a cifrar antes de guardar. Los listados ya no
// traen contraseñas; se revelan bajo demanda (auditado) vía passwords.js
import { cifrarPassword } from '../passwords.js';
import { toLower, trimText } from '../../core/formatters.js';

export const cuentasApi = {
  async listCuentasPorEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_cuenta')
      .select('id, cuenta_id, empleado_id, fecha_inicio, notas, cuentas(id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, deleted_at, plataformas(nombre, icono))')
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const items = (data || []).filter(a => !a.cuentas?.deleted_at).map(mapAsignacion);
    return items;
  },

  async createCuenta(datos) {
    const db = getClient().database;

    const { data: cuenta, error: e1 } = await db
      .from('cuentas')
      .insert([{
        plataforma_id: datos.plataforma_id,
        usuario: toLower(datos.usuario),
        password: datos.password ? await cifrarPassword(datos.password) : null,
        last_password_change: datos.password ? new Date().toISOString() : null,
        url: trimText(datos.url),
        notas: trimText(datos.notas),
        tipo_cuenta: datos.tipo_cuenta || 'personal',
      }])
      .select('id')
      .single();
    if (e1) throw e1;

    const { error: e2 } = await db
      .from('asignaciones_cuenta')
      .insert([{
        cuenta_id: cuenta.id,
        empleado_id: datos.empleado_id,
        fecha_inicio: new Date().toISOString().split('T')[0],
      }]);
    if (e2) throw e2;

    const { data, error: e3 } = await db
      .from('asignaciones_cuenta')
      .select('id, cuenta_id, empleado_id, fecha_inicio, notas, cuentas(id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono))')
      .eq('cuenta_id', cuenta.id)
      .eq('empleado_id', datos.empleado_id)
      .is('fecha_fin', null)
      .single();
    if (e3) throw e3;
    return mapAsignacion(data);
  },

  async updateCuenta(cuentaId, datos, empleadoId) {
    const db = getClient().database;

    const updateData = {
      plataforma_id: datos.plataforma_id,
      usuario: toLower(datos.usuario),
      url: trimText(datos.url),
      notas: trimText(datos.notas),
    };
    if (datos.tipo_cuenta) updateData.tipo_cuenta = datos.tipo_cuenta;
    // Solo tocar la contraseña si el usuario realmente la cambió:
    // así el flag "rotar contraseña" no se limpia con ediciones de otros campos
    if (datos.password_cambiada) {
      updateData.password = datos.password ? await cifrarPassword(datos.password) : null;
      updateData.last_password_change = datos.password ? new Date().toISOString() : null;
      updateData.requiere_rotacion = false;
    }

    const { error: e1 } = await db.from('cuentas').update(updateData).eq('id', cuentaId);
    if (e1) throw e1;

    const { data, error: e2 } = await db
      .from('asignaciones_cuenta')
      .select('id, cuenta_id, empleado_id, fecha_inicio, notas, cuentas(id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono))')
      .eq('cuenta_id', cuentaId)
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .single();
    if (e2) throw e2;
    return mapAsignacion(data);
  },

  async traspasarCuenta(asignacionId, nuevoEmpleadoId, notas, nuevaPassword = null) {
    const db = getClient().database;
    const today = new Date().toISOString().split('T')[0];

    const { data: asig, error: e0 } = await db
      .from('asignaciones_cuenta')
      .select('cuenta_id')
      .eq('id', asignacionId)
      .single();
    if (e0) throw e0;

    const { error: e1 } = await db
      .from('asignaciones_cuenta')
      .update({ fecha_fin: today, notas: notas || 'Traspaso a otro empleado' })
      .eq('id', asignacionId);
    if (e1) throw e1;

    // Rotar contraseña DESPUÉS de cerrar la asignación: el trigger de BD
    // marca requiere_rotacion al cierre, y aquí se limpia si hubo rotación.
    // Sin nueva contraseña, el flag queda activo como advertencia.
    if (nuevaPassword) {
      const { error: ePw } = await db
        .from('cuentas')
        .update({
          password: await cifrarPassword(nuevaPassword),
          last_password_change: new Date().toISOString(),
          requiere_rotacion: false,
        })
        .eq('id', asig.cuenta_id);
      if (ePw) throw ePw;
    }

    const { error: e2 } = await db
      .from('asignaciones_cuenta')
      .insert([{ cuenta_id: asig.cuenta_id, empleado_id: nuevoEmpleadoId, fecha_inicio: today }]);
    if (e2) throw e2;
  },

  async historialCuenta(cuentaId) {
    const { data, error } = await getClient().database
      .from('asignaciones_cuenta')
      .select('id, empleado_id, fecha_inicio, fecha_fin, notas, empleados(nombres, apellidos)')
      .eq('cuenta_id', cuentaId)
      .order('fecha_inicio', { ascending: false });
    if (error) throw error;
    return (data || []).map((a) => {
      const emp = a.empleados || {};
      return {
        id: a.id,
        // Sin `empleados` resuelto (registro eliminado del todo, no solo
        // dado de baja) no hay ficha a la que enlazar.
        empleado_id: a.empleados ? a.empleado_id : null,
        empleado_nombre: `${emp.nombres || ''} ${emp.apellidos || ''}`.trim() || 'Empleado eliminado',
        fecha_inicio: a.fecha_inicio,
        fecha_fin: a.fecha_fin,
        notas: a.notas || '',
        activa: !a.fecha_fin,
      };
    });
  },

  async cerrarAsignacion(asignacionId, notas = null) {
    const updateData = { fecha_fin: new Date().toISOString().split('T')[0] };
    if (notas) updateData.notas = notas;
    const { error } = await getClient().database
      .from('asignaciones_cuenta')
      .update(updateData)
      .eq('id', asignacionId)
      .is('fecha_fin', null);
    if (error) throw error;
  },
};

export function mapAsignacion(row) {
  const cuenta = row.cuentas || {};
  const plataforma = cuenta.plataformas || {};
  return {
    asignacion_id: row.id,
    id: cuenta.id,
    cuenta_id: cuenta.id,
    empleado_id: row.empleado_id,
    fecha_inicio: row.fecha_inicio,
    notas_asignacion: row.notas || '',
    plataforma_id: cuenta.plataforma_id,
    plataforma_nombre: plataforma.nombre || cuenta.plataforma_id,
    plataforma_icono: plataforma.icono || '',
    usuario: cuenta.usuario,
    url: cuenta.url || '',
    notas: cuenta.notas || '',
    tipo_cuenta: cuenta.tipo_cuenta || 'personal',
    last_password_change: cuenta.last_password_change || null,
    requiere_rotacion: cuenta.requiere_rotacion === true,
  };
}
