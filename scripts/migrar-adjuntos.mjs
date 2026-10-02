// Mueve las capturas de tickets de la key antigua `<token>/captura.<ext>` a la
// nueva `tickets/<ticket.id>/captura.<ext>` (migración 111, plan de mejora
// Ciclo 21 §4 "Adjuntos privados"). La key antigua llevaba el TOKEN de
// seguimiento del ticket en la URL del objeto; la nueva solo lleva el id.
//
// Uso:
//   node scripts/migrar-adjuntos.mjs                  DRY-RUN (por defecto): lee, planifica e imprime; no cambia nada
//   node scripts/migrar-adjuntos.mjs --ejecutar       mueve de verdad
//   node scripts/migrar-adjuntos.mjs --ejecutar --limite 3    prueba con los 3 primeros
//   (--ayuda muestra esto)
//
// Por objeto, en este orden (si un paso falla, el ticket sigue apuntando al
// objeto viejo y NADA se pierde):
//   1. descargar el objeto antiguo
//   2. subirlo a la key nueva (tickets/<id>/captura.<ext>)
//   3. releerlo y comparar el tamaño
//   4. UPDATE tickets SET adjunto_key = <nueva>, adjunto_url = NULL
//        WHERE id = <id> AND adjunto_key = <antigua>        (condicional: no pisa un cambio concurrente)
//   5. borrar el objeto antiguo
// Es idempotente: un ticket cuya key ya empieza por `tickets/<id>/` se omite, y
// repetir tras un fallo retoma donde quedó.
//
// Dry-run: solo SELECT, por el CLI de InsForge (misma vía que deploy.mjs:
// INSFORGE_CLI_CWD = carpeta enlazada al proyecto). NO necesita ninguna clave.
// --ejecutar: usa el SDK con el cliente ADMIN, que necesita las variables
//   INSFORGE_PROJECT_URL (o INSFORGE_BASE_URL) e INSFORGE_API_KEY (o API_KEY).
//   Se leen del entorno; el script no las imprime ni las busca en ningún archivo.
//
// Seguridad de la salida: NUNCA imprime tokens ni keys antiguas (el token va en
// ellas) ni URLs. Solo el código del ticket (TCK-XXXX), la acción y totales.
//
// Efectos conocidos de --ejecutar:
//   - `tickets.updated_at` de cada ticket movido pasa a ahora (trigger
//     trg_tickets_updated_at). Los avisos del staff solo se disparan por cambio
//     de estado o de asignación, así que no hay notificaciones nuevas.
//   - No limpia EXIF de los objetos antiguos: son capturas que el navegador
//     re-codificó con canvas antes de subir (core/imagenes.js), que no conserva
//     metadatos. Las subidas nuevas sí pasan por stripExif en la function.
//   - Los objetos del bucket que ningún ticket referencia ("huérfanos") se
//     cuentan y se informan, pero no se tocan.
//
// Después de un --ejecutar sin fallos, el último paso (manual, ver la cabecera
// de migrations/111_adjuntos_privados_tickets.sql) es volver PRIVADO el bucket
// `tickets-adjuntos`. El dry-run informa si sigue público.
//
// Códigos de salida: 0 ok · 1 hubo fallos al mover · 2 sin conexión con la base ·
// 64 uso incorrecto o faltan variables de entorno.
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { crearTransporte } from './lib/insforge-sql.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BUCKET = 'tickets-adjuntos';
export const EXTENSIONES = ['jpg', 'png', 'webp', 'gif'];
const MIME_POR_EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

// ── Argumentos (puro) ─────────────────────────────────────────────────────
export function parsearArgumentos(argv) {
  const o = { ejecutar: false, limite: null, ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ejecutar') o.ejecutar = true;
    else if (a === '--ayuda' || a === '--help' || a === '-h') o.ayuda = true;
    else if (a === '--limite') {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) throw new Error('--limite requiere un entero mayor que 0.');
      o.limite = n;
    } else throw new Error(`Argumento desconocido: ${a}`);
  }
  return o;
}

// ── Plan (puro) ───────────────────────────────────────────────────────────
// tickets: [{ id, codigo, adjunto_key }] con adjunto_key no nulo.
// objetos: [{ key }] del bucket. Devuelve { items, huerfanos, totales }.
// acciones: 'mover' | 'ya_migrado' | 'objeto_ausente' | 'extension_invalida' | 'key_ocupada'
export function extensionDeKey(key) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(key || ''));
  const ext = m ? m[1].toLowerCase().replace('jpeg', 'jpg') : '';
  return EXTENSIONES.includes(ext) ? ext : null;
}

export const keyNueva = (ticketId, ext) => `tickets/${ticketId}/captura.${ext}`;

export function planificar(tickets, objetos) {
  const presentes = new Set(objetos.map((o) => o.key));
  const referenciadas = new Set();
  const items = [];
  for (const t of tickets) {
    const origen = t.adjunto_key;
    if (!origen) continue;
    referenciadas.add(origen);
    if (origen.startsWith(`tickets/${t.id}/`)) {
      items.push({ ticketId: t.id, codigo: t.codigo, accion: 'ya_migrado' });
      continue;
    }
    const ext = extensionDeKey(origen);
    if (!ext) {
      items.push({ ticketId: t.id, codigo: t.codigo, accion: 'extension_invalida' });
      continue;
    }
    if (!presentes.has(origen)) {
      items.push({ ticketId: t.id, codigo: t.codigo, accion: 'objeto_ausente' });
      continue;
    }
    const destino = keyNueva(t.id, ext);
    // El destino ya existe y no es el origen: otro objeto lo ocupa. Con la
    // key basada en el id no debería pasar; si pasa, no se pisa nada.
    if (presentes.has(destino) && destino !== origen) {
      items.push({ ticketId: t.id, codigo: t.codigo, accion: 'key_ocupada' });
      continue;
    }
    items.push({ ticketId: t.id, codigo: t.codigo, accion: 'mover', origen, destino, extension: ext });
  }
  const huerfanos = objetos.filter((o) => !referenciadas.has(o.key) && !String(o.key).startsWith('tickets/')).length;
  const totales = {};
  for (const it of items) totales[it.accion] = (totales[it.accion] || 0) + 1;
  return { items, huerfanos, totales };
}

// Texto del plan SIN keys ni tokens: solo código, acción y totales.
const ETIQUETA = {
  mover: 'mover a tickets/<id>/captura.<ext>',
  ya_migrado: 'ya migrado',
  objeto_ausente: 'OBJETO AUSENTE en el bucket (no se toca)',
  extension_invalida: 'EXTENSION no reconocida (no se toca)',
  key_ocupada: 'DESTINO OCUPADO (no se toca)',
};
export function formatearPlan(plan) {
  const lineas = plan.items.map((it) => `  ${it.codigo}  ${ETIQUETA[it.accion] || it.accion}`);
  const resumen = Object.entries(plan.totales).map(([k, v]) => `${k}=${v}`).join(' ') || 'sin tickets con adjunto';
  lineas.push('', `Resumen: ${resumen} · objetos huérfanos en el bucket (informativo, no se tocan)=${plan.huerfanos}`);
  return lineas.join('\n');
}

// ── Ejecución de UN objeto (ops inyectadas: probado sin red) ──────────────
// ops: { descargar(key) -> Blob|null, subir(key, blob, mime) -> boolean,
//        actualizarTicket(id, keyVieja, keyNueva) -> boolean, borrar(key) -> boolean }
// Devuelve { estado: 'migrado' | 'migrado_con_resto' | 'error', etapa? }.
export async function migrarItem(item, ops) {
  const mime = MIME_POR_EXT[item.extension];
  let original;
  try {
    original = await ops.descargar(item.origen);
  } catch {
    return { estado: 'error', etapa: 'descargar' };
  }
  if (!original || original.size === 0) return { estado: 'error', etapa: 'descargar' };

  try {
    if (!(await ops.subir(item.destino, original, mime))) return { estado: 'error', etapa: 'subir' };
  } catch {
    return { estado: 'error', etapa: 'subir' };
  }

  try {
    const copia = await ops.descargar(item.destino);
    if (!copia || copia.size !== original.size) return { estado: 'error', etapa: 'verificar' };
  } catch {
    return { estado: 'error', etapa: 'verificar' };
  }

  try {
    if (!(await ops.actualizarTicket(item.ticketId, item.origen, item.destino))) return { estado: 'error', etapa: 'actualizar' };
  } catch {
    return { estado: 'error', etapa: 'actualizar' };
  }

  try {
    if (!(await ops.borrar(item.origen))) return { estado: 'migrado_con_resto', etapa: 'borrar' };
  } catch {
    return { estado: 'migrado_con_resto', etapa: 'borrar' };
  }
  return { estado: 'migrado' };
}

export async function migrarPlan(plan, ops, { limite = null, log = () => {} } = {}) {
  const pendientes = plan.items.filter((it) => it.accion === 'mover');
  const lote = limite ? pendientes.slice(0, limite) : pendientes;
  const cuenta = { migrado: 0, migrado_con_resto: 0, error: 0 };
  for (const it of lote) {
    const r = await migrarItem(it, ops);
    cuenta[r.estado] += 1;
    log(`  ${it.codigo}  ${r.estado}${r.etapa ? ` (paso: ${r.etapa})` : ''}`);
  }
  return { ...cuenta, omitidos: pendientes.length - lote.length };
}

// ── Lectura (solo SELECT por el CLI) ──────────────────────────────────────
export async function leerEstado(transporte) {
  const tickets = await transporte.consultarSql(
    'select id, codigo, adjunto_key from public.tickets where adjunto_key is not null order by created_at',
  );
  const objetos = await transporte.consultarSql(`select key from storage.objects where bucket = '${BUCKET}'`);
  let publico = null;
  try {
    const filas = await transporte.consultarSql(`select public from storage.buckets where name = '${BUCKET}'`);
    publico = filas.length ? filas[0].public === true || filas[0].public === 't' || filas[0].public === 'true' : null;
  } catch {
    publico = null;
  }
  return { tickets, objetos, publico };
}

// ── Operaciones reales con el SDK (cliente ADMIN) ─────────────────────────
async function cargarSdk() {
  const intentos = ['@insforge/sdk', pathToFileURL(resolve(RAIZ, 'frontend/node_modules/@insforge/sdk/dist/index.mjs')).href];
  for (const especificador of intentos) {
    try {
      return await import(especificador);
    } catch {
      // probar el siguiente
    }
  }
  throw new Error('No se encontró @insforge/sdk: ejecute "npm install" en frontend/.');
}

export async function crearOpsReales(env = process.env) {
  const baseUrl = env.INSFORGE_PROJECT_URL || env.INSFORGE_BASE_URL;
  const apiKey = env.INSFORGE_API_KEY || env.API_KEY;
  if (!baseUrl || !apiKey) {
    const e = new Error('Faltan INSFORGE_PROJECT_URL (o INSFORGE_BASE_URL) e INSFORGE_API_KEY (o API_KEY) en el entorno.');
    e.codigo = 'uso';
    throw e;
  }
  const { createAdminClient } = await cargarSdk();
  const admin = createAdminClient({ baseUrl, apiKey });
  const almacen = admin.storage.from(BUCKET);
  return {
    async descargar(key) {
      const { data, error } = await almacen.download(key);
      if (error) throw new Error(`descarga fallida (${error.statusCode ?? 'sin estado'})`);
      return data;
    },
    async subir(key, blob, mime) {
      const contenido = new Blob([await blob.arrayBuffer()], { type: mime });
      const { data, error } = await almacen.upload(key, contenido);
      return !error && Boolean(data);
    },
    async actualizarTicket(id, keyVieja, keyNueva) {
      const { data, error } = await admin.database
        .from('tickets')
        .update({ adjunto_key: keyNueva, adjunto_url: null })
        .eq('id', id)
        .eq('adjunto_key', keyVieja)
        .select('id');
      return !error && Array.isArray(data) && data.length === 1;
    },
    async borrar(key) {
      const { error } = await almacen.remove(key);
      return !error;
    },
  };
}

// ── Programa principal ────────────────────────────────────────────────────
export async function principal(argv, deps = {}) {
  const out = deps.out || ((t) => console.log(t));
  const err = deps.err || ((t) => console.error(t));
  let opciones;
  try {
    opciones = parsearArgumentos(argv);
  } catch (e) {
    err(`${e.message} (use --ayuda)`);
    return 64;
  }
  if (opciones.ayuda) {
    out('Uso: node scripts/migrar-adjuntos.mjs [--ejecutar] [--limite N]   (sin --ejecutar es un dry-run)');
    return 0;
  }

  let estado;
  try {
    estado = await leerEstado(deps.transporte || crearTransporte());
  } catch (e) {
    err(`No se pudo leer la base: ${String(e.message).split('\n')[0]}`);
    return 2;
  }

  const plan = planificar(estado.tickets, estado.objetos);
  out(`Bucket ${BUCKET}: ${estado.publico === null ? 'visibilidad desconocida' : estado.publico ? 'PUBLICO (falta el paso manual de volverlo privado)' : 'privado'}`);
  out(formatearPlan(plan));

  if (!opciones.ejecutar) {
    out('\nDRY-RUN: no se cambió nada. Para mover de verdad: --ejecutar');
    return 0;
  }

  let ops;
  try {
    ops = deps.ops || (await crearOpsReales());
  } catch (e) {
    err(e.message);
    return e.codigo === 'uso' ? 64 : 2;
  }
  out('\nEjecutando...');
  const r = await migrarPlan(plan, ops, { limite: opciones.limite, log: out });
  out(`\nMigrados=${r.migrado} · migrados con objeto viejo sin borrar=${r.migrado_con_resto} · con error=${r.error}${r.omitidos ? ` · fuera del --limite=${r.omitidos}` : ''}`);
  if (r.migrado_con_resto) out('Los "con objeto viejo sin borrar" ya apuntan a la key nueva; el objeto viejo queda como huérfano (borrarlo desde el panel de Storage).');
  if (estado.publico !== false) out('Pendiente (manual): volver PRIVADO el bucket tickets-adjuntos (panel de InsForge, Storage).');
  return r.error > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => {
      console.error(String(e?.message || e).split('\n')[0]);
      process.exit(2);
    },
  );
}
