import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { buildConversationWindow } from '../conversation-window/index.js';
import { routeModel } from '../model-router/index.js';
import { PROMPT_SECTION_IDS, buildStructuredPrompt } from '../prompt-builder/index.js';
import { validatePrompt } from '../prompt-validator/index.js';
import { buildTokenBudget } from '../token-budget/index.js';
import {
  COMPILER_POLICY_IDS,
  compilePrompt,
  runPromptCompilerShadow,
  validateCompiledPrompt,
  validatePromptCompilationError,
} from './index.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function compiledContext(message = 'structured compiler request') {
  return {
    compiledContext: {
      conversation: { messages: [{ role: 'user', content: message }], intent: 'question' },
      goals: [{ goalId: 'goal-1', relevance: 'HIGH' }],
      memory: [{ memoryId: 'memory-1', confidence: 0.9 }],
      context: [{ key: 'workspace', value: 'business' }],
      insights: [{ insightId: 'insight-1', type: 'GOAL_PROGRESS' }],
      reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'] },
      security: { status: 'ALLOW_WITH_CONFIRMATION', reasons: [] },
      permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION', restrictions: [] },
    },
    metadata: { version: '1.0' },
  };
}

function compilerInput(requestedCapability = 'GENERAL_REASONING') {
  const context = compiledContext();
  const routingResult = routeModel({
    compiledContext: context,
    requestedCapability,
    routingPolicy: 'DEFAULT',
  });
  const conversationWindow = buildConversationWindow({
    compiledContext: context,
    routingResult,
  });
  const tokenBudget = buildTokenBudget({ conversationWindow, routingResult });
  const structuredPrompt = buildStructuredPrompt({
    conversationWindow,
    tokenBudget,
    routingResult,
    compiledContext: context,
  });
  const validationReport = validatePrompt({ structuredPrompt, routingResult, tokenBudget });
  return { structuredPrompt, validationReport, routingResult };
}

test('compiles an approved structured prompt', () => {
  const input = compilerInput();
  const result = compilePrompt(input);
  assert.ok(result.compiledPrompt);
  assert.equal(result.error, undefined);
  assert.equal(result.compiledPrompt.metadata.sourceApproved, true);
  assert.equal(validateCompiledPrompt(result, input).valid, true);
});

test('rejected prompt returns a structured blocking error', () => {
  const result = compilePrompt(compilerInput('UNKNOWN_CAPABILITY'));
  assert.equal(result.compiledPrompt, null);
  assert.equal(result.error.code, 'PROMPT_NOT_APPROVED');
  assert.equal(result.error.blocking, true);
  assert.equal(validatePromptCompilationError(result).valid, true);
});

test('supports all four compiler policies', () => {
  const input = compilerInput();
  COMPILER_POLICY_IDS.forEach((policy) => {
    const result = compilePrompt(input, { policy });
    assert.equal(result.compiledPrompt.policy, policy);
    assert.equal(result.compiledPrompt.sections.length, 11);
  });
});

test('invalid policy falls back to STANDARD', () => {
  const result = compilePrompt(compilerInput(), { policy: 'unknown' });
  assert.equal(result.compiledPrompt.policy, 'STANDARD');
});

test('emits all sections in the mandatory order', () => {
  const sections = compilePrompt(compilerInput()).compiledPrompt.sections;
  assert.deepEqual(sections.map(({ id }) => id), PROMPT_SECTION_IDS);
});

test('every textual section includes title separator and content', () => {
  const sections = compilePrompt(compilerInput()).compiledPrompt.sections;
  sections.forEach((section) => {
    assert.match(section.formattedText, new RegExp(`^## ${section.id}\\n---\\n`));
    assert.ok(section.formattedText.length > section.title.length + section.separator.length);
  });
});

test('policies change presentation but preserve section content', () => {
  const input = compilerInput();
  const standard = compilePrompt(input, { policy: 'STANDARD' }).compiledPrompt;
  const compact = compilePrompt(input, { policy: 'COMPACT' }).compiledPrompt;
  const debug = compilePrompt(input, { policy: 'DEBUG' }).compiledPrompt;
  const verbose = compilePrompt(input, { policy: 'VERBOSE' }).compiledPrompt;
  assert.notEqual(standard.text, compact.text);
  assert.notEqual(debug.text, verbose.text);
  [compact, debug, verbose].forEach((compiled) => {
    compiled.sections.forEach((section, index) => {
      assert.deepEqual(section.content, standard.sections[index].content);
    });
  });
});

test('DEBUG and VERBOSE add compiler metadata without changing source metadata', () => {
  const input = compilerInput();
  ['DEBUG', 'VERBOSE'].forEach((policy) => {
    const section = compilePrompt(input, { policy }).compiledPrompt.sections[0];
    assert.equal(section.metadata.compilerMetadataIncluded, true);
    assert.deepEqual(
      section.metadata.sourceMetadata,
      input.structuredPrompt.structuredPrompt.sections[0].metadata,
    );
  });
});

test('copies source estimates and routing without recalculation', () => {
  const input = compilerInput();
  const compiled = compilePrompt(input).compiledPrompt;
  assert.equal(compiled.estimatedTokens, input.structuredPrompt.structuredPrompt.estimatedTokens);
  assert.equal(compiled.estimatedCost, input.structuredPrompt.structuredPrompt.estimatedCost);
  assert.deepEqual(compiled.routing, input.routingResult.routingResult);
});

test('compiled schema exposes deterministic text statistics', () => {
  const compiled = compilePrompt(compilerInput()).compiledPrompt;
  assert.equal(compiled.statistics.sectionsCount, 11);
  assert.equal(compiled.statistics.formattedSections, 11);
  assert.equal(compiled.statistics.promptLength, compiled.text.length);
  assert.equal(compiled.statistics.lineCount, compiled.text.split('\n').length);
});

test('compiled prompt and every section are deeply frozen', () => {
  const result = compilePrompt(compilerInput());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.compiledPrompt), true);
  assert.equal(Object.isFrozen(result.compiledPrompt.sections), true);
  assert.equal(Object.isFrozen(result.compiledPrompt.sections[0].content), true);
  assert.equal(Object.isFrozen(result.metadata), true);
});

test('compiler never mutates or freezes caller inputs', () => {
  const input = compilerInput();
  const before = JSON.stringify(input);
  compilePrompt(input, { policy: 'VERBOSE' });
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input), false);
});

test('duplicate structured section produces controlled input error', () => {
  const input = compilerInput();
  const changed = structuredClone(input.structuredPrompt);
  changed.structuredPrompt.sections[1].id = 'SYSTEM';
  const result = compilePrompt({ ...input, structuredPrompt: deepFreeze(changed) });
  assert.equal(result.compiledPrompt, null);
  assert.equal(result.error.code, 'INVALID_COMPILER_INPUT');
});

test('routing mismatch produces controlled input error', () => {
  const input = compilerInput();
  const changed = structuredClone(input.routingResult);
  changed.routingResult.selectedProvider = 'CLAUDE';
  const result = compilePrompt({ ...input, routingResult: deepFreeze(changed) });
  assert.equal(result.error.code, 'INVALID_COMPILER_INPUT');
});

test('validator rejects mutable compiled output', () => {
  const input = compilerInput();
  const mutable = structuredClone(compilePrompt(input));
  const validation = validateCompiledPrompt(mutable, input);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.includes('COMPILED_PROMPT_NOT_IMMUTABLE'));
});

test('metadata forbids adapter model HTTP and token consumption', () => {
  const metadata = compilePrompt(compilerInput()).metadata;
  assert.equal(metadata.adapterInvoked, false);
  assert.equal(metadata.modelInvoked, false);
  assert.equal(metadata.externalCallsMade, false);
  assert.equal(metadata.httpRequestsMade, false);
  assert.equal(metadata.tokensConsumed, 0);
});

test('feature flag remains disabled and compiler stays inactive by default', async () => {
  let observed = false;
  assert.equal(UNI_OS_ENABLED, false);
  const result = await runPromptCompilerShadow(compilerInput(), {
    observer: () => { observed = true; },
  });
  assert.deepEqual(result, { status: 'DISABLED', compiledPrompt: null });
  assert.equal(observed, false);
});

test('shadow mode observes and discards compiled prompt', async () => {
  let observed;
  const result = await runPromptCompilerShadow(compilerInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.ok(observed.compiledPrompt);
  assert.deepEqual(result, { status: 'OBSERVED', compiledPrompt: null });
});

test('shadow mode observes rejection and keeps compilation blocked', async () => {
  let observed;
  const result = await runPromptCompilerShadow(compilerInput('INVALID'), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
  });
  assert.equal(observed.error.code, 'PROMPT_NOT_APPROVED');
  assert.deepEqual(result, { status: 'BLOCKED', compiledPrompt: null });
});

test('observer failure is contained safely', async () => {
  const result = await runPromptCompilerShadow(compilerInput(), {
    enabled: true,
    observer: () => { throw new Error('private detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', compiledPrompt: null });
});

test('DEV log exposes technical compilation metadata only', async () => {
  const entries = [];
  await runPromptCompilerShadow(compilerInput(), {
    enabled: true,
    isDevelopment: true,
    logger: { info: (message, data) => entries.push({ message, data }) },
  });
  assert.equal(entries[0].message, '[UNI OS] Prompt Compiled');
  assert.deepEqual(Object.keys(entries[0].data), [
    'policy', 'sections', 'estimatedTokens', 'estimatedCost', 'promptLength',
  ]);
  assert.equal(JSON.stringify(entries).includes('structured compiler request'), false);
});

test('compiler source has no adapter model SDK HTTP or external API call', async () => {
  const source = await readFile(new URL('./promptCompiler.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|openai|anthropic/i);
  assert.doesNotMatch(source, /\.invoke\s*\(|buildRequest|https?:\/\//i);
});
