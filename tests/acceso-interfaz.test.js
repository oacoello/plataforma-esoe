'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { levantar } = require('./ayuda');

test('acceso: sin Clerk no hay formulario simulado, selector de rol ni entrada local', async () => {
  const servidor = await levantar();
  let navegador;
  try {
    navegador = await chromium.launch();
    const pagina = await navegador.newPage({ viewport: { width: 759, height: 678 }, reducedMotion: 'reduce' });
    const errores = [];
    pagina.on('pageerror', (error) => errores.push(error.message));
    await pagina.goto(servidor.base);
    await pagina.getByText('El acceso institucional no está disponible en este sitio.', { exact: false }).waitFor();
    assert.equal(await pagina.locator('#app-shell').isVisible(), false);
    assert.equal(await pagina.locator('input[type=password], #login-demo, #role-quick-switch').count(), 0);
    assert.equal(await pagina.evaluate(() => typeof globalThis.handleLoginSubmit), 'undefined');
    assert.equal(await pagina.getByRole('button', { name: 'Reintentar conexión' }).isVisible(), true);
    assert.deepEqual(errores, []);
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
});

test('ambiente: los controles se ajustan a pantalla y texto sin quedar cubiertos', async () => {
  const servidor = await levantar();
  let navegador;
  try {
    navegador = await chromium.launch();
    for (const viewport of [
      { width: 930, height: 678 }, { width: 759, height: 678 },
      { width: 320, height: 568 }, { width: 390, height: 844 },
      { width: 960, height: 800 }, { width: 961, height: 800 },
      { width: 1024, height: 600 }, { width: 1280, height: 800 }
    ]) {
      const pagina = await navegador.newPage({ viewport, reducedMotion: 'reduce' });
      await pagina.goto(servidor.base);
      await pagina.evaluate(() => globalThis.document.fonts.ready);
      const barra = pagina.getByRole('toolbar', { name: 'Ambiente', exact: true });
      for (const tamano of ['normal', 'grande', 'muy-grande']) {
        await barra.locator(`[data-tamano-texto="${tamano}"]`).click();
        await barra.scrollIntoViewIfNeeded();
        const limites = await barra.boundingBox();
        const contexto = `${viewport.width}x${viewport.height}, ${tamano}`;
        assert.ok(limites.x >= 0 && limites.x + limites.width <= viewport.width + 1, contexto);
        const posicion = await barra.evaluate((elemento) => globalThis.getComputedStyle(elemento).position);
        assert.equal(posicion, 'static', contexto);
        const titulo = await pagina.locator('.titulo-grande').boundingBox();
        assert.ok(limites.y + limites.height <= titulo.y, contexto);
        for (const boton of await barra.locator('button:visible').all()) {
          const caja = await boton.boundingBox();
          assert.ok(caja.x >= limites.x && caja.x + caja.width <= limites.x + limites.width + 1, contexto);
          assert.ok(caja.y >= limites.y && caja.y + caja.height <= limites.y + limites.height + 1, contexto);
          assert.ok(caja.height >= 44, contexto);
          assert.equal(await boton.evaluate((elemento) => {
            const rect = elemento.getBoundingClientRect();
            return elemento.contains(elemento.ownerDocument.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
          }), true, contexto);
        }
      }
      await pagina.close();
    }
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
});

test('identidad visual: las marcas permanecen sobre el campus sin invadir la cabecera', async () => {
  const servidor = await levantar();
  let navegador;
  try {
    navegador = await chromium.launch();
    const noSeCruzan = (a, b) => a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
    for (const width of [320, 759, 960, 1024, 1366]) {
      const pagina = await navegador.newPage({ viewport: { width, height: 678 }, reducedMotion: 'reduce' });
      await pagina.goto(servidor.base);
      await pagina.evaluate(() => globalThis.document.fonts.ready);
      const barra = pagina.getByRole('toolbar', { name: 'Ambiente', exact: true });
      for (const tamano of ['normal', 'muy-grande']) {
        await barra.locator(`[data-tamano-texto="${tamano}"]`).click();
        await pagina.evaluate(() => globalThis.scrollTo(0, 0));
        const cabecera = await pagina.locator('.login-brand-panel').boundingBox();
        const campus = await pagina.locator('.escena').boundingBox();
        assert.ok(noSeCruzan(cabecera, campus), `${width}: cabecera y campus`);
        assert.ok(noSeCruzan(await pagina.locator('.brand-crest').boundingBox(), await pagina.locator('.login-brand-panel .reloj').boundingBox()), `${width}: marca y reloj`);
        assert.equal(await pagina.locator('.brand-title-group .rotulo').isVisible(), true);
        const puntos = pagina.locator('.escena-plano > .escena-puntos > .punto');
        assert.equal(await puntos.count(), 8);
        for (const punto of await puntos.all()) {
          assert.equal(await punto.evaluate((elemento) => globalThis.getComputedStyle(elemento).position), 'absolute');
          assert.equal(await punto.locator('.punto-n').isVisible(), true);
        }
        assert.equal(await pagina.locator('.escena > .escena-puntos').count(), 0);
      }
      await pagina.close();
    }
  } finally {
    await navegador?.close();
    await servidor.cerrar();
  }
});
