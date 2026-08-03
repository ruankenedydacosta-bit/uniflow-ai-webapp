function provider(id, name, priority, fallbackPriority, options = {}) {
  return {
    id,
    name,
    status: options.status ?? 'EXPERIMENTAL',
    priority,
    type: options.type ?? 'HOSTED',
    supportedCapabilities: options.supportedCapabilities ?? [],
    estimatedLatency: options.estimatedLatency ?? 'MEDIUM',
    estimatedCost: options.estimatedCost ?? 'MEDIUM',
    supportsStreaming: options.supportsStreaming === true,
    supportsVision: options.supportsVision === true,
    supportsVoice: options.supportsVoice === true,
    supportsStructuredOutput: options.supportsStructuredOutput === true,
    supportsFunctionCalling: options.supportsFunctionCalling === true,
    healthStatus: 'UNKNOWN',
    fallbackPriority,
    metadata: {
      mock: true,
      operational: false,
      configurationRequired: true,
      version: '1.0',
    },
  };
}

const GENERAL = ['GENERAL_REASONING', 'CLASSIFICATION', 'SUMMARIZATION', 'EXPLANATION', 'CONVERSATION'];
const ADVANCED = [
  ...GENERAL,
  'FINANCIAL_REASONING',
  'LONG_TERM_PLANNING',
  'GOAL_ANALYSIS',
  'INSIGHT_ANALYSIS',
  'RECOMMENDATION',
  'FORECAST',
  'CALCULATION',
];
const MULTIMODAL = ['DOCUMENT_ANALYSIS', 'VISION', 'OCR', 'VOICE'];

export const PROVIDER_CATALOG = Object.freeze([
  provider('OPENAI', 'OpenAI', 1, 1, {
    supportedCapabilities: [...ADVANCED, ...MULTIMODAL, 'BRAINSTORMING'],
    estimatedCost: 'HIGH', supportsStreaming: true, supportsVision: true,
    supportsVoice: true, supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('CLAUDE', 'Claude', 2, 2, {
    supportedCapabilities: [...ADVANCED, 'DOCUMENT_ANALYSIS', 'VISION', 'BRAINSTORMING'],
    estimatedCost: 'HIGH', supportsStreaming: true, supportsVision: true,
    supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('GEMINI', 'Gemini', 3, 3, {
    supportedCapabilities: [...ADVANCED, ...MULTIMODAL, 'BRAINSTORMING'],
    estimatedCost: 'MEDIUM', supportsStreaming: true, supportsVision: true,
    supportsVoice: true, supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('MISTRAL', 'Mistral', 4, 4, {
    supportedCapabilities: [...GENERAL, 'FINANCIAL_REASONING', 'CALCULATION', 'OCR'],
    estimatedCost: 'LOW', supportsStreaming: true, supportsVision: true,
    supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('LLAMA_LOCAL', 'Llama Local', 5, 5, {
    status: 'DISABLED', type: 'LOCAL', supportedCapabilities: [...GENERAL, 'BRAINSTORMING'],
    estimatedLatency: 'HIGH', estimatedCost: 'LOW', supportsStreaming: true,
    supportsStructuredOutput: true,
  }),
  provider('DEEPSEEK', 'DeepSeek', 6, 6, {
    supportedCapabilities: [...ADVANCED, 'BRAINSTORMING'],
    estimatedCost: 'LOW', estimatedLatency: 'HIGH', supportsStreaming: true,
    supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('QWEN', 'Qwen', 7, 7, {
    supportedCapabilities: [...ADVANCED, 'DOCUMENT_ANALYSIS', 'VISION', 'OCR'],
    estimatedCost: 'LOW', supportsStreaming: true, supportsVision: true,
    supportsStructuredOutput: true, supportsFunctionCalling: true,
  }),
  provider('CUSTOM', 'Custom Provider', 8, 8, {
    status: 'DISABLED', type: 'CUSTOM', supportedCapabilities: [],
    estimatedLatency: 'HIGH', estimatedCost: 'HIGH',
  }),
]);

