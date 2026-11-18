'use strict';

// Validacion de la estructura academica (SMS-02). Funciones puras: reciben el
// cuerpo de la peticion y devuelven { datos, campos }. Si `campos` trae algo, la
// peticion se rechaza con 422 nombrando cada campo y su motivo. Un campo que no
// esta en la lista se rechaza tambien: nada llega a la base sin haberse revisado.

const MODALIDADES = ['SEMESTRAL', 'CUATRIMESTRAL', 'MODULAR', 'ANUAL'];
const CONDICIONES = ['MILITAR', 'CIVIL'];
const ESTADOS_ESTUDIANTE = ['ACTIVO', 'BAJA', 'EGRESADO', 'PERMISO_ESPECIAL'];
const TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DNI = /^[A-Z0-9][A-Z0-9-]{4,24}$/;
const TELEFONO = /^\+?[0-9][0-9 ()-]{6,28}$/;
const CORREO = /^[^\s@<>"']{1,64}@[^\s@<>"']+\.[a-z]{2,}$/i;
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
  booleano: (v) => (typeof v === 'boolean' ? null : 'Debe ser verdadero o falso.'),
  // Valor de una lista cerrada; opcional admite null para borrarlo.
  opcion: (lista, { obligatorio = true } = {}) => (v) => {
    if ((v === undefined || v === null) && !obligatorio) return null;
    return lista.includes(v) ? null : `Valor no admitido. Use: ${lista.join(', ')}.`;
  },
  uuid: (v) => (typeof v === 'string' && UUID.test(v) ? null : 'Debe ser un identificador valido.'),
  // Texto con forma fija (DNI, telefono, correo). Opcional admite null o vacio.
  patron: (expresion, mensaje, max, { obligatorio = true, mayusculas = false } = {}) => (v) => {
    if (v === undefined || v === null || v === '') return obligatorio ? 'Es obligatorio.' : null;
    if (typeof v !== 'string') return 'Debe ser texto.';
    const limpio = mayusculas ? v.trim().toUpperCase() : v.trim();
    if (limpio.length > max) return `Admite hasta ${max} caracteres.`;
    return expresion.test(limpio) ? null : mensaje;
  }
};

// Reglas cruzadas comunes a los dos expedientes.
function reglasDePersona(d, campos) {
  if (d.condicion === 'CIVIL' && d.grado && !campos.grado && !campos.condicion) {
    campos.grado = 'El grado solo aplica al personal militar.';
  }
}

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
  },
  // SMS-03. Expedientes.
  estudiante: {
    campos: {
      codigo_alumno: reglas.codigo(30),
      dni: reglas.patron(DNI, 'Solo letras, numeros y guiones (5 a 25).', 25, { mayusculas: true }),
      nombres: reglas.texto(80), apellidos: reglas.texto(80),
      condicion: reglas.opcion(CONDICIONES), grado: reglas.texto(60, { obligatorio: false }),
      fecha_nacimiento: reglas.fecha,
      tipo_sangre: reglas.opcion(TIPOS_SANGRE, { obligatorio: false }),
      telefono: reglas.patron(TELEFONO, 'Telefono no valido.', 30, { obligatorio: false }),
      correo: reglas.patron(CORREO, 'Correo no valido.', 120, { obligatorio: false }),
      direccion: reglas.texto(300, { obligatorio: false }),
      lugar_procedencia: reglas.texto(100, { obligatorio: false }),
      contacto_emergencia_nombre: reglas.texto(120, { obligatorio: false }),
      contacto_emergencia_telefono: reglas.patron(TELEFONO, 'Telefono no valido.', 30, { obligatorio: false }),
      promocion_id: reglas.uuid,
      estado: reglas.opcion(ESTADOS_ESTUDIANTE)
    },
    obligatorios: ['codigo_alumno', 'dni', 'nombres', 'apellidos', 'fecha_nacimiento', 'promocion_id'],
    mayusculas: ['codigo_alumno', 'dni'],
    cruzadas: (d, campos) => {
      reglasDePersona(d, campos);
      if (d.fecha_nacimiento && !campos.fecha_nacimiento) {
        const hoy = new Date().toISOString().slice(0, 10);
        if (d.fecha_nacimiento < '1900-01-01' || d.fecha_nacimiento >= hoy) {
          campos.fecha_nacimiento = 'Debe ser una fecha pasada, posterior a 1900.';
        }
      }
    }
  },
  catedratico: {
    campos: {
      dni: reglas.patron(DNI, 'Solo letras, numeros y guiones (5 a 25).', 25, { mayusculas: true }),
      nombres: reglas.texto(80), apellidos: reglas.texto(80), titulo: reglas.texto(150),
      condicion: reglas.opcion(CONDICIONES), grado: reglas.texto(60, { obligatorio: false }),
      correo: reglas.patron(CORREO, 'Correo no valido.', 120, { obligatorio: false }),
      telefono: reglas.patron(TELEFONO, 'Telefono no valido.', 30, { obligatorio: false }),
      activo: reglas.booleano
    },
    obligatorios: ['dni', 'nombres', 'apellidos', 'titulo'],
    mayusculas: ['dni'],
    cruzadas: reglasDePersona
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
    const mayusculas = esquema.mayusculas || ['codigo'];
    if (typeof valor !== 'string') datos[nombre] = valor;
    else if (mayusculas.includes(nombre)) datos[nombre] = valor.trim().toUpperCase();
    // Un texto opcional enviado vacio se guarda como ausente, no como ''.
    else datos[nombre] = valor.trim() === '' ? null : valor.trim();
  }
  if (parcial && Object.keys(cuerpo).length === 0) campos._cuerpo = 'No hay nada que cambiar.';
  esquema.cruzadas({ ...actual, ...datos }, campos);
  return { datos, campos };
}

module.exports = { validar, fechaValida, MODALIDADES, CONDICIONES, ESTADOS_ESTUDIANTE, TIPOS_SANGRE, ESQUEMAS };
