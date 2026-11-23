'use strict';

const crypto = require('node:crypto');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, crearBaseDePrueba, URL_ADMIN } = require('./ayuda');
const { crearFirmante } = require('../src/voz/rutas');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };
const TOKEN = crypto.randomBytes(32).toString('hex');
const LLAVE = { Authorization: `Bearer ${TOKEN}` };

let base;
let servidor;
let d;

const json = async (r) => ({ status: r.status, cuerpo: await r.json() });
const voz = async (ruta, cuerpo, cabeceras = LLAVE) => json(await servidor.enviar(`/api/voz${ruta}`, cuerpo, cabeceras));

before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  const { db } = base;
  const uno = async (sql, valores) => (await db.consultar(sql, valores)).rows[0];
  const { rows } = await db.consultar('SELECT codigo, id FROM instituciones');
  const inst = Object.fromEntries(rows.map((r) => [r.codigo, r.id]));

  const armar = async (institucion, dniEstudiante) => {
    const periodo = await uno(`INSERT INTO periodos_lectivos (codigo, nombre, modalidad, fecha_inicio, fecha_fin, institucion_id)
      VALUES ('P-2026', 'Periodo', 'SEMESTRAL', '2026-01-10', '2026-06-30', $1) RETURNING id`, [institucion]);
    const promocion = await uno(`INSERT INTO promociones (codigo, nombre, anio_ingreso, anio_egreso, institucion_id)
      VALUES ('PROM-1', 'Promocion', 2026, 2027, $1) RETURNING id`, [institucion]);
    const materia = await uno(`INSERT INTO materias (codigo, nombre, institucion_id)
      VALUES ('TAC-101', 'Tactica', $1) RETURNING id`, [institucion]);
    const catedratico = await uno(`INSERT INTO catedraticos (dni, nombres, apellidos, titulo, institucion_id)
      VALUES ('0801-1980-00001', 'Ana', 'Gomez', 'Lic.', $1) RETURNING id`, [institucion]);
    const estudiante = await uno(`INSERT INTO estudiantes (codigo_alumno, dni, nombres, apellidos, fecha_nacimiento, promocion_id, institucion_id)
      VALUES ('A-26001', $1, 'Carla', 'Diaz', '2004-05-05', $2, $3) RETURNING id`, [dniEstudiante, promocion.id, institucion]);
    const clase = await uno(`INSERT INTO clases (codigo_clase, periodo_id, promocion_id, materia_id, catedratico_id, horario, aula, institucion_id)
      VALUES ('TAC-101-A', $1, $2, $3, $4, 'Lunes y miércoles 08:00', 'Aula 3', $5) RETURNING id`,
    [periodo.id, promocion.id, materia.id, catedratico.id, institucion]);
    return { periodo, promocion, materia, catedratico, estudiante, clase };
  };
  d = { esoe: await armar(inst.ESOE, '0501-2004-00001'), infop: await armar(inst.INFOP, '0501-2004-00002') };

  await db.consultar(`INSERT INTO calificaciones (clase_id, estudiante_id, parcial_1, parcial_2, parcial_3, acumulativo)
    VALUES ($1, $2, 88, 92, 85, 90)`, [d.esoe.clase.id, d.esoe.estudiante.id]);
  for (const [fecha, estado] of [['2026-02-02', 'PRESENTE'], ['2026-02-04', 'AUSENTE'], ['2026-02-09', 'TARDANZA'], ['2026-02-11', 'PRESENTE']]) {
    const sesion = await uno('INSERT INTO sesiones_asistencia (clase_id, fecha) VALUES ($1, $2) RETURNING id', [d.esoe.clase.id, fecha]);
    await db.consultar('INSERT INTO detalle_asistencia (sesion_id, estudiante_id, estado) VALUES ($1, $2, $3)',
      [sesion.id, d.esoe.estudiante.id, estado]);
  }
  servidor = await levantar({ VOZ_TOKEN: TOKEN }, { db });
});

after(async () => {
  await servidor?.cerrar();
  await base?.cerrar();
});

const verificarCarla = () => voz('/verificar-estudiante', { institucion: 'ESOE', codigoAlumno: 'a-26001', dni: '0501 2004 00001' });

test('voz: sin la llave de servicio no responde nada', sinBase, async () => {
  assert.equal((await voz('/verificar-estudiante', {}, {})).status, 401);
  assert.equal((await voz('/verificar-estudiante', {}, { Authorization: 'Bearer otra-llave' })).status, 401);
});

test('voz: sin VOZ_TOKEN configurado las rutas no existen', async () => {
  const apagado = await levantar({}, { db: { consultar: async () => ({ rows: [] }) } });
  try {
    assert.equal((await apagado.enviar('/api/voz/verificar-estudiante', {}, LLAVE)).status, 404);
  } finally {
    await apagado.cerrar();
  }
});

test('voz: un VOZ_TOKEN corto se rechaza al arrancar', async () => {
  await assert.rejects(levantar({ VOZ_TOKEN: 'corto' }), /VOZ_TOKEN/);
});

test('voz: verifica al estudiante con institucion, codigo y DNI en cualquier formato', sinBase, async () => {
  const { status, cuerpo } = await verificarCarla();
  assert.equal(status, 200);
  assert.equal(cuerpo.verificado, true);
  assert.equal(cuerpo.estudiante.nombres, 'Carla');
  assert.match(cuerpo.sesion, /^[\w-]+\.[\w-]+$/);
});

test('voz: una verificacion fallida no revela que dato fallo', sinBase, async () => {
  const intentos = [
    { institucion: 'ESOE', codigoAlumno: 'A-26001', dni: '0501-2004-99999' },
    { institucion: 'ESOE', codigoAlumno: 'A-99999', dni: '0501-2004-00001' },
    { institucion: 'UDH', codigoAlumno: 'A-26001', dni: '0501-2004-00001' },
    { institucion: 'OTRA', codigoAlumno: 'A-26001', dni: '0501-2004-00001' },
    {}
  ];
  for (const intento of intentos) {
    assert.deepEqual(await voz('/verificar-estudiante', intento), { status: 200, cuerpo: { verificado: false } });
  }
});

test('voz: el mismo codigo en otra institucion es otra persona', sinBase, async () => {
  const r = await voz('/verificar-estudiante', { institucion: 'infop', codigoAlumno: 'A-26001', dni: '0501-2004-00001' });
  assert.equal(r.cuerpo.verificado, false);
  const propia = await voz('/verificar-estudiante', { institucion: 'infop', codigoAlumno: 'A-26001', dni: '0501-2004-00002' });
  assert.equal(propia.cuerpo.verificado, true);
});

test('voz: sin sesion verificada no hay notas, asistencia ni horario', sinBase, async () => {
  for (const ruta of ['/notas', '/asistencia', '/horario']) {
    assert.equal((await voz(ruta, {})).status, 403);
    assert.equal((await voz(ruta, { sesion: 'inventada.firma' })).status, 403);
  }
  const ajena = crearFirmante('otra-llave-de-servicio-con-32-caracteres').emitir({ tipo: 'ESTUDIANTE', id: d.esoe.estudiante.id, inst: 'x' });
  assert.equal((await voz('/notas', { sesion: ajena })).status, 403);
  for (const datos of [
    { tipo: 'ESTUDIANTE', id: 'no-es-uuid', inst: d.esoe.estudiante.id },
    { tipo: 'ESTUDIANTE', id: d.esoe.estudiante.id, inst: 'no-es-uuid' }
  ]) {
    const sesion = crearFirmante(TOKEN).emitir(datos);
    assert.equal((await voz('/notas', { sesion })).status, 403);
  }
});

test('voz: el estudiante verificado oye sus notas', sinBase, async () => {
  const { cuerpo: v } = await verificarCarla();
  const { status, cuerpo } = await voz('/notas', { sesion: v.sesion });
  assert.equal(status, 200);
  assert.equal(cuerpo.clases.length, 1);
  assert.deepEqual(cuerpo.clases[0], { materia: 'Tactica', codigo_clase: 'TAC-101-A', parcial1: 88, parcial2: 92,
    parcial3: 85, acumulativo: 90, notaFinal: 88.75, aprobado: true });
  assert.equal((await voz('/notas', { sesion: v.sesion, codigoClase: 'OTRA-1' })).cuerpo.clases.length, 0);
});

test('voz: la asistencia trae porcentaje, ausencias y tardanzas', sinBase, async () => {
  const { cuerpo: v } = await verificarCarla();
  const { cuerpo } = await voz('/asistencia', { sesion: v.sesion });
  assert.deepEqual(cuerpo.clases, [{ materia: 'Tactica', codigo_clase: 'TAC-101-A', registradas: 4, ausencias: 1,
    tardanzas: 1, porcentaje: 75 }]);
});

test('voz: el horario se filtra por dia, con o sin acentos', sinBase, async () => {
  const { cuerpo: v } = await verificarCarla();
  assert.equal((await voz('/horario', { sesion: v.sesion })).cuerpo.clases.length, 1);
  assert.equal((await voz('/horario', { sesion: v.sesion, dia: 'Miércoles' })).cuerpo.clases.length, 1);
  assert.equal((await voz('/horario', { sesion: v.sesion, dia: 'viernes' })).cuerpo.clases.length, 0);
  assert.equal((await voz('/horario', { sesion: v.sesion, dia: 'feriado' })).status, 422);
});

test('voz: el catedratico verificado oye el horario de sus clases, pero no notas ajenas', sinBase, async () => {
  const { cuerpo: v } = await voz('/verificar-catedratico', { institucion: 'esoe', dni: '0801198000001' });
  assert.equal(v.verificado, true);
  assert.equal(v.catedratico.nombres, 'Ana');
  const { cuerpo } = await voz('/horario', { sesion: v.sesion });
  assert.deepEqual(cuerpo.clases, [{ materia: 'Tactica', codigo_clase: 'TAC-101-A', horario: 'Lunes y miércoles 08:00', aula: 'Aula 3' }]);
  assert.equal((await voz('/notas', { sesion: v.sesion })).status, 403, 'la sesion de catedratico no lee notas de estudiante');
});

test('voz: desactivar un estudiante revoca las consultas de una sesion ya emitida', sinBase, async () => {
  const { cuerpo: verificada } = await verificarCarla();
  await base.db.consultar("UPDATE estudiantes SET estado = 'BAJA' WHERE id = $1", [d.esoe.estudiante.id]);
  try {
    for (const ruta of ['/notas', '/asistencia', '/horario']) {
      assert.equal((await voz(ruta, { sesion: verificada.sesion })).status, 403, ruta);
    }
  } finally {
    await base.db.consultar("UPDATE estudiantes SET estado = 'ACTIVO' WHERE id = $1", [d.esoe.estudiante.id]);
  }
});

test('voz: desactivar un catedratico revoca su sesion de horario', sinBase, async () => {
  const { cuerpo: verificada } = await voz('/verificar-catedratico', { institucion: 'esoe', dni: '0801198000001' });
  await base.db.consultar('UPDATE catedraticos SET activo = false WHERE id = $1', [d.esoe.catedratico.id]);
  try {
    assert.equal((await voz('/horario', { sesion: verificada.sesion })).status, 403);
  } finally {
    await base.db.consultar('UPDATE catedraticos SET activo = true WHERE id = $1', [d.esoe.catedratico.id]);
  }
});

test('voz: desactivar una institucion revoca sesiones ya verificadas', sinBase, async () => {
  const { cuerpo: verificada } = await verificarCarla();
  await base.db.consultar("UPDATE instituciones SET activa = false WHERE codigo = 'ESOE'");
  try {
    for (const ruta of ['/notas', '/asistencia', '/horario']) {
      assert.equal((await voz(ruta, { sesion: verificada.sesion })).status, 403, ruta);
    }
  } finally {
    await base.db.consultar("UPDATE instituciones SET activa = true WHERE codigo = 'ESOE'");
  }
});
