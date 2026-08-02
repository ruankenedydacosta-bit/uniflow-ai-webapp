// Geração de candidatos de aprendizado (Fase 8).
//
// Gera candidatos estruturados SOMENTE com evidência explícita, repetição
// consistente, correção ou divergência relevante. Bloqueia:
//   - texto sensível, senha, token, CPF;
//   - dados de outro usuário/workspace;
//   - erro transitório de provider;
//   - falha de rede;
//   - saudação, conversa casual;
//   - ocorrência única fraca;
//   - valor financeiro isolado.
//
// Nenhum candidato gerado aqui é aplicado — `shadow.applied` permanece falso.
import { REFLECTION_POLICY, containsSensitiveContent } from './reflectionPolicy.js';
import { createLearningCandidate } from './reflectionContracts.js';
import { computeLearningConfidence } from './computeLearningConfidence.js';
import { computeLearningPriority } from './computeLearningPriority.js';
import { detectLearningRisk } from './detectLearningRisk.js';
import { normalizeMemoryEntity } from '../memory/normalizeMemorySubject.js';

const GREETING_PATTERN = /^(oi|ola|olá|bom dia|boa tarde|boa noite|e aí|eai|hey|hello|hi)[\s!.,]*$/i;

function isGreeting(text) {
  return typeof text === 'string' && GREETING_PATTERN.test(text.trim());
}

function isFinancialValueOnly(text) {
  return typeof text === 'string' && /^R?\$?\s?\d+([.,]\d{1,2})?\s?(reais)?$/i.test(text.trim());
}

function buildEvidence(reasonCode, count = 1) {
  return {
    type: reasonCode,
    count,
    source: 'reflection',
  };
}

function safeSubject(kind, entity) {
  const normalized = normalizeMemoryEntity(entity);
  return normalized ? `${kind}::${normalized}` : null;
}

export function generateLearningCandidates(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const candidates = [];
  const now = safe.now ?? Date.now();
  const text = typeof safe.messageText === 'string' ? safe.messageText : '';
  const signals = Array.isArray(safe.signals) ? safe.signals : [];
  const outcome = safe.outcome ?? 'UNKNOWN';
  const userCorrection = safe.userCorrection ?? null;
  const repetitionCount = Number.isFinite(safe.repetitionCount) ? safe.repetitionCount : 0;
  const providerFailed = Boolean(safe.providerFailed);

  const signalSet = new Set(signals.map((signal) => signal?.type).filter(Boolean));

  // ---- Bloqueios globais ------------------------------------------------
  if (!text || isGreeting(text) || isFinancialValueOnly(text)) {
    return { candidates, blockedReasons: ['NO_LEARNABLE_CONTENT'] };
  }
  if (containsSensitiveContent(text)) {
    return { candidates, blockedReasons: ['SENSITIVE_CONTENT_BLOCKED'] };
  }
  if (providerFailed || outcome === 'PROVIDER_ERROR' || outcome === 'SYSTEM_ERROR') {
    return { candidates, blockedReasons: ['EXTERNAL_FAILURE_IGNORED'] };
  }

  const blockedReasons = [];
  const pushCandidate = (seed) => {
    if (candidates.length >= REFLECTION_POLICY.maxCandidates) return;
    const evidence = Array.isArray(seed.evidence) ? seed.evidence : [buildEvidence(seed.reasonCode)];
    const risk = detectLearningRisk({
      proposedValue: seed.proposedValue ?? null,
      sensitive: seed.sensitive,
      otherWorkspace: seed.otherWorkspace,
      evidence,
      repetitionCount: seed.repetitionCount ?? repetitionCount,
      explicitCorrection: seed.explicitCorrection,
      contextCorrection: seed.contextCorrection,
      providerFailure: seed.providerFailure,
    });
    if (seed.sensitive || seed.otherWorkspace) {
      blockedReasons.push('LEARNING_BLOCKED');
      return;
    }
    const confidence = computeLearningConfidence({
      evidence,
      explicitCorrection: seed.explicitCorrection,
      userConfirmation: seed.userConfirmation,
      repetitionCount: seed.repetitionCount ?? repetitionCount,
      conflictCount: seed.conflictCount ?? 0,
      providerFailure: seed.providerFailure,
      otherWorkspace: seed.otherWorkspace,
    });
    const priority = computeLearningPriority({
      type: seed.type,
      risk: risk.level,
      evidence,
      repetitionCount: seed.repetitionCount ?? repetitionCount,
      explicitCorrection: seed.explicitCorrection,
      sensitive: seed.sensitive,
      otherWorkspace: seed.otherWorkspace,
      providerFailure: seed.providerFailure,
    });
    candidates.push(createLearningCandidate({
      type: seed.type,
      subjectKey: seed.subjectKey ?? null,
      proposedValue: seed.proposedValue ?? null,
      normalizedValue: seed.normalizedValue ?? null,
      status: 'DETECTED',
      confidence,
      priority,
      risk: risk.level,
      evidence,
      expiresAt: new Date(now + expirationForType(seed.type)).toISOString(),
      sourceLayer: seed.sourceLayer ?? 'reflection',
      reasonCode: seed.reasonCode ?? null,
      restrictions: risk.risks.map((item) => item.code).filter((code) => code !== 'NONE'),
      shadow: { shadowMode: true },
    }));
  };

  // ---- 1. Correção explícita do usuário --------------------------------
  if (userCorrection?.isCorrection) {
    const pair = userCorrection.correctionPair;
    if (pair) {
      const subject = safeSubject('category', pair.to);
      pushCandidate({
        type: 'CATEGORY_PREFERENCE',
        subjectKey: subject,
        proposedValue: pair.to,
        normalizedValue: normalizeMemoryEntity(pair.to),
        evidence: [buildEvidence('user_correction_pair')],
        explicitCorrection: true,
        reasonCode: 'category_corrected_by_user',
      });
    } else {
      pushCandidate({
        type: 'USER_CORRECTION_PATTERN',
        subjectKey: null,
        proposedValue: null,
        normalizedValue: null,
        evidence: [buildEvidence('explicit_user_correction')],
        explicitCorrection: true,
        reasonCode: 'explicit_user_correction',
        sourceLayer: 'pipeline',
      });
    }
  }

  // ---- 2. Repetição consistente ------------------------------------------
  if (repetitionCount >= REFLECTION_POLICY.repetitionThreshold) {
    if (signalSet.has('INTENT_MISMATCH')) {
      pushCandidate({
        type: 'INTENT_PATTERN',
        subjectKey: null,
        proposedValue: null,
        normalizedValue: null,
        evidence: [buildEvidence('repeated_intent_mismatch', repetitionCount)],
        repetitionCount,
        reasonCode: 'repeated_intent_mismatch',
        sourceLayer: 'classification',
      });
    }
    if (signalSet.has('UNNECESSARY_QUESTION') || signalSet.has('MISSING_QUESTION')) {
      pushCandidate({
        type: 'QUESTION_STRATEGY',
        subjectKey: safeSubject('procedure', 'question_strategy'),
        proposedValue: signalSet.has('UNNECESSARY_QUESTION') ? 'ask_less' : 'ask_more',
        normalizedValue: signalSet.has('UNNECESSARY_QUESTION') ? 'ask_less' : 'ask_more',
        evidence: [buildEvidence('repeated_question_issue', repetitionCount)],
        repetitionCount,
        reasonCode: 'repeated_question_strategy_issue',
        sourceLayer: 'decision',
      });
    }
  }

  // ---- 3. Divergências relevantes (decisão, plano, objetivo, epistêmico) --
  const singleDivergenceCandidate = (type, signalType, layer, value) => {
    if (!signalSet.has(signalType)) return;
    pushCandidate({
      type,
      subjectKey: null,
      proposedValue: value ?? null,
      normalizedValue: value ? normalizeMemoryEntity(value) : null,
      evidence: [buildEvidence(`divergence_${signalType.toLowerCase()}`)],
      reasonCode: `signal_${signalType.toLowerCase()}`,
      sourceLayer: layer,
    });
  };
  singleDivergenceCandidate('DECISION_POLICY_SIGNAL', 'DECISION_MISMATCH', 'decision');
  singleDivergenceCandidate('PLANNING_POLICY_SIGNAL', 'PLANNING_MISMATCH', 'planning');
  singleDivergenceCandidate('GOAL_POLICY_SIGNAL', 'GOAL_MISMATCH', 'goals');
  singleDivergenceCandidate('EPISTEMIC_POLICY_SIGNAL', 'EPISTEMIC_CONFLICT', 'epistemic');
  singleDivergenceCandidate('ERROR_PREVENTION_PATTERN', 'MEMORY_CONFLICT', 'memory');

  // ---- 4. Padrão de sucesso ---------------------------------------------
  if (signalSet.has('SUCCESSFUL_PATTERN') && (outcome === 'SUCCESS_CONFIRMED')) {
    pushCandidate({
      type: 'SUCCESS_REINFORCEMENT',
      subjectKey: null,
      proposedValue: 'keep_current_behavior',
      normalizedValue: 'keep_current_behavior',
      evidence: [buildEvidence('confirmed_success')],
      userConfirmation: true,
      reasonCode: 'confirmed_successful_outcome',
      sourceLayer: 'executor',
    });
  }

  return { candidates, blockedReasons };
}

function expirationForType(type) {
  switch (type) {
    case 'CATEGORY_PREFERENCE':
    case 'ACCOUNT_PREFERENCE':
    case 'MERCHANT_CATEGORY_ASSOCIATION':
    case 'MERCHANT_ACCOUNT_ASSOCIATION':
    case 'SUCCESS_REINFORCEMENT':
      return REFLECTION_POLICY.expiration.ACCOUNT_CATEGORY_PATTERN_MS;
    case 'RESPONSE_STYLE_PREFERENCE':
      return REFLECTION_POLICY.expiration.STYLE_PREFERENCE_MS;
    case 'CONVERSATION_PREFERENCE':
    case 'CONTEXT_RESOLUTION_PATTERN':
      return REFLECTION_POLICY.expiration.EPISODIC_CONTEXT_MS;
    case 'QUESTION_STRATEGY':
      return REFLECTION_POLICY.expiration.QUESTION_STRATEGY_MS;
    case 'USER_CORRECTION_PATTERN':
      return REFLECTION_POLICY.expiration.CORRECTION_PATTERN_MS;
    default:
      return REFLECTION_POLICY.expiration.DEFAULT_MS;
  }
}
