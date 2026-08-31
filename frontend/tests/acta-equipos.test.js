// Regresión del contenido de las actas imprimibles de equipos: al pasar el
// armado del documento a acta-base.js (compartido entre entrega y
// devolución), estas pruebas fijan lo que cada acta debe seguir diciendo.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generarActa } from '../src/modules/equipos/acta.js';
import { generarActaDevolucion } from '../src/modules/equipos/acta-devolucion.js';

const EQUIPO = {
  codigo: 'EQ-0007',
  codigo_almacen: 'ALM-12',
  tipo_nombre: 'Laptop',
  marca: 'Dell',
  modelo: 'Latitude 5420',
  serie: 'SN-XYZ',
  empresa_nombre: 'Constructora <Nufago>',
  condicion_entrega: 'Operativo',
  accesorios_lineas: [
    { codigo: 'ACC-1', descripcion: 'Cargador', cantidad: 1 },
    { descripcion: 'Mouse', cantidad: 2 },
  ],
};

const EMPLEADO = {
  nombres: 'Ana',
  apellidos: 'Quispe',
  dni: '12345678',
  cargo: 'Analista',
  empresa_nombre: 'Constructora Nufago',
};

let escrito;

beforeEach(() => {
  escrito = '';
  globalThis.window = {
    open: () => ({
      document: {
        write: (html) => {
          escrito = html;
        },
        close: () => {},
      },
    }),
  };
});

afterEach(() => {
  delete globalThis.window;
});

describe('acta de entrega', () => {
  it('incluye encabezado, datos del equipo, accesorios y ambas firmas', () => {
    generarActa(EQUIPO, EMPLEADO);

    expect(escrito).toContain('<h1>Acta de Entrega de Equipo</h1>');
    expect(escrito).toContain('<title>Acta de entrega — EQ-0007</title>');
    expect(escrito).toContain('1. Datos del receptor');
    expect(escrito).toContain('2. Datos del equipo');
    expect(escrito).toContain('Ana Quispe');
    expect(escrito).toContain('Dell Latitude 5420');
    expect(escrito).toContain('Accesorios entregados');
    expect(escrito).toContain('<span class="acc-cod">ACC-1</span> Cargador');
    expect(escrito).toContain('Mouse ×2');
    expect(escrito).toContain('Entrega — Área de TI');
    expect(escrito).toContain('Recibe conforme');
    expect(escrito).toContain('me comprometo a');
    expect(escrito).toContain('window.print()');
  });

  it('escapa el HTML de los datos de negocio', () => {
    generarActa(EQUIPO, EMPLEADO);
    expect(escrito).toContain('Constructora &lt;Nufago&gt;');
    expect(escrito).not.toContain('Constructora <Nufago>');
  });

  it('cae en "Ninguno" cuando el equipo no tiene accesorios', () => {
    generarActa({ ...EQUIPO, accesorios_lineas: [], accesorios: [] }, EMPLEADO);
    expect(escrito).toContain('Ninguno');
  });

  it('propaga el error si el navegador bloquea la ventana emergente', () => {
    globalThis.window = { open: () => null };
    expect(() => generarActa(EQUIPO, EMPLEADO)).toThrow(/ventanas emergentes/);
  });
});

describe('acta de devolución', () => {
  const DEVOLUCION = { condicion: 'Con rayones', motivo: 'baja_empleado', aReparacion: true, fecha: '2026-08-30' };

  it('incluye la tercera sección con motivo, reparación y fecha', () => {
    generarActaDevolucion(EQUIPO, EMPLEADO, DEVOLUCION);

    expect(escrito).toContain('<h1>Acta de Devolución de Equipo</h1>');
    expect(escrito).toContain('<title>Acta de devolución — EQ-0007</title>');
    expect(escrito).toContain('1. Datos de quien devuelve');
    expect(escrito).toContain('3. Datos de la devolución');
    expect(escrito).toContain('Accesorios devueltos');
    expect(escrito).toContain('Baja del empleado');
    expect(escrito).toContain('Con rayones');
    expect(escrito).toContain('<td>Sí</td>');
    expect(escrito).toContain('quedando liberado de la');
  });

  it('las firmas van en el orden inverso al acta de entrega', () => {
    generarActaDevolucion(EQUIPO, EMPLEADO, DEVOLUCION);
    expect(escrito.indexOf('Entrega conforme')).toBeLessThan(escrito.indexOf('Recibe — Área de TI'));
  });

  it('usa el motivo crudo si no está en el catálogo de etiquetas', () => {
    generarActaDevolucion(EQUIPO, EMPLEADO, { ...DEVOLUCION, motivo: 'otro_motivo' });
    expect(escrito).toContain('otro_motivo');
  });
});
