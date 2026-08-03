import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('SessionContext.jsx', import.meta.url), 'utf8');

test('SessionContext expõe atualização oficial de perfil', async () => {
  const content = await source();
  assert.match(content, /const updateOwnProfile = useCallback/);
  assert.match(content, /updateOwnProfile,/);
});

test('updateOwnProfile usa profileService e exige usuário autenticado', async () => {
  const content = await source();
  const block = content.slice(content.indexOf('const updateOwnProfile'), content.indexOf('const signInWithPassword'));
  assert.match(block, /if \(!state\.user\?\.id \|\| !state\.profile\)/);
  assert.match(block, /updateProfile\(state\.user\.id, changes\)/);
});

test('sucesso atualiza profile em memória sem recarregar a página', async () => {
  const content = await source();
  const block = content.slice(content.indexOf('const updateOwnProfile'), content.indexOf('const signInWithPassword'));
  assert.match(block, /setState\(\(currentState\) => \(\{/);
  assert.match(block, /\.\.\.currentState\.profile,[\s\S]*\.\.\.result\.data/);
  assert.doesNotMatch(block, /window\.location|synchronizeSession/);
});
