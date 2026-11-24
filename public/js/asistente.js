'use strict';

(function iniciarAsistente() {
  const contenedor = document.createElement('aside');
  contenedor.className = 'asistente';
  contenedor.setAttribute('aria-label', 'Asistente ESOE');
  contenedor.innerHTML = `
    <button type="button" class="btn asistente-abrir" aria-expanded="false" aria-controls="asistente-panel">Asistente ESOE</button>
    <section id="asistente-panel" class="asistente-panel" aria-labelledby="asistente-titulo" hidden>
      <header class="asistente-cabecera">
        <img src="img/escudo-esoe.svg" alt="" width="48" height="52">
        <div><h2 id="asistente-titulo">Asistente ESOE</h2><p>Orientación de la plataforma</p></div>
        <button type="button" class="btn btn-outline asistente-cerrar" aria-label="Cerrar asistente">×</button>
      </header>
      <p>Buenas, le atiende el Asistente ESOE. ¿De qué institución nos visita?</p>
      <label for="asistente-institucion">Institución</label>
      <select id="asistente-institucion">
        <option value="">Seleccione una institución</option>
        <option>ESOE</option><option>UDH</option><option>INFOP</option><option>COPECO</option>
      </select>
      <div class="asistente-opciones" role="group" aria-label="Consultar orientación">
        <button type="button" class="btn btn-outline" data-consulta="acceso">Iniciar sesión</button>
        <button type="button" class="btn btn-outline" data-consulta="notas">Calificaciones</button>
        <button type="button" class="btn btn-outline" data-consulta="asistencia">Asistencia</button>
        <button type="button" class="btn btn-outline" data-consulta="plataformas">Otras plataformas</button>
      </div>
      <p id="asistente-respuesta" role="status" aria-live="polite">Seleccione su institución y el tema que necesita consultar.</p>
      <button type="button" class="btn asistente-escuchar">Escuchar respuesta</button>
      <button type="button" class="btn btn-outline asistente-detener" hidden>Detener voz</button>
      <p class="asistente-nota">La institución seleccionada orienta la ayuda. Sus permisos dependen de su cuenta. La lectura usa la voz disponible en su navegador.</p>
    </section>`;
  document.body.append(contenedor);
  const abrir = contenedor.querySelector('.asistente-abrir');
  const panel = contenedor.querySelector('section');
  const cerrar = contenedor.querySelector('.asistente-cerrar');
  const institucion = contenedor.querySelector('select');
  const respuesta = contenedor.querySelector('#asistente-respuesta');
  const escuchar = contenedor.querySelector('.asistente-escuchar');
  const detener = contenedor.querySelector('.asistente-detener');
  const consultas = {
    acceso: 'En la pantalla de acceso, inicie sesión con su cuenta institucional. Su perfil lo asigna la administración. Si el acceso no está disponible, contacte a su institución.',
    notas: 'Después de iniciar sesión, abra Boletín y Expediente para consultar sus calificaciones. El personal autorizado registra las notas en Libro de Calificaciones.',
    asistencia: 'Después de iniciar sesión, abra Control de Asistencia. Cada cuenta puede consultar o registrar información según su perfil y sus clases.',
    plataformas: 'Después de iniciar sesión, abra Otras Plataformas para revisar las conexiones disponibles. Vincule únicamente su propia cuenta.'
  };
  const vozDisponible = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let lecturaActiva = null;
  let reanudar = null;
  let voces = [];
  function cargarVoces() {
    if (vozDisponible) voces = window.speechSynthesis.getVoices();
  }
  if (vozDisponible) {
    cargarVoces();
    if (typeof window.speechSynthesis.addEventListener === 'function') window.speechSynthesis.addEventListener('voiceschanged', cargarVoces);
  }
  function vozEnEspanol() {
    const lista = voces.length ? voces : (vozDisponible ? window.speechSynthesis.getVoices() : []);
    return lista.find((voz) => voz.lang.toLowerCase() === 'es-hn')
      || lista.find((voz) => voz.lang.toLowerCase().startsWith('es-419'))
      || lista.find((voz) => voz.lang.toLowerCase().startsWith('es')) || null;
  }
  function parar() {
    lecturaActiva = null;
    clearInterval(reanudar);
    reanudar = null;
    if (vozDisponible && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) window.speechSynthesis.cancel();
    detener.hidden = true;
  }
  function ocultar() {
    parar();
    panel.hidden = true;
    abrir.setAttribute('aria-expanded', 'false');
    abrir.focus();
  }
  abrir.addEventListener('click', () => {
    if (!panel.hidden) return ocultar();
    panel.hidden = false;
    abrir.setAttribute('aria-expanded', 'true');
    cerrar.focus();
  });
  cerrar.addEventListener('click', ocultar);
  panel.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') ocultar();
  });
  institucion.addEventListener('change', () => {
    parar();
    respuesta.textContent = institucion.value
      ? `Bienvenido a la orientación para ${institucion.value}. ¿Necesita ayuda con el acceso, las calificaciones, la asistencia u otras plataformas?`
      : 'Seleccione su institución y el tema que necesita consultar.';
  });
  contenedor.querySelectorAll('[data-consulta]').forEach((boton) => {
    boton.addEventListener('click', () => {
      parar();
      respuesta.textContent = institucion.value
        ? `${institucion.value}: ${consultas[boton.dataset.consulta]}`
        : 'Primero seleccione su institución.';
      if (!institucion.value) institucion.focus();
    });
  });
  if (!vozDisponible) {
    escuchar.disabled = true;
    escuchar.textContent = 'Lectura por voz no disponible';
  }
  escuchar.addEventListener('click', () => {
    parar();
    const texto = respuesta.textContent.trim();
    if (!texto) return;
    const lectura = new SpeechSynthesisUtterance(texto);
    const voz = vozEnEspanol();
    lectura.lang = voz ? voz.lang : 'es-ES';
    if (voz) lectura.voice = voz;
    lectura.rate = 1;
    lecturaActiva = lectura;
    const terminar = () => {
      if (lecturaActiva !== lectura) return;
      lecturaActiva = null;
      clearInterval(reanudar);
      reanudar = null;
      detener.hidden = true;
    };
    lectura.onend = terminar;
    lectura.onerror = (evento) => {
      if (lecturaActiva !== lectura) return;
      terminar();
      if (['canceled', 'interrupted'].includes(evento.error)) return;
      contenedor.querySelector('.asistente-nota').textContent = 'No se pudo reproducir la voz. Puede leer la respuesta en este panel.';
    };
    detener.hidden = false;
    setTimeout(() => {
      if (lecturaActiva !== lectura) return;
      if (typeof window.speechSynthesis.resume === 'function') window.speechSynthesis.resume();
      window.speechSynthesis.speak(lectura);
      reanudar = setInterval(() => {
        if (lecturaActiva !== lectura) return;
        if (typeof window.speechSynthesis.pause === 'function' && window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);
    }, 80);
  });
  detener.addEventListener('click', parar);
  document.addEventListener('visibilitychange', () => { if (document.hidden) parar(); });
})();
