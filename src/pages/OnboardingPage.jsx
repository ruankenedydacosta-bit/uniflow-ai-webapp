import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../app/AccessContext';
import { useSession } from '../app/SessionContext';
import { PLANS, USER_MODES, WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { completeOnboarding } from '../services/onboardingService';
import { useVoiceManager } from '../features/uni-audio';
import styles from './OnboardingPage.module.css';

const onboardingOptions = [
  {
    id: 'personal',
    title: 'Minha vida financeira',
    description: 'Controle finanças, objetivos e decisões pessoais com menos esforço mental.',
    badge: 'Pessoal',
    access: {
      userMode: USER_MODES.PERSONAL,
      plan: PLANS.FREE,
      currentWorkspace: WORKSPACE_TYPES.PERSONAL,
    },
  },
  {
    id: 'business',
    title: 'Minha empresa',
    description: 'Acompanhe caixa, clientes, CRM, projetos e decisões do negócio em um só espaço.',
    badge: 'Empresarial',
    access: {
      userMode: USER_MODES.BUSINESS,
      plan: PLANS.BUSINESS,
      currentWorkspace: WORKSPACE_TYPES.BUSINESS,
    },
  },
  {
    id: 'both',
    title: 'Os dois',
    description: 'Separe vida pessoal e empresa sem misturar dados, contexto ou decisões.',
    badge: 'Pessoal + Empresa',
    access: {
      userMode: USER_MODES.BOTH,
      plan: PLANS.BUSINESS,
      currentWorkspace: WORKSPACE_TYPES.BUSINESS,
    },
  },
];

function logOnboardingPageFailure(operation, error) {
  if (!import.meta.env.DEV) {
    return;
  }

  const safeCode = error?.code ?? error?.name ?? 'UNKNOWN_ERROR';
  console.error(
    `[Onboarding DEV] operation=${operation} code=${safeCode}`,
  );
}

function OnboardingPage() {
  const navigate = useNavigate();
  const voiceManager = useVoiceManager();
  const { setAccess } = useAccess();
  const {
    isDemoMode,
    refreshSession,
    user,
  } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const submissionRef = useRef(false);

  async function handleSelect(option) {
    if (submissionRef.current) {
      return;
    }

    if (isDemoMode) {
      setAccess(option.access);
      await voiceManager.playContext('first_app_access', {
        userId: user?.id,
        userGesture: true,
      });
      navigate('/dashboard');
      return;
    }

    submissionRef.current = true;
    setIsSubmitting(true);
    setStatusMessage('Preparando sua experiência');

    try {
      const result = await completeOnboarding({
        user,
        userMode: option.access.userMode,
        currentWorkspace: option.access.currentWorkspace,
      });

      if (result.error) {
        logOnboardingPageFailure('complete_onboarding', result.error);
        setStatusMessage('Não foi possível concluir. Tente novamente');
        return;
      }

      const refreshResult = await refreshSession();

      if (refreshResult.error) {
        logOnboardingPageFailure('refresh_session', refreshResult.error);
        setStatusMessage('Não foi possível atualizar sua sessão');
        return;
      }

      await voiceManager.playContext('first_app_access', {
        userId: user?.id,
        userGesture: true,
      });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      logOnboardingPageFailure('unexpected_page_error', error);
      setStatusMessage('Não foi possível concluir. Tente novamente');
    } finally {
      submissionRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="onboarding-title">
        <div className={styles.header}>
          <Badge variant="glass" dot>
            {statusMessage || (isDemoMode ? 'Onboarding mockado' : 'Onboarding seguro')}
          </Badge>
          <span className={styles.brand}>UniFlow AI</span>
          <h1 id="onboarding-title">Como você quer usar a UniFlow AI?</h1>
          <p>
            Essa escolha prepara a Uni para mostrar os módulos certos e manter cada contexto no seu lugar.
          </p>
        </div>

        <div className={styles.optionGrid} aria-label="Modos de uso disponíveis">
          {onboardingOptions.map((option) => (
            <Card
              key={option.id}
              variant="glass"
              padding="lg"
              interactive
              className={styles.optionCard}
              onClick={() => handleSelect(option)}
              aria-disabled={isSubmitting}
            >
              <div className={styles.optionTop}>
                <span className={styles.optionDot} aria-hidden="true" />
                <Badge variant="outline" size="sm">
                  {option.badge}
                </Badge>
              </div>
              <div>
                <h2>{option.title}</h2>
                <p>{option.description}</p>
              </div>
              <span className={styles.optionAction}>Escolher experiência</span>
            </Card>
          ))}
        </div>

        <div className={styles.footerActions}>
          <Button
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => navigate('/login')}
          >
            Voltar ao login
          </Button>
        </div>
      </section>
    </main>
  );
}

export default OnboardingPage;
