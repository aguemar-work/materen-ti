<script setup>
// Style Lab — preview aislado de una propuesta de marca nueva (azul
// #0082FB / #0064E0) para validar la dirección visual antes de tocar
// frontend/src/styles/main.css o cualquier pantalla real.
//
// Cómo funciona: TODOS los tokens de la paleta nueva viven scoped dentro
// de la clase raíz .sl-lab (ver <style> al final), redefiniendo los mismos
// nombres de variable que ya usa el sistema real (--color-accent,
// --color-text-primary, --fs-heading-02, --radius-base, etc.). Como las custom
// properties de CSS heredan por el árbol del DOM, todo lo que está DENTRO
// de .sl-lab y usa una clase global real (.btn, .badge--*, .stat-card,
// table/th/td, .modal, .avatar, .toast-*, .timeline, .capacity-bar,
// .form-group input/select) se re-pinta solo con la paleta nueva — no se
// duplicó ni un componente. Fuera de .sl-lab (el resto de la app) nada
// cambia: :root de main.css sigue intacto.
//
// Las únicas clases nuevas de este archivo (prefijo sl-) son las que hoy
// NO existen como componente compartido: botón terciario/ghost, icon-box
// consolidado, avatar sólido determinista, fila de tabla seleccionada y el
// shell propio de esta página (header/paleta/toc/secciones).
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue';
import Modal from '../../components/shared/Modal.vue';
import Pagination from '../../components/shared/Pagination.vue';
import SkeletonTabla from '../../components/shared/SkeletonTabla.vue';
import EmptyState from '../../components/shared/EmptyState.vue';
import ThOrdenable from '../../components/shared/ThOrdenable.vue';
import { useOrdenTabla } from '../../composables/useOrdenTabla.js';
import { NOMBRE_PRODUCTO } from '../../core/marca.js';
import { tonoAvatar } from '../../core/avatar.js';
// Base nueva (2026-09-07): PrimeVue Unstyled + Tailwind — ver
// frontend/AGENTS.md "UI/UX". Estas dos secciones (AppButton/AppTable) son
// documentación viva de los wrappers reales: si sus presets cambian, la
// grilla de abajo cambia sola, nunca hace falta actualizarla a mano.
import AppButton from '../../components/ui/AppButton.vue';
import AppTable from '../../components/ui/AppTable.vue';
import AppColumn from '../../components/ui/AppColumn.js';

const oscuro = ref(false);
const modalAbierto = ref(false);
const verSkeleton = ref(false);
const paginaDemo = ref(2);
const filaSeleccionada = ref('TCK-2026-0329');

// ── Elevación y superficies — D. Dropdown real (Escape + click afuera) ───
// MenuAcciones.vue (el componente real) usa <Teleport to="body">: si se
// importa literal acá, el panel se renderiza FUERA de .sl-lab y pierde la
// paleta nueva (cae al navy/mint real de :root, un bug visual encontrado
// al evaluar la reutilización). En vez de eso, se replica la MISMA lógica
// de interacción de MenuAcciones.vue (Escape, click afuera, foco de
// vuelta al trigger) sin Teleport, para que el panel siga siendo
// descendiente de .sl-lab y herede los tokens scoped.
const menuAccionesAbierto = ref(false);
const menuAccionesBtnRef = ref(null);
const menuAccionesPanelRef = ref(null);

function abrirMenuAcciones() {
  menuAccionesAbierto.value = true;
}
function cerrarMenuAcciones() {
  if (!menuAccionesAbierto.value) return;
  menuAccionesAbierto.value = false;
}
function alternarMenuAcciones() {
  menuAccionesAbierto.value ? cerrarMenuAcciones() : abrirMenuAcciones();
}
function onClickFueraMenuAcciones(e) {
  if (!menuAccionesAbierto.value) return;
  if (menuAccionesBtnRef.value?.contains(e.target) || menuAccionesPanelRef.value?.contains(e.target)) return;
  cerrarMenuAcciones();
}
function onKeydownMenuAcciones(e) {
  if (!menuAccionesAbierto.value || e.key !== 'Escape') return;
  e.stopPropagation();
  cerrarMenuAcciones();
  menuAccionesBtnRef.value?.focus();
}
onMounted(() => {
  document.addEventListener('pointerdown', onClickFueraMenuAcciones, true);
  document.addEventListener('keydown', onKeydownMenuAcciones, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onClickFueraMenuAcciones, true);
  document.removeEventListener('keydown', onKeydownMenuAcciones, true);
});

// ── Elevación y superficies — E. Modal (instancia propia, no comparte
// estado con el modal de "Componentes operativos") ───────────────────────
const modalElevacionAbierto = ref(false);

const SECCIONES = [
  { id: 'paleta', label: 'Paleta' },
  { id: 'tipografia', label: 'Tipografía' },
  { id: 'botones', label: 'Botones' },
  { id: 'badges', label: 'Badges' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'cards', label: 'Cards' },
  { id: 'tabla', label: 'Tabla ITSM' },
  { id: 'operativos', label: 'Operativos' },
  { id: 'pantalla', label: 'Pantalla ejemplo' },
  { id: 'auditoria', label: 'Auditoría de color' },
  { id: 'validacion', label: 'Validación operativa' },
  { id: 'elevacion', label: 'Elevación y superficies' },
  { id: 'app-button', label: 'AppButton (nuevo)' },
  { id: 'app-table', label: 'AppTable (nuevo)' },
];

// ── Paleta ──────────────────────────────────────────────────────────────
const GRUPOS_PALETA = [
  {
    titulo: 'Marca',
    items: [
      { nombre: 'Brand 500', token: '--color-brand-500', hex: '#0082FB', uso: 'Foco, navegación activa (ícono/indicador), acentos grandes — nunca como texto de tamaño normal ni como fondo con texto encima (ver validación de contraste)' },
      { nombre: 'Brand 600', token: '--color-brand-600', hex: '#0064E0', uso: 'Fondo de botón primario, texto de enlace, texto/ícono de navegación activa' },
      { nombre: 'Brand 700', token: '--color-brand-700', hex: '#0052B8', uso: 'Hover / pressed del botón primario' },
      { nombre: 'Brand 100', token: '--color-brand-100', hex: '#E5F2FF', uso: 'Fondo de selección sutil, avatar, chip de identidad' },
      { nombre: 'Brand 50', token: '--color-brand-50', hex: '#F3F9FF', uso: 'Hover muy sutil de fila / ítem de lista' },
    ],
  },
  {
    titulo: 'Fondos',
    items: [
      { nombre: 'Fondo de app', token: '--color-bg-app', hex: '#F1F5F8', uso: 'Fondo general del layout — nunca el de una card, tabla o modal' },
      { nombre: 'Fondo sutil', token: '--color-bg-subtle', hex: '#F8FAFC', uso: 'Encabezado de tabla, barra de filtros, toolbar de card' },
      { nombre: 'Fondo muted', token: '--color-bg-muted', hex: '#E8EEF2', uso: 'Chip neutro, hover de fila, badge "Pendiente"' },
    ],
  },
  {
    titulo: 'Superficies',
    items: [
      { nombre: 'Superficie', token: '--color-bg-surface', hex: '#FFFFFF', uso: 'Cards, modales, tablas y paneles principales' },
    ],
  },
  {
    titulo: 'Texto',
    items: [
      { nombre: 'Texto principal', token: '--color-text-primary', hex: '#1C2B33', uso: 'Títulos, cuerpo, navegación de alta prioridad' },
      { nombre: 'Texto secundario', token: '--color-text-secondary', hex: '#52636D', uso: 'Texto de apoyo, subtítulos, labels de formulario' },
      { nombre: 'Texto terciario', token: '--color-text-tertiary', hex: '#5B6B74', uso: 'Metadata, placeholder, celda vacía ("—")', ajustado: { original: '#73838C', ratioOriginal: '3.92:1', ratioNuevo: '5.53:1', motivo: 'bajo AA (4.5:1) sobre superficie blanca' } },
      { nombre: 'Texto inverso', token: '--color-text-inverse', hex: '#FFFFFF', uso: 'Sobre botón primario, avatar y superficies de color sólido' },
      { nombre: 'Enlace', token: '--color-text-link', hex: '#0064E0', uso: 'Texto de enlace — mismo tono que brand-600, nunca brand-500' },
    ],
  },
  {
    titulo: 'Bordes',
    items: [
      { nombre: 'Borde sutil', token: '--color-border / --color-border-subtle', hex: '#D9E2E8', uso: 'Separadores, borde de card/tabla/modal, divisores no interactivos — decorativo, sin umbral de contraste exigible (WCAG 1.4.11 no aplica a bordes no esenciales para identificar el componente)' },
      { nombre: 'Borde por defecto', token: '--color-border-default', hex: '#7E96A3', uso: 'Input, select, textarea y botón secundario en reposo — el único borde que SÍ debe distinguirse del fondo por sí solo', ajustado: { original: '#A9BBC6', ratioOriginal: '1.98:1', ratioNuevo: '3.10:1', motivo: 'por debajo de 3:1 (borde de componente interactivo, WCAG 1.4.11)' } },
      { nombre: 'Borde fuerte', token: '--color-border-strong', hex: '#526A7B', uso: 'Hover de controles, seleccionado no enfocado, controles de mayor prioridad (toast)', ajustado: { original: '#7D93A1', ratioOriginal: '3.20:1', ratioNuevo: '5.67:1', motivo: 'con --color-border-default ya corregido a 3.10:1 quedaba a un solo dígito hex de distancia — casi indistinguible. No hay margen en la escala para dos tonos grisáceos que pasen 3:1 y además se vean distintos entre sí sobre blanco; se oscureció "fuerte" un escalón más para recuperar la jerarquía visual.' } },
    ],
  },
  {
    titulo: 'Success',
    items: [
      { nombre: 'Fondo success', token: '--color-success-bg', hex: '#E8F7F0', uso: 'Fondo de badge / alerta de éxito' },
      { nombre: 'Texto success', token: '--color-success-text', hex: '#0F7A4E', uso: 'Texto sobre fondo success', ajustado: { original: '#168A5B', ratioOriginal: '3.94:1', ratioNuevo: '4.85:1', motivo: 'bajo AA sobre su propio fondo' } },
    ],
  },
  {
    titulo: 'Warning',
    items: [
      { nombre: 'Fondo warning', token: '--color-warning-bg', hex: '#FBF0DC', uso: 'Fondo de badge / alerta de advertencia — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
      { nombre: 'Texto warning', token: '--color-warning-text', hex: '#845A0E', uso: 'Texto sobre fondo warning — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
    ],
  },
  {
    titulo: 'Danger',
    items: [
      { nombre: 'Fondo danger', token: '--color-danger-bg', hex: '#FAEAE3', uso: 'Fondo de badge / alerta de error — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
      { nombre: 'Texto danger', token: '--color-danger-text', hex: '#963D28', uso: 'Texto sobre fondo danger (badge) — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
      { nombre: 'Danger sólido', token: '--color-danger-solid', hex: '#DC2626', uso: 'Fondo de botón "peligro sólido" — invariante entre temas, sin cambio: mismo valor que ya existe en main.css (--color-danger-solid)' },
    ],
  },
  {
    titulo: 'Info',
    items: [
      { nombre: 'Fondo info', token: '--color-info-bg', hex: '#E7EAF7', uso: 'Fondo de badge / alerta informativa — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
      { nombre: 'Texto info', token: '--color-info-text', hex: '#3B4FA0', uso: 'Texto sobre fondo info — sin cambio: la migración de marca no toca los semánticos, valor idéntico al que ya existe en main.css' },
    ],
  },
];

const PALETA_ACTIVA = [
  { nombre: 'Brand blue', hex: '#0082FB' },
  { nombre: 'Brand blue dark', hex: '#0064E0' },
  { nombre: 'App bg', hex: '#F1F5F8' },
  { nombre: 'Surface', hex: '#FFFFFF' },
  { nombre: 'Text', hex: '#1C2B33' },
];

// ── Tipografía ──────────────────────────────────────────────────────────
const TIPOGRAFIA = [
  { nombre: 'Título de página', clase: 'sl-fs-pagina', token: '--fs-3xl', size: '24px', peso: 700, lh: '1.2', familia: 'Sora', ejemplo: 'Dashboard' },
  { nombre: 'Título de sección', clase: 'sl-fs-seccion', token: '--fs-heading-02', size: '18px', peso: 600, lh: '1.3', familia: 'Sora', ejemplo: 'Tickets recientes' },
  { nombre: 'Título de card', clase: 'sl-fs-card', token: '--fs-heading-02', size: '16px', peso: 600, lh: '1.3', familia: 'Sora', ejemplo: 'Pendientes' },
  { nombre: 'Body', clase: 'sl-fs-body', token: '--fs-body-01', size: '14px', peso: 400, lh: '1.5', familia: 'Inter', ejemplo: 'El ticket fue reasignado a soporte de infraestructura.' },
  { nombre: 'Texto secundario', clase: 'sl-fs-secundario', token: '--fs-body-01', size: '13px', peso: 400, lh: '1.5', familia: 'Inter', ejemplo: 'Actualizado hace 12 minutos' },
  { nombre: 'Metadata', clase: 'sl-fs-metadata', token: '--fs-label-01', size: '12px', peso: 500, lh: '1.4', familia: 'Inter', ejemplo: 'TCK-2026-0341 · Hoy, 09:14' },
  { nombre: 'Número KPI', clase: 'sl-fs-kpi', token: '--fs-heading-05', size: '26px', peso: 700, lh: '1.1', familia: 'Inter', ejemplo: '24' },
];

// ── Botones ─────────────────────────────────────────────────────────────
const BOTONES = [
  { clase: 'btn-primary', etiqueta: 'Primary', icono: 'ti-plus', texto: 'Nuevo ticket' },
  { clase: '', etiqueta: 'Secondary', icono: 'ti-download', texto: 'Exportar' },
  { clase: 'sl-btn-ghost', etiqueta: 'Ghost / Terciario', icono: 'ti-filter', texto: 'Filtros' },
  { clase: 'btn-danger', etiqueta: 'Danger (soft)', icono: 'ti-trash', texto: 'Dar de baja' },
  { clase: 'btn-danger-solid', etiqueta: 'Danger sólido', icono: 'ti-trash', texto: 'Eliminar definitivamente' },
];

// ── Badges (usa las clases .badge--* REALES de main.css) ────────────────
const BADGES = [
  { label: 'Abierto', clase: 'badge--info' },
  { label: 'En progreso', clase: 'badge--warning' },
  { label: 'Resuelto', clase: 'badge--success' },
  { label: 'Pendiente', clase: 'badge--neutral' },
  { label: 'Activo', clase: 'badge--success' },
  { label: 'Advertencia', clase: 'badge--warning' },
  { label: 'Error', clase: 'badge--danger' },
];

// ── Toast ───────────────────────────────────────────────────────────────
const TOASTS = [
  { clase: 'toast-success', icono: 'ti-check', texto: 'Ticket cerrado correctamente' },
  { clase: 'toast-error', icono: 'ti-alert-circle', texto: 'No se pudo guardar el cambio' },
  { clase: 'toast-warning', icono: 'ti-alert-triangle', texto: '3 licencias vencen esta semana' },
  { clase: 'toast-info', icono: 'ti-info-circle', texto: 'Se sincronizaron los datos' },
];

// ── Tabla ITSM (datos ficticios) ─────────────────────────────────────────
const TICKETS_DEMO = [
  { id: 'TCK-2026-0341', titulo: 'No enciende monitor secundario', solicitante: 'Marta Ibáñez', prioridad: 'Media', prioridadClase: 'badge--info', estado: 'Abierto', estadoClase: 'badge--info', fecha: '22/08/2026', responsable: 'Alejandro Guevara', iniciales: 'AG' },
  { id: 'TCK-2026-0338', titulo: 'Solicitud de acceso a VPN', solicitante: 'Carlos Núñez', prioridad: 'Alta', prioridadClase: 'badge--warning', estado: 'En progreso', estadoClase: 'badge--warning', fecha: '21/08/2026', responsable: 'Sofía Medina', iniciales: 'SM' },
  { id: 'TCK-2026-0335', titulo: 'Impresora de Recepción sin tóner', solicitante: 'Lucía Fernández', prioridad: 'Baja', prioridadClase: 'badge--neutral', estado: 'Resuelto', estadoClase: 'badge--success', fecha: '20/08/2026', responsable: 'Alejandro Guevara', iniciales: 'AG' },
  { id: 'TCK-2026-0330', titulo: 'Caída del servidor de correo', solicitante: 'Diego Salas', prioridad: 'Urgente', prioridadClase: 'badge--danger', estado: 'Abierto', estadoClase: 'badge--info', fecha: '19/08/2026', responsable: 'Sofía Medina', iniciales: 'SM' },
  { id: 'TCK-2026-0329', titulo: 'Renovación de licencia Adobe', solicitante: 'Valeria Rojas', prioridad: 'Media', prioridadClase: 'badge--info', estado: 'En progreso', estadoClase: 'badge--warning', fecha: '19/08/2026', responsable: 'Alejandro Guevara', iniciales: 'AG' },
];

// ── Avatar — una sola familia visual, sin distinción de producto ─────────
// Política única para TODA persona en la página (ya no hay un tratamiento
// "plano" para listas pasivas y otro "sólido" para responsables — esa
// distinción quedaba, tal como se usaba, como si el color comunicara peso
// de acción, y no es así: es puramente decorativo). Sin gradiente, sin
// color aleatorio: se deriva un tono fijo de una escala categórica de 5
// (ninguno reutiliza success/warning/danger — esos son semánticos, esto no
// comunica estado ni prioridad) a partir de un hash simple del nombre
// completo. Misma persona → mismo tono en cualquier parte de la página.
// Los tamaños (sm/lg, base sin modificador) son el único eje de variación
// además del tono — nunca el color. Sin nombre (usuario desconocido/
// eliminado) → tono neutro, nunca uno de los 5 categóricos ni un semántico.
// Portado: tonoAvatar y los tonos .avatar--* viven en core/avatar.js y
// main.css desde el rediseño Materen (Fase 1). Esta página los importa como
// cualquier vista real en vez de mantener su copia .sl-avatar--*, que era el
// prototipo — dejarla sería recrear acá la divergencia que la Fase 1 fue a
// cerrar.

// ── Navegación (ítem activo) — mismos tokens que .sb-nav-item.is-activo
// real (AppNav.vue): fondo --color-accent-subtle, texto --color-accent-text,
// peso 600. Se arma acá un mini-demo estático para poder confirmar en la
// auditoría de color con qué se pinta la navegación activa. ──────────────
const NAV_DEMO = [
  { icono: 'ti-layout-dashboard', label: 'Dashboard', activo: false },
  { icono: 'ti-ticket', label: 'Tickets', activo: true },
  { icono: 'ti-users', label: 'Empleados', activo: false },
];

// ── Validación operativa — A. Lista de tickets (25 filas ficticias) ──────
const NOMBRES_DEMO = ['Marta Ibáñez', 'Carlos Núñez', 'Lucía Fernández', 'Diego Salas', 'Valeria Rojas', 'Pedro Castro', 'Ana Gómez', 'Rocío Paredes', 'Martín Silva', 'Camila Vidal', 'Julián Torres', 'Daniela Ríos', 'Franco Molina', 'Antonella Ponce'];
const ASUNTOS_DEMO = ['No enciende monitor secundario', 'Solicitud de acceso a VPN', 'Impresora de Recepción sin tóner', 'Caída del servidor de correo', 'Renovación de licencia Adobe', 'Teclado no responde', 'Consulta sobre facturación electrónica', 'Actualización de antivirus pendiente', 'Solicitud de nuevo usuario de red', 'Wi-Fi inestable en Obra Norte', 'Cambio de contraseña de dominio', 'Instalación de software contable', 'Backup no se ejecutó anoche', 'Pantalla azul recurrente', 'Solicitud de notebook nueva', 'Acceso denegado a carpeta compartida', 'Configuración de correo en celular', 'Escáner no detectado', 'Router reiniciándose solo', 'Migración de datos a equipo nuevo', 'Falla en lector de DNI', 'Bloqueo de cuenta por intentos fallidos', 'Solicitud de licencia de Zoom', 'Consulta sobre política de contraseñas', 'Mouse inalámbrico sin respuesta'];
const RESPONSABLES_DEMO = [{ n: 'Alejandro Guevara', i: 'AG' }, { n: 'Sofía Medina', i: 'SM' }, { n: 'Martín Silva', i: 'MS' }];
const PRIORIDADES_DEMO = [{ l: 'Baja', c: 'badge--neutral' }, { l: 'Media', c: 'badge--info' }, { l: 'Alta', c: 'badge--warning' }, { l: 'Urgente', c: 'badge--danger' }];
const ESTADOS_DEMO = [{ l: 'Abierto', c: 'badge--info' }, { l: 'En progreso', c: 'badge--warning' }, { l: 'Resuelto', c: 'badge--success' }, { l: 'Pendiente', c: 'badge--neutral' }];
const ANTIGUEDADES_DEMO = ['12 min', '45 min', '1 h', '3 h', '5 h', '1 d', '2 d', '3 d', '5 d', '8 d'];
// Minutos reales detrás de cada etiqueta de arriba — necesarios para que la
// columna "Antigüedad" se pueda ORDENAR de verdad (useOrdenTabla ordena por
// valor, no puede comparar "3 d" con "5 h" como texto).
const ANTIGUEDADES_MIN_DEMO = [12, 45, 60, 180, 300, 1440, 2880, 4320, 7200, 11520];

const TICKETS_GRANDES = Array.from({ length: 25 }, (_, i) => {
  const prioridad = PRIORIDADES_DEMO[i % PRIORIDADES_DEMO.length];
  const estado = ESTADOS_DEMO[(i + 1) % ESTADOS_DEMO.length];
  const responsable = RESPONSABLES_DEMO[i % RESPONSABLES_DEMO.length];
  return {
    id: `TCK-2026-${String(366 - i).padStart(4, '0')}`,
    titulo: ASUNTOS_DEMO[i % ASUNTOS_DEMO.length],
    solicitante: NOMBRES_DEMO[i % NOMBRES_DEMO.length],
    prioridad: prioridad.l,
    prioridadClase: prioridad.c,
    estado: estado.l,
    estadoClase: estado.c,
    responsable: responsable.n,
    iniciales: responsable.i,
    antiguedad: ANTIGUEDADES_DEMO[i % ANTIGUEDADES_DEMO.length],
    antiguedadMin: ANTIGUEDADES_MIN_DEMO[i % ANTIGUEDADES_MIN_DEMO.length],
  };
});

const busquedaValidacion = ref('');
const filtroEstadoValidacion = ref('');
const filtroPrioridadValidacion = ref('');
const forzarVacioValidacion = ref(false);
const paginaValidacion = ref(1);
const TAM_PAGINA_VALIDACION = 10;

const ticketsFiltradosValidacion = computed(() => {
  if (forzarVacioValidacion.value) return [];
  const q = busquedaValidacion.value.trim().toLowerCase();
  return TICKETS_GRANDES.filter((t) => {
    const coincideTexto = !q || t.id.toLowerCase().includes(q) || t.titulo.toLowerCase().includes(q) || t.solicitante.toLowerCase().includes(q);
    const coincideEstado = !filtroEstadoValidacion.value || t.estado === filtroEstadoValidacion.value;
    const coincidePrioridad = !filtroPrioridadValidacion.value || t.prioridad === filtroPrioridadValidacion.value;
    return coincideTexto && coincideEstado && coincidePrioridad;
  });
});

// Orden client-side real (composable compartido, ya usado por las tablas
// reales del sistema) — columna "Antigüedad" ordenable, el resto queda en
// el orden natural de la lista hasta que se hace click en el header.
const { columna: columnaOrdenValidacion, direccion: direccionOrdenValidacion, ordenarPor: ordenarValidacionPor, listaOrdenada: ticketsOrdenadosValidacion } = useOrdenTabla(ticketsFiltradosValidacion);

const ticketsPaginaValidacion = computed(() => {
  const inicio = (paginaValidacion.value - 1) * TAM_PAGINA_VALIDACION;
  return ticketsOrdenadosValidacion.value.slice(inicio, inicio + TAM_PAGINA_VALIDACION);
});

// ── Tabla ITSM con selección (checkbox + acciones masivas) — subconjunto
// fijo, acotado a propósito: esta demo no necesita repetir todo el dataset
// filtrable/paginado de arriba, solo mostrar el patrón de selección. ─────
const TICKETS_SELECCIONABLES = TICKETS_GRANDES.slice(0, 8).map((t) => ({
  ...t,
  // SLA en riesgo: marca localizada (ícono junto al título), nunca la fila
  // entera pintada — ver .sl-sla-flag.
  slaRiesgo: t.prioridad === 'Urgente' && t.estado !== 'Resuelto',
}));

// ── AppButton (PrimeVue Unstyled + Tailwind) — catálogo completo ─────────
const VARIANTES_APPBUTTON = ['solid', 'outline', 'text'];
const SEVERIDADES_APPBUTTON = ['primary', 'secondary', 'danger'];

// ── AppTable (PrimeVue Unstyled + Tailwind) — mock de servidor ───────────
// Reutiliza TICKETS_GRANDES (ya definido arriba para "Validación operativa")
// en vez de armar un tercer dataset ficticio — mismos 25 tickets, ordenados
// y paginados acá con la MISMA forma que un store real
// (stores/crearStorePaginado.js): `orden` es { columna, direccion } o null,
// `ordenarPor(columna)` decide él mismo si alterna o empieza en asc.
const TAM_PAGINA_APPTABLE = 8;
const paginaAppTable = ref(1);
const ordenAppTable = ref(null);
const cargandoAppTable = ref(false);

const filasOrdenadasAppTable = computed(() => {
  if (!ordenAppTable.value) return TICKETS_GRANDES;
  const { columna, direccion } = ordenAppTable.value;
  const factor = direccion === 'asc' ? 1 : -1;
  return [...TICKETS_GRANDES].sort((a, b) => {
    if (a[columna] < b[columna]) return -1 * factor;
    if (a[columna] > b[columna]) return 1 * factor;
    return 0;
  });
});
const filasPaginaAppTable = computed(() => {
  const inicio = (paginaAppTable.value - 1) * TAM_PAGINA_APPTABLE;
  return filasOrdenadasAppTable.value.slice(inicio, inicio + TAM_PAGINA_APPTABLE);
});

// ~400ms de latencia simulada — el `loading` que ve AppTable es real, no un
// spinner de mentira superpuesto sin estado detrás.
function ordenarPorAppTable(columna) {
  cargandoAppTable.value = true;
  setTimeout(() => {
    if (ordenAppTable.value?.columna === columna) {
      ordenAppTable.value = { columna, direccion: ordenAppTable.value.direccion === 'asc' ? 'desc' : 'asc' };
    } else {
      ordenAppTable.value = { columna, direccion: 'asc' };
    }
    paginaAppTable.value = 1;
    cargandoAppTable.value = false;
  }, 400);
}

const seleccionMasiva = ref([]);
const todosSeleccionados = computed(() => TICKETS_SELECCIONABLES.length > 0 && seleccionMasiva.value.length === TICKETS_SELECCIONABLES.length);
const algunoSeleccionado = computed(() => seleccionMasiva.value.length > 0 && !todosSeleccionados.value);

function estaMarcado(id) {
  return seleccionMasiva.value.includes(id);
}
function toggleMarcado(id) {
  const i = seleccionMasiva.value.indexOf(id);
  if (i === -1) seleccionMasiva.value = [...seleccionMasiva.value, id];
  else seleccionMasiva.value = seleccionMasiva.value.filter((x) => x !== id);
}
function toggleTodos() {
  seleccionMasiva.value = todosSeleccionados.value ? [] : TICKETS_SELECCIONABLES.map((t) => t.id);
}
function limpiarSeleccionMasiva() {
  seleccionMasiva.value = [];
}

// El estado "indeterminate" del checkbox "seleccionar todos" no es un
// atributo HTML reflejado — hay que setearlo como propiedad DOM a mano.
const checkTodosRef = ref(null);
watchEffect(() => {
  if (checkTodosRef.value) checkTodosRef.value.indeterminate = algunoSeleccionado.value;
});

// ── Validación operativa — B. Detalle de ticket ───────────────────────────
const TICKET_DETALLE = {
  id: 'TCK-2026-0352',
  titulo: 'Caída intermitente de VPN en sucursal Norte',
  estado: 'En progreso',
  estadoClase: 'badge--warning',
  solicitante: 'Carlos Núñez',
  prioridad: 'Alta',
  prioridadClase: 'badge--warning',
  activo: 'Notebook Dell Latitude 5440 · AC-00231',
  creado: 'Hace 3 horas',
};
const TIMELINE_DETALLE = [
  { titulo: 'Ticket abierto', meta: 'Carlos Núñez · hace 3 h', dot: 'info' },
  { titulo: 'Asignado a Sofía Medina', meta: 'hace 2 h 40 min', dot: 'info' },
  { titulo: 'SLA en riesgo — sin respuesta hace 2 h', meta: 'hace 40 min', dot: 'warning' },
  // 'info', no 'warning': el texto describe una actualización de estado
  // normal ("está en diagnóstico"), no un riesgo — el warning real ya lo
  // comunicó el evento anterior. Warning solo cuando el texto lo justifica.
  { titulo: 'En progreso — diagnóstico de VPN', meta: 'hace 12 min', dot: 'info' },
];
const TICKETS_RELACIONADOS = [
  { id: 'TCK-2026-0298', titulo: 'VPN lenta en sucursal Norte', estado: 'Resuelto', clase: 'badge--success' },
  { id: 'TCK-2026-0310', titulo: 'Certificado VPN vencido', estado: 'En progreso', clase: 'badge--warning' },
];

// ── Validación operativa — C. Dashboard (3 columnas) ──────────────────────
const EMPLEADOS_RECIENTES = [
  { nombre: 'Camila Vidal', area: 'Ventas', fecha: '20/08/2026', iniciales: 'CV' },
  { nombre: 'Franco Molina', area: 'Sistemas', fecha: '19/08/2026', iniciales: 'FM' },
  { nombre: 'Antonella Ponce', area: 'Administración', fecha: '18/08/2026', iniciales: 'AP' },
  { nombre: 'Julián Torres', area: 'Obra Norte', fecha: '17/08/2026', iniciales: 'JT' },
  { nombre: 'Daniela Ríos', area: 'RRHH', fecha: '15/08/2026', iniciales: 'DR' },
];
const PENDIENTES_DASHBOARD = [
  { texto: '3 licencias vencen esta semana', icono: 'ti-clock', tono: 'warning' },
  { texto: '5 tickets urgentes sin asignar', icono: 'ti-alert-triangle', tono: 'danger' },
  { texto: '2 equipos pendientes de devolución', icono: 'ti-device-laptop', tono: 'warning' },
];
const RESUMEN_DASHBOARD = [
  { label: 'Empleados activos', valor: 48 },
  { label: 'Tickets abiertos', valor: 24 },
  { label: 'Licencias activas', valor: 12 },
  { label: 'Equipos asignados', valor: 63 },
];

// ── Auditoría de color — tabla de roles (Ajuste 4, punto 4) ───────────────
const ROLES_COLOR = [
  { rol: 'Botón primario', color: 'brand-600', hex: '#0064E0', detalle: 'fondo sólido, texto blanco (5.39:1)' },
  { rol: 'Botón hover', color: 'brand-700', hex: '#0052B8', detalle: 'fondo sólido, texto blanco (7.24:1)' },
  { rol: 'Link', color: 'brand-600', hex: '#0064E0', detalle: 'texto sobre superficie blanca (5.39:1)' },
  { rol: 'Navegación activa', color: 'brand-600 (texto) + brand-100 (fondo)', hex: '#0064E0 / #E5F2FF', detalle: 'mismo par que --color-accent-text/-subtle' },
  { rol: 'Focus ring', color: 'brand-500', hex: '#0082FB', detalle: 'anillo no-textual, 28% alfa — nunca portador de texto' },
  { rol: 'Fila seleccionada', color: 'accent (borde) + accent-subtle (fondo)', hex: '#0064E0 / #E5F2FF', detalle: 'selección "de marca" — distinta de --color-border-strong, que es la selección neutra. accent-subtle (no brand-50 fijo) porque cambia a rgba(0,130,251,.16) en oscuro; con brand-50 la fila quedaba clara sobre superficie oscura' },
  { rol: 'Badge de información', color: 'info-text / info-bg (NO brand)', hex: '#0E6698 / #E8F4FC', detalle: 'azul de estado, hex propio y distinto del de marca a propósito' },
  { rol: 'Estado success', color: 'success-text / success-bg', hex: '#0F7A4E / #E8F7F0', detalle: 'verde, independiente' },
  { rol: 'Estado warning', color: 'warning-text / warning-bg', hex: '#8F5300 / #FFF4DD', detalle: 'ámbar, independiente' },
  { rol: 'Estado danger', color: 'danger-text / danger-bg', hex: '#A6323C / #FDEBEC', detalle: 'rojo, independiente' },
];
</script>

<template>
  <div class="sl-lab" :class="{ 'sl-oscuro': oscuro }">
    <header class="sl-header">
      <div class="sl-header-titulo">
        <div class="sl-header-marca">
          <img src="/icon_sisti.svg" alt="" class="sl-logo" aria-hidden="true">
          <div>
            <h1>Style Lab — {{ NOMBRE_PRODUCTO }}</h1>
            <p>
              Propuesta de dirección visual (azul #0082FB / #0064E0), aislada en esta página.
              No se modificó <code>main.css</code> ni ninguna pantalla real — todo lo que ves acá
              vive scoped dentro de esta ruta.
            </p>
          </div>
        </div>
        <div class="sl-paleta-activa" aria-label="Paleta activa">
          <span v-for="c in PALETA_ACTIVA" :key="c.hex" class="sl-paleta-chip">
            <span class="sl-paleta-swatch" :style="{ background: c.hex }"></span>
            {{ c.nombre }} <code>{{ c.hex }}</code>
          </span>
        </div>
      </div>
      <button type="button" class="btn" @click="oscuro = !oscuro">
        <i class="ti" :class="oscuro ? 'ti-sun' : 'ti-moon'" aria-hidden="true"></i>
        Vista previa: {{ oscuro ? 'oscuro' : 'claro' }}
      </button>
    </header>

    <nav class="sl-toc" aria-label="Secciones">
      <a v-for="s in SECCIONES" :key="s.id" :href="`#${s.id}`">{{ s.label }}</a>
    </nav>

    <p class="sl-nota sl-nota--info">
      <i class="ti ti-info-circle" aria-hidden="true"></i>
      4 valores de la paleta propuesta no cumplían WCAG AA (4.5:1) tal como se pidieron —
      se oscurecieron levemente, manteniendo el mismo matiz. Cada swatch ajustado lo marca abajo
      con el valor original, el ratio medido y el ratio corregido.
    </p>

    <!-- ═══ 1. Paleta ═══ -->
    <section id="paleta" class="sl-seccion">
      <h2>Paleta</h2>
      <div v-for="g in GRUPOS_PALETA" :key="g.titulo" class="sl-familia">
        <h3>{{ g.titulo }}</h3>
        <div class="sl-swatch-grid">
          <div v-for="it in g.items" :key="it.token" class="sl-swatch-card">
            <div class="sl-swatch-color" :style="{ background: it.hex }"></div>
            <div class="sl-swatch-info">
              <div class="sl-swatch-nombre">{{ it.nombre }}</div>
              <code class="sl-swatch-token">{{ it.token }}</code>
              <code class="sl-swatch-hex">{{ it.hex }}</code>
              <p class="sl-swatch-uso">{{ it.uso }}</p>
              <p v-if="it.ajustado" class="sl-swatch-ajustado">
                <i class="ti ti-alert-triangle" aria-hidden="true"></i>
                Ajustado desde <code>{{ it.ajustado.original }}</code>
                ({{ it.ajustado.ratioOriginal }} → {{ it.ajustado.ratioNuevo }}) — {{ it.ajustado.motivo }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 2. Tipografía ═══ -->
    <section id="tipografia" class="sl-seccion">
      <h2>Tipografía</h2>
      <div class="sl-tipo-tabla">
        <div v-for="t in TIPOGRAFIA" :key="t.nombre" class="sl-tipo-fila">
          <div class="sl-tipo-meta">
            <strong>{{ t.nombre }}</strong>
            <span>{{ t.token }} · {{ t.size }} · peso {{ t.peso }} · lh {{ t.lh }} · {{ t.familia }}</span>
          </div>
          <div class="sl-tipo-ejemplo" :class="t.clase">{{ t.ejemplo }}</div>
        </div>
      </div>
    </section>

    <!-- ═══ 3. Botones ═══ -->
    <section id="botones" class="sl-seccion">
      <h2>Botones</h2>
      <p class="sl-seccion-nota">Hover/focus son reales — pase el mouse o navegue con Tab. Ningún botón de fondo sólido (primary, danger sólido) lleva borde gris: el fondo ya comunica el límite — hallazgo corregido en esta ronda, ver nota en el bloque de estilos.</p>
      <div class="sl-fila-demo">
        <button v-for="b in BOTONES" :key="b.etiqueta" type="button" class="btn" :class="b.clase">
          <i class="ti" :class="b.icono" aria-hidden="true"></i> {{ b.texto }}
        </button>
      </div>
      <h3>Estados fijos</h3>
      <div class="sl-fila-demo">
        <button type="button" class="btn btn-primary" disabled>
          <i class="ti ti-plus" aria-hidden="true"></i> Disabled
        </button>
        <button type="button" class="btn btn-primary" disabled>
          <i class="ti ti-loader-2 spinner-icon" aria-hidden="true"></i> Guardando...
        </button>
        <button type="button" class="btn" disabled>
          <i class="ti ti-download" aria-hidden="true"></i> Secondary disabled
        </button>
        <button type="button" class="btn sl-btn-ghost" disabled>
          <i class="ti ti-filter" aria-hidden="true"></i> Ghost disabled
        </button>
        <button type="button" class="btn btn-danger" disabled>
          <i class="ti ti-trash" aria-hidden="true"></i> Danger soft disabled
        </button>
        <button type="button" class="btn btn-danger-solid" disabled>
          <i class="ti ti-trash" aria-hidden="true"></i> Danger sólido disabled
        </button>
      </div>
      <p class="sl-nota sl-nota--info">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        <strong>Validación explícita de esta ronda</strong> — reposo/hover/foco/disabled cubiertos así:
        primary sólido y danger sólido sin borde gris (fondo transparente propio, ver fila de arriba);
        danger soft con su propio borde semántico (<code>--color-danger-border</code>, no gris genérico);
        secondary con <code>--color-border-default</code>; ghost sin borde en reposo/hover. Tabulá por esta
        fila: el foco de teclado (<code>:focus-visible</code>) se ve en <strong>los seis</strong>, incluidos
        primary y danger sólido — el <code>border-color: transparent</code> que les quita el borde gris
        lleva un <code>:not(:focus-visible)</code> explícito, así que al tabular con la tecla Tab esa regla
        deja de aplicar y gana el foco nativo de <code>main.css</code> (borde de acento + anillo), nunca al revés.
      </p>
    </section>

    <!-- ═══ 4. Badges ═══ -->
    <section id="badges" class="sl-seccion">
      <h2>Badges</h2>
      <p class="sl-seccion-nota">Clases <code>.badge--*</code> reales de main.css — el azul de marca no se usa para ningún estado semántico.</p>
      <div class="sl-fila-demo">
        <span v-for="b in BADGES" :key="b.label" class="badge" :class="b.clase">{{ b.label }}</span>
      </div>
    </section>

    <!-- ═══ 5. Inputs ═══ -->
    <section id="inputs" class="sl-seccion">
      <h2>Inputs</h2>
      <p class="sl-seccion-nota">El buscador usa un espacio ícono↔placeholder constante (<code>--sl-input-icon-size</code> + <code>--sl-input-icon-gap</code> + <code>--sl-input-padding-inline</code>), calculado, no un padding a ojo por componente — mismo criterio en los 2 buscadores de esta página.</p>
      <div class="sl-inputs-grid">
        <div class="form-group">
          <label>Normal</label>
          <input type="text" placeholder="Asunto del ticket">
        </div>
        <div class="form-group">
          <label>Focus (haga clic)</label>
          <input type="text" placeholder="Click acá para ver el anillo de foco">
        </div>
        <div class="form-group">
          <label>Con error</label>
          <input type="text" value="dni-invalido" aria-invalid="true">
          <p class="form-error">El DNI debe tener 8 dígitos.</p>
        </div>
        <div class="form-group">
          <label>Disabled</label>
          <input type="text" value="No editable" disabled>
        </div>
        <div class="form-group">
          <label>Select</label>
          <select>
            <option>Media</option>
            <option>Alta</option>
            <option>Urgente</option>
          </select>
        </div>
        <div class="form-group">
          <label>Búsqueda</label>
          <div class="search-wrap">
            <i class="ti ti-search" aria-hidden="true"></i>
            <input type="text" placeholder="Buscar ticket, empleado...">
          </div>
        </div>
        <div class="form-group full">
          <label>Textarea</label>
          <textarea placeholder="Descripción del incidente..."></textarea>
        </div>
      </div>
    </section>

    <!-- ═══ 6. Cards ═══ -->
    <section id="cards" class="sl-seccion">
      <h2>Cards</h2>
      <div class="sl-cards-grid">
        <div class="card sl-card-pad">
          <div class="sl-fs-card">Card estándar</div>
          <p class="sl-fs-secundario">Superficie blanca, borde sutil completo de 1px, cero sombra en reposo — nunca fondo de color ni borde lateral.</p>
        </div>

        <div class="card">
          <div class="card-toolbar">
            <div class="toolbar-title"><i class="ti ti-list-details" aria-hidden="true"></i> Card con encabezado</div>
          </div>
          <div class="sl-card-pad">
            <p class="sl-fs-secundario">Contenido debajo del toolbar, mismo patrón que las tablas.</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon sl-icon-box sl-icon-box--brand"><i class="ti ti-ticket" aria-hidden="true"></i></div>
          <div class="stat-info">
            <div class="stat-value">24</div>
            <div class="stat-label">Tickets abiertos</div>
          </div>
        </div>

        <div class="card sl-card-pad">
          <div class="sl-alerta-header">
            <div class="sl-icon-box sl-icon-box--warning"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
            <div class="sl-fs-card">Pendientes</div>
          </div>
          <p class="sl-fs-secundario">3 licencias vencen esta semana.</p>
          <p class="sl-seccion-nota" style="margin: 8px 0 0">Alerta vía icon-box warning, no <code>border-left</code> — la card conserva el mismo borde completo y sutil que cualquier otra.</p>
        </div>

        <div class="card">
          <EmptyState icono="ti ti-inbox" titulo="Sin resultados" mensaje="No hay tickets que coincidan con el filtro aplicado.">
            <button type="button" class="btn">Limpiar filtros</button>
          </EmptyState>
        </div>

        <div class="card sl-card-pad sl-card--clicable" tabindex="0" role="button">
          <div class="sl-fs-card"><i class="ti ti-pointer" aria-hidden="true"></i> Card clicable</div>
          <p class="sl-fs-secundario">Sin sombra en reposo — la elevación (<code>--shadow-sm</code>) solo aparece en hover/focus.</p>
        </div>
      </div>
    </section>

    <!-- ═══ 7. Tabla ITSM ═══ -->
    <section id="tabla" class="sl-seccion">
      <h2>Tabla ITSM</h2>
      <p class="sl-seccion-nota">Demo inicial (fila única + skeleton). El patrón ya validado y aprobado —normal + selección múltiple, acciones masivas, orden— vive en <a href="#validacion">Validación operativa → A. Lista de tickets</a>.</p>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Título</th>
                <th>Solicitante</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              <SkeletonTabla v-if="verSkeleton" :columnas="7" :filas="5" />
              <template v-else>
                <tr
                  v-for="t in TICKETS_DEMO"
                  :key="t.id"
                  :class="{ 'sl-fila-seleccionada': t.id === filaSeleccionada }"
                  @click="filaSeleccionada = t.id"
                >
                  <td><code>{{ t.id }}</code></td>
                  <td>{{ t.titulo }}</td>
                  <td>{{ t.solicitante }}</td>
                  <td><span class="badge" :class="t.prioridadClase">{{ t.prioridad }}</span></td>
                  <td><span class="badge" :class="t.estadoClase">{{ t.estado }}</span></td>
                  <td>{{ t.fecha }}</td>
                  <td>
                    <div class="sl-resp">
                      <span class="avatar sm" :class="tonoAvatar(t.responsable)">{{ t.iniciales }}</span>
                      {{ t.responsable }}
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
      <div class="sl-fila-demo" style="margin-top: 12px">
        <button type="button" class="btn" @click="verSkeleton = !verSkeleton">
          {{ verSkeleton ? 'Ver datos' : 'Ver estado de carga (skeleton)' }}
        </button>
        <span class="sl-fs-secundario">Fila con click activa el estado "seleccionada" (fondo <code>--color-accent-subtle</code> + indicador izquierdo <em>inset</em> de 2px en <code>--color-accent</code>, no un <code>border-left</code>). En modo oscuro, la selección usa un tinte azul translúcido para conservar contraste sin introducir una fila clara dentro de la superficie oscura.</span>
      </div>
    </section>

    <!-- ═══ 8. Componentes operativos ═══ -->
    <section id="operativos" class="sl-seccion">
      <h2>Componentes operativos</h2>

      <h3>Avatar</h3>
      <p class="sl-seccion-nota">Una sola familia visual — sólido, color determinista por nombre, mismo tono para la misma persona en toda la página. Los únicos modificadores son de tamaño (<code>sm</code> / base / <code>lg</code>); el color nunca comunica estado ni prioridad.</p>
      <div class="sl-fila-demo">
        <span class="avatar sm" :class="tonoAvatar('Alejandro Guevara')">AG</span>
        <span class="avatar" :class="tonoAvatar('Sofía Medina')">SM</span>
        <span class="avatar lg" :class="tonoAvatar('Martín Silva')">MS</span>
      </div>
      <p class="sl-seccion-nota">Escala categórica completa (5 tonos, ciclo determinista por hash del nombre) + variante neutra para usuarios sin nombre:</p>
      <div class="sl-fila-demo">
        <span class="avatar avatar--azul">AZ</span>
        <span class="avatar avatar--slate">SL</span>
        <span class="avatar avatar--teal">TE</span>
        <span class="avatar avatar--violeta">VI</span>
        <span class="avatar avatar--arena">AR</span>
        <span class="avatar" :class="tonoAvatar('')" aria-label="Usuario sin nombre">
          <i class="ti ti-user" aria-hidden="true"></i>
        </span>
      </div>
      <p class="sl-nota sl-nota--info">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        Se eliminó la distinción entre avatar "plano" (para listas pasivas) y "sólido" (para
        responsables) — trataba el color como si comunicara peso de acción, y no es así: es
        puramente decorativo. Política única ahora: <code>tonoAvatar(nombre)</code> hashea el
        nombre completo a una de 5 clases fijas, así la misma persona cae siempre en el mismo
        tono en cualquier lugar de la página — "Últimos empleados" incluido. Ninguno de los 5
        tonos reutiliza success/warning/danger (son decorativos, no estados) y un nombre vacío
        cae en la variante neutra, no en un tono categórico ni en un color semántico. Tampoco
        queda gradiente: era un efecto que no existe en ningún otro componente del sistema.
      </p>

      <h3>Icon-box (propuesto — consolida los patrones divergentes hoy en Dashboard/Soporte)</h3>
      <div class="sl-fila-demo">
        <div class="sl-icon-box sl-icon-box--brand"><i class="ti ti-ticket" aria-hidden="true"></i></div>
        <div class="sl-icon-box sl-icon-box--success"><i class="ti ti-check" aria-hidden="true"></i></div>
        <div class="sl-icon-box sl-icon-box--warning"><i class="ti ti-clock" aria-hidden="true"></i></div>
        <div class="sl-icon-box sl-icon-box--danger"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
        <div class="sl-icon-box sl-icon-box--info"><i class="ti ti-info-circle" aria-hidden="true"></i></div>
      </div>

      <h3>Toast</h3>
      <div class="sl-fila-demo sl-fila-demo--col">
        <div v-for="t in TOASTS" :key="t.clase" class="toast" :class="t.clase" style="position: static">
          <i class="ti" :class="t.icono" aria-hidden="true"></i> {{ t.texto }}
        </div>
      </div>

      <h3>Modal</h3>
      <button type="button" class="btn" @click="modalAbierto = true">Abrir modal de ejemplo</button>
      <Modal v-if="modalAbierto" titulo="Cerrar ticket" size="sm" @close="modalAbierto = false">
        <p class="sl-fs-body">¿Confirma que el ticket TCK-2026-0341 quedó resuelto?</p>
        <template #acciones>
          <button type="button" class="btn" @click="modalAbierto = false">Cancelar</button>
          <button type="button" class="btn btn-primary" @click="modalAbierto = false">Confirmar</button>
        </template>
      </Modal>

      <h3>Timeline</h3>
      <p class="sl-seccion-nota">Warning solo cuando el texto describe un riesgo real (bloqueo, SLA, vencimiento, atención requerida); danger para error/rechazo/incidente crítico; success para resolución o acción confirmada. Un evento informativo normal (apertura, asignación, comentario, diagnóstico iniciado) usa <code>info</code>, nunca warning como "color interesante".</p>
      <p class="sl-nota sl-nota--info">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        <strong>El badge comunica estado de dominio; el timeline comunica tipo de evento. No tienen que compartir color automáticamente.</strong>
        Un ticket "En progreso" puede mostrar un badge <code>warning</code> (esa es la convención real del sistema, ver <code>dominio-tickets.js</code>) mientras el evento de timeline que registra ese mismo cambio es <code>info</code> — porque el badge describe dónde está el ticket AHORA, y el timeline describe qué clase de cosa PASÓ en ese momento (una actualización normal, no un riesgo). Ver el badge "En progreso" en la sección Badges y compararlo con el punto info del historial de abajo.
      </p>
      <div class="timeline sl-timeline-demo">
        <div class="timeline-item">
          <span class="timeline-dot timeline-dot--info"></span>
          <div class="timeline-content">
            <div class="timeline-title">Ticket abierto</div>
            <div class="timeline-meta">Marta Ibáñez · 22/08/2026, 09:14</div>
          </div>
        </div>
        <div class="timeline-item">
          <span class="timeline-dot timeline-dot--info"></span>
          <div class="timeline-content">
            <div class="timeline-title">En progreso</div>
            <div class="timeline-meta">Asignado a Sofía Medina · 22/08/2026, 10:02</div>
          </div>
        </div>
        <div class="timeline-item">
          <span class="timeline-dot timeline-dot--success"></span>
          <div class="timeline-content">
            <div class="timeline-title">Resuelto</div>
            <div class="timeline-meta">22/08/2026, 14:30</div>
          </div>
        </div>
      </div>

      <h3>Barra de capacidad</h3>
      <div class="capacity" style="max-width: 200px">
        <div class="capacity-bar"><div class="capacity-fill capacity-fill--warning" style="width: 80%"></div></div>
        <span class="capacity-label">4/5 asientos usados</span>
      </div>

      <h3>Paginación</h3>
      <Pagination v-model="paginaDemo" :total-items="94" :page-size="20" />

      <h3>Navegación (ítem activo)</h3>
      <p class="sl-seccion-nota">Mismos tokens que <code>.sb-nav-item.is-activo</code> real: fondo <code>--color-accent-subtle</code>, texto <code>--color-accent-text</code> (brand-600, no brand-500).</p>
      <div class="sl-nav-demo">
        <a v-for="n in NAV_DEMO" :key="n.label" href="#" class="sl-nav-item" :class="{ 'sl-nav-item--activo': n.activo }" @click.prevent>
          <i class="ti" :class="n.icono" aria-hidden="true"></i> {{ n.label }}
        </a>
      </div>

      <h3>Menú contextual / dropdown</h3>
      <p class="sl-seccion-nota">Única capa de esta página que usa <code>--shadow-overlay</code> — el resto de los contenedores (cards, tabla) queda sin sombra permanente.</p>
      <div class="sl-popover">
        <div class="sl-popover-item"><i class="ti ti-edit" aria-hidden="true"></i> Editar</div>
        <div class="sl-popover-item"><i class="ti ti-user-check" aria-hidden="true"></i> Reasignar</div>
        <div class="sl-popover-item"><i class="ti ti-trash" aria-hidden="true"></i> Eliminar</div>
      </div>
    </section>

    <!-- ═══ 9. Pantalla de ejemplo ═══ -->
    <section id="pantalla" class="sl-seccion">
      <h2>Pantalla de ejemplo</h2>
      <p class="sl-seccion-nota">Composición de Dashboard armada solo con los componentes de arriba.</p>
      <div class="sl-pantalla">
        <div class="sl-pantalla-header">
          <div class="sl-fs-pagina">Dashboard</div>
          <div class="sl-fila-demo">
            <button type="button" class="btn">Exportar</button>
            <button type="button" class="btn btn-primary"><i class="ti ti-plus" aria-hidden="true"></i> Nuevo ticket</button>
          </div>
        </div>

        <div class="sl-pantalla-kpis">
          <div class="stat-card">
            <div class="stat-icon sl-icon-box sl-icon-box--info"><i class="ti ti-ticket" aria-hidden="true"></i></div>
            <div class="stat-info"><div class="stat-value">24</div><div class="stat-label">Tickets abiertos</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon sl-icon-box sl-icon-box--warning"><i class="ti ti-clock" aria-hidden="true"></i></div>
            <div class="stat-info"><div class="stat-value">9</div><div class="stat-label">En progreso</div></div>
          </div>
          <div class="stat-card">
            <div class="stat-icon sl-icon-box sl-icon-box--success"><i class="ti ti-check" aria-hidden="true"></i></div>
            <div class="stat-info"><div class="stat-value">15</div><div class="stat-label">Resueltos hoy</div></div>
          </div>
        </div>

        <div class="card sl-card-pad">
          <div class="sl-alerta-header">
            <div class="sl-icon-box sl-icon-box--warning"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
            <div class="sl-fs-card">Pendientes</div>
          </div>
          <p class="sl-fs-secundario">3 licencias vencen esta semana · 5 tickets sin asignar</p>
        </div>

        <div class="card">
          <div class="card-toolbar">
            <div class="toolbar-title">Tickets recientes</div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Ticket</th><th>Título</th><th>Estado</th><th>Responsable</th></tr>
              </thead>
              <tbody>
                <tr v-for="t in TICKETS_DEMO.slice(0, 3)" :key="t.id">
                  <td><code>{{ t.id }}</code></td>
                  <td>{{ t.titulo }}</td>
                  <td><span class="badge" :class="t.estadoClase">{{ t.estado }}</span></td>
                  <td>
                    <div class="sl-resp">
                      <span class="avatar sm" :class="tonoAvatar(t.responsable)">{{ t.iniciales }}</span>
                      {{ t.responsable }}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 10. Auditoría de color ═══ -->
    <section id="auditoria" class="sl-seccion">
      <h2>Auditoría de color</h2>
      <div class="sl-auditoria-bloque">
        <h3>1. Dónde se usa brand-500 (#0082FB)</h3>
        <p class="sl-fs-secundario">Únicamente en <code>--color-focus</code>/<code>--color-focus-ring</code> (anillo de foco, no-textual). No aparece en ningún texto, badge, fondo con texto encima ni avatar — es el hallazgo central de la validación anterior: brand-500 falla AA como texto (3.76:1). El avatar dejó de usar gradiente (ver sección Avatar en "Componentes operativos"), así que ya no consume brand-500 en absoluto.</p>

        <h3>2. Dónde se usa brand-600 (#0064E0)</h3>
        <p class="sl-fs-secundario">Fondo de <code>.btn-primary</code>, <code>--color-text-link</code>, <code>--color-accent-text</code> (texto/ícono de navegación activa, hover de enlace), indicador de la fila seleccionada y borde de foco de inputs/botones/selects (junto con el anillo, nunca reemplazándolo). El avatar ya no consume brand-600: su escala de tonos es decorativa e independiente, ver punto 3.</p>

        <h3>3. Qué queda neutro a propósito</h3>
        <p class="sl-fs-secundario">Bordes de card/tabla/modal (grises — nunca azules), hover de fila de tabla (<code>--color-bg-hover</code>, gris), estados disabled, y la columna "Resumen" del dashboard de validación (números neutros, sin color ni icon-box). La escala del avatar (azul/slate/teal/violeta/arena + neutro) tampoco es brand ni semántica — es decorativa y determinista, la misma política para cualquier persona en la página, sin distinguir "identidad con peso de acción" de identidad neutra: eso ya no existe como concepto.</p>

        <h3>4. Rol → color</h3>
        <div class="sl-auditoria-tabla">
          <div class="sl-auditoria-fila sl-auditoria-fila--header">
            <span>Rol</span><span>Token</span><span>Hex</span><span>Detalle</span>
          </div>
          <div v-for="r in ROLES_COLOR" :key="r.rol" class="sl-auditoria-fila">
            <span class="sl-fs-body">{{ r.rol }}</span>
            <code>{{ r.color }}</code>
            <code>{{ r.hex }}</code>
            <span class="sl-fs-metadata">{{ r.detalle }}</span>
          </div>
        </div>

        <h3>5. Texto normal sobre blanco con brand-500</h3>
        <p class="sl-fs-secundario">Confirmado que no hay ninguno: brand-500 sobre blanco mide 3.76:1, bajo AA (4.5:1) — por eso todo texto/ícono con significado (link, navegación activa, botón primario) usa brand-600 (5.39:1) o brand-700 (7.24:1), nunca brand-500.</p>

        <h3>6. Colores hardcodeados fuera de tokens</h3>
        <p class="sl-fs-secundario">Cero, con una única excepción a propósito: los swatches de la sección "Paleta" y los chips del encabezado (<code>:style="{ background: it.hex }"</code>) — ahí el hex literal ES el contenido a mostrar, no una decisión de estilo. Todo lo demás (cada clase del <code>&lt;style&gt;</code> y cada <code>:style</code> del resto del template) pasa por <code>var(--color-*)</code>.</p>
      </div>
    </section>

    <!-- ═══ 11. Validación operativa ═══ -->
    <section id="validacion" class="sl-seccion">
      <h2>Validación operativa</h2>
      <p class="sl-seccion-nota">Tres composiciones estáticas, con datos ficticios pero realistas, armadas exclusivamente con los tokens y componentes de arriba.</p>

      <h3>A. Lista de tickets</h3>
      <p class="sl-nota sl-nota--ok">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        Dirección de tablas ITSM aprobada — este patrón (normal + selección múltiple) queda como
        <strong>candidato para la migración real de <code>TicketsView.vue</code></strong>. Todavía no se portó:
        sigue siendo solo esta preview.
      </p>
      <p class="sl-seccion-nota">Dos estados del mismo patrón de tabla ITSM: lectura/navegación (normal) y selección múltiple para acciones masivas. Ninguno de los dos usa azul como borde, fondo de header o decoración repetida por fila — el azul aparece solo donde comunica algo (link, orden activo, selección, foco).</p>

      <h4>1. Tabla ITSM — normal</h4>
      <div class="card">
        <div class="filters">
          <div class="search-wrap">
            <i class="ti ti-search" aria-hidden="true"></i>
            <input v-model="busquedaValidacion" type="text" placeholder="Buscar por ticket, título o solicitante...">
          </div>
          <div class="filter-field">
            <label>Estado</label>
            <select v-model="filtroEstadoValidacion">
              <option value="">Todos</option>
              <option v-for="e in ESTADOS_DEMO" :key="e.l" :value="e.l">{{ e.l }}</option>
            </select>
          </div>
          <div class="filter-field">
            <label>Prioridad</label>
            <select v-model="filtroPrioridadValidacion">
              <option value="">Todas</option>
              <option v-for="p in PRIORIDADES_DEMO" :key="p.l" :value="p.l">{{ p.l }}</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Título</th>
                <th>Solicitante</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Responsable</th>
                <ThOrdenable clave="antiguedadMin" :columna="columnaOrdenValidacion" :direccion="direccionOrdenValidacion" @ordenar="ordenarValidacionPor">Antigüedad</ThOrdenable>
              </tr>
            </thead>
            <tbody>
              <tr v-if="ticketsPaginaValidacion.length === 0">
                <td colspan="7" class="sl-vacio-compacto">
                  <i class="ti ti-inbox" aria-hidden="true"></i> Sin tickets que coincidan con la búsqueda o los filtros aplicados.
                </td>
              </tr>
              <tr v-for="t in ticketsPaginaValidacion" :key="t.id">
                <td><code>{{ t.id }}</code></td>
                <td><a href="#" class="sl-ticket-link" @click.prevent>{{ t.titulo }}</a></td>
                <td>{{ t.solicitante }}</td>
                <td><span class="badge" :class="t.prioridadClase">{{ t.prioridad }}</span></td>
                <td><span class="badge" :class="t.estadoClase">{{ t.estado }}</span></td>
                <td>
                  <div class="sl-resp">
                    <span class="avatar sm" :class="tonoAvatar(t.responsable)">{{ t.iniciales }}</span>
                    {{ t.responsable }}
                  </div>
                </td>
                <td class="sl-fs-secundario">{{ t.antiguedad }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination v-model="paginaValidacion" :total-items="ticketsFiltradosValidacion.length" :page-size="TAM_PAGINA_VALIDACION" />
      </div>
      <div class="sl-fila-demo" style="margin-top: 12px">
        <button type="button" class="btn" @click="forzarVacioValidacion = !forzarVacioValidacion">
          {{ forzarVacioValidacion ? 'Ver tickets' : 'Simular estado vacío' }}
        </button>
        <span class="sl-fs-secundario">25 filas ficticias · búsqueda/filtros reales (client-side) · "Antigüedad" ordenable (<code>ThOrdenable</code> + <code>useOrdenTabla</code> reales) · título enlazable con <code>--color-text-link</code>.</span>
      </div>

      <h4>2. Tabla ITSM — con selección</h4>
      <p class="sl-seccion-nota">Checkbox por fila + "seleccionar todos" en el header (con estado indeterminado real). La fila marcada usa <code>--color-accent-subtle</code> de fondo + un indicador izquierdo <em>inset</em> de 2px en <code>--color-accent</code> (respeta la regla vigente "ningún borde/acento estructural supera 2px", sin crear una excepción nueva para tablas) — nunca un borde alrededor de las 4 celdas. La barra de acciones masivas queda siempre visible (no aparece de golpe al seleccionar): superficie neutra, CTAs deshabilitados hasta que hay selección, "Cerrar" recupera <code>.btn-danger</code> recién con selección activa.</p>
      <div class="card">
        <div class="sl-bulkbar">
          <span class="sl-fs-body">
            {{ seleccionMasiva.length > 0
              ? `${seleccionMasiva.length} ticket${seleccionMasiva.length === 1 ? '' : 's'} seleccionado${seleccionMasiva.length === 1 ? '' : 's'}`
              : 'Seleccione tickets para habilitar acciones' }}
          </span>
          <div class="sl-fila-demo">
            <button type="button" class="btn" :disabled="seleccionMasiva.length === 0">Asignar</button>
            <button type="button" class="btn" :disabled="seleccionMasiva.length === 0">Cambiar prioridad</button>
            <button
              type="button"
              class="btn"
              :class="{ 'btn-danger': seleccionMasiva.length > 0 }"
              :disabled="seleccionMasiva.length === 0"
            >Cerrar</button>
            <button v-if="seleccionMasiva.length > 0" type="button" class="btn sl-btn-ghost" @click="limpiarSeleccionMasiva">Limpiar selección</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sl-th-check">
                  <input
                    ref="checkTodosRef"
                    type="checkbox"
                    :checked="todosSeleccionados"
                    aria-label="Seleccionar todos los tickets"
                    @change="toggleTodos"
                  >
                </th>
                <th>Ticket</th>
                <th>Título</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Responsable</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in TICKETS_SELECCIONABLES" :key="t.id" :class="{ 'sl-fila-marcada': estaMarcado(t.id) }">
                <td class="sl-th-check">
                  <input
                    type="checkbox"
                    :checked="estaMarcado(t.id)"
                    :aria-label="`Seleccionar ${t.id}`"
                    @change="toggleMarcado(t.id)"
                  >
                </td>
                <td><code>{{ t.id }}</code></td>
                <td>
                  <a href="#" class="sl-ticket-link" @click.prevent>{{ t.titulo }}</a>
                  <i v-if="t.slaRiesgo" class="ti ti-alert-triangle sl-sla-flag" role="img" aria-label="SLA en riesgo" title="SLA en riesgo"></i>
                </td>
                <td><span class="badge" :class="t.prioridadClase">{{ t.prioridad }}</span></td>
                <td><span class="badge" :class="t.estadoClase">{{ t.estado }}</span></td>
                <td>
                  <div class="sl-resp">
                    <span class="avatar sm" :class="tonoAvatar(t.responsable)">{{ t.iniciales }}</span>
                    {{ t.responsable }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h3>B. Detalle de ticket</h3>
      <div class="sl-detalle">
        <div class="sl-detalle-header">
          <div>
            <div class="sl-fs-metadata"><code>{{ TICKET_DETALLE.id }}</code> · {{ TICKET_DETALLE.creado }}</div>
            <div class="sl-detalle-titulo">
              <span class="sl-fs-seccion">{{ TICKET_DETALLE.titulo }}</span>
              <span class="badge" :class="TICKET_DETALLE.estadoClase">{{ TICKET_DETALLE.estado }}</span>
            </div>
          </div>
          <div class="sl-fila-demo">
            <button type="button" class="btn btn-primary">Resolver ticket</button>
            <button type="button" class="btn">Reasignar</button>
            <button type="button" class="btn sl-btn-ghost">Cerrar sin resolver</button>
          </div>
        </div>

        <div class="sl-detalle-meta">
          <div><span class="sl-fs-metadata">Solicitante</span><div class="sl-fs-body">{{ TICKET_DETALLE.solicitante }}</div></div>
          <div><span class="sl-fs-metadata">Prioridad</span><div><span class="badge" :class="TICKET_DETALLE.prioridadClase">{{ TICKET_DETALLE.prioridad }}</span></div></div>
          <div><span class="sl-fs-metadata">Activo vinculado</span><div class="sl-fs-body">{{ TICKET_DETALLE.activo }}</div></div>
        </div>

        <div class="card sl-card-pad">
          <div class="sl-alerta-header">
            <div class="sl-icon-box sl-icon-box--warning"><i class="ti ti-alert-triangle" aria-hidden="true"></i></div>
            <div class="sl-fs-card">SLA en riesgo</div>
          </div>
          <p class="sl-fs-secundario">Sin respuesta hace más de 2 horas — prioridad Alta.</p>
        </div>

        <div class="sl-detalle-grid">
          <div class="sl-detalle-principal">
            <h4>Historial</h4>
            <div class="timeline">
              <div v-for="ev in TIMELINE_DETALLE" :key="ev.titulo" class="timeline-item">
                <span class="timeline-dot" :class="`timeline-dot--${ev.dot}`"></span>
                <div class="timeline-content">
                  <div class="timeline-title">{{ ev.titulo }}</div>
                  <div class="timeline-meta">{{ ev.meta }}</div>
                </div>
              </div>
            </div>

            <h4>Agregar comentario</h4>
            <div class="form-group">
              <textarea placeholder="Escriba una actualización para el solicitante..."></textarea>
            </div>
            <button type="button" class="btn">Comentar</button>
          </div>

          <div class="sl-detalle-sidebar">
            <div class="card sl-card-pad">
              <div class="sl-fs-card">Tickets relacionados</div>
              <div v-for="r in TICKETS_RELACIONADOS" :key="r.id" class="sl-relacionado">
                <code>{{ r.id }}</code>
                <span class="sl-fs-secundario">{{ r.titulo }}</span>
                <span class="badge" :class="r.clase">{{ r.estado }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3>C. Dashboard</h3>
      <div class="sl-dashboard-3col">
        <div class="card sl-card-pad">
          <div class="sl-fs-card">Últimos empleados</div>
          <div v-for="e in EMPLEADOS_RECIENTES" :key="e.nombre" class="sl-empleado-fila">
            <span class="avatar sm" :class="tonoAvatar(e.nombre)">{{ e.iniciales }}</span>
            <div>
              <div class="sl-fs-body">{{ e.nombre }}</div>
              <div class="sl-fs-metadata">{{ e.area }} · {{ e.fecha }}</div>
            </div>
          </div>
        </div>

        <div class="card sl-card-pad">
          <div class="sl-fs-card">Pendientes</div>
          <div v-for="p in PENDIENTES_DASHBOARD" :key="p.texto" class="sl-pendiente-fila">
            <div class="sl-icon-box" :class="`sl-icon-box--${p.tono}`"><i class="ti" :class="p.icono" aria-hidden="true"></i></div>
            <span class="sl-fs-secundario">{{ p.texto }}</span>
          </div>
        </div>

        <div class="card sl-card-pad">
          <div class="sl-fs-card">Resumen</div>
          <div v-for="r in RESUMEN_DASHBOARD" :key="r.label" class="sl-resumen-fila">
            <span class="sl-fs-secundario">{{ r.label }}</span>
            <span class="sl-resumen-valor">{{ r.valor }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ═══ 12. Elevación y superficies ═══ -->
    <section id="elevacion" class="sl-seccion">
      <h2>Elevación y superficies</h2>
      <p class="sl-nota sl-nota--info">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        Cierre de la decisión de elevación del Design System, antes de portar tokens a
        <code>main.css</code>. Comparación lado a lado: superficies normales (sin sombra),
        clicables (sombra solo en hover/focus) y capas realmente elevadas (dropdown, modal).
      </p>

      <div class="sl-elevacion-grid">
        <div>
          <h4>A. Card normal</h4>
          <p class="sl-seccion-nota">Reposo y hover: idénticos. Cero <code>box-shadow</code>.</p>
          <div class="card sl-card-pad">
            <div class="sl-fs-card">TCK-2026-0341</div>
            <p class="sl-fs-secundario">No enciende monitor secundario — reportado por Marta Ibáñez.</p>
            <span class="sl-fs-metadata">Actualizado hace 12 minutos</span>
          </div>
        </div>

        <div>
          <h4>B. Card clicable</h4>
          <p class="sl-seccion-nota">Hover: borde <code>--color-border-default</code> + <code>shadow-sm</code>. Foco: anillo <code>--color-focus-ring</code>. Sin botón — la card entera es la acción, no la justifica un <code>.btn-primary</code> propio.</p>
          <div class="card sl-card-pad sl-card--clicable" tabindex="0" role="button" aria-label="Ver ticket TCK-2026-0338">
            <div class="sl-card-clicable-fila">
              <div>
                <div class="sl-fs-card">TCK-2026-0338</div>
                <p class="sl-fs-secundario">Solicitud de acceso a VPN — Carlos Núñez.</p>
                <span class="sl-fs-metadata">Actualizado hace 45 minutos</span>
              </div>
              <i class="ti ti-chevron-right sl-card-clicable-chevron" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <h4>C. Tabla operativa</h4>
      <p class="sl-seccion-nota">Borde exterior y separadores <code>--color-border-subtle</code>. Sin sombra en reposo — confirmalo pasando el mouse: no aparece ninguna.</p>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Ticket</th><th>Título</th><th>Estado</th><th>Responsable</th></tr>
            </thead>
            <tbody>
              <tr v-for="t in TICKETS_DEMO.slice(0, 3)" :key="t.id">
                <td><code>{{ t.id }}</code></td>
                <td><a href="#" class="sl-ticket-link" @click.prevent>{{ t.titulo }}</a></td>
                <td><span class="badge" :class="t.estadoClase">{{ t.estado }}</span></td>
                <td>
                  <div class="sl-resp">
                    <span class="avatar sm" :class="tonoAvatar(t.responsable)">{{ t.iniciales }}</span>
                    {{ t.responsable }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h4>D. Dropdown / menú contextual</h4>
      <p class="sl-seccion-nota">
        Único consumidor de <code>--shadow-overlay</code>. Abre/cierra de verdad, con la misma lógica
        de <code>MenuAcciones.vue</code> real (Escape, click afuera, foco de vuelta al botón) — ver
        nota de por qué no se importó el componente literal en el comentario del script.
      </p>
      <div class="sl-dropdown-wrap">
        <button
          ref="menuAccionesBtnRef"
          type="button"
          class="btn"
          aria-haspopup="menu"
          :aria-expanded="menuAccionesAbierto"
          @click="alternarMenuAcciones"
        >
          <i class="ti ti-dots-vertical" aria-hidden="true"></i> Acciones
        </button>
        <div v-if="menuAccionesAbierto" ref="menuAccionesPanelRef" class="sl-popover sl-popover--flotante" role="menu" aria-label="Acciones">
          <button type="button" class="sl-popover-item" role="menuitem" @click="cerrarMenuAcciones">
            <i class="ti ti-user-check" aria-hidden="true"></i> Reasignar
          </button>
          <button type="button" class="sl-popover-item" role="menuitem" @click="cerrarMenuAcciones">
            <i class="ti ti-edit" aria-hidden="true"></i> Cambiar prioridad
          </button>
          <div class="sl-popover-sep" role="separator"></div>
          <button type="button" class="sl-popover-item sl-popover-item--danger" role="menuitem" @click="cerrarMenuAcciones">
            <i class="ti ti-trash" aria-hidden="true"></i> Cerrar ticket
          </button>
        </div>
      </div>

      <h4>E. Modal</h4>
      <p class="sl-seccion-nota">Reutiliza <code>Modal.vue</code> real. Overlay con <code>.modal-bg</code> compartido (sin token de sombra propio, es un scrim de color). El panel usa <code>--shadow-overlay</code> — alias de <code>--shadow-overlay</code>, ver nota en el bloque de tokens.</p>
      <button type="button" class="btn" @click="modalElevacionAbierto = true">Abrir modal de ejemplo</button>
      <Modal v-if="modalElevacionAbierto" titulo="Reasignar ticket" size="sm" @close="modalElevacionAbierto = false">
        <div class="form-group">
          <label>Nuevo responsable</label>
          <select>
            <option>Sofía Medina</option>
            <option>Martín Silva</option>
          </select>
        </div>
        <template #acciones>
          <button type="button" class="btn" @click="modalElevacionAbierto = false">Cancelar</button>
          <button type="button" class="btn btn-primary" @click="modalElevacionAbierto = false">Reasignar</button>
        </template>
      </Modal>

      <h4>F. Toast</h4>
      <p class="sl-seccion-nota">Segundo consumidor de <code>--shadow-overlay</code>, junto al dropdown — el plan de migración (G4) lo suma explícitamente: hoy <code>.toast</code> no lleva ninguna sombra en <code>main.css</code>, se ve "pegado" a lo que tiene detrás en vez de flotar sobre la página.</p>
      <div class="sl-fila-demo sl-fila-demo--col">
        <div class="toast toast-info" style="position: static">
          <i class="ti ti-info-circle" aria-hidden="true"></i> Se sincronizaron los datos
        </div>
      </div>

      <p class="sl-nota sl-nota--ok" style="margin-top: 24px">
        <i class="ti ti-circle-check" aria-hidden="true"></i>
        Recomendación: la diferencia entre A y B se percibe con claridad sin fondo azul —
        el cursor pointer, el leve endurecimiento del borde y la sombra de 1px al pasar el mouse
        (más el anillo de foco al navegar con teclado) alcanzan como affordance. Detalle completo
        en la respuesta del chat.
      </p>
    </section>

    <!-- ═══ 13. AppButton — PrimeVue Unstyled + Tailwind ═══ -->
    <section id="app-button" class="sl-seccion">
      <h2>AppButton — PrimeVue Unstyled + Tailwind</h2>
      <p class="sl-seccion-nota">
        Catálogo real de <code>components/ui/AppButton.vue</code> — documentación viva: cada botón
        de abajo es el componente real, no una maqueta. Si <code>pt/button.pt.js</code> cambia,
        esta grilla cambia sola.
      </p>

      <div v-for="variante in VARIANTES_APPBUTTON" :key="variante" class="mb-8">
        <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Variante: {{ variante }}</h3>
        <div class="flex flex-wrap items-center gap-3">
          <AppButton
            v-for="severity in SEVERIDADES_APPBUTTON"
            :key="severity"
            :label="severity"
            :severity="severity"
            :variant="variante"
          />
        </div>
      </div>

      <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Tamaños</h3>
      <div class="mb-8 flex flex-wrap items-center gap-3">
        <AppButton label="Small" size="sm" />
        <AppButton label="Medium" size="md" />
        <AppButton label="Large" size="lg" />
      </div>

      <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Con ícono</h3>
      <p class="sl-seccion-nota">
        El ícono es agnóstico de librería (prop <code>icon</code>, cualquier clase CSS) — todavía
        no hay iconografía decidida para el sistema (ver <code>docs/NOTAS-DISENO-ANTERIOR.md</code>),
        estos dos ejemplos usan <code>ti ti-*</code> solo a título ilustrativo.
      </p>
      <div class="mb-8 flex flex-wrap items-center gap-3">
        <AppButton label="Nuevo ticket" icon="ti ti-plus" />
        <AppButton label="Exportar" icon="ti ti-download" icon-pos="right" variant="outline" />
      </div>

      <h3 class="mb-3 text-xs font-medium uppercase tracking-wide text-gray-500">Estados interactivos</h3>
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <AppButton label="Disabled" disabled />
        <AppButton label="Danger disabled" severity="danger" disabled />
        <AppButton label="Guardando..." loading />
      </div>
      <div class="max-w-xs">
        <AppButton label="Ancho completo (block)" block />
      </div>
    </section>

    <!-- ═══ 14. AppTable — PrimeVue Unstyled + Tailwind ═══ -->
    <section id="app-table" class="sl-seccion">
      <h2>AppTable — PrimeVue Unstyled + Tailwind</h2>
      <p class="sl-seccion-nota">
        Catálogo real de <code>components/ui/AppTable.vue</code> + <code>AppColumn</code>
        (<code>components/ui/AppColumn.js</code> es un re-export, no un wrapper — el porqué está
        comentado en ese archivo). Orden y paginación de abajo simulan el contrato exacto de
        <code>stores/crearStorePaginado.js</code>: <code>@ordenar</code> dispara un
        <code>ordenarPor(columna)</code> local con ~400ms de latencia real (el <code>loading</code>
        que ve la tabla no es un spinner de mentira), y la paginación usa
        <code>components/shared/Pagination.vue</code> — el mismo componente que ya paginan los 7
        listados reales, no uno nuevo.
      </p>
      <div class="card">
        <AppTable
          :value="filasPaginaAppTable"
          :loading="cargandoAppTable"
          :total-records="TICKETS_GRANDES.length"
          :rows="TAM_PAGINA_APPTABLE"
          :sort-field="ordenAppTable?.columna ?? null"
          :sort-order="ordenAppTable?.direccion === 'desc' ? -1 : ordenAppTable?.direccion === 'asc' ? 1 : null"
          @ordenar="ordenarPorAppTable"
        >
          <AppColumn field="id" header="Ticket" />
          <AppColumn field="titulo" header="Título" sortable />
          <AppColumn field="solicitante" header="Solicitante" />
          <AppColumn field="prioridad" header="Prioridad" />
          <AppColumn field="estado" header="Estado" />
          <AppColumn field="responsable" header="Responsable" />
          <AppColumn field="antiguedadMin" header="Antigüedad" sortable>
            <template #body="{ data }">{{ data.antiguedad }}</template>
          </AppColumn>
        </AppTable>
      </div>
      <div class="sl-fila-demo" style="margin-top: 12px">
        <Pagination v-model="paginaAppTable" :total-items="TICKETS_GRANDES.length" :page-size="TAM_PAGINA_APPTABLE" />
        <span class="sl-fs-secundario">
          Clic en "Título" o "Antigüedad" para ordenar de verdad (server-side simulado).
        </span>
      </div>
    </section>
  </div>
</template>


