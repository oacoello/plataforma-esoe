'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, ENTORNO_CON_SESION } = require('./ayuda');
const { PLATAFORMAS_CONOCIDAS } = require('../src/integraciones/catalogo');

test('catalogo: cada portal indica la institucion a la que pertenece', () => {
  const instituciones = new Set(['ESOE', 'UDH', 'INFOP', 'COPECO']);
  for (const p of PLATAFORMAS_CONOCIDAS) {
    assert.ok(instituciones.has(p.institucion), `${p.clave} sin institucion valida`);
    assert.match(p.urlBase, /^https:\/\/[a-z0-9.-]+$/);
  }
});

test('estado de portales: es publico, cubre todo el catalogo y solo devuelve indicadores', async () => {
  const servidor = await levantar(ENTORNO_CON_SESION);
  try {
    const r = await servidor.pedir('/api/integraciones/estado');
    assert.equal(r.status, 200);
    const cuerpo = await r.json();
    assert.deepEqual(cuerpo.portales.map((p) => p.clave).sort(), PLATAFORMAS_CONOCIDAS.map((p) => p.clave).sort());
    for (const p of cuerpo.portales) {
      assert.deepEqual(Object.keys(p).sort(), ['clave', 'enLinea', 'enMantenimiento', 'institucion', 'serviciosWeb']);
      assert.equal(typeof p.enLinea, 'boolean');
    }
    assert.ok(!Number.isNaN(Date.parse(cuerpo.revisado)));
    const segunda = await (await servidor.pedir('/api/integraciones/estado')).json();
    assert.equal(segunda.revisado, cuerpo.revisado, 'la segunda consulta sale de la cache');
  } finally {
    await servidor.cerrar();
  }
});
