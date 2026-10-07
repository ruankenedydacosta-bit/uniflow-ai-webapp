import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthBrandExperience from '../components/AuthBrandExperience.jsx';
import PartnershipFooter from '../components/PartnershipFooter.jsx';
import { useGoogleAuthRedirect } from '../useGoogleAuthRedirect.js';
import { ensureAppFont } from '../../simplified-app/appFont.js';
import styles from '../authMobile.module.css';

// SIMPLIFICAÇÃO DA PRIMEIRA TELA: o usuário não decide mais COMO entrar
// (Google/e-mail) antes de decidir O QUE quer fazer -- essa ordem invertida
// confundia usuários com menos familiaridade digital (ex.: idosos). Esta
// tela é puramente uma decisão binária.
//
// GOOGLE DIRETO: "Já tenho conta" significa, no MVP, entrar diretamente com
// Google -- nunca abre /login antes (isso só adicionava uma etapa igual à
// tela antiga, com abas Entrar/Criar conta, e-mail/senha, "Continuar com
// Google" de novo). "Criar conta" continua abrindo o fluxo de cadastro
// (/cadastro -> /login?mode=signup), onde Google e e-mail continuam
// disponíveis.
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
  const { startGoogleAuth } = useGoogleAuthRedirect();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [feedback, setFeedback] = useState(() => (
    location.state?.oauthFailed
      ? 'Não foi possível entrar com o Google. Tente novamente.'
      : ''
  ));

  // BUGFIX (estado preso ao voltar do Google): startGoogleAuth navega o
  // documento inteiro para accounts.google.com -- não é uma navegação do
  // React Router. Se o usuário aperta "voltar" ANTES de concluir o OAuth,
  // o Chromium (e outros navegadores com bfcache) restaura esta página a
  // partir do Back-Forward Cache: o componente NUNCA desmonta/remonta, só
  // é "reidratado" congelado exatamente como estava no momento da saída --
  // com isGoogleLoading ainda `true`. Um useEffect de montagem comum nunca
  // dispara nesse caso (não há montagem nova), então o card ficava preso
  // em "Abrindo Google..." para sempre, só saindo com refresh manual.
  //
  // A correção real é ouvir o evento `pageshow` em nível de window --
  // `event.persisted === true` é o sinal oficial do navegador para "esta
  // página voltou do bfcache" (nunca dispara em carregamentos normais).
  // `visibilitychange` é uma rede de segurança adicional: como a navegação
  // para o Google sempre esconde a aba (documento inteiro trocado), a aba
  // só volta a ficar visível quando o usuário retorna -- sem OAuth
  // concluído, chegar aqui de novo já significa que ele voltou sem
  // terminar. Nenhum dos dois dispara um novo OAuth sozinho -- só liberam
  // a interação de novo.
  useEffect(() => {
    // Redesign (#90): mesmo fundo e fonte da tela de acesso; a folha do
    // Inter só entra quando esta tela monta.
    ensureAppFont(document);

    function resetGoogleLoadingState() {
      setIsGoogleLoading((wasLoading) => {
        if (wasLoading) {
          // Opcional (nunca obrigatório) -- mensagem simples, sem detalhe
          // técnico, só quando havia mesmo uma tentativa em andamento.
          setFeedback('Login com Google cancelado. Você pode tentar novamente.');
        }
        return false;
      });
    }

    function handlePageShow(event) {
      if (event.persisted) {
        resetGoogleLoadingState();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        resetGoogleLoadingState();
      }
    }

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // LOADING E DUPLO CLIQUE: isGoogleLoading trava o card em si (disabled)
  // e a checagem no início da função impede uma segunda chamada OAuth
  // disparada por cliques rápidos repetidos antes do primeiro re-render.
  async function handleExistingUserClick() {
    if (isGoogleLoading) return;
    setFeedback('');
    setIsGoogleLoading(true);
    try {
      const result = await startGoogleAuth(location.state?.from);
      // Sucesso real: o navegador já foi redirecionado para o Google pelo
      // SDK -- só chega aqui com `message` se o redirect NÃO ocorreu (ex.:
      // Supabase não configurado, falha síncrona antes do redirect).
      if (result.message) {
        setFeedback(result.message);
        setIsGoogleLoading(false);
      }
    } catch {
      setFeedback('Não foi possível entrar com o Google. Tente novamente.');
      setIsGoogleLoading(false);
    }
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
            data-option="existing"
            disabled={isGoogleLoading}
            aria-busy={isGoogleLoading}
            onClick={handleExistingUserClick}
          >
            <span className={styles.decisionCardIcon} aria-hidden="true">
              <ExistingUserIcon />
            </span>
            <span className={styles.decisionCardText}>
              <strong>Já tenho conta</strong>
              <span>
                {isGoogleLoading ? 'Abrindo Google...' : 'Entre com o Google e continue de onde parou.'}
              </span>
            </span>
            <span className={styles.decisionCardArrow} aria-hidden="true">
              <DecisionArrowIcon />
            </span>
          </button>

          <button
            type="button"
            className={styles.decisionCard}
            data-option={NEW_ACCOUNT_OPTION.id}
            disabled={isGoogleLoading}
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
