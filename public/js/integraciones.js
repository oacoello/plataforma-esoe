const integraciones = { cargando: false, error: '', plataformas: [], cursos: [], catalogo: [], mias: [] };

const estadoPortales = { cargado: false, cargando: false, porClave: {} };

async function cargarEstadoPortales() {
  if (estadoPortales.cargado || estadoPortales.cargando) return;
  estadoPortales.cargando = true;
  try {
    const respuesta = await fetch('/api/integraciones/estado', { headers: { Accept: 'application/json' } });
    if (respuesta.ok) {
      const { portales } = await respuesta.json();
      estadoPortales.porClave = Object.fromEntries((portales || []).map((p) => [p.clave, p]));
    }
  } catch {}
  estadoPortales.cargado = true;
  estadoPortales.cargando = false;
  document.querySelectorAll('[data-estado-portal]').forEach((nodo) => {
    nodo.outerHTML = insigniaDePortal(nodo.dataset.estadoPortal);
  });
}

function insigniaDePortal(clave) {
  if (!estadoPortales.cargado) return `<span class="badge badge-neutral" data-estado-portal="${esc(clave)}">Comprobando…</span>`;
  const estado = estadoPortales.porClave[clave];
  if (!estado) return '<span class="badge badge-neutral">Sin datos</span>';
  if (!estado.enLinea) return '<span class="badge badge-neutral">Sin respuesta</span>';
  if (estado.enMantenimiento) return '<span class="badge badge-neutral">En mantenimiento</span>';
  if (!estado.serviciosWeb) return '<span class="badge badge-choco">En línea · sin vinculación (servicios web apagados)</span>';
  return '<span class="badge badge-olive">En línea · admite vinculación</span>';
}

function renderPortalesInstitucionales() {
  cargarEstadoPortales();
  const tarjetas = PLATAFORMAS_PUBLICAS.map((plataforma) => `
    <article class="portal-institucional"><h3>${esc(plataforma.nombre)}</h3>${insigniaDePortal(plataforma.clave)}<p>${esc(plataforma.descripcion)}</p>
      <a class="btn btn-outline" href="${esc(plataforma.urlBase)}" target="_blank" rel="noopener noreferrer">Abrir portal<span class="solo-lectores"> ${esc(plataforma.nombre)}</span> ↗</a>
    </article>`).join('');
  return `<section aria-label="Portales institucionales"><h2>Portales de formación</h2><p>Acceda a los sitios oficiales. Cada portal conserva su propio inicio de sesión.</p><div class="portales-institucionales">${tarjetas}</div></section>`;
}

function renderIntegracionesView() {
  if (!sesionReal.activa) {
    return renderPortalesInstitucionales() + '<p>Para consultar aquí sus cursos y calificaciones, inicie sesión con su cuenta institucional y vincule su propia cuenta.</p>';
  }
  if (!sesionReal.integraciones) {
    return renderPortalesInstitucionales() + '<p>La administración debe habilitar la vinculación de cuentas para consultar aquí sus cursos y calificaciones.</p>';
  }
  if (!integraciones.cargando) cargarIntegraciones();
  return '<div id="integraciones-contenido"></div>';
}

function pintarIntegraciones() {
  const contenedor = document.getElementById('integraciones-contenido');
  if (!contenedor) return;
  const esAdmin = appState.currentRole === 'ADMIN';

  if (integraciones.cargando) {
    contenedor.innerHTML = emptyState('Cargando…');
    return;
  }
  if (integraciones.error) {
    contenedor.innerHTML = `${emptyState(esc(integraciones.error))}
      <div class="toolbar" style="margin-top:16px;"><button type="button" class="btn btn-outline" data-on-click="cargarIntegraciones()">Reintentar</button></div>`;
    return;
  }

  const registradas = new Set(integraciones.plataformas.map((p) => p.urlBase));
  const codigoActivo = typeof institucionActual === 'function' && institucionActual() ? institucionActual().codigo : '';
  const sugeridas = integraciones.catalogo.filter((p) => !registradas.has(p.urlBase) && (!codigoActivo || p.institucion === codigoActivo));

  const filas = integraciones.plataformas.map((p) => `
    <tr>
      <td><strong>${esc(p.nombre)}</strong><br><small>${esc(p.urlBase)}</small></td>
      <td>${p.vinculada
        ? `<span class="badge badge-olive">Vinculada</span><br><small>${esc(p.cuenta)}</small>`
        : '<span class="badge badge-neutral">Sin vincular</span>'}</td>
      <td style="text-align:right;">
        ${p.vinculada
          ? `<button type="button" class="btn btn-outline btn-sm" data-id="${esc(p.id)}" data-on-click="desvincularCuentaExterna(this.dataset.id)">Desvincular</button>`
          : `<button type="button" class="btn btn-primary btn-sm" data-id="${esc(p.id)}" data-on-click="abrirVinculacion(this.dataset.id)">Vincular mi cuenta</button>`}
        ${esAdmin ? `<button type="button" class="btn btn-outline btn-sm" data-id="${esc(p.id)}" data-on-click="abrirPermisoInstitucional(this.dataset.id)">${p.detectable ? 'Permiso activo' : 'Permiso institucional'}</button>
          <button type="button" class="btn btn-outline btn-sm" data-id="${esc(p.id)}" data-on-click="probarPlataforma(this.dataset.id)">Probar</button>
          <button type="button" class="btn btn-outline btn-sm" data-id="${esc(p.id)}" data-on-click="eliminarPlataforma(this.dataset.id)">Eliminar</button>` : ''}
      </td>
    </tr>`).join('');

  const bloqueCursos = integraciones.cursos.map((grupo) => {
    if (grupo.estado === 'REVINCULAR') {
      return `<h3 class="section-title">${esc(grupo.nombre)}</h3>${emptyState('La plataforma dejó de aceptar la conexión. Vuelva a vincular su cuenta.')}`;
    }
    if (grupo.estado !== 'OK') {
      return `<h3 class="section-title">${esc(grupo.nombre)}</h3>${emptyState('La plataforma no responde en este momento.')}`;
    }
    if (grupo.cursos.length === 0) {
      return `<h3 class="section-title">${esc(grupo.nombre)}</h3>${emptyState('No tiene cursos en esta plataforma.')}`;
    }
    const cursos = grupo.cursos.map((c) => `
      <tr>
        <td><strong>${esc(c.nombre)}</strong><br><small>${esc(c.codigo)}</small></td>
        <td>${c.avance === null ? '—' : `${esc(c.avance)} %`}</td>
        <td>${c.calificacion === null ? '—' : esc(c.calificacion)}</td>
        <td>${c.completado ? '<span class="badge badge-olive">Completado</span>' : '<span class="badge badge-neutral">En curso</span>'}</td>
        <td style="text-align:right;"><a class="btn btn-outline btn-sm" href="${esc(c.enlace)}" target="_blank" rel="noopener noreferrer">Abrir</a></td>
      </tr>`).join('');
    return `<h3 class="section-title">${esc(grupo.nombre)}</h3>
      <table class="data-table">
        <thead><tr><th>Curso</th><th>Avance</th><th>Calificación</th><th>Estado</th><th></th></tr></thead>
        <tbody>${cursos}</tbody>
      </table>`;
  }).join('');

  contenedor.innerHTML = renderMisPlataformas() + `
    <div class="toolbar">
      <p>Vincule su cuenta de otras plataformas para ver aquí sus cursos, su avance y sus calificaciones.</p>
      ${esAdmin ? `<button type="button" class="btn btn-primary" data-on-click="abrirNuevaPlataforma()">${ICONS.plus}<span>Agregar plataforma</span></button>` : ''}
    </div>
    ${integraciones.plataformas.length === 0
      ? emptyState(esAdmin ? 'Aún no hay plataformas registradas.' : 'La administración aún no ha registrado plataformas.')
      : `<table class="data-table">
          <thead><tr><th>Plataforma</th><th>Mi cuenta</th><th></th></tr></thead>
          <tbody>${filas}</tbody>
        </table>`}
    ${esAdmin && sugeridas.length > 0 ? `
      <h3 class="section-title">Plataformas sugeridas</h3>
      <table class="data-table"><tbody>${sugeridas.map((p) => `
        <tr>
          <td><strong>${esc(p.nombre)}</strong><br><small>${esc(p.descripcion)}</small></td>
          <td style="text-align:right;"><button type="button" class="btn btn-outline btn-sm" data-clave="${esc(p.clave)}" data-on-click="agregarSugerida(this.dataset.clave)">Agregar</button></td>
        </tr>`).join('')}</tbody></table>` : ''}
    ${bloqueCursos ? `<h2 class="section-title" style="margin-top:32px;">Mis cursos en otras plataformas</h2>${bloqueCursos}` : ''}
  ` + renderPortalesInstitucionales();
}

async function cargarIntegraciones() {
  integraciones.cargando = true;
  integraciones.error = '';
  pintarIntegraciones();
  try {
    const esAdmin = appState.currentRole === 'ADMIN';
    const [plataformas, cursos, catalogo, mias] = await Promise.all([
      api('/integraciones/plataformas'),
      api('/integraciones/mis-cursos'),
      esAdmin ? api('/integraciones/catalogo') : Promise.resolve({ plataformas: [] }),
      api('/integraciones/mis-plataformas').catch(() => ({ plataformas: [] }))
    ]);
    integraciones.mias = mias.plataformas;
    integraciones.plataformas = plataformas.plataformas;
    integraciones.cursos = cursos.plataformas;
    integraciones.catalogo = catalogo.plataformas;
  } catch (error) {
    integraciones.error = error.message;
  }
  integraciones.cargando = false;
  pintarIntegraciones();
}

async function operarIntegracion(accion, mensajeDeExito) {
  try {
    await accion();
    if (mensajeDeExito) showToast(mensajeDeExito);
    closeModal();
    await cargarIntegraciones();
  } catch (error) {
    showToast(error.message);
  }
}

function abrirNuevaPlataforma() {
  openModal('Agregar plataforma', `
    <form data-on-submit="guardarNuevaPlataforma(event)">
      <div class="form-group">
        <label class="form-label" for="plataforma-nombre">Nombre</label>
        <input type="text" id="plataforma-nombre" class="form-control" maxlength="120" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="plataforma-url">Dirección del sitio Moodle</label>
        <input type="url" id="plataforma-url" class="form-control" placeholder="https://campus.ejemplo.hn" required>
      </div>
      <button type="submit" class="btn btn-primary">Verificar y agregar</button>
    </form>`);
}

function guardarNuevaPlataforma(evento) {
  evento.preventDefault();
  const cuerpo = {
    nombre: document.getElementById('plataforma-nombre').value,
    tipo: 'MOODLE',
    urlBase: document.getElementById('plataforma-url').value
  };
  operarIntegracion(() => api('/integraciones/plataformas', { metodo: 'POST', cuerpo }), 'Plataforma agregada');
}

function agregarSugerida(clave) {
  const sugerida = integraciones.catalogo.find((p) => p.clave === clave);
  if (!sugerida) return;
  const cuerpo = { nombre: sugerida.nombre, tipo: sugerida.tipo, urlBase: sugerida.urlBase };
  operarIntegracion(() => api('/integraciones/plataformas', { metodo: 'POST', cuerpo }), 'Plataforma agregada');
}

async function probarPlataforma(id) {
  try {
    const resultado = await api(`/integraciones/plataformas/${encodeURIComponent(id)}/probar`, { metodo: 'POST', cuerpo: {} });
    showToast(resultado.disponible ? 'La plataforma responde correctamente' : 'La plataforma está en mantenimiento o sin servicios web');
  } catch (error) {
    showToast(error.message);
  }
}

function eliminarPlataforma(id) {
  openModal('Eliminar plataforma', `
    <p class="confirmacion-borrado">Se eliminará la plataforma y las cuentas que los usuarios hayan vinculado a ella. Esta acción no se puede deshacer.</p>
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button type="button" class="btn btn-outline" data-on-click="closeModal()">Cancelar</button>
      <button type="button" class="btn btn-primary btn-peligro-lleno" data-id="${esc(id)}" data-on-click="confirmarEliminarPlataforma(this.dataset.id)">Eliminar plataforma</button>
    </div>`);
}

function confirmarEliminarPlataforma(id) {
  operarIntegracion(() => api(`/integraciones/plataformas/${encodeURIComponent(id)}`, { metodo: 'DELETE' }), 'Plataforma eliminada');
}

const ESTADOS_DE_INSCRIPCION = {
  VINCULADA: ['badge-olive', 'Vinculada con su cuenta'],
  INSCRITO: ['badge-olive', 'Inscrito'],
  NO_INSCRITO: ['badge-neutral', 'No inscrito'],
  SIN_PERMISO: ['badge-neutral', 'Sin comprobar'],
  SIN_DATOS: ['badge-neutral', 'Sin datos para comprobar'],
  NO_DISPONIBLE: ['badge-neutral', 'La plataforma no respondió']
};

function detalleDeInscripcion(p) {
  if (p.estado === 'VINCULADA') return `Cuenta: ${esc(p.cuenta || '')}`;
  if (p.estado === 'INSCRITO') return `Se encontró su cuenta ${esc(p.cuenta || '')} por ${p.coincidencia === 'IDENTIDAD' ? 'su número de identidad' : 'su correo verificado'}; sus cursos aparecen abajo.`;
  if (p.estado === 'NO_INSCRITO') return 'Sus datos no coinciden con ninguna cuenta de esta plataforma.';
  if (p.estado === 'SIN_PERMISO') return 'La institución de esta plataforma aún no entregó el permiso para comprobar inscripciones. Puede vincular su cuenta a mano.';
  if (p.estado === 'SIN_DATOS') return 'Su cuenta necesita un correo verificado o un expediente con número de identidad.';
  return 'Vuelva a comprobar más tarde.';
}

function renderMisPlataformas() {
  if (!integraciones.mias.length) return '';
  const filas = integraciones.mias.map((p) => {
    const [clase, etiqueta] = ESTADOS_DE_INSCRIPCION[p.estado] || ESTADOS_DE_INSCRIPCION.NO_DISPONIBLE;
    return `<tr><td><strong>${esc(p.nombre)}</strong><br><small>${esc(p.urlBase)}</small></td>
      <td><span class="badge ${clase}">${esc(etiqueta)}</span></td>
      <td><small>${detalleDeInscripcion(p)}</small></td></tr>`;
  }).join('');
  return `<section class="mis-plataformas" aria-labelledby="mis-plataformas-titulo">
      <div class="toolbar"><h2 id="mis-plataformas-titulo" class="section-title" style="margin:0;">Mis plataformas</h2>
        <button type="button" class="btn btn-outline btn-sm" data-on-click="volverAComprobarInscripciones()">Volver a comprobar</button></div>
      <table class="data-table"><thead><tr><th>Plataforma</th><th>Estado</th><th>Detalle</th></tr></thead><tbody>${filas}</tbody></table>
    </section>`;
}

async function volverAComprobarInscripciones() {
  try {
    const { plataformas } = await api('/integraciones/mis-plataformas?actualizar=1');
    integraciones.mias = plataformas;
    const cursos = await api('/integraciones/mis-cursos');
    integraciones.cursos = cursos.plataformas;
    pintarIntegraciones();
    showToast('Inscripciones comprobadas');
  } catch (error) {
    showToast(error.message);
  }
}

function abrirPermisoInstitucional(id) {
  const plataforma = integraciones.plataformas.find((p) => p.id === id);
  if (!plataforma) return;
  openModal(`Permiso institucional — ${plataforma.nombre}`, `
    <form data-on-submit="guardarPermisoInstitucional(event)">
      <input type="hidden" id="permiso-plataforma" value="${esc(id)}">
      <p>La administración de esta plataforma Moodle debe crear un servicio web con las funciones <strong>core_user_get_users_by_field</strong>, <strong>core_enrol_get_users_courses</strong> y <strong>core_webservice_get_site_info</strong>, y entregar su token. Con él, la plataforma reconoce a cada usuario solo si su correo verificado o su número de identidad coinciden con una única cuenta.</p>
      <div class="form-group">
        <label class="form-label" for="permiso-token">Token de servicio</label>
        <input type="password" id="permiso-token" class="form-control" autocomplete="off" required minlength="16" maxlength="128">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
        ${plataforma.detectable ? `<button type="button" class="btn btn-outline btn-peligro" data-id="${esc(id)}" data-on-click="quitarPermisoInstitucional(this.dataset.id)">Quitar permiso</button>` : ''}
        <button type="button" class="btn btn-outline" data-on-click="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar permiso</button>
      </div>
    </form>`);
}

function guardarPermisoInstitucional(evento) {
  evento.preventDefault();
  const id = document.getElementById('permiso-plataforma').value;
  const token = document.getElementById('permiso-token').value.trim();
  operarIntegracion(() => api(`/integraciones/plataformas/${encodeURIComponent(id)}/servicio`, { metodo: 'PUT', cuerpo: { token } }), 'Permiso guardado: las inscripciones se comprobarán solas');
}

function quitarPermisoInstitucional(id) {
  operarIntegracion(() => api(`/integraciones/plataformas/${encodeURIComponent(id)}/servicio`, { metodo: 'DELETE' }), 'Permiso retirado');
}

function abrirVinculacion(id) {
  const plataforma = integraciones.plataformas.find((p) => p.id === id);
  if (!plataforma) return;
  openModal(`Vincular cuenta — ${plataforma.nombre}`, `
    <form data-id="${esc(plataforma.id)}" data-on-submit="guardarVinculacion(event)" autocomplete="off">
      <p style="margin-bottom:16px;">Escriba el usuario y la contraseña que usa en <strong>${esc(plataforma.nombre)}</strong>.
      La contraseña se usa una sola vez para pedir una llave de acceso y no se guarda.</p>
      <div class="form-group">
        <label class="form-label" for="vinculo-usuario">Usuario en esa plataforma</label>
        <input type="text" id="vinculo-usuario" class="form-control" maxlength="150" autocomplete="off" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="vinculo-clave">Contraseña en esa plataforma</label>
        <input type="password" id="vinculo-clave" class="form-control" maxlength="300" autocomplete="off" required>
      </div>
      <button type="submit" class="btn btn-primary">Vincular</button>
    </form>`);
}

function guardarVinculacion(evento) {
  evento.preventDefault();
  const id = evento.target.dataset.id;
  const cuerpo = {
    usuario: document.getElementById('vinculo-usuario').value,
    clave: document.getElementById('vinculo-clave').value
  };
  operarIntegracion(() => api(`/integraciones/plataformas/${encodeURIComponent(id)}/cuenta`, { metodo: 'POST', cuerpo }), 'Cuenta vinculada');
}

function desvincularCuentaExterna(id) {
  operarIntegracion(() => api(`/integraciones/plataformas/${encodeURIComponent(id)}/cuenta`, { metodo: 'DELETE' }), 'Cuenta desvinculada');
}
