// @vitest-environment happy-dom
//
// AppTable + AppColumn — segundo wrapper del patrón PrimeVue Unstyled +
// Tailwind (ver frontend/AGENTS.md, "UI/UX"). Cubre lo que de verdad importa
// para un listado ITSM: que las columnas declaradas con <AppColumn> se
// rendericen (la razón de ser de AppColumn.js, ver su comentario), y que los
// eventos de orden/paginación lleguen traducidos al contrato de
// crearStorePaginado.js (ordenarPor(columna), irAPagina(pagina),
// cambiarTamPagina(nuevoTam)) — no los crudos de PrimeVue.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DataTable from 'primevue/datatable';
import AppTable from '../../src/components/ui/AppTable.vue';
import AppColumn from '../../src/components/ui/AppColumn.js';

const FILAS = [
  { id: 'TCK-0001', titulo: 'No enciende monitor', estado: 'Abierto' },
  { id: 'TCK-0002', titulo: 'Solicitud de VPN', estado: 'En progreso' },
];

function montar(props = {}, slots = {}) {
  return mount(AppTable, {
    props: { value: FILAS, ...props },
    slots: {
      default: `
        <AppColumn field="id" header="Ticket" />
        <AppColumn field="titulo" header="Título" sortable />
        <AppColumn field="estado" header="Estado" />
      `,
      ...slots,
    },
    global: {
      plugins: [[PrimeVue, { unstyled: true }]],
      components: { AppColumn },
    },
  });
}

describe('AppTable.vue + AppColumn.js — wrapper de primevue/datatable', () => {
  it('renderiza un <th> por columna declarada con AppColumn', () => {
    const w = montar();
    const ths = w.findAll('th');
    expect(ths.length).toBe(3);
    expect(ths.map((th) => th.text())).toEqual(['Ticket', 'Título', 'Estado']);
  });

  it('renderiza una <tr> de datos por fila, con las celdas correctas', () => {
    const w = montar();
    const filas = w.findAll('tbody tr');
    expect(filas.length).toBe(2);
    expect(filas[0].text()).toContain('TCK-0001');
    expect(filas[0].text()).toContain('No enciende monitor');
    expect(filas[1].text()).toContain('TCK-0002');
  });

  it('clic en un header ordenable emite "ordenar" con el nombre de columna (no el evento crudo de PrimeVue)', async () => {
    const w = montar();
    const thTitulo = w.findAll('th')[1]; // 'titulo' es la única sortable
    await thTitulo.trigger('click');
    expect(w.emitted('ordenar')).toBeTruthy();
    expect(w.emitted('ordenar')[0]).toEqual(['titulo']);
  });

  it('columna no ordenable no emite "ordenar" al clickearla', async () => {
    const w = montar();
    const thTicket = w.findAll('th')[0]; // 'id', sin :sortable
    await thTicket.trigger('click');
    expect(w.emitted('ordenar')).toBeFalsy();
  });

  it('loading=true no rompe el render (overlay del preset, no un slot que reemplace la tabla)', () => {
    const w = montar({ loading: true });
    expect(w.findAll('tbody tr').length).toBe(2);
  });

  it('value=[] muestra el EmptyState por defecto, no una tabla vacía muda', () => {
    const w = montar({ value: [] });
    expect(w.text()).toContain('Sin resultados');
  });

  it('slot #empty personalizado reemplaza al EmptyState por defecto', () => {
    const w = mount(AppTable, {
      props: { value: [] },
      slots: {
        default: `<AppColumn field="id" header="Ticket" />`,
        empty: '<p>Nada por acá, custom</p>',
      },
      global: { plugins: [[PrimeVue, { unstyled: true }]], components: { AppColumn } },
    });
    expect(w.text()).toContain('Nada por acá, custom');
    expect(w.text()).not.toContain('Sin resultados');
  });

  it('el preset pinta headerCell/bodyCell (no queda sin ninguna clase)', () => {
    const w = montar();
    const th = w.find('th');
    const td = w.find('td');
    expect((th.attributes('class') || '').length).toBeGreaterThan(0);
    expect((td.attributes('class') || '').length).toBeGreaterThan(0);
  });

  // El paginador propio de PrimeVue está apagado por defecto (ver comentario
  // de AppTable.vue) — se dispara el evento nativo @page directo sobre el
  // DataTable interno para probar la TRADUCCIÓN sin depender de su UI.
  it('evento "page" con cambio de página emite "pagina-cambiada" (1-based, no el índice 0 de PrimeVue)', async () => {
    const w = montar({ rows: 20 });
    await w.findComponent(DataTable).vm.$emit('page', { page: 2, rows: 20 });
    expect(w.emitted('pagina-cambiada')).toEqual([[3]]);
    expect(w.emitted('tam-pagina-cambiada')).toBeFalsy();
  });

  it('evento "page" con cambio de tamaño emite "tam-pagina-cambiada", no "pagina-cambiada"', async () => {
    const w = montar({ rows: 20 });
    await w.findComponent(DataTable).vm.$emit('page', { page: 0, rows: 50 });
    expect(w.emitted('tam-pagina-cambiada')).toEqual([[50]]);
    expect(w.emitted('pagina-cambiada')).toBeFalsy();
  });

  it("sin @row-click las filas no entran en el orden de Tab (no se inventa una interacción)", () => {
    const w = montar();
    // PrimeVue pone tabindex="-1" (fuera del orden de Tab); no debe ser "0".
    expect(w.find("tbody tr").attributes("tabindex")).not.toBe("0");
  });

  it("con @row-click cada fila es enfocable y Enter la abre como un clic", async () => {
    const abiertas = [];
    const w = montar({ onRowClick: (e) => abiertas.push(e.data.id) });
    const fila = w.findAll("tbody tr")[1];
    expect(fila.attributes("tabindex")).toBe("0");
    await fila.trigger("keydown", { key: "Enter" });
    expect(abiertas).toEqual(["TCK-0002"]);
  });

  it("Enter sobre un control dentro de la fila no abre la fila", async () => {
    const abiertas = [];
    const w = montar(
      { onRowClick: (e) => abiertas.push(e.data.id) },
      { default: '<AppColumn field="id" header="Ticket"><template #body><button type="button">Acción</button></template></AppColumn>' },
    );
    await w.find("tbody tr button").trigger("keydown", { key: "Enter" });
    expect(abiertas).toEqual([]);
  });

  it("orden={columna,direccion} marca la columna ordenada igual que sortField/sortOrder", () => {
    const conOrden = montar({ orden: { columna: "titulo", direccion: "desc" } });
    const conSort = montar({ sortField: "titulo", sortOrder: -1 });
    const ariaSort = (w) => w.findAll("th")[1].attributes("aria-sort");
    expect(ariaSort(conOrden)).toBe(ariaSort(conSort));
    expect(ariaSort(conOrden)).toBe("descending");
  });
});
