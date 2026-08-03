// Uni Engine — Application (Parte 5, Bloco 3: redação de telemetria).
//
// Permite SOMENTE campos estruturais por allowlist. Nunca registra: texto da
// resposta, originalText, finalText, mensagem, nomes, e-mails, telefones,
// userId, workspaceId, IDs de conta/transação, valores financeiros,
// descrições, memória, tokens ou secrets. As decisões observacionais
// (questionDecision / clarificationDecision) entram REDIGIDAS: apenas booleano
// de decisão, prioridade, contagem e confiança — nunca o texto de pergunta e
// nunca os campos ausentes/ambíguos em si quando forem dados sensíveis.
export const APPLICATION_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  'version',
  'enabled',
  'applied',
  'appliedCapabilities',
  'blockedCapabilities',
  'factualContentPreserved',
  'styleApplied',
  'lengthApplied',
  'fallbackUsed',
  'fallbackReason',
  'status',
  'latencyMs',
  'errorCode',
  'questionDecision',
  'clarificationDecision',
]);

function redactQuestionDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const missingInformationCount = Array.isArray(value.missingInformation)
    ? value.missingInformation.length
    : 0;
  return {
    shouldAsk: value.shouldAsk === true,
    questionPriority: typeof value.questionPriority === 'string' ? value.questionPriority : 'LOW',
    missingInformationCount,
    confidence:
      typeof value.confidence === 'number' && Number.isFinite(value.confidence)
        ? value.confidence
        : null,
    questionReason: typeof value.questionReason === 'string' ? value.questionReason : 'UNKNOWN',
  };
}

function redactClarificationDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const ambiguousFieldsCount = Array.isArray(value.ambiguousFields)
    ? value.ambiguousFields.length
    : 0;
  return {
    shouldClarify: value.shouldClarify === true,
    clarificationPriority: typeof value.clarificationPriority === 'string' ? value.clarificationPriority : 'LOW',
    ambiguousFieldsCount,
    confidence:
      typeof value.confidence === 'number' && Number.isFinite(value.confidence)
        ? value.confidence
        : null,
    clarificationReason: typeof value.clarificationReason === 'string' ? value.clarificationReason : 'UNKNOWN',
  };
}

export function redactApplicationTelemetry(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const result = {};
  for (const field of APPLICATION_TELEMETRY_ALLOWED_FIELDS) {
    if (!Object.hasOwn(safe, field)) continue;
    const value = safe[field];
    if (field === 'questionDecision') {
      result[field] = redactQuestionDecision(value);
      continue;
    }
    if (field === 'clarificationDecision') {
      result[field] = redactClarificationDecision(value);
      continue;
    }
    if (Array.isArray(value)) {
      result[field] = value
        .filter((item) => typeof item === 'string')
        .slice(0, 6);
      continue;
    }
    if (value === null) {
      result[field] = null;
      continue;
    }
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      result[field] = value;
      continue;
    }
    result[field] = '[redacted]';
  }
  return result;
}
