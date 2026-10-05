// SDK falso y programable para probar el HANDLER completo de las edge
// functions (functions/*.ts) sin red ni BD — Ciclo 20, revisión integral v2.
//
// A diferencia de tests/stubs/insforge-sdk.js (que falla fuerte si alguien lo
// llama, para los tests de helpers puros), este se activa por archivo con:
//
//   vi.mock('./stubs/insforge-sdk.js', () => import('./stubs/sdk-falso.js'));
//
// Cada consulta encadenada (`from(t).select().eq().is()...`) se registra en
// `sdk.consultas` al resolverse, y su resultado lo decide `sdk.responder(q)`,
// que cada test programa. `q` tiene: tabla, op ('select'|'insert'|'update'|
// 'delete'|'rpc'), cols, payload, filtros ([tipo, columna, valor]). En una
// RPC (`database.rpc(nombre, args)`) `tabla` es el nombre de la función y
// `payload` sus argumentos (ej. { p_user, p_permiso } de `puede`).
//
// `sdk.errorUsuario` simula que `auth.getCurrentUser()` FALLA (ej.
// { message: 'x', statusCode: 500 }); con `sdk.usuario = null` y sin error se
// simula un token anónimo/inválido (sin usuario).
//
// Storage (opcional, aditivo): cada llamada a `storage.from(bucket).<op>()` se
// registra en `sdk.almacenamiento` ({ op, bucket, key, ... }) y, si el test
// definió `sdk.storage.<op>` (upload, remove, createSignedUrl), responde lo que
// éste devuelva; si no, los valores por defecto de siempre (upload falla,
// remove y createSignedUrl devuelven error nulo/'no disponible').
export const sdk = {
  consultas: [],
  usuario: null,
  errorUsuario: null,
  responder: () => ({ data: null, error: null }),
  almacenamiento: [],
  storage: {},
};

export function reiniciarSdk() {
  sdk.consultas = [];
  sdk.usuario = null;
  sdk.errorUsuario = null;
  sdk.responder = () => ({ data: null, error: null });
  sdk.almacenamiento = [];
  sdk.storage = {};
}

// ¿La consulta tiene este filtro? (ej. tieneFiltro(q, 'is', 'deleted_at', null))
export function tieneFiltro(q, tipo, columna, valor) {
  return q.filtros.some(
    ([t, c, v]) => t === tipo && c === columna && (valor === undefined || JSON.stringify(v) === JSON.stringify(valor)),
  );
}

export function consultasDe(tabla, op) {
  return sdk.consultas.filter((q) => q.tabla === tabla && (op === undefined || q.op === op));
}

function crearConsulta(tabla) {
  const q = { tabla, op: 'select', cols: null, payload: null, filtros: [] };
  const b = {
    select(cols) {
      if (q.op === 'select') q.cols = cols;
      return b;
    },
    insert(filas) {
      q.op = 'insert';
      q.payload = filas;
      return b;
    },
    update(valores) {
      q.op = 'update';
      q.payload = valores;
      return b;
    },
    delete() {
      q.op = 'delete';
      return b;
    },
    eq(c, v) {
      q.filtros.push(['eq', c, v]);
      return b;
    },
    is(c, v) {
      q.filtros.push(['is', c, v]);
      return b;
    },
    in(c, v) {
      q.filtros.push(['in', c, v]);
      return b;
    },
    gte(c, v) {
      q.filtros.push(['gte', c, v]);
      return b;
    },
    order() {
      return b;
    },
    limit() {
      return b;
    },
    maybeSingle() {
      return b;
    },
    single() {
      return b;
    },
    then(resolver, rechazar) {
      sdk.consultas.push(q);
      return Promise.resolve()
        .then(() => sdk.responder(q))
        .then((r) => r ?? { data: null, error: null })
        .then(resolver, rechazar);
    },
  };
  return b;
}

export function createAdminClient() {
  return {
    database: {
      from: (tabla) => crearConsulta(tabla),
      rpc: (nombre, args = null) => {
        const q = { tabla: nombre, op: 'rpc', cols: null, payload: args, filtros: [] };
        sdk.consultas.push(q);
        return Promise.resolve(sdk.responder(q) ?? { data: null, error: null });
      },
    },
    storage: {
      from: (bucket) => ({
        upload: async (key, blob) => {
          sdk.almacenamiento.push({ op: 'upload', bucket, key, blob });
          if (sdk.storage.upload) return sdk.storage.upload({ bucket, key, blob });
          return { data: null, error: { message: 'storage no disponible en tests' } };
        },
        remove: async (key) => {
          sdk.almacenamiento.push({ op: 'remove', bucket, key });
          if (sdk.storage.remove) return sdk.storage.remove({ bucket, key });
          return { error: null };
        },
        createSignedUrl: async (key, expiresIn) => {
          sdk.almacenamiento.push({ op: 'createSignedUrl', bucket, key, expiresIn });
          if (sdk.storage.createSignedUrl) return sdk.storage.createSignedUrl({ bucket, key, expiresIn });
          return { data: null, error: { message: 'storage no disponible en tests' } };
        },
      }),
    },
  };
}

export function createClient() {
  return {
    auth: {
      getCurrentUser: async () => ({
        data: { user: sdk.errorUsuario ? null : sdk.usuario },
        error: sdk.errorUsuario,
      }),
    },
  };
}
