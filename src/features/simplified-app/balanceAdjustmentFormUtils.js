// BLOCO FINAL DO MVP (Saldo manual) -- funções puras de máscara monetária e
// cálculo de delta, isoladas do componente React para permitir teste direto
// sem renderização, seguindo o mesmo padrão de transactionFormUtils.js /
// simplifiedRecordsData.js já usado neste módulo.

// Limite de dígitos durante a digitação -- protege contra overflow/valores
// absurdos antes mesmo da validação numeric(18,2) do banco.
const MAX_CENTS_DIGITS = 15;

export function digitsToCents(rawValue) {
  const digitsOnly = String(rawValue ?? '').replace(/\D/g, '').slice(0, MAX_CENTS_DIGITS);
  return digitsOnly ? Number(digitsOnly) : 0;
}

export function centsToAmount(cents) {
  return Math.round(Number(cents) || 0) / 100;
}

export function formatCentsAsCurrencyInput(cents) {
  return (Math.round(Number(cents) || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function computeBalanceDelta(currentBalance, newBalance) {
  return Math.round((Number(newBalance || 0) - Number(currentBalance || 0)) * 100) / 100;
}

export function formatSignedCurrency(value, formatCurrency) {
  const amount = Number(value) || 0;
  return amount > 0 ? `+${formatCurrency(amount)}` : formatCurrency(amount);
}
