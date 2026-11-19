'use strict';

const { Pool } = require('pg');

function crearBaseDeDatos(databaseUrl) {
  if (!databaseUrl) return null;
  const pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30000 });
  pool.on('error', (error) => console.error('[ESOE-SMS] Error en la conexion a la base de datos:', error.message));
  return {
    consultar: (texto, parametros) => pool.query(texto, parametros),
    // Lo que tiene que ser atomico usa un solo cliente: BEGIN, el trabajo y
    // COMMIT, o ROLLBACK si algo falla. El cliente vuelve al pool siempre.
    transaccion: async (trabajo) => {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const resultado = await trabajo((texto, parametros) => cliente.query(texto, parametros));
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        cliente.release();
      }
    },
    cerrar: () => pool.end()
  };
}

module.exports = { crearBaseDeDatos };
