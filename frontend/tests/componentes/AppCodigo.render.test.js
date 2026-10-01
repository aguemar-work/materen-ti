// @vitest-environment happy-dom
//
// AppCodigo (regla 14): el identificador es el nombre del expediente. El test
// fija el contrato visible: prefijo gris + dígitos oscuros, Inter con
// tabular-nums (nunca font-mono) y un title siempre presente.
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AppCodigo from '../../src/components/ui/AppCodigo.vue';
import { partesCodigo } from '../../src/core/codigo.js';

describe('partesCodigo', () => {
  it('separa el prefijo alfabético y su separador de la parte numérica', () => {
    expect(partesCodigo('TCK-0281')).toEqual({ prefijo: 'TCK-', numero: '0281' });
    expect(partesCodigo('LAP-0142')).toEqual({ prefijo: 'LAP-', numero: '0142' });
    expect(partesCodigo('A-00231')).toEqual({ prefijo: 'A-', numero: '00231' });
    expect(partesCodigo('SOL 0012')).toEqual({ prefijo: 'SOL ', numero: '0012' });
  });

  it('un valor sin prefijo alfabético va entero (DNI, serie, usuario)', () => {
    expect(partesCodigo('45678912')).toEqual({ prefijo: '', numero: '45678912' });
    expect(partesCodigo('5CD1234XYZ')).toEqual({ prefijo: '', numero: '5CD1234XYZ' });
    expect(partesCodigo('jquispe@materen.pe')).toEqual({ prefijo: '', numero: 'jquispe@materen.pe' });
  });

  it('prefijo explícito: se antepone si el valor no lo trae, se respeta si lo trae', () => {
    expect(partesCodigo('0281', 'TCK')).toEqual({ prefijo: 'TCK-', numero: '0281' });
    expect(partesCodigo('TCK-0281', 'TCK')).toEqual({ prefijo: 'TCK-', numero: '0281' });
    expect(partesCodigo(281, 'tck')).toEqual({ prefijo: 'tck-', numero: '281' });
  });

  it('vacío', () => {
    expect(partesCodigo('')).toEqual({ prefijo: '', numero: '' });
    expect(partesCodigo(null)).toEqual({ prefijo: '', numero: '' });
  });
});

describe('AppCodigo.vue', () => {
  const montar = (props) => mount(AppCodigo, { props });

  it('prefijo y separador en gray-500, dígitos en gray-900', () => {
    const w = montar({ valor: 'TCK-0281' });
    const partes = [...w.element.children];
    expect(partes).toHaveLength(2);
    expect(partes[0].textContent).toBe('TCK-');
    expect(partes[0].classList.contains('text-gray-500')).toBe(true);
    expect(partes[1].textContent).toBe('0281');
    expect(partes[1].classList.contains('text-gray-900')).toBe(true);
  });

  it('el texto completo se lee seguido, sin espacios intermedios', () => {
    expect(montar({ valor: 'LAP-0142' }).text()).toBe('LAP-0142');
  });

  it('Inter font-medium tabular-nums, nunca font-mono', () => {
    const raiz = montar({ valor: 'TCK-0281' }).get('[data-codigo]');
    expect(raiz.classes()).toEqual(expect.arrayContaining(['font-medium', 'tabular-nums']));
    expect(raiz.html()).not.toContain('font-mono');
  });

  it('title accesible: el nombre del dato, o el propio código si no se da', () => {
    expect(montar({ valor: 'TCK-0281', titulo: 'Número de ticket' }).get('[data-codigo]').attributes('title')).toBe('Número de ticket');
    expect(montar({ valor: 'TCK-0281' }).get('[data-codigo]').attributes('title')).toBe('TCK-0281');
  });

  it('un DNI no lleva prefijo: un solo tramo oscuro', () => {
    const w = montar({ valor: '45678912', titulo: 'DNI' });
    expect(w.text()).toBe('45678912');
    expect(w.find('.text-gray-500').exists()).toBe(false);
    expect(w.get('.text-gray-900').text()).toBe('45678912');
  });

  it('prefijo por prop cuando el valor viene sin él', () => {
    expect(montar({ valor: '0281', prefijo: 'TCK' }).text()).toBe('TCK-0281');
  });

  it('acepta un número', () => {
    expect(montar({ valor: 281, prefijo: 'TCK' }).text()).toBe('TCK-281');
  });

  it('sin valor: "Sin registrar" en gris, nunca un hueco', () => {
    const w = montar({ valor: '' });
    expect(w.text()).toBe('Sin registrar');
    expect(w.classes()).toContain('text-gray-500');
    expect(w.find('[data-codigo]').exists()).toBe(false);
  });
});
