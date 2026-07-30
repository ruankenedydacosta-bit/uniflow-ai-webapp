// Testes estruturais (source-regex) sobre useUniConversation.js -- é um
// hook (useReducer/useRef), sem harness de renderização React neste
// projeto (ver convenção já usada em UniChatPage.test.js e nos testes de
// Edge Function Deno). Cobre o vazamento real de contexto entre turnos:
// contextRef (usado por parseFinancialText para herdar categoria/
// descrição/conta/data) sobrevivia a reset()/cancel(), podendo vazar
// campos de uma conversa já encerrada para uma frase financeira nova e
// independente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'useUniConversation.js'), 'utf8');

test('reset() apaga o contextRef (contexto de inferência entre turnos), nunca só o reducer', () => {
  const idx = SOURCE.indexOf('const reset = useCallback(() => {');
  assert.ok(idx > -1);
  const slice = SOURCE.slice(idx, idx + 600);
  assert.match(slice, /contextRef\.current = createConversationContext\(\);/);
  assert.match(slice, /dispatch\(\{ type: 'RESET' \}\);/);
});

test('cancel() também apaga o contextRef -- UniChatPage não chama reset() depois de cancel()', () => {
  const idx = SOURCE.indexOf('const cancel = useCallback(() => {');
  assert.ok(idx > -1);
  const slice = SOURCE.slice(idx, idx + 600);
  assert.match(slice, /contextRef\.current = createConversationContext\(\);/);
});

test('contextRef é o mesmo ref usado por interpret() para montar/atualizar o contexto do parser', () => {
  assert.match(SOURCE, /const contextRef = useRef\(createConversationContext\(\)\);/);
  assert.match(SOURCE, /context: contextRef\.current,/);
  assert.match(SOURCE, /contextRef\.current = parsed\.nextContext;/);
});
