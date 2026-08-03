import { createCognitiveExecutionPlan, validateCognitiveExecutionPlan } from '../cognitive-execution-plan/index.js';
import { createConfidencePlan, validateConfidencePlan } from '../confidence-engine/index.js';
import { createDecisionPlan, validateDecisionPlan } from '../decision-engine/index.js';
import { planReasoning, validateReasoningPlan } from '../reasoning-planner/index.js';
import { buildStructuredPrompt, validateStructuredPrompt } from '../../llm/prompt-builder/index.js';
import { compilePrompt, validateCompiledPrompt } from '../../llm/prompt-compiler/index.js';
import { createStepTrace } from './orchestratorPolicies.js';

export const DEFAULT_ORCHESTRATOR_MODULES = Object.freeze({
  reasoning: Object.freeze({ execute: planReasoning, validate: validateReasoningPlan }),
  decision: Object.freeze({ execute: createDecisionPlan, validate: validateDecisionPlan }),
  confidence: Object.freeze({ execute: createConfidencePlan, validate: validateConfidencePlan }),
  cep: Object.freeze({
    execute: createCognitiveExecutionPlan,
    validate: validateCognitiveExecutionPlan,
  }),
  promptBuilder: Object.freeze({ execute: buildStructuredPrompt, validate: validateStructuredPrompt }),
  promptCompiler: Object.freeze({ execute: compilePrompt, validate: validateCompiledPrompt }),
});

export class OrchestratorPipelineError extends Error {
  constructor(code, step, details = []) {
    super(`${code}:${step}`);
    this.name = 'OrchestratorPipelineError';
    this.code = code;
    this.step = step;
    this.details = Object.freeze(Array.isArray(details) ? [...details] : []);
  }
}

function moduleFor(modules, key, step) {
  const module = modules[key];
  if (typeof module?.execute !== 'function' || typeof module?.validate !== 'function') {
    throw new OrchestratorPipelineError('MODULE_UNAVAILABLE', step, [key]);
  }
  return module;
}

function preservePipelineState(error, trace, snapshots) {
  error.trace = [...trace];
  error.snapshots = { ...snapshots };
  return error;
}

function runStep({ modules, key, step, input, options, trace, snapshots, outputKey }) {
  let module;
  try {
    module = moduleFor(modules, key, step);
  } catch (error) {
    throw preservePipelineState(error, trace, snapshots);
  }
  let snapshot;
  try {
    snapshot = module.execute(input, options);
  } catch {
    throw preservePipelineState(
      new OrchestratorPipelineError('MODULE_FAILURE', step), trace, snapshots,
    );
  }
  const validation = module.validate(snapshot, input);
  if (!validation?.valid) {
    const errors = Array.isArray(validation?.errors) ? validation.errors : ['UNKNOWN_VALIDATION'];
    trace.push(createStepTrace(step, 'FAILED', errors));
    throw preservePipelineState(
      new OrchestratorPipelineError('SNAPSHOT_INVALID', step, errors), trace, snapshots,
    );
  }
  trace.push(createStepTrace(step, 'COMPLETED'));
  snapshots[outputKey] = snapshot;
  return snapshot;
}

function normalizeModules(overrides = {}) {
  return Object.freeze({ ...DEFAULT_ORCHESTRATOR_MODULES, ...overrides });
}

export function executeOrchestratorPipeline(input = {}, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OrchestratorPipelineError('INVALID_INPUT', null);
  }
  const modules = normalizeModules(options.modules);
  const trace = [];
  const compiledContext = input.compiledContext && typeof input.compiledContext === 'object'
    ? { compiledContext: input.compiledContext }
    : { compiledContext: input };
  const snapshots = { compiledContext };
  const commonOptions = { now: options.now };

  const reasoningPlan = runStep({
    modules, key: 'reasoning', step: 'REASONING_PLANNER',
    input: compiledContext, options: commonOptions, trace, snapshots, outputKey: 'reasoningPlan',
  });
  const decisionPlan = runStep({
    modules, key: 'decision', step: 'DECISION_ENGINE',
    input: { reasoningPlan, compiledContext }, options: commonOptions, trace,
    snapshots, outputKey: 'decisionPlan',
  });
  const confidencePlan = runStep({
    modules, key: 'confidence', step: 'CONFIDENCE_ENGINE',
    input: { decisionPlan }, options: commonOptions, trace,
    snapshots, outputKey: 'confidencePlan',
  });
  const cognitiveExecutionPlan = runStep({
    modules, key: 'cep', step: 'COGNITIVE_EXECUTION_PLAN',
    input: { reasoningPlan, decisionPlan, confidencePlan }, options: commonOptions, trace,
    snapshots, outputKey: 'cognitiveExecutionPlan',
  });
  const promptInput = {
    compiledContext,
    cognitiveExecutionPlan,
    conversationWindow: input.conversationWindow,
    tokenBudget: input.tokenBudget,
    routingResult: input.routingResult,
  };
  const structuredPrompt = runStep({
    modules, key: 'promptBuilder', step: 'PROMPT_BUILDER',
    input: promptInput, options: {}, trace, snapshots, outputKey: 'structuredPrompt',
  });
  const compilerInput = {
    structuredPrompt,
    validationReport: input.validationReport,
    routingResult: input.routingResult,
  };
  let promptCompiler;
  try {
    promptCompiler = moduleFor(modules, 'promptCompiler', 'PROMPT_COMPILER');
  } catch (error) {
    throw preservePipelineState(error, trace, snapshots);
  }
  let compiledPrompt;
  try {
    compiledPrompt = promptCompiler.execute(compilerInput, options.compilerOptions);
  } catch {
    throw preservePipelineState(
      new OrchestratorPipelineError('MODULE_FAILURE', 'PROMPT_COMPILER'), trace, snapshots,
    );
  }
  if (!compiledPrompt?.compiledPrompt) {
    trace.push(createStepTrace('PROMPT_COMPILER', 'FAILED', [
      compiledPrompt?.error?.code ?? 'PROMPT_COMPILATION_BLOCKED',
    ]));
    throw preservePipelineState(
      new OrchestratorPipelineError(
        'PROMPT_COMPILATION_BLOCKED',
        'PROMPT_COMPILER',
        [compiledPrompt?.error?.code ?? 'PROMPT_COMPILATION_BLOCKED'],
      ),
      trace,
      snapshots,
    );
  }
  const compilerValidation = promptCompiler.validate(compiledPrompt, compilerInput);
  if (!compilerValidation?.valid) {
    const errors = compilerValidation?.errors ?? ['UNKNOWN_VALIDATION'];
    trace.push(createStepTrace('PROMPT_COMPILER', 'FAILED', errors));
    throw preservePipelineState(
      new OrchestratorPipelineError('SNAPSHOT_INVALID', 'PROMPT_COMPILER', errors),
      trace,
      snapshots,
    );
  }
  trace.push(createStepTrace('PROMPT_COMPILER', 'COMPLETED'));
  snapshots.compiledPrompt = compiledPrompt;

  return {
    snapshots,
    trace,
  };
}
