// Conversão segura de texto digitado (rascunho de UI) para o número que
// será enviado a setOverride/buildFutureSimulation. Função pura, sem React.
//
// Diferente de parseFloat, nunca aceita texto parcialmente inválido (ex.:
// "12abc" nunca vira 12) — qualquer entrada que não seja um número bem
// formado vira 0 explicitamente, o mesmo valor "sem ajuste" já usado pela
// normalização central da simulação (F5.2).
const VALID_NUMERIC_DRAFT = /^[+-]?\d*\.?\d*$/;

export function parseSimulationDeltaInput(rawValue) {
  if (typeof rawValue !== 'string') return 0;

  const trimmed = rawValue.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+' || trimmed === '.') return 0;
  if (!VALID_NUMERIC_DRAFT.test(trimmed)) return 0;

  const num = Number(trimmed);
  return Number.isFinite(num) ? num : 0;
}
