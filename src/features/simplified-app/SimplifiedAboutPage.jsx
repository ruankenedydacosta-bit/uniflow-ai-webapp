import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE, APP_VERSION } from './appIdentity.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BrainIcon,
  ChatBubbleIcon,
  CheckIcon,
  DeviceIcon,
  HandshakeIcon,
  MicIcon,
  PieChartIcon,
  RefreshIcon,
  RocketIcon,
  ShieldIcon,
  SparkleIcon,
  UniMark,
} from './SimplifiedIcons.jsx';
import styles from './simplifiedAbout.module.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M20 6 10 16l10 10" />
    </svg>
  );
}

// BLOCO FINAL DO MVP (Sobre a UniFlow AI): revela cada seção com uma
// microanimação discreta (fade + slide leve) assim que ela entra na tela --
// nunca esconde conteúdo de verdade: sem IntersectionObserver (ou com JS
// desabilitado) o conteúdo já nasce visível (fallback seguro), e
// prefers-reduced-motion desliga a transição inteira via CSS.
function Reveal({ as: Tag = 'section', className = '', children, ...props }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver !== 'function') {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${styles.reveal} ${isVisible ? styles.revealVisible : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </Tag>
  );
}

const UNI_CAPABILITIES = [
  { Icon: ArrowDownIcon, tone: 'green', label: 'Organiza receitas' },
  { Icon: ArrowUpIcon, tone: 'red', label: 'Organiza despesas' },
  { Icon: PieChartIcon, tone: 'blue', label: 'Ajuda no planejamento financeiro' },
  { Icon: ChatBubbleIcon, tone: 'purple', label: 'Conversa naturalmente' },
  { Icon: RefreshIcon, tone: 'blue', label: 'Aprende seu contexto' },
  { Icon: CheckIcon, tone: 'green', label: 'Ajuda na tomada de decisão' },
];

const PRINCIPLES = [
  { Icon: ShieldIcon, tone: 'green', title: 'Segurança', text: 'Seus dados recebem o mesmo cuidado que os de um banco.' },
  { Icon: HandshakeIcon, tone: 'blue', title: 'Transparência', text: 'Você sempre entende o que a Uni está fazendo e por quê.' },
  { Icon: BrainIcon, tone: 'purple', title: 'Inteligência', text: 'Aprendizado real, aplicado à sua vida financeira.' },
  { Icon: SparkleIcon, tone: 'blue', title: 'Simplicidade', text: 'Cada tela pensada para ser fácil, mesmo sem experiência.' },
  { Icon: RocketIcon, tone: 'purple', title: 'Evolução contínua', text: 'Sempre melhorando, com base no que você precisa.' },
];

const FUTURE_ITEMS = [
  'Novas inteligências',
  'Mais automações',
  'Novas integrações',
  'Recursos empresariais',
  'Melhorias contínuas',
];

function SimplifiedAboutPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page} data-simplified-about>
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
          <h1>Sobre a UniFlow AI</h1>
        </div>
      </header>

      <section className={styles.hero}>
        <span className={styles.heroMark} aria-hidden="true"><UniMark /></span>
        <strong className={styles.heroName}>{APP_NAME}</strong>
        <span className={styles.heroVersion}>v{APP_VERSION}</span>
        <p className={styles.heroTagline}>{APP_TAGLINE}</p>
      </section>

      <Reveal className={styles.card} aria-label="Quem somos">
        <h2>Quem somos</h2>
        <p>
          A UniFlow AI nasceu para simplificar a vida financeira das pessoas. Somos uma equipe
          dedicada a transformar números complicados em decisões simples, com a ajuda de uma
          inteligência que realmente entende você.
        </p>
      </Reveal>

      <Reveal className={styles.card} aria-label="Nossa missão">
        <h2>Nossa missão</h2>
        <p>
          Tornar o controle financeiro tão simples quanto conversar com alguém de confiança.
          Cuidar do seu dinheiro não precisa ser complicado — só precisa da ferramenta certa.
        </p>
      </Reveal>

      <Reveal className={styles.card} aria-label="Nossa visão">
        <h2>Nossa visão</h2>
        <p>
          Queremos ser a inteligência financeira que as pessoas procuram em qualquer momento da
          vida. E isto é só o começo de uma jornada muito maior.
        </p>
      </Reveal>

      <Reveal aria-label="O que a Uni faz">
        <h2 className={styles.sectionTitle}>O que a Uni faz</h2>
        <div className={styles.capabilityGrid}>
          {UNI_CAPABILITIES.map(({ Icon, tone, label }) => (
            <div key={label} className={styles.capabilityCard}>
              <span className={`${styles.capabilityIcon} ${styles[`tone${tone}`]}`} aria-hidden="true">
                <Icon />
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal aria-label="Nossos princípios">
        <h2 className={styles.sectionTitle}>Nossos princípios</h2>
        <div className={styles.principleGrid}>
          {PRINCIPLES.map(({ Icon, tone, title, text }) => (
            <div key={title} className={styles.principleCard}>
              <span className={`${styles.principleIcon} ${styles[`tone${tone}`]}`} aria-hidden="true">
                <Icon />
              </span>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className={styles.card} aria-label="Tecnologia">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><DeviceIcon /></span>
          <h2>Tecnologia</h2>
        </div>
        <p>
          Por trás da UniFlow existe uma engenharia cuidadosa, construída para ser rápida, segura
          e confiável — para que você só precise se preocupar em usar.
        </p>
      </Reveal>

      <Reveal className={`${styles.card} ${styles.specialCard}`} aria-label="Por que a UniFlow é diferente">
        <h2>Por que a UniFlow é diferente</h2>
        <p>
          A UniFlow não tenta ser tudo para todo mundo. Preferimos fazer poucas coisas muito bem:
          entender sua vida financeira, conversar com você de verdade e ajudar a tomar decisões
          melhores, todos os dias.
        </p>
      </Reveal>

      <Reveal className={styles.card} aria-label="Nosso futuro">
        <div className={styles.cardHeaderRow}>
          <span className={styles.cardHeaderIcon} aria-hidden="true"><RocketIcon /></span>
          <h2>Nosso futuro</h2>
        </div>
        <p>A UniFlow continua evoluindo. O que vem a caminho:</p>
        <ul className={styles.futureList}>
          {FUTURE_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={styles.futureNote}>E isso é só o começo.</p>
      </Reveal>

      <Reveal className={`${styles.card} ${styles.thanksCard}`} aria-label="Agradecimento">
        <span className={styles.thanksIcon} aria-hidden="true"><MicIcon /></span>
        <p>
          Obrigado por confiar na UniFlow com uma parte tão importante da sua vida.
          Estamos construindo isso para você — e com você.
        </p>
      </Reveal>

      <footer className={styles.footer}>
        <span className={styles.footerMark} aria-hidden="true"><UniMark /></span>
        <strong>{APP_NAME}</strong>
        <span>v{APP_VERSION}</span>
        <small>© {APP_NAME} — Todos os direitos reservados.</small>
      </footer>
    </div>
  );
}

export default SimplifiedAboutPage;
