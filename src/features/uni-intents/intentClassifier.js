export const FINANCIAL_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'forecast',
  'question',
]);

const INTENT_RULES = [
  {
    intent: 'register_transfer',
    confidence: 0.98,
    patterns: [
      /\btransfer(?:i|ir|encia|indo)\b/,
      /\b(?:fiz|mandei|enviei)\s+(?:um\s+)?pix\b/,
      /\bpix\s+(?:de\s+)?[\d.,]+\s+para\b/,
    ],
  },
  {
    intent: 'create_goal',
    confidence: 0.96,
    patterns: [
      /\bquero\s+(?:juntar|guardar|economizar)\b/,
      /\b(?:criar|definir)\s+(?:uma\s+)?(?:meta|objetivo)\b/,
      /\bmeta\s+de\s+[\d.,]+/,
    ],
  },
  {
    intent: 'forecast',
    confidence: 0.93,
    patterns: [
      /\bquanto\s+(?:eu\s+)?posso\s+(?:gastar|investir|retirar)\b/,
      /\b(?:previsao|projecao|projetad[oa])\b/,
      /\b(?:vai|deve)\s+(?:sobrar|faltar)\b/,
      /\bcomo\s+(?:fica|ficara)\s+(?:meu\s+)?(?:saldo|caixa)\b/,
    ],
  },
  {
    intent: 'check_balance',
    confidence: 0.94,
    patterns: [
      /\b(?:qual|quanto)\s+(?:e|eh|tenho|tem)\s+(?:o\s+|de\s+)?(?:meu\s+)?saldo\b/,
      /\bqual\s+(?:o\s+)?meu\s+saldo\b/,
      /\bquanto\s+(?:eu\s+)?tenho\s+(?:na|no|em)\b/,
      /\bconsultar\s+(?:o\s+)?saldo\b/,
      /\bsaldo\s+(?:atual|disponivel)\b/,
    ],
  },
  {
    intent: 'register_income',
    confidence: 0.96,
    patterns: [
      /^(?:eu\s+)?(?:recebi|ganhei|faturei)\b/,
      /^(?:entrou|caiu)\s+[\d.,]+/,
      /\brecebi\s+(?:r\$\s*)?[\d.,]+/,
      // BUG REAL: comandos imperativos ("lance uma receita de...",
      // "registra uma entrada de...") nao tinham nenhum verbo reconhecido --
      // caiam em 'question' e a frase acabava indo para o chat geral. Precisam
      // vir ANTES do bloco de register_expense (mesmo verbo imperativo serve
      // para os dois) para que "receita/entrada" explicita desambigue certo.
      /^(?:lance|lanca|registra|registre|anota|anote)\s+(?:uma\s+)?(?:receita|entrada)\b/,
    ],
  },
  {
    intent: 'register_expense',
    confidence: 0.96,
    patterns: [
      // BUG REAL EM PRODUCAO: "Coloquei duzentos reais de gasolina." caia
      // aqui como 'question' (nenhum verbo batia), o parser devolvia
      // handled:false e a frase acabava no chat geral, que respondia "nao
      // consigo registrar daqui". "coloquei/botei" sao verbos comuns de
      // lancamento coloquial que faltavam nesta lista.
      /^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci|coloquei|botei)\b/,
      /^(?:custou|saiu|foi)\s+(?:r\$\s*)?[\d.,]+/,
      /\b(?:paguei|gastei|coloquei|botei)\s+(?:r\$\s*)?[\d.,]+/,
      // Comandos imperativos genéricos ("lance uma despesa de...", "registra
      // R$ 120 de..."), sem "receita/entrada" explicita -- default despesa.
      /^(?:lance|lanca|registra|registre|anota|anote)\b/,
      // BUG REAL (fluxo de confirmação financeira simples): "Cinquenta reais
      // de gasolina." não tem NENHUM verbo -- nem os anteriores, nem
      // "gastei/paguei/etc" -- e caía em 'question'/unsupported. O parser de
      // uma única operação nunca chegava a criar a ação pendente, e a frase
      // inteira (incluindo as rodadas seguintes de "no Nubank"/"correto")
      // era respondida pelo chat geral (LLM em modo consultivo, sem nenhuma
      // máquina de estados) -- daí o texto solto pedindo confirmação de novo
      // em vez de montar o card. "<valor> reais de <algo>" é uma declaração
      // de despesa inequívoca mesmo sem verbo, contanto que a frase não
      // COMECE com uma pergunta ("quanto/quantos/qual/quando/como/onde/por
      // que" -- essas já são interceptadas antes por classifyFinancialQuery,
      // mas a guarda aqui evita reclassificar uma pergunta como lançamento
      // se ela escapar daquele classificador).
      /^(?!\s*(?:quanto|quantos|quantas|qual|quais|quando|como|onde|por\s*que|porque)\b)(?:[\p{L}\p{N}.,$]+\s+){0,3}reais?\s+de\s+\p{L}/u,
    ],
  },
];

export function normalizeFinancialText(value) {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(input) {
  const normalizedText = normalizeFinancialText(input);

  if (!normalizedText) {
    return { intent: 'question', confidence: 0, signals: [] };
  }

  for (const rule of INTENT_RULES) {
    const matchedPattern = rule.patterns.find((pattern) =>
      pattern.test(normalizedText),
    );

    if (matchedPattern) {
      return {
        intent: rule.intent,
        confidence: rule.confidence,
        signals: [matchedPattern.source],
      };
    }
  }

  return {
    intent: 'question',
    confidence: normalizedText.includes('?') ? 0.78 : 0.55,
    signals: [],
  };
}
