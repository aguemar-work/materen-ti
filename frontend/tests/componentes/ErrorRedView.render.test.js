// @vitest-environment happy-dom
//
// Primera VISTA del sistema bajo test de render (las demás dependen de stores
// y del router; ésta no, por diseño: App.vue la superpone sin ruta propia).
//
// Es la pantalla que ve un usuario cuando el backend no responde — o sea,
// justo cuando nada más funciona. Si se rompe, no hay forma de enterarse por
// otra vía: no tiene ruta, no aparece en navegación y solo se muestra en un
// fallo de red real.

import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ErrorRedView from '../../src/modules/errores/ErrorRedView.vue';
import { errorRedActivo, esErrorRed, MENSAJE_ERROR_RED } from '../../src/core/error-red.js';
import { NOMBRE_PRODUCTO } from '../../src/core/marca.js';

describe('ErrorRedView.vue — pantalla de sin conexión', () => {
  it('explica qué pasó y qué hacer, no solo que hubo un error', () => {
    const w = mount(ErrorRedView);
    expect(w.text()).toContain('Sin conexión con el servidor');
    expect(w.text()).toContain('Verifique su conexión');
  });

  it('ofrece una salida: el botón de reintentar', () => {
    const w = mount(ErrorRedView);
    // Por rol/texto, no por clase CSS: el botón es CarbonButton desde la
    // migración a componentes Carbon (Modern Clean Enterprise), y su clase
    // interna (`cds-btn--primary`) es un detalle de implementación.
    const btn = w.findAll('button').find((b) => b.text().includes('Reintentar'));
    expect(btn).toBeTruthy();
  });

  it('los íconos son decorativos y no los anuncia un lector de pantalla', () => {
    const w = mount(ErrorRedView);
    const iconos = w.findAll('i');
    expect(iconos.length).toBeGreaterThan(0);
    for (const i of iconos) expect(i.attributes('aria-hidden')).toBe('true');
  });

  it('el logo lleva como nombre accesible la marca de core/marca.js', () => {
    // El nombre no está en el texto visible sino en el alt del logo: es lo
    // único que anuncia un lector de pantalla acá, así que si el alt se
    // vaciara la pantalla quedaría sin identificar.
    const w = mount(ErrorRedView);
    const logo = w.find('img');
    expect(logo.exists()).toBe(true);
    expect(logo.attributes('alt')).toBe(NOMBRE_PRODUCTO);
  });
});

describe('esErrorRed — discriminante de error de transporte', () => {
  beforeEach(() => {
    errorRedActivo.value = false;
  });

  it('reconoce los códigos del SDK', () => {
    expect(esErrorRed({ error: 'NETWORK_ERROR' })).toBe(true);
    expect(esErrorRed({ error: 'REQUEST_TIMEOUT' })).toBe(true);
    expect(esErrorRed({ statusCode: 0 })).toBe(true);
  });

  it('reconoce el TypeError crudo de fetch si escapa sin envolver', () => {
    expect(esErrorRed({ message: 'Failed to fetch' })).toBe(true);
    expect(esErrorRed({ message: 'NetworkError when attempting to fetch' })).toBe(true);
  });

  it('NO confunde un error de negocio con uno de red', () => {
    // Si esto se rompiera, un 403 de RLS mostraría "sin conexión" y el
    // usuario buscaría el problema en su wifi en vez de en sus permisos.
    expect(esErrorRed({ statusCode: 403, error: 'FORBIDDEN' })).toBe(false);
    expect(esErrorRed({ statusCode: 500, message: 'Internal error' })).toBe(false);
    expect(esErrorRed({ ok: false, code: 'no_existe' })).toBe(false);
    expect(esErrorRed(null)).toBe(false);
    expect(esErrorRed(undefined)).toBe(false);
  });

  it('el mensaje exportado y el de la pantalla dicen lo mismo', () => {
    // Dos textos para el mismo estado que se separan es la deriva de siempre,
    // en su versión de copy.
    const w = mount(ErrorRedView);
    const primeraFrase = MENSAJE_ERROR_RED.split('.')[0];
    expect(w.text().replace(/\s+/g, ' ')).toContain(primeraFrase);
  });
});
