import Button from '../../../components/ui/Button';
import styles from '../OnboardingPage.module.css';

function StepWelcome({ onNext }) {
  return (
    <div className={styles.stepContent}>
      <div className={styles.welcomeHero}>
        <span className={styles.welcomeGlyph} aria-hidden="true">✦</span>
        <h1 className={styles.welcomeTitle}>
          Bem-vindo à<br />
          <span className={styles.welcomeBrand}>UniFlow AI</span>
        </h1>
        <p className={styles.welcomeText}>
          Eu sou a Uni, sua assistente financeira pessoal.
          Vou te ajudar a organizar suas finanças, enxergar oportunidades
          e construir uma relação mais tranquila com o dinheiro — sem julgamento,
          no seu ritmo.
        </p>
        <p className={styles.welcomeText}>
          Primeiro, vou te fazer algumas perguntas rápidas para conhecer
          seu momento e preparar tudo do jeito certo. Leva menos de 2 minutos.
        </p>
        <div className={styles.welcomeAction}>
          <Button variant="primary" size="lg" onClick={onNext}>
            Começar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StepWelcome;
