import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstallmentConfirmationText, buildRecurringConfirmationText, describeRecurrence } from './uniResponseBuilder.js';

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

test('regra da recorrência como a pessoa diria (#222)', () => {
  assert.equal(describeRecurrence({ frequency: 'monthly', interval: 1 }, '2026-10-10'), 'todo mês, no dia 10');
  assert.equal(describeRecurrence({ frequency: 'weekly', interval: 1 }, '2026-10-12'), 'toda segunda-feira');
  assert.equal(describeRecurrence({ frequency: 'weekly', interval: 1 }, '2026-10-17'), 'todo sábado');
  assert.equal(describeRecurrence({ frequency: 'daily', interval: 1 }, '2026-10-10'), 'todo dia');
  assert.equal(describeRecurrence({ frequency: 'yearly', interval: 1 }, '2026-03-05'), 'todo ano, em 05/03');
  assert.equal(describeRecurrence({ frequency: 'weekly', interval: 2 }, '2026-10-12'), 'a cada 2 semanas');
  assert.equal(describeRecurrence({ frequency: 'monthly', interval: 3 }, '2026-10-12'), 'a cada 3 meses');
  assert.equal(describeRecurrence(null, '2026-10-12'), '');
});

test('texto do card da recorrência repete valor, regra e início, para a voz falar', () => {
  assert.equal(
    buildRecurringConfirmationText({ amount: 1500, date: '2026-11-10', recurrence: { frequency: 'monthly', interval: 1 } }),
    'Revise a repetição abaixo: R$ 1.500,00 todo mês, no dia 10, a partir de 10/11. Os lançamentos com data depois de hoje ficam previstos até você confirmar cada um.',
  );
});
