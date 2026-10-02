// Cliente falso del modo "maqueta" (`npm run dev:maqueta`). Reemplaza a
// `src/api/client.js` SOLO en ese modo, vía el plugin de `vite.config.js`:
// nada del código de la app importa este archivo directamente, así que no
// puede entrar al bundle de producción.
//
// Imita la superficie de `@insforge/sdk` que usa `src/api/`: un query builder
// encadenable estilo PostgREST sobre tablas en memoria (datos inventados de
// `./datos.js`), RPC con respuestas fijas, auth con un JEFE ficticio siempre
// logueado, realtime/storage/functions como no-ops. Las escrituras quedan en
// memoria durante la sesión (recargar la página vuelve a los datos iniciales).
//
// Nunca revela contraseñas reales: la edge function `credenciales` solo
// responde el revelado/cifrado/entrega con valores inventados; el resto de sus
// acciones responde { ok:false, code:'maqueta' }.
import { TABLAS, RPC, USUARIO_MAQUETA } from './datos.js';
import { funcionEquiposFotos, alActualizarFila } from './rpc-equipos.js';
import { alInsertarFilaSolicitudes } from './rpc-solicitudes.js';
import { funcionTickets } from './rpc-tickets.js';

const clonar = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

// Base en memoria, mutable durante la sesión.
const db = Object.fromEntries(Object.entries(TABLAS).map(([t, filas]) => [t, clonar(filas)]));

// Columna con la que OTRAS tablas referencian a cada tabla (FK), y PK propia
// cuando no es `id`. Con esto se resuelven los embeds `rel(...)` del select:
// to-one si la fila tiene la FK de `rel`; to-many si las filas de `rel`
// tienen la FK de la tabla actual.
const FK_DE = {
  empleados: 'empleado_id',
  empresas: 'empresa_id',
  areas_obras: 'area_obra_id',
  ubicaciones: 'ubicacion_id',
  categorias_ticket: 'categoria_id',
  subcategorias_ticket: 'subcategoria_id',
  equipos: 'equipo_id',
  cuentas: 'cuenta_id',
  licencias: 'licencia_id',
  plataformas: 'plataforma_id',
  tipos_equipo: 'tipo_id',
  tickets: 'ticket_id',
  solicitudes: 'solicitud_id',
  solicitud_tipos: 'tipo_id',
  servicios: 'servicio_id',
  cambios: 'cambio_id',
  problemas: 'problema_id',
  encuestas: 'encuesta_id',
  encuesta_rondas: 'ronda_id',
  staff: 'staff_user_id',
};
const PK = { staff: 'user_id' };

// Restricciones `unique` reales que la UI necesita ver rechazadas para poder
// probar su manejo de errores en la maqueta (ej. DNI duplicado en
// EmpleadoForm). Mismo mensaje que devuelve PostgREST/Postgres.
const UNICOS = {
  empleados: [{ col: 'dni', restriccion: 'empleados_dni_key' }],
};

function violacionUnica(tabla, fila, ignorar = null) {
  for (const { col, restriccion } of UNICOS[tabla] || []) {
    if (fila[col] == null) continue;
    const choca = (db[tabla] || []).some((r) => r !== ignorar && r[col] === fila[col]);
    if (choca) {
      return {
        code: '23505',
        message: `duplicate key value violates unique constraint "${restriccion}"`,
      };
    }
  }
  return null;
}

let secuencia = 0;
const nuevoId = () => `maq-${Date.now().toString(36)}-${(secuencia += 1)}`;

// ── Parseo del select: "a, b, rel(x, sub(y)), otra!inner(z)" ────────────────
function partirNivelSuperior(texto) {
  const partes = [];
  let prof = 0;
  let actual = '';
  for (const c of texto) {
    if (c === '(') prof += 1;
    if (c === ')') prof -= 1;
    if (c === ',' && prof === 0) {
      partes.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

function parsearSelect(texto) {
  const embeds = [];
  for (const parte of partirNivelSuperior(String(texto || '*').replace(/\s+/g, ' '))) {
    const m = /^([\w!:]+)\s*\((.*)\)$/s.exec(parte);
    if (!m) continue;
    // alias:rel!hint(...) → clave de salida = alias o rel; tabla = rel
    const [izq] = [m[1]];
    const [alias, resto] = izq.includes(':') ? izq.split(':') : [null, izq];
    const tabla = resto.split('!')[0];
    embeds.push({ clave: alias || tabla, tabla, sub: parsearSelect(m[2]) });
  }
  return embeds;
}

function resolverEmbeds(tabla, fila, embeds) {
  for (const { clave, tabla: rel, sub } of embeds) {
    const filasRel = db[rel] || [];
    const fkHaciaRel = FK_DE[rel];
    if (fkHaciaRel && fkHaciaRel in fila) {
      const pkRel = PK[rel] || 'id';
      const hallada = filasRel.find((r) => r[pkRel] === fila[fkHaciaRel]);
      fila[clave] = hallada ? resolverEmbeds(rel, clonar(hallada), sub) : null;
      continue;
    }
    const fkHaciaMi = FK_DE[tabla];
    const pkMia = PK[tabla] || 'id';
    if (fkHaciaMi && filasRel.some((r) => fkHaciaMi in r)) {
      fila[clave] = filasRel
        .filter((r) => r[fkHaciaMi] === fila[pkMia])
        .map((r) => resolverEmbeds(rel, clonar(r), sub));
      continue;
    }
    fila[clave] = null;
  }
  return fila;
}

// ── Filtros ─────────────────────────────────────────────────────────────────
// Un filtro sobre una columna que las filas no tienen (o sobre un embed,
// "rel.col") se ignora: la maqueta prefiere mostrar datos de más a quedar
// vacía. `or`/`ilike`/`filter` (búsqueda de texto) y `order` se ignoran.
function tieneColumna(filas, col) {
  return !col.includes('.') && filas.some((f) => Object.prototype.hasOwnProperty.call(f, col));
}

function listaDeTextoIn(valor) {
  if (Array.isArray(valor)) return valor;
  return String(valor || '')
    .replace(/^\(|\)$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

// Un término de or()/and() de PostgREST → predicado, o null si no se entiende.
function compilarTermino(texto) {
  const y = /^and\((.*)\)$/s.exec(texto);
  if (y) {
    const partes = partirNivelSuperior(y[1]).map(compilarTermino);
    return partes.every(Boolean) ? (f) => partes.every((p) => p(f)) : null;
  }
  const m = /^([a-z_]+)\.(not\.)?(is|eq|neq|in|gte|lte)\.(.*)$/s.exec(texto);
  if (!m) return null;
  const [, col, neg, op, crudo] = m;
  const literal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
  let pred;
  if (op === 'is') pred = (f) => (literal(crudo) === null ? f[col] == null : f[col] === literal(crudo));
  else if (op === 'eq') pred = (f) => String(f[col]) === crudo;
  else if (op === 'neq') pred = (f) => String(f[col]) !== crudo;
  else if (op === 'in') pred = (f) => listaDeTextoIn(crudo).includes(f[col]);
  else if (op === 'gte') pred = (f) => f[col] != null && String(f[col]) >= crudo;
  else pred = (f) => f[col] != null && String(f[col]) <= crudo;
  return neg ? (f) => !pred(f) : pred;
}

function aplicarFiltro(filas, { tipo, col, valor, op, terminos }) {
  if (tipo === 'or') return filas.filter((f) => terminos.some((t) => t(f)));
  if (!tieneColumna(filas, col)) return filas;
  switch (tipo) {
    case 'eq': return filas.filter((f) => f[col] === valor);
    case 'neq': return filas.filter((f) => f[col] !== valor);
    case 'in': return filas.filter((f) => listaDeTextoIn(valor).includes(f[col]));
    case 'is': return filas.filter((f) => (valor === null ? f[col] == null : f[col] === valor));
    case 'not':
      if (op === 'is') return filas.filter((f) => (valor === null ? f[col] != null : f[col] !== valor));
      if (op === 'in') return filas.filter((f) => !listaDeTextoIn(valor).includes(f[col]));
      if (op === 'eq') return filas.filter((f) => f[col] !== valor);
      return filas;
    case 'gte': return filas.filter((f) => f[col] != null && f[col] >= valor);
    case 'lte': return filas.filter((f) => f[col] != null && f[col] <= valor);
    case 'gt': return filas.filter((f) => f[col] != null && f[col] > valor);
    case 'lt': return filas.filter((f) => f[col] != null && f[col] < valor);
    default: return filas;
  }
}

// ── Query builder encadenable y thenable ────────────────────────────────────
class ConsultaFalsa {
  constructor(tabla) {
    this.tabla = tabla;
    this.operacion = 'select';
    this.seleccion = '*';
    this.opcionesSelect = {};
    this.filtros = [];
    this.rango = null;
    this.limite = null;
    this.modoUnico = null; // 'single' | 'maybeSingle'
    this.payload = null;
  }

  select(columnas = '*', opciones = {}) {
    this.seleccion = columnas;
    this.opcionesSelect = opciones || {};
    return this;
  }

  insert(filas) { this.operacion = 'insert'; this.payload = filas; return this; }
  upsert(filas) { this.operacion = 'upsert'; this.payload = filas; return this; }
  update(datos) { this.operacion = 'update'; this.payload = datos; return this; }
  delete() { this.operacion = 'delete'; return this; }

  eq(col, valor) { this.filtros.push({ tipo: 'eq', col, valor }); return this; }
  neq(col, valor) { this.filtros.push({ tipo: 'neq', col, valor }); return this; }
  in(col, valor) { this.filtros.push({ tipo: 'in', col, valor }); return this; }
  is(col, valor) { this.filtros.push({ tipo: 'is', col, valor }); return this; }
  not(col, op, valor) { this.filtros.push({ tipo: 'not', col, op, valor }); return this; }
  gte(col, valor) { this.filtros.push({ tipo: 'gte', col, valor }); return this; }
  lte(col, valor) { this.filtros.push({ tipo: 'lte', col, valor }); return this; }
  gt(col, valor) { this.filtros.push({ tipo: 'gt', col, valor }); return this; }
  lt(col, valor) { this.filtros.push({ tipo: 'lt', col, valor }); return this; }
  // or() de los chips V2: términos `col.is.null|true|false`, `col.not.is.*`,
  // `col.eq.x`, `col.neq.x`, `col.in.(a,b)`, `col.gte/lte.x` y `and(...)`.
  // Si aparece cualquier otro (la búsqueda por ilike), se ignora entero como
  // antes: la maqueta no filtra texto.
  or(expr) {
    const terminos = partirNivelSuperior(String(expr || '')).map(compilarTermino);
    if (!terminos.length || terminos.some((t) => !t)) return this;
    this.filtros.push({ tipo: 'or', terminos });
    return this;
  }
  filter() { return this; }
  ilike() { return this; }
  like() { return this; }
  match() { return this; }
  contains() { return this; }
  textSearch() { return this; }
  order() { return this; }

  range(desde, hasta) { this.rango = [desde, hasta]; return this; }
  limit(n) { this.limite = n; return this; }
  single() { this.modoUnico = 'single'; return this; }
  maybeSingle() { this.modoUnico = 'maybeSingle'; return this; }

  filasFiltradas() {
    let filas = db[this.tabla] || [];
    for (const f of this.filtros) filas = aplicarFiltro(filas, f);
    return filas;
  }

  ejecutar() {
    if (!db[this.tabla]) db[this.tabla] = [];
    const tabla = db[this.tabla];
    let afectadas;

    if (this.operacion === 'insert' || this.operacion === 'upsert') {
      const lista = Array.isArray(this.payload) ? this.payload : [this.payload];
      if (this.operacion === 'insert') {
        for (const p of lista) {
          const error = violacionUnica(this.tabla, p);
          if (error) return { data: null, error, count: null };
        }
      }
      const ahora = new Date().toISOString();
      afectadas = lista.map((p) => {
        const pk = PK[this.tabla] || 'id';
        const existente = this.operacion === 'upsert' && p[pk] != null ? tabla.find((r) => r[pk] === p[pk]) : null;
        if (existente) return Object.assign(existente, p, { updated_at: ahora });
        const fila = { id: nuevoId(), created_at: ahora, updated_at: ahora, deleted_at: null, ...p };
        tabla.push(fila);
        alInsertarFilaSolicitudes(db, this.tabla, fila); // triggers de autocompletado (108)
        return fila;
      });
    } else if (this.operacion === 'update') {
      afectadas = this.filasFiltradas();
      for (const fila of afectadas) {
        const error = violacionUnica(this.tabla, { ...fila, ...this.payload }, fila);
        if (error) return { data: null, error, count: null };
      }
      for (const fila of afectadas) {
        const previa = { ...fila };
        Object.assign(fila, this.payload, { updated_at: new Date().toISOString() });
        alActualizarFila(db, this.tabla, previa, fila); // kardex que dejaría el trigger
      }
    } else if (this.operacion === 'delete') {
      const aBorrar = new Set(this.filtros.length ? this.filasFiltradas() : []);
      db[this.tabla] = tabla.filter((f) => !aBorrar.has(f));
      return { data: null, error: null, count: null };
    } else {
      afectadas = this.filasFiltradas();
    }

    // Escritura sin .select(): PostgREST devuelve data null.
    if (this.operacion !== 'select' && this.seleccion === '*' && !this.modoUnico) {
      return { data: null, error: null, count: null };
    }

    const count = this.opcionesSelect.count ? afectadas.length : null;
    if (this.opcionesSelect.head) return { data: null, error: null, count };

    let filas = afectadas;
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.limite != null) filas = filas.slice(0, this.limite);

    const embeds = parsearSelect(this.seleccion);
    const salida = filas.map((f) => resolverEmbeds(this.tabla, clonar(f), embeds));

    if (this.modoUnico === 'single') {
      if (!salida.length) {
        return { data: null, error: { code: 'PGRST116', message: 'not found (maqueta)' }, count };
      }
      return { data: salida[0], error: null, count };
    }
    if (this.modoUnico === 'maybeSingle') return { data: salida[0] ?? null, error: null, count };
    return { data: salida, error: null, count };
  }

  then(resolver, rechazar) {
    let resultado;
    try {
      resultado = this.ejecutar();
    } catch (e) {
      return Promise.reject(e).then(resolver, rechazar);
    }
    return Promise.resolve(resultado).then(resolver, rechazar);
  }

  catch(rechazar) { return this.then(undefined, rechazar); }
  finally(fn) { return this.then((v) => { fn(); return v; }, (e) => { fn(); throw e; }); }
}

// ── Edge functions ──────────────────────────────────────────────────────────
function respuestaFuncion(nombre, body = {}) {
  const accion = body?.action;
  if (accion === 'version') return { ok: true, version: 'maqueta', nombre };
  if (nombre === 'tickets' && accion === 'catalogo') {
    const vivos = (t) => (db[t] || []).filter((r) => !r.deleted_at);
    return { ok: true, categorias: clonar(vivos('categorias_ticket')), subcategorias: clonar(vivos('subcategorias_ticket')) };
  }
  // Seguimiento por token y captura adjunta privada (URL firmada): ./rpc-tickets.js
  if (nombre === 'tickets') {
    const resultado = funcionTickets(db, body);
    if (resultado) return clonar(resultado);
  }
  // Fire-and-forget de auditoría: el llamador lo ignora; responder ok evita ruido.
  if (nombre === 'credenciales' && accion === 'accesoDenegado') return { ok: true };
  // Revelado, cifrado y entrega de cuentas (expediente del empleado): valores
  // INVENTADOS, nunca una contraseña real, para poder recorrer el flujo
  // (barra de 8 s, traspaso con contraseña nueva, enviar accesos).
  if (nombre === 'credenciales' && accion === 'revelar') return { ok: true, password: 'Maqueta-2026-ficticia' };
  if (nombre === 'credenciales' && accion === 'encrypt') return { ok: true, encrypted: 'enc2:bWFxdWV0YQ==:ZmljdGljaWE=' };
  if (nombre === 'credenciales' && accion === 'entregaCrear') {
    const ahora = Date.now();
    db.entregas.push({
      id: nuevoId(), empleado_id: body.empleadoId, created_at: new Date(ahora).toISOString(),
      expires_at: new Date(ahora + 86400000).toISOString(), viewed_at: null, created_by: 'u-jefe',
    });
    return { ok: true, token: `maqueta-${ahora.toString(36)}`, expiresAt: new Date(ahora + 86400000).toISOString() };
  }
  // Fotos y actas firmadas de equipos: simuladas en ./rpc-equipos.js
  if (nombre === 'equipos-fotos') {
    const resultado = funcionEquiposFotos(db, body);
    if (resultado) return clonar(resultado);
  }
  // Todo lo demás (incluido TODO revelado/cifrado de contraseñas) queda
  // deshabilitado en la maqueta.
  return { ok: false, code: 'maqueta' };
}

// ── Realtime: no-op ─────────────────────────────────────────────────────────
const realtime = {
  isConnected: true,
  connect: () => Promise.resolve(),
  disconnect: () => {},
  on: () => {},
  off: () => {},
  once: () => {},
  subscribe: () => Promise.resolve({ ok: true }),
  unsubscribe: () => {},
  publish: () => Promise.resolve({ ok: true }),
};

// ── Storage: no-op ──────────────────────────────────────────────────────────
function bucketFalso() {
  return {
    upload: (key) => Promise.resolve({ data: { key, url: '' }, error: null }),
    uploadAuto: () => Promise.resolve({ data: { key: nuevoId(), url: '' }, error: null }),
    remove: () => Promise.resolve({ data: null, error: null }),
    download: () => Promise.resolve({ data: null, error: null }),
    getPublicUrl: () => '',
  };
}

// ── Auth: JEFE ficticio siempre logueado ────────────────────────────────────
const auth = {
  getCurrentUser: () => Promise.resolve({ data: { user: clonar(USUARIO_MAQUETA) }, error: null }),
  getCurrentSession: () => Promise.resolve({
    data: { session: { accessToken: 'maqueta', user: clonar(USUARIO_MAQUETA) } },
    error: null,
  }),
  signInWithPassword: () => Promise.resolve({
    data: { user: clonar(USUARIO_MAQUETA), accessToken: 'maqueta' },
    error: null,
  }),
  signOut: () => Promise.resolve({ error: null }),
  sendResetPasswordEmail: () => Promise.resolve({ data: {}, error: null }),
  exchangeResetPasswordToken: () => Promise.resolve({ data: { token: 'maqueta' }, error: null }),
  resetPassword: () => Promise.resolve({ data: {}, error: null }),
};

let cliente;

export function getClient() {
  if (!cliente) {
    console.info('[maqueta] Cliente falso activo: datos inventados en memoria, sin backend ni login.');
    cliente = {
      database: {
        from: (tabla) => new ConsultaFalsa(tabla),
        rpc: (nombre, args) => {
          const fn = RPC[nombre];
          try {
            const data = typeof fn === "function" ? fn(db, args) : (fn ?? []);
            return Promise.resolve({ data: clonar(data), error: null });
          } catch (e) {
            // Una RPC de la maqueta puede rechazar como lo haría Postgres:
            // lanza { code, message } y llega al llamador como `error`.
            if (e && e.code && e.message) return Promise.resolve({ data: null, error: e });
            throw e;
          }
        },
      },
      auth,
      realtime,
      functions: {
        invoke: (nombre, opciones = {}) =>
          Promise.resolve({ data: respuestaFuncion(nombre, opciones.body), error: null }),
      },
      storage: { from: () => bucketFalso() },
    };
  }
  return cliente;
}
