import { mkdir, writeFile } from 'node:fs/promises';
import { createHiggsfieldClient } from '@higgsfield/client/v2';
import { crearSolicitud, obtenerVideo, SALUDO } from './solicitud.ts';

async function ejecutar() {
  const solicitud = crearSolicitud();
  if (!process.argv.includes('--generar')) {
    console.log(JSON.stringify({ ...solicitud, saludo: SALUDO, estado: 'Preparado; no se envió ningún pedido.' }, null, 2));
    return;
  }
  if (!process.env.HF_CREDENTIALS) throw new Error('Falta HF_CREDENTIALS. Configúrela de forma segura antes de generar.');
  const cliente = createHiggsfieldClient({
    apiKey: process.env.HF_CREDENTIALS,
    apiSecret: process.env.HF_CREDENTIALS,
    headers: { Authorization: `Key ${process.env.HF_CREDENTIALS}` },
    maxRetries: 0,
    maxPollTime: 600000
  });
  const resultado = await cliente.subscribe(solicitud.endpoint, { input: solicitud.input, withPolling: true });
  const video = obtenerVideo(resultado);
  await mkdir(new URL('./salidas/', import.meta.url), { recursive: true });
  const archivo = new URL(`./salidas/video-${Date.now()}.json`, import.meta.url);
  await writeFile(archivo, JSON.stringify({ requestId: resultado.request_id, video, endpoint: solicitud.endpoint }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log('Video generado. El enlace está guardado en salidas/.');
}

ejecutar().catch(() => {
  console.error('No se completó la generación. Compruebe HF_CREDENTIALS, saldo, acceso al modelo y estado del pedido en Higgsfield. No se reintentará automáticamente.');
  process.exitCode = 1;
});
