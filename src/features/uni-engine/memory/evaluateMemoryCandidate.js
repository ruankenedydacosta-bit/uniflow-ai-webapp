// Avaliação de candidatos de memória (Fase 3) — função pura e determinística.
//
// decideMemoryCandidate(input) decide:
//   - se existe candidato;
//   - tipo, subjectKey, valor, evidência, confiança inicial, expiração;
//   - motivo;
//   - se é permitido persistir.
//
// NÃO cria memória para: saudações, frases casuais, valores financeiros
// isolados, senhas, tokens, documentos, dados bancários sensíveis, saldo,
// número de cartão, chave privada, conteúdo temporário sem relevância, dados
// de outro workspace, inferência com baixa confiança sem confirmação.
//
// Sem LLM, sem rede, sem Supabase. Apenas padrões determinísticos.
import {
  containsForbiddenKey,
  isValidMemoryType,
} from './memoryTypes.js';
import { MEMORY_POLICY, getEvidenceWeight, getRetentionForType } from './memoryPolicy.js';
import { normalizeMemoryEntity, normalizeMemorySubject } from './normalizeMemorySubject.js';

const MONEY_PATTERN = /(?:r\$\s?\d|\d[\d.,]*(?:\s*(?:reais|real|centavos|contos))?)/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/i;
const CPF_PATTERN = /(^|\D)\d{3}[.-]?\d{3}[.-]?\d{3}[.-]?\d{2}($|\D)/;
const CARD_PATTERN = /(^|\D)\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}($|\D)/;
const PHONE_PATTERN = /(^|\D)(?:\+?55[ -]?)?\(?\d{2}\)?[ -]?\d{4,5}[ -]?\d{4}($|\D)/;

const STYLE_SHORT_PATTERN =
  /(?:prefiro(?:\s+que)?(?:\s+(?:voce|você|a\s+uni))?\s*(?:responda|respostas|que\s+responda|fale|converse)\s*(?:de\s+forma\s+)?|responda(?:\s+de\s+forma\s+)?)(?:curta|curto|curtas|resumidamente|resumido|resumida|breve|objetiva|objetivo)/i;
const STYLE_LONG_PATTERN =
  /(?:prefiro(?:\s+que)?(?:\s+(?:voce|você|a\s+uni))?\s*(?:responda|respostas|que\s+responda|fale|converse)\s*(?:de\s+forma\s+)?|responda(?:\s+de\s+forma\s+)?)(?:detalhada|detalhado|detalhadamente|longa|longo|completa|completo)/i;

const IS_STATEMENT_PATTERN =
  /^\s*([A-Za-zÀ-ú][A-Za-zÀ-ú .'-]{1,38})\s+(?:é|eh)\s+(?:(?:o|a|um|uma)\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,39})\s*[.!]?\s*$/i;

const CORRECTION_PATTERN =
  /^\s*(?:nao\s+é|não\s+é|na\s+verdade\s+é|corrige\s+para)\s+([^,.]+?)\s*,\s*(?:é|eh|para)\s+([^,.]+?)\s*[.!]?\s*$/i;

const MERCHANT_ACCOUNT_ALWAYS_PATTERN =
  /use\s+sempre\s+(?:a\s+conta\s+|o\s+banco\s+|o\s+app\s+|o\s+cartao\s+|o\s+cartão\s+|a\s+|o\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,29})\s+(?:quando|para)\s+(?:eu\s+falar\s+de\s+|falar\s+de\s+|for\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,29})\s*[.!]?\s*$/i;

const ACCOUNT_USAGE_PATTERN =
  /(?:costumo\s+usar|sempre\s+uso|geralmente\s+uso|uso\s+muito)\s+(?:a\s+conta\s+|o\s+banco\s+|o\s+app\s+|a\s+|o\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,29})\s+(?:para|em|quando\s+for)\s+([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,29})\s*[.!]?\s*$/i;

const CATEGORY_CLASSIFICATION_PATTERN =
  /([A-Za-zÀ-ú][A-Za-zÀ-ú .'-]{1,38})\s+(?:costuma\s+ser\s+classificad[ao]\s+como|sempre\s+é\s+classificad[ao]\s+como)\s+([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,39})\s*[.!]?\s*$/i;

const MAIN_ACCOUNT_PATTERN =
  /minha\s+conta\s+principal\s+(?:é|eh)\s+(?:a\s+|o\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,29})\s*[.!]?\s*$/i;

const CONFIRMATION_PROCEDURE_PATTERN =
  /(?:sempre\s+me\s+pergunte|me\s+pergunte\s+sempre|sempre\s+confirme|confirme\s+sempre)\s+(?:antes\s+de\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú ]{1,39})\s*[.!]?\s*$/i;

// Categorias reconhecidas em afirmações do tipo "X é Categoria". Lista
// conservadora — apenas nomes de categoria comuns, nunca entidades.
const KNOWN_CATEGORY_WORDS = Object.freeze([
  'alimentação', 'alimentacao', 'comida', 'supermercado', 'mercado',
  'saúde', 'saude', 'farmácia', 'farmacia', 'transporte', 'combustível',
  'combustivel', 'moradia', 'aluguel', 'lazer', 'educação', 'educacao',
  'vestuário', 'vestuario', 'roupa', 'serviços', 'servicos', 'outros',
  'casa', 'pet', 'pets', 'viagem', 'assinaturas', 'beleza', 'receita',
  'salário', 'salario', 'tecnologia', 'assinatura', 'mercado livre',
]);

const SMALL_TALK_MESSAGE_TYPES = new Set(['small_talk', 'cancellation']);
const NO_EPISODIC_MESSAGE_TYPES = new Set(['small_talk', 'cancellation', 'unsupported']);
const EPISODIC_MESSAGE_TYPES = new Set(['action', 'query', 'confirmation', 'continuation']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function containsSensitiveContent(text) {
  if (!text) return false;
  if (containsForbiddenKey(text)) return true;
  return (
    EMAIL_PATTERN.test(text)
    || CPF_PATTERN.test(text)
    || CARD_PATTERN.test(text)
    || PHONE_PATTERN.test(text)
  );
}

// Valor monetário isolado ("50 reais", "R$ 100") sem outro conteúdo
// relevante → nunca gera memória.
function isIsolatedFinancialValue(text) {
  if (!MONEY_PATTERN.test(text)) return false;
  const withoutMoney = text
    .replace(MONEY_PATTERN, ' ')
    .replace(/\b(?:reais|real|centavos|contos|r\$)\b/gi, ' ')
    .replace(/[\s.,!?;:]+/g, ' ')
    .trim();
  return withoutMoney.length < 3;
}

function isKnownCategoryName(name) {
  const normalized = normalizeMemoryEntity(name);
  return KNOWN_CATEGORY_WORDS.includes(normalized);
}

function findSnapshotCategory(name, snapshot) {
  if (!snapshot || !Array.isArray(snapshot.categories)) return null;
  const normalized = normalizeMemoryEntity(name);
  const match = snapshot.categories.find((category) => {
    const categoryName = normalizeMemoryEntity(category?.name ?? '');
    return categoryName === normalized || categoryName.includes(normalized);
  });
  return match?.name ?? null;
}

function buildSubject(kind, entity) {
  return normalizeMemorySubject({ kind, entity });
}

function buildCandidate({
  userId,
  workspaceId,
  conversationId,
  memoryType,
  subjectKey,
  value,
  normalizedValue,
  evidenceType,
  source,
  sourceMessageId,
  occurredAt,
  metadata = {},
}) {
  return {
    userId,
    workspaceId,
    conversationId,
    memoryType,
    subjectKey,
    value,
    normalizedValue,
    evidenceType,
    weight: getEvidenceWeight(evidenceType),
    status: evidenceType === 'user_confirmation' || evidenceType === 'user_correction'
      ? 'confirmed'
      : 'candidate',
    source,
    expiresAt: null,
    metadata,
    evidence: {
      evidenceType,
      sourceMessageId,
      observedValue: value,
      normalizedValue,
      occurredAt,
      metadata,
    },
  };
}

// -----------------------------------------------
// Extratores explícitos (cada um decide um candidato)
// -----------------------------------------------

function extractResponseStyle({ messageText, scope, occurredAt }) {
  const text = safeString(messageText);
  if (STYLE_SHORT_PATTERN.test(text)) {
    return buildCandidate({
      ...scope,
      memoryType: 'conversation_preference',
      subjectKey: buildSubject('style', 'response_length'),
      value: { style: 'short' },
      normalizedValue: 'response_length=short',
      evidenceType: 'explicit_user_statement',
      source: 'user',
      sourceMessageId: scope.sourceMessageId,
      occurredAt,
    });
  }
  if (STYLE_LONG_PATTERN.test(text)) {
    return buildCandidate({
      ...scope,
      memoryType: 'conversation_preference',
      subjectKey: buildSubject('style', 'response_length'),
      value: { style: 'detailed' },
      normalizedValue: 'response_length=detailed',
      evidenceType: 'explicit_user_statement',
      source: 'user',
      sourceMessageId: scope.sourceMessageId,
      occurredAt,
    });
  }
  return null;
}

function extractMerchantCategoryStatement({ messageText, scope, occurredAt, snapshot }) {
  const match = safeString(messageText).match(IS_STATEMENT_PATTERN);
  if (!match) return null;
  const merchant = match[1].trim();
  const category = match[2].trim();
  if (merchant.length < 3 || merchant.length > 40) return null;
  if (!isKnownCategoryName(category) && !findSnapshotCategory(category, snapshot)) return null;
  const resolvedCategory = findSnapshotCategory(category, snapshot) ?? category;
  return buildCandidate({
    ...scope,
    memoryType: 'merchant_category_association',
    subjectKey: buildSubject('merchant_category', merchant),
    value: { merchant, category: resolvedCategory },
    normalizedValue: `merchant=${normalizeMemoryEntity(merchant)};category=${normalizeMemoryEntity(resolvedCategory)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractCorrection({ messageText, scope, occurredAt, contextSubject }) {
  const match = safeString(messageText).match(CORRECTION_PATTERN);
  if (!match) return null;
  const correctedFrom = match[1].trim();
  const correctedTo = match[2].trim();
  const merchant = contextSubject ?? null;
  if (!merchant || correctedTo.length < 2 || correctedFrom.length < 2) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'user_correction',
    subjectKey: buildSubject('merchant_category', merchant),
    value: { merchant, category: correctedTo, correctedFrom },
    normalizedValue: `merchant=${normalizeMemoryEntity(merchant)};category=${normalizeMemoryEntity(correctedTo)}`,
    evidenceType: 'user_correction',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractMerchantAccountAlways({ messageText, scope, occurredAt }) {
  const match = safeString(messageText).match(MERCHANT_ACCOUNT_ALWAYS_PATTERN);
  if (!match) return null;
  const account = match[1].trim();
  const merchant = match[2].trim();
  if (account.length < 2 || merchant.length < 3) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'merchant_account_association',
    subjectKey: buildSubject('merchant_account', merchant),
    value: { merchant, account },
    normalizedValue: `merchant=${normalizeMemoryEntity(merchant)};account=${normalizeMemoryEntity(account)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractAccountUsage({ messageText, scope, occurredAt }) {
  const match = safeString(messageText).match(ACCOUNT_USAGE_PATTERN);
  if (!match) return null;
  const account = match[1].trim();
  const context = match[2].trim();
  if (account.length < 2 || context.length < 3) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'account_preference',
    subjectKey: buildSubject('account', account),
    value: { account, context },
    normalizedValue: `account=${normalizeMemoryEntity(account)};context=${normalizeMemoryEntity(context)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractCategoryClassification({ messageText, scope, occurredAt, snapshot }) {
  const match = safeString(messageText).match(CATEGORY_CLASSIFICATION_PATTERN);
  if (!match) return null;
  const merchant = match[1].trim();
  const category = match[2].trim();
  if (merchant.length < 3 || !isKnownCategoryName(category) && !findSnapshotCategory(category, snapshot)) {
    return null;
  }
  const resolvedCategory = findSnapshotCategory(category, snapshot) ?? category;
  return buildCandidate({
    ...scope,
    memoryType: 'category_preference',
    subjectKey: buildSubject('category', merchant),
    value: { merchant, category: resolvedCategory },
    normalizedValue: `merchant=${normalizeMemoryEntity(merchant)};category=${normalizeMemoryEntity(resolvedCategory)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractMainAccount({ messageText, scope, occurredAt }) {
  const match = safeString(messageText).match(MAIN_ACCOUNT_PATTERN);
  if (!match) return null;
  const account = match[1].trim();
  if (account.length < 2) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'user_declared_fact',
    subjectKey: buildSubject('fact', 'main_account'),
    value: { account },
    normalizedValue: `main_account=${normalizeMemoryEntity(account)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

function extractConfirmationProcedure({ messageText, scope, occurredAt }) {
  const match = safeString(messageText).match(CONFIRMATION_PROCEDURE_PATTERN);
  if (!match) return null;
  const action = match[1].trim();
  if (action.length < 2) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'procedure_preference',
    subjectKey: buildSubject('procedure', 'confirm_before'),
    value: { action, confirmBefore: true },
    normalizedValue: `procedure=confirm_before;action=${normalizeMemoryEntity(action)}`,
    evidenceType: 'explicit_user_statement',
    source: 'user',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
  });
}

// Contexto episódico: interação recente com sujeito resolvido (conta ou
// categoria). Expira rápido e pesa pouco — nunca vira ação.
function extractEpisodicContext({ scope, occurredAt, epistemicState, classification }) {
  const messageType = classification?.messageType ?? null;
  if (!EPISODIC_MESSAGE_TYPES.has(messageType)) return null;
  const account = epistemicState?.account?.value ?? null;
  const category = epistemicState?.category?.value ?? null;
  const intent = classification?.primaryIntent ?? null;
  if (!account && !category && !intent) return null;
  const subjectEntity = normalizeMemoryEntity(account ?? category ?? String(intent));
  if (!subjectEntity) return null;
  return buildCandidate({
    ...scope,
    memoryType: 'episodic_context',
    subjectKey: buildSubject('merchant', subjectEntity),
    value: {
      account: account ?? null,
      category: category ?? null,
      intent: intent ?? null,
    },
    normalizedValue: `subject=${subjectEntity};intent=${intent ?? 'none'}`,
    evidenceType: 'behavior_pattern',
    source: 'engine',
    sourceMessageId: scope.sourceMessageId,
    occurredAt,
    messageText: null,
  });
}

// -----------------------------------------------
// Ponto único de avaliação
// -----------------------------------------------

export function evaluateMemoryCandidate(input = {}) {
  const safe = isPlainObject(input) ? input : {};
  const policy = isPlainObject(safe.policy) ? safe.policy : MEMORY_POLICY;
  const message = isPlainObject(safe.message) ? safe.message : {};
  const session = isPlainObject(safe.session) ? safe.session : {};
  const classification = isPlainObject(safe.classification) ? safe.classification : {};
  const epistemicState = isPlainObject(safe.epistemicState) ? safe.epistemicState : {};
  const cognitiveContext = isPlainObject(safe.cognitiveContext) ? safe.cognitiveContext : {};
  const snapshot = isPlainObject(safe.snapshot) ? safe.snapshot : null;
  const memory = isPlainObject(safe.operationalMemory) ? safe.operationalMemory : null;
  const now = safe.now ?? Date.now();
  const messageText = safeString(message.text);
  const sourceMessageId = message.id ?? null;
  const userId = session.userId ?? null;
  const workspaceId = session.workspaceId ?? null;
  const conversationId = session.conversationId ?? null;

  const diagnostics = {
    rulesUsed: [],
    rejected: [],
    candidateCount: 0,
  };

  if (!messageText) {
    diagnostics.rejected.push({ reason: 'empty_message' });
    return { candidates: [], rejected: diagnostics.rejected, diagnostics };
  }

  const messageType = classification.messageType ?? null;
  if (containsSensitiveContent(messageText)) {
    diagnostics.rulesUsed.push('sensitive_content_block');
    diagnostics.rejected.push({ reason: 'sensitive_content' });
    return { candidates: [], rejected: diagnostics.rejected, diagnostics };
  }

  if (isIsolatedFinancialValue(messageText)) {
    diagnostics.rulesUsed.push('isolated_financial_value_block');
    diagnostics.rejected.push({ reason: 'isolated_financial_value' });
    return { candidates: [], rejected: diagnostics.rejected, diagnostics };
  }

  const scope = {
    userId,
    workspaceId,
    conversationId,
    sourceMessageId,
  };

  const contextSubject = normalizeMemoryEntity(
    cognitiveContext.currentSubject
    ?? memory?.lastEntity
    ?? null,
  );

  const nowIso = new Date(now).toISOString();

  // Extratores EXPLÍCITOS primeiro: padrões de alta precisão ("prefiro
  // respostas curtas", "Padaria é Alimentação", "não é X, é Y") valem mesmo
  // quando o motor classifica a frase como unsupported — a captura de
  // preferência explícita nunca depende da classificação do pipeline.
  const explicitExtractors = [
    {
      name: 'response_style',
      run: () => extractResponseStyle({ messageText, scope, occurredAt: nowIso }),
    },
    {
      name: 'main_account_fact',
      run: () => extractMainAccount({ messageText, scope, occurredAt: nowIso }),
    },
    {
      name: 'confirmation_procedure',
      run: () => extractConfirmationProcedure({ messageText, scope, occurredAt: nowIso }),
    },
    {
      name: 'correction',
      run: () => extractCorrection({
        messageText,
        scope,
        occurredAt: nowIso,
        contextSubject: contextSubject || null,
      }),
    },
    {
      name: 'merchant_account_always',
      run: () => extractMerchantAccountAlways({ messageText, scope, occurredAt: nowIso }),
    },
    {
      name: 'account_usage',
      run: () => extractAccountUsage({ messageText, scope, occurredAt: nowIso }),
    },
    {
      name: 'merchant_category_statement',
      run: () => extractMerchantCategoryStatement({
        messageText,
        scope,
        occurredAt: nowIso,
        snapshot,
      }),
    },
    {
      name: 'category_classification',
      run: () => extractCategoryClassification({
        messageText,
        scope,
        occurredAt: nowIso,
        snapshot,
      }),
    },
  ];

  const candidates = [];
  const rejected = [...diagnostics.rejected];

  for (const extractor of explicitExtractors) {
    const candidate = extractor.run();
    if (!candidate) continue;
    diagnostics.rulesUsed.push(extractor.name);
    if (candidates.length >= policy.maxCandidatesPerMessage) break;
    candidates.push(candidate);
  }

  // Sem candidato explícito, aplica o bloqueio por tipo de mensagem: saudações
  // e frases casuais (small_talk/cancellation) NUNCA geram memória; conteúdo
  // sem suporte (unsupported) também não gera contexto episódico.
  if (candidates.length === 0 && SMALL_TALK_MESSAGE_TYPES.has(messageType)) {
    diagnostics.rulesUsed.push('message_type_block');
    rejected.push({ reason: 'message_type', messageType });
    return { candidates, rejected, diagnostics };
  }

  // Contexto episódico: interações substantivas com sujeito resolvido.
  if (candidates.length === 0 && !NO_EPISODIC_MESSAGE_TYPES.has(messageType)) {
    const episodic = extractEpisodicContext({
      scope,
      occurredAt: nowIso,
      epistemicState,
      classification,
    });
    if (episodic) {
      diagnostics.rulesUsed.push('episodic_context');
      candidates.push(episodic);
    }
  }

  // Validação final e expiração determinística por tipo.
  const validCandidates = [];
  for (const candidate of candidates) {
    const retention = getRetentionForType(candidate.memoryType, policy);
    candidate.expiresAt = retention == null ? null : new Date(now + retention).toISOString();

    if (!isValidMemoryType(candidate.memoryType)) {
      rejected.push({ reason: 'invalid_memory_type', memoryType: candidate.memoryType });
      continue;
    }
    if (!candidate.subjectKey || !candidate.value) {
      rejected.push({ reason: 'incomplete_candidate' });
      continue;
    }
    validCandidates.push(candidate);
  }

  diagnostics.candidateCount = validCandidates.length;
  return { candidates: validCandidates, rejected, diagnostics };
}
