import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Sem infraestrutura de renderização de hooks React neste repositório (mesma
// constatação já feita em outras subfases): a cobertura de comportamento
// vive inteiramente em futureSimulation.test.js (função pura). Este arquivo
// audita, por leitura de código-fonte, que o hook permanece fino e isolado.

test('useFutureSimulation delega toda a regra a buildFutureSimulation (funcao pura)', async () => {
  const content = await source('useFutureSimulation.js');
  assert.match(content, /import \{ buildFutureSimulation \} from '\.\/futureSimulation\.js';/);
  assert.match(content, /buildFutureSimulation\(\{/);
});

test('useFutureSimulation expoe exatamente as responsabilidades permitidas', async () => {
  const content = await source('useFutureSimulation.js');
  assert.match(content, /setOverride,/);
  assert.match(content, /setOverrides,/);
  assert.match(content, /resetSimulation,/);
  assert.match(content, /isActive:/);
  assert.match(content, /simulatedProjections:/);
});

test('useFutureSimulation aceita os dados-base completos, nunca apenas baseProjections', async () => {
  const content = await source('useFutureSimulation.js');
  assert.match(content, /workspaceBalance = 0,/);
  assert.match(content, /transactions = \[\],/);
  assert.match(content, /goals = \[\],/);
  assert.doesNotMatch(content, /baseProjections/);
});

test('useFutureSimulation nao usa localStorage, Supabase, navegacao ou Context global', async () => {
  const content = await source('useFutureSimulation.js');
  assert.doesNotMatch(content, /localStorage|supabase|useNavigate|react-router-dom|AccessContext|SessionContext/i);
});

test('useFutureSimulation nao integra Dashboard nem Uni', async () => {
  const content = await source('useFutureSimulation.js');
  assert.doesNotMatch(content, /dashboard|uni-chat|uni-llm/i);
});

test('useFutureSimulation mantem overrides apenas em estado local (useState), sem persistencia', async () => {
  const content = await source('useFutureSimulation.js');
  assert.match(content, /useState\(EMPTY_OVERRIDES\)/);
});
