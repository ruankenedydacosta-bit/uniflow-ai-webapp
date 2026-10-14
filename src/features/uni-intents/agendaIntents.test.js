import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyIntent,
  AGENDA_INTENT_SET,
  FINANCIAL_INTENTS,
  isPureCommonConversation,
  stripLeadingConversationalPrefix,
} from './intentClassifier.js';
import { extractAmount } from './entityExtractor.js';
import {
  isAgendaExpression,
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
    label: 'consulta natural com abreviação, finalidade e data',
    input: 'Consulta com Dr. Paulo para levar os exames amanhã às 14h',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'imperativo "agenda" cria compromisso',
    input: 'Agenda uma reunião amanhã às 10',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'imperativo elíptico agenda com data e hora falada',
    input: 'Agenda amanhã dez horas',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'imperativo elíptico marca com data e hora falada',
    input: 'Marca amanhã nove horas',
    intent: 'agenda_schedule_create',
  },
  {
    label: 'substantivo inicial com data e hora falada',
    input: 'Reunião terça duas da tarde',
    intent: 'agenda_schedule_create',
  },
  {
    label: '"agenda de hoje" é consulta direta',
    input: 'Agenda de hoje',
    intent: 'agenda_query',
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
    label: 'adiar reunião no imperativo',
    input: 'Adia minha reunião para sexta',
    intent: 'agenda_edit',
  },
  {
    label: 'muda minha reunião',
    input: 'Muda minha reunião para sexta',
    intent: 'agenda_edit',
  },
  {
    label: 'muda reunião com data e hora sem preposição',
    input: 'Muda minha reunião amanhã onze horas',
    intent: 'agenda_edit',
  },
  {
    label: 'remarca elíptico com data e hora falada',
    input: 'Remarca para segunda duas da tarde',
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
  { label: 'pergunta sim ou não sobre reunião', input: 'Tenho reunião hoje?', intent: 'agenda_query' },
  { label: 'pergunta com compromisso na sexta', input: 'Eu tenho um compromisso na sexta?', intent: 'agenda_query' },
  { label: 'algo marcado amanhã', input: 'Tenho algo marcado amanhã?', intent: 'agenda_query' },
  { label: 'livre na sexta', input: 'Estou livre sexta?', intent: 'agenda_query' },
  { label: 'quais meus compromissos', input: 'Quais meus compromissos?', intent: 'agenda_query' },
  { label: 'que horas é a reunião', input: 'Que horas é a reunião com o João?', intent: 'agenda_query' },
  { label: 'o que tenho na quinta', input: 'O que tenho na quinta?', intent: 'agenda_query' },
  { label: 'pergunta sobre um lembrete', input: 'Qual é meu lembrete de amanhã?', intent: 'agenda_query' },
  { label: 'que horas é o lembrete', input: 'Que horas é o lembrete da vacina?', intent: 'agenda_query' },
  { label: 'pedido de lembrar continua lembrete', input: 'Me lembra que horas é o dentista amanhã', intent: 'agenda_reminder_create' },
  { label: 'reunião com horário sem interrogação marca', input: 'Tenho reunião hoje às 15h', intent: 'agenda_schedule_create' },
  { label: 'pergunta com pedido de marcar continua criação', input: 'Tenho reunião amanhã, pode marcar?', intent: 'agenda_schedule_create' },
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

test('comando explícito Agenda aceita assunto livre antes da data', () => {
  assert.equal(
    classifyIntent('Agenda manutenção amanhã à meia-noite.').intent,
    'agenda_schedule_create',
  );
});

for (const input of [
  'Agenda uma reunião amanhã às 10.',
  'Agende uma reunião amanhã às 10.',
  'Agendo uma reunião amanhã às 10.',
  'Marca uma reunião amanhã às 10.',
  'Marque uma reunião amanhã às 10.',
  'Crie um compromisso amanhã às 10.',
]) {
  test(`variação de criação permanece no domínio Agenda: ${input}`, () => {
    assert.equal(classifyIntent(input).intent, 'agenda_schedule_create');
  });
}

for (const input of [
  'Bom dia.',
  'Oi, Uni.',
  'Tudo bem?',
  'Como você está?',
  'Obrigado.',
]) {
  test(`conversa comum pura não cai no Financeiro: ${input}`, () => {
    assert.equal(isPureCommonConversation(input), true);
    assert.equal(classifyIntent(input).intent, 'conversation_common');
  });
}

for (const [input, expectedIntent] of [
  ['Bom dia, Uni. Gastei 50 reais no mercado.', 'register_expense'],
  ['Oi, Uni. Registra 200 reais de gasolina.', 'register_expense'],
  ['Bom dia, qual meu saldo?', 'check_balance'],
  ['Oi, Uni, agenda uma reunião amanhã às 22 horas.', 'agenda_schedule_create'],
  ['Boa tarde, marca um compromisso amanhã.', 'agenda_schedule_create'],
  ['Olá, mostra minhas despesas do mercado.', 'question'],
]) {
  test(`saudação + intenção funcional preserva a intenção: ${input}`, () => {
    const result = classifyIntent(input);
    assert.equal(result.intent, expectedIntent);
    assert.notEqual(result.intent, 'conversation_common');
  });
}

test('prefixo conversacional é removido sem perder o restante semântico', () => {
  assert.equal(
    stripLeadingConversationalPrefix('Fala, Uni. Boa noite. Agenda uma reunião amanhã.'),
    'Agenda uma reunião amanhã.',
  );
});

test('AGENDA: pergunta sobre gasto do dia não vira consulta de agenda pela pergunta', () => {
  const result = classifyIntent('O que eu tenho de gasto hoje?');
  assert.notEqual(result.signals?.[0], 'agenda_query_question');
});
