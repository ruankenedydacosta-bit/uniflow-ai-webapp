import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../../app/SessionContext';
import Button from '../../../components/ui/Button';
import AuthModeSwitch from '../components/AuthModeSwitch.jsx';
import EmailAuthForm from '../components/EmailAuthForm.jsx';
import SocialAuthButtons from '../components/SocialAuthButtons.jsx';
import {
  AUTH_MODES,
  SOCIAL_PROVIDERS,
  getSocialUnavailableResult,
  normalizeAuthMode,
} from '../authMobileSchema.js';
import styles from '../authMobile.module.css';

function MobileAuthPage({ onGoogleAuth, onAppleAuth }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    error: sessionError,
    isDemoMode,
    signInWithPassword,
    signUpWithEmail,
  } = useSession();
  const [mode, setMode] = useState(() => normalizeAuthMode(searchParams.get('mode')));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [feedback, setFeedback] = useState('');

  function changeMode(nextMode) {
    const normalized = normalizeAuthMode(nextMode);
    setMode(normalized);
    setOperationError('');
    setFeedback('');
    setSearchParams(normalized === AUTH_MODES.SIGN_UP ? { mode: 'signup' } : {}, { replace: true });
  }

  async function handleSocial(provider) {
    const callback = provider === SOCIAL_PROVIDERS.APPLE ? onAppleAuth : onGoogleAuth;
    const fallback = getSocialUnavailableResult(provider);
    try {
      const result = typeof callback === 'function' ? await callback({ mode }) : fallback;
      setFeedback(result?.message || fallback.message);
    } catch {
      setFeedback(fallback.message);
    }
  }

  async function handleEmailSubmit(values) {
    setOperationError('');
    setFeedback('');
    if (isDemoMode) {
      navigate(mode === AUTH_MODES.SIGN_UP ? '/onboarding' : '/dashboard');
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

      const requiresOnboarding = result.profileMissing
        || !result.data?.profile?.onboarding_completed;
      navigate(requiresOnboarding ? '/onboarding' : '/dashboard', { replace: true });
    } catch {
      setOperationError('Não foi possível concluir agora. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authShell} aria-labelledby="auth-title">
        <aside className={styles.authIntroduction}>
          <div className={styles.mobileBrand}>
            <span className={styles.brandMark} aria-hidden="true">U</span>
            <span>UniFlow AI</span>
          </div>
          <div>
            <span className={styles.authEyebrow}>Clareza para decidir melhor</span>
            <h1>A sua vida financeira, mais simples de entender.</h1>
            <p>Entre no seu espaço e continue de onde parou.</p>
          </div>
          <button type="button" className={styles.backWelcome} onClick={() => navigate('/welcome')}>
            Voltar à apresentação
          </button>
        </aside>

        <div className={styles.authPanel}>
          <div className={styles.authPanelHeader}>
            <div className={styles.mobileIdentity} aria-label="UniFlow AI">
              <div className={styles.mobileIdentityBrand}>
                <span className={styles.mobileIdentityMark} aria-hidden="true">U</span>
                <span className={styles.authMobileLogo}>UniFlow AI</span>
              </div>
              <p className={styles.mobileIdentitySlogan}>
                Conectando você às melhores decisões financeiras.
              </p>
              <ul className={styles.mobileBenefits} aria-label="Benefícios da UniFlow AI">
                <li><span aria-hidden="true">✓</span>Organize suas finanças</li>
                <li><span aria-hidden="true">✓</span>Receba insights inteligentes</li>
                <li><span aria-hidden="true">✓</span>Tome melhores decisões</li>
              </ul>
            </div>
            <h2 id="auth-title">{mode === AUTH_MODES.SIGN_UP ? 'Crie seu espaço' : 'Boas-vindas de volta'}</h2>
            <p>{mode === AUTH_MODES.SIGN_UP ? 'Comece com o essencial.' : 'Acesse sua experiência financeira.'}</p>
          </div>

          <AuthModeSwitch mode={mode} onChange={changeMode} />
          <SocialAuthButtons
            disabled={isSubmitting}
            onGoogleAuth={handleSocial}
            onAppleAuth={handleSocial}
          />
          <div className={styles.authDivider}><span>ou</span></div>
          <EmailAuthForm
            key={mode}
            mode={mode}
            loading={isSubmitting}
            operationError={operationError || (sessionError
              ? 'Não foi possível carregar sua sessão. Tente novamente.' : '')}
            onSubmit={handleEmailSubmit}
            onForgotPassword={() => setFeedback('A recuperação de senha estará disponível em breve.')}
            onLegalClick={() => setFeedback('Os documentos legais serão disponibilizados em breve.')}
          />

          {feedback ? <p className={styles.feedback} role="status">{feedback}</p> : null}

          <button
            type="button"
            className={styles.switchModeLink}
            onClick={() => changeMode(
              mode === AUTH_MODES.SIGN_UP ? AUTH_MODES.SIGN_IN : AUTH_MODES.SIGN_UP,
            )}
          >
            {mode === AUTH_MODES.SIGN_UP ? 'Já tenho uma conta' : 'Quero criar uma conta'}
          </button>

          {isDemoMode ? (
            <div className={styles.demoAccess}>
              <span>Modo demo disponível</span>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => navigate(mode === AUTH_MODES.SIGN_UP ? '/onboarding' : '/dashboard')}
              >
                {mode === AUTH_MODES.SIGN_UP ? 'Configurar demo' : 'Explorar demo'}
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default MobileAuthPage;
