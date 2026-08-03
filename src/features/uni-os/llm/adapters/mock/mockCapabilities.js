import { ADAPTER_CAPABILITIES } from '../../adapter-interface/adapterCapabilities.js';

export const MOCK_LLM_CAPABILITIES = Object.freeze([
  'GENERAL_REASONING',
  'FINANCIAL_REASONING',
  'CLASSIFICATION',
  'SUMMARIZATION',
  'EXPLANATION',
  'RECOMMENDATION',
  'FORECAST',
  'GOAL_ANALYSIS',
  'INSIGHT_ANALYSIS',
  'DOCUMENT_ANALYSIS',
  'VISION',
  'OCR',
  'VOICE',
  'CALCULATION',
  'BRAINSTORMING',
  'CONVERSATION',
]);

export function normalizeMockCapability(capability) {
  if (typeof capability !== 'string') return null;
  const normalized = capability.trim().toUpperCase();
  return ADAPTER_CAPABILITIES.includes(normalized) ? normalized : null;
}

export function supportsMockCapability(capability) {
  const normalized = normalizeMockCapability(capability);
  return normalized !== null && MOCK_LLM_CAPABILITIES.includes(normalized);
}
