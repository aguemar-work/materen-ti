// Maqueta de los Cambios (migración 107): el catálogo de servicios y la whitelist son
// ESPEJO del SQL, las RPC simuladas rechazan con el mismo SQLSTATE y el mismo texto
// que el servidor, y las vistas derivadas se mantienen al día. Sin esto, la maqueta
// (lo que ve el dueño al revisar la pantalla) podría enseñar un comportamiento que
// el servidor no tiene.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TABLAS } from '../src/maqueta/datos.js';
import { RPC_CAMBIOS as RPC, definirActorCambios, calcularVistasCambios } from '../src/maqueta/rpc-cambios.js';
import { plazoAprobacion, emergenciaSinAprobar, ESTADOS_CAMBIO } from '../src/core/dominio-cambios.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/107_servicios_y_cambios.sql', import.meta.url)), 'utf8');

const base = () => JSON.parse(JSON.stringify(TABLAS));
const rechazo = (fn) => { try { fn(); } catch (e) { return e; } return null; };
const nuevo = (db, extra = {}) => RPC.crear_cambio(db, {
  p_titulo: 'Cambio de prueba', p_tipo: 'normal', p_riesgo: 'medio', p_servicio_id: 'red', p_descripcion: 'Linea 1\nLinea 2',
  p_plan_retroceso: 'Volver atrás', p_ventana_inicio: '2026-10-05T08:00:00Z', p_ventana_fin: '2026-10-05T10:00:00Z', ...extra,
});
const eventos = (db, c) => db.cambio_eventos.filter((e) => e.cambio_id === c.id).map((e) => e.evento);

beforeEach(() => definirActorCambios({ id: 'u-jefe', esJefe: true, email: 'jefe@materen.pe' }));

describe('el catálogo de la maqueta es espejo de la migración 107', () => {
  it('los 10 servicios: id, nombre, descripción, criticidad y horario', () => {
    const bloque = SQL.slice(SQL.indexOf('insert into public.servicios (id, nombre, descripcion, criticidad, horario) values'), SQL.indexOf('on conflict (id) do nothing'));
    const filas = [...bloque.matchAll(/\('([a-z0-9_]+)',\s*'([^']+)',\s*'([^']+)',\s*'([a-z]+)',\s*'([^']+)'\)/g)]
      .map(([, id, nombre, descripcion, criticidad, horario]) => ({ id, nombre, descripcion, criticidad, horario }));
    expect(filas).toHaveLength(10);
    expect(TABLAS.servicios.map(({ id, nombre, descripcion, criticidad, horario }) => ({ id, nombre, descripcion, criticidad, horario }))).toEqual(filas);
  });

  it('los enlaces de fábrica de las categorías de ticket coinciden con el SQL', () => {
    for (const [cat, servicio] of [['accesos_cuentas', 'accesos'], ['equipos', 'equipos'], ['software', 'licencias'], ['red', 'red']]) {
      expect(SQL).toContain(`set servicio_id = '${servicio}'`);
      expect(TABLAS.categorias_ticket.find((c) => c.id === cat).servicio_id).toBe(servicio);
    }
  });

  it('la whitelist de la maqueta es la del SQL (14 filas)', () => {
    const bloque = SQL.slice(SQL.indexOf('insert into public.transiciones_cambio_permitidas'), SQL.indexOf('on conflict (origen, destino) do update'));
    const filas = [...bloque.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*array\[([^\]]*)\],\s*(true|false)\)/g)]
      .map(([, origen, destino, tipos, solo]) => ({ origen, destino, tipos: [...tipos.matchAll(/'([a-z]+)'/g)].map((m) => m[1]), solo_jefe: solo === 'true' }));
    expect(TABLAS.transiciones_cambio_permitidas).toEqual(filas);
  });

  it('cada texto de rechazo de la maqueta existe en el SQL', () => {
    const fuente = readFileSync(fileURLToPath(new URL('../src/maqueta/rpc-cambios.js', import.meta.url)), 'utf8');
    const literales = [...fuente.matchAll(/rechazar\('P0001',\s*'([^']+)'\)/g)].map((m) => m[1]);
    expect(literales.length).toBeGreaterThan(12);
    for (const texto of literales) expect(SQL, texto).toContain(texto);
  });

  it('los datos sembrados cubren todos los estados y respetan las reglas del SQL', () => {
    const estados = new Set(TABLAS.cambios.map((c) => c.estado));
    for (const e of ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado', 'cerrado', 'rechazado', 'revertido']) expect(estados.has(e), e).toBe(true);
    for (const c of TABLAS.cambios) {
      expect(Object.keys(ESTADOS_CAMBIO)).toContain(c.estado);
      expect(c.codigo).toMatch(/^CHG-\d{4}$/);
      if (c.estado !== 'borrador' && c.tipo !== 'estandar') expect(c.plan_retroceso, c.codigo).toBeTruthy();
      if (c.estado !== 'borrador' && c.tipo !== 'emergencia') expect(c.ventana_inicio, c.codigo).toBeTruthy();
      expect(Boolean(c.aprobado_por), c.codigo).toBe(Boolean(c.aprobado_at));
      expect(TABLAS.servicios.some((s) => s.id === c.servicio_id)).toBe(true);
      expect(TABLAS.cambio_eventos.some((e) => e.cambio_id === c.id && e.evento === 'creado')).toBe(true);
    }
    // la emergencia sembrada corre sin aprobación y con el plazo vencido (es lo que se ve en el aviso)
    const em = TABLAS.cambios.find((c) => c.tipo === 'emergencia');
    expect(emergenciaSinAprobar(em)).toBe(true);
    expect(plazoAprobacion(em).vencida).toBe(true);
    expect(TABLAS.v_cambios_aprobacion_vencida.map((v) => v.codigo)).toEqual([em.codigo]);
    expect(TABLAS.v_kpi_cambios.map((k) => k.tipo)).toEqual(['estandar', 'normal', 'emergencia']);
  });
});

describe('crear_cambio y actualizar_cambio', () => {
  it('nace borrador, con código correlativo, título limpio y el libro abierto', () => {
    const db = base();
    const max = Math.max(...db.cambios.map((c) => Number(c.codigo.slice(4))));
    const c = nuevo(db, { p_titulo: '  Cambio   del   router ' });
    expect(c).toMatchObject({ estado: 'borrador', titulo: 'Cambio del router', solicitado_por: 'u-jefe', codigo: `CHG-${String(max + 1).padStart(4, '0')}` });
    expect(c.descripcion).toContain('\n');
    expect(eventos(db, c)).toEqual(['creado']);
  });

  it('con p_enviar un normal queda por aprobar y un estándar queda aprobado sin aprobador', () => {
    const db = base();
    const n = nuevo(db, { p_enviar: true });
    expect(n).toMatchObject({ estado: 'solicitado', aprobado_por: null });
    expect(n.solicitado_at).toBeTruthy();
    const e = nuevo(db, { p_tipo: 'estandar', p_plan_retroceso: null, p_enviar: true });
    expect(e).toMatchObject({ estado: 'aprobado', aprobado_por: null });
    expect(db.cambio_eventos.find((x) => x.cambio_id === e.id && x.evento === 'aprobado').detalle).toMatch(/preautorizado/);
  });

  it('los rechazos llevan el SQLSTATE y el texto del servidor', () => {
    const db = base();
    const prueba = (extra, mensaje, code = 'P0001') => expect(rechazo(() => nuevo(db, extra)), mensaje).toMatchObject({ code, message: mensaje });
    prueba({ p_titulo: 'ab' }, 'El título es obligatorio (mínimo 3 caracteres).');
    prueba({ p_tipo: 'otro' }, 'El tipo de cambio no es válido (estándar, normal o emergencia).');
    prueba({ p_riesgo: 'extremo' }, 'El riesgo no es válido (bajo, medio o alto).');
    prueba({ p_servicio_id: 'no_existe' }, 'El servicio indicado no existe o fue dado de baja.');
    prueba({ p_descripcion: '   ' }, 'La descripción del cambio es obligatoria.');
    prueba({ p_ventana_fin: null }, 'Indique el inicio y el fin de la ventana, o ninguno de los dos.');
    prueba({ p_ventana_inicio: '2026-10-05T10:00:00Z', p_ventana_fin: '2026-10-05T08:00:00Z' }, 'La ventana de ejecución termina antes de empezar.');
    prueba({ p_enviar: true, p_plan_retroceso: null }, 'Un cambio normal necesita un plan de retroceso.');
    prueba({ p_enviar: true, p_ventana_inicio: null, p_ventana_fin: null }, 'Indique la ventana de ejecución (inicio y fin) del cambio.');
    // como en el servidor (una sola transacción), un envío rechazado no deja el cambio creado
    expect(db.cambios).toHaveLength(base().cambios.length);
    expect(db.cambio_eventos).toHaveLength(base().cambio_eventos.length);
  });

  it('un servicio dado de baja no se ofrece', () => {
    const db = base();
    db.servicios.find((s) => s.id === 'red').deleted_at = '2026-09-01T00:00:00Z';
    expect(rechazo(() => nuevo(db))).toMatchObject({ code: 'P0001' });
  });

  it('solo un borrador se edita', () => {
    const db = base();
    const c = nuevo(db);
    const ed = RPC.actualizar_cambio(db, { p_cambio_id: c.id, p_titulo: 'Titulo nuevo', p_tipo: 'normal', p_riesgo: 'alto', p_servicio_id: 'erp', p_descripcion: 'd', p_plan_retroceso: 'Plan B' });
    expect(ed).toMatchObject({ titulo: 'Titulo nuevo', riesgo: 'alto', servicio_id: 'erp', ventana_inicio: null });
    expect(eventos(db, c)).toEqual(['creado', 'editado']);
    RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'cancelado' });
    expect(rechazo(() => RPC.actualizar_cambio(db, { p_cambio_id: c.id, p_titulo: 'Otro titulo', p_tipo: 'normal', p_riesgo: 'bajo', p_servicio_id: 'red', p_descripcion: 'd' })))
      .toMatchObject({ code: 'P0001', message: `El cambio ${c.codigo} ya salió de borrador: no se edita. Cancélelo y registre uno nuevo.` });
    expect(rechazo(() => RPC.actualizar_cambio(db, { p_cambio_id: 'no-existe' }))).toMatchObject({ code: 'P0002', message: 'El cambio no existe.' });
  });
});

describe('transicionar, aprobar y rechazar', () => {
  it('el ciclo normal completo deja el libro en orden, con el aprobador y las fechas', () => {
    const db = base();
    let c = nuevo(db, { p_enviar: true });
    c = RPC.aprobar_cambio(db, { p_cambio_id: c.id, p_nota: 'Autorizado' });
    expect(c).toMatchObject({ estado: 'aprobado', aprobado_por: 'u-jefe' });
    expect(c.aprobado_at).toBeTruthy();
    c = RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'en_ejecucion' });
    expect(c.inicio_real_at).toBeTruthy();
    expect(c.aprobacion_pendiente_hasta).toBeNull();
    c = RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'implementado', p_nota: ' Todo en orden ' });
    expect(c).toMatchObject({ estado: 'implementado', resultado: 'Todo en orden' });
    expect(c.fin_real_at).toBeTruthy();
    c = RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'cerrado' });
    expect(c.estado).toBe('cerrado');
    expect(eventos(db, c)).toEqual(['creado', 'solicitado', 'aprobado', 'iniciado', 'implementado', 'cerrado']);
    expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'cancelado', p_nota: 'tarde' })))
      .toMatchObject({ code: 'P0001', message: `El cambio ${c.codigo} (normal) no puede pasar de "cerrado" a "cancelado".` });
  });

  it('aprobar y rechazar son de un jefe: 42501 por la RPC de aprobar, P0001 por transicionar', () => {
    const db = base();
    const c = nuevo(db, { p_enviar: true });
    definirActorCambios({ id: 'u-asis-1', esJefe: false, email: 'dhuaman@materen.pe' });
    expect(rechazo(() => RPC.aprobar_cambio(db, { p_cambio_id: c.id }))).toMatchObject({ code: '42501', message: 'No autorizado' });
    expect(rechazo(() => RPC.rechazar_cambio(db, { p_cambio_id: c.id, p_motivo: 'No' }))).toMatchObject({ code: '42501' });
    expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'aprobado' })))
      .toMatchObject({ code: 'P0001', message: 'Solo un jefe puede aprobar o rechazar un cambio.' });
    // pero ejecutar, implementar y cerrar sí son de cualquiera con tickets
    definirActorCambios({ id: 'u-jefe', esJefe: true });
    RPC.aprobar_cambio(db, { p_cambio_id: c.id });
    definirActorCambios({ id: 'u-asis-1', esJefe: false });
    expect(RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'en_ejecucion' }).estado).toBe('en_ejecucion');
    expect(db.cambio_eventos.at(-1)).toMatchObject({ rol_actor: 'tecnico', user_id: 'u-asis-1' });
  });

  it('motivo obligatorio para rechazar, revertir y cancelar (salvo un borrador)', () => {
    const db = base();
    const pide = (c, destino, verbo) => expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: destino, p_nota: '  ' })))
      .toMatchObject({ code: 'P0001', message: `El motivo es obligatorio para ${verbo} un cambio.` });
    const c = nuevo(db, { p_enviar: true });
    pide(c, 'rechazado', 'rechazar');
    pide(c, 'cancelado', 'cancelar');
    expect(RPC.rechazar_cambio(db, { p_cambio_id: c.id, p_motivo: 'Ventana en cierre contable' })).toMatchObject({ estado: 'rechazado', resultado: 'Ventana en cierre contable' });
    const b = nuevo(db);
    expect(RPC.transicionar_cambio(db, { p_cambio_id: b.id, p_destino: 'cancelado' }).estado).toBe('cancelado');
    let r = nuevo(db, { p_enviar: true });
    RPC.aprobar_cambio(db, { p_cambio_id: r.id });
    RPC.transicionar_cambio(db, { p_cambio_id: r.id, p_destino: 'en_ejecucion' });
    pide(r, 'revertido', 'revertir');
    r = RPC.transicionar_cambio(db, { p_cambio_id: r.id, p_destino: 'revertido', p_nota: 'Degradó la red' });
    expect(r).toMatchObject({ estado: 'revertido', resultado: 'Degradó la red' });
  });

  it('la emergencia corre sin aprobación con plazo de 48 h, no cierra sin aprobar y la aprobación a posteriori limpia el aviso', () => {
    const db = base();
    let c = nuevo(db, { p_tipo: 'emergencia', p_riesgo: 'alto', p_ventana_inicio: null, p_ventana_fin: null });
    c = RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'en_ejecucion' });
    expect(c.aprobado_por).toBeNull();
    const horas = (new Date(c.aprobacion_pendiente_hasta).getTime() - Date.now()) / 3600000;
    expect(horas).toBeGreaterThan(47.9);
    expect(horas).toBeLessThanOrEqual(48);
    expect(db.cambio_eventos.at(-1).detalle).toMatch(/^Emergencia sin aprobación previa/);
    c = RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'implementado' });
    expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'cerrado' })))
      .toMatchObject({ code: 'P0001', message: 'Un cambio de emergencia no se cierra sin la aprobación a posteriori de un jefe (plazo de 48 horas).' });

    // pasado el plazo figura entre las vencidas
    c.aprobacion_pendiente_hasta = new Date(Date.now() - 3 * 3600000).toISOString();
    Object.assign(db, calcularVistasCambios(db.cambios, db.servicios));
    expect(db.v_cambios_aprobacion_vencida.map((v) => v.codigo)).toContain(c.codigo);
    expect(db.v_kpi_cambios.find((k) => k.tipo === 'emergencia').emergencias_sin_aprobar_vencidas).toBeGreaterThanOrEqual(2);

    c = RPC.aprobar_cambio(db, { p_cambio_id: c.id, p_nota: 'Se entiende la urgencia' });
    expect(c).toMatchObject({ estado: 'implementado', aprobado_por: 'u-jefe', aprobacion_pendiente_hasta: null });
    expect(db.v_cambios_aprobacion_vencida.map((v) => v.codigo)).not.toContain(c.codigo);
    expect(db.cambio_eventos.at(-1).detalle).toMatch(/^Aprobación a posteriori/);
    expect(RPC.transicionar_cambio(db, { p_cambio_id: c.id, p_destino: 'cerrado' }).estado).toBe('cerrado');
    // una aprobación fuera de lugar tiene su mensaje
    expect(rechazo(() => RPC.aprobar_cambio(db, { p_cambio_id: c.id }))).toMatchObject({ code: 'P0001', message: `El cambio ${c.codigo} está "cerrado": no admite aprobación.` });
  });

  it('solo la emergencia se ejecuta desde borrador; un normal no se salta la aprobación', () => {
    const db = base();
    const n = nuevo(db);
    expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: n.id, p_destino: 'en_ejecucion' })))
      .toMatchObject({ code: 'P0001', message: `El cambio ${n.codigo} (normal) no puede pasar de "borrador" a "en_ejecucion".` });
    expect(rechazo(() => RPC.transicionar_cambio(db, { p_cambio_id: n.id, p_destino: 'inventado' }))).toMatchObject({ message: 'El estado de destino no es válido.' });
    const e = nuevo(db, { p_tipo: 'emergencia' });
    expect(RPC.transicionar_cambio(db, { p_cambio_id: e.id, p_destino: 'en_ejecucion' }).estado).toBe('en_ejecucion');
  });
});

describe('enlace con tickets', () => {
  it('vincular es idempotente, deja un solo evento y desvincular devuelve true y luego false', () => {
    const db = base();
    const c = nuevo(db);
    const f = RPC.vincular_cambio_ticket(db, { p_cambio_id: c.id, p_ticket_id: 't107' });
    expect(f).toMatchObject({ cambio_id: c.id, ticket_id: 't107', vinculado_por: 'u-jefe' });
    RPC.vincular_cambio_ticket(db, { p_cambio_id: c.id, p_ticket_id: 't107' });
    expect(db.cambio_tickets.filter((x) => x.cambio_id === c.id)).toHaveLength(1);
    expect(eventos(db, c).filter((e) => e === 'ticket_vinculado')).toHaveLength(1);
    expect(RPC.desvincular_cambio_ticket(db, { p_cambio_id: c.id, p_ticket_id: 't107' })).toBe(true);
    expect(RPC.desvincular_cambio_ticket(db, { p_cambio_id: c.id, p_ticket_id: 't107' })).toBe(false);
    expect(rechazo(() => RPC.vincular_cambio_ticket(db, { p_cambio_id: c.id, p_ticket_id: 'no-existe' }))).toMatchObject({ code: 'P0002', message: 'El ticket no existe.' });
    expect(rechazo(() => RPC.vincular_cambio_ticket(db, { p_cambio_id: 'no-existe', p_ticket_id: 't107' }))).toMatchObject({ code: 'P0002' });
  });
});
