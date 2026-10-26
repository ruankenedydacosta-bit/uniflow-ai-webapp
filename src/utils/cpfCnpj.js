function hasValidCheckDigits(digits, weights) {
  const sum = digits
    .slice(0, weights.length)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  return Number(digits[weights.length]) === (remainder < 2 ? 0 : 11 - remainder);
}

export function normalizeCpfCnpj(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) return null;
  if (/^(\d)\1+$/.test(digits)) return null;

  if (digits.length === 11) {
    const firstValid = hasValidCheckDigits(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondValid = firstValid && hasValidCheckDigits(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return secondValid ? digits : null;
  }

  const firstValid = hasValidCheckDigits(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondValid = firstValid && hasValidCheckDigits(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return secondValid ? digits : null;
}
