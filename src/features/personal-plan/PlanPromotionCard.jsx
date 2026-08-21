import uniflowMark from '../../assets/branding/uniflow-mark.png';
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

function SavingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 13 13 20l-9-9V4h7l9 9Z" />
      <circle cx="8.5" cy="8.5" r="1.25" />
    </svg>
  );
}

function PlanPromotionCard({ promotionEligibility = true }) {
  const currentPrice = PERSONAL_PLAN_PRICE_LABEL.replace('R$ ', '');

  return (
    <section className={styles.promotionCard} aria-labelledby="personal-plan-title">
      <img className={styles.promotionBackgroundMark} src={uniflowMark} alt="" aria-hidden="true" />

      <PromotionalCountdown
        key={promotionEligibility === null
          ? 'promotion-checking'
          : promotionEligibility
            ? 'promotion-eligible'
            : 'promotion-confirmed'}
        canStartNewWindow={promotionEligibility === true}
      />

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
        <span className={styles.savingsBadge}>
          <SavingsIcon />
          {PERSONAL_PLAN_PROMOTION.savingsLabel}
        </span>
      </div>

      <div className={styles.promotionAccessBadge}>
        <CrownIcon />
        <span>ACESSO COMPLETO</span>
      </div>
    </section>
  );
}

export default PlanPromotionCard;
