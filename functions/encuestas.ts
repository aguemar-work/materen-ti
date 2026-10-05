// ============================================================
// Edge function: encuestas
// Formulario público (sin sesión) de encuestas anónimas: una ronda
// abierta se responde tantas veces como personas la abran (a diferencia
// de "entregas", no es de un solo uso). El navegador nunca escribe
// directo en `encuesta_respuestas` (sin policy de INSERT) ni lee
// `encuestas`/`encuesta_rondas` sin sesión (RLS solo staff) — todo pasa
// por acá con el cliente admin. El resto (crear plantillas, abrir/cerrar
// rondas, ver resultados) lo hace el staff vía RLS normal, sin pasar por
// esta función.
//
// Acciones (POST { action, ... }):
//   abrir     público { slug }               → { titulo, descripcion, preguntas }
//   responder público { slug, respuestas }    → { ok }
//   version   staff   {}                     → { funcion, sdkVersion, ultimaMigracion, ultimoDeploy }
//   ping      público {}                     → { ok, funcion, hora } (healthcheck: sin sesión ni BD)
// ============================================================

import { createAdminClient } from 'npm:@insforge/sdk@1.5.2';

// Helpers compartidos (functions/_shared/): scripts/build-functions.mjs pega
// cada bloque aquí para generar functions/dist/encuestas.ts, que es lo que se
// despliega (el runtime exige UN archivo por function). No editar el dist.
// @inline ./_shared/http.ts
// @inline ./_shared/errores.ts
// @inline ./_shared/auth.ts
// @inline ./_shared/version.ts

// Rate-limit por IP: cuenta "abrir" y "responder" juntos para que alternar
// acciones no lo evada.
const INTENTOS_MAX_IP = 20;
const INTENTOS_VENTANA_MIN = 10;

// Mismo criterio que frontend/src/core/dominio-encuestas.js#respuestaValida
// — duplicado a propósito: esta es la copia AUTORITATIVA (el cliente no es
// de confianza), la del frontend es solo para feedback antes de enviar.
type Pregunta = {
  id: string;
  tipo: 'texto_corto' | 'texto_largo' | 'opcion_unica' | 'escala_1_5' | 'si_no';
  etiqueta: string;
  requerido: boolean;
  opciones?: string[];
};

const MAX_LEN: Record<string, number> = { texto_corto: 200, texto_largo: 2000 };

function respuestaValida(pregunta: Pregunta, valor: unknown): boolean {
  const vacio = valor === undefined || valor === null || valor === '';
  if (pregunta.requerido && vacio) return false;
  if (vacio) return true;
  switch (pregunta.tipo) {
    case 'texto_corto':
    case 'texto_largo':
      return typeof valor === 'string' && valor.length <= MAX_LEN[pregunta.tipo];
    case 'opcion_unica':
      return Array.isArray(pregunta.opciones) && pregunta.opciones.includes(valor as string);
    case 'escala_1_5':
      return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 5;
    case 'si_no':
      return typeof valor === 'boolean';
    default:
      return false;
  }
}

// Envoltorio de primer nivel (Ciclo 20): toda excepción no controlada — o la
// falla fail-closed del rate-limit — termina en
// { ok:false, code:'error_interno' } (500) con las cabeceras CORS de esta
// petición, en vez de un 500 opaco sin CORS. Al log solo va el mensaje.
export default (req: Request): Promise<Response> => conEnvoltorio('encuestas', req, manejar);

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
    return json({ ok: true, funcion: 'encuestas', hora: new Date().toISOString() });
  }

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL')!;
  const admin = createAdminClient({ baseUrl, apiKey: Deno.env.get('API_KEY')! });

  // version: staff únicamente (cierra el pendiente de H-12 — ver el mismo
  // comentario en functions/credenciales.ts). No es una acción pública.
  if (body.action === 'version') {
    const auth = await autenticarStaff(req, admin, baseUrl);
    if (!auth.ok) return json({ ok: false, code: auth.code }, auth.status);
    return json(await datosVersion(admin, 'encuestas'));
  }

  // Fail-closed (Ciclo 20): si no se puede contar ni registrar el intento se
  // LANZA (→ error_interno). Antes un error de BD daba data=null → "0
  // intentos" y el tope quedaba desactivado justo cuando la BD fallaba.
  async function bajoLimite(): Promise<boolean> {
    const ip = ipDesdeHeaders(req.headers);
    const desde = new Date(Date.now() - INTENTOS_VENTANA_MIN * 60 * 1000).toISOString();
    const { data: intentos, error: eIntentos } = await admin.database
      .from('encuesta_respuesta_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if (eIntentos) throw new Error(`No se pudo contar encuesta_respuesta_intentos: ${eIntentos.message}`);
    if ((intentos?.length || 0) >= INTENTOS_MAX_IP) return false;
    const { error: eRegistro } = await admin.database.from('encuesta_respuesta_intentos').insert([{ ip }]);
    if (eRegistro) throw new Error(`No se pudo registrar el intento: ${eRegistro.message}`);
    return true;
  }

  // Busca la ronda abierta por slug + su plantilla. Devuelve null si no
  // existe o ya está cerrada (nunca distingue el motivo al público).
  async function rondaAbiertaConPlantilla(slug: string) {
    const { data: ronda } = await admin.database
      .from('encuesta_rondas')
      .select('id, cerrada, encuestas(id, titulo, descripcion, preguntas)')
      .eq('slug', slug)
      .maybeSingle();
    const encuesta = ronda ? uno(ronda.encuestas) : null;
    if (!ronda || ronda.cerrada || !encuesta) return null;
    return { rondaId: ronda.id, encuesta };
  }

  if (body.action === 'abrir') {
    const slug = String(body.slug || '');
    if (!slug) return json({ ok: false, code: 'slug_requerido' });
    if (!(await bajoLimite())) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    const encontrada = await rondaAbiertaConPlantilla(slug);
    if (!encontrada) return json({ ok: false, code: 'no_disponible' });

    return json({
      ok: true,
      titulo: encontrada.encuesta.titulo,
      descripcion: encontrada.encuesta.descripcion || '',
      preguntas: encontrada.encuesta.preguntas || [],
    });
  }

  if (body.action === 'responder') {
    const slug = String(body.slug || '');
    const respuestasEnviadas = body.respuestas;
    if (!slug || typeof respuestasEnviadas !== 'object' || respuestasEnviadas === null) {
      return json({ ok: false, code: 'datos_requeridos' });
    }
    if (!(await bajoLimite())) return json({ ok: false, code: 'demasiados_intentos' }, 429);

    const encontrada = await rondaAbiertaConPlantilla(slug);
    if (!encontrada) return json({ ok: false, code: 'no_disponible' });

    const preguntas: Pregunta[] = encontrada.encuesta.preguntas || [];
    const entrada = respuestasEnviadas as Record<string, unknown>;
    const respuestasValidadas: Record<string, unknown> = {};

    for (const pregunta of preguntas) {
      const valor = entrada[pregunta.id];
      if (!respuestaValida(pregunta, valor)) {
        return json({ ok: false, code: 'respuesta_invalida' });
      }
      // Solo se guarda lo que corresponde a una pregunta real de la
      // plantilla — cualquier otra clave que mande el cliente se ignora.
      if (!(valor === undefined || valor === null || valor === '')) {
        respuestasValidadas[pregunta.id] = valor;
      }
    }

    const { error: eInsert } = await admin.database
      .from('encuesta_respuestas')
      .insert([{ ronda_id: encontrada.rondaId, respuestas: respuestasValidadas }]);
    if (eInsert) return json({ ok: false, code: 'error_guardando' }, 500);

    return json({ ok: true });
  }

  return json({ ok: false, code: 'accion_desconocida' }, 400);
}
