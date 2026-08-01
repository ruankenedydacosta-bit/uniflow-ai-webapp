// Temporalidade e desatualização do Modelo Epistêmico (Fase 4 — seção 11).
//
// Regras por tipo/domínio:
//   - saldo (balance): validade curta (7 dias);
//   - transação (transaction): histórica, NÃO expira;
//   - preferência (preference): longa, corrigível;
//   - contexto episódico (episodic): curta (24h);
//   - associação recorrente (recurring): renovável;
//   - fato declarado (fact): depende do domínio.
//
// Estados possíveis: fresh | aging | stale | expired.
// Nem toda memória antiga é tratada como verdade atual.
import {
  EPISTEMIC_POLICY,
  stalenessDomainForSubject,
  stalenessWindowMs,
} from './epistemicPolicy.js';

function toTime(value) {
  if (!value) return null;
  const time = typeof value === 'string' || typeof value === 'number'
    ? Date.parse(value)
    : null;
  return Number.isFinite(time) && time > 0 ? time : null;
}

// Janela de staleness de um item (null = nunca expira).
export function stalenessWindowForItem(item, policy = EPISTEMIC_POLICY) {
  const safe = item && typeof item === 'object' ? item : {};
  if (safe.staleAfter != null) {
    const explicit = Number(safe.staleAfter);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
  }
  const domain = stalenessDomainForSubject(safe.subject);
  return stalenessWindowMs(domain, policy);
}

export function evaluateStaleness(item, now = Date.now(), policy = EPISTEMIC_POLICY) {
  const safe = item && typeof item === 'object' ? item : {};
  const referenceTime = toTime(safe.lastVerifiedAt ?? safe.evidence?.[0]?.verifiedAt)
    ?? toTime(safe.evidence?.[0]?.observedAt);
  const nowTime = toTime(now) ?? Date.now();

  if (referenceTime == null) {
    return { state: 'unknown', domain: stalenessDomainForSubject(safe.subject), ageMs: null };
  }

  const windowMs = stalenessWindowForItem(safe, policy);
  if (windowMs == null) {
    // Histórico (ex.: transações) nunca expira — permanece fresh.
    return { state: 'fresh', domain: stalenessDomainForSubject(safe.subject), ageMs: null };
  }

  const ageMs = Math.max(0, nowTime - referenceTime);
  const expiredAfterMs = windowMs * policy.expirationMultiplier;

  let state = 'fresh';
  if (ageMs >= expiredAfterMs) {
    state = 'expired';
  } else if (ageMs >= windowMs) {
    state = 'stale';
  } else if (ageMs >= windowMs / 2) {
    state = 'aging';
  }

  return {
    state,
    domain: stalenessDomainForSubject(safe.subject),
    ageMs,
    staleAfterMs: windowMs,
  };
}

// Item em estado stale/expired (para agregações do verificador).
export function isStaleItem(item, now = Date.now(), policy = EPISTEMIC_POLICY) {
  const result = evaluateStaleness(item, now, policy);
  return result.state === 'stale' || result.state === 'expired';
}
