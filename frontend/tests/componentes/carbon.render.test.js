// @vitest-environment happy-dom
//
// Primitivas de Carbon v11 (components/carbon/) y el SideNav del shell,
// montados de verdad.
//
// Por qué estos cuatro y no otros: el rediseño del 2026-09-02 movió a estos
// componentes cosas que antes estaban copiadas a mano en cada vista, y en dos
// casos la lógica que absorbieron NO es cosmética:
//
//   · CarbonPasswordReveal decide con qué `motivo` se llama a la edge
//     function, y ese motivo es lo que queda escrito en accesos_log. Si
//     "copiar" reusara el valor ya revelado en vez de pedir uno nuevo, la
//     auditoría dejaría de distinguir quién solo miró una credencial de quién
//     se la llevó al portapapeles — que es el punto del módulo entero.
//   · AppNav traduce permisos (rol + staff_modulos_permisos) a ítems
//     visibles. No es la barrera —esa es el guard de router/guards.js, que se
//     verifica en tests/integration/autorizacion-roles.smoke.test.js— pero un
//     ítem visible que el guard bloquea es un enlace que rebota al dashboard
//     con un aviso y escribe una fila de acceso denegado en cada clic.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import CarbonTag from '../../src/components/carbon/CarbonTag.vue';
import CarbonButton from '../../src/components/carbon/CarbonButton.vue';
import CarbonCampo from '../../src/components/carbon/CarbonCampo.vue';
import CarbonNotification from '../../src/components/carbon/CarbonNotification.vue';
import CarbonContentSwitcher from '../../src/components/carbon/CarbonContentSwitcher.vue';
import CarbonTabs from '../../src/components/carbon/CarbonTabs.vue';
import CarbonPagination from '../../src/components/carbon/CarbonPagination.vue';
import CarbonDataTable from '../../src/components/carbon/CarbonDataTable.vue';
import CarbonPasswordReveal from '../../src/components/carbon/CarbonPasswordReveal.vue';
import AppNav from '../../src/components/shared/AppNav.vue';
import { useAuthStore } from '../../src/stores/auth.js';
import { badgeInfo } from '../../src/core/badges.js';
import { MODULOS_CONFIGURABLES } from '../../src/constants/modulos.js';
import { TAMANOS_PAGINA, TAM_PAGINA_DEFECTO } from '../../src/constants/paginacion.js';
import { crearStorePaginado } from '../../src/stores/crearStorePaginado.js';

// showToast escribe en el DOM real vía core/toast.js (initToast() nunca corre
// en los tests, así que no hay contenedor donde montar el aviso).
vi.mock('../../src/core/toast.js', () => ({ showToast: vi.fn() }));

describe('CarbonTag.vue', () => {
  it('es rectangular: aplica la clase base, nunca una de píldora', () => {
    const w = mount(CarbonTag, { props: { variante: 'success' }, slots: { default: 'Operativo' } });
    expect(w.classes()).toContain('cds-tag');
    expect(w.classes()).toContain('cds-tag--success');
    expect(w.text()).toBe('Operativo');
  });

  it('acepta el nombre de clase completo que devuelven los core/dominio-*', () => {
    // badgeInfo() devuelve `clase: 'badge--sky'`, no `'sky'`. Poder pasarlo
    // tal cual es lo que evita que cada sitio lo recorte por su cuenta (y
    // que uno se lo olvide y quede un tag sin color).
    const info = badgeInfo('tipo_cuenta', 'compartida');
    expect(info.clase).toBe('badge--sky');
    const w = mount(CarbonTag, { props: { variante: info.clase } });
    expect(w.classes()).toContain('cds-tag--sky');
    expect(w.classes()).not.toContain('cds-tag--badge--sky');
  });

  it('las 9 variantes del sistema son válidas, y solo esas', () => {
    const validador = CarbonTag.props.variante.validator;
    const roles = ['success', 'warning', 'danger', 'info', 'neutral', 'purple', 'sky', 'teal', 'accent'];
    for (const rol of roles) {
      expect(validador(rol), rol).toBe(true);
      expect(validador(`badge--${rol}`), `badge--${rol}`).toBe(true);
    }
    // Los nombres de COLOR de Carbon no son la API: la API son los roles
    // semánticos (ver la cabecera del componente).
    for (const color of ['green', 'red', 'yellow', 'blue', 'gray']) {
      expect(validador(color), color).toBe(false);
    }
  });

  it('`codigo` cambia a monoespaciada; sin el prop no', () => {
    const mono = mount(CarbonTag, { props: { codigo: true }, slots: { default: 'TI-000123' } });
    expect(mono.classes()).toContain('cds-tag--codigo');
    const normal = mount(CarbonTag, { slots: { default: 'Cerrado' } });
    expect(normal.classes()).not.toContain('cds-tag--codigo');
  });

  it('`punto` agrega el indicador y lo marca decorativo', () => {
    const w = mount(CarbonTag, { props: { variante: 'warning', punto: true }, slots: { default: 'Rotar' } });
    const punto = w.find('.cds-tag__punto');
    expect(punto.exists()).toBe(true);
    // El punto no aporta información que el texto no diga: si un lector de
    // pantalla lo anunciara, leería el estado dos veces.
    expect(punto.attributes('aria-hidden')).toBe('true');
    expect(w.find('.cds-tag__punto').exists()).toBe(true);
  });
});

describe('CarbonButton.vue', () => {
  it('las 5 variantes y los 3 tamanos de Carbon, y solo esos', () => {
    const variante = CarbonButton.props.variante.validator;
    for (const v of ['primary', 'secondary', 'tertiary', 'ghost', 'danger']) {
      expect(variante(v), v).toBe(true);
    }
    // `danger-tertiary` y `danger-ghost` existen en Carbon pero no se
    // transcribieron: sin consumidor en este panel.
    expect(variante('danger-ghost')).toBe(false);

    const tam = CarbonButton.props.tam.validator;
    for (const t of ['sm', 'md', 'lg']) expect(tam(t), t).toBe(true);
    // xl (64px) y 2xl (80px) son para layouts expresivos; no se transcriben.
    expect(tam('xl')).toBe(false);
  });

  it('el icono va a la DERECHA de la etiqueta (anatomia de Carbon)', () => {
    const w = mount(CarbonButton, { props: { icono: 'ti-plus' }, slots: { default: 'Nueva empresa' } });
    const hijos = [...w.element.children].map((e) => e.className);
    expect(hijos[0]).toContain('cds-btn__label');
    expect(hijos[1]).toContain('cds-btn__icono');
    expect(w.text()).toBe('Nueva empresa');
  });

  it('`cargando` deshabilita el boton, no solo cambia el icono', () => {
    // Un submit que se puede disparar dos veces es un bug de datos.
    const w = mount(CarbonButton, { props: { cargando: true }, slots: { default: 'Guardar' } });
    expect(w.attributes('disabled')).toBeDefined();
    expect(w.find('.cds-btn__icono--girando').exists()).toBe(true);
  });

  it('sin etiqueta pasa a solo-icono (centra en vez de separar)', () => {
    const w = mount(CarbonButton, { props: { icono: 'ti-trash' }, attrs: { 'aria-label': 'Eliminar' } });
    expect(w.classes()).toContain('cds-btn--solo-icono');
    expect(w.attributes('aria-label')).toBe('Eliminar');
  });

  it('type es "button" por defecto — un boton suelto en un <form> no debe enviarlo', () => {
    expect(mount(CarbonButton, { slots: { default: 'x' } }).attributes('type')).toBe('button');
    expect(mount(CarbonButton, { props: { tipo: 'submit' }, slots: { default: 'x' } }).attributes('type')).toBe('submit');
  });
});

describe('CarbonCampo.vue', () => {
  const base = { etiqueta: 'Correo electronico' };

  it('la etiqueta esta asociada al control por id, no solo puesta al lado', () => {
    const w = mount(CarbonCampo, { props: base });
    const id = w.find('input').attributes('id');
    expect(id).toBeTruthy();
    expect(w.find('label').attributes('for')).toBe(id);
  });

  it('renderiza el control que pide `tipo`', () => {
    expect(mount(CarbonCampo, { props: base }).find('input').exists()).toBe(true);
    expect(mount(CarbonCampo, { props: { ...base, tipo: 'textarea' } }).find('textarea').exists()).toBe(true);
    const sel = mount(CarbonCampo, {
      props: { ...base, tipo: 'select' },
      slots: { opciones: '<option value="a">A</option>' },
    });
    expect(sel.find('select').exists()).toBe(true);
    expect(sel.find('option').text()).toBe('A');
  });

  it('sin error no esta invalido y no hay mensaje', () => {
    const w = mount(CarbonCampo, { props: base });
    expect(w.classes()).not.toContain('cds-campo--invalido');
    expect(w.find('input').attributes('aria-invalid')).toBe('false');
    expect(w.find('.cds-campo__pie').exists()).toBe(false);
  });

  it('con error: marca el campo, lo enlaza y lo anuncia', () => {
    const w = mount(CarbonCampo, { props: { ...base, error: 'Formato invalido' } });
    expect(w.classes()).toContain('cds-campo--invalido');
    const input = w.find('input');
    expect(input.attributes('aria-invalid')).toBe('true');
    const pie = w.find('.cds-campo__pie');
    expect(pie.text()).toBe('Formato invalido');
    expect(pie.attributes('role')).toBe('alert');
    // El enlace es lo que hace que el lector de pantalla lea el motivo al
    // llegar al campo, en vez de dejarlo como un texto suelto cerca.
    expect(input.attributes('aria-describedby')).toBe(pie.attributes('id'));
  });

  it('el error gana sobre la ayuda, y solo el error se anuncia', () => {
    const w = mount(CarbonCampo, { props: { ...base, ayuda: 'Usá tu correo de trabajo', error: 'Ya existe' } });
    expect(w.find('.cds-campo__pie').text()).toBe('Ya existe');
    expect(w.findAll('.cds-campo__pie')).toHaveLength(1);

    const soloAyuda = mount(CarbonCampo, { props: { ...base, ayuda: 'Usá tu correo de trabajo' } });
    expect(soloAyuda.find('.cds-campo__pie').attributes('role')).toBeUndefined();
  });

  it('v-model: emite lo que se escribe', async () => {
    const w = mount(CarbonCampo, { props: base });
    await w.find('input').setValue('a@b.com');
    expect(w.emitted('update:modelValue')).toEqual([['a@b.com']]);
  });

  it('dos campos en el MISMO arbol no comparten id', () => {
    // Varias vistas renderizan el mismo formulario dos veces (tabla + tarjeta
    // movil); con ids repetidos el <label> apuntaria siempre al primero.
    // Los dos se montan en un mismo padre a proposito: useId() numera por
    // instancia de app, asi que dos mount() separados dan siempre 'v-0' y el
    // test no probaria nada del caso real.
    const Padre = {
      components: { CarbonCampo },
      template: '<div><CarbonCampo etiqueta="Uno" /><CarbonCampo etiqueta="Dos" /></div>',
    };
    const w = mount(Padre);
    const [a, b] = w.findAll('input').map((i) => i.attributes('id'));
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
    // Y cada label sigue a SU campo.
    const labels = w.findAll('label').map((l) => l.attributes('for'));
    expect(labels).toEqual([a, b]);
  });
});

describe('CarbonNotification.vue', () => {
  it('un error INTERRUMPE al lector de pantalla; lo demas espera', () => {
    // role="alert" corta lo que se este leyendo; role="status" espera. Un
    // error lo amerita, una confirmacion no.
    expect(mount(CarbonNotification, { props: { tipo: 'error', titulo: 'x' } }).attributes('role')).toBe('alert');
    for (const t of ['success', 'warning', 'info']) {
      expect(mount(CarbonNotification, { props: { tipo: t, titulo: 'x' } }).attributes('role'), t).toBe('status');
    }
  });

  it('no se puede descartar salvo que se pida', () => {
    // Un error sigue vigente hasta que se corrija: que no traiga X por
    // defecto es la decision, no un olvido.
    expect(mount(CarbonNotification, { props: { tipo: 'error', titulo: 'x' } }).find('button').exists()).toBe(false);
    const w = mount(CarbonNotification, { props: { tipo: 'success', titulo: 'x', descartable: true } });
    expect(w.find('button').attributes('aria-label')).toBe('Descartar aviso');
  });

  it('emite `cerrar`, no se oculta sola', () => {
    // Quien la muestra decide cuando dejar de mostrarla; el componente no
    // guarda estado de visibilidad.
    const w = mount(CarbonNotification, { props: { titulo: 'x', descartable: true } });
    w.find('button').trigger('click');
    expect(w.emitted('cerrar')).toHaveLength(1);
  });

  it('el detalle acepta prop o slot (el slot permite un enlace)', () => {
    expect(mount(CarbonNotification, { props: { detalle: 'Por texto' } }).text()).toContain('Por texto');
    const conSlot = mount(CarbonNotification, { slots: { default: '<a href="/x">Ver ticket</a>' } });
    expect(conSlot.find('a').text()).toBe('Ver ticket');
  });

  it('la variante toast solo agrega el flotar, no cambia la semantica', () => {
    const w = mount(CarbonNotification, { props: { tipo: 'success', titulo: 'Guardado', variante: 'toast' } });
    expect(w.classes()).toContain('cds-notif--toast');
    expect(w.classes()).toContain('cds-notif--success');
    expect(w.attributes('role')).toBe('status');
  });
});

describe('CarbonContentSwitcher.vue', () => {
  const opciones = [
    { valor: 'tabla', label: 'Tabla', icono: 'ti-table' },
    { valor: 'triage', label: 'Triage', icono: 'ti-columns' },
  ];

  it('es un grupo de botones con aria-pressed, no un tablist', () => {
    // No hay paneles que estas opciones controlen: anunciar "pestana" sin
    // panel asociado confunde mas de lo que ayuda.
    const w = mount(CarbonContentSwitcher, { props: { opciones, modelValue: 'tabla', etiqueta: 'Vista' } });
    expect(w.attributes('role')).toBe('group');
    expect(w.attributes('aria-label')).toBe('Vista');
    const btns = w.findAll('button');
    expect(btns[0].attributes('aria-pressed')).toBe('true');
    expect(btns[1].attributes('aria-pressed')).toBe('false');
  });

  it('el seleccionado usa el gris invertido, no el acento', () => {
    const w = mount(CarbonContentSwitcher, { props: { opciones, modelValue: 'triage', etiqueta: 'Vista' } });
    const btns = w.findAll('button');
    expect(btns[1].classes()).toContain('cds-switcher__btn--activo');
    expect(btns[0].classes()).not.toContain('cds-switcher__btn--activo');
  });

  it('emite la opcion elegida', async () => {
    const w = mount(CarbonContentSwitcher, { props: { opciones, modelValue: 'tabla', etiqueta: 'Vista' } });
    await w.findAll('button')[1].trigger('click');
    expect(w.emitted('update:modelValue')).toEqual([['triage']]);
  });

  it('solo-icono exige nombre accesible por opcion', () => {
    const w = mount(CarbonContentSwitcher, {
      props: { opciones, modelValue: 'tabla', etiqueta: 'Vista', soloIcono: true },
    });
    expect(w.find('.cds-switcher__label').exists()).toBe(false);
    expect(w.findAll('button')[0].attributes('aria-label')).toBe('Tabla');
  });
});

describe('CarbonTabs.vue', () => {
  const stubs = { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } };

  it('con `to` son ENLACES y la region es navigation', () => {
    // Una pestana que cambia la URL tiene que poder abrirse en pestana nueva
    // y copiarse; con <button> nada de eso funciona.
    const w = mount(CarbonTabs, {
      props: {
        etiqueta: 'Secciones',
        opciones: [
          { valor: 'a', label: 'Empresas', to: '/configuracion/empresas' },
          { valor: 'b', label: 'Staff', to: '/configuracion/staff' },
        ],
      },
      global: { stubs },
    });
    expect(w.attributes('role')).toBe('navigation');
    expect(w.findAll('a').map((a) => a.attributes('href'))).toEqual(['/configuracion/empresas', '/configuracion/staff']);
    expect(w.find('button').exists()).toBe(false);
  });

  it('sin `to` son botones con el contrato ARIA de tablist', () => {
    const w = mount(CarbonTabs, {
      props: {
        etiqueta: 'Bandejas',
        modelValue: 'mias',
        panel: 'panel-tickets',
        opciones: [{ valor: 'mias', label: 'Mías' }, { valor: 'todas', label: 'Todas' }],
      },
    });
    expect(w.attributes('role')).toBe('tablist');
    const btns = w.findAll('[role="tab"]');
    expect(btns).toHaveLength(2);
    expect(btns[0].attributes('aria-selected')).toBe('true');
    expect(btns[0].attributes('aria-controls')).toBe('panel-tickets');
  });

  it('el contador es opcional y no se inventa cuando vale 0', () => {
    const w = mount(CarbonTabs, {
      props: {
        etiqueta: 'Bandejas',
        modelValue: 'a',
        opciones: [{ valor: 'a', label: 'Sin asignar', contador: 0 }, { valor: 'b', label: 'Todas' }],
      },
    });
    const contadores = w.findAll('.cds-tabs__contador');
    // 0 es un dato real ("no hay ninguno"), undefined es "no aplica".
    expect(contadores).toHaveLength(1);
    expect(contadores[0].text()).toBe('0');
  });
});

describe('CarbonDataTable.vue', () => {
  const COLUMNAS = [
    { clave: 'codigo', label: 'Código', ordenable: true },
    { clave: 'titulo', label: 'Título', elastica: true },
    { clave: 'asientos', label: 'Asientos', num: true },
    { clave: 'secreta', label: 'Solo JEFE', oculta: true },
  ];
  const FILAS = [
    { id: 1, codigo: 'TI-1', titulo: 'Uno', asientos: 3 },
    { id: 2, codigo: 'TI-2', titulo: 'Dos', asientos: 12 },
  ];

  it('una columna oculta no aparece ni en el encabezado ni en las filas', () => {
    const w = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS } });
    expect(w.findAll('thead th')).toHaveLength(3);
    expect(w.text()).not.toContain('Solo JEFE');
    expect(w.findAll('tbody tr')).toHaveLength(2);
    expect(w.findAll('tbody tr')[0].findAll('td')).toHaveLength(3);
  });

  it('el colspan del estado vacío sigue al número REAL de columnas visibles', () => {
    // Es el bug que este componente existe para hacer imposible: el colspan
    // escrito a mano se desincroniza en cuanto se agrega una columna.
    const w = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: [] } });
    const celda = w.find('tbody td');
    expect(celda.attributes('colspan')).toBe('3');
    expect(w.text()).toContain('Sin resultados');
  });

  it('cargando muestra el skeleton y ninguna fila de datos', () => {
    const w = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS, cargando: true } });
    expect(w.findAll('.skeleton-fila').length).toBeGreaterThan(0);
    expect(w.text()).not.toContain('TI-1');
  });

  it('la densidad viaja como clase (32/40/48px de fila) y el default es md', () => {
    const porDefecto = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS } });
    // md (40px) es el default desde la revisión "Filas con foco + espaciosas"
    // (2026-09-03) — antes era sm.
    expect(porDefecto.find('table').classes()).toContain('cds-table--md');
    const sm = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS, densidad: 'sm' } });
    expect(sm.find('table').classes()).toContain('cds-table--sm');
    const lg = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS, densidad: 'lg' } });
    expect(lg.find('table').classes()).toContain('cds-table--lg');
  });

  it('solo la columna declarada `ordenable` es un botón, y emite su clave', async () => {
    const w = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS } });
    const botones = w.findAll('thead button');
    expect(botones).toHaveLength(1);
    await botones[0].trigger('click');
    expect(w.emitted('ordenar')).toEqual([['codigo']]);
  });

  it('`num` alinea a la derecha en encabezado Y celda de la misma columna', () => {
    const w = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS } });
    expect(w.findAll('thead th')[2].classes()).toContain('col-num');
    expect(w.findAll('tbody tr')[0].findAll('td')[2].classes()).toContain('col-num');
  });

  it('la tarjeta movil sale de LA MISMA definicion de columnas', () => {
    // Es el punto del componente: 17 vistas renderizaban cada fila dos veces
    // a mano, y agregar una columna exigia acordarse de tocar los dos sitios.
    const COLS = [
      { clave: 'codigo', label: 'Código', movil: 'cab' },
      { clave: 'titulo', label: 'Título', movil: 'principal' },
      { clave: 'asientos', label: 'Asientos' },              // sin declarar → 'sec'
      { clave: 'interno', label: 'Interno', movil: false },  // no va en móvil
      { clave: 'acciones', label: 'Acciones', movil: 'pie' },
    ];
    const w = mount(CarbonDataTable, {
      props: { columnas: COLS, filas: FILAS, etiqueta: 'Licencias' },
    });
    const tarjetas = w.findAll('.tarjeta-fila');
    expect(tarjetas).toHaveLength(2);
    const t = tarjetas[0];
    expect(t.find('.tarjeta-fila__cab').text()).toBe('TI-1');
    expect(t.find('.tarjeta-fila__principal').text()).toBe('Uno');
    expect(t.find('.tarjeta-fila__sec').text()).toBe('3');
    expect(t.find('.tarjeta-fila__pie').exists()).toBe(true);
    // `movil: false` no aparece en la tarjeta, pero SI en la tabla.
    expect(t.text()).not.toContain('interno');
    expect(w.findAll('thead th')).toHaveLength(5);
  });

  it('los slots de celda sirven a las DOS representaciones', () => {
    const w = mount(CarbonDataTable, {
      props: { columnas: [{ clave: 'titulo', label: 'Título', movil: 'principal' }], filas: FILAS },
      slots: { 'celda-titulo': '<b class="marca">{{ params.fila.titulo }}</b>' },
    });
    // Uno en el <td>, otro en la tarjeta: el mismo slot, definido una vez.
    expect(w.findAll('.marca').length).toBe(4);
    expect(w.find('tbody .marca').exists()).toBe(true);
    expect(w.find('.tarjeta-fila .marca').exists()).toBe(true);
  });

  it('sin `conTarjetas` no hay lista movil y la tabla deja de esconderse', () => {
    // ActividadView e ImportarEquiposView no tienen tarjetas hoy, a proposito.
    const w = mount(CarbonDataTable, {
      props: { columnas: COLUMNAS, filas: FILAS, conTarjetas: false },
    });
    expect(w.find('.lista-tarjetas').exists()).toBe(false);
    expect(w.find('.table-wrap').classes()).not.toContain('solo-escritorio');
  });

  it('cargando y vacio no renderizan tarjetas', () => {
    const cargando = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: FILAS, cargando: true } });
    expect(cargando.find('.tarjeta-fila').exists()).toBe(false);
    const vacio = mount(CarbonDataTable, { props: { columnas: COLUMNAS, filas: [] } });
    expect(vacio.find('.tarjeta-fila').exists()).toBe(false);
  });

  it('sin slot imprime el valor crudo; con slot manda el slot', () => {
    const w = mount(CarbonDataTable, {
      props: { columnas: COLUMNAS, filas: FILAS },
      slots: { 'celda-titulo': '<b class="propio">{{ params.fila.titulo }}!</b>' },
    });
    const celdas = w.findAll('tbody tr')[0].findAll('td');
    expect(celdas[0].text()).toBe('TI-1');          // sin slot
    expect(celdas[1].find('.propio').exists()).toBe(true); // con slot
    expect(celdas[1].text()).toBe('Uno!');
  });
});

describe('CarbonPagination.vue', () => {
  const base = { modelValue: 1, totalItems: 63, tamPagina: 20 };

  it('el rango se acota contra el total en la ultima pagina', () => {
    // 63 items en paginas de 20: la pagina 4 va de 61 a 63, no a 80.
    const w = mount(CarbonPagination, { props: { ...base, modelValue: 4 } });
    expect(w.text()).toContain('61–63 de 63');
  });

  it('no se renderiza sin resultados', () => {
    const w = mount(CarbonPagination, { props: { ...base, totalItems: 0 } });
    expect(w.find('nav').exists()).toBe(false);
  });

  it('con una sola pagina muestra el conteo pero no los controles', () => {
    const w = mount(CarbonPagination, { props: { ...base, totalItems: 5 } });
    expect(w.text()).toContain('1–5 de 5');
    expect(w.find('.cds-pag__flecha').exists()).toBe(false);
  });

  it('las flechas se deshabilitan en los extremos', () => {
    const primera = mount(CarbonPagination, { props: base });
    expect(primera.findAll('.cds-pag__flecha')[0].attributes('disabled')).toBeDefined();
    const ultima = mount(CarbonPagination, { props: { ...base, modelValue: 4 } });
    expect(ultima.findAll('.cds-pag__flecha')[1].attributes('disabled')).toBeDefined();
  });

  it('no emite si la pagina no cambia', async () => {
    const w = mount(CarbonPagination, { props: base });
    await w.findAll('.cds-pag__flecha')[0].trigger('click');  // ya esta en la 1
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('el selector de filas por pagina es opcional', () => {
    expect(mount(CarbonPagination, { props: base }).text()).not.toContain('Filas por página');
    const con = mount(CarbonPagination, { props: { ...base, tamanosPagina: [10, 20, 50] } });
    expect(con.text()).toContain('Filas por página');
    expect(con.findAll('.cds-pag__select')[0].findAll('option')).toHaveLength(3);
  });

  it('cambiar el tamano de pagina NO emite el reset de pagina', async () => {
    // El reset a la pagina 1 es del padre (store.cambiarTamPagina y
    // usePaginacion.cambiarTamPagina ya lo hacen). Emitirlo tambien desde
    // aca costaba una segunda consulta al servidor por cada cambio de
    // tamano en los 7 listados con store: el reset del store recargaba y el
    // de este componente recargaba otra vez.
    const w = mount(CarbonPagination, {
      props: { ...base, modelValue: 3, tamanosPagina: [10, 20, 50] },
    });
    await w.findAll('.cds-pag__select')[0].setValue('50');
    expect(w.emitted('update:tamPagina')).toEqual([[50]]);
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  // El selector muestra el tamano actual con `:tam-pagina`. Si el inicial de
  // los listados no fuera una de las opciones, el <select> arrancaria
  // desmintiendo a la tabla: "10" (o en blanco, segun el navegador) con 20
  // filas a la vista. Paso de verdad cuando las opciones eran 10/15/50/100 y
  // el inicial 20.
  // Regresion de la consulta doble: con el emit de pagina que tenia antes
  // este componente, un solo cambio de tamano disparaba dos listarPagina().
  // El guard _peticionId tapaba el efecto (los datos salian bien), no el
  // pedido.
  it('un cambio de tamano en un listado con store pide la pagina una sola vez', async () => {
    setActivePinia(createPinia());
    const listarPagina = vi.fn(async () => ({ items: [], total: 63 }));
    const store = crearStorePaginado('pag-una-consulta', {
      listarPagina,
      filtrosIniciales: () => ({}),
    })();
    store.pagina = 3;

    const w = mount(CarbonPagination, {
      props: {
        modelValue: store.pagina,
        totalItems: 63,
        tamPagina: store.tamPagina,
        tamanosPagina: TAMANOS_PAGINA,
      },
      attrs: {
        'onUpdate:tamPagina': (t) => store.cambiarTamPagina(t),
        'onUpdate:modelValue': (pag) => store.irAPagina(pag),
      },
    });
    await w.findAll('.cds-pag__select')[0].setValue('50');
    await flushPromises();

    expect(listarPagina).toHaveBeenCalledTimes(1);
    expect(listarPagina.mock.calls[0][0]).toMatchObject({ pagina: 1, tamPagina: 50 });
    expect(store.tamPagina).toBe(50);
    expect(store.pagina).toBe(1);
  });

  it('el tamano inicial de los listados es una de las opciones ofrecidas', () => {
    expect(TAMANOS_PAGINA).toContain(TAM_PAGINA_DEFECTO);

    const w = mount(CarbonPagination, {
      props: { ...base, tamPagina: TAM_PAGINA_DEFECTO, tamanosPagina: TAMANOS_PAGINA },
    });
    const sel = w.findAll('.cds-pag__select')[0];
    expect(sel.element.value).toBe(String(TAM_PAGINA_DEFECTO));
  });
});

describe('CarbonPasswordReveal.vue', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function montar(extra = {}) {
    const revelar = vi.fn(async () => 'Cl4v3-Secreta');
    const w = mount(CarbonPasswordReveal, { props: { revelar, ...extra } });
    return { w, revelar };
  }

  it('arranca oculto y no pide nada a la edge function', () => {
    const { w, revelar } = montar();
    expect(w.text()).toContain('••••••••');
    expect(revelar).not.toHaveBeenCalled();
  });

  it('revela con motivo "ver" y oculta solo a los 8 segundos', async () => {
    const { w, revelar } = montar();
    await w.findAll('button')[0].trigger('click');
    await vi.waitFor(() => expect(w.text()).toContain('Cl4v3-Secreta'));
    expect(revelar).toHaveBeenCalledWith('ver');
    expect(w.text()).toContain('8s');

    // A los 7 segundos todavía se ve.
    vi.advanceTimersByTime(7000);
    await w.vm.$nextTick();
    expect(w.text()).toContain('Cl4v3-Secreta');

    // Al octavo se va, y NO queda en el estado del componente.
    vi.advanceTimersByTime(1000);
    await w.vm.$nextTick();
    expect(w.text()).not.toContain('Cl4v3-Secreta');
    expect(w.text()).toContain('••••••••');
  });

  it('copiar pide un revelado PROPIO con motivo "copiar", no reusa el visible', async () => {
    // La auditoría tiene que poder distinguir "lo miró" de "se lo llevó".
    // Si copiar reusara el valor ya en pantalla, accesos_log vería un solo
    // acceso donde hubo dos, de dos clases distintas.
    const escribir = vi.fn(async () => {});
    // defineProperty y no Object.assign: en happy-dom `navigator.clipboard`
    // es solo-lectura (getter sin setter), igual que en un navegador real.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: escribir }, configurable: true,
    });
    const { w, revelar } = montar();

    await w.findAll('button')[0].trigger('click');   // ver
    await vi.waitFor(() => expect(revelar).toHaveBeenCalledTimes(1));
    await w.findAll('button')[1].trigger('click');   // copiar
    await vi.waitFor(() => expect(revelar).toHaveBeenCalledTimes(2));

    expect(revelar.mock.calls.map((c) => c[0])).toEqual(['ver', 'copiar']);
    await vi.waitFor(() => expect(escribir).toHaveBeenCalledWith('Cl4v3-Secreta'));
  });

  it('bloqueado muestra el candado con su motivo y ningún botón', () => {
    const { w, revelar } = montar({ bloqueado: true, motivoBloqueo: 'Sin permiso para ver contraseñas' });
    expect(w.findAll('button')).toHaveLength(0);
    const candado = w.find('.cds-cred__candado');
    expect(candado.exists()).toBe(true);
    expect(candado.attributes('aria-label')).toBe('Sin permiso para ver contraseñas');
    expect(revelar).not.toHaveBeenCalled();
  });

  it('si el permiso se cae con la credencial a la vista, se oculta', async () => {
    const { w } = montar();
    await w.findAll('button')[0].trigger('click');
    await vi.waitFor(() => expect(w.text()).toContain('Cl4v3-Secreta'));
    await w.setProps({ bloqueado: true });
    expect(w.text()).not.toContain('Cl4v3-Secreta');
  });

  it('la etiqueta viaja a los nombres accesibles (no todo es "contraseña")', () => {
    const { w } = montar({ etiqueta: 'clave' });
    expect(w.findAll('button')[0].attributes('aria-label')).toBe('Mostrar clave');
    expect(w.findAll('button')[1].attributes('aria-label')).toBe('Copiar clave');
  });

  it('un fallo del servidor no deja la credencial a medias', async () => {
    const revelar = vi.fn(async () => { throw new Error('Sin permiso para ver esta credencial'); });
    const w = mount(CarbonPasswordReveal, { props: { revelar } });
    await w.findAll('button')[0].trigger('click');
    await vi.waitFor(() => expect(revelar).toHaveBeenCalled());
    expect(w.text()).toContain('••••••••');
  });
});

describe('AppNav.vue — permisos a ítems visibles', () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  function montar() {
    return mount(AppNav, {
      global: {
        stubs: {
          // El RouterLink real necesita un router inyectado; acá solo
          // interesa QUÉ ítems se renderizan y a dónde apuntan.
          RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        },
      },
    });
  }

  function destinos(w) {
    return w.findAll('.cds-nav__link').map((a) => a.attributes('href'));
  }

  it('JEFE ve los 8 módulos configurables + Dashboard + auditoría + Configuración', () => {
    const auth = useAuthStore();
    auth.rol = 'JEFE';
    auth.modulosVisibles = []; // a propósito vacío: el JEFE no depende de esta lista
    const w = montar();
    const rutas = destinos(w);

    expect(rutas).toContain('/dashboard');
    expect(rutas).toContain('/configuracion');
    // Exclusivas de JEFE (meta.roles: ['jefe'] en sus rutas)
    expect(rutas).toContain('/actividad');
    expect(rutas).toContain('/accesos-sensibles');
    // Los 8 configurables, pese a modulosVisibles vacío
    expect(rutas).toHaveLength(MODULOS_CONFIGURABLES.length + 4);
  });

  it('ASISTENTE ve solo los módulos que tiene habilitados', () => {
    const auth = useAuthStore();
    auth.rol = 'ASISTENTE';
    auth.modulosVisibles = ['tickets', 'empleados'];
    const rutas = destinos(montar());

    expect(rutas).toContain('/tickets');
    expect(rutas).toContain('/empleados');
    expect(rutas).not.toContain('/correos');
    expect(rutas).not.toContain('/equipos');
  });

  it('a un ASISTENTE nunca se le muestran las pantallas de solo-JEFE', () => {
    const auth = useAuthStore();
    auth.rol = 'ASISTENTE';
    auth.modulosVisibles = MODULOS_CONFIGURABLES.map((m) => m.id);
    const rutas = destinos(montar());
    expect(rutas).not.toContain('/actividad');
    expect(rutas).not.toContain('/accesos-sensibles');
  });

  it('Configuración SÍ se le muestra al ASISTENTE', () => {
    // No es un descuido: de sus 7 pestañas, 6 están abiertas a cualquier
    // staff activo y solo `staff` declara meta.roles ['jefe']
    // (router/routes/config.routes.js). Esconder la entrada entera le
    // quitaría 6 secciones que sí puede usar.
    const auth = useAuthStore();
    auth.rol = 'ASISTENTE';
    auth.modulosVisibles = [];
    expect(destinos(montar())).toContain('/configuracion');
  });

  it('Dashboard se ve siempre: es la pantalla de entrada, no un módulo', () => {
    const auth = useAuthStore();
    auth.rol = 'ASISTENTE';
    auth.modulosVisibles = [];
    const rutas = destinos(montar());
    expect(rutas).toContain('/dashboard');
    // Sin un solo módulo habilitado quedan Dashboard y Configuración.
    expect(rutas).toEqual(['/dashboard', '/configuracion']);
  });

  it('un grupo sin ítems visibles no renderiza su encabezado', () => {
    const auth = useAuthStore();
    auth.rol = 'ASISTENTE';
    auth.modulosVisibles = ['tickets'];
    const w = montar();
    const titulos = w.findAll('.cds-nav__grupo-titulo').map((t) => t.text());
    expect(titulos).toContain('Mesa de Ayuda');
    // Sin permiso de Empleados/Correos/Licencias/Equipos → esos grupos no existen.
    expect(titulos).not.toContain('Gestión de Personal');
    expect(titulos).not.toContain('Inventario Global');
  });

  it('el badge de tickets sin asignar solo aparece con cola pendiente', () => {
    const auth = useAuthStore();
    auth.rol = 'JEFE';
    const sin = montar();
    expect(sin.find('.cds-nav__badge').exists()).toBe(false);

    const con = mount(AppNav, {
      props: { ticketsSinAsignar: 4 },
      global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
    });
    expect(con.find('.cds-nav__badge').text()).toBe('4');
  });

  it('el botón de expandir solo existe en el riel (es su única salida)', () => {
    const auth = useAuthStore();
    auth.rol = 'JEFE';
    const stubs = { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } };
    expect(mount(AppNav, { global: { stubs } }).find('.cds-nav__expandir').exists()).toBe(false);
    const riel = mount(AppNav, { props: { navEnRiel: true }, global: { stubs } });
    expect(riel.find('.cds-nav__expandir').exists()).toBe(true);
  });
});
