const CLAVE_INSTITUCION = 'esoe.institucion';
const institucionActiva = { esRoot: false, lista: [], id: '' };

function leerInstitucionElegida() {
  try { return sessionStorage.getItem(CLAVE_INSTITUCION) || ''; } catch { return ''; }
}

function guardarInstitucionElegida(id) {
  try {
    if (id) sessionStorage.setItem(CLAVE_INSTITUCION, id);
    else sessionStorage.removeItem(CLAVE_INSTITUCION);
  } catch {}
}

function institucionActual() {
  return institucionActiva.lista.find((i) => i.id === institucionActiva.id) || null;
}

async function cargarInstituciones() {
  try {
    const respuesta = await api('/instituciones');
    institucionActiva.esRoot = Boolean(respuesta.esRoot);
    institucionActiva.lista = respuesta.instituciones || [];
    institucionActiva.id = respuesta.institucionActivaId || '';
  } catch {
    institucionActiva.lista = [];
  }
  pintarSelectorInstitucion();
}

function pintarSelectorInstitucion() {
  const barra = document.querySelector('.topbar-right');
  if (!barra) return;
  let contenedor = document.getElementById('selector-institucion');
  if (!contenedor) {
    contenedor = document.createElement('div');
    contenedor.id = 'selector-institucion';
    contenedor.className = 'selector-institucion';
    barra.prepend(contenedor);
  }
  const actual = institucionActual();
  if (!actual) { contenedor.hidden = true; return; }
  contenedor.hidden = false;
  if (!institucionActiva.esRoot) {
    contenedor.innerHTML = `<span class="institucion-chip" title="${esc(actual.nombre)}">${esc(actual.siglas || actual.codigo)}</span>`;
    return;
  }
  contenedor.innerHTML = `
    <label for="institucion-elegida" class="solo-lectores">Institución que administra</label>
    <select id="institucion-elegida" class="form-control" title="Institución que administra" data-on-change="cambiarInstitucion(this.value)">
      ${institucionActiva.lista.map((i) => `<option value="${esc(i.id)}" ${i.id === actual.id ? 'selected' : ''}>${esc(i.siglas || i.codigo)}</option>`).join('')}
    </select>`;
}

async function cambiarInstitucion(id) {
  if (!institucionActiva.esRoot || id === institucionActiva.id) return;
  guardarInstitucionElegida(id);
  if (typeof integraciones !== 'undefined') {
    integraciones.plataformas = [];
    integraciones.catalogo = [];
    integraciones.cursos = [];
    integraciones.cargando = false;
  }
  await cargarInstituciones();
  await recargarDesdeServidor();
  const actual = institucionActual();
  if (actual) showToast(`Administrando ${actual.nombre}`);
}
