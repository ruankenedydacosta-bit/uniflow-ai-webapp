// Sprint 4 (Blocos 4.2/4.3) — testes das novas flags do orquestrador
// semântico. Todas nascem `false` e são cumulativas com as flags
// anteriores (nunca reaproveitam a mesma flag para responsabilidades
// diferentes).
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNI_FINANCIAL_ORCHESTRATOR_FLAG,
  UNI_COMPOUND_FINANCIAL_QUERIES_FLAG,
  UNI_LLM_RESPONSE_COMPOSER_FLAG,
  UNI_LLM_RESPONSE_COMPOSER_KILL_SWITCH_KEY,
  isFinancialOrchestratorFlagEnabled,
  isCompoundFinancialQueriesFlagEnabled,
  isLlmResponseComposerFlagEnabled,
  isLlmResponseComposerKillSwitchActive,
} from './llmConfig.js';

test('flags novas têm nomes próprios, nunca reaproveitam VITE_UNI_SEMANTIC_INTENT_ENABLED ou outra flag existente', () => {
  assert.equal(UNI_FINANCIAL_ORCHESTRATOR_FLAG, 'VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED');
  assert.equal(UNI_COMPOUND_FINANCIAL_QUERIES_FLAG, 'VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED');
  assert.equal(UNI_LLM_RESPONSE_COMPOSER_FLAG, 'VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED');
});

test('ambiente vazio (produção real, sem nenhuma env var) nunca ativa nenhuma flag nova', () => {
  assert.equal(isFinancialOrchestratorFlagEnabled({}), false);
  assert.equal(isCompoundFinancialQueriesFlagEnabled({}), false);
  assert.equal(isLlmResponseComposerFlagEnabled({}), false);
});

test('orquestrador exige VITE_UNI_SEMANTIC_INTENT_ENABLED também ligada -- não liga sozinho', () => {
  const onlyOrchestrator = { VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: 'true' };
  assert.equal(isFinancialOrchestratorFlagEnabled(onlyOrchestrator), false);

  const both = { VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: 'true', VITE_UNI_SEMANTIC_INTENT_ENABLED: 'true' };
  assert.equal(isFinancialOrchestratorFlagEnabled(both), true);
});

test('consultas compostas exigem o orquestrador ligado -- não liga sozinha', () => {
  const onlyCompound = { VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED: 'true' };
  assert.equal(isCompoundFinancialQueriesFlagEnabled(onlyCompound), false);

  const compoundWithoutSemantic = {
    VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED: 'true',
    VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: 'true',
    // falta VITE_UNI_SEMANTIC_INTENT_ENABLED
  };
  assert.equal(isCompoundFinancialQueriesFlagEnabled(compoundWithoutSemantic), false);

  const all = {
    VITE_UNI_COMPOUND_FINANCIAL_QUERIES_ENABLED: 'true',
    VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: 'true',
    VITE_UNI_SEMANTIC_INTENT_ENABLED: 'true',
  };
  assert.equal(isCompoundFinancialQueriesFlagEnabled(all), true);
});

test('valores diferentes da string literal "true" nunca ativam a flag (proteção contra truthy acidental)', () => {
  for (const value of [true, 1, 'TRUE', 'yes', 'on', undefined, null]) {
    assert.equal(isFinancialOrchestratorFlagEnabled({
      VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED: value,
      VITE_UNI_SEMANTIC_INTENT_ENABLED: 'true',
    }), false, `valor ${JSON.stringify(value)} não deveria ativar a flag`);
  }
});

test('response composer é uma flag isolada, sem dependência das demais (implementação real desde o Ciclo 3)', () => {
  assert.equal(isLlmResponseComposerFlagEnabled({ VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED: 'true' }), true);
});

// ── Sprint 4 Ciclo 4 (Bloco 4.10) — kill switch de rollback imediato ────

test('kill switch inativo (padrão) -- flag de build continua sendo a única decisão', () => {
  assert.equal(isLlmResponseComposerKillSwitchActive(), false);
  assert.equal(isLlmResponseComposerFlagEnabled({ VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED: 'true' }), true);
});

test('kill switch ativo via localStorage força a flag a false mesmo com a flag de build ligada', () => {
  const originalGetItem = globalThis.localStorage?.getItem;
  globalThis.localStorage = { getItem: (key) => (key === UNI_LLM_RESPONSE_COMPOSER_KILL_SWITCH_KEY ? 'true' : null) };
  try {
    assert.equal(isLlmResponseComposerKillSwitchActive(), true);
    assert.equal(isLlmResponseComposerFlagEnabled({ VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED: 'true' }), false);
  } finally {
    if (originalGetItem) globalThis.localStorage.getItem = originalGetItem;
    else delete globalThis.localStorage;
  }
});

test('kill switch nunca lança mesmo se localStorage.getItem lançar (ambiente restrito)', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error('blocked'); } };
  try {
    assert.doesNotThrow(() => isLlmResponseComposerKillSwitchActive());
    assert.equal(isLlmResponseComposerKillSwitchActive(), false);
  } finally {
    globalThis.localStorage = original;
  }
});
