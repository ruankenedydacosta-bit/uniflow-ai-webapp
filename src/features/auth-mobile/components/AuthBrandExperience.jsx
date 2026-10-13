import { useId } from 'react';
import { UniMark } from '../../simplified-app/SimplifiedIcons.jsx';
import styles from '../authMobile.module.css';

// IDENTIDADE AUTH V2 -- a marca deixou de ser servida por PNG.
//
// Os dois arquivos anteriores (logo_uniflowai.png / smartech_logo_transparente.png)
// eram MOCKUPS renderizados: logo aplicado numa parede, com fundo cinza/rosa
// OPACO (apesar do nome "transparente"), sombra assada na imagem e o slogan
// escrito em cinza-escuro. Sobre o fundo #020713 desta página isso era
// impossível de resolver por CSS: a única forma de esconder o retângulo
// cinza era recortar a imagem (overflow: hidden + altura fixa), e o recorte
// levava junto o slogan e a linha "TECHNOLOGY MONITORING" -- exatamente o que
// aparecia truncado na tela. O PNG ainda trazia um erro de digitação no
// slogan ("decisces" em vez de "decisões").
//
// Agora a marca é vetor puro: fundo realmente transparente, texto vivo (logo
// legível, selecionável e traduzível), nitidez em qualquer densidade de tela
// e cor que acompanha o tema -- sem nenhum recorte.
//
// Exceção: o símbolo da UniFlow é o UniMark, o PNG oficial já recortado e
// com fundo transparente. O texto do lockup continua vivo.

const BENEFITS = Object.freeze([
  { id: 'security', label: 'Segurança de ponta' },
  { id: 'insights', label: 'Insights inteligentes' },
  { id: 'organization', label: 'Organize suas finanças' },
  { id: 'intelligence', label: 'IA que trabalha por você' },
]);

function BenefitIcon({ id }) {
  if (id === 'security') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M24 5 39 11v11c0 10-6 17-15 21C15 39 9 32 9 22V11l15-6Z" />
        <path d="m17 24 5 5 10-11" />
      </svg>
    );
  }

  if (id === 'insights') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 38h32M12 32V22h7v10m5 0V14h7v18m5 0V8h6v24" />
        <path d="m10 17 11-8 8 4 12-9" />
      </svg>
    );
  }

  if (id === 'organization') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M7 35h34M9 29l10-10 7 6L40 10" />
        <path d="M33 10h7v7" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M19 10a8 8 0 0 0-10 8 8 8 0 0 0 2 14 8 8 0 0 0 8 7m10-29a8 8 0 0 1 10 8 8 8 0 0 1-2 14 8 8 0 0 1-8 7M24 8v32" />
      <path d="M15 18c4 0 6 3 6 6m12-6c-4 0-6 3-6 6M14 31c4 0 7-2 7-6m13 6c-4 0-7-2-7-6" />
    </svg>
  );
}

// Marca da SmartTech: malha de nós hexagonais (monitoramento em rede).
function SmartechMark({ idPrefix }) {
  const nodeGradient = `${idPrefix}-node`;
  // Hexágono regular apontando para cima, centrado na origem (raio 15).
  const hex = 'M0 -15 13 -7.5 13 7.5 0 15 -13 7.5 -13 -7.5Z';
  const nodes = [
    { x: 56, y: 18 },
    { x: 26, y: 44 },
    { x: 86, y: 44 },
    { x: 56, y: 70 },
    { x: 16, y: 74 },
    { x: 96, y: 74 },
    { x: 56, y: 118 },
  ];
  const links = [
    'M56 33 26 44', 'M56 33 86 44', 'M26 59 56 70', 'M86 59 56 70',
    'M26 59 16 74', 'M86 59 96 74', 'M56 85v18',
  ];

  return (
    <svg className={styles.smartechMark} viewBox="0 0 112 136" aria-hidden="true">
      <defs>
        <linearGradient id={nodeGradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${nodeGradient})`} strokeWidth="4" strokeLinecap="round" fill="none">
        {links.map((d) => <path key={d} d={d} opacity=".55" />)}
        {nodes.map((node) => (
          <path key={`${node.x}-${node.y}`} d={hex} transform={`translate(${node.x} ${node.y})`} />
        ))}
      </g>
    </svg>
  );
}

function AuthBrandExperience() {
  const idPrefix = useId().replaceAll(':', '');
  const waveGradient = `${idPrefix}-wave`;
  const waveGlow = `${idPrefix}-wave-glow`;
  const coreGlow = `${idPrefix}-core-glow`;

  return (
    <header className={styles.brandExperience}>
      {/* Campo de partículas: profundidade atrás da marca, sem competir com
          o texto (baixa opacidade, nunca sobre a área de leitura). */}
      <div className={styles.particleField} aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} className={styles.particle} data-particle={index % 6} />
        ))}
      </div>

      <div
        className={styles.uniflowLockup}
        role="img"
        aria-label="UniFlow AI — Conectando você às melhores decisões financeiras."
      >
        {/* O símbolo oficial (UniMark), o mesmo do cabeçalho. Antes esta tela
            desenhava a própria versão em SVG, com traços e gradiente que não
            batiam com a marca. */}
        <span className={styles.uniflowMark}>
          <UniMark />
        </span>
        <div className={styles.uniflowCopy}>
          <p className={styles.uniflowWordmark} aria-hidden="true">
            UNIFLOW<span>AI</span>
          </p>
          <p className={styles.uniflowTagline} aria-hidden="true">
            Conectando você às <em>melhores decisões financeiras.</em>
          </p>
        </div>
      </div>

      <div className={styles.partnerBrand}>
        <span className={styles.partnerLabel}>Em parceria com</span>
        <div className={styles.partnerLockup} role="img" aria-label="SmartTech">
          <SmartechMark idPrefix={idPrefix} />
          <span className={styles.partnerCopy} aria-hidden="true">
            <strong>SMARTECH</strong>
            <small>TECHNOLOGY MONITORING</small>
          </span>
        </div>
      </div>

      <section className={styles.benefitsStrip} aria-label="Benefícios da UniFlow AI">
        <ul>
          {BENEFITS.map((benefit) => (
            <li key={benefit.id}>
              <BenefitIcon id={benefit.id} />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Onda luminosa: um feixe central nítido acompanhado de filetes mais
          finos e difusos, como na referência -- a sensação de "fluxo de luz"
          vem da soma das camadas, não de um traço único. */}
      <div className={styles.authWave} aria-hidden="true">
        <svg viewBox="0 0 720 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id={waveGradient} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7c3aed" />
              <stop offset=".28" stopColor="#4f46e5" />
              <stop offset=".5" stopColor="#2563eb" />
              <stop offset=".72" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
            <filter id={waveGlow} x="-20%" y="-160%" width="140%" height="420%">
              <feGaussianBlur stdDeviation="9" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id={coreGlow} x="-400%" y="-400%" width="900%" height="900%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <path className={styles.waveHalo} d="M-20 84 C120 22 250 132 360 80 470 28 600 130 740 58" />

          {/* Leque de filetes: cada fio repete a curva do feixe com um
              deslocamento vertical crescente. Quanto mais longe do centro,
              mais transparente -- é isso que produz o "spray" de luz da
              referência em vez de uma faixa sólida. */}
          <g className={styles.waveStrands} stroke={`url(#${waveGradient})`}>
            <path d="M-20 56 C120 -4 250 106 360 54 470 2 600 104 740 32" opacity=".14" />
            <path d="M-20 63 C120 3 250 113 360 61 470 9 600 111 740 39" opacity=".2" />
            <path d="M-20 70 C120 10 250 120 360 68 470 16 600 118 740 46" opacity=".3" />
            <path d="M-20 77 C120 17 250 127 360 75 470 23 600 125 740 53" opacity=".42" />
            <path d="M-20 91 C120 31 250 141 360 89 470 37 600 139 740 67" opacity=".42" />
            <path d="M-20 98 C120 38 250 148 360 96 470 44 600 146 740 74" opacity=".3" />
            <path d="M-20 105 C120 45 250 155 360 103 470 51 600 153 740 81" opacity=".2" />
            <path d="M-20 112 C120 52 250 162 360 110 470 58 600 160 740 88" opacity=".14" />
          </g>

          <path
            className={styles.wavePrimary}
            d="M-20 84 C120 24 250 134 360 82 470 30 600 132 740 60"
            stroke={`url(#${waveGradient})`}
            filter={`url(#${waveGlow})`}
          />

          <circle
            className={styles.waveCore}
            cx="360"
            cy="82"
            r="4.5"
            fill="#e0f7ff"
            filter={`url(#${coreGlow})`}
          />
        </svg>
      </div>
    </header>
  );
}

export default AuthBrandExperience;
