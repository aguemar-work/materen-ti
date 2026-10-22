import { ref, reactive, computed, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { showToast } from '../core/toast.js';
import { estadoInfo, prioridadInfo, destinoDeCambio, ESTADOS_EN_CURSO, ESTADOS_TERMINALES, ESTADOS_RESOLUBLES, ESTADOS_REABRIBLES, HITO_LABELS, EVENTO_LABELS, NIVELES_ATENCION } from '../core/dominio-tickets.js';
import { traducirErrorDb } from '../api/erroresDb.js';
import { useAuthStore } from '../stores/auth.js';
import { useTicketDetalleStore } from '../stores/ticketDetalle.js';

// Lógica de negocio de la ficha de ticket — extraída de TicketDetalleView.vue
// (refactor "split-view") para que la misma lógica (store,
// transiciones de estado, historial, comentarios) sirva tanto a la página
// completa (/tickets/:id) como al panel embebido del split-view
// (TicketDetallePanel.vue), sin duplicar las ~15 funciones de transición en
// dos archivos. Lo que NO entra acá porque es específico de cada
// contenedor: la redirección a /tickets cuando el ticket no existe (la
// página navega, el panel no) — eso lo decide quien llama a cargar(id)
// según lo que devuelva — y el layout/template propios de cada uno.
export function useTicketDetalleLogica() {
  const auth = useAuthStore();
  const store = useTicketDetalleStore();
  const { ticket, comentarios, eventos, satisfaccion, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId, horasAutocierre } = storeToRefs(store);

  const guardandoCampo = ref(false);

  const nuevoComentario = ref('');
  const comentarioInterno = ref(true);
  const enviandoComentario = ref(false);

  // El auto-crecimiento del textarea vive en TicketComposer.vue: es
  // comportamiento del control, no lógica de negocio del ticket.

  // Un comentario sin autor_id lo escribió el SOLICITANTE desde el
  // seguimiento público (la edge function `tickets` inserta sin sesión) —
  // no "Sistema", que es como se veía hasta el 2026-09-25.
  function autorDe(autorId) {
    if (autorId) return staffPorId.value[autorId] || 'Staff';
    const t = ticket.value;
    return t?.empleado_nombre || t?.contacto_ingresado || 'Solicitante';
  }

  // Cómo terminó el ticket, para el encabezado ("Resuelto hace 1 d por X ·
  // tardó 2 d"). Sale del historial: el último cambio a "resuelto" (el
  // cierre por la calificación o el automático no cuentan como quien resolvió) o, si
  // nunca pasó por ahí, a "cerrado"/"rechazado". Solo con el ticket en un
  // estado final: un ticket reabierto ya no "está resuelto".
  const resolucion = computed(() => {
    const t = ticket.value;
    if (!t || !['resuelto', 'cerrado', 'rechazado'].includes(t.estado)) return null;
    const cambios = eventos.value
      .filter((e) => e.evento === 'estado_cambiado')
      .map((e) => ({ ...e, destino: destinoDeCambio(e.detalle) }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const buscado = t.estado === 'rechazado' ? ['rechazado'] : ['resuelto', 'cerrado'];
    const ev = cambios.find((e) => e.destino === buscado[0]) || cambios.find((e) => buscado.includes(e.destino));
    const fecha = ev?.created_at || t.resuelto_at || null;
    if (!fecha) return null;
    const por = ev ? (staffPorId.value[ev.user_id] || ev.user_email || '') : '';
    return { tipo: t.estado === 'rechazado' ? 'rechazado' : 'resuelto', fecha, por };
  });

  // El color de cada hito viene del MISMO estadoInfo() que pintan los badges
  // de estado en el resto de la app — un estado siempre significa el mismo
  // color, nunca un mapeo de color aparte solo para esta lista.
  function colorDeEstado(estado) {
    return estadoInfo(estado).clase.replace('badge--', '');
  }

  // Historial: hitos del ciclo de vida (creado → inicio de atención/asignado
  // → resuelto → cerrado) más los eventos auxiliares de ticket_eventos que
  // antes se descartaban en silencio (reasignaciones, cambios de prioridad,
  // encuesta respondida).
  const historialEsencial = computed(() => {
    const hitos = [];
    for (const ev of eventos.value) {
      if (ev.evento === 'creado') {
        hitos.push({ id: ev.id, label: 'Ticket creado', fecha: ev.created_at, color: colorDeEstado('abierto') });
      } else if (ev.evento === 'estado_cambiado') {
        const nuevoEstado = destinoDeCambio(ev.detalle);
        const label = HITO_LABELS[nuevoEstado];
        if (!label) continue;
        const asignado = nuevoEstado === 'en_progreso' && ticket.value?.asignado_a
          ? ` · Asignado a ${staffPorId.value[ticket.value.asignado_a] || 'Staff'}`
          : '';
        hitos.push({ id: ev.id, label: label + asignado, fecha: ev.created_at, color: colorDeEstado(nuevoEstado) });
      } else if (ev.evento === 'reasignado') {
        hitos.push({ id: ev.id, label: EVENTO_LABELS.reasignado, fecha: ev.created_at, color: 'neutral' });
      } else if (ev.evento === 'prioridad_cambiada') {
        const nuevaPrioridad = destinoDeCambio(ev.detalle);
        hitos.push({ id: ev.id, label: `Prioridad cambiada a ${prioridadInfo(nuevaPrioridad).label}`, fecha: ev.created_at, color: 'info' });
      } else if (ev.evento === 'nivel_atencion_cambiado') {
        // El trigger de BD (evento_ticket_cambios(), migración 017) ya
        // loguea esto — historialEsencial nunca tuvo el caso para
        // mostrarlo (EVENTO_LABELS.nivel_atencion_cambiado existía sin
        // usar). No es lógica nueva: mismo patrón que prioridad_cambiada,
        // con los labels ya definidos en NIVELES_ATENCION.
        const nuevoNivel = destinoDeCambio(ev.detalle);
        const label = NIVELES_ATENCION.find((n) => n.valor === nuevoNivel)?.label || nuevoNivel || ev.detalle;
        hitos.push({ id: ev.id, label: `Nivel de atención cambiado a ${label}`, fecha: ev.created_at, color: 'info' });
      } else if (ev.evento === 'categoria_cambiada') {
        // Catálogo v2 (116): la migración, un JEFE o un técnico (119) movió el
        // ticket de categoría; el detalle ya trae "De … a …" y, si lo hizo una
        // persona, el motivo.
        const label = ev.detalle ? `${EVENTO_LABELS.categoria_cambiada}: ${ev.detalle}` : EVENTO_LABELS.categoria_cambiada;
        hitos.push({ id: ev.id, label, fecha: ev.created_at, color: 'neutral' });
      } else if (ev.evento === 'encuesta_enviada') {
        hitos.push({ id: ev.id, label: EVENTO_LABELS.encuesta_enviada, fecha: ev.created_at, color: 'neutral' });
      } else if (ev.evento === 'encuesta_respondida') {
        // 120: «Nivel n» — calificar es lo que cierra el ticket resuelto.
        const nivel = /^Nivel (\d)$/.exec(ev.detalle || '')?.[1];
        const label = nivel ? `${EVENTO_LABELS.encuesta_respondida}: ${nivel}/5` : EVENTO_LABELS.encuesta_respondida;
        hitos.push({ id: ev.id, label, fecha: ev.created_at, color: 'success' });
      } else if (ev.evento === 'cerrado_automatico') {
        hitos.push({ id: ev.id, label: EVENTO_LABELS.cerrado_automatico, fecha: ev.created_at, color: 'neutral' });
      } else if (ev.evento === 'calificacion_revisada') {
        const label = ev.detalle ? `${EVENTO_LABELS.calificacion_revisada}: ${ev.detalle}` : EVENTO_LABELS.calificacion_revisada;
        hitos.push({ id: ev.id, label, fecha: ev.created_at, color: 'info' });
      }
    }
    return hitos;
  });

  // Timeline unificado (revisión "Filas con foco", 2026-09-04): un solo feed
  // cronológico que intercala hitos del sistema y comentarios, para no
  // obligar a mirar Historial y Conversación en dos áreas de scroll
  // separadas al reconstruir "qué pasó y qué se dijo". Merge puro de
  // frontend — ambas fuentes ya traen timestamp comparable, no hace falta
  // tocar el backend. `historialEsencial` y `comentarios` se siguen
  // exportando tal cual (no romper otros consumidores), esto es una vista
  // adicional sobre los mismos datos.
  const timelineUnificado = computed(() => {
    const filas = [
      ...historialEsencial.value.map((h) => ({ tipo: 'evento', fecha: h.fecha, ...h })),
      ...comentarios.value.map((c) => ({ tipo: 'comentario', fecha: c.created_at, ...c })),
    ];
    return filas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  });

  // ── Iniciar atención (abierto -> en_progreso): los campos (prioridad,
  // nivel, asignado) se ven directo al entrar — no detrás de un botón que
  // primero "revela" el formulario. Rechazar sigue sin pedir nada de esto.
  const atencionForm = ref({ prioridad: 'media', nivelAtencion: 'N1', asignadoA: '', tipo: '' });
  const iniciando = ref(false);

  // 3 subcategorías quedan deliberadamente sin tipo_sugerido (migración 035:
  // "Accesorio dañado/faltante", "Otro", "Seguridad/backup" mezclan ambos
  // tipos) — el select de Tipo queda vacío sin que nada lo explique. Este
  // hint es el único cambio: no depende de nombres de subcategoría, solo de
  // que no haya tipo precargado ni sugerido.
  const tipoAmbiguoSinClasificar = computed(() =>
    ticket.value?.estado === 'abierto' &&
    !ticket.value?.tipo &&
    !ticket.value?.subcategoria_tipo_sugerido
  );

  // Carga el ticket `id` y precarga el formulario de "iniciar atención".
  // Devuelve `true` cuando el ticket específicamente NO EXISTE — quien llama
  // decide qué hacer con eso (la página redirige a /tickets, el panel del
  // split-view no navega, solo muestra su propio estado vacío). En un error
  // de red (catch) devuelve `false`, igual que en el caso de éxito: no es un
  // "no existe", es una falla transitoria — nadie debería navegar por eso.
  async function cargar(id) {
    try {
      await store.cargar(id);
      if (!ticket.value) {
        showToast('Ticket no encontrado', 'error');
        return true;
      }
      // Precarga los 3 campos de una vez (sin un paso de "revelar" el
      // formulario aparte): al entrar al ticket ya se ven, listos para
      // ajustar y confirmar en un solo clic con "Iniciar atención".
      if (ticket.value.estado === 'abierto') {
        atencionForm.value = {
          prioridad: ticket.value.prioridad || 'media',
          nivelAtencion: 'N1',
          asignadoA: auth.user?.id || '',
          // Precarga con el tipo ya asignado si lo tiene; si no, con el default
          // de la subcategoría (tipo_sugerido). Si ninguno existe (los 3 casos
          // ambiguos: Accesorio dañado/faltante, Otro, Seguridad/backup) queda
          // vacío a propósito — el select fuerza a elegir antes de iniciar.
          tipo: ticket.value.tipo || ticket.value.subcategoria_tipo_sugerido || '',
        };
      }
      return false;
    } catch (e) {
      showToast(e?.message || 'Error al cargar el ticket', 'error');
      return false;
    }
  }

  async function confirmarIniciar() {
    if (!atencionForm.value.asignadoA) {
      showToast('Seleccione a quién se asigna el ticket', 'error');
      return;
    }
    if (!atencionForm.value.tipo) {
      showToast('Seleccione si es un incidente o una solicitud', 'error');
      return;
    }
    iniciando.value = true;
    try {
      await store.actualizarCampos({
        estado: 'en_progreso',
        prioridad: atencionForm.value.prioridad,
        nivel_atencion: atencionForm.value.nivelAtencion,
        asignado_a: atencionForm.value.asignadoA,
        // Explícito siempre, aunque el ticket ya traiga tipo precargado: no
        // depender de que un UPDATE parcial "conserve" el valor previo.
        tipo: atencionForm.value.tipo,
      });
      showToast('Ticket en atención');
    } catch (e) {
      showToast(e?.message || 'No se pudo iniciar el ticket', 'error');
    } finally {
      iniciando.value = false;
    }
  }

  // ── Rechazar (abierto -> rechazado, terminal): exige un motivo, que queda
  // como comentario visible para el empleado ──────────────────────────────
  const mostrarRechazar = ref(false);
  const motivoRechazo = ref('');
  const rechazando = ref(false);

  function abrirRechazar() {
    motivoRechazo.value = '';
    mostrarRechazar.value = true;
  }

  async function confirmarRechazar() {
    const motivo = motivoRechazo.value.trim();
    if (!motivo) {
      showToast('Escriba el motivo del rechazo', 'error');
      return;
    }
    rechazando.value = true;
    try {
      await store.comentar(motivo, false);
      await store.actualizarCampos({ estado: 'rechazado' });
      mostrarRechazar.value = false;
      showToast('Ticket rechazado');
    } catch (e) {
      showToast(e?.message || 'No se pudo rechazar el ticket', 'error');
    } finally {
      rechazando.value = false;
    }
  }

  // ── Resolver (procedimiento de cierre, migración 120): la solución aplicada
  // es obligatoria y el solicitante la ve en su seguimiento; el ticket queda
  // «Resuelto» esperando su calificación, que es la que lo cierra (o el cierre
  // automático, a las horasAutocierre). Sin solicitante se cierra al resolver.
  // El formulario es ResolverTicketDialog; la acción, store.resolver().
  const puedeResolver = computed(() => !!ticket.value && ESTADOS_RESOLUBLES.includes(ticket.value.estado));
  const ofrecerKb = computed(() => auth.puedeVerModulo('base_conocimiento'));
  const mostrarResolver = ref(false);
  const resolverConNota = (nota) => store.resolver(nota);

  async function onResuelto(resultado) {
    mostrarResolver.value = false;
    if (!resultado) return;
    showToast(ticket.value?.estado === 'cerrado'
      ? 'Ticket resuelto y cerrado: no tiene un solicitante que califique'
      : 'Ticket resuelto: espera la calificación del solicitante');
    if (resultado.guardarKb) {
      try {
        await store.guardarComoBorradorKb({ solucion: resultado.nota });
        showToast('Solución guardada como borrador en la Base de Conocimiento');
      } catch (e) {
        showToast(traducirErrorDb(e, { porDefecto: 'El ticket se resolvió, pero no se pudo guardar el borrador en la Base de Conocimiento.' }).mensaje, 'error');
      }
    }
  }

  // Un ticket resuelto espera al solicitante: cuándo se cierra solo si no califica.
  const esperaCalificacion = computed(() => {
    const t = ticket.value;
    if (t?.estado !== 'resuelto' || !t.resuelto_at) return null;
    return { venceAt: new Date(new Date(t.resuelto_at).getTime() + horasAutocierre.value * 3600000).toISOString(), horas: horasAutocierre.value };
  });

  // ── Revisar una calificación de 1 o 2 (120): una sola vez, quien tenga el
  // módulo tickets (el técnico asignado la recibe en sus notificaciones).
  // Reabrir por acá no exige ser JEFE. Formulario: RevisarCalificacionDialog.
  const puedeRevisarCalificacion = computed(() => {
    const s = satisfaccion.value;
    return !!s?.fecha_envio && s.nivel <= 2 && !s.revision_desenlace && auth.puedeVerModulo('tickets');
  });
  const mostrarRevisarCalificacion = ref(false);

  async function onCalificacionRevisada(resultado) {
    mostrarRevisarCalificacion.value = false;
    if (!resultado) return;
    showToast(resultado.desenlace === 'reabierto' ? 'Ticket reabierto: continúe la atención' : 'Revisión registrada');
    try {
      await store.recargarTrasCierre();
    } catch (e) {
      showToast(traducirErrorDb(e, { porDefecto: 'La revisión quedó registrada, pero no se pudo actualizar la ficha. Recargue la página.' }).mensaje, 'error');
    }
  }

  // ── Reabrir: solo JEFE (la RPC reabrir_ticket lo exige, 42501) — también un
  // ticket resuelto antes de que el solicitante califique (120). Exige motivo,
  // igual que Rechazar, y queda como NOTA INTERNA (no visible para el
  // empleado): reabrir es una decisión interna, el empleado ya ve el cambio
  // de estado en su seguimiento público ────────────────────────────────────
  const puedeReabrir = computed(() => !!ticket.value && auth.esJefe && ESTADOS_REABRIBLES.includes(ticket.value.estado));
  const mostrarReabrir = ref(false);
  const motivoReabrir = ref('');
  const reabriendo = ref(false);

  function abrirReabrir() {
    motivoReabrir.value = '';
    mostrarReabrir.value = true;
  }

  async function confirmarReabrir() {
    const motivo = motivoReabrir.value.trim();
    if (!motivo) {
      showToast('Escriba el motivo para reabrir', 'error');
      return;
    }
    reabriendo.value = true;
    try {
      await store.reabrir(motivo);
      mostrarReabrir.value = false;
      showToast('Ticket reabierto');
    } catch (e) {
      showToast(traducirErrorDb(e, { porDefecto: 'No se pudo reabrir el ticket' }).mensaje, 'error');
    } finally {
      reabriendo.value = false;
    }
  }

  async function cambiarNivelAtencion(valor) {
    guardandoCampo.value = true;
    try {
      await store.actualizarCampos({ nivel_atencion: valor || null });
    } catch (e) {
      showToast(e?.message || 'Error al cambiar el nivel de atención', 'error');
    } finally {
      guardandoCampo.value = false;
    }
  }

  async function cambiarPrioridad(nuevaPrioridad) {
    guardandoCampo.value = true;
    try {
      await store.actualizarCampos({ prioridad: nuevaPrioridad });
    } catch (e) {
      showToast(e?.message || 'Error al cambiar la prioridad', 'error');
    } finally {
      guardandoCampo.value = false;
    }
  }

  // Desasignar un ticket EN CURSO pide confirmación (no reasignar a otro
  // técnico, eso sigue siendo directo): evita dejarlo "flotando" sin
  // responsable por un clic accidental en el select.
  const mostrarConfirmarDesasignar = ref(false);
  const dialogoDesasignar = ref(null);
  const desasignando = ref(false);
  let selectAsignadoEl = null;

  async function cambiarAsignado(staffId, event) {
    if (!staffId && ESTADOS_EN_CURSO.includes(ticket.value.estado)) {
      selectAsignadoEl = event?.target || null;
      mostrarConfirmarDesasignar.value = true;
      return;
    }
    guardandoCampo.value = true;
    try {
      await store.actualizarCampos({ asignado_a: staffId || null });
      showToast(staffId ? 'Ticket asignado' : 'Asignación quitada');
    } catch (e) {
      showToast(e?.message || 'Error al asignar', 'error');
    } finally {
      guardandoCampo.value = false;
    }
  }

  // Único handler de cierre (botón Cancelar y cierre animado tras confirmar):
  // el <select> de "Asignado a" no usa v-model (usa :value/@change), así que
  // hay que revertirlo a mano al valor actual del ticket.
  function cancelarDesasignar() {
    mostrarConfirmarDesasignar.value = false;
    if (selectAsignadoEl) selectAsignadoEl.value = ticket.value.asignado_a || '';
    selectAsignadoEl = null;
  }

  async function confirmarDesasignar() {
    desasignando.value = true;
    try {
      await store.actualizarCampos({ asignado_a: null });
      showToast('Asignación quitada');
      dialogoDesasignar.value?.cerrar();
    } catch (e) {
      showToast(e?.message || 'Error al asignar', 'error');
    } finally {
      desasignando.value = false;
    }
  }

  async function cambiarTipo(nuevoTipo) {
    guardandoCampo.value = true;
    try {
      await store.actualizarCampos({ tipo: nuevoTipo });
    } catch (e) {
      showToast(e?.message || 'Error al cambiar el tipo', 'error');
    } finally {
      guardandoCampo.value = false;
    }
  }

  // ── Reclasificar (116; el técnico desde la 119): corregir la categoría que
  // eligió el solicitante. La RPC exige el módulo tickets y, para un ticket
  // cerrado o rechazado, ser JEFE: lo que rechazaría no se ofrece. Nunca toca
  // tipo ni prioridad; el motivo queda en el historial.
  const puedeReclasificar = computed(() => !!ticket.value && auth.puedeVerModulo('tickets')
    && (auth.esJefe || !ESTADOS_TERMINALES.includes(ticket.value.estado)));
  // Ticket con la forma que espera ReclasificarTicketDialog (null = cerrado).
  const ticketAReclasificar = ref(null);
  const catalogoClasificacion = ref({ categorias: [], subcategorias: [] });
  const abriendoReclasificar = ref(false);

  async function abrirReclasificar() {
    if (abriendoReclasificar.value || !ticket.value) return;
    abriendoReclasificar.value = true;
    try {
      catalogoClasificacion.value = await store.catalogoClasificacion();
      const t = ticket.value;
      ticketAReclasificar.value = {
        ticket_id: t.id,
        codigo: t.codigo,
        titulo: t.titulo,
        // La descripción ya está a la vista en la conversación.
        descripcion: null,
        created_at: t.created_at,
        categoria: t.categoria_nombre || null,
        subcategoria: t.subcategoria_nombre || null,
        subcategoria_id: t.subcategoria_id || null,
      };
    } catch (e) {
      showToast(traducirErrorDb(e, { porDefecto: 'No se pudo cargar el catálogo de categorías.' }).mensaje, 'error');
    } finally {
      abriendoReclasificar.value = false;
    }
  }

  // El diálogo emite la respuesta de la RPC, o null si se canceló.
  async function onReclasificado(resultado) {
    ticketAReclasificar.value = null;
    if (!resultado) return;
    showToast(resultado.cambio === false ? 'Clasificación confirmada' : 'Ticket reclasificado');
    try {
      await store.recargarTrasReclasificar();
    } catch (e) {
      showToast(traducirErrorDb(e, { porDefecto: 'El ticket se reclasificó, pero no se pudo actualizar la ficha. Recargue la página.' }).mensaje, 'error');
    }
  }

  // Todo junto para TicketCamposGestion, que muestra el botón y monta el
  // diálogo: los contenedores solo pasan este objeto (reactive desenvuelve los refs).
  const reclasificacion = reactive({
    puede: puedeReclasificar,
    abriendo: abriendoReclasificar,
    ticket: ticketAReclasificar,
    catalogo: catalogoClasificacion,
    abrir: abrirReclasificar,
    alCerrar: onReclasificado,
  });

  // ── Gestión de Problemas: "Marcar como problema" (reemplaza el viejo
  // checkbox de lección aprendida, columna retirada en la migración 033) ──
  const mostrarProblemaForm = ref(false);

  function onProblemaFormCerrado(creado) {
    mostrarProblemaForm.value = false;
    if (creado) {
      showToast('Problema creado');
      store.recargarProblemaVinculado();
    }
  }

  // Enlace de calificación — se arma acá una sola vez, no viene de ningún
  // campo propio en ticket/satisfaccion (no existe, se confirmó antes de
  // agregar copiarLinkSatisfaccion() esta ronda). Mismo formato que ya
  // usaba copiarMensajeSatisfaccion().
  function linkSatisfaccion() {
    return `${window.location.origin}/soporte/${ticket.value.token}/satisfaccion`;
  }

  // Copia un mensaje listo para WhatsApp con el enlace de calificación —
  // mismo patrón que copiarEnlaceSoporte() (TicketsView.vue): clipboard +
  // toast, sin abrir wa.me (el sistema no envía nada por su cuenta, el staff
  // decide a través de qué canal reenviarlo). Sin correo: el enlace de
  // calificación es el único canal de entrega desde que se retiró el aviso
  // automático (migración 055) — este botón es la vía real para que llegue.
  async function copiarMensajeSatisfaccion() {
    const link = linkSatisfaccion();
    // 120: calificar es lo que cierra el ticket resuelto (si no, se cierra solo).
    const texto =
      `Hola, ${ticket.value.empleado_nombre}.\n` +
      `Su ticket ${ticket.value.codigo} fue resuelto. Le pedimos calificar la atención en el siguiente enlace; con su calificación el ticket queda cerrado:\n` +
      `${link}\n\n` +
      `Si no califica en ${horasAutocierre.value} horas, el ticket se cerrará automáticamente. Gracias por su tiempo.`;
    try {
      await navigator.clipboard.writeText(texto);
      showToast('Mensaje de calificación copiado');
    } catch {
      showToast('No se pudo copiar. Cópielo manualmente: ' + link, 'error');
    }
  }

  // Solo el link, sin el mensaje armado para WhatsApp — para cuando el
  // staff quiere reenviarlo por otro canal (correo interno, otro chat,
  // etc.) sin el saludo/texto pensado específicamente para WhatsApp.
  async function copiarLinkSatisfaccion() {
    const link = linkSatisfaccion();
    try {
      await navigator.clipboard.writeText(link);
      showToast('Link de encuesta copiado');
    } catch {
      showToast('No se pudo copiar. Cópielo manualmente: ' + link, 'error');
    }
  }

  // Enlace de seguimiento del ticket (la misma página pública donde el
  // empleado ya puede ver comentarios no internos) — no confundir con
  // linkSatisfaccion(), que apunta a la encuesta, un paso más adelante.
  function linkSeguimiento() {
    return `${window.location.origin}/soporte/${ticket.value.token}`;
  }

  // Segunda macro de WhatsApp (Plan Maestro v2, Frente 2): pedir más datos
  // al solicitante. Mismo patrón exacto que copiarMensajeSatisfaccion —
  // clipboard + toast, sin wa.me — el staff sigue decidiendo por qué canal
  // reenviarlo. Sirve tanto para tickets vinculados (empleado_nombre) como
  // sin vincular (contacto_ingresado); si no hay ninguno de los dos, el
  // saludo queda genérico en vez de forzar un nombre inexistente.
  async function copiarMensajeSolicitarInfo() {
    const link = linkSeguimiento();
    const nombre = ticket.value.empleado_nombre || ticket.value.contacto_ingresado || '';
    const texto =
      `Hola${nombre ? `, ${nombre}` : ''}.\n` +
      `Sobre su ticket ${ticket.value.codigo} (${ticket.value.titulo}), necesitamos más información para continuar.\n` +
      `Puede responder por este medio o agregar detalles en su seguimiento:\n` +
      `${link}\n\n` +
      `Gracias.`;
    try {
      await navigator.clipboard.writeText(texto);
      showToast('Mensaje copiado');
    } catch {
      showToast('No se pudo copiar. Cópielo manualmente: ' + link, 'error');
    }
  }

  async function enviarComentario() {
    const mensaje = nuevoComentario.value.trim();
    if (!mensaje) return;
    enviandoComentario.value = true;
    try {
      await store.comentar(mensaje, comentarioInterno.value);
      // TicketComposer.vue devuelve el textarea a su alto mínimo al ver
      // que el mensaje quedó vacío.
      nuevoComentario.value = '';
    } catch (e) {
      showToast(e?.message || 'Error al comentar', 'error');
    } finally {
      enviandoComentario.value = false;
    }
  }

  // Limpieza del store singleton al desmontar quien use este composable —
  // tanto la página completa como el panel del split-view "son dueños" de
  // su propia instancia de detalle mientras están montados.
  onUnmounted(() => store.limpiar());

  return {
    auth,
    ticket, comentarios, eventos, satisfaccion, equiposEmpleado, articulosRelacionados, problemaVinculado, cargando, staffActivo, staffPorId,
    guardandoCampo,
    nuevoComentario, comentarioInterno, enviandoComentario,
    autorDe, colorDeEstado, historialEsencial, timelineUnificado, resolucion,
    atencionForm, iniciando, tipoAmbiguoSinClasificar,
    cargar, confirmarIniciar,
    mostrarRechazar, motivoRechazo, rechazando, abrirRechazar, confirmarRechazar,
    puedeResolver, ofrecerKb, mostrarResolver, resolverConNota, onResuelto, esperaCalificacion, horasAutocierre,
    puedeRevisarCalificacion, mostrarRevisarCalificacion, onCalificacionRevisada,
    puedeReabrir, mostrarReabrir, motivoReabrir, reabriendo, abrirReabrir, confirmarReabrir,
    cambiarNivelAtencion, cambiarPrioridad,
    mostrarConfirmarDesasignar, dialogoDesasignar, desasignando, cambiarAsignado, cancelarDesasignar, confirmarDesasignar,
    cambiarTipo,
    reclasificacion,
    mostrarProblemaForm, onProblemaFormCerrado,
    copiarMensajeSatisfaccion,
    copiarLinkSatisfaccion,
    copiarMensajeSolicitarInfo,
    enviarComentario,
  };
}
