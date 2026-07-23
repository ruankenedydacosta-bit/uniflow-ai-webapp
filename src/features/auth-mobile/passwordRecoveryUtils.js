// Logica pura de recuperacao/redefinicao de senha (AUTH1): validacao de
// e-mail (reaproveita isValidEmail de authMobileValidator.js), validacao da
// nova senha (mesma politica minima ja aplicada no cadastro -- nao inventa
// requisito diferente), montagem da URL de redirect e mensagens seguras
// (nunca revelam se uma conta existe, nunca expoem detalhe interno do
// Supabase). Sem dependencia de React/Supabase -- testavel via node --test.

import { isValidEmail } from './authMobileValidator.js';

export const PASSWORD_RESET_REDIRECT_PATH = '/redefinir-senha';

// Mesma politica minima ja aplicada no cadastro (authMobileValidator.js,
// validateAuthForm): senha de cadastro exige >= 8 caracteres. Redefinicao
// usa exatamente o mesmo limite, nunca um valor diferente.
const MIN_PASSWORD_LENGTH = 8;

/** `${origin}/redefinir-senha` -- nunca hardcoda dominio (dev/preview/produção). */
export function buildPasswordResetRedirectUrl(origin) {
  return `${origin}${PASSWORD_RESET_REDIRECT_PATH}`;
}

export function validateForgotPasswordForm(email) {
  if (!isValidEmail(email)) {
    return 'Informe um email válido.';
  }
  return null;
}

/**
 * Retorna null quando o formulario e valido, ou a primeira mensagem de
 * erro encontrada. Senhas devem coincidir; mesma politica minima do
 * cadastro (>= 8 caracteres).
 */
export function validateResetPasswordForm({ password, confirmPassword } = {}) {
  if (!password) {
    return 'Informe a nova senha.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'Use pelo menos 8 caracteres.';
  }
  if (!confirmPassword) {
    return 'Confirme a nova senha.';
  }
  if (password !== confirmPassword) {
    return 'As senhas não coincidem.';
  }
  return null;
}

// Mensagem neutra e fixa -- nunca revela se a conta existe (evita
// enumeracao de contas por e-mail). resetPasswordForEmail do Supabase, por
// padrao, ja resolve com sucesso mesmo para e-mail inexistente; por isso a
// mesma mensagem cobre os dois casos reais (conta existe / nao existe).
export const PASSWORD_RESET_REQUEST_MESSAGE =
  'Se existir uma conta com este e-mail, enviaremos as instruções de recuperação.';

// Um error aqui normalmente significa falha tecnica (limite de taxa, rede,
// Supabase nao configurado) -- nunca "conta nao encontrada". A mensagem
// permanece generica de qualquer forma, nunca expõe o texto cru do erro.
const PASSWORD_RESET_REQUEST_ERROR_MESSAGE =
  'Não foi possível enviar as instruções agora. Tente novamente em instantes.';

/** { tone: 'status' | 'alert', message } -- nunca deriva de error.message cru. */
export function getPasswordResetRequestFeedback(error) {
  if (!error) {
    return { tone: 'status', message: PASSWORD_RESET_REQUEST_MESSAGE };
  }
  return { tone: 'alert', message: PASSWORD_RESET_REQUEST_ERROR_MESSAGE };
}

const PASSWORD_UPDATE_ERROR_MESSAGE =
  'Não foi possível atualizar sua senha agora. Tente novamente.';

/** Mensagem segura e fixa para qualquer falha de updatePassword -- nunca error.message cru. */
export function getPasswordUpdateErrorMessage(error) {
  if (!error) return '';
  return PASSWORD_UPDATE_ERROR_MESSAGE;
}
