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
  createFinancialIntentInterpreter, isSemanticIntentFlagEnabled,
  isFinancialOrchestratorFlagEnabled, isCompoundFinancialQueriesFlagEnabled,
  createFinancialResponseComposer, isLlmResponseComposerFlagEnabled,
} from '../uni-llm';
import { resolveSemanticFinancialIntent } from './semanticFinancialQuery.js';
import { runFinancialSemanticOrchestrator, buildOrchestratorCapabilityCatalog } from './financialSemanticOrchestrator.js';
import { composeNaturalFinancialResponse } from './composeNaturalFinancialResponse.js';
import { composeFinancialResponseWithLlm } from './composeFinancialResponseWithLlm.js';
import { buildFinancialOrchestratorTelemetryEntry, logFinancialOrchestratorTelemetry } from './financialOrchestratorTelemetry.js';
import { recordFinancialValidationEvent } from './financialValidationTelemetry.js';
import {
  createUniInterpretClient,
  interpretacaoParaOverrides,
  montarHistoricoParaInterpretacao,
  montarRascunhoParaInterpretacao,
} from '../uni-interpret/uniInterpretClient.js';
import {
  ROTAS_INTERPRETACAO,
  escolherRotaDaInterpretacao,
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
import { useAccounts, useCategories, useTransactions, useFinancialBalances } from '../../hooks';
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
  stripLeadingConversationalPrefix,
} from '../uni-intents/index.js';
import { createUniEngine, projectFinancialSnapshot, createOperationalMemory, uniMemory, runUniEngineIntegration, buildGuidanceSnapshot, buildObservationSnapshot, buildDecisionReadinessSnapshot, buildCapabilityReadinessSnapshot, buildExecutionReadinessSnapshot, runControlledGuidanceApplication, selectControlledVisibleResponse, buildConversationPlanSnapshot, selectControlledConversationRoute, buildCognitiveOrchestratorSnapshot, runUniEngineGateway, buildEngineResponseContext, compareLegacyWithEngine, buildCognitivePipelineSnapshot, createEmptyCognitivePipelineSnapshot, recordCognitiveTelemetry, resetCognitiveTelemetry, runFinancialReasoningShadow, runFinancialRuntimeShadow, selectFinancialVisibleResponse, assignFinancialRolloutBucket, runFinancialRolloutIntegration, buildToolCallingAuthorization } from '../uni-engine/index.js';
import { validateFinancialFacts } from '../uni-engine/financial-runtime/factual-validation/index.js';
import { validateFinancialRuntimeSafety } from '../uni-engine/financial-runtime/eligibility/index.js';
import { normalizeTelemetryErrorCode, telemetry } from '../observability/index.js';
import {
  recordFinancialShadowValidation,
  recordToolCallingProposal,
  recordToolCallingResult,
} from '../uni-engine/telemetry/uniEngineObservability.js';
const uniEngine = createUniEngine({ env: import.meta.env, isDev: import.meta.env.DEV });

// FASE 20.1 — Tool Calling. Integração isolada ao pipeline com guardas de
// turno/execução única no módulo de integração. Desligada por padrão: sem
// flag explícita, nenhuma tool call é disparada e a saída é 100% legada.
import { runToolCallingIntegration, createFinancialDataToolsContext, composeFinalResponseText } from '../uni-engine/index.js';
// Fase 2 — memória operacional do Uni Engine: objeto TEMPORÁRIO por conversa
// (não persiste nada). O pipeline nunca lê esta memória; apenas o motor.
const uniEngineMemoryByConversation = new Map();
// Fase 3 — memória persistente do Uni Engine (Shadow-only). Adapter por
// sessão; o serviço isola por userId + workspaceId e nunca influencia a
// resposta entregue ao usuário (appliedToDecision permanece false).
let uniMemoryServiceInstance = null;
const uniMemoryAdapterBySession = new Map();
function getUniMemoryService() {
  if (!uniMemoryServiceInstance) {
    uniMemoryServiceInstance = uniMemory.createUniMemoryService({
      config: uniEngine.getConfig(),
      repository: uniMemory.createSupabaseMemoryRepository(),
    });
  }
  return uniMemoryServiceInstance;
}
function getUniMemoryAdapter(userId, workspaceId) {
  const key = `${String(userId ?? 'anon')}::${String(workspaceId ?? 'none')}`;
  if (!uniMemoryAdapterBySession.has(key)) {
    uniMemoryAdapterBySession.set(
      key,
      getUniMemoryService().createEngineAdapter({ userId, workspaceId }),
    );
  }
  return uniMemoryAdapterBySession.get(key);
}
function warmUniMemoryCache(userId, workspaceId) {
  if (!userId || !workspaceId) return;
  const service = getUniMemoryService();
  if (service.retrieveRelevantSync({ userId, workspaceId }).data == null) {
    service.warm({ userId, workspaceId }).catch(() => {});
  }
}
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
import { executeConfirmedFinancialAction } from '../../services/confirmedFinancialActionService.js';
import {
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
  parcela: 'Compra parcelada ainda não é registrada pela conversa. Lance pelo Financeiro.',
});
const TEXTO_RECORRENCIA_SO_ESTE_LANCAMENTO = 'Esse rascunho vale só para este lançamento. A Uni ainda não repete lançamentos sozinha.';
const TEXTO_META_SEM_CRIACAO = 'Ainda não posso criar objetivos pela conversa com segurança. Posso consultar seus objetivos ou orientar você a criá-los na área de Objetivos.';
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

  const lastEngineIntegrationResultRef = useRef(null);
  const financialStateRef = useRef(null);
  // BLOCO 1 — GATEWAY ÚNICO DE ENTRADA: ref dedicada apenas em memória
  // sem state React, sem render adicional, reset no novo turno, reset no catch.
  const lastUniEngineGatewayResultRef = useRef(null);
  // PARTE 2 — BLOCO 1: a Uni Engine passa a ser acionada SOMENTE depois que
  // existe um resultado legado utilizável (no ponto único de saída de
  // resposta). `lastEngineTurnRef` guarda o turno do usuário (mensagem +
  // flags de pendência) para a engine observar no momento certo;
  // `lastEngineAnalyzedMessageIdRef` deduplica a execução por mensagem do
  // usuário — a mesma resposta/turno nunca roda a engine duas vezes.
  const lastEngineTurnRef = useRef(null);
  const lastEngineAnalyzedMessageIdRef = useRef(null);
  // FASE 20.1 — Tool Calling: ref dedicado para guardar o id da última
  // mensagem processada pelo módulo de integração (deduplicação adicional aos
  // refs da engine, por segurança, além do guard interno da integração).
  const lastToolCallingProcessedMessageIdRef = useRef(null);
  // FASE 20.1 — Tool Calling: ref dedicado para guardar o último resultado da
  // integração (diagnóstico técnico em memória; nunca influencia a resposta).
  const lastUniToolCallingResultRef = useRef(null);
  // Sprint 2 — Memória Conversacional: contexto de curto prazo (conta/
  // categoria/última consulta) por instância de conversa, nunca persiste.
  // Resetado nos mesmos pontos em que financialConversation/
  // lastToolCallingProcessedMessageIdRef já são resetados.
  const conversationalMemoryRef = useRef(createConversationalMemory());
  // PARTE 2 — BLOCO 2: snapshot observacional das guidances (Question,
  // Clarification, Style, Length) calculado após o resultado legado, apenas
  // para diagnóstico em memória. Nunca altera texto, nunca aplica, nunca
  // persiste — o pipeline legado segue intacto.
  const lastGuidanceSnapshotRef = useRef(null);
  // PARTE 2 — BLOCO 4: snapshot observacional consolidado da conversa
  // (integrationSnapshot + guidanceSnapshot + activationSnapshot +
  // diagnostics + capabilities + metadata + timestamps + shadowMode).
  // Fica SOMENTE em ref dedicado — nenhum state React, nenhuma renderização
  // adicional, nunca persistido, nunca enviado a banco/backend/RPC.
  const lastObservationSnapshotRef = useRef(null);
  // PARTE 3 — DECISION READINESS: snapshot estritamente observacional que
  // consome o Observation Snapshot e responde tecnicamente se o sistema
  // ESTARIA pronto para uma aplicação futura. Fica SOMENTE em ref dedicado —
  // nenhum state React, nenhuma renderização, nunca persistido, nada é
  // aplicado ao usuário (legacyPreserved true, applied false).
  const lastDecisionReadinessSnapshotRef = useRef(null);
  // PARTE 4 — CAPABILITY ACTIVATION READINESS: snapshot estritamente
  // observacional que determina quais capabilities poderiam ser ativadas no
  // futuro a partir das decisões de Activation JÁ produzidas. Fica SOMENTE
  // em ref dedicado — nenhum state React, nenhuma renderização, nunca
  // persistido, nenhuma capability é ativada (legacyPreserved true,
  // applied false).
  const lastCapabilityReadinessSnapshotRef = useRef(null);
  // PARTE 4 — EXECUTION READINESS: snapshot estritamente observacional que
  // avalia se uma FUTURA execução seria segura. Fica SOMENTE em ref
  // dedicado — nenhum state React, nenhuma renderização, nunca persistido,
  // nenhuma execução acontece (legacyPreserved true, applied false).
  const lastExecutionReadinessSnapshotRef = useRef(null);
  // PARTE 5 — APPLICATION (primeira ativação controlada): resultado da camada
  // de APLICAÇÃO controlada (RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE,
  // somente em DEV com Integration + Activation habilitadas e usuário
  // autorizado). Fica SOMENTE em ref dedicado — nenhum state React, nenhuma
  // renderização, nunca persistido, nada é aplicado à resposta exibida (a
  // fonte final continua o texto legado; o resultado finalText nunca substitui
  // a mensagem entregue ao usuário nesta parte).
  const lastApplicationResultRef = useRef(null);
  // PARTE 7 — CONVERSATION PLANNER: snapshot estritamente observacional que
  // determina QUAL deve ser o próximo passo lógico da conversa (NEXT_STEP_*),
  // consumindo SOMENTE os snapshots já existentes (Observation, Guidance,
  // Decision, Capability Readiness, Execution Readiness e Application). Fica
  // SOMENTE em ref dedicado — nenhum state React, nenhuma renderização,
  // nunca persistido, nenhum plano é executado (legacyPreserved true,
  // applied false, nunca gera texto).
  const lastConversationPlannerSnapshotRef = useRef(null);
  // PARTE 8 — CONVERSATION ROUTING: resultado estritamente observacional que
  // consulta o Conversation Planner do MESMO turno e seleciona a rota
  // conversacional (ANSWER/QUESTION/CLARIFICATION/CONFIRMATION/WAIT/NONE),
  // habilitado SOMENTE em DEV (flag explícita). Fica SOMENTE em ref dedicado —
  // nenhum state React, nenhuma renderização, nunca persistido, a rota legada
  // nunca é contornada (legacyPreserved true, applied false por padrão).
  const lastConversationRoutingSnapshotRef = useRef(null);
  // PARTE 9 — COGNITIVE ORCHESTRATOR: snapshot consolidado final de todas as
  // camadas já produzidas (Observation → Guidance → Decision → Capability Readiness
  // → Execution Readiness → Application → Conversation Planner → Conversation Routing).
  // Nunca reexecuta nenhuma camada. O orquestrador fica SOMENTE em ref dedicado —
  // nenhum state React, nenhuma renderização, nunca persistido, nenhuma resposta
  // entregue ao usuário altera (applied false, legacyPreserved true). Uma única
  // consulta por mensagem; exceção nunca escapa (snapshot vazio falho-safe).
  const lastCognitiveOrchestratorSnapshotRef = useRef(null);
  // FASE 11 — BLOCO 2 (CONTEXT BRIDGE): resultado da ponte de contexto,
  // consumida UMA única vez por turno no ponto único de construção da
  // resposta. Fica SOMENTE em ref (nenhum state React, nenhuma renderização,
  // nada persistido) — zerado no novo turno e no catch; nunca reexecuta a
  // Uni Engine e nunca altera o texto legado por si mesma.
  const lastContextBridgeResultRef = useRef(null);
  const lastEngineContextBridgeTurnRef = useRef(null);
  // FASE 14 — BLOCO 3 (COGNITIVE COMPARISON): comparação observacional
  // legado × Engine produzida UMA única vez por turno. Compara a decisão do
  // pipeline legado com a rota/decisão interna da Uni Engine e NUNCA altera
  // resposta (influenceApplied sempre false; legacyPreserved sempre true).
  // Fica SOMENTE em ref (nenhum state React, nenhuma renderização, nada
  // persistido) — zerado no novo turno e no catch; nunca reexecuta nada.
  const lastEngineComparisonRef = useRef(null);
  // FASE 14 — BLOCO 2: snapshot cognitivo consolidado do turno que agrega os
  // 12 componentes observacionais (gateway → observation → epistemic →
  // readiness → plan → route → orchestrator → context bridge → comparison →
  // divergence diagnostics). Consome SOMENTE resultados já produzidos no
  // turno. Fica SOMENTE em ref dedicado — nenhum state React, nenhuma
  // renderização, nunca persistido, falha-safe (engine segue intacta).
  const lastCognitivePipelineSnapshotRef = useRef(null);
  // FASE 15 — BLOCO 7/8: resultado do Motor de Raciocínio Financeiro
  // (shadow-only). Executa em paralelo observacional ao pipeline da Fase 14,
  // consome SOMENTE dados financeiros já disponíveis no turno, fica SOMENTE
  // em ref (nenhum state, nenhuma renderização, nada persistido) e é sempre
  // descartável — influenceApplied=false, discarded=true; jamais altera a
  // resposta visível, pending actions ou confirmações.
  const lastFinancialReasoningResultRef = useRef(null);

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
    categories: categoryState.categories,
    executeAtomicAction: executeConfirmedFinancialAction,
    saveAccount: accountState.saveAccount,
    saveTransaction: saveVoiceTransaction,
    profileId: personalityProfileId,
    workspaceType: financialWorkspaceType,
    referenceDate: getLocalIsoDate(),
    allowedWriteIntents: ALLOWED_CHAT_WRITE_INTENTS,
    accountBalances: financialContext.snapshot.accountBalancesById,
  });
  useEffect(() => {
    financialStateRef.current = financialConversation.state;
  }, [financialConversation.state]);
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

  // Sprint 3 (Interpretação Semântica) -- mesma Edge Function/gate base do
  // chat (uni-chat-llm), com a flag PRÓPRIA e nova
  // VITE_UNI_SEMANTIC_INTENT_ENABLED (default desligada, nunca reaproveita
  // as flags de tools/phrasing da Sprint 1, que têm responsabilidades
  // diferentes). Com a flag desligada, `enabled` é sempre false e nenhuma
  // chamada extra é feita -- comportamento idêntico ao anterior.
  const financialIntentInterpreter = useMemo(
    () => createFinancialIntentInterpreter({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: uniLlm.enabled && isSemanticIntentFlagEnabled(),
    }),
    [uniLlm.enabled],
  );

  // Sprint 4 Ciclo 3 (Bloco 4.4) -- composição natural REAL via LLM,
  // atrás da própria flag (VITE_UNI_LLM_RESPONSE_COMPOSER_ENABLED). Só é
  // efetivamente chamada quando o orquestrador já produziu um resultado
  // "handled" com fatos estruturados válidos -- desligada, o caminho
  // determinístico existente (composeNaturalFinancialResponse) continua
  // sendo o único usado, byte a byte igual ao comportamento anterior.
  //
  // Fase 1 (correção do kill switch, Bloco 4.10): `enabled` é passado como
  // FUNÇÃO (nunca um booleano pré-calculado) -- isLlmResponseComposerFlagEnabled()
  // (que consulta o kill switch via localStorage) só pode ter efeito
  // IMEDIATO, numa aba já aberta, se for reavaliada a cada verificação de
  // isSupported(), em vez de congelada uma única vez quando este useMemo
  // roda. `uniLlm.enabled` continua vindo da dependência do useMemo (só
  // muda quando o próprio hook muda, comportamento inalterado).
  const financialResponseComposer = useMemo(
    () => createFinancialResponseComposer({
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      enabled: () => uniLlm.enabled && isLlmResponseComposerFlagEnabled(),
    }),
    [uniLlm.enabled],
  );

  // Sprint 3 -- último passo determinístico antes do fallback conversacional
  // genérico (handleUnresolvedMessage). Só interpreta; a validação de
  // entidades e a execução real continuam 100% no motor determinístico já
  // existente (ver semanticFinancialQuery.js). Nunca roda com uma pending
  // action ativa (esta função só é chamada de dentro de
  // runDeterministicFinancialFlow, que por sua vez só roda quando
  // hasPendingConversation é falso -- ver sendText).
  async function attemptSemanticFinancialQuery(text, historySnapshot) {
    const turnTokenAtStart = uniTurnTokenRef.current;
    if (!financialIntentInterpreter.isSupported()) return false;

    // Sprint 4 (Bloco 4.2) -- orquestrador central, atrás da própria flag
    // (VITE_UNI_FINANCIAL_ORCHESTRATOR_ENABLED, cumulativa com a flag da
    // Sprint 3). Desligada, `useOrchestrator` é sempre false e o restante
    // desta função é BYTE A BYTE o comportamento da Sprint 3 -- nenhuma
    // chamada extra, nenhuma mudança de resultado.
    const useOrchestrator = isFinancialOrchestratorFlagEnabled();

    // Bloco 4.9 -- telemetria DEV de validação real: mede a latência da
    // chamada de interpretação isoladamente (independente da telemetria
    // do orquestrador, Bloco 4.6.3, que mede outra coisa -- o tempo do
    // ORQUESTRADOR, não da chamada LLM em si). Registrada sempre,
    // sucesso ou falha, porque a chamada acontece (e custa) de qualquer
    // forma. Nunca altera o fluxo -- só observa.
    const interpretStartedAt = Date.now();
    const { interpretation, error, usage: interpretUsage } = await financialIntentInterpreter.interpretFinancialIntent({
      text,
      conversationHistory: historySnapshot,
      referenceDate: financialContext.snapshot.referenceDate,
      accounts: accountState.accounts.map((account) => account.name),
      categories: categoryState.categories.map((category) => category.name),
      availableCapabilities: useOrchestrator
        ? buildOrchestratorCapabilityCatalog().map((capability) => capability.id)
        : [],
    });
    recordFinancialValidationEvent(
      {
        mode: 'financial_intent',
        llmCallCount: 1,
        durationMs: Date.now() - interpretStartedAt,
        usage: interpretUsage,
      },
      { isDev: import.meta.env.DEV },
    );
    if (error || !interpretation) return false;

    if (useOrchestrator) {
      const requestStartedAt = Date.now();
      // Consultas compostas exigem a própria flag adicional -- desligada,
      // isCompound/subIntents são descartados com segurança antes mesmo de
      // chegar ao orquestrador (nunca uma consulta composta "escapa" com a
      // flag desligada).
      const allowCompound = isCompoundFinancialQueriesFlagEnabled();
      const effectiveInterpretation = allowCompound
        ? interpretation
        : { ...interpretation, isCompound: false, subIntents: [] };

      const result = runFinancialSemanticOrchestrator({
        interpretation: effectiveInterpretation,
        snapshot: financialContext.snapshot,
        mode,
        conversationStyle,
        history: historySnapshot,
        referenceDate: financialContext.snapshot.referenceDate,
        lastQuery: conversationalMemoryRef.current.getLastQuery(),
      });

      // Bloco 4.6.3 -- telemetria DEV, só metadados (nunca texto/valores
      // reais). Sempre registrada, independente do resultado.
      logFinancialOrchestratorTelemetry(
        buildFinancialOrchestratorTelemetryEntry({
          intent: result.intent,
          source: result.source,
          llmCallCount: 1,
          modesUsed: ['financial_intent'],
          totalDurationMs: Date.now() - requestStartedAt,
          composerUsed: false,
          subIntentCount: Array.isArray(result.executionPlan?.steps) ? result.executionPlan.steps.length : 0,
          status: result.status,
        }),
        { isDev: import.meta.env.DEV },
      );

      if (result.status === 'needs_clarification' && result.responseDraft) {
        if (uniTurnTokenRef.current !== turnTokenAtStart) return false;
        createAssistantResponse(result.responseDraft);
        return true;
      }

      // Bloco 4.6.2 -- anti-fallback-duplo: "unsupported" já é uma resposta
      // honesta e definitiva do orquestrador (a LLM já interpretou a frase
      // e o registro de capacidades já confirmou que não há suporte) --
      // cair em handleUnresolvedMessage aqui seria uma SEGUNDA chamada LLM
      // desnecessária no mesmo turno, arriscando inclusive prometer uma
      // capacidade que não existe. Responde direto, sem fallback.
      if (result.status === 'unsupported') {
        if (uniTurnTokenRef.current !== turnTokenAtStart) return false;
        createAssistantResponse(
          'Ainda não consigo ajudar com isso especificamente, mas posso mostrar entradas, saídas, resumo do período ou suas últimas movimentações.',
        );
        return true;
      }

      // status 'not_financial' ou 'fallback': cai para o fallback
      // conversacional geral (handleUnresolvedMessage) de propósito --
      // 'not_financial' pode ser uma pergunta legítima fora do domínio
      // financeiro (ex.: "Quem foi Einstein?"), e 'fallback' indica que a
      // interpretação não resultou em nada executável (entidade não
      // resolvida/ponte legada não reconheceu) -- mesmo comportamento já
      // estabelecido antes deste ciclo.
      if (result.status !== 'handled' || !result.responseDraft) return false;

      // Bloco 4.3.1/4.3.4 -- composição determinística (acolhimento +
      // explicação de termo quando aplicável); nunca recalcula o texto já
      // pronto vindo do orquestrador. Este texto é SEMPRE calculado -- é o
      // fallback seguro obrigatório da composição via LLM abaixo.
      const deterministicText = composeNaturalFinancialResponse({
        responseDraft: result.responseDraft,
        reasoningTags: interpretation.reasoningTags,
      }) ?? result.responseDraft;

      // Bloco 4.4 -- composição REAL via LLM, só tentada quando a flag
      // própria está ligada e há fatos estruturados reais para embasar o
      // texto. Guardrails (validateComposedResponse) + reformulação única
      // + fallback determinístico acontecem dentro de
      // composeFinancialResponseWithLlm; aqui só decide SE tenta.
      let finalText = deterministicText;
      if (financialResponseComposer.isSupported() && result.structuredResult) {
        const hasEmotionalSignal = Array.isArray(interpretation.reasoningTags)
          && interpretation.reasoningTags.some((tag) => typeof tag === 'string' && tag.includes('emotional'));
        const composeStartedAt = Date.now();
        const composed = await composeFinancialResponseWithLlm({
          composeFinancialResponseViaLlm: financialResponseComposer.composeFinancialResponseViaLlm,
          structuredFacts: result.structuredResult,
          userIntent: result.intent,
          operation: result.intent,
          conversationStyle,
          emotionalContext: hasEmotionalSignal,
          explanationRequest: null,
          deterministicText,
          // Bloco 4.8 -- guardrail textual de entidades: `allowedEntityNames`
          // já vem embutido em result.structuredResult.entityNames (o
          // orquestrador calcula a partir do texto determinístico
          // confiável); aqui só fornecemos o UNIVERSO real de nomes do
          // workspace (mesma lista de nomes, nunca saldo/id, já enviada à
          // interpretação semântica -- Sprint 3) para diferenciar "conta
          // real só que fora de escopo" de "conta inventada".
          universeEntityNames: [
            ...accountState.accounts.map((account) => account.name),
            ...categoryState.categories.map((category) => category.name),
          ],
        });
        finalText = composed.text ?? deterministicText;
        logFinancialOrchestratorTelemetry(
          buildFinancialOrchestratorTelemetryEntry({
            intent: result.intent,
            source: 'llm_composer',
            llmCallCount: composed.attempts,
            modesUsed: composed.attempts > 0 ? ['financial_response_compose'] : [],
            composerUsed: composed.composerUsed,
            status: composed.composerUsed ? 'handled' : 'fallback',
            fallbackReason: composed.fallbackReason,
          }),
          { isDev: import.meta.env.DEV },
        );
        // Bloco 4.9 -- mesmo evento acima, mas alimentando o AGREGADOR de
        // validação real (taxa de sucesso/fallback/bloqueio por guardrail/
        // latência/custo) em vez de só um log pontual. Nenhuma decisão do
        // sistema depende deste registro.
        recordFinancialValidationEvent(
          {
            mode: 'financial_response_compose',
            llmCallCount: composed.attempts,
            durationMs: Date.now() - composeStartedAt,
            composerUsed: composed.composerUsed,
            fallbackReason: composed.fallbackReason,
            usage: composed.usage,
          },
          { isDev: import.meta.env.DEV },
        );
      }

      if (result.executionPlan?.type !== 'compound') {
        conversationalMemoryRef.current.remember({
          queryType: result.intent,
          queryParams: result.resolvedEntities,
          response: finalText,
        });
      }
      if (uniTurnTokenRef.current !== turnTokenAtStart) return false;
      createAssistantResponse(finalText, { highlight: result.structuredResult?.highlight ?? null });
      return true;
    }

    const outcome = resolveSemanticFinancialIntent({
      interpretation,
      snapshot: financialContext.snapshot,
      mode,
      conversationStyle,
      history: historySnapshot,
      referenceDate: financialContext.snapshot.referenceDate,
      lastQuery: conversationalMemoryRef.current.getLastQuery(),
    });
    if (!outcome.handled) return false;

    if (uniTurnTokenRef.current !== turnTokenAtStart) return false;

    if (outcome.queryParams) {
      conversationalMemoryRef.current.remember({
        queryType: outcome.queryType,
        queryParams: outcome.queryParams,
        response: outcome.response.text,
      });
    }
    createAssistantResponse(outcome.response.text, { highlight: outcome.response.highlight });
    return true;
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

  // Ajuste que as regras não entenderam, com o card na tela: a IA recebe o
  // rascunho e devolve a operação corrigida ("não, foi no débito").
  async function correctPendingWithAi(text, action, confirmationId) {
    const conversationId = activeIdRef.current;
    setIsTyping(true);
    let overrides;
    try {
      overrides = await interpretWithAi(text, action, { draft: montarRascunhoParaInterpretacao(action) });
    } finally {
      setIsTyping(false);
    }
    if (activeIdRef.current !== conversationId) return;
    const result = overrides ? financialConversation.provideInput(overrides) : null;
    if (!result) {
      createAssistantResponse('Para continuar, diga “confirmar”, “cancelar” ou informe o campo que deseja corrigir.');
      return;
    }
    setMessages((current) => current.map((message) => (
      message.id === confirmationId
        ? { ...message, confirmation: { ...message.confirmation, status: 'updated' } }
        : message
    )));
    setPendingAction(null);
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

    const message = createAssistantResponse('Revise as informações antes de registrar.', {
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
      categories: categoryState.categories,
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

    try {
      for (const op of persistable) {
        const result = await executeFinancialIntentAction(op.action, {
          executeAtomicAction: executeConfirmedFinancialAction,
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
        workingPlan = markPlanOperationConfirmed(workingPlan, op.temporaryId);
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
        categories: categoryState.categories,
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
  const [pendingActionStack, setPendingActionStack] = useState(null);
  const agendaConversationRef = useRef(null);
  if (!agendaConversationRef.current) {
    agendaConversationRef.current = createAgendaConversationFlow();
  }
  const [pendingHydrated, setPendingHydrated] = useState(false);
  const [executionError, setExecutionError] = useState(null);
  const [isExecutingAction, setIsExecutingAction] = useState(false);
  const confirmingRef = useRef(false);
  const pendingActionRef = useRef(null);
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
  // (LLM, plano financeiro, semantica) capturam o token no inicio e so
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
    encerrarEdicao('expired');
  }

  // Edição de lançamento já salvo pedida em conversa ("corrige o mercado de
  // ontem pra 50"). Pendência paralela, como o plano financeiro: a lista
  // para escolher qual lançamento ou o card esperando confirmação. Não
  // sobrevive a recarregar a página: o card fica expirado.
  const [edicaoPendente, setEdicaoPendenteState] = useState(null);
  const edicaoPendenteRef = useRef(null);
  const ultimoConfirmadoRef = useRef(null);

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
      || edicaoAtiva(edicaoPendente),
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
  }, [pendingHydrated, pendingAction, pendingActionStack, edicaoPendente]);

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
  // PARTE 2 — BLOCO 1: a Uni Engine roda SOMENTE depois que existe um
  // resultado legado utilizável — este é o ponto ÚNICO de saída de resposta
  // (createAssistantResponse → buildMessage) e já recebe o texto legado
  // final. Aqui a engine observa (runUniEngineShadow) e a camada de
  // integração calcula guidance/diagnostics/metadata/comparação, mas tudo
  // permanece observacional: o resultado vai apenas para refs de diagnóstico
  // (lastEngineIntegrationResultRef) e NUNCA altera a
  // resposta exibida. Deduplicação por mensagem do usuário: a mesma resposta
  // não roda a engine duas vezes. Falha segura: qualquer erro interno é
  // capturado e o pipeline legado segue intacto.
  // PARTE 5 — BLOCO 4: runEngineObservational também RETORNA o resultado da
  // Application do MESMO turno (retorno direto, nunca um ref antigo). Sem
  // turno, deduplicado ou em erro → null, e o seletor usa o texto legado.
  const runEngineObservational = useCallback((legacyText, messageOptions = {}) => {
    const engineStartedAt = Date.now();
    const turn = lastEngineTurnRef.current;
    if (!turn || !turn.userMessageId) return null;
    if (lastEngineAnalyzedMessageIdRef.current === turn.userMessageId) return lastApplicationResultRef.current;
    lastEngineAnalyzedMessageIdRef.current = turn.userMessageId;
    // PARTE 2 — BLOCO 4: helper local com falha segura para construir o
    // snapshot observacional consolidado da conversa. Ele é criado ANTES do
    // try principal para que um erro NA CONSTRUÇÃO do snapshot nunca derrube
    // a engine nem zere os refs de shadow/integração/guidance já gravados —
    // retorna null (ou deixa o ref em null) e o pipeline legado segue
    // intacto. Nada aqui aplica guidance, persiste ou chama serviços.
    const buildConversationObservationSnapshot = ({ integrationSnapshot = null, guidanceSnapshot = null, activationSnapshot = null } = {}) => {
      try {
        if (!integrationSnapshot && !guidanceSnapshot) return null;
        return buildObservationSnapshot({
          integrationSnapshot,
          guidanceSnapshot,
          activationSnapshot,
          context: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            isDev: import.meta.env.DEV,
          },
        });
      } catch {
        return null;
      }
    };
    // PARTE 3 — DECISION READINESS: helper local com falha segura. Um erro NA
    // CONSTRUÇÃO do snapshot de prontidão nunca derruba a engine nem zera os
    // refs já gravados — retorna null (ou deixa o ref em null) e o pipeline
    // legado segue intacto. Nada aqui aplica capacidade, persiste ou chama
    // serviços; a Decision Layer e a Activation Engine apenas são lidas.
    const buildConversationReadinessSnapshot = ({ observationSnapshot = null, decisionSnapshot = null } = {}) => {
      try {
        if (!observationSnapshot) return null;
        return buildDecisionReadinessSnapshot({
          observationSnapshot,
          decisionSnapshot,
          context: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            isDev: import.meta.env.DEV,
          },
        });
      } catch {
        return null;
      }
    };
    // PARTE 4 — CAPABILITY ACTIVATION READINESS: helper local com falha
    // segura. Determina, de forma observacional, quais capabilities poderiam
    // ser ativadas no futuro a partir das decisões de Activation JÁ
    // existentes. Um erro NA CONSTRUÇÃO nunca derruba a engine nem zera os
    // refs já gravados — retorna null e o pipeline legado segue intacto.
    // Nada aqui ativa capability, persiste ou chama serviços.
    const buildConversationCapabilityReadinessSnapshot = ({ observationSnapshot = null, decisionReadinessSnapshot = null } = {}) => {
      try {
        if (!observationSnapshot) return null;
        return buildCapabilityReadinessSnapshot({
          observationSnapshot,
          decisionReadinessSnapshot,
          context: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            isDev: import.meta.env.DEV,
          },
        });
      } catch {
        return null;
      }
    };
    // PARTE 4 — EXECUTION READINESS: helper local com falha segura. Avalia,
    // de forma observacional, se uma FUTURA execução seria segura. Um erro NA
    // CONSTRUÇÃO nunca derruba a engine nem zera os refs já gravados —
    // retorna null e o pipeline legado segue intacto. Nada aqui executa,
    // persiste ou chama serviços.
    const buildConversationExecutionReadinessSnapshot = ({ observationSnapshot = null, decisionReadinessSnapshot = null, capabilityReadinessSnapshot = null } = {}) => {
      try {
        if (!observationSnapshot) return null;
        return buildExecutionReadinessSnapshot({
          observationSnapshot,
          decisionReadinessSnapshot,
          capabilityReadinessSnapshot,
          context: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            isDev: import.meta.env.DEV,
          },
        });
      } catch {
        return null;
      }
    };
    // PARTE 7 — CONVERSATION PLANNER: helper local com falha segura.
    // Determina, de forma observacional, QUAL deve ser o próximo passo lógico
    // da conversa (NEXT_STEP_*), consumindo SOMENTE os snapshots JÁ
    // existentes. Um erro NA CONSTRUÇÃO nunca derruba a engine nem zera os
    // refs já gravados — retorna null e o pipeline legado segue intacto. Nada
    // aqui gera texto, executa, persiste ou chama serviços.
    const buildConversationPlannerSnapshot = ({ observationSnapshot = null, decisionSnapshot = null, decisionReadinessSnapshot = null, capabilityReadinessSnapshot = null, executionReadinessSnapshot = null, applicationResult = null } = {}) => {
      try {
        return buildConversationPlanSnapshot({
          observationSnapshot,
          decisionSnapshot,
          decisionReadinessSnapshot,
          capabilityReadinessSnapshot,
          executionReadinessSnapshot,
          applicationResult,
          context: {
            environment: import.meta.env.DEV ? 'development' : 'production',
            isDev: import.meta.env.DEV,
          },
        });
      } catch {
        return null;
      }
    };
    try {
      const memoryKey = activeId ?? 'default-conversation';
      if (!uniEngineMemoryByConversation.has(memoryKey)) {
        uniEngineMemoryByConversation.set(memoryKey, createOperationalMemory());
      }
      let memoryAdapter = null;
      if (uniEngine.getConfig().memoryEnabled && user?.id && effectiveWorkspace?.id) {
        warmUniMemoryCache(user.id, effectiveWorkspace.id);
        memoryAdapter = getUniMemoryAdapter(user.id, effectiveWorkspace.id);
      }
      // BLOCO 1 — GATEWAY ÚNICO DE ENTRADA: uma execução por turno. O
      // resultado fica apenas no ref dedicado (lastUniEngineGatewayResultRef)
      // e é descartável — nunca altera a resposta nem duplica mensagens.
      if (lastUniEngineGatewayResultRef.current?.turnId !== turn.userMessage.id) {
        const gatewaySource = turn.userMessage.source === 'voice' ? 'voice' : 'text';
        lastUniEngineGatewayResultRef.current = runUniEngineGateway({
          conversationHistory: messages ?? [],
          conversationId: activeId ?? null,
          currentRoute: 'uni-chat',
          financialSnapshot: projectFinancialSnapshot(financialContext.snapshot),
          source: gatewaySource,
          ...(gatewaySource === 'voice'
            ? { transcript: turn.userMessage.text }
            : { text: turn.userMessage.text }),
          turnId: turn.userMessage.id,
          userId: user?.id ?? null,
          workspaceId: effectiveWorkspace?.id ?? null,
          userPreferences: {
            conversationStyle: 'balanced',
            workspaceType: financialWorkspaceType ?? 'personal',
          },
          config: uniEngine.getConfig(),
        });
      }
      const shadow = uniEngine.runShadow({
        message: turn.userMessage,
        session: {
          userId: user?.id ?? null,
          workspaceId: effectiveWorkspace?.id ?? null,
          conversationId: activeId ?? null,
        },
        context: {
          pendingAction: pendingActionRef.current ?? null,
          conversationHistory: messages ?? [],
          financialSnapshot: projectFinancialSnapshot(financialContext.snapshot),
          userPreferences: {
            conversationStyle: 'balanced',
            workspaceType: financialWorkspaceType ?? 'personal',
          },
          currentRoute: 'uni-chat',
        },
        currentPipeline: {
          detectedIntent: classifyIntent(turn.userMessage.text).intent,
          pendingIntent: (pendingActionRef.current ?? financialStateRef.current?.action)?.intent ?? null,
          pendingActive: Boolean(turn.hasPendingConversation),
          resultType: pendingActionRef.current?.status ?? financialStateRef.current?.status ?? 'unknown',
        },
        operationalMemory: uniEngineMemoryByConversation.get(memoryKey),
        memoryAdapter,
      });
      void telemetry.metric('uni_engine.latency_ms', {
        value: Math.max(0, Date.now() - engineStartedAt),
        unit: 'ms',
        source: 'shadow',
        status: 'completed',
      }, {
        userId: user?.id ?? null,
        workspaceId: effectiveWorkspace?.id ?? null,
        conversationId: activeId ?? null,
        messageId: turn.userMessage.id,
        turnId: turn.userMessage.id,
      });
       const convState = financialStateRef.current ?? {};
      const action = pendingActionRef.current ?? convState.action ?? null;
      const isConfirmation = messageOptions?.type === 'confirmation';
      const legacyResult = {
        text: legacyText,
        responseType: isConfirmation
          ? 'confirmation'
          : convState.status === 'needs_clarification'
            ? 'clarification'
            : 'generic',
        issueField: action?.issues?.[0]?.field ?? null,
        transactionType: action?.transactionType ?? null,
        conversationStyle,
        hasConfirmationCard: isConfirmation,
        status: convState.status ?? null,
      };
      const result = runUniEngineIntegration({
        config: uniEngine.getConfig(),
        legacy: legacyResult,
        engineResult: shadow,
        context: {
          environment: import.meta.env.DEV ? 'development' : 'production',
          userId: user?.id ?? null,
          workspaceType: financialWorkspaceType,
          isDev: import.meta.env.DEV,
          telemetryAdapter: null,
        },
      });
      lastEngineIntegrationResultRef.current = result;
      // PARTE 2 — BLOCO 2: consolida as guidances em um snapshot observacional
      // em memória (Question/Clarification/Style/Length) após a integração.
      // O resultado fica apenas em ref local — nunca altera a resposta, nunca
      // persiste, nunca executa.
      lastGuidanceSnapshotRef.current = buildGuidanceSnapshot({
        legacy: legacyResult,
        engineResult: shadow,
        context: {
          environment: import.meta.env.DEV ? 'development' : 'production',
          isDev: import.meta.env.DEV,
        },
      });
      // PARTE 2 — BLOCO 4: consolida o estado observacional completo da
      // conversa DEPOIS que integrationSnapshot e guidanceSnapshot estão
      // disponíveis (result e lastGuidanceSnapshotRef). O resultado fica
      // apenas no ref dedicado — nunca altera a resposta, nunca aplica
      // guidance, nunca persiste, nunca provoca renderização.
      lastObservationSnapshotRef.current = buildConversationObservationSnapshot({
        integrationSnapshot: result,
        guidanceSnapshot: lastGuidanceSnapshotRef.current,
        activationSnapshot: shadow?.activation ?? null,
      });
      // PARTE 3 — DECISION READINESS: consolida, DEPOIS do observation
      // snapshot, a prontidão técnica de uma aplicação FUTURA. O resultado
      // fica apenas no ref dedicado — nada é aplicado, nada altera a
      // resposta, nada persiste, nenhuma exceção escapa (falha segura).
      lastDecisionReadinessSnapshotRef.current = buildConversationReadinessSnapshot({
        observationSnapshot: lastObservationSnapshotRef.current,
        decisionSnapshot: shadow?.decisionLayer ?? null,
      });
      // PARTE 4 — CAPABILITY ACTIVATION READINESS: consolida, DEPOIS do
      // decision readiness, quais capabilities poderiam ser ativadas no
      // futuro (leitura das decisões de Activation JÁ produzidas). O
      // resultado fica apenas no ref dedicado — nenhuma capability é
      // ativada, nada altera a resposta, nada persiste, nenhuma exceção
      // escapa (falha segura).
      lastCapabilityReadinessSnapshotRef.current = buildConversationCapabilityReadinessSnapshot({
        observationSnapshot: lastObservationSnapshotRef.current,
        decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef.current ?? null,
      });
      // PARTE 4 — EXECUTION READINESS: consolida, DEPOIS do capability
      // readiness, se uma FUTURA execução seria segura (leitura dos
      // resultados JÁ produzidos). O resultado fica apenas no ref dedicado —
      // nenhuma execução acontece, nada altera a resposta, nada persiste,
      // nenhuma exceção escapa (falha segura).
      lastExecutionReadinessSnapshotRef.current = buildConversationExecutionReadinessSnapshot({
        observationSnapshot: lastObservationSnapshotRef.current,
        decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef.current ?? null,
        capabilityReadinessSnapshot: lastCapabilityReadinessSnapshotRef.current ?? null,
      });
      // PARTE 5 — APPLICATION (primeira ativação controlada): aplica SOMENTE
      // RESPONSE_STYLE_GUIDANCE e RESPONSE_LENGTH_GUIDANCE, exclusivamente em
      // DEV, com Integration + Activation habilitadas e usuário autorizado.
      // O resultado fica no ref dedicado E é retornado para a seleção segura
      // do texto visível (Bloco 4): finalText só substitui a mensagem quando
      // selectControlledVisibleResponse aprovar (resultado do MESMO turno) —
      // nada é persistido, nada executa, nenhuma exceção escapa (falha
      // segura). O contexto reforça confiança/risco/circuit breaker do
      // decision layer e do execution readiness recém-computados.
      lastApplicationResultRef.current = runControlledGuidanceApplication({
        config: uniEngine.getConfig(),
        legacy: legacyResult,
        engineResult: shadow,
        guidance: lastGuidanceSnapshotRef.current ?? null,
        context: {
          environment: import.meta.env.DEV ? 'development' : 'production',
          userId: user?.id ?? null,
          isDev: import.meta.env.DEV,
          telemetryAdapter: null,
          activationDecisions: shadow?.activation?.decisions ?? [],
          confidence: typeof shadow?.decisionLayer?.confidence === 'number'
            ? shadow.decisionLayer.confidence
            : null,
          risk: typeof shadow?.decisionLayer?.risk === 'string'
            ? shadow.decisionLayer.risk
            : null,
          circuitBreakerOpen: (lastExecutionReadinessSnapshotRef.current?.executionBlockedReasons ?? [])
            .includes('CIRCUIT_BREAKER_OPEN'),
        },
      });
      // PARTE 7 — CONVERSATION PLANNER: consolida, DEPOIS da Application, o
      // plano observacional do próximo passo lógico da conversa (NEXT_STEP_*),
      // consumindo SOMENTE os snapshots JÁ produzidos nesta ordem: Observation
      // → Guidance → Decision → Capability Readiness → Execution Readiness →
      // Application → Conversation Planner. O resultado fica apenas no ref
      // dedicado — nenhum plano é executado, nada gera texto, nada altera a
      // resposta, nada persiste, nenhuma exceção escapa (falha segura).
      lastConversationPlannerSnapshotRef.current = buildConversationPlannerSnapshot({
        observationSnapshot: lastObservationSnapshotRef.current,
        decisionSnapshot: shadow?.decisionLayer ?? null,
        decisionReadinessSnapshot: lastDecisionReadinessSnapshotRef.current ?? null,
        capabilityReadinessSnapshot: lastCapabilityReadinessSnapshotRef.current ?? null,
        executionReadinessSnapshot: lastExecutionReadinessSnapshotRef.current ?? null,
        applicationResult: lastApplicationResultRef.current,
      });
      // FASE 14 — BLOCO 3 (COGNITIVE COMPARISON): comparador observacional
      // legado × Engine. Executado UMA única vez por turno (o guard
      // lastEngineAnalyzedMessageIdRef deduplica a mensagem; o comparador
      // nunca reexecuta camada alguma). Puramente diagnóstico — influenceApplied
      // sempre false, legacyPreserved sempre true, nada persiste, nada altera a
      // resposta entregue. A rota interna da Engine é derivada do plano do
      // MESMO turno; a rota legada é derivada de responseType/pendingActive.
      lastEngineComparisonRef.current = compareLegacyWithEngine({
        turnId: turn.userMessage.id,
        messageId: turn.userMessage.id,
        legacy: {
          ...legacyResult,
          pendingActive: Boolean(turn.hasPendingConversation),
          fallbackUsed: lastUniEngineGatewayResultRef.current?.fallbackUsed === true,
        },
        engine: {
          enabled: Boolean(uniEngine.getConfig().enabled),
          skipped: shadow?.skipped === true,
          intent: shadow?.classification?.primaryIntent ?? null,
          confidence: typeof shadow?.decisionLayer?.confidence === 'number'
            ? shadow.decisionLayer.confidence
            : null,
          fallbackUsed: lastUniEngineGatewayResultRef.current?.fallbackUsed === true,
          errorCode: lastUniEngineGatewayResultRef.current?.diagnostics?.errorCode ?? null,
          epistemicConflicts: Array.isArray(shadow?.epistemicModel?.conflicts)
            ? shadow.epistemicModel.conflicts.length
            : 0,
        },
        plan: lastConversationPlannerSnapshotRef.current,
      });
      // FASE 15 — MOTOR DE RACIOCÍNIO FINANCEIRO (SHADOW-ONLY): executa em
      // paralelo observacional ao pipeline da Fase 14, UMA vez por turno (o
      // guard lastEngineAnalyzedMessageIdRef deduplica a mensagem). Consome
      // SOMENTE dados financeiros já disponíveis no turno e o resultado fica
      // apenas no ref dedicado — influenceApplied sempre false, discarded
      // sempre true; nunca altera resposta visível, pending actions ou
      // confirmações. Qualquer falha → resultado vazio fail-safe.
      try {
        if (uniEngine.getConfig().financialReasoningEnabled) {
          lastFinancialReasoningResultRef.current = runFinancialReasoningShadow({
            config: uniEngine.getConfig(),
            turnId: turn.userMessage.id,
            messageId: turn.userMessage.id,
            input: {
              accounts: accountState.accounts,
              categories: categoryState.categories,
              transactions: transactionsState.transactions,
              goals: goalsState.goals,
              workspaceBalance: balanceState.workspaceBalance,
              accountBalances: balanceState.accountBalances,
            },
            legacy: {
              totalBalance: financialContext.snapshot.totalBalance,
              monthlyIncome: financialContext.snapshot.monthlyIncome,
              monthlyExpense: financialContext.snapshot.monthlyExpense,
              hasData: financialContext.snapshot.hasData,
              riskSignaled: false,
              creditSignaled: false,
              goalSignaled: false,
            },
            referenceDate: financialContext.snapshot.referenceDate,
          });
        }
      } catch {
        // Fase 15 jamais quebra o chat — motor descartável, legado intacto.
        lastFinancialReasoningResultRef.current = null;
      }
      return lastApplicationResultRef.current;
     } catch (error) {
       void telemetry.error('uni_orchestration.failure', {
         errorCode: normalizeTelemetryErrorCode(error?.name, 'UNI_ORCHESTRATION_FAILED'),
         stage: 'shadow_orchestration',
         source: 'uni_engine',
         recoverable: true,
       }, {
         userId: user?.id ?? null,
         workspaceId: effectiveWorkspace?.id ?? null,
         conversationId: activeId ?? null,
         messageId: lastEngineTurnRef.current?.userMessage?.id ?? null,
         turnId: lastEngineTurnRef.current?.userMessage?.id ?? null,
       });
       void telemetry.metric('uni_engine.latency_ms', {
         value: Math.max(0, Date.now() - engineStartedAt),
         unit: 'ms',
         source: 'shadow',
         status: 'error',
       });
       lastUniEngineGatewayResultRef.current = null;
      lastEngineIntegrationResultRef.current = null;
      lastGuidanceSnapshotRef.current = null;
      lastObservationSnapshotRef.current = null;
      lastDecisionReadinessSnapshotRef.current = null;
      lastCapabilityReadinessSnapshotRef.current = null;
      lastExecutionReadinessSnapshotRef.current = null;
      lastApplicationResultRef.current = null;
      lastConversationPlannerSnapshotRef.current = null;
      lastConversationRoutingSnapshotRef.current = null;
      lastCognitiveOrchestratorSnapshotRef.current = null;
      lastContextBridgeResultRef.current = null;
      lastEngineContextBridgeTurnRef.current = null;
      lastEngineComparisonRef.current = null;
      lastCognitivePipelineSnapshotRef.current = null;
      lastFinancialReasoningResultRef.current = null;
      // Shadow Mode jamais quebra o chat — falha silenciosa, legado intacto.
      return null;
    }
  }, [accountState.accounts, activeId, balanceState.accountBalances, balanceState.workspaceBalance, categoryState.categories, conversationStyle, effectiveWorkspace?.id, financialContext.snapshot, financialWorkspaceType, goalsState.goals, messages, transactionsState.transactions, user?.id]);

  // PARTE 1 — INTEGRAÇÃO: camada adaptadora no ponto ÚNICO de saída de
  // resposta (createAssistantResponse). Em Shadow Mode (BLOCO 1) o texto
  // exibido é SEMPRE o texto legado — o resultado da integração fica em ref
  // apenas para diagnóstico/comparação/testes. Nenhuma guidance altera o
  // fluxo real nesta etapa.
  // PARTE 5 — BLOCO 4: a resposta visível só pode ser o finalText da
  // Application quando a seleção segura aprovar. O resultado vem do RETORNO
  // de runEngineObservational (execução do MESMO turno — jamais um ref
  // antigo); sem resultado fresco, o texto legado é mantido intacto.
  // PARTE 8 — CONVERSATION ROUTING (BLOCO ÚNICO): o seletor consulta o
  // Conversation Plan do MESMO turno (recém-reconstruído em
  // runEngineObservational, chamada síncrona anterior neste mesmo call stack)
  // e decide a rota conversacional. A rota legada NUNCA é contornada: o
  // resultado fica SOMENTE no ref dedicado (sem state React, sem render) e
  // apenas a rota ANSWER pode usar o finalText da Application — qualquer
  // outra rota devolve o texto legado intacto. Consulta UMA única vez por
  // mensagem; exceção nunca escapa (rota legada).
  // PARTE 9 — COGNITIVE ORCHESTRATOR (BLOCO ÚNICO): o orquestrador consolida todas
  // as camadas já produzidas (Observation → Guidance → Decision → Capability Readiness
  // → Execution Readiness → Application → Conversation Planner → Conversation Routing)
  // — nenhuma reexecução. O snapshot fica SOMENTE em ref dedicado — sem state React,
  // nenhuma renderização, nunca persistido, nenhuma resposta entregue ao usuário
  // altera (applied false, legacyPreserved true). Consulta UMA única vez por
  // mensagem; exceção nunca escapa (snapshot vazio falho-safe).
  const applyEngineGuidanceToResponse = useCallback((text, options = {}) => {
    const legacyText = typeof text === 'string' ? text : '';
    if (!legacyText) return legacyText;
    const applicationResult = runEngineObservational(legacyText, options);
    if (!applicationResult) return legacyText;

    // FASE 18 — Runtime Financeiro Visível: Gateway único de resposta financeira.
    // Reutiliza applicationResult (já calculado) → runFinancialRuntimeShadow → selectFinancialVisibleResponse.
    // Preserva o texto legado de fallback completo para produção, flags false, canary falhou,
    // intent não permitida, confiança insuficiente, fatos inválidos, narrativa vazia,
    // identity mudou, Pending Action ativa, efeitos colaterais permanecem INTACTOS.
    // Nunca escreve, nunca faz uma segunda chamada ao provedor de LLM, nunca altera voz/autenticação/design/navegação.
    const engineTurn = lastEngineTurnRef.current;
    const runtimeTurnId = lastUniEngineGatewayResultRef.current?.turnId
      ?? engineTurn?.userMessage?.id
      ?? null;
    const runtimeMessageId = engineTurn?.userMessage?.id ?? null;
    const financialRuntimeResult = runFinancialRuntimeShadow({
      config: uniEngine.getConfig(),
      turnId: runtimeTurnId,
      messageId: runtimeMessageId,
      // FASE 19.1: identidade de PRODUÇÃO do resultado -- viaja com o
      // resultado (campos próprios, nunca aninhados em turnId) para que os
      // gates de isolamento da Fase 19 possam detectar resultado stale, de
      // outro workspace ou de outra conversa mais abaixo.
      workspaceId: effectiveWorkspace?.id ?? null,
      conversationId: activeId ?? null,
      userMessage: engineTurn?.userMessage?.text ?? '',
      financialData: financialContext.snapshot,
      referenceDate: getLocalIsoDate(),
    });

    // Build eligibility object from runtime result for the selector
    const intentType = financialRuntimeResult?.intent?.type ?? null;
    const temporalResolved = !!financialRuntimeResult?.temporal?.entity;
    const queryValid = !!financialRuntimeResult?.queryPlan;
    const executionSuccessful = financialRuntimeResult?.executionResult?.status === 'executed';
    const dataAvailable = executionSuccessful && !!financialRuntimeResult?.executionResult?.results;
    const narrativeValid = !!financialRuntimeResult?.narrative?.text?.trim();
    const factualValidation = validateFinancialFacts({
      narrative: financialRuntimeResult?.narrative,
      executionResult: financialRuntimeResult?.executionResult,
      runtimeResult: financialRuntimeResult,
      snapshot: financialContext.snapshot,
    });
    const factsValidated = factualValidation.valid === true;
    const safetyValidation = validateFinancialRuntimeSafety(financialRuntimeResult);
    const safetyApproved = safetyValidation.approved === true;
    void recordFinancialShadowValidation({
      runtimeResult: financialRuntimeResult,
      factualValidation,
      safetyValidation,
      identity: {
        userId: user?.id ?? null,
        workspaceId: effectiveWorkspace?.id ?? null,
        conversationId: activeId ?? null,
        messageId: runtimeMessageId,
        turnId: runtimeTurnId,
      },
    });
    const intentSupported = !!intentType && financialRuntimeResult?.intent?.type !== 'unknown';
    const runtimeConfidence = financialRuntimeResult?.confidence ?? financialRuntimeResult?.narrative?.confidence ?? 0;
    const eligible = intentSupported && temporalResolved && queryValid
      && executionSuccessful && dataAvailable && factsValidated
      && narrativeValid && safetyApproved;

    const eligibility = {
      eligible,
      influenceAllowed: eligible,
      fallbackRequired: !eligible,
      confidence: runtimeConfidence,
      intentSupported,
      temporalResolved,
      queryValid,
      executionSuccessful,
      dataAvailable,
      factsValidated,
      narrativeValid,
      safetyApproved,
      intentType,
      reasonCodes: [
        ...(factsValidated ? [] : factualValidation.reasonCodes),
        ...(safetyApproved ? [] : ['SAFETY_REJECTED']),
      ],
    };

    // Identidade completa do turno ativo: resposta financeira de outro
    // usuário/workspace/conversa/mensagem nunca pode atravessar este gate.
    const activeIdentity = runtimeTurnId ? {
      userId: user?.id ?? null,
      workspaceId: effectiveWorkspace?.id ?? null,
      conversationId: activeId ?? null,
      turnId: runtimeTurnId,
      messageId: runtimeMessageId,
    } : null;

    // Pending action from ref
    const pendingAction = pendingActionRef.current ?? null;

    const financialSelection = selectFinancialVisibleResponse({
      legacyText,
      runtimeResult: financialRuntimeResult,
      eligibility,
      factualValidation,
      confidence: runtimeConfidence,
      config: uniEngine.getConfig(),
      activeIdentity,
      pendingAction,
      narrative: financialRuntimeResult.narrative,
    });

    // FASE 19 — Rollout Control Determínstico: único ponto de decisão entre
    // o texto legado e o texto visível JÁ escolhido pela Fase 18 acima.
    // Reutiliza legacyText, financialRuntimeResult e financialSelection tal
    // como calculados -- nunca chama runFinancialRuntimeShadow de novo,
    // nunca gera outra narrativa, nunca publica mais de uma vez (o valor
    // final continua fluindo para o mesmo e único selectedFinancialText
    // usado mais abaixo). Identidade/config/Pending Action/confirmação são
    // os MESMOS já resolvidos para a Fase 18 -- nenhuma nova leitura de
    // estado é criada aqui.
    const rolloutSourceConfig = uniEngine.getConfig();
    const rolloutConfig = {
      enabled: rolloutSourceConfig.financialRolloutEnabled,
      shadowMode: rolloutSourceConfig.financialRolloutShadowMode,
      visibleEnabled: rolloutSourceConfig.financialRolloutVisibleEnabled,
      productionEnabled: rolloutSourceConfig.financialRolloutProductionEnabled,
      canaryEnabled: rolloutSourceConfig.financialRolloutCanaryEnabled,
      canaryPercentage: rolloutSourceConfig.financialRolloutCanaryPercentage,
      minimumConfidence: rolloutSourceConfig.financialRolloutMinimumConfidence,
      telemetryEnabled: rolloutSourceConfig.financialRolloutTelemetryEnabled,
      emergencyRollback: rolloutSourceConfig.financialRolloutEmergencyRollback,
      requireEligibility: rolloutSourceConfig.financialRolloutRequireEligibility,
      requireFactualValidation: rolloutSourceConfig.financialRolloutRequireFactualValidation,
      requireIdentityMatch: rolloutSourceConfig.financialRolloutRequireIdentityMatch,
      requireConversationMatch: rolloutSourceConfig.financialRolloutRequireConversationMatch,
      requireWorkspaceMatch: rolloutSourceConfig.financialRolloutRequireWorkspaceMatch,
      requireTurnMatch: rolloutSourceConfig.financialRolloutRequireTurnMatch,
      requireMessageMatch: rolloutSourceConfig.financialRolloutRequireMessageMatch,
    };
    const rolloutIdentity = {
      turnId: activeIdentity?.turnId ?? null,
      userId: activeIdentity?.userId ?? null,
      workspaceId: activeIdentity?.workspaceId ?? null,
      conversationId: activeIdentity?.conversationId ?? null,
      messageId: activeIdentity?.messageId ?? null,
      pendingAction,
      confirmationState: options?.type === 'confirmation' ? { pending: true } : null,
    };
    const canaryAssignment = assignFinancialRolloutBucket(rolloutIdentity, rolloutConfig);
    const rolloutDecision = runFinancialRolloutIntegration({
      legacyText,
      runtimeResult: financialRuntimeResult,
      financialSelection,
      config: rolloutConfig,
      identity: rolloutIdentity,
      eligible: eligibility?.eligible === true,
      canaryAssignment,
      environment: import.meta.env.DEV ? 'development' : 'production',
    });

    const selectedFinancialText = rolloutDecision.selectedSource === 'financial_runtime'
      ? rolloutDecision.selectedText
      : legacyText;

    const plannerSnapshot = lastConversationPlannerSnapshotRef.current;
    const routingSnapshot = selectControlledConversationRoute({
      config: uniEngine.getConfig(),
      environment: import.meta.env.DEV ? 'development' : 'production',
      authorized: Boolean(
        user?.id
        && (uniEngine.getConfig().activationTestUserIds ?? []).includes(user.id),
      ),
      conversationPlan: plannerSnapshot,
      sameTurn: plannerSnapshot !== null,
      legacyText,
      legacyResponse: { text: legacyText },
      applicationResult,
      isDev: import.meta.env.DEV,
    });
    lastConversationRoutingSnapshotRef.current = routingSnapshot;
    const orchestratorSnapshot = buildCognitiveOrchestratorSnapshot({
      config: uniEngine.getConfig(),
      environment: import.meta.env.DEV ? 'development' : 'production',
      authorized: Boolean(
        user?.id
        && (uniEngine.getConfig().activationTestUserIds ?? []).includes(user.id),
      ),
      isDev: import.meta.env.DEV,
      observation: { mode: 'observational', legacyPreserved: true, serializable: true },
      guidance: { mode: 'observational', legacyPreserved: true, serializable: true },
      decision: { mode: 'observational', legacyPreserved: true, serializable: true },
      capabilityReadiness: { mode: 'observational', legacyPreserved: true, serializable: true },
      executionReadiness: { mode: 'observational', legacyPreserved: true, serializable: true },
      application: applicationResult,
      conversationPlan: plannerSnapshot,
      conversationRoute: routingSnapshot,
    });
    lastCognitiveOrchestratorSnapshotRef.current = orchestratorSnapshot;
    // FASE 11 — BLOCO 2 (CONTEXT BRIDGE): o contexto técnico do MESMO turno
    // (Gateway + Integration + Orchestrator + Rollout + Readiness + resposta
    // legada + Pending Action + confirmação) é consumido UMA única vez por
    // turno aqui, no ponto único de construção da resposta. A ponte é uma
    // função pura de snapshots JÁ produzidos — nunca reexecuta camada alguma.
    // Se qualquer gate falhar, influenceAllowed é false e o texto legado é
    // preservado integralmente. Nada cria state React, nada persiste e nada
    // dispara TTS.
    const bridgeTurnId = lastEngineTurnRef.current?.userMessageId ?? null;
    let bridgeContext = lastContextBridgeResultRef.current;
    if (bridgeContext === null || lastEngineContextBridgeTurnRef.current !== bridgeTurnId) {
      bridgeContext = buildEngineResponseContext({
        gatewayResult: lastUniEngineGatewayResultRef.current,
        integrationResult: lastEngineIntegrationResultRef.current,
        cognitiveSnapshot: orchestratorSnapshot,
        rolloutSnapshot: lastUniEngineGatewayResultRef.current?.rolloutSnapshot ?? null,
        operationalReadiness: lastUniEngineGatewayResultRef.current?.operationalReadiness ?? null,
        legacyResponse: { text: legacyText },
        pendingAction: pendingActionRef.current ?? null,
        confirmationState: options?.type === 'confirmation'
          ? { pending: true }
          : null,
        sameTurn: lastUniEngineGatewayResultRef.current?.turnId === bridgeTurnId,
        requestedInfluences: [
          'RESPONSE_STYLE_GUIDANCE',
          'RESPONSE_LENGTH_GUIDANCE',
          'QUESTION_GUIDANCE',
          'CLARIFICATION_GUIDANCE',
          'CONVERSATION_ROUTING',
        ],
        config: uniEngine.getConfig(),
        environment: import.meta.env.DEV ? 'development' : 'production',
        userId: user?.id ?? null,
        isDev: import.meta.env.DEV,
        selectedRoute: routingSnapshot.selectedRoute ?? null,
        circuitBreakerOpen: (lastExecutionReadinessSnapshotRef.current?.executionBlockedReasons ?? [])
          .includes('CIRCUIT_BREAKER_OPEN'),
        context: {
          confidence: typeof plannerSnapshot?.confidence === 'number'
            ? plannerSnapshot.confidence
            : null,
          risk: plannerSnapshot?.risk ?? null,
        },
      });
      lastContextBridgeResultRef.current = bridgeContext;
      lastEngineContextBridgeTurnRef.current = bridgeTurnId;
    }
    // FASE 14 — BLOCO 2 (COGNITIVE PIPELINE) + BLOCO 4 (TELEMETRIA): snapshot
    // cognitivo consolidado do turno, agregando os 12 componentes já
    // produzidos (gateway → observation → epistemic → readiness → plan →
    // route → orchestrator → context bridge → comparison → divergence
    // diagnostics). Consome SOMENTE resultados do MESMO turno — nunca
    // reexecuta camada alguma. Guarda apenas em ref dedicado e registra a
    // telemetria técnica em memória (sanitizada, buffer limitado) SOMENTE
    // quando config.telemetryEnabled. Falha aqui nunca escapa e nunca altera
    // a resposta (legado preservado).
    const fase14TurnId = lastEngineTurnRef.current?.userMessageId ?? null;
    if (
      fase14TurnId
      && lastCognitivePipelineSnapshotRef.current?.turnId !== fase14TurnId
      && lastEngineComparisonRef.current?.turnId === fase14TurnId
    ) {
      try {
        const engineConfig = uniEngine.getConfig();
        const comparison = lastEngineComparisonRef.current ?? null;
        const divergences = comparison?.divergenceType
          ? [{
              type: comparison.divergenceType,
              severity: comparison.divergenceSeverity ?? 'medium',
              reason: (comparison.reasonCodes ?? []).find((code) => code !== 'NO_INFLUENCE') ?? null,
            }]
          : [];
        const pipelineSnapshot = buildCognitivePipelineSnapshot({
          turnId: fase14TurnId,
          messageId: lastEngineTurnRef.current?.userMessage?.id ?? null,
          config: engineConfig,
          gateway: lastUniEngineGatewayResultRef.current ?? null,
          observation: lastObservationSnapshotRef.current ?? null,
          epistemic: engineConfig.epistemicEnabled
            ? { enabled: true }
            : null,
          decisionReadiness: lastDecisionReadinessSnapshotRef.current ?? null,
          capabilityReadiness: lastCapabilityReadinessSnapshotRef.current ?? null,
          executionReadiness: lastExecutionReadinessSnapshotRef.current ?? null,
          conversationPlan: plannerSnapshot,
          conversationRoute: routingSnapshot,
          orchestrator: orchestratorSnapshot,
          contextBridge: bridgeContext ?? null,
          comparison,
          divergences,
        });
        lastCognitivePipelineSnapshotRef.current = pipelineSnapshot;
        if (engineConfig.telemetryEnabled) {
          recordCognitiveTelemetry({
            turnId: pipelineSnapshot.turnId,
            messageId: pipelineSnapshot.messageId,
            agreementStatus: comparison?.agreementStatus ?? null,
            agreement: comparison?.agreement ?? false,
            divergenceType: comparison?.divergenceType ?? null,
            divergenceSeverity: comparison?.divergenceSeverity ?? null,
            reasonCodes: comparison?.reasonCodes ?? [],
            engineSkipped: comparison?.engineSkipped ?? false,
            engineErrorCode: comparison?.engineErrorCode ?? null,
            fallbackUsed: lastUniEngineGatewayResultRef.current?.fallbackUsed === true,
            rollbackStatus: pipelineSnapshot.rollbackStatus,
            flags: engineConfig,
            layers: pipelineSnapshot,
            safety: lastUniEngineGatewayResultRef.current?.safety ?? null,
            latencyMs: pipelineSnapshot.latencyMs,
            timestamp: pipelineSnapshot.timestamp,
          });
        }
      } catch {
        // Fase 14 nunca quebra o chat — snapshot/telemetria descartáveis.
        lastCognitivePipelineSnapshotRef.current = createEmptyCognitivePipelineSnapshot({
          turnId: fase14TurnId,
          messageId: lastEngineTurnRef.current?.userMessage?.id ?? null,
        });
      }
    }
    if (bridgeContext.influenceAllowed === false) return selectedFinancialText;
    if (routingSnapshot.selectedRoute === 'ROUTE_ANSWER') {
      return selectControlledVisibleResponse({
        legacyText: selectedFinancialText,
        applicationResult,
        config: uniEngine.getConfig(),
        environment: import.meta.env.DEV ? 'development' : 'production',
        authorized: Boolean(
          user?.id
          && (uniEngine.getConfig().activationTestUserIds ?? []).includes(user.id),
        ),
        executionReady: (lastExecutionReadinessSnapshotRef.current?.executionBlockedReasons ?? [])
          .includes('CIRCUIT_BREAKER_OPEN') !== true,
      });
    }
    return selectedFinancialText;
  }, [activeId, effectiveWorkspace?.id, financialContext.snapshot, runEngineObservational, user?.id]);

  // A orientação entra no ÚNICO ponto de construção de mensagem do pipeline
  // oficial (buildMessage) — nenhum caminho de resposta fala por fora.
  const buildGuidedUniMessage = useCallback((text, messageOptions = {}) => {
    const guidedText = applyEngineGuidanceToResponse(text, messageOptions);
    const publicText = enforcePublicFinancialResponsePolicy({
      text: guidedText,
      requestText: lastEngineTurnRef.current?.userMessage?.text ?? '',
      snapshot: financialContext.snapshot,
    });
    return buildUniMessage(publicText, messageOptions);
  }, [applyEngineGuidanceToResponse, financialContext.snapshot]);

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
    ultimoConfirmadoRef.current = null;
    // FASE 14 — isolamento de conversa: zera os resultados observacionais do
    // pipeline cognitivo e limpa a telemetria técnica em memória ao trocar de
    // conversa. Nada persiste, nada influencia a nova conversa.
    lastUniEngineGatewayResultRef.current = null;
    lastEngineIntegrationResultRef.current = null;
    lastGuidanceSnapshotRef.current = null;
    lastObservationSnapshotRef.current = null;
    lastDecisionReadinessSnapshotRef.current = null;
    lastCapabilityReadinessSnapshotRef.current = null;
    lastExecutionReadinessSnapshotRef.current = null;
    lastApplicationResultRef.current = null;
    lastConversationPlannerSnapshotRef.current = null;
    lastConversationRoutingSnapshotRef.current = null;
    lastCognitiveOrchestratorSnapshotRef.current = null;
    lastContextBridgeResultRef.current = null;
    lastEngineContextBridgeTurnRef.current = null;
    lastEngineComparisonRef.current = null;
    lastCognitivePipelineSnapshotRef.current = null;
    lastFinancialReasoningResultRef.current = null;
    // FASE 20.1/20.3 — Tool Calling: zera a deduplicação por mensagem ao
    // trocar de conversa/workspace. Estado sempre por instância (ref) —
    // runToolCallingIntegration não guarda nenhum estado de módulo.
    lastToolCallingProcessedMessageIdRef.current = null;
    lastUniToolCallingResultRef.current = null;
    // Sprint 2 — troca de conversa nunca carrega memória conversacional da
    // conversa anterior (nunca é memória de longo prazo).
    conversationalMemoryRef.current.reset();
    resetCognitiveTelemetry();
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
    // FASE 20.1 — Tool Calling: fonte bruta de tool calls vinda da camada
    // LLM existente (a Edge Function). Nenhuma flag e default: fica null e
    // a integração não dispara nada.
    let rawToolCalls = null;
    let llmDailyLimitReached = false;
    // FASE 21 — zera o resultado do turno anterior no início de CADA turno
    // (antes só era zerado na troca de conversa): sem isso, um turno sem
    // tool_calls reaproveitaria por engano o responseText de um turno
    // anterior na mesma conversa.
    lastUniToolCallingResultRef.current = null;
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
        // FASE 20.1 — fonte bruta de tool calls: leitura defensiva do retorno
        // da camada LLM existente (a Edge Function), SEM criar segunda
        // chamada. Hoje o contrato é { text, usage } — sem tool_calls a
        // integração permanece inerte (nenhum dispatcher é disparado).
        rawToolCalls = Array.isArray(outcome?.tool_calls) && outcome.tool_calls.length > 0
          ? outcome.tool_calls
          : null;
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
    // FASE 20.3 — Tool Calling: integra as tool calls brutas retornadas pela
    // camada LLM existente à infraestrutura da Fase 20, conectada de forma
    // real (registry + dispatcher de leitura financeira, nunca null).
    // Desligada por padrão via toolCallingEnabled; mesmo ligada, só executa
    // fora de shadow mode, com opt-in de execução separado e identidade
    // completa, e apenas quando não há Pending Action em curso — gates adicionais, redundantes com os
    // gates internos do dispatcher/selection, propositalmente conservadores
    // para manter Tool Calling desligado por padrão em produção. Execução
    // única por mensagem via lastToolCallingProcessedMessageIdRef (ref por
    // instância — nenhum estado de módulo); qualquer falha é capturada e
    // nunca altera a resposta publicada (createAssistantResponse continua o
    // ÚNICO ponto de saída, chamado exatamente uma vez logo abaixo).
    if (rawToolCalls) {
      const toolCallingConfig = uniEngine.getConfig();
      if (toolCallingConfig.toolCallingEnabled) {
        const toolCallingTurnId = lastEngineTurnRef.current?.userMessageId ?? null;
        const toolCallingMessageId = lastEngineTurnRef.current?.userMessage?.id ?? null;
        const alreadyProcessed = lastToolCallingProcessedMessageIdRef.current === toolCallingMessageId;
        if (!alreadyProcessed) {
          lastToolCallingProcessedMessageIdRef.current = toolCallingMessageId;
          try {
            const { registry, dispatcher } = createFinancialDataToolsContext({
              snapshot: financialContext.snapshot,
              config: { enabled: true },
              telemetryEnabled: toolCallingConfig.toolCallingTelemetryEnabled === true,
              allowWrites: false,
            });
            const pendingToolAction = pendingActionRef.current;
            const toolCallingIdentity = {
              userId: user?.id ?? null,
              workspaceId: effectiveWorkspace?.id ?? null,
              conversationId: activeId ?? null,
              turnId: toolCallingTurnId,
              messageId: toolCallingMessageId,
            };
            const authorization = buildToolCallingAuthorization({
              config: toolCallingConfig,
              identity: toolCallingIdentity,
              pendingAction: Boolean(pendingToolAction),
              confirmationPending: pendingToolAction?.status === 'ready',
            });
            void recordToolCallingProposal({
              identity: toolCallingIdentity,
              count: rawToolCalls.length,
              authorization,
            });
            lastUniToolCallingResultRef.current = await runToolCallingIntegration({
              rawToolCalls,
              dispatcher,
              registry,
              config: toolCallingConfig,
              authorization,
              context: {
                turnId: toolCallingTurnId,
                messageId: toolCallingMessageId,
                conversationId: activeId ?? null,
                workspaceId: effectiveWorkspace?.id ?? null,
                environment: import.meta.env.DEV ? 'development' : 'production',
              },
              conversationStyle,
            });
            void recordToolCallingResult({
              identity: toolCallingIdentity,
              result: lastUniToolCallingResultRef.current,
            });
          } catch {
            lastUniToolCallingResultRef.current = null;
            void recordToolCallingResult({
              identity: {
                userId: user?.id ?? null,
                workspaceId: effectiveWorkspace?.id ?? null,
                conversationId: activeId ?? null,
                turnId: toolCallingTurnId,
                messageId: toolCallingMessageId,
              },
              errorCode: 'TOOL_CALLING_INTEGRATION_ERROR',
            });
          }
        }
      }
    }
    // FASE 22 — Resposta Inteligente Integrada: quando o turno produziu um
    // responseText (narrativa do Tool Calling, Fase 21), ele é COMBINADO
    // com o texto do LLM em vez de substituí-lo — preserva a voz/contexto
    // conversacional que a Uni já tinha construído (llmText) e evita
    // redundância quando os dois dizem a mesma coisa (composeFinalResponseText
    // é uma função pura, sem chamar o LLM nem o Tool Calling de novo). Sem
    // ToolResult válido (Tool Calling desligado, sem tool_calls, erro,
    // timeout, ferramenta desconhecida etc.), o comportamento legado
    // permanece exatamente igual: composeFinalResponseText devolve o
    // llmText inalterado. createAssistantResponse continua sendo o único
    // ponto de publicação, chamado exatamente uma vez.
    const toolCallingResponseText = lastUniToolCallingResultRef.current?.responseText ?? null;
    const finalResponseText = composeFinalResponseText({
      llmText,
      toolResponseText: toolCallingResponseText,
      conversationStyle,
    });
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
      categories: categoryState.categories,
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
          availableCategories: categoryState.categories,
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
      const pendingConfirmationId = pendingAction ? findPendingConfirmationMessageId() : null;
      if (resolvedInput.kind === 'invalid' && pendingConfirmationId && uniInterpretClient.isSupported()) {
        void correctPendingWithAi(text, pendingAction, pendingConfirmationId);
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
        // Sprint 3 (Interpretação Semântica): último passo determinístico
        // antes do fallback conversacional genérico -- só tentado quando a
        // flag está ligada (isSupported() já reflete isso); com a flag
        // desligada, attemptSemanticFinancialQuery resolve false
        // imediatamente e o comportamento é idêntico ao de antes desta
        // Sprint (vai direto para handleUnresolvedMessage).
        void (async () => {
          const handled = await attemptSemanticFinancialQuery(text, historySnapshot);
          if (handled) return;
          void handleUnresolvedMessage(text, historySnapshot);
        })();
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
    const { functionalText, agendaIdentity, agendaRequest, messageSource, historySnapshot } = turn;
    setIsTyping(true);
    void agendaConversationRef.current.handle({
      text: functionalText,
      identity: agendaIdentity,
      referenceDate: getLocalIsoDate(),
      origin: messageSource,
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
    const periodo = periodoDaConsulta(consulta, dataReferencia);
    try {
      const { data, error } = await listTransactionsForPeriod(effectiveWorkspace.id, {
        dateFrom: periodo.inicio,
        dateTo: periodo.fim,
        status: 'completed',
      });
      if (error) return null;
      return responderConsulta({ consulta, transacoes: data, dataReferencia });
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
        // Sem deduplicar: pedida duas vezes por voz, a resposta é falada de novo.
        createAssistantResponse(TEXTO_META_SEM_CRIACAO, { deduplicateNarration: false });
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
        runAgendaTurn(agendaTurn);
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


  // BLOCO 1 — GATEWAY ÚNICO DE ENTRADA: voz (onFinalTranscript) e texto (onSend) convergem para o mesmo sendText, ponto único que alimenta o runUniEngineGateway em cada turno.
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
    // PARTE 2 — BLOCO 1 (SHADOW MODE): a Uni Engine observa a interação,
    // mas SOMENTE depois que o resultado legado existir — a execução do
    // motor acontece no ponto único de saída de resposta
    // (applyEngineGuidanceToResponse/runEngineObservational), nunca aqui.
    // Este bloco apenas guarda o turno do usuário (mensagem + flags) para a
    // engine analisar no momento certo e zera os resultados anteriores da
    // engine para o novo turno. A engine permanece descartável e nunca
    // influencia a resposta entregue ao usuário.
    lastEngineTurnRef.current = {
      userMessageId: userMsg.id,
      userMessage: {
        id: userMsg.id,
        text,
        source: messageSource,
        createdAt: new Date().toISOString(),
      },
      hasPendingConversation,
    };
    lastUniEngineGatewayResultRef.current = null;
    lastEngineIntegrationResultRef.current = null;
    lastGuidanceSnapshotRef.current = null;
    lastObservationSnapshotRef.current = null;
    lastDecisionReadinessSnapshotRef.current = null;
    lastCapabilityReadinessSnapshotRef.current = null;
    lastExecutionReadinessSnapshotRef.current = null;
    lastApplicationResultRef.current = null;
    lastConversationPlannerSnapshotRef.current = null;
    lastConversationRoutingSnapshotRef.current = null;
    lastCognitiveOrchestratorSnapshotRef.current = null;
    lastContextBridgeResultRef.current = null;
    lastEngineContextBridgeTurnRef.current = null;
    lastEngineComparisonRef.current = null;
    lastCognitivePipelineSnapshotRef.current = null;
    lastFinancialReasoningResultRef.current = null;
    if (isRetiredBalanceRequest || isPublicFinancialSummary) {
      if (hasPendingConversation) abandonStalePendingState();
      syncMessageToSupabase(userMsg);
      responderResumoSemSaldo(functionalText, isRetiredBalanceRequest);
      return;
    }
    // FASE 20.1 — Tool Calling: novo turno zera a deduplicação local (o
    // estado do módulo de integração é atualizado por messageId conforme o
    // fluxo avança, nunca no início do turno).
    lastToolCallingProcessedMessageIdRef.current = null;
    // Com algo pendente, o modelo não é consultado: o cumprimento é
    // respondido aqui para não virar resposta do rascunho ou da agenda.
    if (declaredIntent === 'conversation_common' && (!roteiaPeloModelo || hasPendingConversation)) {
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
      if (tentarPedidoDeEdicao(functionalText, userMsg, declaredIntent, turnToken)) return;
    } else if (edicaoPendenteRef.current) {
      encerrarEdicao('expired');
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
      ultimoConfirmadoRef.current = null;
      conversationalMemoryRef.current.reset();
      saveHistory(nextList);
      saveActiveId(conv.id);
    } else {
      setConversations(withRemoval);
      saveHistory(withRemoval);
    }
  }

  async function handleConfirmAction(id) {
    if (confirmingRef.current) return;
    if (edicaoPendenteRef.current?.messageId === id) {
      if (edicaoAtiva()) {
        await confirmarEdicao(id);
      } else {
        encerrarEdicao('expired');
        reportConfirmationError(id, TEXTO_EDICAO_VENCIDA);
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
    if (edicaoPendenteRef.current?.messageId === id) {
      cancelarEdicao(id);
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
          categories: categoryState.categories,
        })
      : null),
    [pendingAction, accountState.accounts, categoryState.categories],
  );
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
        editForm={pendingEditForm}
        onSaveEditAction={handleSaveEditAction}
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
