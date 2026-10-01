// Transporte SQL compartido por scripts/deploy.mjs y scripts/snapshot-esquema.mjs.
//
// Todo el código que habla con la base pasa por UNA interfaz:
//
//   transporte.consultarSql(sqlUnaLinea)  -> Promise<Array<fila>>   (solo SELECT/INSERT cortos)
//   transporte.importarArchivo(ruta)      -> Promise<{ estado, detalle }>   (solo CLI)
//
// y se elige con crearTransporte(env). Hay dos implementaciones:
//
//   'cli'  (por defecto) `npx @insforge/cli db query --json` / `db import`.
//          Es la ÚNICA ruta verificada de punta a punta (2026-10-01). En CI NO
//          funciona hoy (hallazgo C13-e: requireAuth() del CLI ignora
//          INSFORGE_ACCESS_TOKEN y cae a OAuth interactivo).
//   'http' POST <INSFORGE_PROJECT_URL>/api/database/advance/rawsql con
//          Authorization: Bearer <INSFORGE_API_KEY>, que es exactamente lo que
//          hace `db query` por dentro (@insforge/cli 0.2.8, src/lib/api/oss.ts
//          `runRawSql`). Evita requireAuth(). NO VERIFICADA contra el servicio
//          real: requiere la clave admin del proyecto (secret de CI) que esta
//          sesión no tiene. Solo consultas; no implementa importarArchivo.
//
// GOTCHAS-CLI.md aplica entero a la ruta 'cli':
//  - el SQL que viaja como argumento va en UNA línea y sin `$$` (cmd.exe trunca
//    en el primer salto de línea; el parser del CLI rechaza dollar-quoting);
//  - el SQL real de una migración (cualquier tamaño) va por `db import <ruta>`,
//    nunca como argumento;
//  - `db import` puede crashear ("Assertion failed ... win\async.c") habiendo
//    ejecutado el statement: se clasifica como 'pendiente', no como error.
import { writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── Validación del SQL que viaja como argumento ───────────────────────────
// Falla ALTO en vez de truncarse en silencio (incidente de la migración 073).
export function validarSqlUnaLinea(sql) {
  if (typeof sql !== 'string' || sql.trim() === '') {
    throw new Error('consultarSql() recibió SQL vacío.');
  }
  if (/[\r\n]/.test(sql)) {
    throw new Error(
      'consultarSql() recibió SQL multilínea: cmd.exe lo trunca en silencio (incidente de la migración 073). Usar una sola línea, o importarArchivo() para SQL real.',
    );
  }
  if (sql.includes('$$')) {
    throw new Error('consultarSql() recibió dollar-quoting ($$): el CLI lo rechaza ("no language specified"). Usar importarArchivo().');
  }
  if (sql.includes('"')) {
    throw new Error('consultarSql() recibió comillas dobles: no sobreviven al quoting de cmd.exe en Windows. Evitar identificadores entre comillas.');
  }
  if (sql.includes('%')) {
    throw new Error('consultarSql() recibió "%": cmd.exe expande %VAR% dentro del argumento. Evitar LIKE con % en el SQL de control (usar left()/position()).');
  }
  return sql;
}

// Escapa un valor para un literal SQL de una línea ('...'). Rechaza lo que no
// se puede enviar de forma segura por esta vía.
export function literalSql(valor) {
  if (valor === null || valor === undefined) return 'null';
  const texto = String(valor);
  if (/[\r\n"%]/.test(texto) || texto.includes('$$')) {
    throw new Error(`Valor no apto para un literal SQL de una línea: ${JSON.stringify(texto.slice(0, 40))}`);
  }
  return `'${texto.replace(/'/g, "''")}'`;
}

// ── Salida del CLI ────────────────────────────────────────────────────────
// `--json` imprime JSON, pero el CLI puede anteponer avisos (p. ej. de
// actualización). Se toma desde el primer `{` o `[`.
export function parsearSalidaJson(texto) {
  const s = String(texto || '');
  const i = s.search(/[{[]/);
  if (i < 0) return null;
  try {
    return JSON.parse(s.slice(i));
  } catch {
    return null;
  }
}

// Interpreta el resultado crudo de `db query --json`. Lanza Error con
// `.codigo = 'transporte'` si no se puede ni siquiera hablar con el servicio
// (sin sesión, sin red, timeout), para que el llamador distinga "la base
// respondió con un error SQL" de "no hubo conexión".
export function filasDeRespuestaCli(r) {
  if (r.error) {
    const e = new Error(`No se pudo ejecutar el CLI: ${r.error.message}`);
    e.codigo = 'transporte';
    throw e;
  }
  const salida = `${r.stdout || ''}\n${r.stderr || ''}`;
  const json = parsearSalidaJson(r.stdout) ?? parsearSalidaJson(r.stderr);
  if (r.status === 0 && json && Array.isArray(json.rows)) return json.rows;
  if (r.status === 0 && json === null && /^\s*$/.test(r.stdout || '')) return [];
  if (json && json.error) {
    const e = new Error(String(json.error).split('\n')[0]);
    // "No project linked" / sesión caída son problemas de transporte, no SQL.
    e.codigo = /no project linked|not (logged|authenticated)|authentication|log ?in/i.test(String(json.error)) ? 'transporte' : 'sql';
    throw e;
  }
  const e = new Error(`El CLI terminó con estado ${r.status} y una salida no reconocida: ${salida.trim().slice(0, 300)}`);
  // Sin JSON de error y sin filas: casi siempre es sesión/OAuth/timeout.
  e.codigo = 'transporte';
  throw e;
}

// Clasifica el resultado de `db import` en exactamente uno de tres estados
// (ver cabecera de apply-migration.mjs: 'pendiente' = firma de crash del
// cliente, el statement pudo haberse ejecutado igual).
export function clasificarImport(r) {
  if (r.error) return { estado: 'error', detalle: r.error.message };
  const salida = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
  if (r.status === 0) return { estado: 'exito', detalle: salida };
  if (/Assertion failed/i.test(salida)) return { estado: 'pendiente', detalle: salida };
  return { estado: 'error', detalle: salida };
}

// ── Ejecución del CLI ─────────────────────────────────────────────────────
// En Windows `npx` es npx.cmd (batch shim) y spawnSync no lo lanza directo:
// se pasa por `cmd.exe /d /s /c`, que SÍ es un ejecutable real, de modo que
// Node escapa cada elemento del argv (a diferencia de shell:true).
export function ejecutarCli(args, { cwd, timeoutMs = 120_000, env } = {}) {
  const opciones = {
    encoding: 'utf8',
    cwd: cwd || undefined,
    timeout: timeoutMs,
    maxBuffer: 256 * 1024 * 1024,
    env: env || process.env,
  };
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', 'npx', '@insforge/cli', ...args], opciones);
  }
  return spawnSync('npx', ['@insforge/cli', ...args], opciones);
}

export function crearTransporteCli({ cwd, timeoutMs = 120_000, ejecutar = ejecutarCli } = {}) {
  return {
    nombre: 'cli',
    async consultarSql(sql) {
      validarSqlUnaLinea(sql);
      return filasDeRespuestaCli(ejecutar(['db', 'query', '--json', '--', sql], { cwd, timeoutMs }));
    },
    // El único argumento que cruza cmd.exe es una ruta corta de una línea.
    async importarArchivo(contenidoSql) {
      const tmp = join(tmpdir(), `insforge-import-${randomUUID()}.sql`);
      writeFileSync(tmp, contenidoSql, 'utf8');
      try {
        return clasificarImport(ejecutar(['db', 'import', tmp], { cwd, timeoutMs: Math.max(timeoutMs, 600_000) }));
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          // archivo de un solo uso
        }
      }
    },
    // Para `functions deploy` y similares (no son SQL).
    ejecutarComando(args, opciones = {}) {
      return ejecutar(args, { cwd, timeoutMs: opciones.timeoutMs ?? 300_000 });
    },
  };
}

export function crearTransporteHttp({ url, apiKey, fetchImpl = globalThis.fetch, timeoutMs = 60_000 } = {}) {
  if (!url || !apiKey) {
    throw new Error('Transporte http: faltan INSFORGE_PROJECT_URL y/o INSFORGE_API_KEY.');
  }
  const base = String(url).replace(/\/+$/, '');
  return {
    nombre: 'http',
    async consultarSql(sql) {
      validarSqlUnaLinea(sql);
      let res;
      try {
        res = await fetchImpl(`${base}/api/database/advance/rawsql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ query: sql }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const e = new Error(`No se pudo contactar el servicio SQL: ${err.message}`);
        e.codigo = 'transporte';
        throw e;
      }
      let cuerpo = null;
      try {
        cuerpo = await res.json();
      } catch {
        // cuerpo no JSON
      }
      if (!res.ok) {
        const e = new Error(String(cuerpo?.message ?? cuerpo?.error ?? `HTTP ${res.status}`).split('\n')[0]);
        // 401/403/5xx = problema de acceso o servicio; 400/422 = SQL rechazado.
        e.codigo = res.status === 400 || res.status === 422 ? 'sql' : 'transporte';
        throw e;
      }
      return cuerpo?.rows ?? cuerpo?.data ?? [];
    },
    async importarArchivo() {
      throw new Error('El transporte http no implementa importarArchivo(): aplicar migraciones solo con el CLI (db import).');
    },
    ejecutarComando() {
      throw new Error('El transporte http no ejecuta comandos del CLI.');
    },
  };
}

// Elige el transporte según el entorno:
//   INSFORGE_SQL_TRANSPORT = cli (defecto) | http
//   INSFORGE_CLI_CWD       = carpeta ENLAZADA al proyecto (donde está .insforge/),
//                            para correr el CLI desde un worktree sin enlazar.
//   INSFORGE_PROJECT_URL / INSFORGE_API_KEY = solo para 'http'.
export function crearTransporte(env = process.env) {
  const modo = (env.INSFORGE_SQL_TRANSPORT || 'cli').toLowerCase();
  if (modo === 'http') {
    return crearTransporteHttp({ url: env.INSFORGE_PROJECT_URL, apiKey: env.INSFORGE_API_KEY });
  }
  if (modo !== 'cli') {
    throw new Error(`INSFORGE_SQL_TRANSPORT inválido: "${modo}" (use cli o http).`);
  }
  return crearTransporteCli({ cwd: env.INSFORGE_CLI_CWD });
}
