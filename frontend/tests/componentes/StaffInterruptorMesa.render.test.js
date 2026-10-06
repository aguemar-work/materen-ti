// @vitest-environment happy-dom
//
// Interruptor «Mesa de ayuda» de Configuración › Staff (migración 118): el JEFE
// lo opera como un switch accesible; cualquier otro rol ve solo el texto (la
// barrera real es el trigger check_staff_tecnico_mesa, que responde 42501).
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StaffInterruptorMesa from '../../src/modules/staff/StaffInterruptorMesa.vue';

const MIEMBRO = { user_id: 'u1', nombre: 'José Soller', tecnico_mesa: true };

describe('StaffInterruptorMesa', () => {
  it('para el JEFE es un switch con su estado y nombre accesible, y emite el miembro al cambiar', async () => {
    const w = mount(StaffInterruptorMesa, { props: { miembro: MIEMBRO, editable: true } });
    const boton = w.find('button[role="switch"]');
    expect(boton.attributes('aria-checked')).toBe('true');
    expect(boton.attributes('aria-label')).toBe('Técnico de mesa de ayuda: José Soller');
    expect(boton.text()).toBe('Técnico');
    await boton.trigger('click');
    expect(w.emitted('cambiar')[0]).toEqual([MIEMBRO]);
  });

  it('mientras guarda queda deshabilitado', () => {
    const w = mount(StaffInterruptorMesa, { props: { miembro: { ...MIEMBRO, tecnico_mesa: false }, editable: true, ocupado: true } });
    expect(w.find('button').attributes('disabled')).toBeDefined();
    expect(w.find('button').attributes('aria-checked')).toBe('false');
  });

  it('sin permiso de edición no hay botón: solo el texto', () => {
    const w = mount(StaffInterruptorMesa, { props: { miembro: { ...MIEMBRO, tecnico_mesa: false } } });
    expect(w.find('button').exists()).toBe(false);
    expect(w.text()).toBe('No');
  });
});
