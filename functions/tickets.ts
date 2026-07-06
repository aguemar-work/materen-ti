// ============================================================
// Edge function: tickets
// Único punto por donde se CREA un ticket, se consulta su
// seguimiento público, se envía la encuesta de satisfacción y se
// registra la respuesta — mismo patrón que "entregas" en
// credenciales.ts: el cliente nunca escribe directo en `tickets`
// (sin política de INSERT), todo pasa por aquí con cliente admin.
//
// Acciones (POST { action, ... }):
//   catalogo       público          → { categorias[], subcategorias[] }
//   crear          público o staff  → { codigo, token, vinculado }
//   seguimiento    público          → { codigo, titulo, estado, comentarios[] }
//   buscarPorDni   público          → { tickets[] } (solo tickets ACTIVOS; limitado por IP)
//   encuesta       público          → { ok }
//   enviarEncuesta staff            → { ok, enviado }
//
// Regla de dominio: un token de TICKET es un recurso distinto del
// token de ENTREGA. Un token de entrega solo sirve para resolver
// quién es el empleado al crear (si llega en la URL); nunca se usa
// para leer/escribir un ticket.
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk';

const ORIGENES_PERMITIDOS = new Set([
  'https://materen-ti.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]);

let CORS: Record<string, string> = {};

function corsPara(origin: string | null): Record<string, string> {
  if (!origin || !ORIGENES_PERMITIDOS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function esEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Plantilla mínima, consistente con el tono del resto del sistema
function plantillaCorreo(titulo: string, cuerpoHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#1d2420">
    <h2 style="color:#004741">${titulo}</h2>
    ${cuerpoHtml}
    <p style="font-size:12px;color:#68716b;margin-top:24px">Sistema TI</p>
  </div>`;
}

export default async function (req: Request): Promise<Response> {
  CORS = corsPara(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, code: 'metodo_invalido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body_invalido' }, 400);
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  // Origen del frontend, para armar enlaces en los correos. Se reusa el
  // mismo Origin ya validado para CORS; si no vino uno permitido, se cae
  // al dominio de producción.
  const origenFrontend =
    (req.headers.get('Origin') && ORIGENES_PERMITIDOS.has(req.headers.get('Origin')!))
      ? req.headers.get('Origin')!
      : 'https://materen-ti.vercel.app';

  async function log(ticketId: string, evento: string, detalle: string | null, userId: string | null, userEmail: string | null) {
    await admin.database.from('ticket_eventos').insert([
      { ticket_id: ticketId, evento, detalle, user_id: userId, user_email: userEmail },
    ]);
  }

  // Staff autenticado, si vino Authorization (opcional en "crear")
  async function staffDeSesion(): Promise<{ id: string; email: string | null } | null> {
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userToken) return null;
    const userClient = createClient({ baseUrl, accessToken: userToken });
    const { data } = await userClient.auth.getCurrentUser();
    const user = data?.user;
    if (!user?.id) return null;
    const { data: staffRow } = await admin.database
      .from('staff')
      .select('activo')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!staffRow?.activo) return null;
    return { id: user.id, email: user.email || null };
  }

  // ── catalogo: público, categorías/subcategorías activas para el formulario ──
  if (body.action === 'catalogo') {
    const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
      admin.database.from('categorias_ticket').select('id, nombre').is('deleted_at', null).order('nombre'),
      admin.database.from('subcategorias_ticket').select('id, categoria_id, nombre').is('deleted_at', null).order('nombre'),
    ]);
    return json({ ok: true, categorias: categorias || [], subcategorias: subcategorias || [] });
  }

  // ── crear: público (empleado) o staff (interno / a nombre de un empleado) ──
  if (body.action === 'crear') {
    const titulo = String(body.titulo || '').trim();
    const descripcion = String(body.descripcion || '').trim();
    const categoriaId = String(body.categoriaId || '');
    const subcategoriaId = body.subcategoriaId ? String(body.subcategoriaId) : null;
    if (!titulo || !descripcion || !categoriaId) {
      return json({ ok: false, code: 'datos_requeridos' });
    }

    const staff = await staffDeSesion();
    const origen = staff && body.origen === 'staff_interno' ? 'staff_interno' : 'empleado';

    let empleadoId: string | null = null;
    let vinculado = true;
    const contacto = body.contacto ? String(body.contacto).trim() : null;

    if (body.tokenEntrega) {
      const { data: entrega } = await admin.database
        .from('entregas')
        .select('empleado_id')
        .eq('token', String(body.tokenEntrega))
        .maybeSingle();
      empleadoId = entrega?.empleado_id || null;
      vinculado = !!empleadoId;
    } else if (staff && body.empleadoIdManual) {
      empleadoId = String(body.empleadoIdManual);
    } else if (origen === 'empleado' && contacto) {
      const esCorreo = esEmail(contacto);
      const query = admin.database.from('empleados').select('id').is('deleted_at', null);
      const { data: coincidencias } = esCorreo
        ? await query.ilike('correo_personal', contacto)
        : await query.eq('dni', soloDigitos(contacto));
      if (coincidencias?.length === 1) {
        empleadoId = coincidencias[0].id;
        vinculado = true;
      } else {
        empleadoId = null;
        vinculado = false; // sin match o ambiguo: no bloquea, queda para revisión
      }
    } else if (origen === 'empleado') {
      // Ni token de entrega ni contacto: no hay forma de identificar al empleado
      vinculado = false;
    }

    const { data: codigo, error: eCodigo } = await admin.database.rpc('siguiente_codigo_ticket');
    if (eCodigo || !codigo) return json({ ok: false, code: 'error_codigo' }, 500);

    const token = randomToken();

    // Adjunto opcional (captura de pantalla), ya comprimido en el cliente
    let adjuntoUrl: string | null = null;
    let adjuntoKey: string | null = null;
    const adjunto = body.adjunto as { nombre?: string; tipo?: string; contenidoBase64?: string } | undefined;
    if (adjunto?.contenidoBase64) {
      try {
        const binario = atob(adjunto.contenidoBase64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
        const blob = new Blob([bytes], { type: adjunto.tipo || 'image/jpeg' });
        const key = `${token}/${adjunto.nombre || 'captura.jpg'}`;
        const { data: subida, error: eSubida } = await admin.storage.from('tickets-adjuntos').upload(key, blob);
        if (!eSubida && subida) {
          adjuntoUrl = subida.url;
          adjuntoKey = subida.key;
        }
      } catch {
        // El adjunto es opcional: si falla la subida, el ticket se crea igual
      }
    }

    const { data: ticket, error: eInsert } = await admin.database
      .from('tickets')
      .insert([{
        codigo,
        token,
        titulo,
        descripcion,
        origen,
        empleado_id: empleadoId,
        vinculado,
        contacto_ingresado: contacto,
        creado_por: staff?.id || null,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        equipo_id: body.equipoId || null,
        cuenta_id: body.cuentaId || null,
        licencia_id: body.licenciaId || null,
        adjunto_url: adjuntoUrl,
        adjunto_key: adjuntoKey,
      }])
      .select('id')
      .single();
    if (eInsert || !ticket) return json({ ok: false, code: 'error_creando' }, 500);

    await log(ticket.id, 'creado', `Origen: ${origen}${vinculado ? '' : ' (sin vincular)'}`, staff?.id || null, staff?.email || null);

    // Correo de confirmación con el token — mejor esfuerzo. El token ya
    // quedó guardado y se muestra en pantalla igual, así que un fallo de
    // correo (ej. plan sin envío habilitado) no bloquea la creación.
    let correoDestino: string | null = null;
    if (empleadoId) {
      const { data: empleado } = await admin.database
        .from('empleados').select('correo_personal').eq('id', empleadoId).maybeSingle();
      correoDestino = empleado?.correo_personal || null;
    }
    if (!correoDestino && contacto && esEmail(contacto)) correoDestino = contacto;

    if (correoDestino) {
      const link = `${origenFrontend}/ticket/${token}`;
      const { error: eCorreo } = await admin.emails.send({
        to: correoDestino,
        subject: `Ticket ${codigo} registrado`,
        html: plantillaCorreo('Tu solicitud fue registrada', `
          <p>Código: <strong>${codigo}</strong></p>
          <p>Puedes hacer seguimiento en cualquier momento con este enlace:</p>
          <p><a href="${link}">${link}</a></p>
        `),
      });
      if (eCorreo) {
        await log(ticket.id, 'correo_fallido', `Confirmación: ${eCorreo.message || 'error desconocido'}`, null, null);
      }
    }

    return json({ ok: true, codigo, token, vinculado });
  }

  // ── seguimiento: público, dado el token del ticket ──────────────────
  if (body.action === 'seguimiento') {
    const token = String(body.token || '');
    if (!token) return json({ ok: false, code: 'token_requerido' });

    const { data: ticket } = await admin.database
      .from('tickets')
      .select('id, codigo, titulo, descripcion, estado, created_at, updated_at, categorias_ticket(nombre), subcategorias_ticket(nombre)')
      .eq('token', token)
      .maybeSingle();
    if (!ticket) return json({ ok: false, code: 'no_existe' });

    const { data: comentarios } = await admin.database
      .from('ticket_comentarios')
      .select('mensaje, created_at')
      .eq('ticket_id', ticket.id)
      .eq('interno', false)
      .order('created_at', { ascending: true });

    return json({
      ok: true,
      codigo: ticket.codigo,
      titulo: ticket.titulo,
      descripcion: ticket.descripcion,
      estado: ticket.estado,
      categoria: ticket.categorias_ticket?.nombre || '',
      subcategoria: ticket.subcategorias_ticket?.nombre || '',
      creado: ticket.created_at,
      actualizado: ticket.updated_at,
      // No se exponen nombres de staff: cara pública única, "Soporte TI"
      comentarios: (comentarios || []).map((c) => ({ mensaje: c.mensaje, fecha: c.created_at, autor: 'Soporte TI' })),
    });
  }

  // ── buscarPorDni: público, para quien perdió el enlace de seguimiento ──
  // Solo devuelve tickets ACTIVOS (nunca cerrados/rechazados/resueltos) y
  // nunca revela si el DNI corresponde o no a un empleado real. Limitado
  // por IP para frenar enumeración de DNIs (8 dígitos es poco espacio).
  if (body.action === 'buscarPorDni') {
    const dni = soloDigitos(String(body.dni || ''));
    if (dni.length !== 8) return json({ ok: false, code: 'dni_invalido' });

    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'desconocida')
      .split(',')[0].trim();
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data: intentosPrevios } = await admin.database
      .from('ticket_busqueda_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if ((intentosPrevios?.length || 0) >= 15) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }
    await admin.database.from('ticket_busqueda_intentos').insert([{ ip, dni }]);

    const { data: empleado } = await admin.database
      .from('empleados').select('id').eq('dni', dni).is('deleted_at', null).maybeSingle();
    if (!empleado) return json({ ok: true, tickets: [] });

    const { data: tickets } = await admin.database
      .from('tickets')
      .select('codigo, titulo, estado, created_at, token')
      .eq('empleado_id', empleado.id)
      .in('estado', ['abierto', 'en_progreso', 'reabierto'])
      .order('created_at', { ascending: false });

    return json({
      ok: true,
      tickets: (tickets || []).map((t) => ({
        codigo: t.codigo, titulo: t.titulo, estado: t.estado, creado: t.created_at, token: t.token,
      })),
    });
  }

  // ── encuesta: público, respuesta a la encuesta de satisfacción ──────
  if (body.action === 'encuesta') {
    const token = String(body.token || '');
    const nivel = Number(body.nivel);
    if (!token || !nivel || nivel < 1 || nivel > 5) return json({ ok: false, code: 'datos_invalidos' });

    const { data: ticket } = await admin.database
      .from('tickets').select('id').eq('token', token).maybeSingle();
    if (!ticket) return json({ ok: false, code: 'no_existe' });

    const { data: encuesta } = await admin.database
      .from('ticket_satisfaccion').select('id, fecha_envio').eq('ticket_id', ticket.id).maybeSingle();
    if (!encuesta) return json({ ok: false, code: 'no_disponible' });
    if (encuesta.fecha_envio) return json({ ok: false, code: 'ya_respondida' });

    const { error: eUpdate } = await admin.database
      .from('ticket_satisfaccion')
      .update({ nivel, comentario: trimOVacio(body.comentario), fecha_envio: new Date().toISOString() })
      .eq('id', encuesta.id);
    if (eUpdate) return json({ ok: false, code: 'error_guardando' }, 500);

    await log(ticket.id, 'encuesta_respondida', `Nivel ${nivel}`, null, null);
    return json({ ok: true });
  }

  // ── enviarEncuesta: staff, tras cerrar el ticket ─────────────────────
  if (body.action === 'enviarEncuesta') {
    const staff = await staffDeSesion();
    if (!staff) return json({ ok: false, code: 'no_autenticado' }, 401);

    const ticketId = String(body.ticketId || '');
    if (!ticketId) return json({ ok: false, code: 'ticket_requerido' });

    const { data: ticket } = await admin.database
      .from('tickets')
      .select('id, codigo, token, estado, empleado_id, contacto_ingresado, empleados(correo_personal)')
      .eq('id', ticketId)
      .maybeSingle();
    if (!ticket) return json({ ok: false, code: 'no_existe' });
    if (ticket.estado !== 'cerrado') return json({ ok: false, code: 'no_esta_cerrado' });
    if (!ticket.empleado_id) return json({ ok: true, enviado: false }); // interno: no aplica

    const correoDestino = ticket.empleados?.correo_personal
      || (ticket.contacto_ingresado && esEmail(ticket.contacto_ingresado) ? ticket.contacto_ingresado : null);
    if (!correoDestino) return json({ ok: true, enviado: false });

    const link = `${origenFrontend}/ticket/${ticket.token}/satisfaccion`;
    const { error: eCorreo } = await admin.emails.send({
      to: correoDestino,
      subject: `¿Cómo te fue con tu ticket ${ticket.codigo}?`,
      html: plantillaCorreo('Tu opinión nos ayuda a mejorar', `
        <p>Cerramos tu ticket <strong>${ticket.codigo}</strong>. Cuéntanos cómo te fue:</p>
        <p><a href="${link}">${link}</a></p>
      `),
    });

    if (eCorreo) {
      await log(ticket.id, 'correo_fallido', `Encuesta: ${eCorreo.message || 'error desconocido'}`, staff.id, staff.email);
      return json({ ok: true, enviado: false });
    }
    await log(ticket.id, 'encuesta_enviada', null, staff.id, staff.email);
    return json({ ok: true, enviado: true });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}

function trimOVacio(valor: unknown): string | null {
  const s = String(valor ?? '').trim();
  return s || null;
}
