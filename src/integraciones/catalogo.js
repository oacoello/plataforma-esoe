'use strict';

// Plataformas conocidas que un administrativo puede agregar con un clic.
// Verificadas (INFOP el 14-11-2026, de nuevo junto con la UDH el 19-11-2026): todas son
// Moodle con servicios web y servicio movil activos, e inicio de sesion con usuario y clave.
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
  })
]);

const TIPOS_ADMITIDOS = Object.freeze(['MOODLE']);

module.exports = { PLATAFORMAS_CONOCIDAS, TIPOS_ADMITIDOS };
