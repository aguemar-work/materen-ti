// Snapshot determinista del catálogo de Postgres (policies, triggers,
// funciones, constraints, índices, columnas, tablas/RLS, vistas) y detector de
// drift contra el archivo versionado docs/esquema/snapshot.json.
// Plan de mejora Ciclo 21, §7.6 (H1-9). Cierra C21-DOC-001/OPS-004: un drift es
// "alguien tocó producción sin migración" o "una migración commiteada no se
// aplicó" (lo que pasó con 086–089).
//
// Uso:
//   node scripts/snapshot-esquema.mjs --escribir                 genera/actualiza docs/esquema/snapshot.json
//   node scripts/snapshot-esquema.mjs --verificar                compara catálogo vivo vs archivo; exit 1 si difieren
//   node scripts/snapshot-esquema.mjs --verificar --desde-archivo otro.json   compara archivo vs archivo (sin base)
//   node scripts/snapshot-esquema.mjs --escribir  --desde-archivo otro.json   normaliza otro.json y lo escribe
//   --archivo <ruta>   cambia la ruta del snapshot versionado (defecto docs/esquema/snapshot.json)
//
// Códigos de salida: 0 = sin diferencias / escrito · 1 = diferencias (drift) ·
// 2 = no se pudo consultar la base (transporte/SQL) · 64 = uso incorrecto.
//
// Transporte: ver scripts/lib/insforge-sql.mjs (CLI por defecto, HTTP candidato
// para CI). `consultarSql(sql)` es la única función que toca la red.
//
// Determinismo: nada de OIDs ni timestamps; las consultas ordenan, y el
// archivo se ordena otra vez en JS por clave natural, así que el resultado no
// depende de la collation del servidor. Las consultas van en UNA línea, sin
// `$$`, sin comillas dobles y sin `%` (gotchas del CLI, docs/GOTCHAS-CLI.md).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearTransporte } from './lib/insforge-sql.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const RUTA_SNAPSHOT = resolve(RAIZ, 'docs/esquema/snapshot.json');
export const VERSION_FORMATO = 1;

// ── Definición de categorías ──────────────────────────────────────────────
// clave: campos que identifican la fila; el resto se compara como valor.
// sql: consulta de catálogo (UNA línea). Cada fila devuelve exactamente los
// campos de `campos` (las claves primero).
const ACL_FUNCION =
  "coalesce((select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type, ',' order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type) from aclexplode(p.proacl) a), 'DEFAULT')";
const ACL_TABLA =
  "coalesce((select string_agg(case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type, ',' order by case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end, a.privilege_type) from aclexplode(c.relacl) a), 'DEFAULT')";

export const CATEGORIAS = {
  tablas: {
    clave: ['tabla'],
    campos: ['tabla', 'tipo', 'rls', 'rls_forzado', 'acl'],
    sql:
      `select c.relname as tabla, c.relkind::text as tipo, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzado, ${ACL_TABLA} as acl ` +
      "from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by c.relname",
  },
  policies: {
    clave: ['esquema', 'tabla', 'nombre'],
    campos: ['esquema', 'tabla', 'nombre', 'cmd', 'permisiva', 'roles', 'qual', 'with_check'],
    sql:
      'select schemaname as esquema, tablename as tabla, policyname as nombre, cmd, permissive as permisiva, array_to_string(roles, chr(44)) as roles, qual, with_check ' +
      "from pg_policies where schemaname in ('public', 'realtime', 'storage') order by 1, 2, 3",
  },
  triggers: {
    clave: ['esquema', 'tabla', 'nombre'],
    campos: ['esquema', 'tabla', 'nombre', 'funcion', 'habilitado', 'definicion'],
    sql:
      'select n.nspname as esquema, c.relname as tabla, t.tgname as nombre, p.proname as funcion, t.tgenabled::text as habilitado, pg_get_triggerdef(t.oid) as definicion ' +
      'from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid ' +
      "where not t.tgisinternal and (n.nspname = 'public' or (n.nspname = 'auth' and c.relname = 'users')) order by 1, 2, 3",
  },
  funciones: {
    clave: ['nombre', 'argumentos'],
    campos: ['nombre', 'argumentos', 'retorna', 'security_definer', 'config', 'md5_cuerpo', 'acl', 'volatilidad', 'dueno'],
    sql:
      'select p.proname as nombre, pg_get_function_identity_arguments(p.oid) as argumentos, pg_get_function_result(p.oid) as retorna, p.prosecdef as security_definer, ' +
      `coalesce(array_to_string(p.proconfig, chr(59)), '') as config, md5(p.prosrc) as md5_cuerpo, ${ACL_FUNCION} as acl, p.provolatile::text as volatilidad, pg_get_userbyid(p.proowner) as dueno ` +
      "from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind in ('f', 'p') " +
      "and not exists (select 1 from pg_depend d where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e') order by 1, 2",
  },
  constraints: {
    clave: ['tabla', 'nombre'],
    campos: ['tabla', 'nombre', 'tipo', 'definicion'],
    sql:
      'select cl.relname as tabla, c.conname as nombre, c.contype::text as tipo, pg_get_constraintdef(c.oid) as definicion ' +
      "from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public' order by 1, 2",
  },
  indices: {
    clave: ['tabla', 'nombre'],
    campos: ['tabla', 'nombre', 'definicion'],
    sql: "select tablename as tabla, indexname as nombre, indexdef as definicion from pg_indexes where schemaname = 'public' order by 1, 2",
  },
  columnas: {
    clave: ['tabla', 'columna'],
    campos: ['tabla', 'columna', 'tipo', 'tipo_udt', 'largo', 'nullable', 'valor_default', 'identidad', 'generada'],
    sql:
      'select table_name as tabla, column_name as columna, data_type as tipo, udt_name as tipo_udt, character_maximum_length as largo, is_nullable as nullable, column_default as valor_default, is_identity as identidad, ' +
      "case when is_generated = 'NEVER' then null else generation_expression end as generada " +
      "from information_schema.columns where table_schema = 'public' order by 1, 2",
  },
  vistas: {
    clave: ['nombre'],
    campos: ['nombre', 'md5_definicion', 'opciones'],
    sql:
      "select c.relname as nombre, md5(pg_get_viewdef(c.oid, true)) as md5_definicion, coalesce(array_to_string(c.reloptions, chr(59)), '') as opciones " +
      "from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1",
  },
};
export const NOMBRES_CATEGORIAS = Object.keys(CATEGORIAS);

// ── Normalización (pura) ──────────────────────────────────────────────────
// Colapsa espacios/saltos de línea: una diferencia de formato en una
// definición no es drift.
export function normalizarSql(texto) {
  if (texto === null || texto === undefined) return null;
  return String(texto).replace(/\s+/g, ' ').trim();
}

const CAMPOS_SQL = new Set(['qual', 'with_check', 'definicion', 'valor_default', 'generada', 'retorna', 'argumentos']);

function normalizarValor(campo, valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'boolean' || typeof valor === 'number') return valor;
  if (CAMPOS_SQL.has(campo)) return normalizarSql(valor);
  // Los enteros del CLI llegan como string ("character_maximum_length": "100").
  if (campo === 'largo') return valor === '' ? null : Number(valor);
  return String(valor);
}

// "t"/"f"/true/false -> booleano (el CLI devuelve booleanos reales; por si el
// transporte los serializa como texto).
function aBooleano(v) {
  if (v === true || v === 't' || v === 'true') return true;
  if (v === false || v === 'f' || v === 'false') return false;
  return v;
}
const CAMPOS_BOOL = new Set(['rls', 'rls_forzado', 'security_definer']);

export function normalizarFila(categoria, fila) {
  const def = CATEGORIAS[categoria];
  const salida = {};
  for (const campo of def.campos) {
    let v = normalizarValor(campo, fila[campo]);
    if (CAMPOS_BOOL.has(campo)) v = aBooleano(v);
    salida[campo] = v;
  }
  return salida;
}

export function claveDeFila(categoria, fila) {
  return CATEGORIAS[categoria].clave.map((k) => String(fila[k] ?? '')).join('\u0001');
}

function comparar(a, b) {
  return a < b ? -1 : a > b ? 1 : 0; // por unidades de código: independiente de la collation
}

export function normalizarCategoria(categoria, filas) {
  return filas
    .map((f) => normalizarFila(categoria, f))
    .sort((a, b) => comparar(claveDeFila(categoria, a), claveDeFila(categoria, b)));
}

export function construirSnapshot(filasPorCategoria) {
  const categorias = {};
  for (const nombre of NOMBRES_CATEGORIAS) {
    categorias[nombre] = normalizarCategoria(nombre, filasPorCategoria[nombre] || []);
  }
  return { version_formato: VERSION_FORMATO, categorias };
}

// Una fila por línea: los diffs de git quedan legibles y el archivo no explota.
export function serializarSnapshot(snapshot) {
  const partes = NOMBRES_CATEGORIAS.map((nombre) => {
    const filas = snapshot.categorias[nombre] || [];
    const cuerpo = filas.map((f) => `      ${JSON.stringify(f)}`).join(',\n');
    return `    ${JSON.stringify(nombre)}: [${filas.length ? `\n${cuerpo}\n    ` : ''}]`;
  });
  return `{\n  "version_formato": ${snapshot.version_formato},\n  "categorias": {\n${partes.join(',\n')}\n  }\n}\n`;
}

// ── Comparación (pura) ────────────────────────────────────────────────────
// Devuelve { total, porCategoria: { cat: { agregados: [], eliminados: [], cambiados: [{clave, campos:{campo:{esperado,vivo}}}] } } }
// "esperado" = archivo versionado · "vivo" = catálogo consultado.
export function compararSnapshots(esperado, vivo) {
  const porCategoria = {};
  let total = 0;
  for (const nombre of NOMBRES_CATEGORIAS) {
    const a = normalizarCategoria(nombre, esperado.categorias?.[nombre] || []);
    const b = normalizarCategoria(nombre, vivo.categorias?.[nombre] || []);
    const mapaA = new Map(a.map((f) => [claveDeFila(nombre, f), f]));
    const mapaB = new Map(b.map((f) => [claveDeFila(nombre, f), f]));
    const res = { agregados: [], eliminados: [], cambiados: [] };
    for (const [k, fila] of mapaB) {
      if (!mapaA.has(k)) {
        res.agregados.push(etiquetaDeFila(nombre, fila));
        continue;
      }
      const previa = mapaA.get(k);
      const campos = {};
      for (const campo of CATEGORIAS[nombre].campos) {
        if (JSON.stringify(previa[campo]) !== JSON.stringify(fila[campo])) {
          campos[campo] = { esperado: previa[campo], vivo: fila[campo] };
        }
      }
      if (Object.keys(campos).length) res.cambiados.push({ clave: etiquetaDeFila(nombre, fila), campos });
    }
    for (const [k, fila] of mapaA) {
      if (!mapaB.has(k)) res.eliminados.push(etiquetaDeFila(nombre, fila));
    }
    total += res.agregados.length + res.eliminados.length + res.cambiados.length;
    porCategoria[nombre] = res;
  }
  return { total, porCategoria };
}

export function etiquetaDeFila(categoria, fila) {
  return CATEGORIAS[categoria].clave.map((k) => fila[k]).join('.');
}

function recortar(valor, max = 160) {
  const s = typeof valor === 'string' ? valor : JSON.stringify(valor);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// "esperado" = archivo del repo; "vivo" = base consultada. Texto para consola/CI.
export function formatearDiferencias(dif) {
  if (dif.total === 0) return 'Sin diferencias: el catálogo vivo coincide con el snapshot versionado.';
  const lineas = [`${dif.total} diferencia(s) entre el snapshot versionado y el catálogo vivo:`];
  for (const nombre of NOMBRES_CATEGORIAS) {
    const r = dif.porCategoria[nombre];
    const n = r.agregados.length + r.eliminados.length + r.cambiados.length;
    if (!n) continue;
    lineas.push('', `[${nombre}] ${n}`);
    for (const k of r.agregados) lineas.push(`  + en la base y NO en el snapshot: ${k}`);
    for (const k of r.eliminados) lineas.push(`  - en el snapshot y NO en la base: ${k}`);
    for (const c of r.cambiados) {
      lineas.push(`  ~ cambió: ${c.clave}`);
      for (const [campo, v] of Object.entries(c.campos)) {
        lineas.push(`      ${campo}: snapshot=${recortar(v.esperado)}  vivo=${recortar(v.vivo)}`);
      }
    }
  }
  return lineas.join('\n');
}

// ── Lectura del catálogo vivo ─────────────────────────────────────────────
export async function leerCatalogoVivo(consultarSql) {
  const filas = {};
  for (const nombre of NOMBRES_CATEGORIAS) {
    filas[nombre] = await consultarSql(CATEGORIAS[nombre].sql);
  }
  return construirSnapshot(filas);
}

export function leerSnapshotArchivo(ruta) {
  const json = JSON.parse(readFileSync(ruta, 'utf8'));
  if (json.version_formato !== VERSION_FORMATO) {
    throw new Error(`Versión de formato no soportada en ${ruta}: ${json.version_formato} (se esperaba ${VERSION_FORMATO}).`);
  }
  return json;
}

// ── CLI ───────────────────────────────────────────────────────────────────
export function parsearArgumentos(argv) {
  const opciones = { modo: null, desdeArchivo: null, archivo: RUTA_SNAPSHOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--escribir' || a === '--verificar') {
      if (opciones.modo && opciones.modo !== a.slice(2)) throw new Error('Use --escribir O --verificar, no ambos.');
      opciones.modo = a.slice(2);
    } else if (a === '--desde-archivo') {
      opciones.desdeArchivo = argv[++i];
      if (!opciones.desdeArchivo) throw new Error('--desde-archivo requiere una ruta.');
    } else if (a === '--archivo') {
      const v = argv[++i];
      if (!v) throw new Error('--archivo requiere una ruta.');
      opciones.archivo = resolve(process.cwd(), v);
    } else {
      throw new Error(`Argumento desconocido: ${a}`);
    }
  }
  if (!opciones.modo) throw new Error('Indique --escribir o --verificar.');
  return opciones;
}

const USO =
  'Uso: node scripts/snapshot-esquema.mjs (--escribir | --verificar) [--desde-archivo <json>] [--archivo <ruta>]\n' +
  'Variables: INSFORGE_CLI_CWD (carpeta enlazada al proyecto), INSFORGE_SQL_TRANSPORT=cli|http (+ INSFORGE_PROJECT_URL, INSFORGE_API_KEY).';

export async function principal(argv, { transporte, salida = console } = {}) {
  let o;
  try {
    o = parsearArgumentos(argv);
  } catch (e) {
    salida.error(`${e.message}\n${USO}`);
    return 64;
  }

  let vivo;
  try {
    if (o.desdeArchivo) {
      vivo = leerSnapshotArchivo(resolve(process.cwd(), o.desdeArchivo));
      // Se pasa por construirSnapshot para normalizar igual que el catálogo vivo.
      vivo = construirSnapshot(vivo.categorias);
    } else {
      const t = transporte || crearTransporte();
      vivo = await leerCatalogoVivo((sql) => t.consultarSql(sql));
    }
  } catch (e) {
    salida.error(`No se pudo leer el catálogo (${e.codigo || 'error'}): ${e.message}`);
    salida.error('Si el CLI no está enlazado en esta carpeta, defina INSFORGE_CLI_CWD con la carpeta que contiene .insforge/.');
    return 2;
  }

  if (o.modo === 'escribir') {
    mkdirSync(dirname(o.archivo), { recursive: true });
    writeFileSync(o.archivo, serializarSnapshot(vivo), 'utf8');
    const resumen = NOMBRES_CATEGORIAS.map((n) => `${n}=${vivo.categorias[n].length}`).join(' · ');
    salida.log(`Snapshot escrito en ${o.archivo}\n  ${resumen}`);
    return 0;
  }

  if (!existsSync(o.archivo)) {
    salida.error(`No existe ${o.archivo}. Generarlo con: node scripts/snapshot-esquema.mjs --escribir`);
    return 2;
  }
  const esperado = leerSnapshotArchivo(o.archivo);
  const dif = compararSnapshots(esperado, vivo);
  if (dif.total === 0) {
    salida.log(formatearDiferencias(dif));
    return 0;
  }
  salida.error(formatearDiferencias(dif));
  salida.error(
    '\nDrift de esquema: alguien tocó la base sin migración, o una migración commiteada no se aplicó (o al revés). ' +
      'Si el cambio es legítimo y ya está en una migración comiteada: node scripts/snapshot-esquema.mjs --escribir y comitear el snapshot.',
  );
  return 1;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error(e.stack || e.message);
      process.exit(2);
    },
  );
}
