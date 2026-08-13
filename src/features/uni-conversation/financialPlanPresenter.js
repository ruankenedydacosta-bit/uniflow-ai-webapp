import { normalizeFinancialText, resolveRelativeDateExpression } from '../uni-intents/index.js';
import { PLAN_OPERATION_STATUS, PLAN_STATUS } from './pendingFinancialPlan.js';

// BLOCO E: camada de apresentacao/entrada do Pending Financial Plan --
// texto sempre curto e falavel (nunca le ID, JSON ou percentual de
// confianca -- secao 19 da tarefa) e um analisador de correcoes em
// linguagem natural ("Foi ontem", "Na verdade foram R$95", "Troca para
// Alimentacao", "Nao foi Nubank, foi Caixa") que reaproveita os MESMOS
// dados (accounts/categories) ja resolvidos deterministicamente -- nunca
// inventa conta/categoria nova a partir de uma correcao.

function formatAmountBRL(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'valor não informado';
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function matchAccountByName(accounts, text) {
  const normalized = normalizeFinancialText(text);
  if (!normalized) return null;
  const candidates = (Array.isArray(accounts) ? accounts : []).filter((account) => account?.is_active !== false);
  const matches = candidates.filter((account) => {
    const name = normalizeFinancialText(account?.name);
    const institution = normalizeFinancialText(account?.institution_name);
    return (name && (name === normalized || normalized.includes(name) || name.includes(normalized)))
      || (institution && (institution === normalized || normalized.includes(institution) || institution.includes(normalized)));
  });
  return matches.length === 1 ? matches[0] : null;
}

function matchCategoryByName(categories, text, transactionType) {
  const normalized = normalizeFinancialText(text);
  if (!normalized) return null;
  const candidates = (Array.isArray(categories) ? categories : [])
    .filter((category) => category?.is_active !== false)
    .filter((category) => !transactionType || category.category_type === transactionType);
  const matches = candidates.filter((category) => {
    const name = normalizeFinancialText(category?.name);
    return name && (name === normalized || normalized.includes(name) || name.includes(normalized));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function describePlanOperation(op) {
  const raw = op.rawOperation ?? {};
  const amountText = formatAmountBRL(raw.amount);
  const description = raw.description ? ` (${raw.description})` : '';

  if (op.capabilityPending) {
    return `• ${amountText}${description} — ${op.blockedReason}`;
  }
  if (op.operationType === 'transfer') {
    const originName = op.action?.account?.name ?? raw.sourceAccountReference ?? 'conta a definir';
    const destName = op.destinationAccountResolution?.account?.name
      ?? raw.destinationAccountReference
      ?? 'conta a definir';
    return `• Transferência de ${amountText} de ${originName} para ${destName}`;
  }
  const label = op.operationType === 'income' ? 'Entrada' : 'Saída';
  const categoryName = op.action?.category?.name;
  return `• ${label} de ${amountText}${description}${categoryName ? ` em ${categoryName}` : ''}`;
}

export function buildOperationClarificationQuestion(op) {
  if (!op) return 'Pode confirmar esse detalhe?';
  if (op.operationType === 'transfer' && op.destinationAccountResolution?.status !== 'resolved') {
    return 'Para qual conta foi essa transferência?';
  }
  if (op.action?.proposedAccount) {
    return 'Ainda não crio contas novas dentro de um plano com várias operações. Qual conta já existente devo usar?';
  }
  if (op.action?.proposedCategory) {
    return 'Ainda não crio categorias novas dentro de um plano com várias operações. Qual categoria já existente devo usar?';
  }
  const issue = op.action?.issues?.[0];
  const code = issue?.code;
  if (code === 'account_not_found' || code === 'account_required') {
    return 'Qual conta devo usar para esse lançamento?';
  }
  if (code === 'account_ambiguous') {
    return 'Encontrei mais de uma conta parecida. Qual delas devo usar?';
  }
  if (code === 'category_not_found' || code === 'category_required' || code === 'category_incompatible') {
    return 'Qual categoria devo usar para esse lançamento?';
  }
  if (code === 'amount_required') {
    const description = op.rawOperation?.description;
    return description
      ? `Qual foi o valor de ${description.toLowerCase()}?`
      : 'Qual é o valor desse lançamento?';
  }
  if (code === 'date_invalid') {
    return 'Qual foi a data desse lançamento?';
  }
  return 'Pode confirmar esse detalhe?';
}

export function buildPlanSummaryText(planState) {
  const active = planState.operations.filter((op) => op.status !== PLAN_OPERATION_STATUS.CANCELLED);
  const lines = active.map(describePlanOperation).join('\n');
  const intro = active.length > 1 ? 'Entendi as seguintes operações:' : 'Entendi o seguinte:';

  if (planState.status === PLAN_STATUS.AWAITING_CLARIFICATION) {
    const current = active[planState.currentOperationIndex]
      ?? active.find((op) => op.status === PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION);
    const question = planState.clarificationQuestion || buildOperationClarificationQuestion(current);
    return `${intro}\n${lines}\n\n${question}`;
  }

  return `${intro}\n${lines}\n\nPosso confirmar e registrar tudo isso?`;
}

/**
 * Um plano neural com exatamente uma operação já resolvida representa a
 * mesma pendência financeira que o fluxo determinístico simples. A UI pode
 * então reutilizar o card oficial de confirmação em vez de reduzir a ação a
 * um resumo textual. Planos múltiplos ou ainda ambíguos continuam no resumo
 * próprio, porque não cabem honestamente em um único card.
 */
export function getSingleReadyPlanAction(planState) {
  if (planState?.status !== PLAN_STATUS.READY_FOR_CONFIRMATION) return null;

  const active = (planState.operations ?? []).filter(
    (operation) => operation.status !== PLAN_OPERATION_STATUS.CANCELLED,
  );
  if (active.length !== 1) return null;

  const [operation] = active;
  if (
    operation.capabilityPending
    || operation.status !== PLAN_OPERATION_STATUS.READY
    || operation.action?.status !== 'ready'
  ) {
    return null;
  }
  return operation.action;
}

export function buildPlanCancelledText() {
  return 'Tudo bem, cancelei essa operação. Nada foi registrado.';
}

export function buildPlanOperationCancelledText(planState) {
  const active = planState.operations.filter((op) => op.status !== PLAN_OPERATION_STATUS.CANCELLED);
  if (!active.length) return buildPlanCancelledText();
  return `Cancelei esse lançamento. As demais operações continuam pendentes:\n${buildPlanSummaryText(planState)}`;
}

export function buildPlanResultText(planState) {
  const persistable = planState.operations.filter((op) => !op.capabilityPending);
  const confirmed = persistable.filter((op) => op.status === PLAN_OPERATION_STATUS.CONFIRMED);
  const failed = persistable.filter((op) => op.status === PLAN_OPERATION_STATUS.FAILED);
  const blocked = planState.operations.filter((op) => op.capabilityPending && op.status !== PLAN_OPERATION_STATUS.CANCELLED);

  const parts = [];
  if (confirmed.length) {
    parts.push(`Registrei ${confirmed.length === 1 ? 'o lançamento' : `${confirmed.length} lançamentos`} com sucesso.`);
  }
  if (failed.length) {
    parts.push(`Não consegui registrar ${failed.length === 1 ? 'um dos lançamentos' : `${failed.length} lançamentos`}. Nada foi perdido -- pode tentar de novo.`);
  }
  if (blocked.length) {
    parts.push(blocked.map((op) => op.blockedReason).join(' '));
  }
  return parts.join(' ') || 'Nada ficou pendente para confirmar.';
}

/**
 * Interpreta uma correcao em linguagem natural para a operacao ATUAL do
 * plano (planState.currentOperationIndex) e devolve overrides no MESMO
 * formato aceito por applyPlanOperationCorrection/buildFinancialIntentAction
 * -- nunca inventa uma conta/categoria que nao exista na lista fornecida.
 */
export function parsePlanCorrectionOverrides({
  text, referenceDate, accounts = [], categories = [], operation,
} = {}) {
  if (typeof text !== 'string' || !text.trim() || !operation) return null;
  const trimmed = text.trim();
  const normalized = normalizeFinancialText(trimmed);
  const isTransfer = operation.operationType === 'transfer';
  const transactionType = isTransfer
    ? 'transfer'
    : (operation.operationType === 'income' || operation.operationType === 'expense')
      ? operation.operationType
      : null;

  const accountSwapMatch = trimmed.match(
    /n[ãa]o\s+(?:foi|era)\s+.+?,?\s*(?:e sim|foi|mas sim|na verdade foi)\s+(.+)$/i,
  );
  if (accountSwapMatch) {
    const account = matchAccountByName(accounts, accountSwapMatch[1]);
    if (account) {
      const targetsDestination = isTransfer && operation.destinationAccountResolution?.status !== 'resolved';
      return targetsDestination
        ? { destinationAccountId: account.id, destinationAccountName: account.name }
        : { accountId: account.id, accountName: account.name };
    }
  }

  const categoryMatch = trimmed.match(
    /(?:troca(?:r)?\s+(?:a\s+categoria\s+)?para|categoria\s+(?:certa|correta)?\s*(?:e|é)?\s*)\s*([^.!?]+)$/i,
  );
  if (categoryMatch) {
    const category = matchCategoryByName(categories, categoryMatch[1], transactionType);
    if (category) return { categoryId: category.id };
  }

  const dateWordMatch = normalized.match(/\b(hoje|ontem|anteontem|amanha)\b/);
  if (dateWordMatch) {
    const { resolvedDate } = resolveRelativeDateExpression(dateWordMatch[1], referenceDate);
    if (resolvedDate) return { date: resolvedDate };
  }

  const hasAmountCue = /\b(na verdade|de verdade|valor certo|foi de|foram)\b/i.test(trimmed);
  const amountValueMatch = trimmed.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i)
    ?? trimmed.match(/\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/i);
  if (hasAmountCue && amountValueMatch) {
    const amount = Number(String(amountValueMatch[1]).replace(',', '.'));
    if (Number.isFinite(amount) && amount > 0) return { amount };
  }

  if (operation.status === PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION) {
    if (isTransfer && operation.destinationAccountResolution?.status !== 'resolved') {
      const account = matchAccountByName(accounts, trimmed);
      if (account) return { destinationAccountId: account.id, destinationAccountName: account.name };
    }
    const issueField = operation.action?.issues?.[0]?.field;
    if (issueField === 'account') {
      const account = matchAccountByName(accounts, trimmed);
      if (account) return { accountId: account.id, accountName: account.name };
    }
    if (issueField === 'category') {
      const category = matchCategoryByName(categories, trimmed, transactionType);
      if (category) return { categoryId: category.id };
    }
    // BUG REAL: quando o valor de UMA operação ficou faltando (ex.: "Gastei
    // R$ 50 no mercado e a gasolina eu paguei pelo Banco do Brasil" -- a
    // Uni pergunta "qual foi o valor da gasolina?"), a resposta costuma vir
    // sem nenhuma das palavras de correção acima ("na verdade", "foram"...),
    // ex.: "a gasolina foi 200 reais" ou só "200 reais". Só se aplica
    // quando o problema da operação ATUAL é justamente o valor -- nunca
    // reaproveita/duplica o valor de outra operação do mesmo plano.
    if (issueField === 'amount') {
      const bareAmountMatch = trimmed.match(/r\$\s*(\d+(?:[.,]\d{1,2})?)/i)
        ?? trimmed.match(/\b(\d+(?:[.,]\d{1,2})?)\s*reais\b/i);
      if (bareAmountMatch) {
        const amount = Number(String(bareAmountMatch[1]).replace(',', '.'));
        if (Number.isFinite(amount) && amount > 0) return { amount };
      }
    }
  }

  return null;
}

// BLOCO F: cancelamento de UMA operação específica do plano por
// REFERÊNCIA SEMÂNTICA (a própria descrição da operação, ex.: "gasolina"),
// nunca por proximidade textual cega. Só age quando o texto claramente
// referencia exatamente UMA operação ativa -- referência ambígua (bate
// com nenhuma ou mais de uma) retorna null e cai no fluxo normal
// (cancelamento do plano inteiro, com a confirmação já existente).
const SINGLE_OPERATION_CANCEL_RE = /^(?:cancela(?:r)?|remove(?:r)?|tira(?:r)?|exclui(?:r)?)\s+(?:s[óo]\s+|somente\s+|apenas\s+)?(?:a\s+|o\s+|essa\s+|esse\s+|a\s+despesa\s+d[ao]\s+|a\s+opera[çc][ãa]o\s+d[ao]\s+)?(.+)$/i;

export function findPlanOperationCancelTarget(text, operations) {
  if (typeof text !== 'string' || !text.trim()) return null;
  if (!Array.isArray(operations) || !operations.length) return null;

  const match = text.match(SINGLE_OPERATION_CANCEL_RE);
  if (!match) return null;
  const target = normalizeFinancialText(match[1]);
  if (!target) return null;

  const found = operations.filter((op) => {
    const description = normalizeFinancialText(op.rawOperation?.description ?? '');
    if (!description) return false;
    return description === target || target.includes(description) || description.includes(target);
  });

  return found.length === 1 ? found[0] : null;
}
