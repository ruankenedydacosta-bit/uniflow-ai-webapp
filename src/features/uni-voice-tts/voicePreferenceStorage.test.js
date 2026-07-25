import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VOICE_PREFERENCE_STORAGE_KEY,
  readVoicePreferenceEnabled,
  writeVoicePreferenceEnabled,
} from './voicePreferenceStorage.js';

// ============================================================================
// ELEVEN2 -- preferencia "Permitir voz nas respostas da Uni". Comportamental
// (funcoes puras com storage injetavel), mesmo padrao ja usado por
// workspaceContextHintStorage.test.js/uniVoiceHintStorage.
// ============================================================================

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

test('padrao (sem valor salvo) e HABILITADA -- ausencia de preferencia nunca silencia a voz', () => {
  assert.equal(readVoicePreferenceEnabled(createStorage()), true);
});

test('le e escreve o valor explicito salvo', () => {
  const storage = createStorage();
  writeVoicePreferenceEnabled(false, storage);
  assert.equal(readVoicePreferenceEnabled(storage), false);
  assert.equal(storage.data.get(VOICE_PREFERENCE_STORAGE_KEY), 'false');

  writeVoicePreferenceEnabled(true, storage);
  assert.equal(readVoicePreferenceEnabled(storage), true);
});

test('storage indisponivel (null) nunca lanca -- le como habilitada, escreve e um no-op seguro', () => {
  assert.equal(readVoicePreferenceEnabled(null), true);
  assert.doesNotThrow(() => writeVoicePreferenceEnabled(false, null));
});

test('storage que lanca excecao (modo privado/quota) nunca derruba a aplicacao', () => {
  const throwingStorage = {
    getItem() { throw new Error('quota'); },
    setItem() { throw new Error('quota'); },
  };
  assert.equal(readVoicePreferenceEnabled(throwingStorage), true);
  assert.doesNotThrow(() => writeVoicePreferenceEnabled(true, throwingStorage));
});

test('chave e versionada, nunca colide com outras preferencias locais (theme, workspace hint)', () => {
  assert.equal(VOICE_PREFERENCE_STORAGE_KEY, 'uniflow.uni-voice-tts.v1.enabled');
});
