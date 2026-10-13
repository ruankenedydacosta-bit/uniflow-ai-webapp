// FASE ESTADOS DE PROCESSAMENTO: camada de apresentação PURA que converte um
// estado real do pipeline (os mesmos valores de SIMPLIFIED_UNI_STATES, ver
// src/features/simplified-app/simplifiedHomeState.js -- aqui recebidos como
// string simples para não criar uma dependência de simplified-app dentro de
// uni-chat) em mensagens humanas curtas.
//
// Regra de honestidade (pedido explícito do produto): nunca afirmar uma
// operação que não está de fato acontecendo, e nunca rotacionar várias
// mensagens só para "parecer ocupado" -- UMA mensagem por turno de
// processamento, escolhida de acordo com a operação REAL. `interpreting`
// aceita um `context.operationHint` opcional (derivado de uma classificação
// já existente no cliente, ex.: classifyIntent -- nunca uma nova regra
// inventada só para isto) para escolher uma mensagem específica e honesta;
// sem hint reconhecido, cai no genérico "Entendendo seu pedido…" (verdadeiro
// durante qualquer interpretação). `executing`, do mesmo jeito, escolhe UMA
// mensagem compatível com o tipo real da ação (actionKind, vindo de
// ActionConfirmation/buildConfirmationFromAction).
//
// Este módulo não usa React, não agenda timers e não depende de nenhum
// estado de componente -- só funções puras, testáveis com node:test sem
// fake timers.

const DEFAULT_INTERPRETING_MESSAGE = 'Entendendo seu pedido…';

// Mensagens honestas por operação REAL em curso durante a interpretação --
// nunca todas mostradas, nunca rotacionadas; escolhida por `operationHint`.
const INTERPRETING_MESSAGE_BY_OPERATION_HINT = Object.freeze({
  consulting_data: 'Consultando seu histórico financeiro…',
  organizing_transaction: 'Organizando suas movimentações…',
  preparing_recommendation: 'Preparando uma recomendação…',
  calculating_impact: 'Calculando impacto no seu fluxo de caixa…',
});

const EXECUTING_LABEL_BY_ACTION_KIND = Object.freeze({
  adjustment: 'Atualizando seu saldo…',
  transfer: 'Organizando seus registros…',
  income: 'Registrando sua movimentação…',
  expense: 'Registrando sua movimentação…',
  delete_transaction: 'Excluindo o lançamento…',
});

const DEFAULT_EXECUTING_LABEL = 'Aplicando a alteração…';

// Mapeia o `intent` já classificado por classifyIntent (src/features/
// uni-intents/) para um `operationHint` de apresentação -- reaproveita uma
// classificação que já existe e já roda em CADA turno (nunca cria uma nova
// regra/regex só para decidir a mensagem de processamento). Intents sem
// mapeamento explícito (ex.: 'question', 'create_goal') caem no genérico
// via `getProcessingMessageSequence` -- nunca adivinha.
const OPERATION_HINT_BY_INTENT = Object.freeze({
  check_balance: 'consulting_data',
  register_income: 'organizing_transaction',
  register_expense: 'organizing_transaction',
  register_transfer: 'organizing_transaction',
  set_balance: 'organizing_transaction',
  ambiguous_balance_or_income: 'organizing_transaction',
  forecast: 'calculating_impact',
});

/**
 * Deriva o `operationHint` de apresentação a partir de um `intent` já
 * classificado (ver OPERATION_HINT_BY_INTENT). `null` quando não há
 * mapeamento honesto disponível -- o chamador cai no genérico.
 */
export function resolveOperationHintFromIntent(intent) {
  return OPERATION_HINT_BY_INTENT[intent] ?? null;
}

/**
 * Resolve a sequência ORDENADA de mensagens humanas para um estado real do
 * pipeline. Retorna sempre um array congelado com NO MÁXIMO uma mensagem
 * (nunca há rotação) -- estados sem mensagem de processamento (idle,
 * error -- já têm sua própria UI) retornam um array
 * vazio.
 */
export function getProcessingMessageSequence(state, context = {}) {
  switch (state) {
    case 'interpreting':
      return Object.freeze([
        INTERPRETING_MESSAGE_BY_OPERATION_HINT[context?.operationHint] ?? DEFAULT_INTERPRETING_MESSAGE,
      ]);
    case 'waiting_confirmation':
      return Object.freeze(['Aguardando sua confirmação…']);
    case 'executing':
      return Object.freeze([
        EXECUTING_LABEL_BY_ACTION_KIND[context?.actionKind] ?? DEFAULT_EXECUTING_LABEL,
      ]);
    default:
      return Object.freeze([]);
  }
}

/**
 * HOTFIX (abandono das mensagens rotativas): `getProcessingMessageSequence`
 * nunca mais devolve mais de uma mensagem por estado, então não há mais
 * nada para rotacionar -- mantido apenas como um no-op estável para não
 * quebrar o contrato de `useUniProcessingMessage.js` (que ainda agenda/
 * cancela um "plano", agora sempre vazio).
 */
export function buildProcessingRotationPlan() {
  return [];
}
