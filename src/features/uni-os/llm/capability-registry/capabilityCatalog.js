function capability(id, name, description, options = {}) {
  return {
    id,
    name,
    description,
    complexity: options.complexity ?? 'MEDIUM',
    estimatedCost: options.estimatedCost ?? 'MEDIUM',
    estimatedLatency: options.estimatedLatency ?? 'MEDIUM',
    supportsStreaming: options.supportsStreaming === true,
    supportsVision: options.supportsVision === true,
    supportsVoice: options.supportsVoice === true,
    requiresStructuredContext: options.requiresStructuredContext === true,
    metadata: {
      category: options.category ?? 'reasoning',
      status: 'AVAILABLE',
      version: '1.0',
    },
  };
}

export const CAPABILITY_CATALOG = Object.freeze([
  capability('GENERAL_REASONING', 'General reasoning', 'Raciocínio geral sobre informações estruturadas.', {
    complexity: 'HIGH', estimatedCost: 'MEDIUM', estimatedLatency: 'MEDIUM', supportsStreaming: true,
  }),
  capability('FINANCIAL_REASONING', 'Financial reasoning', 'Raciocínio financeiro com contexto estruturado.', {
    complexity: 'VERY_HIGH', estimatedCost: 'HIGH', estimatedLatency: 'HIGH', supportsStreaming: true,
    requiresStructuredContext: true, category: 'financial',
  }),
  capability('LONG_TERM_PLANNING', 'Long-term planning', 'Planejamento estruturado de longo prazo.', {
    complexity: 'VERY_HIGH', estimatedCost: 'HIGH', estimatedLatency: 'HIGH',
    requiresStructuredContext: true, category: 'planning',
  }),
  capability('GOAL_ANALYSIS', 'Goal analysis', 'Análise estruturada de objetivos existentes.', {
    complexity: 'HIGH', requiresStructuredContext: true, category: 'planning',
  }),
  capability('INSIGHT_ANALYSIS', 'Insight analysis', 'Análise de insights cognitivos estruturados.', {
    complexity: 'HIGH', requiresStructuredContext: true, category: 'analysis',
  }),
  capability('CLASSIFICATION', 'Classification', 'Classificação de entradas em categorias conhecidas.', {
    complexity: 'LOW', estimatedCost: 'LOW', estimatedLatency: 'LOW', category: 'analysis',
  }),
  capability('SUMMARIZATION', 'Summarization', 'Síntese de conteúdo fornecido.', {
    complexity: 'MEDIUM', estimatedCost: 'LOW', estimatedLatency: 'MEDIUM', supportsStreaming: true,
    category: 'language',
  }),
  capability('EXPLANATION', 'Explanation', 'Explicação organizada de fatos e decisões estruturadas.', {
    complexity: 'MEDIUM', supportsStreaming: true, requiresStructuredContext: true, category: 'language',
  }),
  capability('RECOMMENDATION', 'Recommendation', 'Representação de recomendações baseadas em contexto.', {
    complexity: 'HIGH', requiresStructuredContext: true, category: 'decision_support',
  }),
  capability('FORECAST', 'Forecast', 'Projeção orientada por dados estruturados.', {
    complexity: 'VERY_HIGH', estimatedCost: 'HIGH', estimatedLatency: 'HIGH',
    requiresStructuredContext: true, category: 'financial',
  }),
  capability('DOCUMENT_ANALYSIS', 'Document analysis', 'Análise estrutural de documentos fornecidos.', {
    complexity: 'HIGH', estimatedCost: 'HIGH', estimatedLatency: 'HIGH', supportsVision: true,
    requiresStructuredContext: true, category: 'document',
  }),
  capability('VISION', 'Vision', 'Interpretação de conteúdo visual fornecido.', {
    complexity: 'HIGH', estimatedCost: 'HIGH', estimatedLatency: 'HIGH', supportsVision: true,
    category: 'multimodal',
  }),
  capability('OCR', 'OCR', 'Extração estruturada de caracteres em imagens.', {
    complexity: 'MEDIUM', estimatedCost: 'MEDIUM', estimatedLatency: 'MEDIUM', supportsVision: true,
    category: 'document',
  }),
  capability('VOICE', 'Voice', 'Processamento representacional de interação por voz.', {
    complexity: 'HIGH', estimatedCost: 'HIGH', estimatedLatency: 'LOW', supportsStreaming: true,
    supportsVoice: true, category: 'multimodal',
  }),
  capability('CALCULATION', 'Calculation', 'Cálculo determinável a partir de dados estruturados.', {
    complexity: 'MEDIUM', estimatedCost: 'LOW', estimatedLatency: 'LOW',
    requiresStructuredContext: true, category: 'calculation',
  }),
  capability('BRAINSTORMING', 'Brainstorming', 'Exploração estruturada de possibilidades.', {
    complexity: 'MEDIUM', supportsStreaming: true, category: 'creative',
  }),
  capability('CONVERSATION', 'Conversation', 'Condução contextual de uma conversa.', {
    complexity: 'MEDIUM', supportsStreaming: true, supportsVoice: true, category: 'language',
  }),
]);
