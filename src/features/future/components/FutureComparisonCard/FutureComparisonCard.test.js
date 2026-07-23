import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('card retorna null quando a comparacao nao existe ou nao e comparavel (nunca renderiza vazio/quebrado)', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /if \(!comparison \|\| !comparison\.isComparable\) return null;/);
});

test('titulo "Real × Simulado" e horizonte comparado presentes', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /Real × Simulado/);
  assert.match(content, /Horizonte de \{comparison\.selectedHorizon\}/);
});

test('exibe valor real, simulado, diferenca absoluta e percentual condicional', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /formatCurrency\(scenario\.finalBalance\.real\)/);
  assert.match(content, /formatCurrency\(scenario\.finalBalance\.simulated\)/);
  assert.match(content, /formatSignedCurrency\(scenario\.finalBalance\.delta\)/);
  assert.match(content, /scenario\.finalBalance\.percentDelta !== null/);
});

test('exibe indicacao textual neutra de direcao (maior/menor/sem alteracao)', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /directionLabel\(scenario\.finalBalance\.direction\)/);
});

test('nao usa linguagem de promessa (ganhar, garantido, certeza)', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.doesNotMatch(content, /você ganhará|garantido|economia certa/i);
});

test('inclui aviso de que a comparacao e hipotetica e nao altera dados reais', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /Esta comparação usa uma simulação hipotética e não altera seus dados reais\./);
});

test('nao calcula projecoes: apenas formata o objeto ja pronto recebido via props', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.doesNotMatch(content, /buildFutureProjections|buildFutureComparison|buildFutureSimulation/);
});

test('reutiliza SCENARIO_CONFIG existente para rotulos, nao duplica os nomes dos cenarios', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.match(content, /import \{ SCENARIO_CONFIG \} from '\.\.\/\.\.\/futureConstants';/);
});

test('nenhuma chamada a Supabase, localStorage, navegacao ou integracao com Dashboard/Uni', async () => {
  const content = await source('FutureComparisonCard.jsx');
  assert.doesNotMatch(content, /supabase|localStorage|useNavigate|dashboard|uni-chat|uni-llm/i);
});

test('nao instala nem importa nenhuma biblioteca nova', async () => {
  const content = await source('FutureComparisonCard.jsx');
  const importLines = content.match(/^import .+$/gm) ?? [];
  for (const line of importLines) {
    assert.match(line, /from '(\.\.?\/)/);
  }
});
