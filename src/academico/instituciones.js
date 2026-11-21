'use strict';

// SMS-06. Instituciones que usan la plataforma (ESOE, UDH, INFOP, COPECO...).
// Cualquier sesion las consulta; la propia viene marcada. Los datos academicos de
// cada una se leen y escriben solo desde su institucion (ver src/permisos.js).

const express = require('express');

function crearRutasInstituciones({ auth, db, permisos }) {
  const rutas = express.Router();
  if (!db) return rutas;
  const conSesion = [auth.exigirSesion, permisos.resolverVinculo];

  rutas.get('/instituciones', ...conSesion, async (req, res, next) => {
    try {
      const { rows } = await db.consultar(
        `SELECT id, codigo, siglas, nombre, tipo, sitio_web, campus_virtual,
                (id = $1) AS propia
           FROM instituciones
          WHERE activa = TRUE
          ORDER BY (codigo = 'ESOE') DESC, nombre`,
        [req.vinculo.institucionId]);
      res.set('Cache-Control', 'no-store');
      res.json({ instituciones: rows });
    } catch (error) {
      next(error);
    }
  });

  return rutas;
}

module.exports = { crearRutasInstituciones };
