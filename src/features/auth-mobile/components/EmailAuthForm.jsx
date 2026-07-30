import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
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

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h18v14H3zM3 7l9 7 9-7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2" />
    </svg>
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
        <Input
          id="auth-full-name"
          label="Nome"
          value={values.fullName}
          autoComplete="name"
          placeholder="Como podemos chamar você?"
          error={errors.fullName}
          disabled={loading}
          onChange={(event) => updateValue('fullName', event.target.value)}
          fullWidth
        />
      ) : null}

      <Input
        id="auth-email"
        label="Email"
        type="email"
        value={values.email}
        autoComplete="email"
        inputMode="email"
        placeholder="voce@exemplo.com"
        leftIcon={<MailIcon />}
        error={errors.email}
        disabled={loading}
        onChange={(event) => updateValue('email', event.target.value)}
        fullWidth
      />

      <div className={styles.passwordField}>
        <label htmlFor="auth-password">Senha</label>
        <div className={errors.password ? styles.passwordControlError : styles.passwordControl}>
          <span className={styles.passwordIcon} aria-hidden="true"><LockIcon /></span>
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
        </div>
        {errors.password ? (
          <p id="auth-password-error" className={styles.fieldError}>{errors.password}</p>
        ) : null}
      </div>

      {!isSignUp ? (
        <button type="button" className={styles.forgotLink} onClick={() => onForgotPassword(values.email)}>
          Esqueci minha senha
        </button>
      ) : (
        <AuthLegalNotice
          checked={values.acceptedTerms}
          error={errors.acceptedTerms}
          disabled={loading}
          onChange={(value) => updateValue('acceptedTerms', value)}
          onLegalClick={onLegalClick}
        />
      )}

      {operationError ? <p className={styles.operationError} role="alert">{operationError}</p> : null}

      <Button type="submit" size="lg" fullWidth loading={loading}>
        {isSignUp ? 'Criar conta' : 'Entrar'}
      </Button>
    </form>
  );
}

export default EmailAuthForm;
