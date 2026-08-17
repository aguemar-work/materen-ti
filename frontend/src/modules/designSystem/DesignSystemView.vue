<script setup>
// Style guide interno — documentación viva del Design System en producción.
// Lee las variables reales de main.css en vez de copiar valores (ver
// tokensReales.js): si alguien cambia un color/espaciado ahí, esta página
// cambia sola. Ruta solo-dev, ver router/routes/design-system.routes.js.
//
// Los estados hover/focus de componentes con estilo `scoped` (ítem de
// sidebar, combo, menú de acciones, notificación, encabezado ordenable) no
// se pueden mostrar "siempre visibles" con la pseudo-clase real (requiere
// mouse/foco real, uno a la vez) ni heredan el `scoped` del componente
// original si se copia su markup acá. Se resuelven con clases de utilidad
// .force-hover/.force-focus propias de esta página, que duplican la
// declaración (no los valores: siguen usando los mismos var(--...)) — la
// fuente exacta de cada una está anotada en el comentario del CSS. Es la
// única duplicación deliberada de toda la página.
import { ref, onMounted, watch } from 'vue';
import Pagination from '../../components/shared/Pagination.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import { NOMBRE_PRODUCTO } from '../../core/marca.js';
import {
  leerTokensReales,
  paletaPorFamilia,
  escalaEspaciado,
  escalaTipografica,
  escalaRadios,
  forzarTemaEn,
} from './tokensReales.js';

const tokens = leerTokensReales();
const familias = paletaPorFamilia();
const espaciado = escalaEspaciado();
const tipografia = escalaTipografica();
const radios = escalaRadios();

// ── Toggle de tema para las secciones "en vivo" (Botón/Toast/Formularios/
// Navegación/Datos y tablas/Superposiciones). Fuerza un snapshot completo
// de :root (+ overrides de oscuro) como custom properties inline sobre el
// wrapper, en vez de depender de `data-theme` del <html> real — así no
// pisa la preferencia de tema real de la sesión del usuario, y funciona
// aunque esa preferencia ya esté en oscuro. ────────────────────────────
const tema = ref('light');
const raizPreview = ref(null);
watch(tema, (t) => forzarTemaEn(raizPreview.value, t), { immediate: false });
onMounted(() => forzarTemaEn(raizPreview.value, tema.value));

const SECCIONES = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'boton', label: 'Botón' },
  { id: 'toast', label: 'Toast' },
  { id: 'formularios', label: 'Formularios' },
  { id: 'navegacion', label: 'Navegación' },
  { id: 'datos-tablas', label: 'Datos y tablas' },
  { id: 'superposiciones', label: 'Superposiciones' },
  { id: 'marca', label: 'Marca' },
];

// ── Botón: 5 variantes × 5 estados reales (Fase B) ─────────────────────
const VARIANTES_BOTON = [
  { clase: '', etiqueta: 'Secondary', icono: 'ti-download', texto: 'Exportar', cargando: 'Cargando...' },
  { clase: 'btn-primary', etiqueta: 'Primary', icono: 'ti-plus', texto: 'Nuevo', cargando: 'Guardando...' },
  { clase: 'btn-danger', etiqueta: 'Danger', icono: 'ti-trash', texto: 'Dar de baja', cargando: 'Eliminando...' },
  { clase: 'btn-danger-solid', etiqueta: 'Danger sólido', icono: 'ti-trash', texto: 'Dar de baja', cargando: 'Procesando...' },
  { clase: 'btn-whatsapp', etiqueta: 'WhatsApp', icono: 'ti-brand-whatsapp', texto: 'WhatsApp', cargando: 'Enviando...' },
];
const ESTADOS_BOTON = [
  { clave: 'default', etiqueta: 'Default' },
  { clave: 'hover', etiqueta: 'Hover' },
  { clave: 'focus', etiqueta: 'Focus' },
  { clave: 'loading', etiqueta: 'Cargando' },
  { clave: 'disabled', etiqueta: 'Deshabilitado' },
];

// ── Botón icono: sin variant set propio en design.pen todavía — 4 estados
// reales de .icon-btn (sin "Cargando", no se usa en este componente hoy).
const ESTADOS_ICON_BTN = [
  { clave: 'default', etiqueta: 'Default' },
  { clave: 'hover', etiqueta: 'Hover' },
  { clave: 'focus', etiqueta: 'Focus' },
  { clave: 'disabled', etiqueta: 'Deshabilitado' },
];

// ── Toast: 4 variantes semánticas (Fase C) ─────────────────────────────
const TOASTS = [
  { clase: 'toast-success', icono: 'ti-check', texto: 'Empleado actualizado correctamente' },
  { clase: 'toast-error', icono: 'ti-alert-circle', texto: 'No se pudo eliminar el registro' },
  { clase: 'toast-warning', icono: 'ti-alert-triangle', texto: '3 licencias vencen esta semana' },
  { clase: 'toast-info', icono: 'ti-info-circle', texto: 'Se sincronizaron los datos' },
];

// ── Datos y tablas: fila de ejemplo ─────────────────────────────────────
const FILAS_DEMO = [
  { nombre: 'Ana Torres', area: 'Sistemas', estado: 'Activo', badge: 'badge--success' },
  { nombre: 'Luis Peña', area: 'Contabilidad', estado: 'De baja', badge: 'badge--neutral' },
];
const paginaDemo = ref(2);
</script>

<template>
  <div class="ds-page">
    <header class="ds-header">
      <div class="ds-header-titulo">
        <h1>Design System — {{ NOMBRE_PRODUCTO }}</h1>
        <p>
          Referencia viva de lo que existe hoy en producción. Cada muestra lee las variables
          reales de <code>main.css</code> en tiempo de ejecución — si algo cambia ahí, esta
          página lo refleja sola. Página interna, solo disponible en desarrollo.
        </p>
      </div>
      <button type="button" class="btn" @click="tema = tema === 'light' ? 'dark' : 'light'">
        <i class="ti" :class="tema === 'dark' ? 'ti-sun' : 'ti-moon'" aria-hidden="true"></i>
        Vista previa: {{ tema === 'dark' ? 'oscuro' : 'claro' }}
      </button>
    </header>

    <nav class="ds-toc" aria-label="Secciones">
      <a v-for="s in SECCIONES" :key="s.id" :href="`#${s.id}`">{{ s.label }}</a>
    </nav>

    <p class="ds-nota ds-nota--info">
      Los estados hover/focus de componentes con estilo <code>scoped</code> (ítem de sidebar,
      combo, menú de acciones, notificación, encabezado ordenable) se muestran acá con marcado
      propio + clases de utilidad <code>.force-hover</code>/<code>.force-focus</code> — el
      <code>scoped</code> de Vue no se hereda fuera del componente original, y las pseudo-clases
      reales solo pueden estar activas en un elemento a la vez. Cada regla sigue apuntando a las
      mismas variables (<code>--color-bg-hover</code>, etc.) que el componente real; la fuente
      exacta está anotada en el comentario del CSS de esta página.
    </p>

    <!-- ════════════════════════════════════════════════════════════ -->
    <section id="tokens" class="ds-seccion">
      <h2>1. Tokens</h2>

      <h3>Paleta de color</h3>
      <p class="ds-sub">Claro y oscuro lado a lado, tal como están declarados en <code>:root</code> / <code>[data-theme="dark"]</code>.</p>
      <div v-for="f in familias" :key="f.clave" class="ds-familia">
        <h4>{{ f.etiqueta }}</h4>
        <div class="ds-swatch-grid">
          <div v-for="t in f.tokens" :key="t.nombre" class="ds-swatch-par">
            <div class="ds-swatch-nombre"><code>{{ t.nombre }}</code></div>
            <div class="ds-swatch-fila">
              <div class="ds-swatch" :style="{ background: t.claro }">
                <span>Claro</span>
              </div>
              <div class="ds-swatch" :style="{ background: t.oscuro }">
                <span>Oscuro</span>
              </div>
            </div>
            <div class="ds-swatch-valores">
              <span>{{ t.claro }}</span>
              <span>{{ t.oscuro }}</span>
            </div>
          </div>
        </div>
      </div>

      <h3>Escala de espaciado</h3>
      <p class="ds-sub"><code>--mat-space-1</code> a <code>--mat-space-12</code>, base 4px (Fase A) — adopción progresiva, no reemplaza valores crudos existentes.</p>
      <div class="ds-espaciado">
        <div v-for="e in espaciado" :key="e.nombre" class="ds-espaciado-fila">
          <code class="ds-espaciado-nombre">{{ e.nombre }}</code>
          <div class="ds-espaciado-barra" :style="{ width: e.valor }"></div>
          <span>{{ e.valor }}</span>
        </div>
      </div>

      <h3>Escala tipográfica</h3>
      <div class="ds-tipografia">
        <div v-for="t in tipografia" :key="t.nombre" class="ds-tipografia-fila">
          <span class="ds-tipografia-muestra" :style="{ fontSize: t.valor }">Aa Sistema TI</span>
          <code>{{ t.nombre }}</code>
          <span>{{ t.valor }}</span>
        </div>
      </div>

      <h3>Radios de borde</h3>
      <div class="ds-radios">
        <div v-for="r in radios" :key="r.nombre" class="ds-radio-item">
          <div class="ds-radio-caja" :style="{ borderRadius: r.valor }"></div>
          <code>{{ r.nombre }}</code>
          <span>{{ r.valor }}</span>
        </div>
      </div>
    </section>

    <!-- Secciones "en vivo": reflejan el toggle de tema de arriba ═══════ -->
    <div ref="raizPreview">
      <section id="boton" class="ds-seccion">
        <h2>2. Botón</h2>
        <p class="ds-nota ds-nota--ok">
          Foco unificado en las 5 variantes: anillo externo por <code>box-shadow</code>, color
          por variante (verde de marca / rojo / verde WhatsApp) — Fase B. <code>Cargando</code>
          y <code>Deshabilitado</code> se ven iguales en el código real: ambos usan el mismo
          atributo <code>:disabled</code> (<code>opacity: .5</code>); el spinner es la única
          señal de que está cargando, no un nivel de opacidad distinto.
        </p>
        <div class="ds-tabla-wrap">
          <table class="ds-grid">
            <thead>
              <tr>
                <th scope="col"></th>
                <th v-for="v in VARIANTES_BOTON" :key="v.clase || 'secondary'" scope="col">{{ v.etiqueta }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="estado in ESTADOS_BOTON" :key="estado.clave">
                <th scope="row">{{ estado.etiqueta }}</th>
                <td v-for="v in VARIANTES_BOTON" :key="v.clase || 'secondary'">
                  <button
                    type="button"
                    class="btn"
                    :class="[v.clase, { 'force-hover': estado.clave === 'hover', 'force-focus': estado.clave === 'focus' }]"
                    :disabled="estado.clave === 'loading' || estado.clave === 'disabled'"
                  >
                    <i v-if="estado.clave === 'loading'" class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i>
                    <i v-else class="ti" :class="v.icono" aria-hidden="true"></i>
                    {{ estado.clave === 'loading' ? v.cargando : v.texto }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Botón icono</h3>
        <p class="ds-nota ds-nota--warn">
          <code>design.pen</code> (<code>KpgFe</code>): "SPEC DE ACCESIBILIDAD: cada instancia de
          este componente DEBE definir su propio aria-label descriptivo (el ícono solo no
          basta)... Área táctil: icono 17×17 + padding $space-7(16) = 49×49px, cumple el mínimo de
          44×44px (WCAG 2.5.5) sin agrandar el ícono."
        </p>
        <div class="ds-icon-btn-demo">
          <div v-for="estado in ESTADOS_ICON_BTN" :key="estado.clave" class="ds-icon-btn-item">
            <button
              type="button"
              class="icon-btn"
              :class="{ 'force-hover': estado.clave === 'hover', 'force-focus': estado.clave === 'focus' }"
              :disabled="estado.clave === 'disabled'"
              aria-label="Editar empleado"
            >
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
            <span>{{ estado.etiqueta }}</span>
          </div>
        </div>
      </section>

      <section id="toast" class="ds-seccion">
        <h2>3. Toast</h2>
        <p class="ds-sub">4 variantes semánticas (Fase C), montadas todas a la vez — en producción son <code>position: fixed</code>, acá se muestran en línea para caber junto al resto de la página.</p>
        <div class="ds-toast-grid">
          <div v-for="t in TOASTS" :key="t.clase" class="toast" :class="t.clase">
            <i class="ti" :class="t.icono" aria-hidden="true"></i>
            {{ t.texto }}
          </div>
        </div>
      </section>

      <section id="formularios" class="ds-seccion">
        <h2>4. Formularios</h2>
        <div class="ds-form-grid">
          <div class="form-group">
            <label for="ds-campo-default">Campo de texto</label>
            <input id="ds-campo-default" type="text" value="Materen SAC">
          </div>
          <div class="form-group">
            <label for="ds-campo-focus">Campo de texto — focus</label>
            <input id="ds-campo-focus" type="text" value="Materen SAC" class="force-focus">
          </div>
          <div class="form-group">
            <label for="ds-campo-disabled">Campo de texto — disabled</label>
            <input id="ds-campo-disabled" type="text" value="Valor fijo" disabled>
            <p class="ds-nota ds-nota--warn">Sin regla <code>:disabled</code> propia — estilo nativo del navegador (DS-02, esta pasada solo cubrió botones).</p>
          </div>
          <div class="form-group">
            <label for="ds-campo-error">Campo de texto — error</label>
            <input id="ds-campo-error" type="text" value="1234567" aria-invalid="true">
            <p class="form-error" role="alert">El DNI debe tener 8 dígitos.</p>
            <p class="ds-nota ds-nota--warn">El borde no cambia pese a <code>aria-invalid</code> — DS-03, pendiente de decisión de producto.</p>
          </div>
          <div class="form-group">
            <label for="ds-select-default">Select</label>
            <select id="ds-select-default">
              <option>Activo</option>
              <option>Inactivo</option>
            </select>
          </div>
          <div class="form-group">
            <label for="ds-select-disabled">Select — disabled</label>
            <select id="ds-select-disabled" disabled>
              <option>Activo</option>
            </select>
          </div>
          <div class="form-group full">
            <label for="ds-textarea">Textarea</label>
            <textarea id="ds-textarea" rows="2">Nota de ejemplo.</textarea>
          </div>
          <div class="form-group full">
            <label>Buscador (barra de filtros)</label>
            <div class="search-wrap">
              <i class="ti ti-search" aria-hidden="true"></i>
              <input type="text" placeholder="Buscar...">
            </div>
          </div>
        </div>
      </section>

      <section id="navegacion" class="ds-seccion">
        <h2>5. Navegación</h2>

        <h3>Ítem de navegación del sidebar</h3>
        <p class="ds-nota ds-nota--ok">
          <code>AppNav.vue</code> ganó <code>:focus-visible</code> propio (2026-08-13, DS-04
          resuelto) — anillo <code>outline</code> igual al ya usado en el título de grupo del
          sidebar (<code>.sb-nav-titulo</code>), en vez del anillo <code>box-shadow</code> que
          modela <code>design.pen</code> (<code>rowIW3We</code>): sin ese ajuste el
          <code>box-shadow</code> se recortaría contra los 2px de <code>gap</code> entre ítems.
        </p>
        <div class="ds-nav-demo">
          <a href="#" class="ds-nav-item" @click.prevent>Inactivo</a>
          <a href="#" class="ds-nav-item force-hover" @click.prevent>Hover</a>
          <a href="#" class="ds-nav-item force-focus" @click.prevent>Focus</a>
          <a href="#" class="ds-nav-item ds-nav-item--active" @click.prevent>Activo</a>
        </div>

        <h3>Ítem de menú de acciones</h3>
        <p class="ds-nota ds-nota--ok">
          <code>design.pen</code> (<code>rowY1dDW</code>) modela un anillo de foco
          (<code>$brand.700</code>) para este ítem; <code>MenuAcciones.vue</code> ganó ese anillo
          en <code>:focus-visible</code> (2026-08-13, DS-04 resuelto) — antes solo cambiaba el
          fondo, igual que "Hover".
        </p>
        <div class="ds-menu-demo">
          <button type="button" class="ds-menu-item">Default</button>
          <button type="button" class="ds-menu-item force-hover">Hover</button>
          <button type="button" class="ds-menu-item force-focus">Focus</button>
        </div>

        <h3>Ítem de combo / autocomplete</h3>
        <p class="ds-nota ds-nota--info">
          No es <code>:focus</code> real de DOM: <code>BuscadorCombo.vue</code> navega por
          teclado con <code>aria-activedescendant</code> + clase <code>.is-activo</code>, sin
          mover el foco del input.
        </p>
        <p class="ds-nota ds-nota--ok">
          <code>design.pen</code> (<code>rowlEgjG</code>) modela un anillo de foco
          (<code>$brand.700</code>) para el estado "Activo"; <code>BuscadorCombo.vue</code> ganó
          ese anillo en <code>.is-activo</code> (2026-08-13, DS-04 resuelto), separado del simple
          cambio de fondo que sigue usando <code>:hover</code>.
        </p>
        <ul class="ds-combo-demo">
          <li class="ds-combo-item">Default</li>
          <li class="ds-combo-item force-hover">Hover</li>
          <li class="ds-combo-item ds-combo-item--activo">Activo (teclado)</li>
        </ul>
      </section>

      <section id="datos-tablas" class="ds-seccion">
        <h2>6. Datos y tablas</h2>

        <h3>Encabezado ordenable</h3>
        <p class="ds-nota ds-nota--info">
          El ícono nace atenuado (<code>opacity: .5</code>) y se aclara en <code>Hover</code>/
          <code>Focus</code> — señala que la columna es clickeable sin competir visualmente con
          las que ya están ordenadas.
        </p>
        <div class="ds-tabla-wrap">
          <table>
            <thead>
              <tr>
                <th class="ds-th-ordenable">
                  <button type="button" class="ds-th-btn">
                    Nombre <i class="ti ti-arrows-sort ds-th-icono" aria-hidden="true"></i>
                  </button>
                </th>
                <th class="ds-th-ordenable">
                  <button type="button" class="ds-th-btn force-hover">
                    Área (hover) <i class="ti ti-arrows-sort ds-th-icono" aria-hidden="true"></i>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in FILAS_DEMO" :key="f.nombre">
                <td>{{ f.nombre }}</td>
                <td>{{ f.area }} <span class="badge" :class="f.badge">{{ f.estado }}</span></td>
              </tr>
              <SkeletonTabla :columnas="2" :filas="2" />
            </tbody>
          </table>
        </div>
        <p class="ds-nota ds-nota--ok">
          <code>ThOrdenable.vue</code> ganó <code>:focus-visible</code> propio (2026-08-13, DS-04
          resuelto) — mismo anillo <code>outline</code> que el ítem de sidebar, y el ícono se
          aclara igual que en <code>Hover</code>.
        </p>
        <button type="button" class="ds-th-btn ds-th-btn--suelto force-focus">
          Estado (focus) <i class="ti ti-arrows-sort ds-th-icono" aria-hidden="true"></i>
        </button>

        <h3>Tarjeta de métrica</h3>
        <div class="ds-metricas">
          <div class="stat-card">
            <div class="stat-icon ds-stat-icon--empleados"><i class="ti ti-users"></i></div>
            <div class="stat-info">
              <span class="stat-value">128</span>
              <span class="stat-label">Empleados activos</span>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-icon ds-stat-icon--tickets"><i class="ti ti-headset"></i></div>
            <div class="stat-info">
              <span class="stat-value">7</span>
              <span class="stat-label">Tickets abiertos</span>
            </div>
          </div>
        </div>

        <h3>Paginación</h3>
        <p class="ds-sub">Componente real <code>Pagination.vue</code> (sin estilos <code>scoped</code>, reutilizado tal cual).</p>
        <Pagination v-model="paginaDemo" :total-items="47" :page-size="10" />
      </section>

      <section id="superposiciones" class="ds-seccion">
        <h2>7. Superposiciones</h2>
        <p class="ds-nota ds-nota--info">
          Se muestran en línea, sin el <code>overlay</code> fijo de pantalla completa ni la
          trampa de foco real de <code>Modal.vue</code>/<code>ConfirmDialog.vue</code> — así
          caben junto al resto de la página. Mismas clases reales de <code>main.css</code>.
        </p>

        <h3>Modal</h3>
        <div class="ds-modal-demo">
          <div class="modal" style="width: 100%; max-width: 420px;">
            <div class="modal-title">
              <span>Editar empleado</span>
              <button class="icon-btn" type="button" aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button>
            </div>
            <div class="modal-body">
              <p>Contenido de ejemplo del cuerpo del modal.</p>
            </div>
            <div class="modal-actions">
              <button class="btn" type="button">Cancelar</button>
              <button class="btn btn-primary" type="button">Guardar</button>
            </div>
          </div>
        </div>

        <h3>Diálogo de confirmación — destructivo</h3>
        <div class="ds-modal-demo">
          <div class="modal modal-sm confirm-dialog--destructive-demo" style="width: 100%; max-width: 380px;">
            <div class="modal-title">
              <span class="confirm-titulo">
                <span class="modal-icon"><i class="ti ti-alert-triangle" aria-hidden="true"></i></span>
                Dar de baja a Ana Torres
              </span>
            </div>
            <div class="modal-body">
              <p class="confirm-mensaje">Esta acción no se puede deshacer.</p>
            </div>
            <div class="modal-actions">
              <button class="btn" type="button">Cancelar</button>
              <button class="btn btn-danger-solid" type="button">
                <i class="ti ti-trash" aria-hidden="true"></i> Dar de baja
              </button>
            </div>
          </div>
        </div>

        <h3>Campana de notificaciones</h3>
        <p class="ds-nota ds-nota--warn">
          <code>design.pen</code> (<code>JjMGW</code>): "En el código real (.icon-btn
          campana-trigger), este botón comparte estilo con Primitivas/Botón icono — mismo problema
          de área táctil (32×30→44×44 aquí) y de nombre accesible. Hoy usa :title dinámico
          ("Notificaciones (N sin leer)"/"Notificaciones"), no aria-label — confirmar con dev si
          conviene sumar aria-label explícito (title tiene limitaciones de accesibilidad: no
          aparece en móvil, retraso de tooltip). Pendiente de refactor: este componente debería
          componerse sobre Primitivas/Botón icono en vez de duplicar su estructura."
        </p>
        <div class="ds-campana-trigger-demo">
          <button type="button" class="icon-btn" title="Notificaciones (3 sin leer)">
            <i class="ti ti-bell" aria-hidden="true"></i>
            <span class="badge-count ds-campana-trigger-badge">3</span>
          </button>
        </div>

        <h3>Panel de notificaciones</h3>
        <div class="ds-campana-demo">
          <div class="ds-campana-item">
            <i class="ti ti-ticket" aria-hidden="true"></i>
            <span class="ds-campana-item-texto">
              <span class="ds-campana-item-titulo">Ticket #1042 asignado</span>
              <span class="ds-campana-item-fecha">hace 5 min</span>
            </span>
            <span class="ds-campana-item-punto" aria-hidden="true"></span>
          </div>
          <div class="ds-campana-item force-hover">
            <i class="ti ti-mail" aria-hidden="true"></i>
            <span class="ds-campana-item-texto">
              <span class="ds-campana-item-titulo">Correo fallido en cuenta compartida (hover)</span>
              <span class="ds-campana-item-fecha">hace 1 h</span>
            </span>
          </div>
        </div>

        <h3>Aviso emergente</h3>
        <div class="ds-aviso-demo">
          <i class="ti ti-bell-ringing" aria-hidden="true"></i>
          <span class="ds-aviso-texto">Nuevo ticket sin asignar</span>
        </div>
      </section>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <section id="marca" class="ds-seccion">
      <h2>8. Marca</h2>
      <p class="ds-nota ds-nota--info">
        En tema oscuro el logo se fuerza a blanco sólido vía
        <code>filter: brightness(0) invert(1)</code> (<code>AppLayout.vue</code>) — no conserva
        sus colores de marca. "Compacto" y "Símbolo" son el mismo archivo
        (<code>icon_sisti.svg</code>) a distinto tamaño; no existe un tercer archivo separado.
      </p>
      <div class="ds-marca-grid">
        <div v-for="par in [{ tema: 'claro', bg: tokens.claro['--mat-color-bg'], invertir: false }, { tema: 'oscuro', bg: tokens.oscuro['--mat-color-bg'], invertir: true }]" :key="par.tema" class="ds-marca-col">
          <h4>Fondo {{ par.tema }}</h4>
          <div class="ds-marca-caja" :style="{ background: par.bg }">
            <div class="ds-marca-item">
              <img src="/icon_sisti.svg" alt="Símbolo Sistema TI" width="28" height="28" loading="lazy" :style="{ filter: par.invertir ? 'brightness(0) invert(1)' : 'none' }">
              <span>Símbolo (28px)</span>
            </div>
            <div class="ds-marca-item">
              <img src="/icon_sisti.svg" alt="Símbolo Sistema TI compacto" width="20" height="20" loading="lazy" :style="{ filter: par.invertir ? 'brightness(0) invert(1)' : 'none' }">
              <span>Compacto (20px)</span>
            </div>
            <div class="ds-marca-item">
              <img src="/logo_materen_sisti.svg" alt="Materen — Sistema TI" height="26" loading="lazy" :style="{ filter: par.invertir ? 'brightness(0) invert(1)' : 'none' }">
              <span>Completo</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ds-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
  color: var(--color-text-primary);
}

.ds-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.ds-header h1 {
  font-family: var(--font-display);
  font-size: var(--fs-2xl);
  font-weight: 600;
  margin-bottom: 6px;
}

.ds-header p {
  color: var(--color-text-secondary);
  font-size: var(--fs-base);
  max-width: 640px;
}

.ds-toc {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin: 16px 0 20px;
  padding: 8px 0 12px;
  border-bottom: 1px solid var(--color-border);
  /* Página larga (~5000-6500px, ver auditoría) — sin esto la tabla de
     contenidos desaparece apenas se hace scroll. Necesita fondo propio
     para no dejar ver el contenido pasando detrás. */
  position: sticky;
  top: 0;
  background: var(--color-bg);
  z-index: 1;
}

.ds-toc a {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-accent-text);
  text-decoration: none;
}
.ds-toc a:hover { text-decoration: underline; }

.ds-seccion {
  padding: 28px 0;
  border-bottom: 1px solid var(--color-border-subtle);
}
.ds-seccion:last-child { border-bottom: none; }

.ds-seccion h2 {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  font-weight: 600;
  margin-bottom: 4px;
}

.ds-seccion h3 {
  font-size: var(--fs-lg);
  font-weight: 600;
  margin: 22px 0 6px;
}

.ds-seccion h4 {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 16px 0 8px;
}

.ds-sub {
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

/* Etiquetas de deuda honesta — mismo patrón visual (borde izquierdo +
   fondo tenue), color según severidad: info = neutro/acento, ok = éxito,
   warn = advertencia. */
.ds-nota {
  font-size: var(--fs-sm);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  margin: 8px 0;
}
.ds-nota code { font-family: var(--font-mono); font-size: 0.92em; }
.ds-nota--info { background: var(--color-bg-subtle); border-left-color: var(--color-border-strong); color: var(--color-text-secondary); }
.ds-nota--ok { background: var(--color-success-bg); border-left-color: var(--color-success-text); color: var(--color-success-text); }
.ds-nota--warn { background: var(--color-warning-bg); border-left-color: var(--color-warning-text); color: var(--color-warning-text); }

/* ── Tokens: swatches ─────────────────────────────────────────── */
.ds-familia { margin-top: 12px; }
.ds-swatch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.ds-swatch-par { font-size: var(--fs-xs); }
.ds-swatch-nombre { margin-bottom: 4px; word-break: break-all; }
.ds-swatch-fila { display: flex; gap: 4px; }
.ds-swatch {
  flex: 1;
  height: 40px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: flex-end;
  padding: 3px 5px;
}
.ds-swatch span {
  font-size: 9px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.6);
}
.ds-swatch-valores { display: flex; justify-content: space-between; gap: 4px; margin-top: 3px; color: var(--color-text-tertiary); }

.ds-espaciado { display: flex; flex-direction: column; gap: 6px; }
.ds-espaciado-fila { display: flex; align-items: center; gap: 10px; font-size: var(--fs-sm); }
.ds-espaciado-nombre { width: 110px; flex-shrink: 0; }
.ds-espaciado-barra { height: 12px; background: var(--color-accent); border-radius: 2px; }

.ds-tipografia { display: flex; flex-direction: column; gap: 8px; }
.ds-tipografia-fila { display: grid; grid-template-columns: 1fr 90px 60px; align-items: center; gap: 10px; }
.ds-tipografia-muestra { color: var(--color-text-primary); }

.ds-radios { display: flex; gap: 20px; flex-wrap: wrap; }
.ds-radio-item { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: var(--fs-xs); }
.ds-radio-caja { width: 56px; height: 56px; background: var(--color-bg-subtle); border: 1px solid var(--color-border-strong); }

/* ── Botón / grilla comparativa ───────────────────────────────── */
.ds-tabla-wrap { overflow-x: auto; }
.ds-grid { border-collapse: separate; border-spacing: 8px; }
.ds-grid th { background: none; text-transform: none; letter-spacing: normal; font-size: var(--fs-sm); color: var(--color-text-secondary); padding: 4px 8px; white-space: nowrap; }
.ds-grid td { border: none; padding: 4px 8px; }

.ds-icon-btn-demo { display: flex; gap: 20px; align-items: center; }
.ds-icon-btn-item { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-secondary); }
/* main.css .icon-btn:focus-visible usa outline, no el anillo box-shadow de .btn (Fase B no tocó icon-btn) */
.icon-btn.force-hover { background: var(--color-bg-subtle); color: var(--color-text-primary); }
.icon-btn.force-focus { outline: 2px solid var(--color-accent); outline-offset: 2px; }

/* ── Toast: en línea (real es position:fixed) ───────────────────── */
.ds-toast-grid { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
.ds-toast-grid .toast { position: static; max-width: none; }

/* ── Formularios ──────────────────────────────────────────────── */
.ds-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; max-width: 640px; }
.ds-form-grid .full { grid-column: 1 / -1; }

/* ── Navegación: duplicación deliberada de estilos `scoped` ──────
   Mismos tokens que el original; ver nota general de la página. */
.ds-nav-demo { display: flex; gap: 8px; flex-wrap: wrap; }
/* AppNav.vue .sb-nav-item */
.ds-nav-item {
  display: flex; align-items: center; padding: 9px 12px; border-radius: 8px;
  color: var(--color-text-secondary); text-decoration: none; font-size: 13.5px; font-weight: 500;
}
.ds-nav-item.force-hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.ds-nav-item.force-focus { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.ds-nav-item--active { background: var(--color-accent-subtle); color: var(--color-accent-text); font-weight: 600; }

.ds-menu-demo { display: flex; gap: 8px; flex-wrap: wrap; }
/* MenuAcciones.vue .menu-acciones__item */
.ds-menu-item {
  padding: 11px 12px; border: none; border-radius: var(--radius-sm); background: var(--color-bg-elevated);
  border: 1px solid var(--color-border); color: var(--color-text-primary); font-family: var(--font-sans);
  font-size: var(--fs-base); cursor: pointer;
}
.ds-menu-item.force-hover { background: var(--color-bg-hover); }
.ds-menu-item.force-focus { background: var(--color-bg-hover); box-shadow: 0 0 0 3px var(--mat-ring); }

.ds-combo-demo { list-style: none; display: flex; flex-direction: column; gap: 2px; max-width: 260px; padding: 4px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-elevated); }
/* BuscadorCombo.vue .combo-lista li */
.ds-combo-item { padding: 8px 10px; border-radius: 6px; font-size: var(--fs-base); }
.ds-combo-item.force-hover { background: var(--color-accent-subtle); }
.ds-combo-item--activo { background: var(--color-accent-subtle); box-shadow: 0 0 0 3px var(--mat-ring); }

/* ThOrdenable.vue .th-ordenable-btn */
.ds-th-ordenable { padding: 0; }
.ds-th-btn { display: flex; align-items: center; gap: 4px; width: 100%; padding: 10px 1.25rem; background: none; border: none; font: inherit; color: inherit; cursor: pointer; }
.ds-th-btn--suelto { width: auto; border-radius: var(--radius-sm); }
.ds-th-btn.force-hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.ds-th-btn.force-focus {
  outline: 2px solid var(--color-accent);
  outline-offset: -2px;
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}
.ds-th-icono { font-size: 13px; opacity: 0.5; }
.ds-th-btn.force-hover .ds-th-icono,
.ds-th-btn.force-focus .ds-th-icono { opacity: 1; }

/* ── Datos y tablas ───────────────────────────────────────────── */
.ds-metricas { display: flex; gap: 12px; flex-wrap: wrap; }
.ds-metricas .stat-card { width: 220px; }
/* DashboardView.vue .stat-icon--empleados/.stat-icon--tickets (scoped ahí) */
.ds-stat-icon--empleados { background: var(--color-success-bg); color: var(--color-success-text); }
.ds-stat-icon--tickets { background: var(--color-info-bg); color: var(--color-info-text); }

/* ── Superposiciones ──────────────────────────────────────────── */
.ds-modal-demo { display: flex; }
.confirm-dialog--destructive-demo { border-top: 2px solid var(--color-danger-text); }
.confirm-titulo { display: flex; align-items: center; gap: 10px; }
.confirm-mensaje { font-size: var(--fs-base); color: var(--color-text-secondary); }

/* NotificacionesCampana.vue .campana-trigger/.campana-badge */
.ds-campana-trigger-demo .icon-btn { position: relative; }
.ds-campana-trigger-badge { position: absolute; top: 0; right: 0; font-size: 10px; line-height: 1; padding: 1px 5px; }

.ds-campana-demo { display: flex; flex-direction: column; gap: 2px; max-width: 320px; padding: 4px; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-bg-elevated); }
/* NotificacionesCampana.vue .campana-panel__item */
.ds-campana-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 10px; border-radius: var(--radius-sm); }
.ds-campana-item.force-hover { background: var(--color-bg-hover); }
.ds-campana-item i { font-size: 16px; color: var(--color-accent-soft); margin-top: 1px; }
.ds-campana-item-texto { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ds-campana-item-titulo { font-size: 12.5px; font-weight: 500; color: var(--color-text-primary); }
.ds-campana-item-fecha { font-size: 11px; color: var(--color-text-secondary); }
/* NotificacionesCampana.vue .campana-panel__punto — omitido antes en esta demo */
.ds-campana-item-punto { width: 7px; height: 7px; border-radius: 50%; background: var(--color-accent); flex-shrink: 0; margin-top: 5px; }

/* AppNotifications.vue .aviso-card */
.ds-aviso-demo {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px; max-width: 320px;
  background: var(--color-bg-elevated); border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
}
.ds-aviso-demo i { color: var(--color-accent-soft); font-size: 18px; }
.ds-aviso-texto { font-size: 13px; font-weight: 600; color: var(--color-text-primary); }

/* ── Marca ────────────────────────────────────────────────────── */
.ds-marca-grid { display: flex; gap: 16px; flex-wrap: wrap; }
.ds-marca-col h4 { margin-top: 0; }
.ds-marca-caja { display: flex; gap: 20px; padding: 20px; border-radius: var(--radius-md); border: 1px solid var(--color-border); }
.ds-marca-item { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: var(--fs-xs); color: var(--color-text-secondary); }

/* ── Botón: anillo de foco por variante (Fase B), duplicado acá porque
   no se puede sostener :focus-visible real en varias filas a la vez ── */
.btn.force-hover:not(.btn-primary):not(.btn-danger):not(.btn-danger-solid):not(.btn-whatsapp) {
  background: var(--color-bg-subtle); border-color: var(--color-border-strong);
}
.btn-primary.force-hover { background: var(--color-accent-hover); border-color: var(--color-accent-hover); }
.btn-danger.force-hover { background: var(--mat-color-danger-hover); color: #fff; border-color: var(--mat-color-danger-hover); }
.btn-danger-solid.force-hover { background: var(--mat-color-danger-hover); border-color: var(--mat-color-danger-hover); }
.btn-whatsapp.force-hover { background: var(--mat-color-whatsapp-hover); border-color: var(--mat-color-whatsapp-hover); }

.btn.force-focus:not(.btn-danger):not(.btn-danger-solid):not(.btn-whatsapp) {
  border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--mat-ring);
}
.btn-danger.force-focus,
.btn-danger-solid.force-focus { border-color: var(--color-danger-border); box-shadow: 0 0 0 3px var(--mat-ring-danger); }
.btn-whatsapp.force-focus { border-color: var(--mat-color-whatsapp); box-shadow: 0 0 0 3px var(--mat-ring-whatsapp); }

/* Formularios: mismo anillo que .form-group input:focus, forzado por clase */
.form-group input.force-focus,
.form-group select.force-focus {
  border-color: var(--color-accent); box-shadow: 0 0 0 3px var(--mat-ring); outline: none;
}
</style>
