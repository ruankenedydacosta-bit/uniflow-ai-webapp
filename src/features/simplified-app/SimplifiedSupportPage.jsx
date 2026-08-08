import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listOwnSupportRequests } from '../uni-support/supportRequestService.js';
import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { buildSupportWhatsAppUrl } from './simplifiedSupportConfig.js';
import {
  CalendarIcon,
  ChatBubbleIcon,
  CheckIcon,
  ClockIcon,
  HeadsetIcon,
  MicIcon,
  ShieldIcon,
  WhatsAppIcon,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedSupport.module.css';

const PREVIEW_COUNT = 3;

// Mesmo mapeamento real de src/features/uni-support/components/SupportRequestsList.jsx
// (status reais da tabela support_requests, check constraint
// support_requests_status_check) -- reaproveitado aqui em vez de importar
// o componente original porque ele usa tokens de tema claro
// (--uf-color-text-primary etc.) que ficam ilegíveis no fundo escuro desta
// experiência simplificada.
const STATUS_LABELS = Object.freeze({
  open: 'Aberto',
  in_review: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Encerrado',
});

const STATUS_VARIANTS = Object.freeze({
  open: 'primary',
  in_review: 'warning',
  resolved: 'success',
  closed: 'default',
});

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

function formatDateTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * ETAPA 4 -- Suporte (auditoria real confirmou): existe uma tabela real
 * support_requests (supabase/migrations/20260725_022_support.sql) com
 * status reais ('open'/'in_review'/'resolved'/'closed') e um service real
 * (listOwnSupportRequests, RLS escopado ao próprio usuário) -- "Meus
 * atendimentos" usa exatamente essa fonte, nunca tickets inventados. O
 * WhatsApp oficial agora é real (simplifiedSupportConfig.js): os dois
 * botões abrem https://wa.me/<número> com mensagem inicial codificada, em
 * nova aba, sem API do WhatsApp e sem envio automático de mensagem.
 * Telefone e e-mail continuam ausentes; o único canal humano é o
 * WhatsApp.
 */
function SimplifiedSupportPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const whatsAppUrl = buildSupportWhatsAppUrl();

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      setIsLoadingRequests(true);
      listOwnSupportRequests().then((result) => {
        if (!isActive) return;
        setRequests(result.data ?? []);
        setRequestsError(result.error ?? null);
        setIsLoadingRequests(false);
      });
    }, 0);
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const visibleRequests = showAll ? requests : requests.slice(0, PREVIEW_COUNT);

  return (
    <div className={styles.page} data-simplified-support>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
            aria-label="Voltar para Conta"
          >
            <BackIcon />
          </button>
          <div>
            <h1>Suporte</h1>
            <p className={styles.subtitle}>A Uni está aqui para ajudar você.</p>
          </div>
        </div>
      </header>

      <div className={styles.channelsGrid}>
        <section className={`${styles.channelCard} ${styles.uniChannel}`} aria-label="Conversar com a Uni">
          <div className={styles.channelTop}>
            <span className={styles.channelMascot} aria-hidden="true">🙂</span>
            <span className={styles.channelBubble} aria-hidden="true"><ChatBubbleIcon /></span>
          </div>
          <strong>Conversar com a Uni</strong>
          <p>A Uni pode ajudar você a entender como utilizar o aplicativo e encontrar rapidamente as funcionalidades.</p>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            leftIcon={<span className={styles.buttonIcon} aria-hidden="true"><MicIcon /></span>}
            onClick={() => navigate(SIMPLIFIED_ROUTES.SUPPORT_CHAT)}
          >
            Falar com a Uni
          </Button>
        </section>

        <section className={`${styles.channelCard} ${styles.humanChannel}`} aria-label="Falar com um atendente">
          <div className={styles.channelTop}>
            <span className={styles.channelMascotAlt} aria-hidden="true"><HeadsetIcon /></span>
            <span className={styles.channelBubbleAlt} aria-hidden="true"><ChatBubbleIcon /></span>
          </div>
          <strong>Falar com um atendente</strong>
          <p>Nossa equipe pode ajudar você pelo WhatsApp.</p>
          <Button
            href={whatsAppUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir atendimento da UniFlow AI no WhatsApp"
            className={styles.whatsAppButton}
            fullWidth
            leftIcon={<span className={styles.buttonIcon} aria-hidden="true"><WhatsAppIcon /></span>}
          >
            Falar pelo WhatsApp
          </Button>
        </section>
      </div>

      <section className={styles.card} aria-label="Meus atendimentos">
        <div className={styles.cardHeaderRow}>
          <h2>Meus atendimentos</h2>
          {requests.length > PREVIEW_COUNT ? (
            <button type="button" className={styles.linkButton} onClick={() => setShowAll((current) => !current)}>
              {showAll ? 'Ver menos' : 'Ver todos'}
            </button>
          ) : null}
        </div>
        {isLoadingRequests ? (
          <p className={styles.emptyState}>Carregando seus atendimentos...</p>
        ) : requestsError ? (
          <p className={styles.errorBanner} role="alert">Não foi possível carregar seus atendimentos agora.</p>
        ) : requests.length === 0 ? (
          <p className={styles.emptyState}>Nenhum atendimento encontrado.</p>
        ) : (
          <ul className={styles.requestList}>
            {visibleRequests.map((request) => (
              <li key={request.id} className={styles.requestRow}>
                <span className={`${styles.requestIcon} ${styles[`tone_${request.status}`] ?? ''}`} aria-hidden="true">
                  {request.status === 'resolved' ? <CheckIcon /> : request.status === 'in_review' ? <ClockIcon /> : <ChatBubbleIcon />}
                </span>
                <div className={styles.requestInfo}>
                  <strong>{request.subject}</strong>
                  <small>{formatDateTime(request.created_at)}</small>
                </div>
                <Badge variant={STATUS_VARIANTS[request.status] ?? 'default'} size="sm">
                  {STATUS_LABELS[request.status] ?? request.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-label="WhatsApp">
        <div className={styles.whatsAppCard}>
          <span className={styles.whatsAppIcon} aria-hidden="true"><WhatsAppIcon /></span>
          <div className={styles.whatsAppInfo}>
            <strong>WhatsApp</strong>
            <p>Fale com a gente pelo WhatsApp</p>
          </div>
        </div>
        <Button
          href={whatsAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir atendimento da UniFlow AI no WhatsApp"
          className={styles.whatsAppButton}
          fullWidth
        >
          Abrir WhatsApp
        </Button>
      </section>

      <section className={styles.card} aria-label="Horário de atendimento">
        <div className={styles.scheduleRow}>
          <span className={`${styles.cardHeaderIcon} ${styles.toneBlue}`} aria-hidden="true"><ClockIcon /></span>
          <div>
            <strong>Horário de atendimento</strong>
            <p>Segunda a Domingo<br />Horário comercial</p>
          </div>
        </div>
        <div className={styles.scheduleRow}>
          <span className={`${styles.cardHeaderIcon} ${styles.tonePurple}`} aria-hidden="true"><CalendarIcon /></span>
          <p className={styles.scheduleNote}>Atendimento todos os dias pelo app com a Uni.</p>
        </div>
      </section>

      <section className={styles.card} aria-label="Como funciona nosso suporte">
        <h2>Como funciona nosso suporte</h2>
        <div className={styles.stepsRow}>
          <div className={styles.step}>
            <span className={`${styles.stepNumber} ${styles.tonePurple}`}>1</span>
            <span className={styles.stepIcon} aria-hidden="true">🙂</span>
            <strong>A Uni tenta resolver</strong>
            <small>Nossa inteligência artificial entende seu problema e resolve rapidamente.</small>
          </div>
          <span className={styles.stepArrow} aria-hidden="true">→</span>
          <div className={styles.step}>
            <span className={`${styles.stepNumber} ${styles.toneGreen}`}>2</span>
            <span className={styles.stepIcon} aria-hidden="true"><WhatsAppIcon /></span>
            <strong>Atendente pelo WhatsApp</strong>
            <small>Se a Uni não conseguir resolver, você fala com um atendente humano pelo WhatsApp.</small>
          </div>
        </div>
      </section>

      <section className={styles.finalCard} aria-label="A Uni está sempre com você">
        <span className={styles.finalMascot} aria-hidden="true">🙂</span>
        <div className={styles.finalText}>
          <strong>A Uni está sempre com você!</strong>
          <p>Pergunte, converse e resolva. É rápido, fácil e seguro.</p>
        </div>
        <span className={styles.finalShield} aria-hidden="true"><ShieldIcon /></span>
      </section>
    </div>
  );
}

export default SimplifiedSupportPage;
