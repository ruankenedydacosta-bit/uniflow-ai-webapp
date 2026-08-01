export const FINANCIAL_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
  'check_balance',
  'set_balance',
  'ambiguous_balance_or_income',
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
    intent: 'set_balance',
    confidence: 0.95,
    patterns: [
      // Declaração de saldo-alvo ("Meu saldo no Nubank é R$ 1.000",
      // "Meu saldo é 1000", "O saldo da conta está 500") -- exige um valor
      // monetário na frase para nunca engolir perguntas ("qual é meu
      // saldo?" não tem valor e continua sendo check_balance).
      /^(?:meu\s+|o\s+|nosso\s+)?saldo\b.*?\b(?:e|eh|esta|estou|ficou|fica|vai\s+ficar)\b.*?(?:r\s*\$|reais?|\d|mil)\b/u,
      /^(?:coloca|define|ajusta|ajuste|corrige|corrija)\s+(?:meu\s+|o\s+)?saldo\b.*?(?:r\s*\$|reais?|\d|mil)\b/u,
      // "Tenho R$ 1.000 DE SALDO" -- valor + "de saldo" explicito tambem e
      // declaracao de saldo (vem antes do padrao de despesa "reais de" e
      // do padrao ambiguo "tenho <valor>"). O dinheiro pode vir antes OU
      // depois de "saldo" ("tenho 500 reais de saldo" / "tenho de saldo 500").
      /^(?:eu\s+)?tenho\b(?=.*?(?:r\s*\$|reais?|\d|mil)(?:\b|\s)).*?\b(?:de|em)\s+saldo\b/u,
    ],
  },
  {
    intent: 'ambiguous_balance_or_income',
    confidence: 0.88,
    patterns: [
      // "Tenho R$ 1.000" / "Tenho 1.000 na poupança" -- declaração com
      // verbo "ter" e valor monetário. Ambígua por natureza: pode ser
      // receita declarada ou saldo declarado. Sempre ancorada no início
      // para nunca capturar perguntas ("quanto tenho...") nem respostas
      // de pendência ("tenho no Nubank").
      /^(?:eu\s+)?tenho\b.*?(?:r\s*\$|reais?|\d|mil)\b/u,
      /^(?:eu\s+)?estou\s+com\b.*?(?:r\s*\$|reais?|\d|mil)\b/u,
      /^(?:eu\s+)?to\s+com\b.*?(?:r\s*\$|reais?|\d|mil)\b/u,
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
      // BUG REAL: "Entrou mil reais." (valor por extenso) não batia no padrão
      // antigo (que exigia algarismos logo depois do verbo) e caía em
      // 'question' -- e o FinancialQueryEngine ainda a capturava como
      // transaction_reference. O lookahead aceita valor em algarismo OU por
      // extenso (R$/reais/mil/palavras numéricas) em qualquer posição da
      // declaração.
      // BUG REAL: "Entraram mil reais."/"Caiu quinhentos." -- plural do
      // verbo (entraram/cairam) e número por extenso sem "reais"
      // ("quinhentos") não batiam e viravam 'question'. A lista de palavras
      // numéricas cobre o número por extenso comum de lançamentos.
      /^(?:entrou|caiu|entraram|cairam)\b(?=.*?\b(?:r\s*\$|\d+(?:[.,]\d+)?|reais?|mil|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos)\b)/u,
      // BUG REAL: "Entrou meu salário." -- declaração com verbo e
      // possessivo, sem valor explícito; antes virava 'question'/
      // transaction_reference (e, com pendência ativa, virava nome de
      // conta proposto). Sem valor, o fluxo de pendência pergunta o valor.
      /^(?:entrou|caiu|entraram|cairam)\s+(?:meu|minha|meus|minhas)\b/,
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
