import { normalizeFinancialText } from '../uni-intents/index.js';

// BLOCO UNI 1A: módulo puro (sem React, sem Supabase, sem localStorage, sem
// IA, sem IDs fixos) que mapeia termos comuns da fala/texto para o NOME
// CANÔNICO de uma categoria -- nunca para um ID. Quem recebe esse nome
// (categoryResolution.js) é responsável por procurar a categoria real do
// workspace com esse nome; se ela não existir, o pedido é preservado e
// tratado como "categoria ainda não existe" (mesmo fluxo de criação
// assistida já usado por qualquer categoria não encontrada) -- este módulo
// nunca finge que uma categoria existe.
//
// Cada termo é comparado por PALAVRA/FRASE INTEIRA (nunca substring solta) --
// "gas" nunca bate dentro de "gastei", só como palavra isolada.

const ALIAS_GROUPS = Object.freeze([
  // -- Despesas ---------------------------------------------------------
  {
    canonicalName: 'Alimentação',
    transactionType: 'expense',
    terms: ['mercado', 'supermercado', 'mercadinho', 'padaria', 'restaurante', 'almoço', 'jantar', 'lanche', 'comida'],
  },
  {
    canonicalName: 'Transporte',
    transactionType: 'expense',
    terms: ['uber', '99', 'taxi', 'gasolina', 'combustível', 'posto', 'ônibus', 'metrô'],
  },
  {
    canonicalName: 'Moradia',
    transactionType: 'expense',
    terms: ['aluguel', 'condomínio', 'prestação da casa'],
  },
  {
    canonicalName: 'Saúde',
    transactionType: 'expense',
    terms: ['farmácia', 'remédio', 'médico', 'consulta', 'hospital'],
  },
  {
    canonicalName: 'Lazer',
    transactionType: 'expense',
    terms: ['cinema', 'passeio', 'festa', 'viagem'],
  },
  {
    canonicalName: 'Educação',
    transactionType: 'expense',
    terms: ['curso', 'escola', 'faculdade', 'mensalidade escolar', 'livro'],
  },
  {
    canonicalName: 'Assinaturas',
    transactionType: 'expense',
    terms: ['netflix', 'spotify', 'streaming', 'assinatura', 'youtube premium', 'amazon prime'],
  },
  {
    canonicalName: 'Compras',
    transactionType: 'expense',
    terms: ['roupa', 'calçado', 'shopping'],
  },
  {
    canonicalName: 'Contas da casa',
    transactionType: 'expense',
    terms: ['energia', 'luz', 'água', 'internet', 'telefone', 'gás'],
  },
  // -- Receitas ----------------------------------------------------------
  {
    canonicalName: 'Salário',
    transactionType: 'income',
    terms: ['salário', 'pagamento do trabalho', 'pagamento da empresa'],
  },
  {
    canonicalName: 'Renda extra',
    transactionType: 'income',
    terms: ['freela', 'freelance', 'serviço', 'bico'],
  },
  {
    canonicalName: 'Benefício',
    transactionType: 'income',
    terms: ['benefício', 'auxílio'],
  },
  {
    canonicalName: 'Investimentos',
    transactionType: 'income',
    terms: ['rendimento', 'dividendos', 'juros', 'investimento'],
  },
  {
    canonicalName: 'Reembolso',
    transactionType: 'income',
    terms: ['reembolso', 'devolução', 'estorno recebido'],
  },
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Normaliza SÓ para comparação -- nunca reescreve a descrição/valor original
// salvos na transação. Reaproveita normalizeFinancialText (acentos/caixa/
// espaços, já usado por accountResolution.js/categoryResolution.js) e
// adiciona remoção de pontuação, que aquele normalizador não faz.
export function normalizeForAliasMatch(value) {
  return normalizeFinancialText(value)
    .replace(/[.,;:!?"'()–—/$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Termos multi-palavra primeiro -- evita que um termo curto (ex.: "luz")
// "vença" por acidente uma frase mais específica antes de checarmos a mais
// longa (não há colisão real na lista atual, mas a ordem é uma garantia
// estrutural, não um acaso).
const FLAT_TERMS = ALIAS_GROUPS
  .flatMap((group) => group.terms.map((term) => ({
    term,
    normalizedTerm: normalizeForAliasMatch(term),
    canonicalName: group.canonicalName,
    transactionType: group.transactionType,
  })))
  .sort((left, right) => right.normalizedTerm.length - left.normalizedTerm.length);

// Resolve um alias determinístico a partir de um texto livre (descrição ou
// frase completa) -- retorna { canonicalName, transactionType, term } ou
// null quando nenhum termo conhecido aparece como palavra/frase inteira no
// texto. Filtra por transactionType quando informado: um alias de receita
// nunca resolve uma despesa e vice-versa.
export function resolveCategoryAlias({ text, transactionType } = {}) {
  const normalized = normalizeForAliasMatch(text ?? '');
  if (!normalized) return null;

  const candidates = transactionType
    ? FLAT_TERMS.filter((entry) => entry.transactionType === transactionType)
    : FLAT_TERMS;

  for (const entry of candidates) {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(entry.normalizedTerm)}(?:$|\\s)`);
    if (pattern.test(` ${normalized} `.replace(/\s+/g, ' '))) {
      return {
        canonicalName: entry.canonicalName,
        transactionType: entry.transactionType,
        term: entry.term,
      };
    }
  }
  return null;
}
