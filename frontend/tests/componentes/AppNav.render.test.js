// @vitest-environment happy-dom
//
// AppNav.vue — SideNav del shell (rediseño PrimeVue/Tailwind, 2026-09-22).
// Cubre lo que el rediseño podía romper sin que nada lo notara:
//   · el badge de "tickets sin asignar" SIGUE a la prop (antes se leía una
//     sola vez al montar, dentro de la constante AREAS, y quedaba congelado);
//   · el filtro por rol/módulo (el nav refleja al guard, nunca es la barrera);
//   · el riel: rótulos ocultos solo en desktop, nombre accesible intacto.
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import AppNav from '../../src/components/shared/AppNav.vue';
import { useAuthStore } from '../../src/stores/auth.js';

const Vacio = { template: '<div />' };

function crearRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: Vacio }],
  });
}

async function montar({ rol = 'JEFE', modulos = [], props = {} } = {}) {
  const auth = useAuthStore();
  auth.$patch({ user: { id: 'u1' }, rol, nombre: 'Prueba', modulosVisibles: modulos });
  const router = crearRouter();
  router.push('/tickets');
  await router.isReady();
  return mount(AppNav, { props, global: { plugins: [router] } });
}

function link(wrapper, path) {
  return wrapper.findAll('a').find((a) => a.attributes('href') === path);
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('AppNav.vue', () => {
  it('el badge de tickets sin asignar se actualiza cuando cambia la prop', async () => {
    const w = await montar({ props: { ticketsSinAsignar: 0 } });
    expect(link(w, '/tickets').text()).toBe('Tickets');

    await w.setProps({ ticketsSinAsignar: 3 });
    expect(link(w, '/tickets').text()).toContain('3');
    expect(link(w, '/tickets').find('[title="3 ticket(s) sin asignar"]').exists()).toBe(true);

    await w.setProps({ ticketsSinAsignar: 0 });
    expect(link(w, '/tickets').text()).toBe('Tickets');
  });

  it('ASISTENTE sin módulos: sin Actividad/Accesos sensibles ni ítems con módulo; Configuración sí', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['equipos'] });
    expect(link(w, '/actividad')).toBeUndefined();
    expect(link(w, '/accesos-sensibles')).toBeUndefined();
    expect(link(w, '/tickets')).toBeUndefined();
    expect(link(w, '/equipos')).toBeDefined();
    expect(link(w, '/configuracion')).toBeDefined();
    // Un grupo sin ítems visibles no deja su rótulo huérfano.
    expect(w.text()).not.toContain('Mesa de ayuda');
  });

  it('JEFE ve los grupos y módulos con los nombres nuevos, en su orden', async () => {
    const w = await montar();
    const rotulos = w.findAll('div').map((d) => d.text()).filter((t) => ['Mesa de ayuda', 'Personas', 'Custodia', 'Administración'].includes(t));
    expect(rotulos).toEqual(['Mesa de ayuda', 'Personas', 'Custodia', 'Administración']);
    const enlaces = w.findAll('a').map((a) => a.text());
    expect(enlaces).toEqual([
      'Inicio', 'Reportes', 'Tickets', 'Conocimiento', 'Problemas', 'Cambios', 'Empleados', 'Solicitudes', 'Encuestas',
      'Equipos', 'Licencias', 'Correos', 'Registro de actividad', 'Accesos sensibles', 'Configuración',
    ]);
  });

  it('ASISTENTE solo con Equipos: sin Registro de actividad y con su único módulo en Custodia', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['equipos'] });
    // Reportes se ve: Equipos tiene su reporte (Inventario de equipos).
    expect(w.findAll('a').map((a) => a.text())).toEqual(['Inicio', 'Reportes', 'Equipos', 'Configuración']);
    expect(w.text()).toContain('Custodia');
    expect(w.text()).not.toContain('Personas');
  });

  it('Reportes no aparece si ningún módulo del integrante tiene un reporte', async () => {
    const w = await montar({ rol: 'ASISTENTE', modulos: ['base_conocimiento'] });
    expect(w.findAll('a').map((a) => a.text())).toEqual(['Inicio', 'Conocimiento', 'Configuración']);
  });

  // `nav-activo` es la marca del ítem activo (V2): el look puede cambiar sin
  // que el test dependa de un color concreto.
  it('marca el ítem de la ruta actual como activo', async () => {
    const w = await montar();
    expect(link(w, '/tickets').classes()).toContain('nav-activo');
    expect(link(w, '/equipos').classes()).not.toContain('nav-activo');
  });

  it('en el riel oculta rótulos solo en desktop y conserva el nombre de cada ítem', async () => {
    const w = await montar({ props: { navEnRiel: true } });
    const tickets = link(w, '/tickets');
    expect(tickets.attributes('title')).toBe('Tickets');
    // sr-only (no display:none): el lector de pantalla sigue leyendo el ítem.
    expect(tickets.find('span').classes()).toContain('md:sr-only');
    expect(w.find('button[aria-label="Expandir navegación"]').exists()).toBe(true);
  });

  it('expandido no muestra el botón de expandir ni title en los ítems', async () => {
    const w = await montar();
    expect(link(w, '/tickets').attributes('title')).toBeUndefined();
    expect(w.find('button[aria-label="Expandir navegación"]').exists()).toBe(false);
  });

  it('el botón del riel emite expandir-nav y un click en un ítem emite cerrar-nav', async () => {
    const w = await montar({ props: { navEnRiel: true } });
    await w.find('button[aria-label="Expandir navegación"]').trigger('click');
    expect(w.emitted('expandir-nav')).toHaveLength(1);
    await link(w, '/equipos').trigger('click');
    expect(w.emitted('cerrar-nav')).toHaveLength(1);
  });
});
