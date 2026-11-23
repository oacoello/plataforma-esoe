'use strict';

const { Pool } = require('pg');

function crearBaseDeDatos(databaseUrl, opciones = {}) {
  if (!databaseUrl) return null;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    ...opciones
  });
  pool.on('error', (error) => console.error('[ESOE-SMS] Error en la conexion a la base de datos:', error.message));
  let cierre;
  return {
    consultar: (texto, parametros) => pool.query(texto, parametros),
    estado: () => ({ conexiones: pool.totalCount, libres: pool.idleCount, enEspera: pool.waitingCount }),
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
    cerrar: () => { cierre ||= pool.end(); return cierre; }
  };
}

module.exports = { crearBaseDeDatos };
