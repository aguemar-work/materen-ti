// Reglas de scripts/patrones-ui.mjs (Versión Expediente, plan Ciclo 21 §3.5).
//
// El script es un trinquete: si una regla dejara de detectar su patrón, nada
// avisaría y el árbol volvería a llenarse de lo que se retiró. Cada regla se
// prueba con un caso que DEBE detectar y uno parecido que NO debe (el falso
// positivo que la regla documenta), llamando a `analizar()` con un .vue
// sintético — sin tocar el disco ni la línea base.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analizar, REGLAS, EXCEPCIONES, etiquetas, clasesDe } from '../../scripts/patrones-ui.mjs';

const REL = 'modules/prueba/PruebaView.vue';
const vue = (template, script = '') =>
  `<script setup>\n${script}\n</script>\n\n<template>\n${template}\n</template>\n`;
const hallazgos = (regla, template, { rel = REL, script = '' } = {}) =>
  analizar(rel, vue(template, script))[regla] ?? [];

describe('patrones-ui: el lector de etiquetas', () => {
  it('no se deja engañar por un `>` dentro de un atributo', () => {
    const t = etiquetas('<div v-if="a > 1" :class="{ \'font-mono\': b > c }"><span>x</span></div>');
    expect(t.map((x) => x.nombre)).toEqual(['div', 'span', 'span', 'div']);
    expect(clasesDe(t[0].attrs)).toContain('font-mono');
  });

  it('arma padre y cierre', () => {
    const t = etiquetas('<ul><li>a</li><li>b</li></ul>');
    expect(t[0].cierre).toBe(5);
    expect(t[1].padre).toBe(0);
    expect(t[3].padre).toBe(0);
  });

  it('las etiquetas void y autocerradas no abren hijos', () => {
    const t = etiquetas('<div><img src="a"><input><AppX /><b>t</b></div>');
    expect(t.find((x) => x.nombre === 'b').padre).toBe(0);
  });
});

describe('patrones-ui: reglas de la Versión Expediente', () => {
  it('borde-lateral: border-l/r/x y divide-x, con variantes; no border-l-0 ni border-red', () => {
    expect(hallazgos('borde-lateral', '<div class="border-l-2 border-primary-500"></div>')).toHaveLength(1);
    expect(hallazgos('borde-lateral', '<div class="xl:border-l"></div>')).toHaveLength(1);
    expect(hallazgos('borde-lateral', '<div class="border-r border-gray-200"></div>')).toHaveLength(1);
    expect(hallazgos('borde-lateral', '<ul class="divide-x"></ul>')).toHaveLength(1);
    expect(hallazgos('borde-lateral', '<div class="border-x border-gray-100"></div>')).toHaveLength(1);
    expect(hallazgos('borde-lateral', '<div class="border-l-0 border-red-500 border-b border-solid"></div>')).toEqual([]);
    expect(hallazgos('borde-lateral', '<div class="divide-y border-t border-gray-200"></div>')).toEqual([]);
  });

  it('caja-de-icono: span tonal de tamaño fijo con un único <i>', () => {
    const caja = '<span class="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-600"><i class="ti ti-user" aria-hidden="true"></i></span>';
    expect(hallazgos('caja-de-icono', caja)).toHaveLength(1);
    expect(hallazgos('caja-de-icono', '<span class="flex h-8 w-8 rounded-full" :class="TONO[t]"><i :class="icono"></i></span>')).toHaveLength(1);
    // Con texto (un avatar de iniciales), con otro hijo o sin fondo: no es una caja de ícono.
    expect(hallazgos('caja-de-icono', '<span class="flex h-8 w-8 rounded-full bg-gray-100">AB</span>')).toEqual([]);
    expect(hallazgos('caja-de-icono', '<span class="flex h-8 w-8 rounded-full bg-gray-100"><i class="ti ti-x"></i> texto</span>')).toEqual([]);
    expect(hallazgos('caja-de-icono', '<span class="flex h-8 w-8 rounded-full text-gray-500"><i class="ti ti-x"></i></span>')).toEqual([]);
  });

  it('azul-decorativo: ícono azul fijo o fondo azul sin estado; no el azul condicional ni el enlace', () => {
    expect(hallazgos('azul-decorativo', '<i class="ti ti-user text-primary-600"></i>')).toHaveLength(1);
    expect(hallazgos('azul-decorativo', '<div class="bg-primary-50 p-2">x</div>')).toHaveLength(1);
    expect(hallazgos('azul-decorativo', '<div class="bg-primary-50/40 p-2">x</div>')).toHaveLength(1);
    // Declara su estado.
    expect(hallazgos('azul-decorativo', '<button class="bg-primary-50" aria-pressed="true">x</button>')).toEqual([]);
    expect(hallazgos('azul-decorativo', '<button class="bg-primary-50" :aria-selected="on">x</button>')).toEqual([]);
    // Condicional (:class) = estado; variantes de interacción; enlace.
    expect(hallazgos('azul-decorativo', '<i :class="on ? \'text-primary-600\' : \'text-gray-500\'"></i>')).toEqual([]);
    expect(hallazgos('azul-decorativo', '<div class="hover:bg-primary-50 focus-visible:bg-primary-100">x</div>')).toEqual([]);
    expect(hallazgos('azul-decorativo', '<a class="text-primary-600" href="#">x</a>')).toEqual([]);
  });

  it('mono-fuera-de-credenciales: font-mono; no font-medium', () => {
    expect(hallazgos('mono-fuera-de-credenciales', '<span class="font-mono text-xs">{{ x }}</span>')).toHaveLength(1);
    expect(hallazgos('mono-fuera-de-credenciales', '<span class="sm:font-mono">x</span>')).toHaveLength(1);
    expect(hallazgos('mono-fuera-de-credenciales', '<span class="font-medium tabular-nums">x</span>')).toEqual([]);
  });

  it('codigo-sin-tabular: código en texto plano; no dentro de tabular-nums ni de AppCodigo', () => {
    expect(hallazgos('codigo-sin-tabular', '<td>{{ eq.codigo }}</td>')).toHaveLength(1);
    expect(hallazgos('codigo-sin-tabular', '<p>{{ emp.dni || \'Sin registrar\' }}</p>')).toHaveLength(1);
    expect(hallazgos('codigo-sin-tabular', '<td>{{ item.codigo_almacen }}</td>')).toHaveLength(1);
    expect(hallazgos('codigo-sin-tabular', '<td class="tabular-nums">{{ eq.codigo }}</td>')).toEqual([]);
    // tabular-nums en un ancestro (se hereda).
    expect(hallazgos('codigo-sin-tabular', '<td class="tabular-nums"><span>{{ eq.serie }}</span></td>')).toEqual([]);
    expect(hallazgos('codigo-sin-tabular', '<AppCodigo><template>{{ eq.codigo }}</template></AppCodigo>')).toEqual([]);
    // Otra palabra que contiene "codigo".
    expect(hallazgos('codigo-sin-tabular', '<td>{{ eq.codigo_postal }}</td>')).toEqual([]);
    expect(hallazgos('codigo-sin-tabular', '<td>{{ eq.nombre }}</td>')).toEqual([]);
  });

  it('punto-de-color: punto redondo de 6-8px; no un avatar ni un círculo grande', () => {
    expect(hallazgos('punto-de-color', '<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>')).toHaveLength(1);
    expect(hallazgos('punto-de-color', '<span class="h-2 w-2 shrink-0 rounded-full" :class="c"></span>')).toHaveLength(1);
    expect(hallazgos('punto-de-color', '<span class="h-8 w-8 rounded-full bg-gray-100">AB</span>')).toEqual([]);
    expect(hallazgos('punto-de-color', '<span class="h-2 w-2 rounded-sm"></span>')).toEqual([]);
  });

  it('peso-700: font-bold / extrabold; no semibold ni medium', () => {
    expect(hallazgos('peso-700', '<b class="font-bold">x</b>')).toHaveLength(1);
    expect(hallazgos('peso-700', '<b class="md:font-extrabold">x</b>')).toHaveLength(1);
    expect(hallazgos('peso-700', '<b class="font-semibold font-medium">x</b>')).toEqual([]);
  });

  it('sombra-flotante: shadow-md/lg/xl; no shadow-xs ni shadow-sm', () => {
    expect(hallazgos('sombra-flotante', '<div class="shadow-lg"></div>')).toHaveLength(1);
    expect(hallazgos('sombra-flotante', '<div class="hover:shadow-md"></div>')).toHaveLength(1);
    expect(hallazgos('sombra-flotante', '<div class="shadow-xs shadow-sm"></div>')).toEqual([]);
  });

  it('radio-enorme-o-gradiente: rounded-2xl/3xl, degradados y blur; no rounded-xl', () => {
    expect(hallazgos('radio-enorme-o-gradiente', '<div class="rounded-2xl"></div>')).toHaveLength(1);
    expect(hallazgos('radio-enorme-o-gradiente', '<div class="bg-gradient-to-r from-primary-500 to-primary-700"></div>')).toHaveLength(3);
    expect(hallazgos('radio-enorme-o-gradiente', '<div class="backdrop-blur-sm"></div>')).toHaveLength(1);
    expect(hallazgos('radio-enorme-o-gradiente', '<div class="rounded-xl rounded-lg"></div>')).toEqual([]);
  });

  it('animacion-no-permitida: pulse/bounce/ping; sí animate-spin', () => {
    expect(hallazgos('animacion-no-permitida', '<div class="animate-pulse"></div>')).toHaveLength(1);
    expect(hallazgos('animacion-no-permitida', '<div class="animate-bounce animate-ping"></div>')).toHaveLength(2);
    expect(hallazgos('animacion-no-permitida', '<i class="ti ti-loader-2 animate-spin"></i>')).toEqual([]);
  });

  it('kpi-fuera-de-reporte: AppKpi fuera de modules/*/Reporte*', () => {
    expect(hallazgos('kpi-fuera-de-reporte', '<AppKpi label="x" :valor="1" />')).toHaveLength(1);
    expect(hallazgos('kpi-fuera-de-reporte', '<AppKpi label="x" :valor="1" />', { rel: 'modules/tickets/ReporteSatisfaccionView.vue' })).toEqual([]);
    expect(hallazgos('kpi-fuera-de-reporte', '<AppKpi label="x" :valor="1" />', { rel: 'modules/tickets/TicketsView.vue' })).toHaveLength(1);
  });

  it('copy-entusiasta-o-tuteo: exclamaciones, entusiasmo y tuteo en el texto; no el JS ni el usted', () => {
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>¡Listo!</p>').length).toBeGreaterThan(0);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>Guardado!</p>')).toHaveLength(1);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<h1>Bienvenido, {{ nombre }}</h1>')).toHaveLength(1);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>Aquí puedes ver tu ticket</p>')).toHaveLength(2);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<AppButton label="Haz clic aquí" />').length).toBeGreaterThan(0);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>{{ ok ? \'Todo en orden.\' : \'Revise sus datos\' }}</p>')).toEqual([]);
    // Cadenas dentro de {{ }} también cuentan.
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>{{ ok ? \'¡Genial!\' : \'\' }}</p>').length).toBeGreaterThan(0);
    // Un `!` de JavaScript no es copy.
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p v-if="!cargando && x !== y">Listo</p>')).toEqual([]);
    // El usted con un verbo ambiguo, y el vocabulario de escalas, quedan fuera a propósito.
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>¿Confirma que el problema quedó resuelto?</p>')).toEqual([]);
    expect(hallazgos('copy-entusiasta-o-tuteo', '<p>Excelente, Bueno, Regular</p>')).toEqual([]);
  });

  it('historial-a-mano: ul/ol con divide-y y formatFecha; no una lista sin fechas ni AppLibro', () => {
    const hist = '<ul class="divide-y divide-gray-100"><li v-for="h in hs">{{ formatFecha(h.fecha) }} {{ h.texto }}</li></ul>';
    expect(hallazgos('historial-a-mano', hist)).toHaveLength(1);
    expect(hallazgos('historial-a-mano', '<ol class="divide-y"><li>{{ formatFechaHora(h.at) }}</li></ol>')).toHaveLength(1);
    expect(hallazgos('historial-a-mano', '<ul class="divide-y"><li>{{ h.texto }}</li></ul>')).toEqual([]);
    expect(hallazgos('historial-a-mano', '<ul class="space-y-1"><li>{{ formatFecha(h.fecha) }}</li></ul>')).toEqual([]);
    expect(hallazgos('historial-a-mano', hist, { rel: 'components/ui/AppLibro.vue' })).toEqual([]);
  });

  it('error-crudo: e?.message / error.message en modules/**; no fuera de modules ni en comentarios', () => {
    const catchea = "try { await x() } catch (e) { error.value = e?.message || 'Error' }";
    expect(hallazgos('error-crudo', '<div></div>', { script: catchea })).toHaveLength(1);
    expect(hallazgos('error-crudo', '<div></div>', { script: 'catch (error) { toast(error.message) }' })).toHaveLength(1);
    expect(hallazgos('error-crudo', '<div></div>', { script: '// usar e.message aquí no\n/* error.message */' })).toEqual([]);
    expect(hallazgos('error-crudo', '<div></div>', { script: catchea, rel: 'components/ui/Algo.vue' })).toEqual([]);
    // También en los .js de modules.
    expect(analizar('modules/x/logica.js', catchea)['error-crudo']).toHaveLength(1);
    // Una propiedad `.message` de otro objeto no es una excepción.
    expect(hallazgos('error-crudo', '<div></div>', { script: 'toast(respuesta.message)' })).toEqual([]);
  });

  it('vue-mayor-400-lineas: más de 400 líneas; 400 o menos no', () => {
    const largo = vue('<div></div>', 'const x = 1;\n'.repeat(420));
    expect(analizar(REL, largo)['vue-mayor-400-lineas']).toHaveLength(1);
    expect(analizar(REL, vue('<div></div>', 'const x = 1;\n'.repeat(100)))['vue-mayor-400-lineas']).toBeUndefined();
    // Solo .vue.
    expect(analizar('modules/x/grande.js', 'const x = 1;\n'.repeat(500))['vue-mayor-400-lineas']).toBeUndefined();
  });
});

describe('patrones-ui: excepciones y línea base', () => {
  it('toda regla nueva cita en su `porque` un número de regla o sección de SISTEMA-DISENO', () => {
    for (const [id, r] of Object.entries(REGLAS)) {
      expect(r.titulo, id).toBeTruthy();
      expect(r.arreglo, id).toBeTruthy();
      expect(typeof r.buscar, id).toBe('function');
      expect(r.porque, id).toMatch(/(?:[Rr]egla|[Rr]eglas)\s+\d+|SISTEMA-DISENO|Plan Ciclo 21/);
    }
  });

  it('las 15 reglas del plan §3.5 existen', () => {
    for (const id of [
      'borde-lateral', 'caja-de-icono', 'azul-decorativo', 'mono-fuera-de-credenciales', 'codigo-sin-tabular',
      'punto-de-color', 'peso-700', 'sombra-flotante', 'radio-enorme-o-gradiente', 'animacion-no-permitida',
      'kpi-fuera-de-reporte', 'copy-entusiasta-o-tuteo', 'historial-a-mano', 'error-crudo', 'vue-mayor-400-lineas',
    ]) expect(REGLAS[id], id).toBeDefined();
  });

  it('cada excepción tiene motivo/alcance/impacto, una regla real y un archivo que existe', () => {
    for (const e of EXCEPCIONES) {
      expect(e.motivo?.trim(), e.archivo).toBeTruthy();
      expect(e.alcance?.trim(), e.archivo).toBeTruthy();
      expect(e.impacto?.trim(), e.archivo).toBeTruthy();
      expect(existsSync(fileURLToPath(new URL(`../src/${e.archivo}`, import.meta.url))), e.archivo).toBe(true);
      for (const r of e.reglas) expect(REGLAS[r], `${e.archivo}: ${r}`).toBeDefined();
    }
  });

  it('una excepción silencia SOLO su regla en su archivo', () => {
    const f = '<div class="shadow-lg font-bold"></div>';
    const res = analizar('components/ui/AppMenu.vue', vue(f));
    expect(res['sombra-flotante']).toBeUndefined();
    expect(res['peso-700']).toHaveLength(1);
  });

  it('la línea base (si existe) solo nombra reglas y archivos reales, ordenados y sin duplicados', () => {
    const ruta = fileURLToPath(new URL('../../scripts/patrones-ui.baseline.json', import.meta.url));
    if (!existsSync(ruta)) return;
    const base = JSON.parse(readFileSync(ruta, 'utf8'));
    for (const [regla, lista] of Object.entries(base)) {
      expect(REGLAS[regla], `regla ${regla}`).toBeDefined();
      expect(lista, regla).toEqual([...new Set(lista)].sort((a, b) => a.localeCompare(b)));
      for (const rel of lista) {
        expect(existsSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url))), `${regla} → ${rel}`).toBe(true);
      }
    }
  });
});
