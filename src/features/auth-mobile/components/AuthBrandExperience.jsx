import { useId } from 'react';
import uniflowLogo from '../../../assets/branding/auth/logo_uniflowai.png';
import smartechLogo from '../../../assets/branding/auth/smartech_logo_transparente.png';
import styles from '../authMobile.module.css';

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

function AuthBrandExperience() {
  const gradientId = useId().replaceAll(':', '');
  const glowId = `${gradientId}-glow`;

  return (
    <header className={styles.brandExperience}>
      <div className={styles.uniflowLogoFrame}>
        <img src={uniflowLogo} alt="UniFlow AI — Conectando você às melhores decisões financeiras." />
      </div>

      <div className={styles.partnerBrand}>
        <span>Em parceria com</span>
        <div className={styles.partnerLogoFrame}>
          <img src={smartechLogo} alt="SmartTech" />
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

      <div className={styles.authWave} aria-hidden="true">
        <svg viewBox="0 0 720 150" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#6d28d9" />
              <stop offset=".46" stopColor="#2563eb" />
              <stop offset=".53" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-100%" width="140%" height="300%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path className={styles.waveGhost} d="M-20 79 C70 27 145 127 235 77 S400 26 490 81 630 123 740 57" />
          <path
            className={styles.wavePrimary}
            d="M-20 83 C70 31 145 131 235 81 S400 30 490 85 630 127 740 61"
            stroke={`url(#${gradientId})`}
            filter={`url(#${glowId})`}
          />
          <circle cx="360" cy="58" r="4" fill="#67e8f9" filter={`url(#${glowId})`} />
        </svg>
      </div>
    </header>
  );
}

export default AuthBrandExperience;
