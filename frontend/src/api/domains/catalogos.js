// Dominio catálogos: empresas, plataformas, ubicaciones, áreas/obras,
// tipos de equipo y catálogo de almacén (listas maestras con CRUD y soft delete).
import { getClient } from '../client.js';
import { sanitizarTermino } from '../sanitizar.js';
import { toTitleCase, onlyDigits, trimText } from '../../core/formatters.js';

export const catalogosApi = {
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

  async listTiposEquipo() {
    const { data, error } = await getClient().database
      .from('tipos_equipo')
      .select('id, nombre, campos_spec, accesorios_sugeridos')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // tipo: 'sede' | 'almacen' | 'obra' | 'otro' (migración 059) — clasifica
  // el catálogo físico. No confundir con areas_obras (función/asignación
  // laboral, sin relación entre ambos desde esta misma migración).
  async listUbicaciones() {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .select('id, nombre, descripcion, tipo')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createUbicacion(nombre, descripcion = null, tipo) {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .insert([{ nombre: toTitleCase(nombre), descripcion: trimText(descripcion), tipo }])
      .select('id, nombre, descripcion, tipo')
      .single();
    if (error) throw error;
    return data;
  },

  async updateUbicacion(id, datos) {
    const { data, error } = await getClient().database
      .from('ubicaciones')
      .update({ nombre: toTitleCase(datos.nombre), descripcion: trimText(datos.descripcion), tipo: datos.tipo })
      .eq('id', id)
      .select('id, nombre, descripcion, tipo')
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

  // ── Áreas/Obras (catálogo para empleados) ─────────────────────
  // Puramente funcional (migración 059): ya no tiene ubicacion_id — esa
  // relación mezclaba función (área/obra) con lugar físico (ubicación) en
  // una sola columna. La ubicación del empleado vive directo en
  // empleados.ubicacion_id, independiente de su área.
  async listAreasObras() {
    const { data, error } = await getClient().database
      .from('areas_obras')
      .select('id, nombre, descripcion')
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createAreaObra(nombre, descripcion = null) {
    const { data, error } = await getClient().database
      .from('areas_obras')
      .insert([{ nombre: toTitleCase(nombre), descripcion: trimText(descripcion) }])
      .select('id, nombre, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async updateAreaObra(id, datos) {
    const { data, error } = await getClient().database
      .from('areas_obras')
      .update({ nombre: toTitleCase(datos.nombre), descripcion: trimText(datos.descripcion) })
      .eq('id', id)
      .select('id, nombre, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteAreaObra(id) {
    const { error } = await getClient().database
      .from('areas_obras')
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

  // ── Catálogo de almacén (código + descripción para kits) ─────
  async listCatalogoAlmacen({ q = '', limite = 30 } = {}) {
    let query = getClient().database
      .from('catalogo_almacen')
      .select('id, codigo, descripcion')
      .is('deleted_at', null)
      .order('descripcion', { ascending: true })
      .limit(limite);
    const qSafe = sanitizarTermino(q);
    if (qSafe.length >= 2) {
      query = query.or(`codigo.ilike.%${qSafe}%,descripcion.ilike.%${qSafe}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async createCatalogoAlmacen({ codigo, descripcion }) {
    const desc = trimText(descripcion);
    if (!desc) throw new Error('La descripción es obligatoria');
    const { data, error } = await getClient().database
      .from('catalogo_almacen')
      .insert([{
        codigo: trimText(codigo)?.toUpperCase() || null,
        descripcion: desc,
      }])
      .select('id, codigo, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async updateCatalogoAlmacen(id, { codigo, descripcion }) {
    const desc = trimText(descripcion);
    if (!desc) throw new Error('La descripción es obligatoria');
    const { data, error } = await getClient().database
      .from('catalogo_almacen')
      .update({
        codigo: trimText(codigo)?.toUpperCase() || null,
        descripcion: desc,
      })
      .eq('id', id)
      .select('id, codigo, descripcion')
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteCatalogoAlmacen(id) {
    const { error } = await getClient().database
      .from('catalogo_almacen')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};
