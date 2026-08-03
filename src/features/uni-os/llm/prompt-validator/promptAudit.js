import { capabilityRegistry, hasCapability } from '../capability-registry/index.js';
import { findProvider, providerRegistry } from '../provider-registry/index.js';
import {
  PROMPT_PRIORITIES,
  PROMPT_SECTION_IDS,
} from '../prompt-builder/promptPolicy.js';
import { STRUCTURED_PROMPT_VERSION } from '../prompt-builder/promptSchema.js';
import { createPromptIssue } from './promptRules.js';

export const PROMPT_AUDIT_CHECK_COUNT = 12;

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

function add(issues, code, details) {
  issues.push(createPromptIssue(code, details));
}

function auditSections(prompt, issues) {
  const sections = Array.isArray(prompt?.sections) ? prompt.sections : [];
  const ids = sections.map((section) => section?.id);
  PROMPT_SECTION_IDS.forEach((id) => {
    if (!ids.includes(id)) add(issues, 'MISSING_SECTION', { section: id });
  });
  if (new Set(ids).size !== ids.length) add(issues, 'DUPLICATE_SECTION');
  if (!PROMPT_SECTION_IDS.every((id, index) => ids[index] === id)) {
    add(issues, 'SECTION_ORDER_INVALID');
  }

  sections.forEach((section, index) => {
    if (!isRecord(section)
      || typeof section.title !== 'string'
      || section.title.trim() === ''
      || !Object.hasOwn(section, 'content')
      || !isRecord(section.metadata)
      || section.metadata.order !== index + 1
      || section.metadata.mandatory !== true) {
      add(issues, 'SECTION_SCHEMA_INVALID', { section: section?.id ?? null });
    }
    if (!PROMPT_PRIORITIES.includes(section?.priority)) {
      add(issues, 'PRIORITY_INVALID', {
        section: section?.id ?? null,
        actual: section?.priority ?? null,
      });
    }
    if (!Number.isInteger(section?.estimatedTokens) || section.estimatedTokens < 0) {
      add(issues, 'ESTIMATE_INVALID', {
        section: section?.id ?? null,
        actual: section?.estimatedTokens ?? null,
      });
    }
  });

  const estimatedTokens = sections.reduce(
    (total, section) => total + (Number.isInteger(section?.estimatedTokens)
      ? section.estimatedTokens
      : 0),
    0,
  );
  if (prompt?.estimatedTokens !== estimatedTokens) {
    add(issues, 'ESTIMATED_TOTAL_MISMATCH', {
      expected: estimatedTokens,
      actual: prompt?.estimatedTokens ?? null,
    });
  }
  return sections;
}

function auditPromptSchema(snapshot, issues) {
  if (!isRecord(snapshot) || !isRecord(snapshot.structuredPrompt)) {
    add(issues, 'PROMPT_REQUIRED');
    return [];
  }
  const prompt = snapshot.structuredPrompt;
  if (snapshot.version !== STRUCTURED_PROMPT_VERSION
    || prompt.metadata?.version !== STRUCTURED_PROMPT_VERSION
    || !isRecord(prompt.routing)
    || !isRecord(prompt.statistics)
    || prompt.statistics.sectionsCount !== prompt.sections?.length) {
    add(issues, 'PROMPT_SCHEMA_INVALID');
  }
  if (!isDeepFrozen(snapshot)) add(issues, 'PROMPT_NOT_IMMUTABLE');
  return auditSections(prompt, issues);
}

function auditBudget(promptSnapshot, budgetSnapshot, issues) {
  const prompt = promptSnapshot?.structuredPrompt;
  const budget = budgetSnapshot?.tokenBudget;
  if (!isRecord(budgetSnapshot) || !isRecord(budget)) {
    add(issues, 'BUDGET_REQUIRED');
    return;
  }
  if (!isDeepFrozen(budgetSnapshot)) add(issues, 'TOKEN_BUDGET_NOT_IMMUTABLE');
  const sectionTotal = Object.values(budget.sections ?? {}).reduce(
    (total, value) => total + (Number.isInteger(value) ? value : 0),
    0,
  );
  if (sectionTotal !== budget.allocatedBudget
    || budget.totalBudget < budget.allocatedBudget
    || budget.remainingBudget !== budget.totalBudget - budget.allocatedBudget
    || prompt?.statistics?.allocatedBudget !== budget.allocatedBudget) {
    add(issues, 'BUDGET_INCONSISTENT');
  }

  (prompt?.sections ?? []).forEach((section) => {
    const budgetSection = section.metadata?.budgetSection;
    const expected = budgetSection ? budget.sections?.[budgetSection] : section.estimatedTokens;
    if (!Number.isInteger(expected) || section.metadata?.allocatedBudget !== expected) {
      add(issues, 'BUDGET_INCONSISTENT', { section: section.id });
    }
    if (Number.isInteger(expected) && section.estimatedTokens > expected) {
      add(issues, 'SECTION_BUDGET_EXCEEDED', {
        section: section.id,
        expected,
        actual: section.estimatedTokens,
      });
    }
  });
}

function auditRouting(promptSnapshot, routingSnapshot, issues) {
  const promptRouting = promptSnapshot?.structuredPrompt?.routing;
  const routing = routingSnapshot?.routingResult;
  if (!isRecord(routingSnapshot) || !isRecord(routing)) {
    add(issues, 'ROUTING_REQUIRED');
    return;
  }
  if (!isDeepFrozen(routingSnapshot)) add(issues, 'ROUTING_NOT_IMMUTABLE');
  const capability = routing.resolvedCapability;
  if (typeof capability !== 'string' || capability === '') {
    add(issues, 'CAPABILITY_REQUIRED');
  } else if (!hasCapability(capabilityRegistry, capability)) {
    add(issues, 'CAPABILITY_NOT_REGISTERED', { actual: capability });
  }
  if (promptRouting?.requestedCapability !== routing.requestedCapability
    || promptRouting?.resolvedCapability !== routing.resolvedCapability) {
    add(issues, 'CAPABILITY_MISMATCH');
  }
  if (promptRouting?.routingPolicy !== routing.routingPolicy
    || promptRouting?.decisionReason !== routing.decisionReason) {
    add(issues, 'ROUTING_MISMATCH');
  }

  const providerId = routing.selectedProvider;
  if (typeof providerId !== 'string' || providerId === '') {
    add(issues, 'PROVIDER_REQUIRED');
  } else {
    const provider = findProvider(providerRegistry, providerId);
    if (!provider) {
      add(issues, 'PROVIDER_NOT_REGISTERED', { actual: providerId });
    } else if (!provider.supportedCapabilities.includes(capability)) {
      add(issues, 'PROVIDER_CAPABILITY_MISMATCH', { actual: providerId });
    }
  }
  if (promptRouting?.selectedProvider !== providerId) add(issues, 'ROUTING_MISMATCH');
  if (routing.estimatedCost == null || promptSnapshot?.structuredPrompt?.estimatedCost == null) {
    add(issues, 'ESTIMATED_COST_UNAVAILABLE');
  }
}

function auditMetadata(promptSnapshot, routingSnapshot, issues) {
  const prompt = promptSnapshot?.structuredPrompt;
  if (prompt?.metadata?.structuredOnly !== true
    || prompt?.metadata?.responseGenerated !== false
    || prompt?.metadata?.adapterInvoked !== false
    || prompt?.routing?.representationalOnly !== true
    || promptSnapshot?.metadata?.representationalOnly !== true
    || promptSnapshot?.metadata?.modelInvoked !== false
    || promptSnapshot?.metadata?.adapterInvoked !== false
    || promptSnapshot?.metadata?.externalCallsMade !== false
    || promptSnapshot?.metadata?.tokensConsumed !== 0
    || promptSnapshot?.metadata?.executionAllowed !== false
    || routingSnapshot?.metadata?.representationalOnly !== true
    || routingSnapshot?.metadata?.providerExecuted !== false
    || routingSnapshot?.metadata?.modelExecuted !== false
    || routingSnapshot?.metadata?.externalCallsMade !== false) {
    add(issues, 'METADATA_INVALID');
  }
}

export function auditStructuredPrompt(input = {}) {
  const source = isRecord(input) ? input : {};
  const issues = [];
  const sections = auditPromptSchema(source.structuredPrompt, issues);
  auditBudget(source.structuredPrompt, source.tokenBudget, issues);
  auditRouting(source.structuredPrompt, source.routingResult, issues);
  auditMetadata(source.structuredPrompt, source.routingResult, issues);
  return Object.freeze({
    issues: Object.freeze(issues),
    checksRun: PROMPT_AUDIT_CHECK_COUNT,
    sectionsAudited: sections.length,
  });
}

export { isDeepFrozen };
