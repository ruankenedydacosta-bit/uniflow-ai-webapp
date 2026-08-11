import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isProfilePreferencesColumnMissing,
  isVoiceProviderColumnMissing,
} from './profileService.js';

const source = () => readFile(new URL('profileService.js', import.meta.url), 'utf8');
const migrationSource = () => readFile(
  new URL('../../supabase/migrations/20260811003200_032_profiles_voice_provider.sql', import.meta.url),
  'utf8',
);

test('detecta coluna nova ausente no schema cache', () => {
  assert.equal(isProfilePreferencesColumnMissing({ code: 'PGRST204', message: "Could not find 'preferred_name'" }), true);
});

test('não classifica erro alheio como migration ausente', () => {
  assert.equal(isProfilePreferencesColumnMissing({ code: '42501', message: 'permission denied' }), false);
});

test('detecta voice_provider ausente sem confundir erro de permissão', () => {
  assert.equal(isVoiceProviderColumnMissing({ code: 'PGRST204', message: "Could not find 'voice_provider'" }), true);
  assert.equal(isVoiceProviderColumnMissing({ code: '42501', message: 'permission denied' }), false);
});

test('profileService seleciona e atualiza todos os campos oficiais', async () => {
  const content = await source();
  for (const field of [
    'preferred_name', 'treatment_preference', 'custom_treatment', 'birth_date',
    'locale', 'text_size', 'avatar_path',
    'voice_provider',
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
  assert.match(content, /code: 'VOICE_PROVIDER_UNAVAILABLE'/);
  assert.match(content, /preferências de perfil ainda não estão disponíveis/);
});

test('migration persiste somente providers conhecidos sem alterar RLS', async () => {
  const content = await migrationSource();
  assert.match(content, /voice_provider text not null default 'native'/i);
  assert.match(content, /check \(voice_provider in \('native', 'elevenlabs'\)\)/i);
  assert.match(content, /grant update \(voice_provider\).*authenticated/i);
  assert.doesNotMatch(content, /disable row level security/i);
  assert.doesNotMatch(content, /create policy/i);
});
