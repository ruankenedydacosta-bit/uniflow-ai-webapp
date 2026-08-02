// Shadow Mode do Uni Engine (Fase 1 + Fase 2 — Integração Cognitiva Assistida
// + Fase 3 — Memória Inteligente Persistente).
//
// runUniEngineShadow(input, options):
//   1. validar entrada;
//   2. normalizar mensagem;
//   3. analisar contexto;
//   4. classificar cognitivamente;
//   5. construir estado epistêmico;
//   6. resolver referências implícitas (Fase 2);
//   7. construir contexto cognitivo (Fase 2);
//   8. criar plano (Fase 1) e expandir com predições cognitivas (Fase 2);
//   9. validar plano;
//   10. comparar com o pipeline atual;
//   11. diagnosticar divergências (Fase 2 — registra, nunca altera);
//   12. calcular métricas de concordância (Fase 2);
//   13. montar sugestões estruturadas (Fase 2 — apenas disponibilizadas);
//   14. atualizar memória operacional injetada (Fase 2);
//   15. recuperar memórias persistentes + avaliar candidatos (Fase 3 — Shadow);
//   16. gerar telemetria (redigida);
//   17. retornar resultado SOMENTE para diagnóstico — sempre descartável.
//
// Garantias:
//   - nunca lança erro que quebre o chat (try/catch interno);
//   - sem LLM, sem executor, sem voz; rede APENAS via adapter de memória em
//     modo fire-and-forget (nunca bloqueia o envio);
//   - síncrono e leve (meta < 20 ms para entradas comuns);
//   - com enabled=false o motor nem roda;
//   - o pipeline atual continua intocado — o motor NUNCA executa, NUNCA
//     confirma, NUNCA responde; apenas produz inteligência.
//   - Fase 3: `persistentMemory.appliedToDecision` permanece SEMPRE falso.
import {
  createCorrelationId,
  createEmptyUniEngineResult,
  UNI_ENGINE_VERSION,
  validateUniEngineInput,
} from './uniEngineContracts.js';
import {
  UNI_ENGINE_DEFAULT_CONFIG,
  isUniEngineShadowEnabled,
} from './uniEngineConfig.js';
import { normalizeUserMessage } from './normalizeUserMessage.js';
import { analyzeConversationContext } from './analyzeConversationContext.js';
import { classifyCognitiveIntent } from './classifyCognitiveIntent.js';
import { buildEpistemicState } from './buildEpistemicState.js';
import { createCognitivePlan } from './createCognitivePlan.js';
import { validateCognitivePlan } from './validateCognitivePlan.js';
import { compareShadowDecision } from './compareShadowDecision.js';
import {
  buildUniEngineTelemetry,
  emitUniEngineTelemetry,
} from './telemetry/uniEngineTelemetry.js';
// Fase 2 — Integração Cognitiva Assistida (camada de inteligência sobre o
// mesmo ponto de entrada; nada aqui executa ou altera o pipeline).
import {
  buildMemoryPatch,
  readOperationalMemory,
  updateOperationalMemory,
} from './operationalMemory.js';
import { resolveImplicitReference } from './resolveImplicitReference.js';
import { buildCognitiveContext } from './buildCognitiveContext.js';
import { expandCognitivePlan } from './expandCognitivePlan.js';
import { buildEngineSuggestions } from './buildEngineSuggestions.js';
import { buildDivergenceDiagnostics } from './buildDivergenceDiagnostics.js';
import { computeAgreementMetrics } from './computeAgreementMetrics.js';
// Fase 3 — Memória Inteligente Persistente (somente Shadow; nunca executa).
import { resolveMemoryConflict } from './memory/resolveMemoryConflict.js';
import { MEMORY_POLICY } from './memory/memoryPolicy.js';
// Fase 4 — Modelo Epistêmico completo (somente Shadow; nunca executa).
import { createEpistemicModelSection } from './epistemic/epistemicContracts.js';
import {
  buildPlanEpistemicSection,
  runEpistemicVerifier,
} from './epistemic/runEpistemicVerifier.js';
import {
  buildEpistemicTelemetry,
  emitEpistemicTelemetry,
} from './epistemic/telemetry/epistemicTelemetry.js';
// Fase 5 — Camada de Decisão Cognitiva (somente Shadow; nunca executa).
import { runDecisionLayer } from './decision/runDecisionLayer.js';
// Fase 6 — Planning Engine (somente Shadow; nunca executa planos).
import { runPlanningEngine } from './planning/runPlanningEngine.js';
// Fase 7 — Goal Engine (somente Shadow; nunca persiste objetivos).
import { runGoalEngine } from './goals/runGoalEngine.js';
// Fase 8 — Reflection & Learning Engine (somente Shadow; nunca aplica
// candidatos, nunca altera resposta/execução/memória/voz/UI).
import { runReflectionEngine } from './reflection/runReflectionEngine.js';
import { runActivationEngine } from './activation/runActivationEngine.js';
import { ACTIVATION_POLICY, describeConfidence } from './activation/activationPolicy.js';

function nowMillis() {
  if (typeof performance?.now === 'function') return performance.now();
  return Date.now();
}

function safeCorrelationId(options) {
  return typeof options?.correlationId === 'string' && options.correlationId.trim()
    ? options.correlationId
    : createCorrelationId();
}

function buildDisabledResult({ correlationId, latencyMs }) {
  return {
    engineVersion: UNI_ENGINE_VERSION,
    correlationId,
    enabled: false,
    skipped: true,
    normalizedMessage: null,
    classification: null,
    epistemicState: null,
    plan: null,
    validation: null,
    shadowComparison: null,
    cognitiveContext: null,
    referenceResolution: null,
    suggestions: null,
    agreementMetrics: null,
    divergenceDiagnostics: [],
    operationalMemory: null,
    persistentMemory: null,
    epistemicModel: null,
    diagnostics: {
      rulesUsed: [],
      ambiguities: [],
      fallbackUsed: false,
      errorCode: 'ENGINE_DISABLED',
      latencyMs,
      divergenceCount: 0,
    },
    decisionLayer: null,
    planning: null,
    goals: null,
    reflection: null,
    activation: null,
  };
}

function buildSafeErrorResult({ correlationId, error, latencyMs, isDev }) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] shadow error: ${error?.code ?? 'UNKNOWN_ERROR'}`);
  }
  return {
    ...createEmptyUniEngineResult({ correlationId }),
    diagnostics: {
      ...createEmptyUniEngineResult({ correlationId }).diagnostics,
      errorCode: error?.code ?? 'UNKNOWN_ERROR',
      fallbackUsed: true,
      latencyMs,
    },
  };
}

// Fase 3 — Seção persistentMemory do Shadow Mode.
//
// Regra absoluta: `appliedToDecision` permanece SEMPRE falso nesta fase.
// A leitura usa o adapter síncrono (cache-first, < 10 ms); a escrita captura
// candidatos de forma fire-and-forget — o motor nunca espera rede, nunca
// chama executor, voz ou LLM. Qualquer falha cai apenas em diagnostics e
// telemetria redigida — o pipeline atual permanece oficial e intocado.
function buildPersistentMemorySection({ config, memoryAdapter, input, normalized, classification, epistemicState, cognitiveContext, snapshot }) {
  const section = {
    enabled: true,
    retrieved: [],
    candidates: [],
    conflicts: [],
    appliedToDecision: false,
    diagnostics: {
      readEnabled: Boolean(config.memoryReadEnabled),
      writeEnabled: Boolean(config.memoryWriteEnabled),
      errorCode: null,
    },
  };

  try {
    if (config.memoryReadEnabled && typeof memoryAdapter?.retrieveRelevantSync === 'function') {
      const retrieval = memoryAdapter.retrieveRelevantSync({
        message: normalized?.text ?? input.message?.text ?? null,
        cognitiveContext,
        limit: MEMORY_POLICY.maxRetrievedMemories,
      });
      if (retrieval && !retrieval.error && retrieval.data?.memories) {
        section.retrieved = retrieval.data.memories;
      }
    }

    if (config.memoryWriteEnabled && typeof memoryAdapter?.evaluateCandidatesSync === 'function') {
      const evaluation = memoryAdapter.evaluateCandidatesSync({
        message: input.message ?? null,
        classification,
        epistemicState,
        cognitiveContext,
        snapshot,
        operationalMemory: input.memory ?? null,
      });
      const candidates = Array.isArray(evaluation?.candidates) ? evaluation.candidates : [];
      section.candidates = candidates.map((candidate) => ({
        memoryType: candidate.memoryType,
        subjectKey: candidate.subjectKey,
        value: candidate.value,
        confidence: Number(candidate.confidence ?? 0).toFixed(4),
        status: candidate.status,
        evidenceType: candidate.evidenceType,
      }));

      // Conflitos entre candidatos e memórias recuperadas (apenas Shadow).
      if (candidates.length > 0 && section.retrieved.length > 0) {
        for (const candidate of candidates) {
          const target = section.retrieved.find((memory) => memory.subjectKey === candidate.subjectKey);
          if (!target) continue;
          const conflict = resolveMemoryConflict(target, candidate);
          if (conflict.outcome !== 'ignore') {
            section.conflicts.push({
              subjectKey: candidate.subjectKey,
              outcome: conflict.outcome,
              reason: conflict.reason,
            });
          }
        }
      }

      // Persistência fire-and-forget: nunca bloqueia o envio; falha só vira
      // telemetria. O service captura e nunca lança erro tratável ao chat.
      if (candidates.length > 0 && typeof memoryAdapter?.captureCandidates === 'function') {
        try {
          memoryAdapter.captureCandidates({
            candidates,
            sourceMessageId: input.message?.id ?? null,
          });
        } catch {
          section.diagnostics.errorCode = 'MEMORY_CAPTURE_FIRE_AND_FORGET_FAILED';
        }
      }
    }
  } catch (error) {
    section.diagnostics.errorCode = error?.code ?? 'MEMORY_SECTION_ERROR';
  }

  return section;
}

// Fase 4 — Seção epistemicModel do Shadow Mode.
//
// Regra absoluta: `appliedToDecision` permanece SEMPRE falso. O verificador
// é puro, síncrono e sem rede; memórias recuperadas entram apenas como
// evidência; FinancialSnapshot é fonte oficial. Qualquer falha cai em
// diagnostics e telemetria redigida — o pipeline permanece intocado.
function buildEpistemicModelSection({ input, normalized, cognitiveContext, plan, persistentMemory, epistemicState, operationalMemory }) {
  const section = {
    enabled: true,
    items: [],
    conflicts: [],
    staleItems: [],
    evidenceSummary: {},
    confidenceSummary: {},
    sufficiency: {},
    recommendations: [],
    appliedToDecision: false,
    diagnostics: {
      errorCode: null,
      itemCount: 0,
      memoryCount: 0,
      latencyMs: null,
    },
  };

  const start = nowMillis();
  try {
    const verifier = runEpistemicVerifier({
      normalizedMessage: normalized ?? null,
      cognitiveContext,
      financialSnapshot: input.context?.financialSnapshot ?? null,
      operationalMemory: operationalMemory ?? null,
      persistentMemories: persistentMemory?.retrieved ?? null,
      plan,
      now: new Date().toISOString(),
      epistemicState: epistemicState ?? null,
      session: input.session ?? null,
    });
    section.items = Array.isArray(verifier.items) ? verifier.items : [];
    section.conflicts = Array.isArray(verifier.conflicts) ? verifier.conflicts : [];
    section.staleItems = Array.isArray(verifier.staleItems) ? verifier.staleItems : [];
    section.evidenceSummary = verifier.evidenceSummary ?? {};
    section.confidenceSummary = verifier.confidenceSummary ?? {};
    section.sufficiency = verifier.sufficiency ?? {};
    section.recommendations = Array.isArray(verifier.recommendations) ? verifier.recommendations : [];
    section.diagnostics.itemCount = Number(verifier.diagnostics?.itemCount) || 0;
    section.diagnostics.memoryCount = Number(verifier.diagnostics?.memoryCount) || 0;
    section.diagnostics.scopeFiltered = Number(verifier.diagnostics?.memoryScopeFiltered) || 0;
  } catch (error) {
    section.diagnostics.errorCode = error?.code ?? 'EPISTEMIC_SECTION_ERROR';
  }
  section.diagnostics.latencyMs = Number((nowMillis() - start).toFixed(2));
  return section;
}

// Fase 9 — campos estruturados sugeridos por capacidade. SOMENTE chaves e
// bandas seguras (nunca texto, IDs ou valores). O adapter seguro valida cada
// campo contra o contrato da capacidade antes de qualquer consumo.
function buildActivationSuggested(capability, context) {
  const safe = context ?? {};
  switch (capability) {
    case 'METADATA_ONLY':
      return {
        hasData: Boolean(safe.classification),
        intentBand: safe.classification?.primaryIntent ?? null,
        confidenceBand: safe.classification?.confidence != null
          ? describeConfidence(safe.classification.confidence)
          : null,
        riskBand: safe.decisionLayer?.risk ?? null,
        engineVersion: UNI_ENGINE_VERSION,
      };
    case 'QUESTION_GUIDANCE':
      return {
        questionKey: safe.decisionLayer?.nextDecisionType === 'ask'
          ? 'missing_field'
          : null,
        fieldsStillMissing: Array.isArray(safe.comparison?.missingFields)
          ? safe.comparison.missingFields.slice(0, 8)
          : [],
      };
    case 'CLARIFICATION_GUIDANCE':
      return {
        clarificationKey: (safe.classification?.ambiguities?.length ?? 0) > 0
          ? 'ambiguous_intent'
          : null,
        ambiguityType: safe.classification?.ambiguities?.[0]?.type ?? null,
        optionsCount: Math.min(safe.classification?.ambiguities?.length ?? 0, 8),
      };
    case 'RESPONSE_STYLE_GUIDANCE':
      return {
        styleKey: safe.decisionLayer?.decisionType === 'respond' ? 'concise' : null,
        toneBand: 'neutral',
      };
    case 'RESPONSE_LENGTH_GUIDANCE':
      return {
        lengthBand: safe.decisionLayer?.decisionType === 'respond' ? 'short' : null,
      };
    case 'RISK_WARNING':
      return {
        riskBand: safe.decisionLayer?.risk ?? safe.planning?.risk ?? null,
        warningCode: safe.decisionLayer?.risk === 'HIGH' || safe.decisionLayer?.risk === 'CRITICAL'
          ? 'confirmation_required'
          : null,
        blockerCount: 0,
      };
    case 'CONFIDENCE_DISCLOSURE':
      return {
        confidenceBand: safe.classification?.confidence != null
          ? describeConfidence(safe.classification.confidence)
          : null,
      };
    case 'DECISION_RECOMMENDATION':
      return {
        recommendedDecisionKey: safe.decisionLayer?.nextDecisionType ?? null,
      };
    case 'DIAGNOSTICS_ONLY':
      return {
        diagnostics: Array.isArray(safe.reflection?.diagnostics)
          ? safe.reflection.diagnostics.slice(0, 8)
          : [],
        blockerCodes: Array.isArray(safe.reflection?.blockers)
          ? safe.reflection.blockers.slice(0, 8)
          : [],
        divergenceCount: Number(safe.comparison?.agreementMetrics?.divergenceCount ?? 0),
      };
    case 'CATEGORY_SUGGESTION':
      return {
        suggestedCategoryKeys: safe.reflection?.suggestedCategories ?? [],
      };
    case 'ACCOUNT_SUGGESTION':
      return {
        suggestedAccountKeys: safe.reflection?.suggestedAccounts ?? [],
      };
    case 'GOAL_SUGGESTION':
      return {
        suggestedGoalTypes: safe.goals?.type ? [safe.goals.type] : [],
      };
    case 'PLANNING_SUGGESTION':
      return {
        suggestedStepOrder: Array.isArray(safe.planning?.steps)
          ? safe.planning.steps.map((step) => step?.id ?? null).filter(Boolean)
          : [],
      };
    case 'MEMORY_READ_GUIDANCE':
      return {
        relevantMemoryKeys: Array.isArray(safe.epistemicModel?.memoryKeys)
          ? safe.epistemicModel.memoryKeys.slice(0, 8)
          : [],
        memoryCount: Number(safe.epistemicModel?.memoryCount ?? 0),
      };
    case 'EPISTEMIC_CAUTION':
      return {
        cautionCodes: Array.isArray(safe.epistemicModel?.recommendations)
          ? safe.epistemicModel.recommendations.slice(0, 8)
          : [],
        conflictCount: Number(safe.epistemicModel?.conflicts?.length ?? 0),
        staleCount: Number(safe.epistemicModel?.staleItems?.length ?? 0),
      };
    default:
      return null;
  }
}

export function runUniEngineShadow(input, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  const config = safeOptions.config ?? UNI_ENGINE_DEFAULT_CONFIG;
  const correlationId = safeCorrelationId(safeOptions);
  const start = nowMillis();
  const isDev = Boolean(safeOptions.isDev);

  // Fase 2 — memória operacional é um objeto TEMPORÁRIO injetado pelo
  // chamador (dura somente enquanto a conversa está ativa). Nunca persistida.
  const operationalMemory =
    safeOptions.operationalMemory != null && typeof safeOptions.operationalMemory === 'object'
      ? safeOptions.operationalMemory
      : null;

  // Fase 3 — adapter opcional de memória persistente (fornecido pelo
  // chamador; o motor nunca importa Supabase).
  const memoryAdapter = safeOptions.memoryAdapter ?? null;

  if (!config?.enabled || !isUniEngineShadowEnabled(config)) {
    return buildDisabledResult({
      correlationId,
      latencyMs: nowMillis() - start,
    });
  }

  try {
    const inputValidation = validateUniEngineInput(input);
    if (!inputValidation.valid) {
      return buildSafeErrorResult({
        correlationId,
        error: { code: inputValidation.errors[0] ?? 'INVALID_INPUT' },
        latencyMs: nowMillis() - start,
        isDev,
      });
    }

    const normalized = normalizeUserMessage(input.message, {
      referenceDate: input.context?.financialSnapshot?.referenceDate ?? null,
    });

    const analyzed = analyzeConversationContext(input);

    const classification = classifyCognitiveIntent(input, {
      normalized,
      analyzed,
    });

    const epistemicState = buildEpistemicState(input, {
      normalized,
      analyzed,
      classification,
    });

    // Fase 2 — resolução de referências implícitas e contexto cognitivo.
    // Usam somente contexto atual + histórico recente + FinancialSnapshot
    // (+ memória operacional quando injetada). Nunca LLM.
    const referenceResolution = resolveImplicitReference(input, {
      analyzed,
      epistemic: epistemicState,
      memory: operationalMemory,
    });

    const cognitiveContext = buildCognitiveContext(input, {
      analyzed,
      classification,
      epistemic: epistemicState,
      referenceResolution,
      memory: operationalMemory,
    });

    const plan = createCognitivePlan(input, {
      normalized,
      analyzed,
      classification,
      epistemic: epistemicState,
    });

    // Fase 2 — expansão do plano (planejamento cognitivo completo): executor
    // esperado, dados disponíveis/ausentes, risco, ambiguidades, alternativas.
    const expandedPlan = expandCognitivePlan(plan, {
      classification,
      epistemic: epistemicState,
      referenceResolution,
      cognitiveContext,
    });

    const validation = validateCognitivePlan(input, {
      analyzed,
      classification,
      epistemic: epistemicState,
      plan: expandedPlan,
    });

    const comparison = compareShadowDecision(
      {
        classification,
        plan: expandedPlan,
        diagnostics: { fallbackUsed: classification.fallbackUsed },
      },
      {
        detectedIntent: input.currentPipeline?.detectedIntent ?? null,
        pendingIntent: input.currentPipeline?.pendingIntent ?? null,
        pendingActive: Boolean(input.currentPipeline?.pendingActive),
        resultType: input.currentPipeline?.resultType ?? 'unknown',
      },
    );

    // Fase 2 — diagnóstico de divergências (registra tudo, nunca altera o
    // comportamento) e métricas de concordância.
    const divergenceDiagnostics = buildDivergenceDiagnostics({
      comparison,
      classification,
      plan: expandedPlan,
      epistemic: epistemicState,
      referenceResolution,
      cognitiveContext,
      analyzed,
      input,
      memory: operationalMemory,
    });

    const latencyMs = nowMillis() - start;

    const agreementMetrics = computeAgreementMetrics({
      comparison,
      classification,
      plan: expandedPlan,
      referenceResolution,
      cognitiveContext,
      pipeline: input.currentPipeline ?? null,
      divergences: divergenceDiagnostics,
      latencyMs,
    });

    // Fase 2 — sugestões estruturadas para o pipeline. Nesta fase NÃO são
    // utilizadas automaticamente — somente disponibilizadas.
    const suggestions = buildEngineSuggestions({
      classification,
      plan: expandedPlan,
      epistemic: epistemicState,
      referenceResolution,
      analyzed,
    });

    // Fase 2 — atualização da memória operacional (somente rodadas válidas;
    // memória nula = nenhuma atualização).
    if (operationalMemory) {
      const memoryPatch = buildMemoryPatch({
        classification,
        plan: expandedPlan,
        epistemic: epistemicState,
        referenceResolution,
        cognitiveContext,
        messageText: input.message?.text ?? null,
        lastUniMessage: analyzed.history.lastUniMessage ?? null,
        snapshot: input.context?.financialSnapshot ?? null,
        memory: operationalMemory,
      });
      updateOperationalMemory(operationalMemory, memoryPatch);
    }

    // Fase 3 — memória persistente SOMENTE em Shadow: recupera memórias
    // relevantes (cache síncrono), avalia candidatos e dispara persistência
    // fire-and-forget. `appliedToDecision` permanece falso.
    let persistentMemory = null;
    if (config.memoryEnabled && memoryAdapter) {
      persistentMemory = buildPersistentMemorySection({
        config,
        memoryAdapter,
        input,
        normalized,
        classification,
        epistemicState,
        cognitiveContext,
        snapshot: input.context?.financialSnapshot ?? null,
      });
    }

    // Fase 4 — Modelo Epistêmico SOMENTE em Shadow: analisa, estrutura e
    // diagnostica o que a Uni sabe (fontes, confiança, conflitos, staleness,
    // suficiência). Nada é aplicado — `appliedToDecision` permanece falso.
    let epistemicModel = null;
    let epistemicSection = null;
    if (config.epistemicEnabled && config.epistemicShadowMode) {
      const section = buildEpistemicModelSection({
        input,
        normalized,
        cognitiveContext,
        plan: expandedPlan,
        persistentMemory,
        epistemicState,
        operationalMemory,
      });
      epistemicSection = section;
      if (section.diagnostics.errorCode === null) {
        epistemicModel = createEpistemicModelSection({
          items: section.items,
          conflicts: section.conflicts,
          staleItems: section.staleItems,
          sufficiency: section.sufficiency,
          recommendations: section.recommendations,
        });
      }
    }

    // Fase 4 — o plano cognitivo do motor ganha a seção epistêmica (somente
    // informativa; o plano oficial do pipeline não muda nesta fase).
    let finalPlan = expandedPlan;
    if (epistemicModel) {
      finalPlan = {
        ...expandedPlan,
        epistemic: buildPlanEpistemicSection({
          items: epistemicModel.items,
          conflicts: epistemicModel.conflicts,
          staleItems: epistemicModel.staleItems,
        }, expandedPlan),
      };
    }

    // Fase 5 — Camada de Decisão Cognitiva SOMENTE em Shadow: calcula a
    // melhor decisão (responder/perguntar/confirmar/esperar/consultar/
    // rejeitar/cancelar/adiar) e NUNCA executa. `appliedToDecision`
    // permanece SEMPRE falso; o resultado é puramente informativo.
    let decisionLayer = null;
    if (config.decisionEnabled && config.decisionShadowMode) {
      decisionLayer = runDecisionLayer({
        correlationId,
        engineVersion: UNI_ENGINE_VERSION,
        intent: classification ?? null,
        messageType: classification?.messageType ?? null,
        safetyBlocked: Boolean(classification?.safetyBlocked),
        conversationContext: cognitiveContext,
        cognitivePlan: finalPlan,
        epistemicModel: epistemicSection,
        operationalMemory: operationalMemory ?? null,
        persistentMemory: persistentMemory ?? null,
        financialSnapshot: input.context?.financialSnapshot ?? null,
        pendingAction: input.context?.pendingAction ?? null,
        expectedExecutor: expandedPlan?.executorExpected ?? null,
        featureFlags: {
          decisionEnabled: config.decisionEnabled,
          decisionShadowMode: config.decisionShadowMode,
          decisionTelemetryEnabled: config.decisionTelemetryEnabled,
        },
        timestamp: new Date().toISOString(),
        telemetryAdapter: safeOptions.telemetryAdapter ?? null,
      });

      finalPlan = {
        ...finalPlan,
        decisionReadiness: decisionLayer.contextEvaluation?.sufficiency ?? 'UNKNOWN',
        decisionConfidence: decisionLayer.confidence,
        decisionRisk: decisionLayer.risk,
        decisionDependencies: decisionLayer.dependencies,
        decisionSuggestions: decisionLayer.recommendations,
      };
    }

    // Fase 6 — planejamento multi-etapas apenas representacional. Consome
    // snapshots das Fases 1–5 sem modificar nenhum deles e nunca executa.
    let planning = null;
    if (config.planningEnabled && config.planningShadowMode) {
      planning = runPlanningEngine({
        correlationId,
        engineVersion: UNI_ENGINE_VERSION,
        normalizedMessage: normalized,
        classification,
        cognitivePlan: finalPlan,
        conversationContext: cognitiveContext,
        decisionLayer,
        epistemicModel: epistemicSection,
        operationalMemory: operationalMemory ?? null,
        persistentMemory: persistentMemory ?? null,
        financialSnapshot: input.context?.financialSnapshot ?? null,
        pendingAction: input.context?.pendingAction ?? null,
        session: {
          ...input.session,
          workspaceType: input.context?.userPreferences?.workspaceType ?? null,
        },
        userPreferences: input.context?.userPreferences ?? null,
        featureFlags: {
          planningEnabled: config.planningEnabled,
          planningShadowMode: config.planningShadowMode,
          planningTelemetryEnabled: config.planningTelemetryEnabled,
        },
        timestamp: input.message?.createdAt ?? new Date().toISOString(),
        telemetryAdapter: safeOptions.telemetryAdapter ?? null,
      });
    }

    // Fase 7 — Goal Engine SOMENTE em Shadow: identifica, estrutura, avalia
    // e acompanha objetivos financeiros sem persistir, executar ou alterar
    // qualquer resposta. Consome as Fases 1–6 somente em leitura e nunca
    // aciona banco, executor, voz ou UI.
    let goals = null;
    if (config.goalsEnabled && config.goalsShadowMode) {
      goals = runGoalEngine({
        correlationId,
        engineVersion: UNI_ENGINE_VERSION,
        normalizedMessage: normalized,
        classification,
        cognitiveContext,
        cognitivePlan: finalPlan,
        decisionLayer: decisionLayer ?? null,
        planning,
        epistemicModel: epistemicSection ?? null,
        operationalMemory: operationalMemory ?? null,
        persistentMemory: persistentMemory ?? null,
        financialSnapshot: input.context?.financialSnapshot ?? null,
        pendingAction: input.context?.pendingAction ?? null,
        session: {
          ...input.session,
          workspaceType: input.context?.userPreferences?.workspaceType ?? null,
        },
        userPreferences: input.context?.userPreferences ?? null,
        featureFlags: {
          goalsEnabled: config.goalsEnabled,
          goalsShadowMode: config.goalsShadowMode,
          goalsTelemetryEnabled: config.goalsTelemetryEnabled,
        },
        timestamp: input.message?.createdAt ?? new Date().toISOString(),
        telemetryAdapter: safeOptions.telemetryAdapter ?? null,
      });
    }

    // Fase 8 — Reflection & Learning Engine SOMENTE em Shadow: revisa a
    // interação, compara o que o pipeline entendeu com o que aconteceu,
    // detecta correções e divergências e gera candidatos de aprendizado que
    // NUNCA são aplicados (`shadow.applied/persisted/changedBehavior`
    // permanecem falsos). Consome as Fases 1–7 somente em leitura e nunca
    // altera resposta, execução, voz, memória, UI ou banco.
    let reflection = null;
    if (config.reflectionEnabled && config.reflectionShadowMode) {
      reflection = runReflectionEngine({
        correlationId,
        engineVersion: UNI_ENGINE_VERSION,
        messageText: input.message?.text ?? null,
        history: Array.isArray(input.context?.conversationHistory)
          ? input.context.conversationHistory
          : [],
        classification: classification ?? null,
        comparison: comparison ?? null,
        divergenceDiagnostics: divergenceDiagnostics ?? null,
        epistemicModel: epistemicSection ?? null,
        epistemicState: epistemicState ?? null,
        decisionLayer: decisionLayer ?? null,
        planning: planning ?? null,
        goals: goals ?? null,
        persistentMemory: persistentMemory ?? null,
        operationalMemory: operationalMemory ?? null,
        pipeline: {
          responseEmitted: Boolean(input.currentPipeline?.resultType),
          actionConfirmed: input.currentPipeline?.resultType === 'completed'
            || input.currentPipeline?.resultType === 'success',
          actionExecuted: input.currentPipeline?.resultType === 'completed'
            || input.currentPipeline?.resultType === 'success',
          pendingStillActive: Boolean(input.currentPipeline?.pendingActive),
          ambiguous: (classification?.ambiguities?.length ?? 0) > 0,
        },
        systemError: false,
        providerError: false,
        voiceFailed: false,
        now: Date.now(),
        featureFlags: {
          reflectionShadowMode: config.reflectionShadowMode,
          reflectionTelemetryEnabled: config.reflectionTelemetryEnabled,
          learningCandidatesEnabled: config.learningCandidatesEnabled,
        },
        telemetryAdapter: safeOptions.telemetryAdapter ?? null,
        isDev,
      });
    }

    // Fase 9 — Activation Engine (ativação gradual): avalia, para cada
    // capacidade com flag ligada, se ela PODE influenciar o pipeline real.
    // O resultado é SOMENTE metadata/orientação estruturada — a resposta
    // real continua legado por padrão; nenhuma execução, escrita de memória
    // ou aplicação de aprendizado acontece nesta fase.
    let activation = null;
    if (config.activationEnabled) {
      const activationEnvironment = isDev ? 'development' : 'production';
      const activationUserId = input.session?.userId ?? null;
      const activationWorkspaceType =
        input.context?.userPreferences?.workspaceType ?? 'personal';
      const activationConfidence =
        decisionLayer?.confidence
        ?? epistemicState?.confidence
        ?? classification?.confidence
        ?? null;
      const activationRisk = decisionLayer?.risk ?? planning?.risk ?? null;
      const activationDataSufficient =
        Boolean(input.context?.financialSnapshot?.hasData);
      const enabledCapabilities = Object.entries(config.activationCapabilities)
        .filter(([, enabled]) => enabled)
        .map(([capability]) => capability)
        .slice(0, ACTIVATION_POLICY.maxCapabilities);

      activation = {
        enabled: true,
        shadowMode: config.activationShadowMode,
        environment: activationEnvironment,
        decisions: enabledCapabilities.map((capability) => runActivationEngine({
          capability,
          engineEnabled: true,
          activationEnabled: true,
          capabilityEnabled: true,
          environment: activationEnvironment,
          shadowMode: config.activationShadowMode,
          confidence: activationConfidence,
          risk: activationRisk,
          workspaceType: activationWorkspaceType,
          dataSufficient: activationDataSufficient,
          userId: activationUserId,
          testUserIds: config.activationTestUserIds,
          rolloutPercent: config.activationRolloutPercent,
          requested: true,
          suggested: buildActivationSuggested(capability, {
            decisionLayer,
            planning,
            goals,
            reflection,
            classification,
            comparison,
            epistemicModel: epistemicSection ?? null,
          }),
          legacy: { effect: 'none' },
          legacyAvailable: true,
          telemetryEnabled: config.activationTelemetryEnabled,
          telemetryAdapter: safeOptions.telemetryAdapter ?? null,
          engineVersion: UNI_ENGINE_VERSION,
          isDev,
        })),
      };
    }

    if (config.telemetryEnabled) {
      const telemetry = buildUniEngineTelemetry({
        correlationId,
        classification,
        plan: finalPlan,
        validation,
        comparison,
        diagnostics: {
          fallbackUsed: classification.fallbackUsed,
        },
        latencyMs,
        metrics: agreementMetrics,
        persistentMemory,
      });
      emitUniEngineTelemetry(telemetry, safeOptions.telemetryAdapter ?? null);

      // Fase 4 — telemetria epistêmica redigida (somente agregados).
      if (config.epistemicTelemetryEnabled && epistemicModel) {
        const epistemicTelemetry = buildEpistemicTelemetry({
          correlationId,
          engineVersion: UNI_ENGINE_VERSION,
          enabled: config.epistemicEnabled,
          shadowMode: config.epistemicShadowMode,
          verifier: epistemicSection,
          model: epistemicModel,
          planDivergence: comparison?.status ?? null,
          fallbackUsed: classification.fallbackUsed,
          latencyMs: epistemicSection.diagnostics.latencyMs,
        });
        emitEpistemicTelemetry(epistemicTelemetry, safeOptions.telemetryAdapter ?? null);
      }
    }

    return {
      engineVersion: UNI_ENGINE_VERSION,
      correlationId,
      enabled: true,
      skipped: false,
      normalizedMessage: normalized,
      classification,
      epistemicState,
      plan: finalPlan,
      validation,
      shadowComparison: comparison,
      cognitiveContext,
      referenceResolution,
      suggestions,
      agreementMetrics,
      divergenceDiagnostics,
      operationalMemory: operationalMemory
        ? readOperationalMemory(operationalMemory)
        : null,
      persistentMemory,
      epistemicModel,
      decisionLayer,
      planning,
      goals,
      reflection,
      activation,
      diagnostics: {
        rulesUsed: classification.rulesUsed ?? [],
        ambiguities: classification.ambiguities ?? [],
        fallbackUsed: classification.fallbackUsed ?? false,
        errorCode: null,
        latencyMs,
        divergenceCount: divergenceDiagnostics.length,
      },
    };
  } catch (error) {
    const message = error?.message ?? String(error);
    return buildSafeErrorResult({
      correlationId,
      error: { code: 'ENGINE_INTERNAL_ERROR', message },
      latencyMs: nowMillis() - start,
      isDev,
    });
  }
}
