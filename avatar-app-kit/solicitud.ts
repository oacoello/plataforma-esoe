export const SALUDO = 'Buenas, le atiende el Asistente ESOE de la Plataforma ESOE. ¿De qué institución nos llama: ESOE, UDH, INFOP o COPECO?';

export function crearSolicitud() {
  return {
    endpoint: 'bytedance/seedance-2.5/text-to-video',
    input: {
      prompt: 'A cinematic scene at sunset. A welcoming institutional virtual assistant in a modern academic reception, professional attire, warm natural light, subtle camera movement, no text or logos.',
      duration: 5,
      resolution: '720p',
      aspect_ratio: '16:9'
    }
  };
}

export function obtenerVideo(resultado: unknown) {
  if (!resultado || typeof resultado !== 'object' || !('status' in resultado) || resultado.status !== 'completed') {
    throw new Error('La generación no terminó correctamente. Revise el estado del pedido antes de crear otro.');
  }
  const video = 'video' in resultado ? resultado.video : undefined;
  const enlace = video && typeof video === 'object' && 'url' in video ? video.url : undefined;
  if (typeof enlace !== 'string') throw new Error('La API no devolvió un video HTTPS válido.');
  let url: URL;
  try { url = new URL(enlace); } catch { throw new Error('La API no devolvió un video HTTPS válido.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La API no devolvió un video HTTPS válido.');
  return url.href;
}
