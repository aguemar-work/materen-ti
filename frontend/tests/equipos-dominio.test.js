// Lógica pura del dominio equipos que sostiene la hoja de vida, las actas y las
// etiquetas: kardex (cruce evento ↔ asignación ↔ acta), contenido de las actas
// (reemplaza los tests de construirActa de las actas viejas), QR y DNI.
import { describe, it, expect } from 'vitest';
import { filasKardex, rutaActa, actorCorto } from '../src/modules/equipos/kardex.js';
import { contenidoActa, tipoActaDe, lineasAccesorios } from '../src/modules/equipos/acta-datos.js';
import { urlEtiqueta, trazoQr, matrizQr, matrizDeTrazo } from '../src/core/qr.js';
import { enmascararDni } from '../src/core/dni.js';
import { disposicionPagina, esPdf, esImagen, prepararActaParaSubir } from '../src/core/pdfActa.js';

describe('enmascararDni', () => {
  it('deja a la vista solo los últimos 4 dígitos', () => {
    expect(enmascararDni('45678912')).toBe('****8912');
    expect(enmascararDni(' 4567 8912 ')).toBe('****8912');
  });
  it('un valor de 4 dígitos o menos se enmascara entero y el vacío queda vacío', () => {
    expect(enmascararDni('1234')).toBe('****');
    expect(enmascararDni('')).toBe('');
    expect(enmascararDni(null)).toBe('');
  });
});

describe('QR de la etiqueta', () => {
  it('codifica <origen>/e/<código>, sin barra final y con el código escapado', () => {
    expect(urlEtiqueta('LAP-0142', 'https://ti.materen.pe')).toBe('https://ti.materen.pe/e/LAP-0142');
    expect(urlEtiqueta('LAP-0142', 'https://ti.materen.pe/')).toBe('https://ti.materen.pe/e/LAP-0142');
    expect(urlEtiqueta('A B/1', 'https://x')).toBe('https://x/e/A%20B%2F1');
  });

  it('el trazo SVG reconstruye exactamente la matriz de módulos del texto', () => {
    const url = 'https://ti.materen.pe/e/LAP-0142';
    const { tamano, trazo } = trazoQr(url);
    const esperada = matrizQr(url);
    expect(tamano).toBe(esperada.tamano);
    expect(Array.from(matrizDeTrazo(trazo, tamano))).toEqual(Array.from(esperada.oscuros));
  });

  it('dos URL distintas producen dibujos distintos', () => {
    expect(trazoQr('https://x/e/LAP-0001').trazo).not.toBe(trazoQr('https://x/e/LAP-0002').trazo);
  });
});

describe('contenido de las actas (reemplaza a construirActa)', () => {
  const EQUIPO = {
    codigo: 'EQ-0007', codigo_almacen: 'ALM-12', tipo_nombre: 'Laptop', marca: 'Dell', modelo: 'Latitude 5420',
    serie: 'SN-XYZ', empresa_nombre: 'Constructora Nufago', estado: 'en_reparacion',
    accesorios_lineas: [{ codigo: 'ACC-1', descripcion: 'Cargador', cantidad: 1 }, { descripcion: 'Mouse', cantidad: 2 }],
  };
  const EMPLEADO = { nombres: 'Ana', apellidos: 'Quispe', dni: '12345678', cargo: 'Analista', empresa_nombre: 'Constructora Nufago' };
  const ENTREGA = { fecha_inicio: '2026-08-30', fecha_fin: null, condicion_entrega: 'Operativo', condicion_devolucion: null, motivo_cierre: null };
  const DEVOLUCION = { ...ENTREGA, fecha_fin: '2026-09-15', condicion_devolucion: 'Con rayones', motivo_cierre: 'baja_empleado' };
  const filas = (a, seccion) => Object.fromEntries(a.secciones[seccion].filas);

  it('el acta de entrega lleva receptor, equipo, cláusula y las dos firmas, con el DNI COMPLETO', () => {
    const a = contenidoActa({ tipo: 'entrega', equipo: EQUIPO, empleado: EMPLEADO, asignacion: ENTREGA });
    expect(a.titulo).toBe('Acta de entrega de equipo');
    expect(a.secciones.map((s) => s.titulo)).toEqual(['1. Datos del receptor', '2. Datos del equipo']);
    expect(filas(a, 0)).toMatchObject({ 'Nombre completo': 'Ana Quispe', DNI: '12345678', Cargo: 'Analista' });
    expect(filas(a, 1)).toMatchObject({
      'Código de equipo': 'EQ-0007', 'Código de almacén': 'ALM-12', 'Marca / Modelo': 'Dell Latitude 5420',
      'Número de serie': 'SN-XYZ', 'Condición de entrega': 'Operativo', 'Fecha de entrega': '30/08/2026',
    });
    expect(a.etiquetaAccesorios).toBe('Accesorios entregados');
    expect(a.clausula).toContain('me comprometo a');
    expect(a.firmas.map((f) => f.rol)).toEqual(['Entrega — Área de TI', 'Recibe conforme']);
    expect(a.firmas[1]).toMatchObject({ nombre: 'Ana Quispe', dni: '12345678' });
  });

  it('el acta de devolución suma la sección 3 y firma en orden inverso', () => {
    const a = contenidoActa({ tipo: 'devolucion', equipo: EQUIPO, empleado: EMPLEADO, asignacion: DEVOLUCION });
    expect(a.titulo).toBe('Acta de devolución de equipo');
    expect(a.secciones.map((s) => s.titulo)).toEqual(['1. Datos de quien devuelve', '2. Datos del equipo', '3. Datos de la devolución']);
    expect(filas(a, 2)).toMatchObject({
      'Condición de devolución': 'Con rayones', Motivo: 'Baja del empleado', 'Fecha de devolución': '15/09/2026',
      'Estado del equipo a la fecha de emisión': 'En reparación',
    });
    expect(a.etiquetaAccesorios).toBe('Accesorios devueltos');
    expect(a.clausula).toContain('quedando liberado de la');
    expect(a.firmas.map((f) => f.rol)).toEqual(['Entrega conforme', 'Recibe — Área de TI']);
  });

  it('un motivo fuera del catálogo se muestra tal cual', () => {
    const a = contenidoActa({ tipo: 'devolucion', equipo: EQUIPO, empleado: EMPLEADO, asignacion: { ...DEVOLUCION, motivo_cierre: 'otro_motivo' } });
    expect(filas(a, 2).Motivo).toBe('otro_motivo');
  });

  it('accesorios: líneas con código y cantidad, o el array plano de descripciones', () => {
    expect(lineasAccesorios(EQUIPO)).toEqual([
      { codigo: 'ACC-1', descripcion: 'Cargador', cantidad: 1 },
      { codigo: '', descripcion: 'Mouse', cantidad: 2 },
    ]);
    expect(lineasAccesorios({ accesorios: ['Funda'] })).toEqual([{ codigo: '', descripcion: 'Funda', cantidad: 1 }]);
    expect(lineasAccesorios({ accesorios_lineas: [], accesorios: [] })).toEqual([]);
  });

  it('tipoActaDe cae a "entrega" con un valor desconocido', () => {
    expect(tipoActaDe('devolucion')).toBe('devolucion');
    expect(tipoActaDe('otra-cosa')).toBe('entrega');
    expect(tipoActaDe(undefined)).toBe('entrega');
  });
});

describe('kardex del equipo', () => {
  const D = (iso) => `${iso}T10:00:00.000Z`;
  const asignaciones = [
    { id: 'a2', empleado_id: 'e1', fecha_inicio: '2026-03-12', fecha_fin: null, created_at: D('2026-03-12'), empleados: { nombres: 'Rosa', apellidos: 'Quispe' } },
    { id: 'a1', empleado_id: 'e2', fecha_inicio: '2025-01-05', fecha_fin: '2026-03-12', created_at: D('2025-01-05'), empleados: { nombres: 'Jorge', apellidos: 'Huamán' } },
  ];
  const eventos = [
    { id: 'v1', evento: 'registrado', detalle: 'Código LAP-001', user_id: null, user_email: null, created_at: D('2025-01-01') },
    { id: 'v2', evento: 'asignado', detalle: 'Entregado a Jorge Huamán — Nuevo', user_id: 'u1', user_email: 'a@m.pe', created_at: D('2025-01-05') },
    { id: 'v3', evento: 'devuelto', detalle: 'Devuelto por Jorge Huamán — Rayones (cambio_equipo)', user_id: 'u1', user_email: 'a@m.pe', created_at: D('2026-03-12') },
    { id: 'v4', evento: 'asignado', detalle: 'Entregado a Rosa Quispe — Buen estado', user_id: 'u2', user_email: 'b@m.pe', created_at: D('2026-03-12') },
    { id: 'v5', evento: 'estado_cambiado', detalle: 'De "operativo" a "en_reparacion"', user_id: 'u2', user_email: 'b@m.pe', created_at: D('2026-04-01') },
    { id: 'v6', evento: 'verificado', detalle: 'Verificado físicamente en Sede — conforme', user_id: 'u2', user_email: 'b@m.pe', created_at: D('2026-05-01') },
  ];
  const actas = [{ id: 'act1', asignacionId: 'a2', tipo: 'entrega', creadaEn: D('2026-03-13'), firmadoAt: '2026-03-12' }];
  const nombresStaff = new Map([['u1', 'Diego Huamán Rojas'], ['u2', 'Lucía Paredes Soto']]);
  const filasK = filasKardex({ equipoId: 'q1', eventos, asignaciones, actas, nombresStaff });

  it('lo más reciente primero', () => {
    expect(filasK.map((f) => f.id)).toEqual(['v6', 'v5', 'v4', 'v3', 'v2', 'v1']);
  });

  it('movimiento en participio y estado como anterior → nuevo', () => {
    const porId = Object.fromEntries(filasK.map((f) => [f.id, f]));
    expect(porId.v2).toMatchObject({ movimiento: 'Entregado', detalle: 'Jorge Huamán · Nuevo' });
    expect(porId.v3).toMatchObject({ movimiento: 'Devuelto', detalle: 'Jorge Huamán · Rayones · Cambio de equipo' });
    expect(porId.v5).toMatchObject({ movimiento: 'A reparación', detalle: 'Operativo → En reparación' });
    expect(porId.v6).toMatchObject({ movimiento: 'Verificado', detalle: 'en Sede — conforme' });
  });

  it('el actor sale con nombre corto y, sin actor, queda vacío para que AppLibro diga "legado"', () => {
    const porId = Object.fromEntries(filasK.map((f) => [f.id, f]));
    expect(porId.v2.por).toBe('Diego Huamán');
    expect(porId.v1.por).toBe('');
    expect(actorCorto({ user_id: null, user_email: 'jefe@materen.pe' })).toBe('jefe');
  });

  it('cada entrega y devolución enlaza a SU acta imprimible (y dice si está firmada)', () => {
    const porId = Object.fromEntries(filasK.map((f) => [f.id, f]));
    expect(porId.v4.ref).toEqual({ texto: 'Acta firmada', to: rutaActa('q1', 'a2', 'entrega') });
    expect(porId.v2.ref).toEqual({ texto: 'Acta', to: '/equipos/q1/acta/a1?tipo=entrega' });
    expect(porId.v3.ref).toEqual({ texto: 'Acta', to: '/equipos/q1/acta/a1?tipo=devolucion' });
    expect(porId.v5.ref).toBeUndefined();
  });

  it('un movimiento a una ubicación no lleva acta', () => {
    const f = filasKardex({
      equipoId: 'q2',
      eventos: [{ id: 'x', evento: 'asignado', detalle: 'Ubicado en Almacén Chorrillos', created_at: D('2026-01-01') }],
      asignaciones: [{ id: 'au', ubicacion_id: 'u', empleado_id: null, fecha_inicio: '2026-01-01', created_at: D('2026-01-01') }],
    });
    expect(f[0]).toMatchObject({ movimiento: 'Ubicado', detalle: 'Almacén Chorrillos' });
    expect(f[0].ref).toBeUndefined();
  });
});

describe('acta firmada: foto → PDF', () => {
  it('detecta PDF e imagen por tipo o extensión', () => {
    expect(esPdf({ type: 'application/pdf' })).toBe(true);
    expect(esPdf({ name: 'Acta.PDF', type: '' })).toBe(true);
    expect(esImagen({ type: 'image/jpeg' })).toBe(true);
    expect(esImagen({ type: 'text/plain' })).toBe(false);
  });

  it('la foto se centra en A4 sin deformarse, vertical u horizontal', () => {
    const v = disposicionPagina(1500, 2000);
    expect(v.orientacion).toBe('portrait');
    expect(v.imagen.ancho / v.imagen.alto).toBeCloseTo(1500 / 2000, 5);
    expect(v.imagen.x).toBeGreaterThanOrEqual(8);
    const h = disposicionPagina(2000, 1000);
    expect(h.orientacion).toBe('landscape');
    expect(h.imagen.ancho).toBeLessThanOrEqual(297 - 16 + 1e-9);
  });

  it('un PDF pasa tal cual; un archivo que no es PDF ni imagen se rechaza en español', async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'acta.pdf', { type: 'application/pdf' });
    await expect(prepararActaParaSubir(pdf)).resolves.toBe(pdf);
    await expect(prepararActaParaSubir(new File(['x'], 'nota.txt', { type: 'text/plain' }))).rejects.toThrow('PDF o una foto');
    await expect(prepararActaParaSubir(null)).rejects.toThrow('Seleccione el acta firmada');
  });

  it('respeta el tope de 10 MB del acta', async () => {
    const grande = { size: 11 * 1024 * 1024, type: 'application/pdf', name: 'a.pdf' };
    await expect(prepararActaParaSubir(grande)).rejects.toThrow('10 MB');
  });
});
