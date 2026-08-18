// ============================================================
// Edge function: personal-registro
// Formulario público (sin sesión) de pre-registro de personal: alguien
// que todavía no es empleado deja DNI/nombres/apellidos/celular/correo
// personal para que TI lo use después. Mismo patrón que "tickets": el
// navegador nunca escribe directo en `personal_registros` (sin policy de
// INSERT), todo pasa por acá con el cliente admin.
//
// Acciones (POST { action, ... }):
//   buscarDni público { dni }                                      → { encontrado, nombres?, apellidos?, celular?, correoPersonal? }
//   crear     público { dni, nombres, apellidos, celular?, correoPersonal? } → { ok, yaPendiente }
//   version   staff   {}                                           → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
// ============================================================

import { createClient, createAdminClient } from 'npm:@insforge/sdk@1.5.2';

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
    // no-store: buscarDni devuelve datos personales de un empleado real.
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

// Mismos topes que tickets.ts: generosos para un dato real, muy por
// debajo de lo que un abuso automatizado necesitaría.
const NOMBRE_MAX_LEN = 100;
const CELULAR_MAX_LEN = 20;
const CORREO_MAX_LEN = 200;

// Rate-limit por IP (auditoría integral, mismo criterio que S-01/H-02):
// endpoint público y sin sesión, cuenta buscarDni + crear juntos para que
// alternar acciones no lo evada.
const INTENTOS_MAX_IP = 12;
// Límite por DNI (migración 065): sin esto, rotar de IP permite extraer
// nombres/celular/correo personal de un DNI fijo sin freno — mismo criterio
// que ticket_busqueda_intentos en functions/tickets.ts (H-02).
const INTENTOS_MAX_DNI = 10;
const INTENTOS_VENTANA_MIN = 10;

// IP de confianza del cliente — ver functions/tickets.ts para el detalle
// de por qué cf-connecting-ip/x-real-ip son de fiar y x-forwarded-for no
// (se toma su ÚLTIMO valor).
function ipDesdeHeaders(headers: Headers): string {
  const xff = (headers.get('x-forwarded-for') || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    xff[xff.length - 1] ||
    'desconocida'
  );
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

  // Rate-limit compartido por buscarDni y crear: mismo patrón que
  // ticket_creacion_intentos (migración 037), tabla propia (042). Además
  // del tope por IP, exige un tope por DNI (migración 065) que no depende
  // de la IP — cierra la evasión por rotación de IP contra un DNI fijo.
  async function bajoLimite(dni: string): Promise<boolean> {
    const ip = ipDesdeHeaders(req.headers);
    const desde = new Date(Date.now() - INTENTOS_VENTANA_MIN * 60 * 1000).toISOString();

    const { data: porIp } = await admin.database
      .from('personal_registro_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if ((porIp?.length || 0) >= INTENTOS_MAX_IP) return false;

    const { data: porDni } = await admin.database
      .from('personal_registro_intentos')
      .select('id')
      .eq('dni', dni)
      .gte('created_at', desde);
    if ((porDni?.length || 0) >= INTENTOS_MAX_DNI) return false;

    await admin.database.from('personal_registro_intentos').insert([{ ip, dni }]);
    return true;
  }

  // version: staff únicamente (cierra el pendiente de H-12 — ver el mismo
  // comentario en functions/credenciales.ts). No es una acción pública.
  if (body.action === 'version') {
    const authHeader = req.headers.get('Authorization');
    const userToken = authHeader ? authHeader.replace('Bearer ', '') : null;
    if (!userToken) return json({ ok: false, code: 'no_autenticado' }, 401);
    const userClient = createClient({ baseUrl, accessToken: userToken });
    const { data: userData } = await userClient.auth.getCurrentUser();
    if (!userData?.user?.id) return json({ ok: false, code: 'no_autenticado' }, 401);
    const { data: staffRow } = await admin.database
      .from('staff').select('activo').eq('user_id', userData.user.id).maybeSingle();
    if (!staffRow?.activo) return json({ ok: false, code: 'no_es_staff' }, 403);

    const [{ data: migracion }, { data: deploy }] = await Promise.all([
      admin.database.from('schema_migrations').select('version, nombre_archivo, aplicada_en')
        .order('version', { ascending: false }).limit(1).maybeSingle(),
      admin.database.from('function_deploys').select('sha256, commit_sha, desplegado_en')
        .eq('funcion', 'personal-registro').order('desplegado_en', { ascending: false }).limit(1).maybeSingle(),
    ]);
    return json({
      ok: true,
      funcion: 'personal-registro',
      sdkVersion: '1.5.2',
      ultimaMigracion: migracion || null,
      ultimoDeploy: deploy || null,
    });
  }

  // ── buscarDni: autocompletar si esa persona ya trabajó aquí ─────────
  // Nunca revela más que nombres/apellidos/contacto de un match exacto de
  // DNI (mismo criterio de discreción que buscarPorDni en tickets.ts).
  if (body.action === 'buscarDni') {
    const dni = soloDigitos(String(body.dni || ''));
    if (dni.length !== 8) return json({ ok: false, code: 'dni_invalido' });
    if (!(await bajoLimite(dni))) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    const { data: empleado } = await admin.database
      .from('empleados')
      .select('nombres, apellidos, telefono, whatsapp, correo_personal')
      .eq('dni', dni)
      .maybeSingle();

    if (!empleado) return json({ ok: true, encontrado: false });

    return json({
      ok: true,
      encontrado: true,
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      celular: empleado.whatsapp || empleado.telefono || '',
      correoPersonal: empleado.correo_personal || '',
    });
  }

  // ── crear: guarda el pre-registro (nunca crea un empleado real) ────
  if (body.action === 'crear') {
    const dni = soloDigitos(String(body.dni || ''));
    const nombres = String(body.nombres || '').trim();
    const apellidos = String(body.apellidos || '').trim();
    const celular = String(body.celular || '').trim();
    const correoPersonal = String(body.correoPersonal || '').trim();

    if (dni.length !== 8) return json({ ok: false, code: 'dni_invalido' });
    if (!nombres || !apellidos) return json({ ok: false, code: 'datos_requeridos' });
    if (
      nombres.length > NOMBRE_MAX_LEN || apellidos.length > NOMBRE_MAX_LEN ||
      celular.length > CELULAR_MAX_LEN || correoPersonal.length > CORREO_MAX_LEN
    ) {
      return json({ ok: false, code: 'texto_muy_largo' });
    }

    if (!(await bajoLimite(dni))) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    // Ya hay un pre-registro pendiente (sin usar) con este DNI: no se
    // duplica — se responde éxito igual para no confundir a la persona.
    const { data: pendiente } = await admin.database
      .from('personal_registros')
      .select('id')
      .eq('dni', dni)
      .eq('usado', false)
      .maybeSingle();
    if (pendiente) return json({ ok: true, yaPendiente: true });

    const { error: eInsert } = await admin.database
      .from('personal_registros')
      .insert([{
        dni,
        nombres,
        apellidos,
        celular: celular || null,
        correo_personal: correoPersonal || null,
      }]);
    if (eInsert) return json({ ok: false, code: 'error_guardando' }, 500);

    return json({ ok: true, yaPendiente: false });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
