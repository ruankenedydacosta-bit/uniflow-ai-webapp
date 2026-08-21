import uniflowLogo from '../../assets/branding/auth/logo_uniflowai.png';
import PromotionalCountdown from './PromotionalCountdown.jsx';
import {
  PERSONAL_PLAN_PRICE_LABEL,
  PERSONAL_PLAN_PRICE_PERIOD,
  PERSONAL_PLAN_PROMOTION,
} from './personalPlanConfig.js';
import styles from './PlanPromotionCard.module.css';

function CrownIcon() {
  return (
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="m5 9 10 8 9-13 9 13 10-8-4 21H9Z" />
      <path d="M10 34h28" />
    </svg>
  );
}

function PlanFlowLines() {
  return (
    <svg className={styles.promotionFlowLines} viewBox="0 0 1000 210" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="promotion-flow-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#7c3aed" stopOpacity=".15" />
          <stop offset=".48" stopColor="#2563eb" stopOpacity=".6" />
          <stop offset="1" stopColor="#10b981" stopOpacity=".14" />
        </linearGradient>
      </defs>
      <path d="M-60 150c170-82 276 47 428-9s238-50 356 1 205 56 330-14" />
      <path d="M-60 174c180-70 278 41 430-5s239-44 354 1 203 47 330-8" />
      <path d="M-60 126c162-89 273 54 430-12s241-55 358 4 207 63 326-18" />
    </svg>
  );
}

function PlanPromotionCard({ promotionEligibility = true }) {
  const currentPrice = PERSONAL_PLAN_PRICE_LABEL.replace('R$ ', '');

  return (
    <section className={styles.promotionCard} aria-labelledby="personal-plan-title">
      <PlanFlowLines />

      <div className={styles.promotionTop}>
        <div className={styles.promotionBrand}>
          <span className={styles.promotionLogoCrop}>
            <img src={uniflowLogo} alt="UniFlow AI" />
          </span>
          <p>Conectando você às <strong>melhores decisões financeiras.</strong></p>
        </div>
        <PromotionalCountdown
          key={promotionEligibility === null
            ? 'promotion-checking'
            : promotionEligibility
              ? 'promotion-eligible'
              : 'promotion-confirmed'}
          canStartNewWindow={promotionEligibility === true}
        />
      </div>

      <div className={styles.promotionPlanTitle}>
        <h1 id="personal-plan-title">Plano Pessoal</h1>
        <p>Tudo da Uni em um só lugar.</p>
      </div>

      <div className={styles.promotionPricing}>
        <p className={styles.referencePrice}>
          De <s>{PERSONAL_PLAN_PROMOTION.referencePriceLabel}</s>
        </p>
        <div className={styles.promotionalPrice}>
          <span className={styles.promotionalCurrency}>R$</span>
          <strong>{currentPrice}</strong>
          <span className={styles.promotionalPeriod}>{PERSONAL_PLAN_PRICE_PERIOD}</span>
        </div>
        <span className={styles.savingsBadge}>{PERSONAL_PLAN_PROMOTION.savingsLabel}</span>
      </div>

      <div className={styles.promotionAccessBadge}>
        <CrownIcon />
        <span>ACESSO COMPLETO</span>
      </div>
    </section>
  );
}

export default PlanPromotionCard;
