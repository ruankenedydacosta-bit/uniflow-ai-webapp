import ChoiceRow from '../../components/ui/ChoiceRow/ChoiceRow.jsx';
import { PERSONAL_PLAN_PRICE_PERIOD, PERSONAL_PLAN_TIERS } from './personalPlanConfig.js';
import styles from './PlanPromotionCard.module.css';

// Épico #116: a pessoa escolhe o nível do Plano Pessoal aqui. O preço exibido
// e o enviado ao checkout saem do mesmo nível escolhido. Tela 21d: os três
// planos são linhas de seleção, com o preço à direita.
function PlanPromotionCard({ selectedTierId, onSelectTier, disabled = false }) {
  return (
    <section className={styles.planSection} aria-labelledby="personal-plan-title">
      <div className={styles.intro}>
        <h2 id="personal-plan-title">Tudo da Uni em um só lugar</h2>
        <p>Escolha quantos minutos de conversa por voz você quer por mês.</p>
      </div>

      <fieldset className={styles.tierPicker} disabled={disabled}>
        <legend className={styles.legend}>Plano</legend>
        {PERSONAL_PLAN_TIERS.map((tier) => (
          <ChoiceRow
            key={tier.id}
            name="personal-plan-tier"
            value={tier.id}
            checked={selectedTierId === tier.id}
            disabled={disabled}
            onChange={() => onSelectTier(tier.id)}
            title={tier.name}
            description={`${tier.voiceMinutes} minutos de voz por mês`}
            trailing={(
              <span className={styles.tierPrice}>
                <span>{tier.priceLabel}</span>
                <small>{PERSONAL_PLAN_PRICE_PERIOD}</small>
              </span>
            )}
          />
        ))}
        <p className={styles.tierNote}>Registrar por texto não tem limite em nenhum plano.</p>
      </fieldset>
    </section>
  );
}

export default PlanPromotionCard;
