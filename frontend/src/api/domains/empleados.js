// Dominio empleados: fichas, altas/ediciones y el flujo de baja/reactivación
// (la baja cierra asignaciones activas y da de baja cuentas personales).
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';
import { toTitleCase, toLower, normalizarTelefono, onlyDigits } from '../../core/formatters.js';
import { equiposApi } from './equipos.js';

// Columnas de "empleados" ordenables desde la tabla (excluye empresa/área,
// que vienen de un join, y los conteos de vínculos, que son calculados).
const ORDEN_COLUMNAS = ['dni', 'apellidos', 'cargo', 'estado', 'fecha_alta'];
const ORDEN_DEFECTO = { columna: 'apellidos', ascending: true };

// Query base del listado con filtros en servidor. La búsqueda "juan perez"
// se trocea por tokens y cada token debe matchear nombre, apellido o DNI
// (igual que el antiguo filtro en cliente sobre el nombre concatenado).
// OJO: PostgREST NO acepta dos parámetros or= repetidos (PGRST100); el
// AND-de-ORs va anidado en UN solo or=(and(or(...),or(...))) — verificado
// contra el backend real.
function queryEmpleados({ q = '', estado = '', orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('empleados')
    .select('*, empresas(nombre), areas_obras(nombre)', conteo ? { count: 'exact' } : undefined)
    .is('deleted_at', null);
  if (estado) query = query.eq('estado', estado);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    const tokens = qSafe.split(' ');
    const porToken = tokens.map(
      (t) => `or(nombres.ilike.%${t}%,apellidos.ilike.%${t}%,dni.ilike.%${t}%)`,
    );
    query = query.or(tokens.length === 1
      ? `nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%,dni.ilike.%${qSafe}%`
      : `and(${porToken.join(',')})`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return query.order(columna, { ascending });
}

export const empleadosApi = {
  // ── Listado paginado en servidor (la tabla principal) ─────────
  // listEmpleados() (completo) sigue existiendo para selects de formularios.
  async listEmpleadosPage({ pagina = 1, tamPagina = 20, q = '', estado = '', orden } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { data, count, error } = await queryEmpleados({ q, estado, orden }, { conteo: true })
      .range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapEmpleado), total: count ?? 0 };
  },

  // Dataset filtrado completo, sin página — para exportar CSV
  async listEmpleadosFiltrados({ q = '', estado = '' } = {}) {
    const { data, error } = await queryEmpleados({ q, estado });
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async listEmpleadosRecientes(limit = 5) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre), areas_obras(nombre)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async listEmpleados() {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre), areas_obras(nombre)')
      .is('deleted_at', null)
      .order('apellidos', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async getEmpleado(id) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre), areas_obras(nombre)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEmpleado(data) : null;
  },

  async createEmpleado(datos) {
    const { data, error } = await getClient().database
      .from('empleados')
      .insert([empleadoToRow(datos)])
      .select('*, empresas(nombre), areas_obras(nombre)')
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async updateEmpleado(id, datos) {
    const { data, error } = await getClient().database
      .from('empleados')
      .update(empleadoToRow(datos))
      .eq('id', id)
      .select('*, empresas(nombre), areas_obras(nombre)')
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async softDeleteEmpleado(id) {
    const { error } = await getClient().database
      .from('empleados')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Conteo de vínculos activos (cuentas, equipos y licencias) para una página
  // de empleados — queries batch, se ignoran entidades borradas.
  async conteosVinculos(empleadoIds) {
    if (!empleadoIds.length) return {};
    const db = getClient().database;
    const [cuentasRes, equiposRes, licenciasRes] = await Promise.all([
      db.from('asignaciones_cuenta')
        .select('empleado_id, cuentas(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
      db.from('asignaciones_equipo')
        .select('empleado_id, equipos(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
      db.from('asignaciones_licencia')
        .select('empleado_id, licencias(deleted_at)')
        .in('empleado_id', empleadoIds)
        .is('fecha_fin', null),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;
    if (equiposRes.error) throw equiposRes.error;
    if (licenciasRes.error) throw licenciasRes.error;
    const conteos = Object.fromEntries(
      empleadoIds.map((id) => [id, { cuentas: 0, equipos: 0, licencias: 0 }]),
    );
    for (const a of cuentasRes.data || []) {
      if (a.cuentas && !a.cuentas.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].cuentas += 1;
    }
    for (const a of equiposRes.data || []) {
      if (a.equipos && !a.equipos.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].equipos += 1;
    }
    for (const a of licenciasRes.data || []) {
      if (a.licencias && !a.licencias.deleted_at && conteos[a.empleado_id]) conteos[a.empleado_id].licencias += 1;
    }
    return conteos;
  },

  // Accesos activos del empleado (cuentas + licencias directas),
  // clasificados para el resumen previo a la baja
  async resumenBaja(empleadoId) {
    const db = getClient().database;
    const [cuentasRes, licenciasRes, equipos] = await Promise.all([
      db.from('asignaciones_cuenta')
        .select('id, cuentas(id, usuario, tipo_cuenta, deleted_at, plataformas(nombre))')
        .eq('empleado_id', empleadoId)
        .is('fecha_fin', null),
      db.from('asignaciones_licencia')
        .select('id, licencias(id, software, deleted_at)')
        .eq('empleado_id', empleadoId)
        .is('fecha_fin', null),
      // Antes `this.equiposPorEmpleado`: el método vive ahora en el dominio equipos.
      equiposApi.equiposPorEmpleado(empleadoId),
    ]);
    if (cuentasRes.error) throw cuentasRes.error;
    if (licenciasRes.error) throw licenciasRes.error;
    return {
      equipos,
      cuentas: (cuentasRes.data || [])
        .filter((a) => a.cuentas && !a.cuentas.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          cuenta_id: a.cuentas.id,
          usuario: a.cuentas.usuario,
          tipo_cuenta: a.cuentas.tipo_cuenta || 'personal',
          plataforma: a.cuentas.plataformas?.nombre || '',
        })),
      licencias: (licenciasRes.data || [])
        .filter((a) => a.licencias && !a.licencias.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          licencia_id: a.licencias.id,
          software: a.licencias.software,
        })),
    };
  },

  // Baja de empleado (regla de negocio):
  //   - cierra todas sus asignaciones activas
  //   - cuentas personales → se dan de baja junto con el empleado
  //   - reutilizables/compartidas → quedan marcadas "rotar contraseña"
  //     por el trigger de BD al cerrarse la asignación
  async bajaEmpleado(empleadoId) {
    const db = getClient().database;
    const today = new Date().toISOString().split('T')[0];

    // Antes `this.resumenBaja`: se referencia el propio objeto del dominio.
    const resumen = await empleadosApi.resumenBaja(empleadoId);

    const { error: e1 } = await db
      .from('asignaciones_cuenta')
      .update({ fecha_fin: today, notas: 'Baja del empleado' })
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null);
    if (e1) throw e1;

    // Liberar también sus asientos de licencias directas
    const { error: eLic } = await db
      .from('asignaciones_licencia')
      .update({ fecha_fin: today, notas: 'Baja del empleado' })
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null);
    if (eLic) throw eLic;

    const personales = resumen.cuentas.filter((c) => c.tipo_cuenta === 'personal').map((c) => c.cuenta_id);
    if (personales.length) {
      const { error: e2 } = await db
        .from('cuentas')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', personales);
      if (e2) throw e2;
    }

    const { data, error: e3 } = await db
      .from('empleados')
      .update({ estado: 'Inactivo' })
      .eq('id', empleadoId)
      .select('*, empresas(nombre), areas_obras(nombre)')
      .single();
    if (e3) throw e3;

    return { empleado: mapEmpleado(data), resumen };
  },

  async reactivarEmpleado(id) {
    const { data, error } = await getClient().database
      .from('empleados')
      .update({ deleted_at: null, estado: 'Activo' })
      .eq('id', id)
      .select('*, empresas(nombre), areas_obras(nombre)')
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },
};

function empleadoToRow(datos) {
  // "notas" dejó de escribirse (jul 2026): el campo salió del formulario,
  // pero la columna conserva lo histórico.
  return {
    nombres:         toTitleCase(datos.nombres),
    apellidos:       toTitleCase(datos.apellidos),
    dni:             onlyDigits(datos.dni),
    empresa_id:      datos.empresa_id,
    area_obra_id:    datos.area_obra_id || null,
    estado:          datos.estado,
    fecha_alta:      datos.fecha_alta,
    telefono:        normalizarTelefono(datos.telefono),
    whatsapp:        normalizarTelefono(datos.whatsapp),
    correo_personal: toLower(datos.correo_personal),
    cargo:           toTitleCase(datos.cargo),
  };
}

function mapEmpleado(row) {
  const empresa = row.empresas || {};
  const areaObra = row.areas_obras || {};
  return {
    id: row.id,
    nombres: row.nombres,
    apellidos: row.apellidos,
    dni: row.dni,
    telefono: row.telefono || '',
    whatsapp: row.whatsapp || '',
    correo_personal: row.correo_personal || '',
    cargo: row.cargo || '',
    empresa_id: row.empresa_id,
    empresa_nombre: empresa.nombre || '',
    area_obra_id: row.area_obra_id || '',
    area_obra_nombre: areaObra.nombre || '',
    estado: row.estado,
    fecha_alta: row.fecha_alta || '',
    notas: row.notas || '',
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
