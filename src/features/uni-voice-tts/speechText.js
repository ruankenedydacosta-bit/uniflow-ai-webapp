// BLOCO VOZ 1 (confiabilidade da voz): gera uma versão curta e natural do
// texto para a voz sem alterar o texto completo exibido na tela. Corta no
// último fim de frase (. ! ?) dentro do limite; sem um fim de frase razoável,
// corta na última palavra completa. Nunca corta no meio de uma palavra e
// nunca devolve string vazia enquanto houver texto de entrada.
//
// maxLength inválido (não numérico, NaN, <= 0) é ignorado: o texto completo
// é devolvido sem corte -- um limite inválido nunca pode justificar truncar
// a narração. Palavra única maior que o limite também volta inteira (cortar
// uma palavra geraria áudio truncado no meio dela); nesse caso a Edge
// Function responde TEXT_TOO_LONG e a interface mostra a mensagem amigável.
export function buildSpeechText(text, maxLength) {
  if (!text) return text;
  const trimmed = text.trim();
  if (
    typeof maxLength !== 'number'
    || !Number.isFinite(maxLength)
    || maxLength <= 0
  ) {
    return trimmed;
  }
  if (trimmed.length <= maxLength) return trimmed;

  const window = trimmed.slice(0, maxLength);
  // A janela já encerra exatamente num fim de frase ('. ' no limite etc.) --
  // devolver como está evita adicionar reticências sem necessidade.
  if (/[.!?]\s*$/.test(window)) return window.trim();

  const lastSentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('.\n'),
    window.lastIndexOf('!\n'),
    window.lastIndexOf('?\n'),
  );
  if (lastSentenceEnd > maxLength * 0.4) {
    return window.slice(0, lastSentenceEnd + 1).trim();
  }

  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > 0) {
    return `${window.slice(0, lastSpace).trim()}…`;
  }
  // Sem nenhum espaço na janela (palavra única): voltar o texto inteiro é a
  // única opção que não corta palavra ao meio -- a Edge Function responde
  // TEXT_TOO_LONG e a interface mostra a mensagem amigável.
  return trimmed;
}
