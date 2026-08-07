// FASE ESTADOS DE PROCESSAMENTO: useUniProcessingMessage.js é um hook React
// (useState/useMemo/useEffect) -- sem infraestrutura de renderização de
// hooks neste repositório (mesmo padrão já usado em useVoiceIntensity.js/
// useFutureData.js): cobertura estrutural por leitura de fonte para o
// wiring/contrato, e cobertura comportamental completa em
// uniProcessingMessages.test.js (a lógica pura por trás do hook).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('hook delega toda a lógica de conteúdo/ritmo a uniProcessingMessages.js -- nunca reimplementa mensagens ou atrasos', async () => {
  const hook = await source('./useUniProcessingMessage.js');
  assert.match(hook, /import \{ buildProcessingRotationPlan, getProcessingMessageSequence \} from '\.\/uniProcessingMessages\.js';/);
  assert.doesNotMatch(hook, /Ouvindo…|Entendendo seu pedido/);
});

test('sequência é memoizada por [state, contextKey] -- reage a mudança real de estado, não a um objeto context recriado com o mesmo conteúdo', async () => {
  const hook = await source('./useUniProcessingMessage.js');
  assert.match(hook, /useMemo\(\(\) => getProcessingMessageSequence\(state, context\), \[state, contextKey\]\)/);
});

test('índice reseta quando a sequência muda -- ajustado durante a renderização (nunca setState direto no corpo do efeito)', async () => {
  const hook = await source('./useUniProcessingMessage.js');
  assert.match(hook, /if \(sequence !== prevSequence\) \{\s*setPrevSequence\(sequence\);\s*setIndex\(0\);\s*\}/);
});

test('timers são agendados e CANCELADOS no cleanup do efeito -- nunca vazam ao trocar de estado ou desmontar', async () => {
  const hook = await source('./useUniProcessingMessage.js');
  const effectStart = hook.indexOf('useEffect(() => {');
  const effectBody = hook.slice(effectStart, hook.indexOf('}, [sequence]);', effectStart));
  assert.match(effectBody, /window\.setTimeout\(/);
  assert.match(effectBody, /return \(\) => \{\s*timers\.forEach\(\(timerId\) => window\.clearTimeout\(timerId\)\);\s*\};/);
});

test('sequência de 0 ou 1 mensagem não agenda nenhum timer (resposta rápida nunca "pisca")', async () => {
  const hook = await source('./useUniProcessingMessage.js');
  assert.match(hook, /if \(!plan\.length\) return undefined;/);
});
