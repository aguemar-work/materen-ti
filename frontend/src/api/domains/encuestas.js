// Dominio encuestas: CRUD de plantillas + rondas + lectura de respuestas,
// todo vía RLS normal de sesión (solo JEFE crea/edita/cierra; cualquier
// staff ve). El lado público (abrir una ronda / responder sin sesión)
// vive en api/encuestaPublica.js, contra la edge function "encuestas".
import { getClient } from '../client.js';
import { trimText } from '../../core/formatters.js';
import { uid } from '../../core/utils.js';

const SELECT_ENCUESTA = 'id, titulo, descripcion, preguntas, created_at, updated_at';
const SELECT_RONDA = 'id, encuesta_id, slug, abierta_en, cerrada, created_at';

export const encuestasApi = {
  async listEncuestas() {
    const { data, error } = await getClient().database
      .from('encuestas')
      .select(SELECT_ENCUESTA)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getEncuesta(id) {
    const { data, error } = await getClient().database
      .from('encuestas')
      .select(SELECT_ENCUESTA)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createEncuesta(datos) {
    const { data, error } = await getClient().database
      .from('encuestas')
      .insert([{
        titulo: trimText(datos.titulo),
        descripcion: trimText(datos.descripcion),
        preguntas: datos.preguntas || [],
      }])
      .select(SELECT_ENCUESTA)
      .single();
    if (error) throw error;
    return data;
  },

  // Si la encuesta ya tiene rondas, el trigger de BD rechaza el cambio de
  // "preguntas" con un mensaje ya pensado para mostrarse tal cual al
  // usuario (ver migración 043) — no se remapea el error acá.
  async updateEncuesta(id, datos) {
    const { data, error } = await getClient().database
      .from('encuestas')
      .update({
        titulo: trimText(datos.titulo),
        descripcion: trimText(datos.descripcion),
        preguntas: datos.preguntas || [],
      })
      .eq('id', id)
      .select(SELECT_ENCUESTA)
      .single();
    if (error) throw error;
    return data;
  },

  async softDeleteEncuesta(id) {
    const { error } = await getClient().database
      .from('encuestas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  // Rondas de una encuesta + cantidad de respuestas de cada una (mismo
  // patrón de conteo en dos pasos que empleados.js#conteosVinculos, en
  // vez de depender de un agregado embebido de PostgREST no verificado).
  async listRondas(encuestaId) {
    const db = getClient().database;
    const { data: rondas, error } = await db
      .from('encuesta_rondas')
      .select(SELECT_RONDA)
      .eq('encuesta_id', encuestaId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!rondas?.length) return [];

    const { data: respuestas, error: eResp } = await db
      .from('encuesta_respuestas')
      .select('ronda_id')
      .in('ronda_id', rondas.map((r) => r.id));
    if (eResp) throw eResp;

    const conteos = {};
    for (const r of respuestas || []) conteos[r.ronda_id] = (conteos[r.ronda_id] || 0) + 1;
    return rondas.map((r) => ({ ...r, n_respuestas: conteos[r.id] || 0 }));
  },

  async crearRonda(encuestaId) {
    const { data, error } = await getClient().database
      .from('encuesta_rondas')
      .insert([{ encuesta_id: encuestaId, slug: uid() }])
      .select(SELECT_RONDA)
      .single();
    if (error) throw error;
    return data;
  },

  async cerrarRonda(rondaId) {
    const { error } = await getClient().database
      .from('encuesta_rondas')
      .update({ cerrada: true })
      .eq('id', rondaId);
    if (error) throw error;
  },

  // Respuestas crudas de una ronda, para el resumen y el export.
  async listRespuestas(rondaId) {
    const { data, error } = await getClient().database
      .from('encuesta_respuestas')
      .select('id, respuestas, created_at')
      .eq('ronda_id', rondaId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
};
