import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/SessionContext.jsx';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import {
  getPasswordUpdateErrorMessage,
  validateResetPasswordForm,
} from '../features/auth-mobile/passwordRecoveryUtils.js';
import styles from './ResetPasswordPage.module.css';

const SESSION_STATES = Object.freeze({
  CHECKING: 'checking',
  VALID: 'valid',
  INVALID: 'invalid',
});

/**
 * Rota publica de redefinicao de senha (AUTH1). O Supabase estabelece uma
 * sessao temporaria de recuperacao ao abrir o link recebido por e-mail --
 * essa sessao ja aparece aqui via useSession() (SessionContext escuta
 * onAuthStateChange no nivel do App e sincroniza state.session
 * normalmente). Nunca le/parseia token da URL manualmente -- o SDK ja fez
 * isso antes deste componente montar.
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const { isLoading, isSupabaseConfigured, session, signOut, updatePassword } = useSession();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [validationError, setValidationError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  // Trava sincrona contra duplo submit -- mesmo padrao de mutationRef ja
  // usado em useClients.js/useAgenda.js/useTransactions.js.
  const submitRef = useRef(false);

  const sessionState = !isSupabaseConfigured
    ? SESSION_STATES.INVALID
    : isLoading
      ? SESSION_STATES.CHECKING
      : session
        ? SESSION_STATES.VALID
        : SESSION_STATES.INVALID;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitRef.current) return;

    const validationMessage = validateResetPasswordForm(form);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }
    setValidationError(null);
    setSubmitError(null);

    submitRef.current = true;
    setIsSubmitting(true);

    try {
      const result = await updatePassword(form.password);

      if (result?.error) {
        setSubmitError(getPasswordUpdateErrorMessage(result.error));
        return;
      }

      setIsSuccess(true);
      // Encerra a sessao de recuperacao e manda o usuario entrar de novo
      // com a nova senha -- evita ambiguidade entre "sessao de recovery" e
      // "sessao normal" (preferencia explicita desta fase). Sequencial,
      // sem race condition entre atualizar/sair/navegar.
      await signOut();
      navigate('/login', { replace: true, state: { passwordUpdated: true } });
    } catch {
      setSubmitError(getPasswordUpdateErrorMessage({ code: 'UNEXPECTED' }));
    } finally {
      submitRef.current = false;
      setIsSubmitting(false);
    }
  }

  let content;

  if (sessionState === SESSION_STATES.CHECKING) {
    content = (
      <p role="status" className={styles.message}>
        Verificando o link de recuperação...
      </p>
    );
  } else if (sessionState === SESSION_STATES.INVALID) {
    content = (
      <div className={styles.invalidState}>
        <p role="alert" className={styles.message}>
          Este link de recuperação é inválido ou já expirou.
        </p>
        <Button variant="secondary" onClick={() => navigate('/login')}>
          Voltar ao login
        </Button>
      </div>
    );
  } else {
    content = (
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <Input
          id="reset-password-new"
          label="Nova senha"
          type="password"
          value={form.password}
          autoComplete="new-password"
          placeholder="Pelo menos 8 caracteres"
          disabled={isSubmitting}
          onChange={(event) => updateField('password', event.target.value)}
          fullWidth
        />
        <Input
          id="reset-password-confirm"
          label="Confirmar nova senha"
          type="password"
          value={form.confirmPassword}
          autoComplete="new-password"
          placeholder="Repita a nova senha"
          disabled={isSubmitting}
          onChange={(event) => updateField('confirmPassword', event.target.value)}
          fullWidth
        />

        {validationError || submitError ? (
          <p role="alert" className={styles.error}>
            {validationError || submitError}
          </p>
        ) : null}

        {isSuccess ? (
          <p role="status" className={styles.success}>
            Senha atualizada com sucesso.
          </p>
        ) : null}

        <Button type="submit" size="lg" fullWidth loading={isSubmitting}>
          Salvar nova senha
        </Button>
      </form>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="reset-password-title">
        <h1 id="reset-password-title">Redefinir senha</h1>
        {content}
      </section>
    </main>
  );
}

export default ResetPasswordPage;
