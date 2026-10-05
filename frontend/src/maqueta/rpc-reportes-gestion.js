// Lado servidor FALSO de los reportes de gestión (migración 117):
// reporte_cambios, reporte_problemas (con conocimiento y recurrencias según
// los módulos) y reporte_auditoria (solo JEFE, sin IP ni user_agent). Misma
// aritmética, mismas columnas y mismos rótulos que el SQL. NADA de esto entra
// al bundle de producción.
import {
  cabecera, col, tabla, seccion, etiqueta, exigir, puede, parametro, porId, agrupar, contar, cmpTexto,
  diaLima, restaDias, validarPeriodo, pct0,
} from './reportes-forma.js';
import { hechosDeTickets } from './rpc-reportes.js';

// ── Cambios ─────────────────────────────────────────────────────────────────
const TIPOS_CAMBIO = ['estandar', 'normal', 'emergencia'];

export function reporteCambiosDe(db, { user, desde, hasta, ahora = new Date() }) {
  exigir(db, user, 'modulo:tickets');
  validarPeriodo(desde, hasta);
  const servicios = porId(db.servicios);
  const dia = (ts) => (ts ? diaLima(ts) : null);
  const c = (db.cambios || []).map((x) => ({
    ...x, servicio: servicios[x.servicio_id]?.nombre ?? x.servicio_id, dia: dia(x.created_at), dia_aprobado: dia(x.aprobado_at),
    dia_inicio: dia(x.inicio_real_at), dia_fin: dia(x.fin_real_at),
  })).filter((x) => x.dia >= desde && x.dia <= hasta);
  const u = c.filter((x) => !['borrador', 'cancelado'].includes(x.estado));
  const vencidas = (db.cambios || []).filter((x) => x.tipo === 'emergencia' && !x.aprobado_por && ['en_ejecucion', 'implementado'].includes(x.estado)
    && x.aprobacion_pendiente_hasta && new Date(x.aprobacion_pendiente_hasta) < ahora)
    .sort((a, b) => new Date(a.aprobacion_pendiente_hasta) - new Date(b.aprobacion_pendiente_hasta) || a.codigo.localeCompare(b.codigo));

  return {
    ...cabecera(db, user, 'cambios', { desde, hasta, ahora }),
    parametros: {},
    avisos: [],
    secciones: [
      seccion('tipos', '1. Por tipo', [
        tabla('por_tipo', null, [
          col('tipo', 'Tipo'), col('pedidos', 'Pedidos', 'numero'), col('ejecutados', 'Ejecutados', 'numero'), col('implementados', 'Implementados', 'numero'),
          col('revertidos', 'Revertidos', 'numero'), col('pct_revertidos', 'Revertidos de los ejecutados', 'pct'),
        ], TIPOS_CAMBIO.map((tipo) => {
          const xs = u.filter((x) => x.tipo === tipo);
          const ejecutados = contar(xs, (x) => ['en_ejecucion', 'implementado', 'cerrado', 'revertido'].includes(x.estado));
          const revertidos = contar(xs, (x) => x.estado === 'revertido');
          return {
            tipo: etiqueta('tipo_cambio', tipo), pedidos: xs.length, ejecutados, implementados: contar(xs, (x) => ['implementado', 'cerrado'].includes(x.estado)),
            revertidos, pct_revertidos: ejecutados > 0 ? pct0(revertidos, ejecutados) : null,
          };
        })),
        tabla('por_servicio', 'Por servicio', [col('servicio', 'Servicio'), col('pedidos', 'Pedidos', 'numero'), col('revertidos', 'Revertidos', 'numero')],
          agrupar(u, (x) => x.servicio).map(([servicio, xs]) => ({ servicio, pedidos: xs.length, revertidos: contar(xs, (x) => x.estado === 'revertido') }))
            .sort((a, b) => b.pedidos - a.pedidos || cmpTexto(a.servicio, b.servicio))),
      ], 'Cambios creados en el período que llegaron a pedirse (sin borradores ni cancelados), la misma definición del resumen de Cambios.'),
      seccion('emergencias', '2. Emergencias sin aprobar con el plazo vencido', [
        tabla('sin_aprobar', null, [
          col('codigo', 'Código', 'codigo'), col('titulo', 'Título'), col('servicio', 'Servicio'), col('estado', 'Estado'),
          col('vencio', 'Plazo vencido el', 'fecha'), col('dias', 'Días de atraso', 'numero'),
        ], vencidas.map((x) => ({
          codigo: x.codigo, titulo: x.titulo, servicio: servicios[x.servicio_id]?.nombre ?? x.servicio_id, estado: etiqueta('estado_cambio', x.estado),
          vencio: diaLima(x.aprobacion_pendiente_hasta), dias: Math.floor((ahora - new Date(x.aprobacion_pendiente_hasta)) / 86400000),
        }))),
      ], 'Hoy, sin importar el período: un jefe debía aprobarlas dentro de las 48 horas.'),
      seccion('revertidos', '3. Revertidos del período', [
        tabla('detalle', null, [
          col('codigo', 'Código', 'codigo'), col('titulo', 'Título'), col('tipo', 'Tipo'), col('servicio', 'Servicio'), col('fin', 'Fin', 'fecha'), col('motivo', 'Motivo'),
        ], u.filter((x) => x.estado === 'revertido').sort((a, b) => a.dia.localeCompare(b.dia) || a.codigo.localeCompare(b.codigo)).map((x) => ({
          codigo: x.codigo, titulo: x.titulo, tipo: etiqueta('tipo_cambio', x.tipo), servicio: x.servicio, fin: x.dia_fin, motivo: x.resultado ?? null,
        }))),
      ]),
    ],
    filas_csv: {
      columnas: [
        col('codigo', 'Código', 'codigo'), col('titulo', 'Título'), col('tipo', 'Tipo'), col('riesgo', 'Riesgo'), col('servicio', 'Servicio'),
        col('estado', 'Estado'), col('creado', 'Creado', 'fecha'), col('aprobado', 'Aprobado', 'fecha'), col('inicio', 'Inicio real', 'fecha'), col('fin', 'Fin real', 'fecha'),
      ],
      filas: c.filter((x) => x.estado !== 'borrador').sort((a, b) => a.dia.localeCompare(b.dia) || a.codigo.localeCompare(b.codigo)).map((x) => [
        x.codigo, x.titulo, etiqueta('tipo_cambio', x.tipo), etiqueta('riesgo_cambio', x.riesgo), x.servicio, etiqueta('estado_cambio', x.estado),
        x.dia, x.dia_aprobado, x.dia_inicio, x.dia_fin,
      ]),
    },
  };
}

// ── Problemas y conocimiento ────────────────────────────────────────────────
export function reporteProblemasDe(db, { user, desde, hasta, ahora = new Date() }) {
  exigir(db, user, 'modulo:problemas');
  validarPeriodo(desde, hasta);
  const hoy = diaLima(ahora);
  const conKb = puede(db, user, 'modulo:base_conocimiento');
  const conTickets = puede(db, user, 'modulo:tickets');
  const umbralN = parametro(db, 'umbral_recurrencia_tickets', 3, 'n');
  const umbralD = parametro(db, 'umbral_recurrencia_tickets', 30, 'dias');
  const acciones = (db.acciones_correctivas || []).filter((a) => !a.deleted_at && ['pendiente', 'en_progreso'].includes(a.estado));
  const p = (db.problemas || []).filter((x) => !x.deleted_at).map((x) => ({
    id: x.id, titulo: x.titulo, estado: x.estado, severidad: x.severidad, error_conocido: !!x.error_conocido,
    workaround_publicado: !!x.kb_articulo_id, dia: diaLima(x.created_at),
    tickets: contar(db.problema_tickets || [], (t) => t.problema_id === x.id),
    acciones_pendientes: contar(acciones, (a) => a.problema_id === x.id),
    acciones_vencidas: contar(acciones, (a) => a.problema_id === x.id && a.fecha_limite < hoy),
  }));
  const problemasPorId = porId(p);
  const sino = (b) => (b ? 'Sí' : 'No');
  const secciones = [
    seccion('problemas', '1. Problemas', [
      tabla('resumen', null, [col('indicador', 'Indicador'), col('cantidad', 'Cantidad', 'numero')], [
        { indicador: 'Abiertos hoy', cantidad: contar(p, (x) => x.estado !== 'cerrado') },
        { indicador: 'Creados en el período', cantidad: contar(p, (x) => x.dia >= desde && x.dia <= hasta) },
        { indicador: 'Errores conocidos vigentes', cantidad: contar(p, (x) => x.error_conocido && x.estado !== 'cerrado') },
        { indicador: 'Acciones correctivas vencidas', cantidad: p.reduce((s, x) => s + x.acciones_vencidas, 0) },
      ]),
      tabla('por_estado', 'Por estado (hoy)', [col('estado', 'Estado'), col('problemas', 'Problemas', 'numero')],
        ['abierto', 'diagnostico', 'acciones', 'cerrado'].map((e) => ({ estado: etiqueta('estado_problema', e), problemas: contar(p, (x) => x.estado === e) }))),
      tabla('por_severidad', 'Abiertos por severidad', [col('severidad', 'Severidad'), col('abiertos', 'Abiertos', 'numero')],
        ['critica', 'alta', 'media', 'baja'].map((s) => ({ severidad: etiqueta('severidad', s), abiertos: contar(p, (x) => x.severidad === s && x.estado !== 'cerrado') }))),
    ], 'Un problema no guarda su fecha de cierre: el reporte no cuenta «cerrados en el período».'),
    seccion('kedb', '2. Errores conocidos y acciones vencidas', [
      tabla('errores_conocidos', 'Errores conocidos vigentes', [
        col('problema', 'Problema'), col('severidad', 'Severidad'), col('estado', 'Estado'), col('workaround', 'Workaround publicado'),
        col('desde', 'Registrado', 'fecha'), col('tickets', 'Tickets', 'numero'),
      ], p.filter((x) => x.error_conocido && x.estado !== 'cerrado').sort((a, b) => a.dia.localeCompare(b.dia) || cmpTexto(a.titulo, b.titulo)).map((x) => ({
        problema: x.titulo, severidad: etiqueta('severidad', x.severidad), estado: etiqueta('estado_problema', x.estado),
        workaround: sino(x.workaround_publicado), desde: x.dia, tickets: x.tickets,
      }))),
      tabla('acciones_vencidas', 'Acciones correctivas vencidas', [
        col('problema', 'Problema'), col('accion', 'Acción'), col('fecha_limite', 'Fecha límite', 'fecha'), col('dias', 'Días de atraso', 'numero'),
      ], acciones.filter((a) => a.fecha_limite < hoy && problemasPorId[a.problema_id])
        .sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite) || cmpTexto(problemasPorId[a.problema_id].titulo, problemasPorId[b.problema_id].titulo))
        .map((a) => ({ problema: problemasPorId[a.problema_id].titulo, accion: a.descripcion, fecha_limite: a.fecha_limite, dias: restaDias(hoy, a.fecha_limite) }))),
    ], 'Hoy, sin importar el período.'),
  ];
  const avisos = [];

  if (conKb) {
    const enRango = (ts) => { const d = diaLima(ts); return d >= desde && d <= hasta; };
    const usosPeriodo = (id) => contar(db.ticket_kb_usos || [], (u) => u.kb_articulo_id === id && enRango(u.created_at));
    const tablasKb = [
      tabla('por_estado', 'Artículos por estado (hoy)', [col('estado', 'Estado'), col('articulos', 'Artículos', 'numero')],
        ['publicado', 'en_revision', 'borrador', 'obsoleto'].map((e) => ({
          estado: etiqueta('estado_kb', e), articulos: contar(db.kb_articulos || [], (a) => !a.deleted_at && a.estado === e),
        }))),
      tabla('mas_usados', 'Artículos usados para resolver tickets', [
        col('articulo', 'Artículo'), col('tipo', 'Tipo'), col('estado', 'Estado'), col('usos_periodo', 'Usos en el período', 'numero'),
        col('usos_90d', 'Usos (90 días)', 'numero'), col('usos_total', 'Usos (total)', 'numero'), col('util_si', 'Útil: sí', 'numero'), col('util_no', 'Útil: no', 'numero'),
      ], (db.v_kpi_kb || []).filter((k) => k.usos_total > 0)
        .map((k) => ({ k, usos: usosPeriodo(k.kb_articulo_id) }))
        .sort((a, b) => b.usos - a.usos || b.k.usos_total - a.k.usos_total || cmpTexto(a.k.titulo, b.k.titulo))
        .map(({ k, usos }) => ({
          articulo: k.titulo, tipo: etiqueta('tipo_kb', k.tipo), estado: etiqueta('estado_kb', k.estado), usos_periodo: usos,
          usos_90d: k.usos_90d, usos_total: k.usos_total, util_si: k.util_si, util_no: k.util_no,
        }))),
    ];
    if (conTickets) {
      const usados = new Set((db.ticket_kb_usos || []).map((u) => u.ticket_id));
      const resueltos = hechosDeTickets(db).filter((h) => h.resuelto_vigente && h.dia_resuelto >= desde && h.dia_resuelto <= hasta);
      const con = contar(resueltos, (h) => usados.has(h.ticket_id));
      tablasKb.push(tabla('resoluciones_con_articulo', 'Resoluciones con artículo', [col('indicador', 'Indicador'), col('valor', 'Valor', 'numero')], [
        { indicador: 'Tickets resueltos en el período', valor: resueltos.length },
        { indicador: 'Con un artículo usado', valor: con },
        { indicador: 'Porcentaje con artículo (%)', valor: resueltos.length ? pct0(con, resueltos.length) : null },
      ], 'Resuelto = resolución vigente dentro del período (la definición del reporte de Tickets).'));
    }
    secciones.push(seccion('conocimiento', '3. Base de conocimiento', tablasKb, 'Los artículos con al menos un uso registrado; el más usado del período primero.'));
  } else {
    avisos.push('La sección de base de conocimiento requiere el módulo Conocimiento.');
  }

  if (conTickets) {
    secciones.push(seccion('recurrencias', `${conKb ? '4' : '3'}. Categorías recurrentes sin problema`, [
      tabla('recurrentes', null, [
        col('categoria', 'Categoría'), col('tickets', 'Tickets', 'numero'), col('primero', 'Primero', 'fecha'), col('ultimo', 'Último', 'fecha'),
      ], (db.v_categorias_recurrentes || []).slice().sort((a, b) => b.total - a.total || cmpTexto(a.categoria_nombre, b.categoria_nombre)).map((r) => ({
        categoria: r.categoria_nombre, tickets: r.total, primero: diaLima(r.primer_ticket_at), ultimo: diaLima(r.ultimo_ticket_at),
      }))),
    ], `Hoy: categorías con ${umbralN} o más tickets en los últimos ${umbralD} días sin un problema vinculado (umbral de Configuración).`));
  } else {
    avisos.push('Las recurrencias y las resoluciones con artículo requieren el módulo Tickets.');
  }

  return {
    ...cabecera(db, user, 'problemas', { desde, hasta, ahora }),
    parametros: { umbral_recurrencia_n: umbralN, umbral_recurrencia_dias: umbralD },
    avisos,
    secciones,
    filas_csv: {
      columnas: [
        col('problema', 'Problema'), col('severidad', 'Severidad'), col('estado', 'Estado'), col('error_conocido', 'Error conocido'),
        col('workaround', 'Workaround publicado'), col('creado', 'Registrado', 'fecha'), col('tickets', 'Tickets vinculados', 'numero'),
        col('acciones_pendientes', 'Acciones pendientes', 'numero'), col('acciones_vencidas', 'Acciones vencidas', 'numero'),
      ],
      filas: p.filter((x) => (x.dia >= desde && x.dia <= hasta) || x.estado !== 'cerrado')
        .sort((a, b) => a.dia.localeCompare(b.dia) || cmpTexto(a.titulo, b.titulo))
        .map((x) => [
          x.titulo, etiqueta('severidad', x.severidad), etiqueta('estado_problema', x.estado), sino(x.error_conocido), sino(x.workaround_publicado),
          x.dia, x.tickets, x.acciones_pendientes, x.acciones_vencidas,
        ]),
    },
  };
}

// ── Auditoría (solo JEFE) ───────────────────────────────────────────────────
const SIN_SESION = ['entrega_abierta', 'entrega_fallida', 'portal_abierto'];

export function reporteAuditoriaDe(db, { user, desde, hasta, ahora = new Date() }) {
  exigir(db, user, 'rol:jefe');
  validarPeriodo(desde, hasta);
  const staff = porId(db.staff, 'user_id');
  // Nunca ip ni user_agent: no se leen.
  const l = (db.accesos_log || []).filter((x) => { const d = diaLima(x.created_at); return d >= desde && d <= hasta; }).map((x) => ({
    id: x.id, created_at: x.created_at, accion: x.accion, cuenta_usuario: x.cuenta_usuario ?? null, plataforma: x.plataforma ?? null, detalle: x.detalle ?? null,
    accion_etq: etiqueta('accion_log', x.accion),
    quien: staff[x.user_id]?.nombre ?? x.user_email ?? (SIN_SESION.includes(x.accion) ? 'Empleado, vía enlace' : 'Sistema'),
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const fecha = (x) => new Date(x.created_at).toISOString();
  const detalle = (acciones, extra = () => ({})) => l.filter((x) => acciones.includes(x.accion))
    .map((x) => ({ fecha: fecha(x), quien: x.quien, ...extra(x), detalle: x.detalle }));

  return {
    ...cabecera(db, user, 'auditoria', { desde, hasta, ahora }),
    parametros: {},
    avisos: [],
    secciones: [
      seccion('resumen', '1. Resumen por acción', [
        tabla('por_accion', null, [col('accion', 'Acción'), col('registros', 'Registros', 'numero')],
          agrupar(l, (x) => x.accion_etq).map(([accion, xs]) => ({ accion, registros: xs.length }))
            .sort((a, b) => b.registros - a.registros || cmpTexto(a.accion, b.accion))),
      ]),
      seccion('personas', '2. Por persona', [
        tabla('por_persona', null, [
          col('quien', 'Quién'), col('vistas', 'Contraseñas vistas', 'numero'), col('copias', 'Copiadas', 'numero'),
          col('entregas', 'Entregas creadas', 'numero'), col('denegados', 'Accesos denegados', 'numero'), col('total', 'Total', 'numero'),
        ], agrupar(l, (x) => x.quien).map(([quien, xs]) => ({
          quien, vistas: contar(xs, (x) => x.accion === 'ver'), copias: contar(xs, (x) => x.accion === 'copiar'),
          entregas: contar(xs, (x) => ['enviar', 'entrega_creada'].includes(x.accion)),
          denegados: contar(xs, (x) => ['acceso_denegado', 'revelado_denegado'].includes(x.accion)), total: xs.length,
        })).sort((a, b) => b.total - a.total || cmpTexto(a.quien, b.quien))),
      ]),
      seccion('contrasenas', '3. Contraseñas por plataforma', [
        tabla('por_plataforma', null, [
          col('plataforma', 'Plataforma'), col('vistas', 'Vistas', 'numero'), col('copias', 'Copiadas', 'numero'),
          col('fallidos', 'Revelados fallidos o denegados', 'numero'),
        ], agrupar(l.filter((x) => ['ver', 'copiar', 'revelado_fallido', 'revelado_denegado'].includes(x.accion)), (x) => x.plataforma)
          .map(([plataforma, xs]) => ({
            plataforma, vistas: contar(xs, (x) => x.accion === 'ver'), copias: contar(xs, (x) => x.accion === 'copiar'),
            fallidos: contar(xs, (x) => ['revelado_fallido', 'revelado_denegado'].includes(x.accion)),
          })).sort((a, b) => (b.vistas + b.copias) - (a.vistas + a.copias) || cmpTexto(a.plataforma, b.plataforma))),
      ]),
      seccion('denegados', '4. Accesos denegados', [
        tabla('detalle', null, [col('fecha', 'Fecha y hora', 'fecha_hora'), col('quien', 'Quién'), col('accion', 'Acción'), col('detalle', 'Detalle')],
          detalle(['acceso_denegado', 'revelado_denegado'], (x) => ({ accion: x.accion_etq }))),
      ]),
      seccion('permisos', '5. Cambios de permisos', [
        tabla('detalle', null, [
          col('fecha', 'Fecha y hora', 'fecha_hora'), col('quien', 'Quién'), col('accion', 'Acción'), col('sobre', 'Sobre'), col('detalle', 'Detalle'),
        ], detalle(['permiso_otorgado', 'permiso_revocado'], (x) => ({ accion: x.accion_etq, sobre: x.cuenta_usuario }))),
      ]),
      seccion('purgas', '6. Purgas de datos', [
        tabla('detalle', null, [col('fecha', 'Fecha y hora', 'fecha_hora'), col('quien', 'Quién'), col('detalle', 'Detalle')], detalle(['purga_ejecutada'])),
      ]),
    ],
    filas_csv: {
      columnas: [
        col('fecha', 'Fecha y hora', 'fecha_hora'), col('quien', 'Quién'), col('accion', 'Acción'), col('cuenta', 'Cuenta'),
        col('plataforma', 'Plataforma'), col('detalle', 'Detalle'),
      ],
      filas: l.map((x) => [fecha(x), x.quien, x.accion_etq, x.cuenta_usuario, x.plataforma, x.detalle]),
    },
  };
}
