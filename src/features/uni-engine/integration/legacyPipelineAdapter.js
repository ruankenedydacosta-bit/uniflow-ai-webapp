// Integration — adapter do pipeline legado (Parte 1).
//
// Normaliza o resultado do pipeline legado para o contrato da integração:
// { text, responseType, issueField, transactionType, conversationStyle,
//   hasConfirmationCard, status }. Entrada inválida → null (fallback imediato
// ao legado). Nunca inventa tipo, nunca altera o texto legado.
import { assertIntegrationResponseType, sanitizeLegacyResult } from './integrationContracts.js';

const LEGACY_STYLE_KEYS = Object.freeze(['simple', 'normal', 'detailed']);

export function buildLegacyPipelineAdapter(raw = null) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const text = typeof safe.text === 'string' ? safe.text.trim() : '';
  if (!text) return null;

  const responseType = assertIntegrationResponseType(safe.responseType);

  const protectedType = ['confirmation', 'error', 'success'].includes(responseType);

  const issueField = typeof safe.issueField === 'string' && safe.issueField.trim()
    ? safe.issueField.trim()
    : null;
  const transactionType = typeof safe.transactionType === 'string' && safe.transactionType.trim()
    ? safe.transactionType.trim()
    : null;
  const conversationStyle = LEGACY_STYLE_KEYS.includes(safe.conversationStyle)
    ? safe.conversationStyle
    : null;
  const status = typeof safe.status === 'string' && safe.status.trim()
    ? safe.status.trim()
    : null;
  const hasConfirmationCard = Boolean(safe.hasConfirmationCard);

  const adapter = {
    text,
    responseType,
    issueField,
    transactionType,
    conversationStyle,
    status,
    hasConfirmationCard,
    protectedType,
  };

  return Object.freeze(adapter);
}

export function buildLegacySnapshot(raw = null) {
  const safe = raw && typeof raw === 'object' ? raw : {};
  return sanitizeLegacyResult(safe);
}

export function isLegacyResultValid(raw) {
  return buildLegacyPipelineAdapter(raw) !== null;
}