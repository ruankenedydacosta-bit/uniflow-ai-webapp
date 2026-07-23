import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('estado inicial de email vem de initialEmail (email ja digitado no login e reaproveitado)', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /function ForgotPasswordForm\(\{ initialEmail = '', loading = false, feedback, feedbackTone, onSubmit, onBack \}\)/);
  assert.match(content, /const \[email, setEmail\] = useState\(initialEmail\);/);
});

test('submit valida com validateForgotPasswordForm antes de chamar onSubmit -- nunca chama Supabase diretamente', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /import \{ validateForgotPasswordForm \} from '\.\.\/passwordRecoveryUtils\.js';/);
  assert.match(content, /const validationMessage = validateForgotPasswordForm\(email\);/);
  assert.match(content, /onSubmit\(email\.trim\(\)\);/);
  assert.doesNotMatch(content, /supabase|resetPasswordForEmail/i);
});

test('submit ignora cliques durante loading (protege contra duplo clique/duplo submit)', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  const fnBody = content.slice(content.indexOf('function handleSubmit'), content.indexOf('return ('));
  assert.match(fnBody, /if \(loading\) return;/);
});

test('botao de envio fica em loading -- Button ja desabilita nesse estado', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /<Button type="submit" size="lg" fullWidth loading=\{loading\}>/);
});

test('botao "Voltar ao login" existe, chama onBack e fica desabilitado durante loading', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /<button type="button" className=\{styles\.forgotLink\} onClick=\{onBack\} disabled=\{loading\}>\s*\n\s*Voltar ao login/);
});

test('feedback usa role="alert" para tone alert e role="status" para os demais (nunca depende so de cor)', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /role=\{feedbackTone === 'alert' \? 'alert' : 'status'\}/);
});

test('campo de e-mail tem label associado (id/label via componente Input compartilhado)', async () => {
  const content = await source('ForgotPasswordForm.jsx');
  assert.match(content, /id="forgot-password-email"/);
  assert.match(content, /label="E-mail"/);
});
