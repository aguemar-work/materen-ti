// Dominio equipos_importacion: bandeja de trabajo temporal para migrar el
// Excel de activos fijos del cliente al módulo Equipos (ver migración 057).
// Una fila vive acá mientras se corrige; al migrarla se borra de esta tabla.
import { getClient } from '../client.js';
import { anotarErrorDb } from '../erroresDb.js';

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

  // Migra UNA fila de la bandeja a `equipos` con las RPC de la migración 101:
  // crea el equipo, lo entrega o lo ubica según `modo`, le pone el estado
  // físico y borra la fila de la bandeja, todo en una transacción (antes eran
  // 4-5 llamadas del cliente: un corte a mitad dejaba un equipo creado con la
  // fila aún en la bandeja). `datos` = correcciones que el formulario aún no
  // había guardado (autoguardado de 700 ms). Devuelve el equipo creado.
  async migrarImportacionEquipo(filaId, datos = null) {
    const { data, error } = await getClient().database.rpc('migrar_importacion_equipo', {
      p_fila_id: filaId,
      p_datos: datos,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
  },

  // Migra un LOTE (hasta 100 por llamada): valida TODAS las filas antes de
  // escribir; si una está bloqueada no migra ninguna y devuelve la lista con
  // el motivo de cada una. → { ok, migrados, bloqueados: [{ id, codigo, motivo }] }
  async migrarImportacionEquipos(filaIds) {
    const { data, error } = await getClient().database.rpc('migrar_importacion_equipos', {
      p_fila_ids: filaIds,
    });
    if (error) throw anotarErrorDb(error, { entidad: 'equipo' });
    return data;
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
