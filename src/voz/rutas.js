'use strict';

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { esUuid } = require('../permisos');

const VIGENCIA_SESION_S = 20 * 60;
const INSTITUCIONES = Object.freeze({ esoe: 'ESOE', udh: 'UDH', infop: 'INFOP', copeco: 'COPECO' });
const DIAS = Object.freeze(['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']);

const texto = (valor, maximo) => (typeof valor === 'string' ? valor.trim().slice(0, maximo) : '');
const soloDigitos = (valor) => texto(valor, 40).replace(/\D/g, '');
const sinAcentos = (valor) => valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function igualesEnTiempoConstante(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function crearFirmante(token) {
  const clave = crypto.createHash('sha256').update(`esoe-voz-sesion:${token}`).digest();
  const firmar = (datos) => crypto.createHmac('sha256', clave).update(datos).digest('base64url');
  return {
    emitir(contenido) {
      const datos = Buffer.from(JSON.stringify({ ...contenido, exp: Math.floor(Date.now() / 1000) + VIGENCIA_SESION_S }))
        .toString('base64url');
      return `${datos}.${firmar(datos)}`;
    },
    leer(sesion) {
      const [datos, firma, sobra] = texto(sesion, 2000).split('.');
      if (!datos || !firma || sobra !== undefined) return null;
      if (!igualesEnTiempoConstante(firma, firmar(datos))) return null;
      try {
        const contenido = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
        return contenido.exp > Math.floor(Date.now() / 1000) ? contenido : null;
      } catch {
        return null;
      }
    }
  };
}

function crearRutasDeVoz({ config, db, crearAlmacenLimites = () => undefined }) {
  const rutas = express.Router();
  const token = config.voz.token;

  if (!token || !db) {
    rutas.use((req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));
    return rutas;
  }

  const firmante = crearFirmante(token);

  rutas.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const cabecera = req.get('authorization') || '';
    const presentado = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
    if (!presentado || !igualesEnTiempoConstante(presentado, token)) {
      return res.status(401).json({ error: 'Llave de servicio invalida.' });
    }
    next();
  });

  const limiteVerificacion = rateLimit({
    store: crearAlmacenLimites('voz'),
    windowMs: config.limitePeticiones.ventanaMs,
    limit: config.voz.limiteVerificacion,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas verificaciones. Intente de nuevo mas tarde.' }
  });

  const institucionPedida = (req) => INSTITUCIONES[sinAcentos(texto(req.body && req.body.institucion, 20))] || null;
  const noVerificado = (res) => res.json({ verificado: false });

  rutas.post('/verificar-estudiante', limiteVerificacion, async (req, res, next) => {
    try {
      const codigo = institucionPedida(req);
      const alumno = texto(req.body && req.body.codigoAlumno, 30).replace(/\s+/g, '').toUpperCase();
      const dni = soloDigitos(req.body && req.body.dni);
      if (!codigo || !alumno || dni.length < 8) return noVerificado(res);
      const { rows } = await db.consultar(
        `SELECT e.id, e.nombres, e.institucion_id
           FROM estudiantes e
           JOIN instituciones i ON i.id = e.institucion_id
          WHERE i.codigo = $1 AND i.activa
            AND upper(e.codigo_alumno) = $2
            AND regexp_replace(e.dni, '\\D', '', 'g') = $3
            AND e.estado = 'ACTIVO'`,
        [codigo, alumno, dni]
      );
      if (rows.length !== 1) return noVerificado(res);
      const [e] = rows;
      res.json({
        verificado: true,
        sesion: firmante.emitir({ tipo: 'ESTUDIANTE', id: e.id, inst: e.institucion_id }),
        estudiante: { nombres: e.nombres }
      });
    } catch (error) {
      next(error);
    }
  });

  rutas.post('/verificar-catedratico', limiteVerificacion, async (req, res, next) => {
    try {
      const codigo = institucionPedida(req);
      const dni = soloDigitos(req.body && req.body.dni);
      if (!codigo || dni.length < 8) return noVerificado(res);
      const { rows } = await db.consultar(
        `SELECT c.id, c.nombres, c.institucion_id
           FROM catedraticos c
           JOIN instituciones i ON i.id = c.institucion_id
          WHERE i.codigo = $1 AND i.activa
            AND regexp_replace(c.dni, '\\D', '', 'g') = $2
            AND c.activo`,
        [codigo, dni]
      );
      if (rows.length !== 1) return noVerificado(res);
      const [c] = rows;
      res.json({
        verificado: true,
        sesion: firmante.emitir({ tipo: 'CATEDRATICO', id: c.id, inst: c.institucion_id }),
        catedratico: { nombres: c.nombres }
      });
    } catch (error) {
      next(error);
    }
  });

  const exigirSesionDeVoz = (tipos) => async (req, res, next) => {
    const sesion = firmante.leer(req.body && req.body.sesion);
    if (!sesion || !tipos.includes(sesion.tipo) || !esUuid(sesion.id) || !esUuid(sesion.inst)) {
      return res.status(403).json({ error: 'Verifique primero la identidad de quien llama.' });
    }
    try {
      const consulta = sesion.tipo === 'ESTUDIANTE'
        ? `SELECT 1 FROM estudiantes e JOIN instituciones i ON i.id = e.institucion_id
            WHERE e.id = $1 AND e.institucion_id = $2 AND e.estado = 'ACTIVO' AND i.activa`
        : `SELECT 1 FROM catedraticos c JOIN instituciones i ON i.id = c.institucion_id
            WHERE c.id = $1 AND c.institucion_id = $2 AND c.activo AND i.activa`;
      const { rows } = await db.consultar(consulta, [sesion.id, sesion.inst]);
      if (rows.length !== 1) {
        return res.status(403).json({ error: 'Verifique primero la identidad de quien llama.' });
      }
      req.sesionDeVoz = sesion;
      next();
    } catch (error) {
      next(error);
    }
  };

  const clasePedida = (req) => texto(req.body && req.body.codigoClase, 30).replace(/\s+/g, '').toUpperCase();

  rutas.post('/notas', exigirSesionDeVoz(['ESTUDIANTE']), async (req, res, next) => {
    try {
      const { id, inst } = req.sesionDeVoz;
      const { rows } = await db.consultar(
        `SELECT m.nombre AS materia, c.codigo_clase,
                g.parcial_1::float AS parcial1, g.parcial_2::float AS parcial2,
                g.parcial_3::float AS parcial3, g.acumulativo::float AS acumulativo,
                g.nota_final::float AS "notaFinal", g.aprobado
           FROM calificaciones g
           JOIN clases c ON c.id = g.clase_id
           JOIN materias m ON m.id = c.materia_id
           JOIN periodos_lectivos p ON p.id = c.periodo_id
          WHERE g.estudiante_id = $1 AND c.institucion_id = $2 AND p.activo
            AND ($3 = '' OR upper(c.codigo_clase) = $3)
          ORDER BY m.nombre`,
        [id, inst, clasePedida(req)]
      );
      res.json({ clases: rows });
    } catch (error) {
      next(error);
    }
  });

  rutas.post('/asistencia', exigirSesionDeVoz(['ESTUDIANTE']), async (req, res, next) => {
    try {
      const { id, inst } = req.sesionDeVoz;
      const { rows } = await db.consultar(
        `SELECT m.nombre AS materia, c.codigo_clase,
                count(d.id)::int AS registradas,
                count(d.id) FILTER (WHERE d.estado = 'AUSENTE')::int AS ausencias,
                count(d.id) FILTER (WHERE d.estado = 'TARDANZA')::int AS tardanzas,
                CASE WHEN count(d.id) = 0 THEN NULL ELSE
                  round(100.0 * count(d.id) FILTER (WHERE d.estado IN ('PRESENTE', 'TARDANZA', 'EXCUSA'))
                        / count(d.id))::int END AS porcentaje
           FROM estudiantes e
           JOIN clases c ON c.promocion_id = e.promocion_id AND c.institucion_id = e.institucion_id
           JOIN materias m ON m.id = c.materia_id
           JOIN periodos_lectivos p ON p.id = c.periodo_id
           LEFT JOIN sesiones_asistencia s ON s.clase_id = c.id
           LEFT JOIN detalle_asistencia d ON d.sesion_id = s.id AND d.estudiante_id = e.id
          WHERE e.id = $1 AND e.institucion_id = $2 AND p.activo AND c.activa
            AND ($3 = '' OR upper(c.codigo_clase) = $3)
          GROUP BY m.nombre, c.codigo_clase
          ORDER BY m.nombre`,
        [id, inst, clasePedida(req)]
      );
      res.json({ clases: rows });
    } catch (error) {
      next(error);
    }
  });

  rutas.post('/horario', exigirSesionDeVoz(['ESTUDIANTE', 'CATEDRATICO']), async (req, res, next) => {
    try {
      const { tipo, id, inst } = req.sesionDeVoz;
      const dia = sinAcentos(texto(req.body && req.body.dia, 15));
      if (dia && !DIAS.includes(dia)) return res.status(422).json({ error: 'Dia no reconocido.' });
      const filtro = tipo === 'CATEDRATICO'
        ? 'c.catedratico_id = $1'
        : 'c.promocion_id = (SELECT promocion_id FROM estudiantes WHERE id = $1)';
      const { rows } = await db.consultar(
        `SELECT m.nombre AS materia, c.codigo_clase, c.horario, c.aula
           FROM clases c
           JOIN materias m ON m.id = c.materia_id
           JOIN periodos_lectivos p ON p.id = c.periodo_id
          WHERE ${filtro} AND c.institucion_id = $2 AND p.activo AND c.activa
          ORDER BY m.nombre`,
        [id, inst]
      );
      const clases = dia ? rows.filter((r) => sinAcentos(r.horario).includes(dia)) : rows;
      res.json({ clases });
    } catch (error) {
      next(error);
    }
  });

  rutas.use((req, res) => res.status(404).json({ error: 'Recurso no encontrado.' }));
  return rutas;
}

module.exports = { crearRutasDeVoz, crearFirmante };
