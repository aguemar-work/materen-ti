// Vocabulario del dominio empleados — antes copiado en Dashboard,
// EmpleadosView y EmpleadoDetalleView.
// Mismo patrón que dominio-kb.js/dominio-tickets.js/dominio-equipos.js:
// el mapa es la única fuente y `*Info()` resuelve con fallback (hasta
// ago 2026 este archivo era el único de los 7 dominios que lo hacía con
// una cadena de if/else, ver ARQ-12 en docs/HISTORIAL-AUDITORIAS.md).
//
// Las claves son los valores del enum `estado_empleado` de Postgres
// (`Activo`/`Inactivo`/`Suspendido`, capitalizados en la base — ver
// docs/PANORAMA-SISTEMA.md §2).

export const ESTADOS_EMPLEADO = {
  Activo:     { label: 'Activo',     clase: 'badge--success' },
  Suspendido: { label: 'Suspendido', clase: 'badge--warning' },
  Inactivo:   { label: 'Inactivo',   clase: 'badge--neutral' },
};

export function estadoEmpleadoInfo(estado) {
  return ESTADOS_EMPLEADO[estado] || { label: estado, clase: 'badge--neutral' };
}

export function nombreCompleto(emp) {
  if (!emp) return '';
  return `${emp.nombres} ${emp.apellidos}`.trim();
}

// ── Alta incompleta ────────────────────────────────────────────────────────
// Una persona que entró hace poco, está Activa y todavía no tiene con qué
// trabajar. Es un estado DERIVADO: no hay columna, no hay tabla, no se
// persiste — se calcula igual que el resto de los pendientes del Dashboard
// (misma decisión que ya tomó Gestión de Problemas, ver
// docs/PANORAMA-SISTEMA.md §7).
//
// Por qué solo mira CUENTAS y no equipos ni licencias: no todo el mundo
// necesita una licencia ni un equipo asignado —depende del cargo—, pero sin
// una cuenta nadie puede empezar a trabajar. Contar equipos o licencias como
// requisito marcaría como "incompleta" media planilla de campo, y un aviso
// que salta cuando no pasa nada deja de leerse. El banner de alta guiada de
// EmpleadoDetalleView.vue ya usaba este mismo criterio en su paso 2.
//
// La ventana existe porque pasado cierto tiempo esto ya no es un alta a
// medias: es sencillamente cómo trabaja esa persona. Sin ventana, el feed
// acumularía para siempre a quien nunca necesitó cuenta.
export const DIAS_VENTANA_ALTA = 30;

/**
 * @param {object} empleado  fila de `empleados` (necesita estado y fecha_alta)
 * @param {object} conteos   { cuentas, equipos, licencias } de conteosVinculos()
 * @param {string} hoyISO    fecha de referencia, inyectada para poder probarla
 * @returns {{ diasDesdeAlta: number, faltan: string[] } | null}
 */
export function altaIncompleta(empleado, conteos, hoyISO) {
  if (!empleado || empleado.estado !== 'Activo') return null;
  if (!empleado.fecha_alta) return null;

  const dias = Math.round(
    (Date.parse(hoyISO) - Date.parse(String(empleado.fecha_alta).slice(0, 10))) / 86400000,
  );
  // Una fecha de alta futura no es un pendiente: la persona todavía no entró.
  if (!Number.isFinite(dias) || dias < 0 || dias > DIAS_VENTANA_ALTA) return null;

  if ((conteos?.cuentas || 0) > 0) return null;

  // `faltan` deja lugar a que el criterio crezca sin cambiar la forma del
  // resultado; hoy la única condición que marca incompleta es la cuenta.
  return { diasDesdeAlta: dias, faltan: ['cuenta'] };
}

// Los pasos de la guía de alta y su estado, derivados de lo que la persona
// YA tiene. Vive acá y no en la vista porque "qué hace falta para que alguien
// pueda empezar a trabajar" es una regla de dominio, no de presentación —
// misma razón por la que altaIncompleta() está en este archivo.
//
// La vista le engancha a cada paso su `ejecutar` (abrir el formulario que
// corresponda): qué botón abre qué modal sí es cosa suya.
//
// `requisito: false` = se ofrece, no se exige. Equipo y licencia dependen del
// cargo y no impiden dar el alta por terminada.
//
// `entrega` (Plan Maestro v2, Frente 3, 2026-09-04): tener una cuenta creada
// no es lo mismo que el empleado ya la conozca — el README documenta el alta
// guiada como "registrado → asignar accesos → **enviar por WhatsApp**", y
// esa entrega es justamente el paso que este banner dejó de marcar cuando
// pasó de texto informativo a pasos accionables (2026-09-01). Es REQUISITO,
// no opcional, igual que `cuenta`: entregar accesos es el punto del módulo
// (ver README, "no es solo un almacén de contraseñas"). Solo cuenta como
// hecho si además ya hay una cuenta que entregar — no tiene sentido marcarlo
// listo, ni ofrecer el botón, antes de que exista algo que enviar (la vista
// no le engancha `ejecutar` en ese caso).
export function pasosAlta({ cuentas = 0, equipos = 0, licencias = 0, entregaEnviada = false } = {}) {
  return [
    { id: 'registro', label: 'Registrada',              hecho: true,                        requisito: true },
    { id: 'cuenta',   label: 'Cuenta de correo',         hecho: cuentas > 0,                  requisito: true,  accion: 'Crear cuenta' },
    { id: 'entrega',  label: 'Credenciales entregadas',  hecho: cuentas > 0 && entregaEnviada, requisito: true,  accion: 'Enviar por WhatsApp' },
    { id: 'equipo',   label: 'Equipo',                   hecho: equipos > 0,                  requisito: false, accion: 'Entregar' },
    { id: 'licencia', label: 'Licencia',                 hecho: licencias > 0,                requisito: false, accion: 'Asignar' },
  ];
}

// El alta está lista cuando no queda ningún paso REQUERIDO sin hacer. Los
// opcionales sin completar no la bloquean.
export function altaLista(pasos) {
  return pasos.every((p) => !p.requisito || p.hecho);
}
