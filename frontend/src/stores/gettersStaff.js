// Getters de staff compartidos por los stores de detalle (ticketDetalle,
// problemaDetalle): los dos cargan `staffLista` con el mismo RPC
// `staff_nombres()` y resuelven "nombre por id" igual. Estaban duplicados
// letra por letra en ambos (ARQ-17, ver docs/HISTORIAL-AUDITORIAS.md).
//
// Se usa con spread dentro de `getters` de un store de opciones:
//   getters: { ...gettersStaff, otroGetterPropio() {...} }
export const gettersStaff = {
  // staffLista ya viene solo con staff activo (staff_nombres(), migración
  // 061): staffActivo queda como alias por compatibilidad con la vista.
  staffActivo: (state) => state.staffLista,
  staffPorId() {
    const mapa = {};
    for (const s of this.staffActivo) mapa[s.user_id] = s.nombre;
    return mapa;
  },
};
