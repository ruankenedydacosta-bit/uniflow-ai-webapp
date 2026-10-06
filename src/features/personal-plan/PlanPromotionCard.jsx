import uniflowMark from '../../assets/branding/uniflow-mark.png';
import { PERSONAL_PLAN_PRICE_PERIOD, PERSONAL_PLAN_TIERS } from './personalPlanConfig.js';
import styles from './PlanPromotionCard.module.css';

function CrownIcon() {
  return (
    <svg viewBox="0 0 48 36" aria-hidden="true">
      <path d="m5 9 10 8 9-13 9 13 10-8-4 21H9Z" />
      <path d="M10 34h28" />
    </svg>
  );
}

// Épico #116: a pessoa escolhe o nível do Plano Pessoal aqui. O preço exibido
// e o enviado ao checkout saem do mesmo nível escolhido.
function PlanPromotionCard({ selectedTierId, onSelectTier, disabled = false }) {
  return (
    <section className={styles.promotionCard} aria-labelledby="personal-plan-title">
      <img className={styles.promotionBackgroundMark} src={uniflowMark} alt="" aria-hidden="true" />

      <div className={styles.promotionPlanTitle}>
        <h1 id="personal-plan-title">Plano Pessoal</h1>
        <p>Tudo da Uni em um só lugar.</p>
      </div>

      <fieldset className={styles.tierPicker} disabled={disabled}>
        <legend>Escolha quantos minutos de conversa por voz você quer por mês</legend>
        {PERSONAL_PLAN_TIERS.map((tier) => (
          <label key={tier.id} className={styles.tierOption} data-selected={selectedTierId === tier.id}>
            <input
              type="radio"
              name="personal-plan-tier"
              value={tier.id}
              checked={selectedTierId === tier.id}
              onChange={() => onSelectTier(tier.id)}
            />
            <span className={styles.tierName}>{tier.name}</span>
            <span className={styles.tierPrice}>
              <strong>{tier.priceLabel}</strong>
              <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
            </span>
            <span className={styles.tierMinutes}>{tier.voiceMinutesLabel}</span>
          </label>
        ))}
        <p className={styles.tierNote}>Registrar por texto não tem limite em nenhum plano.</p>
      </fieldset>

      <div className={styles.promotionAccessBadge}>
        <CrownIcon />
        <span>ACESSO COMPLETO</span>
      </div>
    </section>
  );
}

export default PlanPromotionCard;
