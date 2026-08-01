// Detecção de Risco de Decisão (Fase 5 — Shadow Mode).
//
// detectDecisionRisk(context) identifica riscos estruturados e produz o
// nível agregado. Nenhum risco é resolvido automaticamente — apenas
// detectado e reportado.
//
// Tipos: execução de ação errada, categoria errada, conta errada, saldo
// conflitante, contexto insuficiente, informação velha, referência
// ambígua, memória inconsistente, banco divergente, executor incorreto,
// risco de interpretação, risco de contexto.
import { DECISION_POLICY } from './decisionPolicy.js';
import {
  DECISION_RISK_TYPES,
  isValidDecisionRiskType,
} from './decisionTypes.js';

const RISK_LEVEL_ORDER = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function riskLevelOf(value) {
  const index = RISK_LEVEL_ORDER.indexOf(value);
  return index === -1 ? 0 : index;
}

export function detectDecisionRisk(context = {}) {
  const evidence = context.evidence && typeof context.evidence === 'object'
    ? context.evidence
    : {};
  const policy = DECISION_POLICY.risk;
  const risks = [];

  const add = (type, level) => {
    if (!isValidDecisionRiskType(type)) return;
    risks.push({ type, level });
  };

  const intentType = evidence.intentType ?? null;
  const isCriticalIntent = policy.criticalIntents.includes(intentType);
  const missingFields = Array.isArray(context.missingFields) ? context.missingFields : [];

  // Executar ação errada / executor incorreto.
  if (isCriticalIntent) {
    const wrongExecutor = Boolean(
      evidence.executorExpected
      && context.intent?.type
      && intentNeedsExecutor(intentType)
      && !executorMatchesIntent(evidence.executorExpected, intentType),
    );
    if (wrongExecutor) {
      add('incorrect_executor', policy.incorrectExecutorLevel);
      add('wrong_action_execution', policy.incorrectExecutorLevel);
    }
  }

  // Categoria errada.
  if (missingFields.includes('category') || context.evidence?.categoryInferred === true) {
    add('wrong_category', policy.wrongCategoryLevel);
  }

  // Conta errada.
  if (missingFields.includes('account') || evidence.referenceAmbiguous) {
    add('wrong_account', policy.wrongAccountLevel);
  }

  // Saldo conflitante (usuário × banco).
  if (evidence.balanceConflict) {
    add('conflicting_balance', policy.balanceConflictLevel);
  }

  // Contexto insuficiente.
  if (context.sufficiency === 'INSUFFICIENT') {
    add('insufficient_context', policy.insufficientContextLevel);
  }

  // Informação velha.
  if (evidence.staleItemsCount > 0 || (evidence.snapshotAvailable && !evidence.snapshotFresh)) {
    add('stale_information', policy.staleInformationLevel);
  }

  // Referência ambígua.
  if (evidence.referenceAmbiguous) {
    add('ambiguous_reference', policy.ambiguousReferenceLevel);
  }

  // Memória inconsistente.
  if (evidence.memoryConflict) {
    add('inconsistent_memory', policy.inconsistentMemoryLevel);
  }

  // Banco divergente (memória × snapshot).
  if (evidence.hasConflict) {
    add('divergent_database', policy.divergentDatabaseLevel);
  }

  // Risco de interpretação (intent ambígua).
  if (!evidence.intentKnown) {
    add('interpretation_risk', policy.interpretationLevel);
  }

  // Risco de contexto (conversa trocada / pendência ativa bloqueando).
  if (evidence.conversationSwitched || (evidence.pendingActive && !evidence.pendingReady)) {
    add('context_risk', policy.contextLevel);
  }

  // Agregação: o pior risco domina; CRITICAL só para ações críticas.
  let level = 'NONE';
  for (const entry of risks) {
    if (riskLevelOf(entry.level) > riskLevelOf(level)) level = entry.level;
  }

  // Consistência conflitante eleva o nível agregado em pelo menos MEDIUM.
  if (context.consistency === 'CONFLICTING' && riskLevelOf(level) < riskLevelOf('MEDIUM')) {
    level = 'MEDIUM';
  }

  return {
    level,
    risks: risks.slice(0, DECISION_POLICY.limits.maxDiagnostics),
    reasons: risks.map((entry) => `${entry.type}:${entry.level}`),
  };
}

function intentNeedsExecutor(intentType) {
  return DECISION_POLICY.risk.executorRequiredIntents.includes(intentType);
}

function executorMatchesIntent(executor, intentType) {
  if (typeof executor !== 'string') return false;
  if (intentType === 'check_balance') {
    return executor.includes('FinancialQueryEngine')
      || executor.includes('financial_query')
      || executor.includes('query');
  }
  const actionExecutors = [
    'execute_confirmed_financial_action',
    'confirmed_financial_action',
    'financial_action',
  ];
  return actionExecutors.some((keyword) => executor.includes(keyword));
}

export { DECISION_RISK_TYPES };
