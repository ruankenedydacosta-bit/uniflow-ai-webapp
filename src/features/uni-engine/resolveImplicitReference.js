// Resolução Inteligente de Referências do Uni Engine (Fase 2).
//
// Resolve referências implícitas do usuário — "isso", "essa conta", "esse
// valor", "aquele gasto", "essa compra", "esse pagamento", "essa
// transferência", "ela", "ele", "aquele dinheiro", "o anterior", "o último",
// "o mesmo" — usando SOMENTE:
//   1. contexto atual (mensagem + pendência ativa + estado epistêmico);
//   2. histórico recente da conversa;
//   3. FinancialSnapshot projetado.
//
// NUNCA usa LLM, banco, Supabase ou rede. A resolução é diagnóstica: o motor
// não altera o pipeline; apenas disponibiliza a resolução e a usa nas
// métricas/diagnósticos (ex.: "Pipeline pediu conta. Engine detectou que a
// conta já estava implícita.").
import { normalizeSearchText } from '../../utils/searchText.js';

const FEMININE_DEMONSTRATIVES =
  '(?:essa|nessa|dessa|esta|nesta|desta|aquela|naquela|daquela)';
const MASCULINE_DEMONSTRATIVES =
  '(?:esse|nesse|desse|este|neste|deste|aquele|naquele|daquele)';
const NEUTER_DEMONSTRATIVES =
  '(?:isso|nisso|disto|isto|nisto|aquilo|naquilo|daquilo)';

const ACCOUNT_REFERENCE_PATTERNS = [
  new RegExp(`\\b${FEMININE_DEMONSTRATIVES}\\s+conta\\b`),
  /\bconta\s+anterior\b/,
];

const VALUE_REFERENCE_PATTERNS = [
  new RegExp(`\\b${MASCULINE_DEMONSTRATIVES}\\s+(?:mesmo\\s+)?valor\\b`),
  /\bvalor\s+anterior\b/,
  /\b(?:o|a)\s+mesmo\s+valor\b/,
  new RegExp(`\\b(?:${MASCULINE_DEMONSTRATIVES}|o)\\s+dinheiro\\b`),
];

const TRANSACTION_REFERENCE_PATTERNS = [
  new RegExp(`\\b${FEMININE_DEMONSTRATIVES}\\s+(?:compra|transa[çc][ãa]o|despesa|transfer[eê]ncia)\\b`),
  new RegExp(`\\b${MASCULINE_DEMONSTRATIVES}\\s+(?:gasto|pagamento|lan[çc]amento)\\b`),
];

const GENERIC_REFERENCE_PATTERNS = [
  new RegExp(`\\b${NEUTER_DEMONSTRATIVES}\\b`),
  /\b(?:o|a)\s+(?:anterior|último|ultimo|mesmo|mesma)\b/,
  /\b(?:ele|ela)\b/,
];

function hasExplicitFinancialData(text, snapshot) {
  if (/\b(?:r\$\s*)?\d[\d.,]*\b/.test(text)) return true;
  const normalized = normalizeSearchText(text);
  const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  const hasAccount = accounts.some((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && normalized.includes(name);
  });
  const hasCategory = categories.some((category) => {
    const name = normalizeSearchText(category?.name ?? '');
    return name && normalized.includes(name);
  });
  return hasAccount || hasCategory;
}

export function hasImplicitReference(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  const normalized = normalizeSearchText(text);
  return ACCOUNT_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))
    || VALUE_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))
    || TRANSACTION_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))
    || GENERIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findSnapshotAccountId(accountName, snapshot) {
  if (!accountName || !snapshot) return null;
  const normalized = normalizeSearchText(accountName);
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  const match = accounts.find((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && (name === normalized || name.includes(normalized) || normalized.includes(name));
  });
  return match?.id ?? null;
}

function findSnapshotAccountByToken(text, snapshot) {
  if (!text || !snapshot) return null;
  const normalized = normalizeSearchText(text);
  const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
  return accounts.find((account) => {
    const name = normalizeSearchText(account?.name ?? '');
    return name && normalized.includes(name);
  }) ?? null;
}

function resolveAccountCandidates({ text, memory, analyzed, pendingAwaitedField, snapshot }) {
  const candidates = [];
  const normalized = normalizeSearchText(text);
  const isAccountRef = ACCOUNT_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));

  // "essa conta" também é reconhecido quando a pendência aguarda conta
  // (inclui contrações: nessa, nesta, naquela, dessa, desta, daquela).
  const isPendingAccountRef =
    (pendingAwaitedField === 'account' || pendingAwaitedField === 'destinationAccount')
    && (new RegExp(`\\b${FEMININE_DEMONSTRATIVES}\\b`).test(normalized) || /\bela\b/.test(normalized));

  if (!isAccountRef && !isPendingAccountRef) return candidates;

  const memoryAccount = memory?.lastAccount;
  if (memoryAccount) {
    candidates.push({
      type: 'account',
      value: memoryAccount,
      id: memory?.lastAccountId ?? findSnapshotAccountId(memoryAccount, snapshot),
      description: memoryAccount,
      amount: null,
      accountName: memoryAccount,
      source: 'operational_memory',
      confidence: 0.9,
    });
  }

  const historyAccount = analyzed?.history?.lastAccountReference;
  if (historyAccount && historyAccount !== memoryAccount) {
    candidates.push({
      type: 'account',
      value: historyAccount,
      id: findSnapshotAccountId(historyAccount, snapshot),
      description: historyAccount,
      amount: null,
      accountName: historyAccount,
      source: 'conversation_history',
      confidence: 0.7,
    });
  }

  // Conta citada na própria mensagem (ex.: "essa conta aí, o Nubank").
  const inlineAccount = findSnapshotAccountByToken(text, snapshot);
  if (inlineAccount && inlineAccount.name !== memoryAccount && inlineAccount.name !== historyAccount) {
    candidates.push({
      type: 'account',
      value: inlineAccount.name,
      id: inlineAccount.id,
      description: inlineAccount.name,
      amount: null,
      accountName: inlineAccount.name,
      source: 'user_message',
      confidence: 1,
    });
  }

  // Pendência aguardando conta + snapshot com UMA única conta → melhor
  // candidato determinístico disponível localmente.
  if (candidates.length === 0 && snapshot && Array.isArray(snapshot.accounts) && snapshot.accounts.length === 1) {
    const single = snapshot.accounts[0];
    candidates.push({
      type: 'account',
      value: single.name,
      id: single.id,
      description: single.name,
      amount: null,
      accountName: single.name,
      source: 'financial_snapshot',
      confidence: 0.5,
    });
  }

  return candidates;
}

function resolveValueCandidates({ text, epistemic, memory, pendingAction, analyzed }) {
  const candidates = [];
  const normalized = normalizeSearchText(text);
  const isValueRef = VALUE_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!isValueRef) return candidates;

  const explicitAmount = epistemic?.amount?.value ?? null;
  if (explicitAmount != null && Number(explicitAmount) > 0) {
    candidates.push({
      type: 'value',
      value: Number(explicitAmount),
      description: null,
      amount: Number(explicitAmount),
      accountName: null,
      source: 'user_message',
      confidence: 1,
    });
  }

  const memoryValue = memory?.lastValue;
  if (memoryValue != null && Number(memoryValue) > 0 && Number(memoryValue) !== explicitAmount) {
    candidates.push({
      type: 'value',
      value: Number(memoryValue),
      description: null,
      amount: Number(memoryValue),
      accountName: null,
      source: 'operational_memory',
      confidence: 0.9,
    });
  }

  const pendingAmount = pendingAction?.amount ?? pendingAction?.fields?.amount;
  if (pendingAmount != null && Number(pendingAmount) > 0) {
    candidates.push({
      type: 'value',
      value: Number(pendingAmount),
      description: null,
      amount: Number(pendingAmount),
      accountName: null,
      source: 'pending_action',
      confidence: 0.6,
    });
  }

  const lastTransaction = analyzed?.history?.lastTransactionReference;
  if (lastTransaction && typeof lastTransaction.amount === 'number') {
    candidates.push({
      type: 'value',
      value: lastTransaction.amount,
      description: lastTransaction.description,
      amount: lastTransaction.amount,
      accountName: null,
      source: 'conversation_history',
      confidence: 0.55,
    });
  }

  return candidates;
}

function resolveEntityCandidates({ memory, snapshot, analyzed }) {
  const candidates = [];
  const recent = Array.isArray(snapshot?.recentTransactions) ? snapshot.recentTransactions : [];

  const lastEntity = memory?.lastEntity;
  if (lastEntity) {
    candidates.push({
      type: 'entity',
      value: lastEntity,
      description: lastEntity,
      amount: memory?.lastValue ?? null,
      accountName: memory?.lastAccount ?? null,
      source: 'operational_memory',
      confidence: 0.85,
    });
  }

  const recentTx = recent[0];
  const historyTx = analyzed?.history?.lastTransactionReference;
  if (recentTx && recentTx.description !== lastEntity && recentTx.description !== historyTx?.description) {
    candidates.push({
      type: 'transaction',
      value: recentTx.description,
      description: recentTx.description,
      amount: typeof recentTx.amount === 'number' ? recentTx.amount : null,
      accountName: null,
      source: 'financial_snapshot',
      confidence: 0.6,
    });
  }

  const lastAccount = memory?.lastAccount;
  if (lastAccount) {
    candidates.push({
      type: 'account',
      value: lastAccount,
      description: lastAccount,
      amount: null,
      accountName: lastAccount,
      source: 'operational_memory',
      confidence: 0.7,
    });
  }

  const lastValue = memory?.lastValue;
  if (lastValue != null) {
    candidates.push({
      type: 'value',
      value: Number(lastValue),
      description: null,
      amount: Number(lastValue),
      accountName: null,
      source: 'operational_memory',
      confidence: 0.6,
    });
  }

  return candidates;
}

function pickBest(candidates) {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  return sorted[0];
}

function matchRuleName(normalized) {
  if (ACCOUNT_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'account_reference';
  if (VALUE_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'value_reference';
  if (TRANSACTION_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'transaction_reference';
  if (GENERIC_REFERENCE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'generic_reference';
  return null;
}

// Resolve referências implícitas da mensagem. Retorna sempre um objeto
// serializável com a forma contratual:
//   { hasReference, resolved, referenceType, resolution, candidates, source, confidence, rulesUsed }
export function resolveImplicitReference(input, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const text = safeInput.message?.text ?? '';
  const context = safeInput.context ?? {};
  const snapshot = context.financialSnapshot ?? null;
  const pendingAction = context.pendingAction ?? null;
  const memory = options.memory ?? null;
  const analyzed = options.analyzed ?? null;
  const epistemic = options.epistemic ?? null;
  const pendingAwaitedField = analyzed?.pending?.awaitedField
    ?? pendingAction?.pendingField
    ?? (Array.isArray(pendingAction?.issues) && pendingAction.issues.length > 0
      ? pendingAction.issues[0].field
      : null);

  if (!hasImplicitReference(text)) {
    return {
      hasReference: false,
      resolved: false,
      referenceType: 'none',
      resolution: null,
      candidates: [],
      source: 'unresolved',
      confidence: 0,
      rulesUsed: [],
    };
  }

  const normalized = normalizeSearchText(text);
  const rule = matchRuleName(normalized);
  const rulesUsed = [rule];
  const candidates = [];

  // Cada tipo de referência coleta apenas candidatos do mesmo tipo — uma
  // "conta" nunca resolve para uma transação, e vice-versa.
  const isAccountRef = rule === 'account_reference'
    || ((pendingAwaitedField === 'account' || pendingAwaitedField === 'destinationAccount')
      && (new RegExp(`\\b${FEMININE_DEMONSTRATIVES}\\b`).test(normalized) || /\bela\b/.test(normalized)));

  if (isAccountRef) {
    rulesUsed.push('account_reference');
    candidates.push(...resolveAccountCandidates({
      text,
      memory,
      analyzed,
      pendingAwaitedField,
      snapshot,
    }));
  } else if (rule === 'value_reference') {
    candidates.push(...resolveValueCandidates({ text, epistemic, memory, pendingAction, analyzed }));
  } else if (rule === 'transaction_reference') {
    candidates.push(...resolveEntityCandidates({ memory, snapshot, analyzed }));
  } else if (rule === 'generic_reference') {
    candidates.push(...resolveEntityCandidates({ memory, snapshot, analyzed }));
  }

  const best = pickBest(candidates);
  const hasExplicit = hasExplicitFinancialData(text, snapshot);
  // Referência resolvida DENTRO da própria mensagem (fonte user_message) é
  // sempre válida; resoluções de memória/histórico/snapshot são descartadas
  // quando a mensagem já carrega dados explícitos (conservador).
  const resolved = Boolean(best) && (best?.source === 'user_message' || !hasExplicit);

  return {
    hasReference: true,
    resolved,
    referenceType: resolved ? (best?.type ?? 'none') : 'none',
    resolution: best && resolved ? { ...best } : null,
    candidates: candidates.slice(0, 5),
    source: resolved ? (best?.source ?? 'unresolved') : 'unresolved',
    confidence: resolved ? best.confidence : 0,
    rulesUsed: rulesUsed.filter(Boolean),
  };
}
