import { AUTH_MODES, normalizeAuthMode } from './authMobileSchema.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(typeof value === 'string' ? value.trim() : '');
}

export function validateAuthForm(values = {}, mode) {
  const normalizedMode = normalizeAuthMode(mode);
  const errors = {};
  if (normalizedMode === AUTH_MODES.SIGN_UP && String(values.fullName ?? '').trim().length < 2) {
    errors.fullName = 'Informe seu nome.';
  }
  if (!isValidEmail(values.email)) errors.email = 'Informe um email válido.';
  if (!values.password) {
    errors.password = 'Informe sua senha.';
  } else if (normalizedMode === AUTH_MODES.SIGN_UP && values.password.length < 8) {
    errors.password = 'Use pelo menos 8 caracteres.';
  }
  if (normalizedMode === AUTH_MODES.SIGN_UP && values.acceptedTerms !== true) {
    errors.acceptedTerms = 'Aceite os Termos de Uso e a Política de Privacidade.';
  }
  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    errors: Object.freeze(errors),
  });
}
