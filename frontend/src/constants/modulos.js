// Re-export de compatibilidad: la lista de módulos configurables vive en
// `core/modulos.js` (registro único, consumido también por el sidebar en
// components/shared/navegacion.js). Los consumidores de Configuración·Staff
// (StaffModulosForm, StaffView) siguen importando desde acá.
export { MODULOS_CONFIGURABLES } from '../core/modulos.js';
