import { normalizeFinancialText } from './intentClassifier.js';
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

function hasAmbiguousAmount(input) {
  const normalized = normalizeFinancialText(input);
  const numberTerm = '(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)';
  return new RegExp(`\\b${numberTerm}\\s+ou\\s+${numberTerm}\\b`, 'u').test(normalized);
}

export function extractAmount(input) {
  if (typeof input !== 'string') return null;
  if (hasAmbiguousAmount(input)) return null;

  const match = input.match(MONEY_PATTERN);
  if (!match) return findWrittenMoney(input)?.amount ?? null;

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

  const transferPattern = /\b(?:para|pro|pra)\s+(?:(?:a\s+)?conta\s+|o\s+|a\s+)?([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanh[ãa]|dia\s+\d)\b|[.!?,;:]|$)/iu;
  const paymentPattern = /\b(?:pelo|pela|na\s+conta|no\s+banco|da\s+conta|do\s+banco)\s+([\p{L}\d][\p{L}\d._ -]*?)(?=\s+(?:hoje|ontem|amanh[ãa]|dia\s+\d)\b|[.!?,;:]|$)/iu;
  const match = input.match(
    intent === 'register_transfer' ? transferPattern : paymentPattern,
  );

  return match ? titleCase(match[1]) : null;
}

// BLOCO E: delega para relativeDateResolver.js -- mesma resolucao
// determinística usada para validar datas vindas da camada neural
// (financial_plan), agora tambem cobrindo anteontem, dia da semana, "dia N",
// fim/comeco do mes (antes so hoje/ontem/amanha/data explicita).
export function extractDate(input, referenceDate = null) {
  if (typeof input !== 'string') return null;
  return resolveRelativeDateExpression(input, referenceDate).resolvedDate;
}

function extractDescription(input, intent, account) {
  if (typeof input !== 'string') return null;
  const cleanInput = input.trim().replace(/[.!?,;:]+$/g, '');

  if (intent === 'register_transfer') {
    return account ? `Transferência para ${account}` : 'Transferência';
  }

  let description = cleanInput.replace(MONEY_PATTERN, ' ');
  const writtenMoney = findWrittenMoney(cleanInput);
  if (writtenMoney) {
    description = `${description.slice(0, writtenMoney.start)} ${description.slice(writtenMoney.end)}`;
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
    // BUG REAL: "coloquei/botei/foi/lancei/lança/registra/anota" nao eram
    // reconhecidos aqui -- a descricao ficava com o verbo grudado
    // ("Coloquei De Gasolina" em vez de "Gasolina").
    .replace(/^(?:eu\s+)?(?:paguei|gastei|comprei|abasteci|recebi|ganhei|faturei|entrou|caiu|custou|saiu|coloquei|botei|foi|lancei|lance|lan[çc]a|registrei|registra|registro|anotei|anota)\b/iu, '')
    .replace(/^(?:quero\s+)?(?:juntar|guardar|economizar)\b/iu, '')
    // Substantivo genérico de lançamento ("uma despesa de", "um gasto de")
    // que sobra apos remover o verbo imperativo -- nao descreve a compra em
    // si, entao e removido antes da preposicao final.
    .replace(/^\s*(?:uma?\s+)?(?:despesa|gasto|receita|entrada|pagamento)\s+(?:de\s+)?/iu, '')
    .replace(
      /^\s*(?:de|do|da|no|na|em|para|pra|pro)\s+(?:(?:uma|um|o|a)\b)?\s*/iu,
      '',
    )
    .trim();

  if (/^(?:mais|e\s+mais|tambem)$/iu.test(description)) return null;
  return titleCase(description);
}

export function extractEntities(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const intent = safeOptions.intent ?? 'question';
  const referenceDate = safeOptions.referenceDate ?? null;
  const account = ['register_income', 'register_expense', 'register_transfer'].includes(intent)
    ? extractAccount(input, intent)
    : null;

  return {
    amount: extractAmount(input),
    category: null,
    description: extractDescription(input, intent, account),
    account,
    date: extractDate(input, referenceDate),
  };
}
