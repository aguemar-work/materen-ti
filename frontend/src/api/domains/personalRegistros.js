// Dominio personal_registros: lado staff del pre-registro público (ver
// api/personalRegistro.js para el lado público). Solo lectura + marcar
// "usado" — la creación siempre pasa por la edge function.
import { getClient } from '../client.js';
import { entregarQuery } from '../entregarQuery.js';
import { sanitizarTermino } from '../sanitizar.js';
import { ordenValido } from '../ordenPermitido.js';

const SELECT_REGISTRO = 'id, dni, nombres, apellidos, celular, correo_personal, usado, created_at';

const ORDEN_COLUMNAS = ['dni', 'apellidos', 'created_at'];
const ORDEN_DEFECTO = { columna: 'created_at', ascending: false };

function queryPersonalRegistros({ q = '', pendientes = false, orden } = {}, { conteo = false } = {}) {
  let query = getClient().database
    .from('personal_registros')
    .select(SELECT_REGISTRO, conteo ? { count: 'exact' } : undefined);
  if (pendientes) query = query.eq('usado', false);
  const qSafe = sanitizarTermino(q);
  if (qSafe.length >= 2) {
    query = query.or(`nombres.ilike.%${qSafe}%,apellidos.ilike.%${qSafe}%,dni.ilike.%${qSafe}%`);
  }
  const { columna, ascending } = ordenValido(orden, ORDEN_COLUMNAS, ORDEN_DEFECTO);
  return entregarQuery(query.order(columna, { ascending }));
}

export const personalRegistrosApi = {
  async listPersonalRegistrosPage({ pagina = 1, tamPagina = 20, q = '', pendientes = false, orden } = {}) {
    const desde = (pagina - 1) * tamPagina;
    const { qb } = queryPersonalRegistros({ q, pendientes, orden }, { conteo: true });
    const { data, count, error } = await qb.range(desde, desde + tamPagina - 1);
    if (error) throw error;
    return { items: (data || []).map(mapPersonalRegistro), total: count ?? 0 };
  },

  // Dataset filtrado completo, sin página — para exportar CSV
  async listPersonalRegistrosFiltrados({ q = '', pendientes = false } = {}) {
    const { qb } = queryPersonalRegistros({ q, pendientes });
    const { data, error } = await qb;
    if (error) throw error;
    return (data || []).map(mapPersonalRegistro);
  },

  async marcarUsado(id, usado = true) {
    const { error } = await getClient().database
      .from('personal_registros')
      .update({ usado })
      .eq('id', id);
    if (error) throw error;
  },

  // Hard delete real (ver migración 046): se llama solo después de migrar
  // este pre-registro a `empleados` (alta o actualización por DNI).
  async eliminarRegistro(id) {
    const { error } = await getClient().database
      .from('personal_registros')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },
};

function mapPersonalRegistro(row) {
  return {
    id: row.id,
    dni: row.dni,
    nombres: row.nombres,
    apellidos: row.apellidos,
    celular: row.celular || '',
    correo_personal: row.correo_personal || '',
    usado: row.usado === true,
    created_at: row.created_at,
  };
}
