// node --test scripts/migrar-adjuntos.test.mjs
// Plan y ejecución de scripts/migrar-adjuntos.mjs con operaciones inyectadas:
// no toca red, CLI ni base.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearArgumentos,
  extensionDeKey,
  keyNueva,
  planificar,
  formatearPlan,
  migrarItem,
  migrarPlan,
  principal,
  BUCKET,
} from './migrar-adjuntos.mjs';

// Tokens de ejemplo (24 caracteres base64url, como los reales): NUNCA deben salir impresos.
const TOKEN_A = 'AAAAAAAAAAAAAAAAAAAAAAAA';
const TOKEN_B = 'BBBBBBBBBBBBBBBBBBBBBBBB';
const TOKEN_C = 'CCCCCCCCCCCCCCCCCCCCCCCC';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';
const ID_D = '44444444-4444-4444-8444-444444444444';

const tickets = [
  { id: ID_A, codigo: 'TCK-0001', adjunto_key: `${TOKEN_A}/captura.jpg` },
  { id: ID_B, codigo: 'TCK-0002', adjunto_key: `tickets/${ID_B}/captura.png` }, // ya migrado
  { id: ID_C, codigo: 'TCK-0003', adjunto_key: `${TOKEN_C}/captura.webp` }, // objeto ausente
  { id: ID_D, codigo: 'TCK-0004', adjunto_key: `${TOKEN_B}/captura.exe` }, // extensión rara
];
const objetos = [
  { key: `${TOKEN_A}/captura.jpg` },
  { key: `tickets/${ID_B}/captura.png` },
  { key: `${TOKEN_B}/captura.exe` },
  { key: `ZZZZZZZZZZZZZZZZZZZZZZZZ/captura.jpg` }, // huérfano: ningún ticket lo referencia
];

test('parsearArgumentos: dry-run por defecto; --ejecutar y --limite explícitos', () => {
  assert.deepEqual(parsearArgumentos([]), { ejecutar: false, limite: null, ayuda: false });
  assert.deepEqual(parsearArgumentos(['--ejecutar', '--limite', '3']), { ejecutar: true, limite: 3, ayuda: false });
  assert.equal(parsearArgumentos(['--ayuda']).ayuda, true);
  assert.throws(() => parsearArgumentos(['--limite']), /entero/);
  assert.throws(() => parsearArgumentos(['--limite', '0']), /entero/);
  assert.throws(() => parsearArgumentos(['--borrar-todo']), /desconocido/);
});

test('extensionDeKey y keyNueva', () => {
  assert.equal(extensionDeKey('x/captura.JPG'), 'jpg');
  assert.equal(extensionDeKey('x/captura.jpeg'), 'jpg');
  assert.equal(extensionDeKey('x/captura.webp'), 'webp');
  assert.equal(extensionDeKey('x/captura.exe'), null);
  assert.equal(extensionDeKey('sin-extension'), null);
  assert.equal(keyNueva(ID_A, 'png'), `tickets/${ID_A}/captura.png`);
});

test('planificar: mover / ya migrado / ausente / extensión inválida y cuenta huérfanos', () => {
  const plan = planificar(tickets, objetos);
  const por = Object.fromEntries(plan.items.map((i) => [i.codigo, i]));
  assert.deepEqual(por['TCK-0001'], {
    ticketId: ID_A, codigo: 'TCK-0001', accion: 'mover',
    origen: `${TOKEN_A}/captura.jpg`, destino: `tickets/${ID_A}/captura.jpg`, extension: 'jpg',
  });
  assert.equal(por['TCK-0002'].accion, 'ya_migrado');
  assert.equal(por['TCK-0003'].accion, 'objeto_ausente');
  assert.equal(por['TCK-0004'].accion, 'extension_invalida');
  assert.equal(plan.huerfanos, 1);
  assert.deepEqual(plan.totales, { mover: 1, ya_migrado: 1, objeto_ausente: 1, extension_invalida: 1 });
});

test('planificar: un destino ocupado por otro objeto no se pisa', () => {
  const plan = planificar(
    [{ id: ID_A, codigo: 'TCK-0001', adjunto_key: `${TOKEN_A}/captura.jpg` }],
    [{ key: `${TOKEN_A}/captura.jpg` }, { key: `tickets/${ID_A}/captura.jpg` }],
  );
  assert.equal(plan.items[0].accion, 'key_ocupada');
});

test('planificar: sin tickets con adjunto no hay nada que hacer', () => {
  const plan = planificar([], [{ key: 'x/captura.jpg' }]);
  assert.deepEqual(plan.items, []);
  assert.match(formatearPlan(plan), /sin tickets con adjunto/);
});

test('formatearPlan NO imprime tokens ni keys antiguas ni destinos', () => {
  const texto = formatearPlan(planificar(tickets, objetos));
  for (const secreto of [TOKEN_A, TOKEN_B, TOKEN_C, 'ZZZZZZZZZZZZZZZZZZZZZZZZ', 'captura.jpg', 'captura.webp', 'captura.exe']) {
    assert.ok(!texto.includes(secreto), `la salida no debe incluir ${secreto}`);
  }
  assert.match(texto, /TCK-0001/);
  assert.match(texto, /huérfanos/);
});

// ── ejecución ─────────────────────────────────────────────────────────────
function opsFalsas({ fallaEn = null, tamanoCopia = null } = {}) {
  const llamadas = [];
  const blob = new Blob([new Uint8Array(100)]);
  return {
    llamadas,
    async descargar(key) {
      llamadas.push(['descargar', key]);
      if (fallaEn === 'descargar') return null;
      if (key.startsWith('tickets/') && tamanoCopia !== null) return new Blob([new Uint8Array(tamanoCopia)]);
      return blob;
    },
    async subir(key, b, mime) {
      llamadas.push(['subir', key, mime]);
      return fallaEn !== 'subir';
    },
    async actualizarTicket(id, vieja, nueva) {
      llamadas.push(['actualizar', id, vieja, nueva]);
      return fallaEn !== 'actualizar';
    },
    async borrar(key) {
      llamadas.push(['borrar', key]);
      return fallaEn !== 'borrar';
    },
  };
}
const itemMover = planificar(tickets, objetos).items.find((i) => i.accion === 'mover');

test('migrarItem: copia, verifica, actualiza el ticket y SOLO al final borra el objeto viejo', async () => {
  const ops = opsFalsas();
  assert.deepEqual(await migrarItem(itemMover, ops), { estado: 'migrado' });
  assert.deepEqual(ops.llamadas.map((l) => l[0]), ['descargar', 'subir', 'descargar', 'actualizar', 'borrar']);
  assert.deepEqual(ops.llamadas[1], ['subir', `tickets/${ID_A}/captura.jpg`, 'image/jpeg']);
  assert.deepEqual(ops.llamadas[3], ['actualizar', ID_A, `${TOKEN_A}/captura.jpg`, `tickets/${ID_A}/captura.jpg`]);
  assert.deepEqual(ops.llamadas[4], ['borrar', `${TOKEN_A}/captura.jpg`]);
});

test('migrarItem: si falla descargar, subir, verificar o actualizar, el objeto viejo NO se borra', async () => {
  for (const etapa of ['descargar', 'subir', 'actualizar']) {
    const ops = opsFalsas({ fallaEn: etapa });
    assert.deepEqual(await migrarItem(itemMover, ops), { estado: 'error', etapa });
    assert.ok(!ops.llamadas.some((l) => l[0] === 'borrar'), `no debe borrar si falla ${etapa}`);
  }
  const ops = opsFalsas({ tamanoCopia: 99 }); // la copia no coincide en tamaño
  assert.deepEqual(await migrarItem(itemMover, ops), { estado: 'error', etapa: 'verificar' });
  assert.ok(!ops.llamadas.some((l) => l[0] === 'actualizar' || l[0] === 'borrar'));
});

test('migrarItem: si solo falla borrar, el ticket ya apunta a la key nueva (migrado_con_resto)', async () => {
  const ops = opsFalsas({ fallaEn: 'borrar' });
  assert.deepEqual(await migrarItem(itemMover, ops), { estado: 'migrado_con_resto', etapa: 'borrar' });
});

test('migrarItem: una excepción en cualquier paso se informa como error de esa etapa, sin propagarse', async () => {
  const ops = opsFalsas();
  ops.subir = async () => {
    throw new Error(`boom con ${TOKEN_A}`);
  };
  assert.deepEqual(await migrarItem(itemMover, ops), { estado: 'error', etapa: 'subir' });
});

test('migrarPlan: respeta --limite y su salida solo trae código y estado', async () => {
  const dos = [
    { id: ID_A, codigo: 'TCK-0001', adjunto_key: `${TOKEN_A}/captura.jpg` },
    { id: ID_C, codigo: 'TCK-0003', adjunto_key: `${TOKEN_C}/captura.jpg` },
  ];
  const plan = planificar(dos, [{ key: `${TOKEN_A}/captura.jpg` }, { key: `${TOKEN_C}/captura.jpg` }]);
  const lineas = [];
  const r = await migrarPlan(plan, opsFalsas(), { limite: 1, log: (l) => lineas.push(l) });
  assert.deepEqual(r, { migrado: 1, migrado_con_resto: 0, error: 0, omitidos: 1 });
  assert.equal(lineas.length, 1);
  assert.ok(!lineas[0].includes(TOKEN_A));
});

// ── programa principal ────────────────────────────────────────────────────
function transporteFalso({ publico = true } = {}) {
  const sqls = [];
  return {
    sqls,
    async consultarSql(sql) {
      sqls.push(sql);
      if (sql.includes('from public.tickets')) return tickets;
      if (sql.includes('from storage.objects')) return objetos;
      if (sql.includes('from storage.buckets')) return [{ public: publico }];
      throw new Error('consulta inesperada');
    },
  };
}

test('principal: SIN --ejecutar es un dry-run de solo SELECT, no usa las operaciones reales y no imprime secretos', async () => {
  const transporte = transporteFalso();
  const salida = [];
  let opsPedidas = false;
  const codigo = await principal([], {
    transporte,
    ops: new Proxy({}, { get() { opsPedidas = true; throw new Error('el dry-run no debe tocar ops'); } }),
    out: (t) => salida.push(t),
    err: (t) => salida.push(t),
  });
  assert.equal(codigo, 0);
  assert.equal(opsPedidas, false);
  assert.ok(transporte.sqls.every((s) => /^select /i.test(s)), 'solo SELECT');
  assert.ok(transporte.sqls.every((s) => !/[\r\n"%]|\$\$/.test(s)), 'SQL apto para el CLI (una línea, sin comillas dobles, % ni $$)');
  const texto = salida.join('\n');
  assert.match(texto, /DRY-RUN: no se cambió nada/);
  assert.match(texto, /PUBLICO/);
  for (const secreto of [TOKEN_A, TOKEN_B, TOKEN_C]) assert.ok(!texto.includes(secreto));
  assert.ok(texto.includes(BUCKET));
});

test('principal: con --ejecutar mueve, informa el paso manual del bucket y sale 0; con un error sale 1', async () => {
  const salida = [];
  const ops = opsFalsas();
  assert.equal(await principal(['--ejecutar'], { transporte: transporteFalso(), ops, out: (t) => salida.push(t), err: (t) => salida.push(t) }), 0);
  const texto = salida.join('\n');
  assert.match(texto, /Migrados=1/);
  assert.match(texto, /volver PRIVADO el bucket/);
  for (const secreto of [TOKEN_A, TOKEN_B, TOKEN_C]) assert.ok(!texto.includes(secreto));

  assert.equal(
    await principal(['--ejecutar'], { transporte: transporteFalso({ publico: false }), ops: opsFalsas({ fallaEn: 'subir' }), out: () => {}, err: () => {} }),
    1,
  );
});

test('principal: errores de uso (64) y de conexión (2)', async () => {
  assert.equal(await principal(['--nada'], { out: () => {}, err: () => {} }), 64);
  const roto = { async consultarSql() { throw new Error('sin conexión'); } };
  assert.equal(await principal([], { transporte: roto, out: () => {}, err: () => {} }), 2);
});

test('principal: --ejecutar sin variables de entorno devuelve 64 antes de tocar nada', async () => {
  const salida = [];
  const antes = { a: process.env.INSFORGE_PROJECT_URL, b: process.env.INSFORGE_BASE_URL, c: process.env.INSFORGE_API_KEY, d: process.env.API_KEY };
  for (const k of ['INSFORGE_PROJECT_URL', 'INSFORGE_BASE_URL', 'INSFORGE_API_KEY', 'API_KEY']) delete process.env[k];
  try {
    const codigo = await principal(['--ejecutar'], { transporte: transporteFalso(), out: (t) => salida.push(t), err: (t) => salida.push(t) });
    assert.equal(codigo, 64);
    assert.match(salida.join('\n'), /Faltan INSFORGE_PROJECT_URL/);
  } finally {
    if (antes.a !== undefined) process.env.INSFORGE_PROJECT_URL = antes.a;
    if (antes.b !== undefined) process.env.INSFORGE_BASE_URL = antes.b;
    if (antes.c !== undefined) process.env.INSFORGE_API_KEY = antes.c;
    if (antes.d !== undefined) process.env.API_KEY = antes.d;
  }
});
