// Dominio cuentas: asignaciones de cuentas a empleados (alta, edición,
// traspaso, historial y cierre). mapAsignacion se comparte con correos.
import { getClient } from '../client.js';
// El cifrado/descifrado ocurre en la edge function "credenciales":
// aquí solo se envía a cifrar antes de guardar. Los listados ya no
// traen contraseñas; se revelan bajo demanda (auditado) vía passwords.js
import { cifrarPassword } from '../passwords.js';
import { toLower, trimText } from '../../core/formatters.js';
import { mensajeSiUsuarioDuplicado } from '../erroresDb.js';

// Asignación + cuenta + plataforma: la forma que `mapAsignacion` espera.
const SELECT_ASIGNACION =
  'id, cuenta_id, empleado_id, fecha_inicio, notas, cuentas(id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono))';

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

  // Cuenta + asignación inicial en UNA transacción (RPC crear_cuenta_asignada,
  // migración 101; guard módulo `correos`). Antes eran dos inserts sueltos: si
  // el segundo fallaba quedaba una cuenta sin titular. La contraseña viaja YA
  // cifrada (cifrarPassword → edge function `credenciales`, invariante 2 de
  // AGENTS.md); la RPC rechaza texto plano. La unicidad usuario+plataforma
  // llega como 23505 crudo: la traduce quien lo muestra (api/erroresDb.js).
  async createCuenta(datos) {
    const db = getClient().database;
    const passwordCifrada = datos.password ? await cifrarPassword(datos.password) : null;

    const { data: asignacion, error } = await db.rpc('crear_cuenta_asignada', {
      p_plataforma_id: datos.plataforma_id,
      p_usuario: toLower(datos.usuario),
      p_empleado_id: datos.empleado_id,
      p_password_cifrada: passwordCifrada,
      p_url: trimText(datos.url),
      p_notas: trimText(datos.notas),
      p_tipo_cuenta: datos.tipo_cuenta || 'personal',
    });
    if (error) throw error;

    // La RPC devuelve la fila cruda de la asignación; se relee con los embeds
    // para conservar la forma que consumen la ficha y el store.
    const { data, error: e2 } = await db
      .from('asignaciones_cuenta')
      .select(SELECT_ASIGNACION)
      .eq('id', asignacion.id)
      .single();
    if (e2) throw e2;
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
    if (e1) throw new Error(mensajeSiUsuarioDuplicado(e1) || e1.message);

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

  // Cierra la asignación, rota la contraseña si llegó una nueva y abre la del
  // otro empleado, todo o nada (RPC traspasar_cuenta, migración 101; guard
  // módulo `correos`). Antes eran 4 escrituras sueltas desde el cliente: si
  // fallaba la tercera la cuenta quedaba sin titular. Sin contraseña nueva, la
  // marca "Rotar contraseña" que pone el trigger del cierre queda como aviso.
  // El servidor rechaza traspasar una cuenta PERSONAL (se revoca y se crea una
  // nueva) y un destino que no esté Activo. Devuelve la asignación NUEVA (fila
  // cruda).
  async traspasarCuenta(asignacionId, nuevoEmpleadoId, notas, nuevaPassword = null) {
    const { data, error } = await getClient().database.rpc('traspasar_cuenta', {
      p_asignacion_id: asignacionId,
      p_nuevo_empleado_id: nuevoEmpleadoId,
      p_notas: trimText(notas),
      p_password_cifrada: nuevaPassword ? await cifrarPassword(nuevaPassword) : null,
    });
    if (error) throw error;
    return data;
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

  // Cierra la asignación (RPC cerrar_asignacion_cuenta, migración 101; guard
  // módulo `correos`). Si ya estaba cerrada no hace nada. Sin `notas` no pisa
  // las que ya tenía. La cuenta sigue viva (compartida/reutilizable).
  async cerrarAsignacion(asignacionId, notas = null) {
    const { error } = await getClient().database.rpc('cerrar_asignacion_cuenta', {
      p_asignacion_id: asignacionId,
      p_notas: trimText(notas),
    });
    if (error) throw error;
  },

  // Solo para tipo_cuenta === 'personal': a diferencia de cerrarAsignacion
  // (que solo cierra la asignación, dejando la cuenta viva para
  // reutilizarse — correcto para compartida/reutilizable), esto cierra la
  // asignación Y hace soft-delete de la cuenta en la misma transacción
  // (RPC revocar_cuenta_personal, migración 077). Una cuenta personal sin
  // dueño no tiene sentido mantenerla viva; dejarla viva bloqueaba para
  // siempre el índice único usuario+plataforma (hallazgo 2026-08-20,
  // reportado con almacen.nufago.06@gmail.com / VPN). No toca
  // cerrarAsignacion en sí: licencias.js (liberarUsuario) la reutiliza para
  // un caso sin relación con este hallazgo.
  async revocarCuentaPersonal(asignacionId) {
    const { error } = await getClient().database.rpc('revocar_cuenta_personal', {
      p_asignacion_id: asignacionId,
    });
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
