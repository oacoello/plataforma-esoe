import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerVideo } from '../solicitud.ts';

test('rechaza resultados incompletos aunque contengan un enlace', () => {
  for (const status of ['queued', 'in_progress', 'failed', 'nsfw', 'canceled']) {
    assert.throws(() => obtenerVideo({ status, video: { url: 'https://example.com/video.mp4' } }));
  }
});

test('rechaza resultados completados sin video o con protocolos inseguros', () => {
  for (const video of [undefined, null, {}, { url: 42 }, { url: 'javascript:alert(1)' }, { url: 'http://example.com/video.mp4' }, { url: 'https://usuario:clave@example.com/video.mp4' }]) {
    assert.throws(() => obtenerVideo({ status: 'completed', video }));
  }
});

test('acepta un enlace HTTPS de un resultado completado', () => {
  assert.equal(obtenerVideo({ status: 'completed', request_id: 'pedido-prueba', video: { url: 'https://example.com/video.mp4' } }), 'https://example.com/video.mp4');
});

test('rechaza respuestas ausentes y el formato incompatible de versiones anteriores', () => {
  for (const resultado of [null, undefined, 42, 'completed', { isCompleted: true, jobs: [] }]) {
    assert.throws(() => obtenerVideo(resultado));
  }
});
