import assert from 'node:assert/strict';
import test from 'node:test';
import {
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

test('senhor usa tratamento masculino explícito', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'senhor' });
  assert.equal(greeting.addressedName, 'senhor Ruan');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Seja bem-vindo,', name: 'Ruan' });
});

test('senhora usa tratamento feminino explícito', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Maria', treatment_preference: 'senhora' });
  assert.equal(greeting.addressedName, 'senhora Maria');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Seja bem-vinda,', name: 'Maria' });
});

test('senhorita usa tratamento feminino explícito', () => {
  assert.deepEqual(
    resolveSimplifiedGreeting({ preferred_name: 'Ana', treatment_preference: 'senhorita' }).visualGreeting,
    { eyebrow: 'Seja bem-vinda,', name: 'Ana' },
  );
});

test('doutor usa tratamento masculino explícito', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Carlos', treatment_preference: 'doutor' });
  assert.equal(greeting.addressedName, 'doutor Carlos');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Seja bem-vindo,', name: 'Carlos' });
});

test('doutora usa tratamento feminino explícito', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ana', treatment_preference: 'doutora' });
  assert.equal(greeting.addressedName, 'doutora Ana');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Seja bem-vinda,', name: 'Ana' });
});

test('voce não adiciona prefixo e usa saudação neutra', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'voce' });
  assert.equal(greeting.addressedName, 'Ruan');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Boas-vindas,', name: 'Ruan' });
});

test('prefer_not_to_say não adiciona prefixo e usa saudação neutra', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'prefer_not_to_say' });
  assert.equal(greeting.treatmentLabel, '');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Boas-vindas,', name: 'Ruan' });
});

test('other usa custom_treatment normalizado sem inferir gênero', () => {
  const greeting = resolveSimplifiedGreeting({
    preferred_name: 'Paulo',
    treatment_preference: 'other',
    custom_treatment: '  Professor  ',
  });
  assert.equal(greeting.addressedName, 'professor Paulo');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Boas-vindas,', name: 'Paulo' });
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

test('nome vazio usa você sem inventar identidade', () => {
  const greeting = resolveSimplifiedGreeting({}, {});
  assert.equal(greeting.displayName, 'você');
  assert.equal(greeting.addressedName, 'você');
});

test('tratamento inválido é ignorado e usa regra neutra', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'majestade' });
  assert.equal(greeting.treatmentLabel, '');
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Boas-vindas,', name: 'Ruan' });
});

test('texto visual e falado vêm do mesmo resultado determinístico', () => {
  const greeting = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'senhor' });
  assert.deepEqual(greeting.visualGreeting, { eyebrow: 'Seja bem-vindo,', name: 'Ruan' });
  assert.equal(greeting.addressedName, 'senhor Ruan');
  assert.equal(greeting.spokenGreeting, 'Seja bem-vindo, senhor Ruan.');
  assert.equal(greeting.voiceText, greeting.spokenGreeting);
  assert.equal(Object.isFrozen(greeting), true);
  assert.equal(Object.isFrozen(greeting.visualGreeting), true);
});

test('perfil atualizado produz imediatamente a nova saudação sem estado intermediário', () => {
  const before = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'voce' });
  const after = resolveSimplifiedGreeting({ preferred_name: 'Ruan', treatment_preference: 'senhor' });

  assert.equal(before.spokenGreeting, 'Boas-vindas, Ruan.');
  assert.equal(after.spokenGreeting, 'Seja bem-vindo, senhor Ruan.');
});

test('tratamentos pertencem somente à fala, nunca à saudação visual', () => {
  for (const [treatment, name] of [
    ['senhor', 'Ruan'],
    ['senhora', 'Maria'],
    ['doutor', 'Carlos'],
    ['doutora', 'Ana'],
  ]) {
    const greeting = resolveSimplifiedGreeting({ preferred_name: name, treatment_preference: treatment });
    assert.equal(greeting.visualGreeting.name, name);
    assert.doesNotMatch(JSON.stringify(greeting.visualGreeting), new RegExp(treatment, 'i'));
    assert.match(greeting.spokenGreeting, new RegExp(treatment, 'i'));
  }
});
