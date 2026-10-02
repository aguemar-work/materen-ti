// Dominio Cambios (migración 107): el espejo de la whitelist coincide con el SQL, las
// acciones que se ofrecen son las que el servidor aceptaría (por estado, tipo y rol),
// el plazo de 48 h de una emergencia, la línea de aprobación y el libro.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ESTADOS_CAMBIO, TIPOS_CAMBIO, RIESGOS_CAMBIO, CRITICIDADES_SERVICIO, ESTADOS_DE_VISTA, ESTADOS_TERMINALES_CAMBIO,
  TRANSICIONES_CAMBIO, SELLO_CAMBIO, MAX_SERVICIOS, estadoCambioInfo, tipoCambioInfo, riesgoCambioInfo,
  criticidadServicioInfo, estadosDeVista, accionesDeCambio, emergenciaSinAprobar, plazoAprobacion, textoAprobacion,
  textoVentana, fechaVentana, armarLibroCambio, localAISO, isoALocal, rotuloResultado, fechaCierreCambio,
  VISTA_CAMBIO_DEFECTO,
} from '../src/core/dominio-cambios.js';
import { esRango } from '../src/core/tagRol.js';

const SQL = readFileSync(fileURLToPath(new URL('../../migrations/107_servicios_y_cambios.sql', import.meta.url)), 'utf8');

describe('el espejo de transiciones coincide con la migración 107', () => {
  it('las 14 filas: origen, destino, tipos y solo_jefe', () => {
    const bloque = SQL.slice(SQL.indexOf('insert into public.transiciones_cambio_permitidas'), SQL.indexOf('on conflict (origen, destino) do update'));
    const re = /\('([a-z_]+)',\s*'([a-z_]+)',\s*array\[([^\]]*)\],\s*(true|false)\)/g;
    const filas = [...bloque.matchAll(re)].map(([, origen, destino, tipos, soloJefe]) => ({
      origen, destino, tipos: [...tipos.matchAll(/'([a-z]+)'/g)].map((m) => m[1]), soloJefe: soloJefe === 'true',
    }));
    expect(filas).toHaveLength(14);
    expect(TRANSICIONES_CAMBIO.map((t) => ({ ...t, tipos: [...t.tipos] }))).toEqual(filas);
  });

  it('los estados del dominio son los del CHECK de cambios.estado', () => {
    const check = SQL.match(/estado\s+text\s+not null default 'borrador'\s+check \(estado in \(([^)]*)\)\)/s)[1];
    const enSql = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(ESTADOS_CAMBIO).sort()).toEqual(enSql);
  });

  it('el tope de servicios y la criticidad coinciden con el SQL', () => {
    expect(SQL).toContain(`c_max constant integer := ${MAX_SERVICIOS};`);
    const check = SQL.match(/criticidad\s+text\s+not null default 'media'\s+check \(criticidad in \(([^)]*)\)\)/s)[1];
    expect(Object.keys(CRITICIDADES_SERVICIO)).toEqual([...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1]));
  });

  it('los terminales no tienen salida', () => {
    for (const t of ESTADOS_TERMINALES_CAMBIO) expect(TRANSICIONES_CAMBIO.some((x) => x.origen === t)).toBe(false);
    expect(Object.keys(SELLO_CAMBIO).sort()).toEqual([...ESTADOS_TERMINALES_CAMBIO].sort());
  });
});

describe('etiquetas y tonos', () => {
  it('cada estado, tipo, riesgo y criticidad tiene etiqueta y un valor desconocido no rompe', () => {
    expect(estadoCambioInfo('solicitado').label).toBe('Por aprobar');
    expect(estadoCambioInfo('en_ejecucion').label).toBe('En ejecución');
    expect(tipoCambioInfo('estandar').label).toBe('Estándar');
    expect(riesgoCambioInfo('alto').label).toBe('Alto');
    expect(criticidadServicioInfo('critica').label).toBe('Crítica');
    expect(estadoCambioInfo('raro')).toEqual({ label: 'raro', clase: 'badge--neutral' });
    for (const mapa of [TIPOS_CAMBIO, ESTADOS_CAMBIO]) for (const info of Object.values(mapa)) expect(info.label).toBeTruthy();
  });

  it('riesgo y criticidad se escriben como rango; los estados no (regla 24)', () => {
    for (const info of [...Object.values(RIESGOS_CAMBIO), ...Object.values(CRITICIDADES_SERVICIO)]) expect(esRango(info.clase)).toBe(true);
    for (const info of Object.values(ESTADOS_CAMBIO)) expect(esRango(info.clase)).toBe(false);
  });

  it('solo la emergencia, el riesgo alto y lo revertido van en rojo', () => {
    const rojos = (mapa) => Object.entries(mapa).filter(([, i]) => i.clase.includes('danger')).map(([k]) => k);
    expect(rojos(TIPOS_CAMBIO)).toEqual(['emergencia']);
    expect(rojos(RIESGOS_CAMBIO)).toEqual(['alto']);
    expect(rojos(ESTADOS_CAMBIO)).toEqual(['revertido']);
    expect(rojos(CRITICIDADES_SERVICIO)).toEqual(['critica']);
  });
});

describe('vistas del listado', () => {
  it('cada vista es un conjunto de estados; todos = sin filtro; una desconocida cae a la de defecto', () => {
    expect(VISTA_CAMBIO_DEFECTO).toBe('activos');
    expect(estadosDeVista('por_aprobar')).toEqual(['solicitado']);
    expect(estadosDeVista('todos')).toEqual([]);
    expect(estadosDeVista('inventada')).toEqual(ESTADOS_DE_VISTA.activos);
    // en curso + terminados cubren todos los estados, sin repetir
    const juntos = [...ESTADOS_DE_VISTA.activos, ...ESTADOS_DE_VISTA.cerrados].sort();
    expect(juntos).toEqual(Object.keys(ESTADOS_CAMBIO).sort());
  });
});

const cambio = (extra = {}) => ({
  id: 'c1', codigo: 'CHG-0001', tipo: 'normal', estado: 'borrador', aprobado_por: null, aprobacion_pendiente_hasta: null, ...extra,
});
const ids = (acciones) => acciones.map((a) => a.id);

describe('accionesDeCambio: solo lo que el servidor aceptaría', () => {
  const jefe = { esJefe: true, puedeTickets: true };
  const tecnico = { esJefe: false, puedeTickets: true };

  it('sin el módulo tickets, o sin cambio, no hay acciones', () => {
    expect(accionesDeCambio(cambio({ estado: 'solicitado' }), { esJefe: true, puedeTickets: false })).toEqual([]);
    expect(accionesDeCambio(null, jefe)).toEqual([]);
    expect(accionesDeCambio(cambio())).toEqual([]);
  });

  it('un cambio normal avanza borrador -> por aprobar -> aprobado -> en ejecución -> implementado -> cerrado', () => {
    expect(ids(accionesDeCambio(cambio(), tecnico))).toEqual(['transicionar:solicitado', 'transicionar:cancelado']);
    expect(ids(accionesDeCambio(cambio({ estado: 'aprobado' }), tecnico))).toEqual(['transicionar:en_ejecucion', 'transicionar:cancelado']);
    expect(ids(accionesDeCambio(cambio({ estado: 'en_ejecucion' }), tecnico))).toEqual(['transicionar:implementado', 'transicionar:revertido']);
    expect(ids(accionesDeCambio(cambio({ estado: 'implementado' }), tecnico))).toEqual(['transicionar:cerrado', 'transicionar:revertido']);
  });

  it('aprobar y rechazar son solo del jefe; un técnico solo puede cancelar el pedido', () => {
    const c = cambio({ estado: 'solicitado' });
    expect(ids(accionesDeCambio(c, tecnico))).toEqual(['transicionar:cancelado']);
    expect(ids(accionesDeCambio(c, jefe))).toEqual(['aprobar:aprobado', 'rechazar:rechazado', 'transicionar:cancelado']);
    const aprobar = accionesDeCambio(c, jefe)[0];
    expect(aprobar).toMatchObject({ via: 'aprobar', destino: 'aprobado', primaria: true, nota: 'opcional', peligro: false });
  });

  it('exactamente una acción primaria (el único botón sólido) y va primero', () => {
    for (const estado of ['borrador', 'solicitado', 'aprobado', 'en_ejecucion', 'implementado']) {
      for (const tipo of ['estandar', 'normal', 'emergencia']) {
        const a = accionesDeCambio(cambio({ estado, tipo }), jefe);
        expect(a.filter((x) => x.primaria).length, `${tipo}/${estado}`).toBe(1);
        expect(a[0].primaria).toBe(true);
      }
    }
  });

  it('rechazar, revertir y cancelar piden motivo; cancelar un borrador no', () => {
    const nota = (c, id) => accionesDeCambio(c, jefe).find((a) => a.id === id).nota;
    expect(nota(cambio({ estado: 'solicitado' }), 'rechazar:rechazado')).toBe('obligatoria');
    expect(nota(cambio({ estado: 'en_ejecucion' }), 'transicionar:revertido')).toBe('obligatoria');
    expect(nota(cambio({ estado: 'aprobado' }), 'transicionar:cancelado')).toBe('obligatoria');
    expect(nota(cambio({ estado: 'borrador' }), 'transicionar:cancelado')).toBeNull();
    expect(nota(cambio({ estado: 'en_ejecucion' }), 'transicionar:implementado')).toBe('opcional');
    for (const a of accionesDeCambio(cambio({ estado: 'solicitado' }), jefe)) {
      expect(a.peligro).toBe(['rechazar:rechazado', 'transicionar:cancelado'].includes(a.id));
    }
  });

  it('un cambio estándar se autoriza solo desde borrador, sin esperar a un jefe', () => {
    const a = accionesDeCambio(cambio({ tipo: 'estandar' }), tecnico);
    expect(ids(a)).toEqual(['transicionar:aprobado', 'transicionar:solicitado', 'transicionar:cancelado']);
    expect(a[0]).toMatchObject({ label: 'Autorizar (cambio estándar)', primaria: true });
    // un normal en borrador no puede saltar a aprobado ni a ejecución
    expect(ids(accionesDeCambio(cambio(), jefe))).not.toContain('transicionar:aprobado');
    expect(ids(accionesDeCambio(cambio(), jefe))).not.toContain('transicionar:en_ejecucion');
  });

  it('la emergencia se ejecuta sin aprobación, y sin aprobar no se cierra', () => {
    const borrador = accionesDeCambio(cambio({ tipo: 'emergencia' }), tecnico);
    expect(ids(borrador)).toEqual(['transicionar:solicitado', 'transicionar:en_ejecucion', 'transicionar:cancelado']);
    expect(borrador.find((a) => a.destino === 'en_ejecucion').label).toBe('Ejecutar sin esperar aprobación');
    expect(ids(accionesDeCambio(cambio({ tipo: 'emergencia', estado: 'solicitado' }), tecnico))).toContain('transicionar:en_ejecucion');

    const sinAprobar = cambio({ tipo: 'emergencia', estado: 'implementado' });
    expect(emergenciaSinAprobar(sinAprobar)).toBe(true);
    expect(ids(accionesDeCambio(sinAprobar, tecnico))).toEqual(['transicionar:revertido']);
    // el jefe ve ADEMÁS la aprobación a posteriori, que es la primaria
    const delJefe = accionesDeCambio(sinAprobar, jefe);
    expect(ids(delJefe)).toEqual(['aprobar:posteriori', 'transicionar:revertido']);
    expect(delJefe[0]).toMatchObject({ destino: null, via: 'aprobar', primaria: true });
    // aprobada, ya cierra
    const aprobada = cambio({ tipo: 'emergencia', estado: 'implementado', aprobado_por: 'u1' });
    expect(emergenciaSinAprobar(aprobada)).toBe(false);
    expect(ids(accionesDeCambio(aprobada, tecnico))).toEqual(['transicionar:cerrado', 'transicionar:revertido']);
  });

  it('en ejecución una emergencia sin aprobar ofrece implementar al técnico y, al jefe, aprobar primero', () => {
    const c = cambio({ tipo: 'emergencia', estado: 'en_ejecucion' });
    expect(ids(accionesDeCambio(c, tecnico))).toEqual(['transicionar:implementado', 'transicionar:revertido']);
    expect(ids(accionesDeCambio(c, jefe))).toEqual(['aprobar:posteriori', 'transicionar:implementado', 'transicionar:revertido']);
    expect(accionesDeCambio(c, jefe).filter((a) => a.primaria)).toHaveLength(1);
  });

  it('un estado terminal no ofrece nada', () => {
    for (const estado of ESTADOS_TERMINALES_CAMBIO) expect(accionesDeCambio(cambio({ estado }), jefe)).toEqual([]);
  });

  it('cada acción ofrecida es una fila de la whitelist (o la aprobación a posteriori)', () => {
    for (const tipo of ['estandar', 'normal', 'emergencia']) {
      for (const estado of Object.keys(ESTADOS_CAMBIO)) {
        for (const acciones of [accionesDeCambio(cambio({ tipo, estado }), jefe), accionesDeCambio(cambio({ tipo, estado }), tecnico)]) {
          for (const a of acciones.filter((x) => x.destino)) {
            expect(TRANSICIONES_CAMBIO.some((t) => t.origen === estado && t.destino === a.destino && t.tipos.includes(tipo)), `${tipo} ${estado}->${a.destino}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('plazo de aprobación de una emergencia', () => {
  const ahora = new Date('2026-10-02T12:00:00Z').getTime();
  const em = (horas) => cambio({ tipo: 'emergencia', estado: 'en_ejecucion', aprobacion_pendiente_hasta: new Date(ahora + horas * 3600000).toISOString() });

  it('cuenta las horas que faltan o que pasaron', () => {
    expect(plazoAprobacion(em(31), ahora)).toEqual({ vencida: false, horas: 31, texto: 'Vence en 31 horas' });
    expect(plazoAprobacion(em(1), ahora)).toMatchObject({ vencida: false, texto: 'Vence en 1 hora' });
    expect(plazoAprobacion(em(-5), ahora)).toEqual({ vencida: true, horas: 5, texto: 'Plazo vencido hace 5 horas' });
  });

  it('sin plazo, o ya aprobada, no hay nada que contar', () => {
    expect(plazoAprobacion(cambio(), ahora)).toBeNull();
    expect(plazoAprobacion({ ...em(3), aprobado_por: 'u1' }, ahora)).toBeNull();
    expect(plazoAprobacion(null, ahora)).toBeNull();
  });
});

describe('línea de aprobación y presentación', () => {
  const nombres = { u1: 'Alejandro Guevara' };

  it('textoAprobacion dice quién aprobó o por qué falta', () => {
    expect(textoAprobacion(cambio({ estado: 'aprobado', aprobado_por: 'u1', aprobado_at: '2026-10-02T15:00:00' }), nombres)).toBe('Alejandro Guevara · 02/10/26');
    expect(textoAprobacion(cambio({ estado: 'aprobado', aprobado_por: 'u9', aprobado_at: '2026-10-02T15:00:00' }))).toBe('Un jefe · 02/10/26');
    expect(textoAprobacion(cambio({ tipo: 'estandar', estado: 'aprobado' }))).toBe('Preautorizado (estándar)');
    expect(textoAprobacion(cambio({ estado: 'borrador' }))).toBe('Sin enviar');
    expect(textoAprobacion(cambio({ estado: 'solicitado' }))).toBe('Pendiente de un jefe');
    expect(textoAprobacion(cambio({ estado: 'rechazado' }))).toBe('Rechazado por un jefe');
    expect(textoAprobacion(cambio({ estado: 'cancelado' }))).toBe('No llegó a aprobarse');
    expect(textoAprobacion(null)).toBe('');
  });

  it('una emergencia aprobada después de empezar lo dice, y una pendiente cuenta las horas', () => {
    const a = cambio({
      tipo: 'emergencia', estado: 'cerrado', aprobado_por: 'u1', inicio_real_at: '2026-10-01T10:00:00.000Z', aprobado_at: '2026-10-01T18:00:00.000Z',
    });
    expect(textoAprobacion(a, nombres)).toContain('(a posteriori)');
    const p = cambio({ tipo: 'emergencia', estado: 'en_ejecucion', aprobacion_pendiente_hasta: new Date(Date.now() + 10 * 3600000).toISOString() });
    expect(textoAprobacion(p)).toMatch(/^Pendiente · Vence en (9|10) horas$/);
  });

  it('textoVentana: mismo día, varios días y sin ventana', () => {
    expect(textoVentana(null)).toBe('Sin ventana');
    expect(textoVentana(cambio())).toBe('Sin ventana');
    expect(textoVentana({ ventana_inicio: '2026-10-03T08:00:00', ventana_fin: '2026-10-03T10:30:00' })).toBe('03/10/26 08:00 a 10:30');
    expect(textoVentana({ ventana_inicio: '2026-10-03T22:00:00', ventana_fin: '2026-10-04T02:00:00' })).toBe('03/10/26 22:00 a 04/10/26 02:00');
    expect(fechaVentana({ ventana_inicio: '2026-10-03T08:00:00' })).toBe('03/10/26');
    expect(fechaVentana({})).toBe('');
  });

  it('fechaCierreCambio solo existe en estados terminales; rotuloResultado cambia con el estado', () => {
    expect(fechaCierreCambio(cambio({ estado: 'cerrado', updated_at: '2026-10-02T15:00:00' }))).toBe('02/10/26');
    expect(fechaCierreCambio(cambio({ estado: 'en_ejecucion', updated_at: '2026-10-02T15:00:00' }))).toBe('');
    expect(rotuloResultado('rechazado')).toBe('Motivo del rechazo');
    expect(rotuloResultado('cancelado')).toBe('Motivo de la cancelación');
    expect(rotuloResultado('revertido')).toBe('Por qué se revirtió');
    expect(rotuloResultado('cerrado')).toBe('Resultado');
  });

  it('datetime-local <-> ISO: ida y vuelta en hora local', () => {
    expect(localAISO('')).toBeNull();
    expect(localAISO('no es fecha')).toBeNull();
    const iso = localAISO('2026-10-03T08:00');
    expect(new Date(iso).getHours()).toBe(8);
    expect(isoALocal(iso)).toBe('2026-10-03T08:00');
    expect(isoALocal(null)).toBe('');
  });
});

describe('armarLibroCambio', () => {
  const eventos = [
    { id: 'a', orden: 1, evento: 'creado', created_at: '2026-10-01T09:00:00', user_id: 'u1', user_email: 'jefe@x.pe', rol_actor: 'jefe', detalle: 'Cambio normal · riesgo medio' },
    { id: 'b', orden: 2, evento: 'solicitado', created_at: '2026-10-01T09:00:00', user_id: 'u2', user_email: 'diego@x.pe', rol_actor: 'tecnico', detalle: null },
    { id: 'c', orden: 3, evento: 'aprobado', created_at: '2026-10-02T09:00:00', user_id: null, user_email: null, rol_actor: 'sistema', detalle: 'Cambio estándar: preautorizado' },
    { id: 'd', orden: 4, evento: 'ticket_vinculado', created_at: '2026-10-03T09:00:00', user_id: 'u9', user_email: 'otro@x.pe', rol_actor: 'tecnico', detalle: 'Ticket TCK-0007' },
  ];

  it('lo más reciente arriba; a igual instante, el de mayor orden primero', () => {
    const filas = armarLibroCambio(eventos, { nombresStaff: { u1: 'Alejandro Guevara' } });
    expect(filas.map((f) => f.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('el verbo en participio, el detalle y el autor (nombre, correo o Automático)', () => {
    const filas = Object.fromEntries(armarLibroCambio(eventos, { nombresStaff: { u1: 'Alejandro Guevara' } }).map((f) => [f.id, f]));
    expect(filas.a).toMatchObject({ movimiento: 'Registrado', detalle: 'Cambio normal · riesgo medio', por: 'Alejandro Guevara', fecha: '2026-10-01T09:00:00' });
    expect(filas.b).toMatchObject({ movimiento: 'Enviado a aprobación', detalle: '', por: 'diego@x.pe' });
    expect(filas.c).toMatchObject({ movimiento: 'Aprobado', por: 'Automático' });
    expect(filas.d).toMatchObject({ movimiento: 'Ticket enlazado', por: 'otro@x.pe' });
  });

  it('sin eventos, libro vacío; un evento desconocido conserva su nombre', () => {
    expect(armarLibroCambio()).toEqual([]);
    expect(armarLibroCambio([{ id: 'x', evento: 'raro', created_at: '2026-10-01T00:00:00' }])[0].movimiento).toBe('raro');
  });
});
