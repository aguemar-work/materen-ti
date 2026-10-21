// Maqueta del escalamiento por niveles (migración 121): la RPC simulada
// rechaza con el mismo SQLSTATE y el MISMO texto que el SQL, y deja lo mismo
// que el servidor (tramo, evento, reasignación con origen y destino,
// comentario público, aviso al JEFE en N3). El seguimiento público de la
// maqueta proyecta el nivel y la fecha estimada.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS, RPC } from '../src/maqueta/datos.js';
import { MENSAJES_ESCALAMIENTO, definirActorEscalamiento } from '../src/maqueta/rpc-escalamiento-tickets.js';
import { funcionTickets } from '../src/maqueta/rpc-tickets.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/121_escalamiento_tickets.sql', import.meta.url)), 'utf8');
const JEFE = { id: 'u-jefe', esJefe: true, moduloTickets: true, email: 'jefe@materen.pe' };
const ASISTENTE = { id: 'u-asis-1', esJefe: false, moduloTickets: true, email: 'dhuaman@materen.pe' };
const clonar = (v) => JSON.parse(JSON.stringify(v));

function rechazo(fn) {
  try { fn(); } catch (e) { return { code: e.code, message: e.message }; }
  return null;
}

// Un ticket en atención en N1, asignado a Diego.
function baseConTicket() {
  const db = clonar(TABLAS);
  const t = db.tickets.find((x) => x.id === 't116');
  Object.assign(t, { estado: 'en_progreso', nivel_atencion: 'N1', asignado_a: 'u-asis-1' });
  return db;
}

describe('escalamiento (maqueta)', () => {
  afterEach(() => definirActorEscalamiento(JEFE));

  it('los mensajes de rechazo son los del SQL de la 121', () => {
    for (const m of Object.values(MENSAJES_ESCALAMIENTO)) {
      // Los topes con constante en el SQL se escriben con % (format de raise).
      const texto = typeof m === 'function' ? m('%') : m;
      expect(SQL.includes(texto) || SQL.includes(texto.replace(/\b1000\b/, '%')), texto).toBe(true);
    }
  });

  it('las etiquetas públicas del nivel son las de nivel_atencion_publico()', () => {
    for (const [n, label] of Object.entries({ N1: 'Nivel 1 – Soporte', N2: 'Nivel 2 – Especializado', N3: 'Nivel 3 – Especialista' })) {
      expect(SQL).toContain(`when '${n}' then '${label}'`);
    }
  });

  it('N1 a N2: reasigna, deja tramo, evento, reasignación con nombres y comentario público', () => {
    definirActorEscalamiento(ASISTENTE);
    const db = baseConTicket();
    const r = RPC.escalar_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N2', motivo: 'Se probó otro cable', responsable_id: 'u-asis-2' } });
    expect(r).toMatchObject({ ticket_id: 't116', nivel: 'N2', asignado_a: 'u-asis-2' });
    const t = db.tickets.find((x) => x.id === 't116');
    expect([t.nivel_atencion, t.asignado_a]).toEqual(['N2', 'u-asis-2']);
    const abiertos = db.ticket_escalamientos.filter((e) => e.ticket_id === 't116' && !e.fin_at);
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]).toMatchObject({ nivel_desde: 'N1', nivel_hacia: 'N2', responsable_id: 'u-asis-2', created_by: 'u-asis-1' });
    const eventos = db.ticket_eventos.filter((e) => e.ticket_id === 't116');
    expect(eventos.find((e) => e.evento === 'reasignado').detalle).toBe('De "Diego Huamán Rojas" a "Lucía Paredes Soto"');
    expect(eventos.find((e) => e.evento === 'escalado').detalle).toBe('De "N1" a "N2". Motivo: Se probó otro cable');
    expect(db.ticket_comentarios.at(-1)).toMatchObject({ ticket_id: 't116', interno: false, mensaje: 'Su ticket fue derivado al Nivel 2 – Especializado.' });
  });

  it('N2 a N3: conserva al responsable, guarda al especialista y avisa al JEFE (no a quien escala)', () => {
    definirActorEscalamiento(ASISTENTE);
    const db = baseConTicket();
    RPC.escalar_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-1' } });
    RPC.escalar_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N3', motivo: 'Placa', especialista_tipo: 'garantia', especialista_nombre: '  Lenovo   Perú ' } });
    const t = db.tickets.find((x) => x.id === 't116');
    expect([t.nivel_atencion, t.asignado_a]).toEqual(['N3', 'u-asis-1']);
    const abierto = db.ticket_escalamientos.find((e) => e.ticket_id === 't116' && !e.fin_at);
    expect(abierto).toMatchObject({ nivel_hacia: 'N3', especialista_nombre: 'Lenovo Perú', responsable_id: 'u-asis-1' });
    const avisos = db.notificaciones.filter((n) => n.tipo === 'ticket_escalado' && n.entidad_id === 't116');
    expect(avisos.map((n) => n.destinatario_id)).toEqual(['u-jefe']);
  });

  it('avance visible: se publica y mueve la fecha; uno interno no se publica', () => {
    const db = baseConTicket();
    RPC.escalar_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N3', motivo: 'Placa', especialista_tipo: 'proveedor', especialista_nombre: 'HP' } });
    const publicos = () => db.ticket_comentarios.filter((c) => c.ticket_id === 't116' && !c.interno).length;
    const antes = publicos();
    RPC.registrar_avance_escalamiento(db, { p_ticket_id: 't116', p_datos: { nota: 'Llega el repuesto', fecha_estimada: '2999-01-10', visible_usuario: true } });
    expect(publicos()).toBe(antes + 1);
    expect(db.ticket_comentarios.at(-1).mensaje).toBe('Llega el repuesto\nNueva fecha estimada de solución: 10/01/2999.');
    expect(db.ticket_escalamientos.find((e) => e.ticket_id === 't116' && !e.fin_at).fecha_estimada).toBe('2999-01-10');
    RPC.registrar_avance_escalamiento(db, { p_ticket_id: 't116', p_datos: { nota: 'Se llamó al proveedor' } });
    expect(publicos()).toBe(antes + 1);
    expect(db.ticket_escalamiento_avances.filter((a) => a.ticket_id === 't116')).toHaveLength(2);
  });

  it('devolver baja de nivel con motivo; nunca sube', () => {
    const db = baseConTicket();
    RPC.escalar_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-2' } });
    expect(rechazo(() => RPC.devolver_nivel_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N3', motivo: 'x' } })))
      .toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.devolverNoInferior('N2') });
    RPC.devolver_nivel_ticket(db, { p_ticket_id: 't116', p_datos: { nivel: 'N1', motivo: 'Era de Soporte' } });
    expect(db.tickets.find((x) => x.id === 't116').nivel_atencion).toBe('N1');
    expect(db.ticket_escalamientos.find((e) => e.ticket_id === 't116' && !e.fin_at)).toMatchObject({ direccion: 'devuelto', nivel_hacia: 'N1' });
  });

  it('rechazos con el SQLSTATE del SQL', () => {
    const db = baseConTicket();
    const escalar = (datos, id = 't116') => rechazo(() => RPC.escalar_ticket(db, { p_ticket_id: id, p_datos: datos }));
    expect(escalar({ nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-2' }, 't118')).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.noEnAtencion });
    expect(escalar({ nivel: 'N1', motivo: 'x' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.sinNivel });
    expect(escalar({ nivel: 'N2', motivo: ' ' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.sinMotivo });
    expect(escalar({ nivel: 'N2', motivo: 'x' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.sinResponsableN2 });
    expect(escalar({ nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-3' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.responsableInvalido });
    expect(escalar({ nivel: 'N3', motivo: 'x' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.sinEspecialistaTipo });
    expect(escalar({ nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-2', fecha_estimada: '2000-01-01' })).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.fechaPasada });
    expect(rechazo(() => RPC.registrar_avance_escalamiento(db, { p_ticket_id: 't116', p_datos: { nota: 'x' } }))).toEqual({ code: 'P0001', message: MENSAJES_ESCALAMIENTO.avanceSinTramo });
    expect(escalar({}, 'no-existe')).toEqual({ code: 'P0002', message: MENSAJES_ESCALAMIENTO.sinTicket });
    definirActorEscalamiento({ ...ASISTENTE, moduloTickets: false });
    expect(escalar({ nivel: 'N2', motivo: 'x', responsable_id: 'u-asis-2' })).toEqual({ code: '42501', message: MENSAJES_ESCALAMIENTO.sinPermiso });
  });

  it('el seguimiento de la maqueta muestra el nivel y la fecha estimada del tramo abierto', () => {
    const db = clonar(TABLAS);
    const t = db.tickets.find((x) => x.id === 't112');
    const r = funcionTickets(db, { action: 'seguimiento', token: t.token });
    expect(r).toMatchObject({ ok: true, nivel: 'N3' });
    expect(r.fechaEstimada).toBe(db.ticket_escalamientos.find((e) => e.id === 'esc-03').fecha_estimada);
    // Ni el especialista ni la referencia del tramo (el avance visible que
    // publicó el técnico sí puede nombrarlo: es un texto que él decidió mostrar).
    expect(JSON.stringify(r)).not.toMatch(/servicio técnico|CASO-77812|Falla de placa/);
    expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['especialista', 'motivo', 'asignado_a', 'prioridad']));
  });
});
