import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GREETING_OPENINGS,
  getPageLoadGreetingOpening,
  pickGreetingOpening,
  resolveSimplifiedGreeting,
  resolveUserDisplayName,
} from './simplifiedGreeting.js';

test('preferred_name vence full_name', () => {
  assert.equal(resolveUserDisplayName({ preferred_name: 'Ruan', full_name: 'Ruan Silva' }), 'Ruan');
});

test('full_name fornece o primeiro nome como fallback seguro para o layout', () => {
  assert.equal(resolveUserDisplayName({ full_name: 'Maria Silva' }), 'Maria');
});

test('nome do Auth é o terceiro fallback', () => {
  assert.equal(resolveUserDisplayName({}, { user_metadata: { full_name: 'Carlos Souza' } }), 'Carlos');
});

test('cada abertura tem a frase completa na fala e só a abertura na tela', () => {
  const ruan = { preferred_name: 'Ruan' };
  const greet = (opening) => resolveSimplifiedGreeting(ruan, null, { opening, hour: 10 });

  assert.equal(greet(GREETING_OPENINGS.OI).spokenGreeting, 'Oi, Ruan! Tudo pronto por aqui.');
  assert.equal(greet(GREETING_OPENINGS.OLA).spokenGreeting, 'Olá, Ruan! No que vamos trabalhar hoje?');
  assert.equal(greet(GREETING_OPENINGS.TUDO_BEM).spokenGreeting, 'Tudo bem, Ruan? Estou aqui pro que precisar.');
  assert.equal(greet(GREETING_OPENINGS.QUE_BOM).spokenGreeting, 'Que bom te ver, Ruan!');

  assert.deepEqual(greet(GREETING_OPENINGS.OI).visualGreeting, { eyebrow: 'Oi,', name: 'Ruan' });
  assert.deepEqual(greet(GREETING_OPENINGS.TUDO_BEM).visualGreeting, { eyebrow: 'Tudo bem,', name: 'Ruan' });
  assert.deepEqual(greet(GREETING_OPENINGS.QUE_BOM).visualGreeting, { eyebrow: 'Que bom te ver,', name: 'Ruan' });
});

test('saudação por período segue a hora local', () => {
  const ruan = { preferred_name: 'Ruan' };
  const at = (hour) => resolveSimplifiedGreeting(ruan, null, { opening: GREETING_OPENINGS.PERIODO, hour });
  assert.equal(at(5).spokenGreeting, 'Bom dia, Ruan! Vamos deixar o dia em ordem?');
  assert.equal(at(11).spokenGreeting, 'Bom dia, Ruan! Vamos deixar o dia em ordem?');
  assert.equal(at(12).spokenGreeting, 'Boa tarde, Ruan! No que posso ajudar agora?');
  assert.equal(at(17).spokenGreeting, 'Boa tarde, Ruan! No que posso ajudar agora?');
  assert.equal(at(18).spokenGreeting, 'Boa noite, Ruan! Quer fechar o dia comigo?');
  assert.equal(at(4).spokenGreeting, 'Boa noite, Ruan! Quer fechar o dia comigo?');
  assert.deepEqual(at(9).visualGreeting, { eyebrow: 'Bom dia,', name: 'Ruan' });
});

test('tratamento entra só na fala, antes do nome', () => {
  for (const [treatment, name] of [
    ['senhor', 'Ruan'],
    ['senhora', 'Maria'],
    ['senhorita', 'Ana'],
    ['doutor', 'Carlos'],
    ['doutora', 'Ana'],
  ]) {
    const greeting = resolveSimplifiedGreeting(
      { preferred_name: name, treatment_preference: treatment },
      null,
      { opening: GREETING_OPENINGS.PERIODO, hour: 9 },
    );
    assert.equal(greeting.addressedName, `${treatment} ${name}`);
    assert.equal(greeting.spokenGreeting, `Bom dia, ${treatment} ${name}! Vamos deixar o dia em ordem?`);
    assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Bom dia,', name });
  }
});

test('nenhuma saudação usa as fórmulas antigas nem presume gênero', () => {
  for (const treatment of ['voce', 'senhor', 'senhora', 'prefer_not_to_say']) {
    for (const opening of Object.values(GREETING_OPENINGS)) {
      for (const hour of [9, 15, 21]) {
        const { spokenGreeting, visualGreeting } = resolveSimplifiedGreeting(
          { preferred_name: 'Ruan', treatment_preference: treatment },
          null,
          { opening, hour },
        );
        assert.doesNotMatch(`${spokenGreeting} ${visualGreeting.eyebrow}`, /bem-vind[oa]|boas-vindas|como vai/i);
      }
    }
  }
});

test('other usa custom_treatment normalizado sem levar o tratamento para a tela', () => {
  const greeting = resolveSimplifiedGreeting({
    preferred_name: 'Paulo',
    treatment_preference: 'other',
    custom_treatment: '  Professor  ',
  }, null, { opening: GREETING_OPENINGS.OI });
  assert.equal(greeting.addressedName, 'professor Paulo');
  assert.equal(greeting.spokenGreeting, 'Oi, professor Paulo! Tudo pronto por aqui.');
  assert.doesNotMatch(JSON.stringify(greeting.visualGreeting), /professor/i);
});

test('other vazio ignora o tratamento personalizado', () => {
  const greeting = resolveSimplifiedGreeting({
    preferred_name: 'Paulo',
    treatment_preference: 'other',
    custom_treatment: '   ',
  });
  assert.equal(greeting.treatmentLabel, '');
  assert.equal(greeting.addressedName, 'Paulo');
});

test('tratamento inválido é ignorado', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'majestade' });
  assert.equal(greeting.treatmentLabel, '');
  assert.equal(greeting.addressedName, 'Ruan');
});

test('nome vazio usa você na tela e não chama a pessoa de você na fala', () => {
  const greeting = resolveSimplifiedGreeting({}, {}, { opening: GREETING_OPENINGS.OI });
  assert.equal(greeting.displayName, 'você');
  assert.equal(greeting.hasKnownName, false);
  assert.equal(greeting.spokenGreeting, 'Oi! Tudo pronto por aqui.');
  assert.equal(
    resolveSimplifiedGreeting({}, {}, { opening: GREETING_OPENINGS.QUE_BOM }).spokenGreeting,
    'Que bom te ver!',
  );
});

test('texto visual e falado vêm do mesmo resultado imutável', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'senhor' });
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Que bom te ver,', name: 'Ruan' });
  assert.equal(greeting.spokenGreeting, 'Que bom te ver, senhor Ruan!');
  assert.equal(greeting.voiceText, greeting.spokenGreeting);
  assert.equal(Object.isFrozen(greeting), true);
  assert.equal(Object.isFrozen(greeting.visualGreeting), true);
});

test('o sorteio cobre todas as aberturas e guarda a hora do sorteio', () => {
  const ids = Object.values(GREETING_OPENINGS);
  const now = new Date(2026, 9, 5, 14, 30);
  const sorteadas = ids.map((_, index) => pickGreetingOpening({
    random: () => (index + 0.5) / ids.length,
    now,
  }));
  assert.deepEqual(sorteadas.map((item) => item.opening), ids);
  assert.ok(sorteadas.every((item) => item.hour === 14));
  assert.equal(pickGreetingOpening({ random: () => 0.9999999, now }).opening, ids.at(-1));
});

test('a abertura é sorteada uma vez por carga da página', () => {
  assert.equal(getPageLoadGreetingOpening(), getPageLoadGreetingOpening());
});
