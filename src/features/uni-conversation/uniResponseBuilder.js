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
  account_required: (action) => buildAccountClarificationQuestion(action, 'account'),
  account_not_found: 'Não encontrei essa conta entre as contas deste espaço. Qual conta você quer usar?',
  account_ambiguous: 'Encontrei mais de uma conta parecida. Qual delas você quer usar?',
  account_archived: 'Encontrei essa conta arquivada. Você quer reativá-la ou criar uma nova conta?',
  destination_account_required: (action) => buildAccountClarificationQuestion(action, 'destinationAccount'),
  category_required: 'Em qual categoria essa movimentação se encaixa?',
  // BLOCO B1/B2: mensagens dinâmicas, dependem da categoria/nome proposto pela ação.
  category_approximate: (action) => `Esse gasto parece ser de ${action?.proposedCategory?.name ?? 'uma categoria existente'}. Posso usar essa categoria?`,
  category_not_found: (action) => (action?.proposedCategoryName
    ? `A categoria ${action.proposedCategoryName} ainda não existe. Deseja criá-la?`
    : 'Não encontrei uma categoria compatível. Qual categoria existente você quer usar?'),
  category_incompatible: 'Essa categoria não é compatível com o tipo de lançamento. Qual categoria você quer usar?',
  description_required: 'Como você quer identificar esse lançamento?',
  date_invalid: 'Qual é a data correta dessa movimentação?',
  // Ajuste de saldo: pergunta de decisão (receita vs saldo) e validações
  // do delta -- nunca decidimos a intenção pela pessoa.
  ambiguous_balance_or_income: (action) => (action?.amount != null
    ? `Entendi que você está com ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(action.amount)}. Você quer registrar como entrada ou ajustar o saldo para esse valor?`
    : 'Você quer registrar esse valor como entrada ou ajustar o saldo?'),
  balance_required: 'Não consegui identificar o saldo atual dessa conta para calcular o ajuste. Tente novamente em instantes.',
  balance_same: 'O saldo dessa conta já é esse valor. Se quiser registrar outro lançamento, é só dizer o que aconteceu.',
});

export function buildAccountClarificationQuestion(action, field = 'account') {
  if (action?.transactionType === 'income') {
    return 'Em qual conta você recebeu esse valor?';
  }
  if (action?.transactionType === 'expense') {
    return 'Em qual conta você fez esse pagamento?';
  }
  if (action?.transactionType === 'transfer') {
    return field === 'destinationAccount'
      ? 'Para qual conta o valor foi transferido?'
      : 'De qual conta o valor foi transferido?';
  }
  if (action?.transactionType === 'adjustment') {
    return 'Em qual conta você quer ajustar o saldo?';
  }
  return 'Qual conta você quer usar nesta movimentação?';
}

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

// Lançamento com data futura fica como previsto. O texto diz isso antes e
// depois de registrar: na voz, a Uni só fala o que está na resposta.
export function formatShortDate(isoDate) {
  const [, month, day] = String(isoDate ?? '').split('-');
  return `${day}/${month}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// planned só é true com data válida (financialIntentAction).
export function buildPlannedConfirmationText(action) {
  return `Perfeito. Revise as informações abaixo. A data é ${formatShortDate(action.date)}, então o lançamento fica previsto até você confirmar.`;
}

export function buildPlannedCompletionText(action) {
  const date = formatShortDate(action.date);
  if (action.transactionType === 'transfer') {
    const source = action.account?.name;
    const destination = action.destinationAccount?.name;
    const detail = action.amount != null && source && destination
      ? ` de ${formatCurrency(action.amount)} de ${source} para ${destination}`
      : '';
    return `Pronto. A transferência${detail} ficou prevista para ${date}. Confirme no Financeiro quando ela acontecer.`;
  }
  return `Pronto. O lançamento ficou previsto para ${date}. Confirme no Financeiro quando ele acontecer.`;
}

export function buildConfirmationResponse(action, options = {}) {
  const resolved = resolveCopy(options);
  return { text: action?.planned ? buildPlannedConfirmationText(action) : READY_FOR_CONFIRMATION_TEXT, ...resolved };
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
  if (action?.planned) {
    return { text: buildPlannedCompletionText(action), ...resolved };
  }
  // BUG REAL (BUG 2): transferência executada precisa dizer exatamente o
  // que foi feito ("Pronto. Transferi R$ 100 do Nubank para o Inter.") --
  // nunca o texto genérico de lançamento.
  if (action?.transactionType === 'transfer') {
    const amount = action.amount != null
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(action.amount)
      : null;
    const source = action.account?.name;
    const destination = action.destinationAccount?.name;
    if (amount && source && destination) {
      return {
        // Sem artigos fixos: nomes como "Conta principal" quebrariam
        // "do Conta principal"/"para o Conta principal".
        text: `Pronto. Transferi ${amount} de ${source} para ${destination}.`,
        ...resolved,
      };
    }
  }
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
