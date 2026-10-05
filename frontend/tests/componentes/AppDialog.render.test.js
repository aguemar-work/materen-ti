// @vitest-environment happy-dom
//
// Contrato de AppDialog.vue, verificado montándolo de verdad (primevue/dialog
// real, no un stub). Es la portación de Modal.render.test.js (foco, Escape,
// aria-modal, confirmarCierre, lateral, scroll) más lo que AppDialog añade:
// el evento `cerrado`, el veto por la X/fondo y el z-index propio.
//
// Por qué existe: scripts/patrones-ui.mjs verifica que nadie haga un diálogo a
// mano, pero no que EL diálogo compartido siga cumpliendo su parte. Si alguien
// rompe el role/aria/Escape aquí, todos los formularios migrados se rompen a
// la vez y en silencio.
//
// Dialog se teletransporta a <body> recién después de su PROPIO mounted(): tras
// montar hace falta esperar un par de ticks (ver `listo`).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import AppDialog from '../../src/components/ui/AppDialog.vue';

const montados = [];

async function montar(props = {}, slots = {}) {
  const w = mount(AppDialog, {
    props,
    slots,
    attachTo: document.body,
    global: { plugins: [[PrimeVue, { unstyled: true }]], stubs: { transition: false } },
  });
  montados.push(w);
  await nextTick();
  await nextTick();
  return w;
}

function panel() {
  return document.querySelector('[role="dialog"]');
}
function mascara() {
  return document.querySelector('[data-pc-section="mask"]');
}
function cuerpo() {
  return document.querySelector('[data-pc-section="content"]');
}
function pie() {
  return document.querySelector('[data-pc-section="footer"]');
}
function cabecera() {
  return document.querySelector('[data-pc-section="header"]');
}
function botonCerrar() {
  return document.querySelector('button[aria-label="Cerrar"]');
}
function escape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}
// Dialog cierra por clic en la máscara con mousedown + mouseup sobre ella.
function clicEnMascara() {
  const m = mascara();
  m.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  m.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  while (montados.length) {
    try {
      montados.pop().unmount();
    } catch {
      /* ya desmontado por el propio test */
    }
  }
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('AppDialog.vue — contrato de accesibilidad', () => {
  it('el panel declara role=dialog y aria-modal', async () => {
    await montar({ titulo: 'Editar equipo' });
    expect(panel()).not.toBeNull();
    expect(panel().getAttribute('aria-modal')).toBe('true');
  });

  it('aria-labelledby apunta al id real del título, no a un id inventado', async () => {
    await montar({ titulo: 'Editar equipo' });
    const id = panel().getAttribute('aria-labelledby');
    expect(id).toBeTruthy();
    const titulo = document.getElementById(id);
    // Si el id no resuelve, el lector de pantalla anuncia el diálogo sin nombre.
    expect(titulo).not.toBeNull();
    expect(titulo.textContent).toContain('Editar equipo');
  });

  it('el slot #titulo (título compuesto) también es el nombre accesible', async () => {
    await montar({}, { titulo: '<b>Reporte</b> de tickets' });
    const titulo = document.getElementById(panel().getAttribute('aria-labelledby'));
    expect(titulo.textContent).toContain('Reporte de tickets');
  });

  it('el botón de cerrar tiene nombre accesible', async () => {
    await montar({ titulo: 'X' });
    expect(botonCerrar()).not.toBeNull();
    expect(botonCerrar().getAttribute('type')).toBe('button');
  });

  it('mostrarCerrar=false quita el botón (no lo esconde con CSS)', async () => {
    await montar({ titulo: 'X', mostrarCerrar: false });
    expect(botonCerrar()).toBeNull();
  });

  it('sin título no hay cabecera ni aria-labelledby colgante; ariaLabel da el nombre', async () => {
    await montar({ ariaLabel: 'Vista previa' });
    expect(cabecera()).toBeNull();
    expect(panel().hasAttribute('aria-labelledby')).toBe(false);
    expect(panel().getAttribute('aria-label')).toBe('Vista previa');
  });

  it('el pie solo aparece si se pasa algún slot de acciones', async () => {
    await montar({ titulo: 'X' });
    expect(pie()).toBeNull();
    document.body.innerHTML = '';
    await montar({ titulo: 'X' }, { acciones: '<button>Guardar</button>' });
    expect(pie()).not.toBeNull();
    expect(pie().textContent).toContain('Guardar');
  });

  it('los alias de slot `pie` y `footer` se renderizan en el mismo pie', async () => {
    await montar({ titulo: 'X' }, { pie: '<button>Del pie</button>' });
    expect(pie().textContent).toContain('Del pie');
    document.body.innerHTML = '';
    await montar({ titulo: 'X' }, { footer: '<button>Del footer</button>' });
    expect(pie().textContent).toContain('Del footer');
  });

  it('bloquea el scroll del fondo mientras está abierto y lo restaura al desmontar', async () => {
    const w = await montar({ titulo: 'X' });
    expect(document.body.style.overflow).toBe('hidden');
    w.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('con dos diálogos, cerrar el de arriba NO devuelve el scroll al fondo', async () => {
    const a = await montar({ titulo: 'A' });
    const b = await montar({ titulo: 'B' });
    b.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    a.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('se teletransporta a <body>, no queda anidado donde se declaró', async () => {
    const w = await montar({ titulo: 'X' });
    expect(w.element.querySelector?.('[role="dialog"]') ?? null).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

describe('AppDialog.vue — foco', () => {
  it('el foco inicial cae en el primer campo del cuerpo, no en la X', async () => {
    await montar({ titulo: 'X' }, { default: '<input id="primero" /><input id="segundo" />' });
    await espera(20);
    expect(document.activeElement?.id).toBe('primero');
  });

  it('un `autofocus` puesto por el formulario manda sobre el primer campo', async () => {
    await montar({ titulo: 'X' }, { default: '<input id="primero" /><input id="elegido" autofocus />' });
    await espera(20);
    expect(document.activeElement?.id).toBe('elegido');
  });

  it('sin controles en el cuerpo, el foco cae en el primer control del pie', async () => {
    await montar({ titulo: 'X' }, { default: '<p>solo texto</p>', acciones: '<button id="cancelar">Cancelar</button>' });
    await espera(20);
    expect(document.activeElement?.id).toBe('cancelar');
  });

  it('sin nada enfocable, el foco queda en el panel (tabindex -1) y no se escapa al fondo', async () => {
    await montar({ ariaLabel: 'Aviso' }, { default: '<p>solo texto</p>' });
    await espera(20);
    expect(document.activeElement).toBe(panel());
  });

  it('devuelve el foco a quien abrió el diálogo cuando se cierra', async () => {
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    const w = await montar({ titulo: 'X' }, { default: '<input id="campo" />' });
    await espera(20);
    expect(document.activeElement?.id).toBe('campo');
    w.vm.cerrar();
    await espera(450);
    expect(document.activeElement?.id).toBe('opener');
  });

  it('si el padre desmonta de inmediato, el foco igualmente vuelve a quien abrió', async () => {
    const opener = document.createElement('button');
    opener.id = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    const w = await montar({ titulo: 'X' }, { default: '<input id="campo" />' });
    await espera(20);
    w.unmount();
    expect(document.activeElement?.id).toBe('opener');
  });
});

describe('AppDialog.vue — cierre', () => {
  it('Escape inicia el cierre', async () => {
    const w = await montar({ titulo: 'X' });
    escape();
    await nextTick();
    expect(w.vm.visible).toBe(false);
  });

  it('confirmarCierre que devuelve false BLOQUEA el cierre por Escape', async () => {
    const confirmarCierre = vi.fn(() => false);
    const w = await montar({ titulo: 'X', confirmarCierre });
    escape();
    await nextTick();
    // Es el guard de "cambios sin guardar": si se rompe, se pierden datos con una tecla.
    expect(confirmarCierre).toHaveBeenCalledTimes(1);
    expect(w.vm.visible).toBe(true);
    expect(panel()).not.toBeNull();
  });

  it('confirmarCierre que devuelve false BLOQUEA el cierre por la X', async () => {
    const w = await montar({ titulo: 'X', confirmarCierre: () => false });
    botonCerrar().click();
    await nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('confirmarCierre que devuelve false BLOQUEA el cierre por el fondo', async () => {
    const w = await montar({ titulo: 'X', confirmarCierre: () => false });
    clicEnMascara();
    await nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('confirmarCierre que devuelve true deja cerrar', async () => {
    const w = await montar({ titulo: 'X', confirmarCierre: () => true });
    botonCerrar().click();
    await nextTick();
    expect(w.vm.visible).toBe(false);
  });

  it('cerrar() es incondicional: no consulta confirmarCierre (camino del éxito)', async () => {
    const confirmarCierre = vi.fn(() => false);
    const w = await montar({ titulo: 'X', confirmarCierre });
    w.vm.cerrar();
    await nextTick();
    expect(confirmarCierre).not.toHaveBeenCalled();
    expect(w.vm.visible).toBe(false);
  });

  it('cerrarEnBackdrop=false ignora el clic en el fondo', async () => {
    const w = await montar({ titulo: 'X', cerrarEnBackdrop: false });
    clicEnMascara();
    await nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('por defecto el clic en el fondo cierra', async () => {
    const w = await montar({ titulo: 'X' });
    clicEnMascara();
    await nextTick();
    expect(w.vm.visible).toBe(false);
  });

  it('un clic DENTRO del panel no cierra', async () => {
    const w = await montar({ titulo: 'X' }, { default: '<p id="dentro">contenido</p>' });
    const dentro = document.getElementById('dentro');
    dentro.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    dentro.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    dentro.click();
    await nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('Escape que un componente interno ya consumió (stopPropagation) no cierra', async () => {
    const w = await montar({ titulo: 'X' }, { default: '<input id="campo" />' });
    const campo = document.getElementById('campo');
    campo.addEventListener('keydown', (e) => e.stopPropagation());
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await nextTick();
    expect(w.vm.visible).toBe(true);
  });

  it('con otro diálogo encima, Escape lo atiende solo el de arriba', async () => {
    const guardaAbajo = vi.fn(() => true);
    const abajo = await montar({ titulo: 'Abajo', confirmarCierre: guardaAbajo });
    const arriba = await montar({ titulo: 'Arriba' });
    escape();
    await nextTick();
    expect(arriba.vm.visible).toBe(false);
    expect(abajo.vm.visible).toBe(true);
    expect(guardaAbajo).not.toHaveBeenCalled();
  });

  it('deja de escuchar el teclado tras desmontarse', async () => {
    const w = await montar({ titulo: 'X' });
    w.unmount();
    expect(() => escape()).not.toThrow();
  });
});

describe('AppDialog.vue — eventos close / cerrado', () => {
  it('cerrar() emite `close` y `cerrado` UNA sola vez, al terminar la salida', async () => {
    const w = await montar({ titulo: 'X' });
    w.vm.cerrar();
    w.vm.cerrar(); // idempotente
    await espera(450);
    expect(w.emitted('close')).toHaveLength(1);
    expect(w.emitted('cerrado')).toHaveLength(1);
  });

  it('cancelar por Escape también emite `cerrado` (no solo el éxito)', async () => {
    const w = await montar({ titulo: 'X' });
    escape();
    await espera(450);
    expect(w.emitted('cerrado')).toHaveLength(1);
  });

  it('un cierre vetado no emite nada', async () => {
    const w = await montar({ titulo: 'X', confirmarCierre: () => false });
    escape();
    botonCerrar().click();
    await espera(450);
    expect(w.emitted('close')).toBeUndefined();
    expect(w.emitted('cerrado')).toBeUndefined();
  });

  it('si el padre desmonta antes de que acabe la salida, no emite fuera de tiempo', async () => {
    const w = await montar({ titulo: 'X' });
    w.vm.cerrar();
    w.unmount();
    await espera(450);
    expect(w.emitted('close')).toBeUndefined();
  });
});

describe('AppDialog.vue — modo lateral (drawer)', () => {
  it('por defecto está centrado: máscara con relleno y panel redondeado', async () => {
    await montar({ titulo: 'X' });
    expect(mascara().className).toContain('p-4');
    expect(panel().className).toContain('rounded-xl');
    expect(panel().className).not.toContain('h-full');
  });

  it('lateral=true acopla el panel a la derecha, alto completo, sin perder la accesibilidad', async () => {
    await montar({ titulo: 'X', lateral: true });
    expect(mascara().style.justifyContent).toBe('flex-end');
    expect(mascara().className).toContain('p-0');
    expect(panel().className).toContain('h-full');
    expect(panel().className).toContain('rounded-none');
    expect(panel().getAttribute('role')).toBe('dialog');
    expect(panel().getAttribute('aria-modal')).toBe('true');
  });

  it('lateral=true ocupa todo el ancho en móvil (≤480px)', async () => {
    await montar({ titulo: 'X', lateral: true, size: 'detail' });
    expect(panel().className).toContain('max-[480px]:max-w-full');
  });

  it('lateral=true sigue respetando `size` para el ancho', async () => {
    await montar({ titulo: 'X', lateral: true, size: 'detail' });
    expect(panel().className).toContain('max-w-[620px]');
  });

  it('Escape también cierra en modo lateral', async () => {
    const w = await montar({ titulo: 'X', lateral: true });
    escape();
    await nextTick();
    expect(w.vm.visible).toBe(false);
  });
});

describe('AppDialog.vue — tamaño, scroll y apilamiento', () => {
  it.each([
    ['', 'max-w-[540px]'],
    ['sm', 'max-w-[440px]'],
    ['md', 'max-w-[540px]'],
    ['detail', 'max-w-[620px]'],
    ['lg', 'max-w-[680px]'],
  ])('size="%s" -> %s', async (size, clase) => {
    await montar({ titulo: 'X', size });
    expect(panel().className).toContain(clase);
    expect(panel().className).toContain('w-full');
  });

  it('solo el cuerpo desplaza (el título y el pie quedan fijos): móvil incluido', async () => {
    await montar({ titulo: 'X' }, { acciones: '<button>Guardar</button>' });
    expect(cuerpo().className).toContain('overflow-y-auto');
    expect(cuerpo().className).toContain('min-h-0');
    expect(panel().className).toContain('overflow-hidden');
    expect(panel().className).toContain('max-h-[90dvh]');
    expect(cabecera().className).toContain('shrink-0');
    expect(pie().className).toContain('shrink-0');
    // El pie envuelve en pantallas angostas en vez de desbordar.
    expect(pie().className).toContain('flex-wrap');
  });

  it('la máscara fija su propio z-50 y no el z-index automático de PrimeVue (1100)', async () => {
    await montar({ titulo: 'X' });
    expect(mascara().className).toContain('z-50');
    // Las listas flotantes de BuscadorCombo viven en z-60: tienen que quedar encima.
    expect(mascara().style.zIndex).toBe('');
  });

  it('transicion="modal-anim-rapida" acorta la animación del panel', async () => {
    const w = await montar({ titulo: 'X', transicion: 'modal-anim-rapida' });
    expect(w.exists()).toBe(true);
    // El preset es la única fuente de las duraciones.
    const { buildFormDialogPT } = await import('../../src/components/ui/pt/dialog.pt.js');
    expect(buildFormDialogPT({ rapida: true }).transition.enterActiveClass).toContain('duration-100');
    expect(buildFormDialogPT({}).transition.enterActiveClass).toContain('duration-200');
    // Sin movimiento si el sistema lo pide.
    expect(buildFormDialogPT({}).transition.enterActiveClass).toContain('motion-reduce:transition-none');
  });
});
