// Lee los tokens de color/espaciado/tipografía REALMENTE declarados en
// main.css — no copia ni hardcodea ningún valor acá. Parsea las reglas
// `:root` y `[data-theme="dark"]` directo del CSSOM (document.styleSheets)
// y resuelve las cadenas `var(--x)` para mostrar el valor final. Si alguien
// cambia un valor en main.css, esta lectura cambia sola en el próximo
// render — es una verificación cruzada contra el código real, no una copia
// que se pueda desincronizar.

function propiedadesDe(selector) {
  const props = {};
  for (const hoja of document.styleSheets) {
    let reglas;
    try {
      reglas = hoja.cssRules;
    } catch {
      continue; // hoja de otro origen (ej. fuente externa) — no se puede leer, se ignora
    }
    if (!reglas) continue;
    for (const regla of reglas) {
      if (regla.selectorText === selector && regla.style) {
        for (const nombre of regla.style) {
          if (nombre.startsWith('--')) props[nombre] = regla.style.getPropertyValue(nombre).trim();
        }
      }
    }
  }
  return props;
}

function resolverVar(valor, mapa, profundidad = 0) {
  if (profundidad > 8 || typeof valor !== 'string') return valor;
  const m = valor.match(/^var\((--[a-zA-Z0-9-]+)\)$/);
  if (!m) return valor;
  const siguiente = mapa[m[1]];
  if (siguiente === undefined) return valor; // referencia a algo no declarado en este mapa
  return resolverVar(siguiente, mapa, profundidad + 1);
}

function resolverMapa(mapa) {
  const resuelto = {};
  for (const nombre of Object.keys(mapa)) resuelto[nombre] = resolverVar(mapa[nombre], mapa);
  return resuelto;
}

let cache = null;

// { claroDeclarado, oscuroDeclarado (solo overrides), claro, oscuro }
// claro/oscuro ya vienen con las cadenas var() resueltas al valor final.
export function leerTokensReales() {
  if (cache) return cache;
  const claroDeclarado = propiedadesDe(':root');
  const oscuroDeclarado = propiedadesDe('[data-theme="dark"]');
  const oscuroMerge = { ...claroDeclarado, ...oscuroDeclarado };

  cache = {
    claroDeclarado,
    oscuroDeclarado,
    claro: resolverMapa(claroDeclarado),
    oscuro: resolverMapa(oscuroMerge),
  };
  return cache;
}

// Agrupa por familia usando el propio nombre de variable (no su valor) —
// si main.css agrega un token nuevo que matchea alguno de estos patrones,
// aparece solo, sin tocar este archivo.
const FAMILIAS_COLOR = [
  { clave: 'brand', etiqueta: 'Marca / acento', patron: /brand|accent/ },
  { clave: 'social', etiqueta: 'Social (WhatsApp)', patron: /whatsapp/ },
  { clave: 'success', etiqueta: 'Éxito', patron: /success/ },
  { clave: 'warning', etiqueta: 'Advertencia', patron: /warning/ },
  { clave: 'danger', etiqueta: 'Peligro', patron: /danger/ },
  { clave: 'info', etiqueta: 'Información', patron: /info/ },
  { clave: 'neutral', etiqueta: 'Neutral', patron: /neutral/ },
  { clave: 'categoric', etiqueta: 'Categóricas (dominio)', patron: /purple|sky|teal/ },
  { clave: 'text', etiqueta: 'Texto', patron: /color-text/ },
  { clave: 'bg', etiqueta: 'Superficies (fondo)', patron: /color-bg/ },
  { clave: 'border', etiqueta: 'Bordes / anillo de foco', patron: /border|ring/ },
];

export function paletaPorFamilia() {
  const { claro, oscuro } = leerTokensReales();
  const nombresColor = Object.keys(claro).filter((n) => n.startsWith('--'));
  const familias = FAMILIAS_COLOR.map((f) => ({ ...f, tokens: [] }));
  const otros = [];

  for (const nombre of nombresColor) {
    // Solo color: se excluyen tipografía/espaciado/radios/z-index, que se
    // muestran en sus propias secciones.
    if (/^--(fs|font|space|radius|shadow|scroll)/.test(nombre) || nombre === '--header-h') continue;
    if (/^--z-/.test(nombre)) continue;
    const familia = familias.find((f) => f.patron.test(nombre));
    const destino = familia ? familia.tokens : otros;
    destino.push({ nombre, claro: claro[nombre], oscuro: oscuro[nombre] });
  }

  const resultado = familias.filter((f) => f.tokens.length);
  if (otros.length) resultado.push({ clave: 'otros', etiqueta: 'Otros', tokens: otros });
  return resultado;
}

export function escalaEspaciado() {
  const { claro } = leerTokensReales();
  return Object.keys(claro)
    .filter((n) => /^--space-\d+$/.test(n))
    .sort((a, b) => Number(a.match(/\d+$/)[0]) - Number(b.match(/\d+$/)[0]))
    .map((nombre) => ({ nombre, valor: claro[nombre] }));
}

// Los 5 pasos del type set productivo de Carbon, en orden de tamano
// (2026-09-02). Antes eran los 8 pasos de la escala propia
// (xs/sm/base/md/lg/xl/2xl/stat); dejarlos habria mandado los cinco
// nombres nuevos al indice 99 y la vitrina los listaria en el orden
// arbitrario en que el CSSOM los devuelve.
const ORDEN_FS = ['label-01', 'body-01', 'heading-02', 'heading-03', 'heading-05'];

export function escalaTipografica() {
  const { claro } = leerTokensReales();
  return Object.keys(claro)
    .filter((n) => /^--fs-/.test(n))
    .map((nombre) => ({ nombre, valor: claro[nombre] }))
    .sort((a, b) => {
      const ca = ORDEN_FS.indexOf(a.nombre.replace('--fs-', ''));
      const cb = ORDEN_FS.indexOf(b.nombre.replace('--fs-', ''));
      return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb);
    });
}

// Con Carbon la geometria es UN radio y vale 0 (--radius-base): ya no hay
// escala de la que elegir un paso, asi que tampoco hay orden que imponer.
// Se conserva la funcion —la vitrina sigue mostrando el token, que es
// informacion util— pero sin la lista de ordenamiento de los 5 pasos
// retirados, que dejaba de ordenar nada.
export function escalaRadios() {
  const { claro } = leerTokensReales();
  return Object.keys(claro)
    .filter((n) => /^--radius-/.test(n))
    .sort()
    .map((nombre) => ({ nombre, valor: claro[nombre] }));
}

// Aplica el snapshot completo de :root (+ overrides de oscuro si corresponde)
// como custom properties inline sobre `el`, para forzar un tema en las
// secciones de "preview en vivo" sin depender del data-theme ambiente del
// resto de la app (que puede ya estar en oscuro por la preferencia real del
// usuario). Sigue leyendo de los mismos mapas ya parseados, nada hardcodeado.
export function forzarTemaEn(el, tema) {
  if (!el) return;
  const { claroDeclarado, oscuroDeclarado } = leerTokensReales();
  for (const [nombre, valor] of Object.entries(claroDeclarado)) el.style.setProperty(nombre, valor);
  if (tema === 'dark') {
    for (const [nombre, valor] of Object.entries(oscuroDeclarado)) el.style.setProperty(nombre, valor);
  }
}
