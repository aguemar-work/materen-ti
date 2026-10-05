// @vitest-environment happy-dom
//
// MenuAcciones.vue reescrito sobre AppMenu (primevue/menu) — 2026-09-07.
// Este test cubre el contrato público que 5 vistas reales (Licencias,
// Equipos, Empleados...) dependen de que siga funcionando igual: props
// `acciones`/`label`/`icono`/`texto`, slot #trigger, y que cada acción
// (onClick, disabled, danger, separador) siga produciendo el mismo
// comportamiento aunque el DOM interno cambió por completo (de un
// <Teleport> a mano a primevue/menu).
//
// El panel se teletransporta a <body> (appendTo por defecto de AppMenu):
// se busca con querySelector sobre el documento real, no con
// wrapper.find(), que solo ve el árbol montado.
//
// `abierto` (y por lo tanto aria-expanded) NO depende de @show/@hide —el
// eco que Menu emite recién cuando termina su transición de entrada/salida,
// algo que happy-dom no completa (no hay requestAnimationFrame real
// empujando la animación)—: alternar() y la ejecución de un ítem lo
// actualizan en el momento (ver MenuAcciones.vue). Por eso estos tests no
// esperan ninguna transición.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import MenuAcciones from '../../src/components/shared/MenuAcciones.vue';

function montar(acciones, props = {}) {
  return mount(MenuAcciones, {
    props: { acciones, label: 'Acciones de prueba', ...props },
    global: { plugins: [[PrimeVue, { unstyled: true }]] },
  });
}

async function abrir(wrapper) {
  await wrapper.find('button').trigger('click');
}

// El click real de un usuario cae sobre el contenido del ítem
// (`data-pc-section="itemcontent"`, hijo del <li role="menuitem">) — ese es
// el elemento con el listener real (ver Menuitem.vue). Sintetizar el click
// sobre el <li> no burbujea HACIA ABAJO a sus hijos, así que no dispara nada.
function itemContent(index = 0) {
  return document.querySelectorAll('[data-pc-section="itemcontent"]')[index];
}

// El panel se teletransporta a <body> vía appendTo — nada lo limpia solo
// entre tests (a diferencia del árbol montado por @vue/test-utils).
afterEach(() => {
  document.body.innerHTML = '';
});

describe('MenuAcciones.vue — reescrito sobre AppMenu/primevue-menu', () => {
  // Con `texto` el trigger dejó de usar la clase provisional `.btn` (sistema
  // nuevo, 2026-09-23): se verifica que es un botón de texto — no el
  // solo-ícono — y que muestra el texto.
  it('el trigger es icon-btn sin `texto` y botón de texto con `texto`, con aria-haspopup', () => {
    const sinTexto = montar([{ label: 'Editar', onClick: vi.fn() }]);
    expect(sinTexto.find('button').classes()).toContain('icon-btn');
    expect(sinTexto.find('button').attributes('aria-haspopup')).toBe('menu');

    const conTexto = montar([{ label: 'Editar', onClick: vi.fn() }], { texto: 'Acciones' });
    expect(conTexto.find('button').classes()).not.toContain('icon-btn');
    expect(conTexto.find('button').text()).toContain('Acciones');
  });

  it('abre el panel al clickear y expone role="menuitem" por acción visible', async () => {
    const w = montar([
      { label: 'Editar', icono: 'ti-pencil', onClick: vi.fn() },
      { separador: true },
      { label: 'Eliminar', danger: true, onClick: vi.fn() },
    ]);
    await abrir(w);
    const items = document.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Editar');
    expect(items[1].textContent).toContain('Eliminar');
    expect(w.find('button').attributes('aria-expanded')).toBe('true');
  });

  it('clickear un ítem llama a su onClick y cierra el panel', async () => {
    const onClick = vi.fn();
    const w = montar([{ label: 'Editar', onClick }]);
    await abrir(w);
    itemContent().click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onClick).toHaveBeenCalledOnce();
    expect(w.find('button').attributes('aria-expanded')).toBe('false');
  });

  it('un ítem disabled no ejecuta su onClick', async () => {
    const onClick = vi.fn();
    const w = montar([{ label: 'Renovar', disabled: true, onClick }]);
    await abrir(w);
    const item = document.querySelector('[role="menuitem"]');
    expect(item.getAttribute('aria-disabled')).toBe('true');
    itemContent().click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('visible:false omite el ítem del todo (no aparece ni deshabilitado)', async () => {
    const w = montar([
      { label: 'Siempre', onClick: vi.fn() },
      { label: 'Condicional', visible: false, onClick: vi.fn() },
    ]);
    await abrir(w);
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent.trim());
    expect(labels).toEqual(['Siempre']);
  });

  it('un ítem danger recibe una clase de color distinta a uno normal (preset por contexto)', async () => {
    const w = montar([
      { label: 'Editar', onClick: vi.fn() },
      { label: 'Eliminar', danger: true, onClick: vi.fn() },
    ]);
    await abrir(w);
    const enlaces = document.querySelectorAll('a[data-pc-section="itemlink"]');
    const normal = enlaces[0].className;
    const danger = enlaces[1].className;
    expect(danger).toContain('text-red-600');
    expect(normal).not.toContain('text-red-600');
  });

  it('slot #trigger reemplaza el botón por defecto y evita las clases .btn/.icon-btn', () => {
    const w = mount(MenuAcciones, {
      props: { acciones: [{ label: 'Editar', onClick: vi.fn() }], label: 'Acciones' },
      slots: { trigger: '<span class="avatar-trigger">AG</span>' },
      global: { plugins: [[PrimeVue, { unstyled: true }]] },
    });
    const btn = w.find('button');
    expect(btn.classes()).not.toContain('icon-btn');
    expect(btn.classes()).not.toContain('btn');
    expect(w.find('.avatar-trigger').exists()).toBe(true);
  });
});
