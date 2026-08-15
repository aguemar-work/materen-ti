// Dominio equipos_importacion: bandeja de trabajo temporal para migrar el
// Excel de activos fijos del cliente al módulo Equipos (ver migración 057).
// Una fila vive acá mientras se corrige; al migrarla se borra de esta tabla.
import { getClient } from '../client.js';

const SELECT_PENDIENTE = `
  id, raw, duplicado_kapo, codigo, tipo_id, marca, modelo, serie, costo,
  fecha_compra, estado, notas, modo, empleado_id, ubicacion_id, created_at
`;

export const equiposImportacionApi = {
  async listImportacionPendiente() {
    const { data, error } = await getClient().database
      .from('equipos_importacion')
      .select(SELECT_PENDIENTE)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Inserta el lote completo recién mapeado del Excel (una sola vez, justo
  // después del paso de mapeo de columnas).
  async bulkCrearImportacion(filas) {
    if (!filas.length) return [];
    const { data, error } = await getClient().database
      .from('equipos_importacion')
      .insert(filas)
      .select('id');
    if (error) throw error;
    return data || [];
  },

  async updateImportacion(id, datos) {
    const { error } = await getClient().database
      .from('equipos_importacion')
      .update(datos)
      .eq('id', id);
    if (error) throw error;
  },

  // Se borra al migrar la fila a `equipos` (ya no es "pendiente"), o si el
  // usuario decide descartarla sin importarla.
  async eliminarImportacion(id) {
    const { error } = await getClient().database
      .from('equipos_importacion')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // "Empezar de nuevo": vacía toda la bandeja (ej. se pegó el Excel
  // equivocado). Acción destructiva, se confirma en la UI antes de llamar.
  async vaciarImportacion() {
    const { error } = await getClient().database
      .from('equipos_importacion')
      .delete()
      .not('id', 'is', null);
    if (error) throw error;
  },
};
