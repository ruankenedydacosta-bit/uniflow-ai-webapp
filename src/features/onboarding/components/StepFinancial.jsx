import { useCallback } from 'react';
import Button from '../../../components/ui/Button';
import { INCOME_RANGES, EXPENSE_RANGES, BUSINESS_TYPES, REVENUE_RANGES } from '../onboardingConstants';
import { cx } from '../../../utils/cx';
import styles from '../OnboardingPage.module.css';

function RangeSelect({ label, options, value, onChange, name }) {
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.rangeGrid}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cx(
              styles.rangeOption,
              value === opt.value && styles.rangeSelected,
            )}
            onClick={() => onChange({ [name]: opt.value })}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          className={cx(
            styles.rangeOption,
            value === 'skip' && styles.rangeSelected,
          )}
          onClick={() => onChange({ [name]: 'skip' })}
          aria-pressed={value === 'skip'}
        >
          Prefiro informar depois
        </button>
      </div>
    </div>
  );
}

function YesNoSelect({ label, value, onChange, name }) {
  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.yesNoRow}>
        {['yes', 'no'].map((opt) => (
          <button
            key={opt}
            type="button"
            className={cx(
              styles.yesNoOption,
              value === opt && styles.yesNoSelected,
            )}
            onClick={() => onChange({ [name]: opt })}
            aria-pressed={value === opt}
          >
            {opt === 'yes' ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonalFinancialForm({ profile, onChange }) {
  return (
    <div className={styles.financialForm}>
      <RangeSelect
        label="Qual sua faixa de renda mensal aproximada?"
        options={INCOME_RANGES}
        value={profile.incomeRange}
        onChange={onChange}
        name="incomeRange"
      />
      <RangeSelect
        label="E suas despesas mensais aproximadas?"
        options={EXPENSE_RANGES}
        value={profile.expenseRange}
        onChange={onChange}
        name="expenseRange"
      />
      <YesNoSelect
        label="Você possui dívidas atualmente?"
        value={profile.hasDebt}
        onChange={onChange}
        name="hasDebt"
      />
      <YesNoSelect
        label="Você possui reserva de emergência?"
        value={profile.hasReserve}
        onChange={onChange}
        name="hasReserve"
      />
      <YesNoSelect
        label="Prefere fazer lançamentos manuais por enquanto?"
        value={profile.prefersManual}
        onChange={onChange}
        name="prefersManual"
      />
    </div>
  );
}

function BusinessFinancialForm({ profile, onChange }) {
  return (
    <div className={styles.financialForm}>
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Tipo de negócio</span>
        <div className={styles.rangeGrid}>
          {BUSINESS_TYPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cx(
                styles.rangeOption,
                profile.businessType === opt.value && styles.rangeSelected,
              )}
              onClick={() => onChange({ businessType: opt.value })}
              aria-pressed={profile.businessType === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <RangeSelect
        label="Faturamento mensal aproximado?"
        options={REVENUE_RANGES}
        value={profile.revenueRange}
        onChange={onChange}
        name="revenueRange"
      />
      <RangeSelect
        label="Despesas mensais aproximadas?"
        options={EXPENSE_RANGES}
        value={profile.expenseRange}
        onChange={onChange}
        name="expenseRange"
      />
      <YesNoSelect
        label="Mistura finanças pessoais e empresariais?"
        value={profile.mixesFinances}
        onChange={onChange}
        name="mixesFinances"
      />
      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Pessoas envolvidas na operação (opcional)</span>
        <input
          type="number"
          className={styles.textInput}
          placeholder="Ex: 5"
          min="0"
          max="999"
          value={profile.peopleCount ?? ''}
          onChange={(e) => onChange({ peopleCount: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
    </div>
  );
}

function StepFinancial({ mode, value, onChange, onNext, onPrev }) {
  const isBusiness = mode === 'business';
  const isBoth = mode === 'both';

  const handleChange = useCallback((partial) => {
    onChange({
      financialProfile: { ...value, ...partial },
    });
  }, [value, onChange]);

  return (
    <div className={styles.stepContent}>
      <div className={styles.stepHeader}>
        <h2 className={styles.stepTitle}>Conte um pouco sobre sua situação</h2>
        <p className={styles.stepDescription}>
          São informações gerais para eu entender seu momento.
          Tudo pode ser ajustado depois, e nada é compartilhado.
        </p>
      </div>

      {isBoth && (
        <p className={styles.stepSubtitle}>
          Começando pela sua vida pessoal:
        </p>
      )}

      {(isBusiness || isBoth) ? (
        <>
          {isBoth && <PersonalFinancialForm profile={value} onChange={handleChange} />}
          {isBoth && (
            <p className={styles.stepSubtitle}>
              Agora sobre o negócio:
            </p>
          )}
          <BusinessFinancialForm profile={value} onChange={handleChange} />
        </>
      ) : (
        <PersonalFinancialForm profile={value} onChange={handleChange} />
      )}

      <div className={styles.stepActions}>
        <Button variant="ghost" onClick={onPrev}>Voltar</Button>
        <Button variant="primary" onClick={onNext}>Continuar</Button>
      </div>
    </div>
  );
}

export default StepFinancial;
