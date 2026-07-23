import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProfileUpdatePayload,
  createProfileEditForm,
  getProfileDisplayName,
  getProfileErrorMessage,
  validateProfileForm,
} from './profileFormUtils.js';

// --- getProfileDisplayName -------------------------------------------------

test('getProfileDisplayName usa profile.full_name quando presente', () => {
  const name = getProfileDisplayName({ full_name: 'Maria Silva' }, { email: 'maria@example.com' });
  assert.equal(name, 'Maria Silva');
});

test('getProfileDisplayName usa user_metadata.full_name quando profile.full_name esta ausente', () => {
  const name = getProfileDisplayName(
    { full_name: null },
    { user_metadata: { full_name: 'João Pereira' } },
  );
  assert.equal(name, 'João Pereira');
});

test('getProfileDisplayName usa user_metadata.full_name quando profile.full_name e string vazia/so espacos', () => {
  const name = getProfileDisplayName(
    { full_name: '   ' },
    { user_metadata: { full_name: 'Ana Costa' } },
  );
  assert.equal(name, 'Ana Costa');
});

test('getProfileDisplayName cai para "Usuário" quando nada esta disponivel', () => {
  assert.equal(getProfileDisplayName(null, null), 'Usuário');
  assert.equal(getProfileDisplayName({}, {}), 'Usuário');
});

test('getProfileDisplayName nunca retorna o nome de mock "UniFlow Demo"', () => {
  const name = getProfileDisplayName(null, null);
  assert.notEqual(name, 'UniFlow Demo');
});

// --- createProfileEditForm -------------------------------------------------

test('createProfileEditForm preenche full_name e phone a partir do profile real', () => {
  const form = createProfileEditForm({ full_name: 'Maria Silva', phone: '11999998888' }, null);
  assert.equal(form.full_name, 'Maria Silva');
  assert.equal(form.phone, '11999998888');
});

test('createProfileEditForm usa user_metadata.full_name quando profile.full_name e nulo/ausente', () => {
  const form = createProfileEditForm({ full_name: null }, { user_metadata: { full_name: 'João Pereira' } });
  assert.equal(form.full_name, 'João Pereira');
});

test('createProfileEditForm retorna phone vazio quando ausente, nunca null/undefined literal no campo do form', () => {
  const form = createProfileEditForm({ full_name: 'Maria' }, null);
  assert.equal(form.phone, '');
});

test('createProfileEditForm nao inclui email nem avatar_url (somente leitura, fora do form editavel)', () => {
  const form = createProfileEditForm({ full_name: 'Maria', avatar_url: 'https://x.test/a.png' }, { email: 'x@x.com' });
  assert.equal('email' in form, false);
  assert.equal('avatar_url' in form, false);
});

test('createProfileEditForm com profile e user ausentes nao lanca excecao', () => {
  assert.doesNotThrow(() => createProfileEditForm(null, null));
  const form = createProfileEditForm(null, null);
  assert.equal(form.full_name, '');
  assert.equal(form.phone, '');
});

// --- validateProfileForm ---------------------------------------------------

test('validateProfileForm rejeita nome vazio', () => {
  assert.equal(validateProfileForm({ full_name: '', phone: '' }), 'Nome é obrigatório.');
});

test('validateProfileForm rejeita nome somente com espacos', () => {
  assert.equal(validateProfileForm({ full_name: '   ', phone: '' }), 'Nome é obrigatório.');
});

test('validateProfileForm aceita nome valido com telefone vazio (telefone e opcional)', () => {
  assert.equal(validateProfileForm({ full_name: 'Maria Silva', phone: '' }), null);
});

test('validateProfileForm aceita telefone preenchido em qualquer formato (sem mascara restritiva)', () => {
  assert.equal(validateProfileForm({ full_name: 'Maria Silva', phone: '+55 11 99999-8888' }), null);
});

// --- buildProfileUpdatePayload ---------------------------------------------

test('buildProfileUpdatePayload aplica trim no nome', () => {
  const payload = buildProfileUpdatePayload({ full_name: '  Maria Silva  ', phone: '' });
  assert.equal(payload.full_name, 'Maria Silva');
});

test('buildProfileUpdatePayload converte telefone vazio/so espacos para null', () => {
  assert.equal(buildProfileUpdatePayload({ full_name: 'Maria', phone: '' }).phone, null);
  assert.equal(buildProfileUpdatePayload({ full_name: 'Maria', phone: '   ' }).phone, null);
});

test('buildProfileUpdatePayload aplica trim no telefone quando presente', () => {
  const payload = buildProfileUpdatePayload({ full_name: 'Maria', phone: '  11999998888  ' });
  assert.equal(payload.phone, '11999998888');
});

test('buildProfileUpdatePayload e uma lista fechada de campos -- nunca produz email, avatar_url, user_mode, current_workspace_id ou onboarding_*', () => {
  const payload = buildProfileUpdatePayload({
    full_name: 'Maria',
    phone: '123',
    email: 'hacker@example.com',
    avatar_url: 'https://evil.test/a.png',
    user_mode: 'business',
    current_workspace_id: 'some-id',
    onboarding_completed: true,
  });
  assert.deepEqual(Object.keys(payload).sort(), ['full_name', 'phone']);
});

// --- getProfileErrorMessage -------------------------------------------------

test('getProfileErrorMessage sem erro retorna string vazia', () => {
  assert.equal(getProfileErrorMessage(null, 'fallback'), '');
});

test('getProfileErrorMessage: codigos seguros retornam a mensagem original', () => {
  const error = { code: 'USER_REQUIRED', message: 'Usuario autenticado ausente.' };
  assert.equal(getProfileErrorMessage(error, 'fallback'), 'Usuario autenticado ausente.');
});

test('getProfileErrorMessage: PROFILE_UPDATE_NO_ROWS e um codigo seguro', () => {
  const error = { code: 'PROFILE_UPDATE_NO_ROWS', message: 'O profile mudou durante a atualizacao.' };
  assert.equal(getProfileErrorMessage(error, 'fallback'), 'O profile mudou durante a atualizacao.');
});

test('getProfileErrorMessage: erro desconhecido usa o fallback, nunca a mensagem crua do Postgrest', () => {
  const error = { code: '23505', message: 'duplicate key value violates unique constraint "profiles_pkey"' };
  assert.equal(getProfileErrorMessage(error, 'Não foi possível salvar o perfil. Tente novamente.'), 'Não foi possível salvar o perfil. Tente novamente.');
});
