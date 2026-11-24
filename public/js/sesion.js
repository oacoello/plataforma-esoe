const sesionReal = { activa: false, clerk: null, integraciones: false, sinServidor: false, nombre: '', correo: '' };

const APARIENCIA_ACCESO = {
  variables: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontFamilyButtons: "'DM Sans', system-ui, sans-serif",
    borderRadius: '14px',
    colorPrimary: '#0A2A35',
    colorText: '#0F2A33',
    colorTextSecondary: '#41606B',
    colorInputBackground: 'rgba(255, 255, 255, 0.72)',
    colorInputText: '#0F2A33',
    colorDanger: '#B8440C'
  },
  layout: { socialButtonsPlacement: 'bottom', socialButtonsVariant: 'blockButton', showOptionalFields: false },
  elements: {
    rootBox: 'acceso-raiz',
    cardBox: 'acceso-tarjeta',
    card: 'acceso-tarjeta-interior',
    header: 'acceso-oculto',
    socialButtonsRoot: 'acceso-oculto',
    dividerRow: 'acceso-oculto',
    footer: 'acceso-pie',
    footerAction: 'acceso-oculto',
    formFieldLabel: 'acceso-etiqueta',
    formFieldInput: 'acceso-campo',
    formButtonPrimary: 'acceso-boton',
    identityPreview: 'acceso-identidad',
    formFieldAction: 'acceso-enlace',
    footerActionLink: 'acceso-enlace'
  }
};

function esc(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cargarScript(src, atributos) {
  return new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    Object.entries(atributos || {}).forEach(([clave, valor]) => script.setAttribute(clave, valor));
    script.onload = resolver;
    script.onerror = () => rechazar(new Error('No se pudo cargar el inicio de sesion.'));
    document.head.appendChild(script);
  });
}

class ErrorDeApi extends Error {
  constructor(estado, cuerpo) {
    super((cuerpo && cuerpo.error) || 'No se pudo completar la operacion.');
    this.estado = estado;
    this.codigo = cuerpo && cuerpo.codigo;
    this.campos = cuerpo && cuerpo.campos;
  }
}

async function api(ruta, opciones) {
  const { metodo = 'GET', cuerpo } = opciones || {};
  const cabeceras = { Accept: 'application/json' };
  if (sesionReal.clerk && sesionReal.clerk.session) {
    cabeceras.Authorization = `Bearer ${await sesionReal.clerk.session.getToken()}`;
  }
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  const respuesta = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
  });
  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) throw new ErrorDeApi(respuesta.status, datos);
  return datos;
}

function mostrarAvisoDeAcceso(texto) {
  const aviso = document.getElementById('login-aviso');
  aviso.textContent = texto;
  aviso.classList.toggle('hidden', !texto);
}

async function entrarConSesionReal() {
  const clerk = sesionReal.clerk;
  let identidad;
  try {
    identidad = await api('/sesion');
  } catch (error) {
    document.getElementById('login-clerk').innerHTML = '';
    mostrarAvisoDeAcceso(sesionReal.sinServidor
      ? 'Sesión iniciada. Este sitio no tiene acceso a los datos académicos: entre por la dirección institucional de la plataforma.'
      : error.estado === 403
      ? 'Su cuenta todavía no tiene un rol asignado. Solicítelo a la administración.'
      : 'No se pudo validar la sesión. Intente de nuevo.');
    const salir = document.getElementById('login-salir');
    salir.classList.remove('hidden');
    return;
  }

  const usuario = clerk.user || {};
  sesionReal.nombre = usuario.fullName || usuario.username || '';
  sesionReal.correo = (usuario.primaryEmailAddress && usuario.primaryEmailAddress.emailAddress) || '';
  appState.authenticated = true;
  appState.currentRole = identidad.rol;
  appState.currentView = identidad.rol === 'ESTUDIANTE' ? 'boletin' : 'dashboard';

  store = emptyStore();
  await cargarDesdeServidor();

  mostrarPantalla('app');
  renderSidebarAndHeader();
  renderMainView();
}

async function iniciarSesionReal(configuracion) {
  const { llavePublica, dominio } = configuracion.autenticacion;
  await cargarScript(`https://${dominio}/npm/@clerk/ui@1/dist/ui.browser.js`);
  await cargarScript(`https://${dominio}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, {
    'data-clerk-publishable-key': llavePublica
  });
  const regreso = window.location.origin + window.location.pathname;
  await window.Clerk.load({
    ui: { ClerkUI: window.__internal_ClerkUICtor },
    signInForceRedirectUrl: regreso,
    signUpForceRedirectUrl: regreso,
    afterSignOutUrl: regreso,
    localization: window.LOCALIZACION_ES
  });

  sesionReal.activa = true;
  sesionReal.clerk = window.Clerk;
  sesionReal.integraciones = Boolean(configuracion.integraciones);
  sesionReal.sinServidor = Boolean(configuracion.sinServidor);

  document.getElementById('login-estado').classList.add('hidden');

  if (sesionReal.clerk.isSignedIn) {
    await entrarConSesionReal();
  } else {
    sesionReal.clerk.mountSignIn(document.getElementById('login-clerk'), { appearance: APARIENCIA_ACCESO, routing: 'virtual', forceRedirectUrl: regreso, fallbackRedirectUrl: regreso });
    sesionReal.clerk.addListener(({ session }) => {
      if (session && !appState.authenticated) entrarConSesionReal();
    });
  }
}

async function cerrarSesionReal() {
  await sesionReal.clerk.signOut({ redirectUrl: window.location.origin + window.location.pathname });
  window.location.reload();
}

async function leerJson(ruta) {
  try {
    const respuesta = await fetch(ruta, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch {
    return null;
  }
}

async function leerConfiguracion() {
  const delServidor = await leerJson('/api/config');
  if (delServidor) return delServidor;
  const publica = await leerJson('config-publica.json');
  return publica ? { ...publica, sinServidor: true } : null;
}

async function iniciarPlataforma() {
  const estado = document.getElementById('login-estado');
  const noDisponible = () => {
    estado.classList.remove('hidden');
    estado.querySelector('p').textContent = 'El acceso institucional no está disponible en este sitio. Contacte con la administración o vuelva a intentarlo más tarde. Por seguridad, el acceso requiere verificar su cuenta.';
  };
  if (window.location.protocol === 'file:') return noDisponible();
  const configuracion = await leerConfiguracion();
  if (!configuracion || !configuracion.autenticacion) return noDisponible();

  estado.classList.add('hidden');
  try {
    await iniciarSesionReal(configuracion);
  } catch {
    noDisponible();
    mostrarAvisoDeAcceso('No se pudo cargar el inicio de sesión. Revise su conexión y recargue la página.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reintentar-acceso').addEventListener('click', () => window.location.reload());
  iniciarPlataforma();
});
