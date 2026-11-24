'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { crearClienteMoodle, ErrorDeMoodle, ErrorDeRed } = require('./moodle');
const { PLATAFORMAS_CONOCIDAS, TIPOS_ADMITIDOS } = require('./catalogo');
const { normalizarUrlBase } = require('../seguridad/red');
const { crearCifrador } = require('../seguridad/cifrado');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function texto(valor, maximo) {
  if (typeof valor !== 'string') return '';
  const limpio = valor.trim();
  return limpio.length <= maximo ? limpio : '';
}

const VIGENCIA_DETECCION_MS = 12 * 60 * 60 * 1000;

function correoDesdeClerk(auth) {
  return async (usuarioId) => {
    if (!auth.cliente) return '';
    const usuario = await auth.cliente.users.getUser(usuarioId);
    const principal = (usuario.emailAddresses || []).find((c) => c.id === usuario.primaryEmailAddressId);
    return principal && principal.verification && principal.verification.status === 'verified' ? principal.emailAddress : '';
  };
}

function crearRutasDeIntegraciones({ config, auth, db, permisos, crearAlmacenLimites = () => undefined, correoVerificado }) {
  const leerCorreo = correoVerificado || correoDesdeClerk(auth);
  const rutas = express.Router();
  const cifrador = crearCifrador(config.integraciones.claveCifrado);
  const moodle = crearClienteMoodle(config.integraciones);

  const DURACION_ESTADO_MS = 10 * 60 * 1000;
  let estadoEnCache = null;

  async function consultarEstado() {
    if (estadoEnCache && Date.now() - estadoEnCache.momento < DURACION_ESTADO_MS) return estadoEnCache.portales;
    const portales = await Promise.all(PLATAFORMAS_CONOCIDAS.map(async (p) => {
      try {
        const sitio = await moodle.configuracionPublica(p.urlBase);
        return {
          clave: p.clave, institucion: p.institucion, enLinea: true,
          serviciosWeb: sitio.serviciosWeb && sitio.servicioMovil, enMantenimiento: sitio.enMantenimiento
        };
      } catch {
        return { clave: p.clave, institucion: p.institucion, enLinea: false, serviciosWeb: false, enMantenimiento: false };
      }
    }));
    estadoEnCache = { momento: Date.now(), portales };
    return portales;
  }

  rutas.get('/estado', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ portales: await consultarEstado(), revisado: new Date(estadoEnCache.momento).toISOString() });
    } catch (error) {
      next(error);
    }
  });

  if (!db || !cifrador) {
    rutas.use((req, res) => {
      res.status(503).json({ error: 'Las conexiones con otras plataformas no estan configuradas en este servidor.' });
    });
    return rutas;
  }

  const conSesion = [auth.exigirSesion, permisos.resolverVinculo];
  const soloAdministracion = [auth.exigirRol('ADMIN'), permisos.resolverVinculo];

  const limiteDeVinculacion = rateLimit({
    store: crearAlmacenLimites('vinculacion'),
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.identidad.usuarioId,
    message: { error: 'Demasiados intentos. Intente de nuevo mas tarde.' }
  });

  function responderError(res, error, siguiente) {
    if (error instanceof ErrorDeRed) return res.status(502).json({ error: error.message, codigo: error.codigo });
    if (error instanceof ErrorDeMoodle) {
      const estado = error.codigo === 'CREDENCIAL_RECHAZADA' ? 422 : 502;
      return res.status(estado).json({ error: error.message, codigo: error.codigo });
    }
    siguiente(error);
  }

  function validarId(req, res, next) {
    if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'Plataforma no encontrada.' });
    next();
  }

  async function buscarPlataforma(id, institucionId) {
    const { rows } = await db.consultar(
      `SELECT id, nombre, tipo, url_base FROM plataformas_externas
        WHERE id = $1 AND institucion_id = $2 AND activa`, [id, institucionId]);
    return rows[0] || null;
  }

  rutas.get('/catalogo', ...soloAdministracion, (req, res) => {
    res.json({ plataformas: PLATAFORMAS_CONOCIDAS });
  });

  rutas.get('/plataformas', ...conSesion, async (req, res, next) => {
    try {
      const { rows } = await db.consultar(
        `SELECT p.id, p.nombre, p.tipo, p.url_base, c.nombre_remoto, c.vinculada_en,
                (p.token_servicio_cifrado IS NOT NULL) AS detectable
           FROM plataformas_externas p
           LEFT JOIN cuentas_externas c ON c.plataforma_id = p.id AND c.usuario_id = $1
          WHERE p.activa AND p.institucion_id = $2
          ORDER BY p.nombre`, [req.identidad.usuarioId, req.vinculo.institucionId]);
      res.json({
        plataformas: rows.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          tipo: f.tipo,
          urlBase: f.url_base,
          vinculada: Boolean(f.vinculada_en),
          cuenta: f.nombre_remoto || null,
          detectable: f.detectable === true
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  rutas.post('/plataformas', ...soloAdministracion, async (req, res, next) => {
    try {
      const cuerpo = req.body || {};
      const nombre = texto(cuerpo.nombre, 120);
      const tipo = texto(cuerpo.tipo, 20).toUpperCase();
      if (!nombre) return res.status(422).json({ error: 'Indique un nombre de hasta 120 caracteres.', campo: 'nombre' });
      if (!TIPOS_ADMITIDOS.includes(tipo)) return res.status(422).json({ error: 'Tipo de plataforma no admitido.', campo: 'tipo' });

      let urlBase;
      try {
        urlBase = normalizarUrlBase(cuerpo.urlBase, config.integraciones);
      } catch (error) {
        return res.status(422).json({ error: error.message, campo: 'urlBase' });
      }

      const sitio = await moodle.configuracionPublica(urlBase);
      if (!sitio.serviciosWeb || !sitio.servicioMovil) {
        return res.status(422).json({
          error: 'La plataforma existe pero no tiene habilitados los servicios web.', campo: 'urlBase'
        });
      }

      const { rows } = await db.consultar(
        `INSERT INTO plataformas_externas (nombre, tipo, url_base, creada_por, institucion_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (institucion_id, url_base) DO NOTHING
         RETURNING id, nombre, tipo, url_base`,
        [nombre, tipo, urlBase, req.identidad.usuarioId, req.vinculo.institucionId]);
      if (rows.length === 0) return res.status(409).json({ error: 'Esa plataforma ya esta registrada.' });

      const f = rows[0];
      res.status(201).json({
        plataforma: { id: f.id, nombre: f.nombre, tipo: f.tipo, urlBase: f.url_base, vinculada: false, cuenta: null },
        sitio: { nombre: sitio.nombre, enMantenimiento: sitio.enMantenimiento }
      });
    } catch (error) {
      responderError(res, error, next);
    }
  });

  rutas.post('/plataformas/:id/probar', ...soloAdministracion, validarId, async (req, res, next) => {
    try {
      const plataforma = await buscarPlataforma(req.params.id, req.vinculo.institucionId);
      if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada.' });
      const sitio = await moodle.configuracionPublica(plataforma.url_base);
      res.json({
        disponible: sitio.serviciosWeb && sitio.servicioMovil && !sitio.enMantenimiento,
        sitio: { nombre: sitio.nombre, serviciosWeb: sitio.serviciosWeb, enMantenimiento: sitio.enMantenimiento }
      });
    } catch (error) {
      responderError(res, error, next);
    }
  });

  rutas.delete('/plataformas/:id', ...soloAdministracion, validarId, async (req, res, next) => {
    try {
      const { rowCount } = await db.consultar(
        'DELETE FROM plataformas_externas WHERE id = $1 AND institucion_id = $2',
        [req.params.id, req.vinculo.institucionId]);
      if (rowCount === 0) return res.status(404).json({ error: 'Plataforma no encontrada.' });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  rutas.post('/plataformas/:id/cuenta', ...conSesion, limiteDeVinculacion, validarId, async (req, res, next) => {
    try {
      const cuerpo = req.body || {};
      const usuario = texto(cuerpo.usuario, 150);
      const clave = typeof cuerpo.clave === 'string' && cuerpo.clave.length <= 300 ? cuerpo.clave : '';
      if (!usuario || !clave) return res.status(422).json({ error: 'Indique usuario y contrasena de esa plataforma.' });

      const plataforma = await buscarPlataforma(req.params.id, req.vinculo.institucionId);
      if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada.' });

      const token = await moodle.obtenerToken(plataforma.url_base, usuario, clave);
      const info = await moodle.infoDelSitio(plataforma.url_base, token);

      await db.consultar(
        `INSERT INTO cuentas_externas (plataforma_id, usuario_id, token_cifrado, usuario_remoto_id, nombre_remoto)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (plataforma_id, usuario_id) DO UPDATE
           SET token_cifrado = EXCLUDED.token_cifrado,
               usuario_remoto_id = EXCLUDED.usuario_remoto_id,
               nombre_remoto = EXCLUDED.nombre_remoto,
               vinculada_en = CURRENT_TIMESTAMP`,
        [plataforma.id, req.identidad.usuarioId, cifrador.cifrar(token), info.usuarioId, info.nombreCompleto.slice(0, 150)]);

      res.status(201).json({ vinculada: true, cuenta: info.nombreCompleto });
    } catch (error) {
      responderError(res, error, next);
    }
  });

  rutas.delete('/plataformas/:id/cuenta', ...conSesion, validarId, async (req, res, next) => {
    try {
      const plataforma = await buscarPlataforma(req.params.id, req.vinculo.institucionId);
      if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada.' });
      await db.consultar(
        'DELETE FROM cuentas_externas WHERE plataforma_id = $1 AND usuario_id = $2',
        [req.params.id, req.identidad.usuarioId]);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  rutas.put('/plataformas/:id/servicio', ...soloAdministracion, validarId, async (req, res, next) => {
    try {
      const token = texto((req.body || {}).token, 200);
      if (!/^[A-Za-z0-9]{16,128}$/.test(token)) {
        return res.status(422).json({ error: 'Indique el token de servicio que entregó la administración de la plataforma.', campo: 'token' });
      }
      const plataforma = await buscarPlataforma(req.params.id, req.vinculo.institucionId);
      if (!plataforma) return res.status(404).json({ error: 'Plataforma no encontrada.' });
      await moodle.infoDelSitio(plataforma.url_base, token);
      await moodle.detectarInscripcion(plataforma.url_base, token, { correo: 'comprobacion@invalido.example' });
      await db.consultar(
        `UPDATE plataformas_externas SET token_servicio_cifrado = $1, servicio_configurado_en = CURRENT_TIMESTAMP
          WHERE id = $2 AND institucion_id = $3`, [cifrador.cifrar(token), plataforma.id, req.vinculo.institucionId]);
      await db.consultar('DELETE FROM inscripciones_detectadas WHERE plataforma_id = $1', [plataforma.id]);
      res.json({ detectable: true });
    } catch (error) {
      responderError(res, error, next);
    }
  });

  rutas.delete('/plataformas/:id/servicio', ...soloAdministracion, validarId, async (req, res, next) => {
    try {
      const { rowCount } = await db.consultar(
        `UPDATE plataformas_externas SET token_servicio_cifrado = NULL, servicio_configurado_en = NULL
          WHERE id = $1 AND institucion_id = $2`, [req.params.id, req.vinculo.institucionId]);
      if (!rowCount) return res.status(404).json({ error: 'Plataforma no encontrada.' });
      await db.consultar('DELETE FROM inscripciones_detectadas WHERE plataforma_id = $1', [req.params.id]);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  async function identidadDelUsuario(req) {
    if (!req.vinculo.referenciaId) return '';
    const tabla = req.identidad.rol === 'ESTUDIANTE' ? 'estudiantes' : req.identidad.rol === 'CATEDRATICO' ? 'catedraticos' : '';
    if (!tabla) return '';
    const { rows } = await db.consultar(`SELECT dni FROM ${tabla} WHERE id = $1 AND institucion_id = $2`,
      [req.vinculo.referenciaId, req.vinculo.institucionId]);
    return rows[0] ? String(rows[0].dni || '') : '';
  }

  rutas.get('/mis-plataformas', ...conSesion, async (req, res, next) => {
    try {
      const forzar = req.query.actualizar === '1';
      const { rows } = await db.consultar(
        `SELECT p.id, p.nombre, p.url_base, p.token_servicio_cifrado,
                c.nombre_remoto AS cuenta,
                d.estado, d.nombre_remoto, d.coincidencia, d.comprobado_en
           FROM plataformas_externas p
           LEFT JOIN cuentas_externas c ON c.plataforma_id = p.id AND c.usuario_id = $1
           LEFT JOIN inscripciones_detectadas d ON d.plataforma_id = p.id AND d.usuario_id = $1
          WHERE p.institucion_id = $2 AND p.activa
          ORDER BY p.nombre`, [req.identidad.usuarioId, req.vinculo.institucionId]);

      let datos = null;
      const obtenerDatos = async () => {
        if (!datos) {
          const [correo, identidad] = await Promise.all([leerCorreo(req.identidad.usuarioId).catch(() => ''), identidadDelUsuario(req)]);
          datos = { correo, identidad };
        }
        return datos;
      };

      const plataformas = await Promise.all(rows.map(async (f) => {
        const base = { id: f.id, nombre: f.nombre, urlBase: f.url_base };
        if (f.cuenta) return { ...base, estado: 'VINCULADA', cuenta: f.cuenta };
        if (!f.token_servicio_cifrado) return { ...base, estado: 'SIN_PERMISO' };
        const vigente = f.comprobado_en && Date.now() - new Date(f.comprobado_en).getTime() < VIGENCIA_DETECCION_MS;
        if (vigente && !forzar) {
          return { ...base, estado: f.estado, cuenta: f.nombre_remoto || null, coincidencia: f.coincidencia || null, comprobadoEn: f.comprobado_en };
        }
        const { correo, identidad } = await obtenerDatos();
        if (!correo && !identidad) return { ...base, estado: 'SIN_DATOS' };
        try {
          const hallado = await moodle.detectarInscripcion(f.url_base, cifrador.descifrar(f.token_servicio_cifrado), { correo, identidad });
          const estado = hallado ? 'INSCRITO' : 'NO_INSCRITO';
          await db.consultar(
            `INSERT INTO inscripciones_detectadas (plataforma_id, usuario_id, estado, usuario_remoto_id, nombre_remoto, coincidencia, comprobado_en)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT (plataforma_id, usuario_id) DO UPDATE
               SET estado = EXCLUDED.estado, usuario_remoto_id = EXCLUDED.usuario_remoto_id,
                   nombre_remoto = EXCLUDED.nombre_remoto, coincidencia = EXCLUDED.coincidencia,
                   comprobado_en = EXCLUDED.comprobado_en`,
            [f.id, req.identidad.usuarioId, estado, hallado ? hallado.usuarioId : null,
              hallado ? hallado.nombreCompleto.slice(0, 150) : null, hallado ? hallado.coincidencia : null]);
          return { ...base, estado, cuenta: hallado ? hallado.nombreCompleto : null, coincidencia: hallado ? hallado.coincidencia : null, comprobadoEn: new Date().toISOString() };
        } catch {
          return { ...base, estado: 'NO_DISPONIBLE' };
        }
      }));
      res.set('Cache-Control', 'no-store');
      res.json({ plataformas });
    } catch (error) {
      next(error);
    }
  });

  rutas.get('/mis-cursos', ...conSesion, async (req, res, next) => {
    try {
      const { rows } = await db.consultar(
        `SELECT p.id, p.nombre, p.url_base, c.token_cifrado, c.usuario_remoto_id
           FROM cuentas_externas c
           JOIN plataformas_externas p ON p.id = c.plataforma_id AND p.activa
          WHERE c.usuario_id = $1 AND p.institucion_id = $2
         UNION ALL
         SELECT p.id, p.nombre, p.url_base, p.token_servicio_cifrado, d.usuario_remoto_id
           FROM inscripciones_detectadas d
           JOIN plataformas_externas p ON p.id = d.plataforma_id AND p.activa AND p.token_servicio_cifrado IS NOT NULL
          WHERE d.usuario_id = $1 AND p.institucion_id = $2 AND d.estado = 'INSCRITO'
            AND NOT EXISTS (SELECT 1 FROM cuentas_externas c WHERE c.plataforma_id = p.id AND c.usuario_id = $1)
          ORDER BY 2`, [req.identidad.usuarioId, req.vinculo.institucionId]);

      const plataformas = await Promise.all(rows.map(async (f) => {
        const base = { id: f.id, nombre: f.nombre };
        try {
          const token = cifrador.descifrar(f.token_cifrado);
          const cursos = await moodle.cursosDelUsuario(f.url_base, token, f.usuario_remoto_id);
          return { ...base, estado: 'OK', cursos };
        } catch (error) {
          const vencida = error instanceof ErrorDeMoodle && error.codigo === 'CREDENCIAL_RECHAZADA';
          return { ...base, estado: vencida ? 'REVINCULAR' : 'NO_DISPONIBLE', cursos: [] };
        }
      }));
      res.set('Cache-Control', 'no-store');
      res.json({ plataformas });
    } catch (error) {
      next(error);
    }
  });

  return rutas;
}

module.exports = { crearRutasDeIntegraciones };
