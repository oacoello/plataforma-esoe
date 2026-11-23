(function (raiz) {
  'use strict';

const PLATAFORMAS_CONOCIDAS = Object.freeze([
  Object.freeze({
    clave: 'infop-elearning',
    nombre: 'INFOP — E-Learning',
    tipo: 'MOODLE',
    urlBase: 'https://plataformavirtual.infop.hn',
    descripcion: 'Cursos virtuales del Instituto Nacional de Formación Profesional.'
  }),
  Object.freeze({
    clave: 'infop-academias',
    nombre: 'INFOP — Academias',
    tipo: 'MOODLE',
    urlBase: 'https://academias.infop.hn',
    descripcion: 'Academias en línea del Instituto Nacional de Formación Profesional.'
  }),
  Object.freeze({
    clave: 'udh-aula',
    nombre: 'UDH — Campus Virtual',
    tipo: 'MOODLE',
    urlBase: 'https://aula.udh.edu.hn',
    descripcion: 'Campus virtual de la Universidad de Defensa de Honduras.'
  }),
  Object.freeze({
    clave: 'copeco-cenicac',
    nombre: 'COPECO — CENICAC',
    tipo: 'MOODLE',
    urlBase: 'https://cenicac.copeco.gob.hn',
    descripcion: 'Centro de capacitación de COPECO en gestión del riesgo. Requiere que su administración active los servicios web móviles.'
  })
]);

if (typeof module !== 'undefined' && module.exports) module.exports = { PLATAFORMAS_CONOCIDAS };
else raiz.PLATAFORMAS_PUBLICAS = PLATAFORMAS_CONOCIDAS;
})(typeof window !== 'undefined' ? window : globalThis);
