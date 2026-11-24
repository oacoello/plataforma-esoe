'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, como, crearBaseDePrueba, ENTORNO_CON_SESION, URL_ADMIN } = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };

const ADMIN = como('ADMIN', 'user_borrado_admin');
const ADMIN_INFOP = como('ADMIN', 'user_borrado_infop');
const ESTUDIANTE = como('ESTUDIANTE', 'user_borrado_est');
const CATEDRATICO = como('CATEDRATICO', 'user_borrado_cat');

let base;
let servidor;
let d;

const json = async (r) => ({ status: r.status, cuerpo: r.status === 204 ? null : await r.json() });
const crear = async (ruta, cuerpo, quien = ADMIN) => {
  const r = await json(await servidor.enviar(ruta, cuerpo, quien));
  assert.equal(r.status, 201, `${ruta}: ${JSON.stringify(r.cuerpo)}`);
  return Object.values(r.cuerpo)[0];
};
const borrar = (ruta, quien = ADMIN) => servidor.enviar(ruta, undefined, quien, 'DELETE').then(json);

before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  const { db } = base;
  const { rows } = await db.consultar('SELECT codigo, id FROM instituciones');
  const inst = Object.fromEntries(rows.map((r) => [r.codigo, r.id]));
  servidor = await levantar(ENTORNO_CON_SESION, { db });
  await db.consultar(
    `INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id)
     VALUES ('admin', 'user_borrado_admin', 'ADMIN', 'Admin', $1), ('infop', 'user_borrado_infop', 'ADMIN', 'Infop', $2)`,
    [inst.ESOE, inst.INFOP]);
  const periodo = await crear('/api/periodos', { codigo: 'B-P', nombre: 'Periodo', modalidad: 'SEMESTRAL',
    fecha_inicio: '2026-01-10', fecha_fin: '2026-06-30' });
  const promocion = await crear('/api/promociones', { codigo: 'B-PR', nombre: 'Promocion', anio_ingreso: 2026, anio_egreso: 2027 });
  const materia = await crear('/api/materias', { codigo: 'B-M', nombre: 'Materia' });
  const suelta = await crear('/api/materias', { codigo: 'B-SUELTA', nombre: 'Sin clases' });
  const catedratico = await crear('/api/catedraticos', { dni: 'B-DNI-C', nombres: 'Ana', apellidos: 'Reyes', titulo: 'Lic.' });
  const estudiante = await crear('/api/estudiantes', { codigo_alumno: 'B-A1', dni: 'B-DNI-E', nombres: 'Carla',
    apellidos: 'Diaz', fecha_nacimiento: '2004-05-05', promocion_id: promocion.id });
  const clase = await crear('/api/clases', { codigo_clase: 'B-CL', periodo_id: periodo.id, promocion_id: promocion.id,
    materia_id: materia.id, catedratico_id: catedratico.id, horario: 'L 08:00' });
  await db.consultar(
    `INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id, referencia_id)
     VALUES ('est', 'user_borrado_est', 'ESTUDIANTE', 'Est', $1, $2), ('cat', 'user_borrado_cat', 'CATEDRATICO', 'Cat', $1, $3)`,
    [inst.ESOE, estudiante.id, catedratico.id]);
  d = { periodo, promocion, materia, suelta, catedratico, estudiante, clase };
});

after(async () => {
  await servidor?.cerrar();
  await base?.cerrar();
});

test('borrado: estudiante y catedratico no pueden borrar nada', sinBase, async () => {
  for (const quien of [ESTUDIANTE, CATEDRATICO]) {
    assert.equal((await borrar(`/api/materias/${d.suelta.id}`, quien)).status, 403);
    assert.equal((await borrar(`/api/clases/${d.clase.id}`, quien)).status, 403);
  }
  assert.equal((await servidor.enviar(`/api/materias/${d.suelta.id}`, undefined, {}, 'DELETE')).status, 401);
});

test('borrado: otra institucion no alcanza los registros ajenos', sinBase, async () => {
  assert.equal((await borrar(`/api/materias/${d.suelta.id}`, ADMIN_INFOP)).status, 404);
  assert.equal((await borrar('/api/materias/no-es-uuid')).status, 404);
});

test('borrado: lo que tiene registros asociados se protege con un aviso claro', sinBase, async () => {
  const r = await borrar(`/api/materias/${d.materia.id}`);
  assert.equal(r.status, 409);
  assert.equal(r.cuerpo.codigo, 'TIENE_DEPENDENCIAS');
  assert.match(r.cuerpo.error, /clases asociados/);
});

test('borrado: el administrador borra en orden y el expediente se desliga de la cuenta', sinBase, async () => {
  assert.equal((await borrar(`/api/materias/${d.suelta.id}`)).status, 204);
  assert.equal((await borrar(`/api/materias/${d.suelta.id}`)).status, 404);
  assert.equal((await borrar(`/api/clases/${d.clase.id}`)).status, 204);
  for (const ruta of ['materias', 'periodos']) {
    assert.equal((await borrar(`/api/${ruta}/${d[ruta === 'materias' ? 'materia' : 'periodo'].id}`)).status, 204);
  }
  assert.equal((await borrar(`/api/estudiantes/${d.estudiante.id}`)).status, 204);
  assert.equal((await borrar(`/api/catedraticos/${d.catedratico.id}`)).status, 204);
  assert.equal((await borrar(`/api/promociones/${d.promocion.id}`)).status, 204);
  const { rows } = await base.db.consultar(
    "SELECT referencia_id FROM usuarios WHERE proveedor_id IN ('user_borrado_est', 'user_borrado_cat')");
  assert.deepEqual(rows.map((r) => r.referencia_id), [null, null]);
});
