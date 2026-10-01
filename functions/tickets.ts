// ============================================================
// Edge function: tickets
// Único punto por donde se CREA un ticket, se consulta su
// seguimiento público y se registra la respuesta de la encuesta de
// satisfacción — mismo patrón que "entregas" en credenciales.ts: el
// cliente nunca escribe directo en `tickets` (sin política de
// INSERT), todo pasa por aquí con cliente admin.
//
// Acciones (POST { action, ... }):
//   catalogo       público          → { categorias[], subcategorias[] }
//   crear          público o staff  → { codigo, token, vinculado }
//   seguimiento    público          → { codigo, titulo, estado, comentarios[] }
//   buscarPorDni   público          → { tickets[] } (solo tickets ACTIVOS; limitado por IP)
//   encuestaEstado público          → { respondida } (para no mostrar el formulario tras refrescar)
//   encuesta       público          → { ok }
//   version        staff            → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping           público          → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
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

import { createClient, createAdminClient } from 'npm:@insforge/sdk@1.5.2';

const ORIGENES_PERMITIDOS = new Set([
  'https://materen-ti.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
]);

// Cabeceras CORS calculadas POR PETICIÓN (Ciclo 20): antes vivían en un
// `let CORS` global de módulo, reasignado al entrar cada petición — con
// peticiones concurrentes en el mismo isolate, una podía pisar el valor de
// otra entre dos `await`. Mismo cambio en las 4 edge functions (helpers
// duplicados a propósito, cada function se despliega como un único archivo).
function corsPara(origin: string | null): Record<string, string> {
  if (!origin || !ORIGENES_PERMITIDOS.has(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

// Sin una clave `error` (string) en el body, el SDK del cliente descarta el
// body completo en toda respuesta no-2xx y arma un InsForgeError genérico
// ("Request failed: <statusText>") — `code` nunca llega al frontend
// (`"error" in data` es el único gate que usa @insforge/sdk para conservar
// las claves del body). Se espeja `code` en `error` solo para status >= 400.
function respuesta(cors: Record<string, string>, body: unknown, status = 200): Response {
  const payload =
    status >= 400 && body && typeof body === 'object' && 'code' in body && !('error' in body)
      ? { ...body, error: (body as { code: string }).code }
      : body;
  return new Response(JSON.stringify(payload), {
    status,
    // no-store: buscarPorDni devuelve tokens de ticket y datos de contacto,
    // no debe quedar cacheado en el navegador/proxy.
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

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

// Solo aplica a creación SIN sesión de staff (ver uso más abajo): un staff
// autenticado ya pasó por su propio login y no necesita este freno.
const CREACION_MAX_IP = 8;         // creaciones públicas permitidas por ventana
const CREACION_VENTANA_MIN = 10;   // minutos

// Rate-limits de las acciones públicas de solo lectura/respuesta (Ciclo 21),
// por IP y sobre `intentos_publicos` (migración 104). Mismos 10 min de ventana.
const LIMITE_VENTANA_MIN = 10;
const SEGUIMIENTO_MAX_IP = 60;
const CATALOGO_MAX_IP = 60;
const ENCUESTA_MAX_IP = 30; // encuestaEstado y encuesta, cada una por separado

type ClienteAdmin = ReturnType<typeof createAdminClient>;

// Rate-limit genérico sobre `intentos_publicos` (Ciclo 21): cuenta los
// intentos recientes del par (ámbito, clave) y, si todavía hay cupo, registra
// este. Devuelve true cuando YA se alcanzó el tope (el llamador responde 429
// `demasiados_intentos`; un intento bloqueado no se registra). FAIL-CLOSED: si
// no se puede contar o registrar se LANZA (→ error_interno), nunca se asume
// "0 intentos". Copia a propósito en cada function (sin imports entre ellas).
async function excedeLimite(
  admin: ClienteAdmin,
  ambito: string,
  clave: string,
  max: number,
  ventanaMin: number,
): Promise<boolean> {
  const desde = new Date(Date.now() - ventanaMin * 60 * 1000).toISOString();
  const { data, error } = await admin.database
    .from('intentos_publicos')
    .select('id')
    .eq('ambito', ambito)
    .eq('clave', clave)
    .gte('created_at', desde)
    .limit(max);
  if (error) throw new Error(`No se pudo contar intentos_publicos (${ambito}): ${error.message}`);
  if ((data?.length || 0) >= max) return true;
  const { error: eRegistro } = await admin.database.from('intentos_publicos').insert([{ ambito, clave }]);
  if (eRegistro) throw new Error(`No se pudo registrar el intento en intentos_publicos (${ambito}): ${eRegistro.message}`);
  return false;
}

// Usuario dueño del token de sesión (Ciclo 21). Distingue "no hay usuario"
// (token inválido/expirado/anónimo → null) de "falló la consulta" (caída de
// red, 5xx, 408/429 → LANZA → error_interno 500). Antes se ignoraba el
// `error`. Copia a propósito en cada function.
async function usuarioDeToken(
  userClient: ReturnType<typeof createClient>,
): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await userClient.auth.getCurrentUser();
  if (error) {
    const sc = (error as { statusCode?: number }).statusCode;
    if (typeof sc === 'number' && sc >= 400 && sc < 500 && sc !== 408 && sc !== 429) return null;
    throw new Error(`No se pudo verificar la sesión: ${error.message}`);
  }
  const user = data?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email || null };
}

// Devuelve la extensión canónica si los primeros bytes son de una imagen
// soportada; null si no lo es (no se sube).
// export: probado en frontend/tests/tickets-validaciones.test.js
export function sniffImagen(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

const MIME_POR_EXT: Record<string, string> = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
};

export function esEmail(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// IP de confianza del cliente. cf-connecting-ip / x-real-ip los pone el
// edge (un solo valor, no falsificables). x-forwarded-for es el último
// recurso y se toma su ÚLTIMO valor: los proxies AGREGAN la IP real al
// final; el primero lo controla el cliente (auditoría H-02).
// El SDK (postgrest-js sin Database schema generado) tipa toda relación
// embebida en un select() como arreglo, aunque en runtime sea un solo
// objeto cuando el embed es por FK 1:1 desde la fila consultada (ej.
// tickets.categoria_id → categorias_ticket.id). Sin esto, TS marca
// `.nombre` como inexistente en un arreglo — el dato real siempre fue
// un objeto.
function uno<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

export function ipDesdeHeaders(headers: Headers): string {
  const xff = (headers.get('x-forwarded-for') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    xff[xff.length - 1] ||
    'desconocida'
  );
}

// Envoltorio de primer nivel (Ciclo 20): toda excepción no controlada — o
// una falla fail-closed de un rate-limit que no se pudo contar/registrar —
// termina en { ok:false, code:'error_interno' } (500) con las cabeceras CORS
// de esta petición, en vez de un 500 opaco sin CORS de la plataforma. Al log
// solo va el mensaje, nunca el body (puede traer DNI/contacto).
export default async function (req: Request): Promise<Response> {
  const cors = corsPara(req.headers.get('Origin'));
  try {
    return await manejar(req, cors);
  } catch (e) {
    console.error('[tickets] error no controlado:', e instanceof Error ? e.message : String(e));
    return respuesta(cors, { ok: false, code: 'error_interno' }, 500);
  }
}

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

  // Staff autenticado, si vino Authorization (opcional en "crear").
  // Ciclo 21 — FAIL-CLOSED: "sin cabecera / token anónimo o inválido / usuario
  // que no es staff activo" siguen siendo público (null), pero si HAY un
  // usuario autenticado y la consulta de `staff` (o de la sesión) FALLA, se
  // LANZA → error_interno 500. Antes un error de BD degradaba en silencio al
  // staff a público (su ticket salía con origen 'empleado').
  async function staffDeSesion(): Promise<{ id: string; email: string | null } | null> {
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userToken) return null;
    const userClient = createClient({ baseUrl, accessToken: userToken });
    const user = await usuarioDeToken(userClient);
    if (!user) return null;
    const { data: staffRow, error: eStaff } = await admin.database
      .from('staff')
      .select('activo')
      .eq('user_id', user.id)
      .maybeSingle();
    if (eStaff) throw new Error(`No se pudo leer la fila de staff: ${eStaff.message}`);
    if (!staffRow?.activo) return null;
    return { id: user.id, email: user.email };
  }

  const ip = ipDesdeHeaders(req.headers);

  // version: staff únicamente (cierra el pendiente de H-12 — ver el mismo
  // comentario en functions/credenciales.ts). No es una acción pública.
  if (body.action === 'version') {
    const staff = await staffDeSesion();
    if (!staff) return json({ ok: false, code: 'no_autenticado' }, 401);
    const [{ data: migracion }, { data: deploy }] = await Promise.all([
      admin.database.from('schema_migrations').select('version, nombre_archivo, aplicada_en')
        .order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.database.from('function_deploys').select('sha256, commit_sha, desplegado_en')
        .eq('funcion', 'tickets').order('desplegado_en', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json({
      ok: true,
      funcion: 'tickets',
      sdkVersion: '1.5.2',
      ultimaMigracion: migracion || null,
      ultimoDeploy: deploy || null,
    });
  }

  // ── catalogo: público, categorías/subcategorías activas para el formulario ──
  if (body.action === 'catalogo') {
    if (await excedeLimite(admin, 'tickets.catalogo', ip, CATALOGO_MAX_IP, LIMITE_VENTANA_MIN)) {
      return json({ ok: false, code: 'demasiados_intentos' }, 429);
    }
    const [{ data: categorias }, { data: subcategorias }] = await Promise.all([
      admin.database.from('categorias_ticket').select('id, nombre').is('deleted_at', null).order('nombre'),
      admin.database.from('subcategorias_ticket').select('id, categoria_id, nombre, tipo_sugerido').is('deleted_at', null).order('nombre'),
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
    if (titulo.length > TITULO_MAX_LEN || descripcion.length > DESCRIPCION_MAX_LEN) {
      return json({ ok: false, code: 'texto_muy_largo' });
    }

    const staff = await staffDeSesion();
    const origen = staff && body.origen === 'staff_interno' ? 'staff_interno' : 'empleado';

    // Rate-limit por IP, solo para creación pública (sin sesión de staff):
    // mismo patrón que buscarPorDni (migración 017), tabla propia
    // (migración 037) para no mezclar el conteo con la búsqueda por DNI.
    // Fail-closed (Ciclo 20): si no se puede contar ni registrar el intento,
    // se bloquea (error_interno) — antes un error de BD daba data=null →
    // "0 intentos" y el tope quedaba desactivado justo cuando la BD fallaba.
    if (!staff) {
      const desde = new Date(Date.now() - CREACION_VENTANA_MIN * 60 * 1000).toISOString();
      const { data: intentos, error: eIntentos } = await admin.database
        .from('ticket_creacion_intentos')
        .select('id')
        .eq('ip', ip)
        .gte('created_at', desde);
      if (eIntentos) throw new Error(`No se pudo contar ticket_creacion_intentos: ${eIntentos.message}`);
      if ((intentos?.length || 0) >= CREACION_MAX_IP) {
        return json({ ok: false, code: 'demasiados_intentos' }, 429);
      }
      const { error: eRegistro } = await admin.database.from('ticket_creacion_intentos').insert([{ ip }]);
      if (eRegistro) throw new Error(`No se pudo registrar el intento de creación: ${eRegistro.message}`);
    }

    let empleadoId: string | null = null;
    let vinculado = true;
    const contacto = body.contacto ? String(body.contacto).trim() : null;

    if (staff && body.empleadoIdManual) {
      empleadoId = String(body.empleadoIdManual);
    } else if (origen === 'empleado' && contacto) {
      // Identificación SOLO por DNI: un correo puede repetirse entre
      // empleados o una persona tener varios, el DNI no. La UI ya valida
      // 8 dígitos, pero esta rama es la autoridad real (endpoint público).
      const { data: coincidencias } = await admin.database
        .from('empleados').select('id').is('deleted_at', null)
        .eq('dni', soloDigitos(contacto));
      if (coincidencias?.length === 1) {
        empleadoId = coincidencias[0].id;
        vinculado = true;
      } else {
        empleadoId = null;
        vinculado = false; // sin match o ambiguo: no bloquea, queda para revisión
      }
    } else if (origen === 'empleado') {
      // Sin contacto (ni asignación manual de staff): no hay forma de identificar al empleado
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
        // Tamaño acotado en servidor (no se confía en el cliente)
        if (binario.length > 0 && binario.length <= ADJUNTO_MAX_BYTES) {
          const bytes = new Uint8Array(binario.length);
          for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
          // Tipo real por magic bytes, ignorando el `tipo` declarado por el cliente
          const ext = sniffImagen(bytes);
          if (ext) {
            const blob = new Blob([bytes], { type: MIME_POR_EXT[ext] });
            // Nombre de archivo fijo y seguro: el token es la carpeta, la
            // extensión la marca el formato real. Nada del cliente entra en la key.
            const key = `${token}/captura.${ext}`;
            const { data: subida, error: eSubida } = await admin.storage.from('tickets-adjuntos').upload(key, blob);
            if (!eSubida && subida) {
              adjuntoUrl = subida.url;
              adjuntoKey = subida.key;
            }
          }
        }
      } catch {
        // El adjunto es opcional: si falla la subida, el ticket se crea igual
      }
    }

    // Clasificación incidente/solicitud: se hereda del default de la
    // subcategoría (nunca del cliente, mismo criterio que categoria_id/
    // subcategoria_id). Si no hay subcategoría, o la elegida es una de las
    // ambiguas a propósito (tipo_sugerido NULL — "Otro", "Accesorio dañado
    // o faltante", "Seguridad...backup"), el ticket entra sin clasificar:
    // check_iniciar_completo() ya exige tipo antes de pasar a en_progreso.
    let tipoTicket: string | null = null;
    if (subcategoriaId) {
      const { data: subcategoria } = await admin.database
        .from('subcategorias_ticket')
        .select('tipo_sugerido')
        .eq('id', subcategoriaId)
        .maybeSingle();
      tipoTicket = subcategoria?.tipo_sugerido || null;
    }
    // El staff que crea un ticket interno puede corregir la clasificación
    // sugerida por la subcategoría (TicketInternoForm.vue). El formulario
    // público nunca manda `tipo` — si lo mandara, se ignora igual porque
    // `staff` es null sin sesión.
    if (staff && (body.tipo === 'incidente' || body.tipo === 'solicitud')) {
      tipoTicket = body.tipo;
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
        tipo: tipoTicket,
        // Ciclo 21: el vínculo a equipo/cuenta/licencia lo puede fijar solo el
        // staff. En el formulario público (sin sesión) se IGNORAN: eran ids
        // sin validar que un tercero podía apuntar a activos ajenos.
        equipo_id: staff ? (body.equipoId || null) : null,
        cuenta_id: staff ? (body.cuentaId || null) : null,
        licencia_id: staff ? (body.licenciaId || null) : null,
        adjunto_url: adjuntoUrl,
        adjunto_key: adjuntoKey,
      }])
      .select('id')
      .single();
    if (eInsert || !ticket) return json({ ok: false, code: 'error_creando' }, 500);

    await log(ticket.id, 'creado', `Origen: ${origen}${vinculado ? '' : ' (sin vincular)'}`, staff?.id || null, staff?.email || null);

    return json({ ok: true, codigo, token, vinculado });
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
      categoria: uno(ticket.categorias_ticket)?.nombre || '',
      subcategoria: uno(ticket.subcategorias_ticket)?.nombre || '',
      creado: ticket.created_at,
      actualizado: ticket.updated_at,
      // No se exponen nombres de staff: cara pública única, "Soporte TI"
      comentarios: (comentarios || []).map((c) => ({ mensaje: c.mensaje, fecha: c.created_at, autor: 'Soporte TI' })),
    });
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
