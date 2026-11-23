'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { crearBaseDeDatos } = require('../src/db');
const { crearBaseDePrueba, URL_ADMIN } = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };
let base;
let url;
before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  const { rows } = await base.db.consultar('SELECT current_database() AS nombre');
  url = new URL(URL_ADMIN);
  url.pathname = `/${rows[0].nombre}`;
});
after(async () => { await base?.cerrar(); });

test('base de datos: una rafaga respeta el maximo del pool y entrega todos los resultados', sinBase, async () => {
  const db = crearBaseDeDatos(url.toString(), { max: 2, connectionTimeoutMillis: 2000 });
  try {
    const resultados = await Promise.all(Array.from({ length: 24 }, async (_, numero) => {
      const { rows } = await db.consultar('SELECT pg_sleep(0.005), $1::integer AS numero', [numero]);
      assert.ok(db.estado().conexiones <= 2);
      return rows[0].numero;
    }));
    assert.deepEqual(resultados, Array.from({ length: 24 }, (_, i) => i));
    assert.equal(db.estado().enEspera, 0);
  } finally { await db.cerrar(); }
});

test('base de datos: una consulta lenta se cancela y permite consultas posteriores', sinBase, async () => {
  const db = crearBaseDeDatos(url.toString(), { max: 1, statement_timeout: 100 });
  try {
    await assert.rejects(db.consultar('SELECT pg_sleep(0.5)'), { code: '57014' });
    assert.equal((await db.consultar('SELECT 1 AS numero')).rows[0].numero, 1);
  } finally { await db.cerrar(); }
});

test('base de datos: agotar conexiones termina la espera sin retener la transaccion', sinBase, async () => {
  const db = crearBaseDeDatos(url.toString(), { max: 1, connectionTimeoutMillis: 100 });
  let liberar;
  let preparada;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const lista = new Promise((resolve) => { preparada = resolve; });
  const ocupada = db.transaccion(async (consultar) => {
    await consultar('SELECT 1');
    preparada();
    await espera;
  });
  try {
    await lista;
    await assert.rejects(db.consultar('SELECT 2'), /timeout/i);
  } finally {
    liberar();
    await ocupada;
    assert.equal((await db.consultar('SELECT 3 AS numero')).rows[0].numero, 3);
    await db.cerrar();
  }
});
