// @vitest-environment happy-dom
//
// Contrato de accesibilidad de Modal.vue, verificado montándolo de verdad.
//
// Por qué este archivo existe: `scripts/patrones-ui.mjs` verifica que nadie
// haga un modal a mano, pero no puede verificar que EL modal compartido siga
// cumpliendo su parte. Si alguien rompe el role/aria/Escape dentro de
// Modal.vue, los 26 consumidores se rompen a la vez y en silencio — ningún
// test de lógica pura lo ve, y el build pasa igual.
//
// El entorno se fija por archivo (docblock de arriba), no en
// vitest.config.js: los otros tests corren en `node` a propósito y no deben
// pagar el costo de un DOM que no usan.

import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Modal from '../../src/components/shared/Modal.vue';

function montar(props = {}, slots = {}) {
  return mount(Modal, { props, slots, attachTo: document.body });
}

// onMounted del Modal hace `await nextTick()` ANTES de registrar el listener
// de teclado (necesita el panel ya renderizado para calcular el foco inicial).
// Sin esperar acá, un Escape disparado de inmediato no encuentra listener y el
// test pasaría o fallaría por el motivo equivocado.
async function listo(w) {
  await w.vm.$nextTick();
  await w.vm.$nextTick();
  return w;
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('Modal.vue — contrato de accesibilidad', () => {
  it('el panel declara role=dialog y aria-modal', () => {
    montar({ titulo: 'Editar equipo' });
    const panel = document.querySelector('.modal');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('aria-labelledby apunta al id real del título, no a un id inventado', () => {
    montar({ titulo: 'Editar equipo' });
    const panel = document.querySelector('.modal');
    const id = panel.getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    const titulo = document.getElementById(id);
    // Si el id no resuelve, el lector de pantalla anuncia el diálogo sin
    // nombre: es el fallo silencioso que este test existe para atrapar.
    expect(titulo).not.toBeNull();
    expect(titulo.textContent).toContain('Editar equipo');
  });

  it('el botón de cerrar tiene nombre accesible', () => {
    montar({ titulo: 'X' });
    const cerrar = document.querySelector('.modal-title button');
    expect(cerrar.getAttribute('aria-label')).toBe('Cerrar');
  });

  it('mostrarCerrar=false quita el botón (no lo esconde con CSS)', () => {
    montar({ titulo: 'X', mostrarCerrar: false });
    expect(document.querySelector('.modal-title button')).toBeNull();
  });

  it('sin título no se renderiza la cabecera', () => {
    montar({});
    expect(document.querySelector('.modal-title')).toBeNull();
  });

  it('el slot de acciones solo aparece si se pasa', () => {
    montar({ titulo: 'X' });
    expect(document.querySelector('.modal-actions')).toBeNull();
    document.body.innerHTML = '';
    montar({ titulo: 'X' }, { acciones: '<button>Guardar</button>' });
    expect(document.querySelector('.modal-actions')).not.toBeNull();
  });

  it('bloquea el scroll del fondo mientras está abierto y lo restaura al desmontar', () => {
    const w = montar({ titulo: 'X' });
    expect(document.body.style.overflow).toBe('hidden');
    w.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('se teletransporta a <body>, no queda anidado donde se declaró', () => {
    // Sin attachTo: test-utils monta en un contenedor suelto, fuera del
    // documento. Si el Teleport funciona, el modal aparece igual en <body>;
    // si alguien lo quitara, quedaría atrapado en ese contenedor — y en la
    // app real quedaría dentro del stacking context de quien lo declaró,
    // que es el bug que el Teleport existe para evitar.
    const w = mount(Modal, { props: { titulo: 'X' } });
    expect(w.element.querySelector?.('.modal-bg') ?? null).toBeNull();
    expect(document.body.querySelector('.modal-bg')).not.toBeNull();
    w.unmount();
  });
});

describe('Modal.vue — modo lateral (drawer)', () => {
  it('por defecto no es lateral: sin clases de drawer', () => {
    montar({ titulo: 'X' });
    expect(document.querySelector('.modal-bg--lateral')).toBeNull();
    expect(document.querySelector('.modal--lateral')).toBeNull();
  });

  it('lateral=true agrega las clases de drawer sin perder el contrato de accesibilidad', () => {
    montar({ titulo: 'X', lateral: true });
    expect(document.querySelector('.modal-bg--lateral')).not.toBeNull();
    const panel = document.querySelector('.modal--lateral');
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  it('lateral=true sigue respetando `size` para el ancho', () => {
    montar({ titulo: 'X', lateral: true, size: 'detail' });
    const panel = document.querySelector('.modal--lateral');
    expect(panel.classList.contains('modal-detail')).toBe(true);
  });

  it('Escape también cierra en modo lateral (mismo guard de teclado)', async () => {
    const w = await listo(montar({ titulo: 'X', lateral: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await w.vm.$nextTick();
    expect(w.vm.visible).toBe(false);
  });
});

describe('Modal.vue — cierre', () => {
  it('Escape inicia el cierre', async () => {
    const w = await listo(montar({ titulo: 'X' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await w.vm.$nextTick();
    expect(w.vm.visible).toBe(false);
  });

  it('confirmarCierre que devuelve false BLOQUEA el cierre por Escape', async () => {
    const w = await listo(montar({ titulo: 'X', confirmarCierre: () => false }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await w.vm.$nextTick();
    // Es el guard de "cambios sin guardar": si se rompe, el usuario pierde
    // datos con una tecla.
    expect(w.vm.visible).toBe(true);
  });

  it('cerrarEnBackdrop=false ignora el clic en el fondo', async () => {
    const w = montar({ titulo: 'X', cerrarEnBackdrop: false });
    document.querySelector('.modal-bg').click();
    await w.vm.$nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('por defecto el clic en el fondo cierra', async () => {
    const w = montar({ titulo: 'X' });
    document.querySelector('.modal-bg').click();
    await w.vm.$nextTick();
    expect(w.vm.visible).toBe(false);
  });

  it('un clic DENTRO del panel no cierra (@click.self en el fondo)', async () => {
    const w = montar({ titulo: 'X' }, { default: '<p>contenido</p>' });
    document.querySelector('.modal-body').click();
    await w.vm.$nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('deja de escuchar el teclado tras desmontarse', async () => {
    const w = montar({ titulo: 'X' });
    w.unmount();
    // Si el listener quedara vivo, un Escape posterior seguiría operando
    // sobre un componente muerto.
    expect(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    ).not.toThrow();
  });
});
