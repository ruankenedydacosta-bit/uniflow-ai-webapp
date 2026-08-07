import { normalizeFinancialText, parseFinancialText } from '../uni-intents/index.js';
import { normalizeFinancialInstitutionName } from '../financial-institutions/index.js';

// BLOCO F: fala real do usuário raramente é um token isolado ("confirma")
// -- variações comuns como "sim, pode confirmar" ou "confirma isso aí"
// não batiam antes, caindo num fallback genérico (ou, no pior caso, no
// chat de texto livre, que corretamente se descreve como incapaz de
// executar ações -- nunca deveria ser alcançado com uma confirmação real
// pendente). Continua exigindo a frase INTEIRA bater com um destes
// padrões -- nunca um "includes" cego que arriscaria confirmar/cancelar a
// partir de texto ambíguo.
const CONFIRMATION_PATTERNS = [
  /^(?:sim|confirmar|confirmo|confirma|confirmado|certo|ok|isso|pode|pode usar|cria)[.!]?$/,
  /^(?:pode registrar|pode salvar|pode confirmar|pode continuar)[.!]?$/,
  /^sim,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
  /^confirma(?:r)?\s+isso(?:\s+a[íi])?[.!]?$/,
  /^t[áa]\s+certo,?\s*(?:pode\s+)?confirma(?:r)?[.!]?$/,
  // BUG REAL (BUG 2): "Pode sim, pode confirmar e registrar." era a resposta
  // natural do usuário à pergunta "Posso confirmar e registrar tudo isso?"
  // e não batia em nenhum padrão -- a confirmação caía no fallback
  // ("Não consigo criar, alterar ou excluir..."). Padrões sempre âncora
  // completa de frase, como os demais.
  /^pode\s+sim[.!]?$/,
  /^pode\s+sim,?\s*(?:pode\s+)?(?:confirmar|registrar)(?:\s+e\s+(?:confirmar|registrar))?[.!]?$/,
  /^(?:pode\s+)?(?:confirmar|registrar)\s+e\s+(?:confirmar|registrar)(?:\s+tudo\s+isso)?[.!]?$/,
  /^(?:sim,?\s*)?pode\s+registrar\s+(?:tudo|tudo\s+isso)[.!]?$/,
  /^sim,?\s*(?:pode\s+)?registrar[.!]?$/,
];
const CANCELLATION_PATTERNS = [
  /^(?:nao|cancelar|cancela|deixa|deixa pra la|esquece)[.!]?$/,
  /^(?:sim,?\s*)?cancela(?:r)?\s+tudo[.!]?$/,
  /^n[ãa]o,?\s*cancela(?:r)?[.!]?$/,
];

// HOTFIX FINAL P2: marcadores fortes de abandono que aparecem dentro de uma
// frase mais longa (nunca a frase inteira sozinha) -- "esquece isso, falei
// errado.", "cancela isso.", "não quero mais registrar isso." não batiam em
// CANCELLATION_PATTERNS (âncora de frase INTEIRA) e caíam como resposta ao
// campo pendente, arriscando propor uma conta/categoria com o texto
// inteiro. Diferente da lista acima, aqui o match é por CONTAINS -- mas a
// lista continua pequena e fechada a marcadores inequívocos de desistência
// (nunca uma palavra isolada que poderia ser parte legítima de uma
// conta/categoria/descrição real).
const CANCELLATION_CONTAINS_PATTERNS = [
  /falei errado/,
  /quis dizer errado/,
  /nao quero mais registrar/,
  /nao quero mais fazer isso/,
  /nao precisa mais registrar/,
  /esquece isso/,
  /deixa pra la isso/,
  /cancela isso/,
  /desconsidera isso/,
  /ignora isso/,
];

const ACCOUNT_IDENTITY_FIELDS = Object.freeze([
  'name',
  'institution_name',
  'institution',
  'nickname',
  'alias',
  'metadata.nickname',
  'metadata.alias',
]);

function readIdentityField(item, field) {
  return field.split('.').reduce((current, key) => current?.[key], item);
}

function belongsToWorkspace(item, workspaceId) {
  return !workspaceId || !item?.workspace_id || item.workspace_id === workspaceId;
}

function findMatches(items, input, fields = ['name'], workspaceId = null) {
  const normalizedInput = normalizeFinancialText(input);
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.is_active !== false)
    .filter((item) => belongsToWorkspace(item, workspaceId))
    .filter((item) => {
      const identities = fields
        .map((field) => normalizeFinancialText(readIdentityField(item, field)))
        .filter(Boolean);
      return identities.some((identity) => (
        identity === normalizedInput
        || normalizedInput.includes(identity)
        || identity.includes(normalizedInput)
      ));
    });
}

export function classifyPendingActionReply(value) {
  const normalized = normalizeFinancialText(value).replace(/[!?]+$/g, '');
  if (CONFIRMATION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'confirm';
  if (CANCELLATION_PATTERNS.some((pattern) => pattern.test(normalized))) return 'cancel';
  if (CANCELLATION_CONTAINS_PATTERNS.some((pattern) => pattern.test(normalized))) return 'cancel';
  return 'input';
}

export function resolvePendingActionInput({
  value,
  action,
  accounts = [],
  categories = [],
  workspaceId = null,
  referenceDate,
} = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || !action) return { kind: 'invalid', overrides: null };

  const firstIssue = action.issues?.[0]?.field ?? null;
  const normalized = normalizeFinancialText(text);
  const parsed = parseFinancialText(text, { referenceDate });
  const explicitField = /\b(?:valor|quantia)\b/.test(normalized) ? 'amount'
    : /\b(?:conta destino|destino)\b/.test(normalized) ? 'destinationAccount'
      : /\bconta\b/.test(normalized) ? 'account'
        : /\bcategoria\b/.test(normalized) ? 'category'
          : /\bdata\b/.test(normalized) ? 'date'
            : /\b(?:descricao|descrição|identificar)\b/.test(normalized) ? 'description'
              : null;
  const field = explicitField ?? firstIssue;
  const result = resolveForField(field, { text, parsed, accounts, categories, workspaceId });
  if (result.kind === 'correction') return result;

  // BUG REAL (contexto/correção perdidos): a Uni pergunta um campo (ex.:
  // "Em qual conta?") mas o usuário responde corrigindo OUTRO campo já
  // preenchido antes ("na verdade foram 55", "corrige para 80") -- sem
  // esta rede, o texto era testado só contra o campo pendente (conta),
  // nunca batia com nenhuma conta real, e virava "não encontrei essa
  // conta" ou uma proposta de criar uma conta chamada "na verdade foram
  // 55". Only kicks in quando a tentativa no campo pendente FALHOU e o
  // texto inteiro não é nada além de uma expressão de valor (nunca
  // reinterpreta uma resposta legítima de conta/categoria que só por
  // acaso contém um número). Preserva tudo que já foi confirmado antes
  // (mercado/despesa/etc.) -- só o valor muda; o campo que estava
  // realmente pendente (conta) continua pendente e volta a ser
  // perguntado no próximo turno (buildAction re-deriva os issues a
  // partir dos overrides acumulados).
  if (field !== 'amount' && looksLikePureAmountCorrection(text, parsed)) {
    const amountResult = resolveForField('amount', { text, parsed, accounts, categories, workspaceId });
    if (amountResult.kind === 'correction') return amountResult;
  }

  return result;
}

// Verdadeiro quando o texto inteiro é essencialmente "uma quantia e nada
// mais" (com marcadores de correção opcionais como "na verdade"/"corrige
// para"/"era"/"eram") -- nunca dispara para uma resposta de conta/categoria
// que só coincidentemente contém um número (ex.: "Conta 55" continua não
// batendo, porque "conta" sobra como conteúdo significativo após remover o
// valor e os marcadores).
const AMOUNT_CORRECTION_FILLER_WORDS = /\b(?:na verdade|de verdade|corrige|corrigir|corrigindo|corrigido|para|pra|foram|foi|era|eram|é|eh|na real|acho que|na verdade foram|na verdade era|R\$|reais?|rs)\b/g;

function looksLikePureAmountCorrection(text, parsed) {
  const amount = Number(parsed?.entities?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const normalized = normalizeFinancialText(text).replace(/[.,!?]+$/g, '');
  const withoutFillers = normalized.replace(AMOUNT_CORRECTION_FILLER_WORDS, ' ');
  const withoutNumbers = withoutFillers.replace(/[\d.,]+/g, ' ');
  const remainder = withoutNumbers.replace(/\s+/g, ' ').trim();
  return remainder.length === 0;
}

function resolveForField(field, { text, parsed, accounts, categories, workspaceId }) {
  if (field === 'amount') {
    const amount = Number(parsed.entities.amount);
    return Number.isFinite(amount) && amount > 0
      ? { kind: 'correction', overrides: { amount } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'account' || field === 'destinationAccount') {
    // BUG REAL: uma frase completa de lançamento respondida na pendência de
    // conta nunca é nome de conta. Duas formas de chegar aqui:
    // 1. enunciado autossuficiente ("Entrou mil reais.") -- o sendText já o
    //    abandona como fresh statement (looksLikeFreshFinancialStatement),
    //    e esta guarda é a defesa em profundidade para os pontos que não
    //    passam por lá;
    // 2. declaração com verbo e possessivo sem valor ("Entrou meu
    //    salário.") -- sem valor não é "fresh", mas também não é resposta
    //    de conta. Respostas reais de conta ("No Nubank", "Entrou no
    //    Nubank") nunca disparam esta guarda (não têm possessivo nem valor).
    const stripped = text.replace(/[.!?]+$/g, '').trim();
    const verbLedWithAmount = /^(?:entrou|caiu|entraram|cairam|recebi|ganhei|faturei|gastei|paguei|comprei)\b/i.test(stripped)
      && Number(parsed.entities.amount) > 0;
    const possessiveStatement = /^(?:entrou|caiu|entraram|cairam)\s+(?:meu|minha|meus|minhas)\b/i.test(stripped);
    if (verbLedWithAmount || possessiveStatement) {
      return { kind: 'invalid', overrides: null };
    }
    const availableAccounts = (Array.isArray(accounts) ? accounts : [])
      .filter((account) => account?.is_active !== false)
      .filter((account) => belongsToWorkspace(account, workspaceId));
    let matches = findMatches(accounts, text, ACCOUNT_IDENTITY_FIELDS, workspaceId);
    if (!matches.length) {
      // Camada de normalizacao de instituicoes financeiras (offline,
      // determinística): uma transcricao garbled como "foi no No Bank"
      // nao bate literalmente com a conta real "Nubank" -- tenta de novo
      // usando o nome canonico da instituicao antes de concluir que a
      // conta nao existe (nunca antes de tentar o texto original).
      const institutionMatch = normalizeFinancialInstitutionName(text, { hasAccountContext: true });
      if (institutionMatch.canonicalName) {
        matches = findMatches(accounts, institutionMatch.canonicalName, ACCOUNT_IDENTITY_FIELDS, workspaceId);
      }
    }
    if (matches.length > 1) {
      return { kind: 'ambiguous_account', accounts: matches, overrides: null };
    }
    if (!matches.length) {
      return { kind: 'account_not_found', accounts: availableAccounts, overrides: null };
    }
    const [account] = matches;
    return {
      kind: 'correction',
      overrides: field === 'destinationAccount'
        ? { destinationAccountId: account.id }
        : { accountId: account.id },
    };
  }

  if (field === 'category') {
    const availableCategories = (Array.isArray(categories) ? categories : [])
      .filter((category) => category?.is_active !== false);
    const [category] = findMatches(categories, text);
    if (category) {
      return { kind: 'correction', overrides: { categoryId: category.id } };
    }
    return { kind: 'category_not_found', categories: availableCategories, overrides: null };
  }

  if (field === 'date') {
    return parsed.entities.date
      ? { kind: 'correction', overrides: { date: parsed.entities.date } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'description') {
    const description = text
      .replace(/^(?:descricao|descrição|identificar)\s*(?:é|e|:)?\s*/i, '')
      .trim();
    return description.length >= 2
      ? { kind: 'correction', overrides: { description } }
      : { kind: 'invalid', overrides: null };
  }

  if (field === 'intent') {
    // Decisão após "Tenho R$ 1.000?" (ambiguous_balance_or_income): a
    // resposta é a INTENÇÃO, nunca um campo da transação. Frase inteira
    // batendo com um dos dois lados; qualquer outra resposta mantém a
    // pendência (buildClarificationResponse re-explica a pergunta).
    // BUG REAL: só "receita"/"saldo"/"ajustar saldo" resolviam a
    // ambiguidade -- respostas naturais ("coloca no saldo", "foi uma
    // receita", "dinheiro recebido", "saldo atual") caíam em 'invalid' e a
    // Uni re-perguntava para sempre. Padrões novos são âncora COMPLETA de
    // frase (nunca um "includes" que arriscaria classificar um nome de
    // conta como intenção).
    const stripped = text.replace(/[.!?]+$/g, '').trim();
    if (/^(?:registrar\s+)?(?:como\s+)?receita$/i.test(stripped)
      || /^(?:registrar\s+)?(?:como\s+)?entrada$/i.test(stripped)
      || /^(?:é|e)\s+receita$/i.test(stripped)
      || /^income$/i.test(stripped)
      || /^(?:coloca|colocar|bota|botar|registra|registrar|lan[cç]a|lancar|anota|anotar)\s+como\s+(?:uma\s+)?(?:receita|entrada)$/i.test(stripped)
      || /^(?:foi|era)\s+(?:uma\s+)?receita$/i.test(stripped)
      || /^(?:dinheiro|valor|quantia)\s+recebid[oa]$/i.test(stripped)) {
      return { kind: 'correction', overrides: { intentDecision: 'register_income' } };
    }
    if (/^(?:ajustar\s+)?(?:o\s+)?saldo$/i.test(stripped)
      || /^(?:é|e)\s+saldo$/i.test(stripped)
      || /^saldo\s+m[êe]smo$/i.test(stripped)
      || /^balance$/i.test(stripped)
      || /^(?:no|o)\s+saldo$/i.test(stripped)
      || /^(?:quero\s+)?(?:ajustar|corrigir|atualizar)\s+(?:o\s+)?saldo$/i.test(stripped)
      || /^(?:coloca|colocar|bota|botar|deixa|deixar|define|definir)\s+(?:no|como|pra|para)\s+(?:o\s+)?saldo$/i.test(stripped)
      || /^como\s+saldo$/i.test(stripped)
      || /^saldo\s+atual$/i.test(stripped)) {
      return { kind: 'correction', overrides: { intentDecision: 'set_balance' } };
    }
    return { kind: 'invalid', overrides: null };
  }

  return { kind: 'invalid', overrides: null };
}
