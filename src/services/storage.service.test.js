import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_BYTES,
  validateProfileAvatarFile,
} from './storage.service.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('avatar aceita JPEG, PNG e WebP', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(validateProfileAvatarFile({ type, size: 1024 }), null);
  }
});

test('avatar rejeita MIME type fora da allowlist', () => {
  assert.match(validateProfileAvatarFile({ type: 'image/svg+xml', size: 1024 }), /JPEG, PNG ou WebP/);
});

test('avatar rejeita arquivo vazio e acima de 5 MB', () => {
  assert.match(validateProfileAvatarFile({ type: 'image/png', size: 0 }), /vazio/);
  assert.match(validateProfileAvatarFile({ type: 'image/png', size: PROFILE_AVATAR_MAX_BYTES + 1 }), /5 MB/);
});

test('serviço usa bucket privado oficial e caminho prefixado por usuário', async () => {
  const content = await source('storage.service.js');
  assert.equal(PROFILE_AVATAR_BUCKET, 'profile-avatars');
  assert.match(content, /return `\$\{userId\}\/\$\{uniqueId\}/);
  assert.match(content, /path\.startsWith\(`\$\{userId\}\//);
});

test('upload nunca usa upsert nem base64', async () => {
  const content = await source('storage.service.js');
  assert.match(content, /upsert: false/);
  assert.doesNotMatch(content, /base64|service_role/i);
});

test('migration cria bucket privado, limita MIME e isola todas as policies pelo auth.uid', async () => {
  const sql = await source('../../supabase/migrations/20260802000000_029_profile_preferences_and_avatars.sql');
  assert.match(sql, /'profile-avatars'[\s\S]*false[\s\S]*5242880/);
  assert.match(sql, /image\/jpeg/);
  assert.match(sql, /image\/png/);
  assert.match(sql, /image\/webp/);
  assert.equal((sql.match(/\(select auth\.uid\(\)\)::text = \(storage\.foldername\(name\)\)\[1\]/g) ?? []).length, 3);
});

test('migration preserva RLS existente e concede apenas colunas novas ao authenticated', async () => {
  const sql = await source('../../supabase/migrations/20260802000000_029_profile_preferences_and_avatars.sql');
  assert.match(sql, /revoke update \([\s\S]*\) on public\.profiles from public, anon/);
  assert.match(sql, /grant update \([\s\S]*\) on public\.profiles to authenticated/);
  assert.doesNotMatch(sql, /disable row level security|service_role/i);
});
