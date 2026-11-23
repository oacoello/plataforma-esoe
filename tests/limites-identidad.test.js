'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, como, firmarSesion, otrasLlaves, ENTORNO_CON_SESION } = require('./ayuda');

const ENTORNO = { ...ENTORNO_CON_SESION, RATE_LIMIT_MAX: '3', RATE_LIMIT_PUBLIC_MAX: '3', RATE_LIMIT_WINDOW_MS: '60000' };

test('limites: dos cuentas Clerk de una misma IP conservan cuotas independientes', async () => {
  const app = await levantar(ENTORNO);
  try {
    const cuentas = ['user_limite_uno', 'user_limite_dos'];
    for (let intento = 0; intento < 3; intento += 1) {
      for (const usuario of cuentas) {
        const respuesta = await app.pedir('/api/sesion', { headers: como('ESTUDIANTE', usuario) });
        assert.equal(respuesta.status, 200);
        assert.equal((await respuesta.json()).usuarioId, usuario);
      }
    }
    for (const usuario of cuentas) {
      assert.equal((await app.pedir('/api/sesion', { headers: como('ESTUDIANTE', usuario) })).status, 429);
    }
  } finally { await app.cerrar(); }
});

test('limites: sesiones falsas comparten cuota anonima y no consumen la de cuentas verificadas', async () => {
  const app = await levantar(ENTORNO);
  try {
    for (let intento = 0; intento < 2; intento += 1) {
      const token = firmarSesion({ usuario: `user_falso_${intento}`, rol: 'ADMIN', firmante: otrasLlaves });
      assert.equal((await app.pedir('/api/sesion', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
    assert.equal((await app.pedir('/api/sesion', { headers: { 'X-User-Id': 'otra-cuenta' } })).status, 401);
    assert.equal((await app.pedir('/api/config')).status, 429);
    assert.equal((await app.pedir('/api/sesion', { headers: como('ESTUDIANTE', 'user_valido') })).status, 200);
  } finally { await app.cerrar(); }
});
