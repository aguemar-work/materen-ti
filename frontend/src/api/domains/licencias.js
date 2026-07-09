// Dominio licencias: catálogo, renovaciones y asignaciones directas
// (las licencias con login se asignan vía su correo vinculado).
import { getClient } from '../client.js';
import { cifrarPassword } from '../passwords.js';
import { trimText } from '../../core/formatters.js';

// ── Licencias ────────────────────────────────────────────────────────────────

export const licenciasApi = {
  async listLicencias() {
    const { data, error } = await getClient().database
      .from('licencias')
      .select(`
        id, software, tipo, cantidad, empresa_id, proveedor, fecha_vencimiento,
        renovacion_meses, costo, moneda, cuenta_id, clave, notas,
        empresas(nombre),
        cuentas(id, usuario, asignaciones_cuenta(id, fecha_fin, empleados(nombres, apellidos))),
        asignaciones_licencia(id, fecha_fin, empleados(nombres, apellidos))
      `)
      .is('deleted_at', null)
      .order('software', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapLicencia);
  },

  async createLicencia(datos) {
    const { data, error } = await getClient().database
      .from('licencias')
      .insert([await licenciaToRow(datos)])
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  async updateLicencia(id, datos) {
    const row = await licenciaToRow(datos);
    // Igual que las contraseñas: la clave solo se toca si el usuario escribió una nueva
    if (!datos.clave_cambiada) delete row.clave;
    const { error } = await getClient().database
      .from('licencias')
      .update(row)
      .eq('id', id);
    if (error) throw error;
  },

  // Renovar: solo corre la fecha de vencimiento (calculada en la UI
  // según renovacion_meses)
  async renovarLicencia(id, nuevaFecha) {
    const { error } = await getClient().database
      .from('licencias')
      .update({ fecha_vencimiento: nuevaFecha })
      .eq('id', id);
    if (error) throw error;
  },

  async softDeleteLicencia(id) {
    const { error } = await getClient().database
      .from('licencias')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Asignación directa (licencias sin login). Las licencias con login se
  // asignan a través de su correo vinculado, como cualquier correo compartido.
  async asignarLicencia(licenciaId, empleadoId) {
    const { error } = await getClient().database
      .from('asignaciones_licencia')
      .insert([{
        licencia_id: licenciaId,
        empleado_id: empleadoId,
        fecha_inicio: new Date().toISOString().split('T')[0],
      }]);
    if (error) throw error;
  },

  async cerrarAsignacionLicencia(asignacionId, notas = null) {
    const updateData = { fecha_fin: new Date().toISOString().split('T')[0] };
    if (notas) updateData.notas = notas;
    const { error } = await getClient().database
      .from('asignaciones_licencia')
      .update(updateData)
      .eq('id', asignacionId)
      .is('fecha_fin', null);
    if (error) throw error;
  },

  // Licencias directas activas de un empleado (para la ficha)
  async licenciasPorEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_licencia')
      .select('id, fecha_inicio, licencias(id, software, tipo, fecha_vencimiento, deleted_at)')
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((a) => a.licencias && !a.licencias.deleted_at)
      .map((a) => ({
        asignacion_id: a.id,
        licencia_id: a.licencias.id,
        software: a.licencias.software,
        tipo: a.licencias.tipo,
        fecha_vencimiento: a.licencias.fecha_vencimiento,
        fecha_inicio: a.fecha_inicio,
      }));
  },
};

function mapLicencia(row) {
  const cuenta = row.cuentas || null;
  // Usuarios activos: vía el correo vinculado (con login) o directos (sin login)
  const usuarios = cuenta
    ? (cuenta.asignaciones_cuenta || [])
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({
          asignacion_id: null, // se gestiona desde el correo, no aquí
          nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
        }))
    : (row.asignaciones_licencia || [])
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({
          asignacion_id: a.id,
          nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
        }));
  return {
    id: row.id,
    software: row.software,
    tipo: row.tipo,
    cantidad: row.cantidad,
    empresa_id: row.empresa_id,
    empresa_nombre: row.empresas?.nombre || '',
    proveedor: row.proveedor || '',
    fecha_vencimiento: row.fecha_vencimiento,
    renovacion_meses: row.renovacion_meses || null,
    costo: row.costo,
    moneda: row.moneda || '',
    cuenta_id: row.cuenta_id,
    cuenta_usuario: cuenta?.usuario || '',
    tiene_clave: !!row.clave,
    notas: row.notas || '',
    usuarios,
    usados: usuarios.length,
  };
}

async function licenciaToRow(datos) {
  return {
    software: trimText(datos.software),
    tipo: datos.tipo || 'suscripcion',
    cantidad: Number(datos.cantidad) || 1,
    empresa_id: datos.empresa_id || null,
    proveedor: trimText(datos.proveedor),
    fecha_vencimiento: datos.tipo === 'perpetua' ? null : (datos.fecha_vencimiento || null),
    renovacion_meses: datos.tipo === 'perpetua' || !datos.renovacion_meses ? null : Number(datos.renovacion_meses),
    costo: datos.costo === '' || datos.costo == null ? null : Number(datos.costo),
    moneda: datos.costo ? (datos.moneda || 'PEN') : null,
    cuenta_id: datos.cuenta_id || null,
    clave: datos.clave ? await cifrarPassword(datos.clave) : null,
    notas: trimText(datos.notas),
  };
}
