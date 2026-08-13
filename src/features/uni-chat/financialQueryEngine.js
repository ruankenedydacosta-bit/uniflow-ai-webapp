// Motor de consultas financeiras inteligentes da Uni.
//
// Substitui respostas genéricas ("Não consigo confirmar a conta...") por
// respostas baseadas SEMPRE em dados estruturados do FinancialSnapshot
// (financialSnapshot.js) — nunca em achismo do LLM.
//
// Hierarquia de confiança (Fase 6):
//   1. Dados estruturados do banco (snapshot)
//   2. Contexto da conversa (mensagens recentes do usuário)
//   3. Inferência (correspondência por descrição/valor/data/categoria/conta)
//   4. Pergunta ao usuário (ambiguidade — nunca escolher aleatoriamente)
//
// Ordem de resolução (Fase 4):
//   1. Contexto da conversa  2. Descrição  3. Valor  4. Data  5. Categoria  6. Conta
//
// Regra de ouro: mais de uma correspondência → pergunta; nenhuma → diz que
// não encontrou; conta/categoria removida → nunca inventa nome.

import { extractAmount } from '../uni-intents/entityExtractor.js';
import { resolveRelativeDateExpression } from '../uni-intents/relativeDateResolver.js';
import { resolveTemporalRange } from '../uni-intents/temporalRangeResolver.js';
import { normalizeFinancialText, roundMoney } from './financialSnapshot.js';
import {
  buildPublicMovementSummaryResponse,
  isPublicFinancialSummaryRequest,
  isRetiredPublicBalanceRequest,
} from './publicBalanceExperience.js';

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const REMOVED_ACCOUNT_PHRASE = 'Essa movimentação pertence a uma conta que não está mais disponível.';
const REMOVED_CATEGORY_PHRASE = 'A categoria dessa movimentação não está mais disponível.';

const GENERIC_ACCOUNT_PHRASES = new Set([
  'conta', 'banco', 'cartao', 'carteira', 'minha conta', 'meu banco',
  'minhas contas', 'minha', 'minhas', 'nossa', 'nossas', 'nossa conta',
  'nossas contas', 'essa conta', 'essas contas', 'essa', 'essas',
  // BUG REAL (Sprint 2.1, BUG 3): "nessa conta"/"naquela conta" (sem
  // memória para resolver) nunca podem virar tentativa de nome de conta
  // literal -- mesma lógica de "essa conta" acima.
  'nessa conta', 'nessas contas', 'nessa', 'nessas',
  'aquela conta', 'aquelas contas', 'aquela', 'aquelas',
  'naquela conta', 'naquelas contas', 'naquela', 'naquelas',
]);
const MONTH_PHRASES = new Set(MONTH_NAMES.map((name) => normalizeFinancialText(name)));

// Palavras que nunca podem virar critério de descrição (scaffolding de
// perguntas, verbos, conectivos, substantivos genéricos e numerais).
const GENERIC_WORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'com', 'por', 'para', 'pra', 'pro', 'que', 'qual',
  'quais', 'quanto', 'quantos', 'quantas', 'quando', 'como', 'onde', 'foi', 'era',
  'foram', 'estava', 'esta', 'estao', 'ficou', 'ficaram', 'usei', 'usou', 'usava',
  'paguei', 'pagou', 'paga', 'pagar', 'pago', 'tenho', 'tem', 'ha', 'tinha', 'havia',
  'gastei', 'gastou', 'gastava', 'gastos', 'gasto', 'despesa', 'despesas', 'compra',
  'compras', 'conta', 'contas', 'banco', 'bancos', 'cartao', 'carteira', 'cartoes',
  'transacao', 'transacoes', 'movimentacao', 'movimentacoes', 'lancamento',
  'lancamentos', 'operacao', 'operacoes', 'pagamento', 'pagamentos', 'pix',
  'transferencia', 'transferencias', 'valor', 'valores', 'reais', 'real', 'coisa',
  'coisas', 'entrada', 'entradas', 'receita', 'receitas', 'saldo', 'mes', 'meses',
  'dia', 'dias', 'hoje', 'ontem', 'amanha', 'anteontem', 'agora', 'aquilo',
  'esse', 'essa', 'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas',
  // BUG REAL (Sprint 2.1, BUG 3): "nesse"/"nessa" (contração de "em
  // esse"/"em essa", ex.: "nesse mês", "só nessa conta") nunca constavam
  // aqui -- sobravam como "keyword" de descrição e viravam um nome de
  // busca literal ("Não encontrei gastos com Nesse.").
  'nesse', 'nessa', 'nesses', 'nessas', 'naquele', 'naquela', 'naqueles', 'naquelas',
  'este', 'estes', 'estas', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua',
  'ver', 'mostrar', 'mostra', 've', 'veja', 'favor', 'saber', 'sabe', 'dizer',
  'fiz', 'faz', 'fazer', 'saiu', 'sairam', 'entrou', 'entraram',
  'caiu', 'custou', 'valeu', 'nao', 'sim', 'ai', 'la', 'aqui',
  'so', 'só', 'mais', 'menos', 'outro', 'outra', 'outros', 'outras',
  'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'catorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta', 'quarenta', 'cinquenta',
  'sessenta', 'setenta', 'oitenta', 'noventa', 'cem', 'cento', 'mil', 'milhao',
  'milhoes',
  // Fase 1 (correção de roteamento, Sprint 4): "total"/"todas as contas"
  // -- resposta comum a uma clarificação pendente ("De qual conta você
  // quer ver o saldo?" -> "O total, de todas as contas.") -- sobravam
  // como "keyword" de descrição e viravam busca literal de transação
  // ("Não encontrei nenhuma movimentação com 'Total'."), quando a frase
  // não tinha NENHUMA intenção de buscar uma transação por nome. Mesmo
  // padrão de bug já corrigido para "nesse/nessa" (Sprint 2.1, BUG 3)
  // logo acima.
  'total', 'totais', 'todo', 'toda', 'todos', 'todas',
  // Fase 1 (correção de roteamento, Sprint 4): pronomes/verbos de fala
  // coloquial ("Me diz quanto eu já gastei", "Me fala aí quanto sobrou",
  // "Pode me dizer quanto eu tenho") sobravam como keyword de descrição
  // (ex.: "me" virava o termo de busca) e disparavam falsos positivos de
  // ambiguidade de categoria/conta contra nomes reais que não têm nenhuma
  // relação com a frase. Mesmo padrão de bug do "total"/"nesse" acima.
  'me', 'te', 'lhe', 'diz', 'diga', 'disse', 'fala', 'fale', 'falar',
  'pode', 'podia', 'poderia', 'consegue', 'consegui',
]);

// "cinquentão" = radical "cinquent" + sufixo "ão" (o "a" final é substituído).
const SLANG_AO_STEMS = {
  vint: 20, trint: 30, quarent: 40, cinquent: 50,
  sessent: 60, setent: 70, oitent: 80, novent: 90, cent: 100,
};

const AMOUNT_TOKEN_PATTERN = /\b(?:r\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?(?:\s*(?:reais|real|pila|pilas|pau|paus|conto|contos|mil|k))?\b/gu;// ─────────────────────────────────────────────────────────────────────────────
// Extração de entidades com linguagem coloquial brasileira (Fase 5)
// ─────────────────────────────────────────────────────────────────────────────

export function extractQueryAmount(text) {
  if (typeof text !== 'string') return null;
  const normalized = normalizeFinancialText(text);

  // Gírias com número explícito têm prioridade sobre o número puro, para que
  // "2 contos" signifique 2.000 e não 2.
  const slangCurrency = normalized.match(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(pila|pilas|pau|paus|conto|contos)\b/);
  if (slangCurrency) {
    const value = Number(slangCurrency[1].replace(',', '.'));
    if (Number.isFinite(value) && value > 0) {
      return roundMoney(value * (slangCurrency[2].startsWith('conto') ? 1000 : 1));
    }
  }

  const explicit = extractAmount(text);
  if (explicit != null) return explicit;

  const suffixAo = normalized.match(/\b(vint|trint|quarent|cinquent|sessent|setent|oitent|novent|cent)ao\b/);
  if (suffixAo) {
    const value = SLANG_AO_STEMS[suffixAo[1]];
    if (value != null) return value;
  }

  return null;
}

export function extractQueryDate(text, referenceDate = null) {
  if (typeof text !== 'string') return null;
  return resolveRelativeDateExpression(text, referenceDate)?.resolvedDate ?? null;
}

// Fragmentos de frase que precisam ser removidos antes de extrair a
// descrição ("em qual conta foi...", "quanto gastei...", "aquele gasto...").
const SCAFFOLDING_PATTERNS = [
  /\b(?:em|para|pra|pro)\s+qual\s+(?:conta|banco|cartao|carteira)\s+foi\b/,
  /\b(?:em|para|pra|pro)\s+qual\s+(?:conta|banco|cartao|carteira)\s+era\b/,
  /\bqual\s+(?:conta|banco|cartao|carteira)\s+(?:usei|usou)\b/,
  /\b(?:quanto|qual|quais|quando|como|onde)\b[^.!?]*?\bfoi\b/,
  /\b(?:quanto|qual|quais|quando|como|onde)\b[^.!?]*?\btenho\b/,
  /\b(?:quanto|qual|quais|quando|como|onde)\b[^.!?]*?\bgastei\b/,
  /\b(?:quanto|qual|quais|quando|como|onde)\b[^.!?]*?\bgastou\b/,
  /\bmeus?\s+gastos?\s+com\b/,
  /\b(?:foi|era|esta|ficou)\s+(?:no|na|em|pelo|pela)\b/,
  /\b(?:aquele|aquela|aqueles|aquelas|esse|essa|esses|essas)\s+(?:gasto|gastos|despesa|despesas|compra|compras|transacao|movimentacao|lancamento|pagamento|pix|valor)\b/,
];

export function extractDescriptionKeywords(text) {
  if (typeof text !== 'string') return [];
  const normalized = normalizeFinancialText(text);

  let cleaned = normalized
    .replace(AMOUNT_TOKEN_PATTERN, ' ')
    .replace(/\b(?:vint|trint|quarent|cinquent|sessent|setent|oitent|novent|cent)ao\b/g, ' ')
    .replace(/\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g, ' ');

  for (const pattern of SCAFFOLDING_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }
  cleaned = cleaned
    .replace(/^\s*(?:em|na|no|com|de|para|pra|pro|pelo|pela)\s+/u, '')
    .replace(/[!?.,;:]+$/g, '');

  const keywords = [];
  for (const token of cleaned.split(/\s+/)) {
    const bare = token.replace(/[.,;:!?()"']/g, '');
    if (!bare || bare.length < 2) continue;
    if (GENERIC_WORDS.has(bare)) continue;
    keywords.push(bare);
  }
  return keywords;
}

export function extractAccountReference(text) {
  if (typeof text !== 'string') return null;
  const normalized = normalizeFinancialText(text);

  const match = normalized.match(/\b(?:no|na|em|nos|nas|pelo|pela|do|da|pro|pra|para)\s+([\p{L}][\p{L}\d._ -]{1,40})[.,;:!?]*$/u);
  if (!match) return null;

  let phrase = match[1].trim().replace(/[.,;:!?]+$/g, '');
  phrase = phrase.replace(/\s+(?:hoje|ontem|amanha|anteontem|agora|entao|favor|pfv)$/u, '');

  const normalizedPhrase = normalizeFinancialText(phrase);
  if (!normalizedPhrase || GENERIC_ACCOUNT_PHRASES.has(normalizedPhrase)) return null;
  if (MONTH_PHRASES.has(normalizedPhrase)) return null;
  return normalizedPhrase;
}

function stripLeadingGenericAccountTokens(phrase) {
  return phrase
    .replace(/^(?:conta|banco|cartao|carteira)\s+(?:do|da|de)\s+/u, '')
    .replace(/^(?:conta|banco|cartao|carteira)\s+/u, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução de contas e categorias por nome (account_id / category_id)
// ─────────────────────────────────────────────────────────────────────────────

// BUG 3 (Sprint 4, Bloco 4.0): candidatos de ambiguidade devem refletir
// apenas contas/categorias REALMENTE ativas -- mesma regra já aplicada em
// accountResolution.js (activeMatches/archivedMatches) e em
// pendingActionInput.js (filter(item => item?.is_active !== false)).
// Sem esse filtro, uma conta arquivada com o mesmo nome de uma conta ativa
// (ex.: "Nubank" arquivada + "Nubank" ativa) entrava como candidato
// distinto e inflava "Encontrei N contas correspondentes" com uma entrada
// que o usuário nem vê em "Minhas contas". A dedupe por account.id (via
// exactIds/Set) já existia e continua correta -- o bug era a AUSÊNCIA do
// filtro de status antes dela, não a dedupe em si.
function filterActive(records) {
  return records.filter((record) => record?.is_active !== false);
}

export function findAccountsByPhrase(snapshot, phrase) {
  const accounts = filterActive([...snapshot.accountsById.values()]);
  const normalized = normalizeFinancialText(phrase);
  if (!normalized) return { matches: [], ambiguous: false };

  const stripped = stripLeadingGenericAccountTokens(normalized);
  const containsPhrase = stripped || normalized;

  const exact = accounts.filter((account) => {
    const name = normalizeFinancialText(account.name);
    return name === normalized || name === stripped;
  });
  const exactIds = new Set(exact.map((account) => account.id));
  const contains = accounts.filter((account) => {
    const name = normalizeFinancialText(account.name);
    return name && !exactIds.has(account.id) && name.includes(containsPhrase);
  });
  const matches = [...exact, ...contains];
  return { matches, ambiguous: matches.length > 1 };
}

export function findCategoriesByPhrase(snapshot, phrase) {
  const categories = filterActive([...snapshot.categoriesById.values()]);
  const normalized = normalizeFinancialText(phrase);
  if (!normalized) return { matches: [], ambiguous: false };

  const exact = categories.filter((category) => normalizeFinancialText(category.name) === normalized);
  const exactIds = new Set(exact.map((category) => category.id));
  const contains = categories.filter((category) => {
    const name = normalizeFinancialText(category.name);
    return name && !exactIds.has(category.id) && name.includes(normalized);
  });
  const matches = [...exact, ...contains];
  return { matches, ambiguous: matches.length > 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatação de resposta (Fase 8: falar o mínimo necessário)
// ─────────────────────────────────────────────────────────────────────────────

function fmtCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(roundMoney(value));
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '';
  const [, month, day] = String(dateStr).split('-');
  return `${day}/${month}`;
}

function fmtLongDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = String(dateStr).split('-');
  return `${day}/${month}/${year}`;
}

function capitalize(word) {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function monthNameOf(monthPrefix) {
  const monthIndex = Number(String(monthPrefix || '').slice(5, 7) || String(monthPrefix || '').slice(0, 2));
  if (!Number.isFinite(monthIndex) || monthIndex < 1 || monthIndex > 12) return null;
  return MONTH_NAMES[monthIndex - 1];
}

export function resolveTransactionLabels(tx, snapshot) {
  const account = tx?.account_id ? snapshot.accountsById.get(tx.account_id) : null;
  const category = tx?.category_id ? snapshot.categoriesById.get(tx.category_id) : null;
  return {
    accountName: account?.name ?? null,
    categoryName: category?.name ?? null,
    accountRemoved: Boolean(tx?.account_id && !account),
    categoryRemoved: Boolean(tx?.category_id && !category),
  };
}

function buildTransactionDetails(tx, snapshot) {
  const { accountName, categoryName, accountRemoved, categoryRemoved } = resolveTransactionLabels(tx, snapshot);

  const parts = [];
  if (accountName) parts.push(`na conta ${accountName}`);
  if (categoryName) parts.push(`em ${categoryName}`);
  if (roundMoney(tx.amount) > 0) parts.push(`no valor de ${fmtCurrency(tx.amount)}`);

  const suffix = [];
  if (accountRemoved) suffix.push(REMOVED_ACCOUNT_PHRASE);
  if (categoryRemoved) suffix.push(REMOVED_CATEGORY_PHRASE);

  if (suffix.length) {
    return `${suffix.join(' ')}${parts.length ? ` Foi ${parts.join(', ')}.` : ''}`;
  }
  return parts.length ? `Foi ${parts.join(', ')}.` : 'Foi uma movimentação registrada.';
}

function buildLastMovementAnswer(tx, snapshot, kindLabel) {
  const { accountName, categoryName, accountRemoved, categoryRemoved } = resolveTransactionLabels(tx, snapshot);
  const description = tx.description
    || categoryName
    || (tx.transaction_type === 'income' ? 'entrada' : 'saída');
  const amount = roundMoney(tx.amount) > 0 ? `de ${fmtCurrency(tx.amount)}` : '';
  const date = tx.transaction_date ? `em ${fmtLongDate(tx.transaction_date)}` : '';
  const account = accountName ? `na conta ${accountName}` : '';

  let text = `Sua última ${kindLabel} foi ${description}, ${[amount, account, date].filter(Boolean).join(', ')}.`;
  if (accountRemoved) text += ` ${REMOVED_ACCOUNT_PHRASE}`;
  if (categoryRemoved) text += ` ${REMOVED_CATEGORY_PHRASE}`;
  return text;
}

function buildAmbiguityQuestion(label, transactions, snapshot) {
  const lines = transactions.slice(0, 5).map((tx) => {
    const { accountName, categoryName, accountRemoved } = resolveTransactionLabels(tx, snapshot);
    const accountLabel = accountRemoved ? 'Conta não disponível' : (accountName || 'Conta não identificada');
    const title = tx.description || categoryName || fmtCurrency(tx.amount);
    return `• ${accountLabel} — ${title}`;
  });
  return `${label}\n\n${lines.join('\n')}\n\nQual deles você quis dizer?`;
}

function condenseForSimpleStyle(text) {
  if (typeof text !== 'string' || !text.includes('\n')) return text;
  const blocks = text.split('\n\n').filter((block) => !block.trim().startsWith('⚠️'));
  const collapsed = blocks.map((block) => {
    const lines = block.split('\n');
    if (lines.length < 2) return block;
    const [head, ...rest] = lines;
    const bulletItems = rest.filter((line) => line.trim().startsWith('•'));
    if (bulletItems.length !== rest.length || bulletItems.length === 0) return block;
    const joined = bulletItems.map((line) => line.trim().replace(/^•\s*/, '')).join('; ');
    return `${head} ${joined}`;
  });
  return collapsed.join(' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação da consulta (Fase 3) — padrões de linguagem natural brasileira
// ─────────────────────────────────────────────────────────────────────────────

// REGRA GERAL DE PRIORIDADE: DECLARAÇÕES financeiras nunca são consultas.
// Frases que começam com um verbo declarativo de lançamento/posse ("Recebi
// mil reais", "Tenho mil reais", "Entrou mil reais", "Paguei mil reais" etc.)
// ou com uma declaração de saldo ("Meu saldo no Nubank é mil reais") iniciam
// uma AÇÃO (registro/ajuste de saldo), mesmo contendo valor e conta. Sem
// esta guarda, o ramo "palavra solta" abaixo classificava essas declarações
// como transaction_reference (e o interpretador legado as engolia como
// consulta de saldo), e o fluxo de registro nunca chegava a rodar.
const DECLARATIVE_STATEMENT_START =
  /^(?:eu\s+)?(?:tenho|estou\s+com|to\s+com|recebi|ganhei|faturei|entrou|caiu|paguei|gastei|comprei|abasteci|coloquei|botei|custou|saiu|foi|transferi|mandei|enviei)\b/u;
const BALANCE_STATEMENT_START =
  /^(?:meu|o|nosso)\s+saldo\b/u;

export function classifyQueryType(text) {
  const n = normalizeFinancialText(text);
  if (!n) return null;

  // Declaração com valor monetário (algarismo ou por extenso) → não é
  // consulta, nunca. A guarda é ancorada no início da frase, então
  // perguntas reais ("a última que entrou...", "quanto recebi...") passam.
  if (extractQueryAmount(text) != null) {
    if (DECLARATIVE_STATEMENT_START.test(n) || BALANCE_STATEMENT_START.test(n)) return null;
  }

  if (isRetiredPublicBalanceRequest(text)) return 'account_balance';
  if (isPublicFinancialSummaryRequest(text)) return 'public_financial_summary';

  if (/\bultim[oa]\s+(?:receita|entrada|recebimento)\b/.test(n)) return 'last_income';
  if (/\bultim[oa]\s+valor\b/.test(n) && /\breceb\b/.test(n)) return 'last_income';
  if (/\bultim[oa]\b/.test(n) && /\bentrou\b/.test(n)) return 'last_income';

  if (/\bultim[oa]\s+(?:despesa|gasto|compra|pagamento)\b/.test(n)) return 'last_expense';
  if (/\bultim[oa]\s+valor\b/.test(n) && /\b(?:gastei|paguei|comprei)\b/.test(n)) return 'last_expense';
  if (/\bultim[oa]\b/.test(n) && /\b(?:gastei|paguei|comprei|abasteci|coloquei|botei)\b/.test(n)) return 'last_expense';

  if (/\bultim[oa]\s+(?:movimentacao|movimentacoes|transacao|transacoes|lancamento|lancamentos|operacao|operacoes)\b/.test(n)) return 'last_transaction';
  if (/\b(?:a|minha)\s+ultim[oa]\b/.test(n) && /\b(?:fiz|foi|registrad[oa]|que\s+eu\s+fiz)\b/.test(n)) return 'last_transaction';

  if (
    (/\b(?:em\s+)?(?:qual|que)\s+(?:conta|banco|cartao|carteira)\b/.test(n)
      && /\b(?:foi|era|esta|usei|usou|paguei|pagou|entrou|saiu|ficou)\b/.test(n))
    || (/\b(?:onde|em\s+que|em\s+qual)\b/.test(n)
      && /\b(?:foi|era|usei|usou|paguei|pagou)\b/.test(n)
      && !/\b(?:saldo|gastei|gastou|entrou|saiu)\b/.test(n))
    || /\bfoi\s+(?:no|na|em|pelo|pela)\s+(?:cartao|conta|banco)\b/.test(n)
  ) {
    return 'transaction_account';
  }

  if (
    /\bquanto\s+(?:tenho|tem|ha|ta|esta)\s+(?:na|no|em|nos|nas|nessa|nesta|nesse|neste|naquela|naquele)\b/.test(n)
    || /\bsaldo\s+(?:da|do)\b/.test(n)
  ) {
    return 'account_balance';
  }

  if (
    /\bquanto\s+(?:eu\s+)?(?:ja\s+)?gastei\b/.test(n)
    || /\bquanto\s+(?:gastou|gastamos|gastava)\s+(?:com|em|de|na|no|nas|nos)\b/.test(n)
    || /\bquanto\s+(?:foi|custou|custava|saiu)\s+(?:de|com|em|na|no|nas|nos)\b/.test(n)
    || /\bmeus\s+gastos?\s+com\b/.test(n)
    || /\b(?:mostra|mostrar|mostre|lista|listar|liste)\b[^.!?]*\b(?:gastos?|despesas?)\b/.test(n)
  ) {
    return 'category_expenses';
  }

  if (
    (
      /^(?:o|a|os|as|esse|essa|esses|essas|aquele|aquela|aqueles|aquelas|outro|outra)\b/.test(n)
      || /\b(?:aquele|aquela|aqueles|aquelas|esse|essa|esses|essas)\s+(?:gasto|despesa|compra|transacao|movimentacao|coisa|valor)\b/.test(n)
      || /\b(?:o|a)\s+de\s+(?:hoje|ontem|amanha|anteontem)\b/.test(n)
    )
    // Fase 1 (correção de roteamento, Sprint 4): um determinante sozinho
    // ("O saldo total.", "O total, de todas as contas.") nunca basta --
    // precisa sobrar ALGUM critério real (palavra de descrição, valor,
    // data ou conta) depois de remover as palavras genéricas, senão a
    // frase não é uma referência a transação nenhuma, é só uma resposta
    // de clarificação mal reconhecida. Mesmo critério já usado no fallback
    // de palavra solta logo abaixo -- nunca duplicado, só aplicado cedo o
    // suficiente para não classificar essas frases incorretamente.
    && (
      extractDescriptionKeywords(text).length > 0
      || extractQueryAmount(text) != null
      || extractQueryDate(text) != null
      || extractAccountReference(text) != null
    )
  ) {
    return 'transaction_reference';
  }

  // Referência vaga é reconhecida antes de qualquer filtro genérico.
  if (isVagueTransactionReference(text)) return 'transaction_reference';

  // Palavra solta como resposta à pergunta de desambiguação ("mercado",
  // "nubank", "o ifood") — só quando carrega um critério real e não parece
  // pergunta ou ação de registro.
  if (/^[\p{L}\d][\p{L}\d ._-]{0,25}$/u.test(n.replace(/[!?.,;:]+$/g, ''))) {
    const questionStart = /^(?:qual|quais|quanto|quantos|quantas|quando|onde|como|que|quem|por\s+que|o\s+que|para\s+que)\b/u;
    const actionStart = /^(?:registrar|registrei|registra|anotar|anotei|planejar|planejei|quero|preciso|vou|criar|criei|adicionar|adicionei|enviar|transferir|pagar|comprar)\b/u;
    if (questionStart.test(n) || actionStart.test(n)) return null;

    const startsWithDeterminer = /^(?:o|a|os|as|no|na|nos|nas|em|esse|essa|esses|essas|aquele|aquela|aqueles|aquelas)\b/u.test(n);
    const hasStrongCriterion = extractQueryAmount(text) != null
      || extractQueryDate(text) != null
      || extractAccountReference(text) != null;
    const keywordCount = extractDescriptionKeywords(text).length;
    if (hasStrongCriterion || keywordCount === 1 || (startsWithDeterminer && keywordCount > 0)) {
      return 'transaction_reference';
    }
  }

  return null;
}

function isVagueTransactionReference(text) {
  const n = normalizeFinancialText(text);
  return ['aquilo', 'isso', 'aquilo aí', 'isso aí'].includes(n);
}

function extractCategoryPhrase(text) {
  const n = normalizeFinancialText(text);
  const match = n.match(/\b(?:com|em|de|na|no|nas|nos|pra|pro|para)\s+([\p{L}][\p{L}\d._ -]{1,40})[.,;:!?]*$/u);
  if (!match) return null;
  return match[1].trim()
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+(?:esse|este|nesse|nessa|neste|nesta|no|na|em)\s+(?:mes|dia|ano)$/u, '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução de transações
// ─────────────────────────────────────────────────────────────────────────────

function applyFilter(tx, filter, snapshot) {
  switch (filter.kind) {
    case 'amount':
      return Math.abs(roundMoney(tx.amount) - filter.value) < 0.005;
    case 'date':
      return tx.transaction_date === filter.value;
    case 'category':
      return tx.category_id === filter.value;
    case 'account':
      return tx.account_id === filter.value;
    case 'description': {
      const categoryName = tx.category_id
        ? snapshot.categoriesById.get(tx.category_id)?.name ?? ''
        : '';
      const haystack = normalizeFinancialText(`${tx.description || ''} ${categoryName}`);
      return filter.keywords.every((keyword) => haystack.includes(keyword));
    }
    default:
      return true;
  }
}

function rankByDescription(txs, keywords, snapshot) {
  const scored = txs.map((tx) => {
    const categoryName = tx.category_id
      ? snapshot.categoriesById.get(tx.category_id)?.name ?? ''
      : '';
    const haystack = normalizeFinancialText(`${tx.description || ''} ${categoryName}`);
    const score = keywords.reduce((sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0), 0);
    return { tx, score };
  });
  const best = Math.max(0, ...scored.map((entry) => entry.score));
  return scored.filter((entry) => entry.score > 0 && entry.score === best).map((entry) => entry.tx);
}

function buildFilters(criteria) {
  const filters = [];
  if (criteria.amount != null) filters.push({ kind: 'amount', value: criteria.amount });
  if (criteria.date) filters.push({ kind: 'date', value: criteria.date });
  if (criteria.categoryId) filters.push({ kind: 'category', value: criteria.categoryId });
  if (criteria.accountId) filters.push({ kind: 'account', value: criteria.accountId });
  if (criteria.descriptionKeywords?.length) {
    filters.push({ kind: 'description', keywords: criteria.descriptionKeywords });
  }
  return filters;
}

function findCandidateTransactions(snapshot, criteria) {
  const all = snapshot.transactions;
  if (!all.length) return { candidates: [], reason: 'no_data' };

  // 1) Interseção de todos os critérios concretos da pergunta.
  const filters = buildFilters(criteria);
  if (filters.length) {
    let combined = all.filter((tx) => filters.every((filter) => applyFilter(tx, filter, snapshot)));
    if (combined.length) {
      const descriptionFilters = filters.filter((filter) => filter.kind === 'description');
      if (descriptionFilters.length) {
        combined = rankByDescription(combined, descriptionFilters[0].keywords, snapshot);
      }
      return { candidates: combined, reason: 'combined' };
    }
  }

  // 2) Critério individual na ordem da Fase 4:
  //    descrição → valor → data → categoria → conta.
  const priority = [
    () => (criteria.descriptionKeywords?.length
      ? rankByDescription(all, criteria.descriptionKeywords, snapshot)
      : []),
    () => (criteria.amount != null
      ? all.filter((tx) => applyFilter(tx, { kind: 'amount', value: criteria.amount }, snapshot))
      : []),
    () => (criteria.date
      ? all.filter((tx) => applyFilter(tx, { kind: 'date', value: criteria.date }, snapshot))
      : []),
    () => (criteria.categoryId
      ? all.filter((tx) => applyFilter(tx, { kind: 'category', value: criteria.categoryId }, snapshot))
      : []),
    () => (criteria.accountId
      ? all.filter((tx) => applyFilter(tx, { kind: 'account', value: criteria.accountId }, snapshot))
      : []),
  ];

  for (const build of priority) {
    const candidates = build();
    if (candidates.length) return { candidates, reason: 'priority' };
  }

  return { candidates: [], reason: 'none' };
}

function dominantTypeLabel(transactions) {
  const types = new Set(transactions.map((tx) => tx.transaction_type));
  if (types.size === 1 && types.has('income')) return 'entradas';
  if (types.size === 1 && types.has('expense')) return 'saídas';
  return 'movimentações';
}

function buildCriteriaLabel(criteria, transactions) {
  const noun = dominantTypeLabel(transactions);
  if (criteria.amount != null) return `Encontrei ${transactions.length} ${noun} de ${fmtCurrency(criteria.amount)}.`;
  if (criteria.descriptionKeywords?.length) {
    return `Encontrei ${transactions.length} ${noun} com "${capitalize(criteria.descriptionKeywords.join(' '))}".`;
  }
  if (criteria.date) return `Encontrei ${transactions.length} ${noun} em ${fmtShortDate(criteria.date)}.`;
  return `Encontrei ${transactions.length} ${noun} correspondentes.`;
}

function buildNotFoundText(criteria) {
  if (criteria.amount != null) return `Não encontrei nenhuma movimentação de ${fmtCurrency(criteria.amount)} nos seus registros.`;
  if (criteria.descriptionKeywords?.length) {
    return `Não encontrei nenhuma movimentação com "${capitalize(criteria.descriptionKeywords.join(' '))}".`;
  }
  if (criteria.date) return `Não encontrei movimentações em ${fmtShortDate(criteria.date)}.`;
  return 'Não encontrei uma movimentação com essas informações nos seus registros recentes.';
}

function buildContextCriteria(contextHint) {
  return {
    amount: contextHint?.amount ?? null,
    date: contextHint?.date ?? null,
    descriptionKeywords: contextHint?.descriptionKeywords ?? [],
    categoryId: null,
    accountId: null,
    accountPhrase: contextHint?.accountPhrase ?? null,
  };
}

function resolveTransactionQuery({ text, snapshot, criteria, contextHint }) {
  if (!snapshot.transactions.length) {
    return {
      handled: true,
      response: {
        text: 'Você ainda não tem movimentações registradas.',
        highlight: null,
      },
    };
  }

  // Conta ambígua no enunciado: se os demais critérios não resolverem,
  // perguntamos — nunca escolhemos uma aleatoriamente.
  const accountResolution = criteria.accountPhrase
    ? findAccountsByPhrase(snapshot, criteria.accountPhrase)
    : { matches: [], ambiguous: false };
  const effectiveCriteria = {
    ...criteria,
    accountId: accountResolution.ambiguous
      ? null
      : (accountResolution.matches[0]?.id ?? null),
  };

  const { candidates } = findCandidateTransactions(snapshot, effectiveCriteria);

  if (candidates.length === 1) {
    const tx = candidates[0];
    return {
      handled: true,
      response: {
        text: buildTransactionDetails(tx, snapshot),
        highlight: roundMoney(tx.amount) > 0 ? fmtCurrency(tx.amount) : null,
      },
    };
  }

  if (candidates.length > 1) {
    return {
      handled: true,
      response: {
        text: buildAmbiguityQuestion(buildCriteriaLabel(effectiveCriteria, candidates), candidates, snapshot),
        highlight: null,
      },
    };
  }

  if (accountResolution.ambiguous) {
    const names = accountResolution.matches.map((account) => account.name).join(', ');
    return {
      handled: true,
      response: {
        text: `Encontrei ${accountResolution.matches.length} contas correspondentes: ${names}. Qual delas você quer consultar?`,
        highlight: null,
      },
    };
  }

  // Nenhuma correspondência direta: o contexto da conversa ainda pode
  // identificar a movimentação (Fase 4, item 1).
  if (contextHint) {
    const contextResult = findCandidateTransactions(snapshot, buildContextCriteria(contextHint));
    if (contextResult.candidates.length === 1) {
      const tx = contextResult.candidates[0];
      return {
        handled: true,
        response: {
          text: buildTransactionDetails(tx, snapshot),
          highlight: roundMoney(tx.amount) > 0 ? fmtCurrency(tx.amount) : null,
        },
      };
    }
    if (contextResult.candidates.length > 1) {
      return {
        handled: true,
        response: {
          text: buildAmbiguityQuestion(
            buildCriteriaLabel(buildContextCriteria(contextHint), contextResult.candidates),
            contextResult.candidates,
            snapshot,
          ),
          highlight: null,
        },
      };
    }
  }

  if (isVagueTransactionReference(text)
    && !criteria.amount
    && !criteria.descriptionKeywords?.length
    && !criteria.date) {
    return {
      handled: true,
      response: {
        text: 'Sobre qual movimentação você quer saber? Pode me dizer o valor, a descrição ou a data.',
        highlight: null,
      },
    };
  }

  return {
    handled: true,
    response: { text: buildNotFoundText(effectiveCriteria), highlight: null },
  };
}

function collectContextHint(history, referenceDate) {
  const userMessages = (history || []).filter(
    (message) => message && message.from === 'user' && typeof message.text === 'string',
  );
  for (const message of [...userMessages].reverse().slice(0, 4)) {
    const hint = {
      amount: extractQueryAmount(message.text),
      date: extractQueryDate(message.text, referenceDate),
      descriptionKeywords: extractDescriptionKeywords(message.text),
      accountPhrase: extractAccountReference(message.text),
    };
    if (hint.amount != null || hint.date || hint.descriptionKeywords.length || hint.accountPhrase) {
      return hint;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolução por tipo de consulta
// ─────────────────────────────────────────────────────────────────────────────

function resolveLastMovementQuery(snapshot, queryType) {
  if (!snapshot.transactions.length) {
    const noun = queryType === 'last_income' ? 'entradas' : queryType === 'last_expense' ? 'saídas' : 'movimentações';
    return {
      handled: true,
      response: { text: `Você ainda não tem ${noun} registradas.`, highlight: null },
    };
  }
  const type = queryType === 'last_income' ? 'income' : queryType === 'last_expense' ? 'expense' : null;
  const last = type
    ? snapshot.transactions.find((tx) => tx.transaction_type === type)
    : snapshot.lastTransaction;
  if (!last) {
    const noun = queryType === 'last_income' ? 'entradas' : 'saídas';
    return {
      handled: true,
      response: { text: `Você ainda não tem ${noun} registradas.`, highlight: null },
    };
  }
  const kindLabel = queryType === 'last_transaction' ? 'movimentação' : queryType === 'last_income' ? 'entrada' : 'saída';
  return {
    handled: true,
    response: {
      text: buildLastMovementAnswer(last, snapshot, kindLabel),
      highlight: roundMoney(last.amount) > 0 ? fmtCurrency(last.amount) : null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 2 — Memória Conversacional: refinamento e comparação de consultas
// agregadas de período (ex.: "quanto já gastei esse mês" → "Só nessa
// conta." → "Agora compara com o mês passado."). Depende de `lastQuery`,
// fornecido pelo chamador (createConversationalMemory().getLastQuery()) --
// este motor nunca guarda estado entre chamadas.
// ─────────────────────────────────────────────────────────────────────────────

function sumExpensesInRange(snapshot, start, end, extraFilter) {
  const matches = snapshot.transactions.filter((tx) => (
    tx.transaction_type === 'expense'
    && tx.transaction_date >= start
    && tx.transaction_date <= end
    && (typeof extraFilter === 'function' ? extraFilter(tx) : true)
  ));
  return {
    total: roundMoney(matches.reduce((sum, tx) => sum + roundMoney(tx.amount), 0)),
    count: matches.length,
  };
}

const COMPARISON_PATTERN = /\bcompar[ae]\s+com\b/i;

// "Agora compara com o mês passado." -- resolve o novo período a partir do
// que vem depois de "compara(r) com"; o período BASE é o da última consulta
// de período (lastQuery), ou o mês corrente quando não há uma. Nenhuma
// lógica de comparação nova além de somar/subtrair os dois totais reais.
function tryResolveComparisonQuery({ text, snapshot, mode, conversationStyle, referenceDate, lastQuery }) {
  if (!COMPARISON_PATTERN.test(text)) return null;
  const remainder = text.replace(COMPARISON_PATTERN, ' ').trim();
  const newRange = resolveTemporalRange(remainder, referenceDate);
  if (newRange.status !== 'resolved') return null;

  const basePeriod = lastQuery?.queryParams?.kind === 'period_expenses'
    ? { start: lastQuery.queryParams.start, end: lastQuery.queryParams.end, label: lastQuery.queryParams.label }
    : (() => {
        const current = resolveTemporalRange('este mês', referenceDate);
        return current.status === 'resolved' ? current : null;
      })();
  if (!basePeriod) return null;

  const subject = mode === 'empresa' ? 'sua empresa' : 'você';
  const baseSum = sumExpensesInRange(snapshot, basePeriod.start, basePeriod.end);
  const newSum = sumExpensesInRange(snapshot, newRange.start, newRange.end);
  const delta = roundMoney(baseSum.total - newSum.total);
  const deltaText = delta === 0
    ? 'gastou o mesmo valor nos dois períodos'
    : `gastou ${fmtCurrency(Math.abs(delta))} ${delta > 0 ? 'a mais' : 'a menos'} em ${basePeriod.label} do que em ${newRange.label}`;
  const responseText = `Em ${basePeriod.label}: ${fmtCurrency(baseSum.total)}. Em ${newRange.label}: ${fmtCurrency(newSum.total)}. ${capitalize(subject)} ${deltaText}.`;

  return {
    handled: true,
    response: {
      text: conversationStyle === 'simple' ? condenseForSimpleStyle(responseText) : responseText,
      highlight: fmtCurrency(newSum.total),
    },
    queryType: 'period_comparison',
    queryParams: { kind: 'period_comparison', periodA: basePeriod, periodB: newRange },
  };
}

// "Só nessa conta." -- só dispara quando a classificação normal não
// reconheceu a frase E existe uma consulta de período anterior para
// refinar. Depois que createConversationalMemory().resolveReferences() já
// substituiu "nessa conta" pelo nome literal, extractAccountReference
// encontra a conta normalmente -- nenhuma lógica de extração nova.
function tryResolveQueryRefinement({ text, snapshot, mode, conversationStyle, lastQuery }) {
  if (!lastQuery || lastQuery.queryParams?.kind !== 'period_expenses') return null;
  const accountPhrase = extractAccountReference(text);
  if (!accountPhrase) return null;

  const { matches, ambiguous } = findAccountsByPhrase(snapshot, accountPhrase);
  if (ambiguous) {
    const names = matches.map((account) => account.name).join(', ');
    return {
      handled: true,
      response: {
        text: `Encontrei ${matches.length} contas correspondentes: ${names}. Qual delas você quer consultar?`,
        highlight: null,
      },
      queryType: 'category_expenses',
    };
  }
  if (!matches.length) return null;

  const account = matches[0];
  const { start, end, label } = lastQuery.queryParams;
  const subject = mode === 'empresa' ? 'sua empresa' : 'você';
  const { total } = sumExpensesInRange(snapshot, start, end, (tx) => tx.account_id === account.id);
  const responseText = total > 0
    ? `Em ${label}, ${subject} gastou ${fmtCurrency(total)} na conta ${account.name}.`
    : `Não encontrei gastos na conta ${account.name} em ${label}.`;

  return {
    handled: true,
    response: {
      text: conversationStyle === 'simple' ? condenseForSimpleStyle(responseText) : responseText,
      highlight: total > 0 ? fmtCurrency(total) : null,
    },
    queryType: 'category_expenses',
    queryParams: { kind: 'period_expenses', start, end, label, accountId: account.id },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada pública do motor
// ─────────────────────────────────────────────────────────────────────────────

export function resolveFinancialQuery({
  text,
  snapshot,
  mode = 'pessoal',
  conversationStyle,
  history = [],
  referenceDate = null,
  lastQuery = null,
} = {}) {
  if (typeof text !== 'string' || !text.trim() || !snapshot) return { handled: false };

  const effectiveReferenceDate = referenceDate ?? snapshot.referenceDate ?? null;

  const comparisonOutcome = tryResolveComparisonQuery({
    text, snapshot, mode, conversationStyle, referenceDate: effectiveReferenceDate, lastQuery,
  });
  if (comparisonOutcome) return comparisonOutcome;

  // "Só nessa conta." -- o prefixo "só/somente" é um sinal explícito de
  // refinamento (restringir a última consulta), então tem prioridade sobre
  // a classificação normal (que, sem isso, tentaria adivinhar uma
  // transação isolada pelo nome da conta). Sem esse prefixo, o refinamento
  // só é tentado como último recurso, depois que classifyQueryType não
  // reconhece nada.
  if (/^\s*s[oó](?:mente)?(?=\s|$)/i.test(text)) {
    const explicitRefinement = tryResolveQueryRefinement({
      text, snapshot, mode, conversationStyle, lastQuery,
    });
    if (explicitRefinement) return explicitRefinement;
  }

  const queryType = classifyQueryType(text);
  if (!queryType) {
    const refinementOutcome = tryResolveQueryRefinement({
      text, snapshot, mode, conversationStyle, lastQuery,
    });
    return refinementOutcome ?? { handled: false };
  }

  const contextHint = collectContextHint(history, effectiveReferenceDate);

  const criteria = {
    amount: extractQueryAmount(text),
    date: extractQueryDate(text, effectiveReferenceDate),
    descriptionKeywords: extractDescriptionKeywords(text),
    categoryId: null,
    accountId: null,
    accountPhrase: extractAccountReference(text),
  };

  let result;
  switch (queryType) {
    case 'public_financial_summary': {
      const response = buildPublicMovementSummaryResponse({
        snapshot,
        text,
        includeRetirementIntro: isRetiredPublicBalanceRequest(text),
      });
      result = {
        handled: true,
        response,
        queryParams: {
          kind: 'public_financial_summary',
          ...response.data.period,
        },
      };
      break;
    }

    case 'last_transaction':
    case 'last_income':
    case 'last_expense':
      result = resolveLastMovementQuery(snapshot, queryType);
      break;

    case 'transaction_account': {
      const hasCriteria = criteria.amount != null
        || criteria.date
        || criteria.descriptionKeywords.length
        || criteria.accountPhrase;
      if (!hasCriteria) {
        // "qual conta usei?" — sem critérios: contexto da conversa, depois a
        // última movimentação real.
        if (contextHint) {
          result = resolveTransactionQuery({
            text, snapshot, criteria: buildContextCriteria(contextHint), contextHint: null,
          });
        } else if (snapshot.lastTransaction) {
          const tx = snapshot.lastTransaction;
          const labels = resolveTransactionLabels(tx, snapshot);
          const accountLabel = labels.accountName
            ? `na conta ${labels.accountName}`
            : REMOVED_ACCOUNT_PHRASE;
          const date = tx.transaction_date ? ` em ${fmtLongDate(tx.transaction_date)}` : '';
          result = {
            handled: true,
            response: {
              text: `A última movimentação que você fez foi ${accountLabel}${date}.`,
              highlight: null,
            },
          };
        } else {
          result = {
            handled: true,
            response: {
              text: 'Você ainda não tem movimentações registradas.',
              highlight: null,
            },
          };
        }
        break;
      }
      result = resolveTransactionQuery({ text, snapshot, criteria, contextHint: null });
      break;
    }

    case 'transaction_reference':
      result = resolveTransactionQuery({ text, snapshot, criteria, contextHint });
      break;

    case 'account_balance': {
      const response = buildPublicMovementSummaryResponse({
        snapshot,
        text,
        includeRetirementIntro: true,
      });
      result = {
        handled: true,
        response,
        queryParams: { kind: 'public_financial_summary', ...response.data.period },
      };
      break;
    }

    case 'category_expenses': {
      const subject = mode === 'empresa' ? 'sua empresa' : 'você';
      const phrase = extractCategoryPhrase(text);
      const currentMonthIndex = Number(snapshot.currentMonth.slice(5, 7));

      // Mês nomeado ("quanto gastei em junho") → total real do mês.
      if (phrase) {
        const monthIndex = MONTH_NAMES.indexOf(normalizeFinancialText(phrase));
        if (monthIndex >= 0) {
          const monthPrefix = String(monthIndex + 1).padStart(2, '0');
          const monthTransactions = snapshot.transactions.filter(
            (tx) => tx.transaction_type === 'expense'
              && String(tx.transaction_date || '').slice(5, 7) === monthPrefix,
          );
          const total = roundMoney(monthTransactions.reduce((sum, tx) => sum + roundMoney(tx.amount), 0));
          if (total > 0) {
            result = {
              handled: true,
              response: {
                text: `Em ${capitalize(MONTH_NAMES[monthIndex])}, ${subject} gastou ${fmtCurrency(total)}.`,
                highlight: fmtCurrency(total),
              },
            };
          } else {
            result = {
              handled: true,
              response: {
                text: `Não encontrei gastos em ${MONTH_NAMES[monthIndex]} nos seus registros.`,
                highlight: null,
              },
            };
          }
          break;
        }
      }

      // "nos últimos 7 dias"/"nos últimos 30 dias" etc. batem acidentalmente
      // no padrão de extractCategoryPhrase (a preposição "nos" antes de
      // "últimos N dias" parece "nos <categoria>") -- uma frase que o
      // próprio resolvedor temporal reconhece nunca é tratada como nome de
      // categoria.
      const phraseIsTemporal = phrase && resolveTemporalRange(phrase, effectiveReferenceDate).status === 'resolved';
      const categoryPhrase = phraseIsTemporal ? null : (phrase || criteria.descriptionKeywords?.[0]);
      if (!categoryPhrase) {
        // Sprint 2 (Interpretação Temporal): sem categoria mencionada --
        // tenta resolver um período temporal explícito na frase ("quanto já
        // gastei esse mês", "quanto gastei nos últimos 7 dias") e responde
        // com o total REAL (soma das transações no intervalo, dado já
        // disponível em snapshot.transactions -- nenhuma ferramenta nova,
        // nenhuma aproximação por mês inteiro necessária, já que o
        // snapshot tem a data exata de cada transação). Nunca inventa: sem
        // expressão temporal reconhecida, mantém o comportamento anterior.
        const range = resolveTemporalRange(text, effectiveReferenceDate);
        if (range.status === 'resolved') {
          const { total } = sumExpensesInRange(snapshot, range.start, range.end);
          result = {
            handled: true,
            response: {
              text: total > 0
                ? `Em ${range.label}, ${subject} gastou ${fmtCurrency(total)}.`
                : `Não encontrei gastos em ${range.label}.`,
              highlight: total > 0 ? fmtCurrency(total) : null,
            },
            queryParams: { kind: 'period_expenses', start: range.start, end: range.end, label: range.label },
          };
          break;
        }
        result = { handled: false };
        break;
      }

      const { matches, ambiguous } = findCategoriesByPhrase(snapshot, categoryPhrase);

      if (ambiguous) {
        const names = matches.map((category) => category.name).join(', ');
        result = {
          handled: true,
          response: {
            text: `Encontrei ${matches.length} categorias correspondentes: ${names}. Qual delas você quer consultar?`,
            highlight: null,
          },
        };
        break;
      }

      const category = matches[0] ?? null;

      if (category) {
        const total = roundMoney(snapshot.currentMonthTransactions
          .filter((tx) => tx.transaction_type === 'expense' && tx.category_id === category.id)
          .reduce((sum, tx) => sum + roundMoney(tx.amount), 0));

        if (total > 0) {
          result = {
            handled: true,
            response: {
              text: `Em ${MONTH_NAMES[currentMonthIndex - 1]}, ${subject} gastou ${fmtCurrency(total)} com ${category.name}.`,
              highlight: fmtCurrency(total),
            },
          };
          break;
        }

        // Nada no mês corrente: último mês com gasto real na categoria.
        const monthTotals = new Map();
        for (const tx of snapshot.transactions) {
          if (tx.transaction_type !== 'expense' || tx.category_id !== category.id) continue;
          const key = String(tx.transaction_date || '').slice(0, 7);
          monthTotals.set(key, roundMoney((monthTotals.get(key) ?? 0) + roundMoney(tx.amount)));
        }
        const lastMonthKey = [...monthTotals.keys()].sort().reverse()[0];
        if (lastMonthKey) {
          const monthName = monthNameOf(lastMonthKey);
          result = {
            handled: true,
            response: {
              text: `Não houve gastos com ${category.name} em ${MONTH_NAMES[currentMonthIndex - 1]}. A última vez foi em ${monthName}: ${fmtCurrency(monthTotals.get(lastMonthKey))}.`,
              highlight: fmtCurrency(monthTotals.get(lastMonthKey)),
            },
          };
          break;
        }

        result = {
          handled: true,
          response: {
            text: `Não encontrei gastos com ${category.name} nos seus registros.`,
            highlight: null,
          },
        };
        break;
      }

      // BUG REAL (Sprint 2.1, BUG 4): "quanto já gastei no Nubank?" batia
      // no padrão de categoria (a preposição "no" antes do nome), mas
      // "Nubank" é o nome de uma CONTA -- sem esta checagem, caía direto
      // na inferência por descrição abaixo e respondia "não encontrei
      // gastos com Nubank" mesmo havendo transações reais na conta,
      // porque a busca comparava a string livre contra a descrição da
      // transação, nunca o account_id de verdade.
      const { matches: accountMatchesForPhrase, ambiguous: accountAmbiguousForPhrase } =
        findAccountsByPhrase(snapshot, categoryPhrase);
      if (accountAmbiguousForPhrase) {
        const names = accountMatchesForPhrase.map((account) => account.name).join(', ');
        result = {
          handled: true,
          response: {
            text: `Encontrei ${accountMatchesForPhrase.length} contas correspondentes: ${names}. Qual delas você quer consultar?`,
            highlight: null,
          },
        };
        break;
      }
      if (accountMatchesForPhrase.length === 1) {
        const matchedAccount = accountMatchesForPhrase[0];
        const currentMonthRange = resolveTemporalRange('este mês', effectiveReferenceDate);
        const { total: accountTotal } = sumExpensesInRange(
          snapshot,
          currentMonthRange.start,
          currentMonthRange.end,
          (tx) => tx.account_id === matchedAccount.id,
        );
        result = {
          handled: true,
          response: {
            text: accountTotal > 0
              ? `Em ${MONTH_NAMES[currentMonthIndex - 1]}, ${subject} gastou ${fmtCurrency(accountTotal)} na conta ${matchedAccount.name}.`
              : `Não encontrei gastos na conta ${matchedAccount.name} em ${MONTH_NAMES[currentMonthIndex - 1]}.`,
            highlight: accountTotal > 0 ? fmtCurrency(accountTotal) : null,
          },
          queryParams: {
            kind: 'period_expenses',
            start: currentMonthRange.start,
            end: currentMonthRange.end,
            label: MONTH_NAMES[currentMonthIndex - 1],
            accountId: matchedAccount.id,
          },
        };
        break;
      }

      // Sem categoria correspondente → inferência por descrição (dados reais).
      const keywords = criteria.descriptionKeywords?.length
        ? criteria.descriptionKeywords
        : [normalizeFinancialText(categoryPhrase)].filter(Boolean);
      const matching = keywords.length
        ? snapshot.currentMonthTransactions.filter((tx) => {
            if (tx.transaction_type !== 'expense') return false;
            const haystack = normalizeFinancialText(tx.description || '');
            return keywords.every((keyword) => haystack.includes(keyword));
          })
        : [];
      const total = roundMoney(matching.reduce((sum, tx) => sum + roundMoney(tx.amount), 0));
      if (total > 0) {
        result = {
          handled: true,
          response: {
            text: `Em ${MONTH_NAMES[currentMonthIndex - 1]}, ${subject} gastou ${fmtCurrency(total)} com ${categoryPhrase}.`,
            highlight: fmtCurrency(total),
          },
        };
        break;
      }

      result = {
        handled: true,
        response: {
          text: `Não encontrei gastos com "${capitalize(categoryPhrase)}" nos seus registros.`,
          highlight: null,
        },
      };
      break;
    }

    default:
      return { handled: false };
  }

  if (!result?.handled) return { handled: false };

  return {
    handled: true,
    response: {
      text: conversationStyle === 'simple'
        ? condenseForSimpleStyle(result.response.text)
        : result.response.text,
      highlight: result.response.highlight ?? null,
    },
    queryType,
    queryParams: result.queryParams ?? null,
  };
}
