// SUPORTE1: validação e construção de payload do formulário de "relatar
// problema" -- mesmos limites de tamanho já aplicados no banco
// (support_requests_subject_length_check/description_length_check), aqui
// só como validação client-side de UX (a defesa real é sempre o banco).

export const SUPPORT_REQUEST_CATEGORIES = Object.freeze([
  { value: 'acesso_conta', label: 'Acesso e conta' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'chat_uni', label: 'Chat da Uni' },
  { value: 'voz', label: 'Voz' },
  { value: 'notificacoes', label: 'Notificações' },
  { value: 'pessoal_empresa', label: 'Pessoal/Empresa' },
  { value: 'erro_tecnico', label: 'Erro técnico' },
  { value: 'cobranca_plano', label: 'Cobrança ou plano' },
  { value: 'privacidade_seguranca', label: 'Privacidade e segurança' },
  { value: 'outro', label: 'Outro' },
]);

export const SUPPORT_REQUEST_IMPACT_LEVELS = Object.freeze([
  { value: 'low', label: 'Baixo -- consigo continuar usando' },
  { value: 'medium', label: 'Médio -- atrapalha, mas tenho alternativa' },
  { value: 'high', label: 'Alto -- não consigo continuar' },
]);

export const SUPPORT_REQUEST_PLATFORMS = Object.freeze([
  { value: '', label: 'Não sei / não se aplica' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
]);

const MAX_SUBJECT_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 4000;

// Palavras que sugerem o usuário está prestes a colar uma credencial --
// bloqueio básico client-side (nunca a única defesa: o campo nunca é
// enviado para a OpenAI, só persistido em support_requests via RLS restrita
// ao próprio usuário -- mas um aviso antes do envio evita erro comum).
const SENSITIVE_HINT_PATTERN = /\b(senha|password|cvv|numero do cartao|cart[aã]o de cr[ée]dito|chave pix|token de acesso|api[_-]?key)\b/i;

export function createEmptySupportRequestForm() {
  return {
    category: '',
    subject: '',
    description: '',
    impact: 'medium',
    platform: '',
  };
}

export function containsLikelySensitiveData(text) {
  return SENSITIVE_HINT_PATTERN.test(text || '');
}

export function validateSupportRequestForm(form) {
  if (!form.category) return 'Escolha uma categoria.';
  if (!form.subject.trim()) return 'Escreva um assunto.';
  if (form.subject.trim().length > MAX_SUBJECT_LENGTH) return `O assunto deve ter até ${MAX_SUBJECT_LENGTH} caracteres.`;
  if (!form.description.trim()) return 'Descreva o problema.';
  if (form.description.trim().length > MAX_DESCRIPTION_LENGTH) return `A descrição deve ter até ${MAX_DESCRIPTION_LENGTH} caracteres.`;
  if (containsLikelySensitiveData(form.subject) || containsLikelySensitiveData(form.description)) {
    return 'Não inclua senhas, dados de cartão ou chaves de acesso. Remova essas informações antes de enviar.';
  }
  return null;
}

export function buildSupportRequestPayload(form, { userId, workspaceId, conversationId } = {}) {
  return {
    user_id: userId,
    workspace_id: workspaceId ?? null,
    conversation_id: conversationId ?? null,
    category: form.category,
    subject: form.subject.trim(),
    description: form.description.trim(),
    impact: form.impact || 'medium',
    platform: form.platform || null,
  };
}
