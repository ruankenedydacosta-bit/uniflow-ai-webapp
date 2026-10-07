// Fecho das respostas que encerram um card de confirmação. Depois de
// confirmar ou cancelar, a Uni devolve a vez para a pessoa em vez de parar
// no "registrado".

export const FOLLOW_UP_QUESTION = 'Quer que eu faça mais alguma coisa?';

export const CANCELED_WITH_FOLLOW_UP = `Cancelado, sem problemas. ${FOLLOW_UP_QUESTION}`;

export function withFollowUpQuestion(text) {
  const base = typeof text === 'string' ? text.trim() : '';
  return base ? `${base} ${FOLLOW_UP_QUESTION}` : FOLLOW_UP_QUESTION;
}
