import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAgendaReminderPatterns,
  buildAgendaSchedulePatterns,
  hasAgendaVagueSubject,
  PT_BR_COLLOQUIAL_INTERJECTIONS,
  stripColloquialLead,
} from './agendaPtBr.js';
import { classifyIntent } from './intentClassifier.js';

// Suíte própria da camada pt-BR coloquial (ponto de extensão oficial da
// futura src/features/uni-language/pt-br/). Fica em uni-intents para a
// superfície de integração com o classificador.

test('frases utilitárias expõem a superfície de extensão esperada', () => {
  assert.ok(Array.isArray(buildAgendaReminderPatterns()));
  assert.ok(Array.isArray(buildAgendaSchedulePatterns()));
  assert.ok(buildAgendaReminderPatterns().length > 0);
  assert.ok(buildAgendaSchedulePatterns().length > 0);
  assert.ok(Array.isArray(PT_BR_COLLOQUIAL_INTERJECTIONS));
  assert.equal(typeof stripColloquialLead, 'function');
  assert.equal(typeof hasAgendaVagueSubject, 'function');
});

test('stripColloquialLead remove interjeições do início sem tocar palavras reais', () => {
  assert.equal(stripColloquialLead('bah, não deixa eu esquecer'), 'não deixa eu esquecer');
  assert.equal(stripColloquialLead('uai me avisa amanhã'), 'me avisa amanhã');
  assert.equal(stripColloquialLead('oxe, tenho dentista sexta'), 'tenho dentista sexta');
  assert.equal(stripColloquialLead('bora marcar a reunião'), 'marcar a reunião');
  // NUNCA quebra palavras que só começam iguais à interjeição
  assert.equal(stripColloquialLead('posso pagar amanhã'), 'posso pagar amanhã');
  assert.equal(stripColloquialLead('manhã vou ter reunião'), 'manhã vou ter reunião');
  assert.equal(stripColloquialLead('bater um papo'), 'bater um papo');
});

test('interjeições não mudam a intenção (frase original preservada no caller)', () => {
  const com = classifyIntent('Bah, não deixa eu esquecer da reunião sexta de tarde.');
  const sem = classifyIntent('não deixa eu esquecer da reunião sexta de tarde');
  assert.equal(com.intent, sem.intent);
  assert.equal(com.intent, 'agenda_reminder_create');

  const oxe = classifyIntent('Oxe, me dá um toque amanhã que tenho dentista.');
  assert.equal(oxe.intent, 'agenda_reminder_create');
});

test('lembretes coloquiais são agenda_reminder_create', () => {
  const casos = [
    'me avisa',
    'me avisar sexta',
    'me dá um toque amanhã',
    'me da um toque',
    'não deixa eu esquecer',
    'nao deixa eu esquecer',
  ];
  for (const frase of casos) {
    const resultado = classifyIntent(frase);
    assert.equal(
      resultado.intent,
      'agenda_reminder_create',
      `"${frase}" deveria ser lembrete, veio ${resultado.intent}`,
    );
  }
});

test('agendamentos coloquiais são agenda_schedule_create', () => {
  const casos = [
    'anota aí',
    'bota na agenda',
    'bota na minha agenda',
    'marca aí',
    'marca aquele negócio pra sexta',
    'bota pra sexta',
    'bota pra amanhã',
    'tenho um negócio amanhã',
    'amanhã tenho reunião',
    'sexta tenho dentista',
    'daqui uns dez dias',
    'daqui a dez dias',
    'semana que vem',
    'tenho uma consulta semana quevem',
  ];
  for (const frase of casos) {
    const resultado = classifyIntent(frase);
    assert.equal(
      resultado.intent,
      'agenda_schedule_create',
      `"${frase}" deveria agendar, veio ${resultado.intent}`,
    );
  }
});

test('obrigação financeira futura com valor preserva conflito em vez de escrever Agenda ou Financeiro', () => {
  const resultado = classifyIntent('Amanhã tenho que pagar 300 reais');
  assert.equal(resultado.intent, 'agenda_financial_conflict');
  assert.ok(resultado.signals.includes('agenda_temporal_financial_conflict'));
});

test('interjeições regionais não geram lançamento financeiro nem região', () => {
  for (const interj of PT_BR_COLLOQUIAL_INTERJECTIONS) {
    const resultado = classifyIntent(`${interj}, me avisa quinta`);
    assert.equal(
      resultado.intent,
      'agenda_reminder_create',
      `interjeição "${interj}" deveria manter lembrete, veio ${resultado.intent}`,
    );
  }
});

test('frases com valor monetário NÃO viram agenda (ficam no fluxo financeiro)', () => {
  const casos = [
    'anota aí 50 reais',
    'anota aí 50 reais de mercado',
    'marca aí dez reais',
    'bota 50 reais pra amanhã',
  ];
  for (const frase of casos) {
    const resultado = classifyIntent(frase);
    assert.notEqual(
      resultado.intent,
      'agenda_schedule_create',
      `"${frase}" não deveria virar agenda, veio ${resultado.intent}`,
    );
    assert.notEqual(
      resultado.intent,
      'agenda_reminder_create',
      `"${frase}" não deveria virar lembrete, veio ${resultado.intent}`,
    );
  }
  // "anota aí + valor" é registrado como despesa (fluxo financeiro real)
  assert.equal(classifyIntent('anota aí 50 reais').intent, 'register_expense');
});

test('ambiguidade "aquele negócio" sinaliza para pergunta em vez de assumir', () => {
  const resultado = classifyIntent('Bota aquele negócio pra sexta.');
  assert.equal(resultado.intent, 'agenda_schedule_create');
  assert.ok(
    resultado.signals.includes('agenda_vague_subject'),
    `esperava sinal de ambiguidade em ${JSON.stringify(resultado)}`,
  );
  assert.ok(resultado.confidence < 0.9, 'confiança deve baixar com objeto vago');
  // hasAgendaVagueSubject recebe texto NORMALIZADO (sem acentos)
  assert.equal(hasAgendaVagueSubject('bota aquele negocio pra sexta'), true);
  assert.equal(hasAgendaVagueSubject('bota a reuniao pra sexta'), false);
  assert.equal(hasAgendaVagueSubject('posso comer negocio'), true);
});

test('texto original do usuário nunca é reescrito pela camada', () => {
  const original = 'Bah, me dá um toque amanhã que tenho dentista.';
  const oriGinalNormalizado = classifyIntent(original);
  // O classificador devolve intenção, mas não entrega o texto "limpado" de
  // volta -- a normalização é auxiliar e descartada; qualquer camada acima
  // guarda a frase original.
  assert.ok(original.startsWith('Bah'));
  assert.ok(['agenda_reminder_create', 'agenda_schedule_create'].includes(oriGinalNormalizado.intent));
});

test('camada é pequena e extensível: sem dicionário gigante hardcoded', () => {
  // Contrato anti-crescimento: o arquivo de padrões deve continuar sendo uma
  // lista curta e nomeada, nunca um dicionário enorme.
  assert.ok(PT_BR_COLLOQUIAL_INTERJECTIONS.length <= 20);
  assert.ok(buildAgendaReminderPatterns().length <= 10);
  assert.ok(buildAgendaSchedulePatterns().length <= 20);
});
