// Ponte entre a ferramenta da conversa por voz e o chat da Uni. A conversa
// em tempo real não decide nada sobre dinheiro: ela passa a frase da pessoa
// ao mesmo pipeline do texto (uni-interpret, card de confirmação, RPC) e
// fala a resposta que ele devolve.

// O nome e a descrição precisam bater com a sessão criada em
// supabase/functions/uni-voice-realtime-session/index.ts.
export const REALTIME_TOOL_NAMES = Object.freeze({
  SEND_TO_UNI: 'enviar_para_uni',
});

// Tempo máximo esperando o chat responder antes de a Uni avisar a pessoa.
export const REALTIME_TOOL_TIMEOUT_MS = 20000;

export function parseRealtimeToolArguments(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readRealtimeToolPhrase(args) {
  return typeof args?.frase === 'string' ? args.frase.trim() : '';
}

// Resposta da Uni que chegou depois da mensagem de referência. Sem
// referência (conversa vazia), qualquer resposta da Uni vale.
export function findUniReplyAfter(messages, baselineId) {
  if (!Array.isArray(messages)) return null;
  const baselineIndex = baselineId === null || baselineId === undefined
    ? -1
    : messages.findIndex((message) => message?.id === baselineId);
  const after = messages.slice(baselineIndex + 1);
  // A mensagem da pessoa precisa ter entrado antes, senão a resposta é de
  // outro turno.
  const userIndex = after.findIndex((message) => message?.from === 'user');
  if (userIndex === -1) return null;
  const replies = after.slice(userIndex + 1)
    .filter((message) => message?.from === 'uni' && typeof message.text === 'string' && message.text.trim());
  return replies.at(-1) ?? null;
}

export function buildRealtimeToolOutput(reply) {
  return JSON.stringify({
    resposta: reply.text.trim(),
    aguardando_confirmacao: reply.confirmation?.status === 'pending',
  });
}

export function buildRealtimeToolErrorOutput(motivo) {
  return JSON.stringify({ erro: motivo });
}

// Rascunho aguardando confirmação no momento do envio: confirmar com erro ou
// cancelar só altera o card, sem resposta nova da Uni.
export function findPendingConfirmation(messages) {
  if (!Array.isArray(messages)) return null;
  return [...messages].reverse().find((message) => message?.confirmation?.status === 'pending') ?? null;
}

export function snapshotRealtimeToolTurn(messages) {
  const confirmation = findPendingConfirmation(messages);
  return Object.freeze({
    baselineId: Array.isArray(messages) ? messages.at(-1)?.id ?? null : null,
    confirmationId: confirmation?.id ?? null,
    confirmationError: confirmation?.confirmation?.confirmationError ?? null,
  });
}

// Saída da ferramenta assim que o chat termina o turno; null enquanto não
// terminou.
export function resolveRealtimeToolOutcome(messages, turn) {
  const reply = findUniReplyAfter(messages, turn.baselineId);
  if (reply) return buildRealtimeToolOutput(reply);
  if (!turn.confirmationId) return null;

  const card = messages.find((message) => message?.id === turn.confirmationId);
  const confirmation = card?.confirmation;
  if (!confirmation) return null;
  if (confirmation.confirmationError && confirmation.confirmationError !== turn.confirmationError) {
    return buildRealtimeToolErrorOutput(confirmation.confirmationError);
  }
  if (confirmation.status === 'canceled') {
    return JSON.stringify({ resposta: 'Rascunho cancelado. Nada foi lançado.', aguardando_confirmacao: false });
  }
  if (confirmation.status === 'expired') {
    return JSON.stringify({ resposta: 'Esse rascunho expirou. Nada foi lançado.', aguardando_confirmacao: false });
  }
  return null;
}
