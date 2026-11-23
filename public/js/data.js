const MODALIDADES_PERIODO = [
  { codigo: 'SEMESTRAL', etiqueta: 'Semestral' },
  { codigo: 'CUATRIMESTRAL', etiqueta: 'Cuatrimestral' },
  { codigo: 'MODULAR', etiqueta: 'Modular' },
  { codigo: 'ANUAL', etiqueta: 'Año lectivo' }
];

const INITIAL_DATA = {
  periodos: [],
  promociones: [],
  catedraticos: [],
  estudiantes: [],
  materias: [],
  clases: [],
  calificaciones: [],
  asistencias: []
};

function emptyStore() {
  return JSON.parse(JSON.stringify(INITIAL_DATA));
}
