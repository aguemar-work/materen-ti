// @vitest-environment happy-dom
//
// Expediente del empleado (EmpleadoDetalleView + sus componentes), montado de
// verdad: Pinia, router, AppLibro, AppCaratula y la tabla "En custodia" son
// reales; solo se mockea api/insforge.js y se stubean los diálogos (cada uno
// tiene su propia prueba en empleado-dialogos.render.test.js).
//
// Cubre lo que el rediseño promete: carátula con rótulo + DNI (enmascarado en
// lo impreso), UNA acción sólida según el estado, sello BAJA, guía de alta como
// fila de pasos, la tabla única de custodia con sus acciones y permisos, y el
// libro de movimientos (orden, filtros, vacío). Y lo que no se puede ver: sin el
// módulo de una sección, ni se pinta ni se pide.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import PrimeVue from 'primevue/config';
import EmpleadoDetalleView from '../../src/modules/empleados/EmpleadoDetalleView.vue';
import AppButton from '../../src/components/ui/AppButton.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { fechaLocalISO } from '../../src/core/formatters.js';

vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: {
    getEmpleado: vi.fn(),
    listCuentasPorEmpleado: vi.fn(),
    equiposPorEmpleado: vi.fn(),
    licenciasPorEmpleado: vi.fn(),
    entregasDeEmpleado: vi.fn(),
    ticketsDeEmpleado: vi.fn(),
    actasDeEmpleado: vi.fn(),
    ultimaRevisionAccesos: vi.fn(),
    listEventosEmpleado: vi.fn(),
    historialEquiposEmpleado: vi.fn(),
    historialCuentasEmpleado: vi.fn(),
    historialLicenciasEmpleado: vi.fn(),
    nombresStaff: vi.fn(),
  },
}));
import { insforgeApi } from '../../src/api/insforge.js';

const EMPLEADO = {
  id: 'e01', nombres: 'Rosa', apellidos: 'Quispe Mamani', dni: '45871236', estado: 'Activo',
  cargo: 'Asistente Administrativa', empresa_nombre: 'Materen', area_obra_nombre: 'Administración',
  ubicacion_nombre: 'Sede Lima', fecha_alta: '2024-03-14', whatsapp: '+51987654321', telefono: '',
  correo_personal: 'rquispe@correo.pe', notas: 'Turno mañana.', updated_at: '2026-09-01T10:00:00',
};

const CUENTAS = [
  { asignacion_id: 'ac01', cuenta_id: 'cu1', plataforma_nombre: 'Gmail', usuario: 'rquispe@materen.pe', fecha_inicio: '2024-03-14', tipo_cuenta: 'personal', requiere_rotacion: false, url: '' },
  { asignacion_id: 'ac02', cuenta_id: 'cu2', plataforma_nombre: 'Bitrix24', usuario: 'obra.lima', fecha_inicio: '2024-04-01', tipo_cuenta: 'reutilizable', requiere_rotacion: true, url: 'https://x.bitrix24.es' },
];
const EQUIPOS = [
  { asignacion_id: 'ae01', equipo_id: 'q1', codigo: 'LAP-0142', tipo: 'Laptop', marca: 'HP', modelo: 'ProBook', fecha_inicio: '2025-03-12', estado: 'operativo', situacion: 'asignado' },
  { asignacion_id: 'ae02', equipo_id: 'q2', codigo: 'MON-0031', tipo: 'Monitor', marca: 'Dell', modelo: '24"', fecha_inicio: '2025-03-12', estado: 'operativo', situacion: 'asignado' },
];
const LICENCIAS = [
  { asignacion_id: 'al01', software: 'AutoCAD 2026', fecha_inicio: '2026-02-01', tipo: 'suscripcion', fecha_vencimiento: '2099-01-01' },
];
const ACTAS = [{ id: 'act1', asignacion_equipo_id: 'ae01', tipo: 'entrega', equipo_id: 'q1', empleado_id: 'e01', created_at: '2025-03-14T09:00:00' }];
const ENTREGAS = [
  { id: 'n1', created_at: '2026-09-12T20:00:00', expires_at: '2026-09-13T20:00:00', viewed_at: '2026-09-12T20:14:00', created_by: 'u1' },
];
const TICKETS = [{ id: 't1', codigo: 'TCK-0281', titulo: 'Impresora de obra', estado: 'abierto', tipo: 'incidente', origen: 'empleado', created_at: '2026-09-28T14:02:00' }];
const EVENTOS = [
  { id: 'v1', empleado_id: 'e01', evento: 'creado', user_id: null, user_email: null, rol_actor: 'legado', detalle: 'Registro anterior a la auditoría', created_at: '2024-03-13T09:00:00' },
  { id: 'v2', empleado_id: 'e01', evento: 'accesos_revisados', user_id: 'u1', user_email: 'jefe@materen.pe', rol_actor: 'jefe', detalle: 'Sin observaciones', created_at: '2026-09-20T09:00:00' },
];
const HIST_CUENTAS = [{ id: 'ac01', cuenta_id: 'cu1', fecha_inicio: '2024-03-14', fecha_fin: null, notas: '', usuario: 'rquispe@materen.pe', tipo_cuenta: 'personal', plataforma: 'Gmail' }];
const HIST_EQUIPOS = {
  asignaciones: [{ id: 'ae01', equipo_id: 'q1', fecha_inicio: '2025-03-12', fecha_fin: null, created_at: '2025-03-12T10:30:00', codigo: 'LAP-0142', descripcion: 'HP ProBook' }],
  eventos: [{ id: 'eq1', equipo_id: 'q1', evento: 'asignado', detalle: 'Entregado a Rosa Quispe Mamani — Buen estado', user_email: 'dhuaman@materen.pe', created_at: '2025-03-12T10:30:00' }],
};

const MODULOS_TODOS = ['empleados', 'correos', 'equipos', 'licencias', 'tickets'];

function cargarApi(sobre = {}) {
  const api = {
    empleado: EMPLEADO, cuentas: CUENTAS, equipos: EQUIPOS, licencias: LICENCIAS, actas: ACTAS,
    entregas: ENTREGAS, tickets: TICKETS, eventos: EVENTOS, ...sobre,
  };
  insforgeApi.getEmpleado.mockResolvedValue(api.empleado);
  insforgeApi.listCuentasPorEmpleado.mockResolvedValue(api.cuentas);
  insforgeApi.equiposPorEmpleado.mockResolvedValue(api.equipos);
  insforgeApi.licenciasPorEmpleado.mockResolvedValue(api.licencias);
  insforgeApi.entregasDeEmpleado.mockResolvedValue(api.entregas);
  insforgeApi.ticketsDeEmpleado.mockResolvedValue(api.tickets);
  insforgeApi.actasDeEmpleado.mockResolvedValue(api.actas);
  insforgeApi.ultimaRevisionAccesos.mockResolvedValue({ revisado_at: '2026-09-20T09:00:00', revisado_por: 'u1' });
  insforgeApi.listEventosEmpleado.mockResolvedValue(api.eventos);
  insforgeApi.historialEquiposEmpleado.mockResolvedValue(api.equipos.length ? HIST_EQUIPOS : { asignaciones: [], eventos: [] });
  insforgeApi.historialCuentasEmpleado.mockResolvedValue(api.cuentas.length ? HIST_CUENTAS : []);
  insforgeApi.historialLicenciasEmpleado.mockResolvedValue([]);
  insforgeApi.nombresStaff.mockResolvedValue([{ user_id: 'u1', nombre: 'Alejandro Guevara' }]);
}

const STUBS = {
  EmpleadoForm: true, BajaEmpleadoModal: true, EmpleadoMotivoDialog: true, ReingresarEmpleadoDialog: true,
  AsignarEquipoModal: true, AsignarLicenciaModal: true, CuentaForm: true, TraspasarCuentaDialog: true,
  HistorialCuentaDialog: true, ConfirmDialog: true,
};

const espera = (ms = 0) => new Promise((r) => setTimeout(r, ms));
// Ficha + custodia + libro: tres tandas de promesas encadenadas.
async function listo() {
  for (let i = 0; i < 4; i += 1) await espera();
}

const montados = [];
async function montar({ modulos = MODULOS_TODOS, rol = 'JEFE', url = '/empleados/e01' } = {}) {
  const auth = useAuthStore();
  auth.rol = rol;
  auth.modulosVisibles = modulos;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/empleados', component: { template: '<div />' } },
      { path: '/empleados/:id', component: { template: '<div />' } },
      { path: '/:resto(.*)*', component: { template: '<div />' } },
    ],
  });
  router.push(url);
  await router.isReady();
  const w = mount(EmpleadoDetalleView, {
    attachTo: document.body,
    global: { plugins: [router, [PrimeVue, { unstyled: true }]], stubs: STUBS },
  });
  montados.push(w);
  await listo();
  return { w, router };
}

const caratula = (w) => w.find('[data-caratula]');
const filasLibro = (w) => w.findAll('[data-libro] tbody tr');
const seccion = (w, titulo) => w.findAll('section').find((s) => s.find('h2')?.text().includes(titulo));
const movimientos = (w) => filasLibro(w).map((f) => f.find('td:nth-child(2)').text());
const itemsDelMenu = () => [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim());

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  cargarApi();
});

afterEach(() => {
  while (montados.length) montados.pop().unmount();
  document.body.innerHTML = '';
});

describe('Expediente — carátula', () => {
  it('abre con rótulo EMPLEADO · DNI, el nombre como único h1 y el dl de datos (sin avatar)', async () => {
    const { w } = await montar();
    const c = caratula(w);
    expect(c.find('p').text()).toContain('EMPLEADO');
    expect(c.find('p').text()).toContain('45871236');
    expect(w.findAll('h1')).toHaveLength(1);
    expect(c.find('h1').text()).toBe('Rosa Quispe Mamani');
    expect(c.findAll('dt').map((d) => d.text())).toEqual(['Empresa', 'Área/obra', 'Cargo', 'Alta', 'WhatsApp', 'Correo']);
    const valores = c.findAll('dd').map((d) => d.text());
    expect(valores[0]).toBe('Materen');
    expect(valores[3]).toBe('14/03/2024');
    expect(c.find('dd a[href^="https://wa.me/"]').exists()).toBe(true);
    expect(c.find('dd a[href^="mailto:"]').text()).toBe('rquispe@correo.pe');
    expect(w.text()).not.toContain('Cargando empleado');
  });

  it('el DNI va completo en pantalla y enmascarado (****1236) en lo impreso', async () => {
    const { w } = await montar();
    const rotulo = caratula(w).find('p');
    const enPantalla = rotulo.find('span.print\\:hidden');
    const enPapel = rotulo.find('span.hidden');
    expect(enPantalla.text()).toContain('45871236');
    expect(enPapel.classes()).toContain('print:inline');
    expect(enPapel.text()).toContain('****1236');
    expect(enPapel.text()).not.toContain('45871236');
  });

  it('Activo: tag Activo, Dar de baja y Editar (la ÚNICA sólida) y menú Más con Suspender, Revisar accesos e Imprimir', async () => {
    const { w } = await montar();
    const c = caratula(w);
    expect(c.text()).toContain('Activo');
    const botones = c.findAllComponents(AppButton);
    expect(botones.map((b) => b.props('label'))).toEqual(['Dar de baja', 'Editar']);
    expect(botones.filter((b) => b.props('variant') === 'solid').map((b) => b.props('label'))).toEqual(['Editar']);

    await c.find('button[aria-label="Más acciones del expediente"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Suspender', 'Revisar accesos', 'Imprimir expediente']);
  });

  it('Suspendido: tag Suspendido y la sólida es Reactivar; Dar de baja pasa al menú', async () => {
    cargarApi({ empleado: { ...EMPLEADO, estado: 'Suspendido' } });
    const { w } = await montar();
    const c = caratula(w);
    expect(c.text()).toContain('Suspendido');
    const botones = c.findAllComponents(AppButton);
    expect(botones.filter((b) => b.props('variant') === 'solid').map((b) => b.props('label'))).toEqual(['Reactivar']);
    await c.find('button[aria-label="Más acciones del expediente"]').trigger('click');
    expect(itemsDelMenu()).toContain('Dar de baja');
    expect(itemsDelMenu()).not.toContain('Suspender');
  });

  it('Inactivo: sello BAJA con la fecha de la hoja de vida y la sólida es Reingresar', async () => {
    cargarApi({
      empleado: { ...EMPLEADO, estado: 'Inactivo' },
      eventos: [...EVENTOS, { id: 'v9', empleado_id: 'e01', evento: 'baja_ejecutada', rol_actor: 'jefe', user_id: 'u1', detalle: 'Término de contrato', created_at: '2026-08-12T15:00:00' }],
    });
    const { w } = await montar();
    const c = caratula(w);
    expect(c.find('[data-sello]').text()).toBe('BAJA 12/08/2026');
    expect(c.find('[data-tag]').exists()).toBe(false);
    const botones = c.findAllComponents(AppButton);
    expect(botones.map((b) => b.props('label'))).toEqual(['Editar', 'Reactivar', 'Reingresar']);
    expect(botones.filter((b) => b.props('variant') === 'solid').map((b) => b.props('label'))).toEqual(['Reingresar']);
  });

  it('Dar de baja abre el diálogo de baja', async () => {
    const { w } = await montar();
    expect(w.findComponent({ name: 'BajaEmpleadoModal' }).exists()).toBe(false);
    await caratula(w).findAll('button').find((b) => b.text() === 'Dar de baja').trigger('click');
    expect(w.findComponent({ name: 'BajaEmpleadoModal' }).exists()).toBe(true);
  });

  it('Suspender, desde el menú Más, abre el diálogo con su acción', async () => {
    const { w } = await montar();
    await caratula(w).find('button[aria-label="Más acciones del expediente"]').trigger('click');
    [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((i) => i.textContent.includes('Suspender')).click();
    await espera();
    expect(w.findComponent({ name: 'EmpleadoMotivoDialog' }).props('accion')).toBe('suspender');
  });

  it('Reingresar abre su diálogo', async () => {
    cargarApi({ empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    const { w } = await montar();
    await caratula(w).findAll('button').find((b) => b.text() === 'Reingresar').trigger('click');
    expect(w.findComponent({ name: 'ReingresarEmpleadoDialog' }).exists()).toBe(true);
  });
});

describe('Expediente — En custodia', () => {
  it('reúne cuentas, equipos y licencias en UNA tabla con TIPO · IDENTIFICADOR · DETALLE · DESDE', async () => {
    const { w } = await montar();
    const tabla = w.find('table[aria-label^="Cuentas, equipos"]');
    expect(tabla.findAll('thead th').map((t) => t.text().replace(/\s+/g, '').slice(0, 13))).toEqual(['Tipo', 'Identificador', 'Detalle', 'Desde', 'AccionesMás']);
    expect(tabla.findAll('[data-custodia="cuenta"]')).toHaveLength(2);
    expect(tabla.findAll('[data-custodia="equipo"]')).toHaveLength(2);
    expect(tabla.findAll('[data-custodia="licencia"]')).toHaveLength(1);
    expect(seccion(w, 'En custodia').find('h2').text()).toContain('5');
    // Ya no hay tres paneles sueltos.
    expect(w.findAll('h2').map((h) => h.text()).some((t) => /^Accesos|^Equipos$|^Licencias$/.test(t))).toBe(false);
  });

  it('el equipo se identifica con AppCodigo y abre su hoja de vida (/equipos/:id, no /equipos?q=)', async () => {
    const { w } = await montar();
    const fila = w.find('[data-custodia="equipo"]');
    expect(fila.find('[data-codigo]').text()).toBe('LAP-0142');
    expect(fila.find('a[href="/equipos/q1"]').exists()).toBe(true);
    expect(w.html()).not.toContain('/equipos?q=');
  });

  it('acta firmada ✓ si existe y "Adjuntar acta" si no, ambos hacia la ruta imprimible', async () => {
    const { w } = await montar();
    const filas = w.findAll('[data-custodia="equipo"]');
    expect(filas[0].find('a[href="/equipos/q1/acta/ae01?tipo=entrega"]').text()).toBe('acta firmada ✓');
    expect(filas[1].find('a[href="/equipos/q2/acta/ae02?tipo=entrega"]').text()).toBe('Adjuntar acta');
  });

  it('conserva el revelado de contraseña con su marcado .cred* y no lo imprime', async () => {
    const { w } = await montar();
    const fila = w.find('[data-custodia="cuenta"]');
    expect(fila.find('.cred').exists()).toBe(true);
    expect(fila.find('.cred__oculto').text()).toBe('••••••••');
    expect(fila.find('button[aria-label="Mostrar contraseña"]').exists()).toBe(true);
    expect(fila.find('button[aria-label="Copiar contraseña"]').exists()).toBe(true);
    expect(fila.find('.cred').element.closest('[data-no-print]')).not.toBeNull();
  });

  it('sin "credenciales.ver" la fila muestra el candado con su motivo, no los botones de revelar', async () => {
    const { w } = await montar({ rol: 'ASISTENTE' });
    const fila = w.find('[data-custodia="cuenta"]');
    expect(fila.find('button[aria-label="Mostrar contraseña"]').exists()).toBe(false);
    expect(fila.find('.cred__candado').attributes('title')).toBe('Sin permiso para ver contraseñas.');
  });

  it('una cuenta personal ofrece Historial, Editar y Eliminar; NO Traspasar (el servidor la rechaza)', async () => {
    const { w } = await montar();
    await w.findAll('[data-custodia="cuenta"]')[0].find('button[aria-haspopup="menu"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Historial', 'Editar', 'Eliminar']);
  });

  it('una cuenta reutilizable sí ofrece Traspasar, abrir la plataforma y Revocar', async () => {
    const { w } = await montar();
    await w.findAll('[data-custodia="cuenta"]')[1].find('button[aria-haspopup="menu"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Historial', 'Editar', 'Traspasar a otro empleado', 'Abrir la plataforma', 'Revocar']);
  });

  it('Traspasar abre el diálogo de traspaso de ESA cuenta', async () => {
    const { w } = await montar();
    await w.findAll('[data-custodia="cuenta"]')[1].find('button[aria-haspopup="menu"]').trigger('click');
    [...document.querySelectorAll('[data-pc-section="itemcontent"]')].find((i) => i.textContent.includes('Traspasar')).click();
    await espera();
    expect(w.findComponent({ name: 'TraspasarCuentaDialog' }).props('cuenta').asignacion_id).toBe('ac02');
  });

  it('los equipos ofrecen hoja de vida, registrar devolución y acta de entrega', async () => {
    const { w } = await montar();
    await w.find('[data-custodia="equipo"] button[aria-haspopup="menu"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Ver hoja de vida', 'Registrar devolución', 'Acta de entrega']);
  });

  it('las licencias ofrecen Ver en Licencias y Liberar asiento', async () => {
    const { w } = await montar();
    await w.find('[data-custodia="licencia"] button[aria-haspopup="menu"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Ver en Licencias', 'Liberar asiento']);
  });

  it('un empleado Inactivo no ofrece "Agregar": el servidor rechazaría cuentas y equipos', async () => {
    cargarApi({ empleado: { ...EMPLEADO, estado: 'Inactivo' } });
    const { w } = await montar();
    expect(w.find('button[aria-label="Agregar a la custodia"]').exists()).toBe(false);
  });

  it('un Activo ofrece Agregar: cuenta, equipo y licencia', async () => {
    const { w } = await montar();
    await w.find('button[aria-label="Agregar a la custodia"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Cuenta de correo', 'Equipo', 'Licencia']);
  });

  it('un Suspendido no recibe equipos nuevos (solo un Activo): "Agregar" ofrece cuenta y licencia', async () => {
    cargarApi({ empleado: { ...EMPLEADO, estado: 'Suspendido' } });
    const { w } = await montar();
    await w.find('button[aria-label="Agregar a la custodia"]').trigger('click');
    expect(itemsDelMenu()).toEqual(['Cuenta de correo', 'Licencia']);
  });

  it('sin nada en custodia la tabla registra el vacío como una fila, con la acción en la misma fila', async () => {
    cargarApi({ cuentas: [], equipos: [], licencias: [] });
    const { w } = await montar();
    const vacia = w.find('[data-custodia-vacia]');
    expect(vacia.text()).toContain('Sin cuentas, equipos ni licencias en custodia');
    expect(vacia.find('button').text()).toBe('Agregar cuenta');
  });
});

describe('Expediente — secciones y entregas', () => {
  it('Tickets y solicitudes: código con AppCodigo hacia /tickets/:id y el estado como tag', async () => {
    const { w } = await montar();
    const s = seccion(w, 'Tickets y solicitudes');
    expect(s.find('a[href="/tickets/t1"] [data-codigo]').text()).toBe('TCK-0281');
    expect(s.text()).toContain('Impresora de obra');
    expect(s.find('[data-tag]').text()).toBe('Abierto');
  });

  it('Entregas de credenciales: estado y fecha de cada una, y "Enviar nueva" con permiso', async () => {
    const { w } = await montar();
    const s = seccion(w, 'Entregas de credenciales');
    expect(s.text()).toContain('Entrega abierta');
    expect(s.text()).toContain('12/09/26');
    expect(s.text()).toContain('Enviar nueva');
  });

  it('"Enviar nueva" no se ofrece sin credenciales.ver', async () => {
    const { w } = await montar({ rol: 'ASISTENTE' });
    expect(seccion(w, 'Entregas de credenciales').text()).not.toContain('Enviar nueva');
  });

  it('muestra el último control de accesos con quién lo hizo', async () => {
    const { w } = await montar();
    expect(w.text()).toMatch(/Último control de accesos\s*20\/09\/26 · Alejandro Guevara/);
  });
});

describe('Expediente — guía de alta', () => {
  const sinCuentas = () => cargarApi({
    empleado: { ...EMPLEADO, fecha_alta: fechaLocalISO(-1) },
    cuentas: [], equipos: [], licencias: [], entregas: [],
  });
  const guiaDe = (w) => w.find('#alta-titulo').element.closest('section');
  const textoPaso = (li) => [...li.children].map((c) => c.textContent.trim()).filter(Boolean).join(' ');
  const pasosDe = (guia) => [...guia.querySelectorAll('li')].map(textoPaso);

  it('un alta a medias muestra una fila de pasos (sin barra de progreso) y cada pendiente con su acción', async () => {
    sinCuentas();
    const { w } = await montar();
    const guia = guiaDe(w);
    expect(guia.textContent).toMatch(/Alta en curso · 0 de 4 pasos · entró hace 1 día/i);
    expect(pasosDe(guia)).toEqual([
      'Cuenta de correo Crear cuenta',
      'Credenciales entregadas',
      'Equipo opcional Entregar',
      'Licencia opcional Asignar',
    ]);
    expect(guia.querySelector('[role="progressbar"], .bg-primary-500')).toBeNull();
  });

  it('"Crear cuenta" abre el formulario de cuenta; "Entregar" abre la asignación de equipo', async () => {
    sinCuentas();
    const { w } = await montar();
    const boton = (t) => [...guiaDe(w).querySelectorAll('button')].find((b) => b.textContent.trim() === t);
    boton('Crear cuenta').click();
    await espera();
    expect(w.findComponent({ name: 'CuentaForm' }).exists()).toBe(true);
    boton('Entregar').click();
    await espera();
    expect(w.findComponent({ name: 'AsignarEquipoModal' }).exists()).toBe(true);
  });

  it('con una cuenta y la entrega hechas, esos dos pasos quedan marcados y sin acción', async () => {
    cargarApi({ empleado: { ...EMPLEADO, fecha_alta: fechaLocalISO(-1) }, equipos: [], licencias: [] });
    const { w } = await montar({ url: '/empleados/e01?nuevo=1' });
    const pasos = [...guiaDe(w).querySelectorAll('li')];
    expect(pasos[0].dataset.hecho).toBe('true');
    expect(pasos[1].dataset.hecho).toBe('true');
    expect(pasos[0].querySelector('button')).toBeNull();
    expect(guiaDe(w).textContent).toMatch(/2 de 4 pasos/);
  });

  it('con `?nuevo=1` la guía aparece aunque nada falte; ocultarla la quita y limpia la URL', async () => {
    const { w, router } = await montar({ url: '/empleados/e01?nuevo=1' });
    expect(w.find('#alta-titulo').exists()).toBe(true);
    await w.find('button[aria-label="Ocultar la guía de alta"]').trigger('click');
    await espera();
    expect(w.find('#alta-titulo').exists()).toBe(false);
    expect(router.currentRoute.value.query.nuevo).toBeUndefined();
  });

  it('un alta ya completa y antigua no muestra la guía', async () => {
    const { w } = await montar();
    expect(w.find('#alta-titulo').exists()).toBe(false);
  });
});

describe('Expediente — sin permisos de módulo', () => {
  it('con solo `empleados`: sin custodia, tickets ni entregas, y esas fuentes ni se piden', async () => {
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['empleados'] });
    const titulos = w.findAll('h2').map((h) => h.text());
    expect(titulos.some((t) => t.includes('En custodia'))).toBe(false);
    expect(titulos.some((t) => t.includes('Tickets y solicitudes'))).toBe(false);
    expect(titulos.some((t) => t.includes('Entregas de credenciales'))).toBe(false);
    expect(w.text()).not.toContain('Adjuntar acta');
    // La carátula, los datos y el libro de la hoja de vida siguen.
    expect(caratula(w).find('h1').text()).toBe('Rosa Quispe Mamani');
    expect(titulos.some((t) => t.includes('Libro de movimientos'))).toBe(true);
    for (const fuente of ['listCuentasPorEmpleado', 'equiposPorEmpleado', 'licenciasPorEmpleado', 'entregasDeEmpleado',
      'ticketsDeEmpleado', 'actasDeEmpleado', 'historialEquiposEmpleado', 'historialCuentasEmpleado', 'historialLicenciasEmpleado']) {
      expect(insforgeApi[fuente], fuente).not.toHaveBeenCalled();
    }
    expect(insforgeApi.listEventosEmpleado).toHaveBeenCalled();
  });

  it('el libro de ese rol solo contiene la hoja de vida (nada de cuentas ni equipos)', async () => {
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['empleados'] });
    expect(movimientos(w)).toEqual(['Accesos revisados', 'Registrado']);
  });

  it('con solo `equipos`: aparecen los equipos y NO las cuentas, y las cuentas no se piden', async () => {
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['empleados', 'equipos'] });
    expect(w.findAll('[data-custodia="equipo"]')).toHaveLength(2);
    expect(w.findAll('[data-custodia="cuenta"]')).toHaveLength(0);
    expect(w.findAll('[data-custodia="licencia"]')).toHaveLength(0);
    expect(insforgeApi.listCuentasPorEmpleado).not.toHaveBeenCalled();
    expect(insforgeApi.equiposPorEmpleado).toHaveBeenCalled();
  });

  it('la guía de alta no pide pasos de módulos que el rol no ve', async () => {
    cargarApi({ empleado: { ...EMPLEADO, fecha_alta: fechaLocalISO(-1) }, cuentas: [], equipos: [], licencias: [], entregas: [] });
    const { w } = await montar({ rol: 'ASISTENTE', modulos: ['empleados', 'licencias'], url: '/empleados/e01?nuevo=1' });
    const guia = w.find('#alta-titulo').element.closest('section');
    const textoPaso = (li) => [...li.children].map((c) => c.textContent.trim()).filter(Boolean).join(' ');
    expect([...guia.querySelectorAll('li')].map(textoPaso)).toEqual(['Licencia opcional Asignar']);
  });
});

describe('Expediente — libro de movimientos', () => {
  it('mezcla las fuentes y ordena lo más reciente arriba', async () => {
    const { w } = await montar();
    const movs = movimientos(w);
    expect(movs[0]).toBe('Ticket registrado'); // 28/09/26 es lo último
    expect(movs.indexOf('Entrega abierta')).toBeLessThan(movs.indexOf('Entrega enviada')); // 20:14 antes que 20:00
    expect(movs).toEqual(expect.arrayContaining([
      'Accesos revisados', 'Entrega enviada', 'Entrega abierta', 'Equipo entregado', 'Cuenta asignada', 'Ticket registrado', 'Registrado',
    ]));
    expect(movs.at(-1)).toBe('Registrado');
    expect(seccion(w, 'Libro de movimientos').find('h2').text()).toContain(String(movs.length));
  });

  it('cada movimiento enlaza con su expediente: equipo y ticket', async () => {
    const { w } = await montar();
    expect(w.find('[data-libro] a[href="/equipos/q1"]').exists()).toBe(true);
    expect(w.find('[data-libro] a[href="/tickets/t1"]').text()).toBe('TCK-0281');
  });

  it('un movimiento sin actor dice "no registrado (legado)"; con actor, el nombre del staff', async () => {
    const { w } = await montar();
    const registrado = filasLibro(w).find((f) => f.text().includes('Registro anterior a la auditoría'));
    expect(registrado.text()).toContain('no registrado (legado)');
    const revision = filasLibro(w).find((f) => f.find('td:nth-child(2)').text() === 'Accesos revisados');
    expect(revision.text()).toContain('Alejandro Guevara');
  });

  it('los filtros Todo · Accesos · Equipos · Licencias muestran cada uno lo suyo', async () => {
    insforgeApi.historialLicenciasEmpleado.mockResolvedValue([
      { id: 'al01', licencia_id: 'li1', fecha_inicio: '2026-02-01', fecha_fin: null, software: 'AutoCAD 2026' },
    ]);
    const { w } = await montar();
    const filtro = (t) => seccion(w, 'Libro de movimientos').find('[role="group"]').findAll('button').find((b) => b.text() === t);

    await filtro('Equipos').trigger('click');
    expect(movimientos(w)).toEqual(['Acta firmada adjuntada', 'Equipo entregado']);

    await filtro('Licencias').trigger('click');
    expect(movimientos(w)).toEqual(['Licencia asignada']);

    await filtro('Accesos').trigger('click');
    expect(movimientos(w).every((m) => /Cuenta|Entrega|Accesos/.test(m))).toBe(true);
    expect(movimientos(w)).not.toContain('Ticket registrado');

    await filtro('Todo').trigger('click');
    expect(movimientos(w)).toContain('Ticket registrado');
  });

  it('un filtro sin filas deja UNA fila de libro en gris, no una ilustración', async () => {
    const { w } = await montar();
    await seccion(w, 'Libro de movimientos').find('[role="group"]').findAll('button').find((b) => b.text() === 'Licencias').trigger('click');
    expect(w.find('[data-libro-vacio]').text()).toBe('— Sin movimientos registrados');
  });
});

describe('Expediente — carga', () => {
  it('un empleado inexistente avisa y vuelve al listado', async () => {
    insforgeApi.getEmpleado.mockResolvedValue(null);
    const { router } = await montar();
    expect(router.currentRoute.value.path).toBe('/empleados');
  });

  it('pide la ficha, la hoja de vida y las cuentas una sola vez (presupuesto de lecturas)', async () => {
    await montar();
    expect(insforgeApi.getEmpleado).toHaveBeenCalledTimes(1);
    expect(insforgeApi.listEventosEmpleado).toHaveBeenCalledTimes(1);
    expect(insforgeApi.listCuentasPorEmpleado).toHaveBeenCalledTimes(1);
  });
});
