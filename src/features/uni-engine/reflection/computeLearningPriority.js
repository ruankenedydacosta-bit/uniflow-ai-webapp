// Prioridade de um candidato de aprendizado (Fase 8).
//
// Classificação determinística: CRITICAL > HIGH > MEDIUM > LOW > IGNORE >
// UNDETERMINED. Nunca espalha thresholds pelo código — usa o policy e o
// risco já calculado.
import { REFLECTION_POLICY } from './reflectionPolicy.js';

export function computeLearningPriority(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const risk = safe.risk ?? 'UNKNOWN';
  const evidence = Array.isArray(safe.evidence) ? safe.evidence : [];
  const repetitionCount = Number.isFinite(safe.repetitionCount) ? safe.repetitionCount : 0;
  const explicitCorrection = Boolean(safe.explicitCorrection);

  // IGNORE: ruído, evento único sem evidência, falha externa, saudação.
  if (safe.sensitive || safe.otherWorkspace || safe.providerFailure || safe.isGreeting) {
    return 'IGNORE';
  }

  // CRITICAL: risco de execução incorreta, conflito de conta/valor,
  // repetição de erro financeiro sensível.
  if (risk === 'CRITICAL') return 'CRITICAL';
  if (risk === 'HIGH' && repetitionCount >= REFLECTION_POLICY.repetitionThreshold) {
    return 'CRITICAL';
  }

  // HIGH: correção explícita, categoria corrigida repetidamente,
  // pergunta desnecessária recorrente.
  if (explicitCorrection && repetitionCount >= REFLECTION_POLICY.repetitionThreshold) {
    return 'HIGH';
  }
  if (safe.type === 'QUESTION_STRATEGY' && repetitionCount >= REFLECTION_POLICY.repetitionThreshold) {
    return 'HIGH';
  }

  // MEDIUM: preferência de estilo, padrão de conta/categoria com evidências
  // consistentes.
  if (explicitCorrection && evidence.length >= 1) return 'MEDIUM';
  if (evidence.length >= 2) return 'MEDIUM';

  // LOW: pequena escolha linguística, variação sem impacto funcional.
  if (safe.type === 'RESPONSE_STYLE_PREFERENCE') return 'LOW';

  // UNDETERMINED: sem evidência suficiente para classificar.
  return 'UNDETERMINED';
}
