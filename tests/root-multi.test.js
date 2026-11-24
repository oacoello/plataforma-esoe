'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { levantar, como, crearBaseDePrueba, ENTORNO_CON_SESION, URL_ADMIN } = require('./ayuda');

const sinBase = URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' };

const ROOT = como('ADMIN', 'user_root_multi');
const ADMIN_ESOE = como('ADMIN', 'user_admin_esoe_multi');

let base;
let servidor;
let inst;

const json = async (r) => ({ status: r.status, cuerpo: await r.json() });

before(async () => {
  if (!URL_ADMIN) return;
  base = await crearBaseDePrueba();
  const { db } = base;
  const { rows } = await db.consultar('SELECT codigo, id FROM instituciones');
  inst = Object.fromEntries(rows.map((r) => [r.codigo, r.id]));
  await db.consultar(
    `INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id, es_root)
     VALUES ('root', 'user_root_multi', 'ADMIN', 'Root', $1, TRUE),
            ('admin', 'user_admin_esoe_multi', 'ADMIN', 'Admin', $1, FALSE)`, [inst.ESOE]);
  servidor = await levantar(ENTORNO_CON_SESION, { db });
});

after(async () => {
  await servidor?.cerrar();
  await base?.cerrar();
});

test('root: administra la institucion que elige y crea en ella', sinBase, async () => {
  const conInfop = { ...ROOT, 'X-Institucion': inst.INFOP };
  const lista = await json(await servidor.pedir('/api/instituciones', { headers: conInfop }));
  assert.equal(lista.status, 200);
  assert.equal(lista.cuerpo.esRoot, true);
  assert.equal(lista.cuerpo.institucionActivaId, inst.INFOP);
  assert.equal(lista.cuerpo.instituciones.find((i) => i.codigo === 'INFOP').propia, true);

  const creada = await json(await servidor.enviar('/api/materias', { codigo: 'ROOT-1', nombre: 'Materia INFOP' }, conInfop));
  assert.equal(creada.status, 201, JSON.stringify(creada.cuerpo));
  const { rows } = await base.db.consultar('SELECT institucion_id FROM materias WHERE id = $1', [creada.cuerpo.materia.id]);
  assert.equal(rows[0].institucion_id, inst.INFOP);

  const enEsoe = await json(await servidor.pedir('/api/materias', { headers: ROOT }));
  assert.equal(enEsoe.cuerpo.materias.some((m) => m.codigo === 'ROOT-1'), false, 'sin cabecera vuelve a su institucion');
});

test('root: una institucion inexistente o con formato invalido se rechaza', sinBase, async () => {
  for (const valor of ['no-es-uuid', '00000000-0000-4000-8000-000000000000']) {
    const r = await json(await servidor.pedir('/api/materias', { headers: { ...ROOT, 'X-Institucion': valor } }));
    assert.equal(r.status, 422, valor);
    assert.equal(r.cuerpo.codigo, 'INSTITUCION_INVALIDA');
  }
});

test('root: un administrador comun no puede cambiar de institucion con la cabecera', sinBase, async () => {
  const r = await json(await servidor.enviar('/api/materias', { codigo: 'COMUN-1', nombre: 'Intento' },
    { ...ADMIN_ESOE, 'X-Institucion': inst.UDH }));
  assert.equal(r.status, 201);
  const { rows } = await base.db.consultar('SELECT institucion_id FROM materias WHERE id = $1', [r.cuerpo.materia.id]);
  assert.equal(rows[0].institucion_id, inst.ESOE, 'la cabecera se ignora para quien no es root');
  const lista = await json(await servidor.pedir('/api/instituciones', { headers: ADMIN_ESOE }));
  assert.equal(lista.cuerpo.esRoot, false);
});

test('root: la base impide marcar como root a quien no es ADMIN', sinBase, async () => {
  await assert.rejects(base.db.consultar(
    `INSERT INTO usuarios (username, proveedor_id, rol, nombre_completo, institucion_id, es_root)
     VALUES ('falso', 'user_falso_root', 'CATEDRATICO', 'Falso', $1, TRUE)`, [inst.ESOE]), { code: '23514' });
});
