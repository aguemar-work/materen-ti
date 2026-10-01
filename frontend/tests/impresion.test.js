// styles/impresion.css (regla 23, "imprimir es la misma hoja"). CSS no se
// puede renderizar en happy-dom, así que el test lee el archivo y fija lo que
// no puede perderse sin que alguien lo decida: el marco se oculta, la hoja es
// A4, el libro y los sellos y tags tienen su regla, y el archivo respeta las
// restricciones del dueño (sin variables nuevas, sin bordes laterales).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (ruta) => readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), 'utf8');
const css = leer('../src/styles/impresion.css');
const main = leer('../src/styles/main.css');
const layout = leer('../src/components/shared/AppLayout.vue');

// Sin comentarios: una frase del encabezado no cuenta como regla.
const reglas = css.replace(/\/\*[\s\S]*?\*\//g, '');
const bloque = (selector) => {
  const i = reglas.indexOf(selector);
  if (i === -1) return '';
  const abre = reglas.indexOf('{', i);
  return reglas.slice(abre + 1, reglas.indexOf('}', abre));
};

describe('impresion.css', () => {
  it('es un bloque @media print con la hoja a A4', () => {
    expect(reglas).toMatch(/@media\s+print\s*\{/);
    expect(reglas).toMatch(/@page\s*\{[^}]*size:\s*A4/);
  });

  it('oculta el sidebar (aside), la barra de la hoja (header) y [data-no-print]', () => {
    const oculta = bloque('[data-no-print]');
    expect(oculta).toMatch(/display:\s*none\s*!important/);
    const selectores = reglas.slice(reglas.indexOf('[data-no-print]'), reglas.indexOf('{', reglas.indexOf('[data-no-print]')));
    expect(selectores).toMatch(/\[data-marco\]\s*>\s*aside/);
    expect(selectores).toMatch(/\[data-hoja\]\s*>\s*header/);
  });

  it('el shell trae los ganchos que el CSS usa (data-marco / data-hoja)', () => {
    expect(layout).toMatch(/<div data-marco\b/);
    expect(layout).toMatch(/<div data-hoja\b/);
    // El aside y el header de la hoja son los hijos directos que se ocultan.
    expect(layout).toMatch(/<aside\b/);
    expect(layout).toMatch(/<header\b/);
  });

  it('la hoja pierde alto de pantalla, scroll propio, sombra y radio', () => {
    const hoja = bloque('[data-hoja],');
    expect(hoja).toMatch(/height:\s*auto/);
    expect(hoja).toMatch(/overflow:\s*visible/);
    expect(hoja).toMatch(/border-radius:\s*0/);
    expect(reglas).toMatch(/box-shadow:\s*none\s*!important/);
  });

  it('el azul se vuelve subrayado y texto oscuro', () => {
    expect(reglas).toMatch(/\[class\*="text-primary-"\]/);
    expect(bloque('a[href]')).toMatch(/text-decoration:\s*underline/);
  });

  it('el libro imprime como tabla de líneas finas con cabecera repetida', () => {
    expect(reglas).toMatch(/\[data-libro\]/);
    expect(bloque('[data-libro] {')).toMatch(/border-collapse:\s*collapse/);
    expect(bloque('[data-libro] thead')).toMatch(/table-header-group/);
    expect(bloque('[data-libro] th,')).toMatch(/border-bottom:\s*0?\.5pt solid/);
    expect(bloque('[data-libro] tr')).toMatch(/break-inside:\s*avoid/);
  });

  it('los sellos conservan el borde', () => {
    const sello = bloque('[data-sello]');
    expect(sello).toMatch(/border-style:\s*solid/);
    expect(sello).toMatch(/border-width:\s*1pt/);
    expect(sello).not.toMatch(/border:\s*(0|none)/);
  });

  it('los tags son texto con borde, sin fondo', () => {
    const tag = bloque('[data-tag]');
    expect(tag).toMatch(/background:\s*transparent/);
    expect(tag).toMatch(/border:\s*0?\.5pt solid/);
  });

  it('la carátula es la cabecera del documento', () => {
    expect(bloque('[data-caratula] {')).toMatch(/border-bottom:\s*0?\.75pt solid/);
  });

  it('usa la fuente de pantalla (Inter del bundle), no una propia', () => {
    expect(bloque('html,')).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(reglas).not.toMatch(/Arial|Helvetica|Times/i);
  });

  it('restricciones del dueño: sin variables nuevas, sin bordes laterales, sin degradados', () => {
    // No se declara ninguna custom property ni se toca el @theme.
    expect(reglas).not.toMatch(/(^|[;{\s])--[\w-]+\s*:/);
    expect(reglas).not.toMatch(/@theme/);
    expect(reglas).not.toMatch(/border-(left|right|inline)/);
    expect(reglas).not.toMatch(/gradient/);
  });

  it('main.css importa impresion.css sin sumar nada al @theme', () => {
    expect(main).toMatch(/@import\s+"\.\/impresion\.css";/);
    // Las únicas variables declaradas en main.css siguen siendo la rampa primary-* y --font-sans.
    const declaradas = [...main.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]);
    for (const v of declaradas) expect(v, v).toMatch(/^--(color-primary(-\d+)?|font-sans)$/);
  });
});
