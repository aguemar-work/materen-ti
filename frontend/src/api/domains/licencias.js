// Dominio licencias: catálogo, renovaciones y asignación de asientos.
// asignarUsuario/liberarUsuario deciden el mecanismo según el tipo de
// licencia: con login (cuenta_id), delegan en el correo compartido
// (asignaciones_cuenta, mismo camino que el módulo Correos); sin login,
// asignación directa en asignaciones_licencia.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { cifrarPassword } from '../passwords.js';
import { trimText, fechaLocalISO } from '../../core/formatters.js';
import { DIAS_POR_VENCER_LICENCIA } from '../../core/dominio-licencias.js';
import { cuentasApi } from './cuentas.js';
import { correosApi } from './correos.js';

// Columnas de "licencias" ordenables desde la tabla (excluye empresa/acceso/
// usuarios, que vienen de joins, y asientos, que es calculado).
const ORDEN_COLUMNAS = ['software', 'proveedor', 'fecha_vencimiento', 'costo'];
const ORDEN_DEFECTO = { columna: 'software', ascending: true };

// tiene_clave (no "clave"): columna generada (migración 040), nunca trae
// el ciphertext al listado — se revela bajo demanda vía revelarClaveLicencia.
const SELECT_LICENCIA = `
  id, software, tipo, cantidad, empresa_id, proveedor, fecha_vencimiento,
  renovacion_meses, costo, moneda, cuenta_id, tiene_clave, notas,
  empresas(nombre),
  cuentas(id, usuario, asignaciones_cuenta(id, fecha_fin, empleado_id, empleados(nombres, apellidos))),
  asignaciones_licencia(id, fecha_fin, empleado_id, empleados(nombres, apellidos))
`;

// Filtro de situación del listado (segmentado de LicenciasView). Mismo
// criterio que `estadoVencimientoLicencia()` (core/dominio-licencias.js):
// una perpetua o sin fecha nunca vence; "vencida" = antes de hoy; "por
// vencer" = de hoy a DIAS_POR_VENCER_LICENCIA días, inclusive.
//
// No hay "sin cupo": "asientos usados" se cuenta sobre dos embeds distintos
// (asignaciones_licencia activas, o asignaciones_cuenta activas del correo
// vinculado) y PostgREST no puede comparar un conteo contra la columna
// `cantidad` sin una vista/columna calculada en la base.
// 'perpetuas' (vista V2, 2026-09-25): las que nunca vencen — tipo perpetua
// o sin fecha, el mismo criterio de estadoVencimientoLicencia().
const SITUACIONES_LICENCIA = ['vencidas', 'por_vencer', 'perpetuas'];

function filtrarSituacion(query, situacion) {
  if (!SITUACIONES_LICENCIA.includes(situacion)) return query;
  if (situacion === 'perpetuas') return query.or('tipo.eq.perpetua,fecha_vencimiento.is.null');
  const hoy = fechaLocalISO();
  const base = query.neq('tipo', 'perpetua').not('fecha_vencimiento', 'is', null);
  if (situacion === 'vencidas') return base.lt('fecha_vencimiento', hoy);
  return base.gte('fecha_vencimiento', hoy).lte('fecha_vencimiento', fechaLocalISO(DIAS_POR_VENCER_LICENCIA));
}

// Chip "Acceso" (filtros V2): cómo se entra al software. 'correo' = con un
// correo compartido vinculado (cuenta_id), 'clave' = con clave de producto
// (tiene_clave, columna generada), 'ninguno' = sin ninguna de las dos.
// Varios valores = O entre ellos.
function filtrarAccesos(query, accesos) {
  const set = new Set(accesos);
  if (!set.size || set.size === 3) return query;
  if (set.size === 1 && set.has('ninguno')) return query.is('cuenta_id', null).eq('tiene_clave', false);
  const terminos = [];
  if (set.has('correo')) terminos.push('cuenta_id.not.is.null');
  if (set.has('clave')) terminos.push('tiene_clave.is.true');
  if (set.has('ninguno')) terminos.push('and(cuenta_id.is.null,tiene_clave.is.false)');
  return query.or(terminos.join(','));
}

async function queryLicencias(
  { q = '', situacion = '', empresaIds = [], accesos = [], orden } = {},
  { conteo = false, soloConteo = false } = {},
) {
  let query = getClient().database
    .from('licencias')
    .select(soloConteo ? 'id' : SELECT_LICENCIA, conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  query = filtrarSituacion(query, situacion);
  if (empresaIds.length) query = query.in('empresa_id', empresaIds);
  query = filtrarAccesos(query, accesos);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    const db = getClient().database;
    const [empRes, cuentaRes] = await Promise.all([
      db.from('empresas').select('id').ilike('nombre', `%${qSafe}%`).limit(30),
      db.from('cuentas').select('id').ilike('usuario', `%${qSafe}%`).limit(30),
    ]);
    let clauses = `software.ilike.%${qSafe}%,proveedor.ilike.%${qSafe}%`;
    if (empRes.data?.length) {
      clauses += `,empresa_id.in.(${empRes.data.map((e) => e.id).join(',')})`;
    }
    if (cuentaRes.data?.length) {
      clauses += `,cuenta_id.in.(${cuentaRes.data.map((c) => c.id).join(',')})`;
    }
    query = query.or(clauses);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

// ── Licencias ────────────────────────────────────────────────────────────────

export const licenciasApi = {
  async listLicenciasPage({ pagina = 1, tamPagina = 20, orden, ...filtros } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryLicencias({ ...filtros, orden }, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapLicencia), total: count ?? 0 };
  },

  // Conteo de cada vista del listado (filtros V2) con los mismos chips y
  // búsqueda: el número es el que se verá al hacer clic en la pestaña.
  async conteosLicenciasPorSituacion(filtros = {}) {
    const situaciones = ['', 'por_vencer', 'vencidas', 'perpetuas'];
    const resultados = await Promise.all(situaciones.map(async (situacion) => {
      const { qb } = await queryLicencias({ ...filtros, situacion }, { conteo: true, soloConteo: true });
      const { count, error } = await qb.range(0, 0);
      if (error) throw error;
      return [situacion || 'todas', count ?? 0];
    }));
    return Object.fromEntries(resultados);
  },

  async listLicenciasFiltrados(filtros = {}) {
    const { qb } = await queryLicencias(filtros);
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapLicencia);
  },

  async listLicencias() {
    const { qb } = await queryLicencias();
    const { data, error } = await qb;
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

  // Asignar un asiento a un empleado, sin importar el tipo de licencia:
  // con login, delega en el correo compartido (mismo camino que Correos);
  // sin login, usa asignarLicencia directo. Punto de entrada único desde la UI.
  async asignarUsuario(licencia, empleadoId) {
    if (licencia.cuenta_id) {
      await correosApi.asignarCuentaExistente(licencia.cuenta_id, empleadoId);
      return;
    }
    await licenciasApi.asignarLicencia(licencia.id, empleadoId);
  },

  // Liberar un asiento ya asignado (usuario = entrada de licencia.usuarios,
  // con `origen` puesto por mapLicencia para saber a qué tabla pertenece).
  async liberarUsuario(usuario, notas = null) {
    if (usuario.origen === 'cuenta') {
      await cuentasApi.cerrarAsignacion(usuario.asignacion_id, notas);
      return;
    }
    await licenciasApi.cerrarAsignacionLicencia(usuario.asignacion_id, notas);
  },

  // Asignación directa en asignaciones_licencia (licencias sin login).
  // Usar asignarUsuario() desde la UI; esto es el mecanismo de bajo nivel.
  async asignarLicencia(licenciaId, empleadoId) {
    const { error } = await getClient().database
      .from('asignaciones_licencia')
      .insert([{
        licencia_id: licenciaId,
        empleado_id: empleadoId,
        fecha_inicio: fechaLocalISO(),
      }]);
    if (error) throw error;
  },

  async cerrarAsignacionLicencia(asignacionId, notas = null) {
    const updateData = { fecha_fin: fechaLocalISO() };
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
          asignacion_id: a.id,
          origen: 'cuenta', // liberarUsuario() cierra por asignaciones_cuenta
          empleado_id: a.empleado_id,
          nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
        }))
    : (row.asignaciones_licencia || [])
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({
          asignacion_id: a.id,
          origen: 'licencia', // liberarUsuario() cierra por asignaciones_licencia
          empleado_id: a.empleado_id,
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
    tiene_clave: row.tiene_clave === true,
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
