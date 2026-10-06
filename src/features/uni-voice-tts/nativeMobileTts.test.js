import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const hookSource = fs.readFileSync(new URL('./useUniVoiceTts.js', import.meta.url), 'utf8');
const messageBubbleSource = fs.readFileSync(
  new URL('../uni-chat/components/MessageBubble.jsx', import.meta.url),
  'utf8',
);

test('hook central usa só a voz da Uni, sem voz do navegador nem como reserva', () => {
  assert.match(hookSource, /createElevenLabsTtsProvider\(\{/);
  assert.doesNotMatch(hookSource, /createBrowserSpeechTtsProvider|createFallbackVoiceTtsProvider|speakFromUserGesture/);
  assert.doesNotMatch(hookSource, /voice_provider/);
});

test('falha de TTS preserva a resposta textual e oferece retry manual', () => {
  assert.match(messageBubbleSource, /<SafeMarkdown className=\{styles\.text\}>\{resolvedText\}<\/SafeMarkdown>/);
  assert.match(messageBubbleSource, /isErrorVoice\s*\? 'Tentar novamente'/);
  assert.match(messageBubbleSource, /onSpeakMessage\?\.\(message\)/);
});
