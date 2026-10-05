// ============================================================
// Edge function: tickets
// Único punto por donde se CREA un ticket, se consulta su
// seguimiento público y se registra la respuesta de la encuesta de
// satisfacción — mismo patrón que "entregas" en credenciales.ts: el
// cliente nunca escribe directo en `tickets` (sin política de
// INSERT), todo pasa por aquí con cliente admin.
//
// Acciones (POST { action, ... }):
//   catalogo       público          → { categorias[], subcategorias[] } (con `aviso`, 114, y `prioridad_sugerida`, 116)
//   crear          público o staff  → { codigo, token, vinculado }
//   seguimiento    público          → { codigo, titulo, estado, comentarios[], adjuntoUrl? }
//   adjuntoStaff   staff            → { url, expiraSegundos } (URL firmada de la captura de un ticket)
//   buscarPorDni   público          → { tickets[] } (solo tickets ACTIVOS; limitado por IP)
//   encuestaEstado público          → { respondida } (para no mostrar el formulario tras refrescar)
//   encuesta       público          → { ok }
//   version        staff            → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping           público          → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
//
// Adjuntos (migración 111): el bucket `tickets-adjuntos` es PRIVADO. La captura
// se guarda en `tickets/<ticket.id>/captura.<ext>` (antes `<token>/…`, que dejaba
// el token de seguimiento en la URL del objeto) y solo se abre con una URL
// firmada de corta vida: `seguimiento` (el dueño del enlace) y `adjuntoStaff`
// (staff con el módulo `tickets`, verificado por la RPC `puede`). Los metadatos
// (EXIF/XMP/ICC/comentarios) se eliminan en el servidor antes de subir.
//
// `crear` delega en la RPC `crear_ticket_publico` (ticket + evento + intento en
// UNA transacción, ver migración 111): ya no hay un insert suelto de
// `ticket_eventos` que pueda fallar en silencio.
//
// Nota: el sistema no envía avisos/notificaciones por correo (se
// retiró intencionalmente; ver docs/HISTORIAL-AUDITORIAS.md). El
// único canal garantizado es la pantalla (código + token visibles al
// crear); la encuesta de satisfacción se guarda pero no se notifica.
//
// Regla de dominio: un token de TICKET es un recurso distinto del
// token de ENTREGA — nunca se usa para leer/escribir un ticket. `crear`
// aceptaba opcionalmente un `tokenEntrega` en el body para resolver al
// empleado sin pedir DNI; se retiró (código muerto desde la migración
// 067, que eliminó entregas.token — ver docs/HISTORIAL-AUDITORIAS.md).
// ============================================================

import { createAdminClient } from 'npm:@insforge/sdk@1.5.2';

// Helpers compartidos (functions/_shared/): scripts/build-functions.mjs pega
// cada bloque aquí para generar functions/dist/tickets.ts, que es lo que se
// despliega (el runtime exige UN archivo por function). No editar el dist.
// @inline ./_shared/tipos.ts
// @inline ./_shared/http.ts
// @inline ./_shared/errores.ts
// @inline ./_shared/auth.ts
// @inline ./_shared/permisos.ts
// @inline ./_shared/ratelimit.ts
// @inline ./_shared/imagenes.ts
// @inline ./_shared/version.ts

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Validación de adjuntos (auditoría H-03) ──────────────────
// El adjunto es una captura de pantalla comprimida en el cliente (~200KB).
// El cliente NO es de confianza: se ignora el `tipo` declarado y se
// deduce el formato real por los magic bytes, se exige que sea una imagen
// y se acota el tamaño muy por debajo del máximo de la plataforma (50MB).
const ADJUNTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Topes de texto y rate-limit de "crear" (auditoría integral, S-01) ──────
// El endpoint es público y sin sesión: sin esto, un script podía insertar
// tickets sin fin y con texto de tamaño arbitrario (el adjunto ya estaba
// acotado, el texto no). Los topes son generosos para un reporte real (un
// título es una frase, una descripción puede incluir pasos detallados) pero
// muy por debajo de lo que un abuso automatizado necesitaría para doler.
const TITULO_MAX_LEN = 200;
const DESCRIPCION_MAX_LEN = 5000;

// El rate-limit de la creación pública (8 por IP y 5 por DNI cada 10 min) vive
// DENTRO de la RPC crear_ticket_publico (migración 111), en la misma
// transacción que el ticket: un staff autenticado no lo consume.

// Adjuntos privados (migración 111): URL firmada de corta vida, 300 s.
const ADJUNTOS_BUCKET = 'tickets-adjuntos';
const ADJUNTO_URL_SEGUNDOS = 300;
const ADJUNTO_STAFF_MAX_USUARIO = 120; // urls firmadas por usuario y ventana
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Valores de tickets.prioridad (CHECK de la 016; `urgente` se lee «Crítica» en
// la interfaz). Solo el staff puede mandar una explícita (migración 116).
const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'];

// Rate-limits de las acciones públicas de solo lectura/respuesta (Ciclo 21),
// por IP y sobre `intentos_publicos` (migración 104). Mismos 10 min de ventana.
const LIMITE_VENTANA_MIN = 10;
const SEGUIMIENTO_MAX_IP = 60;
const CATALOGO_MAX_IP = 60;
const ENCUESTA_MAX_IP = 30; // encuestaEstado y encuesta, cada una por separado

// URL firmada de corta vida para una captura del bucket privado (111). null si
// no se puede firmar (objeto ausente, falla de red): nunca rompe la respuesta
// que la incluye.
async function urlFirmadaAdjunto(admin: ClienteAdmin, key: string): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from(ADJUNTOS_BUCKET).createSignedUrl(key, ADJUNTO_URL_SEGUNDOS);
    return !error && data?.signedUrl ? data.signedUrl : null;
  } catch {
    return null;
  }
}

export function esEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Envoltorio de primer nivel (Ciclo 20): toda excepción no controlada — o
// una falla fail-closed de un rate-limit que no se pudo contar/registrar —
// termina en { ok:false, code:'error_interno' } (500) con las cabeceras CORS
// de esta petición, en vez de un 500 opaco sin CORS de la plataforma. Al log
// solo va el mensaje, nunca el body (puede traer DNI/contacto).
export default (req: Request): Promise<Response> => conEnvoltorio('tickets', req, manejar);

async function manejar(req: Request, cors: Record<string, string>): Promise<Response> {
  const json = (body: unknown, status = 200) => respuesta(cors, body, status);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'metodo_invalido' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: 'body_invalido' }, 400);
  }

  // ping: healthcheck público (Ciclo 21). Sin sesión y SIN tocar la BD.
  if (body.action === 'ping') {
    return json({ ok: true, funcion: 'tickets', hora: new Date().toISOString() });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  async function log(ticketId: string, evento: string, detalle: string | null, userId: string | null, userEmail: string | null) {
    await admin.database.from('ticket_eventos').insert([
      { ticket_id: ticketId, evento, detalle, user_id: userId, user_email: userEmail },
    ]);
  }

  // Staff autenticado, si vino Authorization (opcional en "crear"). Ciclo 21 —
  // FAIL-CLOSED (ver _shared/auth.ts): "sin cabecera / token anónimo o inválido /
  // usuario que no es staff activo" siguen siendo público (null), pero si HAY un
  // usuario autenticado y la consulta de `staff` (o de la sesión) FALLA, se
  // LANZA → error_interno 500. Antes un error de BD degradaba en silencio al
  // staff a público (su ticket salía con origen 'empleado').
  const staffDeLaPeticion = () => staffDeSesion(req, admin, baseUrl);

  const ip = ipDesdeHeaders(req.headers);

  // version: staff únicamente (cierra el pendiente de H-12 — ver el mismo
  // comentario en functions/credenciales.ts). No es una acción pública.
  if (body.action === 'version') {
    const staff = await staffDeLaPeticion();
    if (!staff) return json({ ok: false, code: 'no_autenticado' }, 401);
    return json(await datosVersion(admin, 'tickets'));
  }

  // ── catalogo: público, categorías/subcategorías activas para el formulario ──
  // `aviso` (migración 114): advertencia fija que el formulario muestra al
  // elegir la categoría o la subcategoría (gana el de la subcategoría). Es texto
  // plano del catálogo, sin datos personales: puede salir al portal público.
  // `prioridad_sugerida` (116): prioridad inicial de la subcategoría (NULL =
  // media). El portal público NO la muestra; el formulario interno del staff
  // la usa para precargar su selector. La que vale la fija la RPC al crear.
  if (body.action === 'catalogo') {
    if (await excedeLimite(admin, 'tickets.catalogo', ip, CATALOGO_MAX_IP, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }
    const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
      admin.database.from('categorias_ticket').select('id, nombre, aviso').is('deleted_at', null).order('nombre'),
      admin.database.from('subcategorias_ticket').select('id, categoria_id, nombre, tipo_sugerido, prioridad_sugerida, aviso').is('deleted_at', null).order('nombre'),
    ]);
    return json({ ok: true, categorias: categorias || [], subcategorias: subcategorias || [] });
  }

  // ── crear: público (empleado) o staff (interno / a nombre de un empleado) ──
  // Orden (migración 111): validación rápida → sesión de staff (opcional) →
  // adjunto decodificado, validado y SIN metadatos (en memoria) → RPC
  // `crear_ticket_publico` (rate-limit público, vinculación por DNI, código,
  // ticket, evento `creado` e intento, TODO en una transacción) → recién entonces
  // se sube la captura a `tickets/<ticket.id>/captura.<ext>` y se enlaza con
  // `adjuntar_captura_ticket`. Así un cliente bloqueado por el rate-limit no
  // puede subir archivos al bucket, y un fallo de la subida nunca deja un
  // ticket sin hoja de vida.
  if (body.action === 'crear') {
    const titulo = String(body.titulo || '').trim();
    const descripcion = String(body.descripcion || '').trim();
    const categoriaId = String(body.categoriaId || '');
    const subcategoriaId = body.subcategoriaId ? String(body.subcategoriaId) : null;
    if (!titulo || !descripcion || !categoriaId) {
      return json({ ok: false, code: 'datos_requeridos' });
    }
    if (titulo.length > TITULO_MAX_LEN || descripcion.length > DESCRIPCION_MAX_LEN) {
      return json({ ok: false, code: 'texto_muy_largo' });
    }

    const staff = await staffDeLaPeticion();
    const contacto = body.contacto ? String(body.contacto).trim() : null;

    // Adjunto opcional (captura de pantalla), ya comprimido en el cliente. El
    // cliente no es de confianza: tamaño acotado, tipo real por magic bytes y
    // metadatos (EXIF/GPS…) eliminados aquí. Si algo falla, el ticket se crea
    // igual sin adjunto.
    let adjuntoBytes: Uint8Array<ArrayBuffer> | null = null;
    let adjuntoExt: string | null = null;
    const adjunto = body.adjunto as { nombre?: string; tipo?: string; contenidoBase64?: string } | undefined;
    if (adjunto?.contenidoBase64) {
      try {
        const binario = atob(adjunto.contenidoBase64);
        if (binario.length > 0 && binario.length <= ADJUNTO_MAX_BYTES) {
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
          const ext = sniffImagen(bytes);
          const limpio = ext ? stripExif(bytes, MIME_POR_EXT[ext]) : null;
          if (ext && limpio) {
            adjuntoBytes = limpio;
            adjuntoExt = ext;
          }
        }
      } catch {
        // El adjunto es opcional: si no se puede leer, el ticket se crea igual
      }
    }

    // Solo con sesión de staff viajan origen, tipo, prioridad (116), vínculos a
    // activos y el empleado elegido a mano; sin sesión la RPC además los ignora
    // (la prioridad de un ticket público es siempre la sugerida por su
    // subcategoría, o media).
    const datosStaff = staff
      ? {
          staff_id: staff.id,
          origen: body.origen === 'staff_interno' ? 'staff_interno' : 'empleado',
          tipo: body.tipo === 'incidente' || body.tipo === 'solicitud' ? body.tipo : null,
          prioridad: PRIORIDADES.includes(String(body.prioridad)) ? String(body.prioridad) : null,
          empleado_id_manual: body.empleadoIdManual ? String(body.empleadoIdManual) : null,
          equipo_id: body.equipoId ? String(body.equipoId) : null,
          cuenta_id: body.cuentaId ? String(body.cuentaId) : null,
          licencia_id: body.licenciaId ? String(body.licenciaId) : null,
        }
      : {};
    const { data: creado, error: eCrear } = await admin.database.rpc('crear_ticket_publico', {
      p_datos: {
        titulo,
        descripcion,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        contacto,
        token: randomToken(),
        ip,
        ...datosStaff,
      },
    });
    if (eCrear) {
      // Solo el mensaje al log: el payload puede traer DNI y contacto.
      console.error('[tickets] crear_ticket_publico falló:', eCrear.message);
      return json({ ok: false, code: 'error_creando' }, 500);
    }
    const resultado = (Array.isArray(creado) ? creado[0] : creado) as {
      ok?: boolean; code?: string; id?: string; codigo?: string; token?: string; vinculado?: boolean;
    } | null;
    if (!resultado?.ok) {
      if (resultado?.code === 'demasiados_intentos') return json({ ok: false, code: 'demasiados_intentos' }, 429);
      if (resultado?.code) return json({ ok: false, code: resultado.code });
      return json({ ok: false, code: 'error_creando' }, 500);
    }
    if (!resultado.id || !resultado.codigo || !resultado.token) {
      return json({ ok: false, code: 'error_creando' }, 500);
    }

    if (adjuntoBytes && adjuntoExt) {
      // Nombre fijo y seguro: la carpeta es el id del ticket (no el token de
      // seguimiento) y la extensión la marca el formato real.
      const key = `tickets/${resultado.id}/captura.${adjuntoExt}`;
      try {
        const blob = new Blob([adjuntoBytes], { type: MIME_POR_EXT[adjuntoExt] });
        const { data: subida, error: eSubida } = await admin.storage.from(ADJUNTOS_BUCKET).upload(key, blob);
        if (!eSubida && subida) {
          const { data: enlazada, error: eEnlace } = await admin.database.rpc('adjuntar_captura_ticket', {
            p_ticket_id: resultado.id,
            p_key: key,
          });
          if (eEnlace || enlazada !== true) {
            // Sin fila enlazada no debe quedar un objeto huérfano en el bucket.
            await admin.storage.from(ADJUNTOS_BUCKET).remove(key).catch(() => null);
          }
        }
      } catch {
        // El adjunto es opcional: si falla la subida, el ticket ya está creado
      }
    }

    return json({ ok: true, codigo: resultado.codigo, token: resultado.token, vinculado: resultado.vinculado !== false });
  }

  // ── seguimiento: público, dado el token del ticket ──────────────────
  if (body.action === 'seguimiento') {
    const token = String(body.token || '');
    if (!token) return json({ ok: false, code: 'token_requerido' });

    if (await excedeLimite(admin, 'tickets.seguimiento', ip, SEGUIMIENTO_MAX_IP, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { data: ticket } = await admin.database
      .from('tickets')
      .select('id, codigo, titulo, descripcion, estado, adjunto_key, created_at, updated_at, categorias_ticket(nombre), subcategorias_ticket(nombre)')
      .eq('token', token)
      .maybeSingle();
    if (!ticket) return json({ ok: false, code: 'no_existe' });

    const { data: comentarios } = await admin.database
      .from('ticket_comentarios')
      .select('mensaje, created_at')
      .eq('ticket_id', ticket.id)
      .eq('interno', false)
      .order('created_at', { ascending: true });

    // La captura es del propio solicitante: se entrega una URL firmada de corta
    // vida, nunca la key (el bucket es privado, migración 111). Si no se puede
    // firmar, la respuesta sale igual sin adjunto.
    const adjuntoUrl = ticket.adjunto_key ? await urlFirmadaAdjunto(admin, ticket.adjunto_key) : null;

    return json({
      ok: true,
      codigo: ticket.codigo,
      titulo: ticket.titulo,
      descripcion: ticket.descripcion,
      estado: ticket.estado,
      adjuntoUrl,
      adjuntoExpiraSegundos: adjuntoUrl ? ADJUNTO_URL_SEGUNDOS : null,
      categoria: uno(ticket.categorias_ticket)?.nombre || '',
      subcategoria: uno(ticket.subcategorias_ticket)?.nombre || '',
      creado: ticket.created_at,
      actualizado: ticket.updated_at,
      // No se exponen nombres de staff: cara pública única, "Soporte TI"
      comentarios: (comentarios || []).map((c) => ({ mensaje: c.mensaje, fecha: c.created_at, autor: 'Soporte TI' })),
    });
  }

  // ── adjuntoStaff: staff con el módulo `tickets` abre la captura de un ticket ──
  // El bucket es privado: la autorización se comprueba al emitir la URL firmada
  // (sesión de staff ACTIVO + `puede(modulo:tickets)` por RPC, fail-closed: un
  // error de la RPC se lanza → 500, solo un `false` explícito niega con 403).
  // La key no sale de la function.
  if (body.action === 'adjuntoStaff') {
    const staff = await staffDeLaPeticion();
    if (!staff) return json({ ok: false, code: 'no_autenticado' }, 401);

    const ticketId = String(body.ticketId || '');
    if (!UUID_RE.test(ticketId)) return json({ ok: false, code: 'no_existe' });

    if (!(await puede(admin, staff.id, 'modulo:tickets'))) return json({ ok: false, code: 'no_autorizado' }, 403);

    if (await excedeLimite(admin, 'tickets.adjuntoStaff', staff.id, ADJUNTO_STAFF_MAX_USUARIO, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { data: ticket, error: eTicket } = await admin.database
      .from('tickets').select('adjunto_key').eq('id', ticketId).maybeSingle();
    if (eTicket) throw new Error(`No se pudo leer el ticket: ${eTicket.message}`);
    if (!ticket?.adjunto_key) return json({ ok: false, code: 'no_existe' });

    const { data: firmada, error: eUrl } = await admin.storage
      .from(ADJUNTOS_BUCKET)
      .createSignedUrl(ticket.adjunto_key, ADJUNTO_URL_SEGUNDOS);
    if (eUrl || !firmada?.signedUrl) {
      // Objeto ausente en el bucket (404) ≠ falla al firmar.
      const faltante = (eUrl as { statusCode?: number } | null)?.statusCode === 404;
      return json({ ok: false, code: faltante ? 'no_existe' : 'error_url' }, faltante ? 200 : 500);
    }
    return json({ ok: true, url: firmada.signedUrl, expiraSegundos: ADJUNTO_URL_SEGUNDOS });
  }

  // ── buscarPorDni: público, para quien perdió el enlace de seguimiento ──
  // Devuelve tickets ACTIVOS más los CERRADOS con encuesta de satisfacción
  // pendiente (para que el empleado la complete aunque el envío automático
  // haya fallado); nunca el resto del historial cerrado. Nunca revela si
  // el DNI corresponde o no a un empleado real. Limitado por IP para
  // frenar enumeración de DNIs (8 dígitos es poco espacio).
  if (body.action === 'buscarPorDni') {
    const dni = soloDigitos(String(body.dni || ''));
    if (dni.length !== 8) return json({ ok: false, code: 'dni_invalido' });

    // IP del cliente (ver ipDesdeHeaders, calculada arriba). Se refuerza
    // además con el límite por DNI, que no depende de la IP.
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Fail-closed en los dos límites y en el registro del intento (Ciclo 20):
    // un error de BD bloquea (error_interno) en vez de contarse como "0".

    // Límite por IP: frena barridos desde una sola fuente.
    const { data: porIp, error: ePorIp } = await admin.database
      .from('ticket_busqueda_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if (ePorIp) throw new Error(`No se pudo contar ticket_busqueda_intentos por IP: ${ePorIp.message}`);
    if ((porIp?.length || 0) >= 15) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    // Límite por DNI: frena la extracción de tickets de una persona concreta
    // aunque el atacante rote IPs (cierra la evasión del rate-limit, H-02).
    const { data: porDni, error: ePorDni } = await admin.database
      .from('ticket_busqueda_intentos')
      .select('id')
      .eq('dni', dni)
      .gte('created_at', desde);
    if (ePorDni) throw new Error(`No se pudo contar ticket_busqueda_intentos por DNI: ${ePorDni.message}`);
    if ((porDni?.length || 0) >= 10) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { error: eRegistro } = await admin.database.from('ticket_busqueda_intentos').insert([{ ip, dni }]);
    if (eRegistro) throw new Error(`No se pudo registrar el intento de búsqueda: ${eRegistro.message}`);

    const { data: empleado } = await admin.database
      .from('empleados').select('id').eq('dni', dni).is('deleted_at', null).maybeSingle();
    if (!empleado) return json({ ok: true, tickets: [] });

    const { data: activos } = await admin.database
      .from('tickets')
      .select('codigo, titulo, estado, created_at, token')
      .eq('empleado_id', empleado.id)
      .in('estado', ['abierto', 'en_progreso', 'reabierto'])
      .order('created_at', { ascending: false });

    const { data: cerrados } = await admin.database
      .from('tickets')
      .select('id, codigo, titulo, estado, created_at, token')
      .eq('empleado_id', empleado.id)
      .eq('estado', 'cerrado')
      .order('created_at', { ascending: false });

    let pendientesEncuesta: typeof cerrados = [];
    if (cerrados?.length) {
      const idsCerrados = cerrados.map((t) => t.id);
      const { data: encuestas } = await admin.database
        .from('ticket_satisfaccion')
        .select('ticket_id')
        .in('ticket_id', idsCerrados)
        .is('fecha_envio', null);
      const idsPendientes = new Set((encuestas || []).map((e) => e.ticket_id));
      pendientesEncuesta = cerrados.filter((t) => idsPendientes.has(t.id));
    }

    const tickets = [
      ...(activos || []).map((t) => ({
        codigo: t.codigo, titulo: t.titulo, estado: t.estado, creado: t.created_at, token: t.token,
        encuestaPendiente: false,
      })),
      ...pendientesEncuesta.map((t) => ({
        codigo: t.codigo, titulo: t.titulo, estado: t.estado, creado: t.created_at, token: t.token,
        encuestaPendiente: true,
      })),
    ];

    return json({ ok: true, tickets });
  }

  // ── encuesta: público, respuesta a la encuesta de satisfacción ──────
  // ── encuestaEstado: público, para saber si ya se respondió ANTES de
  // mostrar el formulario (evita el formulario "fantasma" tras refrescar
  // la página una vez ya enviada la respuesta) ────────────────────────
  if (body.action === 'encuestaEstado') {
    const token = String(body.token || '');
    if (!token) return json({ ok: false, code: 'token_requerido' });

    if (await excedeLimite(admin, 'tickets.encuestaEstado', ip, ENCUESTA_MAX_IP, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

    const { data: ticket } = await admin.database
      .from('tickets').select('id').eq('token', token).maybeSingle();
    if (!ticket) return json({ ok: false, code: 'no_existe' });

    const { data: encuesta } = await admin.database
      .from('ticket_satisfaccion').select('fecha_envio').eq('ticket_id', ticket.id).maybeSingle();
    if (!encuesta) return json({ ok: false, code: 'no_disponible' });

    return json({ ok: true, respondida: !!encuesta.fecha_envio });
  }

  if (body.action === 'encuesta') {
    const token = String(body.token || '');
    const nivel = Number(body.nivel);
    if (!token || !nivel || nivel < 1 || nivel > 5) return json({ ok: false, code: 'datos_invalidos' });

    if (await excedeLimite(admin, 'tickets.encuesta', ip, ENCUESTA_MAX_IP, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }

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

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}

function trimOVacio(valor: unknown): string | null {
  const s = String(valor ?? '').trim();
  return s || null;
}
