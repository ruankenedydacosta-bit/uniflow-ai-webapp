import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceHandlerRegistry } from './voiceHandlerRegistry.js';

test('rerender/mudança de handler do mesmo owner lógico não cancela captura', () => {
  let cancellations = 0;
  const registry = createVoiceHandlerRegistry(() => { cancellations += 1; });
  const transcripts = [];
  registry.register({ onFinalTranscript: (text) => transcripts.push(`old:${text}`) });
  registry.beginCapture();
  registry.updateHandlers({ onFinalTranscript: (text) => transcripts.push(`new:${text}`) });
  registry.finishCapture('olá');

  assert.equal(cancellations, 0);
  assert.deepEqual(transcripts, ['new:olá']);
});

test('troca real de rota e unmount cancelam captura do owner removido', () => {
  for (const transition of ['route', 'unmount']) {
    let cancellations = 0;
    const registry = createVoiceHandlerRegistry(() => { cancellations += 1; });
    const unregister = registry.register({});
    registry.beginCapture();
    unregister(transition);
    assert.equal(cancellations, 1, transition);
  }
});

test('cleanup tardio de A não cancela captura B', () => {
  let cancellations = 0;
  const registry = createVoiceHandlerRegistry(() => { cancellations += 1; });
  const unregisterA = registry.register({});
  registry.beginCapture();
  registry.finishCapture('A');
  registry.register({});
  registry.beginCapture();
  unregisterA('late-cleanup');

  assert.equal(cancellations, 0);
  assert.equal(registry.hasCaptureOwner(), true);
});
