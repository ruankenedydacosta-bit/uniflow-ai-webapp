import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// ============================================================================
// O campo do chat é só texto: falar com a Uni é pela conversa em tempo real
// (orb da barra inferior). Cobertura estrutural (mesmo padrão já usado no
// restante do projeto -- sem @testing-library/react no repositório, os
// componentes são auditados como texto-fonte).
// ============================================================================

const source = () => readFile(new URL('./ChatInput.jsx', import.meta.url), 'utf8');

test('campo do chat não grava áudio nem mostra microfone', async () => {
  const code = await source();
  assert.doesNotMatch(code, /uni-voice|MediaRecorder|getUserMedia|PhMicrophoneIcon/);
  assert.doesNotMatch(code, /source: 'voice'/);
});

test('envio por botão e por Enter manda só o texto digitado', async () => {
  const code = await source();
  assert.match(code, /onSend\(value\.trim\(\)\);/);
  assert.match(code, /disabled=\{disabled \|\| !value\.trim\(\)\}/);
});

test('composer aceita múltiplas linhas sem alterar o envio por Enter', async () => {
  const code = await source();
  assert.match(code, /<textarea/);
  assert.match(code, /rows=\{1\}/);
  assert.match(code, /event\.key !== 'Enter' \|\| event\.shiftKey \|\| event\.isComposing/);
  assert.match(code, /input\.style\.height = `\$\{Math\.min\(input\.scrollHeight, 120\)\}px`;/);
});

test('safe area do composer é preservada e removida somente quando o teclado está aberto', async () => {
  const css = await readFile(new URL('./ChatInput.module.css', import.meta.url), 'utf8');
  assert.match(css, /padding-bottom: max\(10px, env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /data-keyboard-open="true"[\s\S]*?padding-bottom: 10px;/);
});
