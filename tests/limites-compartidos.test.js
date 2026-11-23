'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AlmacenLimitesPostgres } = require('../src/limites');
const { crearBaseDePrueba, levantar, como, ENTORNO_CON_SESION, URL_ADMIN } = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };

test('limites compartidos: incrementos atomicos entre instancias y ventanas independientes', sinBase, async () => {
  const base = await crearBaseDePrueba();
  try {
    const uno = new AlmacenLimitesPostgres(base.db, 'atomicidad');
    const dos = new AlmacenLimitesPostgres(base.db, 'atomicidad');
    const otro = new AlmacenLimitesPostgres(base.db, 'otro');
    for (const almacen of [uno, dos, otro]) almacen.init({ windowMs: 60000 });
    const resultados = await Promise.all(Array.from({ length: 40 }, (_, n) => (n % 2 ? uno : dos).increment('misma-cuenta')));
    assert.deepEqual(resultados.map((r) => r.totalHits).sort((a, b) => a - b), Array.from({ length: 40 }, (_, n) => n + 1));
    assert.equal(new Set(resultados.map((r) => r.resetTime.getTime())).size, 1);
    assert.equal((await otro.increment('misma-cuenta')).totalHits, 1);
    await base.db.consultar("UPDATE limites_peticion SET vence_en=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE clave=$1", ['esoe:atomicidad:misma-cuenta']);
    assert.equal((await dos.increment('misma-cuenta')).totalHits, 1);
    await uno.decrement('misma-cuenta');
    await uno.decrement('misma-cuenta');
    assert.equal((await dos.increment('misma-cuenta')).totalHits, 1);
    await uno.resetKey('misma-cuenta');
    assert.equal((await dos.increment('misma-cuenta')).totalHits, 1);
  } finally { await base.cerrar(); }
});

test('limites compartidos: dos servidores conservan la misma cuota verificada por Clerk', sinBase, async () => {
  const base = await crearBaseDePrueba();
  const servidores = [];
  try {
    const entorno = { ...ENTORNO_CON_SESION, RATE_LIMIT_STORE: 'postgres', RATE_LIMIT_MAX: '3' };
    servidores.push(await levantar(entorno, { db: base.db }), await levantar(entorno, { db: base.db }));
    const cabeceras = como('ESTUDIANTE', 'user_limite_compartido');
    for (let n = 0; n < 3; n += 1) {
      assert.equal((await servidores[n % 2].pedir('/api/sesion', { headers: cabeceras })).status, 200);
    }
    assert.equal((await servidores[1].pedir('/api/sesion', { headers: cabeceras })).status, 429);
    assert.equal((await servidores[0].pedir('/api/sesion', { headers: como('ESTUDIANTE', 'user_otro_limite') })).status, 200);
  } finally {
    await Promise.all(servidores.map((servidor) => servidor.cerrar()));
    await base.cerrar();
  }
});

test('operacion: disponibilidad comprueba PostgreSQL y el proceso permanece vivo al perderlo', sinBase, async () => {
  const base = await crearBaseDePrueba();
  const app = await levantar({ RATE_LIMIT_STORE: 'postgres' }, { db: base.db });
  try {
    assert.equal((await app.pedir('/api/live')).status, 200);
    assert.equal((await app.pedir('/api/ready')).status, 200);
    await base.db.cerrar();
    assert.equal((await app.pedir('/api/ready')).status, 503);
    const bloqueada = await app.pedir('/api/config');
    assert.equal(bloqueada.status, 503);
    assert.equal(bloqueada.headers.get('retry-after'), '5');
    assert.equal((await app.pedir('/api/live')).status, 200);
  } finally {
    await app.cerrar();
    await base.cerrar();
  }
});
