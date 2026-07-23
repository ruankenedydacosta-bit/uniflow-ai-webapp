import { useState } from 'react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { validateForgotPasswordForm } from '../passwordRecoveryUtils.js';
import styles from '../authMobile.module.css';

/**
 * Formulario minimo de solicitacao de recuperacao de senha (AUTH1): so
 * e-mail. Componente puramente visual -- delega a validacao a
 * passwordRecoveryUtils.js e o envio a onSubmit(email), fornecido por
 * MobileAuthPage.jsx (que usa useSession().requestPasswordReset).
 */
function ForgotPasswordForm({ initialEmail = '', loading = false, feedback, feedbackTone, onSubmit, onBack }) {
  const [email, setEmail] = useState(initialEmail);
  const [validationError, setValidationError] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;

    const validationMessage = validateForgotPasswordForm(email);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    onSubmit(email.trim());
  }

  return (
    <form className={styles.emailForm} onSubmit={handleSubmit} noValidate>
      <Input
        id="forgot-password-email"
        label="E-mail"
        type="email"
        value={email}
        autoComplete="email"
        inputMode="email"
        placeholder="voce@exemplo.com"
        error={validationError}
        disabled={loading}
        onChange={(event) => setEmail(event.target.value)}
        fullWidth
      />

      {feedback ? (
        <p
          role={feedbackTone === 'alert' ? 'alert' : 'status'}
          className={feedbackTone === 'alert' ? styles.operationError : styles.feedback}
        >
          {feedback}
        </p>
      ) : null}

      <Button type="submit" size="lg" fullWidth loading={loading}>
        Enviar instruções
      </Button>

      <button type="button" className={styles.forgotLink} onClick={onBack} disabled={loading}>
        Voltar ao login
      </button>
    </form>
  );
}

export default ForgotPasswordForm;
