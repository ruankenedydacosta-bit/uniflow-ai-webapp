import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstallmentConfirmationText } from './uniResponseBuilder.js';

const semEspacoDuro = (texto) => texto.replace(/\s/g, ' ');

test('compra parcelada: o texto falado repete parcelas, valor e a primeira data (#221)', () => {
  const texto = buildInstallmentConfirmationText({
    date: '2026-10-12',
    installments: { count: 10, installmentAmount: 300, futureCount: 9 },
  });
  assert.equal(
    semEspacoDuro(texto),
    'Revise a compra abaixo: 10 parcelas de R$ 300,00, a primeira em 12/10. As parcelas com data depois de hoje ficam previstas até você confirmar.',
  );
});

test('compra parcelada: todas futuras ou todas passadas', () => {
  const futura = buildInstallmentConfirmationText({ date: '2026-11-05', installments: { count: 3, installmentAmount: 100, futureCount: 3 } });
  assert.match(futura, /Todas ficam previstas até você confirmar\.$/);
  const passada = buildInstallmentConfirmationText({ date: '2025-01-05', installments: { count: 3, installmentAmount: 100, futureCount: 0 } });
  assert.match(passada, /a primeira em 05\/01\.$/);
});
