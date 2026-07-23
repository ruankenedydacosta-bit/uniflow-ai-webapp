import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// Sem infraestrutura de renderização de hooks React neste repositório:
// cobertura por leitura de código-fonte, mesmo padrão já usado em outras
// subfases. O objetivo aqui é o contrato (F5.3.1), não recalcular a
// projeção — isso já é coberto por futureCalculations.test.js.

test('buildFutureProjections continua sendo chamado uma unica vez', async () => {
  const content = await source('useFutureData.js');
  const occurrences = content.match(/buildFutureProjections\(/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('retorno inclui baseInputs com workspaceBalance, transactions e goals', async () => {
  const content = await source('useFutureData.js');
  assert.match(content, /baseInputs: \{ workspaceBalance, transactions, goals \}/);
});

test('baseInputs usa exatamente as mesmas variaveis passadas a buildFutureProjections (mesma referencia)', async () => {
  const content = await source('useFutureData.js');
  const projectionsCallBlock = content.slice(
    content.indexOf('const projections = useMemo(() => {'),
    content.indexOf('}, [workspaceBalance, transactions, goals, selectedHorizon]);') + 1,
  );
  assert.match(projectionsCallBlock, /workspaceBalance,/);
  assert.match(projectionsCallBlock, /transactions,/);
  assert.match(projectionsCallBlock, /goals,/);

  const returnBlock = content.slice(content.indexOf('return {'));
  assert.match(returnBlock, /baseInputs: \{ workspaceBalance, transactions, goals \}/);
});

test('baseInputs nao clona os dados (nenhum spread, JSON.parse/stringify ou structuredClone)', async () => {
  const content = await source('useFutureData.js');
  assert.doesNotMatch(content, /structuredClone|JSON\.parse\(JSON\.stringify/);
  const baseInputsLine = content.match(/baseInputs: \{[^}]*\}/)?.[0] ?? '';
  assert.doesNotMatch(baseInputsLine, /\.\.\./);
});

test('nenhuma nova busca de dados foi introduzida (mesmos 3 hooks financeiros de sempre)', async () => {
  const content = await source('useFutureData.js');
  assert.equal((content.match(/useFinancialBalances\(/g) ?? []).length, 1);
  assert.equal((content.match(/useTransactions\(/g) ?? []).length, 1);
  assert.equal((content.match(/useGoals\(/g) ?? []).length, 1);
});

test('contrato anterior permanece disponivel integralmente', async () => {
  const content = await source('useFutureData.js');
  const returnBlock = content.slice(content.indexOf('return {'));
  for (const field of [
    'isLoading',
    'error',
    'projections',
    'selectedScenario',
    'selectedHorizon',
    'selectedScenarioProjection',
    'selectedGoalProjections',
    'hasData: projections.hasHistory',
    'totalTransactions: projections.totalTransactions',
    'activeGoals: projections.activeGoals',
  ]) {
    assert.ok(returnBlock.includes(field), `campo ausente no retorno: ${field}`);
  }
});
