// Invariantes estructurales de la UI, verificadas sobre el <template>.
//
// Tercer eje de los guardrails de diseño:
//   contraste.mjs        — el VALOR de un token cumple WCAG
//   tokens-vs-guia.mjs   — el NOMBRE de un token es coherente entre código,
//                          uso y documentación (+ referencias var() rotas)
//   literales-vs-tokens.mjs — un VALOR escrito a mano que debería ser token
//   patrones-ui.mjs      — la ESTRUCTURA del marcado respeta las reglas que
//                          el proyecto ya pagó caro por descubrir
//
// Las cuatro reglas de acá están HOY en verde. No son un cazador de bugs: son
// un trinquete. El ciclo del 2026-08-31 encontró 7 archivos con modales
// hechos a mano (uno sin ningún manejo de teclado ni foco) y 4 campos sin
// nombre accesible — los dos se corrigieron a mano, y nada impedía que
// volvieran. Esto lo impide.
//
// Ejecutar: node scripts/patrones-ui.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'frontend/src');

// Excepciones con el formato obligatorio del proyecto: motivo/alcance/impacto.
const EXCEPCIONES = [
  {
    archivo: 'components/shared/Modal.vue',
    reglas: ['modal-a-mano'],
    motivo: 'Es LA implementación del modal: centraliza role=dialog, aria-modal, foco atrapado y cierre con Escape.',
    alcance: 'El componente compartido.',
    impacto: 'Ninguno: es la fuente de la regla, no su excepción.',
  },
  {
    archivo: 'modules/styleLab/StyleLabView.vue',
    reglas: ['modal-a-mano', 'img-sin-alt', 'boton-icono-sin-nombre'],
    motivo: 'Vitrina del Design System: muestra el marcado crudo de los patrones como ejemplo.',
    alcance: 'Archivo completo. Ruta dev-only, fuera del router de producción.',
    impacto: 'Ninguno en producción.',
  },
  {
    archivo: 'modules/designSystem/DesignSystemView.vue',
    reglas: ['modal-a-mano', 'img-sin-alt', 'boton-icono-sin-nombre'],
    motivo: 'Misma razón que el Style Lab: documenta patrones mostrando su marcado.',
    alcance: 'Archivo completo. Ruta dev-only.',
    impacto: 'Ninguno en producción.',
  },
];

function archivos(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (extname(p) === '.vue') acc.push(p);
  }
  return acc;
}

// Solo el <template>: un `modal-bg` citado en un comentario de <style> (como
// hace BuscadorCombo.vue para explicar su z-index) no es un modal hecho a mano.
function plantilla(fuente) {
  const m = fuente.match(/<template>([\s\S]*)<\/template>/);
  if (!m) return '';
  return m[1].replace(/<!--[\s\S]*?-->/g, '');
}

function exceptuado(rel, regla) {
  return EXCEPCIONES.some((e) => rel.endsWith(e.archivo) && e.reglas.includes(regla));
}

const REGLAS = {
  'modal-a-mano': {
    titulo: 'Modal hecho a mano en vez del componente compartido',
    porque:
      'Un modal propio se salta role=dialog, aria-modal, el foco atrapado y el cierre con Escape. Es el hallazgo más serio del ciclo 2026-08-31 (7 archivos, 8 modales) y el mismo hueco que UX6-03.',
    arreglo: "Usar <Modal> de components/shared/Modal.vue.",
    buscar: (tpl) => (/class="[^"]*\bmodal-bg\b/.test(tpl) ? ['class="modal-bg"'] : []),
  },
  'img-sin-alt': {
    titulo: '<img> sin atributo alt',
    porque: 'Un lector de pantalla anuncia la URL del archivo, o nada.',
    arreglo: 'Agregar alt="" si es decorativa, o un alt descriptivo si no lo es.',
    buscar: (tpl) =>
      [...tpl.matchAll(/<img\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((t) => !/\s:?alt\s*=/.test(t)),
  },
  'th-sin-texto-visible': {
    titulo: 'Cabecera de columna sin texto visible',
    porque:
      'Un <th> cuyo único contenido es sr-only deja un hueco en blanco entre encabezados con texto y rompe la lectura de la fila. La regla del sistema (GUIA-UX-UI, "Reglas de tabla") es texto a la vista: el sr-only tampoco aporta al lector de pantalla, porque cada botón de la celda ya lleva su propio aria-label. El 2026-09-01 había 7 tablas con el header oculto y 7 con él visible — la misma columna, escrita de dos formas según el módulo.',
    arreglo: 'Reemplazar por <th scope="col">Acciones</th> (o el texto que corresponda).',
    buscar: (tpl) =>
      [...tpl.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
        .filter(([, cuerpo]) => {
          // Se quitan los <span class="sr-only">…</span> COMPLETOS (con su
          // texto). Si lo que sobra no tiene texto, el header no muestra nada
          // al usuario. Quitar solo las etiquetas dejaba el texto del sr-only
          // contando como visible — el bug que este propio check tuvo primero.
          const sinSrOnly = cuerpo.replace(/<span[^>]*class="sr-only"[^>]*>[\s\S]*?<\/span>/g, '');
          return /class="sr-only"/.test(cuerpo) && sinSrOnly.replace(/<[^>]*>/g, '').trim() === '';
        })
        .map(([t]) => t.replace(/\s+/g, ' ').slice(0, 90)),
  },
  'boton-icono-sin-nombre': {
    titulo: 'Botón solo-ícono sin nombre accesible',
    porque:
      'Un <button> cuyo único contenido es un <i> decorativo no tiene texto que anunciar. El ciclo 2026-08-31 encontró 4 casos equivalentes en campos de alta rápida.',
    arreglo: 'Agregar aria-label (o title, si además debe verse al pasar el cursor).',
    buscar: (tpl) =>
      [...tpl.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)]
        .filter(([, attrs, cuerpo]) => {
          const soloIconos = cuerpo.replace(/<i\b[^>]*>[\s\S]*?<\/i>/g, '').replace(/<i\b[^>]*\/>/g, '').trim();
          if (soloIconos !== '' || !/<i\b/.test(cuerpo)) return false;
          return !/\s:?(aria-label|title)\s*=/.test(attrs) && !/v-bind=/.test(attrs);
        })
        .map(([t]) => t.replace(/\s+/g, ' ').slice(0, 90)),
  },
};

let fallas = 0;
for (const [id, regla] of Object.entries(REGLAS)) {
  const hallazgos = [];
  for (const f of archivos(SRC)) {
    const rel = relative(SRC, f).split(String.fromCharCode(92)).join('/');
    if (exceptuado(rel, id)) continue;
    for (const h of regla.buscar(plantilla(readFileSync(f, 'utf8')))) {
      hallazgos.push({ rel, h });
    }
  }
  console.log(`\n== ${regla.titulo} (${hallazgos.length}) ==`);
  if (hallazgos.length === 0) {
    console.log('   sin hallazgos');
  } else {
    fallas += hallazgos.length;
    console.log(`   Por qué importa: ${regla.porque}`);
    console.log(`   Arreglo: ${regla.arreglo}`);
    for (const { rel, h } of hallazgos) console.log(`   ✗ ${rel}\n       ${h}`);
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Reglas verificadas: ${Object.keys(REGLAS).length} · excepciones declaradas: ${EXCEPCIONES.length}`);
console.log(`Fallas: ${fallas}`);
process.exit(fallas > 0 ? 1 : 0);
