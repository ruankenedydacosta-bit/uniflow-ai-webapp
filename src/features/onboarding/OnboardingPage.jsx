import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Loader from '../../components/ui/Loader';
import { useOnboarding } from './useOnboarding';
import StepProgress from './components/StepProgress';
import StepWelcome from './components/StepWelcome';
import StepMode from './components/StepMode';
import StepGoal from './components/StepGoal';
import StepFinancial from './components/StepFinancial';
import StepTone from './components/StepTone';
import StepSummary from './components/StepSummary';
import styles from './OnboardingPage.module.css';

function OnboardingPage() {
  const navigate = useNavigate();
  const {
    step,
    data,
    loading,
    saving,
    error,
    completed,
    updateData,
    goToStep,
    goNext,
    goPrev,
    finish,
  } = useOnboarding();

  useEffect(() => {
    if (completed) {
      const timer = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [completed, navigate]);

  if (loading) {
    return (
      <main className={styles.page}>
        <Loader fullScreen label="Preparando seu onboarding" />
      </main>
    );
  }

  function renderStep() {
    switch (step) {
      case 1:
        return <StepWelcome onNext={goNext} />;
      case 2:
        return (
          <StepMode
            value={data.mode}
            onChange={updateData}
            onNext={goNext}
            onPrev={goPrev}
          />
        );
      case 3:
        return (
          <StepGoal
            value={data.goal}
            goalText={data.goalText}
            onChange={updateData}
            onNext={goNext}
            onPrev={goPrev}
          />
        );
      case 4:
        return (
          <StepFinancial
            mode={data.mode}
            value={data.financialProfile}
            onChange={updateData}
            onNext={goNext}
            onPrev={goPrev}
          />
        );
      case 5:
        return (
          <StepTone
            value={data.userTone}
            onChange={updateData}
            onNext={goNext}
            onPrev={goPrev}
          />
        );
      case 6:
        return (
          <StepSummary
            data={data}
            onGoToStep={goToStep}
            onComplete={finish}
            saving={saving}
          />
        );
      default:
        return null;
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <StepProgress currentStep={step} />
        {renderStep()}
        {error && (
          <div className={styles.errorBanner} role="alert">
            <span>
              {typeof error === 'string'
                ? error
                : error.submit || error.mode || error.goal || error.userTone || 'Preencha os campos obrigatórios'}
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

export default OnboardingPage;
