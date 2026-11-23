'use strict';

const { cargarConfig } = require('./config');
const { crearApp } = require('./app');
const { crearBaseDeDatos } = require('./db');

let config;
try {
  config = cargarConfig();
} catch (error) {
  console.error(`[ESOE-SMS] ${error.message}`);
  process.exit(1);
}

const db = crearBaseDeDatos(config.databaseUrl, config.baseDeDatos);

const app = crearApp(config, { db });
const servidor = app.listen(config.puerto, config.host, () => {
  console.log(`[ESOE-SMS] Servidor activo en http://${config.host}:${config.puerto} (${config.entorno})`);
});

let apagando = false;
function apagar(senal) {
  if (apagando) return;
  apagando = true;
  app.locals.aceptaTrafico = false;
  console.log(`[ESOE-SMS] ${senal} recibido, cerrando conexiones...`);
  servidor.close(async () => {
    if (db) await db.cerrar().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 30000).unref();
}

process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
