'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  levantar, como, crearBaseDePrueba, crearMoodleFalso, ENTORNO_CON_SESION, URL_ADMIN
} = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };
const RUTA = '/api/integraciones';
const CUENTA = { esoe: 'user_aisla_esoe', infop: 'user_aisla_infop', alumno: 'user_aisla_alumno' };
let base;
let app;
let moodle;
let instituciones;
let plataformas;

before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  moodle = await crearMoodleFalso();
  const { rows } = await base.db.consultar('SELECT codigo, id FROM instituciones');
  instituciones = Object.fromEntries(rows.map((r) => [r.codigo, r.id]));
  for (const [usuario, rol, institucion] of [
    [CUENTA.esoe, 'ADMIN', instituciones.ESOE],
    [CUENTA.infop, 'ADMIN', instituciones.INFOP],
    [CUENTA.alumno, 'ESTUDIANTE', instituciones.ESOE]
  ]) {
    await base.db.consultar(
      `INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id)
       VALUES ($1, $1, $2, $1, $3)`, [usuario, rol, institucion]);
  }
  app = await levantar(ENTORNO_CON_SESION, { db: base.db });
  plataformas = {};
  for (const [institucion, usuario] of [['ESOE', CUENTA.esoe], ['INFOP', CUENTA.infop]]) {
    const r = await app.enviar(`${RUTA}/plataformas`, {
      nombre: `Campus ${institucion}`, tipo: 'MOODLE', urlBase: moodle.url
    }, como('ADMIN', usuario));
    assert.equal(r.status, 201, `cada institucion puede registrar el mismo Moodle: ${await r.clone().text()}`);
    plataformas[institucion] = (await r.json()).plataforma.id;
  }
});

after(async () => {
  await app?.cerrar();
  await moodle?.cerrar();
  await base?.cerrar();
});

test('integraciones: cada institucion registra y ve su propio campus aunque comparta URL', sinBase, async () => {
  assert.notEqual(plataformas.ESOE, plataformas.INFOP);
  for (const [institucion, usuario] of [['ESOE', CUENTA.esoe], ['INFOP', CUENTA.infop]]) {
    const lista = await app.pedir(`${RUTA}/plataformas`, { headers: como('ADMIN', usuario) });
    assert.equal(lista.status, 200);
    assert.deepEqual((await lista.json()).plataformas.map((p) => p.id), [plataformas[institucion]]);
    const duplicada = await app.enviar(`${RUTA}/plataformas`, {
      nombre: 'Duplicada', tipo: 'MOODLE', urlBase: moodle.url
    }, como('ADMIN', usuario));
    assert.equal(duplicada.status, 409);
  }
  const { rows } = await base.db.consultar('SELECT id, institucion_id FROM plataformas_externas');
  for (const fila of rows) {
    const institucion = Object.keys(plataformas).find((codigo) => plataformas[codigo] === fila.id);
    assert.equal(fila.institucion_id, instituciones[institucion]);
  }
});

test('integraciones: probar, vincular, desvincular y borrar una plataforma ajena devuelve 404 sin tocar Moodle', sinBase, async () => {
  const propias = como('ESTUDIANTE', CUENTA.alumno);
  const vinculacion = await app.enviar(`${RUTA}/plataformas/${plataformas.ESOE}/cuenta`, {
    usuario: 'alumno.prueba', clave: moodle.estado.usuarios['alumno.prueba'].clave
  }, propias);
  assert.equal(vinculacion.status, 201);
  const peticionesAntes = moodle.estado.peticiones.length;
  const ajeno = como('ADMIN', CUENTA.infop);
  for (const [metodo, sufijo, cuerpo] of [
    ['POST', '/probar', {}],
    ['POST', '/cuenta', { usuario: 'alumno.prueba', clave: moodle.estado.usuarios['alumno.prueba'].clave }],
    ['DELETE', '/cuenta', undefined],
    ['DELETE', '', undefined]
  ]) {
    const r = await app.enviar(`${RUTA}/plataformas/${plataformas.ESOE}${sufijo}`, cuerpo, ajeno, metodo);
    assert.equal(r.status, 404, `${metodo} ${sufijo}`);
    assert.equal((await r.json()).error, 'Plataforma no encontrada.');
  }
  assert.equal(moodle.estado.peticiones.length, peticionesAntes);
  const { rows: [cuentas] } = await base.db.consultar(
    'SELECT count(*)::int AS n FROM cuentas_externas WHERE plataforma_id = $1', [plataformas.ESOE]);
  assert.equal(cuentas.n, 1, 'el borrado cruzado no elimina la plataforma ni sus cuentas');
  const r = await app.enviar(`${RUTA}/plataformas/${plataformas.ESOE}/probar`, {}, como('ADMIN', CUENTA.esoe));
  assert.equal(r.status, 200);
});

test('integraciones: cambiar de institucion oculta los cursos vinculados anteriormente sin consultar Moodle', sinBase, async () => {
  await base.db.consultar('UPDATE usuarios SET institucion_id = $1 WHERE proveedor_id = $2',
    [instituciones.INFOP, CUENTA.alumno]);
  try {
    const peticionesAntes = moodle.estado.peticiones.length;
    const r = await app.pedir(`${RUTA}/mis-cursos`, { headers: como('ESTUDIANTE', CUENTA.alumno) });
    assert.equal(r.status, 200);
    assert.deepEqual((await r.json()).plataformas, []);
    assert.equal(moodle.estado.peticiones.length, peticionesAntes);
  } finally {
    await base.db.consultar('UPDATE usuarios SET institucion_id = $1 WHERE proveedor_id = $2',
      [instituciones.ESOE, CUENTA.alumno]);
  }
});

test('integraciones: una cuenta desactivada o sin expediente no accede al modulo', sinBase, async () => {
  await base.db.consultar('UPDATE usuarios SET activo = false WHERE proveedor_id = $1', [CUENTA.esoe]);
  try {
    const peticionesAntes = moodle.estado.peticiones.length;
    for (const [metodo, ruta] of [
      ['GET', '/catalogo'], ['GET', '/plataformas'], ['GET', '/mis-cursos'],
      ['POST', '/plataformas'], ['POST', `/plataformas/${plataformas.ESOE}/probar`],
      ['POST', `/plataformas/${plataformas.ESOE}/cuenta`],
      ['DELETE', `/plataformas/${plataformas.ESOE}/cuenta`], ['DELETE', `/plataformas/${plataformas.ESOE}`]
    ]) {
      const r = await app.enviar(RUTA + ruta, metodo === 'GET' ? undefined : {}, como('ADMIN', CUENTA.esoe), metodo);
      assert.equal(r.status, 403, `${metodo} ${ruta}`);
      assert.equal((await r.json()).codigo, 'CUENTA_INACTIVA');
    }
    const sinExpediente = await app.pedir(`${RUTA}/plataformas`, { headers: como('ADMIN', 'user_sin_expediente') });
    assert.equal(sinExpediente.status, 403);
    assert.equal((await sinExpediente.json()).codigo, 'SIN_EXPEDIENTE');
    assert.equal(moodle.estado.peticiones.length, peticionesAntes);
  } finally {
    await base.db.consultar('UPDATE usuarios SET activo = true WHERE proveedor_id = $1', [CUENTA.esoe]);
  }
});
