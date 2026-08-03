// Uni Engine — Application (Parte 5, Bloco 4: resposta visível controlada).
//
// Testes do seletor seguro do texto visível no ponto ÚNICO de saída de
// resposta: selectControlledVisibleResponse.
//
// Regra absoluta: o texto legado é o padrão. applicationResult.finalText só é
// usado quando TODOS os gates passarem (resultado íntegro e aplicado, sem
// fallback, conteúdo factual preservado, capabilities apenas Style/Length,
// safety íntegro, DEV, usuário autorizado, engine/Integration/Activation/
// Application habilitadas, flags ligadas, confiança mínima, risco permitido,
// circuit breaker fechado e Execution Readiness não bloqueando). QUALQUER
// falha → texto legado. Função pura: sem efeitos colaterais, sem execução,
// sem persistência, sem duplicidade de mensagem, sem TTS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import {
  selectControlledVisibleResponse,
  isSafetyIntegral,
  VISIBLE_RESPONSE_CAPABILITIES,
} from './selectControlledVisibleResponse.js';

const LEGACY_TEXT = 'Gastei R$ 50,00 no mercado com o cartão de crédito.';
const APPLIED_TEXT = 'Gastei R$ 50,00 no mercado.';
const RICH_TEXT = 'Nubank — R$ 1.250,00 em Alimentação em 03/08, sem confirmação pendente. Nenhum erro na operação. Próximo passo: conferir o app.';

function buildConfig(env = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_ACTIVATION_ENABLED: 'true',
      VITE_UNI_ENGINE_ACTIVATION_SHADOW: 'false',
      VITE_UNI_ENGINE_ACTIVATION_ENVIRONMENTS: 'development',
      VITE_UNI_ENGINE_ACTIVATION_TEST_USER_IDS: 'test-user-1',
      VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'true',
      VITE_UNI_ENGINE_CAP_RESPONSE_LENGTH_GUIDANCE: 'true',
      VITE_UNI_ENGINE_INTEGRATION_ENABLED: 'true',
      VITE_UNI_ENGINE_INTEGRATION_SHADOW: 'false',
      VITE_UNI_ENGINE_APPLICATION_ENABLED: 'true',
      VITE_UNI_ENGINE_APPLICATION_TELEMETRY: 'false',
      ...env,
    },
  });
}

function buildSafety(overrides = {}) {
  return {
    factualContentPreserved: true,
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModified: false,
    databaseCalled: false,
    ttsTriggeredByApplication: false,
    ...overrides,
  };
}

function buildResult(overrides = {}) {
  return {
    version: '1.0',
    enabled: true,
    applied: true,
    appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE'],
    blockedCapabilities: [],
    originalText: LEGACY_TEXT,
    finalText: APPLIED_TEXT,
    factualContentPreserved: true,
    styleApplied: true,
    lengthApplied: false,
    fallbackUsed: false,
    fallbackReason: null,
    status: 'APPLIED',
    diagnostics: [],
    shadowComparison: null,
    safety: buildSafety(),
    questionDecision: null,
    clarificationDecision: null,
    latencyMs: 1,
    ...overrides,
  };
}

function select(overrides = {}, helperOverrides = {}) {
  return selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: buildResult(overrides),
    config: buildConfig(),
    environment: 'development',
    authorized: true,
    executionReady: true,
    circuitBreakerOpen: false,
    confidence: 0.9,
    risk: 'LOW',
    ...helperOverrides,
  });
}

// ---------------------------------------------------------------------------
// Bloco A — flags e gates
// ---------------------------------------------------------------------------

test('S-1: flags desligadas (config all-off) → texto legado mesmo com resultado válido', () => {
  const result = selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: buildResult(),
    config: createUniEngineConfig({ env: {} }),
    environment: 'development',
    authorized: true,
  });
  assert.equal(result, LEGACY_TEXT);
});

test('S-2: config ausente (null) → texto legado', () => {
  assert.equal(select({}, { config: null }), LEGACY_TEXT);
});

test('S-3: ambiente production → texto legado (aplicação nunca ativa em produção)', () => {
  assert.equal(select({}, { environment: 'production' }), LEGACY_TEXT);
});

test('S-4: usuário não autorizado → texto legado', () => {
  assert.equal(select({}, { authorized: false }), LEGACY_TEXT);
});

test('S-5: authorized ausente (undefined) → texto legado', () => {
  assert.equal(select({}, { authorized: undefined }), LEGACY_TEXT);
});

test('S-6: applicationResult ausente (null) → texto legado', () => {
  assert.equal(select({}, { applicationResult: null }), LEGACY_TEXT);
});

test('S-7: applicationResult não-objeto → texto legado', () => {
  assert.equal(select({}, { applicationResult: 'nao-e-resultado' }), LEGACY_TEXT);
  assert.equal(select({}, { applicationResult: 42 }), LEGACY_TEXT);
});

test('S-8: legacyText vazio → retorna vazio (nunca o finalText)', () => {
  const result = selectControlledVisibleResponse({
    legacyText: '',
    applicationResult: buildResult(),
    config: buildConfig(),
    environment: 'development',
    authorized: true,
  });
  assert.equal(result, '');
});

test('S-9: applied=false → texto legado (nada foi aplicado)', () => {
  assert.equal(select({ applied: false }), LEGACY_TEXT);
});

test('S-10: fallbackUsed=true → texto legado (fallback é a prova de que algo falhou)', () => {
  assert.equal(select({ fallbackUsed: true }), LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// Bloco B — integridade do resultado
// ---------------------------------------------------------------------------

test('S-11: factualContentPreserved=false → texto legado (conteúdo foi alterado)', () => {
  assert.equal(select({ factualContentPreserved: false }), LEGACY_TEXT);
});

test('S-12: finalText vazio → texto legado', () => {
  assert.equal(select({ finalText: '' }), LEGACY_TEXT);
  assert.equal(select({ finalText: '   ' }), LEGACY_TEXT);
});

test('S-13: finalText não-string → texto legado', () => {
  assert.equal(select({ finalText: 123 }), LEGACY_TEXT);
  assert.equal(select({ finalText: null }), LEGACY_TEXT);
});

test('S-14: appliedCapabilities vazio → texto legado (nenhuma capability aplicada)', () => {
  assert.equal(select({ appliedCapabilities: [] }), LEGACY_TEXT);
});

test('S-15: appliedCapabilities não-array → texto legado', () => {
  assert.equal(select({ appliedCapabilities: 'RESPONSE_STYLE_GUIDANCE' }), LEGACY_TEXT);
});

test('S-16: capability desconhecida em appliedCapabilities → texto legado', () => {
  assert.equal(select({ appliedCapabilities: ['CAPABILITY_QUE_NAO_EXISTE'] }), LEGACY_TEXT);
});

test('S-17: FINANCIAL_EXECUTION em appliedCapabilities → texto legado (proibida)', () => {
  assert.equal(
    select({ appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE', 'FINANCIAL_EXECUTION'] }),
    LEGACY_TEXT,
  );
});

test('S-18: RESPONSE_CONTENT_INFLUENCE em appliedCapabilities → texto legado (proibida)', () => {
  assert.equal(select({ appliedCapabilities: ['RESPONSE_CONTENT_INFLUENCE'] }), LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// Bloco C — capabilities observacionais e safety
// ---------------------------------------------------------------------------

test('S-19: apenas QUESTION_GUIDANCE aplicada → texto legado (decisão observacional nunca altera o texto)', () => {
  const result = buildResult({
    appliedCapabilities: ['QUESTION_GUIDANCE'],
    questionDecision: { shouldAsk: true, questionPriority: 'HIGH' },
  });
  assert.equal(selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: result,
    config: buildConfig(),
    environment: 'development',
    authorized: true,
  }), LEGACY_TEXT);
});

test('S-20: apenas CLARIFICATION_GUIDANCE aplicada → texto legado (decisão observacional nunca altera o texto)', () => {
  const result = buildResult({
    appliedCapabilities: ['CLARIFICATION_GUIDANCE'],
    clarificationDecision: { shouldClarify: true, clarificationPriority: 'HIGH' },
  });
  assert.equal(selectControlledVisibleResponse({
    legacyText: LEGACY_TEXT,
    applicationResult: result,
    config: buildConfig(),
    environment: 'development',
    authorized: true,
  }), LEGACY_TEXT);
});

test('S-21: questionDecision preenchido junto com Style aplicada → finalText (a decisão não bloqueia a aplicação válida)', () => {
  const result = buildResult({
    appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE'],
    questionDecision: { shouldAsk: true, questionPriority: 'HIGH', ambiguityType: 'ACCOUNT' },
  });
  assert.equal(select({}, { applicationResult: result }), APPLIED_TEXT);
});

test('S-22: questionDecision + clarificationDecision + Style aplicada → finalText', () => {
  const result = buildResult({
    appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE'],
    questionDecision: { shouldAsk: true },
    clarificationDecision: { shouldClarify: false },
  });
  assert.equal(select({}, { applicationResult: result }), APPLIED_TEXT);
});

test('S-23: safety ausente → texto legado', () => {
  assert.equal(select({ safety: undefined }), LEGACY_TEXT);
  assert.equal(select({ safety: null }), LEGACY_TEXT);
});

test('S-24: safety com financialExecution=true → texto legado (qualquer efeito colateral bloqueia)', () => {
  assert.equal(select({ safety: buildSafety({ financialExecution: true }) }), LEGACY_TEXT);
  assert.equal(isSafetyIntegral(buildSafety({ financialExecution: true })), false);
});

// ---------------------------------------------------------------------------
// Bloco D — seleção válida e preservação literal do texto
// ---------------------------------------------------------------------------

test('S-25: Style aplicada e todos os gates verdes → finalText é o texto visível', () => {
  assert.equal(select(), APPLIED_TEXT);
});

test('S-26: Length aplicada → finalText é o texto visível', () => {
  assert.equal(select({ appliedCapabilities: ['RESPONSE_LENGTH_GUIDANCE'], lengthApplied: true }), APPLIED_TEXT);
});

test('S-27: Style + Length aplicadas → finalText é o texto visível', () => {
  assert.equal(
    select({ appliedCapabilities: ['RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE'], lengthApplied: true }),
    APPLIED_TEXT,
  );
});

test('S-28: valor financeiro permanece literal (R$ 50,00 intacto)', () => {
  const rich = buildResult({ finalText: RICH_TEXT });
  assert.equal(select({}, { applicationResult: rich }), RICH_TEXT);
  assert.ok(select({}, { applicationResult: rich }).includes('R$ 1.250,00'));
});

test('S-29: conta mencionada permanece literal (Nubank intacto)', () => {
  const rich = buildResult({ finalText: RICH_TEXT });
  assert.ok(select({}, { applicationResult: rich }).includes('Nubank'));
});

test('S-30: categoria/data/status/confirmação/erro/próximo passo permanecem literais', () => {
  const rich = buildResult({ finalText: RICH_TEXT });
  const visible = select({}, { applicationResult: rich });
  assert.ok(visible.includes('Alimentação'));
  assert.ok(visible.includes('03/08'));
  assert.ok(visible.includes('sem confirmação pendente'));
  assert.ok(visible.includes('Nenhum erro'));
  assert.ok(visible.includes('Próximo passo: conferir o app'));
});

test('S-31: nenhuma pergunta é inserida automaticamente (sem "?" e sem texto de pergunta anexado)', () => {
  const rich = buildResult({ finalText: RICH_TEXT });
  const visible = select({}, { applicationResult: rich });
  assert.equal(visible, RICH_TEXT);
  assert.ok(!visible.endsWith('?'));
  assert.ok(!visible.includes('Pode me informar'));
  assert.ok(!visible.includes('Qual é a conta'));
});

test('S-32: nenhuma clarificação é inserida automaticamente (sem template de esclarecimento)', () => {
  const visible = select();
  assert.ok(!visible.includes('Qual foi o valor'));
  assert.ok(!visible.includes('Pode confirmar'));
});

test('S-33: nenhum caractere é adicionado ou removido — retorno é o finalText exato (sem concatenação)', () => {
  assert.equal(select(), APPLIED_TEXT);
  assert.equal(select().length, APPLIED_TEXT.length);
});

test('S-34: texto legado nunca é modificado pelo seletor', () => {
  const snapshot = JSON.stringify(buildResult());
  const config = buildConfig();
  const configSnapshot = JSON.stringify(config);
  select();
  assert.equal(JSON.stringify(buildResult()), snapshot);
  assert.equal(JSON.stringify(config), configSnapshot);
});

// ---------------------------------------------------------------------------
// Bloco E — pureza, determinismo e fail-safe
// ---------------------------------------------------------------------------

test('S-35: seletor não possui efeitos colaterais (entradas profundamente inalteradas)', () => {
  const result = buildResult();
  const config = buildConfig();
  const resultSnapshot = JSON.stringify(result);
  const configSnapshot = JSON.stringify(config);
  select({}, { applicationResult: result, config });
  assert.equal(JSON.stringify(result), resultSnapshot);
  assert.equal(JSON.stringify(config), configSnapshot);
});

test('S-36: seletor é determinístico (mesmas entradas, mesmo resultado)', () => {
  assert.equal(select(), select());
  assert.equal(select({ applied: false }), select({ applied: false }));
});

test('S-37: exceção interna → texto legado (falha segura)', () => {
  const exploding = buildResult();
  Object.defineProperty(exploding, 'applied', {
    get() {
      throw new Error('boom');
    },
  });
  assert.equal(select({}, { applicationResult: exploding }), LEGACY_TEXT);
});

test('S-38: config sem activationCapabilities → texto legado (flag da capability ausente)', () => {
  const config = buildConfig({ VITE_UNI_ENGINE_CAP_RESPONSE_STYLE_GUIDANCE: 'false' });
  assert.equal(select({}, { config }), LEGACY_TEXT);
});

test('S-39: confiança abaixo do mínimo (0.4) → texto legado', () => {
  assert.equal(select({}, { confidence: 0.4 }), LEGACY_TEXT);
});

test('S-40: risco HIGH → texto legado', () => {
  assert.equal(select({}, { risk: 'HIGH' }), LEGACY_TEXT);
});

// ---------------------------------------------------------------------------
// Bloco F — execução, readiness e circuito
// ---------------------------------------------------------------------------

test('S-41: circuit breaker aberto → texto legado', () => {
  assert.equal(select({}, { circuitBreakerOpen: true }), LEGACY_TEXT);
});

test('S-42: Execution Readiness bloqueando (executionReady=false) → texto legado', () => {
  assert.equal(select({}, { executionReady: false }), LEGACY_TEXT);
});

test('S-43: seletor nunca executa, escreve, persiste ou fala — o retorno é SEMPRE uma string simples', () => {
  const result = select();
  assert.equal(typeof result, 'string');
  assert.ok(result.length > 0);
  const rejected = select({ safety: buildSafety({ databaseCalled: true }) });
  assert.equal(rejected, LEGACY_TEXT);
  assert.equal(typeof rejected, 'string');
});

test('S-44: authorized=false com resultado e config perfeitamente válidos → texto legado (usuário é o último portão)', () => {
  assert.equal(select({}, { authorized: false }), LEGACY_TEXT);
});

test('S-45: resultado válido → retorna EXATAMENTE uma string única (sem array/objeto/duplicidade de mensagem)', () => {
  const visible = select();
  assert.equal(typeof visible, 'string');
  assert.equal(visible, APPLIED_TEXT);
  const rejected = select({ applied: false });
  assert.equal(rejected, LEGACY_TEXT);
  assert.equal(typeof rejected, 'string');
});

// ---------------------------------------------------------------------------
// Bloco G — contratos públicos do Bloco 4
// ---------------------------------------------------------------------------

test('S-46: VISIBLE_RESPONSE_CAPABILITIES contém somente Style e Length', () => {
  assert.deepEqual([...VISIBLE_RESPONSE_CAPABILITIES].sort(), [
    'RESPONSE_LENGTH_GUIDANCE',
    'RESPONSE_STYLE_GUIDANCE',
  ]);
  assert.ok(Object.isFrozen(VISIBLE_RESPONSE_CAPABILITIES));
});

test('S-47: isSafetyIntegral é determinístico e exigente', () => {
  assert.equal(isSafetyIntegral(buildSafety()), true);
  assert.equal(isSafetyIntegral(null), false);
  assert.equal(isSafetyIntegral({}), false);
  assert.equal(isSafetyIntegral(buildSafety({ memoryWrite: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ learningApplied: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ confirmationSkipped: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ pendingActionModified: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ databaseCalled: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ ttsTriggeredByApplication: true })), false);
  assert.equal(isSafetyIntegral(buildSafety({ factualContentPreserved: false })), false);
  assert.equal(isSafetyIntegral(buildSafety()), isSafetyIntegral(buildSafety()));
});
