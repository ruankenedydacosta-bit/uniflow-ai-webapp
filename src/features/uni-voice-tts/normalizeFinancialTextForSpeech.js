// HOTFIX FINAL P3: valores monetários ("R$ 497,80") às vezes são
// pronunciados de forma embolada pelo provider de TTS (ElevenLabs/fallback)
// quando lidos como símbolo+dígitos crus. Esta transformação é EXCLUSIVA
// para o texto enviado à voz -- nunca altera o texto visual (message.text),
// nunca altera dado financeiro nenhum, nunca roda no domínio financeiro
// (composeNaturalFinancialResponse etc. continuam produzindo "R$ 497,80"
// normalmente). É aplicada só nos dois pontos únicos que chamam
// uniVoice.speak (ver UniChatPage.jsx, handleSpeakMessage/
// speakSideEffectNotice), sobre o texto JÁ pronto para fala.
//
// Não usa nenhum utilitário de extenso existente porque nenhum converte
// NÚMERO -> PALAVRAS (o que existe em uni-intents/entityExtractor.js é o
// sentido oposto: reconhecer "mil reais" como 1000 dentro do texto do
// usuário). Português brasileiro, singular/plural de real/centavo cobertos.

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

/** Converte um inteiro de 0 a 999 para português por extenso. */
function belowThousandToWords(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const parts = [];
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred) parts.push(HUNDREDS[hundred]);
  if (rest > 0 && rest < 10) {
    parts.push(UNITS[rest]);
  } else if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else if (rest >= 20) {
    const ten = Math.floor(rest / 10);
    const unit = rest % 10;
    parts.push(unit ? `${TENS[ten]} e ${UNITS[unit]}` : TENS[ten]);
  }
  return parts.join(' e ');
}

/** Converte um inteiro não negativo (até 999.999.999) para português por extenso. */
export function integerToWords(value) {
  const n = Math.trunc(Math.abs(Number(value)) || 0);
  if (n === 0) return 'zero';

  const million = Math.floor(n / 1000000);
  const afterMillion = n % 1000000;
  const thousand = Math.floor(afterMillion / 1000);
  const rest = afterMillion % 1000;

  const parts = [];
  if (million) {
    parts.push(million === 1 ? 'um milhão' : `${belowThousandToWords(million)} milhões`);
  }
  if (thousand) {
    parts.push(thousand === 1 ? 'mil' : `${belowThousandToWords(thousand)} mil`);
  }
  if (rest > 0) {
    // "e" só entra antes do último grupo quando ele é < 100 ou uma centena
    // redonda (regra padrão do português para números por extenso) -- ex.:
    // "mil e cem" / "mil e vinte", mas "mil duzentos e trinta e quatro"
    // (sem "e" antes de "duzentos").
    const needsE = parts.length > 0 && (rest < 100 || rest % 100 === 0);
    parts.push(`${needsE ? 'e ' : ''}${belowThousandToWords(rest)}`);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Converte um valor em reais (número, ex.: 497.8) para "quatrocentos e noventa e sete reais e oitenta centavos". */
export function amountToSpeech(amount) {
  const safeAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;
  const totalCents = Math.round(safeAmount * 100);
  const reais = Math.floor(totalCents / 100);
  const centavos = totalCents % 100;

  const parts = [];
  if (reais > 0 || centavos === 0) {
    parts.push(`${integerToWords(reais)} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    parts.push(`${integerToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return parts.join(' e ');
}

// "R$ 1.234,56" / "R$ 80,00" / "R$ 0,50" / "R$ 16.904" (sem centavos, só
// milhar) -- separador de milhar '.', decimal ',' OPCIONAL (causa raiz da
// cobertura incompleta: a versão anterior exigia `,\d{2}` obrigatoriamente,
// então qualquer valor inteiro sem centavos -- "R$ 16.904" -- nunca batia
// no padrão e passava para o TTS cru, com o símbolo e os dígitos brutos).
// Símbolo com ou sem espaço antes do valor. Sinal opcional (-/+) antes do
// símbolo, formato usado por formatSignedCurrency (uniChatAdapter.js).
const MONEY_PATTERN = /(?:([+-])\s*)?R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g;

/**
 * Transforma toda ocorrência de valor monetário em BRL dentro de `text`
 * para português falado por extenso -- preserva o restante da frase
 * intacto. Nunca usado no texto visual/persistido, só no texto que vai
 * para o provider de TTS (ver handleSpeakMessage/speakSideEffectNotice em
 * UniChatPage.jsx). Texto sem valores monetários volta inalterado.
 */
export function normalizeFinancialTextForSpeech(text) {
  if (!text) return text;
  return text.replace(MONEY_PATTERN, (match, sign, integerPart, centsPart) => {
    const numericValue = Number(`${integerPart.replace(/\./g, '')}.${centsPart ?? '0'}`);
    if (!Number.isFinite(numericValue)) return match;
    const spoken = amountToSpeech(numericValue);
    return sign === '-' ? `menos ${spoken}` : spoken;
  });
}
