'use strict';

// Validacion de la estructura academica (SMS-02). Funciones puras: reciben el
// cuerpo de la peticion y devuelven { datos, campos }. Si `campos` trae algo, la
// peticion se rechaza con 422 nombrando cada campo y su motivo. Un campo que no
// esta en la lista se rechaza tambien: nada llega a la base sin haberse revisado.

const MODALIDADES = ['SEMESTRAL', 'CUATRIMESTRAL', 'MODULAR', 'ANUAL'];
const CODIGO = /^[A-Z0-9][A-Z0-9-]*$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaValida(texto) {
  if (typeof texto !== 'string' || !FECHA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

const esEntero = (v) => Number.isInteger(v);

// Cada regla devuelve un mensaje si el valor no sirve, o nada si sirve.
const reglas = {
  codigo: (max) => (v) => {
    if (typeof v !== 'string' || !v.trim()) return 'Es obligatorio.';
    if (v.trim().length > max) return `Admite hasta ${max} caracteres.`;
    if (!CODIGO.test(v.trim().toUpperCase())) return 'Solo letras, numeros y guiones, empezando por letra o numero.';
    return null;
  },
  texto: (max, { obligatorio = true } = {}) => (v) => {
    if (v === undefined || v === null || v === '') return obligatorio ? 'Es obligatorio.' : null;
    if (typeof v !== 'string') return 'Debe ser texto.';
    if (obligatorio && !v.trim()) return 'Es obligatorio.';
    if (v.length > max) return `Admite hasta ${max} caracteres.`;
    return null;
  },
  entero: (min, max) => (v) => {
    if (!esEntero(v)) return 'Debe ser un numero entero.';
    if (v < min || v > max) return `Debe estar entre ${min} y ${max}.`;
    return null;
  },
  modalidad: (v) => (MODALIDADES.includes(v) ? null : `Modalidad no admitida. Use: ${MODALIDADES.join(', ')}.`),
  fecha: (v) => (fechaValida(v) ? null : 'Debe ser una fecha valida con formato AAAA-MM-DD.'),
  booleano: (v) => (typeof v === 'boolean' ? null : 'Debe ser verdadero o falso.')
};

const ESQUEMAS = {
  periodo: {
    campos: {
      codigo: reglas.codigo(30), nombre: reglas.texto(100), modalidad: reglas.modalidad,
      fecha_inicio: reglas.fecha, fecha_fin: reglas.fecha, activo: reglas.booleano
    },
    obligatorios: ['codigo', 'nombre', 'modalidad', 'fecha_inicio', 'fecha_fin'],
    cruzadas: (d, campos) => {
      if (d.fecha_inicio && d.fecha_fin && !campos.fecha_inicio && !campos.fecha_fin && d.fecha_fin <= d.fecha_inicio) {
        campos.fecha_fin = 'Debe ser posterior a la fecha de inicio.';
      }
    }
  },
  promocion: {
    campos: {
      codigo: reglas.codigo(30), nombre: reglas.texto(120), anio_ingreso: reglas.entero(1950, 2100),
      anio_egreso: reglas.entero(1950, 2110), descripcion: reglas.texto(500, { obligatorio: false }), activa: reglas.booleano
    },
    obligatorios: ['codigo', 'nombre', 'anio_ingreso', 'anio_egreso'],
    cruzadas: (d, campos) => {
      if (esEntero(d.anio_ingreso) && esEntero(d.anio_egreso) && !campos.anio_ingreso && !campos.anio_egreso) {
        if (d.anio_egreso < d.anio_ingreso) campos.anio_egreso = 'No puede ser anterior al anio de ingreso.';
        else if (d.anio_egreso - d.anio_ingreso > 10) campos.anio_egreso = 'Una promocion no dura mas de 10 anios.';
      }
    }
  },
  materia: {
    campos: {
      codigo: reglas.codigo(20), nombre: reglas.texto(120), unidades_valorativas: reglas.entero(1, 20),
      horas_semanales: reglas.entero(1, 40), descripcion: reglas.texto(500, { obligatorio: false }), activa: reglas.booleano
    },
    obligatorios: ['codigo', 'nombre'],
    cruzadas: () => {}
  }
};

// actual: al editar, la fila guardada; las reglas cruzadas se aplican sobre la
// combinacion (lo guardado mas lo que cambia), no solo sobre lo enviado.
function validar(tipo, cuerpo, { parcial = false, actual = {} } = {}) {
  const esquema = ESQUEMAS[tipo];
  if (!esquema) throw new Error(`Esquema desconocido: ${tipo}`);
  const campos = {};
  const datos = {};
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { datos, campos: { _cuerpo: 'Se esperaba un objeto JSON.' } };
  }
  for (const nombre of Object.keys(cuerpo)) {
    if (!esquema.campos[nombre]) campos[nombre] = 'Campo no admitido.';
  }
  for (const [nombre, regla] of Object.entries(esquema.campos)) {
    const presente = Object.prototype.hasOwnProperty.call(cuerpo, nombre);
    if (!presente) {
      if (!parcial && esquema.obligatorios.includes(nombre)) campos[nombre] = 'Es obligatorio.';
      continue;
    }
    const error = regla(cuerpo[nombre]);
    if (error) { campos[nombre] = error; continue; }
    const valor = cuerpo[nombre];
    datos[nombre] = nombre === 'codigo' ? valor.trim().toUpperCase() : (typeof valor === 'string' ? valor.trim() : valor);
  }
  if (parcial && Object.keys(cuerpo).length === 0) campos._cuerpo = 'No hay nada que cambiar.';
  esquema.cruzadas({ ...actual, ...datos }, campos);
  return { datos, campos };
}

module.exports = { validar, fechaValida, MODALIDADES, ESQUEMAS };
