// Barrel del API: los métodos viven en domains/* por dominio; este archivo
// conserva la superficie pública original (insforgeApi + getClient) para
// no tocar los imports de vistas y stores.
export { getClient } from './client.js';

import { empleadosApi } from './domains/empleados.js';
import { cuentasApi } from './domains/cuentas.js';
import { correosApi } from './domains/correos.js';
import { licenciasApi } from './domains/licencias.js';
import { equiposApi } from './domains/equipos.js';
import { catalogosApi } from './domains/catalogos.js';
import { ticketsApi } from './domains/tickets.js';
import { dashboardApi } from './domains/dashboard.js';
import { staffApi } from './domains/staff.js';

export const insforgeApi = {
  mode: 'insforge',
  ...empleadosApi,
  ...cuentasApi,
  ...correosApi,
  ...licenciasApi,
  ...equiposApi,
  ...catalogosApi,
  ...ticketsApi,
  ...dashboardApi,
  ...staffApi,
};
