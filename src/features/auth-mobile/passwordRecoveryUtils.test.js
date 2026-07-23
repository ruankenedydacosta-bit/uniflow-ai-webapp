import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASSWORD_RESET_REDIRECT_PATH,
  PASSWORD_RESET_REQUEST_MESSAGE,
  buildPasswordResetRedirectUrl,
  getPasswordResetRequestFeedback,
  getPasswordUpdateErrorMessage,
  validateForgotPasswordForm,
  validateResetPasswordForm,
} from './passwordRecoveryUtils.js';

// --- buildPasswordResetRedirectUrl ------------------------------------------

test('buildPasswordResetRedirectUrl monta a URL a partir do origin recebido, nunca hardcoded', () => {
  assert.equal(buildPasswordResetRedirectUrl('https://app.uniflow.ai'), 'https://app.uniflow.ai/redefinir-senha');
  assert.equal(buildPasswordResetRedirectUrl('http://localhost:5173'), 'http://localhost:5173/redefinir-senha');
});

test('PASSWORD_RESET_REDIRECT_PATH e a mesma rota registrada em routes.jsx', () => {
  assert.equal(PASSWORD_RESET_REDIRECT_PATH, '/redefinir-senha');
});

// --- validateForgotPasswordForm ---------------------------------------------

test('validateForgotPasswordForm rejeita e-mail vazio ou invalido', () => {
  assert.equal(validateForgotPasswordForm(''), 'Informe um email válido.');
  assert.equal(validateForgotPasswordForm('nao-e-email'), 'Informe um email válido.');
});

test('validateForgotPasswordForm aceita e-mail valido', () => {
  assert.equal(validateForgotPasswordForm('pessoa@uniflow.ai'), null);
});

// --- validateResetPasswordForm ----------------------------------------------

test('validateResetPasswordForm rejeita senha vazia', () => {
  assert.equal(validateResetPasswordForm({ password: '', confirmPassword: '' }), 'Informe a nova senha.');
});

test('validateResetPasswordForm rejeita senha curta (mesma politica minima do cadastro: 8 caracteres)', () => {
  assert.equal(validateResetPasswordForm({ password: '1234567', confirmPassword: '1234567' }), 'Use pelo menos 8 caracteres.');
});

test('validateResetPasswordForm rejeita confirmacao vazia', () => {
  assert.equal(validateResetPasswordForm({ password: '12345678', confirmPassword: '' }), 'Confirme a nova senha.');
});

test('validateResetPasswordForm rejeita senhas diferentes', () => {
  assert.equal(validateResetPasswordForm({ password: '12345678', confirmPassword: '87654321' }), 'As senhas não coincidem.');
});

test('validateResetPasswordForm aceita senhas iguais e validas', () => {
  assert.equal(validateResetPasswordForm({ password: '12345678', confirmPassword: '12345678' }), null);
});

test('validateResetPasswordForm com objeto ausente nao lanca excecao', () => {
  assert.doesNotThrow(() => validateResetPasswordForm());
  assert.equal(validateResetPasswordForm(), 'Informe a nova senha.');
});

// --- getPasswordResetRequestFeedback ----------------------------------------

test('getPasswordResetRequestFeedback sem erro usa a mensagem neutra fixa (sucesso)', () => {
  const feedback = getPasswordResetRequestFeedback(null);
  assert.equal(feedback.tone, 'status');
  assert.equal(feedback.message, PASSWORD_RESET_REQUEST_MESSAGE);
});

test('getPasswordResetRequestFeedback com erro tecnico NAO revela existencia de conta', () => {
  const feedback = getPasswordResetRequestFeedback({ message: 'user not found' });
  assert.doesNotMatch(feedback.message, /não encontrad|not found|usuário/i);
  assert.equal(feedback.tone, 'alert');
});

test('getPasswordResetRequestFeedback nunca retorna error.message cru', () => {
  const rawMessage = 'RAW_SUPABASE_INTERNAL_DETAIL_12345';
  const feedback = getPasswordResetRequestFeedback({ message: rawMessage });
  assert.doesNotMatch(feedback.message, new RegExp(rawMessage));
});

// --- getPasswordUpdateErrorMessage ------------------------------------------

test('getPasswordUpdateErrorMessage sem erro retorna string vazia', () => {
  assert.equal(getPasswordUpdateErrorMessage(null), '');
});

test('getPasswordUpdateErrorMessage com erro retorna mensagem segura, nunca crua', () => {
  const rawMessage = 'Password should be at least 6 characters (supabase internal)';
  const message = getPasswordUpdateErrorMessage({ message: rawMessage });
  assert.doesNotMatch(message, new RegExp(rawMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(message.length > 0);
});
