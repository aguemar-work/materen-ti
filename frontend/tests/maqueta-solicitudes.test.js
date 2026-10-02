// Maqueta de las Solicitudes de servicio (migración 108): el catálogo es ESPEJO
// del SQL, las RPC simuladas rechazan con el mismo SQLSTATE y el mismo texto que
// el servidor y los triggers de autocompletado se simulan donde la base los
// dispararía. Sin esto, la maqueta (lo que ve el dueño al revisar la pantalla)
// podría enseñar un comportamiento que el servidor no tiene.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS } from '../src/maqueta/datos.js';
import { TIPOS, PLANTILLA } from '../src/maqueta/solicitudes-plantilla.js';
import { RPC_SOLICITUDES as RPC, autocompletarPaso } from '../src/maqueta/rpc-solicitudes.js';
import { RPC_EMPLEADOS } from '../src/maqueta/rpc-empleados.js';
import { RPC_EQUIPOS } from '../src/maqueta/rpc-equipos.js';
import { avanceSolicitud } from '../src/core/dominio-solicitudes.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/108_solicitudes_de_servicio.sql', import.meta.url)), 'utf8');

const base = () => JSON.parse(JSON.stringify(TABLAS));
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const pasosDe = (db, sol) => db.solicitud_pasos.filter((p) => p.solicitud_id === sol.id).sort((a, b) => a.orden - b.orden);
const paso = (db, sol, clave) => pasosDe(db, sol).find((p) => p.clave === clave);

describe('el catálogo de la maqueta es espejo de la migración 108', () => {
  it('los 7 tipos: id, nombre, módulo responsable y orden', () => {
    const bloque = SQL.slice(SQL.indexOf('insert into public.solicitud_tipos'), SQL.indexOf('on conflict (id) do update'));
    const filas = [...bloque.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*'(?:[^']|'')*',\s*'([a-z]+)',\s*(\d+)\)/g)]
      .map(([, id, nombre, modulo, orden]) => ({ id, nombre, modulo_responsable: modulo, orden: Number(orden) }));
    expect(filas).toHaveLength(7);
    expect(TIPOS.map(({ id, nombre, modulo_responsable, orden }) => ({ id, nombre, modulo_responsable, orden }))).toEqual(filas);
  });

  it('los 24 pasos de la plantilla: orden, clave, texto, obligatorio, módulo, referencia, autocompleta y dinámico', () => {
    const bloque = SQL.slice(SQL.indexOf('insert into public.solicitud_plantilla_pasos'), SQL.indexOf('on conflict (tipo_id, clave) do update'));
    const re = /\('([a-z_]+)',\s*(\d+),\s*'([a-z_]+)',\s*'([^']+)',\s*(true|false),\s*'([a-z]+)',\s*(null|'[a-z]+'),\s*(true|false),\s*(true|false)\)/g;
    const filas = [...bloque.matchAll(re)].map(([, tipo_id, orden, clave, label, obligatorio, modulo, ref, autocompleta, dinamico]) => ({
      tipo_id, orden: Number(orden), clave, label, obligatorio: obligatorio === 'true', modulo,
      referencia_tipo: ref === 'null' ? null : ref.replaceAll("'", ''), autocompleta: autocompleta === 'true', dinamico: dinamico === 'true',
    }));
    expect(filas).toHaveLength(24);
    expect(PLANTILLA).toEqual(filas);
  });
});

describe('crear_solicitud', () => {
  it('un alta con persona NUEVA crea al empleado y copia los 7 pasos con el primero ya hecho', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, {
      p_tipo: 'alta_empleado',
      p_empleado: { nombres: 'Nueva', apellidos: 'Persona', dni: '70123456', empresa_id: 'emp-materen', cargo: 'Residente' },
      p_nota: '  Pedido de RRHH por correo ', p_origen: 'rrhh_correo',
    });
    expect(sol).toMatchObject({ estado: 'abierta', origen: 'rrhh_correo', nota: 'Pedido de RRHH por correo', tipo_id: 'alta_empleado' });
    expect(sol.codigo).toMatch(/^SOL-\d{4}$/);
    const emp = db.empleados.find((e) => e.id === sol.empleado_id);
    expect(emp).toMatchObject({ nombres: 'Nueva', dni: '70123456', estado: 'Activo', cargo: 'Residente' });
    expect(db.empleado_eventos.some((e) => e.empleado_id === emp.id && e.evento === 'creado')).toBe(true);
    const pasos = pasosDe(db, sol);
    expect(pasos).toHaveLength(7);
    expect(pasos[0]).toMatchObject({ clave: 'registrar_empleado', estado: 'hecho', referencia_id: emp.id });
    expect(avanceSolicitud(pasos).pendientes).toBe(6);
  });

  it('el código es correlativo y los rechazos llevan el SQLSTATE y el texto del servidor', () => {
    const db = base();
    const max = Math.max(...db.solicitudes.map((s) => Number(s.codigo.slice(4))));
    const a = RPC.crear_solicitud(db, { p_tipo: 'acceso_nuevo', p_empleado_id: 'e01' });
    expect(a.codigo).toBe(`SOL-${String(max + 1).padStart(4, '0')}`);
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'inventado', p_empleado_id: 'e01' }))).toMatchObject({
      code: 'P0001', message: 'El tipo de solicitud no existe o no está disponible.',
    });
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'baja_empleado', p_empleado_id: 'e01' })).message).toMatch(/Dar de baja/);
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'cambio_puesto' })).message).toBe('Elija al empleado de la solicitud.');
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'alta_empleado' })).message).toBe('Indique los datos de la persona que ingresa.');
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'licencia', p_empleado_id: 'no-existe' }))).toMatchObject({ code: 'P0002' });
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'licencia', p_empleado_id: 'e06' })).message).toMatch(/no está activo \(estado: Inactivo\)/);
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'licencia', p_empleado_id: 'e01', p_nota: 'x'.repeat(1001) })).message).toMatch(/1000/);
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'licencia', p_empleado_id: 'e01', p_origen: 'raro' })).message).toBe('El origen del pedido no es válido.');
  });

  it('valida a la persona nueva: DNI de 8 dígitos y único, empresa obligatoria y existente', () => {
    const db = base();
    const persona = (extra) => ({ nombres: 'A', apellidos: 'B', dni: '70123456', empresa_id: 'emp-materen', ...extra });
    const crear = (extra) => RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado: persona(extra) });
    expect(rechazo(() => crear({ dni: '1234' })).message).toBe('El DNI debe tener 8 dígitos.');
    expect(rechazo(() => crear({ dni: '45871236' })).message).toBe('Ya existe un empleado con ese DNI.');
    expect(rechazo(() => crear({ dni: '46325874' })).message).toMatch(/\(Inactivo\): use «Reingresar»/);
    expect(rechazo(() => crear({ empresa_id: '' })).message).toBe('La empresa es obligatoria.');
    expect(rechazo(() => crear({ empresa_id: 'zzz' })).message).toBe('La empresa indicada no existe.');
    expect(rechazo(() => crear({ nombres: ' ' })).message).toBe('Los nombres y los apellidos son obligatorios.');
    expect(db.empleados.some((e) => e.dni === '70123456')).toBe(false); // un rechazo no deja a nadie creado
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: 'e01', p_empleado: persona() })).message).toMatch(/no ambos/);
  });

  it('alta, baja y cambio de puesto: una sola abierta por persona, con el código de la existente', () => {
    const db = base();
    const abierta = db.solicitudes.find((s) => s.tipo_id === 'alta_empleado' && s.estado === 'abierta');
    expect(rechazo(() => RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: abierta.empleado_id })).message)
      .toBe(`Ya hay una solicitud de alta de empleado abierta para esta persona (${abierta.codigo}).`);
    RPC.crear_solicitud(db, { p_tipo: 'acceso_nuevo', p_empleado_id: 'e01' });
    expect(() => RPC.crear_solicitud(db, { p_tipo: 'acceso_nuevo', p_empleado_id: 'e01' })).not.toThrow(); // accesos: varias
  });

  it('la devolución de un equipo admite a un Inactivo', () => {
    const db = base();
    expect(RPC.crear_solicitud(db, { p_tipo: 'devolucion_equipo', p_empleado_id: 'e06' }).estado).toBe('abierta');
  });
});

describe('pasos: completar, omitir, cancelar y cierre automático', () => {
  it('completar valida la referencia contra la persona y el último paso completa la solicitud', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'cambio_puesto', p_empleado_id: 'e01' });
    const [p1, p2, p3] = pasosDe(db, sol);
    expect(rechazo(() => RPC.completar_paso_solicitud(db, { p_paso_id: p1.id, p_referencia_id: 'ac01' })).message).toBe('Este paso no admite una referencia.');
    RPC.completar_paso_solicitud(db, { p_paso_id: p1.id, p_nota: '  ok ' });
    expect(p1).toMatchObject({ estado: 'hecho', nota: 'ok', automatico: false });
    expect(rechazo(() => RPC.completar_paso_solicitud(db, { p_paso_id: p1.id })).message).toBe('El paso ya fue resuelto.');
    expect(sol.estado).toBe('abierta');
    RPC.completar_paso_solicitud(db, { p_paso_id: p2.id });
    RPC.omitir_paso_solicitud(db, { p_paso_id: p3.id, p_motivo: 'No tenía equipo' });
    expect(sol).toMatchObject({ estado: 'completada' });
    expect(sol.completada_at).not.toBeNull();
    expect(rechazo(() => RPC.completar_paso_solicitud(db, { p_paso_id: p3.id })).message).toMatch(/ya no está abierta/);
  });

  it('una referencia ajena se rechaza; una propia se acepta', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: 'e11' });
    const accesos = paso(db, sol, 'dar_accesos_area');
    expect(rechazo(() => RPC.completar_paso_solicitud(db, { p_paso_id: accesos.id, p_referencia_id: 'ac01' })).message)
      .toBe('La referencia indicada no pertenece al empleado de la solicitud.');
    RPC.completar_paso_solicitud(db, { p_paso_id: accesos.id, p_referencia_id: 'ac20' }); // cuenta de e11
    expect(accesos).toMatchObject({ estado: 'hecho', referencia_id: 'ac20' });
  });

  it('omitir exige motivo; un paso obligatorio solo lo omite un jefe (aquí el actor es el JEFE ficticio)', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'cambio_puesto', p_empleado_id: 'e01' });
    const [p1] = pasosDe(db, sol);
    expect(rechazo(() => RPC.omitir_paso_solicitud(db, { p_paso_id: p1.id, p_motivo: ' ' })).message).toBe('El motivo para omitir el paso es obligatorio.');
    expect(RPC.omitir_paso_solicitud(db, { p_paso_id: p1.id, p_motivo: 'No aplica' })).toMatchObject({ estado: 'omitido', motivo_omision: 'No aplica' });
  });

  it('cancelar exige motivo, queda registrado y no se repite', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'licencia', p_empleado_id: 'e01' });
    expect(rechazo(() => RPC.cancelar_solicitud(db, { p_solicitud_id: sol.id, p_motivo: '' })).message).toBe('El motivo de la cancelación es obligatorio.');
    RPC.cancelar_solicitud(db, { p_solicitud_id: sol.id, p_motivo: ' Pedido duplicado ' });
    expect(sol).toMatchObject({ estado: 'cancelada', motivo_cancelacion: 'Pedido duplicado' });
    expect(rechazo(() => RPC.cancelar_solicitud(db, { p_solicitud_id: sol.id, p_motivo: 'otra' })).message).toBe(`La solicitud ${sol.codigo} ya está cancelada.`);
    expect(rechazo(() => RPC.cancelar_solicitud(db, { p_solicitud_id: 'no', p_motivo: 'x' }))).toMatchObject({ code: 'P0002' });
  });

  it('convertir un ticket exige empleado vinculado, lo deja como solicitud y no se repite', () => {
    const db = base();
    const sinEmpleado = db.tickets.find((t) => !t.empleado_id);
    expect(rechazo(() => RPC.convertir_ticket_en_solicitud(db, { p_ticket_id: sinEmpleado.id, p_tipo: 'acceso_nuevo' })).message).toMatch(/no tiene un empleado vinculado/);
    const t = db.tickets.find((x) => x.empleado_id === 'e02' && !db.solicitudes.some((s) => s.ticket_id === x.id));
    const sol = RPC.convertir_ticket_en_solicitud(db, { p_ticket_id: t.id, p_tipo: 'acceso_nuevo', p_nota: 'por ticket' });
    expect(sol).toMatchObject({ ticket_id: t.id, origen: 'ticket', empleado_id: 'e02', datos: { ticket_codigo: t.codigo } });
    expect(t.tipo).toBe('solicitud');
    expect(rechazo(() => RPC.convertir_ticket_en_solicitud(db, { p_ticket_id: t.id, p_tipo: 'licencia' })).message).toBe(`El ticket ya tiene una solicitud vinculada (${sol.codigo}).`);
  });
});

describe('autocompletado (los triggers de la sección 5)', () => {
  it('asignar una cuenta, un equipo y una licencia marca el paso de ESA persona, con la referencia', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: 'e11' });
    const asigCuenta = db.asignaciones_cuenta.find((a) => a.empleado_id === 'e11');
    autocompletarPaso(db, { empleadoId: 'e01', clave: 'crear_cuenta', referenciaId: 'x' }); // otra persona: nada
    expect(paso(db, sol, 'crear_cuenta').estado).toBe('pendiente');
    autocompletarPaso(db, { empleadoId: 'e11', clave: 'crear_cuenta', referenciaId: asigCuenta.id });
    expect(paso(db, sol, 'crear_cuenta')).toMatchObject({ estado: 'hecho', automatico: true, referencia_id: asigCuenta.id });
    const eq = RPC_EQUIPOS.asignar_equipo(db, { p_equipo_id: 'q03', p_empleado_id: 'e11' });
    expect(paso(db, sol, 'asignar_equipo')).toMatchObject({ estado: 'hecho', referencia_id: eq.id });
  });

  it('un evento marca UN paso: el de la solicitud más antigua', () => {
    const db = base();
    const alta = RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: 'e11' });
    const acceso = RPC.crear_solicitud(db, { p_tipo: 'acceso_nuevo', p_empleado_id: 'e11' });
    autocompletarPaso(db, { empleadoId: 'e11', clave: 'crear_cuenta', referenciaId: 'r1' });
    expect(paso(db, alta, 'crear_cuenta').estado).toBe('hecho');
    expect(paso(db, acceso, 'crear_cuenta').estado).toBe('pendiente');
    autocompletarPaso(db, { empleadoId: 'e11', clave: 'crear_cuenta', referenciaId: 'r2' });
    expect(paso(db, acceso, 'crear_cuenta').estado).toBe('hecho');
  });

  it('crear una cuenta con la RPC de la 101 marca crear_cuenta de la solicitud abierta', () => {
    const db = base();
    const sol = RPC.crear_solicitud(db, { p_tipo: 'alta_empleado', p_empleado_id: 'e11' });
    const asig = RPC_EMPLEADOS.crear_cuenta_asignada(db, { p_plataforma_id: 'gmail', p_usuario: 'nuevo@materen.pe', p_empleado_id: 'e11', p_tipo_cuenta: 'personal' });
    expect(paso(db, sol, 'crear_cuenta')).toMatchObject({ estado: 'hecho', referencia_id: asig.id });
  });
});

describe('dar_baja_empleado crea la solicitud de baja con pasos reales', () => {
  it('cerrar accesos hecho; una rotación por cuenta compartida; un paso por equipo; las otras solicitudes abiertas se cancelan', () => {
    const db = base();
    const abierta = RPC.crear_solicitud(db, { p_tipo: 'acceso_nuevo', p_empleado_id: 'e02' });
    RPC_EMPLEADOS.dar_baja_empleado(db, { p_empleado_id: 'e02', p_motivo: 'Renuncia' });
    const baja = db.solicitudes.find((s) => s.empleado_id === 'e02' && s.tipo_id === 'baja_empleado' && s.estado === 'abierta');
    expect(baja).toMatchObject({ origen: 'sistema', nota: 'Renuncia' });
    const pasos = pasosDe(db, baja);
    expect(pasos[0]).toMatchObject({ clave: 'cerrar_accesos', estado: 'hecho' });
    expect(pasos.filter((p) => p.clave === 'rotar_contrasenas').length).toBeGreaterThan(0);
    expect(pasos.every((p) => p.clave !== 'rotar_contrasenas' || p.objetivo_id)).toBe(true);
    expect(pasos.filter((p) => p.clave === 'devolver_equipo').map((p) => p.objetivo_id)).toEqual(['ae02']);
    expect(abierta.estado).toBe('cancelada');
    // Una segunda baja sobre un Inactivo es inocua para el servidor y aquí no duplica.
    expect(rechazo(() => RPC_EMPLEADOS.dar_baja_empleado(db, { p_empleado_id: 'e02' })).message).toBe('El empleado ya está dado de baja.');
  });

  it('rotar la contraseña y devolver el equipo marcan sus pasos y completan la baja', () => {
    const db = base();
    RPC_EMPLEADOS.dar_baja_empleado(db, { p_empleado_id: 'e11' });
    const baja = db.solicitudes.find((s) => s.empleado_id === 'e11' && s.tipo_id === 'baja_empleado');
    const rotar = pasosDe(db, baja).filter((p) => p.clave === 'rotar_contrasenas');
    expect(rotar.length).toBeGreaterThan(0);
    for (const p of rotar) {
      expect(p.estado).toBe('pendiente');
      autocompletarPaso(db, { clave: 'rotar_contrasenas', objetivoId: p.objetivo_id, referenciaId: p.objetivo_id });
      expect(p.estado).toBe('hecho');
    }
    for (const p of pasosDe(db, baja).filter((x) => x.estado === 'pendiente')) {
      RPC.completar_paso_solicitud(db, { p_paso_id: p.id });
    }
    expect(baja.estado).toBe('completada');
  });

  it('el reingreso abre una solicitud de alta', () => {
    const db = base();
    RPC_EMPLEADOS.reingresar_empleado(db, { p_empleado_id: 'e06', p_datos: {} });
    const alta = db.solicitudes.find((s) => s.empleado_id === 'e06' && s.tipo_id === 'alta_empleado' && s.estado === 'abierta');
    expect(alta).toMatchObject({ origen: 'sistema', nota: 'Reingreso del empleado.' });
  });
});

describe('las tablas de la maqueta se leen con embeds como las lee el API real', () => {
  it('solicitudes con tipo, persona, pasos y ticket', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { getClient } = await import('../src/maqueta/client.js');
    const { data, error } = await getClient().database
      .from('solicitudes')
      .select('*, solicitud_tipos(id, nombre), empleados(id, nombres, apellidos), solicitud_pasos(id, estado), tickets(id, codigo)')
      .eq('codigo', 'SOL-0001')
      .single();
    expect(error).toBeNull();
    expect(data.solicitud_tipos.nombre).toBe('Alta de empleado');
    expect(data.empleados.nombres).toBe('Ana Lucía');
    expect(data.solicitud_pasos).toHaveLength(7);
    expect(data.tickets).toMatchObject({ id: 't116', codigo: 'TCK-0116' });
  });
});
