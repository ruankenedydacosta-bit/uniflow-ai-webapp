import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOAuthCallbackUrl, OAUTH_CALLBACK_PATH, resolveAppUrl } from './oauthRedirect.js';

// ============================================================================
// AUTH4 -- funcoes puras usadas para montar o redirectTo do login com Google
// (signInWithOAuth). Testadas diretamente (injecao de dependencia), sem
// depender de window/import.meta em ambiente de teste.
// ============================================================================

test('OAUTH_CALLBACK_PATH e a rota fixa de retorno do OAuth', () => {
  assert.equal(OAUTH_CALLBACK_PATH, '/auth/callback');
});

test('resolveAppUrl usa VITE_APP_URL quando configurada (producao)', () => {
  assert.equal(
    resolveAppUrl({ VITE_APP_URL: 'https://app.uniflow.ai' }),
    'https://app.uniflow.ai',
  );
});

test('resolveAppUrl ignora VITE_APP_URL vazia ou só espaços, cai no fallback determinístico', () => {
  assert.equal(resolveAppUrl({ VITE_APP_URL: '' }), 'http://localhost:5173');
  assert.equal(resolveAppUrl({ VITE_APP_URL: '   ' }), 'http://localhost:5173');
});

test('resolveAppUrl sem env nenhuma cai no fallback local (sem window em teste puro)', () => {
  assert.equal(resolveAppUrl({}), 'http://localhost:5173');
});

test('buildOAuthCallbackUrl monta a URL local correta', () => {
  assert.equal(buildOAuthCallbackUrl('http://localhost:5173'), 'http://localhost:5173/auth/callback');
});

test('buildOAuthCallbackUrl monta a URL de producao a partir da variável', () => {
  assert.equal(
    buildOAuthCallbackUrl('https://app.uniflow.ai'),
    'https://app.uniflow.ai/auth/callback',
  );
});

test('buildOAuthCallbackUrl normaliza barra final -- nunca duplica barra', () => {
  assert.equal(buildOAuthCallbackUrl('https://app.uniflow.ai/'), 'https://app.uniflow.ai/auth/callback');
  assert.equal(buildOAuthCallbackUrl('https://app.uniflow.ai///'), 'https://app.uniflow.ai/auth/callback');
});

test('buildOAuthCallbackUrl sem argumento cai no fallback local', () => {
  assert.equal(buildOAuthCallbackUrl(), 'http://localhost:5173/auth/callback');
  assert.equal(buildOAuthCallbackUrl(''), 'http://localhost:5173/auth/callback');
});

test('buildOAuthCallbackUrl(resolveAppUrl(...)) compõe corretamente ponta a ponta', () => {
  const appUrl = resolveAppUrl({ VITE_APP_URL: 'https://app.uniflow.ai/' });
  assert.equal(buildOAuthCallbackUrl(appUrl), 'https://app.uniflow.ai/auth/callback');
});
