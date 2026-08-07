import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// ============================================================================
// BLOCO UNI 2: ChatInput agora recebe isSpeaking/onInterruptSpeech --
// pressionar o botão de voz enquanto a Uni fala INTERROMPE a fala em vez de
// iniciar uma gravação nova (mesma regra e mesmo comportamento da Home,
// só que aqui é o botão do chat completo/`/app/uni`). Cobertura estrutural
// (mesmo padrão já usado no restante do projeto -- sem
// @testing-library/react no repositório, os componentes são auditados
// como texto-fonte).
// ============================================================================

const source = () => readFile(new URL('./ChatInput.jsx', import.meta.url), 'utf8');

test('handleVoiceClick verifica isSpeaking ANTES de qualquer outra lógica de captura', async () => {
  const code = await source();
  const idx = code.indexOf('function handleVoiceClick() {');
  const endIdx = code.indexOf('const voiceLabel', idx);
  assert.ok(idx > -1 && endIdx > idx);
  const body = code.slice(idx, endIdx);
  const speakingIdx = body.indexOf('if (isSpeaking)');
  const toggleIdx = body.indexOf('voiceInput.toggle();');
  assert.ok(speakingIdx > -1 && toggleIdx > speakingIdx, 'a checagem de isSpeaking deve vir antes de voiceInput.toggle()');
  assert.match(body, /if \(isSpeaking\) \{\s*\n\s*onInterruptSpeech\?\.\(\);\s*\n\s*return;\s*\n\s*\}/);
});

test('isSpeaking tem valor padrão false -- componentes que ainda não passam a prop continuam funcionando como antes', async () => {
  const code = await source();
  assert.match(code, /isSpeaking = false,/);
});

test('interromper a fala nunca chama voiceInput.toggle()/start() no mesmo clique', async () => {
  const code = await source();
  const idx = code.indexOf('if (isSpeaking) {');
  const block = code.slice(idx, idx + 100);
  assert.doesNotMatch(block, /voiceInput\.(toggle|start)\(\)/);
});

test('transcrição final envia a origem voice ao gateway comum', async () => {
  const code = await source();
  assert.match(code, /onSend\(next, \{ source: 'voice' \}\);/);
  assert.match(code, /onSend\(value\.trim\(\)\);/);
});
