// Carga del expediente del empleado: la ficha y, aparte, lo que cada módulo
// aporta (cuentas, equipos, licencias, entregas, tickets, solicitudes, actas,
// hoja de vida).
//
// Reglas que esta capa hace cumplir:
//   · Cada fuente se pide SOLO si el usuario tiene su módulo
//     (`auth.puedeVerModulo`). Sin permiso la sección no aparece y la fuente no
//     se consulta: nunca un error ni un vacío engañoso (la RLS devolvería filas
//     vacías, y "sin cuentas" no es lo mismo que "no puede verlas").
//   · Una fuente que falla no tumba el expediente: queda vacía y se avisa UNA
//     vez ("no se pudo cargar una parte"). Solo la ficha es indispensable.
//   · El libro de movimientos se carga aparte (`cargarLibro`) y después de la
//     primera pintura: son las lecturas más pesadas y nadie las necesita para
//     empezar a trabajar con la carátula y la custodia.
import { computed, ref } from 'vue';
import { insforgeApi } from '../../api/insforge.js';
import { traducirErrorDb } from '../../api/erroresDb.js';
import { useAuthStore } from '../../stores/auth.js';
import { useCuentasStore } from '../../stores/cuentas.js';
import { showToast } from '../../core/toast.js';
import { armarLibroEmpleado, fechaDeBaja } from './libroEmpleado.js';

export function useExpedienteEmpleado(obtenerId) {
  const auth = useAuthStore();
  const cuentasStore = useCuentasStore();

  const empleado = ref(null);
  const equipos = ref([]);
  const licencias = ref([]);
  const entregas = ref([]);
  const tickets = ref([]);
  // Solicitudes de servicio de la persona (migración 108), con sus pasos: de ahí
  // sale la guía de alta y la sección «Solicitudes».
  const solicitudes = ref([]);
  const actas = ref([]);
  const ultimaRevision = ref(null);
  const cargando = ref(true);
  // La lectura de la ficha falló (red, permisos): distinto de "no existe".
  const errorFicha = ref(false);

  // Hoja de vida y fuentes del libro.
  const eventos = ref([]);
  const fuentesLibro = ref({});
  const nombresStaff = ref({});
  const libroCargando = ref(false);

  // Permisos por módulo (cosmético: la barrera es la RLS y las RPC).
  const puedeCorreos = computed(() => auth.puedeVerModulo('correos'));
  const puedeEquipos = computed(() => auth.puedeVerModulo('equipos'));
  const puedeLicencias = computed(() => auth.puedeVerModulo('licencias'));
  const puedeTickets = computed(() => auth.puedeVerModulo('tickets'));
  // Las solicitudes comparten el módulo `empleados` (no hay uno propio).
  const puedeSolicitudes = computed(() => auth.puedeVerModulo('empleados'));

  const cuentasCargadas = computed(() => cuentasStore.empleadoActual === obtenerId());

  // Aviso único si alguna fuente opcional falla.
  function avisarFallos(resultados) {
    const fallo = resultados.find((r) => r.status === 'rejected');
    if (fallo) showToast(traducirErrorDb(fallo.reason, { porDefecto: 'No se pudo cargar una parte del expediente.' }).mensaje, 'error');
  }

  const valorDe = (r, vacio) => (r.status === 'fulfilled' ? r.value : vacio);

  async function cargarFicha() {
    const id = obtenerId();
    errorFicha.value = false;
    try {
      empleado.value = await insforgeApi.getEmpleado(id);
    } catch (e) {
      empleado.value = null;
      errorFicha.value = true;
      showToast(traducirErrorDb(e, { porDefecto: 'No se pudo cargar el empleado.' }).mensaje, 'error');
    }
    return empleado.value;
  }

  async function cargarCustodia() {
    const id = obtenerId();
    const [eq, lic, ent, tk, act, rev, cu, sol] = await Promise.allSettled([
      puedeEquipos.value ? insforgeApi.equiposPorEmpleado(id) : [],
      puedeLicencias.value ? insforgeApi.licenciasPorEmpleado(id) : [],
      puedeCorreos.value ? insforgeApi.entregasDeEmpleado(id) : [],
      puedeTickets.value ? insforgeApi.ticketsDeEmpleado(id) : [],
      puedeEquipos.value ? insforgeApi.actasDeEmpleado(id) : [],
      insforgeApi.ultimaRevisionAccesos(id),
      puedeCorreos.value ? cuentasStore.cargarPorEmpleado(id) : Promise.resolve(),
      puedeSolicitudes.value ? insforgeApi.solicitudesDeEmpleado(id) : [],
    ]);
    equipos.value = valorDe(eq, []);
    licencias.value = valorDe(lic, []);
    entregas.value = valorDe(ent, []);
    tickets.value = valorDe(tk, []);
    actas.value = valorDe(act, []);
    ultimaRevision.value = valorDe(rev, null);
    solicitudes.value = valorDe(sol, []);
    avisarFallos([eq, lic, ent, tk, act, rev, cu, sol]);
  }

  async function cargarLibro() {
    const id = obtenerId();
    libroCargando.value = true;
    const [ev, eq, cu, li, ent, tk, act, nom] = await Promise.allSettled([
      insforgeApi.listEventosEmpleado(id),
      puedeEquipos.value ? insforgeApi.historialEquiposEmpleado(id) : null,
      puedeCorreos.value ? insforgeApi.historialCuentasEmpleado(id) : null,
      puedeLicencias.value ? insforgeApi.historialLicenciasEmpleado(id) : null,
      puedeCorreos.value ? insforgeApi.entregasDeEmpleado(id) : null,
      puedeTickets.value ? insforgeApi.ticketsDeEmpleado(id) : null,
      puedeEquipos.value ? insforgeApi.actasDeEmpleado(id) : null,
      insforgeApi.nombresStaff(),
    ]);
    // Una respuesta tardía de un empleado anterior no pisa la del actual.
    if (id !== obtenerId()) return;
    eventos.value = valorDe(ev, []);
    nombresStaff.value = Object.fromEntries(valorDe(nom, []).map((s) => [s.user_id, s.nombre]));
    fuentesLibro.value = {
      eventos: eventos.value,
      equipos: valorDe(eq, null) || undefined,
      cuentas: valorDe(cu, null) || undefined,
      licencias: valorDe(li, null) || undefined,
      entregas: valorDe(ent, null) || undefined,
      tickets: valorDe(tk, null) || undefined,
      actas: valorDe(act, null) || undefined,
    };
    libroCargando.value = false;
    avisarFallos([ev, eq, cu, li, ent, tk, act]);
  }

  const libro = computed(() => armarLibroEmpleado(fuentesLibro.value, {
    empleado: empleado.value || {},
    nombresStaff: nombresStaff.value,
  }));

  // Fecha del sello BAJA: la hoja de vida y, sin ella, la última actualización.
  const fechaBaja = computed(() => fechaDeBaja(eventos.value) || empleado.value?.updated_at || null);

  // Actas de entrega por asignación de equipo (para "acta firmada" por fila).
  const actaEntregaPorAsignacion = computed(() => Object.fromEntries(
    actas.value.filter((a) => a.tipo === 'entrega').map((a) => [a.asignacion_equipo_id, a]),
  ));

  /** Carga completa: ficha, custodia y (después) libro. */
  async function cargar() {
    cargando.value = true;
    try {
      const ficha = await cargarFicha();
      if (!ficha) return null;
      await cargarCustodia();
      return ficha;
    } finally {
      cargando.value = false;
      // Fuera del `finally` bloqueante: el libro no retrasa la primera pintura.
      if (empleado.value) cargarLibro();
    }
  }

  /** Recarga lo que cambia tras una acción (custodia + libro), sin parpadeo. */
  async function refrescar() {
    await cargarFicha();
    await cargarCustodia();
    cargarLibro();
  }

  return {
    empleado, equipos, licencias, entregas, tickets, solicitudes, actas, ultimaRevision,
    cargando, errorFicha, libro, libroCargando, fechaBaja, actaEntregaPorAsignacion, nombresStaff,
    puedeCorreos, puedeEquipos, puedeLicencias, puedeTickets, puedeSolicitudes, cuentasCargadas,
    cargar, refrescar, cargarLibro,
  };
}
