import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { detectInsightSignals } from './insightDetector.js';
import { createNoInsight, createStructuredInsight } from './insightPolicy.js';
import { prioritizeInsights } from './insightPrioritizer.js';
import { createInsightSnapshot } from './insightSchema.js';

export function processInsights(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const signals = detectInsightSignals(source, { now: options.now });
  const detected = signals.map((signal) => createStructuredInsight(signal, source.parsedIntent));
  const insights = prioritizeInsights(detected.length > 0 ? detected : [createNoInsight()]);

  return createInsightSnapshot({
    insights,
    primaryInsight: insights[0] ?? null,
  });
}

export function logInsightSummary(logger, snapshot) {
  logger.info?.('[UNI OS] Insights', {
    types: snapshot.insights.map((insight) => insight.type),
    primaryType: snapshot.primaryInsight?.type ?? null,
    executionAllowed: snapshot.metadata.executionAllowed,
  });
}

export async function runInsightEngineShadow(input = {}, options = {}) {
  const enabled = options.enabled ?? UNI_OS_ENABLED;
  if (!enabled) return Object.freeze({ status: 'DISABLED', insights: null });

  try {
    const snapshot = processInsights(input, options.engineOptions);
    if (typeof options.observer === 'function') await options.observer(snapshot);
    if (options.isDevelopment === true) logInsightSummary(options.logger ?? console, snapshot);
    return Object.freeze({ status: 'OBSERVED', insights: null });
  } catch {
    if (options.isDevelopment === true) {
      (options.logger ?? console).warn?.('[UNI OS] Insight Engine failed safely.');
    }
    return Object.freeze({ status: 'FAILED_SAFE', insights: null });
  }
}

export const insightEngine = Object.freeze({ process: processInsights });
