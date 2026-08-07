// Dominio correos compartidos/reutilizables: catálogo asignable, CRUD
// y asignación de cuentas existentes a empleados.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { cifrarPassword } from '../passwords.js';
import { toLower, trimText, fechaLocalISO } from '../../core/formatters.js';
import { mensajeSiUsuarioDuplicado } from '../erroresDb.js';
import { mapAsignacion } from './cuentas.js';

const SELECT_CORREO = 'id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono), asignaciones_cuenta(fecha_fin, empleado_id, empleados(nombres, apellidos))';

// Columnas de "cuentas" ordenables desde la tabla (excluye plataforma y
// asignados, que vienen de joins).
const ORDEN_COLUMNAS = ['usuario', 'tipo_cuenta', 'url', 'notas'];
const ORDEN_DEFECTO = { columna: 'created_at', ascending: true };

async function queryCorreos({ q = '', tipo = '', orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('cuentas')
    .select(SELECT_CORREO, conteo ? { count: 'exact' } : undefined)
    .in('tipo_cuenta', ['reutilizable', 'compartida'])
    .is('deleted_at', null);
  if (tipo) query = query.eq('tipo_cuenta', tipo);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    const { data: plats } = await getClient().database
      .from('plataformas')
      .select('id')
      .ilike('nombre', `%${qSafe}%`)
      .limit(30);
    const extra = plats?.length ? `,plataforma_id.in.(${plats.map((p) => p.id).join(',')})` : '';
    query = query.or(`usuario.ilike.%${qSafe}%${extra}`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

// ── Correos Compartidos ──────────────────────────────────────────────────────

export const correosApi = {
  async listCorreosPage({ pagina = 1, tamPagina = 20, q = '', tipo = '', orden } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = await queryCorreos({ q, tipo, orden }, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapCorreo), total: count ?? 0 };
  },

  async listCorreosFiltrados({ q = '', tipo = '' } = {}) {
    const { qb } = await queryCorreos({ q, tipo });
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapCorreo);
  },

  async listCorreosAsignables() {
    const db = getClient().database;

    const [cuentasRes, asignacionesRes] = await Promise.all([
      db.from('cuentas')
        .select('id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono)')
        .in('tipo_cuenta', ['reutilizable', 'compartida'])
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      db.from('asignaciones_cuenta')
        .select('cuenta_id')
        .is('fecha_fin', null),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;

    // IDs de cuentas reutilizables con asignación activa (ocupadas)
    const ocupadas = new Set((asignacionesRes.data || []).map((a) => a.cuenta_id));

    const disponibles = (cuentasRes.data || []).filter((c) =>
      c.tipo_cuenta === 'compartida' || !ocupadas.has(c.id)
    );

    const items = disponibles.map(mapCorreo);
    return items;
  },

  async listCorreosCompartidos() {
    const { qb } = await queryCorreos();
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapCorreo);
  },

  async createCorreo(datos) {
    const { data, error } = await getClient().database
      .from('cuentas')
      .insert([{
        plataforma_id: datos.plataforma_id,
        usuario: toLower(datos.usuario),
        password: datos.password ? await cifrarPassword(datos.password) : null,
        last_password_change: datos.password ? new Date().toISOString() : null,
        url: trimText(datos.url),
        notas: trimText(datos.notas),
        tipo_cuenta: datos.tipo_cuenta || 'compartida',
      }])
      .select('id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono)')
      .single();
    if (error) throw new Error(mensajeSiUsuarioDuplicado(error) || error.message);
    return mapCorreo(data);
  },

  async updateCorreo(id, datos) {
    const updateData = {
      plataforma_id: datos.plataforma_id,
      usuario: toLower(datos.usuario),
      url: trimText(datos.url),
      notas: trimText(datos.notas),
      tipo_cuenta: datos.tipo_cuenta,
    };
    // Igual que en updateCuenta: la contraseña solo se toca si cambió,
    // y al cambiarla se limpia el aviso de rotación
    if (datos.password_cambiada) {
      updateData.password = datos.password ? await cifrarPassword(datos.password) : null;
      updateData.last_password_change = datos.password ? new Date().toISOString() : null;
      updateData.requiere_rotacion = false;
    }
    const { data, error } = await getClient().database
      .from('cuentas')
      .update(updateData)
      .eq('id', id)
      .select('id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono)')
      .single();
    if (error) throw new Error(mensajeSiUsuarioDuplicado(error) || error.message);
    return mapCorreo(data);
  },

  async softDeleteCorreo(id) {
    const { error } = await getClient().database
      .from('cuentas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async asignarCuentaExistente(cuentaId, empleadoId) {
    const db = getClient().database;

    const { error: e1 } = await db
      .from('asignaciones_cuenta')
      .insert([{
        cuenta_id: cuentaId,
        empleado_id: empleadoId,
        fecha_inicio: fechaLocalISO(),
      }]);
    if (e1) throw e1;

    const { data, error: e2 } = await db
      .from('asignaciones_cuenta')
      .select('id, cuenta_id, empleado_id, fecha_inicio, notas, cuentas(id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono))')
      .eq('cuenta_id', cuentaId)
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (e2) throw e2;
    return mapAsignacion(data);
  },
};

function mapCorreo(row) {
  const plataforma = row.plataformas || {};
  // asignados solo viene en listCorreosCompartidos (select anidado);
  // en create/update queda null y el store conserva el valor anterior
  const asignados = row.asignaciones_cuenta
    ? row.asignaciones_cuenta
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({ id: a.empleado_id, nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim() }))
    : null;
  return {
    id: row.id,
    plataforma_id: row.plataforma_id,
    plataforma_nombre: plataforma.nombre || row.plataforma_id,
    plataforma_icono: plataforma.icono || '',
    usuario: row.usuario,
    url: row.url || '',
    notas: row.notas || '',
    tipo_cuenta: row.tipo_cuenta || 'compartida',
    last_password_change: row.last_password_change || null,
    requiere_rotacion: row.requiere_rotacion === true,
    asignados,
  };
}
