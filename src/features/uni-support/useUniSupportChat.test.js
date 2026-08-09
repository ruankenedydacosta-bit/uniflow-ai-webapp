// SUPORTE1: useUniSupportChat.js é um hook React (useState/useCallback) --
// mesmo padrão de UniChatPage.jsx/uniLlm.test.js, cobertura estrutural por
// leitura de fonte (sem Testing Library/jsdom instalados no projeto).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(__dirname, 'useUniSupportChat.js'), 'utf8');

test('usa generateSupportResponse (uniLlm), nunca generateContextualResponse (financeiro)', () => {
  assert.match(SOURCE, /uniLlm\.generateSupportResponse\(/);
  assert.doesNotMatch(SOURCE, /uniLlm\.generateContextualResponse/);
});

test('nunca envia financialContext -- payload de suporte so tem text/messages/workspace', () => {
  assert.doesNotMatch(SOURCE, /financialContext/);
  assert.match(SOURCE, /generateSupportResponse\(\{ text, messages: history, workspace: workspaceType \}\)/);
});

test('cancelamento marca AI_STATUS.CANCELLED (nunca ERROR) -- mesma correção aplicada em UniChatPage', () => {
  assert.match(SOURCE, /setAiStatus\(AI_STATUS\.CANCELLED\);/);
});

test('cancel() só age durante LOADING, marca aiCancelledRef ANTES de chamar uniLlm.cancel()', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('const cancel = useCallback'), SOURCE.indexOf('const retry = useCallback'));
  assert.match(fnBody, /if \(aiStatus !== AI_STATUS\.LOADING\) return;/);
  assert.match(fnBody, /aiCancelledRef\.current = true;\s*\n\s*requestIdRef\.current \+= 1;\s*\n\s*uniLlm\.cancel\(\);/);
  assert.match(fnBody, /setIsTyping\(false\);/);
  assert.match(fnBody, /setAiStatus\(AI_STATUS\.CANCELLED\);/);
});

test('reset() interrompe qualquer chamada em andamento (uniLlm.cancel) e limpa mensagens/estado', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('const reset = useCallback'), SOURCE.indexOf('return {'));
  assert.match(fnBody, /uniLlm\.cancel\(\);/);
  assert.match(fnBody, /setMessages\(\[\]\);/);
});

test('usa createSupportConversation (conversation_type=support), nunca createConversation (financeiro)', () => {
  assert.match(SOURCE, /dataService\.createSupportConversation\(/);
  assert.doesNotMatch(SOURCE, /dataService\.createConversation\(/);
});

test('mensagem final (sucesso ou fallback) sempre é enviada e persistida -- nunca trava sem resposta', () => {
  const fnBody = SOURCE.slice(SOURCE.indexOf('async function handleUnresolved'), SOURCE.indexOf('const sendText ='));
  assert.match(fnBody, /const assistantMsg = buildUniMessage\(llmText \|\| SUPPORT_FALLBACK_TEXT\);/);
  assert.match(fnBody, /pushMessage\(assistantMsg\);/);
  assert.match(fnBody, /persistMessage\(assistantMsg\);/);
});

test('lastKnowledge é atualizado a cada resposta -- base para o escalonamento inteligente', () => {
  assert.match(SOURCE, /setLastKnowledge\(outcome\?\.knowledge \?\? null\);/);
});

test('resposta atrasada não atualiza estado depois de cancelamento ou nova solicitação', () => {
  assert.match(SOURCE, /const requestId = requestIdRef\.current \+ 1;/);
  assert.match(SOURCE, /if \(!mountedRef\.current \|\| requestId !== requestIdRef\.current\) return;/);
  assert.match(SOURCE, /requestIdRef\.current \+= 1;/);
});

test('desmontagem invalida a solicitação ativa e cancela o transporte', () => {
  assert.match(SOURCE, /mountedRef\.current = false;/);
  assert.match(SOURCE, /cancelLlmRef\.current\(\);/);
});
