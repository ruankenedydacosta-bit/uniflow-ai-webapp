import { uniOS } from '../../orchestrator/index.js';
import { adaptContextSources, logContextSummary } from '../context/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptMemorySources,
  createMemoryReadProvider,
  logMemorySummary,
} from '../memory/index.js';
import { createParsedIntent } from './parserIntentSchema.js';
import {
  normalizeParserAmountList,
  normalizeParserDateList,
  normalizeParserEntityList,
} from './parserNormalizer.js';

export { UNI_OS_ENABLED };

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `uni-os-${Date.now().toString(36)}`;
}

function readEntityValues(entities, singular, plural) {
  if (Array.isArray(entities?.[plural])) return entities[plural];
  return entities?.[singular] ?? null;
}

function readDisplayValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return value.display ?? value.name ?? value.label ?? value.normalized ?? null;
}

function normalizeNamedEntities(value, type) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return normalizeParserEntityList(values.map(readDisplayValue).filter(Boolean), type);
}

export function adaptParserResult(parserOutput, options = {}) {
  const output = parserOutput && typeof parserOutput === 'object' ? parserOutput : {};
  const entities = output.entities && typeof output.entities === 'object' ? output.entities : {};
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const idFactory = typeof options.idFactory === 'function' ? options.idFactory : defaultIdFactory;
  const referenceDate = options.referenceDate ?? null;

  return createParsedIntent({
    id: idFactory(),
    timestamp: now(),
    source: options.source,
    language: options.language,
    intent: output.intent,
    confidence: output.confidence,
    entities: {
      accounts: normalizeNamedEntities(readEntityValues(entities, 'account', 'accounts'), 'account'),
      categories: normalizeNamedEntities(readEntityValues(entities, 'category', 'categories'), 'category'),
      merchants: normalizeNamedEntities(readEntityValues(entities, 'merchant', 'merchants'), 'merchant'),
      values: normalizeParserAmountList(readEntityValues(entities, 'amount', 'values')),
      dates: normalizeParserDateList(readEntityValues(entities, 'date', 'dates'), referenceDate),
      workspaces: normalizeNamedEntities(readEntityValues(entities, 'workspace', 'workspaces'), 'workspace'),
    },
    requiresConfirmation: output.requiresConfirmation,
    metadata: {
      parserVersion: output.version ?? null,
      ready: output.ready,
      missingEntities: output.missingEntities,
      errorCodes: output.errors,
    },
  });
}

function summarizeParsedIntent(parsedIntent) {
  return {
    intent: parsedIntent.intent,
    source: parsedIntent.source,
    confidence: parsedIntent.confidence,
    requiresConfirmation: parsedIntent.requiresConfirmation,
    entityCounts: Object.fromEntries(
      Object.entries(parsedIntent.entities).map(([name, values]) => [name, values.length]),
    ),
  };
}

function logShadowResult(logger, parsedIntent, result) {
  logger.info?.('[UNI OS] Parsed Intent', summarizeParsedIntent(parsedIntent));
  logger.info?.('[UNI OS] Attention', { type: result?.facts?.attention?.type ?? null });
  logger.info?.('[UNI OS] Planning', {
    stepCount: result?.plan?.steps?.length ?? 0,
    requiresConfirmation: result?.plan?.requiresConfirmation === true,
  });
  logger.info?.('[UNI OS] Reflection', {
    conflictCount: result?.facts?.reflection?.conflicts?.length ?? 0,
    ambiguityCount: result?.facts?.reflection?.ambiguities?.length ?? 0,
    riskCount: result?.facts?.reflection?.risks?.length ?? 0,
    confirmationPending: result?.facts?.reflection?.confirmationPending === true,
  });
}

export async function runParserAdapterShadow(parserOutput, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', parsedIntent: null, result: null });

  try {
    const parsedIntent = adaptParserResult(parserOutput, options.adapterOptions);
    const context = options.contextSources
      ? adaptContextSources({
          ...options.contextSources,
          featureFlags: {
            ...options.contextSources.featureFlags,
            uniOS: true,
          },
        }, options.contextAdapterOptions)
      : undefined;
    const memory = options.memorySources
      ? adaptMemorySources(options.memorySources, options.memoryAdapterOptions)
      : undefined;
    const processor = options.processor ?? ((input) => uniOS.process(input));
    const result = await processor({
      parsedIntent,
      context,
      memoryProviders: memory ? [createMemoryReadProvider(memory)] : [],
    });
    if (options.isDevelopment === true) {
      if (context) logContextSummary(options.logger ?? console, context);
      if (memory) logMemorySummary(options.logger ?? console, memory);
      logShadowResult(options.logger ?? console, parsedIntent, result);
    }
    return Object.freeze({ status: 'OBSERVED', parsedIntent, result: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Shadow validation failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', parsedIntent: null, result: null });
  }
}
