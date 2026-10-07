import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/SessionContext';
import Button from '../../../components/ui/Button';
import { UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import { PRESENTATION_ROUTE } from '../../presentation';
import { ensureAppFont } from '../../simplified-app/appFont.js';
import EmailAuthForm from '../components/EmailAuthForm.jsx';
import ForgotPasswordForm from '../components/ForgotPasswordForm.jsx';
import SocialAuthButtons from '../components/SocialAuthButtons.jsx';
import { AUTH_MODES, getGoogleAuthFeedback, normalizeAuthMode } from '../authMobileSchema.js';
import { getPasswordResetRequestFeedback } from '../passwordRecoveryUtils.js';
import { createGa4SignUpViewedLifecycle } from '../../analytics/ga4ProductEvents.js';
import { useAnalyticsConsent } from '../../analytics/useAnalyticsConsent.js';
import styles from '../authMobile.module.css';

const POST_SIGN_UP_DESTINATION = PRESENTATION_ROUTE;

/**
 * Fase 3 do redesign (#90): tela 15 Login do handoff. Fundo do modo voz,
 * orb de 132px, "UniFlow" e um apoio por modo (entrar, criar conta,
 * recuperar senha). Formulário, Google e recuperação continuam os mesmos;
 * a troca entre entrar e criar conta é o link do rodapé.
 */
function MobileAuthPage({ onGoogleAuth, returnTo = '/dashboard', initialFeedback = '' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    error: sessionError,
    isDemoMode,
    requestPasswordReset,
    signInWithPassword,
    signUpWithEmail,
  } = useSession();
  const [mode, setMode] = useState(() => normalizeAuthMode(searchParams.get('mode')));
  const [signUpViewedLifecycle] = useState(() => createGa4SignUpViewedLifecycle());
  const {
    isConsentHydrated,
    status: analyticsConsentStatus,
  } = useAnalyticsConsent();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // AUTH4: loading dedicado do clique em "Entrar com Google" -- distinto
  // de isSubmitting (formulário por e-mail), para não desabilitar um pelo
  // outro sem necessidade.
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [feedback, setFeedback] = useState(() => (
    location.state?.passwordUpdated
      ? 'Senha atualizada. Entre com sua nova senha.'
      : initialFeedback
  ));
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(null);
  // Trava sincrona contra duplo clique -- mesmo padrao de mutationRef ja
  // usado em useClients.js/useAgenda.js/useTransactions.js.
  const resetRequestRef = useRef(false);

  // Redesign (#90): a folha do Inter só entra quando a tela de acesso monta,
  // mesmo mecanismo do app (/app/*); landing e páginas legais não a pedem.
  useEffect(() => {
    ensureAppFont(document);
  }, []);

  useEffect(() => {
    signUpViewedLifecycle.update(mode === AUTH_MODES.SIGN_UP, {
      consentReady: isConsentHydrated,
      consentStatus: analyticsConsentStatus,
    });
  }, [analyticsConsentStatus, isConsentHydrated, mode, signUpViewedLifecycle]);

  function changeMode(nextMode) {
    const normalized = normalizeAuthMode(nextMode);
    setMode(normalized);
    setOperationError('');
    setFeedback('');
    setSearchParams(normalized === AUTH_MODES.SIGN_UP ? { mode: 'signup' } : {}, { replace: true });
  }

  function handleOpenForgotPassword(email) {
    setOperationError('');
    setFeedback('');
    setResetFeedback(null);
    setForgotPasswordEmail(email || '');
    setIsForgotPasswordOpen(true);
  }

  function handleBackToLogin() {
    if (isRequestingReset) return;
    setIsForgotPasswordOpen(false);
    setResetFeedback(null);
  }

  async function handleRequestPasswordReset(email) {
    if (resetRequestRef.current) return;

    if (isDemoMode) {
      // Modo demo (sem backend real configurado) nao tem conta real para
      // recuperar -- mesma mensagem neutra, nunca revela nada sobre o
      // estado da configuracao.
      setResetFeedback(getPasswordResetRequestFeedback(null));
      return;
    }

    resetRequestRef.current = true;
    setIsRequestingReset(true);
    setResetFeedback(null);

    try {
      const result = await requestPasswordReset(email);
      setResetFeedback(getPasswordResetRequestFeedback(result?.error));
    } catch {
      setResetFeedback(getPasswordResetRequestFeedback({ code: 'UNEXPECTED' }));
    } finally {
      resetRequestRef.current = false;
      setIsRequestingReset(false);
    }
  }

  async function handleGoogleAuth() {
    if (typeof onGoogleAuth !== 'function') {
      setFeedback(getGoogleAuthFeedback({ code: 'UNAVAILABLE' }));
      return;
    }

    setIsGoogleLoading(true);
    try {
      const result = await onGoogleAuth({ mode });
      // Sucesso real (Google): mensagem vazia é esperada -- o navegador já
      // foi redirecionado para o provedor, então `result?.message` vazio
      // não deve ser substituído por uma mensagem de indisponibilidade.
      setFeedback(result?.message ?? '');
    } catch {
      setFeedback(getGoogleAuthFeedback({ code: 'UNEXPECTED' }));
    } finally {
      setIsGoogleLoading(false);
    }
  }

  async function handleEmailSubmit(values) {
    setOperationError('');
    setFeedback('');
    if (isDemoMode) {
      navigate(mode === AUTH_MODES.SIGN_UP ? POST_SIGN_UP_DESTINATION : returnTo);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = mode === AUTH_MODES.SIGN_UP
        ? await signUpWithEmail({
            email: values.email.trim(),
            password: values.password,
            fullName: values.fullName.trim(),
          })
        : await signInWithPassword({
            email: values.email.trim(),
            password: values.password,
          });

      if (result.error) {
        setOperationError(
          mode === AUTH_MODES.SIGN_UP
            ? 'Não foi possível criar sua conta. Revise os dados e tente novamente.'
            : 'Não foi possível entrar. Confira seus dados e tente novamente.',
        );
        return;
      }

      if (mode === AUTH_MODES.SIGN_UP && !result.data?.session && !result.data?.profile) {
        setFeedback('Conta criada. Confira seu email para confirmar o acesso.');
        return;
      }

      navigate(mode === AUTH_MODES.SIGN_UP ? POST_SIGN_UP_DESTINATION : returnTo, {
        replace: true,
      });
    } catch {
      setOperationError('Não foi possível concluir agora. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSignUp = mode === AUTH_MODES.SIGN_UP;
  const subtitle = isForgotPasswordOpen
    ? 'Recuperar senha'
    : isSignUp ? 'Crie sua conta' : 'Entre para continuar';

  return (
    <main className={styles.authPage}>
      <section className={styles.authShell} aria-labelledby="auth-title auth-subtitle">
        <div className={styles.brand}>
          <UniRingOrb size={132} />
          <h1 id="auth-title" className={styles.brandName}>UniFlow</h1>
          <p id="auth-subtitle" className={styles.brandSubtitle}>{subtitle}</p>
        </div>

        <div className={styles.authPanel}>
          {isForgotPasswordOpen ? (
            <ForgotPasswordForm
              initialEmail={forgotPasswordEmail}
              loading={isRequestingReset}
              feedback={resetFeedback?.message}
              feedbackTone={resetFeedback?.tone}
              onSubmit={handleRequestPasswordReset}
              onBack={handleBackToLogin}
            />
          ) : (
            <>
              <EmailAuthForm
                key={mode}
                mode={mode}
                loading={isSubmitting}
                operationError={operationError || (sessionError
                  ? 'Não foi possível carregar sua sessão. Tente novamente.' : '')}
                onSubmit={handleEmailSubmit}
                onForgotPassword={handleOpenForgotPassword}
                onLegalClick={() => setFeedback('Os Termos de Uso serão publicados em breve.')}
              />
              <div className={styles.authDivider}><span>ou</span></div>
              <SocialAuthButtons
                disabled={isSubmitting}
                googleLoading={isGoogleLoading}
                label={isSignUp ? 'Continuar com Google' : 'Entrar com Google'}
                onGoogleAuth={handleGoogleAuth}
              />

              {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}

              {isDemoMode ? (
                <div className={styles.demoAccess}>
                  <span>Modo demo disponível</span>
                  <Button
                    variant="ghost"
                    fullWidth
                    onClick={() => navigate(
                      isSignUp ? POST_SIGN_UP_DESTINATION : returnTo,
                    )}
                  >
                    {isSignUp ? 'Configurar demo' : 'Explorar demo'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {isForgotPasswordOpen ? null : (
          <p className={styles.switchMode}>
            {isSignUp ? 'Já tem conta? ' : 'Ainda não tem conta? '}
            <button
              type="button"
              className={styles.switchModeLink}
              onClick={() => changeMode(isSignUp ? AUTH_MODES.SIGN_IN : AUTH_MODES.SIGN_UP)}
            >
              {isSignUp ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}

export default MobileAuthPage;
