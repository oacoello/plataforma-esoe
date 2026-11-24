const EDICION = {
  periodo: {
    abrir: () => openModalNuevoPeriodo(), coleccion: 'periodos', ruta: '/periodos', titulo: 'Corregir periodo',
    campos: { 'per-codigo': 'codigo', 'per-nombre': 'nombre', 'per-modalidad': 'modalidad', 'per-inicio': 'fechaInicio', 'per-fin': 'fechaFin' },
    nombre: (r) => `el periodo ${r.nombre}`
  },
  promocion: {
    abrir: () => openModalNuevaPromocion(), coleccion: 'promociones', ruta: '/promociones', titulo: 'Corregir promoción',
    campos: { 'prom-codigo': 'codigo', 'prom-nombre': 'nombre', 'prom-ingreso': 'anioIngreso', 'prom-egreso': 'anioEgreso' },
    nombre: (r) => `la promoción ${r.nombre}`
  },
  materia: {
    abrir: () => openModalNuevaMateria(), coleccion: 'materias', ruta: '/materias', titulo: 'Corregir materia',
    campos: { 'mat-codigo': 'codigo', 'mat-nombre': 'nombre', 'mat-uv': 'uv' },
    nombre: (r) => `la materia ${r.codigo} - ${r.nombre}`
  },
  catedratico: {
    abrir: () => openModalNuevoCatedratico(), coleccion: 'catedraticos', ruta: '/catedraticos', titulo: 'Corregir catedrático',
    campos: { 'cat-dni': 'dni', 'cat-nombres': 'nombres', 'cat-apellidos': 'apellidos', 'cat-titulo': 'titulo',
      'cat-condicion': 'condicion', 'cat-grado': 'grado', 'cat-telefono': 'telefono' },
    nombre: (r) => `al catedrático ${r.nombres} ${r.apellidos}`
  },
  estudiante: {
    abrir: () => openModalNuevoEstudiante(), coleccion: 'estudiantes', ruta: '/estudiantes', titulo: 'Corregir expediente',
    campos: { 'est-codigo': 'codigoAlumno', 'est-dni': 'dni', 'est-nombres': 'nombres', 'est-apellidos': 'apellidos',
      'est-condicion': 'condicion', 'est-grado': 'grado', 'est-promocion': 'promocionId', 'est-nacimiento': 'fechaNacimiento',
      'est-sangre': 'tipoSangre', 'est-telefono': 'telefono', 'est-procedencia': 'procedencia', 'est-emergencia': 'contactoEmergencia' },
    nombre: (r) => `al estudiante ${r.nombres} ${r.apellidos}`
  },
  clase: {
    abrir: () => openModalNuevaClase(), coleccion: 'clases', ruta: '/clases', titulo: 'Corregir clase',
    campos: { 'cls-codigo': 'codigoClase', 'cls-periodo': 'periodoId', 'cls-promocion': 'promocionId', 'cls-materia': 'materiaId',
      'cls-catedratico': 'catedraticoId', 'cls-horario': 'horario', 'cls-aula': 'aula' },
    nombre: (r) => `la clase ${r.codigoClase}`
  }
};

function puedeAdministrar() {
  return appState.currentRole === 'ADMIN';
}

function accionesRegistro(tipo, id) {
  if (!puedeAdministrar()) return '';
  return `<span class="acciones-registro">
    <button type="button" class="btn btn-outline btn-sm" data-tipo="${esc(tipo)}" data-id="${esc(id)}" data-on-click="editarRegistro(this.dataset.tipo, this.dataset.id)">Corregir</button>
    <button type="button" class="btn btn-outline btn-sm btn-peligro" data-tipo="${esc(tipo)}" data-id="${esc(id)}" data-on-click="confirmarBorrado(this.dataset.tipo, this.dataset.id)">Borrar</button>
  </span>`;
}

function valorParaCampo(campo, valor) {
  if (valor === null || valor === undefined) return '';
  if (campo.type === 'date') return String(valor).slice(0, 10);
  if (campo.id === 'est-emergencia') return String(valor).split(' · ')[0];
  return String(valor);
}

function editarRegistro(tipo, id) {
  const def = EDICION[tipo];
  if (!def || !puedeAdministrar()) return;
  const registro = store[def.coleccion].find((r) => r.id === id);
  if (!registro) { showToast('El registro ya no existe. Recargue la página.'); return; }
  def.abrir();
  edicionActiva = { tipo, id };
  Object.entries(def.campos).forEach(([idCampo, propiedad]) => {
    const campo = document.getElementById(idCampo);
    if (campo) campo.value = valorParaCampo(campo, registro[propiedad]);
  });
  const condicion = document.getElementById(tipo === 'estudiante' ? 'est-condicion' : 'cat-condicion');
  if (condicion && (tipo === 'estudiante' || tipo === 'catedratico')) {
    condicion.dispatchEvent(new Event('change', { bubbles: true }));
  }
  document.getElementById('modal-title').textContent = def.titulo;
  const enviar = document.querySelector('#modal-body-content button[type="submit"]');
  if (enviar) enviar.textContent = 'Guardar cambios';
}

function confirmarBorrado(tipo, id) {
  const def = EDICION[tipo];
  if (!def || !puedeAdministrar()) return;
  const registro = store[def.coleccion].find((r) => r.id === id);
  if (!registro) return;
  openModal('Confirmar borrado', `
    <p class="confirmacion-borrado">Va a borrar ${esc(def.nombre(registro))}. Esta acción no se puede deshacer.</p>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button type="button" class="btn btn-outline" data-on-click="closeModal()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-peligro-lleno" data-tipo="${esc(tipo)}" data-id="${esc(id)}" data-on-click="borrarRegistro(this.dataset.tipo, this.dataset.id)">Borrar definitivamente</button>
    </div>`);
}

async function borrarRegistro(tipo, id) {
  const def = EDICION[tipo];
  if (!def) return;
  try {
    await api(`${def.ruta}/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
  } catch (error) {
    showToast(motivoDelServidor(error));
    return;
  }
  closeModal();
  await recargarDesdeServidor();
  showToast('Registro borrado');
}
