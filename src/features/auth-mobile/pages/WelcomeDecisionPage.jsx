import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthBrandExperience from '../components/AuthBrandExperience.jsx';
import PartnershipFooter from '../components/PartnershipFooter.jsx';
import { ensureAppFont } from '../../simplified-app/appFont.js';
import styles from '../authMobile.module.css';

// SIMPLIFICAÇÃO DA PRIMEIRA TELA: o usuário não decide mais COMO entrar
// (Google/e-mail) antes de decidir O QUE quer fazer -- essa ordem invertida
// confundia usuários com menos familiaridade digital (ex.: idosos). Esta
// tela é puramente uma decisão binária.
//
// "Já tenho conta" abre a tela de login (/login), onde a pessoa entra com
// e-mail e senha ou com o Google. Antes o card chamava o Google direto: quem
// usa e-mail e senha não tinha como entrar, e quando o redirecionamento não
// acontecia o card ficava preso carregando. "Criar conta" abre o
// cadastro (/cadastro -> /login?mode=signup).
const EXISTING_ACCOUNT_OPTION = Object.freeze({
  id: 'existing',
  title: 'Já tenho conta',
  description: 'Entre com seu e-mail ou com o Google.',
  to: '/login',
});

const NEW_ACCOUNT_OPTION = Object.freeze({
  id: 'new',
  title: 'Criar conta',
  description: 'Crie sua conta gratuitamente e comece agora mesmo.',
  to: '/cadastro',
});

function ExistingUserIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="17" r="8" />
      <path d="M8 40c0-8.837 7.163-14 16-14s16 5.163 16 14" />
    </svg>
  );
}

function NewUserIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="19" cy="17" r="8" />
      <path d="M4 40c0-8.837 6.716-14 15-14 2.1 0 4.08.324 5.85.94" />
      <path d="M38 20v14M31 27h14" />
    </svg>
  );
}

function DecisionArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function WelcomeDecisionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Volta do Google sem concluir o acesso (AuthCallbackPage).
  const feedback = location.state?.oauthFailed
    ? 'Não foi possível entrar com o Google. Tente novamente.'
    : '';

  useEffect(() => {
    // Redesign (#90): mesmo fundo e fonte da tela de acesso; a folha do
    // Inter só entra quando esta tela monta.
    ensureAppFont(document);
  }, []);

  // O destino depois do login (from) segue para o /login, como no guard de
  // rota do App.jsx.
  function handleExistingUserClick() {
    navigate(EXISTING_ACCOUNT_OPTION.to, { state: { from: location.state?.from } });
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authShell} aria-labelledby="welcome-decision-title">
        <AuthBrandExperience />

        <div className={styles.authHeading}>
          <h1 id="welcome-decision-title">Bem-vindo à UniFlow AI</h1>
          <p>O que você deseja fazer agora?</p>
        </div>

        <div
          className={styles.decisionOptions}
          role="group"
          aria-label="O que você deseja fazer"
        >
          <button
            type="button"
            className={styles.decisionCard}
            data-option={EXISTING_ACCOUNT_OPTION.id}
            onClick={handleExistingUserClick}
          >
            <span className={styles.decisionCardIcon} aria-hidden="true">
              <ExistingUserIcon />
            </span>
            <span className={styles.decisionCardText}>
              <strong>{EXISTING_ACCOUNT_OPTION.title}</strong>
              <span>{EXISTING_ACCOUNT_OPTION.description}</span>
            </span>
            <span className={styles.decisionCardArrow} aria-hidden="true">
              <DecisionArrowIcon />
            </span>
          </button>

          <button
            type="button"
            className={styles.decisionCard}
            data-option={NEW_ACCOUNT_OPTION.id}
            onClick={() => navigate(NEW_ACCOUNT_OPTION.to)}
          >
            <span className={styles.decisionCardIcon} aria-hidden="true">
              <NewUserIcon />
            </span>
            <span className={styles.decisionCardText}>
              <strong>{NEW_ACCOUNT_OPTION.title}</strong>
              <span>{NEW_ACCOUNT_OPTION.description}</span>
            </span>
            <span className={styles.decisionCardArrow} aria-hidden="true">
              <DecisionArrowIcon />
            </span>
          </button>
        </div>

        {feedback ? <p className={styles.feedback} role="alert">{feedback}</p> : null}

        <p className={styles.securityMessage}>
          <span aria-hidden="true">✓</span>
          Seus dados protegidos com segurança avançada
        </p>

        <PartnershipFooter />
      </section>
    </main>
  );
}

export default WelcomeDecisionPage;
