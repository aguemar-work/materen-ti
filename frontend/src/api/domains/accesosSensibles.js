// Dominio "accesos sensibles": credenciales de alta sensibilidad (accesos de
// equipos, correos de gerencia/TI...) con visibilidad más fina que Cuentas/
// Licencias — solo JEFE, y solo con permiso explícito por fila (ver
// accesos_sensibles_permisos, migración 024). El cifrado/descifrado pasa
// por la edge function "credenciales" (acciones encryptSensible /
// revelarAccesoSensible, clave CRED_KEY_SENSIBLE aislada) — ver
// api/passwords.js. Nunca se trae `password` en estos selects: se revela
// bajo demanda (auditado) igual que en Cuentas.
import { getClient } from '../client.js';
import { cifrarAccesoSensible } from '../passwords.js';

const SELECT_ACCESO = 'id, nombre, categoria, usuario, notas, created_at, updated_at';

export const accesosSensiblesApi = {
  // Todas las filas (RLS: solo JEFE las ve) + `puedeRevelar` por fila,
  // calculado a partir de los permisos reales del usuario actual — nunca
  // "adivinado" en el frontend.
  async listAccesosSensibles(userId) {
    const db = getClient().database;
    const [{ data: accesos, error: e1 }, { data: misPermisos, error: e2 }] = await Promise.all([
      db.from('accesos_sensibles').select(SELECT_ACCESO).order('nombre', { ascending: true }),
      db.from('accesos_sensibles_permisos').select('acceso_id').eq('staff_user_id', userId),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const idsConPermiso = new Set((misPermisos || []).map((p) => p.acceso_id));
    return (accesos || []).map((a) => ({ ...a, puedeRevelar: idsConPermiso.has(a.id) }));
  },

  // Quiénes tienen permiso sobre una fila puntual (para precargar el
  // multi-select al editar). La RLS ya exige que el usuario actual tenga
  // permiso sobre esta fila para poder leer cualquier permiso de ella.
  async permisosDeAcceso(accesoId) {
    const { data, error } = await getClient().database
      .from('accesos_sensibles_permisos')
      .select('staff_user_id')
      .eq('acceso_id', accesoId);
    if (error) throw error;
    return (data || []).map((p) => p.staff_user_id);
  },

  async crearAccesoSensible(datos, staffUserIds, creadorUserId) {
    const db = getClient().database;
    const password = datos.password ? await cifrarAccesoSensible(datos.password) : null;
    const { data, error } = await db
      .from('accesos_sensibles')
      .insert([{
        nombre: datos.nombre,
        categoria: datos.categoria,
        usuario: datos.usuario,
        password,
        notas: datos.notas || null,
      }])
      .select('id')
      .single();
    if (error) throw error;

    // El creador ya quedó con permiso automático (trigger de BD, no acá).
    // Solo hace falta insertar el resto de los elegidos en el multi-select.
    const extras = (staffUserIds || []).filter((id) => id && id !== creadorUserId);
    if (extras.length) {
      const { error: eExtras } = await db
        .from('accesos_sensibles_permisos')
        .insert(extras.map((staff_user_id) => ({ acceso_id: data.id, staff_user_id })));
      if (eExtras) throw eExtras;
    }
    return data;
  },

  async actualizarAccesoSensible(id, datos, staffUserIds) {
    const db = getClient().database;
    const updateData = {
      nombre: datos.nombre,
      categoria: datos.categoria,
      usuario: datos.usuario,
      notas: datos.notas || null,
    };
    // Campo vacío = mantener la contraseña actual; con texto = cambiarla.
    if (datos.password_cambiada) {
      updateData.password = datos.password ? await cifrarAccesoSensible(datos.password, id) : null;
    }
    const { error } = await db.from('accesos_sensibles').update(updateData).eq('id', id);
    if (error) throw error;

    // Reconciliar permisos: agregar los nuevos, quitar los destildados.
    const actuales = new Set(await accesosSensiblesApi.permisosDeAcceso(id));
    const deseados = new Set((staffUserIds || []).filter(Boolean));
    const aAgregar = [...deseados].filter((uid) => !actuales.has(uid));
    const aQuitar = [...actuales].filter((uid) => !deseados.has(uid));

    if (aAgregar.length) {
      const { error: eAdd } = await db
        .from('accesos_sensibles_permisos')
        .insert(aAgregar.map((staff_user_id) => ({ acceso_id: id, staff_user_id })));
      if (eAdd) throw eAdd;
    }
    if (aQuitar.length) {
      const { error: eDel } = await db
        .from('accesos_sensibles_permisos')
        .delete()
        .eq('acceso_id', id)
        .in('staff_user_id', aQuitar);
      if (eDel) throw eDel;
    }
  },

  async eliminarAccesoSensible(id) {
    const { error } = await getClient().database.from('accesos_sensibles').delete().eq('id', id);
    if (error) throw error;
  },
};
