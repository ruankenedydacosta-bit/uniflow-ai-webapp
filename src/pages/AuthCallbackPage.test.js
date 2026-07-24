import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// AUTH4 -- rota de retorno do login com Google. O Supabase (PKCE +
// detectSessionInUrl, ambos padrão do SDK) já processa a sessão e limpa a URL
// sozinho -- esta página só decide para onde navegar, sem manipular token ou
// query string manualmente.
// ============================================================================

test('nunca lê/manipula token ou código OAuth da URL manualmente -- confia inteiramente no SDK', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.doesNotMatch(page, /access_token|refresh_token|localStorage|exchangeCodeForSession|searchParams\.get\('code'\)/);
});

test('erro do provedor (?error / ?error_description) ou erro de sessão volta para /login com feedback seguro, via state', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /const oauthError = searchParams\.get\('error'\) \|\| searchParams\.get\('error_description'\);/);
  assert.match(
    page,
    /if \(oauthError \|\| sessionError\) \{\s*\n\s*return <Navigate to="\/login" replace state=\{\{ oauthFailed: true \}\} \/>;/,
  );
});

test('sem sessão (modo demo, sem Supabase configurado) volta para /login sem state de erro', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /if \(!session\) \{\s*\n[\s\S]*?return <Navigate to="\/login" replace \/>;/);
});

test('sessão presente decide entre /onboarding e /dashboard reaproveitando needsOnboarding (AUTH2), sem lógica paralela', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /return <Navigate to=\{needsOnboarding \? '\/onboarding' : '\/dashboard'\} replace \/>;/);
});

test('usa <Navigate> declarativo, nunca useEffect + navigate imperativo -- evita redirecionamento repetido/loop', async () => {
  const page = await source('AuthCallbackPage.jsx');
  const codeBody = page.slice(page.indexOf('function AuthCallbackPage'));
  assert.doesNotMatch(codeBody, /useEffect/);
  assert.doesNotMatch(codeBody, /useNavigate/);
  assert.match(codeBody, /<Navigate/);
});

test('deriva o estado inteiramente de useSession() (mesmo contexto usado por App.jsx/AUTH2), sem criar um segundo bootstrap', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /const \{ error: sessionError, needsOnboarding, session \} = useSession\(\);/);
});
