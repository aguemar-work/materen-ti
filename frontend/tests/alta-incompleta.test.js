// Regla de "alta incompleta" (core/dominio-empleados.js).
//
// Es la condición que decide si una persona aparece en el feed de pendientes
// del Dashboard. Un falso positivo acá no es cosmético: llena la cola del día
// de avisos que no hay que atender, y una cola con ruido deja de leerse — que
// es exactamente lo que le pasó al backlog por antigüedad de Tickets, retirado
// por no aportar señal (docs/PANORAMA-SISTEMA.md §6).

import { describe, it, expect } from 'vitest';
import {
  altaIncompleta,
  DIAS_VENTANA_ALTA,
  pasosAlta,
  altaLista,
} from '../src/core/dominio-empleados.js';

const HOY = '2026-09-01';
const SIN_NADA = { cuentas: 0, equipos: 0, licencias: 0 };

function empleado(extra = {}) {
  return { estado: 'Activo', fecha_alta: '2026-08-28', ...extra };
}

describe('altaIncompleta — cuándo marca', () => {
  it('marca a quien entró hace poco, está activo y no tiene ninguna cuenta', () => {
    const r = altaIncompleta(empleado(), SIN_NADA, HOY);
    expect(r).not.toBeNull();
    expect(r.diasDesdeAlta).toBe(4);
    expect(r.faltan).toEqual(['cuenta']);
  });

  it('marca también el mismo día del alta', () => {
    expect(altaIncompleta(empleado({ fecha_alta: HOY }), SIN_NADA, HOY)).toEqual({
      diasDesdeAlta: 0,
      faltan: ['cuenta'],
    });
  });

  it('marca en el último día de la ventana, y ya no al siguiente', () => {
    const borde = empleado({ fecha_alta: '2026-08-02' }); // 30 días
    expect(altaIncompleta(borde, SIN_NADA, HOY)).not.toBeNull();
    const pasado = empleado({ fecha_alta: '2026-08-01' }); // 31
    expect(altaIncompleta(pasado, SIN_NADA, HOY)).toBeNull();
  });

  it('tolera una fecha_alta con hora incluida', () => {
    const conHora = empleado({ fecha_alta: '2026-08-28T14:30:00.000Z' });
    expect(altaIncompleta(conHora, SIN_NADA, HOY)?.diasDesdeAlta).toBe(4);
  });
});

describe('altaIncompleta — cuándo NO marca', () => {
  it('no marca si ya tiene una cuenta', () => {
    expect(altaIncompleta(empleado(), { ...SIN_NADA, cuentas: 1 }, HOY)).toBeNull();
  });

  it('NO exige equipo ni licencia', () => {
    // Depende del cargo: mucha gente de campo no lleva equipo asignado ni
    // licencia. Exigirlos marcaría media planilla y volvería el aviso ruido.
    const soloCuenta = { cuentas: 1, equipos: 0, licencias: 0 };
    expect(altaIncompleta(empleado(), soloCuenta, HOY)).toBeNull();
  });

  it('no marca a quien ya no está activo', () => {
    for (const estado of ['Inactivo', 'Suspendido']) {
      expect(altaIncompleta(empleado({ estado }), SIN_NADA, HOY)).toBeNull();
    }
  });

  it('no marca un alta con fecha futura: esa persona todavía no entró', () => {
    expect(altaIncompleta(empleado({ fecha_alta: '2026-09-15' }), SIN_NADA, HOY)).toBeNull();
  });

  it('no marca ni revienta sin fecha_alta', () => {
    expect(altaIncompleta(empleado({ fecha_alta: null }), SIN_NADA, HOY)).toBeNull();
    expect(altaIncompleta(empleado({ fecha_alta: '' }), SIN_NADA, HOY)).toBeNull();
  });

  it('no revienta con entradas ausentes', () => {
    expect(altaIncompleta(null, SIN_NADA, HOY)).toBeNull();
    expect(altaIncompleta(undefined, undefined, HOY)).toBeNull();
    // Sin conteos, "no sabemos" se trata como "no tiene": el empleado se
    // marca, que es el lado seguro — es peor perder un alta a medias que
    // mostrar una fila de más.
    expect(altaIncompleta(empleado(), undefined, HOY)).not.toBeNull();
  });

  it('no marca con una fecha_alta ilegible', () => {
    expect(altaIncompleta(empleado({ fecha_alta: 'ayer' }), SIN_NADA, HOY)).toBeNull();
  });
});

describe('altaIncompleta — la ventana es explícita', () => {
  it('DIAS_VENTANA_ALTA se exporta para que nadie la reinvente', () => {
    expect(DIAS_VENTANA_ALTA).toBe(30);
  });
});

describe('pasosAlta — qué hace falta para poder empezar a trabajar', () => {
  it('sin nada: registro hecho, los otros cuatro pendientes', () => {
    const p = pasosAlta({ cuentas: 0, equipos: 0, licencias: 0 });
    expect(p.map((x) => x.id)).toEqual(['registro', 'cuenta', 'entrega', 'equipo', 'licencia']);
    expect(p.map((x) => x.hecho)).toEqual([true, false, false, false, false]);
  });

  it('cuenta y entrega son requisito; equipo y licencia se ofrecen, no se exigen', () => {
    const p = pasosAlta();
    const requeridos = p.filter((x) => x.requisito).map((x) => x.id);
    expect(requeridos).toEqual(['registro', 'cuenta', 'entrega']);
  });

  it('cada paso accionable trae la etiqueta de su botón', () => {
    const p = pasosAlta();
    expect(p.find((x) => x.id === 'cuenta').accion).toBe('Crear cuenta');
    expect(p.find((x) => x.id === 'entrega').accion).toBe('Enviar por WhatsApp');
    expect(p.find((x) => x.id === 'equipo').accion).toBe('Entregar');
    expect(p.find((x) => x.id === 'licencia').accion).toBe('Asignar');
    // "Registrada" ya está hecho por definición: no ofrece acción.
    expect(p.find((x) => x.id === 'registro').accion).toBeUndefined();
  });

  it('marca hecho cada paso según lo que la persona ya tiene', () => {
    const p = pasosAlta({ cuentas: 1, equipos: 2, licencias: 0, entregaEnviada: true });
    expect(p.find((x) => x.id === 'cuenta').hecho).toBe(true);
    expect(p.find((x) => x.id === 'entrega').hecho).toBe(true);
    expect(p.find((x) => x.id === 'equipo').hecho).toBe(true);
    expect(p.find((x) => x.id === 'licencia').hecho).toBe(false);
  });

  it('entrega no cuenta como hecha sin una cuenta que enviar, aunque el flag venga en true', () => {
    // No debería poder pasar desde la UI (el botón no se ofrece sin cuenta),
    // pero la regla de negocio no debe confiar en que el cliente se porte bien.
    const p = pasosAlta({ cuentas: 0, entregaEnviada: true });
    expect(p.find((x) => x.id === 'entrega').hecho).toBe(false);
  });

  it('sin argumentos no revienta: trata todo como cero', () => {
    expect(pasosAlta().map((x) => x.hecho)).toEqual([true, false, false, false, false]);
  });
});

describe('altaLista — cuándo se puede dar por terminada', () => {
  it('no está lista mientras falte la cuenta', () => {
    expect(altaLista(pasosAlta({ cuentas: 0, equipos: 5, licencias: 5 }))).toBe(false);
  });

  it('no está lista con la cuenta creada si todavía no se le entregó', () => {
    // Crear la cuenta no es lo mismo que el empleado ya la conozca — ver
    // el comentario de `entrega` en dominio-empleados.js.
    expect(altaLista(pasosAlta({ cuentas: 1, equipos: 0, licencias: 0 }))).toBe(false);
  });

  it('está lista con la cuenta entregada, aunque falten equipo y licencia', () => {
    // Es el caso de casi todo el personal de campo: cuenta sí, equipo no.
    expect(altaLista(pasosAlta({ cuentas: 1, equipos: 0, licencias: 0, entregaEnviada: true }))).toBe(true);
  });

  it('sigue lista con todo completo', () => {
    expect(altaLista(pasosAlta({ cuentas: 1, equipos: 1, licencias: 1, entregaEnviada: true }))).toBe(true);
  });
});
