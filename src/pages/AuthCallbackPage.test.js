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

// GOOGLE DIRETO NA TELA DE BOAS-VINDAS: falha/cancelamento do OAuth volta
// para /welcome (não mais /login), já que é o card "Já tenho conta" quem
// inicia o Google diretamente agora, sem passar por /login antes.
test('erro do provedor (?error / ?error_description) ou erro de sessão volta para /welcome com feedback seguro, via state', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /const oauthError = searchParams\.get\('error'\) \|\| searchParams\.get\('error_description'\);/);
  assert.match(
    page,
    /if \(oauthError \|\| sessionError\) \{\s*\n\s*return <Navigate to="\/welcome" replace state=\{\{ oauthFailed: true, from: returnTo \}\} \/>;/,
  );
});

test('sem sessão (modo demo, sem Supabase configurado) volta para /welcome sem state de erro', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /if \(!session\) \{\s*\n[\s\S]*?return <Navigate to="\/welcome" replace \/>;/);
});

// GUARD FIX: onboarding legado removido -- AuthCallbackPage não precisa
// mais decidir entre onboarding/destino aqui. Ela sempre navega direto para
// o destino salvo; App.jsx é quem decide o resto (apresentação -> Plano
// Pessoal -> pagamento -> Home só com assinatura ativa), reaplicado a CADA
// navegação, inclusive na que esta página dispara -- nenhuma lógica
// duplicada, nenhum segundo bootstrap.
test('sessão presente sempre navega para o destino salvo -- App.jsx decide apresentação/Plano Pessoal/Home a partir daí', async () => {
  const page = await source('AuthCallbackPage.jsx');
  assert.match(page, /const destination = consumeAuthReturnPath\(\);/);
  assert.match(page, /return <Navigate to=\{destination\} replace \/>;/);
  // Checa só o corpo da função (nunca o comentário JSDoc, que cita
  // "onboarding" ao explicar a decisão de design) -- o código em si nunca
  // referencia needsOnboarding nem uma rota /onboarding.
  const codeBody = page.slice(page.indexOf('function AuthCallbackPage'));
  assert.doesNotMatch(codeBody, /needsOnboarding|\/onboarding/);
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
  assert.match(page, /const \{ error: sessionError, session \} = useSession\(\);/);
});
