import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Sessao de recuperacao
// ============================================================================

test('sessionState deriva de useSession() -- CHECKING/VALID/INVALID, nunca le token da URL manualmente', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /const \{ isLoading, isSupabaseConfigured, session, signOut, updatePassword \} = useSession\(\);/);
  assert.match(
    page,
    /const sessionState = !isSupabaseConfigured\s*\n\s*\? SESSION_STATES\.INVALID\s*\n\s*: isLoading\s*\n\s*\? SESSION_STATES\.CHECKING\s*\n\s*: session\s*\n\s*\? SESSION_STATES\.VALID\s*\n\s*: SESSION_STATES\.INVALID;/,
  );
  assert.doesNotMatch(page, /access_token|refresh_token|location\.hash|searchParams\.get\('code'\)/);
});

test('sem sessao valida (link invalido/expirado) mostra estado claro com volta ao login, nunca o formulario', async () => {
  const page = await source('ResetPasswordPage.jsx');
  const invalidBlock = page.slice(page.indexOf("SESSION_STATES.INVALID) {"), page.indexOf('} else {'));
  assert.match(invalidBlock, /Este link de recuperação é inválido ou já expirou\./);
  assert.match(invalidBlock, /onClick=\{\(\) => navigate\('\/login'\)\}/);
});

test('estado de verificacao usa role="status", nunca mostra o formulario antes de confirmar a sessao', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /Verificando o link de recuperação\.\.\./);
  const checkingBlock = page.slice(page.indexOf('CHECKING) {'), page.indexOf('} else if'));
  assert.match(checkingBlock, /role="status"/);
});

// ============================================================================
// Validacao e submit
// ============================================================================

test('submit valida com validateResetPasswordForm antes de chamar updatePassword', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /import \{\s*\n\s*getPasswordUpdateErrorMessage,\s*\n\s*validateResetPasswordForm,\s*\n\s*\} from '\.\.\/features\/auth-mobile\/passwordRecoveryUtils\.js';/);
  const fnBody = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('let content;'));
  assert.match(fnBody, /const validationMessage = validateResetPasswordForm\(form\);/);
  assert.match(fnBody, /if \(validationMessage\) \{\s*\n\s*setValidationError\(validationMessage\);\s*\n\s*return;/);
});

test('submit chama useSession().updatePassword uma unica vez, nunca chama Supabase diretamente', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /const result = await updatePassword\(form\.password\);/);
  assert.doesNotMatch(page, /supabase\.auth|createClient\(/);
});

test('duplo submit e bloqueado por trava sincrona (submitRef)', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /const submitRef = useRef\(false\);/);
  const fnBody = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('let content;'));
  assert.match(fnBody, /if \(submitRef\.current\) return;/);
  assert.match(fnBody, /submitRef\.current = true;/);
  assert.match(fnBody, /submitRef\.current = false;/);
});

test('erro do service e exibido via getPasswordUpdateErrorMessage, nunca a mensagem crua do Supabase', async () => {
  const page = await source('ResetPasswordPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('let content;'));
  assert.match(fnBody, /if \(result\?\.error\) \{\s*\n\s*setSubmitError\(getPasswordUpdateErrorMessage\(result\.error\)\);\s*\n\s*return;/);
});

test('sucesso encerra a sessao (signOut) e navega para /login com feedback, sem race condition (sequencial)', async () => {
  const page = await source('ResetPasswordPage.jsx');
  const fnBody = page.slice(page.indexOf('async function handleSubmit'), page.indexOf('let content;'));
  assert.match(fnBody, /setIsSuccess\(true\);/);
  assert.match(fnBody, /await signOut\(\);/);
  assert.match(fnBody, /navigate\('\/login', \{ replace: true, state: \{ passwordUpdated: true \} \}\);/);
  const signOutIndex = fnBody.indexOf('await signOut();');
  const navigateIndex = fnBody.indexOf("navigate('/login'");
  assert.ok(signOutIndex >= 0 && navigateIndex > signOutIndex, 'signOut deve ocorrer antes do navigate, nunca em paralelo');
});

// ============================================================================
// Formulario e acessibilidade
// ============================================================================

test('campos "Nova senha" e "Confirmar nova senha" existem com label associado', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /id="reset-password-new"/);
  assert.match(page, /label="Nova senha"/);
  assert.match(page, /id="reset-password-confirm"/);
  assert.match(page, /label="Confirmar nova senha"/);
});

test('erro de validacao/submit usa role="alert"', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /\{validationError \|\| submitError \? \(\s*\n\s*<p role="alert"/);
});

test('nenhum alert\\(\\) e usado -- feedback sempre inline', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.doesNotMatch(page, /\balert\(/);
});

test('botao de submit fica em loading (desabilita e evita reenvio) durante isSubmitting', async () => {
  const page = await source('ResetPasswordPage.jsx');
  assert.match(page, /<Button type="submit" size="lg" fullWidth loading=\{isSubmitting\}>/);
});
