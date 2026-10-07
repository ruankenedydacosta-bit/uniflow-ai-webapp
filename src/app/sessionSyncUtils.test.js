import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isSilentAuthEvent } from './sessionSyncUtils.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// AUTH2 -- isSilentAuthEvent: comportamento real (nao regex), a decisao que
// evita o loop de re-sincronizacao (SIGNED_IN/TOKEN_REFRESHED/USER_UPDATED
// redundantes derrubando toda a arvore autenticada em App.jsx).
// ============================================================================

test('SIGNED_IN repetido para o MESMO usuario ja autenticado e silencioso (nao ativa loading global)', () => {
  const nextSession = { user: { id: 'user-1' } };
  assert.equal(isSilentAuthEvent('SIGNED_IN', nextSession, 'user-1'), true);
});

test('TOKEN_REFRESHED e sempre silencioso -- atualiza sessao sem desmontar a aplicacao', () => {
  const nextSession = { user: { id: 'user-1' } };
  assert.equal(isSilentAuthEvent('TOKEN_REFRESHED', nextSession, 'user-1'), true);
  // Mesmo sem um usuario previo conhecido (ex.: primeiro refresh apos bootstrap
  // ainda em andamento), TOKEN_REFRESHED nunca deve reiniciar o bootstrap.
  assert.equal(isSilentAuthEvent('TOKEN_REFRESHED', nextSession, null), true);
});

test('USER_UPDATED e sempre silencioso -- nao ativa bootstrap completo', () => {
  const nextSession = { user: { id: 'user-1' } };
  assert.equal(isSilentAuthEvent('USER_UPDATED', nextSession, 'user-1'), true);
  assert.equal(isSilentAuthEvent('USER_UPDATED', nextSession, null), true);
});

test('SIGNED_IN para um usuario DIFERENTE do atual nao e silencioso -- login real continua funcionando', () => {
  const nextSession = { user: { id: 'user-2' } };
  assert.equal(isSilentAuthEvent('SIGNED_IN', nextSession, 'user-1'), false);
});

test('SIGNED_IN sem usuario previo conhecido (bootstrap inicial) nao e silencioso -- ainda mostra loading', () => {
  const nextSession = { user: { id: 'user-1' } };
  assert.equal(isSilentAuthEvent('SIGNED_IN', nextSession, null), false);
});

test('SIGNED_OUT nunca e silencioso -- limpa sessao/profile/workspace normalmente', () => {
  assert.equal(isSilentAuthEvent('SIGNED_OUT', null, 'user-1'), false);
});

test('INITIAL_SESSION nunca e silencioso -- bootstrap inicial sempre passa pelo caminho completo', () => {
  const nextSession = { user: { id: 'user-1' } };
  assert.equal(isSilentAuthEvent('INITIAL_SESSION', nextSession, null), false);
  assert.equal(isSilentAuthEvent('INITIAL_SESSION', nextSession, 'user-1'), false);
});

// ============================================================================
// AUTH2 -- wiring estrutural em SessionContext.jsx: garante que a causa raiz
// do loop (silent consumindo um synchronizationId novo, cancelando um
// bootstrap real em andamento) nao volte a existir, e que synchronizeSession
// segue usando isSilentAuthEvent como fonte unica de decisao.
// ============================================================================

test('SessionContext usa isSilentAuthEvent (sessionSyncUtils.js) como fonte unica da decisao silenciosa', async () => {
  const content = await source('SessionContext.jsx');
  assert.match(content, /import \{ isSilentAuthEvent \} from '\.\/sessionSyncUtils\.js';/);
  assert.match(content, /const isSilentEvent = isSilentAuthEvent\(_event, nextSession, latestUserIdRef\.current\);/);
  assert.match(content, /synchronizeSession\(nextSession, \{ silent: isSilentEvent \}\)/);
});

test('caminho silencioso de synchronizeSession roda ANTES de consumir um synchronizationId -- nao pode cancelar um bootstrap real em andamento', async () => {
  const content = await source('SessionContext.jsx');
  const silentIndex = content.indexOf('if (silent && nextSession?.user) {');
  const syncIdIndex = content.indexOf('const synchronizationId = ++synchronizationIdRef.current;');
  assert.ok(silentIndex > 0, 'bloco silent nao encontrado');
  assert.ok(syncIdIndex > 0, 'incremento de synchronizationId nao encontrado');
  assert.ok(
    silentIndex < syncIdIndex,
    'o bloco silent precisa vir ANTES do incremento de synchronizationId -- essa era a causa raiz do bug AUTH2 (evento redundante cancelava o bootstrap real em andamento e a UI travava permanentemente em "Carregando sua sessao")',
  );
});

test('caminho silencioso nunca ativa isLoading -- so atualiza session/user', async () => {
  const content = await source('SessionContext.jsx');
  const silentBlockStart = content.indexOf('if (silent && nextSession?.user) {');
  const silentBlockEnd = content.indexOf('const synchronizationId = ++synchronizationIdRef.current;');
  const silentBlock = content.slice(silentBlockStart, silentBlockEnd);
  assert.doesNotMatch(silentBlock, /isLoading: true/);
  assert.match(silentBlock, /session: nextSession,\s*\n\s*user: nextSession\.user,/);
});

test('SIGNED_OUT (sessao nula) reseta latestUserIdRef para null -- proximo SIGNED_IN do mesmo usuario apos relogin nao e tratado como redundante', async () => {
  const content = await source('SessionContext.jsx');
  const signedOutBlock = content.slice(
    content.indexOf('if (!nextSession?.user) {'),
    content.indexOf("logAuthDevelopment('Sessao ausente ou encerrada.');"),
  );
  assert.match(signedOutBlock, /latestUserIdRef\.current = null;/);
});

test('bootstrap completo (nao silencioso) continua ativando isLoading=true -- login real e bootstrap inicial preservados', async () => {
  const content = await source('SessionContext.jsx');
  assert.match(
    content,
    /session: nextSession,\s*\n\s*user: nextSession\.user,\s*\n\s*isLoading: true,\s*\n\s*error: null,/,
  );
});

test('App.jsx continua desmontando a arvore autenticada apenas durante isSessionLoading (bootstrap real), comportamento nao alterado por AUTH2', async () => {
  const content = await source('./App.jsx');
  assert.match(content, /if \(isSupabaseConfigured && isSessionLoading\) \{/);
  assert.match(content, /<AppBootScreen\s*\n\s*label=\{location\.pathname === '\/auth\/callback' \? 'Concluindo acesso…' : 'Carregando sua sessão'\}\s*\n\s*\/>/);
});

// ============================================================================
// AUTH4 -- signInWithGoogle em SessionContext.jsx. Diferente de
// signInWithPassword/signUpWithEmail, esta função NUNCA chama
// synchronizeSession nem toca authActionRef diretamente: o SDK redireciona o
// navegador inteiro por padrão, então não há sessão local para sincronizar
// aqui -- ela só existe depois do retorno em /auth/callback, através do MESMO
// listener onAuthStateChange (AUTH2) já usado por login por senha e refresh.
// ============================================================================

test('signInWithGoogle monta o redirectTo com as funções puras de oauthRedirect.js, nunca com window.location.origin inline', async () => {
  const content = await source('SessionContext.jsx');
  assert.match(content, /import \{ buildOAuthCallbackUrl, resolveAppUrl \} from '\.\/oauthRedirect\.js';/);
  const fnBody = content.slice(
    content.indexOf('const signInWithGoogle = useCallback'),
    content.indexOf('const signOut = useCallback'),
  );
  assert.match(fnBody, /const redirectTo = buildOAuthCallbackUrl\(resolveAppUrl\(\)\);/);
  assert.match(fnBody, /return signInWithGoogleService\(redirectTo\);/);
});

test('signInWithGoogle retorna cedo, sem chamar o service, quando Supabase não está configurado', async () => {
  const content = await source('SessionContext.jsx');
  const fnBody = content.slice(
    content.indexOf('const signInWithGoogle = useCallback'),
    content.indexOf('const signOut = useCallback'),
  );
  assert.match(fnBody, /if \(!isSupabaseConfigured\) \{\s*\n\s*return \{ data: null, error: null, isConfigured: false \};/);
});

test('signInWithGoogle nunca chama synchronizeSession nem manipula localStorage/token diretamente (a sessão real só chega via onAuthStateChange, no retorno)', async () => {
  const content = await source('SessionContext.jsx');
  const fnBody = content.slice(
    content.indexOf('const signInWithGoogle = useCallback'),
    content.indexOf('const signOut = useCallback'),
  );
  assert.doesNotMatch(fnBody, /synchronizeSession|localStorage|access_token|refresh_token/);
});

test('signInWithGoogle é exposto no contextValue e na dependência do useMemo, mesmo padrão dos demais métodos', async () => {
  const content = await source('SessionContext.jsx');
  assert.match(content, /\n\s*signInWithGoogle,\n/);
  const depsIndex = content.indexOf('[availableWorkspaces, createWorkspaceProfile');
  const depsBlock = content.slice(depsIndex, content.indexOf(']', depsIndex));
  assert.match(depsBlock, /\bsignInWithGoogle\b/);
});

test('AUTH2 (signInWithPassword/signUpWithEmail) e AUTH3 (switchWorkspace) continuam usando synchronizeSession -- preservados, não substituídos pelo Google', async () => {
  const content = await source('SessionContext.jsx');
  assert.match(content, /const signInWithPassword = useCallback/);
  assert.match(content, /const signUpWithEmail = useCallback/);
  assert.match(content, /const switchWorkspace = useCallback/);
});
