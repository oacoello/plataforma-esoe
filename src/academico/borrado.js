'use strict';

const express = require('express');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BORRABLES = Object.freeze({
  periodos: { tabla: 'periodos_lectivos', dependientes: 'clases' },
  promociones: { tabla: 'promociones', dependientes: 'estudiantes o clases' },
  materias: { tabla: 'materias', dependientes: 'clases' },
  catedraticos: { tabla: 'catedraticos', dependientes: 'clases', expediente: true },
  estudiantes: { tabla: 'estudiantes', dependientes: 'registros', expediente: true },
  clases: { tabla: 'clases', dependientes: 'registros' }
});

function crearRutasDeBorrado({ auth, db, permisos }) {
  const rutas = express.Router();
  if (!db) return rutas;
  const soloAdministracion = [auth.exigirRol('ADMIN'), permisos.resolverVinculo];

  for (const [ruta, recurso] of Object.entries(BORRABLES)) {
    rutas.delete(`/${ruta}/:id`, ...soloAdministracion, async (req, res, next) => {
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Recurso no encontrado.' });
      try {
        const resultado = await db.transaccion(async (consultar) => {
          const { rows } = await consultar(
            `DELETE FROM ${recurso.tabla} WHERE id = $1 AND institucion_id = $2 RETURNING id`,
            [req.params.id, req.vinculo.institucionId]);
          if (!rows.length) return null;
          if (recurso.expediente) {
            await consultar(
              'UPDATE usuarios SET referencia_id = NULL WHERE referencia_id = $1 AND institucion_id = $2',
              [req.params.id, req.vinculo.institucionId]);
          }
          return rows[0];
        });
        if (!resultado) return res.status(404).json({ error: 'Recurso no encontrado.' });
        res.status(204).end();
      } catch (error) {
        if (error && error.code === '23503') {
          return res.status(409).json({
            error: `No se puede borrar porque tiene ${recurso.dependientes} asociados. Borre o cambie esos registros primero.`,
            codigo: 'TIENE_DEPENDENCIAS'
          });
        }
        next(error);
      }
    });
  }
  return rutas;
}

module.exports = { crearRutasDeBorrado, BORRABLES };
