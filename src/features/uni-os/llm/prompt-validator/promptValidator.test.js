import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { createModelRoutingSchema } from '../model-router/index.js';
import { buildStructuredPrompt } from '../prompt-builder/index.js';
import { createTokenBudgetSchema } from '../token-budget/index.js';
import {
  PROMPT_VALIDATION_LEVELS,
  PROMPT_VALIDATION_STATUSES,
  runPromptValidatorShadow,
  validatePrompt,
} from './index.js';

const BUDGET_SECTIONS = [
  'messages', 'goals', 'memory', 'context',
  'insights', 'reflection', 'security', 'permissions',
];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function routing(overrides = {}) {
  return createModelRoutingSchema({
    requestedCapability: 'GENERAL_REASONING',
    resolvedCapability: 'GENERAL_REASONING',
    candidateProviders: [{ providerId: 'OPENAI', score: 100 }],
    selectedProvider: 'OPENAI',
    fallbackProviders: ['CLAUDE'],
    routingPolicy: 'DEFAULT',
    decisionReason: 'ROUTING_POLICY_APPLIED',
    estimatedCost: 'MEDIUM',
    estimatedLatency: 'NORMAL',
    requiresStructuredContext: true,
    confidence: 1,
    ...overrides,
  });
}

function budget() {
  const sections = Object.fromEntries(BUDGET_SECTIONS.map((section) => [section, 256]));
  return createTokenBudgetSchema({
    totalBudget: 2048,
    sections,
    sectionDemand: sections,
    policy: 'BALANCED',
    estimator: 'DETERMINISTIC_STRUCTURE_RATIO_V1',
  });
}

function windowSnapshot() {
  return {
    conversationWindow: {
      messages: [{ role: 'user', content: 'structured request' }],
      goals: [{ goalId: 'goal-1', relevance: 'HIGH' }],
      memory: [{ memoryId: 'memory-1', confidence: 0.9 }],
      context: [{ key: 'workspace', value: 'business' }],
      insights: [{ insightId: 'insight-1', type: 'GOAL_PROGRESS' }],
      reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'] },
      security: { status: 'ALLOW_WITH_CONFIRMATION', reasons: [] },
      permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION', restrictions: [] },
      metadata: { version: '1.0', policy: 'NORMAL' },
    },
    metadata: { version: '1.0' },
  };
}

function validationInput(routingSnapshot = routing(), budgetSnapshot = budget()) {
  const structuredPrompt = buildStructuredPrompt({
    conversationWindow: windowSnapshot(),
    tokenBudget: budgetSnapshot,
    routingResult: routingSnapshot,
    compiledContext: {
      compiledContext: { conversation: { intent: 'question', confidence: 0.95 } },
      metadata: { version: '1.0' },
    },
  });
  return { structuredPrompt, routingResult: routingSnapshot, tokenBudget: budgetSnapshot };
}

function hasIssue(report, code) {
  return report.validationReport.issues.some((issue) => issue.code === code);
}

test('valid structured prompt is approved without issues', () => {
  const report = validatePrompt(validationInput());
  assert.equal(report.validationReport.status, 'APPROVED');
  assert.equal(report.validationReport.approved, true);
  assert.deepEqual(report.validationReport.issues, []);
});

test('empty prompt produces a rejected audit report', () => {
  const report = validatePrompt({});
  assert.equal(report.validationReport.status, 'REJECTED');
  assert.equal(report.validationReport.approved, false);
  assert.equal(hasIssue(report, 'PROMPT_REQUIRED'), true);
});

test('invalid schema is detected without correcting it', () => {
  const source = validationInput();
  const changed = structuredClone(source.structuredPrompt);
  changed.version = '0';
  const report = validatePrompt({ ...source, structuredPrompt: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'PROMPT_SCHEMA_INVALID'), true);
  assert.equal(changed.version, '0');
});

test('inconsistent budget blocks approval', () => {
  const source = validationInput();
  const changed = structuredClone(source.tokenBudget);
  changed.tokenBudget.sections.messages = 1;
  const report = validatePrompt({ ...source, tokenBudget: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'BUDGET_INCONSISTENT'), true);
  assert.equal(report.validationReport.approved, false);
});

test('section demand above available budget is blocking', () => {
  const source = validationInput();
  const changed = structuredClone(source.tokenBudget);
  changed.tokenBudget.sections.messages = 0;
  changed.tokenBudget.allocatedBudget -= 256;
  changed.tokenBudget.remainingBudget += 256;
  const report = validatePrompt({ ...source, tokenBudget: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'SECTION_BUDGET_EXCEEDED'), true);
});

test('unregistered capability is rejected', () => {
  const invalidRouting = routing({
    requestedCapability: 'UNKNOWN_CAPABILITY',
    resolvedCapability: 'UNKNOWN_CAPABILITY',
  });
  const report = validatePrompt(validationInput(invalidRouting));
  assert.equal(hasIssue(report, 'CAPABILITY_NOT_REGISTERED'), true);
  assert.equal(report.validationReport.approved, false);
});

test('unregistered representational provider is rejected', () => {
  const invalidRouting = routing({ selectedProvider: 'MISSING_PROVIDER' });
  const report = validatePrompt(validationInput(invalidRouting));
  assert.equal(hasIssue(report, 'PROVIDER_NOT_REGISTERED'), true);
});

test('provider without requested capability is rejected', () => {
  const incompatible = routing({
    requestedCapability: 'OCR',
    resolvedCapability: 'OCR',
    selectedProvider: 'LLAMA_LOCAL',
  });
  const report = validatePrompt(validationInput(incompatible));
  assert.equal(hasIssue(report, 'PROVIDER_CAPABILITY_MISMATCH'), true);
});

test('duplicate section is detected without being removed', () => {
  const source = validationInput();
  const changed = structuredClone(source.structuredPrompt);
  changed.structuredPrompt.sections[1].id = 'SYSTEM';
  const report = validatePrompt({ ...source, structuredPrompt: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'DUPLICATE_SECTION'), true);
  assert.equal(changed.structuredPrompt.sections.length, 11);
});

test('section order and priority are audited independently', () => {
  const source = validationInput();
  const changed = structuredClone(source.structuredPrompt);
  changed.structuredPrompt.sections.reverse();
  changed.structuredPrompt.sections[0].priority = 'IMMEDIATE';
  const report = validatePrompt({ ...source, structuredPrompt: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'SECTION_ORDER_INVALID'), true);
  assert.equal(hasIssue(report, 'PRIORITY_INVALID'), true);
});

test('invalid estimate and total are blocking audit findings', () => {
  const source = validationInput();
  const changed = structuredClone(source.structuredPrompt);
  changed.structuredPrompt.sections[0].estimatedTokens = -1;
  const report = validatePrompt({ ...source, structuredPrompt: deepFreeze(changed) });
  assert.equal(hasIssue(report, 'ESTIMATE_INVALID'), true);
  assert.equal(hasIssue(report, 'ESTIMATED_TOTAL_MISMATCH'), true);
});

test('mutable prompt fails deep freeze validation', () => {
  const source = validationInput();
  const mutablePrompt = structuredClone(source.structuredPrompt);
  const report = validatePrompt({ ...source, structuredPrompt: mutablePrompt });
  assert.equal(hasIssue(report, 'PROMPT_NOT_IMMUTABLE'), true);
});

test('missing cost estimate creates warning without blocking', () => {
  const noCostRouting = routing({ estimatedCost: null });
  const report = validatePrompt(validationInput(noCostRouting));
  assert.equal(report.validationReport.status, 'APPROVED_WITH_WARNINGS');
  assert.equal(report.validationReport.approved, true);
  assert.equal(hasIssue(report, 'ESTIMATED_COST_UNAVAILABLE'), true);
});

test('report supports every declared level and status', () => {
  assert.deepEqual(PROMPT_VALIDATION_LEVELS, ['INFO', 'WARNING', 'ERROR', 'BLOCKING']);
  assert.deepEqual(PROMPT_VALIDATION_STATUSES, [
    'APPROVED', 'APPROVED_WITH_WARNINGS', 'REJECTED',
  ]);
});

test('validation report is deeply frozen', () => {
  const report = validatePrompt(validationInput());
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.validationReport), true);
  assert.equal(Object.isFrozen(report.validationReport.issues), true);
  assert.equal(Object.isFrozen(report.validationReport.statistics.byLevel), true);
});

test('validator never mutates prompt routing or budget', () => {
  const source = validationInput();
  const before = JSON.stringify(source);
  validatePrompt(source);
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source.structuredPrompt), true);
  assert.equal(Object.isFrozen(source.routingResult), true);
  assert.equal(Object.isFrozen(source.tokenBudget), true);
});

test('feature flag remains disabled and skips shadow audit by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runPromptValidatorShadow(validationInput(), {
    observer: () => { observed = true; },
  });
  assert.deepEqual(result, { status: 'DISABLED', validationReport: null });
  assert.equal(observed, false);
});

test('shadow mode observes and discards report', async () => {
  let observed;
  const result = await runPromptValidatorShadow(validationInput(), {
    enabled: true,
    observer: (report) => { observed = report; },
  });
  assert.equal(observed.validationReport.approved, true);
  assert.deepEqual(result, { status: 'OBSERVED', validationReport: null });
});

test('observer failure is contained safely', async () => {
  const result = await runPromptValidatorShadow(validationInput(), {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', validationReport: null });
});

test('DEV log exposes only aggregate validation data', async () => {
  const entries = [];
  await runPromptValidatorShadow(validationInput(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.equal(entries[0].message, '[UNI OS] Prompt Validated');
  assert.deepEqual(Object.keys(entries[0].data), [
    'validationStatus', 'warnings', 'errors', 'approved',
  ]);
  assert.equal(JSON.stringify(entries).includes('structured request'), false);
});

test('validator source contains no adapter model SDK or network call', async () => {
  const source = await readFile(new URL('./promptValidatorEngine.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /\.invoke\s*\(|buildRequest|generateResponse/i);
});
