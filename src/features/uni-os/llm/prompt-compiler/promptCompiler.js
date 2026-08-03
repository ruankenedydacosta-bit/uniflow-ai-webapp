import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { assembleCompiledText, formatCompilerSection } from './compilerFormatter.js';
import { resolveCompilerPolicy } from './compilerPolicies.js';
import {
  createCompiledPromptSchema,
  createPromptCompilationError,
} from './compilerSchema.js';
import { validateCompiledPrompt, validateCompilerInput } from './compilerValidator.js';

export function compilePrompt(input = {}, options = {}) {
  const policy = resolveCompilerPolicy(options.policy);
  if (input?.validationReport?.validationReport?.approved !== true) {
    return createPromptCompilationError('PROMPT_NOT_APPROVED', policy.id);
  }
  const inputValidation = validateCompilerInput(input);
  if (!inputValidation.valid) {
    return createPromptCompilationError('INVALID_COMPILER_INPUT', policy.id);
  }

  const prompt = input.structuredPrompt.structuredPrompt;
  const sections = prompt.sections.map((section) => formatCompilerSection(section, policy));
  const snapshot = createCompiledPromptSchema({
    text: assembleCompiledText(sections),
    sections,
    estimatedTokens: prompt.estimatedTokens,
    estimatedCost: prompt.estimatedCost,
    policy: policy.id,
    routing: input.routingResult.routingResult,
  });
  const validation = validateCompiledPrompt(snapshot, input);
  return validation.valid
    ? snapshot
    : createPromptCompilationError('COMPILED_PROMPT_INVALID', policy.id);
}

export function logCompiledPromptSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Prompt Compiled', {
    policy: snapshot.compiledPrompt.policy,
    sections: snapshot.compiledPrompt.statistics.sectionsCount,
    estimatedTokens: snapshot.compiledPrompt.estimatedTokens,
    estimatedCost: snapshot.compiledPrompt.estimatedCost,
    promptLength: snapshot.compiledPrompt.statistics.promptLength,
  });
}

export async function runPromptCompilerShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', compiledPrompt: null });

  try {
    const snapshot = compilePrompt(input, options);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (snapshot.compiledPrompt && options.isDevelopment === true) {
      logCompiledPromptSummary(options.logger ?? console, snapshot);
    }
    return Object.freeze({
      status: snapshot.compiledPrompt ? 'OBSERVED' : 'BLOCKED',
      compiledPrompt: null,
    });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Prompt Compiler failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', compiledPrompt: null });
  }
}

export const promptCompiler = Object.freeze({ compile: compilePrompt });
