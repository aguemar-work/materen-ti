// Barrel del API: los métodos viven en domains/* por dominio; este archivo
// conserva la superficie pública original (insforgeApi + getClient) para
// no tocar los imports de vistas y stores.
export { getClient } from './client.js';

import { empleadosApi } from './domains/empleados.js';
import { cuentasApi } from './domains/cuentas.js';
import { correosApi } from './domains/correos.js';
import { licenciasApi } from './domains/licencias.js';
import { equiposApi } from './domains/equipos.js';
import { equiposImportacionApi } from './domains/equiposImportacion.js';
import { catalogosApi } from './domains/catalogos.js';
import { ticketsApi } from './domains/tickets.js';
import { reportesTicketsApi } from './domains/reportesTickets.js';
import { dashboardApi } from './domains/dashboard.js';
import { staffApi } from './domains/staff.js';
import { accesosSensiblesApi } from './domains/accesosSensibles.js';
import { staffModulosApi } from './domains/staffModulos.js';
import { kbApi } from './domains/kb.js';
import { problemasApi } from './domains/problemas.js';
import { personalRegistrosApi } from './domains/personalRegistros.js';
import { encuestasApi } from './domains/encuestas.js';
import { notificacionesApi } from './domains/notificaciones.js';

export const insforgeApi = {
  mode: 'insforge',
  ...empleadosApi,
  ...cuentasApi,
  ...correosApi,
  ...licenciasApi,
  ...equiposApi,
  ...equiposImportacionApi,
  ...catalogosApi,
  ...ticketsApi,
  ...reportesTicketsApi,
  ...dashboardApi,
  ...staffApi,
  ...accesosSensiblesApi,
  ...staffModulosApi,
  ...kbApi,
  ...problemasApi,
  ...personalRegistrosApi,
  ...encuestasApi,
  ...notificacionesApi,
};
