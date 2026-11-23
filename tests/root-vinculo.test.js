'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { crearBaseDePrueba, URL_ADMIN } = require('./ayuda');
const { registrarAdministrador } = require('../scripts/crear-root');

test('aprovisionamiento: vincula ADMIN a su institucion, es repetible y no reemplaza otro proveedor', URL_ADMIN ? false : { skip: 'Sin PRUEBAS_DATABASE_URL' }, async () => {
  const base = await crearBaseDePrueba();
  try {
    const { rows: instituciones } = await base.db.consultar('SELECT id,codigo FROM instituciones');
    const esoe = instituciones.find((i) => i.codigo === 'ESOE');
    const cliente = { query: base.db.consultar };
    const cuenta = { username: 'admin_aprovisionamiento', id: 'user_aprovisionamiento' };
    await registrarAdministrador(cliente, cuenta, 'Administracion', esoe.id);
    await base.db.consultar('UPDATE usuarios SET activo=false WHERE proveedor_id=$1', [cuenta.id]);
    await registrarAdministrador(cliente, cuenta, 'Administracion actualizada', esoe.id);
    const { rows } = await base.db.consultar('SELECT rol,institucion_id,activo,nombre_completo,referencia_id FROM usuarios WHERE proveedor_id=$1', [cuenta.id]);
    assert.deepEqual(rows, [{ rol: 'ADMIN', institucion_id: esoe.id, activo: true, nombre_completo: 'Administracion actualizada', referencia_id: null }]);
    await assert.rejects(registrarAdministrador(cliente, { ...cuenta, id: 'user_otro_proveedor' }, 'Otro proveedor', esoe.id), { code: '23505' });
    assert.equal((await base.db.consultar('SELECT count(*)::integer AS total FROM usuarios')).rows[0].total, 1);
  } finally { await base.cerrar(); }
});
