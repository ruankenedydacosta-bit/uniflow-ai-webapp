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

test('usa signInWithGoogle de useSession() -- nunca chama supabase.auth diretamente nesta camada', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(page, /const \{ signInWithGoogle \} = useSession\(\);/);
  assert.doesNotMatch(page, /supabase\.auth|createClient\(/);
});

test('handleGoogleAuth converte o erro do service em mensagem segura via getGoogleAuthFeedback, nunca expõe o erro cru', async () => {
  const page = await source('LoginPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleGoogleAuth'), page.indexOf('return (\n    <MobileAuthPage'));
  assert.match(fnBody, /const result = await signInWithGoogle\(\);/);
  assert.match(fnBody, /const feedback = getGoogleAuthFeedback\(result\?\.error\);/);
  assert.match(fnBody, /return \{ message: feedback \?\? '' \};/);
});

test('injeta onGoogleAuth e destino seguro em MobileAuthPage, sem Apple', async () => {
  const page = await source('LoginPage.jsx');
  assert.match(page, /<MobileAuthPage\s*\n\s*onGoogleAuth=\{handleGoogleAuth\}/);
  assert.match(page, /returnTo=\{returnTo\}/);
  assert.doesNotMatch(page, /onAppleAuth=/);
});

test('Google salva o destino seguro antes do redirect externo', async () => {
  const page = await source('LoginPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleGoogleAuth'), page.indexOf('return (\n    <MobileAuthPage'));
  assert.match(fnBody, /saveAuthReturnPath\(returnTo\);/);
  assert.ok(fnBody.indexOf('saveAuthReturnPath(returnTo)') < fnBody.indexOf('signInWithGoogle()'));
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
