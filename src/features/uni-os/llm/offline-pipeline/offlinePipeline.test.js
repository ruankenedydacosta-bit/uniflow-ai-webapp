import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { providerRegistry } from '../provider-registry/index.js';
import {
  OFFLINE_PIPELINE_MODULE_ORDER,
  executeOfflinePipeline,
  runOfflinePipelineShadow,
  validateOfflinePipelineResult,
} from './index.js';

function compiledContext(message = 'structured local request') {
  return {
    compiledContext: {
      conversation: {
        messages: [{ role: 'user', content: message }],
        intent: 'question',
      },
      goals: [{ goalId: 'goal-1', relevance: 'HIGH', score: 0.9 }],
      memory: [{ memoryId: 'memory-1', relevance: 'HIGH', confidence: 0.9 }],
      context: [{ key: 'workspace', value: 'business', relevance: 'HIGH' }],
      insights: [{ insightId: 'insight-1', type: 'GOAL_PROGRESS', priority: 'NORMAL' }],
      reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'] },
      security: { status: 'ALLOW_WITH_CONFIRMATION', reasons: [] },
      permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION', restrictions: [] },
    },
    metadata: { version: '1.0' },
  };
}

function validInput(overrides = {}) {
  return {
    compiledContext: compiledContext(),
    requestedCapability: 'GENERAL_REASONING',
    routingPolicy: 'DEFAULT',
    latencyProfile: 'FAST',
    ...overrides,
  };
}

function body(snapshot) {
  return snapshot.offlinePipelineResult;
}

function issues(snapshot) {
  return body(snapshot).validationReport.validationReport.issues;
}

test('executes the complete offline cognitive pipeline', async () => {
  const result = body(await executeOfflinePipeline(validInput()));
  assert.ok(result.routing);
  assert.ok(result.conversationWindow);
  assert.ok(result.tokenBudget);
  assert.ok(result.structuredPrompt);
  assert.ok(result.validationReport);
  assert.ok(result.mockResponse);
  assert.equal(result.metadata.pipelineStatus, 'COMPLETED');
});

test('executes every module in the mandatory order', async () => {
  const result = body(await executeOfflinePipeline(validInput()));
  assert.deepEqual(result.statistics.executedModules, OFFLINE_PIPELINE_MODULE_ORDER);
  assert.equal(result.statistics.modulesExecuted, 6);
});

test('Prompt Validator approval precedes Mock execution', async () => {
  const result = body(await executeOfflinePipeline(validInput()));
  const order = result.statistics.executedModules;
  assert.equal(result.validationReport.validationReport.approved, true);
  assert.ok(order.indexOf('PROMPT_VALIDATOR') < order.indexOf('LLM_ADAPTER_MOCK'));
  assert.equal(result.statistics.validationStatus, 'APPROVED');
});

test('executes only the local Mock Adapter after approval', async () => {
  const result = body(await executeOfflinePipeline(validInput()));
  assert.equal(result.mockResponse.provider, 'UNI_OS_MOCK');
  assert.equal(result.mockResponse.status, 'SUCCESS');
  assert.equal(result.mockResponse.metadata.simulated, true);
  assert.equal(result.mockResponse.metadata.modelExecuted, false);
  assert.equal(result.mockResponse.metadata.externalRequest, false);
});

test('no eligible providers rejects prompt and blocks Mock', async () => {
  const emptyRegistry = { ...providerRegistry, providers: [] };
  const result = body(await executeOfflinePipeline(validInput({
    providerRegistry: emptyRegistry,
  })));
  assert.equal(result.routing.routingResult.selectedProvider, null);
  assert.equal(result.validationReport.validationReport.approved, false);
  assert.equal(result.mockResponse, null);
  assert.deepEqual(result.statistics.executedModules, OFFLINE_PIPELINE_MODULE_ORDER.slice(0, -1));
});

test('invalid capability is rejected before Mock execution', async () => {
  const snapshot = await executeOfflinePipeline(validInput({
    requestedCapability: 'UNKNOWN_CAPABILITY',
  }));
  assert.equal(issues(snapshot).some(
    (issue) => issue.code === 'CAPABILITY_REQUIRED',
  ), true);
  assert.equal(
    body(snapshot).routing.routingResult.requestedCapability,
    'UNKNOWN_CAPABILITY',
  );
  assert.equal(body(snapshot).mockResponse, null);
});

test('budget overflow produces rejected prompt and stops pipeline', async () => {
  const snapshot = await executeOfflinePipeline(validInput({
    compiledContext: compiledContext('x'.repeat(50000)),
  }));
  assert.equal(issues(snapshot).some(
    (issue) => issue.code === 'SECTION_BUDGET_EXCEEDED',
  ), true);
  assert.equal(body(snapshot).metadata.pipelineStatus, 'BLOCKED');
  assert.equal(body(snapshot).mockResponse, null);
});

test('rejected Prompt Validator report is preserved without correction', async () => {
  const snapshot = await executeOfflinePipeline(validInput({
    requestedCapability: 'INVALID',
  }));
  const result = body(snapshot);
  assert.equal(result.validationReport.validationReport.status, 'REJECTED');
  assert.equal(result.structuredPrompt.structuredPrompt.routing.resolvedCapability, null);
  assert.equal(result.metadata.mockExecuted, false);
});

test('empty input completes safely as blocked without invoking Mock', async () => {
  const snapshot = await executeOfflinePipeline({});
  assert.equal(body(snapshot).metadata.pipelineStatus, 'BLOCKED');
  assert.equal(body(snapshot).mockResponse, null);
  assert.equal(validateOfflinePipelineResult(snapshot).valid, true);
});

test('result and every snapshot are deeply frozen', async () => {
  const snapshot = await executeOfflinePipeline(validInput());
  const result = body(snapshot);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(result.routing), true);
  assert.equal(Object.isFrozen(result.conversationWindow), true);
  assert.equal(Object.isFrozen(result.tokenBudget), true);
  assert.equal(Object.isFrozen(result.structuredPrompt), true);
  assert.equal(Object.isFrozen(result.validationReport), true);
  assert.equal(Object.isFrozen(result.mockResponse), true);
});

test('pipeline never modifies or freezes caller input', async () => {
  const input = validInput();
  const before = structuredClone(input);
  await executeOfflinePipeline(input);
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.compiledContext), false);
});

test('pipeline validator rejects mutable or reordered results', async () => {
  const mutable = structuredClone(await executeOfflinePipeline(validInput()));
  mutable.offlinePipelineResult.statistics.executedModules.reverse();
  const validation = validateOfflinePipelineResult(mutable);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('MODULE_ORDER_INVALID'));
  assert.ok(validation.errors.includes('PIPELINE_RESULT_NOT_IMMUTABLE'));
});

test('telemetry records technical duration without prompt content', async () => {
  const ticks = [10, 14.25];
  const result = body(await executeOfflinePipeline(validInput(), {
    now: () => ticks.shift(),
  }));
  assert.equal(result.statistics.executionTimeMs, 4.25);
  assert.equal(JSON.stringify(result.statistics).includes('structured local request'), false);
});

test('Mock failure is contained by shadow runner', async () => {
  const result = await runOfflinePipelineShadow(validInput(), {
    enabled: true,
    mockAdapterOptions: { healthStatus: 'OFFLINE' },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', offlinePipelineResult: null });
});

test('feature flag remains disabled and pipeline stays inactive by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runOfflinePipelineShadow(validInput(), {
    observer: () => { observed = true; },
  });
  assert.deepEqual(result, { status: 'DISABLED', offlinePipelineResult: null });
  assert.equal(observed, false);
});

test('shadow mode observes once and discards final result', async () => {
  let observed;
  const result = await runOfflinePipelineShadow(validInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(body(observed).metadata.mockExecuted, true);
  assert.deepEqual(result, { status: 'OBSERVED', offlinePipelineResult: null });
});

test('observer failure is contained without returning snapshots', async () => {
  const result = await runOfflinePipelineShadow(validInput(), {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', offlinePipelineResult: null });
});

test('DEV telemetry logs only allowed aggregate fields', async () => {
  const logs = [];
  await runOfflinePipelineShadow(validInput(), {
    enabled: true,
    isDevelopment: true,
    logger: {
      info: (message, data) => logs.push({ message, data }),
      warn: (message) => logs.push({ message }),
    },
  });
  assert.deepEqual(Object.keys(logs[0].data), ['shadowMode']);
  assert.deepEqual(Object.keys(logs[1].data), [
    'executionTimeMs', 'executedModules', 'validationStatus', 'mockExecuted',
  ]);
  assert.equal(JSON.stringify(logs).includes('structured local request'), false);
});

test('pipeline source contains no real provider SDK HTTP or external API call', async () => {
  const files = ['./offlinePipeline.js', './offlinePipelineRunner.js'];
  const source = (await Promise.all(files.map((file) => (
    readFile(new URL(file, import.meta.url), 'utf8')
  )))).join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /https?:\/\/|service_role|api[_-]?key/i);
});
