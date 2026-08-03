import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  PROMPT_PRIORITIES,
  PROMPT_SECTION_IDS,
  SYSTEM_DIRECTIVES,
  buildStructuredPrompt,
  createStructuredPromptSchema,
  runPromptBuilderShadow,
  validateStructuredPrompt,
} from './index.js';

function conversationWindow() {
  return {
    conversationWindow: {
      messages: [{ role: 'user', content: 'private conversation' }],
      goals: [{ goalId: 'goal-1', relevance: 'HIGH' }],
      memory: [{ memoryId: 'memory-1', confidence: 0.9 }],
      context: [{ key: 'workspace', value: 'business' }],
      insights: [{ insightId: 'insight-1', type: 'GOAL_PROGRESS' }],
      reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'] },
      security: { status: 'ALLOW_WITH_CONFIRMATION', reasons: [] },
      permissions: {
        status: 'AUTHORIZED_WITH_CONFIRMATION', restrictions: ['CONFIRMATION_REQUIRED'],
      },
      metadata: { version: '1.0', policy: 'NORMAL' },
    },
    metadata: { version: '1.0' },
  };
}

function tokenBudget() {
  return {
    tokenBudget: {
      allocatedBudget: 272,
      sections: {
        messages: 64,
        goals: 32,
        memory: 32,
        context: 32,
        insights: 32,
        reflection: 32,
        security: 24,
        permissions: 24,
      },
      metadata: { version: '1.0', policy: 'BALANCED' },
    },
    version: '1.0',
  };
}

function routingResult() {
  return {
    routingResult: {
      requestedCapability: 'FINANCIAL_REASONING',
      resolvedCapability: 'FINANCIAL_REASONING',
      selectedProvider: 'MOCK',
      routingPolicy: 'SAFE_MODE',
      decisionReason: 'DETERMINISTIC_TEST_ROUTE',
      estimatedCost: 'LOW',
      estimatedLatency: 'FAST',
      requiresStructuredContext: true,
      requiresStreaming: false,
      requiresVision: false,
      requiresVoice: false,
    },
    version: '1.0',
  };
}

function compiledContext() {
  return {
    compiledContext: {
      conversation: { intent: 'register_expense', confidence: 0.94 },
    },
    metadata: { version: '1.0' },
  };
}

function input() {
  return {
    conversationWindow: conversationWindow(),
    tokenBudget: tokenBudget(),
    routingResult: routingResult(),
    compiledContext: compiledContext(),
  };
}

test('builds a complete structured prompt', () => {
  const snapshot = buildStructuredPrompt(input());
  assert.equal(validateStructuredPrompt(snapshot).valid, true);
  assert.equal(snapshot.structuredPrompt.statistics.sectionsCount, 11);
  assert.equal(snapshot.structuredPrompt.metadata.responseGenerated, false);
});

test('always emits every mandatory section in fixed order', () => {
  const ids = buildStructuredPrompt(input()).structuredPrompt.sections.map(({ id }) => id);
  assert.deepEqual(ids, PROMPT_SECTION_IDS);
});

test('each section follows the shared schema', () => {
  buildStructuredPrompt(input()).structuredPrompt.sections.forEach((section, index) => {
    assert.equal(typeof section.title, 'string');
    assert.ok(PROMPT_PRIORITIES.includes(section.priority));
    assert.equal(Number.isInteger(section.estimatedTokens), true);
    assert.equal(section.metadata.order, index + 1);
    assert.equal(section.metadata.mandatory, true);
    assert.ok(Object.hasOwn(section, 'content'));
  });
});

test('SYSTEM contains only fixed representational directives', () => {
  const [system] = buildStructuredPrompt(input()).structuredPrompt.sections;
  assert.deepEqual(system.content.directives, SYSTEM_DIRECTIVES);
  assert.equal(system.content.identity, 'UNI_OS');
});

test('maps Conversation Window snapshots without changing their meaning', () => {
  const sections = Object.fromEntries(
    buildStructuredPrompt(input()).structuredPrompt.sections.map((section) => [section.id, section]),
  );
  assert.deepEqual(sections.CONTEXT.content, conversationWindow().conversationWindow.context);
  assert.deepEqual(sections.GOALS.content, conversationWindow().conversationWindow.goals);
  assert.deepEqual(sections.MEMORY.content, conversationWindow().conversationWindow.memory);
  assert.deepEqual(sections.CONVERSATION.content, conversationWindow().conversationWindow.messages);
});

test('REQUEST represents compiled conversation and routing requirements', () => {
  const request = buildStructuredPrompt(input()).structuredPrompt.sections
    .find(({ id }) => id === 'REQUEST');
  assert.equal(request.content.capability, 'FINANCIAL_REASONING');
  assert.equal(request.content.conversation.intent, 'register_expense');
  assert.deepEqual(request.content.requirements, {
    structuredContext: true,
    streaming: false,
    vision: false,
    voice: false,
  });
});

test('METADATA carries only upstream versions and routing metadata', () => {
  const metadata = buildStructuredPrompt(input()).structuredPrompt.sections
    .find(({ id }) => id === 'METADATA').content;
  assert.equal(metadata.routingPolicy, 'SAFE_MODE');
  assert.equal(metadata.selectedProvider, 'MOCK');
  assert.equal(metadata.windowPolicy, 'NORMAL');
  assert.equal(metadata.budgetPolicy, 'BALANCED');
});

test('estimated tokens equal the deterministic sum of all sections', () => {
  const prompt = buildStructuredPrompt(input()).structuredPrompt;
  const sum = prompt.sections.reduce((total, section) => total + section.estimatedTokens, 0);
  assert.equal(prompt.estimatedTokens, sum);
  assert.equal(prompt.estimatedTokens, buildStructuredPrompt(input()).structuredPrompt.estimatedTokens);
});

test('section metadata reflects Token Budget without truncating content', () => {
  const prompt = buildStructuredPrompt(input()).structuredPrompt;
  const goals = prompt.sections.find(({ id }) => id === 'GOALS');
  assert.equal(goals.metadata.budgetSection, 'goals');
  assert.equal(goals.metadata.allocatedBudget, 32);
  assert.deepEqual(goals.content, conversationWindow().conversationWindow.goals);
});

test('routing cost and provider remain representational', () => {
  const prompt = buildStructuredPrompt(input()).structuredPrompt;
  assert.equal(prompt.estimatedCost, 'LOW');
  assert.equal(prompt.routing.selectedProvider, 'MOCK');
  assert.equal(prompt.routing.representationalOnly, true);
});

test('empty input still creates all mandatory empty sections', () => {
  const snapshot = buildStructuredPrompt({});
  assert.deepEqual(snapshot.structuredPrompt.sections.map(({ id }) => id), PROMPT_SECTION_IDS);
  assert.equal(validateStructuredPrompt(snapshot).valid, true);
  assert.deepEqual(
    snapshot.structuredPrompt.sections.find(({ id }) => id === 'CONVERSATION').content,
    [],
  );
});

test('schema is deeply frozen', () => {
  const snapshot = buildStructuredPrompt(input());
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.structuredPrompt), true);
  assert.equal(Object.isFrozen(snapshot.structuredPrompt.sections), true);
  assert.equal(Object.isFrozen(snapshot.structuredPrompt.sections[0].content), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('builder clones inputs before freezing and leaves them mutable', () => {
  const source = input();
  const before = structuredClone(source);
  const snapshot = buildStructuredPrompt(source);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.conversationWindow.conversationWindow.messages), false);
  assert.notEqual(
    snapshot.structuredPrompt.sections.find(({ id }) => id === 'CONVERSATION').content,
    source.conversationWindow.conversationWindow.messages,
  );
});

test('validator rejects duplicate sections', () => {
  const mutable = structuredClone(buildStructuredPrompt(input()));
  mutable.structuredPrompt.sections[1].id = 'SYSTEM';
  const validation = validateStructuredPrompt(mutable);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('DUPLICATE_PROMPT_SECTION'));
});

test('validator rejects missing and out-of-order sections', () => {
  const mutable = structuredClone(buildStructuredPrompt(input()));
  mutable.structuredPrompt.sections.pop();
  mutable.structuredPrompt.sections.reverse();
  const validation = validateStructuredPrompt(mutable);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('INVALID_SECTION_COUNT'));
  assert.ok(validation.errors.includes('INVALID_PROMPT_SECTION_ORDER'));
});

test('validator rejects invalid priority estimate and mutable schema', () => {
  const mutable = structuredClone(buildStructuredPrompt(input()));
  mutable.structuredPrompt.sections[0].priority = 'IMMEDIATE';
  mutable.structuredPrompt.sections[0].estimatedTokens = -1;
  const validation = validateStructuredPrompt(mutable);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('INVALID_SYSTEM_PRIORITY'));
  assert.ok(validation.errors.includes('INVALID_SYSTEM_ESTIMATE'));
  assert.ok(validation.errors.includes('STRUCTURED_PROMPT_NOT_IMMUTABLE'));
});

test('schema normalizes invalid costs without consuming anything', () => {
  const snapshot = createStructuredPromptSchema({ estimatedCost: 'unknown' });
  assert.equal(snapshot.structuredPrompt.estimatedCost, null);
  assert.equal(snapshot.metadata.tokensConsumed, 0);
  assert.equal(snapshot.metadata.modelInvoked, false);
});

test('feature flag remains disabled and avoids shadow building by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runPromptBuilderShadow(input(), {
    observer: () => { observed = true; },
  });
  assert.deepEqual(result, { status: 'DISABLED', structuredPrompt: null });
  assert.equal(observed, false);
});

test('shadow mode observes then discards the structured prompt', async () => {
  let observed;
  const result = await runPromptBuilderShadow(input(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(observed.structuredPrompt.statistics.sectionsCount, 11);
  assert.deepEqual(result, { status: 'OBSERVED', structuredPrompt: null });
});

test('observer failures are contained safely', async () => {
  const result = await runPromptBuilderShadow(input(), {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', structuredPrompt: null });
});

test('DEV log exposes aggregate routing data but no prompt content', async () => {
  const entries = [];
  await runPromptBuilderShadow(input(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.equal(entries[0].message, '[UNI OS] Prompt Built');
  assert.deepEqual(Object.keys(entries[0].data), [
    'sectionsCount', 'estimatedTokens', 'estimatedCost', 'capability', 'provider',
  ]);
  assert.equal(JSON.stringify(entries).includes('private conversation'), false);
});

test('builder source contains no model adapter network or response generation', async () => {
  const source = await readFile(new URL('./promptBuilder.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /\.invoke\s*\(|generateResponse|adapter\.buildRequest/i);
});
