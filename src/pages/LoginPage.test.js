import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// AUTH4 -- LoginPage.jsx passou de re-export puro para um wrapper real, que
// injeta o login com Google em MobileAuthPage via a MESMA prop onGoogleAuth
// que já existia desde a UX1 (sem criar uma segunda função de social auth).
// Apple não é renderizado enquanto o provedor não está disponível.
// ============================================================================

// GOOGLE DIRETO NA TELA DE BOAS-VINDAS: handleGoogleAuth passou a chamar o
// hook compartilhado useGoogleAuthRedirect (mesma implementação real usada
// pelo card "Já tenho conta" em WelcomeDecisionPage.jsx) -- nunca duas
// implementações divergentes do mesmo fluxo OAuth. A lógica real
// (signInWithGoogle de useSession(), saveAuthReturnPath,
// getGoogleAuthFeedback) agora vive só em useGoogleAuthRedirect.js.
test('usa o hook compartilhado useGoogleAuthRedirect -- nunca chama supabase.auth nem signInWithGoogle diretamente nesta camada', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(page, /import \{ useGoogleAuthRedirect \} from '\.\.\/features\/auth-mobile\/useGoogleAuthRedirect\.js';/);
  assert.match(page, /const \{ startGoogleAuth \} = useGoogleAuthRedirect\(\);/);
  assert.doesNotMatch(page, /supabase\.auth|createClient\(|signInWithGoogle\(\)/);
});

test('handleGoogleAuth repassa o resultado de startGoogleAuth, nunca expõe o erro cru', async () => {
  const page = await source('LoginPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleGoogleAuth'), page.indexOf('return (\n    <MobileAuthPage'));
  assert.match(fnBody, /const result = await startGoogleAuth\(location\.state\?\.from\);/);
  assert.match(fnBody, /return \{ message: result\.message \};/);
});

test('injeta onGoogleAuth e destino seguro em MobileAuthPage, sem Apple', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(page, /<MobileAuthPage\s*\n\s*onGoogleAuth=\{handleGoogleAuth\}/);
  assert.match(page, /returnTo=\{returnTo\}/);
  assert.doesNotMatch(page, /onAppleAuth=/);
});

test('Google salva o destino seguro antes do redirect externo (dentro de useGoogleAuthRedirect, chamado por LoginPage)', async () => {
  const hook = await source('../features/auth-mobile/useGoogleAuthRedirect.js');
  const fnBody = hook.slice(hook.indexOf('async function startGoogleAuth'));
  assert.match(fnBody, /saveAuthReturnPath\(returnTo\);/);
  assert.ok(fnBody.indexOf('saveAuthReturnPath(returnTo)') < fnBody.indexOf('await signInWithGoogle()'));
});

test('login com email, cadastro e recuperação de senha continuam intocados -- MobileAuthPage é reaproveitada, não substituída', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(page, /import \{ MobileAuthPage \} from '\.\.\/features\/auth-mobile';/);
});

test('feedback de falha do OAuth (retorno de /auth/callback via state.oauthFailed) é repassado como initialFeedback, sem expor detalhe técnico', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(
    page,
    /initialFeedback=\{location\.state\?\.oauthFailed\s*\n\s*\? 'Não foi possível concluir o acesso com Google\. Tente novamente\.'\s*\n\s*: ''\}/,
  );
});

test('não usa texto "Entrar com IA" nem qualquer copy de IA no botão de Google (exigência explícita da AUTH4)', async () => {
  const page = await source('LoginPage.jsx');
  assert.doesNotMatch(page, /Entrar com IA/i);
});
