// Libro de movimientos del expediente del empleado (libroEmpleado.js): mezcla
// y orden de las fuentes, filtros, actor ("no registrado (legado)"), la regla
// de la ventana de cada equipo y los respaldos desde la propia asignación.
import { describe, it, expect } from 'vitest';
import {
  armarLibroEmpleado,
  filtrarLibro,
  fechaDeBaja,
  actorLegible,
  estadoEntrega,
  FILTROS_LIBRO,
} from '../src/modules/empleados/libroEmpleado.js';

const EMPLEADO = { nombres: 'Rosa', apellidos: 'Quispe Mamani' };
const AHORA = Date.parse('2026-10-01T12:00:00');

const ev = (id, evento, created_at, extra = {}) => ({
  id, empleado_id: 'e01', evento, campo: null, valor_anterior: null, valor_nuevo: null,
  user_id: null, user_email: null, rol_actor: 'legado', detalle: null, created_at, ...extra,
});

describe('actorLegible', () => {
  it('"Sistema" para el rol sistema, el nombre del staff si se conoce y la parte local del correo si no', () => {
    expect(actorLegible({ rol: 'sistema' })).toBe('Sistema');
    expect(actorLegible({ userId: 'u1', email: 'dhuaman@materen.pe' }, { u1: 'Diego Huamán' })).toBe('Diego Huamán');
    expect(actorLegible({ userId: 'u9', email: 'dhuaman@materen.pe' }, {})).toBe('dhuaman');
  });

  it('sin actor devuelve null (AppLibro escribe "no registrado (legado)")', () => {
    expect(actorLegible({})).toBeNull();
    expect(actorLegible({ rol: 'legado' })).toBeNull();
  });
});

describe('armarLibroEmpleado — hoja de vida (empleado_eventos)', () => {
  const eventos = [
    ev('1', 'creado', '2024-03-14T09:00:00', { detalle: 'Registro anterior a la auditoría' }),
    ev('2', 'area_cambiada', '2025-06-01T10:00:00', { campo: 'area_obra', valor_anterior: 'Logística', valor_nuevo: 'Administración', user_id: 'u1', user_email: 'jefe@materen.pe', rol_actor: 'jefe' }),
    ev('3', 'suspendido', '2026-09-20T08:00:00', { valor_anterior: 'Activo', valor_nuevo: 'Suspendido', detalle: 'Investigación interna', user_id: 'u1', rol_actor: 'jefe' }),
    ev('4', 'contacto_cambiado', '2026-09-25T08:00:00', { campo: 'telefono,whatsapp', detalle: 'actualizado', rol_actor: 'sistema' }),
    ev('5', 'accesos_revisados', '2026-09-28T08:00:00', { detalle: 'Sin observaciones', user_email: 'dhuaman@materen.pe', rol_actor: 'tecnico' }),
  ];
  const filas = armarLibroEmpleado({ eventos }, { empleado: EMPLEADO, nombresStaff: { u1: 'Alejandro Guevara' }, ahora: AHORA });

  it('ordena lo más reciente arriba', () => {
    expect(filas.map((f) => f.id)).toEqual(['evento-5', 'evento-4', 'evento-3', 'evento-2', 'evento-1']);
  });

  it('redacta el movimiento en participio y la transición como anterior → nuevo', () => {
    const porId = Object.fromEntries(filas.map((f) => [f.id, f]));
    expect(porId['evento-2']).toMatchObject({ movimiento: 'Área/obra cambiada', detalle: 'Logística → Administración', por: 'Alejandro Guevara' });
    expect(porId['evento-3']).toMatchObject({ movimiento: 'Suspendido', detalle: 'Activo → Suspendido · Investigación interna' });
  });

  it('el contacto nombra los campos pero nunca guarda ni muestra valores', () => {
    const f = filas.find((x) => x.id === 'evento-4');
    expect(f.detalle).toBe('Teléfono, WhatsApp: valor actualizado');
    expect(f.por).toBe('Sistema');
  });

  it('un evento heredado no tiene actor y un técnico aparece por su correo', () => {
    expect(filas.find((x) => x.id === 'evento-1').por).toBeNull();
    expect(filas.find((x) => x.id === 'evento-5').por).toBe('dhuaman');
  });

  it('solo las revisiones de accesos cuentan como "Accesos"; el resto de la hoja de vida va en Todo', () => {
    expect(filtrarLibro(filas, 'accesos').map((f) => f.id)).toEqual(['evento-5']);
    expect(filtrarLibro(filas, '')).toHaveLength(5);
    expect(filtrarLibro(filas, 'equipos')).toEqual([]);
  });
});

describe('armarLibroEmpleado — equipos', () => {
  const asignaciones = [
    { id: 'a-actual', equipo_id: 'q1', fecha_inicio: '2025-03-12', fecha_fin: null, created_at: '2025-03-12T10:30:00', codigo: 'LAP-0142', descripcion: 'HP ProBook' },
    { id: 'a-previa', equipo_id: 'q1', fecha_inicio: '2024-01-10', fecha_fin: '2025-03-12', created_at: '2024-01-10T09:00:00', codigo: 'LAP-0142', descripcion: 'HP ProBook' },
  ];
  const eventos = [
    { id: 'x1', equipo_id: 'q1', evento: 'registrado', detalle: 'Código LAP-0142', user_email: 'jefe@materen.pe', created_at: '2023-12-01T09:00:00' },
    // Entrega a OTRA persona (su ventana es la previa): no es de Rosa.
    { id: 'x2', equipo_id: 'q1', evento: 'asignado', detalle: 'Entregado a Jorge Huamán Ccori — Nuevo', user_email: 'jefe@materen.pe', created_at: '2024-01-10T09:00:00' },
    // Devolución de Jorge el MISMO día que se entrega a Rosa.
    { id: 'x3', equipo_id: 'q1', evento: 'devuelto', detalle: 'Devuelto por Jorge Huamán Ccori — Con rayones', user_email: 'dhuaman@materen.pe', created_at: '2025-03-12T10:20:00' },
    { id: 'x4', equipo_id: 'q1', evento: 'asignado', detalle: 'Entregado a Rosa Quispe Mamani — Buen estado', user_email: 'jefe@materen.pe', created_at: '2025-03-12T10:30:00' },
    { id: 'x5', equipo_id: 'q1', evento: 'acta_adjuntada', detalle: 'Acta de entrega firmada adjuntada', user_email: 'dhuaman@materen.pe', created_at: '2025-03-14T09:00:00' },
    { id: 'x6', equipo_id: 'q1', evento: 'verificado', detalle: 'Verificado en Sede Lima', user_email: 'lparedes@materen.pe', created_at: '2026-02-01T09:00:00' },
  ];

  it('solo entran los eventos de SU ventana, y las entregas/devoluciones solo si nombran a la persona', () => {
    const filas = armarLibroEmpleado({ equipos: { asignaciones: [asignaciones[0]], eventos } }, { empleado: EMPLEADO, ahora: AHORA });
    expect(filas.map((f) => f.id).sort()).toEqual(['equipo-x4', 'equipo-x5', 'equipo-x6']);
    const entrega = filas.find((f) => f.id === 'equipo-x4');
    expect(entrega).toMatchObject({ movimiento: 'Equipo entregado', detalle: 'LAP-0142 · HP ProBook · Buen estado', categoria: 'equipos' });
    expect(entrega.ref).toEqual({ texto: 'LAP-0142', to: '/equipos/q1' });
  });

  it('el acta enlaza a la ruta imprimible de su asignación', () => {
    const filas = armarLibroEmpleado({ equipos: { asignaciones: [asignaciones[0]], eventos } }, { empleado: EMPLEADO, ahora: AHORA });
    expect(filas.find((f) => f.id === 'equipo-x5').ref).toEqual({ texto: 'Acta', to: '/equipos/q1/acta/a-actual?tipo=entrega' });
  });

  it('sin evento de entrega ni de devolución, la propia asignación aporta ambas filas (sin hora, sin actor)', () => {
    const filas = armarLibroEmpleado(
      { equipos: { asignaciones: [asignaciones[1]], eventos: [] } },
      { empleado: EMPLEADO, ahora: AHORA },
    );
    expect(filas.map((f) => f.movimiento)).toEqual(['Equipo devuelto', 'Equipo entregado']);
    expect(filas[0]).toMatchObject({ fecha: '2025-03-12', por: null });
  });

  it('un acta sin su evento en la hoja del equipo igual aparece, enlazada', () => {
    const filas = armarLibroEmpleado(
      {
        equipos: { asignaciones: [asignaciones[0]], eventos: [] },
        actas: [{ id: 'ac1', asignacion_equipo_id: 'a-actual', tipo: 'entrega', equipo_id: 'q1', created_at: '2025-03-20T09:00:00' }],
      },
      { empleado: EMPLEADO, ahora: AHORA },
    );
    const acta = filas.find((f) => f.id === 'acta-ac1');
    expect(acta).toMatchObject({ movimiento: 'Acta firmada adjuntada', detalle: 'LAP-0142 · Acta de entrega' });
  });

  it('con el evento del acta presente no se duplica con la fila de la tabla actas', () => {
    const filas = armarLibroEmpleado(
      {
        equipos: { asignaciones: [asignaciones[0]], eventos },
        actas: [{ id: 'ac1', asignacion_equipo_id: 'a-actual', tipo: 'entrega', equipo_id: 'q1', created_at: '2025-03-14T09:00:00' }],
      },
      { empleado: EMPLEADO, ahora: AHORA },
    );
    expect(filas.filter((f) => f.movimiento === 'Acta firmada adjuntada')).toHaveLength(1);
  });
});

describe('armarLibroEmpleado — cuentas, licencias, entregas y tickets', () => {
  const fuentes = {
    cuentas: [
      { id: 'c1', cuenta_id: 'cu1', fecha_inicio: '2024-03-14', fecha_fin: null, notas: '', usuario: 'rquispe@materen.pe', tipo_cuenta: 'personal', plataforma: 'Gmail' },
      { id: 'c2', cuenta_id: 'cu2', fecha_inicio: '2024-04-01', fecha_fin: '2025-01-10', notas: 'Traspaso: cambio de puesto', usuario: 'obra@materen.pe', tipo_cuenta: 'reutilizable', plataforma: 'Gmail' },
    ],
    licencias: [{ id: 'l1', licencia_id: 'li1', fecha_inicio: '2026-02-01', fecha_fin: '2026-08-01', software: 'AutoCAD 2026' }],
    entregas: [
      { id: 'n1', created_at: '2026-09-12T20:00:00', expires_at: '2026-09-13T20:00:00', viewed_at: '2026-09-12T20:14:00', created_by: 'u1' },
      { id: 'n2', created_at: '2026-06-01T09:00:00', expires_at: '2026-06-02T09:00:00', viewed_at: null, created_by: null },
      { id: 'n3', created_at: '2026-09-30T09:00:00', expires_at: '2026-10-02T09:00:00', viewed_at: null, created_by: 'u1' },
    ],
    tickets: [{ id: 't1', codigo: 'TCK-0281', titulo: 'Impresora de obra', estado: 'abierto', tipo: 'incidente', origen: 'empleado', created_at: '2026-09-28T14:02:00' }],
  };
  const filas = armarLibroEmpleado(fuentes, { empleado: EMPLEADO, nombresStaff: { u1: 'Alejandro Guevara' }, ahora: AHORA });
  const mov = (f) => `${f.movimiento}|${f.categoria}`;

  it('cada fuente aporta sus movimientos con su categoría de filtro', () => {
    const tipos = filas.map(mov);
    expect(tipos).toContain('Cuenta asignada|accesos');
    expect(tipos).toContain('Cuenta traspasada|accesos');
    expect(tipos).toContain('Licencia asignada|licencias');
    expect(tipos).toContain('Licencia liberada|licencias');
    expect(tipos).toContain('Entrega enviada|accesos');
    expect(tipos).toContain('Entrega abierta|accesos');
    expect(tipos).toContain('Entrega vencida|accesos');
    expect(tipos).toContain('Ticket registrado|tickets');
  });

  it('una entrega sin abrir cuyo plazo ya pasó figura vencida; la vigente, solo enviada', () => {
    expect(estadoEntrega(fuentes.entregas[0], AHORA)).toBe('abierta');
    expect(estadoEntrega(fuentes.entregas[1], AHORA)).toBe('vencida');
    expect(estadoEntrega(fuentes.entregas[2], AHORA)).toBe('enviada');
    expect(filas.filter((f) => f.movimiento === 'Entrega vencida')).toHaveLength(1);
  });

  it('el ticket enlaza al ticket y solo se ve en "Todo"', () => {
    const t = filas.find((f) => f.movimiento === 'Ticket registrado');
    expect(t.ref).toEqual({ texto: 'TCK-0281', to: '/tickets/t1' });
    expect(t.por).toBe('Empleado');
    for (const filtro of ['accesos', 'equipos', 'licencias']) {
      expect(filtrarLibro(filas, filtro).some((f) => f.categoria === 'tickets')).toBe(false);
    }
  });

  it('"Accesos" reúne cuentas y entregas; "Licencias", solo licencias', () => {
    expect(filtrarLibro(filas, 'accesos').every((f) => f.categoria === 'accesos')).toBe(true);
    expect(filtrarLibro(filas, 'licencias').map((f) => f.movimiento)).toEqual(['Licencia liberada', 'Licencia asignada']);
  });

  it('el orden mezcla fuentes por instante (las fechas sin hora, a las 00:00)', () => {
    const ordenes = filas.map((f) => f.orden);
    expect(ordenes).toEqual([...ordenes].sort((a, b) => b - a));
    expect(filas[0].movimiento).toBe('Entrega enviada'); // 30/09 09:00 es lo último
  });

  it('sin ninguna fuente el libro está vacío (AppLibro pinta la fila en gris)', () => {
    expect(armarLibroEmpleado({}, { empleado: EMPLEADO })).toEqual([]);
  });
});

describe('fechaDeBaja', () => {
  it('toma la baja más reciente, o el cambio heredado a Inactivo', () => {
    expect(fechaDeBaja([
      ev('1', 'baja_ejecutada', '2026-01-10T10:00:00'),
      ev('2', 'baja_ejecutada', '2026-08-12T10:00:00'),
      ev('3', 'creado', '2020-01-01T00:00:00'),
    ])).toBe('2026-08-12T10:00:00');
    expect(fechaDeBaja([ev('1', 'estado_cambiado', '2025-05-05T00:00:00', { valor_nuevo: 'Inactivo' })])).toBe('2025-05-05T00:00:00');
  });

  it('null si el empleado nunca fue dado de baja', () => {
    expect(fechaDeBaja([ev('1', 'creado', '2020-01-01T00:00:00')])).toBeNull();
    expect(fechaDeBaja([])).toBeNull();
  });
});

describe('filtros del libro', () => {
  it('son Todo, Accesos, Equipos y Licencias', () => {
    expect(FILTROS_LIBRO.map((f) => f.label)).toEqual(['Todo', 'Accesos', 'Equipos', 'Licencias']);
  });
});
