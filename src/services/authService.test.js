import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Sem Supabase real configurado em ambiente de teste (isSupabaseConfigured
// e false), o service retorna cedo (createServiceUnavailableResult) antes
// de qualquer chamada de rede -- mesmo padrao de cobertura por leitura de
// fonte ja usado para o restante deste arquivo e para outros services do
// repositorio.

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('requestPasswordReset usa o metodo oficial do Supabase Auth (resetPasswordForEmail), com redirectTo', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function requestPasswordReset'),
    content.indexOf('export async function updatePassword'),
  );
  assert.match(fnBody, /supabase\.auth\.resetPasswordForEmail\(email, \{ redirectTo \}\)/);
});

test('requestPasswordReset retorna cedo quando Supabase nao esta configurado, sem lancar excecao', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function requestPasswordReset'),
    content.indexOf('export async function updatePassword'),
  );
  assert.match(fnBody, /if \(!supabase\) \{\s*\n\s*return createServiceUnavailableResult\(\);/);
});

test('requestPasswordReset retorna { data, error, isConfigured } -- mesmo contrato dos demais metodos do service', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function requestPasswordReset'),
    content.indexOf('export async function updatePassword'),
  );
  assert.match(fnBody, /return \{\s*\n\s*data: null,\s*\n\s*error,\s*\n\s*isConfigured: true,\s*\n\s*\};/);
});

test('updatePassword usa o metodo oficial do Supabase Auth (updateUser), nunca manipula tokens manualmente', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function updatePassword'),
    content.indexOf('export async function signOut'),
  );
  assert.match(fnBody, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.doesNotMatch(fnBody, /access_token|refresh_token|localStorage/);
});

test('updatePassword retorna cedo quando Supabase nao esta configurado, sem lancar excecao', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function updatePassword'),
    content.indexOf('export async function signOut'),
  );
  assert.match(fnBody, /if \(!supabase\) \{\s*\n\s*return createServiceUnavailableResult\(\);/);
});

test('nem requestPasswordReset nem updatePassword acessam localStorage ou window.location diretamente (URL de redirect vem de fora)', async () => {
  const content = await source('authService.js');
  const fnBody = content.slice(
    content.indexOf('export async function requestPasswordReset'),
    content.indexOf('export async function signOut'),
  );
  assert.doesNotMatch(fnBody, /localStorage|window\.location/);
});

test('signInWithPassword/signUpWithEmail/signOut existentes permanecem intocados', async () => {
  const content = await source('authService.js');
  assert.match(content, /export async function signInWithPassword/);
  assert.match(content, /export async function signUpWithEmail/);
  assert.match(content, /export async function signOut\(\) \{/);
});
