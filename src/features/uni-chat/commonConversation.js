import { normalizeFinancialText } from '../uni-intents/index.js';

export function resolveCommonConversationResponse(input) {
  const normalized = normalizeFinancialText(input);

  if (/^(?:obrigad[oa]|valeu)\b/.test(normalized)) {
    return 'Por nada! Sempre que precisar, estou por aqui.';
  }
  if (/^(?:tudo\s+bem|como\s+(?:voce|vc)\s+(?:esta|ta)|como\s+vai)\b/.test(normalized)) {
    return 'Estou bem e pronta para ajudar. E você?';
  }
  return 'Olá! Como posso ajudar?';
}
