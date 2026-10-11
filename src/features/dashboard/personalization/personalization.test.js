import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTimeOfDay,
  getGreeting,
  getNextBestAction,
  getActivationSteps,
  shouldShowActivation,
} from './onboardingHomeRules.js';

test('getTimeOfDay classifica os periodos corretamente', () => {
  assert.equal(getTimeOfDay(8), 'morning');
  assert.equal(getTimeOfDay(12), 'afternoon');
  assert.equal(getTimeOfDay(17), 'afternoon');
  assert.equal(getTimeOfDay(18), 'evening');
  assert.equal(getTimeOfDay(23), 'evening');
  assert.equal(getTimeOfDay(5), 'evening');
});

test('getGreeting gera saudações personalizadas apropriadas', () => {
  const userName = 'Ana';
  const hour = 10; // morning

  // Sem meta/onboarding incompleto
  const greetingNoGoal = getGreeting({
    userName,
    onboardingData: null,
    currentWorkspace: 'personal',
    hour,
  });
  assert.equal(greetingNoGoal, 'Bom dia, Ana. Vamos explorar a UniFlow?');

  // Com meta pessoal
  const greetingGoalPersonal = getGreeting({
    userName,
    onboardingData: { goal: 'dividas' },
    currentWorkspace: 'personal',
    hour,
  });
  assert.equal(greetingGoalPersonal, 'Bom dia, Ana. Vamos sair das dívidas?');

  // Com meta empresarial
  const greetingGoalBusiness = getGreeting({
    userName: 'Ana',
    onboardingData: { goal: 'dividas' },
    currentWorkspace: 'business',
    hour,
  });
  assert.equal(greetingGoalBusiness, 'Bom dia, Ana. Vamos reduzir as dívidas da empresa?');
});

test('getNextBestAction decide o melhor proximo passo', () => {
  const onboardingData = { goal: 'reserva' };

  // Usuário novato sem nada
  const actionNew = getNextBestAction({
    onboardingData,
    hasTransactions: false,
    hasGoals: false,
    currentWorkspace: 'personal',
  });
  assert.equal(actionNew.href, '/metas');
  assert.match(actionNew.title, /reserva/i);

  // Usuário já com transações e metas
  const actionDone = getNextBestAction({
    onboardingData,
    hasTransactions: true,
    hasGoals: true,
    currentWorkspace: 'personal',
  });
  assert.equal(actionDone.href, '/financeiro'); // Volta pro padrão
});

test('getActivationSteps calcula progresso de ativação', () => {
  // Nada feito
  const stepsEmpty = getActivationSteps({
    hasTransactions: false,
    hasGoals: false,
    hasFutureProjection: false,
  });
  assert.equal(stepsEmpty.completed, 0);
  assert.equal(stepsEmpty.total, 3);
  assert.equal(stepsEmpty.percent, 0);

  // Transação feita
  const stepsPartial = getActivationSteps({
    hasTransactions: true,
    hasGoals: false,
    hasFutureProjection: false,
  });
  assert.equal(stepsPartial.completed, 1);
  assert.equal(stepsPartial.percent, 33);

  // Tudo feito
  const stepsAll = getActivationSteps({
    hasTransactions: true,
    hasGoals: true,
    hasFutureProjection: true,
  });
  assert.equal(stepsAll.completed, 3);
  assert.equal(stepsAll.percent, 100);
});

test('shouldShowActivation determina visibilidade dos passos', () => {
  // Onboarding incompleto -> não mostra
  assert.equal(
    shouldShowActivation({ onboardingCompleted: false, hasTransactions: false, hasGoals: false }),
    false
  );

  // Onboarding completo, sem dados -> mostra
  assert.equal(
    shouldShowActivation({ onboardingCompleted: true, hasTransactions: false, hasGoals: false }),
    true
  );

  // Onboarding completo, já tem transação -> não mostra
  assert.equal(
    shouldShowActivation({ onboardingCompleted: true, hasTransactions: true, hasGoals: false }),
    false
  );
});
