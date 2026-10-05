// Vocabulario y reglas de lectura de las Solicitudes de servicio (migración 108,
// core/dominio-solicitudes.js): estados con su tono, tipos, orígenes, avance de
// una solicitud, dónde se cumple cada paso y el libro de movimientos.
import { describe, it, expect } from 'vitest';
import {
  ESTADOS_SOLICITUD, ESTADOS_PASO, TIPOS_SOLICITUD, ORIGENES_SOLICITUD, OPCIONES_TIPO_CREABLE,
  OPCIONES_TIPO_SOLICITUD, OPCIONES_ORIGEN, DIAS_SOLICITUD_CRITICA, TIPOS_CRITICOS_SI_VIEJOS,
  estadoSolicitudInfo, estadoPasoInfo, tipoSolicitudInfo, origenSolicitudInfo,
  avanceSolicitud, textoAvance, siguientePaso, destinoPaso, armarLibroSolicitud,
} from '../src/core/dominio-solicitudes.js';
import { claseBadge, TONO_ESTADO_SOLICITUD, TONO_ESTADO_PASO } from '../src/core/tonos.js';
import { badgeInfo } from '../src/core/badges.js';

const paso = (orden, estado, extra = {}) => ({
  id: `p${orden}`, orden, clave: `c${orden}`, label: `Paso ${orden}`, obligatorio: true, estado, ...extra,
});

describe('estados y tonos', () => {
  it('cada estado de solicitud y de paso toma su clase del mapa único de tonos', () => {
    for (const [estado, tono] of Object.entries(TONO_ESTADO_SOLICITUD)) {
      expect(ESTADOS_SOLICITUD[estado].clase).toBe(claseBadge(tono));
      expect(badgeInfo('solicitud', estado).clase).toBe(claseBadge(tono));
    }
    for (const [estado, tono] of Object.entries(TONO_ESTADO_PASO)) {
      expect(ESTADOS_PASO[estado].clase).toBe(claseBadge(tono));
      expect(badgeInfo('paso_solicitud', estado).clase).toBe(claseBadge(tono));
    }
  });

  it('abierta = TI está trabajando, completada = ok, cancelada = neutro; un paso pendiente pide acción', () => {
    expect(TONO_ESTADO_SOLICITUD).toEqual({ abierta: 'trabajando', completada: 'ok', cancelada: 'neutro' });
    expect(TONO_ESTADO_PASO).toEqual({ pendiente: 'accion', hecho: 'ok', omitido: 'neutro' });
  });

  it('un valor desconocido cae a un estado neutro, sin romper', () => {
    expect(estadoSolicitudInfo('rara')).toEqual({ label: 'rara', clase: 'badge--neutral' });
    expect(estadoPasoInfo('rara')).toEqual({ label: 'rara', clase: 'badge--neutral' });
    expect(estadoSolicitudInfo('abierta').label).toBe('Abierta');
  });
});

describe('tipos y orígenes', () => {
  it('los 7 tipos del catálogo de la migración, con su módulo responsable', () => {
    expect(Object.keys(TIPOS_SOLICITUD)).toEqual([
      'alta_empleado', 'baja_empleado', 'cambio_puesto', 'acceso_nuevo', 'entrega_equipo', 'devolucion_equipo', 'licencia',
    ]);
    expect(TIPOS_SOLICITUD.entrega_equipo.modulo).toBe('equipos');
    expect(tipoSolicitudInfo('desconocido')).toMatchObject({ label: 'desconocido' });
  });

  it('el formulario no ofrece la baja (la crea «Dar de baja»), el filtro del listado sí', () => {
    expect(OPCIONES_TIPO_CREABLE.map((o) => o.valor)).not.toContain('baja_empleado');
    expect(OPCIONES_TIPO_CREABLE).toHaveLength(6);
    expect(OPCIONES_TIPO_SOLICITUD.map((o) => o.valor)).toContain('baja_empleado');
  });

  it('solo el alta admite una persona nueva; la devolución, también a un Inactivo', () => {
    const conPersonaNueva = Object.entries(TIPOS_SOLICITUD).filter(([, t]) => t.persona === 'nueva-o-activa');
    expect(conPersonaNueva.map(([id]) => id)).toEqual(['alta_empleado']);
    expect(TIPOS_SOLICITUD.devolucion_equipo.persona).toBe('cualquiera');
  });

  it('los orígenes que el formulario ofrece no incluyen los que pone el sistema', () => {
    expect(OPCIONES_ORIGEN.map((o) => o.valor)).toEqual(['rrhh_correo', 'jefe_directo', 'otro']);
    expect(OPCIONES_ORIGEN[0].label).toBe('Pedido de RRHH por correo');
    expect(Object.keys(ORIGENES_SOLICITUD)).toEqual(['rrhh_correo', 'jefe_directo', 'ticket', 'sistema', 'otro']);
    expect(origenSolicitudInfo('ticket')).toBe('Ticket');
    expect(origenSolicitudInfo('raro')).toBe('raro');
  });

  it('altas y bajas son las que se vuelven críticas con los días', () => {
    expect(DIAS_SOLICITUD_CRITICA).toBe(3);
    expect(TIPOS_CRITICOS_SI_VIEJOS).toEqual(['alta_empleado', 'baja_empleado']);
  });
});

describe('avance', () => {
  it('cuenta hechos y omitidos como resueltos y los obligatorios que faltan', () => {
    const a = avanceSolicitud([
      paso(1, 'hecho'), paso(2, 'omitido', { obligatorio: false }), paso(3, 'pendiente'), paso(4, 'pendiente', { obligatorio: false }),
    ]);
    expect(a).toEqual({ total: 4, resueltos: 2, pendientes: 2, hechos: 1, omitidos: 1, obligatoriosPendientes: 1 });
  });

  it('sin pasos (o sin lista) no rompe', () => {
    expect(avanceSolicitud([])).toMatchObject({ total: 0, resueltos: 0, obligatoriosPendientes: 0 });
    expect(avanceSolicitud(undefined).total).toBe(0);
    expect(avanceSolicitud(null).total).toBe(0);
  });

  it('el texto habla en singular con un solo paso y avisa cuando no hay pasos', () => {
    expect(textoAvance(avanceSolicitud([paso(1, 'hecho'), paso(2, 'pendiente'), paso(3, 'pendiente')]))).toBe('1 de 3 pasos');
    expect(textoAvance(avanceSolicitud([paso(1, 'pendiente')]))).toBe('0 de 1 paso');
    expect(textoAvance(avanceSolicitud([paso(1, 'hecho')]))).toBe('1 de 1 paso');
    expect(textoAvance(avanceSolicitud([]))).toBe('Sin pasos');
  });

  it('el siguiente paso es el primer pendiente por orden, aunque lleguen desordenados', () => {
    expect(siguientePaso([paso(3, 'pendiente'), paso(1, 'hecho'), paso(2, 'pendiente')]).id).toBe('p2');
    expect(siguientePaso([paso(1, 'hecho')])).toBeNull();
    expect(siguientePaso([])).toBeNull();
  });
});

describe('destinoPaso — dónde se cumple cada paso', () => {
  const ctx = { empleadoId: 'e1' };

  it('por defecto, el expediente de la persona (ahí están las cuentas, los equipos y las licencias que se le dan)', () => {
    for (const clave of ['crear_cuenta', 'entregar_credenciales', 'asignar_equipo', 'asignar_licencia', 'confirmar_recepcion', 'actualizar_datos']) {
      expect(destinoPaso({ clave }, ctx)).toMatchObject({ to: '/empleados/e1', modulo: 'empleados', texto: 'Abrir expediente' });
    }
  });

  it('rotar una contraseña lleva a Correos, ya filtrado por el usuario de la cuenta cuando se conoce', () => {
    expect(destinoPaso({ clave: 'rotar_contrasenas' }, { ...ctx, objetivo: { usuario: 'soporte@materen.pe' } }))
      .toMatchObject({ to: '/correos?q=soporte%40materen.pe', modulo: 'correos', texto: 'Abrir cuenta' });
    expect(destinoPaso({ clave: 'rotar_contrasenas' }, ctx).to).toBe('/correos');
  });

  it('recuperar un equipo lleva a su hoja de vida; sin saber cuál, al expediente', () => {
    expect(destinoPaso({ clave: 'devolver_equipo' }, { ...ctx, objetivo: { equipo_id: 'q7', codigo: 'LAP-1' } }))
      .toMatchObject({ to: '/equipos/q7', modulo: 'equipos', texto: 'Abrir equipo' });
    expect(destinoPaso({ clave: 'devolver_equipo' }, ctx).to).toBe('/empleados/e1');
  });

  it('activar una licencia lleva a Licencias', () => {
    expect(destinoPaso({ clave: 'activar_licencia' }, ctx)).toMatchObject({ to: '/licencias', modulo: 'licencias' });
  });
});

describe('armarLibroSolicitud — lo más reciente arriba', () => {
  const solicitud = (extra = {}) => ({
    id: 's1', codigo: 'SOL-0012', tipo_id: 'alta_empleado', origen: 'rrhh_correo', nota: 'Pedido del lunes',
    created_at: '2026-10-01T09:00:00', creada_por: 'u1', completada_at: null, cancelada_at: null, cancelada_por: null,
    motivo_cancelacion: '',
    pasos: [
      paso(1, 'hecho', { hecho_at: '2026-10-01T09:00:00', automatico: true, hecho_por: 'u1', label: 'Registrar a la persona' }),
      paso(2, 'hecho', { hecho_at: '2026-10-02T10:30:00', automatico: true, hecho_por: null, label: 'Entregar las credenciales', nota: '' }),
      paso(3, 'omitido', { hecho_at: '2026-10-02T11:00:00', hecho_por: 'u2', label: 'Asignar el equipo', motivo_omision: 'No usa equipo' }),
      paso(4, 'pendiente', { label: 'Confirmar' }),
    ],
    ...extra,
  });
  const nombres = { u1: 'Alejandro Guevara', u2: 'Diego Huamán' };

  it('abre con la apertura (tipo, origen y nota) y suma cada paso resuelto; los pendientes no aparecen', () => {
    const libro = armarLibroSolicitud(solicitud(), { nombresStaff: nombres });
    expect(libro.map((f) => f.movimiento)).toEqual(['Paso omitido', 'Paso hecho', 'Paso hecho', 'Abierta']);
    const abierta = libro.at(-1);
    expect(abierta.detalle).toBe('Alta de empleado · Pedido de RRHH por correo · Pedido del lunes');
    expect(abierta.por).toBe('Alejandro Guevara');
  });

  it('un paso omitido lleva su motivo; uno marcado sin sesión (la persona abrió su enlace) dice "Automático"', () => {
    const libro = armarLibroSolicitud(solicitud(), { nombresStaff: nombres });
    const omitido = libro.find((f) => f.movimiento === 'Paso omitido');
    expect(omitido).toMatchObject({ detalle: 'Asignar el equipo · No usa equipo', por: 'Diego Huamán' });
    const entrega = libro.find((f) => f.detalle.startsWith('Entregar'));
    expect(entrega.por).toBe('Automático');
  });

  it('completada y cancelada cierran el libro con su fecha y el motivo', () => {
    const completada = armarLibroSolicitud(solicitud({ completada_at: '2026-10-03T08:00:00' }), { nombresStaff: nombres });
    expect(completada[0]).toMatchObject({ movimiento: 'Completada', por: 'Automático' });
    const cancelada = armarLibroSolicitud(
      solicitud({ cancelada_at: '2026-10-03T08:00:00', cancelada_por: 'u2', motivo_cancelacion: 'Pedido duplicado' }),
      { nombresStaff: nombres },
    );
    expect(cancelada[0]).toMatchObject({ movimiento: 'Cancelada', detalle: 'Pedido duplicado', por: 'Diego Huamán' });
  });

  it('una solicitud del sistema (baja) sin actor se atribuye al sistema; sin solicitud, libro vacío', () => {
    const libro = armarLibroSolicitud(solicitud({ origen: 'sistema', creada_por: null }), { nombresStaff: nombres });
    expect(libro.at(-1).por).toBe('Sistema');
    expect(armarLibroSolicitud(null)).toEqual([]);
  });

  it('a igual instante, la apertura queda al final y el cierre arriba', () => {
    const mismo = '2026-10-01T09:00:00';
    const libro = armarLibroSolicitud(
      solicitud({ completada_at: mismo, pasos: [paso(1, 'hecho', { hecho_at: mismo, automatico: true })] }),
      { nombresStaff: nombres },
    );
    expect(libro.map((f) => f.movimiento)).toEqual(['Completada', 'Paso hecho', 'Abierta']);
  });
});
