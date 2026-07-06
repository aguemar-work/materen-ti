import { createClient } from '@insforge/sdk';
// El cifrado/descifrado ocurre en la edge function "credenciales":
// aquí solo se envía a cifrar antes de guardar. Los listados ya no
// traen contraseñas; se revelan bajo demanda (auditado) vía passwords.js
import { cifrarPassword } from './passwords.js';
import { toTitleCase, toLower, normalizarTelefono, onlyDigits, trimText } from '../core/formatters.js';

let client;

export function getClient() {
  if (!client) {
    const baseUrl = import.meta.env.VITE_INSFORGE_URL;
    const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;
    if (!baseUrl || !anonKey) throw new Error('InsForge no configurado');
    client = createClient({
      baseUrl,
      anonKey,
      // El SDK deriva por defecto https://<app>.functions.insforge.app, que no
      // existe en este backend y el navegador lo bloquea por CORS antes de que
      // opere el fallback. Se usa el proxy /functions del API base directamente.
      functionsUrl: `${baseUrl}/functions`,
    });
  }
  return client;
}

export const insforgeApi = {
  mode: 'insforge',

  // Búsqueda global del panel: empleados, cuentas y equipos en una sola consulta
  async buscarGlobal(query) {
    if (!query || query.trim().length < 2) return { empleados: [], cuentas: [], equipos: [] };
    const q = query.trim().toLowerCase();
    const db = getClient().database;
    const [empRes, cuentasRes, equiposRes] = await Promise.all([
      db.from('empleados')
        .select('id, nombres, apellidos, dni, cargo, estado, empresas(nombre)')
        .is('deleted_at', null)
        .or(`nombres.ilike.%${q}%,apellidos.ilike.%${q}%,dni.ilike.%${q}%`)
        .limit(6),
      db.from('cuentas')
        .select('id, usuario, plataforma_id, tipo_cuenta, plataformas(nombre), asignaciones_cuenta(fecha_fin, empleado_id)')
        .is('deleted_at', null)
        .ilike('usuario', `%${q}%`)
        .limit(6),
      db.from('equipos')
        .select('id, codigo, marca, modelo, serie, tipos_equipo(nombre)')
        .is('deleted_at', null)
        .or(`codigo.ilike.%${q}%,marca.ilike.%${q}%,modelo.ilike.%${q}%,serie.ilike.%${q}%`)
        .limit(6),
    ]);
    return {
      empleados: (empRes.data || []).map((e) => ({
        id: e.id, nombres: e.nombres, apellidos: e.apellidos,
        dni: e.dni, cargo: e.cargo, estado: e.estado,
        empresa_nombre: e.empresas?.nombre || '',
      })),
      cuentas: (cuentasRes.data || []).map((c) => ({
        id: c.id, usuario: c.usuario,
        plataforma_nombre: c.plataformas?.nombre || c.plataforma_id,
        tipo_cuenta: c.tipo_cuenta,
        // titular activo: para llevar a su ficha desde el resultado
        titular_id: (c.asignaciones_cuenta || []).find((a) => !a.fecha_fin)?.empleado_id || null,
      })),
      equipos: (equiposRes.data || []).map((e) => ({
        id: e.id, codigo: e.codigo,
        descripcion: `${e.tipos_equipo?.nombre || ''} ${e.marca || ''} ${e.modelo || ''}`.trim(),
        serie: e.serie || '',
      })),
    };
  },

  async listEmpleadosRecientes(limit = 5) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async listEmpleados() {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre)')
      .is('deleted_at', null)
      .order('apellidos', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapEmpleado);
  },

  async getEmpleado(id) {
    const { data, error } = await getClient().database
      .from('empleados')
      .select('*, empresas(nombre)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapEmpleado(data) : null;
  },

  async createEmpleado(datos) {
    const { data, error } = await getClient().database
      .from('empleados')
      .insert([empleadoToRow(datos)])
      .select('*, empresas(nombre)')
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async updateEmpleado(id, datos) {
    const { data, error } = await getClient().database
      .from('empleados')
      .update(empleadoToRow(datos))
      .eq('id', id)
      .select('*, empresas(nombre)')
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
      this.equiposPorEmpleado(empleadoId),
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

    const resumen = await this.resumenBaja(empleadoId);

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
      .select('*, empresas(nombre)')
      .single();
    if (e3) throw e3;

    return { empleado: mapEmpleado(data), resumen };
  },

  async reactivarEmpleado(id) {
    const { data, error } = await getClient().database
      .from('empleados')
      .update({ deleted_at: null, estado: 'Activo' })
      .eq('id', id)
      .select('*, empresas(nombre)')
      .single();
    if (error) throw error;
    return mapEmpleado(data);
  },

  async listEmpresas() {
    const { data, error } = await getClient().database
      .from('empresas')
      .select('id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listPlataformas() {
    const { data, error } = await getClient().database
      .from('plataformas')
      .select('id, nombre, icono')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

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
        empleado_nombre: `${emp.nombres || ''} ${emp.apellidos || ''}`.trim() || 'Empleado eliminado',
        fecha_inicio: a.fecha_inicio,
        fecha_fin: a.fecha_fin,
        notas: a.notas || '',
        activa: !a.fecha_fin,
      };
    });
  },

  async getEstadisticas() {
    const db = getClient().database;
    const [empRes, asigRes, compartidaRes, reutilizableRes, sinPwRes, rotacionRes, licVencenRes] = await Promise.all([
      db.from('empleados').select('id, estado').is('deleted_at', null),
      db.from('asignaciones_cuenta').select('id, cuenta_id').is('fecha_fin', null),
      db.from('cuentas').select('id').eq('tipo_cuenta', 'compartida').is('deleted_at', null),
      db.from('cuentas').select('id').eq('tipo_cuenta', 'reutilizable').is('deleted_at', null),
      db.from('cuentas').select('id').is('password', null).is('deleted_at', null),
      db.from('cuentas').select('id').eq('requiere_rotacion', true).is('deleted_at', null),
      db.from('licencias').select('id')
        .lte('fecha_vencimiento', fechaEnDias(30))
        .is('deleted_at', null),
    ]);

    const ocupadas = new Set((asigRes.data || []).map((a) => a.cuenta_id));
    const reutilizablesLibres = (reutilizableRes.data || []).filter((c) => !ocupadas.has(c.id)).length;

    return {
      empleadosActivos: (empRes.data || []).filter((e) => e.estado === 'Activo').length,
      empleadosTotal: (empRes.data || []).length,
      cuentasAsignadas: (asigRes.data || []).length,
      correosCompartidos: (compartidaRes.data || []).length,
      reutilizablesLibres,
      cuentasSinPassword: (sinPwRes.data || []).length,
      cuentasPorRotar: (rotacionRes.data || []).length,
      licenciasPorVencer: (licVencenRes.data || []).length,
    };
  },

  // Pendientes accionables del dashboard: cuentas por rotar, sin contraseña
  // y licencias que vencen en los próximos 30 días
  async listPendientes() {
    const db = getClient().database;
    const select = 'id, usuario, tipo_cuenta, plataformas(nombre), asignaciones_cuenta(fecha_fin, empleado_id, empleados(nombres, apellidos))';
    const [rotarRes, sinPwRes, licRes, equiposRes, garantiaRes] = await Promise.all([
      db.from('cuentas').select(select).eq('requiere_rotacion', true).is('deleted_at', null),
      db.from('cuentas').select(select).is('password', null).is('deleted_at', null),
      db.from('licencias')
        .select('id, software, cantidad, fecha_vencimiento, empresas(nombre)')
        .lte('fecha_vencimiento', fechaEnDias(30))
        .is('deleted_at', null)
        .order('fecha_vencimiento', { ascending: true }),
      db.from('asignaciones_equipo')
        .select('id, equipos(id, codigo, marca, modelo, deleted_at), empleados(id, nombres, apellidos, estado)')
        .is('fecha_fin', null),
      db.from('equipos')
        .select('id, codigo, marca, modelo, garantia_hasta')
        .lte('garantia_hasta', fechaEnDias(30))
        .is('deleted_at', null)
        .in('estado', ['operativo', 'en_reparacion'])
        .order('garantia_hasta', { ascending: true }),
    ]);
    if (rotarRes.error) throw rotarRes.error;
    if (sinPwRes.error) throw sinPwRes.error;
    if (licRes.error) throw licRes.error;
    if (equiposRes.error) throw equiposRes.error;
    if (garantiaRes.error) throw garantiaRes.error;

    const mapItem = (c) => {
      const titulares = (c.asignaciones_cuenta || [])
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => ({
          id: a.empleado_id,
          nombre: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
        }));
      return {
        cuenta_id: c.id,
        usuario: c.usuario,
        tipo_cuenta: c.tipo_cuenta || 'personal',
        plataforma: c.plataformas?.nombre || '',
        titulares,
      };
    };

    return {
      porRotar: (rotarRes.data || []).map(mapItem),
      sinPassword: (sinPwRes.data || []).map(mapItem),
      licenciasPorVencer: (licRes.data || []).map((l) => ({
        licencia_id: l.id,
        software: l.software,
        cantidad: l.cantidad,
        fecha_vencimiento: l.fecha_vencimiento,
        empresa: l.empresas?.nombre || '',
        vencida: l.fecha_vencimiento < new Date().toISOString().split('T')[0],
      })),
      // Lo más urgente: equipos que siguen en manos de empleados dados de baja
      equiposSinDevolver: (equiposRes.data || [])
        .filter((a) => a.empleados?.estado === 'Inactivo' && a.equipos && !a.equipos.deleted_at)
        .map((a) => ({
          asignacion_id: a.id,
          codigo: a.equipos.codigo,
          equipo: `${a.equipos.marca || ''} ${a.equipos.modelo || ''}`.trim(),
          empleado: `${a.empleados.nombres} ${a.empleados.apellidos}`.trim(),
          empleado_id: a.empleados.id,
        })),
      garantiasPorVencer: (garantiaRes.data || []).map((e) => ({
        equipo_id: e.id,
        codigo: e.codigo,
        equipo: `${e.marca || ''} ${e.modelo || ''}`.trim(),
        garantia_hasta: e.garantia_hasta,
        vencida: e.garantia_hasta < new Date().toISOString().split('T')[0],
      })),
    };
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

  // ── Empresas ────────────────────────────────────────────────────────────────

  async createEmpresa(datos) {
    const { data, error } = await getClient().database
      .from('empresas')
      .insert([{ nombre: toTitleCase(datos.nombre), ruc: onlyDigits(datos.ruc) }])
      .select('id, nombre, ruc')
      .single();
    if (error) throw error;
    return data;
  },

  async updateEmpresa(id, datos) {
    const { data, error } = await getClient().database
      .from('empresas')
      .update({ nombre: toTitleCase(datos.nombre), ruc: onlyDigits(datos.ruc) })
      .eq('id', id)
      .select('id, nombre, ruc')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteEmpresa(id) {
    const { error } = await getClient().database
      .from('empresas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Plataformas ──────────────────────────────────────────────────────────────

  async createPlataforma(datos) {
    const { data, error } = await getClient().database
      .from('plataformas')
      .insert([{ id: datos.id, nombre: toTitleCase(datos.nombre), icono: trimText(datos.icono) }])
      .select('id, nombre, icono')
      .single();
    if (error) throw error;
    return data;
  },

  async updatePlataforma(id, datos) {
    const { data, error } = await getClient().database
      .from('plataformas')
      .update({ nombre: toTitleCase(datos.nombre), icono: trimText(datos.icono) })
      .eq('id', id)
      .select('id, nombre, icono')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeletePlataforma(id) {
    const { error } = await getClient().database
      .from('plataformas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // ── Correos Compartidos ──────────────────────────────────────────────────────

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
    const { data, error } = await getClient().database
      .from('cuentas')
      .select('id, plataforma_id, usuario, url, notas, tipo_cuenta, last_password_change, requiere_rotacion, plataformas(nombre, icono), asignaciones_cuenta(fecha_fin, empleados(nombres, apellidos))')
      .in('tipo_cuenta', ['reutilizable', 'compartida'])
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const items = (data || []).map(mapCorreo);
    return items;
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
    if (error) throw error;
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
    if (error) throw error;
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
        fecha_inicio: new Date().toISOString().split('T')[0],
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

  // ── Licencias ────────────────────────────────────────────────────────────────

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

  // ── Equipos ──────────────────────────────────────────────────────────────────

  async listTiposEquipo() {
    const { data, error } = await getClient().database
      .from('tipos_equipo')
      .select('id, nombre, campos_spec, accesorios_sugeridos')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listEquipos() {
    const { data, error } = await getClient().database
      .from('equipos')
      .select(`
        id, codigo, tipo_id, marca, modelo, serie, empresa_id, estado,
        fecha_compra, costo, moneda, garantia_hasta, specs, accesorios, fotos, notas,
        tipos_equipo(nombre),
        empresas(nombre),
        asignaciones_equipo(id, fecha_fin, fecha_inicio, empleado_id, ubicacion_id, condicion_entrega, empleados(nombres, apellidos, estado), ubicaciones(nombre))
      `)
      .is('deleted_at', null)
      .order('codigo', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapEquipo);
  },

  async listUbicaciones() {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .select('id, nombre, descripcion')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createUbicacion(nombre, descripcion = null) {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .insert([{ nombre: toTitleCase(nombre), descripcion: trimText(descripcion) }])
      .select('id, nombre, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async updateUbicacion(id, datos) {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .update({ nombre: toTitleCase(datos.nombre), descripcion: trimText(datos.descripcion) })
      .eq('id', id)
      .select('id, nombre, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteUbicacion(id) {
    const { error } = await getClient().database
      .from('ubicaciones')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async createTipoEquipo(datos) {
    const { data, error } = await getClient().database
      .from('tipos_equipo')
      .insert([{
        id: datos.id,
        nombre: trimText(datos.nombre),
        campos_spec: datos.campos_spec || [],
        accesorios_sugeridos: datos.accesorios_sugeridos || [],
      }])
      .select('id, nombre, campos_spec, accesorios_sugeridos')
      .single();
    if (error) throw error;
    return data;
  },

  async updateTipoEquipo(id, datos) {
    const { data, error } = await getClient().database
      .from('tipos_equipo')
      .update({
        nombre: trimText(datos.nombre),
        campos_spec: datos.campos_spec || [],
        accesorios_sugeridos: datos.accesorios_sugeridos || [],
      })
      .eq('id', id)
      .select('id, nombre, campos_spec, accesorios_sugeridos')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteTipoEquipo(id) {
    const { error } = await getClient().database
      .from('tipos_equipo')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Asignación activa de un equipo (persona o ubicación), o null
  async asignacionActivaEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_equipo')
      .select('id, empleado_id, ubicacion_id')
      .eq('equipo_id', equipoId)
      .is('fecha_fin', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // Mover a una ubicación. Solo si está libre o en otra ubicación:
  // si lo tiene una PERSONA, se exige registrar la devolución primero.
  async moverEquipo(equipoId, ubicacionId) {
    const db = getClient().database;
    const activa = await this.asignacionActivaEquipo(equipoId);
    if (activa?.empleado_id) {
      throw new Error('El equipo lo tiene una persona. Registra la devolución antes de moverlo.');
    }
    if (activa) {
      const { error: e1 } = await db
        .from('asignaciones_equipo')
        .update({ fecha_fin: new Date().toISOString().split('T')[0], motivo_cierre: 'movimiento' })
        .eq('id', activa.id);
      if (e1) throw e1;
    }
    const { error: e2 } = await db
      .from('asignaciones_equipo')
      .insert([{ equipo_id: equipoId, ubicacion_id: ubicacionId }]);
    if (e2) throw e2;
  },

  async createEquipo(datos) {
    const { error } = await getClient().database
      .from('equipos')
      .insert([equipoToRow(datos)]);
    if (error) throw error;
  },

  async updateEquipo(id, datos) {
    const { error } = await getClient().database
      .from('equipos')
      .update(equipoToRow(datos))
      .eq('id', id);
    if (error) throw error;
  },

  // Cambio de estado físico (el trigger registra el evento en la hoja de vida)
  async cambiarEstadoEquipo(id, estado) {
    const { error } = await getClient().database
      .from('equipos')
      .update({ estado })
      .eq('id', id);
    if (error) throw error;
  },

  async softDeleteEquipo(id) {
    const { error } = await getClient().database
      .from('equipos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async asignarEquipo(equipoId, empleadoId, condicionEntrega) {
    const db = getClient().database;
    // Si está en una ubicación (almacén, área...), se retira de ahí
    // automáticamente. Si lo tiene otra persona, el trigger lo bloquea.
    const activa = await this.asignacionActivaEquipo(equipoId);
    if (activa?.ubicacion_id) {
      const { error: e0 } = await db
        .from('asignaciones_equipo')
        .update({ fecha_fin: new Date().toISOString().split('T')[0], motivo_cierre: 'entrega a empleado' })
        .eq('id', activa.id);
      if (e0) throw e0;
    }
    const { error } = await db
      .from('asignaciones_equipo')
      .insert([{
        equipo_id: equipoId,
        empleado_id: empleadoId,
        fecha_inicio: new Date().toISOString().split('T')[0],
        condicion_entrega: trimText(condicionEntrega),
      }]);
    if (error) throw error;
  },

  // Devolución física: cierra la asignación y, si volvió dañado,
  // pasa el equipo a reparación en el mismo acto
  async devolverEquipo(asignacionId, equipoId, { condicion, motivo, aReparacion }) {
    const db = getClient().database;
    const { error: e1 } = await db
      .from('asignaciones_equipo')
      .update({
        fecha_fin: new Date().toISOString().split('T')[0],
        condicion_devolucion: trimText(condicion),
        motivo_cierre: motivo || 'devolucion',
      })
      .eq('id', asignacionId)
      .is('fecha_fin', null);
    if (e1) throw e1;

    if (aReparacion) {
      const { error: e2 } = await db
        .from('equipos')
        .update({ estado: 'en_reparacion' })
        .eq('id', equipoId);
      if (e2) throw e2;
    }
  },

  // Fotos: se suben comprimidas al bucket público "equipos-fotos".
  // Guardar SIEMPRE {url, key}: la key hace posible eliminarlas después.
  async subirFotoEquipo(file) {
    const { data, error } = await getClient().storage
      .from('equipos-fotos')
      .uploadAuto(file);
    if (error) throw error;
    return { url: data.url, key: data.key };
  },

  async eliminarFotoEquipo(key) {
    const { error } = await getClient().storage
      .from('equipos-fotos')
      .remove(key);
    if (error) throw error;
  },

  async eventosEquipo(equipoId) {
    const { data, error } = await getClient().database
      .from('eventos_equipo')
      .select('id, evento, detalle, user_email, created_at')
      .eq('equipo_id', equipoId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Equipos que porta un empleado (para la ficha y el resumen de baja)
  async equiposPorEmpleado(empleadoId) {
    const { data, error } = await getClient().database
      .from('asignaciones_equipo')
      .select('id, fecha_inicio, equipos(id, codigo, marca, modelo, estado, deleted_at, tipos_equipo(nombre))')
      .eq('empleado_id', empleadoId)
      .is('fecha_fin', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || [])
      .filter((a) => a.equipos && !a.equipos.deleted_at)
      .map((a) => ({
        asignacion_id: a.id,
        equipo_id: a.equipos.id,
        codigo: a.equipos.codigo,
        tipo: a.equipos.tipos_equipo?.nombre || '',
        marca: a.equipos.marca || '',
        modelo: a.equipos.modelo || '',
        fecha_inicio: a.fecha_inicio,
      }));
  },

  // ── Tickets (staff) ──────────────────────────────────────────────────────────
  // La creación pública, el seguimiento y la encuesta viven en
  // api/ticketsPublicos.js (edge function). Aquí solo lo que opera el staff
  // vía RLS directo: catálogo, bandeja, detalle, comentarios, cambios de estado.

  async listCategoriasTicket() {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .select('id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async listSubcategoriasTicket(categoriaId = null) {
    let query = getClient().database
      .from('subcategorias_ticket')
      .select('id, categoria_id, nombre')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (categoriaId) query = query.eq('categoria_id', categoriaId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createCategoriaTicket(datos) {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .insert([{ id: datos.id, nombre: trimText(datos.nombre) }])
      .select('id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async updateCategoriaTicket(id, datos) {
    const { data, error } = await getClient().database
      .from('categorias_ticket')
      .update({ nombre: trimText(datos.nombre) })
      .eq('id', id)
      .select('id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteCategoriaTicket(id) {
    const { error } = await getClient().database
      .from('categorias_ticket')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async createSubcategoriaTicket(categoriaId, nombre) {
    const { data, error } = await getClient().database
      .from('subcategorias_ticket')
      .insert([{ categoria_id: categoriaId, nombre: trimText(nombre) }])
      .select('id, categoria_id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async updateSubcategoriaTicket(id, nombre) {
    const { data, error } = await getClient().database
      .from('subcategorias_ticket')
      .update({ nombre: trimText(nombre) })
      .eq('id', id)
      .select('id, categoria_id, nombre')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteSubcategoriaTicket(id) {
    const { error } = await getClient().database
      .from('subcategorias_ticket')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async listTickets() {
    const { data, error } = await getClient().database
      .from('tickets')
      .select(`
        id, codigo, titulo, estado, prioridad, vinculado, contacto_ingresado,
        created_at, updated_at, asignado_a,
        empleados(nombres, apellidos),
        categorias_ticket(nombre), subcategorias_ticket(nombre)
      `)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapTicketResumen);
  },

  async getTicket(id) {
    const { data, error } = await getClient().database
      .from('tickets')
      .select(`
        id, codigo, titulo, descripcion, estado, prioridad, nivel_atencion, origen, vinculado,
        contacto_ingresado, asignado_a, es_base_conocimiento, es_leccion_aprendida,
        adjunto_url, created_at, updated_at,
        empleado_id, empleados(nombres, apellidos, dni, correo_personal, whatsapp),
        categoria_id, categorias_ticket(nombre),
        subcategoria_id, subcategorias_ticket(nombre),
        equipo_id, equipos(codigo, marca, modelo),
        cuenta_id, cuentas(usuario, plataformas(nombre)),
        licencia_id, licencias(software)
      `)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapTicketDetalle(data) : null;
  },

  async listComentariosTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_comentarios')
      .select('id, mensaje, interno, created_at, autor_id')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async crearComentarioTicket(ticketId, mensaje, interno = true) {
    const { error } = await getClient().database
      .from('ticket_comentarios')
      .insert([{ ticket_id: ticketId, mensaje: trimText(mensaje), interno }]);
    if (error) throw error;
  },

  async listEventosTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_eventos')
      .select('id, evento, detalle, user_email, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getSatisfaccionTicket(ticketId) {
    const { data, error } = await getClient().database
      .from('ticket_satisfaccion')
      .select('nivel, comentario, fecha_envio')
      .eq('ticket_id', ticketId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async actualizarTicket(id, datos) {
    const { error } = await getClient().database
      .from('tickets')
      .update(datos)
      .eq('id', id);
    if (error) throw error;
  },

  // Pendientes accionables de tickets, para el Dashboard
  async pendientesTickets() {
    const db = getClient().database;
    const [sinAsignarRes, sinVincularRes, viejosRes] = await Promise.all([
      db.from('tickets')
        .select('id, codigo, titulo')
        .is('asignado_a', null)
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .order('created_at', { ascending: true }),
      db.from('tickets')
        .select('id, codigo, titulo')
        .eq('vinculado', false)
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .order('created_at', { ascending: true }),
      db.from('tickets')
        .select('id, codigo, titulo, created_at')
        .not('estado', 'in', '("resuelto","cerrado","rechazado")')
        .lte('created_at', fechaEnDias(-3))
        .order('created_at', { ascending: true }),
    ]);
    return {
      sinAsignar: (sinAsignarRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo })),
      sinVincular: (sinVincularRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo })),
      abiertosViejos: (viejosRes.data || []).map((t) => ({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at })),
    };
  },

  // ── Auditoría (solo JEFE por RLS) ────────────────────────────────────────────

  async listActividad(limit = 200) {
    const { data, error } = await getClient().database
      .from('accesos_log')
      .select('id, user_email, cuenta_usuario, plataforma, accion, detalle, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  // ── Staff ────────────────────────────────────────────────────────────────────

  async listStaff() {
    const { data, error } = await getClient().database
      .from('staff')
      .select('user_id, nombre, rol, activo')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async updateStaff(userId, datos) {
    const { data, error } = await getClient().database
      .from('staff')
      .update({ rol: datos.rol, activo: datos.activo })
      .eq('user_id', userId)
      .select('user_id, nombre, rol, activo')
      .single();
    if (error) throw error;
    return data;
  },
};

function mapCorreo(row) {
  const plataforma = row.plataformas || {};
  // asignados solo viene en listCorreosCompartidos (select anidado);
  // en create/update queda null y el store conserva el valor anterior
  const asignados = row.asignaciones_cuenta
    ? row.asignaciones_cuenta
        .filter((a) => !a.fecha_fin && a.empleados)
        .map((a) => `${a.empleados.nombres} ${a.empleados.apellidos}`.trim())
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

function mapAsignacion(row) {
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

// Fecha de hoy + N días en formato YYYY-MM-DD (para filtros de vencimiento)
function fechaEnDias(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

function mapEquipo(row) {
  const activa = (row.asignaciones_equipo || []).find((a) => !a.fecha_fin);
  const portador = activa?.empleados
    ? `${activa.empleados.nombres} ${activa.empleados.apellidos}`.trim()
    : '';
  const ubicacion = activa?.ubicaciones?.nombre || '';
  // Situación derivada: nunca se guarda, nunca se desincroniza
  let situacion;
  if (row.estado !== 'operativo') situacion = row.estado;
  else if (activa?.empleado_id) situacion = 'asignado';
  else if (activa?.ubicacion_id) situacion = 'en_ubicacion';
  else situacion = 'disponible';
  return {
    ubicacion_nombre: ubicacion,
    id: row.id,
    codigo: row.codigo,
    tipo_id: row.tipo_id,
    tipo_nombre: row.tipos_equipo?.nombre || row.tipo_id,
    marca: row.marca || '',
    modelo: row.modelo || '',
    serie: row.serie || '',
    empresa_id: row.empresa_id,
    empresa_nombre: row.empresas?.nombre || '',
    estado: row.estado,
    situacion,
    asignacion_id: activa?.id || null,
    empleado_id: activa?.empleado_id || null,
    portador,
    portador_inactivo: activa?.empleados?.estado === 'Inactivo',
    fecha_compra: row.fecha_compra,
    costo: row.costo,
    moneda: row.moneda || '',
    garantia_hasta: row.garantia_hasta,
    specs: row.specs || {},
    accesorios: row.accesorios || [],
    fotos: row.fotos || [],
    notas: row.notas || '',
    fecha_asignacion: activa?.fecha_inicio || null,
    condicion_entrega: activa?.condicion_entrega || '',
  };
}

function mapTicketResumen(row) {
  const empleado = row.empleados;
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    estado: row.estado,
    prioridad: row.prioridad,
    vinculado: row.vinculado,
    solicitante: empleado ? `${empleado.nombres} ${empleado.apellidos}`.trim() : (row.contacto_ingresado || ''),
    categoria: row.categorias_ticket?.nombre || '',
    subcategoria: row.subcategorias_ticket?.nombre || '',
    asignado_a: row.asignado_a,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapTicketDetalle(row) {
  const empleado = row.empleados;
  return {
    id: row.id,
    codigo: row.codigo,
    titulo: row.titulo,
    descripcion: row.descripcion,
    estado: row.estado,
    prioridad: row.prioridad,
    nivel_atencion: row.nivel_atencion,
    origen: row.origen,
    vinculado: row.vinculado,
    contacto_ingresado: row.contacto_ingresado || '',
    asignado_a: row.asignado_a,
    es_base_conocimiento: row.es_base_conocimiento,
    es_leccion_aprendida: row.es_leccion_aprendida,
    adjunto_url: row.adjunto_url,
    created_at: row.created_at,
    updated_at: row.updated_at,
    empleado_id: row.empleado_id,
    empleado_nombre: empleado ? `${empleado.nombres} ${empleado.apellidos}`.trim() : '',
    empleado_dni: empleado?.dni || '',
    empleado_correo: empleado?.correo_personal || '',
    empleado_whatsapp: empleado?.whatsapp || '',
    categoria_id: row.categoria_id,
    categoria_nombre: row.categorias_ticket?.nombre || '',
    subcategoria_id: row.subcategoria_id,
    subcategoria_nombre: row.subcategorias_ticket?.nombre || '',
    equipo_id: row.equipo_id,
    equipo_desc: row.equipos ? `${row.equipos.codigo} — ${row.equipos.marca || ''} ${row.equipos.modelo || ''}`.trim() : '',
    cuenta_id: row.cuenta_id,
    cuenta_desc: row.cuentas ? `${row.cuentas.usuario} (${row.cuentas.plataformas?.nombre || ''})` : '',
    licencia_id: row.licencia_id,
    licencia_desc: row.licencias?.software || '',
  };
}

function equipoToRow(datos) {
  return {
    codigo: trimText(datos.codigo)?.toUpperCase(),
    tipo_id: datos.tipo_id,
    marca: toTitleCase(datos.marca),
    modelo: trimText(datos.modelo),
    serie: trimText(datos.serie),
    empresa_id: datos.empresa_id || null,
    fecha_compra: datos.fecha_compra || null,
    costo: datos.costo === '' || datos.costo == null ? null : Number(datos.costo),
    moneda: datos.costo ? (datos.moneda || 'PEN') : null,
    garantia_hasta: datos.garantia_hasta || null,
    specs: datos.specs || {},
    accesorios: datos.accesorios || [],
    fotos: datos.fotos || [],
    notas: trimText(datos.notas),
  };
}

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

function empleadoToRow(datos) {
  return {
    nombres:         toTitleCase(datos.nombres),
    apellidos:       toTitleCase(datos.apellidos),
    dni:             onlyDigits(datos.dni),
    empresa_id:      datos.empresa_id,
    estado:          datos.estado,
    fecha_alta:      datos.fecha_alta,
    telefono:        normalizarTelefono(datos.telefono),
    whatsapp:        normalizarTelefono(datos.whatsapp),
    correo_personal: toLower(datos.correo_personal),
    cargo:           toTitleCase(datos.cargo),
    notas:           trimText(datos.notas),
  };
}

function mapEmpleado(row) {
  const empresa = row.empresas || {};
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
    estado: row.estado,
    fecha_alta: row.fecha_alta || '',
    notas: row.notas || '',
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
