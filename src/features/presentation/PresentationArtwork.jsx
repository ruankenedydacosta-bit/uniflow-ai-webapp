import { useId } from 'react';
import styles from './Presentation.module.css';

function DashboardArtwork({ gradientId, glowId }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Painel financeiro centralizado com gráficos e a Uni">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7c3aed" />
          <stop offset=".5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#2dd4bf" />
        </linearGradient>
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className={styles.artworkFloat}>
        <rect x="34" y="26" width="238" height="164" rx="18" className={styles.panelSurface} />
        <path d="M56 94c25-25 44 14 68-8s39-49 66-16 36-8 57-26" className={styles.chartLine} stroke={`url(#${gradientId})`} filter={`url(#${glowId})`} />
        <path d="M56 150h188M56 129h188M56 108h188M56 66h188" className={styles.chartGrid} />
        <rect x="58" y="162" width="14" height="15" rx="3" fill="#6d28d9" />
        <rect x="78" y="150" width="14" height="27" rx="3" fill="#2563eb" />
        <rect x="98" y="138" width="14" height="39" rx="3" fill="#22d3ee" />
        <rect x="183" y="126" width="66" height="51" rx="10" className={styles.miniCard} />
        <circle cx="199" cy="144" r="7" fill={`url(#${gradientId})`} />
        <path d="M213 141h25m-25 9h18m-18 9h22" className={styles.dataStroke} />
        <rect x="213" y="101" width="116" height="94" rx="15" className={styles.uniCard} />
        <circle cx="239" cy="129" r="15" fill={`url(#${gradientId})`} filter={`url(#${glowId})`} />
        <path d="M232 129h14m-7-7v14" className={styles.uniMark} />
        <path d="M264 120h45m-45 13h36m-66 30h74m-74 13h58" className={styles.dataStroke} />
      </g>
    </svg>
  );
}

function SecurityArtwork({ gradientId, glowId }) {
  return (
    <svg viewBox="0 0 360 230" role="img" aria-label="Escudo com cadeado representando segurança e privacidade">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#2dd4bf" />
          <stop offset=".48" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g className={styles.artworkFloat}>
        <ellipse cx="180" cy="116" rx="135" ry="59" className={styles.securityOrbit} />
        <ellipse cx="180" cy="116" rx="98" ry="94" className={styles.securityOrbitAlt} />
        <path d="M180 25 266 62v56c0 52-31 82-86 103-55-21-86-51-86-103V62Z" className={styles.shieldFill} stroke={`url(#${gradientId})`} filter={`url(#${glowId})`} />
        <path d="M180 39 251 69v48c0 42-24 68-71 88-47-20-71-46-71-88V69Z" className={styles.shieldInner} />
        <rect x="145" y="101" width="70" height="63" rx="14" fill={`url(#${gradientId})`} filter={`url(#${glowId})`} />
        <path d="M158 101V86a22 22 0 0 1 44 0v15" className={styles.lockArc} />
        <circle cx="180" cy="129" r="8" className={styles.lockKey} />
        <path d="M180 136v12" className={styles.lockKey} />
        {[
          [66, 67, 'M57 68l7 7 13-16'],
          [295, 67, 'M286 74c0-13 18-13 18 0m-15 0v13m12-13v13'],
          [67, 173, 'M55 181h24m-20-8 7-8 6 4 8-12'],
          [294, 173, 'M284 173l7 7 15-17m-11-8v9'],
        ].map(([cx, cy, path]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r="25" className={styles.securityIconCircle} />
            <path d={path} className={styles.securityIcon} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function WelcomeArtwork({ gradientId, glowId }) {
  return (
    <svg viewBox="0 0 360 150" role="img" aria-label="Conexão luminosa entre organização e tecnologia">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#7c3aed" />
          <stop offset=".45" stopColor="#2563eb" />
          <stop offset=".55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <filter id={glowId} x="-20%" y="-70%" width="140%" height="240%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d="M-12 93c60-57 104 34 163-6 15-10 23-28 29-28 8 0 16 19 33 28 54 30 91-42 160 5" className={styles.welcomeWaveGhost} />
      <path d="M-12 93c60-57 104 34 163-6 15-10 23-28 29-28 8 0 16 19 33 28 54 30 91-42 160 5" className={styles.welcomeWave} stroke={`url(#${gradientId})`} filter={`url(#${glowId})`} />
      <circle cx="180" cy="59" r="4" fill="#67e8f9" filter={`url(#${glowId})`} className={styles.centralPulse} />
    </svg>
  );
}

function PresentationArtwork({ type }) {
  const id = useId().replaceAll(':', '');
  const gradientId = `presentation-gradient-${id}`;
  const glowId = `presentation-glow-${id}`;

  if (type === 'dashboard') {
    return <DashboardArtwork gradientId={gradientId} glowId={glowId} />;
  }

  if (type === 'security') {
    return <SecurityArtwork gradientId={gradientId} glowId={glowId} />;
  }

  return <WelcomeArtwork gradientId={gradientId} glowId={glowId} />;
}

export default PresentationArtwork;

