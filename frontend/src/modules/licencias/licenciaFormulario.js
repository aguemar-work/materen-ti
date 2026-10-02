// Datos y reglas puras del formulario de licencia (LicenciaForm.vue): los
// valores iniciales de alta y de edición, los periodos de renovación y la
// validación del correo que se escribe para registrarlo "al vuelo". Extraído de
// LicenciaForm.vue al partirlo; no cambia ninguna regla.

export const PERIODOS = [
  { value: '', label: 'Sin definir' },
  { value: 1, label: 'Mensual' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Cada 6 meses' },
  { value: 12, label: 'Anual' },
  { value: 24, label: 'Cada 2 años' },
  { value: 36, label: 'Cada 3 años' },
];

export function formVacio() {
  return {
    software: '', tipo: 'suscripcion', cantidad: 1, empresa_id: '',
    proveedor: '', fecha_vencimiento: '', renovacion_meses: '',
    costo: '', moneda: 'PEN', cuenta_id: '', clave: '', notas: '',
  };
}

export function formDesdeLicencia(l) {
  return {
    software: l.software,
    tipo: l.tipo,
    cantidad: l.cantidad,
    empresa_id: l.empresa_id || '',
    proveedor: l.proveedor || '',
    fecha_vencimiento: l.fecha_vencimiento || '',
    renovacion_meses: l.renovacion_meses || '',
    costo: l.costo ?? '',
    moneda: l.moneda || 'PEN',
    cuenta_id: l.cuenta_id || '',
    // La clave actual nunca viaja al formulario: vacío = mantenerla
    clave: '',
    notas: l.notas || '',
  };
}

// Modo de acceso: 'ninguno' | 'login' (correo vinculado) | 'clave' (serial)
export function modoAccesoDe(l) {
  if (!l) return 'ninguno';
  return l.cuenta_id ? 'login' : (l.tiene_clave ? 'clave' : 'ninguno');
}

// Datos del correo que se registrará en Correos junto con la licencia.
export function correoNuevoVacio() {
  return { plataforma_id: '', tipo_cuenta: 'compartida', password: '' };
}

export function esCorreoValido(texto) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(texto ?? '').trim());
}
