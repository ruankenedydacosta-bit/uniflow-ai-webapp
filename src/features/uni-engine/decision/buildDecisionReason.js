// Explicação Técnica da Decisão (Fase 5 — Shadow Mode).
//
// buildDecisionReason() produz a justificativa técnica e determinística da
// decisão escolhida, em linhas estruturadas. NUNCA é exibida ao usuário —
// é insumo de diagnóstico, telemetria e futuras fases.
import { DECISION_POLICY, describeConfidence } from './decisionPolicy.js';
import { isValidDecisionReason } from './decisionTypes.js';

const CONFIDENCE_LABELS = {
  very_low: 'muito baixa',
  low: 'baixa',
  medium: 'média',
  high: 'alta',
  very_high: 'muito alta',
};

const FIELD_PRESENT_LABELS = {
  amount: 'valor',
  account: 'conta',
  destinationAccount: 'conta destino',
  sourceAccount: 'conta origem',
  category: 'categoria',
  date: 'data',
  description: 'descrição',
  confirmation: 'confirmação',
};

const REASON_LABELS = {
  HIGH_CONFIDENCE: 'Confiança alta permite responder',
  LOW_CONFIDENCE: 'Confiança baixa impede responder com segurança',
  INSUFFICIENT_CONTEXT: 'Contexto insuficiente para decidir',
  MEMORY_CONFLICT: 'Memória conflita com fonte oficial',
  STALE_DATA: 'Dados estão desatualizados',
  MISSING_ACCOUNT: 'Conta ausente',
  MISSING_CATEGORY: 'Categoria ausente',
  MISSING_AMOUNT: 'Valor ausente',
  MISSING_CONFIRMATION: 'Confirmação ausente',
  PENDING_ACTION: 'Existe ação pendente ativa',
  EPISODIC_REFERENCE: 'Referência episódica não resolvida',
  DATABASE_REQUIRED: 'Dado exige consulta ao banco',
  MEMORY_REQUIRED: 'Contexto exige consulta à memória',
  USER_CONFIRMATION_REQUIRED: 'Confirmação do usuário exigida',
  UNKNOWN: 'Motivo desconhecido',
};

export function buildDecisionReason({ decisionType, context = {}, confidence = 0, risk = null } = {}) {
  const lines = [];
  lines.push(`Decisão = ${decisionType ?? 'UNKNOWN'}`);
  lines.push(`Contexto = ${labelOf(context.sufficiency)}`);
  lines.push(`Consistência = ${labelOf(context.consistency)}`);
  lines.push(`Confiança = ${CONFIDENCE_LABELS[describeConfidence(confidence)] ?? 'média'}`);
  lines.push(`Risco = ${String((risk?.level ?? 'NONE').toLowerCase())}`);

  const missingFields = Array.isArray(context.missingFields) ? context.missingFields : [];
  for (const field of missingFields) {
    const presentLabel = FIELD_PRESENT_LABELS[field] ?? field;
    lines.push(`${capitalize(presentLabel)} = ausente`);
  }

  const evidence = context.evidence ?? {};
  if (evidence.memoryAvailable === true) {
    lines.push(`Memória = ${evidence.memoryConflict ? 'conflitante' : 'consistente'}`);
  } else {
    lines.push('Memória = indisponível');
  }
  if (typeof evidence.snapshotAvailable === 'boolean') {
    lines.push(
      evidence.snapshotAvailable
        ? `Snapshot = ${evidence.snapshotFresh ? 'atual' : 'desatualizado'}`
        : 'Snapshot = indisponível',
    );
  }
  if (evidence.referenceAmbiguous === true) {
    lines.push('Referência = ambígua');
  }
  if (evidence.pendingActive === true) {
    lines.push(`Pendência = ${context.pending?.status ?? 'ativa'}`);
  }

  const reasons = selectReasons({
    decisionType,
    context,
    confidence,
    risk,
  });
  for (const reason of reasons) {
    if (lines.length >= DECISION_POLICY.limits.maxReasonLines) break;
    lines.push(REASON_LABELS[reason] ?? reason);
  }

  return lines.slice(0, DECISION_POLICY.limits.maxReasonLines);
}

function selectReasons({ decisionType, context = {}, confidence = 0, risk = null }) {
  const reasons = [];
  const add = (value) => {
    if (isValidDecisionReason(value) && !reasons.includes(value)) reasons.push(value);
  };
  const evidence = context.evidence ?? {};
  const missingFields = Array.isArray(context.missingFields) ? context.missingFields : [];

  if (decisionType === 'ANSWER') add('HIGH_CONFIDENCE');
  if (decisionType === 'ASK') {
    add('INSUFFICIENT_CONTEXT');
    add('LOW_CONFIDENCE');
  }
  if (decisionType === 'CONFIRM') add('USER_CONFIRMATION_REQUIRED');
  if (decisionType === 'REJECT') add('LOW_CONFIDENCE');
  if (decisionType === 'CONSULT_DATABASE') add('DATABASE_REQUIRED');
  if (decisionType === 'CONSULT_MEMORY') add('MEMORY_REQUIRED');
  if (decisionType === 'WAIT') add('PENDING_ACTION');
  if (decisionType === 'CANCEL') add('PENDING_ACTION');
  if (decisionType === 'DEFER') add('PENDING_ACTION');

  if (missingFields.includes('account')) add('MISSING_ACCOUNT');
  if (missingFields.includes('category')) add('MISSING_CATEGORY');
  if (missingFields.includes('amount')) add('MISSING_AMOUNT');
  if (missingFields.includes('confirmation')) add('MISSING_CONFIRMATION');
  if (missingFields.length > 0 && decisionType === 'ASK') add('INSUFFICIENT_CONTEXT');

  if (evidence.memoryConflict === true) add('MEMORY_CONFLICT');
  if (evidence.staleItemsCount > 0 || (evidence.snapshotAvailable && !evidence.snapshotFresh)) {
    add('STALE_DATA');
  }
  if (evidence.referenceAmbiguous === true) add('EPISODIC_REFERENCE');
  if (evidence.pendingActive === true && !['WAIT', 'CANCEL', 'DEFER', 'CONFIRM'].includes(decisionType)) {
    add('PENDING_ACTION');
  }
  if ((risk?.level ?? 'NONE') === 'HIGH' || (risk?.level ?? 'NONE') === 'CRITICAL') {
    add('LOW_CONFIDENCE');
  }
  if (confidence > 0 && confidence < 0.7 && !reasons.includes('LOW_CONFIDENCE')) {
    add('LOW_CONFIDENCE');
  }

  return reasons;
}

function labelOf(value) {
  if (typeof value !== 'string') return 'desconhecido';
  return value.toLowerCase();
}

function capitalize(value) {
  if (typeof value !== 'string' || !value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export { CONFIDENCE_LABELS };
