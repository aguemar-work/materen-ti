<script setup>
// Combo de búsqueda con lista flotante.
//
// La lista se teletransporta a <body> (mismo patrón que Modal.vue y
// MenuAcciones.vue) en lugar de posicionarse con `absolute` dentro del campo.
// Motivo: .modal-body tiene overflow-y:auto y el modal se ajusta a su
// contenido, así que en un modal chico una lista `absolute` quedaba recortada
// a la altura visible del body — se veían una o dos filas y había que
// scrollear el modal a mano. Teleportada, la lista se mide contra el viewport
// y no contra el modal: muestra tantas filas como quepan en pantalla sin que
// el modal cambie de tamaño.
import { ref, computed, watch, nextTick, onBeforeUnmount, useId } from 'vue';

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  busqueda: { type: String, default: '' },
  items: { type: Array, required: true },
  camposBusqueda: { type: Array, required: true },
  etiqueta: { type: Function, required: true },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: undefined },
  placeholder: { type: String, default: 'Buscar...' },
  limite: { type: Number, default: 8 },
  // Mantiene la lista cerrada aunque el input tenga foco y no haya selección
  // (ej. LicenciaForm mientras se está registrando un correo nuevo inline).
  forzarCerrado: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'update:busqueda']);

const idLista = `combo-${useId()}`;

const texto = ref(props.busqueda);
const listaAbierta = ref(false);
const indiceActivo = ref(-1);
const wrapEl = ref(null);
const inputEl = ref(null);
const listaEl = ref(null);

// Visibilidad real de la lista. `listaAbierta` es solo la intención del
// usuario (foco/tecleo); esto suma las condiciones del padre. Se separan
// porque al teclear se emite modelValue:'' y la prop tarda un tick en
// llegar — si `mostrarLista` dependiera de la prop, no reabriría.
const abierta = computed(() => listaAbierta.value && !props.modelValue && !props.forzarCerrado);

const GAP = 4;         // separación campo ↔ lista
const MARGEN = 8;      // aire mínimo contra el borde del viewport
const ALTO_MAX = 320;  // ~8 filas: más que eso no se escanea de un vistazo

// Geometría de la lista flotante (position:fixed sobre <body>). Se ancla por
// `top` cuando abre hacia abajo y por `bottom` cuando abre hacia arriba: así
// al filtrar, el borde pegado al campo no se mueve y la lista no "salta".
const geo = ref({ left: 0, width: 0, top: 0, bottom: null, alto: 0 });

let contenedor = null;   // ancestro con scroll (.modal-body), cacheado al abrir
let timerCierre = null;
let raf = 0;

const estiloLista = computed(() => {
  const g = geo.value;
  return {
    left: `${g.left}px`,
    width: `${g.width}px`,
    maxHeight: `${g.alto}px`,
    ...(g.bottom === null ? { top: `${g.top}px` } : { bottom: `${g.bottom}px` }),
  };
});

// Área realmente visible, en las mismas coordenadas que
// getBoundingClientRect. En móvil el teclado virtual no reduce
// window.innerHeight en todos los navegadores, pero el visual viewport sí lo
// refleja: sin esto la lista se extendería por debajo del teclado y volvería
// a mostrar dos filas, que es justo lo que este componente evita.
function areaVisible() {
  const vv = window.visualViewport;
  if (!vv) return { top: 0, bottom: window.innerHeight };
  return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
}

// getComputedStyle es caro para llamarlo en cada scroll, así que el
// contenedor se resuelve una vez al abrir.
function contenedorScroll(el) {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return p;
    p = p.parentElement;
  }
  return null;
}

function posicionar() {
  if (!wrapEl.value || !listaEl.value) return;
  const r = wrapEl.value.getBoundingClientRect();

  // Si el campo salió del área visible de su contenedor con scroll, la lista
  // quedaría flotando sobre el modal sin nada que la ancle: se cierra.
  if (contenedor) {
    const c = contenedor.getBoundingClientRect();
    if (r.bottom < c.top || r.top > c.bottom) { cerrarYa(); return; }
  }

  const vista = areaVisible();
  const espacioAbajo = vista.bottom - r.bottom - GAP - MARGEN;
  const espacioArriba = r.top - vista.top - GAP - MARGEN;
  // scrollHeight es el alto natural del contenido (lo devuelve completo
  // aunque max-height lo esté recortando), así que la lista solo se voltea
  // si de verdad no cabe abajo y arriba hay más aire.
  const deseado = Math.min(ALTO_MAX, listaEl.value.scrollHeight);
  const voltear = espacioAbajo < deseado && espacioArriba > espacioAbajo;
  const disponible = voltear ? espacioArriba : espacioAbajo;

  geo.value = {
    left: r.left,
    width: r.width,
    top: voltear ? null : r.bottom + GAP,
    // `bottom` de un position:fixed se mide contra el viewport de layout, no
    // contra el área visible: acá va innerHeight, no vista.bottom.
    bottom: voltear ? window.innerHeight - r.top + GAP : null,
    alto: Math.max(0, Math.min(ALTO_MAX, disponible)),
  };
}

// El scroll dispara muchas veces por gesto; una lectura de rect por frame.
function reposicionar() {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; posicionar(); });
}

function mostrarLista() {
  clearTimeout(timerCierre);
  if (listaAbierta.value) return;
  const el = wrapEl.value;
  if (!el) return;
  contenedor = contenedorScroll(el);
  // Geometría provisional antes del primer render: si la lista naciera con
  // width:0 el texto envolvería y el scrollHeight que mide posicionar()
  // sería falso.
  const r = el.getBoundingClientRect();
  geo.value = {
    left: r.left,
    width: r.width,
    top: r.bottom + GAP,
    bottom: null,
    alto: Math.max(0, Math.min(ALTO_MAX, areaVisible().bottom - r.bottom - GAP - MARGEN)),
  };
  listaAbierta.value = true;
  window.addEventListener('scroll', reposicionar, true);
  window.addEventListener('resize', reposicionar);
  window.addEventListener('keydown', onEscapeCaptura, true);
  // El teclado virtual abriéndose no dispara resize en iOS, sí visualViewport.
  window.visualViewport?.addEventListener('resize', reposicionar);
  window.visualViewport?.addEventListener('scroll', reposicionar);
}

function cerrarYa() {
  if (!listaAbierta.value) return;
  listaAbierta.value = false;
  indiceActivo.value = -1;
  contenedor = null;
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  window.removeEventListener('scroll', reposicionar, true);
  window.removeEventListener('resize', reposicionar);
  window.removeEventListener('keydown', onEscapeCaptura, true);
  window.visualViewport?.removeEventListener('resize', reposicionar);
  window.visualViewport?.removeEventListener('scroll', reposicionar);
}

// El cierre por blur se retrasa: al hacer clic en un ítem (o arrastrar la
// barra de scroll de la lista) el input pierde el foco antes del mousedown.
function cerrarLista() {
  clearTimeout(timerCierre);
  timerCierre = setTimeout(cerrarYa, 150);
}

// Único punto donde se calcula la posición definitiva, para las dos vías de
// apertura: foco/tecleo, y "el padre liberó la condición que la bloqueaba"
// (modelValue limpiado o forzarCerrado desactivado).
watch(abierta, (v) => { if (v) nextTick(posicionar); });

watch(texto, (v) => emit('update:busqueda', v));

// Sincroniza cambios externos al texto (ej. precarga en edición, o
// normalización del padre al elegir "registrar como nuevo").
watch(() => props.busqueda, (v) => {
  if (v !== texto.value) texto.value = v;
});

const coincidencias = computed(() => {
  const q = texto.value.trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter((item) =>
    props.camposBusqueda.map((campo) => item[campo]).join(' ').toLowerCase().includes(q));
});

const filtrados = computed(() => coincidencias.value.slice(0, props.limite));

// El corte por `limite` se declara: sin esto, 40 coincidencias se ven igual
// que 8 y el usuario cree que ya no hay más por afinar.
const ocultos = computed(() => coincidencias.value.length - filtrados.value.length);

// Al cambiar la lista (tecleo, o items que llegan async) el índice anterior
// ya apunta a otra cosa.
watch(filtrados, () => { indiceActivo.value = -1; });

function seleccionar(item) {
  emit('update:modelValue', item.id);
  texto.value = props.etiqueta(item);
  cerrarYa();
}

function onInput() {
  // Siempre emite (aunque ya estuviera vacío): así el padre puede usar
  // este evento como señal de "el usuario está escribiendo de nuevo"
  // (ej. LicenciaForm cancela el modo "registrar correo nuevo").
  emit('update:modelValue', '');
  mostrarLista();
}

// Teclado y mouse comparten `indiceActivo`, así nunca hay dos filas
// resaltadas. Los <li> del slot #extra no llevan data-indice, así que pasar
// el mouse por ellos apaga el resaltado de teclado.
function onHover(e) {
  const indice = e.target.closest('li')?.dataset.indice;
  indiceActivo.value = indice === undefined ? -1 : Number(indice);
}

function verActivo() {
  listaEl.value?.querySelector('.is-activo')?.scrollIntoView({ block: 'nearest' });
}

// Escape debe cerrar solo la lista y dejar el modal abierto. No se puede
// resolver desde el input: Modal.vue escucha en `document` en fase de captura
// y detiene ahí la propagación, así que el evento nunca baja hasta el campo.
// La captura en `window` corre antes que la de `document`, y es el único
// punto donde se puede interceptar sin tocar Modal.vue. Solo intercepta con
// la lista visible; en cualquier otro caso Escape cierra el modal como siempre.
function onEscapeCaptura(e) {
  if (e.key !== 'Escape' || !abierta.value) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  cerrarYa();
}

function onKeydown(e) {
  if (e.key === 'Tab') {
    cerrarYa();
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!abierta.value) { mostrarLista(); return; }
    const total = filtrados.value.length;
    if (!total) return;
    const paso = e.key === 'ArrowDown' ? 1 : -1;
    indiceActivo.value = indiceActivo.value < 0
      ? (paso > 0 ? 0 : total - 1)
      : (indiceActivo.value + paso + total) % total;
    nextTick(verActivo);
    return;
  }
  // Sin ítem marcado, Enter sigue enviando el formulario como siempre.
  if (e.key === 'Enter' && abierta.value && indiceActivo.value >= 0) {
    e.preventDefault();
    seleccionar(filtrados.value[indiceActivo.value]);
  }
}

// Si el padre limpia la selección (reset de formulario, cambio de registro),
// el texto buscado debe limpiarse también. El foco distingue ese caso del
// '' que emite onInput: al editar un valor ya elegido, esa limpieza externa
// llega un tick después y borraría las teclas recién escritas.
watch(() => props.modelValue, (v) => {
  if (!v && document.activeElement !== inputEl.value) texto.value = '';
});

// La lista puede llegar async (ej. fetch al activar un modo); si ya hay una
// selección previa cuando esto resuelve, hay que repintar la etiqueta.
watch(() => props.items, (lista) => {
  if (props.modelValue) {
    const actual = lista.find((item) => item.id === props.modelValue);
    if (actual) texto.value = props.etiqueta(actual);
  }
});

onBeforeUnmount(() => {
  clearTimeout(timerCierre);
  cerrarYa();
});
</script>

<template>
  <div ref="wrapEl" class="combo-wrap">
    <i class="ti ti-search combo-icon" aria-hidden="true"></i>
    <input
      :id="id"
      ref="inputEl"
      v-model="texto"
      type="text"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="abierta"
      :aria-controls="idLista"
      :aria-activedescendant="indiceActivo >= 0 ? `${idLista}-${indiceActivo}` : undefined"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="{ 'combo-ok': modelValue }"
      @input="onInput"
      @focus="mostrarLista"
      @blur="cerrarLista"
      @keydown="onKeydown"
    >
    <slot name="icono" :seleccionado="!!modelValue">
      <i v-if="modelValue" class="ti ti-circle-check combo-check" aria-hidden="true"></i>
    </slot>
    <Teleport to="body">
      <ul
        v-if="abierta"
        :id="idLista"
        ref="listaEl"
        class="combo-lista"
        role="listbox"
        :style="estiloLista"
        @mouseover="onHover"
      >
        <slot name="vacio" :sinResultados="filtrados.length === 0">
          <li v-if="filtrados.length === 0" class="combo-vacio">Sin resultados</li>
        </slot>
        <li
          v-for="(item, i) in filtrados"
          :id="`${idLista}-${i}`"
          :key="item.id"
          :data-indice="i"
          role="option"
          :aria-selected="i === indiceActivo"
          :class="{ 'is-activo': i === indiceActivo }"
          @mousedown.prevent="seleccionar(item)"
        >
          <slot name="resultado" :item="item" />
        </li>
        <slot name="extra" />
        <li v-if="ocultos > 0" class="combo-mas" role="presentation">
          {{ ocultos }} coincidencia{{ ocultos === 1 ? '' : 's' }} más — precise la búsqueda
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.combo-wrap { position: relative; }

.combo-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-text-secondary); font-size: 15px; pointer-events: none;
}

.combo-wrap input { width: 100%; padding-left: 32px; padding-right: 32px; }
.combo-wrap input.combo-ok { border-color: var(--color-success); }

.combo-check {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: var(--color-success); font-size: 16px; pointer-events: none;
}

:deep(.combo-check--nuevo) { color: var(--color-primary); }

/* fixed + teleport a <body>: top/left/width/max-height los fija el script
   contra el viewport. z-index propio porque .modal-bg está en --z-modal y
   ya no compite dentro del stacking context del modal. */
.combo-lista {
  position: fixed; z-index: var(--z-popover-modal);
  margin: 0; padding: 4px; list-style: none;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
  overscroll-behavior: contain; /* al llegar al final no arrastra el modal */
}

/* Las filas que llegan por los slots #vacio/#extra se compilan con el scope
   del padre, así que sin :deep() no heredarían el layout de fila. Bajo
   `.combo-lista` cada regla de fila especial gana por especificidad a la
   regla base, sin necesidad de !important. */
.combo-lista :deep(li) {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: var(--fs-base);
}

.combo-lista :deep(li:hover) { background: var(--color-accent-subtle); }
.combo-lista :deep(li.is-activo) {
  background: var(--color-accent-subtle);
  box-shadow: 0 0 0 3px var(--mat-ring);
}

.combo-lista :deep(.combo-vacio) {
  color: var(--color-text-secondary); cursor: default; font-size: var(--fs-sm);
}
.combo-lista :deep(.combo-vacio:hover) { background: none; }

/* Pegado al fondo: sigue visible mientras se recorre la lista. */
.combo-lista :deep(.combo-mas) {
  position: sticky; bottom: -4px;
  justify-content: center;
  margin: 4px -4px -4px; padding: 6px 10px;
  border-top: 1px solid var(--color-border-subtle);
  border-radius: 0;
  background: var(--color-bg-subtle);
  color: var(--color-text-tertiary);
  font-size: var(--fs-xs);
  cursor: default;
}
.combo-lista :deep(.combo-mas:hover) { background: var(--color-bg-subtle); }

.combo-lista :deep(.combo-sec) { font-size: var(--fs-sm); color: var(--color-text-secondary); }

.combo-lista :deep(.combo-usuario) {
  font-family: var(--font-mono, monospace);
  font-size: var(--fs-sm);
  min-width: 0; /* sin esto el flex item no baja de su contenido y no recorta */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.combo-lista :deep(.combo-plataforma) {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.combo-lista :deep(.combo-registrar) {
  justify-content: flex-start;
  color: var(--color-primary);
  font-size: var(--fs-sm);
}
.combo-lista :deep(.combo-registrar i) { font-size: 15px; flex-shrink: 0; }
.combo-lista :deep(.combo-registrar strong) { font-family: var(--font-mono, monospace); font-weight: 600; }
</style>
