import { useState } from 'react';
import Badge from '../../../../components/ui/Badge';
import Button from '../../../../components/ui/Button';
import Card from '../../../../components/ui/Card';
import Input from '../../../../components/ui/Input';
import { formatCurrency } from '../../../../utils/formatters';
import { parseSimulationDeltaInput } from './futureSimulationPanelUtils.js';
import styles from './FutureSimulationPanel.module.css';

// Painel de edição da simulação "E se?". Componente de UI puro: mantém
// apenas rascunhos de texto dos três campos (para não quebrar a digitação de
// negativos/decimais) e delega a conversão/normalização real a
// parseSimulationDeltaInput + useFutureSimulation (F5.2). Fica restrito a
// este painel: nada é gravado em disco ou banco, sem backend, sem
// roteamento, sem qualquer referência a outros módulos do produto.
export default function FutureSimulationPanel({
  isActive,
  hasHistory,
  simulatedBalance,
  onChangeOverride,
  onExit,
}) {
  const [incomeDraft, setIncomeDraft] = useState('');
  const [expenseDraft, setExpenseDraft] = useState('');
  const [balanceDraft, setBalanceDraft] = useState('');

  function handleIncomeChange(event) {
    const raw = event.target.value;
    setIncomeDraft(raw);
    onChangeOverride('monthlyIncomeDelta', parseSimulationDeltaInput(raw));
  }

  function handleExpenseChange(event) {
    const raw = event.target.value;
    setExpenseDraft(raw);
    onChangeOverride('monthlyExpenseDelta', parseSimulationDeltaInput(raw));
  }

  function handleBalanceChange(event) {
    const raw = event.target.value;
    setBalanceDraft(raw);
    onChangeOverride('initialBalanceDelta', parseSimulationDeltaInput(raw));
  }

  return (
    <Card variant={isActive ? 'glass' : 'outline'} padding="lg" className={styles.panel}>
      {isActive ? (
        <div className={styles.activeBanner} role="status">
          <Badge variant="secondary" dot>
            Modo simulação ativo
          </Badge>
          <p className={styles.activeText}>
            Os valores abaixo são hipotéticos e não alteram seus dados reais.
          </p>
        </div>
      ) : (
        <p className={styles.hintText} role="status">
          Defina pelo menos um ajuste para visualizar a simulação.
        </p>
      )}

      <div className={styles.grid}>
        <Input
          id="future-simulation-income-delta"
          label="Ajuste nas entradas mensais"
          type="number"
          step="0.01"
          value={incomeDraft}
          onChange={handleIncomeChange}
          disabled={!hasHistory}
          placeholder="0"
          helperText={
            hasHistory
              ? 'Ex.: +1500 para simular R$ 1.500 a mais por mês'
              : 'Indisponível sem histórico de entradas e saídas registradas'
          }
          fullWidth
        />

        <Input
          id="future-simulation-expense-delta"
          label="Ajuste nas saídas mensais"
          type="number"
          step="0.01"
          value={expenseDraft}
          onChange={handleExpenseChange}
          disabled={!hasHistory}
          placeholder="0"
          helperText={
            hasHistory
              ? 'Ex.: -300 para simular R$ 300 a menos por mês'
              : 'Indisponível sem histórico de entradas e saídas registradas'
          }
          fullWidth
        />

        <Input
          id="future-simulation-balance-delta"
          label="Ajuste no saldo inicial"
          type="number"
          step="0.01"
          value={balanceDraft}
          onChange={handleBalanceChange}
          placeholder="0"
          helperText="Ex.: +5000 para começar com R$ 5.000 a mais"
          fullWidth
        />
      </div>

      <p className={styles.signHint}>
        Número positivo aumenta, número negativo reduz, zero não altera.
      </p>

      {!hasHistory && (
        <p className={styles.historyNotice}>
          Sem histórico de transações, a projeção base fica limitada — apenas o ajuste de saldo
          inicial tem efeito na simulação.
        </p>
      )}

      {isActive && (
        <p className={styles.balanceReadout}>
          Saldo inicial simulado: <strong>{formatCurrency(simulatedBalance)}</strong>
        </p>
      )}

      <div className={styles.actions}>
        <Button variant="outline" size="sm" onClick={onExit}>
          {isActive ? 'Sair da simulação' : 'Fechar'}
        </Button>
      </div>
    </Card>
  );
}
