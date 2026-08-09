import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyIntent,
  AGENDA_INTENT_SET,
  FINANCIAL_INTENTS,
} from './intentClassifier.js';
import { extractAmount } from './entityExtractor.js';
import {
  isAgendaExpression,
  looksLikeComplexFinancialText,
  looksLikeFreshFinancialStatement,
  looksLikeFreshBalanceStatement,
  looksLikeUnclassifiedFinancialStatement,
} from '../uni-conversation/financialPlanTrigger.js';

const AGENDA_CASES = [
  {
    label: 'reunião daqui 10 dias não vira financeiro',
    input: 'Eu tenho uma reunião daqui 10 dias',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'qual é minha agenda?',
    input: 'Qual é a minha agenda?',
    intent: 'agenda_query',
  },
  {
    label: 'meus próximos compromissos',
    input: 'Quais são meus próximos compromissos?',
    intent: 'agenda_query',
  },
  {
    label: 'agenda de hoje',
    input: 'Qual é a minha agenda de hoje?',
    intent: 'agenda_query',
  },
  {
    label: 'compromissos de amanhã',
    input: 'Quais compromissos eu tenho amanhã?',
    intent: 'agenda_query',
  },
  {
    label: 'me lembra de reunião',
    input: 'Me lembra de que eu vou ter uma reunião semana que vem',
    intent: 'agenda_reminder_create',
  },
  {
    label: 'cria um lembrete',
    input: 'Cria um lembrete para eu pagar o aluguel amanhã',
    intent: 'agenda_reminder_create',
  },
  {
    label: 'avisar para lembrar',
    input: 'Me avisa para lembrar da consulta amanhã',
    intent: 'agenda_reminder_create',
  },
  {
    label: 'marcar reunião',
    input: 'Marcar uma reunião com o cliente na próxima semana',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'agendar consulta',
    input: 'Quero agendar uma consulta para segunda',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'tenho compromisso',
    input: 'Eu tenho um compromisso amanhã às 15h',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'remarcar reunião',
    input: 'Preciso remarcar a reunião de amanhã',
    intent: 'agenda_edit',
  },
  {
    label: 'adiar compromisso',
    input: 'Vou adiar o compromisso da tarde',
    intent: 'agenda_edit',
  },
  {
    label: 'muda minha reunião',
    input: 'Muda minha reunião para sexta',
    intent: 'agenda_edit',
  },
  {
    label: 'cancelar reunião',
    input: 'Cancelar a reunião de quinta-feira',
    intent: 'agenda_cancel',
  },
  {
    label: 'concluir reunião',
    input: 'Concluir a reunião que terminou agora',
    intent: 'agenda_complete',
  },
  {
    label: 'sem horário definido',
    input: 'Não tem horário definido para essa reunião ainda',
    intent: 'agenda_no_time',
  },
  {
    label: 'conflito entre lembrete futuro e operação financeira',
    input: 'Amanhã tenho que pagar 300 reais',
    intent: 'agenda_financial_conflict',
  },
];

for (const { label, input, intent } of AGENDA_CASES) {
  test(`AGENDA: ${label}`, () => {
    const result = classifyIntent(input);
    assert.ok(
      AGENDA_INTENT_SET.has(result.intent),
      `esperava intent de agenda, recebeu "${result.intent}" para: ${input}`,
    );
    assert.equal(result.intent, intent);
  });
}

const FINANCIAL_REGRESSION_CASES = [
  ['Tenho R$ 1.000', 'ambiguous_balance_or_income'],
  ['Estou com 500 reais', 'ambiguous_balance_or_income'],
  ['To com mil reais', 'ambiguous_balance_or_income'],
  ['Tenho 500 reais de saldo', 'set_balance'],
  ['Recebi R$ 1.500 da nota', 'register_income'],
  ['Entrou mil reais', 'register_income'],
  ['Paguei R$ 120 no mercado', 'register_expense'],
  ['Gastei duzentos reais de gasolina', 'register_expense'],
  ['Cinquenta reais de mercado', 'register_expense'],
];

for (const [input, intent] of FINANCIAL_REGRESSION_CASES) {
  test(`REGRESSÃO FINANCEIRA: ${input} -> ${intent}`, () => {
    const result = classifyIntent(input);
    assert.equal(result.intent, intent);
  });
}

test('AGENDA: intents de agenda nunca aparecem como financeiros', () => {
  const overlap = FINANCIAL_INTENTS.filter((intent) => AGENDA_INTENT_SET.has(intent));
  assert.deepEqual(overlap, [], `intents em comum: ${overlap.join(', ')}`);
});

const AGENDA_GUARD_PHRASES = [
  'Eu tenho uma reunião daqui 10 dias',
  'Qual é a minha agenda?',
  'Me lembra de pagar o aluguel amanhã',
  'Marcar uma reunião na próxima semana',
  'Preciso remarcar o compromisso de amanhã',
];

for (const phrase of AGENDA_GUARD_PHRASES) {
  test(`AGENDA GUARD: extractAmount não extrai valor de "${phrase}"`, () => {
    assert.equal(extractAmount(phrase), null);
  });

  test(`AGENDA GUARD: isAgendaExpression("${phrase}") é true`, () => {
    assert.equal(isAgendaExpression(phrase), true);
  });

  for (const lookup of [
    looksLikeComplexFinancialText,
    looksLikeFreshFinancialStatement,
    looksLikeFreshBalanceStatement,
    looksLikeUnclassifiedFinancialStatement,
  ]) {
    test(`AGENDA GUARD: ${lookup.name}("${phrase}") é false`, () => {
      assert.equal(lookup(phrase), false);
    });
  }
}

test('AGENDA GUARD: "Tenho R$ 1.000" continua sendo declaração financeira', () => {
  assert.equal(isAgendaExpression('Tenho R$ 1.000'), false);
  assert.equal(looksLikeFreshBalanceStatement('Tenho R$ 1.000'), true);
  assert.equal(extractAmount('Tenho R$ 1.000'), 1000);
});

test('AGENDA GUARD: "Gastei duzentos reais" continua sendo gasto', () => {
  assert.equal(isAgendaExpression('Gastei duzentos reais de gasolina'), false);
  assert.equal(looksLikeFreshFinancialStatement('Gastei duzentos reais de gasolina'), true);
  assert.equal(looksLikeUnclassifiedFinancialStatement('Gastei duzentos reais de gasolina'), true);
  assert.equal(extractAmount('Gastei duzentos reais de gasolina'), 200);
});
