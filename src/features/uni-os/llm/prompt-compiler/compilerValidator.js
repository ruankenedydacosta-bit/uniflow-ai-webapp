import { PROMPT_SECTION_IDS } from '../prompt-builder/promptPolicy.js';
import { assembleCompiledText, formatCompilerSection } from './compilerFormatter.js';
import { COMPILER_POLICY_IDS, resolveCompilerPolicy } from './compilerPolicies.js';
import { PROMPT_COMPILER_VERSION } from './compilerSchema.js';

function isRecord(value) {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object');
}

function isDeepFrozen(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every(
    (nested) => isDeepFrozen(nested, seen),
  );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateCompilerInput(input = {}) {
  const errors = [];
  const promptSnapshot = input.structuredPrompt;
  const reportSnapshot = input.validationReport;
  const routingSnapshot = input.routingResult;
  const prompt = promptSnapshot?.structuredPrompt;
  const report = reportSnapshot?.validationReport;
  const routing = routingSnapshot?.routingResult;

  if (!isRecord(prompt)) errors.push('STRUCTURED_PROMPT_REQUIRED');
  if (!isRecord(report) || report.approved !== true) errors.push('APPROVED_REPORT_REQUIRED');
  if (!isRecord(routing)) errors.push('ROUTING_RESULT_REQUIRED');

  const sections = Array.isArray(prompt?.sections) ? prompt.sections : [];
  const ids = sections.map((section) => section?.id);
  if (sections.length !== PROMPT_SECTION_IDS.length) errors.push('INVALID_SECTION_COUNT');
  if (new Set(ids).size !== ids.length) errors.push('DUPLICATE_SECTION');
  if (!PROMPT_SECTION_IDS.every((id, index) => ids[index] === id)) {
    errors.push('INVALID_SECTION_ORDER');
  }
  if (prompt?.routing?.resolvedCapability !== routing?.resolvedCapability
    || prompt?.routing?.selectedProvider !== routing?.selectedProvider
    || prompt?.routing?.routingPolicy !== routing?.routingPolicy) {
    errors.push('ROUTING_MISMATCH');
  }
  if (!isDeepFrozen(promptSnapshot)) errors.push('STRUCTURED_PROMPT_NOT_IMMUTABLE');
  if (!isDeepFrozen(reportSnapshot)) errors.push('VALIDATION_REPORT_NOT_IMMUTABLE');
  if (!isDeepFrozen(routingSnapshot)) errors.push('ROUTING_RESULT_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validateCompiledPrompt(snapshot, input = {}) {
  const errors = [];
  const compiled = snapshot?.compiledPrompt;
  const source = input.structuredPrompt?.structuredPrompt;
  if (!isRecord(compiled)) {
    return Object.freeze({ valid: false, errors: Object.freeze(['COMPILED_PROMPT_REQUIRED']) });
  }
  const sections = Array.isArray(compiled.sections) ? compiled.sections : [];
  const ids = sections.map((section) => section?.id);
  if (sections.length !== PROMPT_SECTION_IDS.length) errors.push('INVALID_COMPILED_SECTION_COUNT');
  if (new Set(ids).size !== ids.length) errors.push('DUPLICATE_COMPILED_SECTION');
  if (!PROMPT_SECTION_IDS.every((id, index) => ids[index] === id)) {
    errors.push('INVALID_COMPILED_SECTION_ORDER');
  }
  if (!COMPILER_POLICY_IDS.includes(compiled.policy)) errors.push('INVALID_COMPILER_POLICY');
  if (compiled.text !== assembleCompiledText(sections)) errors.push('COMPILED_TEXT_MISMATCH');
  if (compiled.statistics?.sectionsCount !== sections.length
    || compiled.statistics?.promptLength !== compiled.text?.length
    || compiled.estimatedTokens !== source?.estimatedTokens
    || compiled.estimatedCost !== source?.estimatedCost) {
    errors.push('COMPILED_STATISTICS_MISMATCH');
  }

  const policy = resolveCompilerPolicy(compiled.policy);
  sections.forEach((section, index) => {
    const sourceSection = source?.sections?.[index];
    const expected = formatCompilerSection(sourceSection, policy);
    if (section.id !== sourceSection?.id
      || !sameValue(section.content, sourceSection?.content)
      || section.formattedText !== expected.formattedText) {
      errors.push(`SECTION_CONTENT_MISMATCH:${section.id ?? index}`);
    }
  });
  if (snapshot.version !== PROMPT_COMPILER_VERSION
    || compiled.metadata?.version !== PROMPT_COMPILER_VERSION
    || compiled.metadata?.sourceApproved !== true
    || compiled.metadata?.contentPreserved !== true
    || compiled.metadata?.providerAgnostic !== true) {
    errors.push('COMPILED_PROMPT_SCHEMA_INVALID');
  }
  if (snapshot.metadata?.structuredPromptModified !== false
    || snapshot.metadata?.validationReportModified !== false
    || snapshot.metadata?.routingResultModified !== false
    || snapshot.metadata?.adapterInvoked !== false
    || snapshot.metadata?.modelInvoked !== false
    || snapshot.metadata?.externalCallsMade !== false
    || snapshot.metadata?.httpRequestsMade !== false
    || snapshot.metadata?.tokensConsumed !== 0
    || snapshot.metadata?.executionAllowed !== false) {
    errors.push('COMPILER_INVARIANTS_INVALID');
  }
  if (!isDeepFrozen(snapshot)) errors.push('COMPILED_PROMPT_NOT_IMMUTABLE');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validatePromptCompilationError(snapshot) {
  const valid = snapshot?.compiledPrompt === null
    && typeof snapshot?.error?.code === 'string'
    && snapshot.error.blocking === true
    && snapshot.metadata?.compiled === false
    && snapshot.metadata?.adapterInvoked === false
    && snapshot.metadata?.modelInvoked === false
    && snapshot.metadata?.externalCallsMade === false
    && snapshot.metadata?.tokensConsumed === 0
    && isDeepFrozen(snapshot);
  return Object.freeze({
    valid,
    errors: Object.freeze(valid ? [] : ['INVALID_COMPILATION_ERROR_SCHEMA']),
  });
}

export { isDeepFrozen };
