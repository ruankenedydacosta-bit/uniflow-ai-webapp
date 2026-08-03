import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isProfilePreferencesColumnMissing } from './profileService.js';

const source = () => readFile(new URL('profileService.js', import.meta.url), 'utf8');

test('detecta coluna nova ausente no schema cache', () => {
  assert.equal(isProfilePreferencesColumnMissing({ code: 'PGRST204', message: "Could not find 'preferred_name'" }), true);
});

test('não classifica erro alheio como migration ausente', () => {
  assert.equal(isProfilePreferencesColumnMissing({ code: '42501', message: 'permission denied' }), false);
});

test('profileService seleciona e atualiza todos os campos oficiais', async () => {
  const content = await source();
  for (const field of [
    'preferred_name', 'treatment_preference', 'custom_treatment', 'birth_date',
    'locale', 'text_size', 'avatar_path',
  ]) {
    assert.match(content, new RegExp(field));
  }
});

test('avatar_path privado é hidratado por signed URL e não tornado público', async () => {
  const content = await source();
  assert.match(content, /createProfileAvatarSignedUrl\(profile\.avatar_path\)/);
  assert.doesNotMatch(content, /getPublicUrl/);
});

test('ambiente sem migration recebe erro seguro e não texto cru do backend', async () => {
  const content = await source();
  assert.match(content, /code: 'PROFILE_PREFERENCES_UNAVAILABLE'/);
  assert.match(content, /preferências de perfil ainda não estão disponíveis/);
});
