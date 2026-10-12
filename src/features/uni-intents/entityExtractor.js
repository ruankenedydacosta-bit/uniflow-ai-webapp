import {
  normalizeFinancialText,
  AGENDA_INTENT_SET,
  classifyIntent,
} from './intentClassifier.js';
import { resolveRelativeDateExpression } from './relativeDateResolver.js';

const MONEY_PATTERN = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(milhares?|milhar|mil|k|reais?|contos?)?/iu;
const NUMBER_WORD_VALUES = Object.freeze({
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
});
const UNIT_WORDS = new Set(['um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']);
const TEEN_WORDS = new Set(['dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze', 'dezesseis', 'dezassete', 'dezessete', 'dezoito', 'dezenove']);
const TENS_WORDS = new Set(['vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']);
const HUNDREDS_WORDS = new Set(['cem', 'cento', 'duzentos', 'duzentas', 'trezentos', 'trezentas', 'quatrocentos', 'quatrocentas', 'quinhentos', 'quinhentas', 'seiscentos', 'seiscentas', 'setecentos', 'setecentas', 'oitocentos', 'oitocentas', 'novecentos', 'novecentas']);
const CURRENCY_WORDS = new Set(['real', 'reais']);
const CENT_WORDS = new Set(['centavo', 'centavos']);
// BUG REAL: gírias comuns de dinheiro falado -- "Gastei cinquentão no
// mercado." (cinquentão = R$ 50). Sem isto a frase não tinha valor, não era
// um fresh statement e virava nome de conta proposto com uma pendência
// ativa. Chaves já normalizadas (NFD + lowercase) como tokenizeWords.
const SLANG_MONEY_WORDS = Object.freeze({
  cinquentao: 50,
  cinquentinha: 50,
});

function isNumberToken(value) {
  return NUMBER_WORD_VALUES[value] != null || SLANG_MONEY_WORDS[value] != null || value === 'mil';
}

function parseNumberTokens(amountTokens) {
  const slang = amountTokens.find((token) => SLANG_MONEY_WORDS[token] != null);
  if (slang && amountTokens.length === 1) return SLANG_MONEY_WORDS[slang];
  if (amountTokens.some((token) => SLANG_MONEY_WORDS[token] != null)) return null;
  return parsePortugueseInteger(amountTokens);
}

function parseNumericToken(token) {
  if (token.includes(',') && token.includes('.')) {
    return Number(token.replace(/\./g, '').replace(',', '.'));
  }
  if (token.includes(',')) {
    return Number(token.replace(',', '.'));
  }
  if (/\.\d{3}$/.test(token)) {
    return Number(token.replace(/\./g, ''));
  }
  return Number(token);
}

function parseBelowThousand(tokens) {
  const words = tokens.filter((token) => token !== 'e');
  if (!words.length) return null;

  let index = 0;
  let total = 0;

  if (HUNDREDS_WORDS.has(words[index])) {
    const hundred = words[index];
    total += NUMBER_WORD_VALUES[hundred];
    index += 1;
    if (hundred === 'cem' && index < words.length) return null;
  }

  if (TEEN_WORDS.has(words[index])) {
    total += NUMBER_WORD_VALUES[words[index]];
    index += 1;
  } else {
    if (TENS_WORDS.has(words[index])) {
      total += NUMBER_WORD_VALUES[words[index]];
      index += 1;
    }
    if (UNIT_WORDS.has(words[index])) {
      total += NUMBER_WORD_VALUES[words[index]];
      index += 1;
    }
  }

  return index === words.length && total > 0 ? total : null;
}

function parsePortugueseInteger(tokens) {
  const thousandIndexes = tokens
    .map((token, index) => (token === 'mil' ? index : -1))
    .filter((index) => index >= 0);
  if (thousandIndexes.length > 1) return null;

  if (!thousandIndexes.length) return parseBelowThousand(tokens);

  const thousandIndex = thousandIndexes[0];
  const prefix = tokens.slice(0, thousandIndex).filter((token) => token !== 'e');
  const suffix = tokens.slice(thousandIndex + 1).filter((token) => token !== 'e');
  const thousands = prefix.length ? parseBelowThousand(prefix) : 1;
  const remainder = suffix.length ? parseBelowThousand(suffix) : 0;

  if (!thousands || remainder === null) return null;
  return (thousands * 1000) + remainder;
}

function tokenizeWords(input) {
  return [...input.matchAll(/\p{L}+/gu)].map((match) => ({
    end: match.index + match[0].length,
    start: match.index,
    value: normalizeFinancialText(match[0]),
  }));
}

function findWrittenMoney(input) {
  const tokens = tokenizeWords(input);
  const currencyIndex = tokens.findIndex((token) => CURRENCY_WORDS.has(token.value));
  if (currencyIndex < 1) return null;

  let amountStart = currencyIndex - 1;
  while (
    amountStart > 0
    && (NUMBER_WORD_VALUES[tokens[amountStart - 1].value] || ['e', 'mil'].includes(tokens[amountStart - 1].value))
  ) {
    amountStart -= 1;
  }

  const amountTokens = tokens
    .slice(amountStart, currencyIndex)
    .map((token) => token.value);
  const integer = parsePortugueseInteger(amountTokens);
  if (!integer) return null;

  const precedingWord = tokens[amountStart - 1]?.value;
  const precedingText = input.slice(0, tokens[amountStart].start);
  if (
    ['menos', 'negativo', 'negativa'].includes(precedingWord)
    || /-\s*$/.test(precedingText)
  ) {
    return null;
  }

  let end = tokens[currencyIndex].end;
  let cents = 0;
  const afterCurrency = tokens.slice(currencyIndex + 1);
  const centUnitIndex = afterCurrency.findIndex((token) => CENT_WORDS.has(token.value));
  if (centUnitIndex >= 0) {
    const centTokens = afterCurrency
      .slice(0, centUnitIndex)
      .map((token) => token.value)
      .filter((token, index) => !(index === 0 && token === 'e'));
    const parsedCents = parseBelowThousand(centTokens);
    if (parsedCents === null || parsedCents > 99) return null;
    cents = parsedCents;
    end = afterCurrency[centUnitIndex].end;
  }

  return {
    amount: Number((integer + (cents / 100)).toFixed(2)),
    end,
    start: tokens[amountStart].start,
  };
}

// BUG REAL: "Caiu quinhentos." / "Recebi um Pix de mil." -- número por
// extenso no FINAL da frase sem a palavra "reais"/"R$". findWrittenMoney
// exige a moeda; este fallback só aceita a posição FINAL (depois do último
// token numérico a frase só pode ter pontuação), e ainda exige um verbo
// financeiro (ou declaração de saldo) em algum lugar do texto -- nunca
// captura números por extenso em perguntas ou contextos não financeiros
// ("qual é a nota?", "quanto custa o carro do vizinho").
const TRAILING_NUMBER_CONTEXT_RE = /\b(?:entrou|caiu|entraram|cairam|recebi|recebido|ganhei|faturei|gastei|paguei|comprei|abasteci|coloquei|botei|tenho|estou|transferi|transfiro)\b|\bsaldo\b|[êe]st[áa]|ficou|fica|estou/iu;

function findTrailingWrittenNumber(input) {
  if (typeof input !== 'string' || !TRAILING_NUMBER_CONTEXT_RE.test(input)) return null;
  const tokens = tokenizeWords(input);
  let end = tokens.length - 1;
  while (end >= 0 && !isNumberToken(tokens[end].value)) {
    end -= 1;
  }
  if (end < 0) return null;
  let start = end;
  while (
    start > 0
    && (isNumberToken(tokens[start - 1].value) || ['e'].includes(tokens[start - 1].value))
  ) {
    start -= 1;
  }
  const integer = parseNumberTokens(tokens.slice(start, end + 1).map((token) => token.value));
  if (!integer) return null;
  const afterText = input.slice(tokens[end].end);
  if (/[^\s.,!?;:]/u.test(afterText)) return null;
  return {
    amount: integer,
    end: tokens[end].end,
    start: tokens[start].start,
  };
}

// BUG REAL: número por extenso no MEIO da frase antes de uma preposição
// que introduz conta/descrição -- "Transferir cem do Nubank para o Inter."
// e "Gastei cinquentão no mercado." não extraíam valor (o fallback de
// posição final não cobre "cem" seguido de "do"). Aceita o primeiro número
// por extenso (incluindo gírias) seguido de preposição, exigindo contexto
// financeiro na frase (verbo, transferência/pix ou declaração de saldo).
const NUMBER_PRECEDING_PREPOSITION_RE = /\b(?:do|da|de|no|na|em|para|pra|pro|pelo|pela)\b/i;
const NUMBER_PREPOSITION_CONTEXT_RE = /\b(?:entrou|caiu|entraram|cairam|recebi|recebido|ganhei|faturei|gastei|gasto|paguei|pago|comprei|compro|abasteci|coloquei|botei|tenho|estou|transferi|transfiro|transferir)\b|transfer[êe]|\bpix\b|\bsaldo\b/iu;

function findNumberBeforePreposition(input) {
  if (typeof input !== 'string' || !NUMBER_PREPOSITION_CONTEXT_RE.test(input)) return null;
  const tokens = tokenizeWords(input);
  for (let start = 0; start < tokens.length; start += 1) {
    if (!isNumberToken(tokens[start].value)) continue;
    let end = start;
    while (
      end + 1 < tokens.length
      && (isNumberToken(tokens[end + 1].value) || ['e'].includes(tokens[end + 1].value))
    ) {
      end += 1;
    }
    const nextToken = tokens[end + 1];
    if (!nextToken || !NUMBER_PRECEDING_PREPOSITION_RE.test(nextToken.value)) continue;
    const integer = parseNumberTokens(tokens.slice(start, end + 1).map((token) => token.value));
    if (!integer) continue;
    return {
      amount: integer,
      end: tokens[end].end,
      start: tokens[start].start,
    };
  }
  return null;
}

function hasAmbiguousAmount(input) {
  const normalized = normalizeFinancialText(input);
  const numberTerm = '(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)';
  return new RegExp(`\\b${numberTerm}\\s+ou\\s+${numberTerm}\\b`, 'u').test(normalized);
}

export function extractAmount(input) {
  if (typeof input !== 'string') return null;
  if (hasAmbiguousAmount(input)) return null;
  // CAMADA 0: agenda/lembrete pode citar números que NÃO são dinheiro
  // ("reunião daqui 10 dias", "me lembra em 2 horas") -- nunca vira valor.
  if (AGENDA_INTENT_SET.has(classifyIntent(input).intent)) return null;

  const match = input.match(MONEY_PATTERN);
  if (!match) {
    return findWrittenMoney(input)?.amount
      ?? findTrailingWrittenNumber(input)?.amount
      ?? findNumberBeforePreposition(input)?.amount
      ?? null;
  }

  const beforeMatch = input.slice(0, match.index);
  if (
    /-\s*(?:r\$\s*)?$/iu.test(beforeMatch)
    || /\b(?:menos|negativo|negativa)\s*(?:r\$\s*)?$/iu.test(beforeMatch)
  ) {
    return null;
  }

  const numericValue = parseNumericToken(match[1]);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;

  const multiplier = /^(?:mil|milhar|milhares|k)$/i.test(match[2] ?? '')
    ? 1000
    : 1;

  return Number((numericValue * multiplier).toFixed(2));
}

function titleCase(value) {
  const trimmed = value.trim().replace(/[.!?,;:]+$/g, '');
  if (!trimmed) return null;

  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function extractAccount(input, intent = 'register_transfer') {
  if (typeof input !== 'string') return null;

  // Normaliza (NFD + lowercase) como o classificador: os lookaheads
  // ("e|eh|esta", "tambem") precisam bater em "é"/"está"/"também" do texto
  // original. O nome capturado volta a ter o caso original via titleCase.
  const normalizedInput = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // BUG REAL (BUG 2): em transferência, "para o X" é o DESTINO, não a
  // conta da ação -- o padrão antigo capturava o destino como `account` e
  // a origem ficava perdida ("Transferir cem do Nubank para o Inter."
  // resolvia a conta errada). Agora: `account` = ORIGEM (do/da X) e o
  // destino sai por extractDestinationAccount.
  const transferSourcePattern = /\b(?:do|da)\s+(?:(?:o\s+|a\s+)?conta\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:para|pro|pra)\b|[.!?,;:]|$)/iu;
  const paymentPattern = /\b(?:pelo|pela|na\s+conta|no\s+banco|da\s+conta|do\s+banco)\s+([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanha|dia\s+\d)\b|[.!?,;:]|$)/iu;
  // Declaracoes de saldo: "Meu saldo no Nubank é R$ 1.000" / "saldo da
  // conta Nubank está 500" -- o nome vem entre "saldo" e o verbo estativo.
  const balancePattern = /\bsaldo\b[^.!?]*?\b(?:no|na|em|da|do|da\s+conta|do\s+banco)\s+(?:(?:a\s+)?conta\s+|o\s+|a\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:e|eh|esta|estou|ficou|fica|vai|hoje|ontem|amanha|dia\s+\d)\b|[.!?,;:]|$)/iu;
  // Declaracoes ambiguas ("Tenho R$ 1.000 no Nubank", "Estou com 500 na
  // poupanca") -- qualquer locativo simples com nome proprio.
  const declarationPattern = /\b(?:no|na|em|da|do)\s+(?:(?:a\s+)?conta\s+|o\s+|a\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanha|dia\s+\d|e|tambem|mais)\b|[.!?,;:]|$)/iu;

  let match = normalizedInput.match(
    intent === 'register_transfer'
      ? transferSourcePattern
      : intent === 'ambiguous_balance_or_income'
        ? declarationPattern
        : paymentPattern,
  );
  if (!match && intent === 'set_balance') {
    match = normalizedInput.match(balancePattern) ?? normalizedInput.match(paymentPattern);
  }

  return match ? titleCase(match[1]) : null;
}

// BUG REAL (BUG 2): conta de DESTINO de uma transferência ("para o Inter",
// "pro Inter", "para a conta Inter"). Separada da origem -- antes o
// destino era capturado como `account` (a origem) em extractAccount.
export function extractDestinationAccount(input) {
  if (typeof input !== 'string') return null;
  const normalizedInput = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const match = normalizedInput.match(
    /\b(?:para|pro|pra)\s+(?:(?:a\s+)?conta\s+|o\s+|a\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanha|dia\s+\d)\b|[.!?,;:]|$)/iu,
  );
  return match ? titleCase(match[1]) : null;
}

// BLOCO E: delega para relativeDateResolver.js -- mesma resolucao
// determinística usada para validar datas vindas da camada neural
// (financial_plan), agora tambem cobrindo anteontem, dia da semana, "dia N",
// fim/comeco do mes (antes so hoje/ontem/amanha/data explicita).
export function extractDate(input, referenceDate = null, options = {}) {
  if (typeof input !== 'string') return null;
  return resolveRelativeDateExpression(input, referenceDate, options).resolvedDate;
}

function extractDescription(input, intent, account, destinationAccount = null) {
  if (typeof input !== 'string') return null;
  const cleanInput = input.trim().replace(/[.!?,;:]+$/g, '');

  // Declaracoes de saldo nao produzem descricao: a acao usa o rotulo
  // padrao "Ajuste de saldo" (nunca o texto bruto "Meu Saldo No Nubank").
  if (intent === 'set_balance' || intent === 'ambiguous_balance_or_income') {
    return null;
  }

  if (intent === 'register_transfer') {
    // BUG REAL (BUG 2): `account` é a ORIGEM da transferência -- a
    // descrição referencia o DESTINO ("Transferência para Inter"), nunca
    // "para Nubank" (origem).
    return destinationAccount
      ? `Transferência para ${destinationAccount}`
      : 'Transferência';
  }

  // BUG REAL: os três cortes de valor (algarismo, por extenso com moeda,
  // por extenso sem moeda) são calculados SEMPRE sobre cleanInput e
  // aplicados juntos -- aplicá-los em sequência sobre o texto já cortado
  // desalinhava os offsets quando havia mais de um valor ("Caiu mil reais
  // e entraram quinhentos." ficava com resto truncado na descrição).
  // Os spans nunca se sobrepõem (algarismo, "X reais" e número por extenso
  // no fim são mutuamente exclusivos).
  const cuts = [];
  const moneyMatch = cleanInput.match(MONEY_PATTERN);
  if (moneyMatch) cuts.push([moneyMatch.index, moneyMatch.index + moneyMatch[0].length]);
  const writtenMoney = findWrittenMoney(cleanInput);
  if (writtenMoney) cuts.push([writtenMoney.start, writtenMoney.end]);
  // BUG REAL: número por extenso SEM moeda no fim da frase ("Recebi um Pix
  // de mil.") não era removido -- o valor virava parte da descrição e a
  // preposição ficava pendurada ("Um Pix de"). O mesmo fallback de
  // extractAmount remove o trecho; a preposição residual é limpa abaixo.
  const trailingNumber = findTrailingWrittenNumber(cleanInput);
  if (trailingNumber) cuts.push([trailingNumber.start, trailingNumber.end]);
  // BUG REAL: número por extenso no MEIO da frase antes de preposição
  // ("Gastei cinquentão no mercado.", "Transferir cem do Nubank...") --
  // mesmo fallback de extractAmount, aplicado como corte na descrição.
  const prepositionNumber = findNumberBeforePreposition(cleanInput);
  if (prepositionNumber) cuts.push([prepositionNumber.start, prepositionNumber.end]);
  let description = cleanInput;
  for (const [start, end] of cuts.sort((a, b) => a[0] - b[0]).reverse()) {
    description = `${description.slice(0, start)} ${description.slice(end)}`;
  }
  if (account) {
    description = description.replace(
      new RegExp(
        `\\b(?:pelo|pela|na\\s+conta|no\\s+banco|da\\s+conta|do\\s+banco)\\s+${account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'iu',
      ),
      ' ',
    );
  }
  description = description
    // BUG REAL EM PRODUCAO: classifyIntent (intentClassifier.js) reconhece
    // "fiz/realizei uma compra" como despesa, mas essa lista de verbos aqui
    // (usada só para LIMPAR a descricao) nunca ganhou o mesmo padrão -- a
    // frase inteira ficava colada na descricao ("Fiz Uma Compra" em vez do
    // que vinha depois), e sem nenhum outro sinal a Uni chegava a propor
    // criar uma categoria chamada literalmente "Fiz Uma Compra".
    .replace(/^(?:eu\s+)?(?:fiz|realizei)\s+(?:uma\s+)?compra\b/iu, '')
    // BUG REAL EM PRODUÇÃO (voz): o pedido falado ("Eu queria registrar uma
    // saída de...", "Gostaria que você lançasse...") ficava inteiro na
    // descrição. Mesma abertura de PEDIDO_DE_LANCAMENTO (intentClassifier.js).
    .replace(/^(?:(?:eu\s+)?(?:queria|quero|gostaria|preciso)(?:\s+de)?(?:\s+que\s+(?:voc[êe]|vc))?\s+|(?:voc[êe]|vc)\s+(?:pode|poderia|consegue)\s+|(?:pode|poderia)\s+|por\s+favor,?\s+)?(?:registrar|registre|registrasse|registra|registro|lan[çc]ar|lan[çc]asse|lancem|lance|lan[çc]a|anota|adicionar|adiciona|adicione|adicionasse|incluir|inclui|inclua|inclu[íi]sse|anotar|anote|anotasse)\b/iu, '')
    // BUG REAL: "coloquei/botei/foi/lancei/lança/registra/anota" nao eram
    // reconhecidos aqui -- a descricao ficava com o verbo grudado
    // ("Coloquei De Gasolina" em vez de "Gasolina").
    // BUG REAL EM PRODUCAO: mesmo problema para o imperativo "coloca/bota/
    // poe" ("coloca aí 75 reais no mercado" -- só "coloquei", passado,
    // estava coberto aqui).
    .replace(/^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci|recebi|ganhei|faturei|entrou|caiu|entraram|cairam|custou|saiu|coloquei|botei|coloca|bota|poe|foi|lancei|lance|lan[çc]a|registrei|registra|registro|anotei|anota)\b/iu, '')
    .replace(/^(?:quero\s+)?(?:juntar|guardar|economizar)\b/iu, '')
    // Substantivo genérico de lançamento ("uma despesa de", "um gasto de")
    // que sobra apos remover o verbo imperativo -- nao descreve a compra em
    // si, entao e removido antes da preposicao final.
    .replace(/^\s*(?:de\s+)?(?:uma?\s+)?(?:despesa|gasto|receita|entrada|pagamento|sa[íi]da)s?\s+(?:no\s+valor\s+)?(?:de\s+|com\s+)?/iu, '')
    .replace(
      /^\s*(?:de|do|da|no|na|em|para|pra|pro|com)\s+(?:(?:uma|um|o|a)\b)?\s*/iu,
      '',
    )
    // A data já vai para o campo Data: "na data de ontem", "no dia de
    // hoje" e "hoje" no fim não fazem parte da descrição.
    .replace(/\s+(?:(?:na\s+data|no\s+dia)\s+(?:de\s+)?|de\s+|para\s+)?(?:hoje|ontem|anteontem|(?:depois\s+de\s+)?amanh[aã])$/iu, '')
    // BUG REAL: preposição pendurada após remover o valor ("Um Pix de",
    // "Gasolina no") -- descrição malformada nunca é exibida assim.
    .replace(/\s+(?:de|do|da|no|na|em|para|pra|pro)\s*$/iu, '')
    .trim();

  if (/^(?:mais|e\s+mais|tambem)$/iu.test(description)) return null;
  return titleCase(description);
}

export function extractEntities(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const intent = safeOptions.intent ?? 'question';
  const referenceDate = safeOptions.referenceDate ?? null;
  const dateOptions = { lookAhead: safeOptions.lookAhead === true };

  // CAMADA 0 (AGENDA): intents de agenda/lembrete NUNCA produzem entidades
  // monetárias -- números associados a compromissos ("reunião daqui 10
  // dias") não são valores. A data relativa ainda é resolvida (a base
  // determinística de agenda reaproveita extractDate).
  if (AGENDA_INTENT_SET.has(intent)) {
    return {
      amount: null,
      category: null,
      description: null,
      account: null,
      date: extractDate(input, referenceDate, dateOptions),
    };
  }

  const isTransfer = intent === 'register_transfer';
  const account = [
    'register_income',
    'register_expense',
    'register_transfer',
    'set_balance',
    'ambiguous_balance_or_income',
  ].includes(intent)
    ? extractAccount(input, intent)
    : null;
  // BUG REAL (BUG 2): destino da transferência é uma entidade própria --
  // "para o Inter" nunca é a origem da movimentação.
  const destinationAccount = isTransfer ? extractDestinationAccount(input) : null;

  return {
    amount: extractAmount(input),
    category: null,
    description: extractDescription(input, intent, account, destinationAccount),
    account,
    ...(isTransfer ? { destinationAccount } : {}),
    date: extractDate(input, referenceDate, dateOptions),
  };
}
