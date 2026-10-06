// Datos inventados del modo "maqueta" (`npm run dev:maqueta`): una fila por
// registro de cada tabla, con los nombres de columna reales (ver
// `migrations/*.sql` y los selects de `src/api/domains/*.js`). Las tablas van
// NORMALIZADAS, como en la base: los embeds `rel(...)` de cada select los arma
// `./client.js` a partir de las FK (`empleado_id`, `cuenta_id`, ...).
//
// Todo es ficticio: personas, DNI, RUC, correos. Ninguna fila lleva una
// contraseña ni una clave real — `cuentas.password` es null o el marcador
// 'maqueta', y ninguna acción de la maqueta lo revela.
//
// Las fechas se calculan relativas a HOY para que los estados derivados
// (licencia vencida / por vencer, garantías, alta reciente, ticket de +3 días)
// sigan siendo los mismos cualquier día que se abra la maqueta.

import { RPC_EQUIPOS } from './rpc-equipos.js';
import { RPC_EMPLEADOS } from './rpc-empleados.js';
import { RPC_LICENCIAS } from './rpc-licencias.js';
import { RPC_SOLICITUDES, definirActorSolicitudes } from './rpc-solicitudes.js';
import { RPC_KB, definirActorKb, calcularKpiKb } from './rpc-kb.js';
import { RPC_CAMBIOS, definirActorCambios } from './rpc-cambios.js';
import { RPC_PORTAL } from './rpc-portal.js';
import { RPC_REPORTES, definirActorReportes } from './rpc-reportes.js';
import { RPC_REPORTES_117 } from './rpc-reportes-117.js';
import { RPC_CATALOGO_TICKETS, definirActorCatalogoTickets, calcularPorReclasificar } from './rpc-catalogo-tickets.js';
import { crearDatosCambios } from './cambios-datos.js';
import { TIPOS as TIPOS_SOLICITUD, plantillaDe, plantillaPaso, pasoDePlantilla } from './solicitudes-plantilla.js';
import { ESCENARIO, resumenInicio } from './inicio.js';

const DIA_MS = 86400000;

function fecha(dias = 0) {
  const d = new Date(Date.now() + dias * DIA_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Marca de tiempo ISO de hace `dias` días y `horas` horas.
function hace(dias = 0, horas = 0) {
  return new Date(Date.now() - dias * DIA_MS - horas * 3600000).toISOString();
}

// Con `?maqueta=asistente` la sesión es la de Diego Huamán (ASISTENTE, sin los
// módulos licencias ni problemas): ver maqueta/inicio.js.
export const USUARIO_MAQUETA = ESCENARIO === 'asistente'
  ? { id: 'u-asis-1', email: 'dhuaman@materen.pe', emailVerified: true, profile: { name: 'Diego Huamán Rojas' } }
  : { id: 'u-jefe', email: 'jefe@materen.pe', emailVerified: true, profile: { name: 'Alejandro Guevara' } };
// Las RPC de solicitudes necesitan saber si quien actúa es jefe (omitir un paso obligatorio).
definirActorSolicitudes({ id: USUARIO_MAQUETA.id, esJefe: ESCENARIO !== 'asistente' });
// Lo mismo para la KEDB: un jefe publica el workaround; otro rol lo deja en revisión.
definirActorKb({ id: USUARIO_MAQUETA.id, esJefe: ESCENARIO !== 'asistente' });
// Y los Cambios (107): aprobar y rechazar son de un jefe; el libro anota el correo de quien actúa.
definirActorCambios({ id: USUARIO_MAQUETA.id, esJefe: ESCENARIO !== 'asistente', email: USUARIO_MAQUETA.email });
// Reportes (115): la RPC solo entrega "por técnico" al jefe y el alcance de otro técnico exige ese rol.
definirActorReportes({ id: USUARIO_MAQUETA.id, esJefe: ESCENARIO !== 'asistente' });
// Catálogo v2 (116): reclasificar y la vista de pendientes son solo del jefe.
definirActorCatalogoTickets({ id: USUARIO_MAQUETA.id, esJefe: ESCENARIO !== 'asistente', email: USUARIO_MAQUETA.email });

// ── Staff ───────────────────────────────────────────────────────────────────
const staff = [
  { user_id: 'u-jefe', nombre: 'Alejandro Guevara', rol: 'JEFE', activo: true, created_at: hace(400) },
  { user_id: 'u-asis-1', nombre: 'Diego Huamán Rojas', rol: 'ASISTENTE', activo: true, tecnico_mesa: true, created_at: hace(200) },
  { user_id: 'u-asis-2', nombre: 'Lucía Paredes Soto', rol: 'ASISTENTE', activo: true, tecnico_mesa: true, created_at: hace(90) },
  { user_id: 'u-asis-3', nombre: 'Kevin Ramos Álvarez', rol: 'ASISTENTE', activo: false, created_at: hace(2) },
];

const MODULOS = ['tickets', 'empleados', 'correos', 'licencias', 'equipos', 'base_conocimiento', 'problemas', 'encuestas'];

const staff_modulos_permisos = [
  ...MODULOS.map((modulo, i) => ({ id: `smp-j-${i}`, staff_user_id: 'u-jefe', modulo })),
  ...['tickets', 'empleados', 'correos', 'equipos', 'base_conocimiento'].map((modulo, i) => ({ id: `smp-a1-${i}`, staff_user_id: 'u-asis-1', modulo })),
  ...['tickets', 'base_conocimiento'].map((modulo, i) => ({ id: `smp-a2-${i}`, staff_user_id: 'u-asis-2', modulo })),
];

const staff_permisos = [
  { id: 'sp-1', staff_user_id: 'u-asis-1', permiso: 'credenciales.ver', created_at: hace(60) },
];

// ── Catálogos ───────────────────────────────────────────────────────────────
const empresas = [
  { id: 'emp-materen', nombre: 'Materen Constructora SAC', ruc: '20601234571', deleted_at: null, created_at: hace(500) },
  { id: 'emp-andes', nombre: 'Inmobiliaria Los Andes SAC', ruc: '20557891234', deleted_at: null, created_at: hace(500) },
  { id: 'emp-vialsur', nombre: 'Consorcio Vial Sur', ruc: '20609876543', deleted_at: null, created_at: hace(300) },
];

const areas_obras = [
  { id: 'ao-adm', nombre: 'Administración', descripcion: 'Contabilidad, tesorería y compras', deleted_at: null },
  { id: 'ao-ti', nombre: 'Tecnología de la Información', descripcion: 'Soporte y sistemas', deleted_at: null },
  { id: 'ao-rrhh', nombre: 'Recursos Humanos', descripcion: null, deleted_at: null },
  { id: 'ao-logistica', nombre: 'Logística', descripcion: 'Almacén y despacho', deleted_at: null },
  { id: 'ao-obra-mira', nombre: 'Obra Miraflores', descripcion: 'Edificio multifamiliar Av. Larco', deleted_at: null },
  { id: 'ao-obra-surco', nombre: 'Obra Surco', descripcion: 'Condominio Los Álamos', deleted_at: null },
];

const ubicaciones = [
  { id: 'ub-sede', nombre: 'Sede Central San Isidro', descripcion: 'Av. Javier Prado Este 1234, piso 6', tipo: 'sede', deleted_at: null },
  { id: 'ub-alm', nombre: 'Almacén Chorrillos', descripcion: 'Almacén general de obra', tipo: 'almacen', deleted_at: null },
  { id: 'ub-mira', nombre: 'Obra Miraflores', descripcion: 'Caseta de obra', tipo: 'obra', deleted_at: null },
  { id: 'ub-surco', nombre: 'Obra Surco', descripcion: null, tipo: 'obra', deleted_at: null },
  { id: 'ub-lab', nombre: 'Laboratorio de TI', descripcion: 'Taller de reparación', tipo: 'otro', deleted_at: null },
];

const plataformas = [
  { id: 'gmail', nombre: 'Gmail', icono: 'ti-brand-gmail', deleted_at: null },
  { id: 'bitrix24', nombre: 'Bitrix24', icono: 'ti-message-circle', deleted_at: null },
  { id: 'vpn', nombre: 'Vpn Forticlient', icono: 'ti-shield-lock', deleted_at: null },
  { id: 'erp', nombre: 'Erp Siscont', icono: 'ti-database', deleted_at: null },
  { id: 'office365', nombre: 'Microsoft 365', icono: 'ti-brand-office', deleted_at: null },
  { id: 'autodesk', nombre: 'Autodesk', icono: 'ti-ruler-measure', deleted_at: null },
];

const tipos_equipo = [
  { id: 'laptop', nombre: 'Laptop', campos_spec: ['Procesador', 'RAM', 'Disco', 'Sistema operativo'], accesorios_sugeridos: ['Cargador', 'Mochila', 'Mouse'], deleted_at: null },
  { id: 'desktop', nombre: 'Desktop', campos_spec: ['Procesador', 'RAM', 'Disco', 'Sistema operativo'], accesorios_sugeridos: ['Teclado', 'Mouse', 'Estabilizador'], deleted_at: null },
  { id: 'monitor', nombre: 'Monitor', campos_spec: ['Tamaño', 'Resolución'], accesorios_sugeridos: ['Cable HDMI', 'Cable de poder'], deleted_at: null },
  { id: 'impresora', nombre: 'Impresora', campos_spec: ['Tecnología', 'Conectividad'], accesorios_sugeridos: ['Cable USB', 'Cable de poder'], deleted_at: null },
  { id: 'celular', nombre: 'Celular', campos_spec: ['Almacenamiento', 'RAM', 'IMEI'], accesorios_sugeridos: ['Cargador', 'Funda', 'Chip'], deleted_at: null },
  { id: 'tablet', nombre: 'Tablet', campos_spec: ['Almacenamiento', 'RAM'], accesorios_sugeridos: ['Cargador', 'Funda'], deleted_at: null },
  { id: 'otro', nombre: 'Otro', campos_spec: [], accesorios_sugeridos: [], deleted_at: null },
];

const catalogo_almacen = [
  { id: 'cat-01', codigo: 'ACC-0012', descripcion: 'Cargador Lenovo 65W USB-C', deleted_at: null },
  { id: 'cat-02', codigo: 'ACC-0031', descripcion: 'Mochila para laptop 15.6"', deleted_at: null },
  { id: 'cat-03', codigo: 'ACC-0045', descripcion: 'Mouse inalámbrico Logitech M170', deleted_at: null },
  { id: 'cat-04', codigo: 'ACC-0058', descripcion: 'Cable HDMI 1.8 m', deleted_at: null },
  { id: 'cat-05', codigo: 'ACC-0077', descripcion: 'Funda antichoque para celular', deleted_at: null },
  { id: 'cat-06', codigo: null, descripcion: 'Chip Claro corporativo', deleted_at: null },
];

// Catálogo de tickets v2 (migración 116): 7 categorías y 31 subcategorías con
// tipo y prioridad sugeridos (`urgente` se lee «Crítica»). `aviso` (114):
// advertencia fija que ve el solicitante al elegir la categoría o la
// subcategoría (gana el de la subcategoría). tests/maqueta-catalogo-tickets.test.js
// compara esta lista con la tabla de la migración 116.
const AVISO_CAMARAS = 'Deberá adjuntar la autorización de gerencia. TI no es responsable del contenido: solo administra el sistema.';
const AVISO_GRABACION = 'Adjunte la autorización de Gerencia. TI administra el sistema de cámaras, pero no es responsable del contenido de las grabaciones.';
const AVISO_INGRESO = 'Si su cuenta quedó bloqueada por intentos fallidos, elija «Desbloquear cuenta».';

const categorias_ticket = [
  { id: 'accesos_cuentas', nombre: 'Accesos y Cuentas', servicio_id: 'accesos', aviso: null, deleted_at: null },
  { id: 'equipos', nombre: 'Hardware y Periféricos', servicio_id: 'equipos', aviso: null, deleted_at: null },
  { id: 'red', nombre: 'Redes y Conectividad', servicio_id: 'red', aviso: null, deleted_at: null },
  { id: 'software', nombre: 'Software y Aplicaciones', servicio_id: 'licencias', aviso: null, deleted_at: null },
  { id: 'seguridad', nombre: 'Seguridad de la Información', servicio_id: 'seguridad', aviso: null, deleted_at: null },
  { id: 'cctv', nombre: 'Videovigilancia (CCTV)', servicio_id: 'cctv', aviso: null, deleted_at: null },
  { id: 'otro', nombre: 'Consultas y Capacitación', servicio_id: null, aviso: null, deleted_at: null },
];

// [id, categoría, nombre, tipo, prioridad, aviso]
const subcategorias_ticket = [
  ['sub-01', 'accesos_cuentas', 'Restablecer contraseña', 'solicitud', 'media'],
  ['sub-12', 'accesos_cuentas', 'Desbloquear cuenta', 'solicitud', 'alta'],
  ['sub-13', 'accesos_cuentas', 'No puedo ingresar al sistema', 'incidente', 'alta', AVISO_INGRESO],
  ['sub-14', 'accesos_cuentas', 'Solicitar permisos o accesos (sistemas / carpetas)', 'solicitud', 'media'],
  ['sub-02', 'accesos_cuentas', 'Crear cuenta de usuario (alta)', 'solicitud', 'media'],
  ['sub-15', 'accesos_cuentas', 'Desactivar cuenta de usuario (baja)', 'solicitud', 'alta'],
  ['sub-16', 'equipos', 'Equipo no enciende', 'incidente', 'alta'],
  ['sub-03', 'equipos', 'Equipo lento o con fallas', 'incidente', 'media'],
  ['sub-17', 'equipos', 'Impresora o escáner no funciona', 'incidente', 'media'],
  ['sub-18', 'equipos', 'Accesorio dañado o faltante', 'incidente', 'baja'],
  ['sub-19', 'equipos', 'Solicitar tóner o insumos', 'solicitud', 'baja'],
  ['sub-04', 'equipos', 'Solicitar equipo o accesorio nuevo', 'solicitud', 'baja'],
  ['sub-07', 'red', 'Sin internet o WiFi', 'incidente', 'alta'],
  ['sub-08', 'red', 'VPN no conecta', 'incidente', 'alta'],
  ['sub-20', 'red', 'Red lenta o intermitente', 'incidente', 'media'],
  ['sub-21', 'red', 'Solicitar punto de red, WiFi o VPN', 'solicitud', 'baja'],
  ['sub-06', 'software', 'Error o falla en aplicación', 'incidente', 'media'],
  ['sub-22', 'software', 'Correo electrónico / Office 365', 'incidente', 'alta'],
  ['sub-23', 'software', 'Licencia vencida o no se activa', 'incidente', 'media'],
  ['sub-05', 'software', 'Instalar o actualizar software', 'solicitud', 'baja'],
  ['sub-24', 'software', 'Solicitar licencia nueva', 'solicitud', 'baja'],
  ['sub-25', 'seguridad', 'Virus o malware sospechoso', 'incidente', 'urgente'],
  ['sub-26', 'seguridad', 'Correo sospechoso / phishing', 'incidente', 'alta'],
  ['sub-27', 'seguridad', 'Pérdida o robo de equipo', 'incidente', 'urgente'],
  ['sub-28', 'seguridad', 'Respaldo o recuperación de archivos', 'solicitud', 'media'],
  ['sub-11', 'cctv', 'Cámara sin imagen o con falla', 'incidente', 'alta'],
  ['sub-29', 'cctv', 'Solicitar acceso para visualizar cámaras', 'solicitud', 'media', AVISO_CAMARAS],
  ['sub-10', 'cctv', 'Solicitar revisión o extracción de grabación', 'solicitud', 'media', AVISO_GRABACION],
  ['sub-30', 'otro', 'Consulta o asesoría', 'solicitud', 'baja'],
  ['sub-31', 'otro', 'Solicitar capacitación', 'solicitud', 'baja'],
  ['sub-09', 'otro', 'Otro (no clasificado)', 'solicitud', 'baja'],
].map(([id, categoria_id, nombre, tipo_sugerido, prioridad_sugerida, aviso = null]) => ({
  id, categoria_id, nombre, tipo_sugerido, prioridad_sugerida, aviso, deleted_at: null,
}));

// ── Empleados ───────────────────────────────────────────────────────────────
function empleado(id, nombres, apellidos, dni, cargo, empresa_id, area_obra_id, ubicacion_id, estado, diasAlta, extra = {}) {
  const usuario = `${nombres[0]}${apellidos.split(' ')[0]}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return {
    id, nombres, apellidos, dni, cargo, empresa_id, area_obra_id, ubicacion_id, estado,
    fecha_alta: fecha(-diasAlta),
    telefono: `01${dni.slice(1, 8)}`,
    whatsapp: `9${dni.slice(0, 8)}`,
    correo_personal: `${usuario}@correo-ficticio.pe`,
    notas: '',
    deleted_at: null,
    created_at: hace(diasAlta),
    updated_at: hace(Math.max(0, diasAlta - 10)),
    ...extra,
  };
}

const empleados = [
  empleado('e01', 'Rosa', 'Quispe Mamani', '45871236', 'Asistente Administrativa', 'emp-materen', 'ao-adm', 'ub-sede', 'Activo', 420),
  empleado('e02', 'Jorge', 'Huamán Ccori', '41236987', 'Ingeniero Residente', 'emp-materen', 'ao-obra-mira', 'ub-mira', 'Activo', 610, { notas: 'Responsable de obra, turno mañana.' }),
  empleado('e03', 'María Fernanda', 'Salazar Ríos', '70125489', 'Jefa de Recursos Humanos', 'emp-materen', 'ao-rrhh', 'ub-sede', 'Activo', 890),
  empleado('e04', 'Luis Alberto', 'Chávez Paredes', '10254789', 'Maestro de Obra', 'emp-vialsur', 'ao-obra-surco', 'ub-surco', 'Activo', 150),
  empleado('e05', 'Carmen Rosa', 'Flores Huanca', '42587413', 'Contadora General', 'emp-andes', 'ao-adm', 'ub-sede', 'Activo', 1200),
  empleado('e06', 'Pedro', 'Ticona Apaza', '46325874', 'Almacenero', 'emp-materen', 'ao-logistica', 'ub-alm', 'Inactivo', 700, { notas: 'Baja por término de contrato. Pendiente devolver celular.' }),
  empleado('e07', 'Ana Lucía', 'Torres Vílchez', '72589631', 'Arquitecta Proyectista', 'emp-andes', 'ao-obra-mira', 'ub-mira', 'Activo', 3),
  empleado('e08', 'Miguel Ángel', 'Rojas Cárdenas', '44785213', 'Prevencionista SSOMA', 'emp-vialsur', 'ao-obra-surco', 'ub-surco', 'Suspendido', 320),
  empleado('e09', 'Sofía', 'Mendoza Laura', '75963214', 'Asistente de Logística', 'emp-materen', 'ao-logistica', 'ub-alm', 'Activo', 12),
  empleado('e10', 'Raúl', 'Condori Mamani', '40125896', 'Topógrafo', 'emp-vialsur', 'ao-obra-surco', null, 'Inactivo', 980),
  empleado('e11', 'Gabriela', 'Núñez Pinto', '73214569', 'Analista de Costos', 'emp-materen', 'ao-adm', 'ub-sede', 'Activo', 260),
  empleado('e12', 'Julio César', 'Vargas Quispe', '48521479', 'Asistente de TI', 'emp-materen', 'ao-ti', 'ub-lab', 'Activo', 5),
];

// ── Cuentas y asignaciones ──────────────────────────────────────────────────
// password: null = "sin contraseña registrada"; 'maqueta' = marcador de que
// existe un valor cifrado (nunca se descifra en este modo).
function cuenta(id, plataforma_id, usuario, tipo_cuenta, extra = {}) {
  return {
    id, plataforma_id, usuario, tipo_cuenta,
    password: 'maqueta',
    url: '',
    notas: '',
    last_password_change: hace(45),
    requiere_rotacion: false,
    deleted_at: null,
    created_at: hace(200),
    ...extra,
  };
}

const cuentas = [
  cuenta('c01', 'gmail', 'rquispe@materen.pe', 'personal', { url: 'https://mail.google.com' }),
  cuenta('c02', 'bitrix24', 'rquispe', 'personal', { url: 'https://materen.bitrix24.es' }),
  cuenta('c03', 'gmail', 'jhuaman@materen.pe', 'personal'),
  cuenta('c04', 'vpn', 'jhuaman', 'personal', { requiere_rotacion: true, notas: 'Acceso remoto a planos' }),
  cuenta('c05', 'erp', 'msalazar', 'personal', { last_password_change: hace(120) }),
  cuenta('c06', 'gmail', 'cflores@materen.pe', 'personal'),
  cuenta('c07', 'erp', 'cflores', 'personal', { password: null, last_password_change: null }),
  cuenta('c08', 'gmail', 'almacen.chorrillos@materen.pe', 'reutilizable', { notas: 'Correo del puesto de almacén' }),
  cuenta('c09', 'gmail', 'obra.miraflores@materen.pe', 'compartida', { requiere_rotacion: true, notas: 'Buzón de obra, lo revisan residente y maestro' }),
  cuenta('c10', 'office365', 'licencias.m365@materen.pe', 'compartida', { url: 'https://admin.microsoft.com', notas: 'Titular de la suscripción Microsoft 365' }),
  cuenta('c11', 'autodesk', 'autodesk.materen@materen.pe', 'compartida', { url: 'https://manage.autodesk.com' }),
  cuenta('c12', 'gmail', 'rrhh.postulaciones@materen.pe', 'reutilizable', { requiere_rotacion: true, notas: 'Liberada tras la salida del anterior titular' }),
  cuenta('c13', 'vpn', 'soporte.ti', 'compartida', { password: null, last_password_change: null }),
  cuenta('c14', 'gmail', 'gnunez@materen.pe', 'personal'),
  cuenta('c15', 'bitrix24', 'jvargas', 'personal', { created_at: hace(4) }),
  cuenta('c16', 'erp', 'mrojas', 'personal'),
];

function asigCuenta(id, cuenta_id, empleado_id, diasInicio, diasFin = null, notas = null) {
  return {
    id, cuenta_id, empleado_id,
    fecha_inicio: fecha(-diasInicio),
    fecha_fin: diasFin === null ? null : fecha(-diasFin),
    notas,
    created_at: hace(diasInicio),
  };
}

const asignaciones_cuenta = [
  asigCuenta('ac01', 'c01', 'e01', 400),
  asigCuenta('ac02', 'c02', 'e01', 400),
  asigCuenta('ac03', 'c03', 'e02', 600),
  asigCuenta('ac04', 'c04', 'e02', 580),
  asigCuenta('ac05', 'c05', 'e03', 880),
  asigCuenta('ac06', 'c06', 'e05', 1190),
  asigCuenta('ac07', 'c07', 'e05', 1190),
  asigCuenta('ac08', 'c08', 'e06', 690, 30, 'Baja del empleado'),
  asigCuenta('ac09', 'c08', 'e09', 10, null, 'Traspaso a otro empleado'),
  asigCuenta('ac10', 'c09', 'e02', 300),
  asigCuenta('ac11', 'c09', 'e04', 140),
  asigCuenta('ac12', 'c10', 'e01', 380),
  asigCuenta('ac13', 'c10', 'e03', 380),
  asigCuenta('ac14', 'c10', 'e05', 380),
  asigCuenta('ac15', 'c10', 'e11', 250),
  asigCuenta('ac16', 'c11', 'e02', 200),
  asigCuenta('ac17', 'c11', 'e11', 240),
  asigCuenta('ac18', 'c12', 'e10', 900, 60, 'Baja del empleado'),
  asigCuenta('ac19', 'c13', 'e03', 100),
  asigCuenta('ac20', 'c14', 'e11', 255),
  asigCuenta('ac21', 'c15', 'e12', 4),
  // e08 (Suspendido): una personal y una compartida con la rotación pendiente.
  asigCuenta('ac22', 'c16', 'e08', 300),
  asigCuenta('ac23', 'c09', 'e08', 250),
];

// ── Licencias ───────────────────────────────────────────────────────────────
function licencia(id, software, extra = {}) {
  return {
    id, software,
    tipo: 'suscripcion',
    cantidad: 1,
    empresa_id: 'emp-materen',
    proveedor: '',
    fecha_vencimiento: fecha(180),
    renovacion_meses: 12,
    costo: null,
    moneda: null,
    cuenta_id: null,
    clave: null,
    tiene_clave: false,
    notas: '',
    deleted_at: null,
    created_at: hace(300),
    ...extra,
  };
}

const licencias = [
  licencia('l01', 'Microsoft 365 Business Standard', { cantidad: 10, proveedor: 'Microsoft', fecha_vencimiento: fecha(120), costo: 1850, moneda: 'USD', cuenta_id: 'c10' }),
  licencia('l02', 'AutoCAD 2026', { cantidad: 3, proveedor: 'Autodesk', fecha_vencimiento: fecha(12), costo: 6240, moneda: 'USD', cuenta_id: 'c11', notas: 'Renovar antes del cierre de mes' }),
  licencia('l03', 'ESET Endpoint Security', { cantidad: 25, proveedor: 'Distribuidora Andina SAC', fecha_vencimiento: fecha(-8), costo: 3200, moneda: 'PEN', tiene_clave: true }),
  licencia('l04', 'WinRAR', { tipo: 'perpetua', cantidad: 5, proveedor: 'win.rar GmbH', fecha_vencimiento: null, renovacion_meses: null, costo: 145, moneda: 'USD', tiene_clave: true }),
  licencia('l05', 'S10 Costos y Presupuestos', { cantidad: 4, empresa_id: 'emp-andes', proveedor: 'S10 Perú', fecha_vencimiento: fecha(25), costo: 4800, moneda: 'PEN', tiene_clave: true }),
  licencia('l06', 'Adobe Acrobat Pro', { cantidad: 2, proveedor: 'Adobe', fecha_vencimiento: fecha(210), renovacion_meses: 12, costo: 480, moneda: 'USD' }),
  licencia('l07', 'SketchUp Pro', { cantidad: 1, empresa_id: 'emp-vialsur', proveedor: 'Trimble', fecha_vencimiento: fecha(-40), costo: 349, moneda: 'USD', notas: 'Evaluar si se renueva' }),
];

function asigLicencia(id, licencia_id, empleado_id, diasInicio, diasFin = null) {
  return {
    id, licencia_id, empleado_id,
    fecha_inicio: fecha(-diasInicio),
    fecha_fin: diasFin === null ? null : fecha(-diasFin),
    notas: null,
    created_at: hace(diasInicio),
  };
}

const asignaciones_licencia = [
  asigLicencia('al01', 'l03', 'e01', 300),
  asigLicencia('al02', 'l03', 'e02', 300),
  asigLicencia('al03', 'l03', 'e03', 300),
  asigLicencia('al04', 'l03', 'e05', 300),
  asigLicencia('al05', 'l03', 'e11', 250),
  asigLicencia('al06', 'l04', 'e05', 500),
  asigLicencia('al07', 'l05', 'e11', 240),
  asigLicencia('al08', 'l05', 'e05', 240),
  asigLicencia('al09', 'l06', 'e03', 90),
  asigLicencia('al10', 'l07', 'e10', 400, 60),
  asigLicencia('al11', 'l03', 'e08', 280),
];

// ── Equipos ─────────────────────────────────────────────────────────────────
function equipo(id, codigo, tipo_id, marca, modelo, serie, estado, extra = {}) {
  return {
    id, codigo, tipo_id, marca, modelo, serie, estado,
    codigo_almacen: `AF-${codigo.replace('-', '')}`,
    empresa_id: 'emp-materen',
    fecha_compra: fecha(-500),
    costo: null,
    moneda: null,
    garantia_hasta: fecha(300),
    specs: {},
    accesorios: [],
    fotos: [],
    notas: '',
    tiene_asignacion_activa: false,
    deleted_at: null,
    created_at: hace(500),
    ...extra,
  };
}

const FOTO_EJEMPLO = (texto) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#e5e7eb"/>`
  + `<text x="160" y="126" font-family="sans-serif" font-size="18" text-anchor="middle" fill="#6b7280">${texto}</text></svg>`,
)}`;

const equipos = [
  equipo('q01', 'LAP-001', 'laptop', 'Lenovo', 'ThinkPad E14 Gen 5', 'PF4K2L9X', 'operativo', {
    costo: 4250, moneda: 'PEN', garantia_hasta: fecha(20), tiene_asignacion_activa: true,
    fotos: [{ url: FOTO_EJEMPLO('Foto 1 (maqueta)'), key: 'maq-q01-1' }, { url: FOTO_EJEMPLO('Foto 2 (maqueta)'), key: 'maq-q01-2' }],
    specs: { Procesador: 'Intel Core i5-1335U', RAM: '16 GB', Disco: 'SSD 512 GB', 'Sistema operativo': 'Windows 11 Pro' },
  }),
  equipo('q02', 'LAP-002', 'laptop', 'Hp', 'ProBook 450 G9', '5CD2381KQW', 'operativo', {
    costo: 3890, moneda: 'PEN', tiene_asignacion_activa: true,
    specs: { Procesador: 'Intel Core i7-1255U', RAM: '16 GB', Disco: 'SSD 1 TB', 'Sistema operativo': 'Windows 11 Pro' },
  }),
  equipo('q03', 'LAP-003', 'laptop', 'Dell', 'Latitude 5440', 'HX7D2Y3', 'operativo', {
    costo: 4600, moneda: 'PEN', fecha_compra: fecha(-20), garantia_hasta: fecha(1075),
    specs: { Procesador: 'Intel Core i5-1345U', RAM: '16 GB', Disco: 'SSD 512 GB', 'Sistema operativo': 'Windows 11 Pro' },
    notas: 'Nuevo, en almacén para la próxima alta',
  }),
  equipo('q04', 'LAP-004', 'laptop', 'Lenovo', 'IdeaPad 3 15ITL6', 'MP1Z8K4R', 'en_reparacion', {
    garantia_hasta: fecha(-5), notas: 'Pantalla parpadea, enviado a servicio técnico',
    specs: { Procesador: 'Intel Core i3-1115G4', RAM: '8 GB', Disco: 'SSD 256 GB', 'Sistema operativo': 'Windows 11 Home' },
  }),
  equipo('q05', 'DES-001', 'desktop', 'Hp', 'ProDesk 400 G7', 'MXL1234ABC', 'operativo', {
    empresa_id: 'emp-andes', tiene_asignacion_activa: true,
    specs: { Procesador: 'Intel Core i5-10500', RAM: '8 GB', Disco: 'SSD 480 GB', 'Sistema operativo': 'Windows 10 Pro' },
  }),
  equipo('q06', 'MON-001', 'monitor', 'Lg', '24MK430H-B', '203NTKF4A512', 'operativo', {
    tiene_asignacion_activa: true, specs: { Tamaño: '24"', Resolución: '1920x1080' },
  }),
  equipo('q07', 'IMP-001', 'impresora', 'Epson', 'EcoTank L3250', 'X8HK012345', 'operativo', {
    tiene_asignacion_activa: true, specs: { Tecnología: 'Tinta continua', Conectividad: 'Wi-Fi / USB' },
  }),
  equipo('q08', 'CEL-001', 'celular', 'Samsung', 'Galaxy A34 5G', 'R58W12ABCDE', 'operativo', {
    tiene_asignacion_activa: true, specs: { Almacenamiento: '128 GB', RAM: '6 GB', IMEI: '350000000000001' },
  }),
  equipo('q09', 'CEL-002', 'celular', 'Xiaomi', 'Redmi Note 12', '41234/ABCD5678', 'de_baja', {
    notas: 'Placa dañada por humedad, dado de baja', specs: { Almacenamiento: '128 GB', RAM: '4 GB', IMEI: '350000000000002' },
  }),
  equipo('q10', 'TAB-001', 'tablet', 'Samsung', 'Galaxy Tab A8', 'R9PT1234XYZ', 'operativo', {
    garantia_hasta: fecha(10), tiene_asignacion_activa: true, specs: { Almacenamiento: '64 GB', RAM: '4 GB' },
  }),
  equipo('q11', 'LAP-005', 'laptop', 'Asus', 'VivoBook 15 X1502', 'N3NRCX012345', 'perdido', {
    notas: 'Reportado como robado en obra (denuncia policial adjunta)',
  }),
  equipo('q12', 'DES-002', 'desktop', 'Lenovo', 'ThinkCentre M70s', 'S1ABCD23', 'operativo', {
    tiene_asignacion_activa: true, specs: { Procesador: 'Intel Core i7-12700', RAM: '32 GB', Disco: 'SSD 1 TB', 'Sistema operativo': 'Windows 11 Pro' },
  }),
];

const equipo_accesorios = [
  { id: 'ea01', equipo_id: 'q01', catalogo_id: 'cat-01', codigo: 'ACC-0012', descripcion: 'Cargador Lenovo 65W USB-C', cantidad: 1, orden: 0 },
  { id: 'ea02', equipo_id: 'q01', catalogo_id: 'cat-02', codigo: 'ACC-0031', descripcion: 'Mochila para laptop 15.6"', cantidad: 1, orden: 1 },
  { id: 'ea03', equipo_id: 'q01', catalogo_id: 'cat-03', codigo: 'ACC-0045', descripcion: 'Mouse inalámbrico Logitech M170', cantidad: 1, orden: 2 },
  { id: 'ea04', equipo_id: 'q02', catalogo_id: null, codigo: null, descripcion: 'Cargador HP 65W', cantidad: 1, orden: 0 },
  { id: 'ea05', equipo_id: 'q06', catalogo_id: 'cat-04', codigo: 'ACC-0058', descripcion: 'Cable HDMI 1.8 m', cantidad: 2, orden: 0 },
  { id: 'ea06', equipo_id: 'q08', catalogo_id: 'cat-05', codigo: 'ACC-0077', descripcion: 'Funda antichoque para celular', cantidad: 1, orden: 0 },
  { id: 'ea07', equipo_id: 'q08', catalogo_id: 'cat-06', codigo: null, descripcion: 'Chip Claro corporativo', cantidad: 1, orden: 1 },
];

function asigEquipo(id, equipo_id, destino, diasInicio, diasFin = null, extra = {}) {
  return {
    id, equipo_id,
    empleado_id: destino.startsWith('e') ? destino : null,
    ubicacion_id: destino.startsWith('ub-') ? destino : null,
    fecha_inicio: fecha(-diasInicio),
    fecha_fin: diasFin === null ? null : fecha(-diasFin),
    condicion_entrega: 'Buen estado',
    condicion_devolucion: null,
    motivo_cierre: null,
    created_at: hace(diasInicio),
    ...extra,
  };
}

const asignaciones_equipo = [
  asigEquipo('ae01', 'q01', 'e01', 380, null, { condicion_entrega: 'Buen estado, con cargador' }),
  asigEquipo('ae02', 'q02', 'e02', 420, null, { condicion_entrega: 'Nuevo, con cargador' }),
  asigEquipo('ae03', 'q05', 'e05', 700),
  asigEquipo('ae04', 'q06', 'ub-sede', 300),
  asigEquipo('ae05', 'q07', 'ub-mira', 150),
  asigEquipo('ae06', 'q08', 'e06', 600, null, { condicion_entrega: 'Nuevo en caja' }),
  asigEquipo('ae07', 'q12', 'e03', 200),
  asigEquipo('ae08', 'q04', 'e11', 400, 15, { condicion_devolucion: 'Pantalla con falla', motivo_cierre: 'devolucion' }),
  asigEquipo('ae09', 'q10', 'e10', 500, 60, { condicion_devolucion: 'Buen estado', motivo_cierre: 'devolucion' }),
  asigEquipo('ae10', 'q11', 'e04', 120, 30, { motivo_cierre: 'perdida' }),
  // Historial de LAP-001: primero la tuvo Jorge, luego Rosa (acta de entrega firmada de cada una).
  asigEquipo('ae11', 'q01', 'e02', 460, 380, { condicion_devolucion: 'Con rayones en la tapa', motivo_cierre: 'cambio_equipo' }),
  // e08 (Suspendido) conserva una tablet; el expediente la muestra en custodia.
  asigEquipo('ae12', 'q10', 'e08', 40),
];

// Kardex con actores (user_id + user_email) y uno heredado sin actor
// ("no registrado (legado)"): los eventos de antes de la auditoría de actor.
const JEFE = { user_id: 'u-jefe', user_email: 'jefe@materen.pe' };
const DIEGO = { user_id: 'u-asis-1', user_email: 'dhuaman@materen.pe' };
const LUCIA = { user_id: 'u-asis-2', user_email: 'lparedes@materen.pe' };
const LEGADO = { user_id: null, user_email: null };

const eventos_equipo = [
  { id: 'ev01', equipo_id: 'q03', evento: 'registrado', detalle: 'Código LAP-003', ...JEFE, created_at: hace(20) },
  { id: 'ev01b', equipo_id: 'q03', evento: 'verificado', detalle: 'Verificado físicamente en Almacén Chorrillos', ...DIEGO, created_at: hace(6) },
  { id: 'ev02', equipo_id: 'q04', evento: 'devuelto', detalle: 'Devuelto por Gabriela Núñez Pinto — Pantalla con falla', ...DIEGO, created_at: hace(15) },
  { id: 'ev03', equipo_id: 'q04', evento: 'estado_cambiado', detalle: 'De "operativo" a "en_reparacion"', ...DIEGO, created_at: hace(15) },
  { id: 'ev03b', equipo_id: 'q04', evento: 'registrado', detalle: 'Código LAP-004', ...LEGADO, created_at: hace(500) },
  { id: 'ev03c', equipo_id: 'q04', evento: 'asignado', detalle: 'Entregado a Gabriela Núñez Pinto — Buen estado', ...LEGADO, created_at: hace(400) },
  { id: 'ev04', equipo_id: 'q11', evento: 'devuelto', detalle: 'Devuelto por Luis Alberto Chávez Paredes — pérdida', ...JEFE, created_at: hace(30) },
  { id: 'ev05', equipo_id: 'q11', evento: 'estado_cambiado', detalle: 'De "operativo" a "perdido"', ...JEFE, created_at: hace(30) },
  { id: 'ev06', equipo_id: 'q10', evento: 'devuelto', detalle: 'Devuelto por Raúl Condori Mamani — Buen estado', ...JEFE, created_at: hace(60) },
  { id: 'ev07', equipo_id: 'q09', evento: 'estado_cambiado', detalle: 'De "operativo" a "de_baja"', ...JEFE, created_at: hace(75) },
  { id: 'ev08', equipo_id: 'q07', evento: 'asignado', detalle: 'Ubicado en Obra Miraflores', ...LUCIA, created_at: hace(150) },
  // LAP-001: registro, primer portador, cambio de equipo, segundo portador con acta, verificación.
  { id: 'ev09a', equipo_id: 'q01', evento: 'registrado', detalle: 'Código LAP-001', ...LEGADO, created_at: hace(461) },
  { id: 'ev09b', equipo_id: 'q01', evento: 'asignado', detalle: 'Entregado a Jorge Huamán Ccori — Nuevo, con cargador', ...JEFE, created_at: hace(460) },
  { id: 'ev09c', equipo_id: 'q01', evento: 'acta_adjuntada', detalle: 'Acta de entrega firmada adjuntada (firmada el 20/07/2025)', ...JEFE, created_at: hace(458) },
  { id: 'ev09d', equipo_id: 'q01', evento: 'devuelto', detalle: 'Devuelto por Jorge Huamán Ccori — Con rayones en la tapa', ...DIEGO, created_at: hace(380) },
  { id: 'ev09', equipo_id: 'q01', evento: 'asignado', detalle: 'Entregado a Rosa Quispe Mamani — Buen estado, con cargador', ...JEFE, created_at: hace(380) },
  { id: 'ev09e', equipo_id: 'q01', evento: 'acta_adjuntada', detalle: 'Acta de entrega firmada adjuntada (firmada el 12/08/2025)', ...DIEGO, created_at: hace(378) },
  { id: 'ev09f', equipo_id: 'q01', evento: 'verificado', detalle: 'Verificado físicamente en Sede Central San Isidro — conforme', ...DIEGO, created_at: hace(35) },
  { id: 'ev10', equipo_id: 'q02', evento: 'asignado', detalle: 'Entregado a Jorge Huamán Ccori — Nuevo, con cargador', ...JEFE, created_at: hace(420) },
  // Entregas que el expediente de cada persona necesita ver en su libro.
  { id: 'evx01', equipo_id: 'q08', evento: 'asignado', detalle: 'Entregado a Pedro Ticona Apaza — Nuevo en caja', ...JEFE, created_at: hace(600) },
  { id: 'evx02', equipo_id: 'q10', evento: 'asignado', detalle: 'Entregado a Miguel Ángel Rojas Cárdenas — Buen estado', ...DIEGO, created_at: hace(40) },
  { id: 'evx03', equipo_id: 'q05', evento: 'asignado', detalle: 'Entregado a Carmen Rosa Flores Huanca — Buen estado', ...JEFE, created_at: hace(700) },
  { id: 'evx04', equipo_id: 'q12', evento: 'asignado', detalle: 'Entregado a María Fernanda Salazar Ríos — Buen estado', ...LUCIA, created_at: hace(200) },
];

// Actas de entrega/devolución firmadas en físico y subidas (migración 110).
const actas = [
  { id: 'act01', asignacion_equipo_id: 'ae01', tipo: 'entrega', empleado_id: 'e01', equipo_id: 'q01', tamano_bytes: 482113, firmado_at: fecha(-378), subido_por: 'u-asis-1', created_at: hace(378), deleted_at: null },
  { id: 'act02', asignacion_equipo_id: 'ae11', tipo: 'entrega', empleado_id: 'e02', equipo_id: 'q01', tamano_bytes: 351200, firmado_at: fecha(-458), subido_por: 'u-jefe', created_at: hace(458), deleted_at: null },
  { id: 'act03', asignacion_equipo_id: 'ae02', tipo: 'entrega', empleado_id: 'e02', equipo_id: 'q02', tamano_bytes: 402880, firmado_at: fecha(-419), subido_por: 'u-jefe', created_at: hace(419), deleted_at: null },
];

const equipos_importacion = [
  {
    id: 'imp01', raw: { 'CODIGO': 'KAPO-0451', 'DESCRIPCION': 'LAPTOP TOSHIBA SATELLITE', 'SERIE': 'ZX1234' },
    duplicado_kapo: false, codigo: 'LAP-006', tipo_id: 'laptop', marca: 'Toshiba', modelo: 'Satellite L45', serie: 'ZX1234',
    costo: 2100, fecha_compra: fecha(-1400), estado: 'operativo', notas: '', modo: 'disponible', empleado_id: null, ubicacion_id: null, created_at: hace(1),
  },
  {
    id: 'imp02', raw: { 'CODIGO': 'KAPO-0452', 'DESCRIPCION': 'IMPRESORA BROTHER', 'SERIE': 'BR99887' },
    duplicado_kapo: true, codigo: 'IMP-002', tipo_id: 'impresora', marca: 'Brother', modelo: 'HL-1212W', serie: 'BR99887',
    costo: null, fecha_compra: null, estado: 'operativo', notas: 'Posible duplicado', modo: 'ubicacion', empleado_id: null, ubicacion_id: 'ub-alm', created_at: hace(1),
  },
  {
    id: 'imp03', raw: { 'CODIGO': 'KAPO-0460', 'DESCRIPCION': 'CELULAR MOTOROLA', 'SERIE': '' },
    duplicado_kapo: false, codigo: 'CEL-003', tipo_id: 'celular', marca: 'Motorola', modelo: 'Moto G54', serie: '',
    costo: 899, fecha_compra: fecha(-200), estado: 'operativo', notas: '', modo: 'empleado', empleado_id: 'e04', ubicacion_id: null, created_at: hace(1),
  },
];

// ── Tickets ─────────────────────────────────────────────────────────────────
function ticket(n, titulo, estado, prioridad, extra = {}) {
  const codigo = `TCK-${String(n).padStart(4, '0')}`;
  return {
    id: `t${String(n).padStart(3, '0')}`,
    codigo,
    token: `tok-maqueta-${n}`,
    titulo,
    descripcion: '',
    estado,
    prioridad,
    nivel_atencion: 'N1',
    tipo: 'incidente',
    origen: 'empleado',
    vinculado: true,
    contacto_ingresado: null,
    asignado_a: 'u-jefe',
    // Captura en bucket privado (migración 111): solo la key; la URL firmada la da la function.
    adjunto_key: null,
    empleado_id: 'e01',
    categoria_id: 'otro',
    subcategoria_id: null,
    equipo_id: null,
    cuenta_id: null,
    licencia_id: null,
    created_at: hace(1),
    updated_at: hace(0, 2),
    // Solo la escribe el trigger tickets_resuelto_at (089): acá se fija a mano
    // en los resueltos/cerrados, igual a su evento de resolución.
    resuelto_at: null,
    ...extra,
  };
}

const tickets = [
  // Subcategoría con aviso (114): el detalle del staff muestra la regla que vio el solicitante.
  ticket(119, 'Video de la caseta de ingreso del martes', 'en_progreso', 'media', {
    empleado_id: 'e05', categoria_id: 'cctv', subcategoria_id: 'sub-10', tipo: 'solicitud',
    descripcion: 'Gerencia pide el corte de 7:30 a 8:15 del ingreso de camiones. Adjunto la autorización firmada.',
    created_at: hace(0, 5), updated_at: hace(0, 4),
  }),
  ticket(118, 'No puedo ingresar al correo desde el celular', 'abierto', 'urgente', {
    asignado_a: null, empleado_id: 'e02', categoria_id: 'accesos_cuentas', subcategoria_id: 'sub-01', cuenta_id: 'c03', tipo: 'incidente',
    descripcion: 'Desde esta mañana Gmail me pide verificar la cuenta y no me llega el código. Necesito revisar planos que me enviaron.',
    adjunto_key: 'tickets/t118/captura.png',
    created_at: hace(0, 3), updated_at: hace(0, 3),
  }),
  ticket(117, 'VPN desconecta cada 10 minutos', 'abierto', 'alta', {
    asignado_a: null, empleado_id: 'e02', categoria_id: 'red', subcategoria_id: 'sub-08', tipo: 'incidente', cuenta_id: 'c04',
    descripcion: 'Trabajando desde casa, la VPN se cae y pierdo el avance en el ERP.', created_at: hace(1, 4),
  }),
  ticket(116, 'Solicitud de laptop para nueva arquitecta', 'abierto', 'media', {
    asignado_a: 'u-asis-1', empleado_id: 'e07', categoria_id: 'equipos', subcategoria_id: 'sub-04', tipo: 'solicitud', nivel_atencion: 'N1',
    descripcion: 'Ingresa esta semana, necesita laptop con AutoCAD.', created_at: hace(2, 1),
  }),
  ticket(115, 'Impresora de obra no imprime', 'abierto', 'baja', {
    vinculado: false, empleado_id: null, contacto_ingresado: 'Luis Chávez — 987 654 321', asignado_a: null,
    categoria_id: 'equipos', subcategoria_id: 'sub-17', equipo_id: 'q07', origen: 'empleado',
    descripcion: 'La Epson de la caseta saca las hojas en blanco.', created_at: hace(4, 2),
  }),
  ticket(114, 'Sin internet en la caseta de Obra Surco', 'en_progreso', 'alta', {
    empleado_id: 'e04', categoria_id: 'red', subcategoria_id: 'sub-07', nivel_atencion: 'N2',
    descripcion: 'El router 4G no enciende desde ayer.', created_at: hace(3, 6),
  }),
  ticket(113, 'Instalar S10 en la PC de costos', 'en_progreso', 'media', {
    asignado_a: 'u-asis-2', empleado_id: 'e11', categoria_id: 'software', subcategoria_id: 'sub-05', tipo: 'solicitud', licencia_id: 'l05',
    descripcion: 'Se compró una licencia adicional de S10.', created_at: hace(5),
  }),
  ticket(112, 'Laptop se apaga sola', 'en_progreso', 'urgente', {
    empleado_id: 'e11', categoria_id: 'equipos', subcategoria_id: 'sub-03', equipo_id: 'q04', nivel_atencion: 'N3',
    descripcion: 'Se apaga al abrir archivos pesados de Excel.', created_at: hace(16),
  }),
  ticket(111, 'Internet lento en sede San Isidro', 'reabierto', 'media', {
    empleado_id: 'e05', categoria_id: 'red', subcategoria_id: 'sub-07',
    descripcion: 'Volvió a pasar después del cambio de router.', created_at: hace(9),
  }),
  ticket(110, 'Crear cuenta de Bitrix24 para asistente de TI', 'resuelto', 'media', {
    asignado_a: 'u-asis-1', empleado_id: 'e12', categoria_id: 'accesos_cuentas', subcategoria_id: 'sub-02', tipo: 'solicitud', cuenta_id: 'c15',
    descripcion: 'Nuevo ingreso del área de TI.', created_at: hace(4, 8), updated_at: hace(3), resuelto_at: hace(3),
  }),
  ticket(109, 'Excel muestra error al abrir macros', 'resuelto', 'baja', {
    empleado_id: 'e03', categoria_id: 'software', subcategoria_id: 'sub-06', nivel_atencion: 'N2',
    descripcion: 'Aparece "contenido bloqueado" en los formatos de planilla.', created_at: hace(11), updated_at: hace(8), resuelto_at: hace(8),
  }),
  ticket(108, 'Restablecer contraseña del ERP', 'cerrado', 'alta', {
    empleado_id: 'e05', categoria_id: 'accesos_cuentas', subcategoria_id: 'sub-01', tipo: 'solicitud', cuenta_id: 'c07',
    created_at: hace(14), updated_at: hace(12), resuelto_at: hace(13),
  }),
  ticket(107, 'Sin internet en Obra Miraflores', 'cerrado', 'urgente', {
    asignado_a: 'u-asis-1', empleado_id: 'e02', categoria_id: 'red', subcategoria_id: 'sub-07', nivel_atencion: 'N2',
    created_at: hace(20), updated_at: hace(19), resuelto_at: hace(19, 12),
  }),
  ticket(106, 'Configurar correo en Outlook', 'cerrado', 'baja', {
    asignado_a: 'u-asis-2', empleado_id: 'e01', categoria_id: 'accesos_cuentas', tipo: 'solicitud',
    created_at: hace(26), updated_at: hace(25), resuelto_at: hace(25, 6),
  }),
  ticket(105, 'Quiero instalar juegos en la laptop', 'rechazado', 'baja', {
    empleado_id: 'e04', categoria_id: 'software', subcategoria_id: 'sub-05', tipo: 'solicitud',
    descripcion: 'Para los tiempos muertos en obra.', created_at: hace(28), updated_at: hace(27),
  }),
  ticket(104, 'Acceso al ERP bloqueado tras cambio de clave', 'cerrado', 'media', {
    empleado_id: 'e08', categoria_id: 'accesos_cuentas', subcategoria_id: 'sub-01', tipo: 'solicitud', cuenta_id: 'c16',
    created_at: hace(60), updated_at: hace(59), resuelto_at: hace(59),
  }),
  // Anterior al catálogo v2 y en «Otro (no clasificado)»: aparece en «Tickets por reclasificar» (116).
  ticket(103, 'Coordinar el recojo del celular corporativo', 'abierto', 'media', {
    empleado_id: 'e06', categoria_id: 'otro', subcategoria_id: 'sub-09', tipo: 'solicitud', equipo_id: 'q08',
    descripcion: 'Quedó pendiente desde la baja; el equipo sigue con el ex colaborador.', created_at: hace(20), updated_at: hace(19),
  }),
];

const ticket_comentarios = [
  { id: 'tc01', ticket_id: 't114', mensaje: 'Se coordinó con el proveedor de internet; llegan mañana a las 9:00.', interno: false, autor_id: 'u-jefe', created_at: hace(3, 2) },
  { id: 'tc02', ticket_id: 't114', mensaje: 'El chip del router estaba suspendido por falta de pago. Se escaló a Administración.', interno: true, autor_id: 'u-jefe', created_at: hace(2, 20) },
  { id: 'tc03', ticket_id: 't114', mensaje: 'Gracias, quedamos atentos en obra.', interno: false, autor_id: null, created_at: hace(2, 18) },
  { id: 'tc04', ticket_id: 't112', mensaje: 'Se revisó temperatura: 95 °C en carga. Probable pasta térmica.', interno: true, autor_id: 'u-jefe', created_at: hace(15) },
  { id: 'tc05', ticket_id: 't112', mensaje: 'Se le prestó la LAP-003 mientras dura la reparación.', interno: false, autor_id: 'u-jefe', created_at: hace(14) },
  { id: 'tc06', ticket_id: 't118', mensaje: 'Por favor confirme si tiene acceso al número de respaldo.', interno: false, autor_id: 'u-jefe', created_at: hace(0, 1) },
  { id: 'tc07', ticket_id: 't110', mensaje: 'Cuenta creada y enviada por enlace de entrega.', interno: false, autor_id: 'u-asis-1', created_at: hace(3) },
];

const ticket_eventos = [
  { id: 'te01', ticket_id: 't114', evento: 'creado', detalle: null, user_email: null, user_id: null, created_at: hace(3, 6) },
  { id: 'te02', ticket_id: 't114', evento: 'reasignado', detalle: null, user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(3, 5) },
  { id: 'te03', ticket_id: 't114', evento: 'estado_cambiado', detalle: 'De "abierto" a "en_progreso"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(3, 4) },
  { id: 'te04', ticket_id: 't114', evento: 'nivel_atencion_cambiado', detalle: 'De "N1" a "N2"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(3, 3) },
  { id: 'te05', ticket_id: 't112', evento: 'creado', detalle: null, user_email: null, user_id: null, created_at: hace(16) },
  { id: 'te06', ticket_id: 't112', evento: 'prioridad_cambiada', detalle: 'De "alta" a "urgente"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(15, 20) },
  { id: 'te07', ticket_id: 't112', evento: 'estado_cambiado', detalle: 'De "abierto" a "en_progreso"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(15, 18) },
  { id: 'te08', ticket_id: 't111', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(7) },
  { id: 'te09', ticket_id: 't111', evento: 'estado_cambiado', detalle: 'De "resuelto" a "reabierto"', user_email: null, user_id: null, created_at: hace(5) },
  { id: 'te10', ticket_id: 't110', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'dhuaman@materen.pe', user_id: 'u-asis-1', created_at: hace(3) },
  { id: 'te11', ticket_id: 't109', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(8) },
  { id: 'te12', ticket_id: 't108', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(13) },
  { id: 'te13', ticket_id: 't108', evento: 'estado_cambiado', detalle: 'De "resuelto" a "cerrado"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(12) },
  { id: 'te14', ticket_id: 't107', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'dhuaman@materen.pe', user_id: 'u-asis-1', created_at: hace(19, 12) },
  { id: 'te15', ticket_id: 't106', evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: 'lparedes@materen.pe', user_id: 'u-asis-2', created_at: hace(25, 6) },
  { id: 'te16', ticket_id: 't105', evento: 'estado_cambiado', detalle: 'De "abierto" a "rechazado"', user_email: 'jefe@materen.pe', user_id: 'u-jefe', created_at: hace(27) },
  { id: 'te17', ticket_id: 't108', evento: 'encuesta_enviada', detalle: null, user_email: null, user_id: null, created_at: hace(12) },
];

const ticket_satisfaccion = [
  { id: 'ts01', ticket_id: 't108', nivel: 5, comentario: 'Muy rápido, gracias.', fecha_envio: hace(11), created_at: hace(12) },
  { id: 'ts02', ticket_id: 't107', nivel: 3, comentario: 'Se resolvió, pero la obra estuvo medio día sin internet.', fecha_envio: hace(18), created_at: hace(19) },
  { id: 'ts03', ticket_id: 't106', nivel: 4, comentario: null, fecha_envio: hace(24), created_at: hace(25) },
  { id: 'ts04', ticket_id: 't109', nivel: null, comentario: null, fecha_envio: null, created_at: hace(8) },
  { id: 'ts05', ticket_id: 't110', nivel: 2, comentario: 'Tardaron en enviarme el enlace.', fecha_envio: hace(2), created_at: hace(3) },
];

// ── Mes anterior completo (reportes, 115) ───────────────────────────────────
// Ocho tickets resueltos el mes pasado, con su evento de resolución, técnico,
// encuesta y una reapertura dentro del corte: así la hoja de /reportes del mes
// anterior publica un CSAT con n ≥ 5, una tasa de reapertura y un arrastrado,
// y la del mes en curso muestra "n insuficiente" y el sello PERÍODO EN CURSO.
// Las fechas se arman sobre el mes de calendario anterior al de hoy (no sobre
// "hace N días") para que el mes cerrado sea siempre el mismo al abrir la maqueta.
{
  const hoy = new Date();
  const mesPasado = (dia, hora = 10) => new Date(hoy.getFullYear(), hoy.getMonth() - 1, dia, hora).toISOString();
  const CERRADOS = [
    // [n, día creado, horas hasta resolver, técnico, categoría, sub, prioridad, empleado, nivel encuesta (null = sin responder)]
    [97, 3, 2, 'u-jefe', 'accesos_cuentas', 'sub-01', 'alta', 'e05', 5],
    [96, 5, 6, 'u-asis-1', 'red', 'sub-07', 'urgente', 'e02', 4],
    [95, 8, 30, 'u-asis-1', 'equipos', 'sub-03', 'media', 'e04', 5],
    [94, 10, 1, 'u-asis-2', 'software', 'sub-05', 'baja', 'e03', 3],
    [93, 12, 50, 'u-jefe', 'equipos', 'sub-04', 'media', 'e07', 4],
    [92, 15, 4, 'u-asis-1', 'accesos_cuentas', 'sub-02', 'media', 'e11', 5],
    [91, 18, 72, 'u-asis-2', 'red', 'sub-08', 'alta', 'e02', 2],
    [90, 20, 3, 'u-jefe', 'software', 'sub-06', 'media', 'e01', null],
  ];
  for (const [n, dia, horas, tecnico, categoria, sub, prioridad, empleado, nivel] of CERRADOS) {
    const creado = mesPasado(dia, 9);
    const resuelto = new Date(new Date(creado).getTime() + horas * 3600000).toISOString();
    const cerrado = new Date(new Date(resuelto).getTime() + 1000).toISOString();
    tickets.push(ticket(n, `Atención del mes pasado ${n}`, 'cerrado', prioridad, {
      asignado_a: tecnico, empleado_id: empleado, categoria_id: categoria, subcategoria_id: sub,
      tipo: ['sub-01', 'sub-02', 'sub-04', 'sub-05'].includes(sub) ? 'solicitud' : 'incidente', nivel_atencion: horas > 24 ? 'N2' : 'N1',
      created_at: creado, updated_at: cerrado, resuelto_at: resuelto,
    }));
    ticket_eventos.push(
      { id: `te-mp-${n}-1`, ticket_id: `t${String(n).padStart(3, '0')}`, evento: 'estado_cambiado', detalle: 'De "abierto" a "en_progreso"', user_email: null, user_id: tecnico, created_at: new Date(new Date(creado).getTime() + 1800000).toISOString() },
      { id: `te-mp-${n}-2`, ticket_id: `t${String(n).padStart(3, '0')}`, evento: 'estado_cambiado', detalle: 'De "en_progreso" a "resuelto"', user_email: null, user_id: tecnico, created_at: resuelto },
      { id: `te-mp-${n}-3`, ticket_id: `t${String(n).padStart(3, '0')}`, evento: 'estado_cambiado', detalle: 'De "resuelto" a "cerrado"', user_email: null, user_id: tecnico, created_at: cerrado },
    );
    ticket_comentarios.push({ id: `tc-mp-${n}`, ticket_id: `t${String(n).padStart(3, '0')}`, mensaje: 'Estamos revisando su caso.', interno: false, autor_id: tecnico, created_at: new Date(new Date(creado).getTime() + 2700000).toISOString() });
    ticket_satisfaccion.push({
      id: `ts-mp-${n}`, ticket_id: `t${String(n).padStart(3, '0')}`, nivel, comentario: nivel != null && nivel <= 2 ? 'La solución tardó demasiado.' : null,
      fecha_envio: nivel == null ? null : new Date(new Date(cerrado).getTime() + 86400000).toISOString(), created_at: cerrado,
    });
  }
  // El 91 se reabrió a los 5 días del cierre y se volvió a resolver: cuenta como reapertura dentro del corte.
  const t91 = tickets.find((t) => t.id === 't091');
  const reabierto = new Date(new Date(t91.resuelto_at).getTime() + 5 * 86400000).toISOString();
  const resuelto2 = new Date(new Date(reabierto).getTime() + 6 * 3600000).toISOString();
  ticket_eventos.push(
    { id: 'te-mp-91-4', ticket_id: 't091', evento: 'estado_cambiado', detalle: 'De "cerrado" a "reabierto"', user_email: null, user_id: 'u-jefe', created_at: reabierto },
    { id: 'te-mp-91-5', ticket_id: 't091', evento: 'estado_cambiado', detalle: 'De "reabierto" a "resuelto"', user_email: null, user_id: 'u-asis-2', created_at: resuelto2 },
    { id: 'te-mp-91-6', ticket_id: 't091', evento: 'estado_cambiado', detalle: 'De "resuelto" a "cerrado"', user_email: null, user_id: 'u-asis-2', created_at: new Date(new Date(resuelto2).getTime() + 1000).toISOString() },
  );
  t91.resuelto_at = resuelto2;
}

// Parámetros de negocio (103 + 115): los mismos que lee el servidor.
const config_parametros = [
  { clave: 'dias_ventana_alta', valor: 30 }, { clave: 'dias_por_vencer_licencia', valor: 30 }, { clave: 'dias_por_vencer_garantia', valor: 30 },
  { clave: 'umbral_recurrencia_tickets', valor: { n: 3, dias: 30 } }, { clave: 'dias_ticket_viejo', valor: 3 },
  { clave: 'csat_muestra_minima', valor: 5 }, { clave: 'dias_corte_reapertura', valor: 30 },
  // 110 + 117: actas pendientes (desde hace 60 días, como el Inicio de la maqueta) y revisión de accesos.
  { clave: 'dias_acta_sin_adjuntar', valor: 3 }, { clave: 'actas_pendientes_desde', valor: fecha(-60) },
  { clave: 'dias_revision_accesos', valor: 180 },
  // Marca del catálogo v2 (116): tickets anteriores en estas subcategorías (o sin subcategoría) se revisan.
  { clave: 'catalogo_tickets_v2', valor: { aplicada_at: hace(3), subcategoria_no_clasificado: 'sub-09', subcategoria_seguridad_legado: 'sub-25' } },
];

// ── Base de conocimiento ────────────────────────────────────────────────────
const kb_articulos = [
  {
    id: 'kb01', titulo: 'Gmail pide verificación y no llega el código', categoria_id: 'accesos_cuentas', estado: 'publicado',
    sintoma: 'Al iniciar sesión en un celular nuevo, Google pide un código que no llega.',
    solucion: '1. Verificar el número de respaldo en la consola de administración.\n2. Generar códigos de respaldo.\n3. Entregar un código al empleado por WhatsApp corporativo.',
    util_si: 14, util_no: 1, ticket_origen_id: 't108', created_by: 'u-jefe', created_at: hace(90), updated_at: hace(10), deleted_at: null,
  },
  {
    id: 'kb02', titulo: 'VPN FortiClient se desconecta cada pocos minutos', categoria_id: 'red', estado: 'publicado',
    sintoma: 'La conexión VPN cae de forma intermitente desde redes domésticas.',
    solucion: 'Desactivar "Always Up", cambiar el MTU del adaptador a 1400 y reinstalar la versión 7.2 del cliente.',
    util_si: 8, util_no: 3, ticket_origen_id: null, created_by: 'u-asis-1', created_at: hace(60), updated_at: hace(20), deleted_at: null,
  },
  {
    id: 'kb03', titulo: 'Impresora Epson imprime hojas en blanco', categoria_id: 'equipos', estado: 'publicado',
    sintoma: 'La impresora avanza el papel pero no imprime.',
    solucion: 'Ejecutar limpieza de cabezales desde la utilidad Epson dos veces y verificar niveles de tinta.',
    util_si: 5, util_no: 0, ticket_origen_id: null, created_by: 'u-jefe', created_at: hace(120), updated_at: hace(40), deleted_at: null,
  },
  {
    id: 'kb04', titulo: 'Macros bloqueadas en Excel', categoria_id: 'software', estado: 'en_revision',
    sintoma: 'Excel muestra "Microsoft ha bloqueado la ejecución de macros".',
    solucion: 'Agregar la carpeta compartida de planillas como ubicación de confianza.',
    util_si: 0, util_no: 0, ticket_origen_id: 't109', created_by: 'u-asis-2', created_at: hace(7), updated_at: hace(6), deleted_at: null,
  },
  {
    id: 'kb05', titulo: 'Alta de cuenta de Bitrix24', categoria_id: 'accesos_cuentas', estado: 'borrador',
    sintoma: 'Procedimiento para crear usuarios nuevos.',
    solucion: 'Borrador: completar con capturas del panel de administración.',
    util_si: 0, util_no: 0, ticket_origen_id: 't110', created_by: 'u-jefe', created_at: hace(3), updated_at: hace(2), deleted_at: null,
  },
  {
    id: 'kb06', titulo: 'Configurar correo en Outlook 2016', categoria_id: 'accesos_cuentas', estado: 'obsoleto',
    sintoma: 'Configuración manual IMAP de cuentas Gmail.',
    solucion: 'Obsoleto: se migró a Microsoft 365, usar la guía nueva.',
    util_si: 21, util_no: 6, ticket_origen_id: null, created_by: 'u-jefe', created_at: hace(400), updated_at: hace(100), deleted_at: null,
  },
  // KEDB (106): workaround publicado del problema p02 (error conocido).
  {
    id: 'kb07', titulo: 'Workaround: Laptops Lenovo IdeaPad sobrecalentándose', categoria_id: 'equipos', estado: 'publicado',
    tipo: 'workaround', problema_id: 'p02',
    sintoma: 'La laptop se apaga sola al abrir archivos pesados.',
    solucion: '1. Panel de control > Opciones de energía > Cambiar la configuración del plan.\n2. Limitar el estado máximo del procesador al 80 %.\n3. Mantener la laptop sobre una superficie rígida hasta el cambio de pasta térmica.',
    util_si: 3, util_no: 0, ticket_origen_id: 't112', created_by: 'u-jefe', created_at: hace(5), updated_at: hace(5), deleted_at: null,
  },
];

// Artículos que sirvieron para resolver un ticket (106): alimentan v_kpi_kb.
const ticket_kb_usos = [
  { ticket_id: 't108', kb_articulo_id: 'kb01', usado_por: 'u-jefe', created_at: hace(13) },
  { ticket_id: 't107', kb_articulo_id: 'kb02', usado_por: 'u-asis-1', created_at: hace(20) },
  { ticket_id: 't112', kb_articulo_id: 'kb07', usado_por: 'u-jefe', created_at: hace(4) },
];

// ── Problemas ───────────────────────────────────────────────────────────────
const problemas = [
  {
    id: 'p01', titulo: 'Caídas recurrentes de internet en obras', severidad: 'alta', estado: 'diagnostico',
    descripcion: 'Las casetas de obra reportan cortes de internet varias veces al mes.',
    causa_raiz: '', responsable_id: 'u-jefe', ticket_disparador_id: 't107', created_by: 'u-jefe',
    created_at: hace(19), updated_at: hace(2), deleted_at: null,
  },
  {
    id: 'p02', titulo: 'Laptops Lenovo IdeaPad sobrecalentándose', severidad: 'media', estado: 'acciones',
    descripcion: 'Tres equipos del mismo lote presentan apagados por temperatura.',
    causa_raiz: 'Lote con pasta térmica defectuosa de fábrica.', responsable_id: 'u-asis-1', ticket_disparador_id: 't112', created_by: 'u-jefe',
    workaround: '1. Panel de control > Opciones de energía > Cambiar la configuración del plan.\n2. Limitar el estado máximo del procesador al 80 %.\n3. Mantener la laptop sobre una superficie rígida hasta el cambio de pasta térmica.',
    error_conocido: true, kb_articulo_id: 'kb07',
    created_at: hace(15), updated_at: hace(5), deleted_at: null,
  },
  {
    id: 'p03', titulo: 'Licencias vencidas sin aviso previo', severidad: 'critica', estado: 'abierto',
    descripcion: 'El antivirus venció sin que nadie lo renovara; equipos quedaron sin protección.',
    causa_raiz: '', responsable_id: null, ticket_disparador_id: null, created_by: 'u-jefe',
    created_at: hace(6), updated_at: hace(6), deleted_at: null,
  },
  {
    id: 'p04', titulo: 'Contraseñas de ERP que expiran sin notificación', severidad: 'baja', estado: 'cerrado',
    descripcion: 'Los usuarios quedaban bloqueados al vencer la contraseña.',
    causa_raiz: 'Política de caducidad a 30 días sin correo de aviso.', responsable_id: 'u-jefe', ticket_disparador_id: 't108', created_by: 'u-jefe',
    created_at: hace(60), updated_at: hace(12), deleted_at: null,
  },
];

const problema_tickets = [
  { id: 'pt01', problema_id: 'p01', ticket_id: 't107', created_at: hace(19) },
  { id: 'pt02', problema_id: 'p02', ticket_id: 't112', created_at: hace(15) },
  { id: 'pt03', problema_id: 'p04', ticket_id: 't108', created_at: hace(14) },
];

const acciones_correctivas = [
  { id: 'acc01', problema_id: 'p01', descripcion: 'Contratar línea de respaldo con otro operador', responsable_id: 'u-jefe', fecha_limite: fecha(-3), estado: 'en_progreso', fecha_completada: null, created_at: hace(18), deleted_at: null },
  { id: 'acc02', problema_id: 'p01', descripcion: 'Instalar UPS en los routers de obra', responsable_id: 'u-asis-1', fecha_limite: fecha(10), estado: 'pendiente', fecha_completada: null, created_at: hace(18), deleted_at: null },
  { id: 'acc03', problema_id: 'p02', descripcion: 'Cambio de pasta térmica en los 3 equipos del lote', responsable_id: 'u-asis-1', fecha_limite: fecha(-1), estado: 'pendiente', fecha_completada: null, created_at: hace(14), deleted_at: null },
  { id: 'acc04', problema_id: 'p02', descripcion: 'Reclamo de garantía al proveedor', responsable_id: 'u-jefe', fecha_limite: fecha(-8), estado: 'completada', fecha_completada: fecha(-9), created_at: hace(14), deleted_at: null },
  { id: 'acc05', problema_id: 'p04', descripcion: 'Activar aviso por correo 5 días antes de expirar', responsable_id: 'u-jefe', fecha_limite: fecha(-20), estado: 'completada', fecha_completada: fecha(-15), created_at: hace(50), deleted_at: null },
];

// ── Encuestas ───────────────────────────────────────────────────────────────
const PREGUNTAS_CLIMA = [
  { id: 'pq1', tipo: 'escala_1_5', etiqueta: '¿Qué tan satisfecho está con el soporte de TI?', requerido: true },
  { id: 'pq2', tipo: 'opcion_unica', etiqueta: '¿Por qué canal prefiere reportar incidencias?', requerido: true, opciones: ['Formulario web', 'WhatsApp', 'Correo', 'En persona'] },
  { id: 'pq3', tipo: 'si_no', etiqueta: '¿Su equipo de trabajo es adecuado para sus tareas?', requerido: false },
  { id: 'pq4', tipo: 'texto_largo', etiqueta: '¿Qué mejoraría del área de TI?', requerido: false },
];

const PREGUNTAS_EQUIPOS = [
  { id: 'pe1', tipo: 'texto_corto', etiqueta: 'Código del equipo que usa', requerido: true },
  { id: 'pe2', tipo: 'escala_1_5', etiqueta: 'Estado general del equipo', requerido: true },
  { id: 'pe3', tipo: 'si_no', etiqueta: '¿Necesita un reemplazo este año?', requerido: true },
];

const encuestas = [
  { id: 'enc01', titulo: 'Satisfacción con el soporte de TI 2026', descripcion: 'Encuesta semestral a todo el personal.', preguntas: PREGUNTAS_CLIMA, created_at: hace(40), updated_at: hace(40), deleted_at: null },
  { id: 'enc02', titulo: 'Inventario de equipos en obra', descripcion: 'Relevamiento del estado de equipos en obras activas.', preguntas: PREGUNTAS_EQUIPOS, created_at: hace(20), updated_at: hace(18), deleted_at: null },
  { id: 'enc03', titulo: 'Capacitación en Microsoft 365', descripcion: 'Interés en talleres de Teams y OneDrive.', preguntas: [PREGUNTAS_CLIMA[1], PREGUNTAS_CLIMA[3]], created_at: hace(2), updated_at: hace(2), deleted_at: null },
];

const encuesta_rondas = [
  { id: 'ron01', encuesta_id: 'enc01', slug: 'maqueta-soporte-1', abierta_en: hace(38), cerrada: true, created_at: hace(38) },
  { id: 'ron02', encuesta_id: 'enc01', slug: 'maqueta-soporte-2', abierta_en: hace(5), cerrada: false, created_at: hace(5) },
  { id: 'ron03', encuesta_id: 'enc02', slug: 'maqueta-equipos-1', abierta_en: hace(18), cerrada: false, created_at: hace(18) },
];

const encuesta_respuestas = [
  { id: 'er01', ronda_id: 'ron01', respuestas: { pq1: 4, pq2: 'WhatsApp', pq3: true, pq4: 'Más rapidez en obra.' }, created_at: hace(37) },
  { id: 'er02', ronda_id: 'ron01', respuestas: { pq1: 5, pq2: 'Formulario web', pq3: true, pq4: '' }, created_at: hace(36) },
  { id: 'er03', ronda_id: 'ron01', respuestas: { pq1: 2, pq2: 'En persona', pq3: false, pq4: 'Mi laptop es muy lenta.' }, created_at: hace(36) },
  { id: 'er04', ronda_id: 'ron01', respuestas: { pq1: 4, pq2: 'WhatsApp', pq3: true }, created_at: hace(35) },
  { id: 'er05', ronda_id: 'ron02', respuestas: { pq1: 5, pq2: 'Formulario web', pq3: true, pq4: 'Todo bien.' }, created_at: hace(4) },
  { id: 'er06', ronda_id: 'ron02', respuestas: { pq1: 3, pq2: 'Correo', pq3: false }, created_at: hace(3) },
  { id: 'er07', ronda_id: 'ron03', respuestas: { pe1: 'LAP-002', pe2: 4, pe3: false }, created_at: hace(17) },
  { id: 'er08', ronda_id: 'ron03', respuestas: { pe1: 'CEL-001', pe2: 2, pe3: true }, created_at: hace(16) },
];

// ── Accesos sensibles (nunca con contraseña: password siempre null) ─────────
const accesos_sensibles = [
  { id: 'as01', nombre: 'Router principal sede', categoria: 'equipos', usuario: 'admin', password: null, notas: 'Mikrotik del rack del piso 6', created_at: hace(200), updated_at: hace(30) },
  { id: 'as02', nombre: 'Correo de Gerencia General', categoria: 'correos', usuario: 'gerencia@materen.pe', password: null, notas: '', created_at: hace(300), updated_at: hace(100) },
  { id: 'as03', nombre: 'Consola de Google Workspace', categoria: 'otro', usuario: 'admin.ti@materen.pe', password: null, notas: 'Superadministrador', created_at: hace(400), updated_at: hace(20) },
  { id: 'as04', nombre: 'NVR de cámaras de obra', categoria: 'equipos', usuario: 'supervisor', password: null, notas: 'Solo lectura para seguridad', created_at: hace(90), updated_at: hace(90) },
];

const accesos_sensibles_permisos = [
  { id: 'asp01', acceso_id: 'as01', staff_user_id: 'u-jefe' },
  { id: 'asp02', acceso_id: 'as02', staff_user_id: 'u-jefe' },
  { id: 'asp03', acceso_id: 'as03', staff_user_id: 'u-jefe' },
  { id: 'asp04', acceso_id: 'as01', staff_user_id: 'u-asis-1' },
];

// ── Auditoría, notificaciones, entregas ─────────────────────────────────────
const accesos_log = [
  { id: 'log01', user_email: 'jefe@materen.pe', cuenta_usuario: 'jhuaman', plataforma: 'Vpn Forticlient', accion: 'ver', detalle: 'Motivo: soporte remoto', created_at: hace(0, 1) },
  { id: 'log02', user_email: 'dhuaman@materen.pe', cuenta_usuario: 'jvargas', plataforma: 'Bitrix24', accion: 'entrega_creada', detalle: 'Enlace válido por 24 h', created_at: hace(3) },
  { id: 'log03', user_email: null, cuenta_usuario: 'jvargas', plataforma: 'Bitrix24', accion: 'entrega_abierta', detalle: 'Abierta desde el enlace', created_at: hace(2, 20) },
  { id: 'log04', user_email: 'jefe@materen.pe', cuenta_usuario: 'rquispe@materen.pe', plataforma: 'Gmail', accion: 'copiar', detalle: null, created_at: hace(4) },
  { id: 'log05', user_email: 'lparedes@materen.pe', cuenta_usuario: null, plataforma: null, accion: 'acceso_denegado', detalle: 'Ruta /actividad', created_at: hace(5) },
  { id: 'log06', user_email: 'jefe@materen.pe', cuenta_usuario: 'cflores', plataforma: 'Erp Siscont', accion: 'ver', detalle: 'Motivo: restablecer acceso', created_at: hace(13) },
  { id: 'log07', user_email: 'jefe@materen.pe', cuenta_usuario: 'almacen.chorrillos@materen.pe', plataforma: 'Gmail', accion: 'enviar', detalle: null, created_at: hace(10) },
  { id: 'log08', user_email: 'jefe@materen.pe', cuenta_usuario: 'Router principal sede', plataforma: null, accion: 'permiso_otorgado', detalle: 'Diego Huamán Rojas', created_at: hace(8) },
  { id: 'log09', user_email: null, cuenta_usuario: '(sistema)', plataforma: null, accion: 'purga_ejecutada', detalle: 'entregas: 2 · notificaciones: 5', created_at: hace(1, 3) },
  { id: 'log10', user_email: 'lparedes@materen.pe', cuenta_usuario: 'cflores', plataforma: 'Erp Siscont', accion: 'revelado_denegado', detalle: 'Sin permiso para ver contraseñas', created_at: hace(6) },
];

const notificaciones = [
  { id: 'n01', tipo: 'ticket_creado', entidad_tipo: 'ticket', entidad_id: 't118', titulo: 'Nuevo ticket TCK-0118: No puedo ingresar al correo desde el celular', url_destino: '/tickets/t118', creado_en: hace(0, 3) },
  { id: 'n02', tipo: 'ticket_creado', entidad_tipo: 'ticket', entidad_id: 't117', titulo: 'Nuevo ticket TCK-0117: VPN desconecta cada 10 minutos', url_destino: '/tickets/t117', creado_en: hace(1, 4) },
  { id: 'n03', tipo: 'empleado_alta', entidad_tipo: 'empleado', entidad_id: 'e07', titulo: 'Alta de empleado: Ana Lucía Torres Vílchez', url_destino: '/empleados/e07', creado_en: hace(3) },
  { id: 'n04', tipo: 'cuenta_creada', entidad_tipo: 'cuenta', entidad_id: 'c15', titulo: 'Cuenta creada: jvargas (Bitrix24)', url_destino: '/empleados/e12', creado_en: hace(4) },
  { id: 'n05', tipo: 'empleado_baja', entidad_tipo: 'empleado', entidad_id: 'e06', titulo: 'Baja de empleado: Pedro Ticona Apaza', url_destino: '/empleados/e06', creado_en: hace(30) },
  { id: 'n06', tipo: 'empleado_suspendido', entidad_tipo: 'empleado', entidad_id: 'e08', titulo: 'Empleado suspendido · Miguel Ángel Rojas Cárdenas', url_destino: '/empleados/e08', creado_en: hace(6) },
];

const notificaciones_lecturas = [
  { id: 'nl01', notificacion_id: 'n04', usuario_id: 'u-jefe' },
  { id: 'nl02', notificacion_id: 'n05', usuario_id: 'u-jefe' },
];

// Columnas reales de `entregas` (migración 010): expires_at, viewed_at y
// created_by. Una entrega sin viewed_at y con expires_at pasado está vencida.
const entregas = [
  { id: 'ent01', empleado_id: 'e12', created_at: hace(3), expires_at: hace(2), viewed_at: null, created_by: 'u-asis-1', expira_en: hace(2) },
  { id: 'ent02', empleado_id: 'e09', created_at: hace(10), expires_at: hace(9), viewed_at: hace(9, 20), created_by: 'u-jefe', expira_en: hace(9) },
  { id: 'ent03', empleado_id: 'e01', created_at: hace(399), expires_at: hace(398), viewed_at: hace(398, 22), created_by: 'u-jefe', expira_en: hace(398) },
  { id: 'ent04', empleado_id: 'e01', created_at: hace(120), expires_at: hace(119), viewed_at: null, created_by: 'u-asis-1', expira_en: hace(119) },
];

// ── Ciclo de vida del empleado (migración 102) ──────────────────────────────
// Hoja de vida append-only: nunca lleva DNI ni valores de contacto. `rol_actor`
// es tecnico | jefe | usuario | sistema | legado; los eventos heredados no
// tienen actor ("no registrado (legado)").
const ACTOR_JEFE = { user_id: 'u-jefe', user_email: 'jefe@materen.pe', rol_actor: 'jefe' };
const ACTOR_DIEGO = { user_id: 'u-asis-1', user_email: 'dhuaman@materen.pe', rol_actor: 'tecnico' };
const ACTOR_LUCIA = { user_id: 'u-asis-2', user_email: 'lparedes@materen.pe', rol_actor: 'tecnico' };
const ACTOR_SISTEMA = { user_id: null, user_email: null, rol_actor: 'sistema' };
const ACTOR_LEGADO = { user_id: null, user_email: null, rol_actor: 'legado' };

let secEvento = 0;
function eventoEmpleado(empleado_id, evento, dias, extra = {}) {
  secEvento += 1;
  return {
    id: `eev${String(secEvento).padStart(3, '0')}`,
    empleado_id, evento, campo: null, valor_anterior: null, valor_nuevo: null,
    detalle: null, ...ACTOR_LEGADO, created_at: hace(dias), ...extra,
  };
}

const empleado_eventos = [
  // Todos tienen su 'creado' (backfill de la migración, rol legado)…
  ...empleados.map((e) => eventoEmpleado(e.id, 'creado', Math.round((Date.now() - Date.parse(e.created_at)) / 86400000), {
    campo: 'estado', valor_nuevo: 'Activo', detalle: 'Registro anterior a la auditoría',
  })),
  // e01: historia con los tres tipos de actor.
  eventoEmpleado('e01', 'cargo_cambiado', 200, { campo: 'cargo', valor_anterior: 'Asistente', valor_nuevo: 'Asistente Administrativa', ...ACTOR_DIEGO }),
  eventoEmpleado('e01', 'area_cambiada', 120, { campo: 'area_obra', valor_anterior: 'Logística', valor_nuevo: 'Administración', ...ACTOR_JEFE }),
  eventoEmpleado('e01', 'contacto_cambiado', 30, { campo: 'whatsapp,correo_personal', detalle: 'actualizado', ...ACTOR_DIEGO }),
  eventoEmpleado('e01', 'accesos_revisados', 12, { detalle: 'Revisión trimestral: 2 cuentas y 1 equipo, sin observaciones.', ...ACTOR_JEFE }),
  // e06: baja con motivo (el celular quedó sin devolver).
  eventoEmpleado('e06', 'ubicacion_cambiada', 400, { campo: 'ubicacion', valor_anterior: 'Sede Central San Isidro', valor_nuevo: 'Almacén Chorrillos', ...ACTOR_LUCIA }),
  eventoEmpleado('e06', 'baja_ejecutada', 30, { campo: 'estado', valor_anterior: 'Activo', valor_nuevo: 'Inactivo', detalle: 'Término de contrato. Pendiente devolver el celular corporativo.', ...ACTOR_JEFE }),
  // e08: suspensión.
  eventoEmpleado('e08', 'accesos_revisados', 7, { detalle: 'Revisión previa a la suspensión: cuentas y equipo vigentes.', ...ACTOR_DIEGO }),
  eventoEmpleado('e08', 'suspendido', 6, { campo: 'estado', valor_anterior: 'Activo', valor_nuevo: 'Suspendido', detalle: 'Investigación interna en curso: se suspende hasta nuevo aviso.', ...ACTOR_JEFE }),
  eventoEmpleado('e08', 'contacto_cambiado', 5, { campo: 'telefono', detalle: 'actualizado', ...ACTOR_SISTEMA }),
  // e09: reingreso.
  eventoEmpleado('e09', 'baja_ejecutada', 160, { campo: 'estado', valor_anterior: 'Activo', valor_nuevo: 'Inactivo', detalle: 'Fin de contrato temporal.', ...ACTOR_LUCIA }),
  eventoEmpleado('e09', 'reingreso', 12, { campo: 'estado', valor_anterior: 'Inactivo', valor_nuevo: 'Activo', detalle: 'Reingreso; fecha de alta 2025-03-02 → hoy', ...ACTOR_JEFE }),
  // e10: baja heredada, fecha aproximada.
  eventoEmpleado('e10', 'estado_cambiado', 60, { campo: 'estado', valor_nuevo: 'Inactivo', detalle: 'Fecha aproximada (última actualización)' }),
  // e07 y e12: altas recientes con actor.
  eventoEmpleado('e07', 'creado', 3, { campo: 'estado', valor_nuevo: 'Activo', detalle: 'Alta en el sistema', ...ACTOR_DIEGO }),
  eventoEmpleado('e12', 'creado', 5, { campo: 'estado', valor_nuevo: 'Activo', detalle: 'Alta en el sistema', ...ACTOR_JEFE }),
].map((ev, i, todos) => {
  // El 'creado' heredado se descarta donde hay uno con actor (e07, e12).
  if (ev.rol_actor === 'legado' && ev.evento === 'creado'
      && todos.some((o) => o !== ev && o.empleado_id === ev.empleado_id && o.evento === 'creado' && o.rol_actor !== 'legado')) {
    return null;
  }
  return ev;
}).filter(Boolean);

// Revisión de accesos (migración 102) + la vista de "última revisión".
const empleado_revisiones_acceso = [
  { id: 'rev01', empleado_id: 'e01', revisado_por: 'u-jefe', revisado_at: hace(12), resultado: { cuentas: 2, equipos: 1, licencias: 1 }, nota: 'Revisión trimestral: 2 cuentas y 1 equipo, sin observaciones.' },
  { id: 'rev02', empleado_id: 'e08', revisado_por: 'u-asis-1', revisado_at: hace(7), resultado: { cuentas: 2, equipos: 1, licencias: 1 }, nota: 'Revisión previa a la suspensión: cuentas y equipo vigentes.' },
];
const v_empleado_ultima_revision_acceso = empleado_revisiones_acceso.map((r) => ({
  empleado_id: r.empleado_id, revision_id: r.id, revisado_por: r.revisado_por,
  revisado_at: r.revisado_at, resultado: r.resultado, nota: r.nota,
}));

// ── Solicitudes de servicio (migración 108) ─────────────────────────────────
// Cuatro estados a la vista: dos altas abiertas (la guía de alta del expediente
// y el Inicio las leen), una baja abierta con un equipo por recuperar, una baja
// y un alta ya completadas, y una solicitud cancelada.
const solicitud_tipos = TIPOS_SOLICITUD.map((t) => ({ ...t }));

function solicitudMaq(n, tipo_id, empleado_id, dias, extra = {}) {
  return {
    id: `sol${String(n).padStart(2, '0')}`,
    codigo: `SOL-${String(n).padStart(4, '0')}`,
    tipo_id, empleado_id,
    estado: 'abierta', origen: 'rrhh_correo', nota: null, datos: {}, ticket_id: null,
    creada_por: 'u-jefe', completada_at: null, cancelada_at: null, cancelada_por: null, motivo_cancelacion: null,
    created_at: hace(dias), updated_at: hace(dias),
    ...extra,
  };
}

const solicitudes = [
  solicitudMaq(1, 'alta_empleado', 'e07', 3, { nota: 'Pedido de RRHH por correo: ingresa a la obra Mirasol como arquitecta proyectista.', ticket_id: 't116' }),
  solicitudMaq(2, 'alta_empleado', 'e12', 5, { nota: 'Pedido de RRHH por correo del lunes.', creada_por: 'u-asis-1' }),
  solicitudMaq(3, 'baja_empleado', 'e06', 30, { origen: 'sistema', nota: 'Término de contrato. Pendiente devolver el celular corporativo.' }),
  solicitudMaq(4, 'baja_empleado', 'e10', 60, { origen: 'sistema', estado: 'completada', completada_at: hace(58) }),
  solicitudMaq(5, 'alta_empleado', 'e09', 12, { estado: 'completada', completada_at: hace(9), nota: 'Pedido de RRHH por correo.' }),
  solicitudMaq(6, 'licencia', 'e11', 8, {
    origen: 'jefe_directo', estado: 'cancelada', cancelada_at: hace(7), cancelada_por: 'u-asis-1', motivo_cancelacion: 'Pedido duplicado: ya tenía la licencia.',
  }),
];

const solicitud_pasos = [];
const resuelto = (dias, extra = {}) => ({ estado: 'hecho', automatico: true, hecho_por: 'u-asis-1', hecho_at: hace(dias), ...extra });

// Pasos de la plantilla (los no dinámicos), con lo que ya se resolvió por clave.
function pasosDe(n, cambios = {}) {
  const sol = solicitudes.find((x) => x.codigo === `SOL-${String(n).padStart(4, '0')}`);
  for (const pl of plantillaDe(sol.tipo_id)) {
    solicitud_pasos.push(pasoDePlantilla(pl, sol.id, `${sol.id}-${pl.clave}`, { created_at: sol.created_at, ...(cambios[pl.clave] || {}) }));
  }
}
// Un paso dinámico de la baja (uno por cuenta o por equipo).
function pasoBaja(n, clave, extra) {
  const sol = solicitudes.find((x) => x.codigo === `SOL-${String(n).padStart(4, '0')}`);
  solicitud_pasos.push(pasoDePlantilla(plantillaPaso('baja_empleado', clave), sol.id, `${sol.id}-${clave}-${solicitud_pasos.length}`, { created_at: sol.created_at, ...extra }));
}

pasosDe(1, { registrar_empleado: resuelto(3, { referencia_id: 'e07', hecho_por: 'u-jefe' }) });
pasosDe(2, {
  registrar_empleado: resuelto(5, { referencia_id: 'e12', hecho_por: 'u-asis-1' }),
  crear_cuenta: resuelto(4, { referencia_id: 'ac21' }),
});
pasoBaja(3, 'cerrar_accesos', resuelto(30, { hecho_por: 'u-jefe', nota: '1 asignaciones de cuenta y 0 de licencia cerradas.' }));
pasoBaja(3, 'devolver_equipo', { label: 'Recuperar el equipo CEL-001 · Samsung Galaxy A34 5G', objetivo_id: 'ae06' });
pasoBaja(4, 'cerrar_accesos', resuelto(60, { hecho_por: 'u-jefe', nota: '1 asignaciones de cuenta y 1 de licencia cerradas.' }));
pasoBaja(4, 'devolver_equipo', resuelto(58, { label: 'Recuperar el equipo TAB-001 · Samsung Galaxy Tab A8', objetivo_id: 'ae09', referencia_id: 'ae09' }));
pasosDe(5, {
  registrar_empleado: resuelto(12, { referencia_id: 'e09', hecho_por: 'u-jefe' }),
  crear_cuenta: resuelto(11),
  entregar_credenciales: resuelto(10, { hecho_por: null }),
  dar_accesos_area: { estado: 'omitido', hecho_por: 'u-asis-1', hecho_at: hace(10), motivo_omision: 'Logística no necesita accesos propios del área.' },
  asignar_equipo: { estado: 'omitido', hecho_por: 'u-asis-1', hecho_at: hace(10), motivo_omision: 'Usa un equipo del almacén.' },
  asignar_licencia: { estado: 'omitido', hecho_por: 'u-asis-1', hecho_at: hace(10), motivo_omision: 'No corresponde al cargo.' },
  confirmar_recepcion: resuelto(9, { automatico: false }),
});
pasosDe(6, {});

// ── Servicios y Cambios (migración 107) ────────────────────────────────────
const datosCambios = crearDatosCambios(hace);

export const TABLAS = {
  staff, staff_modulos_permisos, staff_permisos,
  empresas, areas_obras, ubicaciones, plataformas, tipos_equipo, catalogo_almacen,
  categorias_ticket, subcategorias_ticket,
  empleados, cuentas, asignaciones_cuenta,
  licencias, asignaciones_licencia,
  equipos, equipo_accesorios, asignaciones_equipo, eventos_equipo, actas, equipos_importacion,
  tickets, ticket_comentarios, ticket_eventos, ticket_satisfaccion,
  config_parametros,
  // v_tickets_por_reclasificar (116): misma regla que la vista; la RPC la recalcula.
  v_tickets_por_reclasificar: calcularPorReclasificar({ tickets, ticket_eventos, config_parametros, categorias_ticket, subcategorias_ticket }),
  // v_categorias_recurrentes (103): categorías con n+ tickets en `dias` días sin problema vinculado.
  v_categorias_recurrentes: categoriasRecurrentes(tickets, problema_tickets, categorias_ticket),
  kb_articulos, problemas, problema_tickets, acciones_correctivas,
  ticket_kb_usos, v_kpi_kb: calcularKpiKb(kb_articulos, ticket_kb_usos),
  encuestas, encuesta_rondas, encuesta_respuestas,
  accesos_sensibles, accesos_sensibles_permisos,
  accesos_log, notificaciones, notificaciones_lecturas, entregas,
  empleado_eventos, empleado_revisiones_acceso, v_empleado_ultima_revision_acceso,
  solicitud_tipos, solicitudes, solicitud_pasos,
  empleado_enlaces: [],
  ...datosCambios,
};

// v_categorias_recurrentes de la maqueta: misma regla que la vista de la 103
// (n y dias de umbral_recurrencia_tickets, tickets de cualquier estado con
// categoría, sin problema vinculado), en días de Lima.
function categoriasRecurrentes(filas, vinculos, categorias) {
  const vinculados = new Set(vinculos.map((v) => v.ticket_id));
  const desde = new Date(Date.now() - 30 * DIA_MS);
  const mapa = new Map();
  for (const t of filas) {
    if (!t.categoria_id || vinculados.has(t.id) || new Date(t.created_at) < desde) continue;
    if (!mapa.has(t.categoria_id)) mapa.set(t.categoria_id, []);
    mapa.get(t.categoria_id).push({ ticket_id: t.id, codigo: t.codigo, titulo: t.titulo, desde: t.created_at });
  }
  return [...mapa.entries()].filter(([, ts]) => ts.length >= 3).map(([categoria_id, ts]) => ({
    categoria_id, categoria_nombre: categorias.find((c) => c.id === categoria_id)?.nombre || '', total: ts.length,
    primer_ticket_at: ts.map((t) => t.desde).sort()[0], ultimo_ticket_at: ts.map((t) => t.desde).sort().at(-1),
    tickets: ts.sort((a, b) => a.desde.localeCompare(b.desde)),
  }));
}

// ── RPC ─────────────────────────────────────────────────────────────────────
// Cada entrada recibe la base en memoria (y los argumentos) y devuelve `data`.
export const RPC = {
  ...RPC_EQUIPOS,
  staff_nombres: (db) => db.staff.filter((s) => s.activo).map((s) => ({ user_id: s.user_id, nombre: s.nombre })),
  // Reportes (115): reporte_tickets y reporte_satisfaccion_consolidado con la
  // misma aritmética que el SQL — maqueta/rpc-reportes.js.
  ...RPC_REPORTES,
  // Reportes centralizados (117): inventario, licencias, correos, personal, solicitudes, cambios,
  // problemas, encuestas y auditoría — maqueta/rpc-reportes-*.js, misma aritmética que el SQL.
  ...RPC_REPORTES_117,
  cerrar_ticket: (db, args) => {
    const t = db.tickets.find((x) => x.id === args?.p_ticket_id);
    if (t) t.estado = 'cerrado';
    return t || null;
  },
  kb_registrar_feedback: (db, args) => {
    const a = db.kb_articulos.find((x) => x.id === args?.p_articulo_id);
    if (a) a[args.p_util ? 'util_si' : 'util_no'] += 1;
    return null;
  },
  // Cuentas (101) y ciclo de vida del empleado (102): maqueta/rpc-empleados.js
  // (incluye revocar_cuenta_personal y dar_baja_empleado con motivo).
  ...RPC_EMPLEADOS,
  // Licencias (101): crear_licencia_con_cuenta — maqueta/rpc-licencias.js.
  ...RPC_LICENCIAS,
  // Solicitudes de servicio (108): maqueta/rpc-solicitudes.js (pasos, autocompletado y cierre).
  ...RPC_SOLICITUDES,
  // Cambios (107): crear, editar, transicionar, aprobar, rechazar y enlazar tickets — maqueta/rpc-cambios.js.
  ...RPC_CAMBIOS,
  // KEDB (106): publicar_workaround_problema, crear_kb_desde_ticket, registrar_uso_kb_ticket — maqueta/rpc-kb.js.
  ...RPC_KB,
  // Portal del empleado (109): emitir y revocar el enlace — maqueta/rpc-portal.js (la function pública, en client.js).
  ...RPC_PORTAL,
  // Catálogo de tickets v2 (116): reclasificar_ticket — maqueta/rpc-catalogo-tickets.js.
  ...RPC_CATALOGO_TICKETS,
  // Inicio (103): una sola RPC; escenarios por `?maqueta=...` en maqueta/inicio.js.
  dashboard_resumen: (db) => resumenInicio(db, { usuarioId: USUARIO_MAQUETA.id }),
};
