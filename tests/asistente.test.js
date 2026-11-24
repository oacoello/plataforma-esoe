'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { levantar } = require('./ayuda');

test('asistente: orienta por institucion, no inicia voz automaticamente y se cierra con Escape', async () => {
  const servidor = await levantar();
  let navegador;
  try {
    navegador = await chromium.launch();
    const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errores = [];
    pagina.on('pageerror', (error) => errores.push(error.message));
    await pagina.goto(servidor.base);
    const saltar = pagina.getByRole('button', { name: /Saltar intro/ });
    if (await saltar.isVisible()) await saltar.click();
    await pagina.getByRole('button', { name: 'Asistente ESOE', exact: true }).click();
    const panel = pagina.locator('#asistente-panel');
    assert.equal(await panel.isVisible(), true);
    await panel.getByRole('button', { name: 'Calificaciones', exact: true }).click();
    assert.match(await pagina.locator('#asistente-respuesta').textContent(), /Primero seleccione/);
    for (const institucion of ['ESOE', 'UDH', 'INFOP', 'COPECO']) {
      await pagina.getByLabel('Institución', { exact: true }).selectOption(institucion);
      await panel.getByRole('button', { name: 'Calificaciones', exact: true }).click();
      const respuesta = await pagina.locator('#asistente-respuesta').textContent();
      assert.ok(respuesta.startsWith(`${institucion}:`));
      assert.match(respuesta, /Boletín y Expediente/);
    }
    const limites = await panel.boundingBox();
    assert.ok(limites.x >= 0 && limites.x + limites.width <= 390);
    assert.equal(await pagina.evaluate(() => globalThis.speechSynthesis.speaking), false);
    await pagina.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), false);
    assert.equal(await pagina.getByRole('button', { name: 'Asistente ESOE', exact: true }).getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errores, []);
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
});

test('asistente: cancelar una lectura anterior no oculta el control de la nueva ni muestra un fallo', async () => {
  const servidor = await levantar();
  let navegador;
  try {
    navegador = await chromium.launch();
    const pagina = await navegador.newPage({ reducedMotion: 'reduce' });
    await pagina.addInitScript(() => {
      let activa = null;
      Object.defineProperty(globalThis, 'speechSynthesis', {
        value: {
          getVoices: () => [],
          cancel() {
            const anterior = activa;
            activa = null;
            if (anterior) setTimeout(() => anterior.onerror?.({ error: 'canceled' }), 0);
          },
          speak(lectura) { activa = lectura; },
          get speaking() { return activa !== null; }
        }
      });
      globalThis.SpeechSynthesisUtterance = class {
        constructor(texto) { this.text = texto; }
      };
    });
    await pagina.goto(servidor.base);
    const saltar = pagina.getByRole('button', { name: /Saltar intro/ });
    if (await saltar.isVisible()) await saltar.click();
    await pagina.getByRole('button', { name: 'Asistente ESOE', exact: true }).click();
    const escuchar = pagina.getByRole('button', { name: 'Escuchar respuesta', exact: true });
    await escuchar.click();
    await escuchar.click();
    await pagina.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
    assert.equal(await pagina.evaluate(() => globalThis.speechSynthesis.speaking), true);
    const detener = pagina.getByRole('button', { name: 'Detener voz', exact: true });
    assert.equal(await detener.isVisible(), true);
    assert.doesNotMatch(await pagina.locator('.asistente-nota').textContent(), /No se pudo/);
    await detener.click();
    await pagina.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    assert.equal(await pagina.evaluate(() => globalThis.speechSynthesis.speaking), false);
    assert.equal(await detener.isVisible(), false);
    assert.doesNotMatch(await pagina.locator('.asistente-nota').textContent(), /No se pudo/);
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
});
