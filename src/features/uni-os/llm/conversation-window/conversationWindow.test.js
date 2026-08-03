import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  CONVERSATION_WINDOW_POLICIES,
  CONVERSATION_WINDOW_POLICY_IDS,
  buildConversationWindow,
  resolveConversationWindowPolicy,
  runConversationWindowShadow,
  validateConversationWindow,
} from './index.js';

function items(prefix, amount) {
  return Array.from({ length: amount }, (_, index) => ({ id: `${prefix}-${index + 1}`, rank: index + 1 }));
}

function compiledContext() {
  return {
    compiledContext: {
      conversation: { messages: items('message', 20) },
      goals: items('goal', 10),
      memory: items('memory', 14),
      context: items('context', 14),
      insights: items('insight', 10),
      reflection: { overallRisk: 'LOW' },
      security: { status: 'ALLOW_WITH_CONFIRMATION' },
      permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION' },
    },
    metadata: { version: '1.0' },
  };
}

function routingResult(policy = 'NORMAL') {
  return {
    routingResult: {
      requestedCapability: 'GENERAL_REASONING',
      metadata: { conversationWindowPolicy: policy },
    },
  };
}

function build(policy = 'NORMAL', context = compiledContext()) {
  return buildConversationWindow({ compiledContext: context, routingResult: routingResult(policy) });
}

test('exposes the four immutable window policies', () => {
  assert.deepEqual(CONVERSATION_WINDOW_POLICY_IDS, ['SHORT', 'NORMAL', 'LONG', 'FULL']);
  assert.equal(Object.isFrozen(CONVERSATION_WINDOW_POLICIES), true);
  CONVERSATION_WINDOW_POLICY_IDS.forEach((policy) => {
    assert.equal(Object.isFrozen(CONVERSATION_WINDOW_POLICIES[policy]), true);
  });
});

test('SHORT applies every collection limit', () => {
  const snapshot = build('SHORT');
  assert.deepEqual(snapshot.statistics.selected, {
    messages: 4, goals: 2, memory: 3, context: 3, insights: 2,
  });
});

test('NORMAL applies every collection limit', () => {
  const snapshot = build('NORMAL');
  assert.deepEqual(snapshot.statistics.selected, {
    messages: 8, goals: 4, memory: 6, context: 6, insights: 4,
  });
});

test('LONG applies every collection limit', () => {
  const snapshot = build('LONG');
  assert.deepEqual(snapshot.statistics.selected, {
    messages: 16, goals: 8, memory: 12, context: 12, insights: 8,
  });
});

test('FULL preserves all eligible elements', () => {
  const snapshot = build('FULL');
  assert.deepEqual(snapshot.statistics.selected, {
    messages: 20, goals: 10, memory: 14, context: 14, insights: 10,
  });
  assert.equal(snapshot.statistics.totalSelected, 68);
});

test('invalid policy uses NORMAL safely', () => {
  assert.equal(resolveConversationWindowPolicy('invalid').id, 'NORMAL');
  assert.equal(build('invalid').conversationWindow.metadata.policy, 'NORMAL');
});

test('recent messages retain chronological order', () => {
  const messages = build('SHORT').conversationWindow.messages;
  assert.deepEqual(messages.map((item) => item.id), [
    'message-17', 'message-18', 'message-19', 'message-20',
  ]);
});

test('ranked collections preserve their received order', () => {
  const window = build('SHORT').conversationWindow;
  assert.deepEqual(window.goals.map((item) => item.id), ['goal-1', 'goal-2']);
  assert.deepEqual(window.memory.map((item) => item.id), ['memory-1', 'memory-2', 'memory-3']);
  assert.deepEqual(window.context.map((item) => item.id), ['context-1', 'context-2', 'context-3']);
  assert.deepEqual(window.insights.map((item) => item.id), ['insight-1', 'insight-2']);
});

test('reflection security and permissions are always preserved', () => {
  const window = build('SHORT').conversationWindow;
  assert.deepEqual(window.reflection, { overallRisk: 'LOW' });
  assert.deepEqual(window.security, { status: 'ALLOW_WITH_CONFIRMATION' });
  assert.deepEqual(window.permissions, { status: 'AUTHORIZED_WITH_CONFIRMATION' });
});

test('objects empty produce a complete safe snapshot', () => {
  const snapshot = buildConversationWindow({});
  assert.deepEqual(snapshot.statistics.selected, {
    messages: 0, goals: 0, memory: 0, context: 0, insights: 0,
  });
  assert.deepEqual(snapshot.conversationWindow.reflection, {});
  assert.equal(validateConversationWindow(snapshot).valid, true);
});

test('accepts the compiled context inner record without changing semantics', () => {
  const source = compiledContext().compiledContext;
  const snapshot = build('SHORT', source);
  assert.equal(snapshot.statistics.eligible.messages, 20);
  assert.equal(snapshot.conversationWindow.security.status, 'ALLOW_WITH_CONFIRMATION');
});

test('conversation history is accepted as the read-only message source', () => {
  const source = compiledContext();
  source.compiledContext.conversation = { history: items('history', 6) };
  const messages = build('SHORT', source).conversationWindow.messages;
  assert.deepEqual(messages.map((item) => item.id), [
    'history-3', 'history-4', 'history-5', 'history-6',
  ]);
});

test('snapshot is deeply frozen', () => {
  const snapshot = build();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.conversationWindow), true);
  assert.equal(Object.isFrozen(snapshot.conversationWindow.messages), true);
  assert.equal(Object.isFrozen(snapshot.conversationWindow.messages[0]), true);
  assert.equal(Object.isFrozen(snapshot.statistics.selected), true);
});

test('manager clones inputs without modifying or freezing them', () => {
  const context = compiledContext();
  const before = structuredClone(context);
  const snapshot = build('SHORT', context);
  assert.deepEqual(context, before);
  assert.equal(Object.isFrozen(context), false);
  context.compiledContext.goals[0].id = 'changed';
  assert.equal(snapshot.conversationWindow.goals[0].id, 'goal-1');
});

test('validator rejects mutable and structurally incomplete snapshots', () => {
  const validation = validateConversationWindow({ conversationWindow: {} });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('WINDOW_MESSAGES_ARRAY_REQUIRED'));
  assert.ok(validation.errors.includes('CONVERSATION_WINDOW_NOT_IMMUTABLE'));
});

test('metadata explicitly prohibits summary prompt model tokens and execution', () => {
  const metadata = build().metadata;
  assert.equal(metadata.summarized, false);
  assert.equal(metadata.promptGenerated, false);
  assert.equal(metadata.modelInvoked, false);
  assert.equal(metadata.tokensConsumed, 0);
  assert.equal(metadata.executionAllowed, false);
});

test('feature flag remains disabled and prevents shadow work by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runConversationWindowShadow({
    compiledContext: compiledContext(), routingResult: routingResult(),
  }, { observer: () => { observed = true; } });
  assert.deepEqual(result, { status: 'DISABLED', conversationWindow: null });
  assert.equal(observed, false);
});

test('shadow mode observes once and discards the window', async () => {
  let observed;
  const result = await runConversationWindowShadow({
    compiledContext: compiledContext(), routingResult: routingResult('SHORT'),
  }, { enabled: true, observer: (snapshot) => { observed = snapshot; } });
  assert.equal(observed.conversationWindow.metadata.policy, 'SHORT');
  assert.deepEqual(result, { status: 'OBSERVED', conversationWindow: null });
});

test('observer failure is contained by shadow mode', async () => {
  const result = await runConversationWindowShadow({}, {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', conversationWindow: null });
});

test('DEV log contains only counts and policy', async () => {
  const entries = [];
  await runConversationWindowShadow({
    compiledContext: compiledContext(), routingResult: routingResult('SHORT'),
  }, {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.equal(entries[0].message, '[UNI OS] Conversation Window Built');
  assert.deepEqual(Object.keys(entries[0].data), [
    'messagesSelected', 'goalsSelected', 'memorySelected', 'windowPolicy',
  ]);
  assert.equal(JSON.stringify(entries).includes('message-20'), false);
});

test('module contains no external call or prompt builder', async () => {
  const source = await readFile(new URL('./conversationWindowManager.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /buildPrompt|generatePrompt|invokeModel/i);
});
