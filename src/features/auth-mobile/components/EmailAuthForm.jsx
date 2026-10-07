import { useState } from 'react';
import Button from '../../../components/ui/Button';
import {
  PhEnvelopeSimpleIcon,
  PhLockKeyIcon,
  PhUserIcon,
} from '../../simplified-app/SimplifiedIcons.jsx';
import { AUTH_MODES } from '../authMobileSchema.js';
import { validateAuthForm } from '../authMobileValidator.js';
import AuthLegalNotice from './AuthLegalNotice.jsx';
import styles from '../authMobile.module.css';

const INITIAL_VALUES = Object.freeze({
  fullName: '',
  email: '',
  password: '',
  acceptedTerms: false,
});

// Fase 3 do redesign (#90): campo do handoff -- rótulo de 12px e caixa de
// 46px com ícone à esquerda. O erro sai abaixo, ligado ao input por
// aria-describedby.
function AuthField({ id, label, icon, error, children }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
      <div className={error ? styles.fieldControlError : styles.fieldControl}>
        <span className={styles.fieldIcon} aria-hidden="true">{icon}</span>
        {children}
      </div>
      {error ? <p id={`${id}-error`} className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

function EmailAuthForm({ mode, loading, operationError, onSubmit, onForgotPassword, onLegalClick }) {
  const [values, setValues] = useState(INITIAL_VALUES);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const isSignUp = mode === AUTH_MODES.SIGN_UP;

  function updateValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const validation = validateAuthForm(values, mode);
    setErrors(validation.errors);
    if (validation.valid) onSubmit({ ...values });
  }

  return (
    <form className={styles.emailForm} onSubmit={handleSubmit} noValidate>
      {isSignUp ? (
        <AuthField id="auth-full-name" label="Nome" icon={<PhUserIcon />} error={errors.fullName}>
          <input
            id="auth-full-name"
            type="text"
            value={values.fullName}
            autoComplete="name"
            placeholder="Como podemos chamar você?"
            disabled={loading}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? 'auth-full-name-error' : undefined}
            onChange={(event) => updateValue('fullName', event.target.value)}
          />
        </AuthField>
      ) : null}

      <AuthField id="auth-email" label="E-mail" icon={<PhEnvelopeSimpleIcon />} error={errors.email}>
        <input
          id="auth-email"
          type="email"
          value={values.email}
          autoComplete="email"
          inputMode="email"
          placeholder="voce@email.com"
          disabled={loading}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'auth-email-error' : undefined}
          onChange={(event) => updateValue('email', event.target.value)}
        />
      </AuthField>

      <AuthField id="auth-password" label="Senha" icon={<PhLockKeyIcon />} error={errors.password}>
        <input
          id="auth-password"
          type={showPassword ? 'text' : 'password'}
          value={values.password}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          placeholder={isSignUp ? 'Pelo menos 8 caracteres' : 'Sua senha'}
          disabled={loading}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'auth-password-error' : undefined}
          onChange={(event) => updateValue('password', event.target.value)}
        />
        <button
          type="button"
          className={styles.passwordToggle}
          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={showPassword}
          onClick={() => setShowPassword((visible) => !visible)}
        >
          {showPassword ? 'Ocultar' : 'Mostrar'}
        </button>
      </AuthField>

      {isSignUp ? (
        <AuthLegalNotice
          checked={values.acceptedTerms}
          error={errors.acceptedTerms}
          disabled={loading}
          onChange={(value) => updateValue('acceptedTerms', value)}
          onLegalClick={onLegalClick}
        />
      ) : null}

      {operationError ? <p className={styles.operationError} role="alert">{operationError}</p> : null}

      <Button type="submit" size="lg" fullWidth loading={loading}>
        {isSignUp ? 'Criar conta' : 'Entrar'}
      </Button>

      {!isSignUp ? (
        <button type="button" className={styles.forgotLink} onClick={() => onForgotPassword(values.email)}>
          Esqueci minha senha
        </button>
      ) : null}
    </form>
  );
}

export default EmailAuthForm;
