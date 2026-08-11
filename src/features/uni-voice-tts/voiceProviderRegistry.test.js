import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VOICE_PROVIDER_IDS,
  VOICE_PROVIDER_OPTIONS,
  createVoiceProviderRegistry,
  isValidVoiceProvider,
  resolveVoiceProvider,
} from './voiceProviderRegistry.js';

test('registro expõe somente native e elevenlabs com metadados públicos', () => {
  assert.deepEqual(VOICE_PROVIDER_OPTIONS.map(({ id }) => id), ['native', 'elevenlabs']);
  assert.equal(VOICE_PROVIDER_OPTIONS[0].badge, 'Incluída');
  assert.equal(VOICE_PROVIDER_OPTIONS[1].badge, 'Premium');
});

test('resolver é determinístico e usa native como fallback seguro', () => {
  assert.equal(resolveVoiceProvider('native'), VOICE_PROVIDER_IDS.NATIVE);
  assert.equal(resolveVoiceProvider('elevenlabs'), VOICE_PROVIDER_IDS.ELEVENLABS);
  assert.equal(resolveVoiceProvider('unknown'), VOICE_PROVIDER_IDS.NATIVE);
  assert.equal(isValidVoiceProvider('unknown'), false);
});

test('registro resolve providers sem expor condicionais aos consumidores', () => {
  const native = { providerName: 'browser' };
  const elevenlabs = { providerName: 'elevenlabs' };
  const registry = createVoiceProviderRegistry({ native, elevenlabs });

  assert.equal(registry.get('native'), native);
  assert.equal(registry.get('elevenlabs'), elevenlabs);
  assert.equal(registry.get('future-provider'), native);
});
