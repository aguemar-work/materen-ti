// Filtros server-side nuevos (2026-09-24) y el lookup de DNI duplicado,
// ejercidos contra el cliente de la MAQUETA (src/maqueta/client.js) como
// backend falso: prueba a la vez que la query de cada dominio pide lo
// correcto y que la maqueta la soporta (si una query nueva usara un operador
// que el cliente falso ignora, estos conteos no cuadrarían).
//
// Datos: src/maqueta/datos.js (fechas relativas a hoy).
//   licencias vencidas: l03 (-8 días), l07 (-40) · por vencer: l02 (+12), l05 (+25)
//   correos con requiere_rotacion: c12 (reutilizable; c04 es personal y no
//   entra al listado de Correos) · empleado Inactivo: e06, DNI 46325874.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/api/client.js', () => import('../src/maqueta/client.js'));

import { licenciasApi } from '../src/api/domains/licencias.js';
import { correosApi } from '../src/api/domains/correos.js';
import { ticketsApi } from '../src/api/domains/tickets.js';
import { empleadosApi } from '../src/api/domains/empleados.js';
import { construirFeedPendientes } from '../src/modules/dashboard/pendientesFeed.js';

const ids = (items) => items.map((i) => i.id).sort();

describe('Licencias — filtro de situación', () => {
  it('"vencidas" trae solo las de fecha anterior a hoy (nunca perpetuas)', async () => {
    const { items, total } = await licenciasApi.listLicenciasPage({ situacion: 'vencidas', tamPagina: 50 });
    expect(ids(items)).toEqual(['l03', 'l07']);
    expect(total).toBe(2);
  });

  it('"por_vencer" usa la misma ventana que el tag de la fila (30 días)', async () => {
    const { items } = await licenciasApi.listLicenciasPage({ situacion: 'por_vencer', tamPagina: 50 });
    expect(ids(items)).toEqual(['l02', 'l05']);
  });

  it('sin situación (o una desconocida) no filtra', async () => {
    const todas = await licenciasApi.listLicenciasPage({ tamPagina: 50 });
    const rara = await licenciasApi.listLicenciasPage({ situacion: 'sin_cupo', tamPagina: 50 });
    expect(rara.total).toBe(todas.total);
    expect(todas.total).toBeGreaterThan(4);
  });

  it('exportar respeta el mismo filtro', async () => {
    const filas = await licenciasApi.listLicenciasFiltrados({ situacion: 'vencidas' });
    expect(ids(filas)).toEqual(['l03', 'l07']);
  });
});

describe('Correos — filtro "Requieren rotación"', () => {
  it('soloRotacion trae únicamente cuentas con requiere_rotacion', async () => {
    const { items } = await correosApi.listCorreosPage({ soloRotacion: true, tamPagina: 50 });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((c) => c.requiere_rotacion)).toBe(true);
    expect(ids(items)).toContain('c12');
  });

  it('sin el filtro aparecen también las que no requieren rotación', async () => {
    const { items } = await correosApi.listCorreosPage({ tamPagina: 50 });
    expect(items.some((c) => !c.requiere_rotacion)).toBe(true);
  });
});

describe('Tickets — filtro por categoría (deep-link)', () => {
  it('categoriaId filtra por categoria_id, en la página y en el conteo', async () => {
    const { items, total } = await ticketsApi.listTicketsPage({ categoriaId: 'red', tamPagina: 100 });
    expect(total).toBeGreaterThan(0);
    expect(items.every((t) => t.categoria === 'Red y Conectividad')).toBe(true);
    const conteo = await ticketsApi.contarTickets({ categoriaId: 'red' });
    expect(conteo).toBe(total);
    const todos = await ticketsApi.contarTickets({});
    expect(todos).toBeGreaterThan(total);
  });
});

describe('Dashboard — "Posible problema recurrente" lleva a Tickets filtrado', () => {
  it('el destino incluye ?categoria=<id>', () => {
    const [item] = construirFeedPendientes(
      { porRotar: [], sinPassword: [], licenciasPorVencer: [], equiposSinDevolver: [], garantiasPorVencer: [] },
      { sinAsignar: [], sinVincular: [], abiertosViejos: [] },
      { categoriasRecurrentes: [{ categoria_id: 'red', categoria_nombre: 'Redes', tickets: [{}, {}, {}] }] },
    );
    expect(item.categoriaLabel).toBe('Posible problema recurrente');
    expect(item.destino).toBe('/tickets?vista=todos&categoria=red');
  });
});

describe('Empleados — DNI duplicado', () => {
  it('buscarPorDni devuelve al empleado existente con su estado', async () => {
    const e = await empleadosApi.buscarPorDni('46325874');
    expect(e).toMatchObject({ id: 'e06', nombres: 'Pedro', estado: 'Inactivo' });
  });

  it('la maqueta rechaza un DNI repetido con el mismo mensaje del unique real', async () => {
    await expect(empleadosApi.createEmpleado({
      nombres: 'Otro', apellidos: 'Pedro', dni: '46325874', empresa_id: 'emp-materen',
      estado: 'Activo', fecha_alta: '2026-09-24',
    })).rejects.toMatchObject({ message: expect.stringContaining('empleados_dni_key') });
  });
});
