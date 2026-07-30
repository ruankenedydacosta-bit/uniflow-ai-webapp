import {
  buildPersonalityInstructions,
  resolvePersonality,
} from '../uni-personality/index.js';

const PROFILE_COPY = Object.freeze({
  balanced: {
    confirmation: 'Entendi o lançamento. Confira os dados antes de registrar.',
    completed: 'Tudo certo. O lançamento foi registrado e já faz parte da sua visão financeira.',
    canceled: 'Tudo bem. Não registrei nada.',
  },
  direct: {
    confirmation: 'Lançamento identificado. Confirme os dados para registrar.',
    completed: 'Lançamento registrado. Sua visão financeira já foi atualizada.',
    canceled: 'Cancelado. Nenhum lançamento foi criado.',
  },
  warm: {
    confirmation: 'Entendi. Vamos conferir com calma antes de registrar.',
    completed: 'Pronto. Registrei o lançamento e organizei essa informação para você.',
    canceled: 'Sem problema. Não registrei nada, e você pode tentar novamente quando quiser.',
  },
  strategic: {
    confirmation: 'A movimentação foi estruturada. Revise os dados antes de incorporá-la ao financeiro.',
    completed: 'Movimentação registrada e incorporada ao contexto financeiro atual.',
    canceled: 'Operação cancelada. O contexto financeiro não foi alterado.',
  },
});

const ISSUE_MESSAGES = Object.freeze({
  amount_required: 'Qual foi o valor dessa movimentação?',
  account_required: 'Em qual conta você fez esse pagamento?',
  account_not_found: 'Não encontrei essa conta entre as contas deste espaço. Qual conta você quer usar?',
  account_ambiguous: 'Encontrei mais de uma conta parecida. Qual delas você quer usar?',
  account_archived: 'Encontrei essa conta arquivada. Você quer reativá-la ou criar uma nova conta?',
  destination_account_required: 'Para qual conta o valor foi transferido?',
  category_required: 'Em qual categoria essa movimentação se encaixa?',
  // BLOCO B1/B2: mensagens dinâmicas, dependem da categoria/nome proposto pela ação.
  category_approximate: (action) => `Esse gasto parece ser de ${action?.proposedCategory?.name ?? 'uma categoria existente'}. Posso usar essa categoria?`,
  category_not_found: (action) => (action?.proposedCategoryName
    ? `A categoria ${action.proposedCategoryName} ainda não existe. Deseja criá-la?`
    : 'Não encontrei uma categoria compatível. Qual categoria existente você quer usar?'),
  category_incompatible: 'Essa categoria não é compatível com o tipo de lançamento. Qual categoria você quer usar?',
  description_required: 'Como você quer identificar esse lançamento?',
  date_invalid: 'Qual é a data correta dessa movimentação?',
});

function resolveCopy(options = {}) {
  const personality = resolvePersonality({
    preferredProfile: options.profileId,
    context: {
      workspaceType: options.workspaceType,
      situation: options.situation ?? 'routine',
    },
    cognitiveMap: options.cognitiveMap,
  });

  return {
    personality,
    copy: PROFILE_COPY[personality.profileId],
    instructions: buildPersonalityInstructions({
      preferredProfile: personality.profileId,
      context: { workspaceType: options.workspaceType, situation: options.situation ?? 'routine' },
      cognitiveMap: options.cognitiveMap,
    }),
  };
}

// BUG REAL (fluxo de confirmação financeira simples): a transição para
// 'ready' precisa de uma frase curta e SEMPRE igual -- nunca repetir
// valor/conta em prosa (isso já é o card estruturado logo abaixo) nem
// formular como uma nova pergunta ("o pagamento foi no Nubank?", "ficou
// associado ao Nubank", "você confirma que foi no Nubank?"). Qualquer
// variação textual aqui arrisca ser lida como mais uma etapa de confirmação
// conversacional, adiando a exibição do card. Único texto para
// expense/income/transfer, independente de personalidade.
const READY_FOR_CONFIRMATION_TEXT = 'Perfeito. Revise as informações abaixo antes de registrar.';

export function buildConfirmationResponse(action, options = {}) {
  const resolved = resolveCopy(options);
  return { text: READY_FOR_CONFIRMATION_TEXT, ...resolved };
}

export function buildClarificationResponse(action, options = {}) {
  const resolved = resolveCopy(options);
  const issue = action?.issues?.[0];
  const entry = ISSUE_MESSAGES[issue?.code];
  const text = typeof entry === 'function' ? entry(action) : (entry ?? 'Preciso confirmar um detalhe antes de continuar.');
  return {
    text,
    issue,
    ...resolved,
  };
}

export function buildCompletionResponse(action, options = {}) {
  const resolved = resolveCopy(options);
  return { text: resolved.copy.completed, ...resolved };
}

export function buildCanceledResponse(options = {}) {
  const resolved = resolveCopy(options);
  return { text: resolved.copy.canceled, ...resolved };
}

export function buildExecutionErrorResponse(error, options = {}) {
  const resolved = resolveCopy({ ...options, situation: 'uncertainty' });
  const detail = typeof error?.message === 'string' && error.message.trim()
    ? ' Seus dados foram preservados; você pode revisar e tentar novamente.'
    : '';
  return {
    text: `Não consegui registrar essa movimentação agora.${detail}`,
    ...resolved,
  };
}
