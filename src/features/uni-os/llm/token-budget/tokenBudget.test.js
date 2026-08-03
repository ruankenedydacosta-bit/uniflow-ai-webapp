import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  BUDGET_ESTIMATOR_METADATA,
  TOKEN_BUDGET_POLICIES,
  TOKEN_BUDGET_POLICY_IDS,
  TOKEN_BUDGET_SECTIONS,
  allocateTokenBudget,
  buildTokenBudget,
  estimateBudgetValue,
  estimateConversationWindow,
  resolveTokenBudgetPolicy,
  runTokenBudgetShadow,
  validateTokenBudget,
} from './index.js';

function routingResult(policy = 'BALANCED') {
  return {
    routingResult: {
      requestedCapability: 'GENERAL_REASONING',
      metadata: { tokenBudgetPolicy: policy },
    },
  };
}

function conversationWindow(content = 'structured content') {
  return {
    conversationWindow: {
      messages: [{ role: 'user', content }, { role: 'assistant', content }],
      goals: [{ goalId: 'goal-1', relevance: 'HIGH', reason: content }],
      memory: [{ memoryId: 'memory-1', confidence: 0.9, reason: content }],
      context: [{ key: 'workspace', value: 'business', reason: content }],
      insights: [{ insightId: 'insight-1', type: 'GOAL_PROGRESS', reason: content }],
      reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'], content },
      security: { status: 'ALLOW_WITH_CONFIRMATION', reasons: [], content },
      permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION', restrictions: [], content },
    },
    metadata: { version: '1.0' },
  };
}

function build(policy = 'BALANCED', window = conversationWindow()) {
  return buildTokenBudget({ conversationWindow: window, routingResult: routingResult(policy) });
}

test('exposes four immutable budget policies with complete weights', () => {
  assert.deepEqual(TOKEN_BUDGET_POLICY_IDS, ['ECONOMY', 'BALANCED', 'QUALITY', 'MAX_CONTEXT']);
  TOKEN_BUDGET_POLICY_IDS.forEach((id) => {
    const policy = TOKEN_BUDGET_POLICIES[id];
    assert.equal(Object.isFrozen(policy), true);
    assert.deepEqual(Object.keys(policy.weights), TOKEN_BUDGET_SECTIONS);
    const sum = Object.values(policy.weights).reduce((total, value) => total + value, 0);
    assert.ok(Math.abs(sum - 1) < Number.EPSILON * 8);
  });
});

test('ECONOMY uses the expected maximum budget', () => {
  assert.equal(build('ECONOMY').tokenBudget.totalBudget, 2048);
});

test('BALANCED uses the expected maximum budget', () => {
  assert.equal(build('BALANCED').tokenBudget.totalBudget, 4096);
});

test('QUALITY uses the expected maximum budget', () => {
  assert.equal(build('QUALITY').tokenBudget.totalBudget, 8192);
});

test('MAX_CONTEXT uses the expected maximum budget', () => {
  assert.equal(build('MAX_CONTEXT').tokenBudget.totalBudget, 16384);
});

test('invalid policy falls back to BALANCED', () => {
  assert.equal(resolveTokenBudgetPolicy('invalid').id, 'BALANCED');
  assert.equal(build('invalid').tokenBudget.metadata.policy, 'BALANCED');
});

test('estimation is deterministic and explicitly approximate', () => {
  const first = estimateConversationWindow(conversationWindow());
  const second = estimateConversationWindow(conversationWindow());
  assert.deepEqual(first, second);
  assert.equal(BUDGET_ESTIMATOR_METADATA.approximate, true);
  assert.equal(BUDGET_ESTIMATOR_METADATA.tokenizerUsed, false);
  assert.equal(BUDGET_ESTIMATOR_METADATA.modelConsulted, false);
});

test('estimator handles repeated and cyclic references safely', () => {
  const repeated = { label: 'same structure' };
  const cyclic = { repeated, again: repeated };
  cyclic.self = cyclic;
  const estimate = estimateBudgetValue(cyclic);
  assert.equal(Number.isInteger(estimate), true);
  assert.ok(estimate > 0);
});

test('allocation never exceeds section demand or total budget', () => {
  const snapshot = build('ECONOMY', conversationWindow('x'.repeat(5000)));
  const budget = snapshot.tokenBudget;
  TOKEN_BUDGET_SECTIONS.forEach((section) => {
    assert.ok(budget.sections[section] <= budget.statistics.sectionDemand[section]);
  });
  assert.ok(budget.allocatedBudget <= budget.totalBudget);
  assert.equal(budget.remainingBudget, budget.totalBudget - budget.allocatedBudget);
});

test('unused capacity is redistributed to sections with unmet demand', () => {
  const demand = Object.fromEntries(TOKEN_BUDGET_SECTIONS.map((section) => [section, 0]));
  demand.messages = 5000;
  const result = allocateTokenBudget(demand, resolveTokenBudgetPolicy('ECONOMY'));
  assert.equal(result.sections.messages, 2048);
  assert.equal(result.allocatedBudget, 2048);
  assert.equal(result.remainingBudget, 0);
});

test('empty window allocates zero and preserves all available budget', () => {
  const snapshot = buildTokenBudget({});
  const budget = snapshot.tokenBudget;
  assert.equal(budget.totalBudget, 4096);
  assert.equal(budget.allocatedBudget, 0);
  assert.equal(budget.remainingBudget, 4096);
  assert.deepEqual(budget.sections, Object.fromEntries(
    TOKEN_BUDGET_SECTIONS.map((section) => [section, 0]),
  ));
});

test('maximum demand consumes but never exceeds MAX_CONTEXT', () => {
  const snapshot = build('MAX_CONTEXT', conversationWindow('x'.repeat(12000)));
  assert.equal(snapshot.tokenBudget.allocatedBudget, 16384);
  assert.equal(snapshot.tokenBudget.remainingBudget, 0);
  assert.ok(snapshot.tokenBudget.statistics.estimatedDemand > 16384);
});

test('section allocation sum matches allocated budget', () => {
  const budget = build().tokenBudget;
  const sum = Object.values(budget.sections).reduce((total, value) => total + value, 0);
  assert.equal(sum, budget.allocatedBudget);
  assert.equal(validateTokenBudget(build()).valid, true);
});

test('schema is deeply frozen', () => {
  const snapshot = build();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.tokenBudget), true);
  assert.equal(Object.isFrozen(snapshot.tokenBudget.sections), true);
  assert.equal(Object.isFrozen(snapshot.tokenBudget.statistics.sectionDemand), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('manager does not mutate or freeze Conversation Window', () => {
  const window = conversationWindow();
  const before = structuredClone(window);
  build('BALANCED', window);
  assert.deepEqual(window, before);
  assert.equal(Object.isFrozen(window), false);
  assert.equal(Object.isFrozen(window.conversationWindow.messages), false);
});

test('validator rejects mutable and inconsistent budgets', () => {
  const validation = validateTokenBudget({
    tokenBudget: {
      totalBudget: 1,
      allocatedBudget: 2,
      remainingBudget: 0,
      sections: {},
      statistics: { sectionDemand: {} },
      metadata: { policy: 'UNKNOWN', version: '0' },
    },
    version: '0',
    metadata: {},
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('INVALID_TOKEN_BUDGET_POLICY'));
  assert.ok(validation.errors.includes('TOKEN_BUDGET_NOT_IMMUTABLE'));
});

test('metadata prohibits context reduction prompt model and token consumption', () => {
  const metadata = build().metadata;
  assert.equal(metadata.conversationWindowModified, false);
  assert.equal(metadata.contextReduced, false);
  assert.equal(metadata.messagesRemoved, false);
  assert.equal(metadata.summarized, false);
  assert.equal(metadata.promptGenerated, false);
  assert.equal(metadata.modelInvoked, false);
  assert.equal(metadata.tokensConsumed, 0);
});

test('feature flag remains disabled and avoids shadow calculation by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runTokenBudgetShadow({
    conversationWindow: conversationWindow(), routingResult: routingResult(),
  }, { observer: () => { observed = true; } });
  assert.deepEqual(result, { status: 'DISABLED', tokenBudget: null });
  assert.equal(observed, false);
});

test('shadow mode observes and discards token budget', async () => {
  let observed;
  const result = await runTokenBudgetShadow({
    conversationWindow: conversationWindow(), routingResult: routingResult('QUALITY'),
  }, { enabled: true, observer: (snapshot) => { observed = snapshot; } });
  assert.equal(observed.tokenBudget.metadata.policy, 'QUALITY');
  assert.deepEqual(result, { status: 'OBSERVED', tokenBudget: null });
});

test('observer failure is contained safely', async () => {
  const result = await runTokenBudgetShadow({}, {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', tokenBudget: null });
});

test('DEV log exposes only aggregate budget numbers', async () => {
  const entries = [];
  await runTokenBudgetShadow({
    conversationWindow: conversationWindow('private content'),
    routingResult: routingResult('ECONOMY'),
  }, {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.equal(entries[0].message, '[UNI OS] Token Budget Calculated');
  assert.deepEqual(Object.keys(entries[0].data), [
    'budgetPolicy', 'estimatedBudget', 'allocatedBudget', 'remainingBudget',
  ]);
  assert.equal(JSON.stringify(entries).includes('private content'), false);
});

test('module contains no tokenizer SDK external call or prompt builder', async () => {
  const source = await readFile(new URL('./tokenBudgetManager.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /tokenizer|buildPrompt|generatePrompt|invokeModel/i);
});
