// Verificador de contraste WCAG para pares bg/text de main.css.
// Ejecutar: node scripts/contraste.mjs
// Actualizar CLARO/OSCURO si se tocan los tokens semánticos en
// frontend/src/styles/main.css. Umbral: 4.5:1 (WCAG AA texto normal).
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const num = parseInt(n, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminancia([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [f(r), f(g), f(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contraste(hex1, hex2) {
  const l1 = luminancia(hexToRgb(hex1));
  const l2 = luminancia(hexToRgb(hex2));
  const [claro, oscuro] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (oscuro + 0.05);
}

const CLARO = {
  success: { bg: '#e8f0e0', text: '#33552c' },
  warning: { bg: '#f7ecd6', text: '#7a4e0c' },
  danger:  { bg: '#f7e4de', text: '#8a3020' },
  info:    { bg: '#dfeaf5', text: '#215e85' },
  purple:  { bg: '#e7e3f5', text: '#4c3a85' },
  sky:     { bg: '#dcf0f4', text: '#1e6478' },
  teal:    { bg: '#dcf0e8', text: '#1f6b52' },
  neutral: { bg: '#eceadf', text: '#474d40' },
};

const OSCURO = {
  success: { bg: '#26301f', text: '#a8d18e' },
  warning: { bg: '#3a2c15', text: '#e0b566' },
  danger:  { bg: '#3a221c', text: '#e39a83' },
  info:    { bg: '#1c2c3a', text: '#82bce3' },
  purple:  { bg: '#26213a', text: '#b6a3e3' },
  sky:     { bg: '#1a2f33', text: '#7ecbe0' },
  teal:    { bg: '#1a332a', text: '#7ed9b8' },
  neutral: { bg: '#26281f', text: '#c2c7b5' },
};

function reportar(nombre, tabla) {
  console.log(`\n== ${nombre} ==`);
  let fallas = 0;
  for (const [familia, { bg, text }] of Object.entries(tabla)) {
    const ratio = contraste(bg, text);
    const ok = ratio >= 4.5;
    if (!ok) fallas++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${familia.padEnd(9)} bg=${bg} text=${text}  ratio=${ratio.toFixed(2)}:1${ok ? '' : '  <-- bajo 4.5:1'}`);
  }
  return fallas;
}

const f1 = reportar('TEMA CLARO', CLARO);
const f2 = reportar('TEMA OSCURO', OSCURO);
console.log(`\nTotal fallas: ${f1 + f2}`);
