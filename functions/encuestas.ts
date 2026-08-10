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
// ============================================================

import { createAdminClient } from 'npm:@insforge/sdk';

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

// Rate-limit por IP (mismo criterio que personal-registro.ts): cuenta
// "abrir" y "responder" juntos para que alternar acciones no lo evada.
const INTENTOS_MAX_IP = 20;
const INTENTOS_VENTANA_MIN = 10;

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

  async function bajoLimite(): Promise<boolean> {
    const ip = ipDesdeHeaders(req.headers);
    const desde = new Date(Date.now() - INTENTOS_VENTANA_MIN * 60 * 1000).toISOString();
    const { data: intentos } = await admin.database
      .from('encuesta_respuesta_intentos')
      .select('id')
      .eq('ip', ip)
      .gte('created_at', desde);
    if ((intentos?.length || 0) >= INTENTOS_MAX_IP) return false;
    await admin.database.from('encuesta_respuesta_intentos').insert([{ ip }]);
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
    if (!ronda || ronda.cerrada || !ronda.encuestas) return null;
    return { rondaId: ronda.id, encuesta: ronda.encuestas };
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
