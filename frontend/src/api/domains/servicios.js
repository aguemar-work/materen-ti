// Dominio servicios (migración 107): catálogo de servicios de TI (≤ 15). Lo lee
// cualquier staff activo (los formularios de categorías, cambios y listados lo
// ofrecen como selector); lo escribe solo un JEFE por RLS (INSERT / UPDATE, con
// la baja lógica como UPDATE de deleted_at). El tope de 15 servicios vivos y el
// nombre único los impone la base (trigger e índice): el error llega a quien
// llama y lo traduce api/erroresDb.js.
import { getClient } from '../client.js';
import { trimText } from '../../core/formatters.js';

const COLUMNAS = 'id, nombre, descripcion, dueno_user_id, criticidad, horario';

function filaDeServicio(datos) {
  return {
    nombre: trimText(datos.nombre),
    descripcion: trimText(datos.descripcion),
    dueno_user_id: datos.dueno_user_id || null,
    criticidad: datos.criticidad || 'media',
    horario: trimText(datos.horario),
  };
}

export const serviciosApi = {
  async listServicios() {
    const { data, error } = await getClient().database
      .from('servicios')
      .select(COLUMNAS)
      .is('deleted_at', null)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // `datos.id` es el slug (se genera a partir del nombre en el panel).
  async createServicio(datos) {
    const { data, error } = await getClient().database
      .from('servicios')
      .insert([{ id: datos.id, ...filaDeServicio(datos) }])
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data;
  },

  async updateServicio(id, datos) {
    const { data, error } = await getClient().database
      .from('servicios')
      .update(filaDeServicio(datos))
      .eq('id', id)
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteServicio(id) {
    const { error } = await getClient().database
      .from('servicios')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },
};
