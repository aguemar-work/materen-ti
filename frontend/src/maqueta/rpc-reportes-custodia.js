// Lado servidor FALSO de los reportes de Custodia (migración 117):
// reporte_inventario_equipos, reporte_licencias y reporte_correos. Misma
// aritmética, mismas columnas y mismos rótulos que el SQL; el escenario S17 de
// scripts/sql-local/verificar-migraciones.mjs compara el inventario de esta
// maqueta con la RPC sobre el mismo fixture. NADA de esto entra al bundle de
// producción.
import {
  cabecera, col, tabla, seccion, etiqueta, exigir, parametro, porId, nombreDe, agrupar, contar, cmpTexto,
  diaLima, sumarDias, restaDias, maxIso,
} from './reportes-forma.js';

// ── Inventario de equipos ───────────────────────────────────────────────────
const SITUACIONES = ['asignado', 'en_ubicacion', 'disponible', 'en_reparacion', 'de_baja', 'perdido'];

function filasEquipos(db) {
  const tipos = porId(db.tipos_equipo), empresas = porId(db.empresas), emps = porId(db.empleados);
  const areas = porId(db.areas_obras), ubis = porId(db.ubicaciones);
  const activas = new Map((db.asignaciones_equipo || []).filter((a) => !a.fecha_fin).map((a) => [a.equipo_id, a]));
  return (db.equipos || []).filter((q) => !q.deleted_at).map((q) => {
    const a = activas.get(q.id) || null;
    const e = a?.empleado_id ? emps[a.empleado_id] || null : null;
    const tipo = tipos[q.tipo_id]?.nombre ?? q.tipo_id;
    return {
      codigo: q.codigo, codigo_almacen: q.codigo_almacen ?? null, marca: q.marca ?? null, modelo: q.modelo ?? null,
      serie: q.serie ?? null, estado: q.estado, fecha_compra: q.fecha_compra ?? null, garantia_hasta: q.garantia_hasta ?? null,
      tipo, descripcion: `${tipo ?? ''} ${q.marca ?? ''} ${q.modelo ?? ''}`.trim(),
      empresa: empresas[q.empresa_id]?.nombre ?? null,
      empleado_id: a?.empleado_id ?? null, ubicacion_id: a?.ubicacion_id ?? null, fecha_inicio: a?.fecha_inicio ?? null,
      portador: nombreDe(e), portador_estado: e?.estado ?? null, portador_area: e ? areas[e.area_obra_id]?.nombre ?? null : null,
      ubicacion: a?.ubicacion_id ? ubis[a.ubicacion_id]?.nombre ?? null : null,
      situacion: q.estado !== 'operativo' ? q.estado : a?.empleado_id ? 'asignado' : a?.ubicacion_id ? 'en_ubicacion' : 'disponible',
    };
  });
}

/** v_actas_pendientes (110) where activa. */
function actasPendientes(db, hoy) {
  const dias = parametro(db, 'dias_acta_sin_adjuntar', 3);
  const crudo = (db.config_parametros || []).find((p) => p.clave === 'actas_pendientes_desde')?.valor;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(crudo ?? '')) ? crudo : '1900-01-01';
  const equipos = porId((db.equipos || []).filter((q) => !q.deleted_at)), tipos = porId(db.tipos_equipo), emps = porId(db.empleados);
  const conActa = new Set((db.actas || []).filter((x) => x.tipo === 'entrega' && !x.deleted_at).map((x) => x.asignacion_equipo_id));
  return (db.asignaciones_equipo || [])
    .filter((a) => a.empleado_id && !a.fecha_fin && equipos[a.equipo_id] && emps[a.empleado_id]
      && a.fecha_inicio <= sumarDias(hoy, -dias) && a.fecha_inicio >= desde && !conActa.has(a.id))
    .map((a) => {
      const q = equipos[a.equipo_id];
      return {
        codigo: q.codigo, equipo: `${tipos[q.tipo_id]?.nombre ?? ''} ${q.marca ?? ''} ${q.modelo ?? ''}`.trim(),
        persona: nombreDe(emps[a.empleado_id]), entregado: a.fecha_inicio, dias: restaDias(hoy, a.fecha_inicio),
      };
    })
    .sort((x, y) => x.entregado.localeCompare(y.entregado) || x.codigo.localeCompare(y.codigo));
}

export function reporteInventarioDe(db, { user, ahora = new Date() }) {
  exigir(db, user, 'modulo:equipos');
  const hoy = diaLima(ahora);
  const diasGar = parametro(db, 'dias_por_vencer_garantia', 30);
  const diasActa = parametro(db, 'dias_acta_sin_adjuntar', 3);
  const eq = filasEquipos(db);

  const porTipo = agrupar(eq, (x) => x.tipo).map(([tipo, xs]) => ({
    tipo, total: xs.length, en_uso: contar(xs, (x) => ['asignado', 'en_ubicacion'].includes(x.situacion)),
    disponibles: contar(xs, (x) => x.situacion === 'disponible'), en_reparacion: contar(xs, (x) => x.situacion === 'en_reparacion'),
    fuera: contar(xs, (x) => ['de_baja', 'perdido'].includes(x.situacion)),
  })).sort((a, b) => b.total - a.total || cmpTexto(a.tipo, b.tipo));
  const porUbicacion = agrupar(eq.filter((x) => x.ubicacion_id), (x) => x.ubicacion).map(([ubicacion, xs]) => {
    const operativos = contar(xs, (x) => x.estado === 'operativo');
    return { ubicacion, operativos, otros: xs.length - operativos, total: xs.length };
  }).sort((a, b) => b.total - a.total || cmpTexto(a.ubicacion, b.ubicacion));
  const custodia = agrupar(eq.filter((x) => x.empleado_id), (x) => x.portador_area).map(([area, xs]) => ({
    area, personas: new Set(xs.map((x) => x.empleado_id)).size, equipos: xs.length,
  })).sort((a, b) => b.equipos - a.equipos || cmpTexto(a.area, b.area));
  const garantias = eq.filter((x) => ['operativo', 'en_reparacion'].includes(x.estado) && x.garantia_hasta && x.garantia_hasta <= sumarDias(hoy, diasGar))
    .sort((a, b) => a.garantia_hasta.localeCompare(b.garantia_hasta) || a.codigo.localeCompare(b.codigo))
    .map((x) => ({
      codigo: x.codigo, equipo: x.descripcion, garantia_hasta: x.garantia_hasta, dias: restaDias(x.garantia_hasta, hoy),
      situacion: x.garantia_hasta < hoy ? 'Vencida' : 'Por vencer',
    }));
  const sinDevolver = eq.filter((x) => x.empleado_id && x.portador_estado === 'Inactivo').map((x) => {
    const baja = maxIso((db.empleado_eventos || []).filter((ev) => ev.empleado_id === x.empleado_id
      && (ev.evento === 'baja_ejecutada' || (ev.evento === 'estado_cambiado' && ev.valor_nuevo === 'Inactivo'))).map((ev) => ev.created_at));
    const dia = baja ? diaLima(baja) : null;
    return { codigo: x.codigo, equipo: x.descripcion, persona: x.portador, entregado: x.fecha_inicio, baja: dia, dias_baja: dia ? restaDias(hoy, dia) : null };
  }).sort((a, b) => (a.baja == null ? -1 : b.baja == null ? 1 : a.baja.localeCompare(b.baja)) || a.codigo.localeCompare(b.codigo));

  return {
    ...cabecera(db, user, 'inventario', { ahora }),
    parametros: { dias_por_vencer_garantia: diasGar, dias_acta_sin_adjuntar: diasActa },
    avisos: [],
    secciones: [
      seccion('situacion', '1. Situación del parque', [
        tabla('por_situacion', null, [col('situacion', 'Situación'), col('equipos', 'Equipos', 'numero')], [
          ...SITUACIONES.map((s) => ({ situacion: etiqueta('situacion_equipo', s), equipos: contar(eq, (x) => x.situacion === s) })),
          { situacion: 'Total', equipos: eq.length },
        ]),
        tabla('por_tipo', 'Por tipo', [
          col('tipo', 'Tipo'), col('total', 'Total', 'numero'), col('en_uso', 'En uso', 'numero'), col('disponibles', 'Disponibles', 'numero'),
          col('en_reparacion', 'En reparación', 'numero'), col('fuera', 'De baja o perdidos', 'numero'),
        ], porTipo),
      ], 'Foto al momento de generar el reporte. «Asignado» lo tiene una persona; «En ubicación» está en una sede, obra o almacén; «En uso» suma los dos.'),
      seccion('ubicacion', '2. Por ubicación y en custodia', [
        tabla('por_ubicacion', 'En ubicaciones', [
          col('ubicacion', 'Ubicación'), col('operativos', 'Operativos', 'numero'), col('otros', 'En reparación, de baja o perdidos', 'numero'),
          col('total', 'Total', 'numero'),
        ], porUbicacion),
        tabla('custodia_por_area', 'En custodia de personas, por área u obra', [
          col('area', 'Área u obra'), col('personas', 'Personas', 'numero'), col('equipos', 'Equipos', 'numero'),
        ], custodia, 'El área u obra es la de la persona hoy.'),
      ]),
      seccion('alertas', '3. Garantías, devoluciones y actas', [
        tabla('garantias', `Garantías vencidas o por vencer en ${diasGar} días`, [
          col('codigo', 'Código', 'codigo'), col('equipo', 'Equipo'), col('garantia_hasta', 'Garantía hasta', 'fecha'),
          col('dias', 'Días', 'numero'), col('situacion', 'Situación'),
        ], garantias, 'Equipos operativos o en reparación (la misma regla del Inicio). Días negativos: la garantía ya venció.'),
        tabla('sin_devolver', 'Sin devolver de personas dadas de baja', [
          col('codigo', 'Código', 'codigo'), col('equipo', 'Equipo'), col('persona', 'Persona'), col('entregado', 'Entregado', 'fecha'),
          col('baja', 'Baja', 'fecha'), col('dias_baja', 'Días desde la baja', 'numero'),
        ], sinDevolver, 'La fecha de baja sale de la hoja de vida de la persona.'),
        tabla('actas_pendientes', `Entregas sin acta firmada (más de ${diasActa} días)`, [
          col('codigo', 'Código', 'codigo'), col('equipo', 'Equipo'), col('persona', 'Persona'), col('entregado', 'Entregado', 'fecha'),
          col('dias', 'Días', 'numero'),
        ], actasPendientes(db, hoy)),
      ]),
    ],
    filas_csv: {
      columnas: [
        col('codigo', 'Código', 'codigo'), col('codigo_almacen', 'Código de almacén', 'codigo'), col('tipo', 'Tipo'), col('marca', 'Marca'),
        col('modelo', 'Modelo'), col('serie', 'Serie', 'codigo'), col('empresa', 'Empresa'), col('situacion', 'Situación'),
        col('portador', 'Asignado a'), col('ubicacion', 'Ubicación'), col('fecha_compra', 'Fecha de compra', 'fecha'),
        col('garantia_hasta', 'Garantía hasta', 'fecha'),
      ],
      filas: eq.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)).map((x) => [
        x.codigo, x.codigo_almacen, x.tipo, x.marca, x.modelo, x.serie, x.empresa, etiqueta('situacion_equipo', x.situacion),
        x.portador, x.ubicacion, x.fecha_compra, x.garantia_hasta,
      ]),
    },
  };
}

// ── Licencias ───────────────────────────────────────────────────────────────
export function reporteLicenciasDe(db, { user, ahora = new Date() }) {
  exigir(db, user, 'modulo:licencias');
  const hoy = diaLima(ahora);
  const dias = parametro(db, 'dias_por_vencer_licencia', 30);
  const emps = porId(db.empleados), empresas = porId(db.empresas), cuentas = porId(db.cuentas);
  const activos = (tabla2, campo, id) => (db[tabla2] || []).filter((a) => a[campo] === id && !a.fecha_fin && emps[a.empleado_id]);
  const nombres = (asigs) => {
    const ns = asigs.map((a) => nombreDe(emps[a.empleado_id])).sort(cmpTexto);
    return ns.length ? ns.join(', ') : null;
  };
  const li = (db.licencias || []).filter((l) => !l.deleted_at).map((l) => {
    const asigs = l.cuenta_id ? activos('asignaciones_cuenta', 'cuenta_id', l.cuenta_id) : activos('asignaciones_licencia', 'licencia_id', l.id);
    const f = l.fecha_vencimiento ?? null;
    return {
      id: l.id, software: l.software, tipo: l.tipo, cantidad: l.cantidad, usados: asigs.length, libres: Math.max(l.cantidad - asigs.length, 0),
      fecha_vencimiento: f, proveedor: l.proveedor ?? null, renovacion_meses: l.renovacion_meses ?? null,
      empresa: empresas[l.empresa_id]?.nombre ?? null, acceso: l.cuenta_id ? cuentas[l.cuenta_id]?.usuario ?? null : null,
      situacion: l.tipo === 'perpetua' ? 'perpetua' : f == null ? 'sin_fecha' : f < hoy ? 'vencida' : f <= sumarDias(hoy, dias) ? 'por_vencer' : 'vigente',
      usuarios: nombres(asigs),
    };
  }).sort((a, b) => cmpTexto(a.software, b.software));
  const suma = (k) => li.reduce((s, x) => s + x[k], 0);

  return {
    ...cabecera(db, user, 'licencias', { ahora }),
    parametros: { dias_por_vencer_licencia: dias },
    avisos: [],
    secciones: [
      seccion('resumen', '1. Resumen', [
        tabla('indicadores', null, [col('indicador', 'Indicador'), col('valor', 'Cantidad', 'numero')], [
          { indicador: 'Licencias registradas', valor: li.length },
          { indicador: 'Asientos comprados', valor: suma('cantidad') },
          { indicador: 'Asientos usados', valor: suma('usados') },
          { indicador: 'Asientos libres', valor: suma('libres') },
          { indicador: 'Licencias sin asientos libres', valor: contar(li, (x) => x.libres === 0) },
          { indicador: 'Vencidas', valor: contar(li, (x) => x.situacion === 'vencida') },
          { indicador: `Por vencer en ${dias} días`, valor: contar(li, (x) => x.situacion === 'por_vencer') },
        ]),
      ], 'Foto al momento de generar el reporte. Una licencia ligada a un correo cuenta como usados a los titulares de ese correo.'),
      seccion('cupo', '2. Cupo por licencia', [
        tabla('por_licencia', null, [
          col('software', 'Software'), col('empresa', 'Empresa'), col('tipo', 'Tipo'), col('cantidad', 'Asientos', 'numero'),
          col('usados', 'Usados', 'numero'), col('libres', 'Libres', 'numero'), col('vencimiento', 'Vencimiento', 'fecha'), col('situacion', 'Situación'),
        ], li.map((x) => ({
          software: x.software, empresa: x.empresa, tipo: etiqueta('tipo_licencia', x.tipo), cantidad: x.cantidad, usados: x.usados,
          libres: x.libres, vencimiento: x.fecha_vencimiento, situacion: etiqueta('situacion_licencia', x.situacion),
        }))),
      ]),
      seccion('vencimientos', '3. Vencimientos', [
        tabla('vencidas_y_por_vencer', `Vencidas o por vencer en ${dias} días`, [
          col('software', 'Software'), col('empresa', 'Empresa'), col('vencimiento', 'Vencimiento', 'fecha'), col('dias', 'Días', 'numero'),
          col('cantidad', 'Asientos', 'numero'), col('renovacion_meses', 'Renovación (meses)', 'numero'), col('situacion', 'Situación'),
        ], li.filter((x) => ['vencida', 'por_vencer'].includes(x.situacion))
          .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || cmpTexto(a.software, b.software))
          .map((x) => ({
            software: x.software, empresa: x.empresa, vencimiento: x.fecha_vencimiento, dias: restaDias(x.fecha_vencimiento, hoy),
            cantidad: x.cantidad, renovacion_meses: x.renovacion_meses, situacion: etiqueta('situacion_licencia', x.situacion),
          })), 'Días negativos: la licencia ya venció. Las perpetuas no vencen.'),
      ]),
    ],
    filas_csv: {
      columnas: [
        col('software', 'Software'), col('proveedor', 'Proveedor'), col('empresa', 'Empresa'), col('tipo', 'Tipo'),
        col('acceso', 'Correo de acceso'), col('cantidad', 'Asientos', 'numero'), col('usados', 'Usados', 'numero'),
        col('libres', 'Libres', 'numero'), col('vencimiento', 'Vencimiento', 'fecha'), col('situacion', 'Situación'), col('usuarios', 'Usuarios'),
      ],
      filas: li.map((x) => [
        x.software, x.proveedor, x.empresa, etiqueta('tipo_licencia', x.tipo), x.acceso, x.cantidad, x.usados, x.libres,
        x.fecha_vencimiento, etiqueta('situacion_licencia', x.situacion), x.usuarios,
      ]),
    },
  };
}

// ── Correos y cuentas ───────────────────────────────────────────────────────
export function reporteCorreosDe(db, { user, ahora = new Date() }) {
  exigir(db, user, 'modulo:correos');
  const hoy = diaLima(ahora);
  const emps = porId(db.empleados), plataformas = porId(db.plataformas);
  const cu = (db.cuentas || []).filter((c) => !c.deleted_at).map((c) => {
    const ns = (db.asignaciones_cuenta || []).filter((a) => a.cuenta_id === c.id && !a.fecha_fin && emps[a.empleado_id])
      .map((a) => nombreDe(emps[a.empleado_id])).sort(cmpTexto);
    return {
      usuario: c.usuario, tipo_cuenta: c.tipo_cuenta || 'personal', requiere_rotacion: !!c.requiere_rotacion,
      sin_password: c.password == null, ultimo_cambio: c.last_password_change ? diaLima(c.last_password_change) : null,
      url: c.url ?? null, plataforma: plataformas[c.plataforma_id]?.nombre ?? c.plataforma_id, titulares: ns.length ? ns.join(', ') : null,
    };
  });
  const fila = (plataforma, xs) => ({
    plataforma, personales: contar(xs, (x) => x.tipo_cuenta === 'personal'), reutilizables: contar(xs, (x) => x.tipo_cuenta === 'reutilizable'),
    compartidas: contar(xs, (x) => x.tipo_cuenta === 'compartida'), total: xs.length,
    por_rotar: contar(xs, (x) => x.requiere_rotacion), sin_password: contar(xs, (x) => x.sin_password),
  });
  const porPlataforma = agrupar(cu, (x) => x.plataforma).map(([p, xs]) => fila(p, xs)).sort((a, b) => b.total - a.total || cmpTexto(a.plataforma, b.plataforma));
  const porCuenta = (a, b) => cmpTexto(a.plataforma, b.plataforma) || cmpTexto(a.usuario, b.usuario);

  return {
    ...cabecera(db, user, 'correos', { ahora }),
    parametros: {},
    avisos: [],
    secciones: [
      seccion('plataformas', '1. Cuentas por plataforma', [
        tabla('por_plataforma', null, [
          col('plataforma', 'Plataforma'), col('personales', 'Personales', 'numero'), col('reutilizables', 'Reutilizables', 'numero'),
          col('compartidas', 'Compartidas', 'numero'), col('total', 'Total', 'numero'), col('por_rotar', 'Por rotar', 'numero'),
          col('sin_password', 'Sin contraseña', 'numero'),
        ], [...porPlataforma, fila('Total', cu)]),
      ], 'Foto al momento de generar el reporte: todas las cuentas vivas, también las personales.'),
      seccion('rotaciones', '2. Rotaciones de contraseña pendientes', [
        tabla('pendientes', null, [
          col('plataforma', 'Plataforma'), col('cuenta', 'Cuenta', 'codigo'), col('tipo', 'Tipo'), col('titulares', 'Titulares'),
          col('ultimo_cambio', 'Último cambio', 'fecha'), col('dias', 'Días sin cambiar', 'numero'),
        ], cu.filter((x) => x.requiere_rotacion)
          .sort((a, b) => (a.ultimo_cambio == null ? -1 : b.ultimo_cambio == null ? 1 : a.ultimo_cambio.localeCompare(b.ultimo_cambio)) || porCuenta(a, b))
          .map((x) => ({
            plataforma: x.plataforma, cuenta: x.usuario, tipo: etiqueta('tipo_cuenta', x.tipo_cuenta), titulares: x.titulares,
            ultimo_cambio: x.ultimo_cambio, dias: x.ultimo_cambio ? restaDias(hoy, x.ultimo_cambio) : null,
          }))),
      ], 'Antigüedad: días corridos desde el último cambio de contraseña registrado (no se guarda cuándo se marcó la rotación).'),
      seccion('libres', '3. Cuentas reutilizables sin titular', [
        tabla('reutilizables_libres', null, [
          col('plataforma', 'Plataforma'), col('cuenta', 'Cuenta', 'codigo'), col('por_rotar', 'Requiere rotación'), col('ultimo_cambio', 'Último cambio', 'fecha'),
        ], cu.filter((x) => x.tipo_cuenta === 'reutilizable' && x.titulares == null).sort(porCuenta).map((x) => ({
          plataforma: x.plataforma, cuenta: x.usuario, por_rotar: x.requiere_rotacion ? 'Sí' : 'No', ultimo_cambio: x.ultimo_cambio,
        }))),
      ]),
    ],
    filas_csv: {
      columnas: [
        col('plataforma', 'Plataforma'), col('tipo', 'Tipo'), col('cuenta', 'Correo o usuario', 'codigo'), col('titulares', 'Titulares'),
        col('por_rotar', 'Requiere rotación'), col('ultimo_cambio', 'Último cambio de contraseña', 'fecha'), col('url', 'URL'),
      ],
      filas: cu.filter((x) => ['compartida', 'reutilizable'].includes(x.tipo_cuenta)).sort(porCuenta).map((x) => [
        x.plataforma, etiqueta('tipo_cuenta', x.tipo_cuenta), x.usuario, x.titulares, x.requiere_rotacion ? 'Sí' : 'No', x.ultimo_cambio, x.url,
      ]),
    },
  };
}
