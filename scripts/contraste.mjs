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
  success: { bg: '#E6F7F1', text: '#157955' },
  warning: { bg: '#FBF0DC', text: '#845A0E' },
  danger:  { bg: '#FAEAE3', text: '#963D28' },
  info:    { bg: '#E7EAF7', text: '#3B4FA0' },
  purple:  { bg: '#EDE8F5', text: '#534878' },
  sky:     { bg: '#E5F2F0', text: '#256B7A' },
  teal:    { bg: '#E1EEF5', text: '#1D5C8A' },
  neutral: { bg: '#EFF1F3', text: '#525862' },
  // No es un badge semántico: --mat-color-text-tertiary sobre
  // --mat-color-bg-elevated, el par más ajustado de la jerarquía de texto.
  textoTerciario: { bg: '#FFFFFF', text: '#697281' },
};

// Oscuro: los -bg semánticos son rgba(); acá van pre-compuestos sobre
// --mat-color-bg-elevated (#16181B), la superficie donde viven los badges.
const OSCURO = {
  success: { bg: '#1A2E2A', text: '#6EE7B7' },
  warning: { bg: '#2E2719', text: '#E8C878' },
  danger:  { bg: '#2F2120', text: '#E88870' },
  info:    { bg: '#1C2130', text: '#9CAAE2' },
  purple:  { bg: '#21212C', text: '#B8A8E8' },
  sky:     { bg: '#18252A', text: '#7ECBE0' },
  teal:    { bg: '#17232D', text: '#81BBE4' },
  neutral: { bg: '#24282D', text: '#9CA3AF' },
  // --mat-color-text-tertiary sobre --mat-color-bg-elevated real (no
  // precompuesto): ambos son hex sólidos, sin alfa de por medio.
  textoTerciario: { bg: '#16202B', text: '#818A96' },
};

// Bordes de controles interactivos (G5, WCAG 1.4.11 — umbral 3:1, no 4.5:1:
// no son texto, son el límite de un componente que sí debe distinguirse del
// fondo por sí solo). bg-elevated en ambos temas: input/select/textarea/
// botón secundario viven sobre esa superficie, nunca sobre --color-bg.
const BORDES = {
  claroDefault:  { bg: '#FFFFFF', text: '#7E96A3' },
  claroStrong:   { bg: '#FFFFFF', text: '#526A7B' },
  oscuroDefault: { bg: '#16202B', text: '#5A6E7E' },
  oscuroStrong:  { bg: '#16202B', text: '#7B93A3' },
};

function reportar(nombre, tabla, umbral = 4.5) {
  console.log(`\n== ${nombre} ==`);
  let fallas = 0;
  for (const [familia, { bg, text }] of Object.entries(tabla)) {
    const ratio = contraste(bg, text);
    const ok = ratio >= umbral;
    if (!ok) fallas++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${familia.padEnd(13)} bg=${bg} text=${text}  ratio=${ratio.toFixed(2)}:1${ok ? '' : `  <-- bajo ${umbral}:1`}`);
  }
  return fallas;
}

const f1 = reportar('TEMA CLARO', CLARO);
const f2 = reportar('TEMA OSCURO', OSCURO);
const f3 = reportar('BORDES DE CONTROLES (umbral 3:1, WCAG 1.4.11)', BORDES, 3.0);
console.log(`\nTotal fallas: ${f1 + f2 + f3}`);
