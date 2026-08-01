// Expansão do Plano Cognitivo (Fase 2 — Integração Cognitiva Assistida).
//
// A Fase 1 entregou o plano estrutural (decisão, planType, collectedData,
// missingFields, requiresConfirmation, nextQuestion, theoreticalExecutor,
// risks, blockers). A Fase 2 expande o plano SEM reescrever a Fase 1:
// `createCognitivePlan` continua intocado e `expandCognitivePlan` compõe
// sobre ele as predições cognitivas:
//   - executorExpected        → executor que o pipeline deveria acionar
//   - availableData           → dados disponíveis (incluindo referências resolvidas)
//   - missingData             → dados ausentes com razão
//   - risk                    → nível de risco + razões
//   - ambiguities             → ambiguidades possíveis
//   - alternatives            → caminhos alternativos
//
// O plano expandido é a saída pública do motor; nenhum campo da Fase 1 é
// removido ou renomeado.
const EPISTEMIC_FIELD_MAP = Object.freeze({
  amount: 'amount',
  account: 'account',
  destinationAccount: 'destinationAccount',
  category: 'category',
  description: 'description',
  date: 'date',
});

function collectAvailableData(epistemic, referenceResolution) {
  const available = [];
  if (!epistemic) return available;
  for (const [epistemicKey, field] of Object.entries(EPISTEMIC_FIELD_MAP)) {
    const entry = epistemic[epistemicKey];
    if (entry?.value != null && entry.status !== 'missing') {
      available.push({
        field,
        value: entry.value,
        status: entry.status,
        source: entry.source,
      });
    }
  }
  const resolution = referenceResolution?.resolution;
  if (resolution) {
    available.push({
      field: resolution.type === 'value' ? 'amount' : resolution.type,
      value: resolution.value,
      status: 'inferred_high',
      source: resolution.source,
      viaImplicitReference: true,
    });
  }
  return available;
}

function collectMissingData(plan, epistemic) {
  const fields = Array.isArray(plan?.missingFields) ? plan.missingFields : [];
  return fields.map((field) => {
    const entry = epistemic?.[field];
    let reason = 'required_field';
    if (entry?.status === 'missing') reason = 'missing';
    else if (entry?.status === 'conflicting') reason = 'conflicting';
    else if (entry?.status === 'ambiguous') reason = 'ambiguous';
    else if (entry?.status === 'inferred_low') reason = 'low_confidence';
    return { field, required: true, reason };
  });
}

function deriveRiskLevel({ plan, classification, epistemic, referenceResolution }) {
  if (plan?.blockers?.length > 0 || classification?.safetyBlocked) return 'high';
  if (epistemic?.account?.status === 'conflicting' || epistemic?.destinationAccount?.status === 'conflicting') {
    return 'high';
  }
  if (
    classification?.ambiguity
    || (Array.isArray(classification?.ambiguities) && classification.ambiguities.length > 0)
    || epistemic?.account?.status === 'ambiguous'
  ) {
    return 'medium';
  }
  if ((plan?.missingFields?.length ?? 0) > 0) return 'medium';
  if (referenceResolution?.hasReference && !referenceResolution.resolved) return 'medium';
  if (epistemic?.totalBalance?.status === 'stale') return 'low';
  return 'low';
}

function deriveRiskReasons({ plan, classification, epistemic, referenceResolution }) {
  const reasons = [];
  if (plan?.blockers?.length > 0) reasons.push(...plan.blockers.map((blocker) => `blocked:${blocker}`));
  if (classification?.safetyBlocked) reasons.push('safety_blocked_action');
  if (classification?.ambiguity) reasons.push('ambiguous_intent');
  if (Array.isArray(classification?.ambiguities)) {
    classification.ambiguities.forEach((ambiguity) => reasons.push(`ambiguity:${ambiguity}`));
  }
  if (epistemic?.account?.status === 'conflicting') reasons.push('conflicting_account');
  if (epistemic?.account?.status === 'ambiguous') reasons.push('ambiguous_account');
  if (epistemic?.totalBalance?.status === 'stale') reasons.push('stale_balance');
  if ((plan?.missingFields?.length ?? 0) > 0) {
    plan.missingFields.forEach((field) => reasons.push(`missing:${field}`));
  }
  if (referenceResolution?.hasReference && !referenceResolution.resolved) {
    reasons.push('unresolved_implicit_reference');
  }
  return reasons;
}

function deriveAmbiguities({ classification, epistemic, referenceResolution }) {
  const ambiguities = [];
  (classification?.ambiguities ?? []).forEach((type) => {
    ambiguities.push({ type, detail: `intent_ambiguity:${type}` });
  });
  if (classification?.ambiguity && (classification.ambiguities?.length ?? 0) === 0) {
    ambiguities.push({ type: 'low_confidence', detail: 'intent_low_confidence' });
  }
  if (epistemic?.account?.status === 'ambiguous') {
    ambiguities.push({ type: 'account', detail: 'ambiguous_account' });
  }
  if (epistemic?.account?.status === 'conflicting') {
    ambiguities.push({ type: 'account', detail: 'conflicting_account' });
  }
  if (referenceResolution?.hasReference && !referenceResolution.resolved) {
    ambiguities.push({
      type: 'reference',
      detail: 'implicit_reference_unresolved',
    });
  }
  return ambiguities;
}

function deriveAlternatives({ classification, plan }) {
  const alternatives = [];
  (classification?.alternatives ?? []).forEach((alternative) => {
    alternatives.push({
      intent: alternative.intent,
      decision: plan?.decision ?? null,
      confidence: alternative.confidence,
      reason: 'alternative_intent',
    });
  });
  return alternatives;
}

export function expandCognitivePlan(plan, options = {}) {
  if (!plan) return null;
  const classification = options.classification ?? null;
  const epistemic = options.epistemic ?? null;
  const referenceResolution = options.referenceResolution ?? null;

  const riskLevel = deriveRiskLevel({ plan, classification, epistemic, referenceResolution });

  return {
    ...plan,
    executorExpected: plan.theoreticalExecutor ?? null,
    availableData: collectAvailableData(epistemic, referenceResolution),
    missingData: collectMissingData(plan, epistemic),
    risk: {
      level: riskLevel,
      reasons: deriveRiskReasons({ plan, classification, epistemic, referenceResolution }),
    },
    ambiguities: deriveAmbiguities({ classification, epistemic, referenceResolution }),
    alternatives: deriveAlternatives({ classification, plan }),
  };
}
