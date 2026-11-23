'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('interfaz: acota la carga a cuatro peticiones, conserva orden y muestra errores parciales', async () => {
  let activas = 0;
  let maximas = 0;
  const contexto = vm.createContext({
    api: async (ruta) => {
      activas += 1;
      maximas = Math.max(maximas, activas);
      try {
        await new Promise((resolve) => setTimeout(resolve, ruta === 'lenta' ? 15 : 2));
        if (ruta === 'sin-expediente') throw Object.assign(new Error('Sin expediente'), { codigo: 'SIN_EXPEDIENTE' });
        return ruta;
      } finally { activas -= 1; }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/servidor.js'), 'utf8'), contexto);
  const rutas = ['lenta', 'b', 'sin-expediente', 'd', 'e', 'f', 'g', 'h', 'i'];
  const resultado = await contexto.pedirVarias(rutas);
  assert.equal(maximas, 4);
  assert.deepEqual(Array.from(resultado), rutas.map((ruta) => ruta === 'sin-expediente' ? null : ruta));
  assert.match(vm.runInContext('datosServidor.aviso', contexto), /no está ligada a un expediente/);
  assert.deepEqual(Array.from(await contexto.pedirVarias([])), []);
});
