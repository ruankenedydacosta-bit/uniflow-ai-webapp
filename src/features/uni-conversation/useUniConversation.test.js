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

// BUG REAL EM PRODUCAO: correct()/provideInput() usava state.parsed
// incondicionalmente. Quando chamado NO MESMO turno em que interpret()
// acabou de rodar (ex.: inferência de categoria por IA em UniChatPage.jsx,
// que chama provideInput logo após interpret, antes de qualquer re-render),
// state.parsed ainda refletia o turno anterior (ou null, no primeiro turno)
// -- `if (!state.parsed) return null` abortava silenciosamente, e o
// resultado (a pergunta de categoria certa, ou a categoria já inferida)
// era descartado, caindo no fallback genérico "Preciso de mais detalhes
// antes de preparar essa ação.".
test('correct()/provideInput() aceitam um parsedOverride explícito -- nunca dependem só de state.parsed (evita a corrida com o commit do useReducer)', () => {
  const idx = SOURCE.indexOf('const correct = useCallback((overrides, parsedOverride) => {');
  assert.ok(idx > -1, 'correct deve aceitar um segundo parâmetro parsedOverride');
  const slice = SOURCE.slice(idx, idx + 700);
  assert.match(slice, /const parsed = parsedOverride \?\? state\.parsed;/);
  assert.match(slice, /if \(!parsed\) return null;/);
  assert.doesNotMatch(slice, /if \(!state\.parsed\) return null;/);

  assert.match(
    SOURCE,
    /const provideInput = useCallback\(\(overrides, parsedOverride\) => correct\(overrides, parsedOverride\), \[correct\]\);/,
  );
});
