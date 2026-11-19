'use strict';

// Entrada para Vercel. Es la misma aplicacion que arranca src/server.js, pero sin
// listen(): Vercel la ejecuta como funcion y le entrega cada peticion. Todas las
// rutas, incluida la interfaz de public/, pasan por aqui (ver vercel.json) para
// que cada respuesta lleve las mismas cabeceras de seguridad que en el contenedor.

const { cargarConfig } = require('../src/config');
const { crearApp } = require('../src/app');
const { crearBaseDeDatos } = require('../src/db');

const config = cargarConfig();
const db = crearBaseDeDatos(config.databaseUrl);

module.exports = crearApp(config, { db });
