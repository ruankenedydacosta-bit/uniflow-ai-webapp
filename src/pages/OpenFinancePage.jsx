import { useState } from 'react';
import Badge from '../components/ui/Badge';
import Card from '../components/ui/Card';
import {
  OpenFinanceConnectionAnimation,
  OpenFinanceLearnMorePanel,
} from '../features/open-finance-animation';
import { useTheme } from '../features/theme';
import styles from './OpenFinancePage.module.css';

const BENEFITS = Object.freeze([
  {
    id: 'consolidated',
    title: 'Visão consolidada',
    description: 'Contas, cartões e movimentações de várias instituições reunidos em um só lugar.',
  },
  {
    id: 'sync',
    title: 'Sincronização automática',
    description: 'Saldos e transações poderão ser atualizados sozinhos, sem digitação repetida.',
  },
  {
    id: 'consent',
    title: 'Segurança e consentimento',
    description: 'A conexão só acontece com a sua autorização e nunca pede a senha do banco.',
  },
  {
    id: 'less-manual',
    title: 'Menos lançamentos manuais',
    description: 'Com os dados chegando prontos, sobra tempo e clareza para decidir.',
  },
]);

export default function OpenFinancePage() {
  const { effectiveTheme } = useTheme();
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="open-finance-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Em breve
          </Badge>
          <h2 id="open-finance-title">Open Finance</h2>
          <p>
            Uma prévia de como a UniFlow vai centralizar suas contas de diferentes
            instituições em um só lugar. Esta é uma demonstração visual: ainda não há
            conexão bancária real, coleta de credenciais ou dados da sua conta.
          </p>
        </div>
      </section>

      <section aria-label="Demonstração visual do Open Finance" className={styles.animationSection}>
        <OpenFinanceConnectionAnimation
          variant="expanded"
          theme={effectiveTheme}
          autoPlay
          onLearnMore={() => setLearnMoreOpen(true)}
        />
        <p className={styles.demoNote}>
          Demonstração ilustrativa. Instituições, valores e contas exibidos são
          genéricos e não representam dados reais.
        </p>
      </section>

      <section className={styles.benefits} aria-label="Benefícios do Open Finance na UniFlow">
        {BENEFITS.map((benefit) => (
          <Card key={benefit.id} variant="default" padding="lg" className={styles.benefitCard}>
            <h3>{benefit.title}</h3>
            <p>{benefit.description}</p>
          </Card>
        ))}
      </section>

      {learnMoreOpen ? (
        <OpenFinanceLearnMorePanel
          theme={effectiveTheme}
          onClose={() => setLearnMoreOpen(false)}
        />
      ) : null}
    </div>
  );
}
