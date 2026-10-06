// Primeira fala da conversa em tempo real (épico #116). Ao abrir a
// conversa, a Uni cumprimenta a pessoa com a mesma voz da conversa, em vez
// do áudio gravado que tocava ao abrir o app. A frase sugerida vem da
// saudação de texto da Home (resolveSimplifiedGreeting), para as duas
// dizerem a mesma coisa.

const MAX_SUGGESTED_LENGTH = 160;

function sanitizeLine(value) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUGGESTED_LENGTH)
    : '';
}

export function buildRealtimeGreetingInstructions({ suggestedGreeting, hasPendingDraft = false } = {}) {
  const line = sanitizeLine(suggestedGreeting);
  const parts = [
    'Comece a conversa agora, antes de a pessoa falar.',
    line
      ? `Cumprimente com esta ideia, com naturalidade e sem ler palavra por palavra: "${line}".`
      : 'Cumprimente a pessoa com calor, em poucas palavras.',
  ];
  if (hasPendingDraft) {
    parts.push('Diga também que há um rascunho de lançamento na tela esperando confirmação.');
  }
  parts.push('Termine perguntando, em poucas palavras, o que ela quer fazer. No máximo duas frases curtas. Não cite valores nem dados financeiros.');
  return parts.join(' ');
}

// Evento do canal da Realtime que pede a primeira resposta da Uni com essas
// instruções, só para esta resposta.
export function buildRealtimeGreetingEvent(instructions) {
  return { type: 'response.create', response: { instructions } };
}
