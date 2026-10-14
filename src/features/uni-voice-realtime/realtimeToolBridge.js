// Ponte entre a ferramenta da conversa por voz e o chat da Uni. A conversa
// em tempo real não decide nada sobre dinheiro: ela passa a frase da pessoa
// ao mesmo pipeline do texto (parser do chat, card de confirmação, RPC) e
// fala a resposta que ele devolve.

// O nome e a descrição precisam bater com a sessão criada em
// supabase/functions/uni-voice-realtime-session/index.ts.
export const REALTIME_TOOL_NAMES = Object.freeze({
  SEND_TO_UNI: 'enviar_para_uni',
  SAVE_NAME_PRONUNCIATION: 'salvar_pronuncia_do_nome',
  ANSWER_DRAFT: 'responder_rascunho',
  END_CONVERSATION: 'encerrar_conversa',
});

// Depois de pedir para encerrar, a conversa espera a Uni terminar a
// despedida. Sem áudio de volta, fecha mesmo assim depois deste tempo.
export const REALTIME_GOODBYE_TIMEOUT_MS = 8000;

// Decisão falada sobre o card vira a frase que o chat já entende. Quem
// interpreta "manda ver" ou "fechou" é a conversa; o chat só recebe uma das
// frases que classifyPendingActionReply reconhece.
export const REALTIME_DRAFT_REPLIES = Object.freeze({
  confirmar: 'Confirmar',
  cancelar: 'Cancelar',
  cancelar_tudo: 'Cancelar tudo',
});

// Mesmo teto da coluna profiles.name_pronunciation.
export const NAME_PRONUNCIATION_MAX_LENGTH = 60;

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

// Frase do chat para a ação pedida; vazio quando a ação não é conhecida.
export function readRealtimeDraftReply(args) {
  return Object.hasOwn(REALTIME_DRAFT_REPLIES, args?.acao ?? '') ? REALTIME_DRAFT_REPLIES[args.acao] : '';
}

function messagesAfter(messages, baselineId) {
  if (!Array.isArray(messages)) return [];
  const baselineIndex = baselineId === null || baselineId === undefined
    ? -1
    : messages.findIndex((message) => message?.id === baselineId);
  return messages.slice(baselineIndex + 1);
}

function isUniReply(message) {
  return message?.from === 'uni' && typeof message.text === 'string' && Boolean(message.text.trim());
}

// Resposta da Uni que chegou depois da mensagem de referência. Sem
// referência (conversa vazia), qualquer resposta da Uni vale.
export function findUniReplyAfter(messages, baselineId) {
  const after = messagesAfter(messages, baselineId);
  // A mensagem da pessoa precisa ter entrado antes, senão a resposta é de
  // outro turno.
  const userIndex = after.findIndex((message) => message?.from === 'user');
  if (userIndex === -1) return null;
  return after.slice(userIndex + 1).filter(isUniReply).at(-1) ?? null;
}

// Pronúncia do nome como o banco aceita: uma linha, sem aspas, até 60
// caracteres. Vazio quando não há o que gravar.
export function readRealtimeNamePronunciation(args) {
  if (typeof args?.pronuncia !== 'string') return '';
  return args.pronuncia
    .replace(/[\p{Cc}"]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_PRONUNCIATION_MAX_LENGTH)
    .trim();
}

export function buildNamePronunciationSavedOutput() {
  return JSON.stringify({
    resposta: 'Pronúncia guardada. Diga o nome do jeito novo para a pessoa conferir. As próximas conversas já começam com ela.',
  });
}

export function buildEndConversationOutput() {
  return JSON.stringify({
    resposta: 'A conversa vai ser encerrada assim que você se despedir. Despeça-se em uma frase curta, sem perguntas.',
  });
}

// Rascunho igual a um lançamento já registrado: a instrução de sempre ("diga
// o valor, o que é e a conta") faria a IA ler o rascunho e pular o aviso.
export const AVISO_LANCAMENTO_REPETIDO = 'A Uni achou um lançamento igual já registrado. Diga à pessoa que parece que esse lançamento já existe, com os dados que vieram na resposta, e pergunte se quer lançar de novo. Só confirme se ela disser que sim.';

export function buildRealtimeToolOutput(reply) {
  const aguardando = reply.confirmation?.status === 'pending';
  return JSON.stringify({
    resposta: reply.text.trim(),
    aguardando_confirmacao: aguardando,
    ...(aguardando && reply.confirmation.lancamentoRepetido ? { aviso: AVISO_LANCAMENTO_REPETIDO } : {}),
  });
}

// BUG REAL EM PRODUÇÃO (voz, 11/10/2026): a Uni respondeu "Qual foi o valor
// dessa movimentação?" quatro vezes seguidas e a IA da conversa reenviou a
// mesma frase a cada vez, sem dizer à pessoa que estava travado. A mesma
// pergunta logo depois da anterior, sem nada no meio (toque, texto
// digitado), vai com um aviso. Rascunho novo repete "Revise as informações"
// de propósito e não conta.
export const AVISO_RESPOSTA_REPETIDA = 'A Uni fez a mesma pergunta da vez anterior. Se a pessoa já tinha respondido, a Uni não entendeu a resposta: não envie a mesma frase de novo. Diga à pessoa o que a Uni está perguntando e que ela pode responder de outro jeito ou cancelar.';

// Resposta da Uni que encerrou o turno da ferramenta, para comparar com o
// próximo. null quando o turno terminou sem resposta nova.
export function snapshotRealtimeToolReply(messages, turn) {
  const reply = findUniReplyAfter(messages, turn.baselineId);
  return reply ? Object.freeze({ id: reply.id, text: reply.text.trim() }) : null;
}

export function warnRepeatedRealtimeReply(output, previousReply, turn) {
  const parsed = parseRealtimeToolArguments(output);
  const reply = typeof parsed?.resposta === 'string' ? parsed.resposta.trim() : '';
  const repeated = reply.endsWith('?')
    && parsed.aguardando_confirmacao !== true
    && Boolean(previousReply)
    && previousReply.id === turn?.baselineId
    && previousReply.text === reply;
  return repeated ? JSON.stringify({ ...parsed, aviso: AVISO_RESPOSTA_REPETIDA }) : output;
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
  // Card expirado não encerra o turno: o chat descarta o rascunho ao trocar
  // de assunto e a resposta nova chega em seguida. Encerrar aqui fazia a Uni
  // dizer "esse rascunho expirou" no meio de um ajuste.
  return null;
}

// Toque no card durante a conversa por voz. O chat responde por escrito, sem
// passar pela ferramenta, e a Uni da conversa precisa falar essa resposta:
// senão a pessoa confirma na tela e a conversa fica muda.
export const REALTIME_SCREEN_ACTIONS = Object.freeze({
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  EDIT: 'edit',
  // Desfazer pelo botão do aviso: a exclusão de um lançamento (#189) ou um
  // lançamento feito sem card (#81).
  UNDO: 'undo',
});

const SCREEN_ACTION_DESCRIPTIONS = Object.freeze({
  [REALTIME_SCREEN_ACTIONS.CONFIRM]: 'tocou em Confirmar no card da tela',
  [REALTIME_SCREEN_ACTIONS.CANCEL]: 'tocou em Cancelar no card da tela',
  [REALTIME_SCREEN_ACTIONS.EDIT]: 'mudou os campos do card na tela e salvou',
  [REALTIME_SCREEN_ACTIONS.UNDO]: 'tocou em Desfazer no aviso da tela, para voltar atrás na exclusão ou no lançamento que a Uni acabou de fazer',
});

const SCREEN_REPLY_MAX_LENGTH = 600;

// Retrato do card no momento do toque. O objeto da confirmação entra junto
// porque um novo erro igual ao anterior só se distingue por ele.
export function snapshotScreenActionTurn(messages) {
  const turn = snapshotRealtimeToolTurn(messages);
  const card = Array.isArray(messages) && turn.confirmationId
    ? messages.find((message) => message?.id === turn.confirmationId)
    : null;
  return Object.freeze({ ...turn, confirmation: card?.confirmation ?? null });
}

// O que a Uni deve dizer depois do toque. null enquanto o chat não terminou;
// { discard: true } quando a pessoa já falou ou escreveu outra coisa, porque
// aí o toque não teve resposta e o que vier é de outro turno.
export function resolveScreenActionOutcome(messages, turn) {
  const after = messagesAfter(messages, turn.baselineId);
  if (after.some((message) => message?.from === 'user')) return { discard: true };
  // Um toque pode render mais de uma resposta (ex.: "Categoria criada" e o
  // card retomado): a Uni fala todas.
  const replies = after.filter(isUniReply);
  if (replies.length) {
    return {
      text: replies.map((message) => message.text.trim()).join(' '),
      awaitingConfirmation: replies.at(-1).confirmation?.status === 'pending',
    };
  }
  if (!turn.confirmationId) return null;
  const confirmation = messages.find((message) => message?.id === turn.confirmationId)?.confirmation;
  const hasNewError = confirmation?.confirmationError && (
    confirmation.confirmationError !== turn.confirmationError
    || (turn.confirmation && confirmation !== turn.confirmation)
  );
  if (hasNewError) {
    return { text: confirmation.confirmationError, awaitingConfirmation: confirmation.status === 'pending', isError: true };
  }
  return null;
}

export function buildScreenActionInstructions(action, outcome) {
  const description = SCREEN_ACTION_DESCRIPTIONS[action] ?? 'mexeu no card da tela';
  const text = outcome.text.replace(/\s+/g, ' ').slice(0, SCREEN_REPLY_MAX_LENGTH);
  const parts = [
    `A pessoa ${description}, sem falar.`,
    outcome.isError ? `Deu errado. O app avisou: "${text}".` : `O app respondeu: "${text}".`,
    'Diga o essencial a ela agora, em uma frase, sem ler palavra por palavra e sem oferecer ajuda extra.',
  ];
  if (outcome.awaitingConfirmation) {
    parts.push('O rascunho continua esperando confirmação: pergunte se pode confirmar.');
  }
  parts.push('Não chame ferramentas para isso.');
  return parts.join(' ');
}
