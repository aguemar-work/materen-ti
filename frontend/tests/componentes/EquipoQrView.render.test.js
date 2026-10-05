// @vitest-environment happy-dom
//
// EquipoQrView.vue — destino del QR de la etiqueta: `/e/:codigo` (ruta
// pública). Contrato de seguridad (plan §3.6): SIN sesión no se consulta NADA
// a la API y solo se ve "si lo encontró, comuníquese con TI"; CON sesión de
// staff con el módulo `equipos` el código se resuelve y se redirige a la hoja
// de vida; sin módulo o sin resultado, un mensaje claro.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import EquipoQrView from '../../src/modules/equipos/EquipoQrView.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import soporteRoutes from '../../src/router/routes/soporte.routes.js';
import inventarioRoutes from '../../src/router/routes/inventario.routes.js';
import { setupGuards } from '../../src/router/guards.js';
import { getClient } from '../../src/api/client.js';

// Todos los métodos de datos son espías: el test de "sin sesión" exige que
// NINGUNO se llame (Proxy: cualquier método que se pida existe y se registra).
const llamadas = [];
vi.mock('../../src/api/insforge.js', () => ({
  insforgeApi: new Proxy({}, {
    get: (_, metodo) => {
      if (metodo === 'buscarEquipoPorCodigo') return (...a) => { llamadas.push(['buscarEquipoPorCodigo', ...a]); return respuesta(...a); };
      return (...a) => { llamadas.push([String(metodo), ...a]); return Promise.resolve(null); };
    },
  }),
}));
vi.mock('../../src/core/marca.js', async (importar) => ({
  ...(await importar()),
  CONTACTO_TI: { texto: 'Mesa de ayuda: 987 654 321', enlace: 'tel:+51987654321' },
}));
vi.mock('../../src/api/client.js', () => ({
  getClient: vi.fn(() => { throw new Error('el router público no debe pedir el cliente de datos'); }),
}));
let respuesta = () => Promise.resolve(null);
const MarcaReal = await vi.importActual('../../src/core/marca.js');

const flush = () => new Promise((r) => setTimeout(r, 0));

async function montar({ sesion = null } = {}) {
  setActivePinia(createPinia());
  if (sesion) useAuthStore().$patch(sesion);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/equipos', component: { template: '<div />' } },
      { path: '/equipos/:id', name: 'equipo-detalle', component: { template: '<div />' } },
      { path: '/e/:codigo', component: EquipoQrView, meta: { public: true } },
    ],
  });
  router.push('/e/LAP-0142');
  await router.isReady();
  const w = mount(EquipoQrView, { global: { plugins: [router] } });
  await flush();
  await flush();
  return { w, router };
}

const STAFF = { user: { id: 'u1' }, rol: 'JEFE', modulosVisibles: [] };

beforeEach(() => {
  llamadas.length = 0;
  respuesta = () => Promise.resolve(null);
});

describe('/e/:codigo — la ruta', () => {
  it('es pública (el QR lo escanea cualquiera) y la carga diferida apunta a EquipoQrView', () => {
    const ruta = soporteRoutes.find((r) => r.path === '/e/:codigo');
    expect(ruta).toBeTruthy();
    expect(ruta.meta.public).toBe(true);
    expect(ruta.name).toBe('equipo-qr');
  });
});

describe('/e/:codigo — router real (guards)', () => {
  it('un visitante sin sesión llega a la ruta sin que el router llame a la API (ni cargue sesión)', async () => {
    setActivePinia(createPinia());
    const router = createRouter({ history: createMemoryHistory(), routes: [...soporteRoutes, ...inventarioRoutes] });
    setupGuards(router);
    await router.push('/e/LAP-0142');
    expect(router.currentRoute.value.name).toBe('equipo-qr');
    expect(router.currentRoute.value.params.codigo).toBe('LAP-0142');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('la hoja de vida, las etiquetas y el acta SÍ exigen el módulo equipos', () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [...soporteRoutes, ...inventarioRoutes] });
    for (const ruta of ['/equipos/q1', '/equipos/etiquetas', '/equipos/q1/acta/a1?tipo=entrega']) {
      const meta = router.resolve(ruta).meta;
      expect(meta.modulo, ruta).toBe('equipos');
      expect(meta.public, ruta).toBeUndefined();
    }
    expect(router.resolve('/equipos/etiquetas').name).toBe('equipos-etiquetas'); // no se confunde con :id
  });
});

describe('/e/:codigo — SIN sesión', () => {
  it('NO llama a la API de datos (ni una sola consulta)', async () => {
    await montar();
    expect(llamadas).toEqual([]);
  });

  it('muestra el aviso público y el contacto de TI, sin ningún dato del equipo', async () => {
    const { w } = await montar();
    const t = w.text().replace(/\s+/g, ' ');
    expect(w.find('h1').text()).toBe('Equipo de Materen');
    expect(t).toContain('Si lo encontró, comuníquese con el área de TI.');
    expect(t).toContain('Contacto de TI');
    expect(w.find('a[href="tel:+51987654321"]').text()).toBe('Mesa de ayuda: 987 654 321');
    // Nada del inventario: ni marca, ni serie, ni portador, ni enlace a la hoja.
    expect(w.find('a[href^="/equipos"]').exists()).toBe(false);
  });

  it('el contacto del dueño está vacío por defecto (se completa en core/marca.js, no se inventa)', () => {
    expect(MarcaReal.CONTACTO_TI).toEqual({ texto: '', enlace: '' });
  });
});

describe('/e/:codigo — CON sesión de staff', () => {
  it('con el módulo equipos resuelve el código y redirige con replace a la hoja de vida', async () => {
    respuesta = () => Promise.resolve({ id: 'q1', codigo: 'LAP-0142' });
    const { router } = await montar({ sesion: STAFF });
    expect(llamadas).toEqual([['buscarEquipoPorCodigo', 'LAP-0142']]);
    expect(router.currentRoute.value.path).toBe('/equipos/q1');
    // replace: "atrás" no vuelve a esta pantalla de paso.
    await router.back();
    expect(router.currentRoute.value.path).not.toBe('/e/LAP-0142');
  });

  it('sin el módulo equipos avisa y no consulta', async () => {
    const { w } = await montar({ sesion: { user: { id: 'u2' }, rol: 'ASISTENTE', modulosVisibles: ['tickets'] } });
    expect(llamadas).toEqual([]);
    expect(w.find('h1').text()).toBe('Sin acceso al módulo Equipos');
  });

  it('un código inexistente dice que no se encontró', async () => {
    const { w } = await montar({ sesion: STAFF });
    expect(w.find('h1').text()).toBe('Equipo no encontrado');
    expect(w.text()).toContain('No hay un equipo con el código');
    expect(w.text()).toContain('LAP-0142');
  });

  it('un fallo de la consulta ofrece reintentar', async () => {
    respuesta = () => Promise.reject(Object.assign(new Error('Failed to fetch'), { error: 'NETWORK_ERROR' }));
    const { w, router } = await montar({ sesion: STAFF });
    expect(w.find('h1').text()).toBe('No se pudo abrir el equipo');
    expect(w.text()).toContain('Sin conexión con el servidor.');
    respuesta = () => Promise.resolve({ id: 'q1', codigo: 'LAP-0142' });
    await w.findAll('button').find((b) => b.text() === 'Reintentar').trigger('click');
    await flush();
    await flush();
    expect(router.currentRoute.value.path).toBe('/equipos/q1');
  });
});
