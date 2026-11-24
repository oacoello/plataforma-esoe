'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, como, crearBaseDePrueba, crearMoodleFalso, ENTORNO_CON_SESION, URL_ADMIN } = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };
const RUTA = '/api/integraciones';

const CORREOS = {
  user_det_admin: 'admin@esoe.example',
  user_det_correo: 'ALUMNO@institucion.example',
  user_det_otro: 'nadie@institucion.example',
  user_det_repetido: 'repetido@institucion.example',
  user_det_dni: ''
};

let base;
let app;
let moodle;
let plataformaId;

const json = async (r) => ({ status: r.status, cuerpo: r.status === 204 ? null : await r.json() });
const estadoDe = async (usuario, rol = 'ESTUDIANTE', consulta = '') => {
  const r = await json(await app.pedir(`${RUTA}/mis-plataformas${consulta}`, { headers: como(rol, usuario) }));
  assert.equal(r.status, 200, JSON.stringify(r.cuerpo));
  return r.cuerpo.plataformas.find((p) => p.id === plataformaId);
};

before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  moodle = await crearMoodleFalso();
  app = await levantar(ENTORNO_CON_SESION, {
    db: base.db,
    correoVerificado: async (usuarioId) => CORREOS[usuarioId] || ''
  });
  const { rows } = await base.db.consultar("SELECT id FROM instituciones WHERE codigo = 'ESOE'");
  const esoe = rows[0].id;
  for (const [usuario, rol] of [['user_det_admin', 'ADMIN'], ['user_det_correo', 'ESTUDIANTE'], ['user_det_otro', 'ESTUDIANTE'], ['user_det_repetido', 'ESTUDIANTE']]) {
    await base.db.consultar(
      'INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id) VALUES ($1, $1, $2, $1, $3)',
      [usuario, rol, esoe]);
  }
  const admin = como('ADMIN', 'user_det_admin');
  const promocion = (await json(await app.enviar('/api/promociones', { codigo: 'DET-P', nombre: 'Promocion', anio_ingreso: 2026, anio_egreso: 2027 }, admin))).cuerpo.promocion;
  const estudiante = (await json(await app.enviar('/api/estudiantes', { codigo_alumno: 'DET-1', dni: '0801199900001', nombres: 'Por', apellidos: 'Identidad',
    fecha_nacimiento: '2004-05-05', promocion_id: promocion.id }, admin))).cuerpo.estudiante;
  await base.db.consultar(
    "INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id, referencia_id) VALUES ('user_det_dni', 'user_det_dni', 'ESTUDIANTE', 'Dni', $1, $2)",
    [esoe, estudiante.id]);
  const registrada = await json(await app.enviar(`${RUTA}/plataformas`, { nombre: 'Campus de prueba', tipo: 'MOODLE', urlBase: moodle.url }, admin));
  assert.equal(registrada.status, 201, JSON.stringify(registrada.cuerpo));
  plataformaId = registrada.cuerpo.plataforma.id;
});

after(async () => {
  await app?.cerrar();
  await moodle?.cerrar();
  await base?.cerrar();
});

test('deteccion: sin permiso de la institucion la plataforma lo dice y no consulta nada', sinBase, async () => {
  const antes = moodle.estado.peticiones.length;
  assert.equal((await estadoDe('user_det_correo')).estado, 'SIN_PERMISO');
  assert.equal(moodle.estado.peticiones.length, antes);
});

test('deteccion: solo administracion configura el permiso y se valida contra la plataforma', sinBase, async () => {
  const ruta = `${RUTA}/plataformas/${plataformaId}/servicio`;
  assert.equal((await app.enviar(ruta, { token: moodle.estado.tokenServicio }, como('ESTUDIANTE', 'user_det_correo'), 'PUT')).status, 403);
  assert.equal((await app.enviar(ruta, { token: 'corto' }, como('ADMIN', 'user_det_admin'), 'PUT')).status, 422);
  assert.equal((await app.enviar(ruta, { token: 'tokenQueNoExisteEnMoodle12345' }, como('ADMIN', 'user_det_admin'), 'PUT')).status, 422);
  const ok = await json(await app.enviar(ruta, { token: moodle.estado.tokenServicio }, como('ADMIN', 'user_det_admin'), 'PUT'));
  assert.equal(ok.status, 200);
  const { rows } = await base.db.consultar('SELECT token_servicio_cifrado FROM plataformas_externas WHERE id = $1', [plataformaId]);
  assert.ok(rows[0].token_servicio_cifrado && !rows[0].token_servicio_cifrado.includes(moodle.estado.tokenServicio), 'se guarda cifrado');
});

test('deteccion: reconoce por correo verificado o por identidad, y solo con una coincidencia exacta', sinBase, async () => {
  const porCorreo = await estadoDe('user_det_correo');
  assert.equal(porCorreo.estado, 'INSCRITO');
  assert.equal(porCorreo.coincidencia, 'CORREO');
  assert.equal(porCorreo.cuenta, 'Alumno De Prueba');
  const porIdentidad = await estadoDe('user_det_dni');
  assert.equal(porIdentidad.estado, 'INSCRITO');
  assert.equal(porIdentidad.coincidencia, 'IDENTIDAD');
  assert.equal((await estadoDe('user_det_otro')).estado, 'NO_INSCRITO');
  assert.equal((await estadoDe('user_det_repetido')).estado, 'NO_INSCRITO', 'dos cuentas con el mismo correo no se adivinan');
});

test('deteccion: lo detectado muestra sus cursos y se guarda para no consultar en cada visita', sinBase, async () => {
  const cursos = await json(await app.pedir(`${RUTA}/mis-cursos`, { headers: como('ESTUDIANTE', 'user_det_correo') }));
  const grupo = cursos.cuerpo.plataformas.find((p) => p.id === plataformaId);
  assert.equal(grupo.estado, 'OK');
  assert.deepEqual(grupo.cursos.map((c) => c.codigo), ['ELEC-1']);
  const antes = moodle.estado.peticiones.length;
  assert.equal((await estadoDe('user_det_correo')).estado, 'INSCRITO');
  assert.equal(moodle.estado.peticiones.length, antes, 'la segunda visita sale de la base');
  assert.equal((await estadoDe('user_det_correo', 'ESTUDIANTE', '?actualizar=1')).estado, 'INSCRITO');
  assert.ok(moodle.estado.peticiones.length > antes, 'actualizar vuelve a preguntar');
});

test('deteccion: quitar el permiso borra lo detectado', sinBase, async () => {
  const quitar = await app.enviar(`${RUTA}/plataformas/${plataformaId}/servicio`, undefined, como('ADMIN', 'user_det_admin'), 'DELETE');
  assert.equal(quitar.status, 204);
  assert.equal((await estadoDe('user_det_correo')).estado, 'SIN_PERMISO');
  const { rows } = await base.db.consultar('SELECT count(*)::integer AS total FROM inscripciones_detectadas WHERE plataforma_id = $1', [plataformaId]);
  assert.equal(rows[0].total, 0);
});
