import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { recordBrowserSpeechDiagnostic } from './voiceTtsTelemetry.js';

const hookSource = fs.readFileSync(new URL('./useUniVoiceTts.js', import.meta.url), 'utf8');
const messageBubbleSource = fs.readFileSync(
  new URL('../uni-chat/components/MessageBubble.jsx', import.meta.url),
  'utf8',
);

test('retry manual tenta o caminho sincronico antes de qualquer preparePlayback assíncrono', () => {
  const directIndex = hookSource.indexOf('provider.speakFromUserGesture?.(sanitized, callbacks)');
  const prepareIndex = hookSource.indexOf('await preparePlayback()', directIndex);
  assert.ok(directIndex > 0);
  assert.ok(prepareIndex > directIndex);
});

test('hook central resolve o provider salvo no perfil para todos os consumidores', () => {
  assert.match(hookSource, /const \{ user, profile \} = useSession\(\)/);
  assert.match(hookSource, /resolveVoiceProvider\(profile\?\.voice_provider\)/);
  assert.match(hookSource, /selectedProvider,/);
});

test('falha de TTS preserva a resposta textual e oferece retry manual', () => {
  assert.match(messageBubbleSource, /<SafeMarkdown className=\{styles\.text\}>\{resolvedText\}<\/SafeMarkdown>/);
  assert.match(messageBubbleSource, /isErrorVoice\s*\? 'Tentar novamente'/);
  assert.match(messageBubbleSource, /onSpeakMessage\?\.\(message\)/);
});

test('diagnóstico nativo registra somente estado técnico e o erro real', () => {
  const logs = [];
  const result = recordBrowserSpeechDiagnostic({
    stage: 'error',
    supported: true,
    voicesCount: 3,
    selectedVoiceName: 'Português Brasil',
    selectedVoiceLanguage: 'pt-BR',
    selectedVoiceLocalService: true,
    speaking: false,
    pending: false,
    paused: false,
    nativeError: 'not-allowed',
    text: 'conteúdo proibido',
    userId: 'id-proibido',
  }, {
    env: { VITE_UNI_VOICE_NATIVE_TTS_ENABLED: 'true' },
    logger: (...args) => logs.push(args),
  });

  assert.equal(result.nativeError, 'not-allowed');
  assert.equal(result.selectedVoiceLanguage, 'pt-BR');
  assert.equal('text' in result, false);
  assert.equal('userId' in result, false);
  assert.equal(logs.length, 1);
});
