import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildUniPrefillFromState } from '../categories/categoryUtils.js';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import {
  buildAccountCreationConfirmation,
  buildCategoryCreationConfirmation,
  cancelAccountCreationDependency,
  cancelCategoryCreationDependency,
  classifyPendingActionReply,
  clearPendingActionStack,
  clearPendingAction,
  completeAccountCreationDependency,
  completeCategoryCreationDependency,
  createPendingActionCoordinator,
  CATEGORY_RESOLUTION_STATUS,
  findAccountCreationConflicts,
  getActivePendingAction,
  isAccountCreationDependency,
  isCategoryCreationDependency,
  isCancelEntirePendingFlow,
  loadPendingActionStack,
  loadPendingAction,
  resolvePendingActionInput,
  resolveFinancialCategory,
  savePendingActionStack,
  savePendingAction,
  startAccountCreationDependency,
  startCategoryCreationDependency,
  updateResumedFinancialSnapshot,
  useUniConversation,
  applyPlanOperationCorrection,
  cancelPlanOperation,
  createPendingFinancialPlan,
  getPersistablePlanOperations,
  isPlanReadyForFinalConfirmation,
  markPlanOperationConfirmed,
  markPlanOperationFailed,
  PLAN_OPERATION_STATUS,
  PLAN_STATUS,
  summarizePlanForNeuralContext,
  buildPlanCancelledText,
  buildPlanOperationCancelledText,
  buildPlanResultText,
  buildPlanSummaryText,
  findPlanOperationCancelTarget,
  parsePlanCorrectionOverrides,
  isUnsupportedIntentEligibleForPlan,
  looksLikeComplexFinancialText,
  looksLikeFreshFinancialStatement,
  looksLikeFreshBalanceStatement,
  looksLikeUnclassifiedFinancialStatement,
} from '../uni-conversation';
import { useUniLlm, AI_STATUS, resolveConversationStyle } from '../uni-llm';
import { createCategoryInferenceService } from '../uni-category-inference/index.js';
import { createFinancialPlanService } from '../uni-financial-plan/index.js';
import { executeFinancialIntentAction } from '../uni-conversation/financialIntentAction.js';
import { supabase, supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../../services/supabaseClient';
import {
  useUniVoiceTts, useVoicePreference, VOICE_TTS_STATUS, MAX_TTS_TEXT_LENGTH, buildSpeechText,
} from '../uni-voice-tts';
import {
  hasAutoSpokenMessage,
  markAutoSpokenMessage,
  markRestoredMessagesAsSpoken,
} from '../uni-voice-tts/spokenMessageSession.js';
import {
  hasNarratedText,
  markNarratedText,
} from '../uni-voice-tts/narratedTextSession.js';
import { buildWelcomeSessionKey, isWelcomeVoicePending, markWelcomeVoiceSettled } from '../simplified-app/welcomeVoiceSession.js';
import { useAccounts, useCategories, useTransactions, useFinancialBalances } from '../../hooks';
import { useGoals } from '../goals/useGoals';
import { buildFutureProjections } from '../future/futureService';
import { useUniChatFinancialData } from './useUniChatFinancialData';
import { useUniResponsePipeline } from './useUniResponsePipeline';
import { reserveMessageIds } from './messageIdRegistry.js';
import { classifyIntent } from '../uni-intents/index.js';
import {
  classifyFinancialQuery,
  buildQueryResponse,
  detectFutureFinancialIntent,
  buildFutureSafetyResponse,
} from './financialQueryInterpreter';
import { resolveFinancialQuery } from './financialQueryEngine';
import ChatHeader from './components/ChatHeader';
import EmptyState from './components/EmptyState';
import MessageBubble from './components/MessageBubble';
import TypingIndicator from './components/TypingIndicator';
import QuickSuggestions from './components/QuickSuggestions';
import ChatInput from './components/ChatInput';

import ScrollToLatest from './components/ScrollToLatest';
import HistoryPanel from './components/HistoryPanel';
import ErrorState from './components/ErrorState';
import {
  SUGGESTIONS_PESSOAL,
  SUGGESTIONS_EMPRESA,
} from './mockData';
import { SimplifiedHomeView } from '../simplified-app/index.js';
import { useOptionalSimplifiedProduct } from '../simplified-app/useSimplifiedProduct.js';
import {
  SIMPLIFIED_CHAT_MODE,
  SIMPLIFIED_PRODUCT_MODE,
} from '../simplified-app/simplifiedProductConfig.js';
import { resolveGreetingName } from './greeting';
import {
  loadHistory,
  saveHistory,
  loadActiveId,
  saveActiveId,
  createConversation as createLocalConversation,
  persistConversation,
  resolveInitialConversationState,
  saveActiveSource,
} from './chatHistory';
import {
  buildUserMessage,
  buildUniMessage,
  buildConfirmationFromAction,
  workspaceTypeToMode,
  modeToWorkspaceType,
} from './uniChatAdapter';
import { financialCrudMock, fallbackAccountTypes } from '../../pages/financeiro/financialCrud.mock';
import { notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { executeConfirmedFinancialAction } from '../../services/confirmedFinancialActionService.js';
import * as dataService from './uniChatDataService';
import styles from './UniChatPage.module.css';

const UNI_THINK_MIN_MS = 600;
// BLOCO F: mesmo TTL já usado pelo Pending Action Stack (pendingActionStorage.js)
// -- um plano financeiro pendente não pode ficar executável indefinidamente.
const FINANCIAL_PLAN_TTL_MS = 15 * 60 * 1000;
const ALLOWED_CHAT_WRITE_INTENTS = Object.freeze([
  'register_income',
  'register_expense',
  'set_balance',
  // "Tenho R$ 1.000" é ambiguidade intencional (receita vs saldo): a
  // allowlist precisa deixar a frase chegar a buildFinancialIntentAction,
  // que decide entre pergunta de clarificação e continuação.
  'ambiguous_balance_or_income',
  // BUG REAL (BUG 2): transferência fora da allowlist caía no fluxo do
  // LLM, que é instruído a NÃO executar transações (llmContext) e
  // respondia "Não consigo criar, alterar ou excluir movimentações por
  // aqui." -- a RPC já suporta transfer (migration 027); o bloqueio era
  // apenas este gate. ACTION_STATEMENT_INTENTS abaixo já incluía
  // register_transfer; o gate de escrita é que não.
  'register_transfer',
]);

// REGRA GERAL DE PRIORIDADE (CORREÇÃO URGENTE): DECLARAÇÕES e AÇÕES
// financeiras vencem CONSULTAS. Quando classifyIntent reconhece a frase
// como início de um lançamento/ajuste (saldo declarado, ambiguidade
// saldo/receita, receita, despesa, transferência, meta), a frase NUNCA
// passa pelos motores de consulta (FinancialQueryEngine nem interpretador
// legado) -- vai direto para o fluxo de registro. Sem este gate,
// "Recebi mil reais" virava transaction_reference e "Meu saldo no Nubank é
// mil reais" virava consulta de saldo (respondia o saldo atual em vez de
// iniciar o ajuste).
const ACTION_STATEMENT_INTENTS = new Set([
  'set_balance',
  'ambiguous_balance_or_income',
  'register_income',
  'register_expense',
  'register_transfer',
  'create_goal',
]);
const EMPTY_FINANCIAL_FALLBACK = Object.freeze({
  accounts: Object.freeze([]),
  categories: Object.freeze([]),
  transactions: Object.freeze([]),
});

const UNI_DETERMINISTIC_FALLBACK_TEXT =
  'Entendi. Por enquanto, posso ajudar a registrar movimenta\u00e7\u00f5es financeiras. Tente algo como "registrar uma despesa de R$ 50" ou "qual meu saldo?".';

function getLocalIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Guarda de criação de conta (BUG REAL): o parser determinístico propõe
// criar uma conta para QUALQUER texto que mencione uma conta desconhecida
// (accountResolution.js resolveFinancialAccount) -- inclusive PERGUNTAS
// como "quando gastei no caixa?" que não foram reconhecidas pelo
// FinancialQueryEngine. Frases com início de pergunta nunca podem virar
// proposta de criação de conta, nem no caminho de pendência (resposta a
// "em qual conta?") nem no fallback pós-interpret: conta só é criada com
// intenção explícita (registro) ou Pending Action aguardando o campo.
function isLikelyFinancialQuestion(text) {
  return /^(?:qual|quais|quanto|quantos|quantas|quando|onde|como|que|quem|por\s+que|o\s+que|para\s+que)\b/iu
    .test(String(text ?? '').trim());
}

export default function UniChatPage({ variant = 'full' }) {
  const { access } = useAccess();
  const simplifiedProduct = useOptionalSimplifiedProduct();
  const {
    profile,
    session,
    user,
    workspace,
    switchWorkspace,
    availableWorkspaces,
  } = useSession();
  const location = useLocation();
  const initialContextRef = useRef(false);
  const isSimplifiedExperience = variant === 'simplified-home' || variant === 'simplified';
  const effectiveWorkspace = isSimplifiedExperience
    ? simplifiedProduct?.workspace ?? null
    : workspace;
  const workspaceContextType = isSimplifiedExperience
    ? SIMPLIFIED_PRODUCT_MODE
    : access.currentWorkspace;

  const personalityProfileId = profile?.uni_personality_profile ?? 'balanced';
  const conversationStyle = resolveConversationStyle(profile?.conversation_style);
  const financialWorkspaceType = workspaceContextType;

  // ELEVEN2: fundacao geral de TTS (ELEVEN1) conectada ao chat -- substitui
  // o uso anterior de useUniVoiceOutput (infra de demo com allowlist) NESTE
  // ponto de integracao. uni-voice-output continua existindo/testado, so
  // deixou de ser consumido pelo chat principal (evita dois players/estados
  // de voz ativos ao mesmo tempo).
  const uniVoice = useUniVoiceTts();
  const voicePreference = useVoicePreference();
  const uniLlm = useUniLlm();
  // Qual mensagem o estado COMPARTILHADO de uniVoice.status representa
  // agora -- so essa mensagem mostra Gerando/Reproduzindo/Pausado/Erro;
  // as demais sempre veem IDLE (botao "Ouvir" neutro).
  const [voiceMessageId, setVoiceMessageId] = useState(null);

  // BLOCO VOZ 1: SEMPRE fala, mesmo quando o texto é longo demais para o
  // limite da Edge Function (MAX_TTS_TEXT_LENGTH) -- gera uma versão curta e
  // natural (buildSpeechText) para a voz, mas nunca altera o texto completo
  // exibido na tela (message.text no MessageBubble continua intacto).
  const handleSpeakMessage = useCallback((message) => {
    if (!message?.text) return;
    setVoiceMessageId(message.id);
    void uniVoice.speak(buildSpeechText(message.text, MAX_TTS_TEXT_LENGTH));
  }, [uniVoice]);

  // BLOCO VOZ 1: ponto ÚNICO para narrar um efeito colateral que NÃO gera
  // uma nova mensagem no array `messages` (ex.: erro de confirmação escrito
  // em message.confirmation.confirmationError) -- sem isso, esses avisos
  // nunca eram falados, pois o autoplay só observa `messages.at(-1).text`.
  // Só chamado por reportConfirmationError (nunca espalhado pelo arquivo).
  // Mesma política de narração do restante da Home: só quando simplificada
  // e com a preferência de voz ligada. Falha de voz é fire-and-forget
  // (void + hook que nunca lança) -- nunca quebra o fluxo de confirmação.
  const speakSideEffectNotice = useCallback((text) => {
    if (!isSimplifiedExperience || !voicePreference.enabled) return;
    if (!text) return;
    void uniVoice.speak(buildSpeechText(text, MAX_TTS_TEXT_LENGTH));
  }, [isSimplifiedExperience, voicePreference.enabled, uniVoice]);

  // BLOCO VOZ 1: registro + narração de erro de confirmação num ponto
  // central único (conta/categoria/transação). O erro fica visível no card
  // (confirmationError) mas NUNCA entra em `messages` -- por isso o
  // autoplay jamais o falaria sem esta chamada. Narra uma única vez por
  // erro; mensagens que entram em `messages` (pergunta, confirmação,
  // sucesso) continuam sendo faladas exclusivamente pelo autoplay, sem
  // duplicação.
  function reportConfirmationError(id, errorText) {
    setExecutionError(errorText);
    setMessages((prev) => prev.map((message) => (
      message.id === id
        ? { ...message, confirmation: { ...message.confirmation, confirmationError: errorText } }
        : message
    )));
    speakSideEffectNotice(errorText);
  }

  const handlePauseResumeVoice = useCallback(() => {
    if (uniVoice.status === VOICE_TTS_STATUS.PLAYING) {
      uniVoice.pause();
    } else if (uniVoice.status === VOICE_TTS_STATUS.PAUSED) {
      uniVoice.resume();
    }
  }, [uniVoice]);

  const handleStopVoice = useCallback(() => {
    uniVoice.stop();
  }, [uniVoice]);

  // BLOCO UNI 2: reflete SÓ a saída de voz (TTS gerando/tocando) -- nunca a
  // captura. Usado para: (a) mostrar o estado "falando" na Home; (b) impedir
  // que o botão de voz (Home ou /app/uni) inicie uma gravação nova enquanto
  // a Uni ainda está respondendo (o toque interrompe a fala em vez disso).
  const isSpeaking = uniVoice.status === VOICE_TTS_STATUS.LOADING
    || uniVoice.status === VOICE_TTS_STATUS.PLAYING;

  const financialFallback = isSimplifiedExperience
    ? EMPTY_FINANCIAL_FALLBACK
    : financialWorkspaceType === 'personal'
      ? financialCrudMock.personal
      : financialCrudMock.business;
  const accountTypeFallback = isSimplifiedExperience ? EMPTY_FINANCIAL_FALLBACK.accounts : fallbackAccountTypes;

  const accountState = useAccounts({
    workspaceId: effectiveWorkspace?.id,
    fallbackAccounts: financialFallback.accounts,
    fallbackAccountTypes: accountTypeFallback,
  });

  const categoryState = useCategories({
    workspaceId: effectiveWorkspace?.id,
    fallbackCategories: financialFallback.categories,
    context: financialWorkspaceType,
  });

  const transactionsState = useTransactions({
    workspaceId: effectiveWorkspace?.id,
    fallbackTransactions: financialFallback.transactions,
  });

  const balanceState = useFinancialBalances({ workspaceId: effectiveWorkspace?.id });

  const goalsState = useGoals({ workspaceId: effectiveWorkspace?.id });

  const futureProjections = useMemo(
    () => buildFutureProjections({
      workspaceBalance: balanceState.workspaceBalance,
      transactions: transactionsState.transactions,
      goals: goalsState.goals,
      selectedHorizon: 6,
    }),
    [balanceState.workspaceBalance, transactionsState.transactions, goalsState.goals],
  );

  const financialContext = useUniChatFinancialData({
    accounts: accountState.accounts,
    transactions: transactionsState.transactions,
    categories: categoryState.categories,
    workspaceBalance: balanceState.workspaceBalance,
    accountBalances: balanceState.accountBalances,
  });

  const financialConversation = useUniConversation({
    accounts: accountState.accounts,
    accountTypes: accountState.accountTypes,
    categories: categoryState.categories,
    executeAtomicAction: executeConfirmedFinancialAction,
    saveAccount: accountState.saveAccount,
    saveTransaction: transactionsState.saveTransaction,
    profileId: personalityProfileId,
    workspaceType: financialWorkspaceType,
    referenceDate: getLocalIsoDate(),
    allowedWriteIntents: ALLOWED_CHAT_WRITE_INTENTS,
    accountBalances: financialContext.snapshot.accountBalancesById,
  });
  const saveAccountForDependency = accountState.saveAccount;
  const accountDependencyCoordinator = useMemo(
    () => createPendingActionCoordinator({
      create_financial_account: async ({ fields }) => saveAccountForDependency(fields.account),
    }),
    [saveAccountForDependency],
  );
  const saveCategoryForDependency = categoryState.saveCategory;
  const categoryDependencyCoordinator = useMemo(
    () => createPendingActionCoordinator({
      create_financial_category: async ({ fields }) => saveCategoryForDependency({
        ...fields.category,
        applies_to: financialWorkspaceType,
      }),
      }),
    [financialWorkspaceType, saveCategoryForDependency],
  );

  // BLOCO D: mesma Edge Function/flag do chat (uni-chat-llm + VITE_UNI_LLM_ENABLED,
  // via uniLlm.enabled) -- nenhum novo secret, nenhuma nova variável de
  // ambiente. Só é chamada quando a resolução determinística de categoria já
  // esgotou (ver handlePendingConversationInput/sendText); nunca escolhe
  // conta, nunca cria categoria, nunca persiste -- apenas sugere.
  const categoryInferenceService = useMemo(
    () => createCategoryInferenceService({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: uniLlm.enabled,
    }),
    [uniLlm.enabled],
  );
  // Evita chamar a IA mais de uma vez para a MESMA tentativa de registro
  // (clientOperationId) -- se a IA já foi tentada e o resultado ainda assim
  // ficou sem categoria (uncertain/baixa confiança/erro), as próximas
  // correções (ex.: o usuário informa a conta) não repetem a chamada.
  const aiCategoryAttemptRef = useRef(new Set());

  async function attemptCategoryInference(result) {
    const action = result?.action;
    const issueCode = action?.issues?.[0]?.code;
    const isCategoryNotFound = issueCode === 'category_not_found' || issueCode === 'category_required';
    const operationId = action?.clientOperationId;

    if (
      !isCategoryNotFound
      || !operationId
      || aiCategoryAttemptRef.current.has(operationId)
      || !categoryInferenceService.isSupported()
    ) {
      return result;
    }

    const compatibleCategories = categoryState.categories.filter(
      (category) => category?.is_active !== false && category.category_type === action.transactionType,
    );
    if (compatibleCategories.length === 0) {
      return result;
    }

    aiCategoryAttemptRef.current.add(operationId);

    const { inference } = await categoryInferenceService.infer({
      description: action.description,
      transactionType: action.transactionType,
      categories: compatibleCategories,
    });
    if (!inference) {
      // Erro, timeout, resposta inválida etc. -- nunca bloqueia o fluxo:
      // segue com o resultado determinístico original, sem a sugestão da IA.
      return result;
    }

    return financialConversation.provideInput({ aiInference: inference });
  }

  async function publishConversationResultWithInference(result) {
    const finalResult = await attemptCategoryInference(result);
    publishConversationResult(finalResult);
  }

  // BLOCO E: mesma Edge Function/flag do chat (uni-chat-llm + VITE_UNI_LLM_ENABLED),
  // agora com mode='financial_plan' -- nenhum novo secret, nenhuma nova
  // variável de ambiente (mesmo padrão do Bloco D). Só é chamada quando o
  // texto parece complexo/multioperação/transferência (ver
  // financialPlanTrigger.js); nunca substitui o parser determinístico de
  // uma única operação -- se não houver plano válido, o fluxo atual segue
  // normalmente.
  const financialPlanService = useMemo(
    () => createFinancialPlanService({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: uniLlm.enabled,
    }),
    [uniLlm.enabled],
  );
  const [, setFinancialPlanState] = useState(null);
  const financialPlanRef = useRef(null);
  // BLOCO F: nunca executar o mesmo plano duas vezes em paralelo (ex.: o
  // usuário toca/fala "confirmar" duas vezes rapidamente antes da primeira
  // rodada terminar) -- o RPC já é idempotente por operação
  // (p_client_operation_id), mas isso evita chamadas duplicadas e updates
  // de estado concorrentes no cliente.
  const confirmingPlanRef = useRef(false);

  function setFinancialPlan(next) {
    financialPlanRef.current = next;
    setFinancialPlanState(next);
  }

  function isFinancialPlanExpired(plan) {
    if (!plan?.createdAt) return false;
    const createdAtMs = Date.parse(plan.createdAt);
    if (!Number.isFinite(createdAtMs)) return false;
    return Date.now() - createdAtMs > FINANCIAL_PLAN_TTL_MS;
  }

  function isFinancialPlanActive(plan = financialPlanRef.current) {
    return Boolean(
      plan
      && plan.status !== PLAN_STATUS.COMPLETED
      && plan.status !== PLAN_STATUS.CANCELLED
      && !isFinancialPlanExpired(plan),
    );
  }

  async function attemptFinancialPlan(text) {
    if (!financialPlanService.isSupported()) return false;

    const pendingPlanSummary = isFinancialPlanActive()
      ? summarizePlanForNeuralContext(financialPlanRef.current)
      : undefined;

    const { plan } = await financialPlanService.interpret({
      phrase: text,
      pendingPlanSummary,
      accounts: accountState.accounts,
      categories: categoryState.categories,
      referenceDate: getLocalIsoDate(),
    });
    // Sem plano válido (não suportado, erro, timeout, resposta fora do
    // contrato) -- o chamador cai de volta no fluxo determinístico
    // existente, sem quebrar o registro manual.
    if (!plan) return false;

    const newPlan = createPendingFinancialPlan({
      plan,
      phrase: text,
      accounts: accountState.accounts,
      accountTypes: accountState.accountTypes,
      categories: categoryState.categories,
      referenceDate: getLocalIsoDate(),
      workspaceType: financialWorkspaceType,
    });
    setFinancialPlan(newPlan);
    createAssistantResponse(buildPlanSummaryText(newPlan));
    return true;
  }

  async function confirmFinancialPlan() {
    const plan = financialPlanRef.current;
    if (!plan || !isPlanReadyForFinalConfirmation(plan) || isFinancialPlanExpired(plan)) return;
    if (confirmingPlanRef.current) return;
    confirmingPlanRef.current = true;

    setIsExecutingAction(true);
    setExecutionError(null);

    // Uma operação por vez, pelo MESMO RPC atômico já usado pelo registro
    // de uma única transação -- nunca em lote, nunca uma "transação
    // fantasma" que finge cobrir várias operações. Cada operação usa seu
    // próprio client_operation_id como chave de idempotência (o mesmo já
    // gerado por operação em createPendingFinancialPlan/
    // buildOperationState) -- confirmar duas vezes nunca duplica, o RPC
    // devolve o mesmo transaction_id (idempotent_replay). Se uma falhar,
    // interrompe: as seguintes NÃO são tentadas, e o plano fica "partial"
    // -- nunca promete tudo registrado quando não foi, e preserva o plano
    // (com as operações já confirmadas marcadas) para nova tentativa sem
    // duplicar o que já foi salvo.
    let workingPlan = plan;
    const persistable = getPersistablePlanOperations(workingPlan)
      .filter((op) => op.status === PLAN_OPERATION_STATUS.READY);

    for (const op of persistable) {
      const result = await executeFinancialIntentAction(op.action, {
        executeAtomicAction: executeConfirmedFinancialAction,
      });
      if (result?.error || !result?.data) {
        workingPlan = markPlanOperationFailed(workingPlan, op.temporaryId);
        setFinancialPlan(workingPlan);
        break;
      }
      workingPlan = markPlanOperationConfirmed(workingPlan, op.temporaryId);
      setFinancialPlan(workingPlan);
    }

    createAssistantResponse(buildPlanResultText(workingPlan));
    setIsExecutingAction(false);
    confirmingPlanRef.current = false;

    if ([PLAN_STATUS.COMPLETED, PLAN_STATUS.PARTIAL].includes(workingPlan.status)) {
      notifyFinancialDataChanged('uni-chat');
    }
    if (workingPlan.status === PLAN_STATUS.COMPLETED) {
      setFinancialPlan(null);
    }
  }

  function cancelFinancialPlanEntirely() {
    const plan = financialPlanRef.current;
    if (!plan) return;
    // O plano cancelado não precisa ser preservado em memória -- ao contrário
    // de uma correção pontual, aqui a conversa financeira encerra por completo.
    setFinancialPlan(null);
    createAssistantResponse(buildPlanCancelledText());
  }

  function handlePlanConversationInput(text) {
    const plan = financialPlanRef.current;
    if (!plan) return false;

    // BLOCO F, REGRA 13: um plano expirado nunca pode ser confirmado nem
    // corrigido -- some do estado operacional (pode continuar visível só
    // como histórico, já com status "cancelado" na mensagem anterior).
    if (isFinancialPlanExpired(plan)) {
      setFinancialPlan(null);
      createAssistantResponse('Esse lançamento expirou. Pode registrar novamente quando quiser.');
      return true;
    }

    const replyType = classifyPendingActionReply(text);

    if (replyType === 'confirm' && isPlanReadyForFinalConfirmation(plan)) {
      void confirmFinancialPlan();
      return true;
    }
    if (replyType === 'cancel' || isCancelEntirePendingFlow(text)) {
      cancelFinancialPlanEntirely();
      return true;
    }

    const active = plan.operations.filter((op) => op.status !== PLAN_OPERATION_STATUS.CANCELLED);

    // BLOCO F: cancelamento de UMA operação específica por referência
    // semântica (nunca proximidade textual cega) -- ex.: "cancela só a
    // gasolina". Só age quando o texto referencia claramente uma das
    // descrições reais do plano; caso contrário, cai no fluxo normal
    // (que já trata "cancelar"/"cancelar tudo" sem referência).
    const singleCancelTarget = findPlanOperationCancelTarget(text, active);
    if (singleCancelTarget) {
      const updated = cancelPlanOperation(plan, singleCancelTarget.temporaryId);
      setFinancialPlan(updated.status === PLAN_STATUS.CANCELLED ? null : updated);
      createAssistantResponse(
        updated.status === PLAN_STATUS.CANCELLED
          ? buildPlanCancelledText()
          : buildPlanOperationCancelledText(updated),
      );
      return true;
    }

    const current = active[plan.currentOperationIndex]
      ?? active.find((op) => op.status === PLAN_OPERATION_STATUS.NEEDS_CLARIFICATION);

    if (current && !current.capabilityPending) {
      const overrides = parsePlanCorrectionOverrides({
        text,
        referenceDate: getLocalIsoDate(),
        accounts: accountState.accounts,
        categories: categoryState.categories,
        operation: current,
      });
      if (overrides) {
        const updated = applyPlanOperationCorrection(plan, current.temporaryId, overrides);
        setFinancialPlan(updated);
        createAssistantResponse(buildPlanSummaryText(updated));
        return true;
      }
    }

    if (!active.length) {
      // BUG REAL: um plano ainda sem nenhuma operação formada (só a
      // pergunta de esclarecimento, ex.: "qual foi o valor da gasolina?")
      // não tem uma operação local para aplicar a correção -- a resposta
      // precisa voltar para a camada neural (com o resumo/pergunta
      // pendente como contexto, ver summarizePlanForNeuralContext), nunca
      // ser tratada como se não tivesse acontecido nada.
      void (async () => {
        const handled = await attemptFinancialPlan(text);
        if (!handled) {
          setFinancialPlan(null);
          createAssistantResponse(
            'Não consegui continuar esse lançamento agora. Pode registrar novamente quando quiser.',
          );
        }
      })();
      return true;
    }

    createAssistantResponse(
      plan.status === PLAN_STATUS.AWAITING_CLARIFICATION
        ? buildPlanSummaryText(plan)
        : 'Para continuar, diga "confirmar", "cancelar" ou me diga o que corrigir.',
    );
    return true;
  }

  const [connectionStatus, setConnectionStatus] = useState(dataService.getConnectionStatus);
  const initialLoadDone = useRef(false);
  const promotionInProgressRef = useRef(false);
  const loadRequestIdRef = useRef(0);

  const [initialChatState] = useState(() => {
    const resolved = resolveInitialConversationState({
      conversations: loadHistory(),
      activeId: loadActiveId(),
      defaultMode: workspaceTypeToMode(workspaceContextType),
      lockedMode: isSimplifiedExperience ? SIMPLIFIED_CHAT_MODE : null,
    });
    if (resolved.created) saveHistory(resolved.conversations);
    saveActiveId(resolved.activeId);
    return resolved;
  });
  const [mode, setMode] = useState(initialChatState.mode);
  const [messages, setMessages] = useState(initialChatState.messages);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [conversations, setConversations] = useState(initialChatState.conversations);
  const [activeId, setActiveId] = useState(initialChatState.activeId);
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingActionStack, setPendingActionStack] = useState(null);
  const [pendingHydrated, setPendingHydrated] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const confirmingRef = useRef(false);
  const pendingActionRef = useRef(null);
  const pendingActionStackRef = useRef(null);
  const activeIdRef = useRef(activeId);
  const convDbIdsRef = useRef({});
  const restoredPendingIdentityRef = useRef(null);

  // Integracao com a IA: estado da chamada real ao LLM, separado de `isTyping` (que
  // tambem cobre o atraso simulado do caminho deterministico). Usa o
  // vocabulario AI_STATUS ja consolidado na infraestrutura de IA -- SUCCESS/ERROR aqui nunca decidem o
  // que e exibido no chat (isso continua sendo sempre a mensagem final via
  // buildUniMessage), servem apenas para o botao cancelar e o aviso de erro
  // com nova tentativa.
  const [aiStatus, setAiStatus] = useState(AI_STATUS.UNAVAILABLE);
  // Guarda a ultima pergunta que foi (ou deveria ter sido) respondida pelo
  // LLM, para "tentar novamente" sem o usuario redigitar.
  const lastUnresolvedRef = useRef(null);
  // Marcado pelo proprio botao cancelar ANTES de chamar uniLlm.cancel() --
  // e a unica forma de diferenciar "cancelado pelo usuario" de "falhou"
  // depois que a chamada resolve (o orquestrador nunca lanca e nunca expoe
  // o codigo do erro ao chamador).
  const aiCancelledRef = useRef(false);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const stickToBottom = useRef(true);
  const prevWorkspaceRef = useRef(workspaceContextType);

  const suggestions = mode === 'pessoal' ? SUGGESTIONS_PESSOAL : SUGGESTIONS_EMPRESA;

  // Contexto vindo da tela de Categorias: pré-preenche o campo (sem enviar),
  // preservando o fluxo de confirmação. Executado uma única vez ao montar.
  useEffect(() => {
    if (initialContextRef.current) return;
    initialContextRef.current = true;
    const prefill = buildUniPrefillFromState(location.state);
    if (prefill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputValue(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  useEffect(() => {
    pendingActionStackRef.current = pendingActionStack;
  }, [pendingActionStack]);

  const pendingActionIdentity = useMemo(() => ({
    userId: user?.id,
    workspaceId: effectiveWorkspace?.id,
    conversationId: activeId,
  }), [activeId, effectiveWorkspace?.id, user?.id]);

  const clearCurrentPendingAction = useCallback(() => {
    clearPendingAction(pendingActionIdentity);
    clearPendingActionStack(pendingActionIdentity);
  }, [pendingActionIdentity]);

  // BUG REAL: uma pendência antiga (Pending Action de uma única operação OU
  // financial_plan) que nunca foi encerrada não pode "engolir" uma frase
  // financeira NOVA e autossuficiente (tem verbo + valor próprios) como se
  // fosse resposta/correção a uma pergunta antiga -- isso é exatamente como
  // "Nubank"/"R$ 200" de uma conversa anterior vazavam para um lançamento
  // completamente novo. Abandona silenciosamente (sem mensagem de
  // cancelamento -- o usuário não pediu para cancelar nada, só mudou de
  // assunto) toda a pendência antes de processar a frase nova do zero.
  function abandonStalePendingState() {
    financialConversation.reset();
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setFinancialPlan(null);
    clearCurrentPendingAction();
  }

  useEffect(() => {
    const conversationState = financialConversation.state;
    if (
      pendingActionStack?.actions?.length
      ||
      !pendingActionIdentity.userId
      || !pendingActionIdentity.workspaceId
      || !pendingActionIdentity.conversationId
      || !['needs_clarification', 'awaiting_confirmation'].includes(conversationState.status)
      || !conversationState.action
    ) {
      return;
    }
    savePendingAction(pendingActionIdentity, {
      parsed: conversationState.parsed,
      action: conversationState.action,
      response: conversationState.response,
      memory: conversationState.memory,
    });
  }, [financialConversation.state, pendingActionIdentity, pendingActionStack]);

  useEffect(() => {
    if (!pendingActionStack?.actions?.length) return;
    savePendingActionStack(pendingActionIdentity, pendingActionStack);
  }, [pendingActionIdentity, pendingActionStack]);

  useEffect(() => {
    const identityKey = [
      pendingActionIdentity.userId,
      pendingActionIdentity.workspaceId,
      pendingActionIdentity.conversationId,
    ].join(':');
    if (
      identityKey.includes('undefined')
      || restoredPendingIdentityRef.current === identityKey
      || accountState.isLoading
      || categoryState.isLoading
    ) {
      return;
    }
    restoredPendingIdentityRef.current = identityKey;
    setPendingHydrated(true);
    const storedStack = loadPendingActionStack(pendingActionIdentity);
    const storedDependency = storedStack ? getActivePendingAction(storedStack) : null;
    if (
      isAccountCreationDependency(storedDependency)
      || isCategoryCreationDependency(storedDependency)
    ) {
      const parent = storedStack.actions.at(-2);
      const parentSnapshot = parent?.fields?.snapshot;
      if (parentSnapshot?.action && financialConversation.restore(parentSnapshot)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingActionStack(storedStack);
      } else {
        clearPendingActionStack(pendingActionIdentity);
      }
      return;
    }

    const snapshot = loadPendingAction(pendingActionIdentity);
    if (!snapshot?.action) return;

    const accountId = snapshot.action.account?.id ?? snapshot.action.payload?.account_id;
    const categoryId = snapshot.action.category?.id ?? snapshot.action.payload?.category_id;
    const accountValid = !accountId || accountState.accounts.some((account) => account.id === accountId);
    const categoryValid = !categoryId || categoryState.categories.some((category) => category.id === categoryId);
    if (!accountValid || !categoryValid) {
      clearPendingAction(pendingActionIdentity);
      return;
    }

    if (financialConversation.restore(snapshot) && snapshot.action.status === 'ready') {
      if (storedStack?.actions?.length) {
        setPendingActionStack(storedStack);
      }
      setPendingAction(snapshot.action);
    }
  }, [
    accountState.accounts,
    accountState.isLoading,
    categoryState.categories,
    categoryState.isLoading,
    financialConversation,
    pendingActionIdentity,
  ]);

  // BUG REAL (estado fantasma "confirmação"): `messages` é persistido via
  // chatHistory.js, sem TTL -- já `pendingAction`/`pendingActionStack` tem
  // TTL próprio (pendingActionStorage.js) e podem expirar ou nunca ser
  // restaurados. Sem isso, um reload da Home podia continuar mostrando um
  // cartão "Confirmar/Editar/Cancelar" para uma ação que já não existe mais
  // (tocar em Confirmar não fazia nada, pois handleConfirmAction já tem sua
  // própria guarda contra pendingAction nulo). Só age DEPOIS que a
  // hidratação de pendências já rodou (pendingHydrated) -- nunca antes,
  // para não apagar uma confirmação real que ainda está sendo restaurada.
  useEffect(() => {
    if (!pendingHydrated) return;
    const hasRealPendingEntity = Boolean(
      pendingAction
      || pendingActionStack?.actions?.length
      || isFinancialPlanActive(),
    );
    if (hasRealPendingEntity) return;
    setMessages((current) => {
      let changed = false;
      const sanitized = current.map((message) => {
        if (message.confirmation?.status === 'pending') {
          changed = true;
          return { ...message, confirmation: { ...message.confirmation, status: 'expired' } };
        }
        return message;
      });
      return changed ? sanitized : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isFinancialPlanActive lê financialPlanRef.current (ref, não estado); incluí-la recriaria o efeito a cada render sem mudar seu comportamento.
  }, [pendingHydrated, pendingAction, pendingActionStack]);

  const reconcileConversations = useCallback(async () => {
    if (!effectiveWorkspace?.id) return;
    const wsId = effectiveWorkspace.id;
    const supabaseConvs = await dataService.listConversations(wsId, mode);
    if (!supabaseConvs) return;
    setConnectionStatus(dataService.getConnectionStatus());

    setConversations((prev) => {
      const localIds = new Set(prev.map((c) => c.id));
      const dbIdSet = new Set(supabaseConvs.map((c) => c.id));
      const existingLocalIdsInDb = new Set(
        prev.filter((c) => c.source === 'supabase' && dbIdSet.has(c.id)).map((c) => c.id),
      );

      const merged = prev
        .filter((c) => c.source !== 'supabase' || dbIdSet.has(c.id))
        .map((c) => {
          if (c.source === 'supabase' && dbIdSet.has(c.id)) {
            const dbConv = supabaseConvs.find((db) => db.id === c.id);
            return { ...dbConv, messages: c.messages || [], source: 'supabase' };
          }
          return c;
        });

      const newDbIds = new Map(
        supabaseConvs.filter((c) => !localIds.has(c.id)).map((c) => [c.id, c]),
      );
      for (const [id, conv] of newDbIds) {
        if (!existingLocalIdsInDb.has(id)) {
          merged.push({ ...conv, messages: [], source: 'supabase' });
        }
      }

      const currentActive = activeIdRef.current;
      const activeExists = merged.some((c) => c.id === currentActive);
      if (!activeExists && merged.length > 0) {
        const targetMode = mode;
        const modeConvs = merged.filter((c) => c.mode === targetMode);
        const sorted = modeConvs.sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
        );
        if (sorted.length > 0) {
          const target = sorted[0];
          setTimeout(() => {
            switchConversation(target.id);
          }, 0);
        }
      }

      saveHistory(merged);
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWorkspace?.id, mode]);

  const buildWorkspaceMap = useCallback(() => {
    const map = {};
    if (availableWorkspaces && availableWorkspaces.length > 0) {
      for (const ws of availableWorkspaces) {
        if (ws.workspace_type === 'personal') map.personal = ws.id;
        if (!isSimplifiedExperience && ws.workspace_type === 'business') map.business = ws.id;
      }
    }
    return map;
  }, [availableWorkspaces, isSimplifiedExperience]);

  useEffect(() => {
    if (initialLoadDone.current) return;
    if (!effectiveWorkspace?.id && !availableWorkspaces?.length) return;
    if (!availableWorkspaces?.length) return;
    initialLoadDone.current = true;

    const workspaceMap = buildWorkspaceMap();
    const hasAnyWorkspace = Object.values(workspaceMap).some(Boolean);

    if (!hasAnyWorkspace) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reconcileConversations();
      return;
    }

    dataService.migrateLocalHistory(workspaceMap).then((result) => {
      if (result.migrated > 0) {
        const stored = loadHistory();
        const synced = stored.filter(
          (c) => c.source !== 'local' || !c.messages || c.messages.length === 0,
        );
        if (synced.length !== stored.length) {
          saveHistory(synced);
        }
      }
      return reconcileConversations();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWorkspace?.id, availableWorkspaces?.length]);

  useEffect(() => {
    if (isSimplifiedExperience || workspaceContextType === prevWorkspaceRef.current) return;
    prevWorkspaceRef.current = workspaceContextType;
    const correctMode = workspaceTypeToMode(workspaceContextType);
    if (correctMode === mode) return;
    uniVoice.stop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    setMode(correctMode);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    const candidates = updated
      .filter((c) => c.mode === correctMode)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (candidates.length > 0) {
      const c = candidates[0];
      setActiveId(c.id);
      setMessages(c.messages || []);
      // BUG REAL (chaves duplicadas msg-N): esta restauração era o ÚNICO
      // ponto de setMessages que não passava por reserveMessageIds -- com o
      // contador do registry zerado (reload) e o histórico restaurado aqui,
      // mensagens NOVAS geravam msg-N idêntico aos IDs restaurados.
      reserveMessageIds(c.messages || []);
      saveActiveId(c.id);
    } else {
      // FASE UNI PIPE: o aviso de perfil alterado é uma resposta da Uni e
      // passa pelo pipeline oficial (render + autoplay + persistência) --
      // nunca um setMessages/buildUniMessage solto que o autoplay precisaria
      // "pegar de carona" para narrar.
      createAssistantResponse(
        correctMode === 'empresa'
          ? 'Perfil alterado para Empresa. Vamos falar sobre o financeiro do seu negócio.'
          : 'Perfil alterado para Pessoal. Vamos falar sobre suas finanças pessoais.',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSimplifiedExperience, workspaceContextType]);

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    const firstUser = messages.find((m) => m.from === 'user');
    const newTitle = firstUser
      ? (firstUser.text.length > 55 ? firstUser.text.slice(0, 55) + '\u2026' : firstUser.text)
      : '';
    if (current.messages === messages && current.title === (newTitle || '')) return;
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(updated);
  }, [messages, activeId, mode, conversations]);

  // BLOCO VOZ HIDRATAÇÃO (reload/login): distinção explícita entre a fase
  // de hidratação inicial, as mensagens restauradas e as mensagens novas
  // da sessão atual -- o autoplay NUNCA narra conteúdo restaurado.
  //
  // PROBLEMA REAL: spokenMessageSession.js é um registro em memória de
  // módulo -- sobrevive a unmount/remount e troca de rota (navegação
  // Home → Registros/Conta/Uni → Home), mas é DESCARTADO em reload de
  // página e no logout (resetAutoSpokenMessages). Com o registro vazio,
  // o histórico restaurado parecia mensagem nova e o autoplay narrava a
  // última resposta antiga AO MESMO TEMPO que a saudação tocava (duas
  // vozes sobrepostas).
  //
  // Solução determinística (sem timeout):
  // 1. `historyHydrated`/`historyHydratedRef` -- marco `autoplayArmed`: o
  //    autoplay só dispara depois que a hidratação terminou;
  // 2. `pendingRestoresRef` -- conta restaurações assíncronas do Supabase
  //    ainda em voo (a fase de hidratação não terminou enquanto houver
  //    alguma);
  // 3. snapshot no armamento: TODAS as mensagens presentes (histórico
  //    restaurado) são marcadas como já narradas ANTES de o autoplay ser
  //    habilitado -- conteúdo antigo nunca volta a falar;
  // 4. marcas também nos próprios pontos de restauração
  //    (loadMessages/switchConversation): mesmo uma restauração que assente
  //    depois do armamento nunca fala;
  // 5. a saudação tem prioridade exclusiva: o armamento espera a voz da
  //    boas-vindas terminar ou falhar (markWelcomeVoiceSettled via
  //    onWelcomeVoiceSettled ← SimplifiedHomeView). Enquanto ela estiver
  //    preparando/carregando/tocando, o autoplay fica bloqueado.
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const historyHydratedRef = useRef(false);
  const pendingRestoresRef = useRef(0);

  const maybeArmAutoplay = useCallback(() => {
    if (historyHydratedRef.current) return;
    if (pendingRestoresRef.current > 0) return;
    // Sessão ainda não carregada (modo configurado): espera o user.id.
    if (isSupabaseConfigured && !user?.id) return;
    // Saudação reivindicada mas não concluída: espera terminar/falhar.
    if (isWelcomeVoicePending(buildWelcomeSessionKey(user, session))) return;
    historyHydratedRef.current = true;
    // Snapshot da hidratação: o histórico restaurado presente neste
    // instante é marcado como já narrado -- nunca fala.
    markRestoredMessagesAsSpoken(user?.id, messages);
    // BLOCO VOZ ID: reserva os IDs deste snapshot -- mensagens novas nunca
    // colidem com o histórico restaurado.
    reserveMessageIds(messages);
    setHistoryHydrated(true);
  }, [messages, session, user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- armamento controlado do autoplay: só dispara UMA vez (guarda historyHydratedRef), nunca em loop; sem ele, o autoplay poderia narrar histórico restaurado antes da hidratação/saudação concluírem.
    maybeArmAutoplay();
  }, [maybeArmAutoplay]);

  // BLOCO VOZ HIDRATAÇÃO: reserva os IDs do histórico restaurado já no
  // primeiro render (mensagens iniciais vêm de resolveInitialConversationState)
  // -- nextMessageId nunca devolve um id reservado, então uma mensagem NOVA
  // nunca colide com uma mensagem restaurada (nem antes do armamento).
  // Idempotente: também roda no snapshot do armamento e nos pontos de
  // restauração assíncrona sem efeito colateral.
  useEffect(() => {
    reserveMessageIds(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWelcomeVoiceSettled = useCallback(() => {
    // BLOCO VOZ HIDRATAÇÃO (deadlock corrigido): a fala da saudação
    // terminou ou falhou (finally em SimplifiedHomeView) -- LIBERA a chave
    // pendente ANTES de tentar armar o autoplay. Sem markWelcomeVoiceSettled
    // aqui, pendingWelcomeKeys nunca esvazia, isWelcomeVoicePending fica
    // true para sempre e historyHydrated nunca é armado (deadlock: o
    // pipeline renderiza, mas speakMessage nunca é chamado).
    markWelcomeVoiceSettled(buildWelcomeSessionKey(user, session));
    maybeArmAutoplay();
  }, [maybeArmAutoplay, user, session]);

  // BLOCO UNI 2 / BLOCO VOZ 1: reprodução automática da resposta ATUAL da
  // Uni -- causa raiz da regressão original relatada era a AUSÊNCIA total
  // deste efeito (só a saudação tinha reprodução automática, ver
  // SimplifiedHomeView.jsx). BLOCO VOZ 1: toda resposta final, curta ou
  // longa, fala -- textos acima do limite da Edge Function ganham versão
  // curta e natural (buildSpeechText) dentro de handleSpeakMessage, sem
  // alterar o texto visível. Só vale para Home/`/app/uni`
  // (isSimplifiedExperience); o chat completo continua manual (botão
  // "Ouvir" por mensagem). Guardas:
  // - hasAutoSpokenMessage/markAutoSpokenMessage (spokenMessageSession.js):
  //   registro em nível de MÓDULO separado por usuário (user.id) -- sobrevive
  //   a unmount/remount e troca de rota. Um useRef local morria ao sair da
  //   Home e o histórico restaurado ao voltar refazia a narração da mensagem
  //   antiga; o registro nunca fala a MESMA mensagem duas vezes na sessão nem
  //   refala uma mensagem restaurada (cada id só é narrado uma vez, na ordem
  //   em que chega);
  // - só considera a ÚLTIMA mensagem (messages.at(-1)) -- se ela for do
  //   usuário (acabou de enviar, Uni ainda não respondeu), não há nada
  //   novo para falar ainda;
  // - handleSpeakMessage já encerra qualquer áudio anterior antes de
  //   iniciar o novo, internamente (ver o provider de TTS em
  //   uni-voice-tts/), então uma resposta nova sempre interrompe a
  //   anterior corretamente,
  //   sem que este efeito precise de nenhuma limpeza (cleanup) própria --
  //   um cleanup aqui que chamasse stop() poderia cancelar por engano a
  //   fala que ACABOU de começar para a mensagem seguinte.
  useEffect(() => {
    if (!isSimplifiedExperience || !voicePreference.enabled) return;
    // BLOCO VOZ HIDRATAÇÃO: autoplay só depois da hidratação inicial
    // (sessão carregada + histórico restaurado + saudação concluída) --
    // mensagens restauradas já foram marcadas como narradas e nunca falam.
    if (!historyHydrated) return;
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.from !== 'uni' || !lastMessage.text) return;
    if (hasAutoSpokenMessage(user?.id, lastMessage.id)) return;
    markAutoSpokenMessage(user?.id, lastMessage.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- autoplay controlado (guardado pelo registro por sessão): sincroniza a voz com a última mensagem real, nunca um loop (o registro já impede reexecução para o mesmo id).
    handleSpeakMessage(lastMessage);
  }, [messages, isSimplifiedExperience, voicePreference.enabled, handleSpeakMessage, user?.id, historyHydrated]);

  // FASE UNI PIPE: pipeline oficial de resposta da Uni (texto + voz).
  //
  // createAssistantResponse é o ÚNICO ponto de saída de resposta do chat:
  // cria a mensagem → persiste (quando aplicável) → render → autoplay →
  // buildSpeechText → uniVoice.speak, na ordem exata. Todo fluxo de
  // resposta (FinancialQueryEngine, LLM, Pending Actions, confirmações,
  // planos financeiros, avisos, erros e fluxos intermediários) passa por
  // ele — nenhum pushMessage solto volta a falar por fora.
  //
  // Gates do autoplay imediato: idênticos aos do efeito de autoplay
  // (experiência simplificada + voz habilitada + hidratação concluída +
  // saudação não pendente). Se os gates fecham neste instante, a mensagem
  // fica sem marca e o efeito de autoplay a narra assim que abrirem — a
  // marcação só acontece no momento de falar, nunca há duplicação.
  const { createAssistantResponse } = useUniResponsePipeline({
    buildMessage: buildUniMessage,
    pushMessage,
    persistMessage: syncMessageToSupabase,
    shouldAutoSpeak: () => (
      isSimplifiedExperience
      && voicePreference.enabled
      && historyHydrated
      && !isWelcomeVoicePending(buildWelcomeSessionKey(user, session))
    ),
    hasSpoken: hasAutoSpokenMessage,
    markSpoken: markAutoSpokenMessage,
    hasNarratedText,
    markNarratedText,
    speakMessage: handleSpeakMessage,
    userId: user?.id,
  });

  useEffect(() => {
    if (!activeId) return;
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;
    if (current.source !== 'supabase') return;

    const requestId = ++loadRequestIdRef.current;
    // BLOCO VOZ HIDRATAÇÃO: restauração assíncrona em voo -- o autoplay
    // só é armado quando TODAS as restaurações assentarem.
    pendingRestoresRef.current += 1;

    dataService.loadMessages(activeId).then((loadedMessages) => {
      pendingRestoresRef.current -= 1;
      if (requestId !== loadRequestIdRef.current) return;
      if (!loadedMessages || loadedMessages.length === 0) return;
      if (activeIdRef.current !== activeId) return;

      // BLOCO VOZ HIDRATAÇÃO: o que chega aqui é histórico RESTAURADO
      // (conteúdo antigo, não evento novo) -- marcado como já narrado para
      // o autoplay, mesmo que esta restauração assente depois do
      // armamento.
      markRestoredMessagesAsSpoken(user?.id, loadedMessages);
      reserveMessageIds(loadedMessages);

      setMessages((prev) => {
        if (prev.length === 0) return loadedMessages;
        // BUG REAL (BUG 5): merge por IDENTIDADE (clientMessageId/dbId),
        // nunca por comprimento: mensagens locais ainda não sincronizadas
        // (fila pendente) são preservadas; mensagens restauradas do banco
        // que já existem localmente não duplicam.
        const localIds = new Set(
          prev
            .map((msg) => msg.clientMessageId ?? msg.dbId ?? msg.id)
            .filter(Boolean),
        );
        const dbOnly = loadedMessages.filter(
          (msg) => !localIds.has(msg.clientMessageId ?? msg.dbId ?? msg.id),
        );
        if (dbOnly.length === 0) return prev;
        return [...prev, ...dbOnly];
      });

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, messages: loadedMessages, _messagesLoaded: true } : c,
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const pendingSyncRef = useRef([]);

  async function syncMessageToSupabase(msg) {
    const current = conversations.find((c) => c.id === activeId);
    if (!current) return;

    if (current.source === 'supabase') {
      await dataService.saveMessage(activeId, msg);
      const queued = pendingSyncRef.current.splice(0);
      for (const qMsg of queued) {
        await dataService.saveMessage(activeId, qMsg);
      }
      return;
    }

    if (!effectiveWorkspace?.id || !dataService.isOnline()) return;

    if (promotionInProgressRef.current) {
      pendingSyncRef.current.push(msg);
      return;
    }

    promotionInProgressRef.current = true;
    try {
      const dbConv = await dataService.createConversation(mode, effectiveWorkspace.id);
      if (!dbConv) return;

      const dbConvId = dbConv.id;
      const localConvId = activeId;
      const syncMsgs = [...messages, msg];
      await dataService.saveMessages(dbConvId, syncMsgs);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== localConvId) return c;
          return {
            ...c,
            id: dbConvId,
            source: 'supabase',
            messages: syncMsgs,
            createdAt: dbConv.createdAt,
            updatedAt: dbConv.updatedAt,
          };
        }),
      );
      setActiveId(dbConvId);
      saveActiveId(dbConvId);
      saveActiveSource('supabase');
      convDbIdsRef.current[localConvId] = dbConvId;

      setConversations((prev) => prev.filter((c) => c.id !== localConvId));

      const stored = loadHistory();
      const updated = stored.map((c) => {
        if (c.id !== localConvId) return c;
        return {
          ...c,
          id: dbConvId,
          source: 'supabase',
          messages: syncMsgs,
          createdAt: dbConv.createdAt,
          updatedAt: dbConv.updatedAt,
        };
      });
      saveHistory(updated);

      const queued = pendingSyncRef.current.splice(0);
      for (const qMsg of queued) {
        await dataService.saveMessage(dbConvId, qMsg);
      }
    } finally {
      promotionInProgressRef.current = false;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConnectionStatus(dataService.getConnectionStatus());
    const unsub = dataService.subscribeConnectionStatus(setConnectionStatus);
    return unsub;
  }, []);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distanceFromBottom < 80;
    if (stickToBottom.current) setShowScrollBtn(false);
  }

  function scrollToLatest() {
    stickToBottom.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowScrollBtn(false);
  }

  // BUG REAL (BUG 4): "Ver conversa completa" abria no TOPO do histórico --
  // stickToBottom era escrito (sendText, switchConversation, handleScroll)
  // mas NUNCA lido: não existia efeito que rolasse o chat. Agora toda
  // mudança de mensagens com stickToBottom=true (nova resposta, hidratação
  // local, restauração Supabase, troca de conversa) rola até o fim; quem
  // rolou para cima (stickToBottom=false) mantém a leitura. Layout effect
  // (sem setTimeout arbitrário): o DOM já contém o conteúdo novo quando
  // roda, então scrollHeight está correto.
  useLayoutEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function pushMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  function switchConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv || (isSimplifiedExperience && conv.mode !== SIMPLIFIED_CHAT_MODE)) return;

    uniVoice.stop();
    setVoiceMessageId(null);

    const requestId = ++loadRequestIdRef.current;

    setActiveId(id);
    setMessages(conv.messages || []);
    // BLOCO VOZ HIDRATAÇÃO: trocar de conversa RESTAURA conteúdo antigo
    // (seleção no Histórico, reconcile inicial pós-reload, troca de
    // perfil) -- nunca é autoplay; as mensagens restauradas são marcadas
    // como já narradas.
    markRestoredMessagesAsSpoken(user?.id, conv.messages || []);
    reserveMessageIds(conv.messages || []);
    const convMode = conv.mode || mode;
    if (!isSimplifiedExperience && convMode !== mode) {
      switchWorkspace(modeToWorkspaceType(convMode));
    }
    setMode(isSimplifiedExperience ? SIMPLIFIED_CHAT_MODE : convMode);
    setIsTyping(false);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    saveActiveId(id);
    saveActiveSource(conv.source || 'local');

    if (conv.source === 'supabase' && conv.messages && conv.messages.length > 0) {
      // BLOCO VOZ HIDRATAÇÃO: restauração assíncrona em voo (ver efeito
      // de carregamento inicial).
      pendingRestoresRef.current += 1;
      dataService.loadMessages(id).then((loadedMessages) => {
        pendingRestoresRef.current -= 1;
        if (requestId !== loadRequestIdRef.current) return;
        if (!loadedMessages || loadedMessages.length === 0) return;
        if (activeIdRef.current !== id) return;
        if (loadedMessages.length > conv.messages.length) {
          // BLOCO VOZ HIDRATAÇÃO: histórico restaurado -- nunca fala.
          markRestoredMessagesAsSpoken(user?.id, loadedMessages);
          reserveMessageIds(loadedMessages);
          setMessages(loadedMessages);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === id ? { ...c, messages: loadedMessages } : c,
            ),
          );
        }
      });
    }
  }

  async function handleUnresolvedMessage(text, history) {
    lastUnresolvedRef.current = { text, history };
    let llmText = null;
    if (uniLlm.enabled) {
      setIsTyping(true);
      setAiStatus(AI_STATUS.LOADING);
      try {
        const outcome = await uniLlm.generateContextualResponse({
          text,
          messages: history,
          financialContext,
          mode,
          personalityProfileId,
          workspaceType: financialWorkspaceType,
          conversationStyle,
        });
        llmText = outcome?.text ?? null;
      } catch {
        llmText = null;
      } finally {
        setIsTyping(false);
      }

      // Nunca mostra o aviso de erro/nova tentativa quando o proprio usuario
      // cancelou -- isso e uma acao deliberada, nao uma falha. O estado volta
      // a UNAVAILABLE (neutro), mas lastUnresolvedRef continua disponivel
      // para "tentar novamente" reaproveitar o mesmo texto.
      if (llmText) {
        setAiStatus(AI_STATUS.SUCCESS);
      } else if (aiCancelledRef.current) {
        // SUPORTE1: estado proprio (nunca ERROR) -- cancelamento deliberado
        // do usuario deve mostrar uma nota neutra, nunca o banner vermelho
        // de falha real (ErrorState variant="cancelled").
        setAiStatus(AI_STATUS.CANCELLED);
      } else {
        setAiStatus(AI_STATUS.ERROR);
      }
      aiCancelledRef.current = false;
    }
    createAssistantResponse(llmText || UNI_DETERMINISTIC_FALLBACK_TEXT);
  }

  function handleCancelAi() {
    if (aiStatus !== AI_STATUS.LOADING) return;
    aiCancelledRef.current = true;
    uniLlm.cancel();
  }

  function handleRetryAi() {
    const pending = lastUnresolvedRef.current;
    if (!pending || isTyping) return;
    setAiStatus(AI_STATUS.UNAVAILABLE);
    void handleUnresolvedMessage(pending.text, pending.history);
  }

  function findPendingConfirmationMessageId() {
    return [...messages]
      .reverse()
      .find((message) => message.confirmation?.status === 'pending')?.id ?? null;
  }

  function syncFinancialParentSnapshot(result, stack = pendingActionStackRef.current) {
    if (!stack?.actions?.length || !result?.action) return stack;
    const parent = stack.actions.find((action) => action.type === 'financial_transaction');
    if (!parent) return stack;
    const previousSnapshot = parent.fields?.snapshot ?? {};
    const transition = updateResumedFinancialSnapshot(stack, {
      ...previousSnapshot,
      action: result.action,
      response: result.response?.text ?? previousSnapshot.response ?? '',
    });
    if (transition.changed) {
      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      return transition.stack;
    }
    return stack;
  }

  function publishConversationResult(result) {
    syncFinancialParentSnapshot(result);
    if (
      result?.action?.issues?.[0]?.code === 'category_not_found'
      && result.action.proposedCategoryName
      && openCategoryCreationDependency({
        ...result,
        action: {
          ...result.action,
          proposedCategory: {
            name: result.action.proposedCategoryName,
            category_type: result.action.transactionType,
            applies_to: financialWorkspaceType,
          },
        },
      })
    ) {
      return;
    }
    if (result?.action?.status === 'ready') {
      setPendingAction(result.action);
      const confirmation = buildConfirmationFromAction(
        result.action,
        financialWorkspaceType,
      );
      createAssistantResponse(result.response.text, {
        type: 'confirmation',
        confirmation,
      });
      return;
    }

    createAssistantResponse(
      result?.response?.text
        || 'Preciso de mais detalhes antes de preparar essa ação.',
    );
  }

  function publishAccountCreationConfirmation(stack) {
    const dependency = getActivePendingAction(stack);
    const confirmation = buildAccountCreationConfirmation(dependency, {
      accountTypes: accountState.accountTypes,
      workspaceType: financialWorkspaceType,
    });
    createAssistantResponse(
      `Não encontrei a conta ${dependency.fields.account.name} neste espaço. Posso criá-la para continuar a movimentação?`,
      {
        type: 'confirmation',
        confirmation,
      },
    );
  }

  function publishCategoryCreationConfirmation(stack) {
    const dependency = getActivePendingAction(stack);
    const confirmation = buildCategoryCreationConfirmation(dependency, {
      workspaceType: financialWorkspaceType,
    });
    createAssistantResponse(
      `A categoria ${dependency.fields.category.name} ainda não existe. Deseja criá-la?`,
      {
        type: 'confirmation',
        confirmation,
      },
    );
  }

  function openAccountCreationDependency(proposal) {
    if (!proposal?.action?.proposedAccount) return false;
    const financialSnapshot = {
      parsed: proposal.parsed ?? financialConversation.state.parsed,
      action: proposal.action,
      response: proposal.response?.text ?? '',
      memory: proposal.memory ?? financialConversation.state.memory,
    };
    const transition = startAccountCreationDependency({
      stack: pendingActionStackRef.current,
      identity: pendingActionIdentity,
      financialSnapshot,
      proposedAccount: proposal.action.proposedAccount,
    });
    if (!transition.changed && transition.reason === 'duplicate') {
      return true;
    }

    pendingActionStackRef.current = transition.stack;
    setPendingActionStack(transition.stack);
    setPendingAction(null);
    publishAccountCreationConfirmation(transition.stack);
    return true;
  }

  function startAccountDependency(text) {
    const proposal = financialConversation.provideInput({
      accountName: text,
      accountDecision: 'create_new',
    });
    return openAccountCreationDependency(proposal);
  }

  function openCategoryCreationDependency(proposal) {
    if (!proposal?.action?.proposedCategory) return false;
    const financialSnapshot = {
      parsed: proposal.parsed ?? financialConversation.state.parsed,
      action: proposal.action,
      response: proposal.response?.text ?? '',
      memory: proposal.memory ?? financialConversation.state.memory,
    };
    const transition = startCategoryCreationDependency({
      stack: pendingActionStackRef.current,
      identity: pendingActionIdentity,
      financialSnapshot,
      proposedCategory: {
        ...proposal.action.proposedCategory,
        applies_to: financialWorkspaceType,
      },
    });
    if (!transition.changed && transition.reason === 'duplicate') {
      return true;
    }

    pendingActionStackRef.current = transition.stack;
    setPendingActionStack(transition.stack);
    setPendingAction(null);
    publishCategoryCreationConfirmation(transition.stack);
    return true;
  }

  function startCategoryDependency(text, action) {
    const categoryName = String(text ?? '')
      .replace(/^categoria\s*(?:é|e|:)?\s*/i, '')
      .trim();
    if (!categoryName) return false;
    const proposedCategory = {
      name: `${categoryName.charAt(0).toUpperCase()}${categoryName.slice(1)}`,
      category_type: action.transactionType,
      applies_to: financialWorkspaceType,
    };
    return openCategoryCreationDependency({
      parsed: financialConversation.state.parsed,
      action: {
        ...action,
        proposedCategory,
        proposedCategoryName: proposedCategory.name,
      },
      response: financialConversation.state.response,
      memory: financialConversation.state.memory,
    });
  }

  // BLOCO F, REGRA 9 (PENDÊNCIA CONHECIDA): criação de conta/categoria
  // DENTRO de um plano multioperação (ex.: propor criar "Banco do Brasil"
  // quando essa conta ainda não existe) ainda não está implementada nesta
  // fase -- reutilizaria o mesmo Pending Action Stack (nunca um segundo
  // sistema de pendências), mas exigiria também ensinar
  // handleConfirmAction/handleCancelAction a retomar a OPERAÇÃO DO PLANO
  // (não a conversa de uma única transação) após a criação. Por ora, uma
  // operação de plano com proposedAccount/proposedCategory continua pedindo
  // que o usuário informe uma conta/categoria já existente
  // (buildOperationClarificationQuestion), nunca cria nada silenciosamente.
  // Ver relatório final para o escopo exato desta pendência.

  function handlePendingConversationInput(text, userMsg) {
    if (isFinancialPlanActive()) {
      syncMessageToSupabase(userMsg);
      return handlePlanConversationInput(text);
    }

    // BUG REAL: o FinancialQueryEngine só era consultado no caminho SEM
    // pendência (runDeterministicFinancialFlow) -- com uma Pending Action
    // ativa (ex.: dependência de criação de conta aguardando confirmação,
    // ou um campo em esclarecimento), qualquer mensagem ia direto para os
    // branches de pendência e a consulta financeira era engolida ("Para
    // continuar, confirme a criação da conta...") ou virava proposta de
    // criação de conta. O FinancialQueryEngine tem prioridade ABSOLUTA
    // sobre o fluxo de criação de conta/pendência: consulta financeira
    // reconhecida responde SEMPRE, e a pendência permanece intacta para o
    // próximo input. Exceção deliberada: transaction_reference ("caixa",
    // "confirmar", nomes/valores isolados) NÃO toma a frente -- esses
    // textos são respostas legítimas ao campo pendente e continuam
    // alimentando o fluxo de pendência (nunca uma pergunta financeira de
    // verdade: pergunta com começo claro é filtrada por
    // isLikelyFinancialQuestion antes de qualquer criação de conta).
    const engineOutcome = resolveFinancialQuery({
      text,
      snapshot: financialContext.snapshot,
      mode,
      conversationStyle,
      history: messages,
    });
    if (
      engineOutcome.handled
      && engineOutcome.queryType !== 'transaction_reference'
    ) {
      syncMessageToSupabase(userMsg);
      createAssistantResponse(
        engineOutcome.response.text,
        { highlight: engineOutcome.response.highlight },
      );
      return true;
    }

    const action = pendingAction ?? financialConversation.state.action;
    const activeStackAction = pendingActionStackRef.current
      ? getActivePendingAction(pendingActionStackRef.current)
      : null;
    const accountDependencyActive = isAccountCreationDependency(activeStackAction);
    const categoryDependencyActive = isCategoryCreationDependency(activeStackAction);
    const categoryIssueCode = action?.issues?.[0]?.code ?? null;
    const categoryConfirmationPending = [
      'category_approximate',
      'category_not_found',
    ].includes(categoryIssueCode);
    // BUG REAL (achado em validação manual): quando a Uni está esperando um
    // CAMPO ausente que não é conta/categoria (ex.: "Em qual conta você fez
    // esse pagamento?" já resolvido, mas ainda faltando valor/descrição/data
    // -- ou o próprio campo de conta antes de virar uma dependência de
    // criação), pendingAction/accountDependencyActive/categoryDependencyActive/
    // categoryConfirmationPending são todos falsos (a ação só vira
    // "pendingAction" quando status === 'ready', ver publishConversationResult).
    // Antes disso, classifyPendingActionReply NUNCA era chamado, então dizer
    // "cancelar" era tratado como se fosse a RESPOSTA ao campo pedido --
    // literalmente propondo criar uma conta chamada "cancelar". Classificar
    // sempre corrige isso; a allowlist fechada de CONFIRMATION_PATTERNS/
    // CANCELLATION_PATTERNS garante que uma resposta real (nome de conta,
    // valor, descrição) nunca bate por acidente.
    const replyType = classifyPendingActionReply(text);
    syncMessageToSupabase(userMsg);

    // Cancelamento do lançamento simples AINDA em esclarecimento (sem card de
    // confirmação, sem dependência de conta/categoria ativa) -- nunca deixa
    // "cancelar" ser interpretado como o valor do campo pendente. Categoria
    // aproximada/inexistente mantém seu próprio fluxo de rejeição (troca de
    // categoria, não cancelamento total), por isso fica de fora daqui.
    if (
      !pendingAction
      && !accountDependencyActive
      && !categoryDependencyActive
      && !categoryConfirmationPending
      && (replyType === 'cancel' || isCancelEntirePendingFlow(text))
    ) {
      financialConversation.cancel();
      clearCurrentPendingAction();
      createAssistantResponse('Tudo bem. Não registrei nada.');
      return true;
    }

    if (accountDependencyActive && replyType === 'confirm') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) void handleConfirmAction(confirmationId);
      return true;
    }
    if (accountDependencyActive && (replyType === 'cancel' || isCancelEntirePendingFlow(text))) {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) {
        handleCancelAction(confirmationId, {
          cascade: isCancelEntirePendingFlow(text),
        });
      }
      return true;
    }
    if (accountDependencyActive) {
      createAssistantResponse(
        'Para continuar, confirme a criação da conta, cancele apenas a criação ou diga “cancelar tudo”.',
      );
      return true;
    }

    if (categoryDependencyActive && replyType === 'confirm') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) void handleConfirmAction(confirmationId);
      return true;
    }
    if (categoryDependencyActive && (replyType === 'cancel' || isCancelEntirePendingFlow(text))) {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) {
        handleCancelAction(confirmationId, {
          cascade: isCancelEntirePendingFlow(text),
        });
      }
      return true;
    }
    if (categoryDependencyActive) {
      createAssistantResponse(
        'Para continuar, confirme a criação da categoria, cancele apenas a criação ou diga “cancelar tudo”.',
      );
      return true;
    }

    if (categoryIssueCode === 'category_approximate') {
      const accepted = replyType === 'confirm';
      const rejected = replyType === 'cancel'
        || /^(?:outra|outra categoria)[.!]?$/i.test(text.trim());
      if (accepted || rejected) {
        const result = financialConversation.provideInput(accepted
          ? { categoryApproved: true }
          : {
              rejectedCategoryId: action.proposedCategory?.id,
              rejectedCategoryName: action.proposedCategory?.name,
            });
        publishConversationResult(result);
        return true;
      }
    }

    if (categoryIssueCode === 'category_not_found') {
      if (replyType === 'confirm') {
        const proposal = financialConversation.provideInput({
          categoryDecision: 'create_new',
        });
        if (openCategoryCreationDependency(proposal)) return true;
      }
      if (replyType === 'cancel') {
        const result = financialConversation.provideInput({
          rejectedCategoryName: action.proposedCategoryName,
        });
        publishConversationResult(result);
        return true;
      }
    }

    if (pendingAction && replyType === 'confirm') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) void handleConfirmAction(confirmationId);
      return true;
    }
    if (pendingAction && replyType === 'cancel') {
      const confirmationId = findPendingConfirmationMessageId();
      if (confirmationId) handleCancelAction(confirmationId);
      return true;
    }

    const resolvedInput = resolvePendingActionInput({
      value: text,
      action,
      accounts: accountState.accounts,
      categories: categoryState.categories,
      workspaceId: effectiveWorkspace?.id,
      referenceDate: getLocalIsoDate(),
    });
    if (resolvedInput.kind !== 'correction') {
      const accountNames = resolvedInput.accounts?.map((account) => account.name).filter(Boolean) ?? [];
      if (
        resolvedInput.kind === 'account_not_found'
        && !isLikelyFinancialQuestion(text)
        && startAccountDependency(text)
      ) {
        return true;
      }
      if (
        resolvedInput.kind === 'category_not_found'
        && startCategoryDependency(text, action)
      ) {
        return true;
      }
      const message = resolvedInput.kind === 'ambiguous_account'
        ? `Encontrei mais de uma conta correspondente: ${accountNames.join(', ')}. Qual delas você quer usar?`
        : resolvedInput.kind === 'account_not_found'
          ? accountNames.length
            ? `Não encontrei essa conta no Espaço ${financialWorkspaceType === 'business' ? 'Empresa' : 'Pessoal'}. Contas disponíveis: ${accountNames.join(', ')}.`
            : `Não encontrei essa conta e não há contas disponíveis no Espaço ${financialWorkspaceType === 'business' ? 'Empresa' : 'Pessoal'}.`
          : pendingAction
            ? 'Para continuar, diga “confirmar”, “cancelar” ou informe o campo que deseja corrigir.'
            : financialConversation.state.response || 'Não consegui identificar esse dado. Tente informar de outra forma.';
      createAssistantResponse(message);
      return true;
    }

    if (pendingAction) {
      setMessages((current) => current.map((message) => (
        message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
          : message
      )));
      setPendingAction(null);
    }
    const result = financialConversation.provideInput(resolvedInput.overrides);
    void publishConversationResultWithInference(result);
    return true;
  }

  function runDeterministicFinancialFlow(text, historySnapshot) {
      // REGRA GERAL DE PRIORIDADE: declarações/ações financeiras vencem
      // consultas. Frase reconhecida como ação (set_balance, ambiguidade
      // saldo/receita, receita, despesa, transferência, meta) pula os
      // motores de consulta e vai direto para o fluxo de registro; os
      // motores só rodam para perguntas e referências reais.
      if (!ACTION_STATEMENT_INTENTS.has(classifyIntent(text).intent)) {
        // Motor de consultas financeiras inteligentes: responde com dados
        // estruturados do FinancialSnapshot (contas, transações, saldos,
        // accountName/categoryName) antes de qualquer outro caminho. Quando
        // não reconhece uma consulta, devolve handled:false e o fluxo
        // determinístico atual segue intacto (classificador legado → parser de
        // registro → plano financeiro → LLM).
        const engineOutcome = resolveFinancialQuery({
          text,
          snapshot: financialContext.snapshot,
          mode,
          conversationStyle,
          history: historySnapshot,
        });

        if (engineOutcome.handled) {
          // FASE UNI PIPE: a resposta do FinancialQueryEngine passa pelo
          // pipeline oficial (cria → persiste → render → autoplay → fala),
          // garantindo que TODA consulta respondida com dados estruturados
          // também seja narrada pela voz, sem chamada direta de speak.
          createAssistantResponse(
            engineOutcome.response.text,
            { highlight: engineOutcome.response.highlight },
          );
          return;
        }

        const queryType = classifyFinancialQuery(text);

        if (queryType) {
          const isGoalQuery = String(queryType.type).startsWith('goal_')
            || queryType.type === 'required_monthly';
          const isLoading = isGoalQuery
            ? goalsState.isLoading
            : balanceState.isLoading || transactionsState.isLoading;
          const hasError = isGoalQuery
            ? goalsState.error
            : balanceState.error || transactionsState.error;

          if (isLoading) {
            createAssistantResponse(
              'Ainda estou carregando os dados financeiros do seu workspace. Aguarde um momento e tente novamente.',
              { persist: false },
            );
            return;
          }

          if (hasError) {
            createAssistantResponse(
              'Não foi possível consultar os dados financeiros agora. Tente novamente mais tarde.',
              { persist: false },
            );
            return;
          }

          if (!isGoalQuery && !financialContext.hasData) {
            createAssistantResponse(
              'Seu workspace ainda não possui dados financeiros. Cadastre uma conta ou transação para começar.',
              { persist: false },
            );
            return;
          }

          const response = buildQueryResponse(queryType, financialContext, mode, {
            projections: futureProjections,
            goalProjections: futureProjections.goalProjections,
            goals: goalsState.goals,
            conversationStyle,
          });
          if (response) {
            createAssistantResponse(response.text, { highlight: response.highlight });
            return;
          }
        }
      }

      const result = financialConversation.interpret(text);

      if (!result.handled) {
        // BLOCO E: transferência nunca é modelada pelo parser de uma única
        // operação (só entende income/expense) -- em vez do aviso estático
        // anterior, tentamos a camada neural (financial_plan) primeiro; só
        // cai no aviso "ainda não suportado" se ela não devolver um plano
        // válido (indisponível, erro, timeout, resposta fora do contrato).
        if (isUnsupportedIntentEligibleForPlan(result.parsed?.intent)) {
          void (async () => {
            const handled = await attemptFinancialPlan(text);
            if (handled) return;
            createAssistantResponse(
              'Transferências ainda não podem ser registradas pela Uni. Use o Financeiro para manter origem e destino sob sua revisão.',
            );
          })();
          return;
        }
        if (result.parsed?.intent === 'create_goal') {
          createAssistantResponse(
            'Ainda não posso criar objetivos pela conversa com segurança. Posso consultar seus objetivos ou orientar você a criá-los na área de Objetivos.',
          );
          return;
        }
        // Perguntas sobre futuro/tendência/continuidade financeira que não
        // batem com nenhum tipo suportado por classifyFinancialQuery NUNCA
        // vão ao LLM: ele inventaria números. Resposta determinística e
        // transparente, sem valor/prazo/percentual fabricado.
        if (detectFutureFinancialIntent(text)) {
          createAssistantResponse(buildFutureSafetyResponse(futureProjections.hasHistory));
          return;
        }
        // BUG REAL EM PRODUÇÃO: "Coloquei duzentos reais de gasolina." tinha
        // um verbo (coloquei) que não constava em classifyIntent -- o parser
        // devolvia handled:false com intent 'question', nenhum dos casos
        // acima cobria isso, e a frase caía direto em handleUnresolvedMessage
        // (chat geral), cujo prompt de suporte diz "você só pode orientar,
        // nunca dizer que fez" -- daí a resposta indevida "não consigo
        // registrar daqui". BARREIRA DETERMINÍSTICA: qualquer frase com um
        // valor monetário real (R$/reais, inclusive por extenso) e um sinal
        // mínimo de lançamento (verbo financeiro OU "despesa/gasto/receita/
        // entrada/pagamento") NUNCA é tratada como chat geral, mesmo que o
        // verbo específico não esteja catalogado em classifyIntent -- tenta
        // a camada neural (financial_plan, mesmo caminho já usado para
        // transferências) antes de qualquer resposta consultiva.
        if (looksLikeUnclassifiedFinancialStatement(text)) {
          void (async () => {
            const handled = await attemptFinancialPlan(text);
            if (handled) return;
            createAssistantResponse(
              'Entendi que pode ser um lançamento financeiro, mas não consegui identificar todos os detalhes. Pode reformular dizendo o valor e do que se trata? Por exemplo: "Gastei R$ 50 no mercado."',
            );
          })();
          return;
        }
        void handleUnresolvedMessage(text, historySnapshot);
        return;
      }

      // BUG REAL: o fallback de criação de conta pós-interpret disparava
      // para QUALQUER ação com conta desconhecida -- inclusive frases de
      // PERGUNTA que o FinancialQueryEngine não reconheceu mas o parser
      // determinístico interpretou como registro (ex.: "quando gastei no
      // caixa?" → conta "Caixa" desconhecida → "Posso criá-la?"). Criação
      // de conta exige intenção explícita de registro: pergunta com começo
      // claro nunca passa por aqui (cai na resposta de esclarecimento
      // normal da pendência).
      if (
        result.action?.proposedAccount
        && !isLikelyFinancialQuestion(text)
        && openAccountCreationDependency(result)
      ) {
        return;
      }
      void publishConversationResultWithInference(result);
  }

  function sendText(text) {
    if (!text.trim() || isTyping || isExecutingAction) return;
    setExecutionError(null);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    stickToBottom.current = true;
    const historySnapshot = messages;

    const userMsg = buildUserMessage(text);
    pushMessage(userMsg);
    setInputValue('');

    const hasPendingConversation = Boolean(
      pendingAction
      || isAccountCreationDependency(
        pendingActionStackRef.current
          ? getActivePendingAction(pendingActionStackRef.current)
          : null,
      )
      || isCategoryCreationDependency(
        pendingActionStackRef.current
          ? getActivePendingAction(pendingActionStackRef.current)
          : null,
      )
      || financialConversation.state.status === 'needs_clarification'
      || isFinancialPlanActive(),
    );
    if (hasPendingConversation) {
      // REGRA GERAL: uma pendência incompatível nunca sequestra uma intenção
      // explícita NOVA. Se a frase é reconhecida como ação financeira
      // (set_balance/ambiguidade/receita/despesa/transferência/meta) e o
      // intent declarado é DIFERENTE do intent da pendência atual ("Recebi
      // mil reais" contra uma pendência de despesa antiga, por exemplo), a
      // pendência é abandonada e a frase nova processada do zero -- nunca
      // vira correção de um campo da ação antiga. A mesma intenção (ex.:
      // usuário reiterando/completando o próprio lançamento) continua
      // alimentando a pendência como resposta legítima.
      const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;
      const declaredIntent = classifyIntent(text).intent;
      if (
        looksLikeFreshFinancialStatement(text)
        || looksLikeFreshBalanceStatement(text)
        || (ACTION_STATEMENT_INTENTS.has(declaredIntent) && declaredIntent !== pendingActionIntent)
      ) {
        abandonStalePendingState();
      } else {
        handlePendingConversationInput(text, userMsg);
        return;
      }
    }

    setIsTyping(true);
    syncMessageToSupabase(userMsg);

    setTimeout(() => {
      setIsTyping(false);

      // BLOCO E: heurística determinística (nunca IA) -- frases que
      // parecem multioperação/parceladas/recorrentes/transferência tentam
      // a camada neural (financial_plan) ANTES do parser de uma única
      // operação. Se a IA não devolver um plano válido, cai de volta no
      // fluxo determinístico normal (runDeterministicFinancialFlow), sem
      // perder a mensagem do usuário.
      if (looksLikeComplexFinancialText(text)) {
        void (async () => {
          const handled = await attemptFinancialPlan(text);
          if (!handled) {
            runDeterministicFinancialFlow(text, historySnapshot);
          }
        })();
        return;
      }

      runDeterministicFinancialFlow(text, historySnapshot);
    }, UNI_THINK_MIN_MS);
  }

  function handleSuggestionSelect(item) {
    sendText(item.label);
  }

  function handleModeChange(next) {
    if (isSimplifiedExperience || next === mode) return;
    uniVoice.stop();
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    const candidates = conversations
      .filter((c) => c.mode === next)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (candidates.length > 0) {
      switchConversation(candidates[0].id);
    } else {
      setMode(next);
      setMessages([]);
      setActiveId(null);
      setIsTyping(false);
      const conv = createLocalConversation(next);
      setConversations((prev) => {
        const nextList = [...prev, conv];
        saveHistory(nextList);
        return nextList;
      });
      setActiveId(conv.id);
      saveActiveId(conv.id);
      createAssistantResponse(
        next === 'empresa'
          ? 'Perfil alterado para Empresa. Vamos falar sobre o financeiro do seu negócio.'
          : 'Perfil alterado para Pessoal. Vamos falar sobre suas finanças pessoais.',
      );
    }
    void switchWorkspace(modeToWorkspaceType(next));
  }

  function handleNewChat() {
    uniVoice.stop();
    setVoiceMessageId(null);
    const updated = persistConversation(conversations, activeId, messages, mode);
    const conv = createLocalConversation(mode);
    const nextList = [...updated, conv];
    saveHistory(nextList);
    saveActiveId(conv.id);
    setConversations(nextList);
    setActiveId(conv.id);
    setMessages([]);
    setIsTyping(false);
    setPendingAction(null);
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setExecutionError(null);
    setIsExecutingAction(false);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    confirmingRef.current = false;
    financialConversation.reset();
    stickToBottom.current = true;
  }

  function handleSelectConversation(id) {
    const updated = persistConversation(conversations, activeId, messages, mode);
    saveHistory(updated);
    setConversations(updated);
    switchConversation(id);
  }

  async function handleDeleteConversation(id) {
    const deletingActive = id === activeId;

    if (dataService.isOnline()) {
      const current = conversations.find((c) => c.id === id);
      if (current?.source === 'supabase') {
        await dataService.deleteConversation(id);
      }
    }

    const withRemoval = conversations.filter((c) => c.id !== id);
    if (deletingActive) {
      uniVoice.stop();
      setVoiceMessageId(null);
      const conv = createLocalConversation(mode);
      const nextList = [...withRemoval, conv];
      setConversations(nextList);
      setActiveId(conv.id);
      setMessages([]);
      setPendingAction(null);
      pendingActionStackRef.current = null;
      setPendingActionStack(null);
      setExecutionError(null);
      setIsExecutingAction(false);
      setAiStatus(AI_STATUS.UNAVAILABLE);
      lastUnresolvedRef.current = null;
      confirmingRef.current = false;
      financialConversation.reset();
      saveHistory(nextList);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  async function handleConfirmAction(id) {
    if (confirmingRef.current) return;
    const stack = pendingActionStackRef.current;
    const activeStackAction = stack ? getActivePendingAction(stack) : null;
    const accountDependencyActive = isAccountCreationDependency(activeStackAction);
    const categoryDependencyActive = isCategoryCreationDependency(activeStackAction);
    if (!pendingAction && !accountDependencyActive && !categoryDependencyActive) return;

    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);

    try {
      if (accountDependencyActive) {
        const requestedAccount = activeStackAction.fields.account;
        const conflicts = findAccountCreationConflicts({
          accounts: accountState.accounts,
          requestedName: requestedAccount.name,
          workspaceId: effectiveWorkspace?.id,
        });

        if (conflicts.exact.length > 1 || conflicts.similar.length) {
          const candidates = [...conflicts.exact, ...conflicts.similar];
          const names = candidates.map((account) => account.name).join(', ');
          const errorText = `Encontrei conta semelhante neste espaço: ${names}. Cancele a criação e escolha uma dessas contas.`;
          reportConfirmationError(id, errorText);
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

        let dependencyOutcome;
        if (conflicts.exact.length === 1) {
          dependencyOutcome = completeAccountCreationDependency(
            stack,
            conflicts.exact[0],
          );
        } else {
          dependencyOutcome = await accountDependencyCoordinator.execute(stack);
        }

        if (
          dependencyOutcome?.error
          || !dependencyOutcome?.completedAction?.result?.id
          || !dependencyOutcome?.resumedAction
        ) {
          reportConfirmationError(id, 'Não consegui criar essa conta. A movimentação foi preservada.');
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

        const account = dependencyOutcome.completedAction.result;
        const parentSnapshot = dependencyOutcome.resumedAction.fields.snapshot;
        financialConversation.restore(parentSnapshot);
        const resumedResult = financialConversation.provideInput({
          accountId: account.id,
          accountRecord: account,
        });
        const resumedSnapshot = {
          ...parentSnapshot,
          action: resumedResult.action,
          response: resumedResult.response?.text ?? parentSnapshot.response,
        };
        const updatedStack = updateResumedFinancialSnapshot(
          dependencyOutcome.stack,
          resumedSnapshot,
        ).stack;
        pendingActionStackRef.current = updatedStack;
        setPendingActionStack(updatedStack);
        setMessages((prev) => prev.map((message) => (
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
            : message
        )));
        createAssistantResponse(
          conflicts.exact.length
            ? `A conta ${account.name} já existia neste espaço. Retomei a movimentação sem duplicá-la.`
            : `Conta ${account.name} criada. Retomei a movimentação do ponto em que paramos.`,
        );
        publishConversationResult(resumedResult);
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      if (categoryDependencyActive) {
        const requestedCategory = activeStackAction.fields.category;
        const categoryResolution = resolveFinancialCategory({
          categories: categoryState.categories,
          transactionType: requestedCategory.category_type,
          requestedName: requestedCategory.name,
          normalizedInput: requestedCategory.name,
        });

        let dependencyOutcome;
        if (
          categoryResolution.status === CATEGORY_RESOLUTION_STATUS.RESOLVED
          && categoryResolution.category
        ) {
          dependencyOutcome = completeCategoryCreationDependency(
            stack,
            categoryResolution.category,
          );
        } else {
          dependencyOutcome = await categoryDependencyCoordinator.execute(stack);
        }

        if (
          dependencyOutcome?.error
          || !dependencyOutcome?.completedAction?.result?.id
          || !dependencyOutcome?.resumedAction
        ) {
          reportConfirmationError(id, 'Não consegui criar essa categoria. A movimentação foi preservada.');
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

        const category = dependencyOutcome.completedAction.result;
        const parentSnapshot = dependencyOutcome.resumedAction.fields.snapshot;
        financialConversation.restore(parentSnapshot);
        const resumedResult = financialConversation.provideInput({
          categoryId: category.id,
          categoryRecord: category,
        });
        const resumedSnapshot = {
          ...parentSnapshot,
          action: resumedResult.action,
          response: resumedResult.response?.text ?? parentSnapshot.response,
        };
        const updatedStack = updateResumedFinancialSnapshot(
          dependencyOutcome.stack,
          resumedSnapshot,
        ).stack;
        pendingActionStackRef.current = updatedStack;
        setPendingActionStack(updatedStack);
        setMessages((prev) => prev.map((message) => (
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
            : message
        )));
        createAssistantResponse(
          categoryResolution.status === CATEGORY_RESOLUTION_STATUS.RESOLVED
            ? `A categoria ${category.name} já existia. Retomei a movimentação sem duplicá-la.`
            : `Categoria ${category.name} criada. Retomei a movimentação do ponto em que paramos.`,
        );
        publishConversationResult(resumedResult);
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      const outcome = await financialConversation.confirm();

      if (!confirmingRef.current) return;
      if (!outcome || outcome.result?.error || !outcome.result?.data) {
        const errorText = outcome?.response?.text
          || 'Não consegui registrar essa movimentação. Tente novamente.';
        reportConfirmationError(id, errorText);
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      const successText = outcome.response?.text
        || 'Prontinho! Registrei essa movimentação para você.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, confirmation: { ...m.confirmation, status: 'confirmed' } }
            : m,
        ),
      );
      createAssistantResponse(successText);
      financialConversation.reset();
      clearCurrentPendingAction();
      pendingActionStackRef.current = null;
      setPendingActionStack(null);
      setPendingAction(null);
      setIsExecutingAction(false);
      confirmingRef.current = false;
      notifyFinancialDataChanged('uni-chat');
    } catch {
      if (!confirmingRef.current) return;
      reportConfirmationError(id, 'Ocorreu um erro inesperado. Tente novamente.');
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function handleEditAction() {
    setInputValue('Quero alterar o valor para ');
  }

  function handleCancelAction(id, { cascade = false } = {}) {
    const stack = pendingActionStackRef.current;
    const activeStackAction = stack ? getActivePendingAction(stack) : null;
    if (isAccountCreationDependency(activeStackAction)) {
      const transition = cancelAccountCreationDependency(stack, { cascade });
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
            : message,
        ),
      );
      setExecutionError(null);
      setIsExecutingAction(false);
      confirmingRef.current = false;

      if (cascade || !transition.resumedAction) {
        pendingActionStackRef.current = null;
        setPendingActionStack(null);
        setPendingAction(null);
        financialConversation.cancel();
        clearCurrentPendingAction();
        createAssistantResponse('Tudo bem. Cancelei a criação da conta e a movimentação.');
        return;
      }

      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      setPendingAction(null);
      financialConversation.restore(transition.resumedAction.fields.snapshot);
      createAssistantResponse(
        'Tudo bem. Não criei a conta. A movimentação continua preservada; informe outra conta para continuar.',
      );
      return;
    }

    if (isCategoryCreationDependency(activeStackAction)) {
      const transition = cancelCategoryCreationDependency(stack, { cascade });
      setMessages((prev) =>
        prev.map((message) =>
          message.id === id
            ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
            : message,
        ),
      );
      setExecutionError(null);
      setIsExecutingAction(false);
      confirmingRef.current = false;

      if (cascade || !transition.resumedAction) {
        pendingActionStackRef.current = null;
        setPendingActionStack(null);
        setPendingAction(null);
        financialConversation.cancel();
        clearCurrentPendingAction();
        createAssistantResponse('Tudo bem. Cancelei a criação da categoria e a movimentação.');
        return;
      }

      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      setPendingAction(null);
      financialConversation.restore(transition.resumedAction.fields.snapshot);
      createAssistantResponse(
        'Tudo bem. Não criei a categoria. A movimentação continua preservada; informe outra categoria para continuar.',
      );
      return;
    }

    confirmingRef.current = false;
    setIsExecutingAction(false);
    setPendingAction(null);
    setExecutionError(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, confirmation: { ...m.confirmation, status: 'canceled' } }
          : m,
      ),
    );
    createAssistantResponse('Sem problemas, cancelei esse registro.');
    financialConversation.cancel();
    clearCurrentPendingAction();
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
  }

  function handleBeforeVoiceStart() {
    uniVoice.stop();
    setVoiceMessageId(null);
  }

  const isEmpty = messages.length === 0;
  const filteredConversations = conversations.filter((c) => c.mode === mode);

  if (variant === 'simplified-home') {
    return (
      <SimplifiedHomeView
        profile={profile}
        user={user}
        session={session}
        messages={messages}
        isTyping={isTyping}
        isExecuting={isExecutingAction}
        executionError={executionError}
        aiStatus={aiStatus}
        voiceEnabled={voicePreference.enabled}
        voiceController={uniVoice}
        onSendTranscript={sendText}
        onBeforeVoiceStart={handleBeforeVoiceStart}
        onConfirmAction={handleConfirmAction}
        onCancelAction={handleCancelAction}
        onSpeakMessage={handleSpeakMessage}
        onWelcomeVoiceSettled={handleWelcomeVoiceSettled}
      />
    );
  }

  return (
    <div className={styles.page}>
      <ChatHeader
        mode={mode}
        onModeChange={handleModeChange}
        onHistory={() => setShowHistory(true)}
        onNewChat={handleNewChat}
        isThinking={isTyping}
        showModeSelector={!isSimplifiedExperience}
      />

      {connectionStatus === 'offline' && (
        <div className={styles.offlineBanner} role="status">
          Modo offline — as mensagens serão salvas localmente
        </div>
      )}
      {connectionStatus === 'reconnecting' && (
        <div className={styles.reconnectBanner} role="status">
          Reconectando…
        </div>
      )}

      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={handleDeleteConversation}
        conversations={filteredConversations}
        activeId={activeId}
      />

      <div className={styles.body} ref={scrollRef} onScroll={handleScroll}>
        {isEmpty ? (
          <EmptyState
            userName={resolveGreetingName(profile)}
            suggestions={suggestions}
            onSelect={handleSuggestionSelect}
            workspaceType={financialWorkspaceType}
          />
        ) : (
          <div className={styles.messages}>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onConfirmAction={handleConfirmAction}
                onEditAction={handleEditAction}
                onCancelAction={handleCancelAction}
                isExecuting={isExecutingAction}
                executionError={message.confirmation?.status === 'pending' ? executionError : null}
                voiceEnabled={voicePreference.enabled}
                voiceStatus={uniVoice.status}
                voiceError={uniVoice.error}
                isActiveVoiceMessage={voiceMessageId === message.id}
                onSpeakMessage={handleSpeakMessage}
                onPauseResumeVoice={handlePauseResumeVoice}
                onStopVoice={handleStopVoice}
              />
            ))}
            {isTyping && (
              <>
                <TypingIndicator />
                {aiStatus === AI_STATUS.LOADING && (
                  <button
                    type="button"
                    className={styles.cancelAiButton}
                    onClick={handleCancelAi}
                  >
                    Cancelar resposta
                  </button>
                )}
              </>
            )}
            {!isTyping && aiStatus === AI_STATUS.ERROR && (
              <ErrorState onRetry={handleRetryAi} />
            )}
            {!isTyping && aiStatus === AI_STATUS.CANCELLED && (
              <ErrorState variant="cancelled" />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        <ScrollToLatest visible={showScrollBtn && !isEmpty} onClick={scrollToLatest} />
      </div>

      <div className={styles.footer}>
        {!isEmpty && (
          <QuickSuggestions items={suggestions} onSelect={handleSuggestionSelect} variant="rail" />
        )}
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={sendText}
          onBeforeVoiceStart={handleBeforeVoiceStart}
          disabled={isTyping || isExecutingAction}
          isSpeaking={isSpeaking}
          onInterruptSpeech={handleStopVoice}
        />
      </div>
    </div>
  );
}
