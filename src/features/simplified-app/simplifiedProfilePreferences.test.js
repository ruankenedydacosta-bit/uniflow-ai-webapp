import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSimplifiedProfilePayload,
  createSimplifiedProfileForm,
  formatPhone,
  normalizePhone,
  serializeSimplifiedProfileForm,
  validateSimplifiedProfileForm,
} from './simplifiedProfilePreferences.js';

const validForm = () => ({
  full_name: 'Maria Silva',
  preferred_name: 'Maria',
  phone: '(11) 99999-8888',
  treatment_preference: 'senhora',
  custom_treatment: '',
  birth_date: '1990-05-10',
  locale: 'pt-BR',
  text_size: 'standard',
});

test('carrega dados existentes e defaults seguros', () => {
  assert.deepEqual(createSimplifiedProfileForm({}, {}), {
    full_name: '', preferred_name: '', phone: '', treatment_preference: 'voce',
    custom_treatment: '', birth_date: '', locale: 'pt-BR', text_size: 'standard',
  });
});

test('nome do Auth é fallback sem sobrescrever nome persistido', () => {
  assert.equal(createSimplifiedProfileForm({}, { user_metadata: { full_name: 'Ana' } }).full_name, 'Ana');
  assert.equal(createSimplifiedProfileForm({ full_name: 'Bia' }, { user_metadata: { full_name: 'Ana' } }).full_name, 'Bia');
});

test('telefone é normalizado para somente dígitos', () => {
  assert.equal(normalizePhone('+55 (11) 99999-8888'), '11999998888');
  assert.equal(normalizePhone('abc'), '');
});

test('telefone celular recebe máscara brasileira', () => {
  assert.equal(formatPhone('11999998888'), '(11) 99999-8888');
});

test('telefone fixo recebe máscara brasileira', () => {
  assert.equal(formatPhone('1133334444'), '(11) 3333-4444');
});

test('telefone pode ser removido', () => {
  assert.equal(buildSimplifiedProfilePayload({ ...validForm(), phone: '' }).phone, null);
});

test('telefone incompleto é rejeitado', () => {
  assert.match(validateSimplifiedProfileForm({ ...validForm(), phone: '11999' }), /telefone brasileiro válido/);
});

test('nome completo vazio é rejeitado', () => {
  assert.match(validateSimplifiedProfileForm({ ...validForm(), full_name: '   ' }), /nome completo/);
});

test('nome preferido vazio é opcional e vira null', () => {
  const form = { ...validForm(), preferred_name: '  ' };
  assert.equal(validateSimplifiedProfileForm(form), null);
  assert.equal(buildSimplifiedProfilePayload(form).preferred_name, null);
});

test('tratamento Outro exige texto curto', () => {
  assert.match(
    validateSimplifiedProfileForm({ ...validForm(), treatment_preference: 'other', custom_treatment: '' }),
    /prefere ser tratado/,
  );
});

test('tratamento Outro persiste texto normalizado', () => {
  const payload = buildSimplifiedProfilePayload({
    ...validForm(), treatment_preference: 'other', custom_treatment: '  Professora  ',
  });
  assert.equal(payload.custom_treatment, 'Professora');
});

test('tratamento padrão nunca persiste customização antiga', () => {
  const payload = buildSimplifiedProfilePayload({ ...validForm(), custom_treatment: 'Antigo' });
  assert.equal(payload.custom_treatment, null);
});

test('data futura é rejeitada', () => {
  assert.match(
    validateSimplifiedProfileForm(
      { ...validForm(), birth_date: '2027-01-01' },
      { today: new Date('2026-08-01T12:00:00') },
    ),
    /futuro/,
  );
});

test('data válida e campo vazio são aceitos', () => {
  assert.equal(validateSimplifiedProfileForm(validForm()), null);
  assert.equal(validateSimplifiedProfileForm({ ...validForm(), birth_date: '' }), null);
});

test('data inexistente é rejeitada sem normalização silenciosa do JavaScript', () => {
  assert.match(validateSimplifiedProfileForm({ ...validForm(), birth_date: '2026-02-30' }), /data de nascimento válida/);
});

for (const textSize of ['small', 'standard', 'large']) {
  test(`tamanho ${textSize} é válido e persistido`, () => {
    const form = { ...validForm(), text_size: textSize };
    assert.equal(validateSimplifiedProfileForm(form), null);
    assert.equal(buildSimplifiedProfilePayload(form).text_size, textSize);
  });
}

test('idioma indisponível é rejeitado sem fingir tradução', () => {
  assert.match(validateSimplifiedProfileForm({ ...validForm(), locale: 'en-US' }), /idioma disponível/);
});

test('payload é uma lista fechada e não inclui e-mail, endereço ou workspace', () => {
  const payload = buildSimplifiedProfilePayload({
    ...validForm(), email: 'x@example.com', address: 'x', workspace_id: 'other',
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    'birth_date', 'custom_treatment', 'full_name', 'locale', 'phone',
    'preferred_name', 'text_size', 'treatment_preference',
  ]);
});

test('serialização normalizada evita dirty state por máscara ou espaços', () => {
  assert.equal(
    serializeSimplifiedProfileForm(validForm()),
    serializeSimplifiedProfileForm({ ...validForm(), full_name: ' Maria Silva ', phone: '11999998888' }),
  );
});
