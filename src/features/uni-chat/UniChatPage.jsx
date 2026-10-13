import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { trackGa4ConfirmedTransactionCreation } from '../analytics/ga4ProductEvents.js';
import {
  GA4_PRODUCT_ORIGINS,
} from '../analytics/ga4ProductContracts.js';
import { buildUniPrefillFromState } from '../categories/categoryUtils.js';
import { useAccess } from '../../app/AccessContext';
import { useSession } from '../../app/SessionContext';
import {
  buildAccountCreationConfirmation,
  buildCategoryCreationConfirmation,
  cancelAccountCreationDependency,
  cancelCategoryCreationDependency,
  classifyPendingActionReply,
  looksLikePendingCorrection,
  clearPendingActionStack,
  clearPendingAction,
  completeAccountCreationDependency,
  completeCategoryCreationDependency,
  confirmPendingAction,
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
  buildPlanCancelledText,
  buildPlanOperationCancelledText,
  buildPlanResultText,
  buildPlanSummaryText,
  buildInstallmentConfirmationText,
  buildPlannedConfirmationText,
  describePlanOperation,
  findPlanOperationCancelTarget,
  getSingleReadyPlanAction,
  parsePlanCorrectionOverrides,
  isUnsupportedIntentEligibleForPlan,
  looksLikeFreshFinancialStatement,
  looksLikeFreshBalanceStatement,
  looksLikeUnclassifiedFinancialStatement,
  motivoParaNaoLerSemModelo,
  createConversationalMemory,
  classifyPendingActionRelation,
  createAgendaConversationFlow,
} from '../uni-conversation';
import {
  useUniLlm, AI_STATUS, resolveConversationStyle,
  createPhraseStructuredFactService, isLlmPhrasingFlagEnabled,
} from '../uni-llm';
import {
  correcaoDoRascunho,
  createUniInterpretClient,
  interpretacaoParaOverrides,
  montarHistoricoParaInterpretacao,
  montarRascunhoParaInterpretacao,
} from '../uni-interpret/uniInterpretClient.js';
import {
  lerMemoriaDaDescricao,
  registrarConfirmacaoNaMemoria,
  registrarDesfazerNaMemoria,
  registrarLancamentoDiretoNaMemoria,
} from '../uni-interpret/memoriaDeCategoria.js';
import {
  DESFAZER_LANCAMENTO_DIRETO_MS,
  memoriaPermiteLancarDireto,
  operacaoParaLancarDireto,
  rascunhoPodeIrDireto,
  TEXTO_LANCAMENTO_DIRETO_VENCIDO,
  textoDoLancamentoDireto,
  textoDoLancamentoDiretoDesfeito,
} from '../uni-interpret/lancamentoDireto.js';
import {
  montarPedidoDeCategoria,
  respostaAoPedidoDeCategoria,
  textoDoPedidoFeito,
} from '../uni-conversation/pedidoDeCategoria.js';
import {
  ACOES_DE_META,
  montarPedidoDeMeta,
  respostaAoPedidoDeMeta,
  textoDaConsultaDeMetas,
  metaTemDinheiro,
  textoDaMetaComAportes,
  textoDoPedidoDeMetaFeito,
  textoDoErroDoMovimento,
} from '../uni-conversation/pedidoDeMeta.js';
import { listContributions } from '../goals/goalService.js';
import { getCategoryErrorMessage } from '../categories/categoryUtils.js';
import {
  alvoDaExclusao,
  camposParaRecriar,
  cardDaExclusao,
  DESFAZER_EXCLUSAO_MS,
  ehPedidoDeDesfazer,
  motivoDeBloqueioDaExclusao,
  respostaAoPedidoDeExclusao,
  TEXTO_DESFAZER_VENCIDO,
  TEXTO_EXCLUSAO_EM_LOTE,
  TEXTO_EXCLUSAO_SEM_ALVO,
  textoDaExclusao,
  textoDaExclusaoDesfeita,
  textoDaExclusaoFeita,
} from '../uni-conversation/exclusaoDeLancamento.js';
import {
  ROTAS_INTERPRETACAO,
  escolherRotaDaInterpretacao,
  interpretacaoParaAgenda,
  interpretacaoParaPlano,
  interpretacaoParaRascunho,
} from '../uni-interpret/uniInterpretRoteamento.js';
import {
  consultaRespondivel,
  memoriaDaConsulta,
  periodoDaConsulta,
  responderConsulta,
} from '../uni-interpret/uniInterpretConsulta.js';
import { executeFinancialIntentAction } from '../uni-conversation/financialIntentAction.js';
import { supabase, supabaseUrl, supabaseAnonKey, isSupabaseConfigured } from '../../services/supabaseClient';
import {
  useUniVoiceTts, useVoicePreference, VOICE_TTS_STATUS, MAX_TTS_TEXT_LENGTH, buildSpeechText,
  normalizeFinancialTextForSpeech,
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
import { useUniProcessingMessage } from './useUniProcessingMessage.js';
import { resolveOperationHintFromIntent } from './uniProcessingMessages.js';
import { useTextAudioSync } from './useTextAudioSync.js';
import { useAccounts, useCategories, useTransactions, useFinancialBalances, useWorkspaceRole } from '../../hooks';
import { useGoals } from '../goals/useGoals';
import { buildFutureProjections } from '../future/futureService';
import { useUniChatFinancialData } from './useUniChatFinancialData';
import { useUniResponsePipeline } from './useUniResponsePipeline';
import { reserveMessageIds } from './messageIdRegistry.js';
import { dedupeMessagesForRender, mergeRestoredMessages } from './mergeRestoredMessages.js';
import {
  invalidateAgendaRequestContext,
  isAgendaRequestContextCurrent,
} from './agendaRequestLifecycle.js';
import {
  classifyIntent,
  normalizeFinancialText,
  stripLeadingConversationalPrefix,
} from '../uni-intents/index.js';
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
import { SIMPLIFIED_ROUTES, SimplifiedHomeView } from '../simplified-app/index.js';
import {
  buildPublicMovementSummaryResponse,
  enforcePublicFinancialResponsePolicy,
  isPublicFinancialSummaryRequest,
  isRetiredPublicBalanceRequest,
} from './publicBalanceExperience.js';
import { useOptionalSimplifiedProduct } from '../simplified-app/useSimplifiedProduct.js';
import { useVisualViewportContext } from '../simplified-app/useVisualViewport.js';
import {
  SIMPLIFIED_CHAT_MODE,
  SIMPLIFIED_PRODUCT_MODE,
} from '../simplified-app/simplifiedProductConfig.js';
import { resolveGreetingName } from './greeting';
import { resolveCommonConversationResponse } from './commonConversation.js';
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
import {
  executeConfirmedFinancialAction,
  executeConfirmedInstallmentPurchase,
} from '../../services/confirmedFinancialActionService.js';
import {
  createTransaction,
  getTransaction,
  listTransactions,
  listTransactionsForPeriod,
  updateTransaction,
} from '../../services/transactionService.js';
import {
  analisarAlvo,
  cardDaAlteracao,
  escolherCandidato,
  FORMAS_DE_EDICAO,
  interpretarPedidoDeEdicao,
  lerAjusteDaAlteracao,
  localizarLancamento,
  montarAlteracao,
  motivoDeBloqueio,
  textoDaAlteracao,
  textoDaAlteracaoFeita,
  textoDaEscolha,
} from '../uni-conversation/edicaoDeLancamento.js';
import * as dataService from './uniChatDataService';
import { CANCELED_WITH_FOLLOW_UP, withFollowUpQuestion } from './confirmationFollowUp.js';
import { buildConfirmationEditForm } from './confirmationEditForm.js';
import styles from './UniChatPage.module.css';

const UNI_THINK_MIN_MS = 600;
// BLOCO F: mesmo TTL já usado pelo Pending Action Stack (pendingActionStorage.js)
// -- um plano financeiro pendente não pode ficar executável indefinidamente.
const FINANCIAL_PLAN_TTL_MS = 15 * 60 * 1000;
// Edição de lançamento salvo esperando escolha ou confirmação.
const EDICAO_TTL_MS = 15 * 60 * 1000;
// "corrige pra 50" vale para o lançamento confirmado há até 30 minutos.
const ULTIMO_CONFIRMADO_TTL_MS = 30 * 60 * 1000;
const TEXTO_EDICAO_VENCIDA = 'Essa alteração expirou e nada foi salvo. Peça de novo se ainda quiser alterar.';
const TEXTO_CATEGORIA_VENCIDA = 'Esse pedido de categoria expirou e nada foi salvo. Peça de novo se ainda quiser.';
const TEXTO_META_VENCIDA = 'Esse pedido de meta expirou e nada foi salvo. Peça de novo se ainda quiser.';
const TEXTO_EXCLUSAO_VENCIDA = 'Esse pedido de exclusão expirou e nada foi apagado. Peça de novo se ainda quiser excluir.';
// Depois que o prazo de desfazer passa, "desfazer" ainda recebe o aviso por
// este tempo; depois disso a palavra volta a ser frase comum.
const DESFAZER_AVISO_VENCIDO_MS = 5 * 60 * 1000;
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
const TEXTO_SEM_MODELO = Object.freeze({
  varias: 'Não consegui separar esses lançamentos agora. Diga um de cada vez, com o valor e do que se trata.',
  parcela: 'Não consegui ler o parcelamento agora. Tente de novo em instantes ou lance pelo Financeiro.',
});
const TEXTO_RECORRENCIA_SO_ESTE_LANCAMENTO = 'Esse rascunho vale só para este lançamento. Para repetir, crie o lançamento recorrente na tela Financeiro.';
const TEXTO_META_SEM_CRIACAO = 'Ainda não posso criar metas pela conversa com segurança. Posso consultar suas metas ou orientar você a criá-las na área de Metas.';
const EMPTY_FINANCIAL_FALLBACK = Object.freeze({
  accounts: Object.freeze([]),
  categories: Object.freeze([]),
  transactions: Object.freeze([]),
});

// Resposta quando nem as regras fixas nem a IA deram conta do pedido.
const UNI_DETERMINISTIC_FALLBACK_TEXT =
  'Não entendi esse pedido. Tente dizer de outro jeito, por exemplo: gastei 50 no mercado, ou marque uma reunião amanhã às 10h.';
const UNI_LLM_DAILY_LIMIT_TEXT =
  'Você chegou ao limite de respostas da Uni por hoje. Amanhã o limite volta. Até lá, lançamentos simples como gastei 50 no mercado continuam funcionando.';

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
  const { isKeyboardOpen } = useVisualViewportContext();
  const navigate = useNavigate();
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
  const automaticVoiceSource = variant === 'simplified-home'
    ? 'home_response'
    : 'chat_response';
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

  // Texto da última pergunta do usuário, para a política de resposta
  // financeira pública saber o que foi pedido.
  const lastUserTurnTextRef = useRef('');
  // Sprint 2 — Memória Conversacional: contexto de curto prazo (conta/
  // categoria/última consulta) por instância de conversa, nunca persiste.
  // Resetado na troca de conversa.
  const conversationalMemoryRef = useRef(createConversationalMemory());

  // BLOCO VOZ 1: SEMPRE fala, mesmo quando o texto é longo demais para o
  // limite da Edge Function (MAX_TTS_TEXT_LENGTH) -- gera uma versão curta e
  // natural (buildSpeechText) para a voz, mas nunca altera o texto completo
  // exibido na tela (message.text no MessageBubble continua intacto).
  // HOTFIX FINAL P3: normalizeFinancialTextForSpeech roda ANTES de
  // buildSpeechText (nunca depois) -- o corte por tamanho precisa operar
  // sobre o texto já por extenso (mais longo que "R$ 497,80"), senão o
  // corte poderia terminar no meio de uma expressão monetária. Só afeta o
  // texto enviado ao provider de TTS -- message.text (visual/persistido)
  // nunca é tocado.
  const handleSpeakMessage = useCallback((message, requestMetadata = {}) => {
    if (!message?.text) return;
    setVoiceMessageId(message.id);
    void uniVoice.speak(
      buildSpeechText(normalizeFinancialTextForSpeech(message.text), MAX_TTS_TEXT_LENGTH),
      {
        messageId: message.id,
        source: requestMetadata.source ?? 'manual_replay',
      },
    );
  }, [uniVoice]);

  // Com a conversa em tempo real aberta, quem fala é a Uni da conversa:
  // a voz antiga não narra as respostas por cima dela (épico #116).
  const realtimeVoiceActiveRef = useRef(false);
  const handleRealtimeVoiceActiveChange = useCallback((active) => {
    realtimeVoiceActiveRef.current = active;
    if (active) uniVoice.stop();
  }, [uniVoice]);

  const handleAutomaticSpeakMessage = useCallback((message) => {
    if (realtimeVoiceActiveRef.current) return;
    handleSpeakMessage(message, { source: automaticVoiceSource });
  }, [automaticVoiceSource, handleSpeakMessage]);

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
    if (realtimeVoiceActiveRef.current) return;
    void uniVoice.speak(buildSpeechText(normalizeFinancialTextForSpeech(text), MAX_TTS_TEXT_LENGTH), {
      messageId: null,
      source: automaticVoiceSource,
    });
  }, [automaticVoiceSource, isSimplifiedExperience, voicePreference.enabled, uniVoice]);

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
  // Categoria oculta no espaço (#184) não entra em sugestão, rascunho nem
  // opção de correção. Consultas, relatórios e busca de lançamento antigo
  // continuam com a lista completa (categoryState.categories).
  const categoriasSugeriveis = categoryState.categoriasVisiveis;

  const transactionsState = useTransactions({
    workspaceId: effectiveWorkspace?.id,
    fallbackTransactions: financialFallback.transactions,
  });
  const saveTransactionForVoice = transactionsState.saveTransaction;
  const saveVoiceTransaction = useCallback(
    (values, transactionId = null) => saveTransactionForVoice(
      values,
      transactionId,
      { origin: GA4_PRODUCT_ORIGINS.VOICE },
    ),
    [saveTransactionForVoice],
  );

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
    referenceDate: getLocalIsoDate(),
  });

  const financialConversation = useUniConversation({
    accounts: accountState.accounts,
    accountTypes: accountState.accountTypes,
    categories: categoriasSugeriveis,
    executeAtomicAction: executeConfirmedFinancialAction,
    saveAccount: accountState.saveAccount,
    saveTransaction: saveVoiceTransaction,
    profileId: personalityProfileId,
    workspaceType: financialWorkspaceType,
    referenceDate: getLocalIsoDate(),
    allowedWriteIntents: ALLOWED_CHAT_WRITE_INTENTS,
    accountBalances: financialContext.snapshot.accountBalancesById,
  });
  const saveAccountForDependency = accountState.saveAccount;
  // BLOCO 5: coordinator persistido em ref para manter proteção de execução
  // única entre renders (useMemo cria novo a cada render, ref sobrevive).
  const accountDependencyCoordinatorRef = useRef(null);
  if (!accountDependencyCoordinatorRef.current) {
    accountDependencyCoordinatorRef.current = createPendingActionCoordinator({
      create_financial_account: async ({ fields }) => saveAccountForDependency(fields.account),
    });
  }
  const saveCategoryForDependency = categoryState.saveCategory;
  const categoryDependencyCoordinatorRef = useRef(null);
  if (!categoryDependencyCoordinatorRef.current) {
    categoryDependencyCoordinatorRef.current = createPendingActionCoordinator({
      create_financial_category: async ({ fields }) => saveCategoryForDependency({
        ...fields.category,
        applies_to: financialWorkspaceType,
      }),
    });
  }

  // Épico #76: a IA lê a frase inteira e escolhe valor, data, descrição,
  // conta e categoria entre os registros do próprio usuário. O resultado
  // corrige os campos do rascunho das regras; sem IA, ficam as regras.
  const uniInterpretClient = useMemo(
    () => createUniInterpretClient({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: uniLlm.enabled,
    }),
    [uniLlm.enabled],
  );

  // Sprint 1 (IA Conversacional) -- ponte "fato estruturado -> frase
  // natural" para as perguntas de clarificação (conta/categoria faltando
  // etc.). Mesma Edge Function do chat (uni-chat-llm), com o gate
  // ADICIONAL VITE_UNI_LLM_PHRASING_ENABLED
  // (default desligado) -- nenhum novo secret, nenhuma nova Edge Function.
  // Nunca decide conta/categoria, nunca persiste -- apenas fraseia o mesmo
  // `issue` que uniResponseBuilder.js já usa para o texto canônico.
  const phraseStructuredFactService = useMemo(
    () => createPhraseStructuredFactService({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: uniLlm.enabled && isLlmPhrasingFlagEnabled(),
    }),
    [uniLlm.enabled],
  );

  async function attemptNaturalPhrasing(result) {
    const action = result?.action;
    const issue = action?.issues?.[0];
    if (action?.status !== 'needs_clarification' || !issue || !phraseStructuredFactService.isSupported()) {
      return result;
    }

    const fact = {
      situation: 'needs_clarification',
      field: issue.field,
      code: issue.code,
      transactionType: action.transactionType ?? null,
      amount: action.amount ?? null,
      // Só nomes -- nunca IDs, saldos ou outros dados internos dos candidatos.
      candidates: Array.isArray(issue.candidates)
        ? issue.candidates.slice(0, 8).map((candidate) => candidate?.name).filter(Boolean)
        : [],
    };

    const { text } = await phraseStructuredFactService.phraseFact({ fact });
    if (!text) {
      // Erro, timeout, resposta inválida etc. -- nunca bloqueia o fluxo:
      // segue com o texto canônico original de uniResponseBuilder.js.
      return result;
    }

    return { ...result, response: { ...result.response, text } };
  }

  // Overrides da IA para o lançamento em andamento, ou null (sem IA,
  // falha, outro tipo de operação). Nunca lança.
  async function interpretWithAi(text, action, { history = messages, draft = null } = {}) {
    const transactionType = action?.transactionType;
    if (
      (transactionType !== 'expense' && transactionType !== 'income')
      || !effectiveWorkspace?.id
      || !uniInterpretClient.isSupported()
    ) {
      return null;
    }
    const { interpretacao } = await uniInterpretClient.interpretar({
      workspaceId: effectiveWorkspace.id,
      frase: text,
      historico: montarHistoricoParaInterpretacao(history),
      rascunho: draft,
    });
    return interpretacaoParaOverrides(interpretacao, { transactionType });
  }

  // Lançamento novo: a IA corrige os campos que as regras leram antes de o
  // card aparecer. "Mensalidade escolar das crianças" deixa de virar
  // Impostos pelo "das".
  // modeloJaLeu: a frase já passou pelo uni-interpret neste turno (#80) e
  // caiu nas regras; perguntar de novo só repete a chamada.
  async function publishInterpretedResult(result, text, history, modeloJaLeu) {
    const conversationId = activeIdRef.current;
    const overrides = modeloJaLeu ? null : await interpretWithAi(text, result?.action, { history });
    if (activeIdRef.current !== conversationId) return;
    const interpreted = overrides ? financialConversation.provideInput(overrides, result.parsed) : null;
    await publishConversationResultWithInference(
      interpreted ? { ...interpreted, parsed: result.parsed } : result,
    );
  }

  // Resposta a um rascunho de entrada ou saída (card na tela ou campo
  // pendente) lida pelo uni-interpret, com o rascunho junto.
  function podeLerRascunhoPeloModelo(action) {
    return Boolean(
      effectiveWorkspace?.id
      && uniInterpretClient.isSupported()
      && (action?.transactionType === 'expense' || action?.transactionType === 'income'),
    );
  }

  // pelasRegras lê a frase quando a interpretação não corrige este rascunho:
  // IA fora, erro, outra intenção ou nada muda.
  async function lerRascunhoPeloModelo(text, action, pelasRegras) {
    const conversationId = activeIdRef.current;
    const turnToken = uniTurnTokenRef.current;
    setIsTyping(true);
    let interpretacao;
    try {
      ({ interpretacao } = await uniInterpretClient.interpretar({
        workspaceId: effectiveWorkspace.id,
        frase: text,
        historico: montarHistoricoParaInterpretacao(messages),
        rascunho: montarRascunhoParaInterpretacao(action),
      }));
    } finally {
      setIsTyping(false);
    }
    if (activeIdRef.current !== conversationId || uniTurnTokenRef.current !== turnToken) return;
    // Os botões do card seguem ativos durante a espera: se a pessoa tocou em
    // Confirmar, Cancelar ou Editar, o rascunho já é outro e a resposta do
    // modelo não vale mais.
    if (rascunhoAtualRef.current !== action) return;

    const correcao = correcaoDoRascunho(interpretacao, action, { categorias: categoriasSugeriveis });
    if (!correcao) {
      pelasRegras();
      return;
    }
    const draftCardId = findPendingConfirmationMessageId();
    const marcarCardAtualizado = () => setMessages((current) => current.map((message) => (
      message.id === draftCardId && message.confirmation?.status === 'pending'
        ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
        : message
    )));

    // Categoria pedida pelo nome e fora do catálogo: o card de criar a
    // categoria vem antes, e o rascunho volta com os outros campos da frase.
    if (correcao.novaCategoria) {
      const draftAction = Object.keys(correcao.overrides).length
        ? financialConversation.provideInput(correcao.overrides).action ?? action
        : action;
      startCategoryDependency(correcao.novaCategoria, draftAction);
      marcarCardAtualizado();
      return;
    }

    if (pendingAction) {
      marcarCardAtualizado();
      setPendingAction(null);
    }
    const result = financialConversation.provideInput(correcao.overrides);
    await publishConversationResultWithInference(result);
  }

  async function publishConversationResultWithInference(result) {
    const phrased = await attemptNaturalPhrasing(result);
    publishConversationResult(phrased);
  }

  const [, setFinancialPlanState] = useState(null);
  const financialPlanRef = useRef(null);
  const financialAnalyticsOriginRef = useRef(GA4_PRODUCT_ORIGINS.MANUAL);
  // BLOCO F: nunca executar o mesmo plano duas vezes em paralelo (ex.: o
  // usuário toca/fala "confirmar" duas vezes rapidamente antes da primeira
  // rodada terminar) -- o RPC já é idempotente por operação
  // (p_client_operation_id), mas isso evita chamadas duplicadas e updates
  // de estado concorrentes no cliente.
  const confirmingPlanRef = useRef(false);
  const financialPlanConfirmationMessageIdRef = useRef(null);

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

  function publishFinancialPlanReview(plan) {
    const action = getSingleReadyPlanAction(plan);
    if (!action) {
      resolveFinancialPlanConfirmation('updated');
      createAssistantResponse(buildPlanSummaryText(plan));
      return;
    }

    resolveFinancialPlanConfirmation('updated');

    let text = 'Revise as informações antes de registrar.';
    if (action.installments) text = buildInstallmentConfirmationText(action);
    else if (action.planned) text = buildPlannedConfirmationText(action);
    const message = createAssistantResponse(text, {
      type: 'confirmation',
      confirmation: buildConfirmationFromAction(action),
      clientOperationId: action.clientOperationId,
    });
    financialPlanConfirmationMessageIdRef.current = message?.id ?? null;
  }

  function resolveFinancialPlanConfirmation(status) {
    const confirmationMessageId = financialPlanConfirmationMessageIdRef.current;
    if (!confirmationMessageId) return;
    setMessages((current) => current.map((message) => (
      message.id === confirmationMessageId
        ? { ...message, confirmation: { ...message.confirmation, status } }
        : message
    )));
    financialPlanConfirmationMessageIdRef.current = null;
  }

  // Plano de várias operações, parcela, recorrência ou transferência, já
  // lido pelo uni-interpret (#80): cada operação passa pelos resolutores de
  // conta e categoria e vai para a revisão.
  function iniciarPlanoFinanceiro(plan, text) {
    const createdPlan = createPendingFinancialPlan({
      plan,
      phrase: text,
      accounts: accountState.accounts,
      accountTypes: accountState.accountTypes,
      categories: categoriasSugeriveis,
      referenceDate: getLocalIsoDate(),
      workspaceType: financialWorkspaceType,
    });
    const analyticsOrigin = financialAnalyticsOriginRef.current === GA4_PRODUCT_ORIGINS.VOICE
      ? GA4_PRODUCT_ORIGINS.VOICE
      : GA4_PRODUCT_ORIGINS.MANUAL;
    const newPlan = {
      ...createdPlan,
      analyticsOrigin,
      operations: createdPlan.operations.map((operation) => ({
        ...operation,
        action: operation.action
          ? { ...operation.action, analyticsOrigin }
          : operation.action,
      })),
    };
    // Só parcela e recorrência: nada a confirmar, e um plano parado ali
    // prenderia as próximas frases até expirar.
    if (newPlan.operations.every((operation) => operation.capabilityPending)) {
      createAssistantResponse(
        `Entendi o seguinte:\n${newPlan.operations.map(describePlanOperation).join('\n')}\n\nNada foi registrado.`,
      );
      return;
    }
    setFinancialPlan(newPlan);
    publishFinancialPlanReview(newPlan);
  }

  async function confirmFinancialPlan() {
    const plan = financialPlanRef.current;
    if (!plan || !isPlanReadyForFinalConfirmation(plan) || isFinancialPlanExpired(plan)) return;
    if (confirmingPlanRef.current) return;
    confirmingPlanRef.current = true;

    setIsExecutingAction(true);
    setExecutionError(null);

// Uma operação por vez, pelo MESMO RPC atômico já usado pelo registro
    // de uma única transação -- nunca uma "transação fantasma" que finge
    // cobrir várias operações. A compra parcelada é a exceção: vai por
    // registrar_compra_parcelada, que grava todas as parcelas dela juntas.
    // Cada operação usa seu próprio client_operation_id como chave de idempotência (o mesmo já
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

    try {
      for (const op of persistable) {
        const result = await executeFinancialIntentAction(op.action, {
          executeAtomicAction: op.action.installments
            ? executeConfirmedInstallmentPurchase
            : executeConfirmedFinancialAction,
        });
        if (result?.error || !result?.data) {
          workingPlan = markPlanOperationFailed(workingPlan, op.temporaryId);
          setFinancialPlan(workingPlan);
          break;
        }
        trackGa4ConfirmedTransactionCreation({
          confirmed: true,
          idempotentReplay: result.data.idempotent_replay !== false,
          transactionType: op.action.transactionType,
          origin: op.action.analyticsOrigin ?? GA4_PRODUCT_ORIGINS.MANUAL,
        });
        workingPlan = markPlanOperationConfirmed(workingPlan, op.temporaryId, result.data);
        setFinancialPlan(workingPlan);
      }

      const planResultText = buildPlanResultText(workingPlan);
      createAssistantResponse(
        workingPlan.status === PLAN_STATUS.COMPLETED
          ? withFollowUpQuestion(planResultText)
          : planResultText,
      );
    } finally {
      // S6: rejeicao inesperada (rede/erro cru) nunca deixa a Uni travada
      // com isExecutingAction=true e confirmingPlanRef=true -- o estado
      // fica sempre recuperavel, pronto para retry.
      setIsExecutingAction(false);
      confirmingPlanRef.current = false;
    }

    if ([PLAN_STATUS.COMPLETED, PLAN_STATUS.PARTIAL].includes(workingPlan.status)) {
      notifyFinancialDataChanged('uni-chat');
    }
    if (workingPlan.status === PLAN_STATUS.COMPLETED) {
      resolveFinancialPlanConfirmation('confirmed');
      setFinancialPlan(null);
    }
  }

  function cancelFinancialPlanEntirely() {
    const plan = financialPlanRef.current;
    if (!plan) return;
    // O plano cancelado não precisa ser preservado em memória -- ao contrário
    // de uma correção pontual, aqui a conversa financeira encerra por completo.
    setFinancialPlan(null);
    resolveFinancialPlanConfirmation('canceled');
    createAssistantResponse(withFollowUpQuestion(buildPlanCancelledText()));
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
        categories: categoriasSugeriveis,
        operation: current,
      });
      if (overrides) {
        const updated = applyPlanOperationCorrection(plan, current.temporaryId, overrides);
        setFinancialPlan(updated);
        publishFinancialPlanReview(updated);
        return true;
      }
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
  // HOTFIX P1 (mensagens de processamento honestas): reaproveita a
  // classificação já feita por classifyIntent no início do turno para
  // escolher UMA mensagem de "interpretando" compatível com a operação real
  // (consultando dados / organizando movimentação / calculando impacto) --
  // nunca uma nova regra. `null` quando o intent não mapeia para nada
  // específico, caindo no genérico "Entendendo seu pedido…".
  const [interpretingOperationHint, setInterpretingOperationHint] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [conversations, setConversations] = useState(initialChatState.conversations);
  const [activeId, setActiveId] = useState(initialChatState.activeId);
  const [pendingAction, setPendingAction] = useState(null);
  // Mensagem em que a Uni perguntou a categoria do rascunho (#80). Os chips
  // só aparecem enquanto ela é a última resposta.
  const [categoryQuestionMessageId, setCategoryQuestionMessageId] = useState(null);
  // Rascunho de agora, para quem volta de uma espera saber se ele mudou.
  const rascunhoAtualRef = useRef(null);
  useEffect(() => {
    rascunhoAtualRef.current = pendingAction ?? financialConversation.state.action;
  });
  const [pendingActionStack, setPendingActionStack] = useState(null);
  const agendaConversationRef = useRef(null);
  if (!agendaConversationRef.current) {
    agendaConversationRef.current = createAgendaConversationFlow();
  }
  const [pendingHydrated, setPendingHydrated] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const confirmingRef = useRef(false);
  const pendingActionStackRef = useRef(null);
  const activeIdRef = useRef(activeId);
  const agendaRequestContextRef = useRef(null);
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
  // TOKEN DE TURNO (S4): incrementado a cada sendText. Cadeias assincronas
  // (LLM, plano financeiro) capturam o token no inicio e so
  // publicam a resposta se o token ainda for o atual -- resposta antiga
  // chegando depois de um turno novo nunca sobrescreve a conversa atual.
  const uniTurnTokenRef = useRef(0);

  agendaRequestContextRef.current = {
    userId: user?.id,
    workspaceId: effectiveWorkspace?.id,
    conversationId: activeId ?? 'local-conversation',
    mode,
  };

  function invalidateAgendaRequest(changes = {}) {
    return invalidateAgendaRequestContext(
      {
        turnTokenRef: uniTurnTokenRef,
        activeIdRef,
        contextRef: agendaRequestContextRef,
      },
      changes,
    );
  }

  function isAgendaRequestCurrent(request) {
    return isAgendaRequestContextCurrent(
      request,
      agendaRequestContextRef.current,
      uniTurnTokenRef.current,
    );
  }

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
    encerrarEdicao('expired');
    encerrarExclusao('expired');
    encerrarPedidoDeCategoria('expired');
    encerrarPedidoDeMeta('expired');
  }

  // Edição de lançamento já salvo pedida em conversa ("corrige o mercado de
  // ontem pra 50"). Pendência paralela, como o plano financeiro: a lista
  // para escolher qual lançamento ou o card esperando confirmação. Não
  // sobrevive a recarregar a página: o card fica expirado.
  const [edicaoPendente, setEdicaoPendenteState] = useState(null);
  const edicaoPendenteRef = useRef(null);
  const ultimoConfirmadoRef = useRef(null);
  // Categoria do primeiro rascunho de cada lançamento (#79), por
  // clientOperationId: na confirmação, categoria diferente desta é troca.
  const categoriaInicialPorOperacaoRef = useRef(new Map());

  function setEdicaoPendente(next) {
    edicaoPendenteRef.current = next;
    setEdicaoPendenteState(next);
  }

  function edicaoAtiva(edicao = edicaoPendenteRef.current) {
    return Boolean(
      edicao
      && Date.now() - edicao.criadaEm <= EDICAO_TTL_MS
      && edicao.conversationId === activeIdRef.current
      && edicao.workspaceId === effectiveWorkspace?.id,
    );
  }

  function encerrarEdicao(status) {
    const edicao = edicaoPendenteRef.current;
    if (!edicao) return;
    if (status && edicao.messageId) {
      setMessages((current) => current.map((message) => (
        message.id === edicao.messageId && message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status } }
          : message
      )));
    }
    setEdicaoPendente(null);
  }

  function contextoDaEdicao() {
    return {
      accounts: accountState.accounts,
      categories: categoryState.categories,
      workspaceId: effectiveWorkspace?.id ?? null,
      referenceDate: getLocalIsoDate(),
    };
  }

  // Último lançamento confirmado nesta conversa, para "corrige pra 50".
  function ultimoConfirmadoValido() {
    const ultimo = ultimoConfirmadoRef.current;
    return ultimo
      && ultimo.conversationId === activeIdRef.current
      && ultimo.workspaceId === effectiveWorkspace?.id
      && Date.now() - ultimo.em <= ULTIMO_CONFIRMADO_TTL_MS
      ? ultimo
      : null;
  }

  function ultimoLancamentoCriado() {
    return [...(transactionsState.transactions ?? [])]
      .filter((transacao) => transacao?.status !== 'canceled' && !motivoDeBloqueio(transacao))
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0] ?? null;
  }

  // Relê o lançamento antes do card: o card mostra o valor de agora e a
  // gravação só passa se ninguém tiver mexido nele depois (updated_at).
  async function prepararAlteracao(transacaoId, mudancas, turnToken) {
    const workspaceId = effectiveWorkspace?.id;
    const conversationId = activeIdRef.current;
    setIsTyping(true);
    const lida = await getTransaction(workspaceId, transacaoId).catch(() => null);
    if (uniTurnTokenRef.current !== turnToken || activeIdRef.current !== conversationId) return;
    setIsTyping(false);
    const transacao = lida?.data ?? null;
    if (!transacao) {
      createAssistantResponse('Não consegui abrir esse lançamento agora. Tente de novo ou altere na tela Financeiro.', { deduplicateNarration: false });
      return;
    }
    const contexto = contextoDaEdicao();
    const alteracao = montarAlteracao(transacao, mudancas, contexto);
    if (alteracao.erro) {
      createAssistantResponse(alteracao.erro, { deduplicateNarration: false });
      return;
    }
    const message = createAssistantResponse(textoDaAlteracao(transacao, alteracao.campos), {
      type: 'confirmation',
      confirmation: cardDaAlteracao(transacao, alteracao.campos, contexto),
      deduplicateNarration: false,
    });
    setEdicaoPendente({
      etapa: 'confirmar',
      transacao,
      mudancas,
      alteracoes: alteracao.alteracoes,
      campos: alteracao.campos,
      messageId: message?.id ?? null,
      workspaceId,
      conversationId,
      criadaEm: Date.now(),
    });
  }

  function publicarResultadoDaBusca(resultado, mudancas, turnToken) {
    if (resultado.tipo === 'bloqueado') {
      createAssistantResponse(resultado.motivo, { deduplicateNarration: false });
      return;
    }
    if (resultado.tipo === 'varios') {
      createAssistantResponse(
        textoDaEscolha(resultado.candidatos, resultado.total, contextoDaEdicao()),
        { deduplicateNarration: false },
      );
      setEdicaoPendente({
        etapa: 'escolher',
        candidatos: resultado.candidatos,
        mudancas,
        messageId: null,
        workspaceId: effectiveWorkspace?.id,
        conversationId: activeIdRef.current,
        criadaEm: Date.now(),
      });
      return;
    }
    void prepararAlteracao(resultado.transacao.id, mudancas, turnToken);
  }

  // Lançamento fora dos que estão carregados: com data dita, busca aquele
  // dia no servidor antes de dizer que não achou.
  async function buscarAlvoNoDia(alvo, mudancas, turnToken) {
    const conversationId = activeIdRef.current;
    setIsTyping(true);
    const doDia = await listTransactions(effectiveWorkspace?.id, { dateFrom: alvo.data, dateTo: alvo.data, limit: 100 })
      .catch(() => null);
    if (uniTurnTokenRef.current !== turnToken || activeIdRef.current !== conversationId) return;
    setIsTyping(false);
    const resultado = localizarLancamento(alvo, doDia?.data ?? [], { categories: categoryState.categories });
    if (resultado.tipo === 'nenhum') {
      createAssistantResponse(
        'Não encontrei esse lançamento nesse dia. Diga o nome como aparece no Financeiro, com o dia ou o valor.',
        { deduplicateNarration: false },
      );
      return;
    }
    publicarResultadoDaBusca(resultado, mudancas, turnToken);
  }

  // true quando a frase era um pedido de edição e já foi respondida.
  function tentarPedidoDeEdicao(texto, userMsg, declaredIntent, turnToken) {
    const contexto = contextoDaEdicao();
    const pedido = interpretarPedidoDeEdicao(texto, contexto);
    if (!pedido) return false;

    if (pedido.forma === FORMAS_DE_EDICAO.ULTIMO) {
      const ultimo = ultimoConfirmadoValido();
      const transacaoId = ultimo?.id ?? (pedido.ultimoExplicito ? ultimoLancamentoCriado()?.id : null);
      // Sem lançamento recente a que "pra 50" possa se referir, a frase
      // segue o caminho de sempre.
      if (!transacaoId || !pedido.mudancas) return false;
      syncMessageToSupabase(userMsg);
      void prepararAlteracao(transacaoId, pedido.mudancas, turnToken);
      return true;
    }

    const alvo = analisarAlvo(pedido.alvo, contexto);
    const resultado = localizarLancamento(alvo, transactionsState.transactions, { categories: categoryState.categories });
    if (resultado.tipo === 'nenhum') {
      // Sem lançamento com esse nome, "muda a reunião pra amanhã" é agenda.
      // Só valor, conta e categoria são inequívocos de lançamento.
      const mudancaDeLancamento = pedido.categoriaPedida
        || ['amount', 'accountId', 'categoryId'].some((campo) => pedido.mudancas?.[campo] !== undefined);
      if (
        pedido.forma === FORMAS_DE_EDICAO.COPULA
        // "troca o nome de Moradia para Casa" e "troca a categoria Moradia
        // pra Casa" mudam a categoria, não um lançamento: vão ao interpretador.
        || /^(?:nome\b|categoria\s+(?!d[oa]s?\b|dess|dest))/.test(normalizeFinancialText(pedido.alvo ?? ''))
        || declaredIntent.startsWith('agenda_')
        || ACTION_STATEMENT_INTENTS.has(declaredIntent)
        || looksLikeFreshFinancialStatement(texto)
        || !mudancaDeLancamento
      ) {
        return false;
      }
    }

    syncMessageToSupabase(userMsg);
    if (pedido.categoriaPedida) {
      createAssistantResponse(
        `Não encontrei a categoria ${pedido.categoriaPedida} neste espaço. Diga uma categoria que já existe ou crie ${pedido.categoriaPedida} na tela Categorias.`,
        { deduplicateNarration: false },
      );
      return true;
    }
    if (resultado.tipo === 'nenhum') {
      if (alvo.data) {
        void buscarAlvoNoDia(alvo, pedido.mudancas, turnToken);
      } else {
        createAssistantResponse(
          'Não encontrei esse lançamento entre os mais recentes. Diga também o dia ou o valor dele.',
          { deduplicateNarration: false },
        );
      }
      return true;
    }
    publicarResultadoDaBusca(resultado, pedido.mudancas, turnToken);
    return true;
  }

  // Resposta com a edição pendente. false quando a frase é outro assunto:
  // a edição é descartada e a frase segue o caminho de sempre.
  function tratarRespostaDaEdicao(texto, userMsg, turnToken) {
    const edicao = edicaoPendenteRef.current;
    const contexto = contextoDaEdicao();
    const resposta = classifyPendingActionReply(texto);

    if (edicao.etapa === 'confirmar') {
      if (resposta === 'confirm') {
        syncMessageToSupabase(userMsg);
        void confirmarEdicao(edicao.messageId);
        return true;
      }
      if (resposta === 'cancel') {
        syncMessageToSupabase(userMsg);
        cancelarEdicao(edicao.messageId);
        return true;
      }
      const ajuste = lerAjusteDaAlteracao(texto, contexto);
      if (ajuste?.mudancas) {
        syncMessageToSupabase(userMsg);
        encerrarEdicao('updated');
        void prepararAlteracao(edicao.transacao.id, { ...edicao.mudancas, ...ajuste.mudancas }, turnToken);
        return true;
      }
      encerrarEdicao('expired');
      return false;
    }

    if (resposta === 'cancel') {
      syncMessageToSupabase(userMsg);
      encerrarEdicao(null);
      createAssistantResponse(withFollowUpQuestion('Tudo bem. Não alterei nada.'), { deduplicateNarration: false });
      return true;
    }
    // "gastei 85 no mercado" é lançamento novo, mesmo batendo com o valor de
    // um item da lista.
    if (
      looksLikeFreshFinancialStatement(texto)
      || looksLikeFreshBalanceStatement(texto)
      || interpretarPedidoDeEdicao(texto, contexto)
    ) {
      encerrarEdicao(null);
      return false;
    }
    const escolhido = escolherCandidato(texto, edicao.candidatos, contexto);
    if (escolhido) {
      syncMessageToSupabase(userMsg);
      encerrarEdicao(null);
      void prepararAlteracao(escolhido.id, edicao.mudancas, turnToken);
      return true;
    }
    syncMessageToSupabase(userMsg);
    createAssistantResponse(
      `Não identifiquei qual deles. Diga o número da lista, de 1 a ${edicao.candidatos.length}, ou "cancelar".`,
      { deduplicateNarration: false },
    );
    return true;
  }

  async function confirmarEdicao(id) {
    const edicao = edicaoPendenteRef.current;
    if (!edicaoAtiva(edicao) || edicao.etapa !== 'confirmar' || confirmingRef.current) return;
    const messageId = id ?? edicao.messageId;
    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);
    try {
      const resultado = await updateTransaction(
        edicao.workspaceId,
        edicao.transacao.id,
        edicao.alteracoes,
        { expectedUpdatedAt: edicao.transacao.updated_at },
      );
      if (resultado?.error || !resultado?.data) {
        const mudou = resultado?.error?.code === 'TRANSACTION_CHANGED';
        if (mudou) {
          encerrarEdicao('expired');
          void transactionsState.refresh();
        }
        reportConfirmationError(
          messageId,
          mudou
            ? 'Esse lançamento mudou depois que eu preparei a alteração. Peça de novo para eu ver como ele está agora.'
            : 'Não consegui alterar esse lançamento. Tente de novo.',
        );
        return;
      }
      await Promise.all([
        transactionsState.refresh(),
        balanceState.refresh(),
        accountState.refresh(),
      ]);
      if (activeIdRef.current !== edicao.conversationId) return;
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
          : message
      )));
      setEdicaoPendente(null);
      ultimoConfirmadoRef.current = {
        id: edicao.transacao.id,
        workspaceId: edicao.workspaceId,
        conversationId: edicao.conversationId,
        em: Date.now(),
      };
      createAssistantResponse(withFollowUpQuestion(textoDaAlteracaoFeita(edicao.transacao, edicao.campos)));
      notifyFinancialDataChanged('uni-chat');
    } catch {
      reportConfirmationError(messageId, 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function cancelarEdicao(id) {
    const edicao = edicaoPendenteRef.current;
    if (!edicao) return;
    setMessages((current) => current.map((message) => (
      message.id === (id ?? edicao.messageId)
        ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
        : message
    )));
    setEdicaoPendente(null);
    setExecutionError(null);
    createAssistantResponse(withFollowUpQuestion('Tudo bem. Não alterei nada.'));
  }

  // Pedido de categoria (criar, renomear, excluir) esperando o Confirmar do
  // card. Pendência paralela, como a edição de lançamento, e com o mesmo
  // prazo. Não sobrevive a recarregar a página.
  const categoriaPendenteRef = useRef(null);
  const workspaceRole = useWorkspaceRole({
    workspaceId: effectiveWorkspace?.id,
    ownerUserId: effectiveWorkspace?.owner_user_id,
    userId: user?.id,
  });

  function pedidoDeCategoriaAtivo(pendente = categoriaPendenteRef.current) {
    return Boolean(
      pendente
      && Date.now() - pendente.criadaEm <= EDICAO_TTL_MS
      && pendente.conversationId === activeIdRef.current
      && pendente.workspaceId === effectiveWorkspace?.id,
    );
  }

  function encerrarPedidoDeCategoria(status) {
    const pendente = categoriaPendenteRef.current;
    if (!pendente) return;
    if (status && pendente.messageId) {
      setMessages((current) => current.map((message) => (
        message.id === pendente.messageId && message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status } }
          : message
      )));
    }
    categoriaPendenteRef.current = null;
  }

  function iniciarPedidoDeCategoria(pedidoDoModelo) {
    if (workspaceRole.isLoading) {
      createAssistantResponse('Ainda estou carregando as permissões deste espaço. Peça de novo em instantes.', { deduplicateNarration: false });
      return;
    }
    const pronto = montarPedidoDeCategoria(pedidoDoModelo, {
      categorias: categoryState.categories,
      // Sem conseguir ler o papel, quem decide é a regra do banco (RLS): o
      // card aparece e um erro de permissão volta no Confirmar.
      papel: workspaceRole.error ? { canUpdate: true, canDelete: true } : workspaceRole,
      userId: user?.id,
      espaco: financialWorkspaceType === 'business' ? 'Empresa' : 'Pessoal',
    });
    if (pronto.erro) {
      createAssistantResponse(pronto.erro, { deduplicateNarration: false });
      return;
    }
    const message = createAssistantResponse(pronto.texto, {
      type: 'confirmation',
      confirmation: pronto.card,
      deduplicateNarration: false,
    });
    categoriaPendenteRef.current = {
      pronto,
      messageId: message?.id ?? null,
      workspaceId: effectiveWorkspace?.id,
      conversationId: activeIdRef.current,
      criadaEm: Date.now(),
    };
  }

  // Frase nova com um pedido de categoria guardado. true quando ela já foi
  // respondida aqui.
  function tratarPedidoDeCategoriaPendente(texto, userMsg) {
    const pendente = categoriaPendenteRef.current;
    if (!pendente) return false;
    if (pedidoDeCategoriaAtivo(pendente)) return tratarRespostaDoPedidoDeCategoria(texto, userMsg);
    encerrarPedidoDeCategoria('expired');
    // "Confirmar" num card vencido, falado ou digitado, precisa ouvir que
    // nada foi salvo, e não seguir para o interpretador.
    if (respostaAoPedidoDeCategoria(texto, pendente.pronto) === 'input') return false;
    syncMessageToSupabase(userMsg);
    createAssistantResponse(TEXTO_CATEGORIA_VENCIDA, { deduplicateNarration: false });
    return true;
  }

  // Resposta com o card de categoria na tela. false quando a frase é outro
  // assunto: o card expira e a frase segue o caminho de sempre.
  function tratarRespostaDoPedidoDeCategoria(texto, userMsg) {
    const pendente = categoriaPendenteRef.current;
    const resposta = respostaAoPedidoDeCategoria(texto, pendente.pronto);
    if (resposta === 'confirm') {
      syncMessageToSupabase(userMsg);
      void confirmarPedidoDeCategoria(pendente.messageId);
      return true;
    }
    if (resposta === 'cancel') {
      syncMessageToSupabase(userMsg);
      cancelarPedidoDeCategoria(pendente.messageId);
      return true;
    }
    encerrarPedidoDeCategoria('expired');
    return false;
  }

  // Grava pelo mesmo hook da tela Categorias: o nome repetido, a categoria
  // com lançamentos e a falta de permissão voltam com o texto de lá.
  async function confirmarPedidoDeCategoria(id) {
    const pendente = categoriaPendenteRef.current;
    if (!pedidoDeCategoriaAtivo(pendente) || confirmingRef.current) return;
    const messageId = id ?? pendente.messageId;
    const { pronto } = pendente;
    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);
    try {
      let resultado;
      if (pronto.acao === 'criar') {
        resultado = await categoryState.saveCategory({ name: pronto.nome, category_type: pronto.categoryType });
      } else if (pronto.acao === 'renomear') {
        resultado = await categoryState.saveCategory({ name: pronto.nome }, pronto.categoria.id);
      } else {
        resultado = await categoryState.removeCategory(pronto.categoria.id);
      }
      if (resultado?.error) {
        reportConfirmationError(
          messageId,
          getCategoryErrorMessage(resultado.error, 'Não consegui salvar a categoria. Tente de novo ou use a tela Categorias.'),
        );
        return;
      }
      // Gravou: o pedido acaba mesmo que a pessoa tenha trocado de conversa
      // durante a gravação, senão um "sim" depois gravaria de novo.
      categoriaPendenteRef.current = null;
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
          : message
      )));
      notifyFinancialDataChanged('uni-chat');
      if (activeIdRef.current !== pendente.conversationId) return;
      createAssistantResponse(withFollowUpQuestion(textoDoPedidoFeito(pronto)));
    } catch {
      reportConfirmationError(messageId, 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function cancelarPedidoDeCategoria(id) {
    const pendente = categoriaPendenteRef.current;
    if (!pendente) return;
    setMessages((current) => current.map((message) => (
      message.id === (id ?? pendente.messageId)
        ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
        : message
    )));
    categoriaPendenteRef.current = null;
    setExecutionError(null);
    createAssistantResponse(withFollowUpQuestion('Tudo bem. Não mudei nenhuma categoria.'));
  }

  // Pedido de meta (criar, alterar, excluir) esperando o Confirmar do card
  // (#192). Mesma pendência paralela do pedido de categoria, com o mesmo
  // prazo. Não sobrevive a recarregar a página.
  const metaPendenteRef = useRef(null);

  function pedidoDeMetaAtivo(pendente = metaPendenteRef.current) {
    return Boolean(
      pendente
      && Date.now() - pendente.criadaEm <= EDICAO_TTL_MS
      && pendente.conversationId === activeIdRef.current
      && pendente.workspaceId === effectiveWorkspace?.id,
    );
  }

  function encerrarPedidoDeMeta(status) {
    const pendente = metaPendenteRef.current;
    if (!pendente) return;
    if (status && pendente.messageId) {
      setMessages((current) => current.map((message) => (
        message.id === pendente.messageId && message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status } }
          : message
      )));
    }
    metaPendenteRef.current = null;
  }

  function ehMovimentoDeMeta(acao) {
    return acao === ACOES_DE_META.APORTAR || acao === ACOES_DE_META.RETIRAR;
  }

  // Consultar responde na hora; criar, alterar, excluir, aportar e retirar
  // montam o card. Meta com aporte não sai pela conversa: a tela Metas
  // mostra o que iria junto.
  async function iniciarPedidoDeMeta(pedidoDoModelo, turnToken) {
    // Toda confirmação no chat recarrega as metas (isLoading volta a true):
    // com a lista já em mãos, o pedido segue. Só a primeira carga espera.
    if (goalsState.isLoading && goalsState.goals.length === 0) {
      createAssistantResponse('Ainda estou carregando as suas metas. Peça de novo em instantes.', { deduplicateNarration: false });
      return;
    }
    // Sem conseguir ler as metas, a lista vazia mentiria ("você não tem
    // metas") e deixaria criar uma repetida.
    if (goalsState.error && goalsState.error.code !== 'SUPABASE_NOT_CONFIGURED') {
      createAssistantResponse('Não consegui ler as suas metas agora. Tente de novo ou abra a tela Metas.', { deduplicateNarration: false });
      return;
    }
    if (pedidoDoModelo?.acao === 'consultar') {
      createAssistantResponse(textoDaConsultaDeMetas(pedidoDoModelo, { metas: goalsState.goals }), { deduplicateNarration: false });
      return;
    }
    const movimento = ehMovimentoDeMeta(pedidoDoModelo?.acao);
    // A transferência do aporte depende das contas. Só a primeira carga
    // conta como "sem contas": a recarga depois de um lançamento e o erro de
    // uma gravação antiga mantêm a lista em mãos.
    const contasSemLer = accountState.accounts.length === 0 && (accountState.isLoading || accountState.error);
    const pronto = montarPedidoDeMeta(pedidoDoModelo, {
      metas: goalsState.goals,
      contas: contasSemLer ? null : accountState.activeAccounts,
      hoje: getLocalIsoDate(),
      // A mesma chave em toda tentativa deste card: um "sim" repetido ou uma
      // nova tentativa depois de a resposta se perder não grava duas vezes.
      clientOperationId: movimento ? globalThis.crypto?.randomUUID?.() ?? null : null,
    });
    if (pronto.erro) {
      createAssistantResponse(pronto.erro, { deduplicateNarration: false });
      return;
    }
    if (pronto.acao === 'excluir') {
      const aportes = await listContributions(pronto.meta.id);
      if (uniTurnTokenRef.current !== turnToken) return;
      // Modo demo não tem aportes para conferir; qualquer outro erro para.
      if (aportes.error && aportes.error.code !== 'SUPABASE_NOT_CONFIGURED') {
        createAssistantResponse('Não consegui conferir os aportes dessa meta agora. Tente de novo ou use a tela Metas.', { deduplicateNarration: false });
        return;
      }
      const quantidadeDeAportes = aportes.data?.length ?? 0;
      if (metaTemDinheiro(pronto.meta, quantidadeDeAportes)) {
        createAssistantResponse(textoDaMetaComAportes(pronto.meta, quantidadeDeAportes), { deduplicateNarration: false });
        return;
      }
    }
    const message = createAssistantResponse(pronto.texto, {
      type: 'confirmation',
      confirmation: pronto.card,
      deduplicateNarration: false,
    });
    metaPendenteRef.current = {
      pronto,
      messageId: message?.id ?? null,
      workspaceId: effectiveWorkspace?.id,
      conversationId: activeIdRef.current,
      criadaEm: Date.now(),
    };
  }

  // Frase nova com um pedido de meta guardado. true quando ela já foi
  // respondida aqui.
  function tratarPedidoDeMetaPendente(texto, userMsg) {
    const pendente = metaPendenteRef.current;
    if (!pendente) return false;
    if (pedidoDeMetaAtivo(pendente)) return tratarRespostaDoPedidoDeMeta(texto, userMsg);
    encerrarPedidoDeMeta('expired');
    if (respostaAoPedidoDeMeta(texto, pendente.pronto) === 'input') return false;
    syncMessageToSupabase(userMsg);
    createAssistantResponse(TEXTO_META_VENCIDA, { deduplicateNarration: false });
    return true;
  }

  // Resposta com o card de meta na tela. false quando a frase é outro
  // assunto: o card expira e a frase segue o caminho de sempre.
  function tratarRespostaDoPedidoDeMeta(texto, userMsg) {
    const pendente = metaPendenteRef.current;
    const resposta = respostaAoPedidoDeMeta(texto, pendente.pronto);
    if (resposta === 'confirm') {
      syncMessageToSupabase(userMsg);
      void confirmarPedidoDeMeta(pendente.messageId);
      return true;
    }
    if (resposta === 'cancel') {
      syncMessageToSupabase(userMsg);
      cancelarPedidoDeMeta(pendente.messageId);
      return true;
    }
    encerrarPedidoDeMeta('expired');
    return false;
  }

  // Grava pelo mesmo hook da tela Metas.
  async function confirmarPedidoDeMeta(id) {
    const pendente = metaPendenteRef.current;
    if (!pedidoDeMetaAtivo(pendente) || confirmingRef.current) return;
    const messageId = id ?? pendente.messageId;
    const { pronto } = pendente;
    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);
    try {
      const movimento = ehMovimentoDeMeta(pronto.acao);
      let resultado;
      if (pronto.acao === 'criar') {
        resultado = await goalsState.addGoal(pronto.payload);
      } else if (pronto.acao === 'editar') {
        resultado = await goalsState.editGoal(pronto.meta.id, pronto.payload);
      } else if (movimento) {
        resultado = await goalsState.addGoalContribution(pronto.meta.id, pronto.payload);
      } else {
        resultado = await goalsState.removeGoal(pronto.meta.id);
      }
      if (resultado?.error) {
        // O hook guarda o erro da gravação como se fosse da leitura: sem
        // limpar, todo pedido de meta seguinte diria que não leu as metas.
        goalsState.clearError();
        reportConfirmationError(
          messageId,
          movimento
            ? textoDoErroDoMovimento(resultado.error, pronto.acao)
            : 'Não consegui salvar a meta. Tente de novo ou use a tela Metas.',
        );
        return;
      }
      // Gravou: o pedido acaba mesmo que a pessoa tenha trocado de conversa
      // durante a gravação, senão um "sim" depois gravaria de novo.
      metaPendenteRef.current = null;
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
          : message
      )));
      notifyFinancialDataChanged('uni-chat');
      if (activeIdRef.current !== pendente.conversationId) return;
      createAssistantResponse(withFollowUpQuestion(textoDoPedidoDeMetaFeito(pronto, { metaAtualizada: resultado?.data?.meta ?? null })));
    } catch {
      reportConfirmationError(messageId, 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function cancelarPedidoDeMeta(id) {
    const pendente = metaPendenteRef.current;
    if (!pendente) return;
    setMessages((current) => current.map((message) => (
      message.id === (id ?? pendente.messageId)
        ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
        : message
    )));
    metaPendenteRef.current = null;
    setExecutionError(null);
    createAssistantResponse(withFollowUpQuestion('Tudo bem. Não mudei nenhuma meta.'));
  }

  // Exclusão de lançamento salvo (#189) esperando escolha ou confirmação.
  // Pendência paralela, como a edição, e com o mesmo prazo. Não sobrevive a
  // recarregar a página.
  const [exclusaoPendente, setExclusaoPendenteState] = useState(null);
  const exclusaoPendenteRef = useRef(null);
  // Lançamento apagado há pouco, que ainda dá para trazer de volta:
  // { transacao, messageId, workspaceId, conversationId, timer }.
  const exclusaoDesfazivelRef = useRef(null);
  // Conversa em que o prazo de desfazer já passou: "desfazer" dito depois
  // recebe o aviso em vez de ir ao interpretador.
  const desfazerVencidoRef = useRef(null);

  function setExclusaoPendente(next) {
    exclusaoPendenteRef.current = next;
    setExclusaoPendenteState(next);
  }

  function exclusaoAtiva(exclusao = exclusaoPendenteRef.current) {
    return Boolean(
      exclusao
      && Date.now() - exclusao.criadaEm <= EDICAO_TTL_MS
      && exclusao.conversationId === activeIdRef.current
      && exclusao.workspaceId === effectiveWorkspace?.id,
    );
  }

  function encerrarExclusao(status) {
    const exclusao = exclusaoPendenteRef.current;
    if (!exclusao) return;
    if (status && exclusao.messageId) {
      setMessages((current) => current.map((message) => (
        message.id === exclusao.messageId && message.confirmation?.status === 'pending'
          ? { ...message, confirmation: { ...message.confirmation, status } }
          : message
      )));
    }
    setExclusaoPendente(null);
  }

  function marcarDesfazer(messageId, status) {
    if (!messageId) return;
    setMessages((current) => current.map((message) => (
      message.id === messageId && message.undo
        ? { ...message, undo: { ...message.undo, status } }
        : message
    )));
  }

  // Esquece o lançamento apagado: ao vencer o prazo, desfazer ou trocar de
  // conversa. status marca o aviso na tela ('expired', 'done'); null só limpa.
  function limparDesfazivel(status) {
    const desfazivel = exclusaoDesfazivelRef.current;
    if (!desfazivel) return;
    clearTimeout(desfazivel.timer);
    exclusaoDesfazivelRef.current = null;
    if (status === 'expired') {
      desfazerVencidoRef.current = { conversationId: desfazivel.conversationId, em: Date.now(), tipo: desfazivel.tipo ?? null };
    }
    if (status) marcarDesfazer(desfazivel.messageId, status);
  }

  // Relê o lançamento antes do card: o card mostra o que vai sair de verdade.
  async function prepararExclusao(transacaoId, turnToken) {
    const workspaceId = effectiveWorkspace?.id;
    const conversationId = activeIdRef.current;
    setIsTyping(true);
    const lida = await getTransaction(workspaceId, transacaoId).catch(() => null);
    if (uniTurnTokenRef.current !== turnToken || activeIdRef.current !== conversationId) return;
    setIsTyping(false);
    const transacao = lida?.data ?? null;
    if (!transacao) {
      createAssistantResponse('Não consegui abrir esse lançamento agora. Tente de novo ou exclua na tela Financeiro.', { deduplicateNarration: false });
      return;
    }
    const bloqueio = motivoDeBloqueioDaExclusao(transacao);
    if (bloqueio) {
      createAssistantResponse(bloqueio, { deduplicateNarration: false });
      return;
    }
    const contexto = contextoDaEdicao();
    const message = createAssistantResponse(textoDaExclusao(transacao, contexto), {
      type: 'confirmation',
      confirmation: cardDaExclusao(transacao, contexto),
      deduplicateNarration: false,
    });
    setExclusaoPendente({
      etapa: 'confirmar',
      transacao,
      messageId: message?.id ?? null,
      workspaceId,
      conversationId,
      criadaEm: Date.now(),
    });
  }

  function publicarBuscaDaExclusao(resultado, turnToken) {
    if (resultado.tipo === 'bloqueado') {
      createAssistantResponse(motivoDeBloqueioDaExclusao(resultado.transacao), { deduplicateNarration: false });
      return;
    }
    if (resultado.tipo === 'varios') {
      createAssistantResponse(
        textoDaEscolha(resultado.candidatos, resultado.total, { ...contextoDaEdicao(), verbo: 'excluir' }),
        { deduplicateNarration: false },
      );
      setExclusaoPendente({
        etapa: 'escolher',
        candidatos: resultado.candidatos,
        messageId: null,
        workspaceId: effectiveWorkspace?.id,
        conversationId: activeIdRef.current,
        criadaEm: Date.now(),
      });
      return;
    }
    void prepararExclusao(resultado.transacao.id, turnToken);
  }

  // Pedido de exclusão vindo do uni-interpret. Nunca apaga mais de um: o
  // pedido em lote vai para a tela.
  async function iniciarExclusao(exclusao, turnToken) {
    if (exclusao.lote) {
      createAssistantResponse(TEXTO_EXCLUSAO_EM_LOTE, { deduplicateNarration: false });
      return;
    }
    // Pedido novo: a exclusão anterior, pendente ou já vencida, não conta mais.
    encerrarExclusao('expired');
    desfazerVencidoRef.current = null;
    const contexto = contextoDaEdicao();
    const alvo = alvoDaExclusao(exclusao, contexto);
    const ultimoId = exclusao.ultimo ? ultimoConfirmadoValido()?.id ?? null : null;
    if (exclusao.ultimo && !alvo.criterios) {
      // "Esse último" é o que acabou de ser confirmado nesta conversa; sem
      // nada confirmado e sem outra pista, o lançamento mais recente.
      const transacaoId = ultimoId ?? ultimoLancamentoCriado()?.id ?? null;
      if (!transacaoId) {
        createAssistantResponse('Não achei um lançamento recente para excluir. Diga qual é, com o nome e o dia ou o valor.', { deduplicateNarration: false });
        return;
      }
      await prepararExclusao(transacaoId, turnToken);
      return;
    }
    if (!alvo.criterios) {
      createAssistantResponse(TEXTO_EXCLUSAO_SEM_ALVO, { deduplicateNarration: false });
      return;
    }
    let resultado = localizarLancamento(alvo, transactionsState.transactions, { categories: categoryState.categories });
    // "Esse último Uber de 25": o último confirmado só vale se bater com a pista.
    if (ultimoId && resultado.tipo === 'varios' && resultado.candidatos.some((candidato) => candidato.id === ultimoId)) {
      await prepararExclusao(ultimoId, turnToken);
      return;
    }
    if (resultado.tipo === 'nenhum' && alvo.data) {
      // Fora dos carregados: com data dita, busca aquele dia no servidor.
      const conversationId = activeIdRef.current;
      setIsTyping(true);
      const doDia = await listTransactions(effectiveWorkspace?.id, { dateFrom: alvo.data, dateTo: alvo.data, limit: 100 })
        .catch(() => null);
      if (uniTurnTokenRef.current !== turnToken || activeIdRef.current !== conversationId) return;
      setIsTyping(false);
      resultado = localizarLancamento(alvo, doDia?.data ?? [], { categories: categoryState.categories });
    }
    if (resultado.tipo === 'nenhum') {
      createAssistantResponse(
        alvo.data
          ? 'Não encontrei esse lançamento nesse dia. Diga o nome como aparece no Financeiro, com o dia ou o valor.'
          : 'Não encontrei esse lançamento entre os mais recentes. Diga também o dia ou o valor dele.',
        { deduplicateNarration: false },
      );
      return;
    }
    publicarBuscaDaExclusao(resultado, turnToken);
  }

  // Resposta com a exclusão pendente. false quando a frase é outro assunto:
  // a exclusão é descartada e a frase segue o caminho de sempre.
  function tratarRespostaDaExclusao(texto, userMsg, turnToken) {
    const exclusao = exclusaoPendenteRef.current;
    const contexto = contextoDaEdicao();

    if (exclusao.etapa === 'confirmar') {
      const resposta = respostaAoPedidoDeExclusao(texto, exclusao.transacao);
      if (resposta === 'confirm') {
        syncMessageToSupabase(userMsg);
        void confirmarExclusao(exclusao.messageId);
        return true;
      }
      if (resposta === 'cancel') {
        syncMessageToSupabase(userMsg);
        cancelarExclusao(exclusao.messageId);
        return true;
      }
      encerrarExclusao('expired');
      return false;
    }

    if (classifyPendingActionReply(texto) === 'cancel') {
      syncMessageToSupabase(userMsg);
      encerrarExclusao(null);
      createAssistantResponse(withFollowUpQuestion('Tudo bem. Não excluí nada.'), { deduplicateNarration: false });
      return true;
    }
    if (
      looksLikeFreshFinancialStatement(texto)
      || looksLikeFreshBalanceStatement(texto)
      || interpretarPedidoDeEdicao(texto, contexto)
    ) {
      encerrarExclusao(null);
      return false;
    }
    // "apaga o segundo" escolhe como "o segundo".
    const escolha = texto.replace(/^\s*(?:pode\s+)?(?:exclui|exclua|apaga|apague|remove|remova|tira|tire)\s+/i, '');
    const escolhido = escolherCandidato(escolha, exclusao.candidatos, contexto);
    if (escolhido) {
      syncMessageToSupabase(userMsg);
      encerrarExclusao(null);
      void prepararExclusao(escolhido.id, turnToken);
      return true;
    }
    syncMessageToSupabase(userMsg);
    createAssistantResponse(
      `Não identifiquei qual deles. Diga o número da lista, de 1 a ${exclusao.candidatos.length}, ou "cancelar".`,
      { deduplicateNarration: false },
    );
    return true;
  }

  // Apaga de verdade, pelo mesmo hook da tela Financeiro, e abre a janela de
  // desfazer. Desfazer recria o lançamento com os campos lidos antes do card.
  async function confirmarExclusao(id) {
    const exclusao = exclusaoPendenteRef.current;
    if (!exclusaoAtiva(exclusao) || exclusao.etapa !== 'confirmar' || confirmingRef.current) return;
    const messageId = id ?? exclusao.messageId;
    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);
    try {
      const resultado = await transactionsState.removeTransaction(exclusao.transacao.id);
      if (resultado?.error || !resultado?.data) {
        reportConfirmationError(messageId, 'Não consegui excluir esse lançamento. Tente de novo ou exclua na tela Financeiro.');
        return;
      }
      // Apagou: a pendência acaba mesmo que a pessoa tenha trocado de
      // conversa durante a gravação, senão um "sim" depois apagaria de novo.
      setExclusaoPendente(null);
      if (ultimoConfirmadoRef.current?.id === exclusao.transacao.id) ultimoConfirmadoRef.current = null;
      setMessages((current) => current.map((message) => (
        message.id === messageId
          ? { ...message, confirmation: { ...message.confirmation, status: 'confirmed' } }
          : message
      )));
      await Promise.all([balanceState.refresh(), accountState.refresh()]);
      notifyFinancialDataChanged('uni-chat');
      if (activeIdRef.current !== exclusao.conversationId) return;
      limparDesfazivel('expired');
      const aviso = createAssistantResponse(textoDaExclusaoFeita(exclusao.transacao), {
        deduplicateNarration: false,
        undo: { status: 'available' },
      });
      const timer = setTimeout(() => {
        if (exclusaoDesfazivelRef.current?.timer === timer) limparDesfazivel('expired');
      }, DESFAZER_EXCLUSAO_MS);
      exclusaoDesfazivelRef.current = {
        transacao: exclusao.transacao,
        messageId: aviso?.id ?? null,
        workspaceId: exclusao.workspaceId,
        conversationId: exclusao.conversationId,
        timer,
      };
    } catch {
      reportConfirmationError(messageId, 'Ocorreu um erro inesperado. Tente novamente.');
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  function cancelarExclusao(id) {
    const exclusao = exclusaoPendenteRef.current;
    if (!exclusao) return;
    setMessages((current) => current.map((message) => (
      message.id === (id ?? exclusao.messageId)
        ? { ...message, confirmation: { ...message.confirmation, status: 'canceled' } }
        : message
    )));
    setExclusaoPendente(null);
    setExecutionError(null);
    createAssistantResponse(withFollowUpQuestion('Tudo bem. Não excluí nada.'));
  }

  // Desfazer, pelo botão do aviso (messageId) ou falado ("desfazer", sem
  // id). O lançamento volta com os mesmos campos e um id novo.
  // tipoVencido: 'lancamento_direto' (#81) quando o aviso vencido era de um
  // lançamento feito sem card; o texto do prazo vencido muda.
  async function desfazerExclusao(messageId = null, tipoVencido = null) {
    const desfazivel = exclusaoDesfazivelRef.current;
    const vale = desfazivel
      && (!messageId || desfazivel.messageId === messageId)
      && desfazivel.conversationId === activeIdRef.current
      && desfazivel.workspaceId === effectiveWorkspace?.id;
    if (!vale) {
      const tipo = tipoVencido ?? messages.find((message) => message.id === messageId)?.undo?.tipo;
      marcarDesfazer(messageId, 'expired');
      createAssistantResponse(
        tipo === 'lancamento_direto' ? TEXTO_LANCAMENTO_DIRETO_VENCIDO : TEXTO_DESFAZER_VENCIDO,
        { deduplicateNarration: false },
      );
      return;
    }
    if (confirmingRef.current) return;
    limparDesfazivel(null);
    confirmingRef.current = true;
    setIsExecutingAction(true);
    if (desfazivel.tipo === 'lancamento_direto') {
      try {
        await desfazerLancamentoDireto(desfazivel);
      } finally {
        setIsExecutingAction(false);
        confirmingRef.current = false;
      }
      return;
    }
    try {
      const resultado = await createTransaction(desfazivel.workspaceId, camposParaRecriar(desfazivel.transacao));
      if (resultado?.error || !resultado?.data) {
        marcarDesfazer(desfazivel.messageId, 'expired');
        createAssistantResponse('Não consegui trazer o lançamento de volta. Registre de novo pela conversa ou pela tela Financeiro.', { deduplicateNarration: false });
        return;
      }
      marcarDesfazer(desfazivel.messageId, 'done');
      await Promise.all([
        transactionsState.refresh(),
        balanceState.refresh(),
        accountState.refresh(),
      ]);
      notifyFinancialDataChanged('uni-chat');
      if (activeIdRef.current !== desfazivel.conversationId) return;
      ultimoConfirmadoRef.current = {
        id: resultado.data.id,
        workspaceId: desfazivel.workspaceId,
        conversationId: desfazivel.conversationId,
        em: Date.now(),
      };
      createAssistantResponse(withFollowUpQuestion(textoDaExclusaoDesfeita(desfazivel.transacao)));
    } catch {
      marcarDesfazer(desfazivel.messageId, 'expired');
      createAssistantResponse('Não consegui trazer o lançamento de volta. Registre de novo pela conversa ou pela tela Financeiro.', { deduplicateNarration: false });
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
  }

  // Desfazer do lançamento direto (#81): apaga o lançamento e zera a
  // contagem da memória, para a próxima vez mostrar o card.
  async function desfazerLancamentoDireto(desfazivel) {
    const { transacao } = desfazivel;
    const falhou = () => {
      marcarDesfazer(desfazivel.messageId, 'expired');
      createAssistantResponse(
        'Não consegui apagar o lançamento. Diga "apaga o último lançamento" ou exclua na tela Financeiro.',
        { deduplicateNarration: false },
      );
    };
    try {
      const resultado = await transactionsState.removeTransaction(transacao.id);
      if (resultado?.error || !resultado?.data) {
        falhou();
        return;
      }
      marcarDesfazer(desfazivel.messageId, 'done');
      if (ultimoConfirmadoRef.current?.id === transacao.id) ultimoConfirmadoRef.current = null;
      // A gravação do lançamento direto na memória vem antes: sem ela, o
      // Desfazer marcaria o evento errado.
      void Promise.resolve(desfazivel.memoriaGravada).then(() => registrarDesfazerNaMemoria({
        workspaceId: desfazivel.workspaceId,
        descricao: transacao.description,
        tipo: transacao.tipo,
        transacaoId: transacao.id,
      }));
      await Promise.all([balanceState.refresh(), accountState.refresh()]);
      notifyFinancialDataChanged('uni-chat');
      if (activeIdRef.current !== desfazivel.conversationId) return;
      createAssistantResponse(withFollowUpQuestion(textoDoLancamentoDiretoDesfeito({
        valor: transacao.amount,
        categoria: transacao.categoryName,
      })));
    } catch {
      falhou();
    }
  }

  // Lançar direto com Desfazer (#81). true quando gravou: o card não aparece.
  // false em qualquer dúvida (leitura do modelo, rascunho, memória, falha na
  // gravação), e o chamador segue com o card de sempre.
  async function tentarLancarDireto(interpretacao, action, turnToken) {
    const operacao = operacaoParaLancarDireto(interpretacao);
    if (!operacao || !rascunhoPodeIrDireto(action, operacao) || confirmingRef.current) return false;
    // Com um Desfazer ainda valendo (exclusão ou outro lançamento direto), o
    // card aparece: lançar agora venceria aquele Desfazer, e a mesma frase
    // repetida pela voz não grava duas vezes sem a pessoa ver.
    if (exclusaoDesfazivelRef.current) return false;
    const workspaceId = effectiveWorkspace?.id;
    const conversationId = activeIdRef.current;
    const memoria = await lerMemoriaDaDescricao({
      workspaceId,
      descricao: action.payload.description,
      tipo: action.transactionType,
    });
    // A leitura leva um instante: a conversa, o turno e o Desfazer podem ter
    // mudado nesse meio-tempo.
    if (uniTurnTokenRef.current !== turnToken || activeIdRef.current !== conversationId) return false;
    if (exclusaoDesfazivelRef.current || confirmingRef.current) return false;
    if (!memoriaPermiteLancarDireto(memoria?.valor, {
      categoriaId: action.category.id,
      tipo: action.transactionType,
      valor: action.amount,
    })) {
      return false;
    }
    confirmingRef.current = true;
    setIsExecutingAction(true);
    let transacaoId = null;
    let idempotente;
    try {
      // A mesma RPC do card, com o clientOperationId do rascunho: se falhar
      // aqui, o card que aparece em seguida grava sem duplicar.
      const resultado = await executeFinancialIntentAction(action, {
        executeAtomicAction: executeConfirmedFinancialAction,
      });
      if (resultado?.error || !resultado?.data?.id) return false;
      transacaoId = resultado.data.id;
      idempotente = resultado.data.idempotent_replay !== false;
    } catch {
      return false;
    } finally {
      if (!transacaoId) {
        setIsExecutingAction(false);
        confirmingRef.current = false;
      }
    }

    // Daqui em diante o lançamento existe: nenhuma falha volta ao card, e a
    // mensagem com o Desfazer sai antes dos refresh. Se a pessoa trocou de
    // conversa durante a gravação, o aviso sai na conversa aberta, para ela
    // saber do lançamento e poder desfazer.
    try {
      if (uniTurnTokenRef.current === turnToken) {
        financialConversation.reset();
        clearCurrentPendingAction();
      }
      ultimoConfirmadoRef.current = { id: transacaoId, workspaceId, conversationId: activeIdRef.current, em: Date.now() };
      conversationalMemoryRef.current.remember({
        account: action.account?.name ?? null,
        category: action.category.name,
      });
      const memoriaGravada = registrarLancamentoDiretoNaMemoria({
        workspaceId,
        descricao: action.payload.description,
        tipo: action.transactionType,
        transacaoId,
        data: getLocalIsoDate(),
      });
      const aviso = createAssistantResponse(textoDoLancamentoDireto({
        valor: action.amount,
        categoria: action.category.name,
        descricao: action.payload.description,
        conta: action.account?.name ?? null,
      }), {
        deduplicateNarration: false,
        undo: { status: 'available', tipo: 'lancamento_direto' },
      });
      const timer = setTimeout(() => {
        if (exclusaoDesfazivelRef.current?.timer === timer) limparDesfazivel('expired');
      }, DESFAZER_LANCAMENTO_DIRETO_MS);
      exclusaoDesfazivelRef.current = {
        tipo: 'lancamento_direto',
        transacao: {
          id: transacaoId,
          description: action.payload.description,
          amount: action.amount,
          categoryName: action.category.name,
          tipo: action.transactionType,
        },
        messageId: aviso?.id ?? null,
        workspaceId,
        conversationId: activeIdRef.current,
        timer,
        memoriaGravada,
      };
      trackGa4ConfirmedTransactionCreation({
        confirmed: true,
        idempotentReplay: idempotente,
        transactionType: action.transactionType,
        origin: action.analyticsOrigin ?? GA4_PRODUCT_ORIGINS.MANUAL,
      });
      await Promise.all([
        transactionsState.refresh(),
        balanceState.refresh(),
        accountState.refresh(),
      ]);
      notifyFinancialDataChanged('uni-chat');
    } catch {
      // O lançamento já foi gravado e o aviso já saiu; um refresh que falha
      // só atrasa a tela.
    } finally {
      setIsExecutingAction(false);
      confirmingRef.current = false;
    }
    return true;
  }

  function handleDesfazerExclusao(messageId) {
    if (confirmingRef.current || isExecutingAction) return;
    void desfazerExclusao(messageId);
  }

  // Sair da tela dentro do prazo: o relógio morre com a montagem e o botão
  // que o histórico guardou expira na próxima (efeito de saneamento abaixo).
  useEffect(() => () => {
    const desfazivel = exclusaoDesfazivelRef.current;
    if (desfazivel) clearTimeout(desfazivel.timer);
    exclusaoDesfazivelRef.current = null;
  }, []);

  // Frase nova sem rascunho nem agenda em andamento. true quando ela já foi
  // respondida aqui: resposta à lista ou ao card de exclusão, card vencido,
  // ou "desfazer" logo depois de apagar (depois do prazo, o aviso, em vez
  // de ir ao interpretador).
  function tratarExclusaoNaFraseNova(texto, userMsg, turnToken) {
    if (exclusaoPendenteRef.current && !exclusaoAtiva()) {
      const vencida = exclusaoPendenteRef.current;
      encerrarExclusao('expired');
      if (vencida.etapa === 'confirmar' && respostaAoPedidoDeExclusao(texto, vencida.transacao) !== 'input') {
        syncMessageToSupabase(userMsg);
        createAssistantResponse(TEXTO_EXCLUSAO_VENCIDA, { deduplicateNarration: false });
        return true;
      }
    }
    if (exclusaoAtiva() && tratarRespostaDaExclusao(texto, userMsg, turnToken)) return true;
    if (!ehPedidoDeDesfazer(texto)) return false;
    const vencido = desfazerVencidoRef.current;
    const avisaVencido = vencido
      && vencido.conversationId === activeIdRef.current
      && Date.now() - vencido.em <= DESFAZER_AVISO_VENCIDO_MS;
    if (!exclusaoDesfazivelRef.current && !avisaVencido) return false;
    const tipoVencido = avisaVencido ? vencido.tipo : null;
    desfazerVencidoRef.current = null;
    syncMessageToSupabase(userMsg);
    void desfazerExclusao(null, tipoVencido);
    return true;
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
    // Reset hydration flag for new conversation -- prevents ghost confirmation
    // fix from running before this conversation's hydration completes.
    restoredPendingIdentityRef.current = identityKey;
    setPendingHydrated(false);
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
      // Restaurar status de confirmação da mensagem correspondente:
      // se o ghost fix marcou como 'expired' antes da hidratação completar,
      // voltar para 'pending' agora que a ação foi restaurada.
      const clientOpId = snapshot.action.clientOperationId;
      if (clientOpId) {
        setMessages((current) =>
          current.map((message) => {
            if (
              message.confirmation?.status === 'expired'
              && message.clientOperationId === clientOpId
            ) {
              return { ...message, confirmation: { ...message.confirmation, status: 'pending' } };
            }
            return message;
          }),
        );
      }
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
      || isFinancialPlanActive()
      || edicaoAtiva(edicaoPendente)
      || exclusaoAtiva(exclusaoPendente),
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
  }, [pendingHydrated, pendingAction, pendingActionStack, edicaoPendente, exclusaoPendente]);

  // Botão Desfazer (#189) que o histórico trouxe de um reload ou de outra
  // tela: o lançamento apagado vive no ref desta montagem, e sem ele não há
  // o que desfazer.
  useEffect(() => {
    if (!pendingHydrated) return;
    setMessages((current) => {
      const orfao = (message) => message.undo?.status === 'available'
        && exclusaoDesfazivelRef.current?.messageId !== message.id;
      if (!current.some(orfao)) return current;
      return current.map((message) => (orfao(message) ? { ...message, undo: { ...message.undo, status: 'expired' } } : message));
    });
  }, [pendingHydrated]);

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
    invalidateAgendaRequest({
      workspaceId: effectiveWorkspace?.id,
      mode: correctMode,
    });
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
    setEdicaoPendente(null);
    setExclusaoPendente(null);
    limparDesfazivel(null);
    ultimoConfirmadoRef.current = null;
    conversationalMemoryRef.current.reset();
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
    handleAutomaticSpeakMessage(lastMessage);
  }, [messages, isSimplifiedExperience, voicePreference.enabled, handleAutomaticSpeakMessage, user?.id, historyHydrated]);

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
  // A política de resposta financeira pública entra no ÚNICO ponto de
  // construção de mensagem do pipeline oficial (buildMessage) — nenhum
  // caminho de resposta fala por fora.
  const buildGuidedUniMessage = useCallback((text, messageOptions = {}) => {
    const publicText = enforcePublicFinancialResponsePolicy({
      text: typeof text === 'string' ? text : '',
      requestText: lastUserTurnTextRef.current,
      snapshot: financialContext.snapshot,
    });
    return buildUniMessage(publicText, messageOptions);
  }, [financialContext.snapshot]);

  const { createAssistantResponse } = useUniResponsePipeline({
    buildMessage: buildGuidedUniMessage,
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
    speakMessage: handleAutomaticSpeakMessage,
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
      if (requestId !== loadRequestIdRef.current) return;
      if (!loadedMessages || loadedMessages.length === 0) return;
      if (activeIdRef.current !== activeId) return;

      // BLOCO VOZ HIDRATAÇÃO: o que chega aqui é histórico RESTAURADO
      // (conteúdo antigo, não evento novo) -- marcado como já narrado para
      // o autoplay, mesmo que esta restauração assente depois do
      // armamento.
      markRestoredMessagesAsSpoken(user?.id, loadedMessages);
      reserveMessageIds(loadedMessages);

      // BUG 1 (Sprint 4, Bloco 4.0): merge por identidade estável -- ver
      // mergeRestoredMessages.js para a estratégia completa e o porquê da
      // ordem clientMessageId > id > dbId (dbToMessage agora preenche
      // clientMessageId com o mesmo valor gravado como client_message_id,
      // então a identidade local e a restaurada sempre coincidem).
      setMessages((prev) => mergeRestoredMessages(prev, loadedMessages));

      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, messages: loadedMessages, _messagesLoaded: true } : c,
        ),
      );
    }).catch(() => {
      // S8: falha de restore nunca pode deixar pendingRestoresRef preso --
      // senão o autoplay de voz fica desarmado para sempre. O estado da
      // conversa segue recuperável: o usuário pode tentar de novo.
      if (requestId !== loadRequestIdRef.current) return;
    }).finally(() => {
      // decremento SEMPRE roda (sucesso ou erro), rearmando o autoplay.
      pendingRestoresRef.current -= 1;
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

      // BUG REAL (persistência intermitente): um `splice(0)` único aqui
      // captura só o que já estava na fila NO MOMENTO da leitura -- uma
      // mensagem empurrada para pendingSyncRef DURANTE os awaits do loop
      // abaixo (ex.: a resposta da Uni chegando poucos ms depois da
      // mensagem do usuário, ainda dentro desta promoção) nunca é incluída
      // neste `queued`, e como `finally` já libera promotionInProgressRef
      // logo em seguida, essa mensagem stranded só seria salva se uma
      // PRÓXIMA mensagem qualquer fosse enviada depois -- se ela for a
      // última mensagem do turno, fica perdida para sempre. Drenar em loop
      // até a fila ficar realmente vazia fecha essa janela: como não há
      // nenhum `await` entre a checagem final do `while` e o `finally`,
      // nada pode inserir na fila nesse intervalo.
      while (pendingSyncRef.current.length) {
        const queued = pendingSyncRef.current.splice(0);
        for (const qMsg of queued) {
          await dataService.saveMessage(dbConvId, qMsg);
        }
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

  // BUG REAL (BUG 4): abrir a conversa a partir da Home (na época, pelo link
  // "Ver conversa completa"; hoje, pelo menu Mais ou pela tela de voz) caía no
  // TOPO do histórico --
  // stickToBottom era escrito (sendText, switchConversation, handleScroll)
  // mas NUNCA lido: não existia efeito que rolasse o chat. Agora toda
  // mudança de mensagens com stickToBottom=true (nova resposta, hidratação
  // local, restauração Supabase, troca de conversa) rola até o fim; quem
  // rolou para cima (stickToBottom=false) mantém a leitura. Layout effect
  // (sem setTimeout arbitrário): o DOM já contém o conteúdo novo quando
  // roda, então scrollHeight está correto.
  //
  // HOTFIX FINAL P2 -- CAUSA RAIZ REAL do "abre longe do fim": a hidratação
  // do Supabase pode alterar `messages` mais de uma vez (estado local ->
  // mesclado) e este efeito já reage a cada mudança -- mas a ALTURA real do
  // conteúdo também pode mudar DEPOIS do commit, sem um novo `messages`
  // (ex.: reflow de fonte web carregando de forma assíncrona, imagens/
  // ícones). `scrollTop = scrollHeight` lido só no momento do commit não
  // captura esse reflow tardio. Duas camadas de defesa, sem timer
  // arbitrário: (1) `historyHydrated` nas dependências garante pelo menos
  // mais uma passagem de posicionamento exatamente quando a hidratação
  // termina, mesmo que `messages` já estivesse referencialmente igual
  // àquele instante; (2) um requestAnimationFrame extra reconfirma a
  // posição depois que o navegador realmente pintou o frame -- pega
  // qualquer reflow que aconteça entre o commit do React e o paint real.
  // HOTFIX FINAL -- CAUSA RAIZ REAL (confirmada por medição direta no DOM,
  // abrindo a conversa a partir da Home -- nunca por reload de
  // página): Home (`variant="simplified-home"`) retorna ANTES de renderizar
  // `.body`/`.messages` (early return). Ao navegar de Home para /app/uni
  // via troca de rota client-side (sem reload), `.body` é montado no DOM
  // pela PRIMEIRA VEZ nesse commit -- mas `messages`/`historyHydrated` já
  // tinham o MESMO valor de antes (hidratação já tinha terminado enquanto a
  // Home era exibida), então o efeito abaixo não tinha nenhuma dependência
  // NOVA para reagir, e o container recém-montado ficava com scrollTop=0
  // (medido: distanceFromBottom ~8878px). `messagesMountTick` fecha esse
  // gap: o callback ref de `.messages` (que dispara de forma confiável
  // sempre que esse nó é montado, comprovado por instrumentação direta)
  // incrementa um contador que entra nas dependências do efeito principal
  // -- o posicionamento real continua acontecendo SÓ dentro do
  // useLayoutEffect (nunca no próprio callback ref), porque layout effects
  // rodam DEPOIS que TODOS os refs do commit já foram anexados (React
  // anexa refs de filho antes do pai durante o commit -- `.messages`, filha
  // de `.body`, podia disparar seu callback ref num instante em que
  // `scrollRef.current` de `.body` ainda era null; o efeito, por rodar
  // depois do commit inteiro, nunca tem esse problema).
  const [messagesMountTick, setMessagesMountTick] = useState(0);
  const setMessagesContentRef = useCallback((node) => {
    if (node) setMessagesMountTick((tick) => tick + 1);
  }, []);

  useLayoutEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    const rafId = window.requestAnimationFrame(() => {
      if (!stickToBottom.current) return;
      const node = scrollRef.current;
      if (!node) return;
      node.scrollTop = node.scrollHeight;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [messages, historyHydrated, isKeyboardOpen, messagesMountTick]);

  function pushMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  function switchConversation(id) {
    const conv = conversations.find((c) => c.id === id);
    if (!conv || (isSimplifiedExperience && conv.mode !== SIMPLIFIED_CHAT_MODE)) return;
    const convMode = conv.mode || mode;

    uniVoice.stop();
    setVoiceMessageId(null);

    const requestId = ++loadRequestIdRef.current;

    // Limpar pending action da conversa ANTIGA no sessionStorage antes de trocar.
    // A identidade da conversa antiga ainda está em activeIdRef.current.
    const oldIdentity = {
      userId: user?.id,
      workspaceId: effectiveWorkspace?.id,
      conversationId: activeIdRef.current,
    };
    if (oldIdentity.userId && oldIdentity.workspaceId && oldIdentity.conversationId) {
      clearPendingAction(oldIdentity);
      clearPendingActionStack(oldIdentity);
    }

    // Invalida imediatamente qualquer resposta assíncrona pertencente à
    // conversa anterior, antes mesmo de o próximo render atualizar os refs.
    invalidateAgendaRequest({ conversationId: id, mode: convMode });
    setActiveId(id);
    setMessages(conv.messages || []);
    // BLOCO VOZ HIDRATAÇÃO: trocar de conversa RESTAURA conteúdo antigo
    // (seleção no Histórico, reconcile inicial pós-reload, troca de
    // perfil) -- nunca é autoplay; as mensagens restauradas são marcadas
    // como já narradas.
    markRestoredMessagesAsSpoken(user?.id, conv.messages || []);
    reserveMessageIds(conv.messages || []);
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
    setEdicaoPendente(null);
    setExclusaoPendente(null);
    limparDesfazivel(null);
    ultimoConfirmadoRef.current = null;
    // Sprint 2 — troca de conversa nunca carrega memória conversacional da
    // conversa anterior (nunca é memória de longo prazo).
    conversationalMemoryRef.current.reset();
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
    const turnTokenAtStart = uniTurnTokenRef.current;
    if (!text.trim()) return;
    lastUnresolvedRef.current = { text, history };
    let llmText = null;
    let llmDailyLimitReached = false;
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
        llmDailyLimitReached = outcome?.dailyLimitReached === true;
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
    // Resposta só de espaços conta como resposta vazia e cai no texto padrão.
    const finalResponseText = (typeof llmText === 'string' ? llmText.trim() : '') || null;
    // S4: resposta assincrona de um turno antigo nunca publica num turno
    // novo (troca de conversa, nova pergunta no meio do LLM, retry
    // cancelado por um novo sendText). A conversa segue recuperavel: o
    // usuario pode perguntar de novo.
    if (uniTurnTokenRef.current !== turnTokenAtStart) return;
    const usedDeterministicFallback = !finalResponseText;
    createAssistantResponse(
      finalResponseText || (llmDailyLimitReached ? UNI_LLM_DAILY_LIMIT_TEXT : UNI_DETERMINISTIC_FALLBACK_TEXT),
    );
    // A Home simplificada sempre preserva uma resposta textual utilizavel.
    // Quando o backend conversacional estiver indisponivel, o fallback nao
    // deve deixar o controle principal preso no estado visual de erro.
    if (usedDeterministicFallback && isSimplifiedExperience) {
      setAiStatus(AI_STATUS.UNAVAILABLE);
    }
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
    const operacaoId = result?.action?.clientOperationId;
    const categoriasIniciais = categoriaInicialPorOperacaoRef.current;
    if (operacaoId && !categoriasIniciais.has(operacaoId)) {
      categoriasIniciais.set(operacaoId, result.action.category?.id ?? null);
      // Rascunho cancelado ou trocado não volta: guarda só os mais recentes.
      if (categoriasIniciais.size > 20) categoriasIniciais.delete(categoriasIniciais.keys().next().value);
    }
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
      const confirmation = buildConfirmationFromAction(result.action);
      createAssistantResponse(result.response.text, {
        type: 'confirmation',
        confirmation,
        clientOperationId: result.action.clientOperationId,
      });
      return;
    }

    const message = createAssistantResponse(
      result?.response?.text
        || 'Preciso de mais detalhes antes de preparar essa ação.',
    );
    const issueCode = result?.action?.issues?.[0]?.code;
    setCategoryQuestionMessageId(
      issueCode === 'category_required' || issueCode === 'category_incompatible' ? message?.id ?? null : null,
    );
  }

  // Toque num chip de categoria (#80). A escolha já traz o id: vai direto ao
  // rascunho, sem reler o nome pelo modelo nem pelas regras. Duas categorias
  // com o mesmo nome, uma de entrada e outra de saída, não se confundem.
  function handleCategoryChoice(item) {
    if (isTyping || isExecutingAction || !item?.id) return;
    const escolha = buildUserMessage(item.label);
    pushMessage(escolha);
    syncMessageToSupabase(escolha);
    lastUserTurnTextRef.current = item.label;
    uniTurnTokenRef.current += 1;
    stickToBottom.current = true;
    setCategoryQuestionMessageId(null);
    const result = financialConversation.provideInput({ categoryId: item.id });
    void publishConversationResultWithInference(result);
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
        clientOperationId: dependency.action?.clientOperationId,
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
        clientOperationId: dependency.action?.clientOperationId,
      },
    );
  }

  // BUG REAL EM PRODUÇÃO (voz): com o card "Criar categoria para continuar" na
  // tela, "Salário não é despesa, salário é uma receita" caía no aviso "confirme
  // a criação da categoria", e a Uni dizia que tinha corrigido sem o card mudar.
  // O que a pessoa corrige é o lançamento que espera atrás do card (tipo, valor,
  // data, descrição ou a categoria em si). O card de criação sai, o lançamento
  // volta com a correção e, se ainda faltar a categoria, o card reaparece já
  // revisado. Frase que não é correção clara devolve false e segue o aviso.
  function correctDraftBehindCategoryCreation(text) {
    const stack = pendingActionStackRef.current;
    const parent = stack?.actions?.find((item) => item.type === 'financial_transaction');
    const parentSnapshot = parent?.fields?.snapshot;
    if (
      !parentSnapshot?.parsed
      || !['ready', 'needs_clarification'].includes(parentSnapshot.action?.status)
    ) {
      return false;
    }
    const resolved = resolvePendingActionInput({
      value: text,
      action: parentSnapshot.action,
      accounts: accountState.accounts,
      categories: categoriasSugeriveis,
      workspaceId: effectiveWorkspace?.id,
      referenceDate: getLocalIsoDate(),
    });
    if (resolved.kind !== 'correction') return false;
    // "A categoria é Salário" com um card que cria Salário de saída: a categoria
    // existente é de outro tipo e não serve ao lançamento, então não é correção.
    const chosenCategory = resolved.overrides.categoryId
      ? categoryState.categories.find((category) => category.id === resolved.overrides.categoryId)
      : null;
    const wantedType = resolved.overrides.transactionType ?? parentSnapshot.action.transactionType;
    if (chosenCategory && chosenCategory.category_type !== wantedType) return false;

    // O nome que o card propunha vale de novo se a categoria ainda faltar: sem
    // ele, o card voltaria com um palpite novo (ex.: "Pets" virando "Mercado").
    const proposedCategoryName = getActivePendingAction(stack)?.fields?.category?.name ?? null;
    const creationCardId = findPendingConfirmationMessageId();
    setMessages((current) => current.map((message) => (
      message.id === creationCardId && message.confirmation?.status === 'pending'
        ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
        : message
    )));
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
    setPendingAction(null);
    clearCurrentPendingAction();
    financialConversation.restore(parentSnapshot);
    const result = financialConversation.provideInput(
      { ...resolved.overrides, ...(proposedCategoryName ? { categoryName: proposedCategoryName } : {}) },
      parentSnapshot.parsed,
    );
    void publishConversationResultWithInference(result);
    return true;
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
    // Sprint 2 — Memória Conversacional: referências ("essa conta", "essa
    // categoria", "isso", "ele"/"ela") são resolvidas para o valor literal
    // ANTES de qualquer parser -- o motor de consultas recebe texto puro,
    // sem saber que existe substituição. Nunca inventa: sem nada lembrado,
    // o texto sai inalterado.
    const resolvedQueryText = conversationalMemoryRef.current.resolveReferences(text);
    const engineOutcome = resolveFinancialQuery({
      text: resolvedQueryText,
      snapshot: financialContext.snapshot,
      mode,
      conversationStyle,
      history: messages,
      lastQuery: conversationalMemoryRef.current.getLastQuery(),
    });
    if (
      engineOutcome.handled
      && engineOutcome.queryType !== 'transaction_reference'
    ) {
      if (engineOutcome.queryParams) {
        conversationalMemoryRef.current.remember({
          queryType: engineOutcome.queryType,
          queryParams: engineOutcome.queryParams,
          response: engineOutcome.response.text,
        });
      }
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
    const categoryConfirmationPending = categoryIssueCode === 'category_not_found';
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
    // Nome que o card propõe: "criar a categoria Salário" confirma o card
    // da categoria Salário, e nenhum outro nome confirma.
    const replySubjectName = activeStackAction?.fields?.account?.name
      ?? activeStackAction?.fields?.category?.name
      ?? action?.proposedCategory?.name
      ?? action?.proposedCategoryName
      ?? null;
    const replyType = classifyPendingActionReply(text, { subjectName: replySubjectName });
    syncMessageToSupabase(userMsg);

    // Cancelamento do lançamento simples AINDA em esclarecimento (sem card de
    // confirmação, sem dependência de conta/categoria ativa) -- nunca deixa
    // "cancelar" ser interpretado como o valor do campo pendente. Categoria
    // inexistente mantém seu próprio fluxo de rejeição (troca de categoria,
    // não cancelamento total), por isso fica de fora daqui.
    if (
      !pendingAction
      && !accountDependencyActive
      && !categoryDependencyActive
      && !categoryConfirmationPending
      && (replyType === 'cancel' || isCancelEntirePendingFlow(text))
    ) {
      financialConversation.cancel();
      clearCurrentPendingAction();
      // O lançamento que ficou preservado depois de "cancelar só a criação"
      // ainda está na pilha: sem limpar, ele volta no próximo pedido.
      pendingActionStackRef.current = null;
      setPendingActionStack(null);
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
    if (categoryDependencyActive && correctDraftBehindCategoryCreation(text)) return true;
    if (categoryDependencyActive) {
      createAssistantResponse(
        'Para continuar, confirme a criação da categoria, cancele apenas a criação ou diga “cancelar tudo”.',
      );
      return true;
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

    // #80: com a IA disponível, quem lê a resposta ao rascunho é o
    // uni-interpret, com o rascunho junto. BUG REAL EM PRODUÇÃO (voz,
    // 11/10/2026): pelas regras, "Registrar uma despesa de cinco mil e
    // quinhentos reais no dia quinze de outubro, com a categoria Impostos"
    // virou só resposta de categoria, e a Uni perguntou o valor quatro vezes.
    // As regras abaixo leem quando o modelo não devolve uma correção deste
    // rascunho (IA fora, erro, outra intenção, nada muda).
    if (podeLerRascunhoPeloModelo(action)) {
      void lerRascunhoPeloModelo(text, action, responderPelasRegras);
      return true;
    }
    return responderPelasRegras();

    function responderPelasRegras() {
      const resolvedInput = resolvePendingActionInput({
        value: text,
        action,
        accounts: accountState.accounts,
        categories: categoriasSugeriveis,
        workspaceId: effectiveWorkspace?.id,
        referenceDate: getLocalIsoDate(),
      });
      if (resolvedInput.kind !== 'correction') {
        const accountNames = resolvedInput.accounts?.map((account) => account.name).filter(Boolean) ?? [];

        // BUG 2 (Sprint 4, Bloco 4.0): antes de tratar "não encontrei essa
        // conta/categoria" como proposta de CRIAR uma conta/categoria com o
        // texto INTEIRO do usuário (causa raiz do bug real: "Estou gastando
        // demais?" virando nome de conta), classifica se o texto realmente
        // parece resposta à pendência, mudança de assunto, ou é ambíguo. Ver
        // classifyPendingActionRelation.js para a estratégia completa e por
        // que "confirmar"/"cancelar" e matches diretos de conta/categoria
        // nunca chegam a esta checagem (resolvidos antes, sem mudança de
        // comportamento). `isLikelyFinancialQuestion` continua existindo como
        // segundo guard, mas a classificação central resolve o caso que ele
        // não cobria (perguntas sem pronome interrogativo inicial).
        if (resolvedInput.kind === 'account_not_found' || resolvedInput.kind === 'category_not_found') {
          const relation = classifyPendingActionRelation({
            pendingAction: { field: resolvedInput.kind === 'account_not_found' ? 'account' : 'category' },
            userText: text,
            conversationContext: { referenceDate: getLocalIsoDate() },
            availableAccounts: accountState.accounts,
            availableCategories: categoriasSugeriveis,
          });

          if (relation.relation === 'changes_subject') {
            // pendência permanece intacta (nunca desaparece silenciosamente)
            // -- a nova pergunta é respondida pelo fallback conversacional
            // normal, fora do fluxo de pendência. Publicação única
            // preservada: handleUnresolvedMessage é o mesmo ponto de saída
            // já usado por runDeterministicFinancialFlow.
            void handleUnresolvedMessage(text, messages);
            return true;
          }

          // "A categoria é Animais de Estimação" com o card na tela: o nome veio
          // explícito, então a frase responde ao rascunho, mesmo que o
          // classificador a ache ambígua. Pergunta ("qual categoria você
          // usou?") já saiu acima como mudança de assunto. Os outros campos da
          // mesma frase ("foi ontem") entram no rascunho antes, para ele voltar
          // com eles depois que a categoria for criada.
          if (resolvedInput.kind === 'category_not_found' && resolvedInput.requestedCategoryName && action) {
            const draftCardId = findPendingConfirmationMessageId();
            const draftAction = resolvedInput.overrides
              ? financialConversation.provideInput(resolvedInput.overrides).action ?? action
              : action;
            if (startCategoryDependency(resolvedInput.requestedCategoryName, draftAction)) {
              setMessages((current) => current.map((message) => (
                message.id === draftCardId && message.confirmation?.status === 'pending'
                  ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
                  : message
              )));
              return true;
            }
          }

          if (relation.relation === 'ambiguous') {
            createAssistantResponse(relation.suggestedClarification);
            return true;
          }
          // relation === 'answers_pending': segue o fluxo já existente abaixo,
          // comportamento idêntico ao anterior para frases inequívocas.
        }

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
  }

  function runDeterministicFinancialFlow(text, historySnapshot, modeloJaLeu = false) {
      // Sprint 2 — Memória Conversacional: resolve referências ("essa
      // conta", "essa categoria", "isso", "ele"/"ela") para o valor literal
      // ANTES de qualquer parser. Nunca inventa: sem nada lembrado, o texto
      // sai inalterado e os parsers determinísticos recebem exatamente o
      // que recebiam antes desta Sprint.
      const resolvedText = conversationalMemoryRef.current.resolveReferences(text);

      // REGRA GERAL DE PRIORIDADE: declarações/ações financeiras vencem
      // consultas. Frase reconhecida como ação (set_balance, ambiguidade
      // saldo/receita, receita, despesa, transferência, meta) pula os
      // motores de consulta e vai direto para o fluxo de registro; os
      // motores só rodam para perguntas e referências reais.
      if (!ACTION_STATEMENT_INTENTS.has(classifyIntent(resolvedText).intent)) {
        // Motor de consultas financeiras inteligentes: responde com dados
        // estruturados do FinancialSnapshot (contas, transações, saldos,
        // accountName/categoryName) antes de qualquer outro caminho. Quando
        // não reconhece uma consulta, devolve handled:false e o fluxo
        // determinístico atual segue intacto (classificador legado → parser de
        // registro → plano financeiro → LLM).
        const engineOutcome = resolveFinancialQuery({
          text: resolvedText,
          snapshot: financialContext.snapshot,
          mode,
          conversationStyle,
          history: historySnapshot,
          lastQuery: conversationalMemoryRef.current.getLastQuery(),
        });

        if (engineOutcome.handled) {
          if (engineOutcome.queryParams) {
            conversationalMemoryRef.current.remember({
              queryType: engineOutcome.queryType,
              queryParams: engineOutcome.queryParams,
              response: engineOutcome.response.text,
            });
          }
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
        // Transferência só é montada pelo uni-interpret (#80). Sem ele, o
        // parser de uma operação não a modela.
        if (isUnsupportedIntentEligibleForPlan(result.parsed?.intent)) {
          createAssistantResponse(
            'Transferências ainda não podem ser registradas pela Uni. Use o Financeiro para manter origem e destino sob sua revisão.',
          );
          return;
        }
        if (result.parsed?.intent === 'create_goal') {
          createAssistantResponse(TEXTO_META_SEM_CRIACAO);
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
        // verbo específico não esteja catalogado em classifyIntent -- pede
        // para a pessoa reformular, em vez de qualquer resposta consultiva.
        if (looksLikeUnclassifiedFinancialStatement(text)) {
          createAssistantResponse(
            'Entendi que pode ser um lançamento financeiro, mas não consegui identificar todos os detalhes. Pode reformular dizendo o valor e do que se trata? Por exemplo: "Gastei R$ 50 no mercado."',
          );
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
      void publishInterpretedResult(result, text, historySnapshot, modeloJaLeu);
  }

  function runAgendaTurn(turn) {
    const { functionalText, agendaIdentity, agendaRequest, messageSource, historySnapshot, interpretado } = turn;
    setIsTyping(true);
    void agendaConversationRef.current.handle({
      text: functionalText,
      identity: agendaIdentity,
      referenceDate: getLocalIsoDate(),
      origin: messageSource,
      interpretado,
    }).then((result) => {
      if (!isAgendaRequestCurrent(agendaRequest)) return;
      setIsTyping(false);
      if (result.route === 'financial' && result.financialText) {
        financialAnalyticsOriginRef.current = result.analyticsOrigin ?? GA4_PRODUCT_ORIGINS.MANUAL;
        financialConversation.setAnalyticsOrigin(financialAnalyticsOriginRef.current);
        runDeterministicFinancialFlow(result.financialText, historySnapshot);
        return;
      }
      if (result.handled && result.text) {
        createAssistantResponse(result.text, { deduplicateNarration: false });
      }
    }).catch(() => {
      if (!isAgendaRequestCurrent(agendaRequest)) return;
      setIsTyping(false);
      createAssistantResponse(
        'Não consegui atualizar sua agenda agora. Tente novamente em instantes.',
        { deduplicateNarration: false },
      );
    });
  }

  // Resposta pública para saldo e resumo: o app mostra entradas e saídas, e
  // explica que o saldo saiu quando foi isso que a pessoa pediu.
  function responderResumoSemSaldo(texto, comAvisoDeSaldo) {
    createAssistantResponse(
      buildPublicMovementSummaryResponse({
        snapshot: financialContext.snapshot,
        text: texto,
        includeRetirementIntro: comAvisoDeSaldo,
      }).text,
      { deduplicateNarration: false },
    );
  }

  // Consulta com os parâmetros do uni-interpret (#80). Busca o período inteiro
  // no banco: o chat só carrega as movimentações mais recentes. null quando a
  // busca falha.
  async function responderConsultaDoModelo(consulta, dataDaFuncao) {
    const dataReferencia = dataDaFuncao ?? getLocalIsoDate();
    const catalogo = { categorias: categoryState.categories, contas: accountState.accounts };
    // O catálogo já está no chat: listar categorias não vai ao banco (#190).
    // Catálogo ainda carregando ou com erro não vira "você não tem
    // categorias": as regras respondem.
    if (consulta.tipo === 'categorias') {
      if (categoryState.isLoading || categoryState.error) return null;
      return responderConsulta({ consulta, transacoes: [], dataReferencia, ...catalogo });
    }
    const periodo = periodoDaConsulta(consulta, dataReferencia);
    try {
      const { data, error } = await listTransactionsForPeriod(effectiveWorkspace.id, {
        dateFrom: periodo.inicio,
        dateTo: periodo.fim,
        status: 'completed',
      });
      if (error) return null;
      return responderConsulta({ consulta, transacoes: data, dataReferencia, ...catalogo });
    } catch {
      return null;
    }
  }

  // #80: com a IA disponível, o uni-interpret decide o que a frase nova pede.
  // As regras fixas só rodam quando ele não devolve interpretação (resolve
  // false). Pedido de dinheiro nunca chega ao chat geral por aqui.
  async function rotearPeloModelo(text, turn) {
    const { historySnapshot, turnToken, agendaTurn } = turn;
    // O "digitando" segue até a resposta sair: sem isso, uma frase enviada
    // durante a espera encontraria um rascunho que ainda não está na tela.
    setIsTyping(true);
    const { interpretacao } = await uniInterpretClient.interpretar({
      workspaceId: effectiveWorkspace.id,
      frase: text,
      historico: montarHistoricoParaInterpretacao(historySnapshot),
    });
    if (uniTurnTokenRef.current !== turnToken) return true;

    const rota = escolherRotaDaInterpretacao(interpretacao);
    // Sem interpretação ou sem entender: as regras fixas tentam, com as
    // travas delas (consulta por dados reais, pergunta sobre o futuro), e só
    // então o chat geral.
    if (!rota || rota === ROTAS_INTERPRETACAO.NAO_ENTENDI) {
      setIsTyping(false);
      return false;
    }

    switch (rota) {
      case ROTAS_INTERPRETACAO.LANCAMENTO: {
        const { parsed, overrides } = interpretacaoParaRascunho(interpretacao, text);
        const result = financialConversation.startFromParsed(parsed, overrides);
        if (!result.handled) {
          setIsTyping(false);
          return false;
        }
        if (await tentarLancarDireto(interpretacao, result.action, turnToken)) {
          setIsTyping(false);
          return true;
        }
        const phrased = await attemptNaturalPhrasing(result);
        if (uniTurnTokenRef.current !== turnToken) {
          financialConversation.reset();
          return true;
        }
        setIsTyping(false);
        publishConversationResult(phrased);
        if (interpretacao.operacoes[0]?.recorrente === true) {
          createAssistantResponse(TEXTO_RECORRENCIA_SO_ESTE_LANCAMENTO, { deduplicateNarration: false });
        }
        return true;
      }
      case ROTAS_INTERPRETACAO.PLANO:
        setIsTyping(false);
        iniciarPlanoFinanceiro(interpretacaoParaPlano(interpretacao), text);
        return true;
      // Saldo saiu do app público: a frase que a trava por regex do sendText
      // não pegou recebe a mesma resposta, e nunca vira entrada.
      case ROTAS_INTERPRETACAO.SALDO:
        setIsTyping(false);
        responderResumoSemSaldo(text, true);
        return true;
      case ROTAS_INTERPRETACAO.META:
        setIsTyping(false);
        // Sem ação (interpretação antiga ou pedido que o contrato não
        // reconheceu), a resposta é a de antes. Sem deduplicar: pedida duas
        // vezes por voz, a resposta é falada de novo.
        if (!interpretacao.meta?.acao) {
          createAssistantResponse(TEXTO_META_SEM_CRIACAO, { deduplicateNarration: false });
          return true;
        }
        await iniciarPedidoDeMeta(interpretacao.meta, turnToken);
        return true;
      case ROTAS_INTERPRETACAO.CONSULTA: {
        if (consultaRespondivel(interpretacao.consulta)) {
          const resposta = await responderConsultaDoModelo(interpretacao.consulta, interpretacao.dataReferencia);
          if (uniTurnTokenRef.current !== turnToken) return true;
          if (resposta) {
            setIsTyping(false);
            conversationalMemoryRef.current.remember(memoriaDaConsulta(interpretacao.consulta, resposta));
            createAssistantResponse(resposta, { deduplicateNarration: false });
            return true;
          }
        }
        // Outra pergunta (meta, maior gasto, comparação) ou falha na busca:
        // as regras de consulta respondem.
        setIsTyping(false);
        runDeterministicFinancialFlow(text, historySnapshot, true);
        return true;
      }
      case ROTAS_INTERPRETACAO.AGENDA:
        setIsTyping(false);
        runAgendaTurn({ ...agendaTurn, interpretado: interpretacaoParaAgenda(interpretacao) });
        return true;
      case ROTAS_INTERPRETACAO.CATEGORIA:
        setIsTyping(false);
        iniciarPedidoDeCategoria(interpretacao.categoria);
        return true;
      case ROTAS_INTERPRETACAO.EXCLUSAO:
        setIsTyping(false);
        await iniciarExclusao(interpretacao.exclusao, turnToken);
        return true;
      case ROTAS_INTERPRETACAO.CONVERSA:
        setIsTyping(false);
        // Cumprimento e agradecimento: o modelo já devolve a frase. Sem
        // ela, as regras tentam e o chat geral responde.
        if (!interpretacao.resposta?.trim()) return false;
        createAssistantResponse(interpretacao.resposta.trim(), { deduplicateNarration: false });
        return true;
      default:
        setIsTyping(false);
        return false;
    }
  }


  // Voz (onFinalTranscript) e texto (onSend) convergem para o mesmo sendText.
  function sendText(text, metadata) {
    if (!text.trim() || isTyping || isExecutingAction) return;
    const declaredIntent = classifyIntent(text).intent;
    const functionalText = stripLeadingConversationalPrefix(text) || text.trim();
    const isRetiredBalanceRequest = isRetiredPublicBalanceRequest(functionalText, declaredIntent);
    const isPublicFinancialSummary = isPublicFinancialSummaryRequest(functionalText);
    const messageSource = metadata?.source === 'voice' ? 'voice' : 'text';
    setExecutionError(null);
    setAiStatus(AI_STATUS.UNAVAILABLE);
    lastUnresolvedRef.current = null;
    stickToBottom.current = true;
    const historySnapshot = messages;
    // HOTFIX P1: hint da operação real deste turno, derivado do intent já
    // classificado abaixo (reaproveitado, nunca recalculado por regra
    // nova) -- usado só para escolher a mensagem de "interpretando" certa.
    setInterpretingOperationHint(resolveOperationHintFromIntent(declaredIntent));

    const userMsg = buildUserMessage(text);
    pushMessage(userMsg);
    setInputValue('');
    // TOKEN DE TURNO (S4): marca este sendText como o turno corrente --
    // qualquer cadeia assincrona iniciada em turnos anteriores deve
    // abortar a publicacao da resposta.
    const turnToken = ++uniTurnTokenRef.current;

    const agendaIdentity = {
      userId: user?.id,
      workspaceId: effectiveWorkspace?.id,
      conversationId: activeId ?? 'local-conversation',
      mode,
    };
    const agendaRequest = { ...agendaIdentity, turnToken };
    // #80: com o uni-interpret disponível, quem decide a intenção de uma
    // frase nova é ele; a classificação por regex só vale sem IA.
    const roteiaPeloModelo = Boolean(effectiveWorkspace?.id && uniInterpretClient.isSupported());
    const hasPendingAgendaConversation = agendaConversationRef.current.hasPending(agendaIdentity);
    const shouldAbandonAgendaForFinancial = hasPendingAgendaConversation
      && !declaredIntent.startsWith('agenda_')
      && (
        looksLikeFreshFinancialStatement(functionalText)
        || looksLikeFreshBalanceStatement(functionalText)
        || isRetiredBalanceRequest
        || isPublicFinancialSummary
        || ACTION_STATEMENT_INTENTS.has(declaredIntent)
      );
    if (shouldAbandonAgendaForFinancial) {
      void agendaConversationRef.current.abandonPending(agendaIdentity).catch(() => {});
    }
    const hasPendingFinancialConversation = Boolean(
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
    const hasAgendaConversation = !shouldAbandonAgendaForFinancial
      && (
        hasPendingAgendaConversation
        // Com rascunho na tela, agenda explícita ainda tira a vez dele; sem
        // rascunho, quem reconhece agenda é o modelo.
        || (declaredIntent.startsWith('agenda_') && (!roteiaPeloModelo || hasPendingFinancialConversation))
      );
    const hasPendingConversation = hasAgendaConversation || hasPendingFinancialConversation;
    lastUserTurnTextRef.current = text;
    if (isRetiredBalanceRequest || isPublicFinancialSummary) {
      if (hasPendingConversation) abandonStalePendingState();
      // A pergunta de fechamento da resposta ("quer mais alguma coisa?") não
      // pode deixar um "sim" apagar o lançamento do card que ficou para trás.
      encerrarExclusao('expired');
      syncMessageToSupabase(userMsg);
      responderResumoSemSaldo(functionalText, isRetiredBalanceRequest);
      return;
    }
    // Com algo pendente, o modelo não é consultado: o cumprimento é
    // respondido aqui para não virar resposta do rascunho ou da agenda.
    if (declaredIntent === 'conversation_common' && (!roteiaPeloModelo || hasPendingConversation)) {
      encerrarExclusao('expired');
      syncMessageToSupabase(userMsg);
      createAssistantResponse(
        resolveCommonConversationResponse(text),
        { deduplicateNarration: false },
      );
      return;
    }
    // Edição de lançamento salvo: resposta à lista ou ao card, ou pedido
    // novo ("corrige o mercado de ontem pra 50"). Com rascunho ou agenda em
    // andamento, "corrige…" continua sendo deles.
    if (!hasPendingFinancialConversation && !hasPendingAgendaConversation) {
      if (tratarPedidoDeCategoriaPendente(functionalText, userMsg)) return;
      if (tratarPedidoDeMetaPendente(functionalText, userMsg)) return;
      if (edicaoPendenteRef.current && !edicaoAtiva()) {
        const vencida = edicaoPendenteRef.current;
        encerrarEdicao('expired');
        if (vencida.etapa === 'confirmar' && classifyPendingActionReply(functionalText) !== 'input') {
          syncMessageToSupabase(userMsg);
          createAssistantResponse(TEXTO_EDICAO_VENCIDA, { deduplicateNarration: false });
          return;
        }
      }
      if (edicaoAtiva() && tratarRespostaDaEdicao(functionalText, userMsg, turnToken)) return;
      // Antes do pedido de edição: com o card de exclusão na tela, "corrige
      // o mercado pra 50" descarta a exclusão em vez de deixá-la viva.
      if (tratarExclusaoNaFraseNova(functionalText, userMsg, turnToken)) return;
      if (tentarPedidoDeEdicao(functionalText, userMsg, declaredIntent, turnToken)) return;
    } else {
      if (edicaoPendenteRef.current) encerrarEdicao('expired');
      if (exclusaoPendenteRef.current) encerrarExclusao('expired');
      encerrarPedidoDeCategoria('expired');
      encerrarPedidoDeMeta('expired');
    }
    if (hasAgendaConversation) {
      syncMessageToSupabase(userMsg);
      runAgendaTurn({ functionalText, agendaIdentity, agendaRequest, messageSource, historySnapshot });
      return;
    }
    // REGRA GERAL: uma pendência incompatível nunca sequestra uma intenção
    // explícita NOVA. Se a frase é reconhecida como ação financeira
    // (set_balance/ambiguidade/receita/despesa/transferência/meta) e o
    // intent declarado é DIFERENTE do intent da pendência atual ("Recebi
    // mil reais" contra uma pendência de despesa antiga, por exemplo), a
    // pendência é abandonada e a frase nova processada do zero -- nunca
    // vira correção de um campo da ação antiga. A mesma intenção (ex.:
    // usuário reiterando/completando o próprio lançamento) continua
    // alimentando a pendência como resposta legítima.
    // BUG REAL EM PRODUÇÃO (voz): "na verdade paguei 150 reais" tem verbo e
    // valor, mas corrige o rascunho (looksLikePendingCorrection). Tratada
    // como frase nova, descartava o card e a pessoa recomeçava do zero.
    if (hasPendingConversation) {
      const pendingActionIntent = (pendingAction ?? financialConversation.state.action)?.intent;
      if (
        !looksLikePendingCorrection(functionalText)
        && (looksLikeFreshFinancialStatement(functionalText)
        || looksLikeFreshBalanceStatement(functionalText)
        || (ACTION_STATEMENT_INTENTS.has(declaredIntent) && declaredIntent !== pendingActionIntent))
      ) {
        abandonStalePendingState();
      } else {
        handlePendingConversationInput(functionalText, userMsg);
        return;
      }
    }

    setIsTyping(true);
    syncMessageToSupabase(userMsg);
    financialAnalyticsOriginRef.current = messageSource === 'voice'
      ? GA4_PRODUCT_ORIGINS.VOICE
      : GA4_PRODUCT_ORIGINS.MANUAL;
    financialConversation.setAnalyticsOrigin(financialAnalyticsOriginRef.current);

    setTimeout(() => {
      // S4: se outro sendText rodou durante o delay, este turno esta
      // obsoleto -- nao processa (evita resposta duplicada/concorrente).
      if (uniTurnTokenRef.current !== turnToken) return;
      setIsTyping(false);

      if (roteiaPeloModelo) {
        const agendaTurn = { functionalText, agendaIdentity, agendaRequest, messageSource, historySnapshot };
        void rotearPeloModelo(functionalText, { historySnapshot, turnToken, agendaTurn }).then((handled) => {
          if (!handled) runRuleBasedFlow();
        });
        return;
      }
      runRuleBasedFlow();
    }, UNI_THINK_MIN_MS);

    function runRuleBasedFlow() {
      // Sem o modelo, o parser de uma operação leria só a primeira de várias
      // ou trataria "12x" como compra avulsa: melhor pedir de outro jeito.
      const motivo = motivoParaNaoLerSemModelo(functionalText);
      if (motivo) {
        createAssistantResponse(TEXTO_SEM_MODELO[motivo]);
        return;
      }
      runDeterministicFinancialFlow(functionalText, historySnapshot, roteiaPeloModelo);
    }
  }

  function handleSuggestionSelect(item) {
    if (item.intent === 'abrir_agenda') {
      navigate(SIMPLIFIED_ROUTES.AGENDA);
      return;
    }
    sendText(item.label);
  }

  function handleModeChange(next) {
    if (isSimplifiedExperience || next === mode) return;
    invalidateAgendaRequest({ mode: next });
    setIsTyping(false);
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
    setEdicaoPendente(null);
    setExclusaoPendente(null);
    limparDesfazivel(null);
    ultimoConfirmadoRef.current = null;
    conversationalMemoryRef.current.reset();
    const candidates = conversations
      .filter((c) => c.mode === next)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (candidates.length > 0) {
      switchConversation(candidates[0].id);
    } else {
      setMode(next);
      setMessages([]);
      setActiveId(null);
      const conv = createLocalConversation(next);
      invalidateAgendaRequest({ conversationId: conv.id, mode: next });
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
    invalidateAgendaRequest({ conversationId: conv.id, mode });
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
    setEdicaoPendente(null);
    setExclusaoPendente(null);
    limparDesfazivel(null);
    ultimoConfirmadoRef.current = null;
    conversationalMemoryRef.current.reset();
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

    if (deletingActive) {
      invalidateAgendaRequest();
      setIsTyping(false);
    }

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
      invalidateAgendaRequest({ conversationId: conv.id, mode });
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
      setEdicaoPendente(null);
      setExclusaoPendente(null);
      limparDesfazivel(null);
      ultimoConfirmadoRef.current = null;
      conversationalMemoryRef.current.reset();
      saveHistory(nextList);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  // Memória de categoria (#79): a descrição confirmada fica ligada à
  // categoria, para a próxima interpretação. Em segundo plano: a falha só
  // deixa de lembrar.
  // Sem o primeiro card (rascunho restaurado de um reload), não há como saber
  // se houve troca, e a confirmação não entra na memória.
  function lembrarCategoriaConfirmada(acao, transacao, workspaceId) {
    const operacaoId = acao?.clientOperationId;
    if (!categoriaInicialPorOperacaoRef.current.has(operacaoId)) return;
    const categoriaInicial = categoriaInicialPorOperacaoRef.current.get(operacaoId) ?? null;
    categoriaInicialPorOperacaoRef.current.delete(operacaoId);
    const categoriaId = acao?.category?.id ?? acao?.payload?.category_id ?? null;
    void registrarConfirmacaoNaMemoria({
      workspaceId,
      descricao: acao?.payload?.description,
      categoriaId,
      tipo: acao?.payload?.transaction_type,
      trocou: Boolean(categoriaInicial && categoriaId && categoriaInicial !== categoriaId),
      transacaoId: transacao?.id,
      data: getLocalIsoDate(),
      valor: acao?.amount ?? null,
    });
  }

  async function handleConfirmAction(id) {
    if (confirmingRef.current) return;
    if (categoriaPendenteRef.current?.messageId === id) {
      if (pedidoDeCategoriaAtivo()) {
        await confirmarPedidoDeCategoria(id);
      } else {
        encerrarPedidoDeCategoria('expired');
        reportConfirmationError(id, TEXTO_CATEGORIA_VENCIDA);
      }
      return;
    }
    if (metaPendenteRef.current?.messageId === id) {
      if (pedidoDeMetaAtivo()) {
        await confirmarPedidoDeMeta(id);
      } else {
        encerrarPedidoDeMeta('expired');
        reportConfirmationError(id, TEXTO_META_VENCIDA);
      }
      return;
    }
    if (edicaoPendenteRef.current?.messageId === id) {
      if (edicaoAtiva()) {
        await confirmarEdicao(id);
      } else {
        encerrarEdicao('expired');
        reportConfirmationError(id, TEXTO_EDICAO_VENCIDA);
      }
      return;
    }
    if (exclusaoPendenteRef.current?.messageId === id) {
      if (exclusaoAtiva()) {
        await confirmarExclusao(id);
      } else {
        encerrarExclusao('expired');
        reportConfirmationError(id, TEXTO_EXCLUSAO_VENCIDA);
      }
      return;
    }
    const currentConversationId = activeIdRef.current;
    const currentWorkspaceId = effectiveWorkspace?.id;
    const stack = pendingActionStackRef.current;
    const activeStackAction = stack ? getActivePendingAction(stack) : null;
    const accountDependencyActive = isAccountCreationDependency(activeStackAction);
    const categoryDependencyActive = isCategoryCreationDependency(activeStackAction);
    if (
      !pendingAction
      && !accountDependencyActive
      && !categoryDependencyActive
      && isPlanReadyForFinalConfirmation(financialPlanRef.current)
    ) {
      financialPlanConfirmationMessageIdRef.current = id;
      await confirmFinancialPlan();
      return;
    }
    if (!pendingAction && !accountDependencyActive && !categoryDependencyActive) return;

    confirmingRef.current = true;
    setIsExecutingAction(true);
    setExecutionError(null);

    try {
      // Guard: se a conversa mudou durante a execução, abortar.
      if (activeIdRef.current !== currentConversationId) {
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }
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
          // BLOCO 5: marcar dependência como EXECUTING antes de executar (idempotência).
          const activeDep = getActivePendingAction(stack);
          if (activeDep?.type === 'create_financial_account') {
            confirmPendingAction(stack, activeDep.id);
            setPendingActionStack(stack); // sincronizar estado
          }
          dependencyOutcome = await accountDependencyCoordinatorRef.current.execute(stack);
        }

        // Guard: se a conversa OU workspace mudou durante a execução, abortar.
        if (activeIdRef.current !== currentConversationId || effectiveWorkspace?.id !== currentWorkspaceId) {
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
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

        // BLOCO 5: validar que a transação pai ainda é válida após a dependência.
        const parentAction = parentSnapshot?.action;
        const parentAccountId = parentAction?.account?.id ?? parentAction?.payload?.account_id;
        const parentCategoryId = parentAction?.category?.id ?? parentAction?.payload?.category_id;
        const parentAccountValid = !parentAccountId || accountState.accounts.some((a) => a.id === parentAccountId);
        const parentCategoryValid = !parentCategoryId || categoryState.categories.some((c) => c.id === parentCategoryId);
        if (!parentAccountValid || !parentCategoryValid) {
          reportConfirmationError(id, 'A movimentação original não é mais válida (conta/categoria removida).');
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

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
          categories: categoriasSugeriveis,
          transactionType: requestedCategory.category_type,
          requestedName: requestedCategory.name,
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
          // BLOCO 5: marcar dependência como EXECUTING antes de executar (idempotência).
          const activeDep = getActivePendingAction(stack);
          if (activeDep?.type === 'create_financial_category') {
            confirmPendingAction(stack, activeDep.id);
            setPendingActionStack(stack);
          }
          dependencyOutcome = await categoryDependencyCoordinatorRef.current.execute(stack);
        }

        // Guard: se a conversa OU workspace mudou durante a execução, abortar.
        if (activeIdRef.current !== currentConversationId || effectiveWorkspace?.id !== currentWorkspaceId) {
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
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

        // BLOCO 5: validar que a transação pai ainda é válida após a dependência.
        const parentAction = parentSnapshot?.action;
        const parentAccountId = parentAction?.account?.id ?? parentAction?.payload?.account_id;
        const parentCategoryId = parentAction?.category?.id ?? parentAction?.payload?.category_id;
        const parentAccountValid = !parentAccountId || accountState.accounts.some((a) => a.id === parentAccountId);
        const parentCategoryValid = !parentCategoryId || categoryState.categories.some((c) => c.id === parentCategoryId);
        if (!parentAccountValid || !parentCategoryValid) {
          reportConfirmationError(id, 'A movimentação original não é mais válida (conta/categoria removida).');
          setIsExecutingAction(false);
          confirmingRef.current = false;
          return;
        }

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

      const acaoConfirmada = financialConversation.state.action;
      const outcome = await financialConversation.confirm();

      // Guard: se a conversa mudou durante a execução, abortar.
      if (activeIdRef.current !== currentConversationId) {
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      if (!confirmingRef.current) return;
      if (!outcome || outcome.result?.error || !outcome.result?.data) {
        const errorText = outcome?.response?.text
          || 'Não consegui registrar essa movimentação. Tente novamente.';
        reportConfirmationError(id, errorText);
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }
      // Antes dos refresh: o lançamento já está gravado, mesmo que a pessoa
      // troque de conversa enquanto a tela recarrega.
      lembrarCategoriaConfirmada(acaoConfirmada, outcome.result.data, currentWorkspaceId);

      // BUG REAL (Sprint 2.1, BUG 1): a confirmação de um lançamento SIMPLES
      // (sem dependência de criação de conta/categoria) é persistida via
      // executeConfirmedFinancialAction -- uma RPC direta ao Supabase que
      // NUNCA passa por transactionsState.saveTransaction, então o upsert
      // otimista local daquele hook nunca roda. financialContext.snapshot
      // (usado pelo FinancialQueryEngine) ficava com os dados de ANTES do
      // lançamento até o próximo refresh natural acontecer por acaso --
      // daí "R$ 67,80" logo após confirmar e "R$ 117,80" alguns segundos
      // depois. Sem atraso: espera os hooks recarregarem do servidor ANTES
      // de liberar a confirmação, garantindo que a PRÓXIMA consulta já
      // enxergue o lançamento novo.
      await Promise.all([
        transactionsState.refresh(),
        balanceState.refresh(),
        accountState.refresh(),
        categoryState.refresh(),
      ]);

      // Guard: se a conversa mudou durante o refresh, abortar antes de
      // publicar qualquer coisa na conversa errada.
      if (activeIdRef.current !== currentConversationId) {
        setIsExecutingAction(false);
        confirmingRef.current = false;
        return;
      }

      const successText = withFollowUpQuestion(
        outcome.response?.text || 'Prontinho! Registrei essa movimentação para você.',
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, confirmation: { ...m.confirmation, status: 'confirmed' } }
            : m,
        ),
      );
      // Sprint 2 — Memória Conversacional: um registro confirmado alimenta a
      // memória (conta/categoria) para que a próxima pergunta possa dizer
      // "essa conta"/"essa categoria" -- só os campos realmente resolvidos
      // no lançamento persistido, nunca inventados.
      const persistedTransaction = outcome.result.data;
      if (persistedTransaction?.id) {
        ultimoConfirmadoRef.current = {
          id: persistedTransaction.id,
          workspaceId: currentWorkspaceId,
          conversationId: currentConversationId,
          em: Date.now(),
        };
      }
      const rememberedAccountName = accountState.accounts
        .find((account) => account.id === persistedTransaction?.account_id)?.name ?? null;
      const rememberedCategoryName = persistedTransaction?.category_id
        ? categoryState.categories.find((category) => category.id === persistedTransaction.category_id)?.name ?? null
        : null;
      if (rememberedAccountName || rememberedCategoryName) {
        conversationalMemoryRef.current.remember({
          account: rememberedAccountName,
          category: rememberedCategoryName,
        });
      }
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

  // "Salvar" do formulário do card: as mudanças entram como a correção
  // falada ("muda o valor para 50") e o card revisado substitui este.
  function handleSaveEditAction(id, overrides) {
    if (confirmingRef.current || !pendingAction) return;
    const result = financialConversation.provideInput(overrides);
    // Sem a frase original interpretada não há como refazer o rascunho: o
    // card atual continua valendo.
    if (!result) {
      reportConfirmationError(id, 'Não consegui aplicar essa edição. Diga o que quer mudar, por exemplo "muda o valor para 50".');
      return;
    }
    setExecutionError(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, confirmation: { ...m.confirmation, status: 'updated' } }
          : m,
      ),
    );
    setPendingAction(null);
    void publishConversationResultWithInference(result);
  }

  function handleCancelAction(id, { cascade = false } = {}) {
    if (confirmingRef.current) return;
    if (categoriaPendenteRef.current?.messageId === id) {
      cancelarPedidoDeCategoria(id);
      return;
    }
    if (metaPendenteRef.current?.messageId === id) {
      cancelarPedidoDeMeta(id);
      return;
    }
    if (edicaoPendenteRef.current?.messageId === id) {
      cancelarEdicao(id);
      return;
    }
    if (exclusaoPendenteRef.current?.messageId === id) {
      cancelarExclusao(id);
      return;
    }
    if (
      !pendingAction
      && isPlanReadyForFinalConfirmation(financialPlanRef.current)
    ) {
      financialPlanConfirmationMessageIdRef.current = id;
      cancelFinancialPlanEntirely();
      return;
    }
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
        // BUG REAL (Sprint 2.1, BUG 6): cancel() só troca o status para
        // CANCELED -- o reducer preserva state.action/state.parsed
        // intactos (ver uniConversationReducer.js). Quando o cancelamento
        // é DEFINITIVO (sem nada a retomar), reset() é o correto: volta
        // ao estado inicial de verdade, sem nenhum campo/issue da
        // movimentação cancelada sobrevivendo para o próximo turno.
        financialConversation.reset();
        clearCurrentPendingAction();
        createAssistantResponse(withFollowUpQuestion('Tudo bem. Cancelei a criação da conta e a movimentação.'));
        return;
      }

      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      setPendingAction(null);
      financialConversation.restore(transition.resumedAction.fields.snapshot);
      createAssistantResponse(
        'Tudo bem. Não criei a conta. A movimentação continua preservada; informe outra conta para continuar ou diga “cancelar” para descartar tudo.',
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
        // BUG REAL (Sprint 2.1, BUG 6): ver comentário equivalente no
        // cancelamento de dependência de conta acima -- reset() garante
        // que nenhum campo/issue da movimentação cancelada sobrevive.
        financialConversation.reset();
        clearCurrentPendingAction();
        createAssistantResponse(withFollowUpQuestion('Tudo bem. Cancelei a criação da categoria e a movimentação.'));
        return;
      }

      pendingActionStackRef.current = transition.stack;
      setPendingActionStack(transition.stack);
      setPendingAction(null);
      financialConversation.restore(transition.resumedAction.fields.snapshot);
      createAssistantResponse(
        'Tudo bem. Não criei a categoria. A movimentação continua preservada; informe outra categoria para continuar ou diga “cancelar” para descartar tudo.',
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
    createAssistantResponse(CANCELED_WITH_FOLLOW_UP);
    // BUG REAL (Sprint 2.1, BUG 6): idem -- cancelamento definitivo do
    // lançamento simples (com card já confirmável) usa reset(), não
    // cancel(), para não deixar account/category/issues da movimentação
    // cancelada sobrevivendo em financialConversation.state.action.
    financialConversation.reset();
    clearCurrentPendingAction();
    pendingActionStackRef.current = null;
    setPendingActionStack(null);
  }

  function handleBeforeVoiceStart() {
    uniVoice.stop();
    setVoiceMessageId(null);
  }

  // FASE ESTADOS DE PROCESSAMENTO: fonte única (hooks compartilhados com
  // SimplifiedHomeView -- ver CompactResponse) para a mensagem rotativa de
  // processamento e a revelação de texto sincronizada à voz. Calculado
  // ANTES do branch de retorno de `variant === 'simplified-home'` (hooks
  // nunca podem ficar depois de um return condicional).
  const pendingConfirmationMessage = useMemo(
    () => messages.find((m) => m.confirmation?.status === 'pending') ?? null,
    [messages],
  );
  // Só o card do lançamento em andamento abre o formulário; plano e
  // criação de conta/categoria continuam com o "Editar" antigo.
  const pendingEditForm = useMemo(
    () => (pendingAction
      ? buildConfirmationEditForm({
          action: pendingAction,
          accounts: accountState.accounts,
          categories: categoriasSugeriveis,
        })
      : null),
    [pendingAction, accountState.accounts, categoriasSugeriveis],
  );
  // Rascunho esperando a categoria (#80): as categorias do tipo viram chips
  // para a pessoa escolher. A Uni não escolhe por ela. Depois de outra
  // resposta (a pessoa mudou de assunto), os chips saem; o rascunho continua.
  const lastUniMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.from === 'uni')?.id ?? null,
    [messages],
  );
  const categoryChoices = useMemo(() => {
    const action = financialConversation.state.action;
    const issueCode = action?.issues?.[0]?.code;
    if (
      financialConversation.state.status !== 'needs_clarification'
      || (issueCode !== 'category_required' && issueCode !== 'category_incompatible')
      || !categoryQuestionMessageId
      || categoryQuestionMessageId !== lastUniMessageId
    ) {
      return [];
    }
    return (action.options?.categories ?? [])
      .filter((category) => category?.id && category.name)
      .map((category) => ({ id: category.id, label: category.name }))
      .sort((left, right) => left.label.localeCompare(right.label, 'pt-BR', { sensitivity: 'base' }));
  }, [financialConversation.state.status, financialConversation.state.action, categoryQuestionMessageId, lastUniMessageId]);
  const chatProcessingState = isExecutingAction ? 'executing' : (isTyping ? 'interpreting' : 'idle');
  const chatProcessingMessage = useUniProcessingMessage(chatProcessingState, {
    actionKind: pendingConfirmationMessage?.confirmation?.actionKind ?? null,
    operationHint: interpretingOperationHint,
  });
  const activeVoiceMessage = useMemo(() => {
    if (!voiceMessageId) return null;
    const found = messages.find((m) => m.id === voiceMessageId);
    return found ? { id: found.id, text: found.text } : null;
  }, [voiceMessageId, messages]);
  const textAudioSync = useTextAudioSync({ activeMessage: activeVoiceMessage, ttsStatus: uniVoice.status });
  // HOTFIX FINAL (chaves duplicadas ainda chegando ao render): barreira
  // final de segurança, aplicada só na lista que o chat completo realmente
  // renderiza (ver dedupeMessagesForRender em mergeRestoredMessages.js) --
  // nunca substitui `messages` (o estado real/fonte de verdade continua
  // intocado para hidratação, scroll, persistência etc.), só protege o
  // `.map()` de gerar `key`s repetidas mesmo que alguma origem upstream
  // (ex.: histórico já contaminado no banco antes da correção de
  // saveMessages) ainda entregue duas entradas com a mesma identidade.
  const renderedMessages = useMemo(() => dedupeMessagesForRender(messages), [messages]);

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
        voiceMessageId={voiceMessageId}
        interpretingOperationHint={interpretingOperationHint}
        onSendTranscript={sendText}
        onBeforeVoiceStart={handleBeforeVoiceStart}
        onConfirmAction={handleConfirmAction}
        onCancelAction={handleCancelAction}
        onUndoAction={handleDesfazerExclusao}
        editForm={pendingEditForm}
        onSaveEditAction={handleSaveEditAction}
        categoryChoices={categoryChoices}
        onChooseCategory={handleCategoryChoice}
        onWelcomeVoiceSettled={handleWelcomeVoiceSettled}
        onRealtimeVoiceActiveChange={handleRealtimeVoiceActiveChange}
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
          <div className={styles.messages} ref={setMessagesContentRef}>
            {renderedMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onConfirmAction={handleConfirmAction}
                onEditAction={handleEditAction}
                onCancelAction={handleCancelAction}
                onUndoAction={handleDesfazerExclusao}
                editForm={message.confirmation?.status === 'pending' ? pendingEditForm : null}
                onSaveEditAction={handleSaveEditAction}
                isExecuting={isExecutingAction}
                executionError={message.confirmation?.status === 'pending' ? executionError : null}
                voiceEnabled={voicePreference.enabled}
                voiceStatus={uniVoice.status}
                voiceError={uniVoice.error}
                isActiveVoiceMessage={voiceMessageId === message.id}
                onSpeakMessage={handleSpeakMessage}
                onPauseResumeVoice={handlePauseResumeVoice}
                onStopVoice={handleStopVoice}
                displayText={
                  textAudioSync.activeMessageId === message.id ? textAudioSync.displayText : undefined
                }
                processingLabel={
                  message.confirmation?.status === 'pending' ? chatProcessingMessage ?? undefined : undefined
                }
              />
            ))}
            {isTyping && (
              <>
                <TypingIndicator message={chatProcessingMessage} />
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
        {!isEmpty && (categoryChoices.length ? (
          <QuickSuggestions
            items={categoryChoices}
            onSelect={handleCategoryChoice}
            variant="rail"
            label="Escolha a categoria"
          />
        ) : (
          <QuickSuggestions items={suggestions} onSelect={handleSuggestionSelect} variant="rail" />
        ))}
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
